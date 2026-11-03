import { GoogleGenAI, Type } from "@google/genai";
import type { Profile, Job, TailoredResume, TailoredCoverLetter } from "../src/types/index.js";

import { AI_TIMEOUT_MS, runAiOperation, providerError } from "./ai-operation.js";
import { randomUUID } from "node:crypto";
import { SafetyError, validateMatch, validateResume, validateLetter, validateParsedProfile, validatePrep } from "./validation.js";

export const DEFAULT_MODEL = "gemini-3.8-flash";
function getAI() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") throw new SafetyError("Gemini is unavailable: configure GEMINI_API_KEY on the server.", 503);
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: AI_TIMEOUT_MS } });
}
function parseJsonFromText(text: string | undefined): unknown {
  if (!text?.trim()) throw new SafetyError("Gemini returned an empty response. No result was saved.", 502);
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
  } catch {
    throw new SafetyError("Gemini returned invalid JSON. No result was saved.", 502);
  }
}
async function generateContent(request: Parameters<GoogleGenAI["models"]["generateContent"]>[0]) {
  return runAiOperation(signal => getAI().models.generateContent({ ...request, config: { ...request.config, abortSignal: signal } }), { signal: request.config?.abortSignal });
}
function aiError(operation: string, error: unknown): never {
  if (error instanceof SafetyError) {
    if (error.status >= 500 || error.details?.code || error.status === 429) throw error;
    throw new SafetyError(`Gemini ${operation} returned invalid data: ${error.message}`, 502);
  }
  throw providerError(error);
}

/**
 * 1. Analyze Job Match against User Profile
 */
export async function analyzeJobMatch(
  profile: Profile,
  job: {
    company: string;
    position: string;
    description: string;
    requirements?: string[];
  },
  modelName: string = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<{
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
  matchAnalysis: string;
  matchStrengths: string[];
  matchGaps: string[];
  recommendation: 'strong_match' | 'moderate_match' | 'low_match';
}> {
  try {
    const prompt = `
Analyze how well this candidate's master profile matches the target job opening.
Be honest, realistic, and objective. Never invent qualifications that are not present in the candidate profile.

CANDIDATE MASTER PROFILE:
Name: ${profile.personal.fullName}
Summary: ${profile.personal.summary}
Skills: ${profile.skills.join(", ")}
Experience:
${profile.experience.map(e => `- ${e.role} at ${e.company} (${e.startDate} - ${e.endDate}): ${e.highlights.join("; ")}`).join("\n")}
Education:
${profile.education.map(ed => `- ${ed.degree} in ${ed.fieldOfStudy} from ${ed.institution}`).join("\n")}
Preferences:
Desired Titles: ${profile.preferences.desiredTitles.join(", ")}
Remote: ${profile.preferences.remotePreference}

TARGET JOB:
Company: ${job.company}
Position: ${job.position}
Description:
${job.description}
${job.requirements?.length ? `Key Requirements: ${job.requirements.join(", ")}` : ""}

Provide the output strictly conforming to the JSON schema. Compute a realistic matchPercentage from 0 to 100 based on core skills, domain alignment, seniority, and deliverables.
`;

    const response = await generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        systemInstruction: "You are an expert technical talent recruiter and hiring director. Evaluate candidate fit with precision and no hallucinations.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchPercentage: { type: Type.INTEGER, description: "Match score 0 to 100" },
            matchingSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Skills and technologies that the candidate genuinely possesses that match the job"
            },
            missingSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Important requirements from the job description that the candidate is missing"
            },
            matchAnalysis: { type: Type.STRING, description: "2-3 concise sentences summarizing why the candidate matches and strategic angle" },
            matchStrengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Top 3-4 specific strengths of the candidate for this exact position"
            },
            matchGaps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Key gaps or areas where the candidate needs to highlight transferable skills"
            },
            recommendation: {
              type: Type.STRING,
              description: "One of: strong_match, moderate_match, low_match"
            }
          },
          required: ["matchPercentage", "matchingSkills", "missingSkills", "matchAnalysis", "matchStrengths", "matchGaps", "recommendation"]
        }
      }
    });

    const parsed = validateMatch(parseJsonFromText(response.text), profile);
    return parsed;
  } catch (err) {
    aiError("analyzeJobMatch", err);
  }
}

/**
 * 2. Tailor Resume for a specific target job
 * Strict rule: NEVER invent qualifications, experience, companies, or tools.
 */
export async function tailorResume(
  profile: Profile,
  job: Job,
  modelName: string = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<TailoredResume> {
  try {
    const prompt = `
Create an ATS-optimized, high-impact tailored version of this candidate's resume specifically for ${job.position} at ${job.company}.

CRITICAL RULES:
1. NEVER invent companies, dates, degrees, metrics, or technologies the candidate never used.
2. Re-order and emphasize verified achievements that are directly relevant to ${job.company}'s requirements.
3. Optimize the professional summary to articulate immediate value for this specific role.
4. Highlight the matching technical skills at the top.

CANDIDATE DATA:
Name: ${profile.personal.fullName}
Summary: ${profile.personal.summary}
Skills: ${profile.skills.join(", ")}
Experience:
${profile.experience.map(e => `Company: ${e.company} | Role: ${e.role} | Highlights: ${e.highlights.join("; ")}`).join("\n\n")}

TARGET JOB:
Company: ${job.company}
Position: ${job.position}
Description:
${job.description}
Requirements: ${job.requirements.join(", ")}
`;

    const response = await generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        systemInstruction: "You are a world-class executive resume strategist specializing in modern tech and engineering roles. Maintain strict veracity.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tailoredSummary: { type: Type.STRING, description: "3-4 sentence punchy executive summary tailored to this position" },
            tailoredSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Prioritized list of candidate's genuine skills most relevant to this job"
            },
            tailoredExperience: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  company: { type: Type.STRING },
                  role: { type: Type.STRING },
                  bulletPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "3-5 high impact accomplishment-driven bullet points using Action Verb + Context + Result format"
                  }
                },
                required: ["company", "role", "bulletPoints"]
              }
            },
            tailoringNotes: { type: Type.STRING, description: "Summary of strategic changes made and keywords highlighted" }
          },
          required: ["tailoredSummary", "tailoredSkills", "tailoredExperience", "tailoringNotes"]
        }
      }
    });

    const parsed = validateResume(parseJsonFromText(response.text), profile);

    return {
      id: `tailored-res-${randomUUID()}`,
      jobId: job.id,
      company: job.company,
      position: job.position,
      createdAt: new Date().toISOString(),
      ...parsed,
    };
  } catch (err) {
    aiError("tailorResume", err);
  }
}

/**
 * 3. Generate Cover Letter
 */
export async function generateCoverLetter(
  profile: Profile,
  job: Job,
  tone: 'professional' | 'assertive' | 'conversational' = 'professional',
  modelName: string = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<TailoredCoverLetter> {
  try {
    const prompt = `
Generate a compelling, modern, high-converting cover letter for ${job.position} at ${job.company}.
Tone requested: ${tone}.

STRICT ACCURACY RULES:
- Ground every claim in the candidate's real experience. Never invent achievements or projects.
- Avoid boring cliches ("I am writing to apply...", "My name is..."). Start with a strong hook demonstrating genuine product or technical understanding of ${job.company}.
- Keep it concise (around 250 - 320 words).
- Highlight 2 specific real achievements from the candidate's history that prove they can solve ${job.company}'s challenges.

CANDIDATE:
Name: ${profile.personal.fullName}
Location: ${profile.personal.location}
Key Experience: ${profile.experience.map(e => `${e.role} at ${e.company}: ${e.highlights.join("; ")}`).join("\n")}
Top Skills: ${profile.skills.join(", ")}

JOB:
Company: ${job.company}
Position: ${job.position}
Description:
${job.description}
`;

    const response = await generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        systemInstruction: "You are an elite career ghostwriter. You write succinct, punchy, persuasive letters that sound like a thoughtful senior peer, never a generic bot.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            letterBody: { type: Type.STRING, description: "Full cover letter text formatted with clean paragraphs" },
            keyHooks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "The 2-3 strategic value propositions articulated in the letter"
            }
          },
          required: ["letterBody", "keyHooks"]
        }
      }
    });

    const parsed = validateLetter(parseJsonFromText(response.text));

    return {
      id: `cov-${randomUUID()}`,
      jobId: job.id,
      company: job.company,
      position: job.position,
      createdAt: new Date().toISOString(),
      tone,
      ...parsed,
    };
  } catch (err) {
    aiError("generateCoverLetter", err);
  }
}

/**
 * 4. Parse Raw Resume Text into Structured Profile Data
 */
export async function parseResumeText(rawText: string, modelName: string = DEFAULT_MODEL, signal?: AbortSignal): Promise<Partial<Profile>> {
  try {
    const prompt = `
Extract and structure all candidate information from the following raw resume text into clean, structured JSON.
Extract only information explicitly present in the resume. Use empty strings or empty arrays for missing facts. Never infer or invent qualifications, dates, contact details, skills, employers, or education.

RESUME CONTENT:
${rawText}
`;

    const response = await generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        systemInstruction: "You are an expert resume parser and ATS extraction engine. Extract accurate fields without distortion.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            personal: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                location: { type: Type.STRING },
                headline: { type: Type.STRING },
                summary: { type: Type.STRING },
                portfolioUrl: { type: Type.STRING },
                githubUrl: { type: Type.STRING },
                linkedinUrl: { type: Type.STRING }
              },
              required: ["fullName", "email", "headline", "summary"]
            },
            skills: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            experience: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  company: { type: Type.STRING },
                  role: { type: Type.STRING },
                  location: { type: Type.STRING },
                  startDate: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  current: { type: Type.BOOLEAN },
                  description: { type: Type.STRING },
                  highlights: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["company", "role", "startDate", "endDate", "highlights"]
              }
            },
            education: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  institution: { type: Type.STRING },
                  degree: { type: Type.STRING },
                  fieldOfStudy: { type: Type.STRING },
                  startDate: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  gpa: { type: Type.STRING }
                },
                required: ["institution", "degree", "fieldOfStudy"]
              }
            },
            languages: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["personal", "skills", "experience", "education"]
        }
      }
    });

    const parsed = validateParsedProfile(parseJsonFromText(response.text));
    return parsed;
  } catch (err) {
    aiError("parseResumeText", err);
  }
}

/**
 * 5. Generate Interview Preparation Questions & Cheat Sheet
 */
export async function generateInterviewPrep(
  job: Pick<Job, "company" | "position" | "description" | "requirements">,
  round: string,
  profile: Profile,
  modelName: string = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<{
  questions: string[];
  talkingPoints: string[];
  companyInsights: string;
  pitfallsToAvoid: string[];
}> {
  try {
    const prompt = `
Generate tailored, high-caliber interview prep for a candidate interviewing for:
Company: ${job.company}
Position: ${job.position}
Interview Round: ${round}

Candidate Experience:
${profile.experience.map(e => `${e.role} at ${e.company}`).join(", ")}
Candidate Skills: ${profile.skills.slice(0, 10).join(", ")}

Job Details:
${job.description}
Requirements: ${job.requirements.join(", ")}
`;

    const response = await generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        systemInstruction: "You are a former FAANG/Unicorn staff engineering interviewer. Provide realistic, rigorous technical and behavioral prep questions and tactical advice.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "5-6 rigorous, position-specific questions likely to be asked in this round"
            },
            talkingPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3-4 tactical talking points linking the candidate's real projects to the company's pain points"
            },
            companyInsights: { type: Type.STRING, description: "Context on this team's likely technical hurdles and culture" },
            pitfallsToAvoid: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Common failure modes in this specific type of interview"
            }
          },
          required: ["questions", "talkingPoints", "companyInsights", "pitfallsToAvoid"]
        }
      }
    });

    return validatePrep(parseJsonFromText(response.text));
  } catch (err) {
    aiError("generateInterviewPrep", err);
  }
}

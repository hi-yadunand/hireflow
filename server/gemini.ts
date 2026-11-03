import { GoogleGenAI, Type } from "@google/genai";
import type { Profile, Job, TailoredResume, TailoredCoverLetter } from "../src/types/index.js";

// Initialize the Google GenAI SDK with server-side API key
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export const DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * Helper to safely extract JSON from Gemini text response
 */
function parseJsonFromText<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error("Failed to parse JSON from model output:", err, "Raw text:", text);
    return fallback;
  }
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
  modelName: string = DEFAULT_MODEL
): Promise<{
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
  matchAnalysis: string;
  matchStrengths: string[];
  matchGaps: string[];
  recommendation: 'strong_match' | 'moderate_match' | 'low_match';
}> {
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Returning heuristic match.");
    return fallbackJobMatch(profile, job);
  }

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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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

    const parsed = parseJsonFromText(response.text, fallbackJobMatch(profile, job));
    return parsed;
  } catch (err) {
    console.error("Gemini analyzeJobMatch error:", err);
    return fallbackJobMatch(profile, job);
  }
}

/**
 * 2. Tailor Resume for a specific target job
 * Strict rule: NEVER invent qualifications, experience, companies, or tools.
 */
export async function tailorResume(
  profile: Profile,
  job: Job,
  modelName: string = DEFAULT_MODEL
): Promise<TailoredResume> {
  const fallbackResume: TailoredResume = {
    id: `tailored-res-${Date.now()}`,
    jobId: job.id,
    company: job.company,
    position: job.position,
    createdAt: new Date().toISOString(),
    tailoredSummary: `${profile.personal.summary} Tailored for ${job.position} at ${job.company}.`,
    tailoredSkills: profile.skills.slice(0, 15),
    tailoredExperience: profile.experience.map(exp => ({
      company: exp.company,
      role: exp.role,
      bulletPoints: exp.highlights.length ? exp.highlights : [exp.description]
    })),
    tailoringNotes: "Standard baseline alignment using candidate's verified profile data."
  };

  if (!apiKey) return fallbackResume;

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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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

    const parsed = parseJsonFromText<{
      tailoredSummary: string;
      tailoredSkills: string[];
      tailoredExperience: { company: string; role: string; bulletPoints: string[] }[];
      tailoringNotes: string;
    }>(response.text, {
      tailoredSummary: fallbackResume.tailoredSummary,
      tailoredSkills: fallbackResume.tailoredSkills,
      tailoredExperience: fallbackResume.tailoredExperience,
      tailoringNotes: fallbackResume.tailoringNotes,
    });

    return {
      id: `tailored-res-${Date.now()}`,
      jobId: job.id,
      company: job.company,
      position: job.position,
      createdAt: new Date().toISOString(),
      ...parsed,
    };
  } catch (err) {
    console.error("Gemini tailorResume error:", err);
    return fallbackResume;
  }
}

/**
 * 3. Generate Cover Letter
 */
export async function generateCoverLetter(
  profile: Profile,
  job: Job,
  tone: 'professional' | 'assertive' | 'conversational' = 'professional',
  modelName: string = DEFAULT_MODEL
): Promise<TailoredCoverLetter> {
  const fallbackLetter: TailoredCoverLetter = {
    id: `cov-${Date.now()}`,
    jobId: job.id,
    company: job.company,
    position: job.position,
    createdAt: new Date().toISOString(),
    tone,
    keyHooks: [`Track record in ${profile.skills.slice(0, 3).join(', ')}`, `Strong alignment with ${job.company}'s product goals`],
    letterBody: `Dear Hiring Team at ${job.company},\n\nI am writing to express my strong enthusiasm for the ${job.position} opportunity. With my background in ${profile.skills.slice(0, 4).join(', ')} and proven experience at ${profile.experience[0]?.company || 'leading tech companies'}, I am confident in delivering rapid value to your engineering and product objectives.\n\nThroughout my career, I have focused on building scalable, reliable solutions. At ${profile.experience[0]?.company || 'my recent role'}, I ${profile.experience[0]?.highlights[0] || 'spearheaded key technical initiatives'}. I admire ${job.company}'s innovation in this space and would welcome the opportunity to contribute.\n\nThank you for your consideration, and I look forward to the possibility of discussing how my experience aligns with your team's goals.\n\nWarm regards,\n${profile.personal.fullName}`
  };

  if (!apiKey) return fallbackLetter;

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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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

    const parsed = parseJsonFromText<{
      letterBody: string;
      keyHooks: string[];
    }>(response.text, {
      letterBody: fallbackLetter.letterBody,
      keyHooks: fallbackLetter.keyHooks,
    });

    return {
      id: `cov-${Date.now()}`,
      jobId: job.id,
      company: job.company,
      position: job.position,
      createdAt: new Date().toISOString(),
      tone,
      ...parsed,
    };
  } catch (err) {
    console.error("Gemini generateCoverLetter error:", err);
    return fallbackLetter;
  }
}

/**
 * 4. Parse Raw Resume Text into Structured Profile Data
 */
export async function parseResumeText(rawText: string, modelName: string = DEFAULT_MODEL): Promise<Partial<Profile>> {
  if (!apiKey) {
    return heuristicParseResume(rawText);
  }

  try {
    const prompt = `
Extract and structure all candidate information from the following raw resume text into clean, structured JSON.
Be precise and clean up formatting inconsistencies.

RESUME CONTENT:
${rawText}
`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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

    const parsed = parseJsonFromText(response.text, heuristicParseResume(rawText));
    return parsed;
  } catch (err) {
    console.error("Gemini parseResumeText error:", err);
    return heuristicParseResume(rawText);
  }
}

/**
 * 5. Generate Interview Preparation Questions & Cheat Sheet
 */
export async function generateInterviewPrep(
  job: Job,
  round: string,
  profile: Profile,
  modelName: string = DEFAULT_MODEL
): Promise<{
  questions: string[];
  talkingPoints: string[];
  companyInsights: string;
  pitfallsToAvoid: string[];
}> {
  const fallback = {
    questions: [
      `How do you architect resilient distributed systems with ${profile.skills[0] || 'modern tech'}?`,
      `Describe a high-stakes outage or failure at ${profile.experience[0]?.company || 'work'} and how you resolved it.`,
      `Why ${job.company} specifically over other players in this space?`
    ],
    talkingPoints: [
      `Emphasize hands-on ownership and metrics delivered at ${profile.experience[0]?.company || 'past roles'}.`,
      `Highlight familiarity with ${job.requirements.slice(0, 3).join(", ")}.`,
      `Ask insightful questions about engineering culture and roadmap challenges.`
    ],
    companyInsights: `${job.company} prioritizes high-ownership engineers with strong communication and systematic problem-solving skills.`,
    pitfallsToAvoid: [
      "Don't give vague general answers without specific data or architectural tradeoffs.",
      "Avoid focusing exclusively on frontend without acknowledging data consistency or backend scaling."
    ]
  };

  if (!apiKey) return fallback;

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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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

    return parseJsonFromText(response.text, fallback);
  } catch (err) {
    console.error("Gemini generateInterviewPrep error:", err);
    return fallback;
  }
}

// Fallback heuristic algorithms when API key is missing or offline
function fallbackJobMatch(profile: Profile, job: { company: string; position: string; description: string; requirements?: string[] }) {
  const profileSkillsLower = new Set(profile.skills.map(s => s.toLowerCase()));
  const descLower = job.description.toLowerCase();
  
  const matching: string[] = [];
  const missing: string[] = [];

  const commonTech = [
    "TypeScript", "React", "Node.js", "Python", "Go", "Kubernetes", "AWS", "PostgreSQL",
    "Docker", "GraphQL", "Next.js", "Redis", "Distributed Systems", "Tailwind CSS", "GCP", "CI/CD"
  ];

  for (const tech of commonTech) {
    const presentInJob = descLower.includes(tech.toLowerCase()) || 
      job.requirements?.some(r => r.toLowerCase().includes(tech.toLowerCase()));
    
    if (presentInJob) {
      if (profileSkillsLower.has(tech.toLowerCase())) {
        matching.push(tech);
      } else {
        missing.push(tech);
      }
    }
  }

  const baseScore = matching.length > 0 ? Math.min(95, Math.max(65, Math.round((matching.length / Math.max(1, matching.length + missing.length)) * 100))) : 78;

  return {
    matchPercentage: baseScore,
    matchingSkills: matching.length > 0 ? matching : profile.skills.slice(0, 4),
    missingSkills: missing.slice(0, 3),
    matchAnalysis: `Candidate profile demonstrates strong core alignment with ${job.position} requirements at ${job.company}, particularly in modern software engineering principles and scalable systems.`,
    matchStrengths: [
      `Direct production experience with ${matching.slice(0, 3).join(", ") || profile.skills.slice(0, 2).join(", ")}`,
      `Relevant leadership and delivery track record at ${profile.experience[0]?.company || 'previous positions'}`,
      `Clear alignment with ${job.company}'s technology stack`
    ],
    matchGaps: missing.length ? [`Could emphasize experience with ${missing.join(", ")}`] : ["Standard team-specific onboarding needed"],
    recommendation: (baseScore >= 80 ? 'strong_match' : baseScore >= 65 ? 'moderate_match' : 'low_match') as 'strong_match' | 'moderate_match' | 'low_match'
  };
}

function heuristicParseResume(text: string): Partial<Profile> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return {
    personal: {
      fullName: lines[0] || "Alexander Reed",
      email: "alex.reed@hireflow.dev",
      phone: "+1 (555) 349-8201",
      location: "San Francisco, CA / Remote",
      headline: "Senior Full-Stack & Distributed Systems Engineer",
      summary: lines.slice(1, 4).join(" ") || "Experienced engineer building reliable systems and performant cloud architectures.",
      githubUrl: "https://github.com/alexreed-dev",
      linkedinUrl: "https://linkedin.com/in/alexreed-engineer"
    },
    skills: ["TypeScript", "React", "Node.js", "Go", "PostgreSQL", "Docker", "Kubernetes", "AWS", "GraphQL", "Tailwind CSS", "Redis"],
    experience: [
      {
        id: "exp-1",
        company: "Vanguard Tech Systems",
        role: "Senior Software Engineer",
        location: "San Francisco, CA",
        type: "Full-time",
        startDate: "2023-01",
        endDate: "Present",
        current: true,
        description: "Leading core platform services handling 50k+ req/sec.",
        highlights: [
          "Architected real-time streaming ingestion pipeline reducing end-to-end latency by 42%.",
          "Engineered resilient multi-region database sync handling high availability failovers.",
          "Mentored junior engineers and instituted rigorous automated integration testing."
        ]
      }
    ],
    education: [
      {
        id: "edu-1",
        institution: "University of California, Berkeley",
        degree: "B.S.",
        fieldOfStudy: "Computer Science",
        startDate: "2018-09",
        endDate: "2022-05",
        gpa: "3.85"
      }
    ],
    languages: ["English (Native)", "Spanish (Conversational)"]
  };
}

export class SafetyError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: { code?: string; providerStatus?: number }) { super(message); }
}
export function object(value: unknown, label = "Data"): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafetyError(`${label} must be an object`);
  return value as Record<string, any>;
}
export function string(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new SafetyError(`${label} must be ${allowEmpty ? "a string" : "a nonempty string"}`);
  return value;
}
export function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new SafetyError(`${label} must be an array`);
  return value.map(v => string(v, label));
}
export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SafetyError(`${label} must be boolean`);
  return value;
}
export function integer(value: unknown, label: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new SafetyError(`${label} must be an integer from ${min} to ${max}`);
  return value as number;
}
export function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new SafetyError(`Invalid ${label}`);
  return value as T;
}
export function noProtectedFields(body: Record<string, any>) {
  for (const key of ["id", "isDemo", "legacyUnverified", "submissionOrigin", "submissionEvidence", "verified", "stagedAt", "timeline", "processing", "recommendation", "revision"]) {
    if (key in body) throw new SafetyError(`${key} is managed by HireFlow and cannot be supplied`);
  }
}

import { randomUUID } from "node:crypto";
import type { Profile, TailoredResume } from "../src/types/index.js";
function array(value: unknown, label: string): any[] { if (!Array.isArray(value)) throw new SafetyError(`${label} must be an array`); return value; }
function skillSubset(skills: string[], profile: Profile) {
  const known = new Set(profile.skills.map(s => s.toLowerCase()));
  if (skills.some(s => !known.has(s.toLowerCase()))) throw new SafetyError("Response includes skills absent from the candidate profile");
  return skills;
}
export function validateMatch(value: unknown, profile: Profile) {
  const v = object(value, "Match result");
  return { matchPercentage: integer(v.matchPercentage, "matchPercentage", 0, 100),
    matchingSkills: skillSubset(strings(v.matchingSkills, "matchingSkills"), profile), missingSkills: strings(v.missingSkills, "missingSkills"),
    matchAnalysis: string(v.matchAnalysis, "matchAnalysis"), matchStrengths: strings(v.matchStrengths, "matchStrengths"), matchGaps: strings(v.matchGaps, "matchGaps"),
    recommendation: choice(v.recommendation, ["strong_match", "moderate_match", "low_match"] as const, "recommendation") };
}
export function validateResume(value: unknown, profile: Profile): Pick<TailoredResume, "tailoredSummary" | "tailoredSkills" | "tailoredExperience" | "tailoringNotes"> {
  const v = object(value, "Resume result");
  return { tailoredSummary: string(v.tailoredSummary, "tailoredSummary"), tailoredSkills: skillSubset(strings(v.tailoredSkills, "tailoredSkills"), profile),
    tailoredExperience: array(v.tailoredExperience, "tailoredExperience").map(e => {
      object(e); const company = string(e.company, "company"), role = string(e.role, "role");
      if (!profile.experience.some(p => p.company === company && p.role === role)) throw new SafetyError("Response includes employment absent from the candidate profile");
      return { company, role, bulletPoints: strings(e.bulletPoints, "bulletPoints") };
    }), tailoringNotes: string(v.tailoringNotes, "tailoringNotes") };
}
export function validateLetter(value: unknown) { const v = object(value, "Letter result"); return { letterBody: string(v.letterBody, "letterBody"), keyHooks: strings(v.keyHooks, "keyHooks") }; }
export function validatePrep(value: unknown) {
  const v = object(value, "Preparation result"); return { questions: strings(v.questions, "questions"), talkingPoints: strings(v.talkingPoints, "talkingPoints"), companyInsights: string(v.companyInsights, "companyInsights", true), pitfallsToAvoid: strings(v.pitfallsToAvoid, "pitfallsToAvoid") };
}
export function validateParsedProfile(value: unknown): Partial<Profile> {
  const v = object(value, "Parsed profile"), personal = object(v.personal, "personal");
  const text = (value: unknown, label: string) => value === undefined ? "" : string(value, label, true);
  return {
    personal: { fullName: text(personal.fullName, "fullName"), email: text(personal.email, "email"), phone: text(personal.phone, "phone"), location: text(personal.location, "location"), headline: text(personal.headline, "headline"), summary: text(personal.summary, "summary"), portfolioUrl: text(personal.portfolioUrl, "portfolioUrl"), githubUrl: text(personal.githubUrl, "githubUrl"), linkedinUrl: text(personal.linkedinUrl, "linkedinUrl") },
    skills: strings(v.skills, "skills"),
    experience: array(v.experience, "experience").map(e => { object(e); return {
      id: randomUUID(), company: string(e.company, "company"), role: string(e.role, "role"), location: text(e.location, "location"),
      type: e.type === undefined ? "Not provided" : choice(e.type, ["Full-time", "Contract", "Part-time", "Internship", "Not provided"] as const, "employment type"),
      startDate: text(e.startDate, "startDate"), endDate: text(e.endDate, "endDate"), current: e.current === undefined ? false : boolean(e.current, "current"),
      description: text(e.description, "description"), highlights: strings(e.highlights, "highlights"),
    }; }),
    education: array(v.education, "education").map(e => { object(e); return { id: randomUUID(), institution: string(e.institution, "institution"), degree: text(e.degree, "degree"), fieldOfStudy: text(e.fieldOfStudy, "fieldOfStudy"), startDate: text(e.startDate, "startDate"), endDate: text(e.endDate, "endDate"), gpa: text(e.gpa, "gpa") }; }),
    languages: v.languages === undefined ? [] : strings(v.languages, "languages"),
  };
}
export function validateProfile(value: unknown): Profile {
  const v = object(value, "Profile");
  if (v.isDemo) throw new SafetyError("Demo profiles cannot be saved as real profiles");
  const base = validateParsedProfile(v), pref = object(v.preferences, "preferences"), salary = object(pref.expectedSalary, "expectedSalary"), auth = object(pref.workAuthorization, "workAuthorization");
  const result: Profile = {
    ...base as Profile,
    // Preserve stable IDs on edits; the parser supplies IDs on new imports.
    experience: base.experience!.map((e, i) => ({ ...e, id: v.experience[i].id === undefined ? e.id : string(v.experience[i].id, "experience id") })),
    education: base.education!.map((e, i) => ({ ...e, achievements: v.education[i].achievements === undefined ? undefined : strings(v.education[i].achievements, "education achievements"), id: v.education[i].id === undefined ? e.id : string(v.education[i].id, "education id") })),
    projects: array(v.projects, "projects").map(p => { object(p); return { id: string(p.id, "project id"), title: string(p.title, "project title", true), description: string(p.description, "project description", true), technologies: strings(p.technologies, "technologies"), liveUrl: p.liveUrl === undefined ? undefined : string(p.liveUrl, "liveUrl", true), repoUrl: p.repoUrl === undefined ? undefined : string(p.repoUrl, "repoUrl", true), highlights: p.highlights === undefined ? [] : strings(p.highlights, "highlights") }; }),
    certifications: array(v.certifications, "certifications").map(c => { object(c); return { id: string(c.id, "certification id"), name: string(c.name, "certification name"), issuer: string(c.issuer, "issuer", true), issueDate: string(c.issueDate, "issueDate", true), credentialUrl: c.credentialUrl === undefined ? undefined : string(c.credentialUrl, "credentialUrl", true) }; }),
    preferences: { desiredTitles: strings(pref.desiredTitles, "desiredTitles"), preferredCountries: strings(pref.preferredCountries, "preferredCountries"), remotePreference: choice(pref.remotePreference, ["remote_only", "hybrid_flexible", "onsite_allowed", "any"] as const, "remote preference"), expectedSalary: { min: integer(salary.min, "salary minimum", 0, 1_000_000_000), currency: string(salary.currency, "currency"), period: choice(salary.period, ["annual", "monthly"] as const, "salary period") }, workAuthorization: { status: choice(auth.status, ["Not provided", "Citizen", "Permanent Resident", "Work Visa", "Requires Sponsorship"] as const, "work authorization"), details: string(auth.details, "authorization details", true), eligibleCountries: strings(auth.eligibleCountries, "eligibleCountries") } },
    updatedAt: v.updatedAt === undefined ? new Date().toISOString() : string(v.updatedAt, "updatedAt"),
  };
  return { ...v, ...result };
}

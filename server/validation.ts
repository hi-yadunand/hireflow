import { normalizeHighlights } from "../src/lib/profile.js";
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
function profileHighlights(value: unknown): string[] {
  try { return normalizeHighlights(value); }
  catch { throw new SafetyError("highlights must be an array of strings"); }
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
import type { Profile, TailoredResume, ResumeProfileImport } from "../src/types/index.js";
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
function profileLink(value: unknown, label: string): string {
  if (value === undefined) return "";
  const text = string(value, label, true);
  if (!text.trim()) return text;
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new SafetyError(`${label} must be a safe HTTP(S) URL`);
  try {
    // Validate ordinary bare hostnames without rewriting the user's value.
    const candidate = text.trim();
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Unsafe URL");
  } catch { throw new SafetyError(`${label} must be a safe HTTP(S) URL`); }
  return text;
}
export function validateParsedProfile(value: unknown): ResumeProfileImport {
  const v = object(value, "Parsed profile"), personal = object(v.personal, "personal");
  const text = (value: unknown, label: string) => value === undefined ? "" : string(value, label, true);
  return {
    personal: { fullName: text(personal.fullName, "fullName"), email: text(personal.email, "email"), phone: text(personal.phone, "phone"), location: text(personal.location, "location"), headline: text(personal.headline, "headline"), summary: text(personal.summary, "summary"), portfolioUrl: profileLink(personal.portfolioUrl, "portfolioUrl"), githubUrl: profileLink(personal.githubUrl, "githubUrl"), linkedinUrl: profileLink(personal.linkedinUrl, "linkedinUrl"), otherLinks: personal.otherLinks === undefined ? [] : strings(personal.otherLinks, "otherLinks").map(link => profileLink(link, "otherLinks")) },
    skills: strings(v.skills, "skills"),
    experience: array(v.experience, "experience").map(e => { object(e); return {
      id: randomUUID(), company: string(e.company, "company"), role: string(e.role, "role"), location: text(e.location, "location"),
      type: e.type === undefined ? "Not provided" : choice(e.type, ["Full-time", "Contract", "Part-time", "Internship", "Not provided"] as const, "employment type"),
      startDate: text(e.startDate, "startDate"), endDate: text(e.endDate, "endDate"), current: e.current === undefined ? false : boolean(e.current, "current"),
      description: text(e.description, "description"), highlights: profileHighlights(e.highlights),
    }; }),
    education: array(v.education, "education").map(e => { object(e); return { id: randomUUID(), institution: string(e.institution, "institution"), degree: text(e.degree, "degree"), fieldOfStudy: text(e.fieldOfStudy, "fieldOfStudy"), startDate: text(e.startDate, "startDate"), endDate: text(e.endDate, "endDate"), gpa: text(e.gpa, "gpa"), achievements: e.achievements === undefined ? [] : strings(e.achievements, "education achievements") }; }),
    projects: v.projects === undefined ? undefined : array(v.projects, "projects").map(p => { object(p); return { id: randomUUID(), title: string(p.title, "project title", true), description: text(p.description, "project description"), technologies: p.technologies === undefined ? [] : strings(p.technologies, "technologies"), liveUrl: profileLink(p.liveUrl, "liveUrl"), repoUrl: profileLink(p.repoUrl, "repoUrl"), highlights: profileHighlights(p.highlights) }; }),
    certifications: v.certifications === undefined ? undefined : array(v.certifications, "certifications").map(c => { object(c); return { id: randomUUID(), name: string(c.name, "certification name"), issuer: text(c.issuer, "issuer"), issueDate: text(c.issueDate, "issueDate"), credentialUrl: profileLink(c.credentialUrl, "credentialUrl") }; }),
    professionalHighlights: v.professionalHighlights === undefined ? [] : profileHighlights(v.professionalHighlights),
    preferences: v.preferences === undefined ? undefined : validateImportedPreferences(v.preferences),
    importWarnings: v.importWarnings === undefined ? [] : strings(v.importWarnings, "importWarnings"),
    languages: v.languages === undefined ? [] : strings(v.languages, "languages"),
  };
}
function validateImportedPreferences(value: unknown): ResumeProfileImport["preferences"] {
  const v = object(value, "preferences");
  const result: NonNullable<ResumeProfileImport["preferences"]> = {};
  for (const field of ["desiredTitles", "preferredCountries", "preferredLocations"] as const) if (field in v) result[field] = strings(v[field], field);
  if (v.remotePreference !== undefined) result.remotePreference = choice(v.remotePreference, ["remote_only", "hybrid_flexible", "onsite_allowed", "any"] as const, "remote preference");
  if (v.experienceLevel !== undefined) result.experienceLevel = choice(v.experienceLevel, ["", "Entry", "Mid", "Senior", "Lead", "Executive", "Any"], "experience level");
  if (v.noticePeriod !== undefined) result.noticePeriod = string(v.noticePeriod, "noticePeriod", true);
  if (v.expectedSalary !== undefined) {
    const salary = object(v.expectedSalary, "expectedSalary"); result.expectedSalary = {};
    if (salary.min !== undefined) result.expectedSalary.min = integer(salary.min, "salary minimum", 0, 1_000_000_000);
    if (salary.currency !== undefined) result.expectedSalary.currency = string(salary.currency, "currency", true);
    if (salary.period !== undefined) result.expectedSalary.period = choice(salary.period, ["annual", "monthly"] as const, "salary period");
  }
  if (v.workAuthorization !== undefined) {
    const auth = object(v.workAuthorization, "workAuthorization"); result.workAuthorization = {};
    if (auth.status !== undefined) result.workAuthorization.status = choice(auth.status, ["Not provided", "Citizen", "Permanent Resident", "Work Visa", "Requires Sponsorship"] as const, "work authorization");
    if (auth.details !== undefined) result.workAuthorization.details = string(auth.details, "authorization details", true);
    if (auth.eligibleCountries !== undefined) result.workAuthorization.eligibleCountries = strings(auth.eligibleCountries, "eligibleCountries");
  }
  return result;
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
    projects: array(v.projects, "projects").map(p => { object(p); return { id: string(p.id, "project id"), title: string(p.title, "project title", true), description: string(p.description, "project description", true), technologies: strings(p.technologies, "technologies"), liveUrl: p.liveUrl === undefined ? undefined : profileLink(p.liveUrl, "liveUrl"), repoUrl: p.repoUrl === undefined ? undefined : profileLink(p.repoUrl, "repoUrl"), highlights: profileHighlights(p.highlights) }; }),
    certifications: array(v.certifications, "certifications").map(c => { object(c); return { id: string(c.id, "certification id"), name: string(c.name, "certification name"), issuer: string(c.issuer, "issuer", true), issueDate: string(c.issueDate, "issueDate", true), credentialUrl: c.credentialUrl === undefined ? undefined : profileLink(c.credentialUrl, "credentialUrl") }; }),
    preferences: { desiredTitles: strings(pref.desiredTitles, "desiredTitles"), preferredCountries: strings(pref.preferredCountries, "preferredCountries"), preferredLocations: pref.preferredLocations === undefined ? [] : strings(pref.preferredLocations, "preferredLocations"), experienceLevel: pref.experienceLevel === undefined ? "" : choice(pref.experienceLevel, ["", "Entry", "Mid", "Senior", "Lead", "Executive", "Any"], "experience level"), noticePeriod: pref.noticePeriod === undefined ? "" : string(pref.noticePeriod, "noticePeriod", true), remotePreference: choice(pref.remotePreference, ["remote_only", "hybrid_flexible", "onsite_allowed", "any"] as const, "remote preference"), expectedSalary: { min: integer(salary.min, "salary minimum", 0, 1_000_000_000), currency: string(salary.currency, "currency"), period: choice(salary.period, ["annual", "monthly"] as const, "salary period") }, workAuthorization: { status: choice(auth.status, ["Not provided", "Citizen", "Permanent Resident", "Work Visa", "Requires Sponsorship"] as const, "work authorization"), details: string(auth.details, "authorization details", true), eligibleCountries: strings(auth.eligibleCountries, "eligibleCountries") } },
    updatedAt: v.updatedAt === undefined ? new Date().toISOString() : string(v.updatedAt, "updatedAt"),
  };
  const { importWarnings: _warnings, ...clean } = { ...v, ...result } as Record<string, any>;
  return clean as Profile;
}

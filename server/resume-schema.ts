import { Type, type Schema } from "@google/genai";
const text: Schema = { type: Type.STRING };
const list: Schema = { type: Type.ARRAY, items: text };
const record = (properties: Record<string, Schema>, required?: string[]): Schema => ({ type: Type.OBJECT, properties, required });
const records = (properties: Record<string, Schema>, required?: string[]): Schema => ({ type: Type.ARRAY, items: record(properties, required) });
export const RESUME_PROFILE_SCHEMA = record({
  personal: record(Object.fromEntries(["fullName", "email", "phone", "location", "headline", "summary", "linkedinUrl", "githubUrl", "portfolioUrl"].map(key => [key, text]))),
  skills: list,
  experience: records({ company: text, role: text, location: text, type: { type: Type.STRING, enum: ["Full-time", "Contract", "Part-time", "Internship", "Not provided"] }, startDate: text, endDate: text, current: { type: Type.BOOLEAN }, description: text, highlights: list }, ["company", "role"]),
  education: records({ institution: text, degree: text, fieldOfStudy: text, startDate: text, endDate: text, gpa: text, achievements: list }, ["institution"]),
  projects: records({ title: text, description: text, technologies: list, liveUrl: text, repoUrl: text, highlights: list }, ["title"]),
  certifications: records({ name: text, issuer: text, issueDate: text, credentialUrl: text }, ["name"]),
  languages: list, professionalHighlights: list,
  preferences: record({ desiredTitles: list, preferredCountries: list, preferredLocations: list, noticePeriod: text,
    experienceLevel: { type: Type.STRING, enum: ["Entry", "Mid", "Senior", "Lead", "Executive", "Any"] },
    remotePreference: { type: Type.STRING, enum: ["remote_only", "hybrid_flexible", "onsite_allowed", "any"] },
    expectedSalary: record({ min: { type: Type.INTEGER }, currency: text, period: { type: Type.STRING, enum: ["annual", "monthly"] } }),
    workAuthorization: record({ status: { type: Type.STRING, enum: ["Not provided", "Citizen", "Permanent Resident", "Work Visa", "Requires Sponsorship"] }, details: text, eligibleCountries: list }),
  }),
  importWarnings: list,
}, ["personal", "skills", "experience", "education", "projects", "certifications", "languages", "professionalHighlights"]);
RESUME_PROFILE_SCHEMA.properties!.personal.properties!.otherLinks = list;

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { Database, emptyProfile } from "../server/db.js";
import type { AIService } from "../server/agent.js";
import type { Job, Profile } from "../src/types/index.js";
export function temporaryDb(now?: () => Date) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hireflow-phase0-"));
  return { db: new Database(path.join(dir, "test.json"), now), dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
export function realProfile(): Profile { const p = emptyProfile(); p.personal.fullName = "Test Candidate"; p.skills = ["TypeScript"]; return p; }
export function job(id = "job-real"): Job {
  return { id, company: "Test Employer", position: "Engineer", location: "", country: "", employmentType: "Full-time", workplaceType: "Remote", experienceLevel: "Mid", source: "Direct Career Page", applyUrl: "https://example.org/job", description: "TypeScript engineering", requirements: ["TypeScript"], niceToHave: [], publicationDate: "2026-11-03T00:00:00Z", firstDetectedDate: "2026-11-03T00:00:00Z", matchPercentage: 0, matchingSkills: [], missingSkills: [], applicationStatus: "Discovered", processing: { state: "pending" } };
}
export function fakeAI() {
  return {
    analyzeJobMatch: vi.fn<AIService["analyzeJobMatch"]>().mockResolvedValue({ matchPercentage: 90, matchingSkills: ["TypeScript"], missingSkills: [], matchAnalysis: "Test assessment", matchStrengths: ["TypeScript"], matchGaps: [], recommendation: "strong_match" }),
    tailorResume: vi.fn<AIService["tailorResume"]>().mockImplementation(async (_p, j) => ({ id: `res-${j.id}`, jobId: j.id, company: j.company, position: j.position, createdAt: new Date().toISOString(), tailoredSummary: "Test draft", tailoredSkills: ["TypeScript"], tailoredExperience: [], tailoringNotes: "Test" })),
    generateCoverLetter: vi.fn<AIService["generateCoverLetter"]>().mockImplementation(async (_p, j) => ({ id: `letter-${j.id}`, jobId: j.id, company: j.company, position: j.position, createdAt: new Date().toISOString(), letterBody: "Test draft", keyHooks: [], tone: "professional" })),
    parseResumeText: vi.fn<AIService["parseResumeText"]>().mockResolvedValue({ personal: realProfile().personal, skills: [], experience: [], education: [] }),
    generateInterviewPrep: vi.fn<AIService["generateInterviewPrep"]>().mockResolvedValue({ questions: [], talkingPoints: [], companyInsights: "", pitfallsToAvoid: [] }),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

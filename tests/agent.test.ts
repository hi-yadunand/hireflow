import { afterEach, describe, expect, it } from "vitest";
import { AgentEngine } from "../server/agent.js";
import { stageJob } from "../server/processing-policy.js";
import { temporaryDb, realProfile, job, fakeAI } from "./fixtures.js";
const cleanups: (() => void)[] = [];
function setup() { const f = temporaryDb(); cleanups.push(f.cleanup); f.db.updateProfile(realProfile()); f.db.addJob(job()); return { ...f, ai: fakeAI() }; }
afterEach(() => cleanups.splice(0).forEach(f => f()));
describe("pause checkpoints", () => {
  it("does no processing when paused at cycle entry", async () => { const { db, ai } = setup(); db.setPaused(true); await expect(new AgentEngine(db, ai).runCycle()).rejects.toThrow("paused"); expect(ai.analyzeJobMatch).not.toHaveBeenCalled(); });
  for (const operation of ["analyzeJobMatch", "tailorResume", "generateCoverLetter"] as const) {
    it(`stops after pause during ${operation}, preserves paused state and releases the quota`, async () => {
      const { db, ai } = setup();
      const normal = ai[operation].getMockImplementation()!;
      if (operation === "analyzeJobMatch") { ai.analyzeJobMatch.mockImplementationOnce(async () => { db.setPaused(true); return { matchPercentage: 90, matchingSkills: [], missingSkills: [], matchAnalysis: "Test", matchStrengths: [], matchGaps: [], recommendation: "strong_match" }; }); }
      else if (operation === "tailorResume") ai.tailorResume.mockImplementationOnce(async (p, j, m) => { const result = await (normal as typeof ai.tailorResume)(p, j, m); db.setPaused(true); return result; });
      else ai.generateCoverLetter.mockImplementationOnce(async (p, j, t, m) => { const result = await (normal as typeof ai.generateCoverLetter)(p, j, t, m); db.setPaused(true); return result; });
      const result = await new AgentEngine(db, ai).runCycle();
      expect(result.success).toBe(false); expect(db.getStatus().workerState).toBe("paused"); expect(db.getApplications()).toHaveLength(0); expect(db.getStatus().dailyApplicationsCount).toBe(0);
      if (operation === "analyzeJobMatch") expect(db.getJob("job-real")!.matchPercentage).toBe(0);
      if (operation !== "generateCoverLetter") expect(db.getResumes()).toHaveLength(0);
      expect(db.getCoverLetters()).toHaveLength(0);
      db.setPaused(false); expect(() => db.reserveStage("job-real")).not.toThrow();
    });
  }
  it("checks pause immediately before staging", async () => {
    const { db } = setup(); db.setPaused(true); expect(() => stageJob(db, db.getJob("job-real")!)).toThrow("paused"); expect(db.getApplications()).toHaveLength(0);
  });
});
describe("recovery, idempotency, and quotas", () => {
  for (const operation of ["analyzeJobMatch", "tailorResume", "generateCoverLetter"] as const) {
    it(`recovers a failed ${operation} without losing the job or duplicating completed documents`, async () => {
      const { db, ai } = setup(); ai[operation].mockRejectedValueOnce(new Error("Provider unavailable")); const engine = new AgentEngine(db, ai);
      expect((await engine.runCycle()).success).toBe(false); expect(db.getJob("job-real")!.processing?.state).toBe("failed"); expect(db.getStatus().workerState).toBe("idle");
      expect((await engine.runCycle()).processedCount).toBe(1); expect(db.getApplications()).toHaveLength(1); expect(db.getResumes()).toHaveLength(1); expect(db.getCoverLetters()).toHaveLength(1);
      expect((await engine.runCycle()).processedCount).toBe(0); expect(db.getApplications()).toHaveLength(1);
      expect(db.getApplications()[0].applicationAnswers?.every(a => !a.confirmed)).toBe(true);
      if (operation === "generateCoverLetter") expect(ai.tailorResume).toHaveBeenCalledTimes(1);
    });
  }
  it("enforces the daily cap before document generation and resumes remaining jobs later", async () => {
    const { db, ai } = setup(); db.addJob(job("second")); db.updateSettings({ dailyApplicationLimit: 1 }); const engine = new AgentEngine(db, ai);
    const result = await engine.runCycle(); expect(result.processedCount).toBe(1); expect(result.success).toBe(false); expect(ai.tailorResume).toHaveBeenCalledTimes(1); expect(db.getStatus().dailyApplicationsCount).toBe(1);
    db.updateSettings({ dailyApplicationLimit: 2 }); expect((await engine.runCycle()).processedCount).toBe(1); expect(db.getApplications()).toHaveLength(2);
  });
  it("does not repeatedly evaluate an unchanged low-scoring job", async () => {
    const { db, ai } = setup(); ai.analyzeJobMatch.mockResolvedValue({ matchPercentage: 10, matchingSkills: [], missingSkills: [], matchAnalysis: "Low match", matchStrengths: [], matchGaps: [], recommendation: "low_match" }); const engine = new AgentEngine(db, ai); await engine.runCycle(); await engine.runCycle(); expect(ai.analyzeJobMatch).toHaveBeenCalledTimes(1); expect(db.getApplications()).toHaveLength(0);
  });
  it("recovers legacy Analysing jobs without claiming discovery or polling", async () => {
    const { db, ai } = setup(); db.updateJob("job-real", { applicationStatus: "Analysing", matchPercentage: 90, processing: undefined }); const result = await new AgentEngine(db, ai).runCycle(); expect(result.processedCount).toBe(1); expect(result.discoveredCount).toBe(0); expect(db.getConnectors().every(c => c.lastSuccessfulCheck === null)).toBe(true); expect(db.getStatus().nextScheduledRun).toBe("");
  });
  it("rejects a concurrent cycle while allowing pause", async () => {
    const { db, ai } = setup(); let resolve!: (v: Awaited<ReturnType<typeof ai.analyzeJobMatch>>) => void;
    ai.analyzeJobMatch.mockReturnValueOnce(new Promise(r => { resolve = r; })); const engine = new AgentEngine(db, ai); const first = engine.runCycle(); await expect(engine.runCycle()).rejects.toThrow("already"); await engine.setPaused(true); resolve({ matchPercentage: 90, matchingSkills: [], missingSkills: [], matchAnalysis: "Test", matchStrengths: [], matchGaps: [], recommendation: "strong_match" }); await first; expect(db.getApplications()).toHaveLength(0);
  });
  it("rejects stale AI output when the profile changes in flight", async () => {
    const { db, ai } = setup(); ai.tailorResume.mockImplementationOnce(async (_p, j) => { const p = realProfile(); p.personal.fullName = "Changed"; db.updateProfile(p); return { id: "stale", jobId: j.id, company: j.company, position: j.position, createdAt: "", tailoredSummary: "Old", tailoredSkills: [], tailoredExperience: [], tailoringNotes: "" }; });
    const result = await new AgentEngine(db, ai).runCycle(); expect(result.success).toBe(false); expect(db.getResumes()).toHaveLength(0);
  });
});
it("does not accept in-flight output after a pause followed by an immediate resume", async () => {
  const { db, ai } = setup(); const original = ai.tailorResume.getMockImplementation()!;
  ai.tailorResume.mockImplementationOnce(async (...args) => { const result = await original(...args); db.setPaused(true); db.setPaused(false); return result; });
  const engine = new AgentEngine(db, ai); expect((await engine.runCycle()).success).toBe(false); expect(db.getResumes()).toHaveLength(0); expect(db.getApplications()).toHaveLength(0); expect(db.getStatus().workerState).toBe("idle");
  expect((await engine.runCycle()).processedCount).toBe(1);
});
it("discards output for a job edited during an AI request", async () => {
  const { db, ai } = setup(); const original = ai.tailorResume.getMockImplementation()!;
  ai.tailorResume.mockImplementationOnce(async (...args) => { const result = await original(...args); db.updateJob("job-real", { description: "A changed role", processing: { state: "pending" } }); return result; });
  expect((await new AgentEngine(db, ai).runCycle()).success).toBe(false); expect(db.getResumes()).toHaveLength(0); expect(db.getApplications()).toHaveLength(0);
});
it("reconsiders cached low matches when the threshold is lowered without repeating Gemini analysis", async () => {
  const { db, ai } = setup(); ai.analyzeJobMatch.mockResolvedValue({ matchPercentage: 60, matchingSkills: [], missingSkills: [], matchAnalysis: "Cached", matchStrengths: [], matchGaps: [], recommendation: "moderate_match" });
  const engine = new AgentEngine(db, ai); await engine.runCycle(); expect(db.getApplications()).toHaveLength(0); db.updateSettings({ matchThreshold: 50 }); expect((await engine.runCycle()).processedCount).toBe(1); expect(ai.analyzeJobMatch).toHaveBeenCalledTimes(1);
  await engine.runCycle(); expect(db.getApplications()).toHaveLength(1);
});
it("rechecks a raised threshold before staging an in-flight package", async () => {
  const { db, ai } = setup(); const normal = ai.generateCoverLetter.getMockImplementation()!; ai.generateCoverLetter.mockImplementationOnce(async (...args) => { const letter = await normal(...args); db.updateSettings({ matchThreshold: 95 }); return letter; });
  const engine = new AgentEngine(db, ai); expect((await engine.runCycle()).success).toBe(false); expect(db.getApplications()).toEqual([]); db.updateSettings({ matchThreshold: 75 }); expect((await engine.runCycle()).processedCount).toBe(1); expect(ai.analyzeJobMatch).toHaveBeenCalledTimes(1); expect(ai.tailorResume).toHaveBeenCalledTimes(1);
});
it("preserves candidate history when a manual terminal outcome arrives during agent preparation", async () => {
  const { db, ai } = setup(); const normal = ai.tailorResume.getMockImplementation()!;
  ai.tailorResume.mockImplementationOnce(async (...args) => { db.recordManualApplication(db.getJob("job-real")!, "Interview", { reviewNotes: "My interview notes" }); return normal(...args); });
  const result = await new AgentEngine(db, ai).runCycle(); expect(result.processedCount).toBe(0); expect(db.getResumes()).toEqual([]); expect(db.getJob("job-real")!.processing?.state).toBe("complete"); expect(db.getApplications()).toHaveLength(1); expect(db.getApplications()[0]).toMatchObject({ status: "Interview", reviewNotes: "My interview notes" }); expect(db.getApplications()[0].timeline).toHaveLength(1); expect(db.getStatus().dailyApplicationsCount).toBe(0);
});

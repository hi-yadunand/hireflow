import { afterEach, describe, expect, it, vi } from "vitest";
import { runAiOperation, providerError } from "../server/ai-operation.js";
import { AgentEngine } from "../server/agent.js";
import { temporaryDb, realProfile, job, fakeAI } from "./fixtures.js";
const cleanups: (() => void)[] = [];
afterEach(() => { vi.useRealTimers(); cleanups.splice(0).forEach(f => f()); });
describe("bounded AI operations", () => {
  it("times out a provider that ignores abort and rejects its late result", async () => {
    vi.useFakeTimers(); let late!: (value: string) => void; let signal!: AbortSignal;
    const request = runAiOperation(abort => { signal = abort; return new Promise(resolve => { late = resolve; }); }, { timeoutMs: 50 });
    const rejection = expect(request).rejects.toMatchObject({ status: 504, details: { code: "AI_TIMEOUT" } });
    await vi.advanceTimersByTimeAsync(50); await rejection; expect(signal.aborted).toBe(true);
    late("late response"); await Promise.resolve(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up timer/listeners on success, cancellation, and provider rejection", async () => {
    vi.useFakeTimers(); const unsubscribe = vi.fn();
    await expect(runAiOperation(async () => "ok", { subscribeCancel: () => unsubscribe })).resolves.toBe("ok"); expect(unsubscribe).toHaveBeenCalledOnce();
    const controller = new AbortController(); const pending = runAiOperation(() => new Promise(() => {}), { signal: controller.signal }); const rejection = expect(pending).rejects.toMatchObject({ details: { code: "AI_CANCELLED" } }); controller.abort(); await rejection;
    await expect(runAiOperation(async () => { throw undefined; })).rejects.toMatchObject({ details: { code: "AI_PROVIDER_ERROR" } }); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not invoke an already-cancelled operation", async () => {
    const controller = new AbortController(); controller.abort(); const work = vi.fn(); await expect(runAiOperation(work, { signal: controller.signal })).rejects.toThrow("cancelled"); expect(work).not.toHaveBeenCalled();
  });
  it("retains only sanitized provider diagnostics", () => {
    const secret = "AIza-secret-user-resume-email@example.org";
    const result = providerError({ status: 429, code: "RESOURCE_EXHAUSTED", message: secret, request: { prompt: secret } });
    expect(result.status).toBe(429); expect(result.details).toEqual({ code: "RESOURCE_EXHAUSTED", providerStatus: 429 }); expect(JSON.stringify(result) + result.message).not.toContain(secret);
    expect(providerError({ status: "429", code: secret }).details).toEqual({ code: "AI_PROVIDER_ERROR", providerStatus: undefined });
  });
});
it("releases the cycle lock and quota on timeout, and late output cannot write during a successful retry", async () => {
  vi.useFakeTimers(); const fixture = temporaryDb(); cleanups.push(fixture.cleanup); const { db } = fixture;
  db.updateProfile(realProfile()); db.addJob(job()); db.updateSettings({ dailyApplicationLimit: 1 });
  const ai = fakeAI(); let late!: (value: Awaited<ReturnType<typeof ai.tailorResume>>) => void;
  ai.tailorResume.mockReturnValueOnce(new Promise(resolve => { late = resolve; }));
  const engine = new AgentEngine(db, ai, 50); const first = engine.runCycle(); await vi.advanceTimersByTimeAsync(50);
  expect((await first).success).toBe(false); expect(db.getStatus().workerState).toBe("idle"); expect(db.getStatus().dailyApplicationsCount).toBe(0); expect(db.getResumes()).toEqual([]);
  expect((await engine.runCycle()).processedCount).toBe(1); const before = db.getApplications();
  late({ id: "late-resume", jobId: "job-real", company: "Test", position: "Test", createdAt: "", tailoredSummary: "Late", tailoredSkills: [], tailoredExperience: [], tailoringNotes: "" }); await vi.advanceTimersByTimeAsync(1);
  expect(db.getApplications()).toEqual(before); expect(db.getResumes().some(r => r.id === "late-resume")).toBe(false); expect(db.getStatus().dailyApplicationsCount).toBe(1);
});
it("rapid pause/resume cancels a never-settling provider and frees the lock immediately", async () => {
  const fixture = temporaryDb(); cleanups.push(fixture.cleanup); const { db } = fixture; db.updateProfile(realProfile()); db.addJob(job());
  const ai = fakeAI(); ai.tailorResume.mockReturnValueOnce(new Promise(() => {})); const engine = new AgentEngine(db, ai);
  const first = engine.runCycle(); await vi.waitFor(() => expect(ai.tailorResume).toHaveBeenCalled()); engine.setPaused(true); engine.setPaused(false);
  expect((await first).success).toBe(false); expect(db.getResumes()).toEqual([]); expect((await engine.runCycle()).processedCount).toBe(1);
});
it("classifies plain invalid-key errors and service unavailability without exposing provider messages", () => {
 const invalid = providerError({ status: 400, message: "API key not valid. Please pass a valid API key. secret-must-stay-private" });
 expect(invalid.status).toBe(503); expect(invalid.details?.code).toBe("API_KEY_INVALID"); expect(invalid.message).toContain("root .env"); expect(invalid.message).not.toContain("secret-must-stay-private");
 const unavailable = providerError({ status: 503, message: "private provider diagnostics" }); expect(unavailable.message).toContain("temporarily unavailable"); expect(unavailable.message).not.toContain("private provider diagnostics");
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import fs from "node:fs";
import { createApp } from "../server/app.js";
import { temporaryDb, realProfile, job, fakeAI } from "./fixtures.js";
let fixture: ReturnType<typeof temporaryDb>, ai: ReturnType<typeof fakeAI>, server: Server, base: string;
beforeEach(async () => {
  fixture = temporaryDb(); ai = fakeAI();
  await new Promise<void>((resolve, reject) => { server = createApp(fixture.db, ai).listen(0, "127.0.0.1", resolve); server.on("error", reject); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test server address"); base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); fixture?.cleanup(); vi.restoreAllMocks(); });
async function request(route: string, method = "GET", body?: unknown, mode = "real") {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", "X-HireFlow-Mode": mode }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, body: await response.json() };
}
function initialize() { fixture.db.updateProfile(realProfile()); fixture.db.addJob(job()); }
describe("demo isolation and protected data", () => {
  it("defaults to empty real data and exposes optional labeled read-only demo records", async () => {
    expect((await request("/api/jobs")).body).toEqual([]); const demo = await request("/api/jobs", "GET", undefined, "demo"); expect(demo.body).toHaveLength(6); expect(demo.body.every((j: any) => j.isDemo)).toBe(true); expect(fs.existsSync(fixture.db.file)).toBe(false);
  });
  for (const [method, route, body] of [["PUT", "/api/profile", {}], ["POST", "/api/jobs", {}], ["POST", "/api/agent/run-cycle", {}], ["POST", "/api/profile/upload-resume", { rawText: "test" }], ["POST", "/api/applications", { jobId: "job-real" }], ["PUT", "/api/settings", {}], ["DELETE", "/api/jobs/job-real", undefined]] as const) {
    it(`blocks demo mutations: ${method} ${route}`, async () => { initialize(); const before = fs.readFileSync(fixture.db.file, "utf8"); expect((await request(route, method, body, "demo")).status).toBe(403); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before); expect(ai.analyzeJobMatch).not.toHaveBeenCalled(); });
  }
  it("does not expose legacy real data through demo routes", async () => { initialize(); expect((await request("/api/profile/legacy", "GET", undefined, "demo")).status).toBe(404); });
  it("clears only the disposable demo preview", async () => {
    initialize(); await request("/api/applications", "POST", { jobId: "job-real" }); const before = fs.readFileSync(fixture.db.file, "utf8"); expect((await request("/api/demo/clear", "POST", {}, "demo")).status).toBe(200); expect((await request("/api/jobs", "GET", undefined, "demo")).body).toEqual([]); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before); expect((await request("/api/applications")).body).toHaveLength(1);
  });
  it("requires explicit accuracy confirmation and rejects demo profile saves", async () => {
    expect((await request("/api/profile", "PUT", realProfile())).status).toBe(400); expect((await request("/api/profile", "PUT", { ...realProfile(), expectedVersion: fixture.db.getProfile().revision, confirmAccuracy: true, isDemo: true })).status).toBe(400); expect((await request("/api/profile", "PUT", { ...realProfile(), expectedVersion: fixture.db.getProfile().revision, confirmAccuracy: true })).body.reviewedAt).toBeTruthy();
  });
});
describe("submission claims and staging", () => {
  it("records manually reported applications as unverified and ignores false dispatch messages", async () => {
    initialize(); const app = (await request("/api/applications", "POST", { jobId: "job-real" })).body;
    const result = await request(`/api/applications/${app.id}`, "PUT", { status: "Applied", statusMessage: "Verified ATS dispatch" });
    expect(result.status).toBe(200); expect(result.body.status).toBe("Submission Unverified"); expect(result.body.submissionOrigin).toBe("user_reported"); expect(result.body.timeline.at(-1).message).not.toContain("dispatch"); expect(fixture.db.getJob("job-real")!.applicationStatus).toBe("Submission Unverified");
  });
  for (const field of ["id", "isDemo", "submissionOrigin", "submissionEvidence", "timeline", "stagedAt", "verified"]) it(`rejects caller-supplied ${field}`, async () => { initialize(); expect((await request("/api/applications", "POST", { jobId: "job-real", [field]: "forged" })).status).toBe(400); expect(fixture.db.getApplications()).toHaveLength(0); });
  it("does not create an already-applied record", async () => { initialize(); expect((await request("/api/applications", "POST", { jobId: "job-real", status: "Applied" })).status).toBe(400); });
  it("enforces one limit across concurrent manual staging and agent processing", async () => {
    initialize(); fixture.db.addJob(job("second")); fixture.db.updateSettings({ dailyApplicationLimit: 1 });
    const results = await Promise.all([request("/api/applications", "POST", { jobId: "job-real" }), request("/api/applications", "POST", { jobId: "second" })]); expect(results.map(r => r.status).sort()).toEqual([201, 429]);
    const cycle = await request("/api/agent/run-cycle", "POST", {}); expect(cycle.status).toBe(409); expect(cycle.body.success).toBe(false); expect(fixture.db.getApplications()).toHaveLength(1); expect(ai.tailorResume).not.toHaveBeenCalled();
  });
  it("staging retries preserve full approved history without duplicates or another quota slot", async () => {
    initialize(); const staged = await request("/api/applications", "POST", { jobId: "job-real" });
    const approved = await request(`/api/applications/${staged.body.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Candidate approved" }); expect(approved.status).toBe(200);
    const retry = await request("/api/applications", "POST", { jobId: "job-real" }); expect(retry.body).toEqual(approved.body); expect(retry.body.timeline).toEqual([...staged.body.timeline, approved.body.timeline.at(-1)]); expect(retry.body.status).toBe("Ready to Apply"); expect(fixture.db.getApplications()).toEqual([approved.body]); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(1);
  });
  it("rejects direct job-status forgery", async () => { initialize(); expect((await request("/api/jobs/job-real", "PUT", { applicationStatus: "Applied" })).status).toBe(400); });
});
describe("truthful source state and explicit errors", () => {
  it("cannot claim a connector is connected by sending credentials or flags", async () => { const r = await request("/api/connectors/conn-greenhouse", "PUT", { connectionStatus: "Connected", isConfigured: true }); expect(r.status).toBe(400); const connectors = (await request("/api/connectors")).body; expect(connectors.every((c: any) => c.connectionStatus === "Not implemented" && c.lastSuccessfulCheck === null)).toBe(true); });
  it("reports a Gemini failure without persisting fabricated profile data", async () => { ai.parseResumeText.mockRejectedValueOnce(new Error("Provider unavailable")); const r = await request("/api/profile/upload-resume", "POST", { rawText: "Test" }); expect(r.status).toBe(502); expect(r.body.error).toContain("availability"); expect(r.body.details.code).toBe("AI_PROVIDER_ERROR"); expect(JSON.stringify(r.body)).not.toContain("Provider unavailable"); expect(fixture.db.getProfile().skills).toEqual([]); });
  it("checks pause after a direct AI call and discards its result", async () => { initialize(); const original = ai.tailorResume.getMockImplementation()!; ai.tailorResume.mockImplementationOnce(async (...args) => { const result = await original(...args); fixture.db.setPaused(true); return result; }); expect((await request("/api/jobs/job-real/tailor-resume", "POST", {})).status).toBe(409); expect(fixture.db.getResumes()).toHaveLength(0); });
  it("blocks direct parsing while paused", async () => { fixture.db.setPaused(true); expect((await request("/api/profile/upload-resume", "POST", { rawText: "Test" })).status).toBe(409); expect(ai.parseResumeText).not.toHaveBeenCalled(); });
  it("returns non-success for partial cycles and exposes the failed job", async () => { initialize(); ai.analyzeJobMatch.mockRejectedValueOnce(new Error("AI down")); const r = await request("/api/agent/run-cycle", "POST", {}); expect(r.status).toBe(409); expect(r.body.errors[0]).toEqual({ jobId: "job-real", message: "AI request failed (availability). No result was saved." }); expect(fixture.db.getStatus().workerState).toBe("idle"); });
  it("does not overwrite data on request validation failure", async () => { initialize(); const before = fs.readFileSync(fixture.db.file, "utf8"); expect((await request("/api/settings", "PUT", { dailyApplicationLimit: -1 })).status).toBe(400); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before); });
  it("surfaces persistence failure instead of returning success", async () => { initialize(); vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("Disk failure"); }); expect((await request("/api/settings", "PUT", { matchThreshold: 90 })).status).toBe(500); expect(fixture.db.getSettings().matchThreshold).toBe(75); });
  it("does not let stale settings undo an emergency pause", async () => { const settings = fixture.db.getSettings(); await request("/api/agent/toggle-pause", "POST", { paused: true }); expect((await request("/api/settings", "PUT", settings)).status).toBe(409); expect(fixture.db.getStatus().isPaused).toBe(true); });
});
it("reserves an agent package before generation so a simultaneous manual request cannot exceed the cap", async () => {
  initialize(); fixture.db.addJob(job("second")); fixture.db.updateSettings({ dailyApplicationLimit: 1 });
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>(r => { started = r; }), waiting = new Promise<void>(r => { finish = r; });
  const normal = ai.tailorResume.getMockImplementation()!;
  ai.tailorResume.mockImplementationOnce(async (...args) => { started(); await waiting; return normal(...args); });
  const cycle = request("/api/agent/run-cycle", "POST", {}); await entered;
  try { expect((await request("/api/applications", "POST", { jobId: "job-real" })).status).toBe(429); }
  finally { finish(); await cycle; }
  expect(fixture.db.getApplications()).toHaveLength(1); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(1);
});
it("preserves education achievements and existing raw resume text when saving a reviewed profile", async () => {
  const profile = realProfile(); profile.rawResumeText = "User resume source"; profile.education = [{ id: "degree", institution: "Test", degree: "BS", fieldOfStudy: "Biology", startDate: "2020", endDate: "2024", achievements: ["Research award"] }];
  const result = await request("/api/profile", "PUT", { ...profile, expectedVersion: fixture.db.getProfile().revision, confirmAccuracy: true }); expect(result.status).toBe(200); expect(result.body.education[0].achievements).toEqual(["Research award"]); expect(result.body.rawResumeText).toBe("User resume source");
});
it("retains the full approved package and history on staging retries", async () => {
  initialize(); const app = (await request("/api/applications", "POST", { jobId: "job-real" })).body;
  await request(`/api/applications/${app.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Approved", applicationAnswers: [{ question: "Q", suggestedAnswer: "A", confirmed: true }] });
  const before = fixture.db.getApplication(app.id); const retry = await request("/api/applications", "POST", { jobId: "job-real" }); expect(retry.body).toEqual(before); expect(fixture.db.getApplication(app.id)).toEqual(before);
});
it("allows supported edits after analysis while rejecting caller-supplied recommendations", async () => {
  initialize(); await request("/api/jobs/job-real/analyze", "POST", {}); expect((await request("/api/jobs/job-real", "PUT", { location: "Updated location" })).status).toBe(200); expect((await request("/api/jobs/job-real", "PUT", { recommendation: "strong_match" })).status).toBe(400);
});
it("records rejection and interview history without profile confirmation, staging, or quota while paused", async () => {
  fixture.db.addJob(job()); fixture.db.setPaused(true);
  const first = await request("/api/applications/record", "POST", { jobId: "job-real", status: "Rejected" }); expect(first.status).toBe(200); expect(first.body.stagedAt).toBeUndefined();
  const second = await request("/api/applications/record", "POST", { jobId: "job-real", status: "Interview" }); expect(second.body.id).toBe(first.body.id); expect(second.body.timeline).toHaveLength(2); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(0);
});
it("cannot persist AI preparation through an unguarded interview update", async () => {
  initialize(); const interview = fixture.db.addInterview({ id: "test-int", company: "Test", position: "Engineer", date: "2026-11-03", time: "12:00", round: "Technical Round 1", format: "Video Call", status: "Scheduled", notes: "", aiPrepQuestions: [], talkingPoints: [] }); fixture.db.setPaused(true);
  expect((await request(`/api/interviews/${interview.id}`, "PUT", { aiPrepQuestions: ["Late AI output"], talkingPoints: [] })).status).toBe(400); expect(fixture.db.getInterviews()[0].aiPrepQuestions).toEqual([]);
});
it("cancels preparation on rapid pause/resume and never persists the late result", async () => {
  initialize(); fixture.db.addInterview({ id: "test-int", company: "Test", position: "Engineer", date: "2026-11-03", time: "12:00", round: "Technical Round 1", format: "Video Call", status: "Scheduled", notes: "", aiPrepQuestions: [], talkingPoints: [] });
  let late!: (value: Awaited<ReturnType<typeof ai.generateInterviewPrep>>) => void; ai.generateInterviewPrep.mockReturnValueOnce(new Promise(resolve => { late = resolve; }));
  const pending = request("/api/interviews/test-int/generate-prep", "POST", {}); await vi.waitFor(() => expect(ai.generateInterviewPrep).toHaveBeenCalled()); fixture.db.setPaused(true); fixture.db.setPaused(false); expect((await pending).status).toBe(409);
  late({ questions: ["Late question"], talkingPoints: [], companyInsights: "", pitfallsToAvoid: [] }); await Promise.resolve(); expect(fixture.db.getInterviews()[0].aiPrepQuestions).toEqual([]);
  expect((await request("/api/interviews/test-int/generate-prep", "POST", {})).status).toBe(200);
});
it("returns synchronized settings on both pause and resume", async () => {
  const paused = await request("/api/agent/toggle-pause", "POST", { paused: true }); expect(paused.body.settings.emergencyPause).toBe(true); expect((await request("/api/settings", "PUT", { ...paused.body.settings, dailyApplicationLimit: 3 })).status).toBe(200);
  expect((await request("/api/agent/toggle-pause", "POST", { paused: false })).body.settings.emergencyPause).toBe(false);
});
it("rejects an old profile confirmation after a concurrent save", async () => {
 const version = fixture.db.getProfile().revision;
 expect((await request("/api/profile", "PUT", { ...realProfile(), expectedVersion: version, confirmAccuracy: true })).status).toBe(200);
 const before = fs.readFileSync(fixture.db.file, "utf8");
 expect((await request("/api/profile", "PUT", { ...realProfile(), expectedVersion: version, confirmAccuracy: true })).status).toBe(409);
 expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before);
});
it("stores generated interview preparation atomically through the guarded endpoint", async () => {
 initialize(); fixture.db.addInterview({ id: "prep", company: "Test Employer", position: "Engineer", date: "2026-11-03", time: "12:00", round: "Technical Round 1", format: "Video Call", status: "Scheduled", notes: "Keep my notes", aiPrepQuestions: [], talkingPoints: [] });
 ai.generateInterviewPrep.mockResolvedValueOnce({ questions: ["User-profile question"], talkingPoints: ["Candidate's known work"], companyInsights: "", pitfallsToAvoid: [] });
 const response = await request("/api/interviews/prep/generate-prep", "POST", {});
 expect(response.status).toBe(200); expect(response.body).toEqual(fixture.db.getInterviews()[0]); expect(response.body.aiPrepQuestions).toEqual(["User-profile question"]); expect(response.body.notes).toBe("Keep my notes");
 expect((await request("/api/interviews", "POST", { ...response.body, id: undefined })).status).toBe(400);
});
it("rejects interview preparation if the interview changes before the AI response", async () => {
 initialize(); fixture.db.addInterview({ id: "prep", company: "Test", position: "Engineer", date: "2026-11-03", time: "12:00", round: "Technical Round 1", format: "Video Call", status: "Scheduled", notes: "", aiPrepQuestions: [], talkingPoints: [] });
 const normal = ai.generateInterviewPrep.getMockImplementation()!;
 ai.generateInterviewPrep.mockImplementationOnce(async (...args) => { fixture.db.updateInterview("prep", { notes: "Newer candidate edit" }); return normal(...args); });
 expect((await request("/api/interviews/prep/generate-prep", "POST", {})).status).toBe(409); expect(fixture.db.getInterviews()[0].notes).toBe("Newer candidate edit");
});
for (const [method, route] of [["analyzeJobMatch", "/api/jobs/job-real/analyze"], ["tailorResume", "/api/jobs/job-real/tailor-resume"], ["generateCoverLetter", "/api/jobs/job-real/generate-cover-letter"], ["generateInterviewPrep", "/api/interviews/prep/generate-prep"]] as const) it(`times out ${method}, ignores late writes and allows a fresh request`, async () => {
 initialize(); fixture.db.addInterview({ id: "prep", company: "Test", position: "Engineer", date: "2026-11-03", time: "12:00", round: "Technical Round 1", format: "Video Call", status: "Scheduled", notes: "", aiPrepQuestions: [], talkingPoints: [] });
 await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
 await new Promise<void>((resolve, reject) => { server = createApp(fixture.db, ai, { aiTimeoutMs: 35 }).listen(0, "127.0.0.1", resolve); server.on("error", reject); });
 const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test address"); base = `http://127.0.0.1:${address.port}`;
 let late!: (value: any) => void; ai[method].mockReturnValueOnce(new Promise<any>(resolve => { late = resolve; }));
 const before = fs.readFileSync(fixture.db.file, "utf8"), response = await request(route, "POST", {});
 expect(response.status).toBe(504); expect(response.body.details.code).toBe("AI_TIMEOUT"); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before);
 expect((await request(route, "POST", {})).status).toBe(200); const after = fs.readFileSync(fixture.db.file, "utf8"); late({ maliciousLateResult: true }); await new Promise(resolve => setTimeout(resolve, 5)); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(after);
});
it("rolls back an approval and its quota together when persistence fails", async () => {
 initialize(); const manual = fixture.db.recordManualApplication(fixture.db.getJob("job-real")!, "Interview");
 fixture.db.updateApplication(manual.id, { status: "Discovered" }); const before = fs.readFileSync(fixture.db.file, "utf8");
 vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("Approval disk failure"); });
 expect((await request(`/api/applications/${manual.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Approval" })).status).toBe(500);
 expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(0);
 const retry = await request(`/api/applications/${manual.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Approval" }); expect(retry.status).toBe(200); expect(retry.body.timeline).toHaveLength(manual.timeline.length + 1); expect(retry.body.status).toBe("Ready to Apply"); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(1);
});
it("cannot reset an approved application after recording a later outcome", async () => {
 initialize(); const app = (await request("/api/applications", "POST", { jobId: "job-real" })).body;
 await request(`/api/applications/${app.id}`, "PUT", { status: "Ready to Apply" }); await request(`/api/applications/${app.id}`, "PUT", { status: "Interview" });
 const before = fixture.db.getApplication(app.id); expect((await request(`/api/applications/${app.id}`, "PUT", { status: "Awaiting Approval" })).status).toBe(409); expect((await request("/api/applications", "POST", { jobId: "job-real" })).body).toEqual(before);
});
it("cancels disconnected AI requests and does not save a late provider response", async () => {
 initialize(); const controller = new AbortController(); let late!: (value: any) => void, signal!: AbortSignal;
 ai.tailorResume.mockImplementationOnce((_p, _j, _m, abort) => { signal = abort!; return new Promise(resolve => { late = resolve; }); });
 const pending = fetch(base + "/api/jobs/job-real/tailor-resume", { method: "POST", signal: controller.signal });
 const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" }); await vi.waitFor(() => expect(ai.tailorResume).toHaveBeenCalled()); controller.abort(); await rejection;
 await vi.waitFor(() => expect(signal.aborted).toBe(true)); late({ id: "late-disconnected" }); await new Promise(resolve => setTimeout(resolve, 5)); expect(fixture.db.getResumes()).toEqual([]);
});
it("preserves a manual approval made while agent analysis is pending", async () => {
 initialize(); let late!: (value: Awaited<ReturnType<typeof ai.analyzeJobMatch>>) => void;
 ai.analyzeJobMatch.mockReturnValueOnce(new Promise(resolve => { late = resolve; })); const cycle = request("/api/agent/run-cycle", "POST", {}); await vi.waitFor(() => expect(ai.analyzeJobMatch).toHaveBeenCalled());
 const app = (await request("/api/applications", "POST", { jobId: "job-real" })).body;
 expect((await request(`/api/applications/${app.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Approved manually" })).status).toBe(200); const before = fixture.db.getApplication(app.id);
 late({ matchPercentage: 90, matchingSkills: [], missingSkills: [], matchAnalysis: "Late", matchStrengths: [], matchGaps: [], recommendation: "strong_match" });
 expect((await cycle).status).toBe(409); expect(fixture.db.getApplication(app.id)).toEqual(before); expect(fixture.db.getApplications()).toHaveLength(1); expect(fixture.db.getJob("job-real")!.processing?.state).toBe("complete"); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(1); expect(ai.tailorResume).not.toHaveBeenCalled();
});
it("keeps a manual outcome while the agent holds a reservation and releases that reservation", async () => {
 initialize(); let late!: (value: any) => void; ai.tailorResume.mockReturnValueOnce(new Promise(resolve => { late = resolve; }));
 const cycle = request("/api/agent/run-cycle", "POST", {}); await vi.waitFor(() => expect(ai.tailorResume).toHaveBeenCalled());
 expect((await request("/api/applications", "POST", { jobId: "job-real" })).status).toBe(409);
 const recorded = await request("/api/applications/record", "POST", { jobId: "job-real", status: "Interview", reviewNotes: "My interview" }); expect(recorded.status).toBe(200);
 late({ id: "late-resume", jobId: "job-real" }); expect((await cycle).status).toBe(409); expect(fixture.db.getApplication(recorded.body.id)).toEqual(recorded.body); expect(fixture.db.getResumes()).toEqual([]); expect(fixture.db.getJob("job-real")!.processing?.state).toBe("complete"); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(0);
 const token = fixture.db.reserveStage("job-real"); fixture.db.releaseStage(token);
});
it("deduplicates concurrent staging requests without changing any history", async () => {
 initialize(); const responses = await Promise.all(Array.from({ length: 4 }, () => request("/api/applications", "POST", { jobId: "job-real" })));
 for (const response of responses) { expect(response.status).toBe(201); expect(response.body).toEqual(responses[0].body); }
 expect(fixture.db.getApplications()).toEqual([responses[0].body]); expect(fixture.db.getStatus().dailyApplicationsCount).toBe(1);
});
it("keeps a successful pause after a log write failure and an explicit retry", async () => {
  initialize(); const addLog = vi.spyOn(fixture.db, "addLog").mockImplementationOnce(() => { throw new Error("Injected log persistence failure"); });
  const first = await request("/api/agent/toggle-pause", "POST", { paused: true });
  expect(first.status).toBe(200); expect(first.body.warning).toContain("activity log could not be saved"); expect(first.body.status.isPaused).toBe(true); expect(first.body.settings.emergencyPause).toBe(true);
  const epoch = fixture.db.getPauseEpoch();
  const retry = await request("/api/agent/toggle-pause", "POST", { paused: true });
  expect(retry.status).toBe(200); expect(retry.body.warning).toBeUndefined(); expect(retry.body.status.isPaused).toBe(true); expect(retry.body.settings.emergencyPause).toBe(true); expect(fixture.db.getPauseEpoch()).toBe(epoch); expect(addLog).toHaveBeenCalledTimes(2);
  const afterRetry = fs.readFileSync(fixture.db.file, "utf8");
  expect((await request("/api/agent/toggle-pause", "POST", { paused: true })).body.isPaused).toBe(true); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(afterRetry);
  expect((await request("/api/agent/toggle-pause", "POST", { paused: false })).body.isPaused).toBe(false);
  const resumed = fs.readFileSync(fixture.db.file, "utf8"); expect((await request("/api/agent/toggle-pause", "POST", { paused: false })).body.isPaused).toBe(false); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(resumed);
});
for (const body of [{}, { paused: null }, { paused: "true" }, { paused: 1 }, { paused: true, toggle: true }]) it(`rejects ambiguous or invalid pause requests: ${JSON.stringify(body)}`, async () => {
  initialize(); const before = fs.readFileSync(fixture.db.file, "utf8"); expect((await request("/api/agent/toggle-pause", "POST", body)).status).toBe(400); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before);
});
it("leaves pause state unchanged when its initial persistence fails, allowing a safe retry", async () => {
  initialize(); const before = fs.readFileSync(fixture.db.file, "utf8"); vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("Pause write failure"); });
  expect((await request("/api/agent/toggle-pause", "POST", { paused: true })).status).toBe(500); expect(fixture.db.getStatus().isPaused).toBe(false); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before);
  expect((await request("/api/agent/toggle-pause", "POST", { paused: true })).body.status.isPaused).toBe(true);
});
for (const staged of [false, true]) it(`rejects returning a ${staged ? "staged" : "manually recorded unstaged"} Interview application to Ready to Apply without discarding notes`, async () => {
  initialize(); const app = staged ? (await request("/api/applications", "POST", { jobId: "job-real" })).body : (await request("/api/applications/record", "POST", { jobId: "job-real", status: "Interview", reviewNotes: "Original notes" })).body;
  if (staged) await request(`/api/applications/${app.id}`, "PUT", { status: "Interview" });
  const before = fs.readFileSync(fixture.db.file, "utf8");
  const response = await request(`/api/applications/${app.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Requested approval notes" });
  expect(response.status).toBe(409); expect(response.body.error).toContain("Cannot return an application with status Interview to staging"); expect(fs.readFileSync(fixture.db.file, "utf8")).toBe(before);
  expect(fixture.db.getStatus().dailyApplicationsCount).toBe(staged ? 1 : 0);
});
it("persists the requested status and notes on supported approval updates", async () => {
  initialize(); const app = (await request("/api/applications", "POST", { jobId: "job-real" })).body;
  const approved = await request(`/api/applications/${app.id}`, "PUT", { status: "Ready to Apply", reviewNotes: "Actual approval notes" });
  expect(approved.status).toBe(200); expect(approved.body.status).toBe("Ready to Apply"); expect(approved.body.reviewNotes).toBe("Actual approval notes");
  const notes = await request(`/api/applications/${app.id}`, "PUT", { reviewNotes: "Updated notes" }); expect(notes.status).toBe(200); expect(notes.body.reviewNotes).toBe("Updated notes");
});

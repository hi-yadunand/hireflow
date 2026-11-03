import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Database } from "../server/db.js";
import { createDemoData, DEFAULT_PROFILE } from "../server/demo.js";
import { stageJob } from "../server/processing-policy.js";
import { temporaryDb, realProfile, job } from "./fixtures.js";
const cleanups: (() => void)[] = [];
function setup(now?: () => Date) { const fixture = temporaryDb(now); cleanups.push(fixture.cleanup); return fixture; }
afterEach(() => { vi.restoreAllMocks(); cleanups.splice(0).forEach(f => f()); });
describe("data preservation and isolation", () => {
  it("starts with an empty real profile without creating a database on import/read", () => {
    const { db } = setup(); expect(db.getProfile().personal.fullName).toBe(""); expect(db.getProfile().skills).toEqual([]); expect(db.getJobs()).toEqual([]); expect(fs.existsSync(db.file)).toBe(false);
  });
  it("marks every preview record and never shares fixture references", () => {
    const demo = createDemoData();
    for (const key of ["jobs", "applications", "interviews", "logs", "connectors"] as const) expect(demo[key].every(r => r.isDemo)).toBe(true);
    demo.profile.skills.push("Mutated"); expect(createDemoData().profile.skills).not.toContain("Mutated");
  });
  it("never deletes real app-* applications or linked history/documents on demo cleanup", () => {
    const { db } = setup(); db.updateProfile(realProfile()); const j = db.addJob(job()); const app = stageJob(db, j);
    const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.jobs.push({ ...job("sample"), isDemo: true }); raw.applications.push({ ...app, id: "legacy-unknown", jobId: "sample" }); raw.resumes.push({ id: "preserve" }); raw.interviews.push({ id: "preserve-interview", applicationId: app.id });
    fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"); const reopened = new Database(db.file); reopened.clearDemoData();
    expect(fs.readFileSync(db.file, "utf8")).toBe(before); expect(reopened.getApplication(app.id)).toBeDefined(); expect(reopened.getApplications()).toHaveLength(1); expect(reopened.getResumes()).toHaveLength(1); expect(reopened.getInterviews()).toHaveLength(1);
  });
  it("backs up existing content once before the first write and preserves unknown fields", () => {
    const { db, dir } = setup(); db.updateProfile(realProfile()); const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.futureData = { keep: true }; fs.writeFileSync(db.file, JSON.stringify(raw));
    const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file); reopened.updateSettings({ matchThreshold: 85 }); reopened.updateSettings({ matchThreshold: 80 });
    const backups = fs.readdirSync(dir).filter(f => f.includes(".backup-")); expect(backups).toHaveLength(1); expect(fs.readFileSync(path.join(dir, backups[0]), "utf8")).toBe(before); expect(JSON.parse(fs.readFileSync(db.file, "utf8")).futureData).toEqual({ keep: true });
  });
  it("does not overwrite an unreadable or invalid database", () => {
    const { db } = setup(); fs.mkdirSync(path.dirname(db.file), { recursive: true }); fs.writeFileSync(db.file, "{broken"); expect(() => new Database(db.file)).toThrow(); expect(fs.readFileSync(db.file, "utf8")).toBe("{broken");
  });
  it("rejects an external file change and does not mutate memory", () => {
    const { db } = setup(); db.updateProfile(realProfile()); fs.appendFileSync(db.file, "\n"); expect(() => db.updateSettings({ matchThreshold: 99 })).toThrow("outside this process"); expect(db.getSettings().matchThreshold).toBe(75);
  });
  it("surfaces a failed atomic write and retains previous memory and disk", () => {
    const { db } = setup(); db.updateProfile(realProfile()); const before = fs.readFileSync(db.file, "utf8"); vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("Disk error"); });
    expect(() => db.updateSettings({ matchThreshold: 99 })).toThrow("Disk error"); expect(db.getSettings().matchThreshold).toBe(75); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
  });
  it("keeps original sample profile available without using it as the real profile", () => {
    const { db } = setup(); db.updateProfile(realProfile()); const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.profile = structuredClone(DEFAULT_PROFILE); fs.writeFileSync(db.file, JSON.stringify(raw));
    const reopened = new Database(db.file); expect(reopened.getProfile().skills).toEqual([]); expect(reopened.getProfile().legacyProfileAvailable).toBe(true); expect(reopened.getLegacyProfile().personal.fullName).toBe("Alex Rivera");
  });
  it("exposes no connected or successfully polled source", () => {
    const { db } = setup(); expect(db.getConnectors().every(c => c.connectionStatus === "Not implemented" && !c.discoverySupport && !c.applicationSupport && !c.isConfigured && c.lastSuccessfulCheck === null && c.requiredCredentials.startsWith("Not yet validated"))).toBe(true); expect(db.getStatus().nextScheduledRun).toBe(""); expect(db.getStatus().dailyApplicationsCount).toBe(0);
  });
});
describe("staging limits", () => {
  it("counts unique jobs, rejects concurrent reservations, and releases failed preparation", () => {
    const { db } = setup(); db.updateProfile(realProfile()); db.updateSettings({ dailyApplicationLimit: 1 }); const first = db.addJob(job()), second = db.addJob(job("second"));
    const token = db.reserveStage(first.id); expect(() => db.reserveStage(second.id)).toThrow("limit"); expect(() => db.reserveStage(first.id)).toThrow("already"); db.releaseStage(token);
    const app = stageJob(db, first); expect(db.getStatus().dailyApplicationsCount).toBe(1); expect(stageJob(db, first).id).toBe(app.id); expect(db.getApplications()).toHaveLength(1); expect(() => stageJob(db, second)).toThrow("limit");
  });
  it("persists usage across restarts and rolls over on UTC date change", () => {
    let date = new Date("2026-11-03T23:59:59Z"); const { db } = setup(() => date); db.updateProfile(realProfile()); db.updateSettings({ dailyApplicationLimit: 1 }); stageJob(db, db.addJob(job()));
    const reopened = new Database(db.file, () => date); expect(reopened.getStatus().dailyApplicationsCount).toBe(1); const second = reopened.addJob(job("second")); expect(() => stageJob(reopened, second)).toThrow("limit"); date = new Date("2026-11-04T00:00:00Z"); stageJob(reopened, second); expect(reopened.getStatus().dailyApplicationsCount).toBe(1);
  });
  it("does not admit an expired reservation across midnight", () => {
    let date = new Date("2026-11-03T23:59:59Z"); const { db } = setup(() => date); db.updateProfile(realProfile()); const j = db.addJob(job()); const token = db.reserveStage(j.id); date = new Date("2026-11-04T00:00:00Z"); expect(() => stageJob(db, j, {}, token)).toThrow("expired"); expect(db.getApplications()).toHaveLength(0);
  });
});
it("does not advertise an abandoned worker as running after restart", () => {
  const { db } = setup(); db.updateStatus({ workerState: "matching" }); const reopened = new Database(db.file); expect(reopened.getStatus().workerState).toBe("idle"); expect(reopened.getStatus().lastCycleRun).toBe("");
});
it("isolates exact legacy fixture copies and their linked edits without deleting stored records", () => {
  const { db } = setup(); db.updateProfile(realProfile()); const demo = createDemoData(); const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
  raw.jobs.push(...demo.jobs.map(({ isDemo, ...j }) => j)); raw.applications.push(...demo.applications.map(({ isDemo, ...a }) => a)); raw.interviews.push(...demo.interviews.map(({ isDemo, ...i }) => i)); raw.logs.push(...demo.logs.map(({ isDemo, ...l }) => l));
  raw.applications.push({ ...raw.applications[0], reviewNotes: "My real application; preserve" });
  fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file);
  expect(reopened.getJobs()).toHaveLength(0); expect(reopened.getApplications()).toHaveLength(0); expect(reopened.getInterviews()).toHaveLength(0); expect(reopened.getLogs()).toHaveLength(0); reopened.clearDemoData(); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
});
it("preserves the entire approved package across repeated and concurrent staging retries", async () => {
  const { db } = setup(); db.updateProfile(realProfile()); const listing = db.addJob(job());
  const original = stageJob(db, listing, { tailoredResumeId: "real-resume", coverLetterId: "real-letter", reviewNotes: "Keep notes", applicationAnswers: [{ question: "Q", suggestedAnswer: "A", confirmed: true }], timeline: [{ status: "Documents Generated", timestamp: "2026-11-03", message: "Real document history" }] });
  db.updateApplication(original.id, { status: "Ready to Apply" }, { status: "Ready to Apply", timestamp: "2026-11-03", message: "Candidate approved" });
  const before = db.getApplication(original.id)!;
  const retries = await Promise.all([1, 2, 3].map(async () => stageJob(db, listing, { timeline: [{ status: "Discovered", timestamp: "wrong", message: "Must not replace history" }], tailoredResumeId: "wrong-resume" })));
  for (const result of retries) expect(result).toEqual(before);
  expect(db.getApplication(original.id)).toEqual(before); expect(db.getStatus().dailyApplicationsCount).toBe(1);
});
it("isolates transitive demo relationships without changing any stored bytes", () => {
  const { db } = setup(); db.updateProfile(realProfile()); db.addJob(job());
  const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
  raw.jobs.push({ ...job("demo-parent"), isDemo: true });
  raw.applications.push({ id: "demo-child", jobId: "demo-parent", tailoredResumeId: "linked-res", coverLetterId: "linked-letter", timeline: [], status: "Applied" });
  raw.resumes.push({ id: "linked-res", jobId: "demo-parent" }); raw.coverLetters.push({ id: "linked-letter", jobId: "demo-parent" });
  raw.interviews.push({ id: "linked-interview", applicationId: "demo-child" }); raw.logs.push({ id: "linked-log", jobId: "demo-parent" });
  fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file);
  expect(reopened.getJobs().map(j => j.id)).toEqual(["job-real"]);
  expect(reopened.getApplications()).toEqual([]); expect(reopened.getResumes()).toEqual([]); expect(reopened.getCoverLetters()).toEqual([]); expect(reopened.getInterviews()).toEqual([]); expect(reopened.getLogs()).toEqual([]);
  reopened.clearDemoData(); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
});
it("follows demo document references back through applications and interviews", () => {
  const { db } = setup(); db.updateProfile(realProfile()); db.addJob(job());
  const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.resumes.push({ id: "tagged-doc", jobId: "job-real", isDemo: true }); raw.applications.push({ id: "app-linked", jobId: "job-real", tailoredResumeId: "tagged-doc" }); raw.interviews.push({ id: "interview-linked", applicationId: "app-linked" });
  fs.writeFileSync(db.file, JSON.stringify(raw)); const reopened = new Database(db.file); expect(reopened.getApplications()).toEqual([]); expect(reopened.getInterviews()).toEqual([]); expect(reopened.getJobs()).toEqual([]);
});
it("rejects stale profile saves even when two saves share the same clock timestamp", () => {
  const { db } = setup(() => new Date("2026-11-03T00:00:00Z")); const version = db.getProfile().revision!;
  db.updateProfile(realProfile(), version); expect(() => db.updateProfile(realProfile(), version)).toThrow("Profile changed");
});
it("isolates demo documents referenced only by legacy processing metadata, preserving unrelated ambiguous rows", () => {
 const { db } = setup(); db.updateProfile(realProfile()); db.addJob(job());
 const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.jobs[0].processing = { state: "resume_ready", resumeId: "demo-orphan-doc", coverLetterId: "legacy-letter" };
 raw.resumes.push({ id: "demo-orphan-doc", jobId: "missing-parent", isDemo: true }); raw.coverLetters.push({ id: "legacy-letter", jobId: "missing-parent" }); raw.interviews.push({ id: "ambiguous-unlinked", company: "Unknown" });
 fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file);
 expect(reopened.getJobs()).toEqual([]); expect(reopened.getResumes()).toEqual([]); expect(reopened.getCoverLetters()).toEqual([]); expect(reopened.getInterviews().map(i => i.id)).toEqual(["ambiguous-unlinked"]); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
});
it("excludes demo-linked staging usage from real analytics and quota without deleting ledger history", () => {
 const date = new Date("2026-11-03T12:00:00Z"), { db } = setup(() => date); db.updateProfile(realProfile()); db.addJob(job()); db.updateSettings({ dailyApplicationLimit: 1 });
 const raw = JSON.parse(fs.readFileSync(db.file, "utf8")); raw.jobs.push(job("demo-parent")); raw.applications.push({ id: "demo-child", jobId: "demo-parent", isDemo: true, timeline: [], status: "Applied" });
 raw.resumes.push({ id: "orphan-demo", jobId: "missing-demo-job", isDemo: true }); raw.stagingLedger = { day: "2026-11-03", jobIds: ["demo-parent", "missing-demo-job"] };
 fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file, () => date);
 expect(reopened.getStatus().dailyApplicationsCount).toBe(0); expect(reopened.getApplications()).toEqual([]); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
 expect(() => stageJob(reopened, reopened.getJob("job-real")!)).not.toThrow(); expect(reopened.getStatus().dailyApplicationsCount).toBe(1);
 const saved = JSON.parse(fs.readFileSync(db.file, "utf8")); expect(saved.stagingLedger.jobIds).toEqual(["demo-parent", "missing-demo-job", "job-real"]); expect(saved.applications.find((a: any) => a.id === "demo-child")).toEqual(raw.applications[0]);
});
it("propagates demo links through missing parent identifiers without modifying any stored records", () => {
  const date = new Date("2026-11-03T12:00:00Z"), { db } = setup(() => date); db.updateProfile(realProfile()); db.addJob(job());
  const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
  raw.applications.push({ id: "orphan-app", jobId: "missing-demo-job", status: "Interview", timeline: [] });
  raw.resumes.push({ id: "demo-orphan-resume", jobId: "missing-demo-job", isDemo: true });
  raw.coverLetters.push({ id: "orphan-letter", jobId: "missing-demo-job" });
  raw.interviews.push({ id: "orphan-interview", applicationId: "orphan-app" }, { id: "missing-app-interview", applicationId: "missing-demo-app" });
  raw.applications.push({ id: "linked-via-missing-resume", jobId: "another-job", tailoredResumeId: "missing-resume", timeline: [] });
  raw.jobs.push({ ...job("demo-with-missing-resume"), isDemo: true, processing: { state: "complete", resumeId: "missing-resume" } });
  raw.logs.push({ id: "orphan-log", jobId: "missing-demo-job" });
  // Interviews sharing a missing application must still share provenance.
  raw.interviews.push({ id: "demo-root-interview", applicationId: "missing-demo-app", isDemo: true });
  raw.stagingLedger = { day: "2026-11-03", jobIds: ["missing-demo-job", "another-job"] };
  fs.writeFileSync(db.file, JSON.stringify(raw)); const before = fs.readFileSync(db.file, "utf8"), reopened = new Database(db.file, () => date);
  expect(reopened.getJobs().map(j => j.id)).toEqual(["job-real"]); expect(reopened.getApplications()).toEqual([]); expect(reopened.getInterviews()).toEqual([]); expect(reopened.getResumes()).toEqual([]); expect(reopened.getCoverLetters()).toEqual([]); expect(reopened.getLogs()).toEqual([]); expect(reopened.getStatus().dailyApplicationsCount).toBe(0);
  reopened.clearDemoData(); expect(fs.readFileSync(db.file, "utf8")).toBe(before);
  reopened.updateSettings({ matchThreshold: 50 }); const saved = JSON.parse(fs.readFileSync(db.file, "utf8"));
  for (const collection of ["jobs", "applications", "interviews", "resumes", "coverLetters", "logs", "stagingLedger"]) expect(saved[collection]).toEqual(raw[collection]);
});
it("does not join unrelated legacy records through absent or invalid identifiers", () => {
  const { db } = setup(); db.updateProfile(realProfile()); const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
  raw.resumes.push({ id: "demo-without-parent", isDemo: true }); raw.applications.push({ id: "ambiguous-app", timeline: [] }); raw.coverLetters.push({ id: "ambiguous-letter" }); raw.interviews.push({ id: "ambiguous-interview", applicationId: "" });
  fs.writeFileSync(db.file, JSON.stringify(raw)); const reopened = new Database(db.file);
  expect(reopened.getApplications().map(a => a.id)).toEqual(["ambiguous-app"]); expect(reopened.getCoverLetters().map(l => l.id)).toEqual(["ambiguous-letter"]); expect(reopened.getInterviews().map(i => i.id)).toEqual(["ambiguous-interview"]); expect(reopened.getResumes()).toEqual([]);
});

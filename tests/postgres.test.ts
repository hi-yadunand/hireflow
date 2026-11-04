import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientBase } from "pg";
import { localRepository, LocalSqlPool } from "./postgres-fixtures.js";
import { fakeAI, realProfile, job, deferred } from "./fixtures.js";
import { PostgresRepository } from "../server/persistence/postgres.js";
import { migrate, verifyMigrationTarget } from "../server/persistence/migrate.js";
import { connectionConfig, databaseError } from "../server/persistence/config.js";
import { AgentEngine } from "../server/agent.js";
import { stageJob } from "../server/processing-policy.js";
import { createDemoData } from "../server/demo.js";
import { createApp } from "../server/app.js";
import { createServer } from "node:http";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(ready = true) {
  const f = await localRepository(); cleanups.push(() => f.db.close());
  if (ready) await f.db.write(db => { db.updateProfile(realProfile()); db.addJob(job()); });
  return { ...f, ai: fakeAI() };
}
async function api(db: PostgresRepository, ai = fakeAI(), aiTimeoutMs = 1000) {
  const server = createServer(createApp(db, ai, { aiTimeoutMs }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  return async (route: string, body?: unknown, method = "POST", demo = false) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { "Content-Type": "application/json", ...(demo ? { "X-HireFlow-Mode": "demo" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
}

describe("PostgreSQL migrations and configuration", () => {
  it("initializes once without jobs, applications, reviewed credentials or demo records", async () => {
    const { db, pool } = await setup(false);
    await db.verifyReady();
    const before = await db.read(s => s.snapshot()); await db.initialize();
    expect(await db.read(s => s.snapshot())).toEqual(before);
    expect(before.profile.personal.fullName).toBe(""); expect(before.profile.reviewedAt).toBeUndefined();
    for (const kind of ["jobs", "applications", "resumes", "coverLetters", "interviews", "logs"] as const) expect(before[kind]).toEqual([]);
    expect(before.connectors.every(c => !c.discoverySupport && !c.applicationSupport)).toBe(true);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.initialization_metadata")).rows[0].n).toBe(1);
    expect((await pool.raw("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='hireflow'")).rows[0].n).toBe(18);
  });
  it("uses the versioned runner and applies no migrations on a second run", async () => {
    const { pool } = await setup(false), c = await pool.connect();
    try { expect(await migrate(c as unknown as ClientBase)).toEqual([]); } finally { c.release(); }
    expect((await pool.raw("SELECT count(*)::int AS n FROM public.hireflow_migrations")).rows[0].n).toBe(1);
  });
  it("refuses to replace an unmanaged schema", async () => {
    const pool = await LocalSqlPool.create(); cleanups.push(() => pool.end());
    await pool.raw("CREATE SCHEMA hireflow; CREATE TABLE hireflow.untouched(id text); INSERT INTO hireflow.untouched VALUES('preserve')");
    const c = await pool.connect();
    try { await expect(migrate(c as unknown as ClientBase)).rejects.toThrow("unmanaged"); } finally { c.release(); }
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.untouched")).rows[0].n).toBe(1);
  });
  it("rolls back partially executed migration DDL and can safely retry", async () => {
    const pool = await LocalSqlPool.create(); cleanups.push(() => pool.end());
    const client = await pool.connect();
    const failing = { query: async (text: string, values?: any[]) => {
      const result = await client.query(text, values);
      if (text.includes("CREATE SCHEMA hireflow")) throw new Error("Fixture migration failure after DDL");
      return result;
    } };
    try { await expect(migrate(failing as unknown as ClientBase)).rejects.toThrow("Fixture migration failure"); } finally { client.release(); }
    expect((await pool.raw("SELECT to_regnamespace('hireflow') IS NULL AS absent")).rows[0].absent).toBe(true);
    expect((await pool.raw("SELECT count(*)::int AS n FROM public.hireflow_migrations")).rows[0].n).toBe(0);
    const retry = await pool.connect();
    try { expect(await migrate(retry as unknown as ClientBase)).toHaveLength(1); } finally { retry.release(); }
  });
  it("requires explicit URLs, direct migrations and matching targets without disclosing credentials", () => {
    const runtime = "postgres://test:DO_NOT_EXPOSE@host-pooler.neon.tech/neondb?sslmode=disable";
    const direct = "postgres://test:DO_NOT_EXPOSE@host.neon.tech/neondb";
    expect(() => connectionConfig("DATABASE_URL", {})).toThrow("DATABASE_URL is required");
    expect(() => connectionConfig("DATABASE_MIGRATION_URL", { DATABASE_MIGRATION_URL: runtime })).toThrow("direct connection");
    expect(() => connectionConfig("DATABASE_URL", { DATABASE_URL: runtime, NODE_ENV: "test" })).toThrow("local SQL double");
    expect(() => connectionConfig("DATABASE_MIGRATION_URL", { DATABASE_MIGRATION_URL: direct + "?host=other-pooler.neon.tech" })).toThrow("must not override");
    const c = connectionConfig("DATABASE_URL", { DATABASE_URL: runtime });
    expect(c.ssl).toEqual({ rejectUnauthorized: true }); expect(c.max).toBe(5); expect(c.connectionTimeoutMillis).toBe(10000);
    expect(new URL(c.connectionString!).searchParams.has("sslmode")).toBe(false);
    expect(() => verifyMigrationTarget({ DATABASE_URL: runtime, DATABASE_MIGRATION_URL: direct })).not.toThrow();
    expect(() => verifyMigrationTarget({ DATABASE_URL: runtime, DATABASE_MIGRATION_URL: direct + "2" })).toThrow("same PostgreSQL");
    expect(databaseError({ message: runtime, code: "secret" }).message).not.toContain("DO_NOT_EXPOSE");
  });
  it("fails without a ready schema and never falls back to JSON", async () => {
    const pool = await LocalSqlPool.create(), db = new PostgresRepository(pool); cleanups.push(() => db.close());
    await expect(db.verifyReady()).rejects.toThrow("schema is unavailable");
    await expect(db.write(s => s.addJob(job()))).rejects.toMatchObject({ status: 503 });
  });
});

describe("SQL units of work and integrity", () => {
  it("rolls back all changes and reservations when a command fails", async () => {
    const { db } = await setup(); const before = await db.read(s => s.snapshot());
    await expect(db.write(s => { s.reserveStage("job-real"); s.addJob(job("rollback")); s.updateSettings({ dailyApplicationLimit: 1 }); throw new Error("fixture failure"); })).rejects.toMatchObject({ status: 503 });
    expect(await db.read(s => s.snapshot())).toEqual(before); expect(await db.read(s => s.stageReservations())).toEqual([]);
    expect(await db.write(s => s.reserveStage("job-real"))).toBeTruthy();
  });
  it("rolls back writes already sent to SQL when a later foreign key fails", async () => {
    const { db } = await setup(), before = await db.read(s => s.snapshot());
    await expect(db.write(s => { s.addJob(job("rollback")); stageJob(s, s.getJob("job-real")!, { tailoredResumeId: "absent-resume" }); })).rejects.toMatchObject({ details: { code: "DB_INTEGRITY" } });
    expect(await db.read(s => s.snapshot())).toEqual(before);
  });
  it("rejects mutations during reads and async commands without persisting them", async () => {
    const { db } = await setup();
    await expect(db.read(s => s.addJob(job("bad")))).rejects.toThrow("Read-only");
    await expect(db.write(async () => "wrong")).rejects.toThrow("asynchronous");
    expect(await db.read(s => s.getJobs().map(j => j.id))).toEqual(["job-real"]);
  });
  it("preserves ordering and flexible date strings across re-reads", async () => {
    const { db, pool } = await setup();
    await db.write(s => { s.addJob({ ...job("second"), publicationDate: "yesterday", firstDetectedDate: "unknown" }); s.updateJob("job-real", { description: "Edited" }); });
    const other = new PostgresRepository(pool);
    expect(await other.read(s => s.getJobs().map(j => j.id))).toEqual(["second", "job-real"]);
    expect((await other.read(s => s.getJob("second")))?.publicationDate).toBe("yesterday");
  });
  it("soft deletes jobs without erasing document or provenance records", async () => {
    const { db, pool, ai } = await setup();
    const resume = await ai.tailorResume(realProfile(), job());
    await db.write(s => s.addResume(resume)); await db.write(s => s.deleteJob("job-real"));
    expect(await db.read(s => s.getJobs())).toEqual([]); expect(await db.read(s => s.getResumes())).toHaveLength(1);
    expect((await pool.raw("SELECT deleted_at IS NOT NULL AS deleted FROM hireflow.jobs")).rows[0].deleted).toBe(true);
  });
  it("serializes concurrent staging, enforces quota and preserves the entire approved record on retries", async () => {
    const { db, pool, ai } = await setup();
    await db.write(s => { s.addJob(job("second")); s.updateSettings({ dailyApplicationLimit: 1 }); });
    const results = await Promise.allSettled(["job-real", "second"].map(id => db.write(s => stageJob(s, s.getJob(id)!))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 429 } });
    let app = await db.read(s => s.getApplications()[0]);
    const target = await db.read(s => s.getJob(app.jobId)!);
    const resume = await ai.tailorResume(realProfile(), target), letter = await ai.generateCoverLetter(realProfile(), target);
    app = (await db.write(s => { s.addResume(resume); s.addCoverLetter(letter); return s.updateApplication(app.id, { status: "Ready to Apply", reviewNotes: "Approved after review", tailoredResumeId: resume.id, coverLetterId: letter.id, applicationAnswers: [{ question: "Q", suggestedAnswer: "A", confirmed: true }] }, { status: "Ready to Apply", timestamp: "2026-11-01", message: "Approved" }); }))!;
    const before = structuredClone(app);
    const retried = await Promise.all([db.write(s => stageJob(s, s.getJob(app.jobId)!)), db.write(s => stageJob(s, s.getJob(app.jobId)!))]);
    expect(retried).toEqual([before, before]); expect(await db.read(s => s.getApplications())).toEqual([before]);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.staging_usage")).rows[0].n).toBe(1);
    await expect(pool.raw("UPDATE hireflow.application_events SET payload='{}'::jsonb")).rejects.toThrow("append-only");
    await expect(pool.raw("DELETE FROM hireflow.application_events")).rejects.toThrow("append-only");
  });
  it("shares reservations across repository instances and releases expired/failed ownership", async () => {
    const { db, pool } = await setup(); const other = new PostgresRepository(pool);
    await db.write(s => { s.addJob(job("second")); s.updateSettings({ dailyApplicationLimit: 1 }); });
    const token = await db.write(s => s.reserveStage("job-real"));
    await expect(other.write(s => s.reserveStage("job-real"))).rejects.toMatchObject({ status: 409 });
    await expect(other.write(s => s.reserveStage("second"))).rejects.toMatchObject({ status: 429 });
    await other.write(s => s.releaseStage(token));
    const next = await other.write(s => s.reserveStage("second"));
    await pool.raw("UPDATE hireflow.staging_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE token=$1", [next]);
    await db.write(s => s.reserveStage("job-real"));
    expect((await pool.raw("SELECT state FROM hireflow.staging_reservations WHERE token=$1", [next])).rows[0].state).toBe("expired");
  });
  it("stores manual Interview history while paused without staging usage or a reviewed profile", async () => {
    const { db, pool } = await setup(false);
    const record = await db.write(s => { s.addJob(job()); s.setPaused(true); return s.recordManualApplication(job(), "Interview", { reviewNotes: "Manual history" }); });
    expect(record.stagedAt).toBeUndefined(); expect(record.status).toBe("Interview");
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.staging_usage")).rows[0].n).toBe(0);
    await expect(db.write(s => stageJob(s, s.getJob("job-real")!))).resolves.toEqual(record);
  });
  it("uses compare-and-swap profile revisions and immutable snapshots", async () => {
    const { db, pool } = await setup(); const version = await db.read(s => s.profileVersion());
    const results = await Promise.allSettled(["A", "B"].map(name => db.write(s => { const profile = realProfile(); profile.personal.fullName = name; return s.updateProfile(profile, version); })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.profile_snapshots WHERE kind='revision'")).rows[0].n).toBe(3);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.profile_snapshots WHERE kind='legacy'")).rows[0].n).toBe(1);
  });
});

describe("durable safety controls and AI", () => {
  it("fences old workers after rapid pause/resume and protects newer leases from stale cleanup", async () => {
    const { db, pool } = await setup(), other = new PostgresRepository(pool);
    const lease = await db.acquireCycle();
    await expect(other.acquireCycle()).rejects.toMatchObject({ status: 409 });
    await db.write(s => s.setPaused(true)); await other.write(s => s.setPaused(false));
    const newer = await other.acquireCycle();
    await expect(db.write(s => s.updateJob("job-real", { description: "stale" }), { lease })).rejects.toMatchObject({ details: { code: "AI_CANCELLED" } });
    await db.finishCycle(lease); await other.renewCycle(newer);
    expect((await pool.raw("SELECT token FROM hireflow.cycle_leases")).rows[0].token).toBe(newer.token);
    await other.finishCycle(newer);
  });
  it("rejects an expired lease and releases its reservation without blocking a replacement cycle", async () => {
    const { db, pool } = await setup(); const lease = await db.acquireCycle();
    await db.write(s => s.reserveStage("job-real"), { lease });
    await pool.raw("UPDATE hireflow.cycle_leases SET expires_at=clock_timestamp()-interval '1 second'");
    await expect(db.renewCycle(lease)).rejects.toThrow("expired");
    const next = await db.acquireCycle();
    const token = await db.write(s => s.reserveStage("job-real"), { lease: next });
    await db.finishCycle(lease);
    expect(await db.read(s => s.stageReservations().map(([id]) => id))).toEqual([token]);
    await db.finishCycle(next);
  });
  it("detects a rapid pause/resume committed by another repository instance", async () => {
    const { db, pool } = await setup(), other = new PostgresRepository(pool);
    const cancel = vi.fn(), epoch = await db.read(s => s.getPauseEpoch());
    const unsubscribe = db.onPause(cancel, epoch);
    try {
      await other.write(s => s.setPaused(true)); await other.write(s => s.setPaused(false));
      await vi.waitFor(() => expect(cancel).toHaveBeenCalled(), { timeout: 2000 });
      expect(await db.read(s => s.getStatus().isPaused)).toBe(false);
    } finally { unsubscribe(); }
  });
  it("does not let a concurrent manual staging request duplicate an agent reservation", async () => {
    const { db, pool, ai } = await setup(), other = new PostgresRepository(pool);
    const original = ai.tailorResume.getMockImplementation()!;
    ai.tailorResume.mockImplementationOnce(async (...args) => {
      await expect(other.write(s => stageJob(s, s.getJob("job-real")!))).rejects.toMatchObject({ status: 409 });
      return original(...args);
    });
    expect(await new AgentEngine(db, ai).runCycle()).toMatchObject({ processedCount: 1, success: true });
    expect(await db.read(s => s.getApplications())).toHaveLength(1);
    expect(await db.read(s => s.getStatus().dailyApplicationsCount)).toBe(1);
  });
  it("commits an idempotent pause even if logging fails and a user retries", async () => {
    const { db, pool } = await setup(), engine = new AgentEngine(db);
    await pool.raw("CREATE FUNCTION hireflow.fail_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture log failure'; END $$; CREATE TRIGGER fail_log BEFORE INSERT ON hireflow.agent_logs FOR EACH ROW EXECUTE FUNCTION hireflow.fail_log()");
    const first = await engine.setPaused(true); const again = await engine.setPaused(true);
    expect(first).toMatchObject({ isPaused: true, warning: expect.any(String) }); expect(again.isPaused).toBe(true);
    expect(await db.read(s => s.getPauseEpoch())).toBe(1); expect(await db.read(s => s.getSettings().emergencyPause)).toBe(true);
  });
  it("keeps AI outside transactions and completes a durable processing cycle", async () => {
    const { db, pool, ai } = await setup();
    const normal = ai.analyzeJobMatch.getMockImplementation()!;
    ai.analyzeJobMatch.mockImplementation(async (...args) => { expect(pool.active).toBe(0); return normal(...args); });
    expect(await new AgentEngine(db, ai).runCycle()).toMatchObject({ processedCount: 1, discoveredCount: 0, success: true });
    expect(await db.read(s => s.getApplications())).toHaveLength(1);
    expect(await db.read(s => s.getStatus())).toMatchObject({ dailyApplicationsCount: 1, workerState: "idle" });
    expect((await pool.raw("SELECT state FROM hireflow.staging_reservations")).rows[0].state).toBe("consumed");
  });
  it("times out a stalled request, releases ownership and ignores results arriving in a later cycle", async () => {
    const { db, ai } = await setup(); const late = deferred<Awaited<ReturnType<typeof ai.tailorResume>>>();
    ai.tailorResume.mockReturnValueOnce(late.promise); const engine = new AgentEngine(db, ai, 30);
    expect(await engine.runCycle()).toMatchObject({ success: false, processedCount: 0 });
    expect(await db.read(s => s.stageReservations())).toEqual([]);
    expect(await engine.runCycle()).toMatchObject({ success: true, processedCount: 1 });
    const before = await db.read(s => s.snapshot());
    late.resolve({ ...(await fakeAI().tailorResume(realProfile(), job())), id: "late-document" });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(await db.read(s => s.snapshot())).toEqual(before);
  });
  it("reconsiders threshold changes without repeating an unchanged Gemini evaluation", async () => {
    const { db, ai } = await setup(); const analysis = await ai.analyzeJobMatch(realProfile(), job()); ai.analyzeJobMatch.mockClear(); ai.analyzeJobMatch.mockResolvedValue({ ...analysis, matchPercentage: 60 });
    const engine = new AgentEngine(db, ai); await engine.runCycle();
    await db.write(s => s.updateSettings({ matchThreshold: 50 }));
    expect(await engine.runCycle()).toMatchObject({ processedCount: 1 }); expect(ai.analyzeJobMatch).toHaveBeenCalledTimes(1);
  });
  it("prevents profile-stale document writes and recovers on retry", async () => {
    const { db, ai } = await setup(), normal = ai.tailorResume.getMockImplementation()!;
    ai.tailorResume.mockImplementationOnce(async (...args) => { await db.write(s => s.updateProfile(realProfile())); return normal(...args); });
    const engine = new AgentEngine(db, ai);
    expect(await engine.runCycle()).toMatchObject({ success: false }); expect(await db.read(s => s.getResumes())).toEqual([]);
    expect(await engine.runCycle()).toMatchObject({ processedCount: 1 });
  });
  it("preserves concurrent manual history instead of staging or saving stale documents", async () => {
    const { db, ai } = await setup(), normal = ai.tailorResume.getMockImplementation()!;
    ai.tailorResume.mockImplementationOnce(async (...args) => { await db.write(s => s.recordManualApplication(s.getJob("job-real")!, "Interview", { reviewNotes: "Recorded during AI" })); return normal(...args); });
    expect(await new AgentEngine(db, ai).runCycle()).toMatchObject({ processedCount: 0 });
    expect(await db.read(s => s.getApplications())).toEqual([expect.objectContaining({ status: "Interview", reviewNotes: "Recorded during AI" })]);
    expect(await db.read(s => s.getStatus().dailyApplicationsCount)).toBe(0); expect(await db.read(s => s.getResumes())).toEqual([]);
  });
});

describe("SQL API and demo isolation", () => {
  it("persists orphan provenance identifiers without inventing parent records", async () => {
    const { db, pool, ai } = await setup();
    const demo = createDemoData(), resume = { ...(await ai.tailorResume(realProfile(), job())), id: "orphan-resume", jobId: "missing-job", isDemo: true };
    const interview = { ...demo.interviews[0], id: "orphan-interview", applicationId: "missing-app", isDemo: false };
    const otherInterview = { ...interview, id: "root-interview", isDemo: true };
    await pool.raw("INSERT INTO hireflow.resumes(id,job_id,original_job_id,payload) VALUES($1,NULL,$2,$3::jsonb)", [resume.id, resume.jobId, JSON.stringify(resume)]);
    for (const i of [interview, otherInterview]) await pool.raw("INSERT INTO hireflow.interviews(id,original_application_id,payload) VALUES($1,$2,$3::jsonb)", [i.id, i.applicationId, JSON.stringify(i)]);
    await db.write(s => s.addLog({ category: "system", severity: "info", message: "Fixture", jobId: "missing-job" }));
    expect(await db.read(s => s.getResumes())).toEqual([]); expect(await db.read(s => s.getInterviews())).toEqual([]); expect(await db.read(s => s.getLogs())).toEqual([]);
    const nodes = (await pool.raw("SELECT * FROM hireflow.provenance_nodes WHERE NOT record_present")).rows;
    expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "jobs", external_id: "missing-job", demo_linked: true }), expect.objectContaining({ kind: "applications", external_id: "missing-app", demo_linked: true })]));
    expect(await db.read(s => s.clearDemoData())).toHaveProperty("success", true);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.interviews")).rows[0].n).toBe(2);
  });
  it("excludes the complete demo-linked graph from real views, quota and analytics without deletion", async () => {
    const { db, pool } = await setup();
    const app = await db.write(s => stageJob(s, s.getJob("job-real")!));
    await pool.raw("UPDATE hireflow.applications SET payload=payload || '{\"isDemo\":true}'::jsonb WHERE id=$1", [app.id]);
    expect(await db.read(s => s.getApplications())).toEqual([]); expect(await db.read(s => s.getJobs())).toEqual([]); expect(await db.read(s => s.getStatus().dailyApplicationsCount)).toBe(0);
    await db.write(s => s.clearDemoData());
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.applications")).rows[0].n).toBe(1);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.staging_usage")).rows[0].n).toBe(1);
  });
  it("does not count demo-linked held reservations against real staging quota", async () => {
    const { db, pool } = await setup();
    await db.write(s => { s.updateSettings({ dailyApplicationLimit: 1 }); s.addJob(job("real-second")); s.reserveStage("job-real"); });
    await pool.raw("UPDATE hireflow.jobs SET payload=payload || '{\"isDemo\":true}'::jsonb WHERE id='job-real'");
    expect(await db.write(s => s.reserveStage("real-second"))).toBeTruthy();
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.staging_reservations WHERE state='held'")).rows[0].n).toBe(2);
    await expect(db.write(s => s.reserveStage("job-real"))).rejects.toMatchObject({ status: 404 });
  });
  it("does not resurrect a soft-deleted ID or falsely return success", async () => {
    const { db, pool } = await setup();
    await db.write(s => s.deleteJob("job-real"));
    await expect(db.write(s => s.addJob(job()))).rejects.toMatchObject({ status: 409 });
    expect(await db.read(s => s.getJobs())).toEqual([]);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.jobs")).rows[0].n).toBe(1);
  });
  it("rolls back a failed API update instead of sending success before commit", async () => {
    const { db, pool } = await setup(); const request = await api(db);
    await pool.raw("CREATE FUNCTION hireflow.fail_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'secret fixture'; END $$; CREATE TRIGGER fail_job BEFORE UPDATE ON hireflow.jobs FOR EACH ROW EXECUTE FUNCTION hireflow.fail_job()");
    const response = await request("/jobs/job-real", { description: "Changed" }, "PUT");
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("secret fixture"); expect((await db.read(s => s.getJob("job-real")))?.description).toBe("TypeScript engineering");
  });
  it("returns an error on COMMIT failure and releases the connection after rollback", async () => {
    const { db, pool } = await setup(), request = await api(db), connect = pool.connect.bind(pool);
    const release = vi.fn();
    vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await connect();
      return { query: async (text, values) => {
        if (text === "COMMIT") throw Object.assign(new Error("credential-bearing driver error"), { code: "08006" });
        return client.query(text, values);
      }, release: destroyed => { release(destroyed); client.release(destroyed); } };
    });
    const result = await request("/jobs/job-real", { description: "Should roll back" }, "PUT");
    expect(result.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("credential-bearing"); expect(release).toHaveBeenCalled();
    expect((await db.read(s => s.getJob("job-real")))?.description).toBe("TypeScript engineering");
  });
  it("cancels interview preparation across pause/resume and never persists a late result", async () => {
    const { db, ai } = await setup(), preview = createDemoData().interviews[0];
    const interview = await db.write(s => s.addInterview({ ...preview, id: "real-interview", applicationId: undefined, isDemo: false, aiPrepQuestions: [], talkingPoints: [] }));
    const pending = deferred<Awaited<ReturnType<typeof ai.generateInterviewPrep>>>(); ai.generateInterviewPrep.mockReturnValueOnce(pending.promise);
    const request = await api(db, ai); const response = request(`/interviews/${interview.id}/generate-prep`, {});
    await vi.waitFor(() => expect(ai.generateInterviewPrep).toHaveBeenCalled());
    await db.write(s => s.setPaused(true)); await db.write(s => s.setPaused(false));
    pending.resolve({ questions: ["late"], talkingPoints: ["late"], companyInsights: "", pitfallsToAvoid: [] });
    expect((await response).status).toBe(409); expect((await db.read(s => s.getInterviews()[0])).aiPrepQuestions).toEqual([]);
  });
  it("rejects terminal restaging, allows notes, and keeps demo/real APIs isolated", async () => {
    const { db } = await setup(), request = await api(db);
    const recorded = await request("/applications/record", { jobId: "job-real", status: "Interview", reviewNotes: "Keep" });
    expect(recorded.status).toBe(200);
    const bad = await request(`/applications/${recorded.body.id}`, { status: "Ready to Apply", reviewNotes: "Discarded?" }, "PUT"); expect(bad.status).toBe(409);
    expect((await request(`/applications/${recorded.body.id}`, { reviewNotes: "Updated" }, "PUT")).body.reviewNotes).toBe("Updated");
    expect((await request("/applications", { jobId: "job-real" }, "POST", true)).status).toBe(403);
    expect((await request("/applications", undefined, "GET")).body).toEqual([expect.objectContaining({ status: "Interview", reviewNotes: "Updated" })]);
  });
});

describe("profile highlights: API save, SQL reload and refresh", () => {
  function editableProfile(highlights: unknown) {
    return { ...realProfile(), skills: [],
      experience: [{ id: "internship", company: "Test employer", role: "Intern", location: "", type: "Internship" as const, startDate: "2025-06", endDate: "2025-08", current: false, description: "", highlights: highlights as string[] }],
      projects: [{ id: "project", title: "Test project", description: "", technologies: [], highlights: highlights as string[] }],
    };
  }
  it("saves optional highlights as JSONB arrays and reloads them through a fresh app/repository", async () => {
    const { db, pool } = await setup(false), request = await api(db);
    // No reviewed profile or optional section is required merely to save a profile.
    let current = (await request("/profile", undefined, "GET")).body;
    const empty = await request("/profile", { ...realProfile(), skills: [], expectedVersion: current.revision, confirmAccuracy: true }, "PUT");
    expect(empty.status).toBe(200);
    for (const key of ["skills", "experience", "education", "projects", "certifications", "languages"]) expect(empty.body[key]).toEqual([]);
    current = empty.body;
    const refresh = await api(new PostgresRepository(pool));
    for (const value of [undefined, null, [], [""], [" ", "\t"], ["", "Completed a user-entered task", "  Exact original wording  "]]) {
      const profile = editableProfile(value), untouched = structuredClone(profile);
      const response = await request("/profile", { ...profile, expectedVersion: current.revision, confirmAccuracy: true }, "PUT");
      expect(response.status).toBe(200);
      const expected = Array.isArray(value) ? value.filter(text => text.trim().length) : [];
      expect(response.body.experience[0]).toMatchObject({ id: "internship", highlights: expected });
      expect(response.body.projects[0]).toMatchObject({ id: "project", highlights: expected });
      const stored = (await pool.raw("SELECT payload,revision FROM hireflow.profiles")).rows[0];
      expect(stored.payload.experience[0].highlights).toEqual(expected); expect(stored.payload.projects[0].highlights).toEqual(expected);
      expect(stored.revision).toBe(response.body.revision);
      expect((await pool.raw("SELECT payload FROM hireflow.profile_snapshots WHERE revision=$1", [stored.revision])).rows[0].payload).toEqual(stored.payload);
      // HTTP reload through another app instance; no frontend or repository cache is reused.
      expect((await refresh("/profile", undefined, "GET")).body).toEqual(response.body);
      expect(await new PostgresRepository(pool).read(s => s.getProfile())).toEqual(response.body);
      expect(profile).toEqual(untouched); current = response.body;
    }
  });
  it("reads legacy missing/null highlights safely without rewriting records, then persists reviewed arrays", async () => {
    const { db, pool } = await setup(false);
    await db.write(s => s.updateProfile(editableProfile([])));
    const request = await api(new PostgresRepository(pool));
    for (const value of [undefined, null]) {
      const raw = (await pool.raw("SELECT payload FROM hireflow.profiles")).rows[0].payload;
      for (const entry of [raw.experience[0], raw.projects[0]]) {
        if (value === undefined) delete entry.highlights; else entry.highlights = value;
      }
      await pool.raw("UPDATE hireflow.profiles SET payload=$1::jsonb", [JSON.stringify(raw)]);
      const response = await request("/profile", undefined, "GET"); expect(response.status).toBe(200);
      expect(response.body.experience[0].highlights).toEqual([]); expect(response.body.projects[0].highlights).toEqual([]);
      expect((await pool.raw("SELECT payload FROM hireflow.profiles")).rows[0].payload).toEqual(raw);
      const saved = await request("/profile", { ...response.body, expectedVersion: response.body.revision, confirmAccuracy: true }, "PUT");
      expect(saved.status).toBe(200);
      const stored = (await pool.raw("SELECT payload FROM hireflow.profiles")).rows[0].payload;
      expect(stored.experience[0].highlights).toEqual([]); expect(stored.projects[0].highlights).toEqual([]);
      expect((await request("/profile", undefined, "GET")).body).toEqual(saved.body);
    }
  });
  it("keeps validation and revisions intact when required fields or highlight types are invalid", async () => {
    const { db, pool } = await setup(false), request = await api(db), before = (await request("/profile", undefined, "GET")).body;
    const cases = [editableProfile(123), editableProfile([null]), { ...editableProfile([]), experience: [{ ...editableProfile([]).experience[0], company: "" }] }];
    for (const input of cases) {
      const response = await request("/profile", { ...input, expectedVersion: before.revision, confirmAccuracy: true }, "PUT");
      expect(response.status).toBe(400); expect(response.body.error).toMatch(/highlights must be an array of strings|company must be a nonempty string/);
    }
    expect((await request("/profile", undefined, "GET")).body).toEqual(before);
    expect((await pool.raw("SELECT count(*)::int AS n FROM hireflow.profile_snapshots")).rows[0].n).toBe(1);
  });
});

it("persists a complete imported profile only after review and confirmation, and reloads all fields", async () => {
 const { importedResume, masterResumeText } = await import("./resume-fixture.js"), { mergeProfileImport } = await import("../src/lib/profile-import.js");
 const { db, pool, ai } = await setup(false), request = await api(db, ai);
 ai.parseResumeText.mockResolvedValueOnce(importedResume());
 const before = (await request("/profile", undefined, "GET")).body;
 const extracted = await request("/profile/upload-resume", { rawText: masterResumeText }); expect(extracted.status).toBe(200); expect(extracted.body.reviewRequired).toBe(true);
 expect(await db.read(s => s.getProfile())).toEqual(before);
 const mapped = mergeProfileImport(before, extracted.body.parsed); expect(mapped.conflicts).toEqual([]);
 expect((await request("/profile", { ...mapped.profile, expectedVersion: before.revision, confirmAccuracy: false }, "PUT")).status).toBe(400);
 const saved = await request("/profile", { ...mapped.profile, expectedVersion: before.revision, confirmAccuracy: true }, "PUT"); expect(saved.status).toBe(200);
 expect(saved.body).toMatchObject({ personal: { email: "candidate@example.test", otherLinks: ["https://peerlist.io/example"] }, professionalHighlights: ["Team Lead award"], preferences: { preferredLocations: ["Example City"], noticePeriod: "30 days" } });
 expect(saved.body.projects[0].highlights).toEqual(["Implemented the interface."]); expect(saved.body.education[0].achievements).toEqual(["Research award"]); expect(saved.body.certifications[0].name).toBe("Example Certificate"); expect(saved.body.reviewedAt).toBeTruthy(); expect(saved.body.revision).not.toBe(before.revision);
 const refreshed = await api(new PostgresRepository(pool)); expect((await refreshed("/profile", undefined, "GET")).body).toEqual(saved.body);
 const stored = (await pool.raw("SELECT payload FROM hireflow.profiles")).rows[0].payload;
 expect(stored).not.toHaveProperty("importWarnings"); expect(stored).not.toHaveProperty("rawResumeText");
 expect((await pool.raw("SELECT payload FROM hireflow.profile_snapshots WHERE revision=$1", [saved.body.revision])).rows[0].payload).toEqual(stored);
 // A subsequent failed save must not replace the previously reviewed profile or snapshot.
 await pool.raw("CREATE FUNCTION hireflow.reject_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private fixture diagnostics'; END $$; CREATE TRIGGER reject_profile BEFORE UPDATE ON hireflow.profiles FOR EACH ROW EXECUTE FUNCTION hireflow.reject_profile()");
 const failure = await request("/profile", { ...saved.body, personal: { ...saved.body.personal, fullName: "Unsaved edit" }, expectedVersion: saved.body.revision, confirmAccuracy: true }, "PUT");
 expect(failure.status).toBe(503); expect(JSON.stringify(failure.body)).not.toContain("private fixture diagnostics"); expect((await refreshed("/profile", undefined, "GET")).body).toEqual(saved.body);
});

import { AI_TIMEOUT_MS, runAiOperation } from "./ai-operation.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { Database } from "./db.js";
import { createDemoData } from "./demo.js";
import { AgentEngine, type AIService } from "./agent.js";
import * as gemini from "./gemini.js";
import { checkPause, processingCheckpoint, stageJob, checkJobSnapshot } from "./processing-policy.js";
import { SafetyError, object, string, strings, integer, choice, noProtectedFields, validateProfile } from "./validation.js";
import type { ApplicationStatus, AppSettings, Job, JobSource } from "../src/types/index.js";
const statuses: ApplicationStatus[] = ["Discovered", "Analysing", "Documents Generated", "Awaiting Approval", "Ready to Apply", "Applying", "Applied", "Submission Unverified", "Interview", "Rejected", "Expired"];
const sources: JobSource[] = ["LinkedIn", "Indeed", "Glassdoor", "Naukri", "Wellfound", "Peerlist", "Himalayas", "ZipRecruiter", "Greenhouse", "Lever", "Ashby", "Workday", "SmartRecruiters", "Direct Career Page"];
const handled = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => fn(req, res)).catch(next);
const required = <T>(value: T | undefined, label: string): T => { if (!value) throw new SafetyError(`${label} not found`, 404); return value; };
function allowed(body: Record<string, any>, keys: string[]) {
  for (const key of Object.keys(body)) if (!keys.includes(key)) throw new SafetyError(`Unsupported field: ${key}`);
}
export function createApp(db: Database, ai: AIService = gemini, options: { aiTimeoutMs?: number } = {}) {
  const app = express(), engine = new AgentEngine(db, ai, options.aiTimeoutMs ?? AI_TIMEOUT_MS);
  let demo = createDemoData();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const closed = () => { if (!res.writableEnded) cancel(); };
    req.on("aborted", cancel); res.on("close", closed);
    res.on("finish", () => { req.off("aborted", cancel); res.off("close", closed); });
    res.locals.signal = controller.signal; next();
  });
  const invoke = <T>(res: Response, work: (signal: AbortSignal) => Promise<T>) => runAiOperation(work, { signal: res.locals.signal, timeoutMs: options.aiTimeoutMs, subscribeCancel: cancel => db.onPause(cancel) });
  app.use("/api", (req, res, next) => {
    if (req.header("X-HireFlow-Mode") === "demo" && req.method !== "GET" && req.path !== "/demo/clear") return next(new SafetyError("Demo mode is read-only. Switch to real data to make changes.", 403));
    if (req.header("X-HireFlow-Mode") !== "demo" || req.path === "/demo/clear") return next();
    const data: Record<string, unknown> = { "/profile": demo.profile, "/jobs": demo.jobs, "/connectors": demo.connectors, "/applications": demo.applications, "/resumes": demo.resumes, "/cover-letters": demo.coverLetters, "/interviews": demo.interviews, "/agent/status": demo.status, "/agent/logs": demo.logs, "/settings": demo.settings };
    if (req.path in data) return res.json(data[req.path]);
    return res.status(404).json({ error: "This operation is not available in demo preview" });
  });
  const get = (route: string, fn: (req: Request, res: Response) => unknown) => app.get(route, handled(fn));
  const post = (route: string, fn: (req: Request, res: Response) => unknown) => app.post(route, handled(fn));
  const put = (route: string, fn: (req: Request, res: Response) => unknown) => app.put(route, handled(fn));
  get("/api/profile", (_req, res) => res.json(db.getProfile()));
  get("/api/profile/legacy", (_req, res) => res.json({ profile: db.getLegacyProfile(), warning: "Unverified legacy data. Review every field before using it." }));
  put("/api/profile", (req, res) => {
    const body = object(req.body);
    if (body.confirmAccuracy !== true) throw new SafetyError("Confirm that you reviewed the profile for accuracy before saving", 400);
    const { confirmAccuracy: _, expectedVersion, ...fields } = body;
    const version = string(expectedVersion, "expectedVersion");
    res.json(db.updateProfile(validateProfile(fields), version));
  });
  post("/api/profile/upload-resume", async (req, res) => {
    checkPause(db);
    const pauseEpoch = db.getPauseEpoch();
    const rawText = string(req.body?.rawText, "rawText");
    const parsed = await invoke(res, signal => ai.parseResumeText(rawText, db.getSettings().geminiModel, signal));
    checkPause(db); if (db.getPauseEpoch() !== pauseEpoch) throw new SafetyError("Parsing was interrupted by emergency pause; retry", 409); res.json({ success: true, parsed });
  });
  get("/api/jobs", (req, res) => {
    let jobs = db.getJobs();
    const { search, source, workplaceType, minMatch } = req.query;
    if (typeof search === "string") jobs = jobs.filter(j => [j.company, j.position, j.description, j.location].some(t => t?.toLowerCase().includes(search.toLowerCase())));
    if (typeof source === "string" && source !== "all") jobs = jobs.filter(j => j.source.toLowerCase() === source.toLowerCase());
    if (typeof workplaceType === "string" && workplaceType !== "all") jobs = jobs.filter(j => j.workplaceType.toLowerCase() === workplaceType.toLowerCase());
    if (minMatch !== undefined) { const n = integer(Number(minMatch), "minMatch", 0, 100); jobs = jobs.filter(j => j.matchPercentage >= n); }
    res.json(jobs);
  });
  function jobFields(value: unknown): Omit<Job, "id" | "publicationDate" | "firstDetectedDate" | "matchPercentage" | "matchingSkills" | "missingSkills" | "applicationStatus"> {
    const b = object(value); noProtectedFields(b);
    allowed(b, ["company", "position", "location", "country", "employmentType", "workplaceType", "salary", "experienceLevel", "source", "applyUrl", "description", "requirements", "niceToHave"]);
    const applyUrl = string(b.applyUrl, "applyUrl");
    let url: URL; try { url = new URL(applyUrl); } catch { throw new SafetyError("Application URL must be a valid HTTP(S) URL"); }
    if (!["https:", "http:"].includes(url.protocol)) throw new SafetyError("Application URL must use HTTP(S)");
    return { company: string(b.company, "company"), position: string(b.position, "position"), location: string(b.location, "location", true), country: string(b.country, "country", true), employmentType: choice(b.employmentType, ["Full-time", "Contract", "Part-time", "Internship"] as const, "employment type"), workplaceType: choice(b.workplaceType, ["Remote", "Hybrid", "On-site"] as const, "workplace type"), salary: b.salary === undefined ? undefined : string(b.salary, "salary", true), experienceLevel: choice(b.experienceLevel, ["Entry", "Mid", "Senior", "Lead", "Executive"] as const, "experience level"), source: choice(b.source, sources, "source"), applyUrl, description: string(b.description, "description"), requirements: strings(b.requirements, "requirements"), niceToHave: strings(b.niceToHave, "niceToHave") };
  }
  post("/api/jobs", (req, res) => {
    const fields = jobFields(req.body);
    res.status(201).json(db.addJob({ ...fields, id: `job-${randomUUID()}`, publicationDate: new Date().toISOString(), firstDetectedDate: new Date().toISOString(), matchPercentage: 0, matchingSkills: [], missingSkills: [], applicationStatus: "Discovered", processing: { state: "pending" } }));
  });
  get("/api/jobs/:id", (req, res) => res.json(required(db.getJob(req.params.id), "Job")));
  put("/api/jobs/:id", (req, res) => {
    const current = required(db.getJob(req.params.id), "Job");
    const body = object(req.body); noProtectedFields(body);
    allowed(body, ["company", "position", "location", "country", "employmentType", "workplaceType", "salary", "experienceLevel", "source", "applyUrl", "description", "requirements", "niceToHave"]);
    const editable = Object.fromEntries(["company", "position", "location", "country", "employmentType", "workplaceType", "salary", "experienceLevel", "source", "applyUrl", "description", "requirements", "niceToHave"].map(key => [key, current[key as keyof Job]]));
    res.json(db.updateJob(current.id, { ...jobFields({ ...editable, ...body }), processing: { state: "pending" } }));
  });
  app.delete("/api/jobs/:id", handled((req, res) => { if (!db.deleteJob(req.params.id)) throw new SafetyError("Job not found", 404); res.json({ success: true }); }));
  for (const operation of ["analyze", "tailor-resume", "generate-cover-letter"] as const) {
    post(`/api/jobs/:id/${operation}`, async (req, res) => {
      processingCheckpoint(db);
      const job = required(db.getJob(req.params.id), "Job"), profile = db.getProfile(), model = db.getSettings().geminiModel;
      const pauseEpoch = db.getPauseEpoch(), version = db.profileVersion();
      const checkpoint = () => {
        processingCheckpoint(db, version, pauseEpoch); checkJobSnapshot(db, job);
        if (res.locals.signal.aborted) throw new SafetyError("Processing request cancelled", 409);
        if (db.getSettings().geminiModel !== model) throw new SafetyError("Gemini model changed during processing; retry", 409);
      };
      if (operation === "analyze") {
        const analysis = await invoke(res, signal => ai.analyzeJobMatch(profile, job, model, signal)); checkpoint();
        res.json({ success: true, analysis, job: db.updateJob(job.id, { ...analysis, processing: { state: "matched", profileVersion: version, model } }) });
      } else if (operation === "tailor-resume") {
        const tailoredResume = await invoke(res, signal => ai.tailorResume(profile, job, model, signal)); checkpoint(); db.addResume(tailoredResume); res.json({ success: true, tailoredResume });
      } else {
        const tone = req.body?.tone === undefined ? "professional" : choice(req.body.tone, ["professional", "assertive", "conversational"] as const, "tone");
        const coverLetter = await invoke(res, signal => ai.generateCoverLetter(profile, job, tone, model, signal)); checkpoint(); db.addCoverLetter(coverLetter); res.json({ success: true, coverLetter });
      }
    });
  }
  get("/api/connectors", (_req, res) => res.json(db.getConnectors()));
  put("/api/connectors/:id", (req, res) => {
    const b = object(req.body); allowed(b, ["configuredPollingIntervalMinutes"]);
    res.json(required(db.updateConnector(req.params.id, { configuredPollingIntervalMinutes: integer(b.configuredPollingIntervalMinutes, "polling interval", 5, 720) }), "Connector"));
  });
  get("/api/applications", (_req, res) => res.json(db.getApplications()));
  post("/api/applications", (req, res) => {
    const b = object(req.body); noProtectedFields(b);
    allowed(b, ["jobId", "company", "position", "location", "source", "applyUrl", "status", "applicationMode", "matchPercentage"]);
    if (b.status && !["Awaiting Approval", "Ready to Apply", "Discovered"].includes(b.status)) throw new SafetyError("New records can only be staged; submission is not implemented");
    const job = required(db.getJob(string(b.jobId, "jobId")), "Job");
    res.status(201).json(stageJob(db, job, { timeline: [{ status: "Discovered", timestamp: new Date().toISOString(), message: "Application package staged locally. Nothing has been submitted." }] }));
  });
  function applicationEdits(b: Record<string, any>) {
    const answers = b.applicationAnswers === undefined ? undefined : (() => {
      if (!Array.isArray(b.applicationAnswers)) throw new SafetyError("Application answers must be an array");
      return b.applicationAnswers.map(a => { object(a); if (typeof a.confirmed !== "boolean") throw new SafetyError("Answer confirmation must be boolean"); return { question: string(a.question, "question"), suggestedAnswer: string(a.suggestedAnswer, "answer", true), confirmed: a.confirmed }; });
    })();
    return { ...(b.reviewNotes === undefined ? {} : { reviewNotes: string(b.reviewNotes, "reviewNotes", true) }), ...(answers === undefined ? {} : { applicationAnswers: answers }) };
  }
  post("/api/applications/record", (req, res) => {
    const b = object(req.body); noProtectedFields(b); allowed(b, ["jobId", "status", "reviewNotes", "applicationAnswers"]);
    const status = choice(b.status, ["Rejected", "Interview", "Submission Unverified"] as const, "manual history status");
    res.json(db.recordManualApplication(required(db.getJob(string(b.jobId, "jobId")), "Job"), status, applicationEdits(b)));
  });
  put("/api/applications/:id", (req, res) => {
    const current = required(db.getApplication(req.params.id), "Application"), b = object(req.body); noProtectedFields(b);
    allowed(b, ["status", "statusMessage", "reviewNotes", "applicationAnswers", "appliedAt"]);
    const requested = choice(b.status ?? current.status, statuses, "application status");
    if (["Applying", "Analysing", "Documents Generated", "Discovered"].includes(requested)) throw new SafetyError("This transition is managed by processing; no submission adapter is implemented");
    const status = requested === "Applied" ? "Submission Unverified" : requested;
    const edits = applicationEdits(b);
    const event = { status, timestamp: new Date().toISOString(), message: status === "Submission Unverified" ? "Candidate reported an application. No submission evidence has been verified by HireFlow." : `Candidate recorded ${status}; no external verification.` };
    if (["Ready to Apply", "Awaiting Approval"].includes(status)) {
      processingCheckpoint(db);
      if (!["Discovered", "Analysing", "Documents Generated", "Awaiting Approval", "Ready to Apply"].includes(current.status)) throw new SafetyError(`Cannot return an application with status ${current.status} to staging. Its history was preserved.`, 409);
      if ((current.status === "Ready to Apply" || current.timeline.some(event => event.status === "Ready to Apply")) && status === "Awaiting Approval") throw new SafetyError("An approved application cannot be reset to Awaiting Approval", 409);
      if (!current.stagedAt && current.status !== "Ready to Apply") {
        if (current.timeline.some(event => event.status === "Ready to Apply")) throw new SafetyError("Historical approval conflicts with this unstaged record. No updates were saved.", 409);
        const token = db.reserveStage(current.jobId);
        try { return res.json(db.stageApplication({ ...current, ...edits, status, timeline: [event] }, token)); } finally { db.releaseStage(token); }
      }
      res.json(db.updateApplication(current.id, { ...edits, status }, event));
    } else {
      res.json(db.updateApplication(current.id, { ...edits, status,
        ...(status === "Submission Unverified" ? { submissionOrigin: "user_reported" as const, appliedAt: current.appliedAt || new Date().toISOString() } : {}),
      }, event));
    }
  });
  get("/api/resumes", (_req, res) => res.json(db.getResumes()));
  get("/api/cover-letters", (_req, res) => res.json(db.getCoverLetters()));
  get("/api/interviews", (_req, res) => res.json(db.getInterviews()));
  function interviewFields(value: unknown) {
    const b = object(value); noProtectedFields(b);
    allowed(b, ["applicationId", "company", "position", "date", "time", "round", "format", "interviewer", "status", "notes", "aiPrepQuestions", "talkingPoints"]);
    return { applicationId: b.applicationId === undefined ? undefined : string(b.applicationId, "applicationId"), company: string(b.company, "company"), position: string(b.position, "position"), date: string(b.date, "date"), time: string(b.time, "time"), round: choice(b.round, ["Recruiter Screen", "Technical Round 1", "System Design", "Hiring Manager", "Cultural Fit", "Final Executive"] as const, "round"), format: choice(b.format, ["Video Call", "Phone Call", "On-site"] as const, "format"), interviewer: b.interviewer === undefined ? undefined : string(b.interviewer, "interviewer", true), status: choice(b.status, ["Scheduled", "Completed", "Awaiting Feedback", "Passed", "Offer Received"] as const, "interview status"), notes: string(b.notes, "notes", true), aiPrepQuestions: strings(b.aiPrepQuestions ?? [], "aiPrepQuestions"), talkingPoints: strings(b.talkingPoints ?? [], "talkingPoints") };
  }
  post("/api/interviews", (req, res) => {
    const body = object(req.body);
    if ("aiPrepQuestions" in body || "talkingPoints" in body) throw new SafetyError("AI preparation can only be saved by the guarded preparation operation");
    res.status(201).json(db.addInterview({ ...interviewFields(body), id: `int-${randomUUID()}` }));
  });
  put("/api/interviews/:id", (req, res) => {
    const current = required(db.getInterviews().find(i => i.id === req.params.id), "Interview");
    const body = object(req.body); noProtectedFields(body);
    allowed(body, ["applicationId", "company", "position", "date", "time", "round", "format", "interviewer", "status", "notes"]);
    const { id, isDemo, legacyUnverified, ...fields } = current;
    res.json(db.updateInterview(id, interviewFields({ ...fields, ...body })));
  });
  const prepareInterview = async (req: Request, res: Response, persist: boolean) => {
    processingCheckpoint(db);
    const interview = persist ? required(db.getInterviews().find(i => i.id === req.params.id), "Interview") : undefined;
    const company = interview?.company ?? string(req.body?.company, "company"), position = interview?.position ?? string(req.body?.position, "position"), round = interview?.round ?? string(req.body?.round, "round");
    const job = db.getJobs().find(j => j.company.toLowerCase() === company.toLowerCase() && j.position === position);
    const target = job || { company, position, description: `Interview for ${position} at ${company}. No job description was supplied.`, requirements: [] };
    const profile = db.getProfile(), version = db.profileVersion(), pauseEpoch = db.getPauseEpoch(), model = db.getSettings().geminiModel;
    const prep = await invoke(res, signal => ai.generateInterviewPrep(target, round, profile, model, signal));
    processingCheckpoint(db, version, pauseEpoch); if (job) checkJobSnapshot(db, job);
    if (res.locals.signal.aborted) throw new SafetyError("Preparation request cancelled", 409);
    if (db.getSettings().geminiModel !== model) throw new SafetyError("Gemini model changed during preparation; retry", 409);
    if (interview) {
      const latest = required(db.getInterviews().find(i => i.id === interview.id), "Interview");
      if (JSON.stringify(latest) !== JSON.stringify(interview)) throw new SafetyError("Interview changed during preparation; retry", 409);
      res.json(db.updateInterview(interview.id, { aiPrepQuestions: prep.questions, talkingPoints: prep.talkingPoints }));
    } else res.json(prep); // Existing preview endpoint remains read-only.
  };
  post("/api/interviews/generate-prep", (req, res) => prepareInterview(req, res, false));
  post("/api/interviews/:id/generate-prep", (req, res) => prepareInterview(req, res, true));
  get("/api/agent/status", (_req, res) => res.json(db.getStatus()));
  get("/api/agent/logs", (_req, res) => res.json(db.getLogs()));
  post("/api/agent/toggle-pause", (req, res) => {
    const body = object(req.body); allowed(body, ["paused"]);
    if (typeof body.paused !== "boolean") throw new SafetyError("paused must be an explicit boolean; automatic toggling is not supported");
    const result = engine.setPaused(body.paused); res.json({ ...result, status: db.getStatus(), settings: db.getSettings() });
  });
  post("/api/agent/run-cycle", async (_req, res) => { const result = await engine.runCycle(res.locals.signal); res.status(result.success ? 200 : 409).json(result); });
  get("/api/settings", (_req, res) => res.json(db.getSettings()));
  put("/api/settings", (req, res) => {
    const b = object(req.body), next = db.getSettings(); allowed(b, Object.keys(next));
    for (const key of ["jobTitles", "skills", "locations", "countries"] as const) if (key in b) next[key] = strings(b[key], key);
    for (const key of ["notificationEmail", "salaryCurrency"] as const) if (key in b) next[key] = string(b[key], key, true);
    for (const key of ["notifyOnDiscovery", "notifyOnApprovalRequired", "notifyOnApplied", "emergencyPause"] as const) if (key in b) { if (typeof b[key] !== "boolean") throw new SafetyError(`${key} must be boolean`); next[key] = b[key]; }
    if ("geminiModel" in b) next.geminiModel = choice(b.geminiModel, ["gemini-3.8-flash", "gemini-3.1-flash-lite"], "Gemini model");
    if ("remotePreference" in b) next.remotePreference = choice(b.remotePreference, ["remote_only", "hybrid_flexible", "onsite_allowed", "any"], "remote preference");
    if ("experienceLevel" in b) next.experienceLevel = choice(b.experienceLevel, ["Entry", "Mid", "Senior", "Lead", "Any"], "experience level");
    if ("applicationMode" in b) next.applicationMode = choice(b.applicationMode, ["automatic", "approval_required", "hybrid"], "application mode");
    if ("dailyApplicationLimit" in b) next.dailyApplicationLimit = integer(b.dailyApplicationLimit, "dailyApplicationLimit", 1, 50);
    if ("matchThreshold" in b) next.matchThreshold = integer(b.matchThreshold, "matchThreshold", 0, 100);
    if ("salaryMin" in b) next.salaryMin = integer(b.salaryMin, "salaryMin", 0, 1_000_000_000);
    // Pause has a single update path; stale settings forms cannot undo an emergency pause.
    if (next.emergencyPause !== db.getStatus().isPaused) throw new SafetyError("Use the emergency pause control to change pause state", 409);
    res.json(db.updateSettings(next));
  });
  post("/api/demo/clear", (_req, res) => { demo = createDemoData(); demo.jobs = []; demo.applications = []; demo.interviews = []; demo.logs = []; res.json(db.clearDemoData()); });
  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof SafetyError ? error.status : error.status === 400 ? 400 : 500;
    console.error(`[HireFlow API ${status}]`, error instanceof Error ? error.message : "Unknown error");
    res.status(status).json({ error: error instanceof Error ? error.message : "Unexpected server error", ...(error instanceof SafetyError && error.details ? { details: error.details } : {}), success: false });
  });
  return app;
}

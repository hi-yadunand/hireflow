import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { Profile, Job, ConnectorInfo, ApplicationRecord, TailoredResume, TailoredCoverLetter, InterviewRecord, AgentLog, AgentStatus, AppSettings } from "../src/types/index.js";
import { DEFAULT_PROFILE, DEFAULT_CONNECTORS, isKnownDemoRecord, demoLinkedRecords } from "./demo.js";
import { SafetyError } from "./validation.js";

export function emptyProfile(): Profile {
  return {
    personal: { fullName: "", email: "", phone: "", location: "", headline: "", summary: "" },
    education: [], experience: [], skills: [], projects: [], certifications: [], languages: [],
    preferences: { desiredTitles: [], expectedSalary: { min: 0, currency: "USD", period: "annual" }, preferredCountries: [], remotePreference: "any", workAuthorization: { status: "Not provided", details: "", eligibleCountries: [] } },
    updatedAt: new Date().toISOString(),
  };
}
export const initialSettings: AppSettings = {
  jobTitles: [], skills: [], locations: [], countries: [], remotePreference: "any", salaryMin: 0,
  salaryCurrency: "USD", experienceLevel: "Any", matchThreshold: 75, applicationMode: "approval_required",
  dailyApplicationLimit: 12, notificationEmail: "", notifyOnDiscovery: false, notifyOnApprovalRequired: false,
  notifyOnApplied: false, geminiModel: "gemini-3.8-flash", emergencyPause: false,
};
const initialStatus: AgentStatus = { isPaused: false, emergencyStop: false, workerState: "idle", lastCycleRun: "", nextScheduledRun: "", dailyApplicationsCount: 0, dailyApplicationLimit: 12, totalJobsDiscoveredToday: 0, activeConnectorsCount: 0 };
export interface DatabaseSchema {
  profile: Profile; jobs: Job[]; connectors: ConnectorInfo[]; applications: ApplicationRecord[];
  resumes: TailoredResume[]; coverLetters: TailoredCoverLetter[]; interviews: InterviewRecord[];
  logs: AgentLog[]; status: AgentStatus; settings: AppSettings;
  stagingLedger?: { day: string; jobIds: string[] };
  legacyProfile?: Profile;
  lastManualCycleAt?: string;
  pauseEpoch?: number;
}
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const sameSeedProfile = (profile: Profile) => {
  const { updatedAt: _a, ...candidate } = profile;
  const { updatedAt: _b, ...seed } = DEFAULT_PROFILE;
  return JSON.stringify(candidate) === JSON.stringify(seed);
};
const isReal = (record: { isDemo?: boolean }) => record.isDemo !== true;

// One-process JSON store. Mutations are copy-on-write and atomically replaced;
// an external file change is rejected instead of overwriting another writer.
export class Database {
  private data: DatabaseSchema;
  private diskFingerprint: string | undefined;
  private backupMade = false;
  private runtimeWorkerState: AgentStatus["workerState"] = "idle";
  private pauseListeners = new Set<() => void>();
  onPause(listener: () => void) { this.pauseListeners.add(listener); return () => { this.pauseListeners.delete(listener); }; }
  private reservations = new Map<string, { jobId: string; day: string }>();
  constructor(readonly file = path.resolve("data/hireflow_db.json"), private now: () => Date = () => new Date()) {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      for (const key of ["jobs", "connectors", "applications", "resumes", "coverLetters", "interviews", "logs"]) {
        if (!Array.isArray(parsed[key])) throw new Error(`Invalid database ${file}: ${key} must be an array. File preserved.`);
      }
      if (!parsed.profile?.personal || !parsed.settings || !parsed.status) throw new Error(`Invalid database ${file}. File preserved.`);
      this.diskFingerprint = fingerprint(raw);
      this.data = parsed;
    } else {
      this.data = { profile: emptyProfile(), jobs: [], connectors: structuredClone(DEFAULT_CONNECTORS), applications: [], resumes: [], coverLetters: [], interviews: [], logs: [], status: { ...initialStatus }, settings: { ...initialSettings } };
    }
  }
  private commit(change: (draft: DatabaseSchema) => void) {
    const draft = structuredClone(this.data);
    change(draft);
    const exists = fs.existsSync(this.file);
    if ((exists ? fingerprint(fs.readFileSync(this.file, "utf8")) : undefined) !== this.diskFingerprint) {
      throw new Error("Database changed outside this process. Reload before writing; existing data was preserved.");
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (exists && !this.backupMade) {
      fs.copyFileSync(this.file, `${this.file}.backup-${randomUUID()}`, fs.constants.COPYFILE_EXCL);
      this.backupMade = true;
    }
    const raw = JSON.stringify(draft, null, 2);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, raw, { encoding: "utf8", flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } catch (error) {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      throw error;
    }
    this.data = draft;
    this.diskFingerprint = fingerprint(raw);
  }
  private clone<T>(value: T): T { return structuredClone(value); }
  private day() { return this.now().toISOString().slice(0, 10); }
  private ledger() { return this.data.stagingLedger?.day === this.day() ? this.data.stagingLedger : { day: this.day(), jobIds: [] }; }
  private realStagedJobIds() {
    const linked = this.linked(), excluded = new Set(linked.jobs);
    // References still establish provenance if an old parent job is missing.
    for (const collection of ["applications", "resumes", "coverLetters"] as const) {
      for (const record of this.data[collection]) if (linked[collection].has(record.id)) excluded.add(record.jobId);
    }
    return this.ledger().jobIds.filter(id => !excluded.has(id));
  }
  private provenance?: { data: DatabaseSchema; linked: ReturnType<typeof demoLinkedRecords> };
  private linked() {
    // Commits replace the data object, so classification is reused only for an
    // unchanged snapshot. No provenance flags are written into stored records.
    if (this.provenance?.data !== this.data) this.provenance = { data: this.data, linked: demoLinkedRecords(this.data) };
    return this.provenance.linked;
  }
  profileVersion() { return this.data.profile.revision || fingerprint(JSON.stringify(this.data.profile)); }
  private visible<T extends { isDemo?: boolean }>(rows: T[]) { return this.clone(rows.filter(isReal)); }
  getProfile(): Profile {
    if (this.data.profile.isDemo || sameSeedProfile(this.data.profile)) return { ...emptyProfile(), revision: this.profileVersion(), legacyProfileAvailable: true };
    return this.clone({ ...this.data.profile, revision: this.profileVersion(), legacyProfileAvailable: Boolean(this.data.legacyProfile), legacyUnverified: !this.data.profile.reviewedAt });
  }
  getLegacyProfile() { const legacy = sameSeedProfile(this.data.profile) ? this.data.profile : this.data.legacyProfile || this.data.profile; return this.clone({ ...legacy, isDemo: legacy.isDemo || sameSeedProfile(legacy) }); }
  updateProfile(profile: Profile, expectedVersion?: string): Profile {
    if (expectedVersion !== undefined && expectedVersion !== this.profileVersion()) throw new SafetyError("Profile changed since it was opened. Reload and review the latest profile before saving.", 409);
    this.commit(d => {
      if (!d.legacyProfile) d.legacyProfile = this.clone(d.profile);
      d.profile = { ...d.profile, ...this.clone(profile), isDemo: false, legacyUnverified: false, revision: randomUUID(), updatedAt: this.now().toISOString(), reviewedAt: this.now().toISOString() };
    });
    return this.getProfile();
  }
  getJobs() { return this.visible(this.data.jobs).filter(j => !this.linked().jobs.has(j.id)); }
  getJob(id: string) { return this.getJobs().find(j => j.id === id); }
  addJob(job: Job) {
    if (this.data.jobs.some(j => j.id === job.id)) throw new SafetyError("Job ID already exists", 409);
    this.commit(d => { d.jobs.unshift(this.clone({ ...job, isDemo: false })); }); return this.getJob(job.id)!;
  }
  updateJob(id: string, updates: Partial<Job>) {
    if (!this.getJob(id)) return undefined;
    this.commit(d => { const j = d.jobs.find(j => j.id === id)!; Object.assign(j, updates, { id, isDemo: false }); }); return this.getJob(id);
  }
  deleteJob(id: string) {
    if (!this.getJob(id)) return false;
    if (this.data.applications.some(a => a.jobId === id)) throw new SafetyError("Cannot delete a job with application history", 409);
    this.commit(d => { d.jobs = d.jobs.filter(j => j.id !== id); }); return true;
  }
  getConnectors(): ConnectorInfo[] {
    return this.data.connectors.map(c => ({ ...this.clone(c), connectionStatus: "Not implemented", requiredCredentials: "Not yet validated. Credentials are not accepted in Phase 0.", discoverySupport: false, applicationSupport: false, lastSuccessfulCheck: null, lastError: "Connector not implemented; no source polling is available.", isConfigured: false, activeJobsFound: 0 }));
  }
  updateConnector(id: string, updates: Partial<ConnectorInfo>) {
    if (!this.getConnectors().some(c => c.id === id)) return undefined;
    this.commit(d => { d.connectors.find(c => c.id === id)!.configuredPollingIntervalMinutes = updates.configuredPollingIntervalMinutes!; });
    return this.getConnectors().find(c => c.id === id);
  }
  getApplications() {
    return this.visible(this.data.applications).filter(a => !this.linked().applications.has(a.id)).map(a => ({ ...a, legacyUnverified: !a.submissionOrigin, submissionOrigin: a.submissionOrigin || "legacy_unverified" as const }));
  }
  getApplication(id: string) { return this.getApplications().find(a => a.id === id); }
  reserveStage(jobId: string) {
    const existing = this.getApplications().find(a => a.jobId === jobId && a.stagedAt);
    if (this.reservationsHas(jobId)) throw new SafetyError("This application is already being prepared", 409);
    const reserved = [...this.reservations.values()].filter(r => r.day === this.day() && !this.getApplications().some(a => a.jobId === r.jobId && a.stagedAt)).length;
    if (!existing && this.realStagedJobIds().length + reserved >= this.getSettings().dailyApplicationLimit) throw new SafetyError("Daily application staging limit reached (UTC)", 429);
    const token = randomUUID(); this.reservations.set(token, { jobId, day: this.day() }); return token;
  }
  private reservationsHas(jobId: string) { return [...this.reservations.values()].some(r => r.jobId === jobId); }
  releaseStage(token: string) { this.reservations.delete(token); }
  stageApplication(app: ApplicationRecord, token: string) {
    const reservation = this.reservations.get(token);
    if (!reservation || reservation.jobId !== app.jobId || reservation.day !== this.day()) throw new SafetyError("Staging reservation expired; retry processing", 409);
    const existing = this.getApplications().find(a => a.jobId === app.jobId);
    const alreadyStaged = Boolean(existing?.stagedAt);
    if (alreadyStaged || existing?.status === "Ready to Apply" || existing?.timeline.some(event => event.status === "Ready to Apply") || (existing && !["Discovered", "Analysing", "Documents Generated", "Awaiting Approval"].includes(existing.status))) {
      this.releaseStage(token); return existing!;
    }
    if (!alreadyStaged && this.realStagedJobIds().length >= this.getSettings().dailyApplicationLimit) throw new SafetyError("Daily application staging limit reached (UTC)", 429);
    const saved = { ...existing, ...app, timeline: [...(existing?.timeline || []), ...app.timeline], id: existing?.id || app.id, isDemo: false, stagedAt: existing?.stagedAt || this.now().toISOString() };
    this.commit(d => {
      const idx = d.applications.findIndex(a => a.id === saved.id);
      if (idx >= 0) d.applications[idx] = this.clone(saved); else d.applications.unshift(this.clone(saved));
      const job = d.jobs.find(j => j.id === saved.jobId && isReal(j));
      if (!job) throw new SafetyError("Real job not found", 404);
      job.applicationStatus = saved.status;
      if (job.processing) job.processing.state = "complete";
      if (!alreadyStaged) d.stagingLedger = { day: this.day(), jobIds: [...new Set([...this.ledger().jobIds, saved.jobId])] };
    });
    this.releaseStage(token); return this.getApplication(saved.id)!;
  }
  updateApplication(id: string, updates: Partial<ApplicationRecord>, event?: ApplicationRecord["timeline"][number]) {
    if (!this.getApplication(id)) return undefined;
    this.commit(d => {
      const app = d.applications.find(a => a.id === id)!;
      if ((app.status === "Ready to Apply" || app.timeline.some(event => event.status === "Ready to Apply")) && updates.status === "Awaiting Approval") throw new SafetyError("An approved application cannot be reset to Awaiting Approval", 409);
      const { timeline: ignoredTimeline, stagedAt: ignoredStagedAt, discoveredAt: ignoredDiscoveredAt, ...editable } = this.clone(updates);
      Object.assign(app, editable, { id, jobId: app.jobId, isDemo: false, lastUpdatedAt: this.now().toISOString() });
      if (event) app.timeline.push(this.clone(event));
      const job = d.jobs.find(j => j.id === app.jobId && isReal(j));
      if (job) {
        job.applicationStatus = app.status;
        if (!["Discovered", "Analysing", "Documents Generated"].includes(app.status)) job.processing = { ...job.processing, state: "complete", error: undefined };
      }
    }); return this.getApplication(id);
  }
  recordManualApplication(job: Job, status: "Rejected" | "Interview" | "Submission Unverified", updates: Pick<Partial<ApplicationRecord>, "reviewNotes" | "applicationAnswers"> = {}) {
    const existing = this.getApplications().find(a => a.jobId === job.id);
    const time = this.now().toISOString();
    const event = { status, timestamp: time, message: status === "Submission Unverified" ? "Candidate reported an application; no submission evidence was verified." : `Candidate recorded ${status}; no external verification.` };
    if (existing) return this.updateApplication(existing.id, { ...updates, status, ...(status === "Submission Unverified" ? { submissionOrigin: "user_reported" as const, appliedAt: existing.appliedAt || time } : {}) }, event)!;
    const record: ApplicationRecord = { id: `app-${randomUUID()}`, jobId: job.id, company: job.company, position: job.position, location: job.location, source: job.source, applyUrl: job.applyUrl, matchPercentage: job.matchPercentage, status, applicationMode: this.getSettings().applicationMode, discoveredAt: job.firstDetectedDate, lastUpdatedAt: time, submissionOrigin: "user_reported", ...(status === "Submission Unverified" ? { appliedAt: time } : {}), ...updates, timeline: [event] };
    this.commit(d => {
      d.applications.unshift(this.clone(record));
      const current = d.jobs.find(j => j.id === job.id)!;
      current.applicationStatus = status; current.processing = { ...current.processing, state: "complete", error: undefined };
    });
    return this.getApplication(record.id)!;
  }
  getResumes() { return this.visible(this.data.resumes).filter(r => !this.linked().resumes.has(r.id)); }
  addResume(resume: TailoredResume) { this.commit(d => { d.resumes.unshift(this.clone({ ...resume, isDemo: false })); }); return this.clone(resume); }
  saveProcessingResume(jobId: string, resume: TailoredResume, profileVersion: string) {
    this.commit(d => {
      const job = d.jobs.find(j => j.id === jobId && isReal(j));
      if (!job) throw new SafetyError("Job not found", 404);
      d.resumes.unshift(this.clone({ ...resume, isDemo: false }));
      job.processing = { ...job.processing, state: "resume_ready", profileVersion, resumeId: resume.id };
    });
    return this.getJob(jobId)!;
  }
  saveProcessingLetter(jobId: string, letter: TailoredCoverLetter) {
    this.commit(d => {
      const job = d.jobs.find(j => j.id === jobId && isReal(j));
      if (!job) throw new SafetyError("Job not found", 404);
      d.coverLetters.unshift(this.clone({ ...letter, isDemo: false }));
      job.processing = { ...job.processing, state: "resume_ready", coverLetterId: letter.id };
    });
    return this.getJob(jobId)!;
  }
  getCoverLetters() { return this.visible(this.data.coverLetters).filter(l => !this.linked().coverLetters.has(l.id)); }
  addCoverLetter(letter: TailoredCoverLetter) { this.commit(d => { d.coverLetters.unshift(this.clone({ ...letter, isDemo: false })); }); return this.clone(letter); }
  getInterviews() { return this.visible(this.data.interviews).filter(i => !this.linked().interviews.has(i.id)); }
  addInterview(interview: InterviewRecord) { this.commit(d => { d.interviews.unshift(this.clone({ ...interview, isDemo: false })); }); return this.clone(interview); }
  updateInterview(id: string, updates: Partial<InterviewRecord>) {
    if (!this.getInterviews().some(i => i.id === id)) return undefined;
    this.commit(d => { Object.assign(d.interviews.find(i => i.id === id)!, updates, { id, isDemo: false }); }); return this.getInterviews().find(i => i.id === id);
  }
  getLogs() { return this.visible(this.data.logs).filter(l => !this.linked().logs.has(l.id)).map(l => ({ ...l, legacyUnverified: l.legacyUnverified ?? true })); }
  addLog(log: Omit<AgentLog, "id" | "timestamp">) {
    const saved = { ...log, id: randomUUID(), timestamp: this.now().toISOString(), legacyUnverified: false, isDemo: false };
    this.commit(d => { d.logs.unshift(saved); }); return saved;
  }
  getStatus(): AgentStatus {
    const paused = Boolean(this.data.settings.emergencyPause || this.data.status.isPaused);
    return { ...this.clone(this.data.status), isPaused: paused, workerState: paused ? "paused" : this.runtimeWorkerState, lastCycleRun: this.data.lastManualCycleAt || "", dailyApplicationsCount: this.realStagedJobIds().length, dailyApplicationLimit: this.getSettings().dailyApplicationLimit, nextScheduledRun: "", totalJobsDiscoveredToday: 0, activeConnectorsCount: 0 };
  }
  updateStatus(updates: Partial<AgentStatus>) { this.commit(d => { Object.assign(d.status, updates); if (updates.lastCycleRun !== undefined) d.lastManualCycleAt = updates.lastCycleRun; }); if (updates.workerState) this.runtimeWorkerState = updates.workerState; return this.getStatus(); }
  getPauseEpoch() { return this.data.pauseEpoch || 0; }
  setPaused(paused: boolean) {
    if (this.data.settings.emergencyPause === paused && this.data.status.isPaused === paused && this.data.status.emergencyStop === paused) return;
    this.commit(d => { d.settings.emergencyPause = paused; if (paused) d.pauseEpoch = (d.pauseEpoch || 0) + 1; Object.assign(d.status, { isPaused: paused, emergencyStop: paused, workerState: paused ? "paused" : "idle" }); });
    this.runtimeWorkerState = paused ? "paused" : "idle";
    if (paused) for (const listener of [...this.pauseListeners]) listener();
  }
  getSettings(): AppSettings { return { ...initialSettings, ...this.clone(this.data.settings) }; }
  updateSettings(updates: Partial<AppSettings>) { this.commit(d => { Object.assign(d.settings, updates); }); return this.getSettings(); }
  clearDemoData() {
    // Deliberately never delete from the real file. Legacy/sample rows and links
    // stay preserved; demo mode is a separate disposable in-memory fixture set.
    return { success: true, message: "Demo preview cleared. All stored records were preserved." };
  }
}

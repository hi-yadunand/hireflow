import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import type { ApplicationRecord, Job } from "../src/types/index.js";
import { SafetyError } from "./validation.js";

export function checkPause(db: Database) {
  if (db.getStatus().isPaused || db.getSettings().emergencyPause) throw new SafetyError("Processing is paused. Resume it before continuing.", 409);
}
export function checkProfile(db: Database) {
  const profile = db.getProfile();
  if (profile.isDemo || !profile.reviewedAt || !profile.personal.fullName.trim()) throw new SafetyError("Review and confirm your real master profile before processing jobs.", 409);
}
export function processingCheckpoint(db: Database, profileVersion?: string, pauseEpoch?: number) {
  checkPause(db); checkProfile(db);
  if (pauseEpoch !== undefined && db.getPauseEpoch() !== pauseEpoch) throw new SafetyError("Processing was interrupted by emergency pause; retry the operation.", 409);
  if (profileVersion && db.profileVersion() !== profileVersion) throw new SafetyError("Profile changed during processing; retry", 409);
}
export function stageJob(db: Database, job: Job, updates: Partial<ApplicationRecord> = {}, reservation?: string) {
  if (job.isDemo || !db.getJob(job.id)) throw new SafetyError("Demo jobs cannot enter real processing", 400);
  const existing = db.getApplications().find(a => a.jobId === job.id);
  if (existing?.stagedAt || existing?.status === "Ready to Apply" || existing?.timeline.some(event => event.status === "Ready to Apply") || (existing && !["Discovered", "Analysing", "Documents Generated", "Awaiting Approval"].includes(existing.status))) {
    if (reservation) db.releaseStage(reservation);
    return existing;
  }
  processingCheckpoint(db);
  const settings = db.getSettings();
  const status = settings.applicationMode === "automatic" || (settings.applicationMode === "hybrid" && job.matchPercentage >= 88) ? "Ready to Apply" : "Awaiting Approval";
  const token = reservation || db.reserveStage(job.id);
  try {
    checkPause(db);
    return db.stageApplication({
      id: existing?.id || `app-${randomUUID()}`, jobId: job.id, company: job.company, position: job.position,
      location: job.location, source: job.source, applyUrl: job.applyUrl, matchPercentage: job.matchPercentage,
      discoveredAt: job.firstDetectedDate, lastUpdatedAt: new Date().toISOString(), applicationMode: settings.applicationMode,
      ...existing, ...updates, timeline: updates.timeline || [], status,
      // Neither the caller nor the AI can claim external submission evidence.
      submissionOrigin: existing?.submissionOrigin || "legacy_unverified",
    }, token);
  } finally { db.releaseStage(token); }
}

export function checkJobSnapshot(db: Database, snapshot: Job) {
  const current = db.getJob(snapshot.id);
  const fields: (keyof Job)[] = ["company", "position", "description", "requirements", "niceToHave", "location", "country", "workplaceType", "source", "applyUrl"];
  if (!current || fields.some(key => JSON.stringify(current[key]) !== JSON.stringify(snapshot[key]))) throw new SafetyError("Job changed during processing; retry with the updated listing.", 409);
}

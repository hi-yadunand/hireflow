import type { Database } from "./db.js";
import * as gemini from "./gemini.js";
import { processingCheckpoint, stageJob, checkJobSnapshot } from "./processing-policy.js";
import { SafetyError } from "./validation.js";
import { AI_TIMEOUT_MS, runAiOperation } from "./ai-operation.js";

export type AIService = Pick<typeof gemini, "analyzeJobMatch" | "tailorResume" | "generateCoverLetter" | "parseResumeText" | "generateInterviewPrep">;
export class AgentEngine {
  private running = false;
  private pendingPauseLog?: boolean;
  constructor(private db: Database, private ai: AIService = gemini, private timeoutMs = AI_TIMEOUT_MS) {}
  async runCycle(signal?: AbortSignal) {
    const result = { success: true, discoveredCount: 0, matchedCount: 0, processedCount: 0, errors: [] as { jobId: string; message: string }[], message: "" };
    if (this.running) throw new SafetyError("A processing cycle is already running", 409);
    processingCheckpoint(this.db);
    const pauseEpoch = this.db.getPauseEpoch();
    const invoke = <T>(work: (signal: AbortSignal) => Promise<T>) => runAiOperation(work, { signal, timeoutMs: this.timeoutMs, subscribeCancel: cancel => this.db.onPause(cancel) });
    this.running = true;
    try {
      this.db.addLog({ category: "system", severity: "info", message: "Manual processing started for stored jobs. Discovery and submission are not implemented." });
      for (const original of this.db.getJobs()) {
        processingCheckpoint(this.db, undefined, pauseEpoch);
        const profile = this.db.getProfile(), version = this.db.profileVersion(), model = this.db.getSettings().geminiModel;
        const checkpoint = () => {
          processingCheckpoint(this.db, version, pauseEpoch);
          checkJobSnapshot(this.db, original);
          const currentApplication = this.db.getApplications().find(a => a.jobId === original.id);
          if (currentApplication && !["Discovered", "Analysing", "Documents Generated"].includes(currentApplication.status)) throw new SafetyError("Application outcome changed during processing; no further AI result was saved.", 409);
          if (signal?.aborted) throw new SafetyError("Processing request cancelled", 409, { code: "AI_CANCELLED" });
          if (this.db.getSettings().geminiModel !== model) throw new SafetyError("Gemini model changed during processing; retry", 409);
        };
        const existing = this.db.getApplications().find(a => a.jobId === original.id);
        if (existing?.stagedAt || (existing && !["Discovered", "Analysing", "Documents Generated"].includes(existing.status))) continue;
        let reservation: string | undefined;
        try {
          let job = this.db.getJob(original.id)!;
          const progress = job.processing?.profileVersion === version && job.processing.model === model ? job.processing : undefined;
          // Eligibility depends on current settings; cached analysis does not.
          if (!progress || progress.state === "pending") {
            checkpoint(); this.db.updateStatus({ workerState: "matching" });
            const match = await invoke(abort => this.ai.analyzeJobMatch(profile, job, model, abort));
            checkpoint();
            job = this.db.updateJob(job.id, { ...match, processing: { state: "matched", profileVersion: version, model } })!;
            result.matchedCount++;
          }
          if (job.matchPercentage < this.db.getSettings().matchThreshold) {
            checkpoint(); this.db.updateJob(job.id, { processing: { ...job.processing, state: "complete", profileVersion: version, model } });
            continue;
          }
          checkpoint(); reservation = this.db.reserveStage(job.id); this.db.updateStatus({ workerState: "generating_docs" });
          let resume = this.db.getResumes().find(r => r.id === job.processing?.resumeId);
          if (!resume) {
            checkpoint(); resume = await invoke(abort => this.ai.tailorResume(profile, job, model, abort));
            checkpoint(); job = this.db.saveProcessingResume(job.id, resume, version);
          }
          let letter = this.db.getCoverLetters().find(l => l.id === job.processing?.coverLetterId);
          if (!letter) {
            checkpoint(); letter = await invoke(abort => this.ai.generateCoverLetter(profile, job, "professional", model, abort));
            checkpoint(); job = this.db.saveProcessingLetter(job.id, letter);
          }
          checkpoint();
          if (job.matchPercentage < this.db.getSettings().matchThreshold) throw new SafetyError("Match threshold changed; job no longer qualifies for staging", 409);
          const currentApp = this.db.getApplications().find(a => a.jobId === job.id);
          stageJob(this.db, job, {
            tailoredResumeId: resume.id, coverLetterId: letter.id,
            applicationAnswers: currentApp?.applicationAnswers || [{ question: "Work authorization status", suggestedAnswer: profile.preferences.workAuthorization.details, confirmed: false }, { question: "Relevant experience summary", suggestedAnswer: resume.tailoredSummary, confirmed: false }],
            timeline: [{ status: "Documents Generated", timestamp: new Date().toISOString(), message: "AI draft documents prepared from the reviewed profile; candidate review required. Nothing was submitted." }],
          }, reservation);
          if (!currentApp?.stagedAt && this.db.getApplications().some(a => a.jobId === job.id && a.stagedAt)) result.processedCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown processing failure";
          result.success = false; result.errors.push({ jobId: original.id, message });
          const job = this.db.getJob(original.id);
          const paused = this.db.getStatus().isPaused;
          const app = this.db.getApplications().find(a => a.jobId === original.id);
          if (job && !app?.stagedAt && (!app || ["Discovered", "Analysing", "Documents Generated"].includes(app.status))) this.db.updateJob(job.id, { processing: { ...job.processing, state: paused ? "paused" : "failed", error: message } });
          this.db.addLog({ category: "error", severity: "error", jobId: original.id, message });
          if (paused || signal?.aborted || this.db.getPauseEpoch() !== pauseEpoch || (error instanceof SafetyError && ["AI_CANCELLED", "AI_TIMEOUT"].includes(error.details?.code || "")) || (error instanceof SafetyError && error.status === 429)) break;
        } finally { if (reservation) this.db.releaseStage(reservation); }
      }
    } finally {
      this.running = false;
      this.db.updateStatus({ workerState: this.db.getStatus().isPaused ? "paused" : "idle", lastCycleRun: new Date().toISOString(), nextScheduledRun: "" });
    }
    result.message = `${result.processedCount} application packages staged; ${result.errors.length} processing errors. No jobs discovered or applications submitted.`;
    return result;
  }
  setPaused(paused: boolean) {
    if (typeof paused !== "boolean") throw new SafetyError("paused must be boolean");
    // Persist the safety control first. A logging failure must never undo it.
    const previous = this.db.getStatus().isPaused;
    this.db.setPaused(paused);
    if (previous === paused && this.pendingPauseLog !== paused) return { isPaused: paused };
    try {
      this.db.addLog({ category: "system", severity: paused ? "warning" : "info", message: paused ? "Processing paused. In-flight AI operations cancelled; late results cannot advance processing." : "Processing resumed. Cycles must be triggered manually." });
      this.pendingPauseLog = undefined;
      return { isPaused: paused };
    } catch (error) {
      this.pendingPauseLog = paused;
      console.error("HireFlow pause state saved, but activity log persistence failed:", error);
      return { isPaused: paused, warning: "Pause state was saved, but the activity log could not be saved. Retrying the same requested state is safe." };
    }
  }
}

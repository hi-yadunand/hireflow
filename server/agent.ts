import type { Database } from "./db.js";
import { repository, type Repository, type CycleLease } from "./persistence/repository.js";
import * as gemini from "./gemini.js";
import { processingCheckpoint, stageJob, checkJobSnapshot } from "./processing-policy.js";
import { SafetyError } from "./validation.js";
import { AI_TIMEOUT_MS, runAiOperation } from "./ai-operation.js";

export type AIService = Pick<typeof gemini, "analyzeJobMatch" | "tailorResume" | "generateCoverLetter" | "parseResumeText" | "generateInterviewPrep"> & Partial<Pick<typeof gemini, "checkConnection">>;
export class AgentEngine {
  private running = false;
  private pendingPauseLog?: boolean;
  private db: Repository;
  constructor(input: Database | Repository, private ai: AIService = gemini, private timeoutMs = AI_TIMEOUT_MS) { this.db = repository(input); }
  async runCycle(signal?: AbortSignal) {
    const result = { success: true, discoveredCount: 0, matchedCount: 0, processedCount: 0, errors: [] as { jobId: string; message: string }[], message: "" };
    if (this.running) throw new SafetyError("A processing cycle is already running", 409);
    this.running = true;
    let lease: CycleLease | undefined, heartbeat: ReturnType<typeof setInterval> | undefined, renewing = false;
    const controller = new AbortController(), cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      lease = await this.db.acquireCycle();
      const currentLease = lease, pauseEpoch = lease.epoch, writeOptions = { lease, signal: controller.signal };
      heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.db.renewCycle(currentLease).catch(() => cancel()).finally(() => { renewing = false; });
      }, 15_000);
      const invoke = <T>(work: (signal: AbortSignal) => Promise<T>) => runAiOperation(work, { signal: controller.signal, timeoutMs: this.timeoutMs, subscribeCancel: listener => this.db.onPause(listener, pauseEpoch) });
      await this.db.write(db => db.addLog({ category: "system", severity: "info", message: "Manual processing started for stored jobs. Discovery and submission are not implemented." }), writeOptions);
      const jobs = await this.db.read(db => db.getJobs());
      for (const original of jobs) {
        const { profile, version, model, existing } = await this.db.read(db => {
          processingCheckpoint(db, undefined, pauseEpoch);
          return { profile: db.getProfile(), version: db.profileVersion(), model: db.getSettings().geminiModel, existing: db.getApplications().find(a => a.jobId === original.id) };
        });
        const checkpoint = (db: Database) => {
          processingCheckpoint(db, version, pauseEpoch); checkJobSnapshot(db, original);
          const application = db.getApplications().find(a => a.jobId === original.id);
          if (application && !["Discovered", "Analysing", "Documents Generated"].includes(application.status)) throw new SafetyError("Application outcome changed during processing; no further AI result was saved.", 409);
          if (controller.signal.aborted) throw new SafetyError("Processing request cancelled", 409, { code: "AI_CANCELLED" });
          if (db.getSettings().geminiModel !== model) throw new SafetyError("Gemini model changed during processing; retry", 409);
        };
        if (existing?.stagedAt || (existing && !["Discovered", "Analysing", "Documents Generated"].includes(existing.status))) continue;
        let reservation: string | undefined;
        try {
          let job = await this.db.read(db => db.getJob(original.id)!);
          const progress = job.processing?.profileVersion === version && job.processing.model === model ? job.processing : undefined;
          if (!progress || progress.state === "pending") {
            await this.db.write(db => { checkpoint(db); db.updateStatus({ workerState: "matching" }); }, writeOptions);
            const match = await invoke(abort => this.ai.analyzeJobMatch(profile, job, model, abort));
            job = await this.db.write(db => { checkpoint(db); return db.updateJob(job.id, { ...match, processing: { state: "matched", profileVersion: version, model } })!; }, writeOptions);
            result.matchedCount++;
          }
          const eligible = await this.db.write(db => {
            checkpoint(db);
            if (job.matchPercentage >= db.getSettings().matchThreshold) return true;
            db.updateJob(job.id, { processing: { ...job.processing, state: "complete", profileVersion: version, model } }); return false;
          }, writeOptions);
          if (!eligible) continue;
          reservation = await this.db.write(db => { checkpoint(db); const token = db.reserveStage(job.id); db.updateStatus({ workerState: "generating_docs" }); return token; }, writeOptions);
          let resume = await this.db.read(db => db.getResumes().find(r => r.id === job.processing?.resumeId));
          if (!resume) {
            resume = await invoke(abort => this.ai.tailorResume(profile, job, model, abort));
            const savedResume = resume;
            job = await this.db.write(db => { checkpoint(db); return db.saveProcessingResume(job.id, savedResume, version); }, writeOptions);
          }
          let letter = await this.db.read(db => db.getCoverLetters().find(l => l.id === job.processing?.coverLetterId));
          if (!letter) {
            letter = await invoke(abort => this.ai.generateCoverLetter(profile, job, "professional", model, abort));
            const savedLetter = letter;
            job = await this.db.write(db => { checkpoint(db); return db.saveProcessingLetter(job.id, savedLetter); }, writeOptions);
          }
          const resumeId = resume.id, letterId = letter.id;
          const staged = await this.db.write(db => {
            checkpoint(db);
            if (job.matchPercentage < db.getSettings().matchThreshold) throw new SafetyError("Match threshold changed; job no longer qualifies for staging", 409);
            const current = db.getApplications().find(a => a.jobId === job.id);
            stageJob(db, job, { tailoredResumeId: resumeId, coverLetterId: letterId,
              applicationAnswers: current?.applicationAnswers || [{ question: "Work authorization status", suggestedAnswer: profile.preferences.workAuthorization.details, confirmed: false }, { question: "Relevant experience summary", suggestedAnswer: resume.tailoredSummary, confirmed: false }],
              timeline: [{ status: "Documents Generated", timestamp: new Date().toISOString(), message: "AI draft documents prepared from the reviewed profile; candidate review required. Nothing was submitted." }],
            }, reservation);
            return !current?.stagedAt && db.getApplications().some(a => a.jobId === job.id && a.stagedAt);
          }, writeOptions);
          if (staged) result.processedCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown processing failure";
          result.success = false; result.errors.push({ jobId: original.id, message });
          const state = await this.db.read(db => ({ paused: db.getStatus().isPaused, epoch: db.getPauseEpoch() }));
          // A revoked worker must not overwrite the state owned by a subsequent cycle.
          if (state.epoch === pauseEpoch && !controller.signal.aborted) {
            try {
              await this.db.write(db => {
                const job = db.getJob(original.id), app = db.getApplications().find(a => a.jobId === original.id);
                if (job && !app?.stagedAt && (!app || ["Discovered", "Analysing", "Documents Generated"].includes(app.status))) db.updateJob(job.id, { processing: { ...job.processing, state: state.paused ? "paused" : "failed", error: message } });
                db.addLog({ category: "error", severity: "error", jobId: original.id, message });
              }, writeOptions);
            } catch (persistenceError) {
              result.errors.push({ jobId: original.id, message: persistenceError instanceof Error ? persistenceError.message : "Could not persist processing failure" });
            }
          }
          if (state.paused || controller.signal.aborted || state.epoch !== pauseEpoch || (error instanceof SafetyError && (["AI_CANCELLED", "AI_TIMEOUT"].includes(error.details?.code || "") || error.status === 429))) break;
        } finally { if (reservation) await this.db.write(db => db.releaseStage(reservation!)); }
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      signal?.removeEventListener("abort", cancel);
      try { if (lease) await this.db.finishCycle(lease); } finally { this.running = false; }
    }
    result.message = `${result.processedCount} application packages staged; ${result.errors.length} processing errors. No jobs discovered or applications submitted.`;
    return result;
  }
  async setPaused(paused: boolean) {
    if (typeof paused !== "boolean") throw new SafetyError("paused must be boolean");
    const previous = await this.db.write(db => { const previous = db.getStatus().isPaused; db.setPaused(paused); return previous; });
    if (previous === paused && this.pendingPauseLog !== paused) return { isPaused: paused };
    try {
      await this.db.write(db => db.addLog({ category: "system", severity: paused ? "warning" : "info", message: paused ? "Processing paused. In-flight AI operations cancelled; late results cannot advance processing." : "Processing resumed. Cycles must be triggered manually." }));
      this.pendingPauseLog = undefined;
      return { isPaused: paused };
    } catch {
      this.pendingPauseLog = paused;
      console.error("HireFlow pause state saved, but activity log persistence failed.");
      return { isPaused: paused, warning: "Pause state was saved, but the activity log could not be saved. Retrying the same requested state is safe." };
    }
  }
}

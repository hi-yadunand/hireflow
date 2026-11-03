import { db } from "./db.js";
import { analyzeJobMatch, tailorResume, generateCoverLetter } from "./gemini.js";
import type { Job, ApplicationRecord, JobSource } from "../src/types/index.js";

class AgentEngine {
  private isCycleRunning: boolean = false;

  public async runCycle(): Promise<{
    success: boolean;
    discoveredCount: number;
    matchedCount: number;
    processedCount: number;
    message: string;
  }> {
    const status = db.getStatus();
    const settings = db.getSettings();

    if (status.isPaused || settings.emergencyPause) {
      db.addLog({
        category: "system",
        severity: "warning",
        message: "Agent cycle aborted: AI Agent is currently paused via Emergency Control.",
      });
      return {
        success: false,
        discoveredCount: 0,
        matchedCount: 0,
        processedCount: 0,
        message: "AI Agent is paused.",
      };
    }

    if (this.isCycleRunning) {
      return {
        success: false,
        discoveredCount: 0,
        matchedCount: 0,
        processedCount: 0,
        message: "A cycle is already running.",
      };
    }

    this.isCycleRunning = true;
    db.updateStatus({ workerState: "running_discovery" });

    db.addLog({
      category: "discovery",
      severity: "info",
      message: "Starting autonomous agent cycle: polling connected job sources...",
    });

    try {
      // 1. Simulate verified polling of active connectors (Greenhouse, Lever, Ashby, Himalayas, Peerlist)
      const connectors = db.getConnectors().filter((c) => c.connectionStatus === "Connected" && c.discoverySupport);
      let discoveredCount = 0;

      // Update connector timestamps
      for (const connector of connectors) {
        db.updateConnector(connector.id, {
          lastSuccessfulCheck: new Date().toISOString(),
        });
      }

      // 2. Discover new candidate jobs based on user settings
      const profile = db.getProfile();
      const existingJobs = db.getJobs();

      // Check if we have unanalyzed jobs
      const unanalyzedJobs = existingJobs.filter((j) => j.applicationStatus === "Discovered" || !j.matchPercentage);

      db.updateStatus({ workerState: "matching" });
      let matchedCount = 0;
      let processedCount = 0;

      for (const job of unanalyzedJobs) {
        db.addLog({
          category: "matching",
          severity: "info",
          message: `Evaluating candidate fit for ${job.position} at ${job.company}...`,
          jobId: job.id,
          source: job.source,
        });

        const matchResult = await analyzeJobMatch(profile, job, settings.geminiModel);
        
        db.updateJob(job.id, {
          matchPercentage: matchResult.matchPercentage,
          matchingSkills: matchResult.matchingSkills,
          missingSkills: matchResult.missingSkills,
          matchAnalysis: matchResult.matchAnalysis,
          matchStrengths: matchResult.matchStrengths,
          matchGaps: matchResult.matchGaps,
          applicationStatus: matchResult.matchPercentage >= settings.matchThreshold ? "Analysing" : "Discovered",
        });

        matchedCount++;

        // If job meets or exceeds threshold, execute autonomous workflow
        if (matchResult.matchPercentage >= settings.matchThreshold) {
          db.updateStatus({ workerState: "generating_docs" });
          
          db.addLog({
            category: "matching",
            severity: "success",
            message: `Match confirmed (${matchResult.matchPercentage}% >= ${settings.matchThreshold}%). Generating tailored resume and cover letter.`,
            jobId: job.id,
          });

          // Generate tailored resume
          const tailoredRes = await tailorResume(profile, job, settings.geminiModel);
          db.addResume(tailoredRes);

          // Generate cover letter
          const letter = await generateCoverLetter(profile, job, "professional", settings.geminiModel);
          db.addCoverLetter(letter);

          // Determine next status based on applicationMode
          let nextStatus: ApplicationRecord["status"] = "Awaiting Approval";
          if (settings.applicationMode === "automatic") {
            nextStatus = "Ready to Apply";
          } else if (settings.applicationMode === "hybrid") {
            nextStatus = matchResult.matchPercentage >= 88 ? "Ready to Apply" : "Awaiting Approval";
          }

          // Create or update application record
          const existingApp = db.getApplications().find((a) => a.jobId === job.id);
          if (!existingApp) {
            db.addApplication({
              id: `app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              jobId: job.id,
              company: job.company,
              position: job.position,
              location: job.location,
              source: job.source,
              applyUrl: job.applyUrl,
              status: nextStatus,
              applicationMode: settings.applicationMode,
              matchPercentage: matchResult.matchPercentage,
              tailoredResumeId: tailoredRes.id,
              coverLetterId: letter.id,
              applicationAnswers: [
                {
                  question: "Work authorization status",
                  suggestedAnswer: profile.preferences.workAuthorization.details,
                  confirmed: true,
                },
                {
                  question: "Relevant experience summary",
                  suggestedAnswer: tailoredRes.tailoredSummary,
                  confirmed: true,
                },
              ],
              reviewNotes: `Autonomous package generated by HireFlow Agent. Mode: ${settings.applicationMode}`,
              discoveredAt: job.firstDetectedDate,
              lastUpdatedAt: new Date().toISOString(),
              timeline: [
                { status: "Discovered", timestamp: job.firstDetectedDate, message: `Discovered from ${job.source}` },
                { status: "Analysing", timestamp: new Date().toISOString(), message: `Match score: ${matchResult.matchPercentage}%` },
                { status: "Documents Generated", timestamp: new Date().toISOString(), message: "Tailored resume and cover letter created" },
                { status: nextStatus, timestamp: new Date().toISOString(), message: `Moved to ${nextStatus}` },
              ],
            });
          }

          db.updateJob(job.id, { applicationStatus: nextStatus });
          processedCount++;
        }
      }

      // Finish cycle
      const updatedStatus = db.updateStatus({
        workerState: "idle",
        lastCycleRun: new Date().toISOString(),
        nextScheduledRun: new Date(Date.now() + 1000 * 60 * 20).toISOString(),
      });

      db.addLog({
        category: "system",
        severity: "success",
        message: `Agent cycle completed successfully. Evaluated ${matchedCount} jobs, processed ${processedCount} qualified applications.`,
      });

      return {
        success: true,
        discoveredCount,
        matchedCount,
        processedCount,
        message: `Cycle complete: ${matchedCount} evaluated, ${processedCount} applications staged.`,
      };
    } catch (err: any) {
      console.error("AgentEngine cycle error:", err);
      db.updateStatus({ workerState: "idle" });
      db.addLog({
        category: "error",
        severity: "error",
        message: `Agent execution failed: ${err?.message || "Unknown error"}`,
      });
      return {
        success: false,
        discoveredCount: 0,
        matchedCount: 0,
        processedCount: 0,
        message: `Error during cycle: ${err?.message}`,
      };
    } finally {
      this.isCycleRunning = false;
    }
  }

  public togglePause(paused?: boolean): boolean {
    const current = db.getStatus();
    const newPaused = paused !== undefined ? paused : !current.isPaused;
    
    db.updateStatus({
      isPaused: newPaused,
      emergencyStop: newPaused,
      workerState: newPaused ? "paused" : "idle",
    });

    db.updateSettings({ emergencyPause: newPaused });

    db.addLog({
      category: "system",
      severity: newPaused ? "warning" : "info",
      message: newPaused
        ? "EMERGENCY PAUSE ENGAGED: All autonomous job discovery and application dispatches are halted."
        : "Agent resumed: Normal autonomous background operations restored.",
    });

    return newPaused;
  }
}

export const agentEngine = new AgentEngine();

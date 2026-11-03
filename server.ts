import express from "express";
import path from "path";
import dotenv from "dotenv";
import { db } from "./server/db.js";
import { agentEngine } from "./server/agent.js";
import type { ApplicationRecord, InterviewRecord } from "./src/types/index.js";
import {
  analyzeJobMatch,
  tailorResume,
  generateCoverLetter,
  parseResumeText,
  generateInterviewPrep,
} from "./server/gemini.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "10mb" }));

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// 1. Profile Routes
app.get("/api/profile", (req, res) => {
  try {
    const profile = db.getProfile();
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/profile", (req, res) => {
  try {
    const updated = db.updateProfile(req.body);
    db.addLog({
      category: "system",
      severity: "info",
      message: "Master candidate profile updated.",
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/profile/upload-resume", async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ error: "rawText string is required" });
    }

    db.addLog({
      category: "tailoring",
      severity: "info",
      message: "Parsing uploaded resume text via Gemini...",
    });

    const parsed = await parseResumeText(rawText);
    res.json({ success: true, parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Job Routes
app.get("/api/jobs", (req, res) => {
  try {
    let jobs = db.getJobs();
    const { search, source, workplaceType, minMatch, onlyMatches } = req.query;

    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.company.toLowerCase().includes(q) ||
          j.position.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
      );
    }

    if (source && typeof source === "string" && source !== "all") {
      jobs = jobs.filter((j) => j.source.toLowerCase() === source.toLowerCase());
    }

    if (workplaceType && typeof workplaceType === "string" && workplaceType !== "all") {
      jobs = jobs.filter((j) => j.workplaceType.toLowerCase() === workplaceType.toLowerCase());
    }

    if (minMatch) {
      const threshold = Number(minMatch);
      if (!isNaN(threshold)) {
        jobs = jobs.filter((j) => (j.matchPercentage || 0) >= threshold);
      }
    }

    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/jobs", (req, res) => {
  try {
    const newJob = {
      id: `job-custom-${Date.now()}`,
      publicationDate: new Date().toISOString(),
      firstDetectedDate: new Date().toISOString(),
      matchPercentage: 0,
      matchingSkills: [],
      missingSkills: [],
      applicationStatus: "Discovered",
      ...req.body,
    };
    const saved = db.addJob(newJob);
    db.addLog({
      category: "discovery",
      severity: "info",
      message: `Manual job tracked: ${newJob.position} at ${newJob.company}`,
      jobId: saved.id,
      source: saved.source,
    });
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

app.put("/api/jobs/:id", (req, res) => {
  const updated = db.updateJob(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Job not found" });
  res.json(updated);
});

app.delete("/api/jobs/:id", (req, res) => {
  const deleted = db.deleteJob(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Job not found" });
  res.json({ success: true });
});

// 3. AI Operations on a specific Job
app.post("/api/jobs/:id/analyze", async (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const profile = db.getProfile();
    const settings = db.getSettings();

    db.addLog({
      category: "matching",
      severity: "info",
      message: `Running on-demand Gemini match analysis for ${job.position} at ${job.company}...`,
      jobId: job.id,
    });

    const analysis = await analyzeJobMatch(profile, job, settings.geminiModel);

    const updated = db.updateJob(job.id, {
      matchPercentage: analysis.matchPercentage,
      matchingSkills: analysis.matchingSkills,
      missingSkills: analysis.missingSkills,
      matchAnalysis: analysis.matchAnalysis,
      matchStrengths: analysis.matchStrengths,
      matchGaps: analysis.matchGaps,
    });

    res.json({ success: true, analysis, job: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/jobs/:id/tailor-resume", async (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const profile = db.getProfile();
    const settings = db.getSettings();

    db.addLog({
      category: "tailoring",
      severity: "info",
      message: `Generating tailored resume with Gemini for ${job.position} at ${job.company}...`,
      jobId: job.id,
    });

    const tailored = await tailorResume(profile, job, settings.geminiModel);
    db.addResume(tailored);

    res.json({ success: true, tailoredResume: tailored });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/jobs/:id/generate-cover-letter", async (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const { tone } = req.body;
    const profile = db.getProfile();
    const settings = db.getSettings();

    db.addLog({
      category: "tailoring",
      severity: "info",
      message: `Generating custom cover letter (${tone || "professional"}) for ${job.position} at ${job.company}...`,
      jobId: job.id,
    });

    const letter = await generateCoverLetter(profile, job, tone || "professional", settings.geminiModel);
    db.addCoverLetter(letter);

    res.json({ success: true, coverLetter: letter });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Connectors
app.get("/api/connectors", (req, res) => {
  res.json(db.getConnectors());
});

app.put("/api/connectors/:id", (req, res) => {
  const updated = db.updateConnector(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Connector not found" });
  db.addLog({
    category: "system",
    severity: "info",
    message: `Updated configuration for connector: ${updated.sourceName}`,
  });
  res.json(updated);
});

// 5. Applications
app.get("/api/applications", (req, res) => {
  res.json(db.getApplications());
});

app.post("/api/applications", (req, res) => {
  const newApp: ApplicationRecord = {
    id: `app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    discoveredAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    timeline: [
      {
        status: req.body.status || "Discovered",
        timestamp: new Date().toISOString(),
        message: "Application record created",
      },
    ],
    ...req.body,
  };
  const saved = db.addApplication(newApp);
  res.status(201).json(saved);
});

app.put("/api/applications/:id", (req, res) => {
  const existing = db.getApplication(req.params.id);
  if (!existing) return res.status(404).json({ error: "Application not found" });

  const timeline = [...existing.timeline];
  if (req.body.status && req.body.status !== existing.status) {
    timeline.push({
      status: req.body.status,
      timestamp: new Date().toISOString(),
      message: req.body.statusMessage || `Status changed from ${existing.status} to ${req.body.status}`,
    });
  }

  const updated = db.updateApplication(req.params.id, {
    ...req.body,
    timeline,
  });

  db.addLog({
    category: "application",
    severity: "info",
    message: `Application for ${existing.company} updated to: ${req.body.status || existing.status}`,
    jobId: existing.jobId,
  });

  res.json(updated);
});

// 6. Resumes & Cover Letters
app.get("/api/resumes", (req, res) => {
  res.json(db.getResumes());
});

app.get("/api/cover-letters", (req, res) => {
  res.json(db.getCoverLetters());
});

// 7. Interview Tracker & AI Prep
app.get("/api/interviews", (req, res) => {
  res.json(db.getInterviews());
});

app.post("/api/interviews", (req, res) => {
  const newInt: InterviewRecord = {
    id: `int-${Date.now()}`,
    aiPrepQuestions: [],
    talkingPoints: [],
    ...req.body,
  };
  const saved = db.addInterview(newInt);
  db.addLog({
    category: "system",
    severity: "success",
    message: `Scheduled interview recorded for ${newInt.company} (${newInt.round})`,
  });
  res.status(201).json(saved);
});

app.put("/api/interviews/:id", (req, res) => {
  const updated = db.updateInterview(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Interview not found" });
  res.json(updated);
});

app.post("/api/interviews/generate-prep", async (req, res) => {
  try {
    const { company, position, round } = req.body;
    const profile = db.getProfile();
    const settings = db.getSettings();

    // Find job if exists
    const matchingJob = db.getJobs().find((j) => j.company.toLowerCase() === company.toLowerCase()) || {
      id: "adhoc",
      company,
      position,
      description: `Target interview for ${position} at ${company}.`,
      requirements: profile.skills.slice(0, 5),
    } as any;

    const prep = await generateInterviewPrep(matchingJob, round || "Technical Round", profile, settings.geminiModel);
    res.json(prep);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Agent Monitor & Control
app.get("/api/agent/status", (req, res) => {
  res.json(db.getStatus());
});

app.get("/api/agent/logs", (req, res) => {
  res.json(db.getLogs());
});

app.post("/api/agent/toggle-pause", (req, res) => {
  const isPaused = agentEngine.togglePause(req.body.paused);
  res.json({ isPaused, status: db.getStatus() });
});

app.post("/api/agent/run-cycle", async (req, res) => {
  const result = await agentEngine.runCycle();
  res.json(result);
});

// 9. Settings
app.get("/api/settings", (req, res) => {
  res.json(db.getSettings());
});

app.put("/api/settings", (req, res) => {
  const updated = db.updateSettings(req.body);
  db.addLog({
    category: "system",
    severity: "info",
    message: "Platform settings updated.",
  });
  res.json(updated);
});

// 10. Demo management
app.post("/api/demo/clear", (req, res) => {
  db.clearDemoData();
  db.addLog({
    category: "system",
    severity: "info",
    message: "Demonstration jobs and demo applications cleared from working database.",
  });
  res.json({ success: true, message: "Demo data removed" });
});

// ----------------------------------------------------
// FRONTEND INTEGRATION (Vite dev server / Static prod)
// ----------------------------------------------------

async function startServer() {
  if (!isProduction) {
    // Mount Vite dev server middleware
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static build
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`HireFlow Server running on port ${PORT} [${isProduction ? "production" : "development"}]`);
  });
}

startServer();

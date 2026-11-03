import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar, type NavItemKey } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { ProfileModal } from "./components/ProfileModal.js";
import { ApplicationReviewModal } from "./components/ApplicationReviewModal.js";

// Views
import { OverviewView } from "./views/OverviewView.js";
import { DiscoverJobsView } from "./views/DiscoverJobsView.js";
import { AiMatchesView } from "./views/AiMatchesView.js";
import { ResumeManagerView } from "./views/ResumeManagerView.js";
import { CoverLettersView } from "./views/CoverLettersView.js";
import { ApplicationsView } from "./views/ApplicationsView.js";
import { InterviewTrackerView } from "./views/InterviewTrackerView.js";
import { AiAgentMonitorView } from "./views/AiAgentMonitorView.js";
import { AnalyticsView } from "./views/AnalyticsView.js";
import { IntegrationsView } from "./views/IntegrationsView.js";
import { SettingsView } from "./views/SettingsView.js";

import { api, setDataMode, getDataMode, createActionContext, isCurrentContext, assertActionContext } from "./lib/api.js";
import type {
  Profile,
  Job,
  ApplicationRecord,
  InterviewRecord,
  TailoredResume,
  TailoredCoverLetter,
  ConnectorInfo,
  AgentStatus,
  AgentLog,
  AppSettings,
} from "./types/index.js";

export default function App() {
  const [mode, setMode] = useState<"real" | "demo">(getDataMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  const pauseSequence = useRef(0);
  const pauseQueue = useRef<Promise<void>>(Promise.resolve());
  const [currentTab, setCurrentTab] = useState<NavItemKey>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Core Data States
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [resumes, setResumes] = useState<TailoredResume[]>([]);
  const [coverLetters, setCoverLetters] = useState<TailoredCoverLetter[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // UI Interactive States
  const [isLoading, setIsLoading] = useState(true);
  const [isCycleLoading, setIsCycleLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedAppForReview, setSelectedAppForReview] = useState<ApplicationRecord | null>(null);

  // Fetch all initial data
  const loadAllData = useCallback(async () => {
    const context = createActionContext();
    const currentGeneration = ++generation.current;
    const currentPauseSequence = pauseSequence.current;
    try {
      const [
        profileRes,
        jobsRes,
        appsRes,
        intsRes,
        resRes,
        covRes,
        connRes,
        statusRes,
        logsRes,
        setRes,
      ] = await Promise.all([
        api.getProfile(context),
        api.getJobs(undefined, context),
        api.getApplications(context),
        api.getInterviews(context),
        api.getResumes(context),
        api.getCoverLetters(context),
        api.getConnectors(context),
        api.getAgentStatus(context),
        api.getAgentLogs(context),
        api.getSettings(context),
      ]);

      if (currentGeneration !== generation.current || !isCurrentContext(context)) return;
      setLoadError(null);
      setProfile(profileRes);
      setJobs(jobsRes);
      setApplications(appsRes);
      setInterviews(intsRes);
      setResumes(resRes);
      setCoverLetters(covRes);
      setConnectors(connRes);
      if (currentPauseSequence === pauseSequence.current) setAgentStatus(statusRes);
      setLogs(logsRes);
      if (currentPauseSequence === pauseSequence.current) setSettings(setRes);
    } catch (err) {
      if (currentGeneration === generation.current && isCurrentContext(context)) setLoadError(err instanceof Error ? err.message : "Failed to load server data");
    } finally {
      if (currentGeneration === generation.current && isCurrentContext(context)) setIsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Periodic polling for status and logs
  useEffect(() => {
    const interval = setInterval(async () => {
      const context = createActionContext();
      const currentPauseSequence = pauseSequence.current;
      try {
        const [statusRes, logsRes] = await Promise.all([
          api.getAgentStatus(context),
          api.getAgentLogs(context),
        ]);
        if (!isCurrentContext(context)) return;
        if (currentPauseSequence === pauseSequence.current) setAgentStatus(statusRes);
        setLogs(logsRes);
      } catch (e) {
        if (isCurrentContext(context)) setLoadError(e instanceof Error ? e.message : "Status refresh failed");
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [mode]);

  // Explicit intent comes from the displayed control, including queued retries.
  const handleTogglePause = () => {
    const context = createActionContext();
    const desiredPaused = !(agentStatus?.isPaused ?? settings?.emergencyPause ?? false);
    // Serialize requests without changing the intent of repeated clicks.
    const action = pauseQueue.current.then(async () => {
      assertActionContext(context);
      const sequence = ++pauseSequence.current;
      const res = await api.setPaused(desiredPaused, context);
      assertActionContext(context);
      if (sequence !== pauseSequence.current) return;
      const appliedSequence = ++pauseSequence.current;
      setAgentStatus(res.status);
      setSettings(res.settings);
      if (res.warning) alert(res.warning);
      // A slow log refresh must not delay the next emergency control action.
      void api.getAgentLogs(context).then(logsRes => {
        if (isCurrentContext(context) && appliedSequence === pauseSequence.current) setLogs(logsRes);
      }).catch((err: Error) => {
        if (isCurrentContext(context)) setLoadError(`Pause state saved; log refresh failed: ${err.message}`);
      });
    });
    pauseQueue.current = action.catch(async (err: Error) => {
      if (!isCurrentContext(context)) return;
      // A request may fail after its state change committed (for example, if
      // the response was lost). Read actual state before presenting a retry.
      const sequence = ++pauseSequence.current;
      try {
        const [status, settings] = await Promise.all([api.getAgentStatus(context), api.getSettings(context)]);
        assertActionContext(context);
        if (sequence !== pauseSequence.current) return;
        ++pauseSequence.current;
        setAgentStatus(status); setSettings(settings);
        alert(`Pause/resume request failed: ${err.message}. Current server state: ${status.isPaused ? "paused" : "resumed"}.`);
      } catch (refreshError) {
        if (isCurrentContext(context)) setLoadError(`Pause/resume request failed: ${err.message}. Server pause state could not be confirmed: ${refreshError instanceof Error ? refreshError.message : "state refresh failed"}`);
      }
    });
    return pauseQueue.current;
  };

  // Run autonomous cycle
  const handleRunCycle = async () => {
    const context = createActionContext();
    setIsCycleLoading(true);
    try {
      const result = await api.runAgentCycle(context);
      assertActionContext(context);
      if (!result.success) throw new Error(result.message);
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to run agent cycle: " + err.message);
    } finally {
      if (isCurrentContext(context)) {
        await loadAllData();
        if (isCurrentContext(context)) setIsCycleLoading(false);
      }
    }
  };

  // Clear demo data
  const handleClearDemoData = async () => {
    const context = createActionContext();
    if (confirm("Clear the optional demo preview? All stored user records will be preserved.")) {
      try {
        await api.clearDemoData(context);
        assertActionContext(context);
        await loadAllData();
      } catch (err: any) {
        if (isCurrentContext(context)) alert("Failed to clear demo records: " + err.message);
      }
    }
  };

  // Navigation and cross-view helpers
  const handleSelectJobFromFeed = (job: Job) => {
    // Check if an application already exists for this job
    const existingApp = applications.find((a) => a.jobId === job.id);
    if (existingApp) {
      setSelectedAppForReview(existingApp);
    } else {
      // Find or stage a review preview
      const previewApp: ApplicationRecord = {
        id: `app-preview-${job.id}`,
        isDemo: job.isDemo,
        jobId: job.id,
        company: job.company,
        position: job.position,
        location: job.location,
        source: job.source,
        applyUrl: job.applyUrl,
        status: job.applicationStatus || "Discovered",
        applicationMode: settings?.applicationMode || "hybrid",
        matchPercentage: job.matchPercentage || 0,
        discoveredAt: job.firstDetectedDate,
        lastUpdatedAt: new Date().toISOString(),
        timeline: [
          { status: "Discovered", timestamp: job.firstDetectedDate, message: `Discovered from ${job.source}` },
        ],
      };
      setSelectedAppForReview(previewApp);
    }
  };

  const hasDemoData = mode === "demo";
  const changeMode = () => {
    generation.current++;
    const next = mode === "real" ? "demo" : "real";
    setDataMode(next); setMode(next); setIsLoading(true); setIsCycleLoading(false); setLoadError(null);
    pauseQueue.current = Promise.resolve();
    setProfile(null); setJobs([]); setApplications([]); setInterviews([]); setResumes([]); setCoverLetters([]); setConnectors([]); setAgentStatus(null); setLogs([]); setSettings(null);
    setIsProfileModalOpen(false); setSelectedAppForReview(null);
  };

  // Selected job for ApplicationReviewModal
  const selectedJobForReview = selectedAppForReview
    ? jobs.find((j) => j.id === selectedAppForReview.jobId) || null
    : null;
  const selectedResumeForReview = selectedAppForReview?.tailoredResumeId
    ? resumes.find((r) => r.id === selectedAppForReview.tailoredResumeId) || null
    : null;
  const selectedLetterForReview = selectedAppForReview?.coverLetterId
    ? coverLetters.find((l) => l.id === selectedAppForReview.coverLetterId) || null
    : null;

  return (
    <div className="flex h-screen bg-[#F8F8F7] text-[#171717] overflow-hidden antialiased">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        agentStatus={agentStatus}
        applications={applications}
        interviews={interviews}
        onOpenProfile={() => setIsProfileModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header */}
        <Header
          agentStatus={agentStatus}
          onTogglePause={handleTogglePause}
          onRunCycle={handleRunCycle}
          isCycleLoading={isCycleLoading}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          hasDemoData={hasDemoData}
          onClearDemoData={handleClearDemoData}
        />

        <div className="px-6 py-2 border-b border-[#E8E8E8] bg-[#FAF9F8] text-xs flex justify-between items-center">
          <span>{mode === "demo" ? "DEMO PREVIEW • Read-only examples • Isolated from your real data" : "REAL DATA • Manual processing • Discovery and submission are not implemented"}</span>
          <button className="underline font-medium" onClick={changeMode}>{mode === "demo" ? "Return to real data" : "View optional demo"}</button>
        </div>
        {loadError && <div role="alert" className="px-6 py-2 text-xs text-red-700 bg-red-50">{loadError} <button className="underline" onClick={loadAllData}>Retry loading</button></div>}
        {/* View Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-xs text-[#737373] font-mono">
              LOADING HIREFLOW WORKSPACE...
            </div>
          ) : (
            <div key={mode} className="max-w-7xl mx-auto">
              {currentTab === "overview" && (
                <OverviewView
                  jobs={jobs}
                  applications={applications}
                  interviews={interviews}
                  logs={logs}
                  status={agentStatus}
                  settings={settings}
                  onNavigate={setCurrentTab}
                  onRunCycle={handleRunCycle}
                  onTogglePause={handleTogglePause}
                  onSelectApplication={(app) => setSelectedAppForReview(app)}
                  onSelectJob={handleSelectJobFromFeed}
                  isCycleLoading={isCycleLoading}
                />
              )}

              {currentTab === "discover" && (
                <DiscoverJobsView
                  jobs={jobs}
                  onSelectJob={handleSelectJobFromFeed}
                  onRefreshJobs={loadAllData}
                  onOpenTailorResume={(job) => {
                    setCurrentTab("resumes");
                  }}
                  onOpenCoverLetter={(job) => {
                    setCurrentTab("cover-letters");
                  }}
                />
              )}

              {currentTab === "matches" && (
                <AiMatchesView
                  jobs={jobs}
                  settings={settings}
                  onSelectJob={handleSelectJobFromFeed}
                  onOpenTailorResume={(job) => {
                    setCurrentTab("resumes");
                  }}
                  onOpenCoverLetter={(job) => {
                    setCurrentTab("cover-letters");
                  }}
                  onRefreshJobs={loadAllData}
                />
              )}

              {currentTab === "resumes" && (
                <ResumeManagerView
                  profile={profile}
                  resumes={resumes}
                  jobs={jobs}
                  onOpenProfile={() => setIsProfileModalOpen(true)}
                  onRefreshResumes={loadAllData}
                />
              )}

              {currentTab === "cover-letters" && (
                <CoverLettersView
                  coverLetters={coverLetters}
                  jobs={jobs}
                  onRefreshCoverLetters={loadAllData}
                />
              )}

              {currentTab === "applications" && (
                <ApplicationsView
                  applications={applications}
                  jobs={jobs}
                  onSelectApplication={(app) => setSelectedAppForReview(app)}
                  onRefreshApplications={loadAllData}
                />
              )}

              {currentTab === "interviews" && (
                <InterviewTrackerView
                  interviews={interviews}
                  jobs={jobs}
                  onRefreshInterviews={loadAllData}
                />
              )}

              {currentTab === "monitor" && (
                <AiAgentMonitorView
                  status={agentStatus}
                  logs={logs}
                  settings={settings}
                  onTogglePause={handleTogglePause}
                  onRunCycle={handleRunCycle}
                  isCycleLoading={isCycleLoading}
                />
              )}

              {currentTab === "analytics" && (
                <AnalyticsView
                  jobs={jobs}
                  applications={applications}
                  interviews={interviews}
                />
              )}

              {currentTab === "integrations" && (
                <IntegrationsView
                  connectors={connectors}
                  onRefreshConnectors={loadAllData}
                />
              )}

              {currentTab === "settings" && (
                <SettingsView
                  settings={settings}
                  agentStatus={agentStatus}
                  onRefreshSettings={loadAllData}
                  onTogglePause={handleTogglePause}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        onProfileUpdated={(updated) => { if (getDataMode() === mode) setProfile(updated); }}
      />

      <ApplicationReviewModal
        isOpen={!!selectedAppForReview}
        onClose={() => setSelectedAppForReview(null)}
        application={selectedAppForReview}
        job={selectedJobForReview}
        tailoredResume={selectedResumeForReview}
        coverLetter={selectedLetterForReview}
        onStatusChanged={(updated) => {
          if (getDataMode() !== mode) return;
          setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          loadAllData();
        }}
      />
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
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

import { api } from "./lib/api.js";
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
        api.getProfile(),
        api.getJobs(),
        api.getApplications(),
        api.getInterviews(),
        api.getResumes(),
        api.getCoverLetters(),
        api.getConnectors(),
        api.getAgentStatus(),
        api.getAgentLogs(),
        api.getSettings(),
      ]);

      setProfile(profileRes);
      setJobs(jobsRes);
      setApplications(appsRes);
      setInterviews(intsRes);
      setResumes(resRes);
      setCoverLetters(covRes);
      setConnectors(connRes);
      setAgentStatus(statusRes);
      setLogs(logsRes);
      setSettings(setRes);
    } catch (err) {
      console.error("Failed to load initial data from server:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Periodic polling for status and logs
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [statusRes, logsRes] = await Promise.all([
          api.getAgentStatus(),
          api.getAgentLogs(),
        ]);
        setAgentStatus(statusRes);
        setLogs(logsRes);
      } catch (e) {
        // quiet background refresh
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Emergency Pause toggle
  const handleTogglePause = async () => {
    try {
      const res = await api.togglePause();
      setAgentStatus(res.status);
      const logsRes = await api.getAgentLogs();
      setLogs(logsRes);
    } catch (err: any) {
      alert("Failed to toggle emergency pause: " + err.message);
    }
  };

  // Run autonomous cycle
  const handleRunCycle = async () => {
    setIsCycleLoading(true);
    try {
      await api.runAgentCycle();
      await loadAllData();
    } catch (err: any) {
      alert("Failed to run agent cycle: " + err.message);
    } finally {
      setIsCycleLoading(false);
    }
  };

  // Clear demo data
  const handleClearDemoData = async () => {
    if (confirm("Remove sample demonstration jobs and applications to view pure live records?")) {
      try {
        await api.clearDemoData();
        await loadAllData();
      } catch (err: any) {
        alert("Failed to clear demo records: " + err.message);
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

  const hasDemoData = jobs.some((j) => j.isDemo);

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

        {/* View Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-xs text-[#737373] font-mono">
              INITIALIZING HIREFLOW AUTONOMOUS ENGINE...
            </div>
          ) : (
            <div className="max-w-7xl mx-auto">
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
        onProfileUpdated={(updated) => setProfile(updated)}
      />

      <ApplicationReviewModal
        isOpen={!!selectedAppForReview}
        onClose={() => setSelectedAppForReview(null)}
        application={selectedAppForReview}
        job={selectedJobForReview}
        tailoredResume={selectedResumeForReview}
        coverLetter={selectedLetterForReview}
        onStatusChanged={(updated) => {
          setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          loadAllData();
        }}
      />
    </div>
  );
}

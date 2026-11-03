import React from "react";
import {
  Compass,
  Sparkles,
  Briefcase,
  CheckCircle2,
  Calendar,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  Play,
  Clock,
  Layers,
  ChevronRight,
} from "lucide-react";
import type {
  Job,
  ApplicationRecord,
  InterviewRecord,
  AgentLog,
  AgentStatus,
  AppSettings,
} from "../types/index.js";
import type { NavItemKey } from "../components/Sidebar.js";

interface OverviewViewProps {
  jobs: Job[];
  applications: ApplicationRecord[];
  interviews: InterviewRecord[];
  logs: AgentLog[];
  status: AgentStatus | null;
  settings: AppSettings | null;
  onNavigate: (tab: NavItemKey) => void;
  onRunCycle: () => void;
  onTogglePause: () => void;
  onSelectApplication: (app: ApplicationRecord) => void;
  onSelectJob: (job: Job) => void;
  isCycleLoading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  jobs,
  applications,
  interviews,
  logs,
  status,
  settings,
  onNavigate,
  onRunCycle,
  onTogglePause,
  onSelectApplication,
  onSelectJob,
  isCycleLoading,
}) => {
  const totalDiscovered = jobs.length;
  const newToday = jobs.filter((j) => {
    const diff = Date.now() - new Date(j.firstDetectedDate).getTime();
    return diff < 1000 * 60 * 60 * 24;
  }).length;

  const threshold = settings?.matchThreshold || 75;
  const matchingJobs = jobs.filter((j) => (j.matchPercentage || 0) >= threshold);
  const applicationsSubmitted = applications.filter((a) => a.status === "Applied" || a.status === "Interview").length;
  const awaitingApproval = applications.filter((a) => a.status === "Awaiting Approval").length;
  const scheduledInterviews = interviews.filter((i) => i.status === "Scheduled").length;

  // Pipeline funnel breakdown
  const pipelineCounts = {
    discovered: jobs.filter((j) => j.applicationStatus === "Discovered").length,
    analysing: jobs.filter((j) => j.applicationStatus === "Analysing").length,
    docsGenerated: jobs.filter((j) => j.applicationStatus === "Documents Generated").length,
    awaitingApproval,
    readyToApply: applications.filter((a) => a.status === "Ready to Apply").length,
    applied: applicationsSubmitted,
    interview: interviews.length,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Agent State Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 rounded-xl border border-[#E8E8E8] bg-white shadow-xs gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h2 className="text-base font-semibold text-[#171717] tracking-tight">
              AI Career Autonomous Engine
            </h2>
            <span className="text-xs text-[#737373] font-mono">
              Mode: {settings?.applicationMode?.toUpperCase() || "HYBRID"}
            </span>
          </div>
          <p className="text-xs text-[#737373] max-w-2xl">
            Continuously polling configured ATS connectors and developer feeds worldwide, filtering by your verified credentials, and synthesizing customized applications.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={onRunCycle}
            disabled={isCycleLoading || status?.isPaused}
            className="text-xs font-medium bg-[#171717] text-white px-3.5 py-2 rounded-md hover:bg-black transition-all flex items-center space-x-1.5 shadow-xs"
          >
            <Activity className={`w-3.5 h-3.5 ${isCycleLoading ? "animate-spin" : ""}`} />
            <span>{isCycleLoading ? "Executing Cycle..." : "Run Autonomous Cycle"}</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (Required: Total discovered, New jobs today, Matching jobs, Applications submitted, Awaiting approval, Interviews) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Jobs Discovered", value: totalDiscovered, sub: "Total indexed", icon: Compass, tab: "discover" as NavItemKey },
          { label: "New Today", value: newToday, sub: "Last 24 hours", icon: Clock, tab: "discover" as NavItemKey },
          { label: "AI Matches", value: matchingJobs.length, sub: `>= ${threshold}% fit score`, icon: Sparkles, tab: "matches" as NavItemKey },
          { label: "Submitted", value: applicationsSubmitted, sub: "Dispatched", icon: Briefcase, tab: "applications" as NavItemKey },
          { label: "Awaiting Approval", value: awaitingApproval, sub: "Needs review", highlight: awaitingApproval > 0, icon: CheckCircle2, tab: "applications" as NavItemKey },
          { label: "Interviews", value: scheduledInterviews, sub: "Scheduled", highlight: scheduledInterviews > 0, icon: Calendar, tab: "interviews" as NavItemKey },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={() => onNavigate(card.tab)}
              className={`p-4 rounded-xl border bg-white hover:border-[#171717] transition-all cursor-pointer group shadow-2xs ${
                card.highlight ? "border-amber-300 bg-amber-50/20" : "border-[#E8E8E8]"
              }`}
            >
              <div className="flex items-center justify-between text-[#737373] mb-2">
                <span className="text-[11px] font-medium tracking-tight text-[#737373]">{card.label}</span>
                <Icon className="w-3.5 h-3.5 group-hover:text-[#171717] transition-colors" />
              </div>
              <div className="text-xl font-bold tracking-tight text-[#171717] font-mono">
                {card.value}
              </div>
              <div className="text-[10px] text-[#737373] mt-1 font-mono">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Pipeline Funnel + Live Agent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Application Pipeline & Top Matches */}
        <div className="lg:col-span-2 space-y-6">
          {/* Application Pipeline */}
          <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#171717] tracking-tight">
                  Autonomous Application Pipeline
                </h3>
                <p className="text-xs text-[#737373]">Live stage distribution across all tracked opportunities</p>
              </div>
              <button
                onClick={() => onNavigate("applications")}
                className="text-xs text-[#171717] hover:underline flex items-center space-x-1 font-medium"
              >
                <span>View Board</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pipeline Step Bars */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {[
                { label: "Discovered", count: pipelineCounts.discovered },
                { label: "Analysing", count: pipelineCounts.analysing },
                { label: "Docs Ready", count: pipelineCounts.docsGenerated },
                { label: "Awaiting Review", count: pipelineCounts.awaitingApproval, urgent: pipelineCounts.awaitingApproval > 0 },
                { label: "Ready to Apply", count: pipelineCounts.readyToApply },
                { label: "Submitted", count: pipelineCounts.applied },
                { label: "Interviews", count: pipelineCounts.interview },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    step.urgent ? "border-amber-300 bg-amber-50/30" : "border-[#E8E8E8] bg-[#FAF9F8]"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider font-mono text-[#737373] truncate">
                    {step.label}
                  </p>
                  <p className="text-lg font-bold font-mono text-[#171717] mt-1">{step.count}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Job Discoveries */}
          <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#171717] tracking-tight">
                  High-Compatibility Discoveries
                </h3>
                <p className="text-xs text-[#737373]">Ranked by Gemini semantic evaluation score</p>
              </div>
              <button
                onClick={() => onNavigate("matches")}
                className="text-xs text-[#171717] hover:underline flex items-center space-x-1 font-medium"
              >
                <span>All Matches</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#E8E8E8]">
              {jobs.slice(0, 4).map((job) => (
                <div
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className="py-3 flex items-center justify-between hover:bg-[#FAF9F8] px-2 rounded-md transition-colors cursor-pointer group"
                >
                  <div className="space-y-1 min-w-0 pr-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-[#171717] group-hover:underline truncate">
                        {job.position}
                      </span>
                      {job.isDemo && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                          SAMPLE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-[#737373]">
                      <span className="font-medium text-[#171717]">{job.company}</span>
                      <span>•</span>
                      <span>{job.location}</span>
                      <span>•</span>
                      <span className="font-mono text-[10px]">{job.source}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-emerald-700">
                        {job.matchPercentage}% match
                      </div>
                      <div className="text-[10px] text-[#737373] font-mono">
                        {job.applicationStatus}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#737373] group-hover:text-[#171717]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: AI Agent Activity & Connector Health */}
        <div className="space-y-6">
          {/* Agent Status Card */}
          <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#171717] tracking-tight">
                AI Agent Monitor
              </h3>
              <button
                onClick={() => onNavigate("monitor")}
                className="text-xs text-[#737373] hover:text-[#171717] hover:underline"
              >
                Logs & Trace
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F8] border border-[#E8E8E8]">
                <span className="text-[#737373]">Execution State</span>
                <span className="font-mono font-medium text-[#171717] uppercase">
                  {status?.isPaused ? "Paused" : status?.workerState}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F8] border border-[#E8E8E8]">
                <span className="text-[#737373]">Daily Cap Allocation</span>
                <span className="font-mono font-medium text-[#171717]">
                  {status?.dailyApplicationsCount} / {status?.dailyApplicationLimit} dispatched
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF9F8] border border-[#E8E8E8]">
                <span className="text-[#737373]">Last Polling Sync</span>
                <span className="font-mono text-[#737373] text-[11px]">
                  {status?.lastCycleRun ? new Date(status.lastCycleRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E8E8E8] flex justify-between items-center text-[11px]">
              <span className="text-[#737373]">Emergency Halt</span>
              <button
                onClick={onTogglePause}
                className="font-medium text-xs text-red-600 hover:underline"
              >
                {status?.isPaused ? "Resume Agent" : "Engage Emergency Stop"}
              </button>
            </div>
          </div>

          {/* Recent AI Activity Feed */}
          <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#171717] tracking-tight">
                Recent AI Activity
              </h3>
              <span className="text-[10px] font-mono text-[#737373]">LIVE AUDIT</span>
            </div>

            <div className="space-y-3">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="text-xs space-y-1 border-b border-[#F0F0EF] pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-[10px] text-[#737373] font-mono">
                    <span className="uppercase font-semibold text-[#171717]">{log.category}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="text-[#171717] text-xs leading-relaxed">
                    {log.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

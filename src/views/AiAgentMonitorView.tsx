import React, { useState } from "react";
import {
  Activity,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  ShieldAlert,
  Sliders,
  Filter,
} from "lucide-react";
import type { AgentStatus, AgentLog, AppSettings } from "../types/index.js";

interface AiAgentMonitorViewProps {
  status: AgentStatus | null;
  logs: AgentLog[];
  settings: AppSettings | null;
  onTogglePause: () => void;
  onRunCycle: () => void;
  isCycleLoading: boolean;
}

export const AiAgentMonitorView: React.FC<AiAgentMonitorViewProps> = ({
  status,
  logs,
  settings,
  onTogglePause,
  onRunCycle,
  isCycleLoading,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const filteredLogs = logs.filter((l) => {
    if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
    if (severityFilter !== "all" && l.severity !== severityFilter) return false;
    return true;
  });

  const isPaused = status?.isPaused || false;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>AI Agent Monitor & Telemetry</span>
          </h2>
          <p className="text-xs text-[#737373]">
            Manual processing state and recorded logs. No cloud worker or source polling is implemented.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={onRunCycle}
            disabled={isCycleLoading || isPaused}
            className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3.5 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCycleLoading ? "animate-spin" : ""}`} />
            <span>{isCycleLoading ? "Executing Task..." : "Trigger Manual Cycle"}</span>
          </button>

          <button
            onClick={onTogglePause}
            className={`flex items-center space-x-1.5 text-xs font-medium px-3.5 py-1.5 rounded-md border transition-colors ${
              isPaused
                ? "bg-[#171717] text-white border-[#171717] hover:bg-black"
                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            <span>{isPaused ? "Resume Worker" : "Emergency Pause"}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <div className="text-[11px] text-[#737373] font-medium">Worker State</div>
          <div className="text-lg font-bold font-mono text-[#171717] mt-1 uppercase flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
              }`}
            />
            <span>{isPaused ? "Paused" : status?.workerState.replace("_", " ")}</span>
          </div>
          <div className="text-[10px] text-[#737373] font-mono mt-1">Manual process only</div>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <div className="text-[11px] text-[#737373] font-medium">Daily Packages Staged</div>
          <div className="text-lg font-bold font-mono text-[#171717] mt-1">
            {status?.dailyApplicationsCount} / {status?.dailyApplicationLimit}
          </div>
          <div className="text-[10px] text-[#737373] font-mono mt-1">Resets 00:00 UTC</div>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <div className="text-[11px] text-[#737373] font-medium">Operational Connectors</div>
          <div className="text-lg font-bold font-mono text-[#171717] mt-1">
            {status?.activeConnectorsCount} Connected
          </div>
          <div className="text-[10px] text-[#737373] font-mono mt-1">ATS & Direct sources</div>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <div className="text-[11px] text-[#737373] font-medium">Next Scheduled Cycle</div>
          <div className="text-lg font-bold font-mono text-[#171717] mt-1">
            {status?.nextScheduledRun
              ? new Date(status.nextScheduledRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not scheduled"}
          </div>
          <div className="text-[10px] text-[#737373] font-mono mt-1">No scheduler implemented</div>
        </div>
      </div>

      {/* Execution Task Pipelines */}
      <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
          Processing Stages
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
          {[
            { name: "Source Checks", active: false, count: "Not implemented" },
            { name: "New Discoveries", active: false, count: `${status?.totalJobsDiscoveredToday || 0} Today` },
            { name: "Semantic Matching", active: status?.workerState === "matching", count: settings?.geminiModel || "Not configured" },
            { name: "Resume Tailoring", active: status?.workerState === "generating_docs", count: "Review required" },
            { name: "Cover Letter Synth", active: status?.workerState === "generating_docs", count: "Custom Hooks" },
            { name: "Portal Preparation", active: false, count: "Draft answers" },
            { name: "Submission Staging", active: false, count: settings?.applicationMode?.toUpperCase() || "HYBRID" },
          ].map((task, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border text-center transition-all ${
                task.active
                  ? "border-emerald-500 bg-emerald-50/30 text-emerald-900"
                  : "border-[#E8E8E8] bg-[#FAF9F8] text-[#171717]"
              }`}
            >
              <div className="text-[10px] font-medium truncate">{task.name}</div>
              <div className="text-[11px] font-mono text-[#737373] mt-1">{task.count}</div>
              <div className="mt-1 text-[9px] font-mono">
                {task.active ? (
                  <span className="text-emerald-700 font-semibold animate-pulse">RUNNING</span>
                ) : (
                  <span className="text-gray-400">STANDBY</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Log Feed & Filter Bar */}
      <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-[#171717]" />
            <h3 className="text-sm font-semibold text-[#171717]">
              Recorded Processing Log ({filteredLogs.length})
            </h3>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-2 text-xs">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 border border-[#E8E8E8] rounded bg-[#FAF9F8] text-[#171717]"
            >
              <option value="all">All Categories</option>
              <option value="discovery">Discovery</option>
              <option value="matching">Matching</option>
              <option value="tailoring">Tailoring</option>
              <option value="application">Application</option>
              <option value="system">System</option>
              <option value="error">Error</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1 border border-[#E8E8E8] rounded bg-[#FAF9F8] text-[#171717]"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>

        {/* Console-style Log List */}
        <div className="bg-[#FAF9F8] border border-[#E8E8E8] rounded-lg p-3 font-mono text-[11px] max-h-96 overflow-y-auto space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="py-6 text-center text-[#737373]">No logs matching current filter.</div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start space-x-2.5 py-1 border-b border-[#F0F0EF] last:border-0"
              >
                <span className="text-[#737373] text-[10px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>

                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                    log.severity === "error"
                      ? "bg-red-100 text-red-800"
                      : log.severity === "warning"
                      ? "bg-amber-100 text-amber-800"
                      : log.severity === "success"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {log.category}
                </span>

                <span
                  className={`flex-1 break-all ${
                    log.severity === "error" ? "text-red-700 font-medium" : "text-[#171717]"
                  }`}
                >
                  {log.isDemo ? "[DEMO] " : log.legacyUnverified ? "[Legacy, unverified] " : ""}{log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

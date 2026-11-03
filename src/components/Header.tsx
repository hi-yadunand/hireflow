import React from "react";
import { Play, Pause, RefreshCw, AlertTriangle, UserCheck, ShieldAlert, Sparkles } from "lucide-react";
import type { AgentStatus } from "../types/index.js";

interface HeaderProps {
  agentStatus: AgentStatus | null;
  onTogglePause: () => void;
  onRunCycle: () => void;
  isCycleLoading: boolean;
  onOpenProfile: () => void;
  hasDemoData: boolean;
  onClearDemoData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  agentStatus,
  onTogglePause,
  onRunCycle,
  isCycleLoading,
  onOpenProfile,
  hasDemoData,
  onClearDemoData,
}) => {
  const isPaused = agentStatus?.isPaused || false;
  const isActive = agentStatus?.workerState === "matching" || agentStatus?.workerState === "generating_docs";

  return (
    <header className="h-16 bg-[#FFFFFF] border-b border-[#E8E8E8] flex items-center justify-between px-6 z-20">
      {/* Left: Tagline & Active Indicator */}
      <div className="flex items-center space-x-4">
        <div>
          <h1 className="text-sm font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
            <span>HireFlow</span>
            <span className="text-[#737373] font-normal text-xs">•</span>
            <span className="text-[#737373] font-normal text-xs hidden sm:inline">
              Your career workspace.
            </span>
          </h1>
        </div>

        {/* Status Pill */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
            isPaused
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : isActive
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-[#F8F8F7] text-[#171717] border-[#E8E8E8]"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPaused
                ? "bg-amber-500"
                : isActive
                ? "bg-emerald-500 animate-ping"
                : "bg-emerald-500"
            }`}
          />
          <span className="font-medium">
            {isPaused
              ? "AGENT PAUSED"
              : agentStatus?.workerState === "matching"
              ? "AI MATCHING..."
              : agentStatus?.workerState === "generating_docs"
              ? "TAILORING DOCS..."
              : "MANUAL MODE"}
          </span>
        </div>
      </div>

      {/* Right Action Controls */}
      <div className="flex items-center space-x-3">
        {/* Demo Data indicator badge if present */}
        {hasDemoData && (
          <div className="hidden lg:flex items-center space-x-2 text-[11px] font-mono text-[#737373] bg-[#F8F8F7] px-2.5 py-1 rounded border border-[#E8E8E8]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>DEMO • Read-only examples</span>
            <button
              onClick={onClearDemoData}
              className="ml-1 text-[10px] text-[#171717] underline hover:text-red-600 transition-colors"
              title="Clear demo preview; preserve all user data"
            >
              Clear Demo
            </button>
          </div>
        )}

        {/* Master Profile Trigger */}
        <button
          onClick={onOpenProfile}
          className="hidden md:flex items-center space-x-1.5 text-xs font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-3 py-1.5 rounded-md transition-colors"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#737373]" />
          <span>Profile & CV</span>
        </button>

        {/* Trigger Cycle Button */}
        <button
          onClick={onRunCycle}
          disabled={isCycleLoading || isPaused}
          className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
            isCycleLoading
              ? "bg-[#F8F8F7] text-[#737373] border-[#E8E8E8] cursor-not-allowed"
              : isPaused
              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
              : "bg-[#FFFFFF] text-[#171717] border-[#E8E8E8] hover:border-[#171717] hover:bg-[#F8F8F7]"
          }`}
          title="Process stored jobs; discovery and submission are not implemented"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCycleLoading ? "animate-spin text-[#171717]" : "text-[#737373]"}`} />
          <span className="hidden sm:inline">{isCycleLoading ? "Executing..." : "Process Stored Jobs"}</span>
        </button>

        {/* Emergency Stop / Resume Control */}
        <button
          onClick={onTogglePause}
          className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
            isPaused
              ? "bg-[#171717] text-white border-[#171717] hover:bg-black"
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          }`}
          title={isPaused ? "Resume manual processing" : "Pause processing at the next safety checkpoint"}
        >
          {isPaused ? (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Resume Agent</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Emergency Pause</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};

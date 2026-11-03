import React from "react";
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  FileText,
  Mail,
  Briefcase,
  Calendar,
  Activity,
  BarChart3,
  PlugZap,
  Settings,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  ShieldAlert,
} from "lucide-react";
import type { AgentStatus, ApplicationRecord, InterviewRecord } from "../types/index.js";

export type NavItemKey =
  | "overview"
  | "discover"
  | "matches"
  | "resumes"
  | "cover-letters"
  | "applications"
  | "interviews"
  | "monitor"
  | "analytics"
  | "integrations"
  | "settings";

interface SidebarProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  agentStatus: AgentStatus | null;
  applications: ApplicationRecord[];
  interviews: InterviewRecord[];
  onOpenProfile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  agentStatus,
  applications,
  interviews,
  onOpenProfile,
}) => {
  const awaitingCount = applications.filter((a) => a.status === "Awaiting Approval").length;
  const scheduledInterviews = interviews.filter((i) => i.status === "Scheduled").length;

  const navItems: { key: NavItemKey; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "discover", label: "Discover Jobs", icon: Compass },
    { key: "matches", label: "AI Matches", icon: Sparkles },
    { key: "resumes", label: "Resume Manager", icon: FileText },
    { key: "cover-letters", label: "Cover Letters", icon: Mail },
    { key: "applications", label: "Applications", icon: Briefcase, badge: awaitingCount > 0 ? awaitingCount : undefined },
    { key: "interviews", label: "Interview Tracker", icon: Calendar, badge: scheduledInterviews > 0 ? scheduledInterviews : undefined },
    { key: "monitor", label: "AI Agent Monitor", icon: Activity },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "integrations", label: "Integrations", icon: PlugZap },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={`relative flex flex-col border-r border-[#E8E8E8] bg-[#FFFFFF] transition-all duration-200 z-30 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[#E8E8E8]">
        {!collapsed ? (
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 bg-[#171717] rounded-md flex items-center justify-center text-white font-semibold text-sm tracking-tight shadow-sm">
              HF
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight text-[#171717] leading-none">
                HireFlow
              </span>
              <span className="text-[10px] text-[#737373] tracking-normal font-mono mt-0.5">
                AGENT v1.4
              </span>
            </div>
          </div>
        ) : (
          <div className="w-7 h-7 bg-[#171717] rounded-md flex items-center justify-center text-white font-semibold text-xs mx-auto">
            HF
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="text-[#737373] hover:text-[#171717] p-1 rounded hover:bg-[#F8F8F7] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className={`w-full flex items-center rounded-md px-3 py-2 text-xs font-medium transition-colors group relative ${
                isActive
                  ? "bg-[#171717] text-white shadow-xs"
                  : "text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F7]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-[#737373] group-hover:text-[#171717]"}`} />
              
              {!collapsed && (
                <span className="ml-3 tracking-tight flex-1 text-left truncate">
                  {item.label}
                </span>
              )}

              {!collapsed && item.badge !== undefined && (
                <span
                  className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {collapsed && item.badge !== undefined && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Profile & Agent Status Section */}
      <div className="p-3 border-t border-[#E8E8E8] space-y-2 bg-[#FAF9F8]">
        {/* Profile Quick Button */}
        <button
          onClick={onOpenProfile}
          className="w-full flex items-center space-x-2.5 p-2 rounded-md hover:bg-[#EFEFEF] transition-colors text-left"
          title="Master Professional Profile"
        >
          <div className="w-6 h-6 rounded-full bg-[#171717] text-white flex items-center justify-center text-[10px] font-medium flex-shrink-0">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#171717] truncate">Master Profile</p>
              <p className="text-[10px] text-[#737373] truncate font-mono">Verified • 100%</p>
            </div>
          )}
        </button>

        {/* Status mini widget */}
        {!collapsed && agentStatus && (
          <div className="px-2 py-1.5 rounded border border-[#E8E8E8] bg-white text-[11px] flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  agentStatus.isPaused
                    ? "bg-amber-500"
                    : agentStatus.workerState !== "idle"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-emerald-500"
                }`}
              />
              <span className="font-mono text-[#737373] uppercase tracking-wider text-[10px]">
                {agentStatus.isPaused ? "Paused" : agentStatus.workerState.replace("_", " ")}
              </span>
            </div>
            <span className="text-[#737373] font-mono text-[10px]">
              {agentStatus.dailyApplicationsCount}/{agentStatus.dailyApplicationLimit}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};

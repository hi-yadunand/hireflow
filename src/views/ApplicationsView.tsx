import React, { useState } from "react";
import {
  Briefcase,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { ApplicationRecord, ApplicationStatus, Job } from "../types/index.js";

interface ApplicationsViewProps {
  applications: ApplicationRecord[];
  jobs: Job[];
  onSelectApplication: (app: ApplicationRecord) => void;
  onRefreshApplications: () => void;
}

const ALL_STATUSES: ApplicationStatus[] = [
  "Discovered",
  "Analysing",
  "Documents Generated",
  "Awaiting Approval",
  "Ready to Apply",
  "Applying",
  "Applied",
  "Submission Unverified",
  "Interview",
  "Rejected",
  "Expired",
];

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  jobs,
  onSelectApplication,
  onRefreshApplications,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("table");

  const filteredApps = applications.filter((app) => {
    if (selectedStatus !== "all" && app.status !== selectedStatus) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        app.company.toLowerCase().includes(q) ||
        app.position.toLowerCase().includes(q) ||
        app.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight">
            Application Command Centre
          </h2>
          <p className="text-xs text-[#737373]">
            Track local application packages and user-reported outcomes. Submission is not implemented.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center border border-[#E8E8E8] rounded-md bg-white p-0.5 text-xs">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                viewMode === "table" ? "bg-[#171717] text-white" : "text-[#737373] hover:text-[#171717]"
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode("pipeline")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                viewMode === "pipeline" ? "bg-[#171717] text-white" : "text-[#737373] hover:text-[#171717]"
              }`}
            >
              Pipeline Funnel
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3 rounded-xl border border-[#E8E8E8] bg-white flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#737373]" />
          <input
            type="text"
            placeholder="Search company or position..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs py-1 border-0 focus:outline-none bg-transparent"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-medium text-[#737373]">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] text-[#171717]"
          >
            <option value="all">All Stages ({applications.length})</option>
            {ALL_STATUSES.map((st) => {
              const count = applications.filter((a) => a.status === st).length;
              return (
                <option key={st} value={st}>
                  {st} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Table Mode */}
      {viewMode === "table" && (
        <div className="border border-[#E8E8E8] rounded-xl bg-white overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F8] border-b border-[#E8E8E8] text-[#737373] font-mono text-[11px]">
                <tr>
                  <th className="py-3 px-4 font-medium">Opportunity & Company</th>
                  <th className="py-3 px-4 font-medium">Stage Status</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium">Fit Score</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Last Updated</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E8]">
                {filteredApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#737373] text-xs">
                      No applications found for the selected stage filter.
                    </td>
                  </tr>
                ) : (
                  filteredApps.map((app) => {
                    const isAwaiting = app.status === "Awaiting Approval";
                    return (
                      <tr
                        key={app.id}
                        onClick={() => onSelectApplication(app)}
                        className={`hover:bg-[#FAF9F8] transition-colors cursor-pointer ${
                          isAwaiting ? "bg-amber-50/20" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#171717]">{app.position} <span className="text-[10px] text-[#737373] font-mono">{app.isDemo ? "DEMO" : "UNVERIFIED"}</span></div>
                          <div className="text-[11px] text-[#737373] flex items-center space-x-1.5 mt-0.5">
                            <span className="font-medium text-[#171717]">{app.company}</span>
                            <span>•</span>
                            <span>{app.location}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                              app.status === "Awaiting Approval"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : app.status === "Ready to Apply"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : app.status === "Applied"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : app.status === "Interview"
                                ? "bg-purple-50 text-purple-800 border-purple-200"
                                : app.status === "Rejected"
                                ? "bg-red-50 text-red-800 border-red-200"
                                : "bg-[#FAF9F8] text-[#171717] border-[#E8E8E8]"
                            }`}
                          >
                            {app.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373] uppercase">
                          {app.applicationMode}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-emerald-700">
                          {app.matchPercentage}%
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373]">
                          {app.source}
                        </td>

                        <td className="py-3.5 px-4 text-[11px] font-mono text-[#737373]">
                          {new Date(app.lastUpdatedAt).toLocaleDateString()}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectApplication(app);
                            }}
                            className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-2.5 py-1 rounded transition-colors"
                          >
                            <Eye className="w-3 h-3 text-[#737373]" />
                            <span>Inspect & Review</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pipeline Funnel View */}
      {viewMode === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Review & Approval", filterStatus: ["Documents Generated", "Awaiting Approval"] },
            { title: "Ready for Manual Application", filterStatus: ["Ready to Apply", "Applying"] },
            { title: "Reported / Unverified", filterStatus: ["Applied", "Submission Unverified"] },
            { title: "Interviews & Offers", filterStatus: ["Interview"] },
          ].map((col, idx) => {
            const colApps = applications.filter((a) => col.filterStatus.includes(a.status));
            return (
              <div key={idx} className="p-4 border border-[#E8E8E8] rounded-xl bg-white space-y-3">
                <div className="flex items-center justify-between border-b border-[#E8E8E8] pb-2">
                  <h4 className="text-xs font-semibold text-[#171717]">{col.title}</h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#FAF9F8] border border-[#E8E8E8]">
                    {colApps.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colApps.length === 0 ? (
                    <div className="p-6 text-center text-[11px] text-[#737373]">
                      No items in this stage
                    </div>
                  ) : (
                    colApps.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => onSelectApplication(app)}
                        className="p-3 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] hover:bg-white hover:border-[#171717] transition-all cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-semibold text-[#171717] leading-tight">
                            {app.position}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 ml-2">
                            {app.matchPercentage}%
                          </span>
                        </div>
                        <div className="text-[11px] text-[#737373]">{app.company}</div>
                        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-[#737373]">
                          <span>{app.status}</span>
                          <span className="text-[#171717] font-medium underline">Review</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

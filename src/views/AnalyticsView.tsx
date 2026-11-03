import React from "react";
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Target,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import type { Job, ApplicationRecord, InterviewRecord } from "../types/index.js";

interface AnalyticsViewProps {
  jobs: Job[];
  applications: ApplicationRecord[];
  interviews: InterviewRecord[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  jobs,
  applications,
  interviews,
}) => {
  const total = jobs.length;
  const highMatches = jobs.filter((j) => (j.matchPercentage || 0) >= 85).length;
  const midMatches = jobs.filter((j) => (j.matchPercentage || 0) >= 70 && (j.matchPercentage || 0) < 85).length;
  const lowMatches = jobs.filter((j) => (j.matchPercentage || 0) < 70).length;

  const appliedCount = applications.filter((a) => a.status === "Applied" || a.status === "Interview").length;
  const interviewCount = interviews.length;
  const conversionRate = appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0;

  // Source distribution
  const sourceStats: Record<string, number> = {};
  jobs.forEach((j) => {
    sourceStats[j.source] = (sourceStats[j.source] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-base font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-[#171717]" />
          <span>Autonomous Performance Analytics</span>
        </h2>
        <p className="text-xs text-[#737373]">
          Conversion rates, source effectiveness, and skill gap telemetry.
        </p>
      </div>

      {/* High-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <span className="text-[11px] text-[#737373] font-medium">Interview Conversion Rate</span>
          <div className="text-2xl font-bold font-mono text-[#171717] mt-1">{conversionRate}%</div>
          <span className="text-[10px] text-emerald-700 font-mono">Industry avg: 2-3%</span>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <span className="text-[11px] text-[#737373] font-medium">Top Match Tier (&gt;=85%)</span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{highMatches}</div>
          <span className="text-[10px] text-[#737373] font-mono">High affinity roles</span>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <span className="text-[11px] text-[#737373] font-medium">Avg Fit Score</span>
          <div className="text-2xl font-bold font-mono text-[#171717] mt-1">
            {total > 0 ? Math.round(jobs.reduce((acc, j) => acc + (j.matchPercentage || 0), 0) / total) : 0}%
          </div>
          <span className="text-[10px] text-[#737373] font-mono">Across all indexed jobs</span>
        </div>

        <div className="p-4 rounded-xl border border-[#E8E8E8] bg-white">
          <span className="text-[11px] text-[#737373] font-medium">Time Saved (Est.)</span>
          <div className="text-2xl font-bold font-mono text-[#171717] mt-1">38.5 hrs</div>
          <span className="text-[10px] text-[#737373] font-mono">Resume tailoring & research</span>
        </div>
      </div>

      {/* Grid: Match Distribution + Source Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Match Fit Distribution */}
        <div className="p-5 border border-[#E8E8E8] rounded-xl bg-white space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
            Compatibility Distribution
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span>Strong Alignment (85% – 100%)</span>
                <span className="font-bold text-emerald-700">{highMatches} roles</span>
              </div>
              <div className="w-full bg-[#FAF9F8] h-2 rounded-full overflow-hidden border border-[#E8E8E8]">
                <div
                  className="bg-emerald-600 h-full rounded-full"
                  style={{ width: `${total ? (highMatches / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span>Moderate Fit (70% – 84%)</span>
                <span className="font-bold text-blue-700">{midMatches} roles</span>
              </div>
              <div className="w-full bg-[#FAF9F8] h-2 rounded-full overflow-hidden border border-[#E8E8E8]">
                <div
                  className="bg-blue-600 h-full rounded-full"
                  style={{ width: `${total ? (midMatches / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono mb-1">
                <span>Gaps / Low Fit (&lt; 70%)</span>
                <span className="font-bold text-gray-700">{lowMatches} roles</span>
              </div>
              <div className="w-full bg-[#FAF9F8] h-2 rounded-full overflow-hidden border border-[#E8E8E8]">
                <div
                  className="bg-gray-400 h-full rounded-full"
                  style={{ width: `${total ? (lowMatches / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Source Yield Breakdown */}
        <div className="p-5 border border-[#E8E8E8] rounded-xl bg-white space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
            Source Discovery Yield
          </h3>

          <div className="space-y-2.5 text-xs">
            {Object.entries(sourceStats).map(([src, count]) => (
              <div key={src} className="flex items-center justify-between p-2 rounded bg-[#FAF9F8] border border-[#E8E8E8]">
                <span className="font-medium text-[#171717]">{src}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[11px] text-[#737373]">{count} discoveries</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-[#E8E8E8] text-emerald-800">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

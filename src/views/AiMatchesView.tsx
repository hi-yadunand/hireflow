import React, { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileText,
  Mail,
  Send,
  Building2,
  MapPin,
  ExternalLink,
} from "lucide-react";
import type { Job, AppSettings } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface AiMatchesViewProps {
  jobs: Job[];
  settings: AppSettings | null;
  onSelectJob: (job: Job) => void;
  onOpenTailorResume: (job: Job) => void;
  onOpenCoverLetter: (job: Job) => void;
  onRefreshJobs: () => void;
}

export const AiMatchesView: React.FC<AiMatchesViewProps> = ({
  jobs,
  settings,
  onSelectJob,
  onOpenTailorResume,
  onOpenCoverLetter,
  onRefreshJobs,
}) => {
  const threshold = settings?.matchThreshold ?? 75;
  const matchedJobs = jobs
    .filter((j) => (j.matchPercentage || 0) >= threshold)
    .sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const handleStageApplication = async (job: Job) => {
    const context = createActionContext();
    setLoadingActionId(job.id);
    try {
      await api.createApplication({
        jobId: job.id,
        company: job.company,
        position: job.position,
        location: job.location,
        source: job.source,
        applyUrl: job.applyUrl,
        status: settings?.applicationMode === "automatic" ? "Ready to Apply" : "Awaiting Approval",
        applicationMode: settings?.applicationMode || "hybrid",
        matchPercentage: job.matchPercentage,
      }, context);
      assertActionContext(context);

      onRefreshJobs();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to stage application: " + err.message);
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Job Matches</span>
          </h2>
          <p className="text-xs text-[#737373]">
            Roles meeting or exceeding your {threshold}% compatibility threshold based on saved scores. Legacy scores are unverified.
          </p>
        </div>

        <div className="text-xs font-mono text-[#737373] bg-[#F8F8F7] px-3 py-1.5 rounded border border-[#E8E8E8]">
          THRESHOLD: {threshold}% • {matchedJobs.length} QUALIFYING
        </div>
      </div>

      {matchedJobs.length === 0 ? (
        <div className="p-12 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373] space-y-2">
          <p className="font-semibold text-[#171717]">No jobs meet the current threshold of {threshold}%.</p>
          <p>You can lower the match threshold in Settings or evaluate a manually saved job.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matchedJobs.map((job) => (
            <div
              key={job.id}
              className="p-5 rounded-xl border border-[#E8E8E8] bg-white hover:border-[#171717] transition-all shadow-2xs space-y-4"
            >
              {/* Top Row */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <h3
                      onClick={() => onSelectJob(job)}
                      className="text-sm font-semibold text-[#171717] hover:underline cursor-pointer"
                    >
                      {job.position}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FAF9F8] border border-[#E8E8E8] text-[#171717]">
                      {job.source}
                    </span>
                    {job.isDemo && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        SAMPLE
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-[#737373] flex-wrap">
                    <span className="font-medium text-[#171717]">{job.company}</span>
                    <span>•</span>
                    <span>{job.location} ({job.workplaceType})</span>
                    {job.salary && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[11px] text-[#171717]">{job.salary}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="px-3.5 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800 font-mono text-center">
                    <div className="text-base font-bold leading-none">{job.matchPercentage}%</div>
                    <div className="text-[9px] uppercase tracking-wider mt-0.5">FIT SCORE</div>
                  </div>
                </div>
              </div>

              {/* Match Analysis Breakdown */}
              {job.matchAnalysis && (
                <div className="p-3 rounded-lg bg-[#FAF9F8] border border-[#E8E8E8] text-xs text-[#171717] leading-relaxed">
                  <span className="font-semibold text-[#737373] uppercase tracking-wider text-[10px] block mb-1">
                    AI Strategic Assessment
                  </span>
                  {job.matchAnalysis}
                </div>
              )}

              {/* Skills Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                {/* Matching Skills */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Profile Matching Skills ({job.matchingSkills?.length || 0})</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {job.matchingSkills?.map((sk) => (
                      <span
                        key={sk}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing Skills / Gaps */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-amber-800 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Areas to Address / Missing ({job.missingSkills?.length || 0})</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {job.missingSkills && job.missingSkills.length > 0 ? (
                      job.missingSkills.map((sk) => (
                        <span
                          key={sk}
                          className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200"
                        >
                          {sk}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#737373] italic">No major technical gaps detected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F0F0EF] text-xs">
                <span className="text-[11px] font-mono text-[#737373]">
                  Status: <strong className="text-[#171717]">{job.applicationStatus}</strong>
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onOpenTailorResume(job)}
                    className="flex items-center space-x-1 text-xs font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-3 py-1.5 rounded-md transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#737373]" />
                    <span>Tailor Resume</span>
                  </button>

                  <button
                    onClick={() => onOpenCoverLetter(job)}
                    className="flex items-center space-x-1 text-xs font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-3 py-1.5 rounded-md transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#737373]" />
                    <span>Generate Cover Letter</span>
                  </button>

                  <button
                    onClick={() => handleStageApplication(job)}
                    disabled={loadingActionId === job.id}
                    className="flex items-center space-x-1 text-xs font-medium bg-[#171717] text-white px-3.5 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Stage for Application</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

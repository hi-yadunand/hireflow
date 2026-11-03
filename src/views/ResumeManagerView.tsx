import React, { useState } from "react";
import {
  FileText,
  Sparkles,
  Download,
  Eye,
  History,
  Building2,
  Calendar,
  CheckCircle2,
  Copy,
  Plus,
} from "lucide-react";
import type { Profile, TailoredResume, Job } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface ResumeManagerViewProps {
  profile: Profile | null;
  resumes: TailoredResume[];
  jobs: Job[];
  onOpenProfile: () => void;
  onRefreshResumes: () => void;
}

export const ResumeManagerView: React.FC<ResumeManagerViewProps> = ({
  profile,
  resumes,
  jobs,
  onOpenProfile,
  onRefreshResumes,
}) => {
  const [selectedResumeId, setSelectedResumeId] = useState<string>("master");
  const [selectedJobIdToTailor, setSelectedJobIdToTailor] = useState<string>(jobs[0]?.id || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedTailored = resumes.find((r) => r.id === selectedResumeId);

  const handleGenerateTailored = async () => {
    const context = createActionContext();
    if (!selectedJobIdToTailor) return;
    setIsGenerating(true);
    try {
      await api.tailorResumeForJob(selectedJobIdToTailor, context);
      assertActionContext(context);
      onRefreshResumes();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to tailor resume: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) { alert(error instanceof Error ? error.message : "Could not copy text"); }
  };

  const handlePrintDownload = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight">
            Resume & CV Manager
          </h2>
          <p className="text-xs text-[#737373]">
            Review your master profile and AI draft versions for saved jobs. Check all generated claims.
          </p>
        </div>

        {/* Tailor for specific role quick widget */}
        <div className="flex items-center space-x-2">
          <select
            value={selectedJobIdToTailor}
            onChange={(e) => setSelectedJobIdToTailor(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#E8E8E8] rounded-md bg-white text-[#171717] max-w-[220px]"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} — {j.position.substring(0, 24)}...
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerateTailored}
            disabled={isGenerating || !selectedJobIdToTailor}
            className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin text-emerald-400" : ""}`} />
            <span>{isGenerating ? "Tailoring..." : "Tailor New CV"}</span>
          </button>
        </div>
      </div>

      {/* Main Layout: Left Version Selector + Right Document Previewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col (4): Version List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373] px-1">
            Available Versions ({resumes.length + 1})
          </h3>

          {/* Master Resume Item */}
          <div
            onClick={() => setSelectedResumeId("master")}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedResumeId === "master"
                ? "border-[#171717] bg-white shadow-xs"
                : "border-[#E8E8E8] bg-[#FAF9F8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#171717] flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-[#171717]" />
                <span>Master Professional Resume</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black text-white">
                REVIEW REQUIRED
              </span>
            </div>
            <p className="text-[11px] text-[#737373] mt-1.5">
              Profile containing all {profile?.experience.length || 0} positions & {profile?.skills.length || 0} skills.
            </p>
            <div className="mt-2 pt-2 border-t border-[#E8E8E8] flex justify-between items-center text-[10px] text-[#737373] font-mono">
              <span>Updated: {profile ? new Date(profile.updatedAt).toLocaleDateString() : "Recent"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile();
                }}
                className="text-[#171717] hover:underline font-medium"
              >
                Edit Master
              </button>
            </div>
          </div>

          {/* Tailored Resumes */}
          <div className="space-y-2">
            {resumes.map((res) => {
              const isSelected = selectedResumeId === res.id;
              return (
                <div
                  key={res.id}
                  onClick={() => setSelectedResumeId(res.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#171717] bg-white shadow-xs"
                      : "border-[#E8E8E8] bg-[#FAF9F8] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#171717] truncate max-w-[190px]">
                      {res.company}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      TAILORED
                    </span>
                  </div>
                  <p className="text-[11px] text-[#737373] truncate mt-0.5">{res.position}</p>
                  <div className="mt-2 text-[10px] text-[#737373] font-mono">
                    Created: {new Date(res.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col (8): Document Previewer & Actions */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
              {selectedResumeId === "master" ? "Master Resume Preview" : `Tailored Preview: ${selectedTailored?.company}`}
            </span>

            <div className="flex items-center space-x-2">
              <button
                onClick={() =>
                  handleCopyText(
                    selectedResumeId === "master"
                      ? `${profile?.personal.fullName}\n${profile?.personal.email}\n\nSummary:\n${profile?.personal.summary}\n\nSkills:\n${profile?.skills.join(", ")}`
                      : `${selectedTailored?.tailoredSummary}\n\nSkills:\n${selectedTailored?.tailoredSkills.join(", ")}`
                  )
                }
                className="flex items-center space-x-1 text-xs font-medium text-[#737373] hover:text-[#171717] bg-white border border-[#E8E8E8] px-2.5 py-1.5 rounded-md hover:bg-[#FAF9F8] transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? "Copied!" : "Copy Text"}</span>
              </button>

              <button
                onClick={handlePrintDownload}
                className="flex items-center space-x-1 text-xs font-medium text-[#171717] bg-white border border-[#E8E8E8] px-2.5 py-1.5 rounded-md hover:bg-[#FAF9F8] transition-colors"
                title="Print or export as PDF"
              >
                <Download className="w-3.5 h-3.5 text-[#737373]" />
                <span>Print / Browser PDF</span>
              </button>
            </div>
          </div>

          {/* Paper View Container */}
          <div className="p-8 border border-[#E8E8E8] rounded-xl bg-white shadow-xs font-sans text-xs space-y-6 min-h-[600px]">
            {selectedResumeId === "master" && profile ? (
              // Master Resume Rendering
              <div className="space-y-6">
                {/* Header Info */}
                <div className="border-b border-[#E8E8E8] pb-5 text-center space-y-1.5">
                  <h1 className="text-xl font-bold tracking-tight text-[#171717]">
                    {profile.personal.fullName}
                  </h1>
                  <p className="text-xs text-[#737373] font-medium">{profile.personal.headline}</p>
                  <div className="flex flex-wrap justify-center items-center gap-2 text-[11px] text-[#737373] pt-1">
                    <span>{profile.personal.email}</span>
                    <span>•</span>
                    <span>{profile.personal.phone}</span>
                    <span>•</span>
                    <span>{profile.personal.location}</span>
                    {profile.personal.linkedinUrl && (
                      <>
                        <span>•</span>
                        <a href={profile.personal.linkedinUrl} target="_blank" rel="noreferrer" className="underline">
                          LinkedIn
                        </a>
                      </>
                    )}
                    {profile.personal.githubUrl && (
                      <>
                        <span>•</span>
                        <a href={profile.personal.githubUrl} target="_blank" rel="noreferrer" className="underline">
                          GitHub
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Executive Summary
                  </h3>
                  <p className="text-[#737373] leading-relaxed text-xs">{profile.personal.summary}</p>
                </div>

                {/* Technical Skills */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Technical Skills & Core Competencies
                  </h3>
                  <p className="text-xs text-[#171717] font-mono leading-relaxed">
                    {profile.skills.join(" • ")}
                  </p>
                </div>

                {/* Work Experience */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Work Experience
                  </h3>
                  {profile.experience.map((exp) => (
                    <div key={exp.id} className="space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-[#171717]">
                          {exp.role} — <span className="font-normal text-[#737373]">{exp.company}</span>
                        </span>
                        <span className="text-[11px] font-mono text-[#737373]">
                          {exp.startDate} – {exp.current ? "Present" : exp.endDate}
                        </span>
                      </div>
                      <p className="text-[#737373] text-[11px] italic">{exp.description}</p>
                      <ul className="list-disc list-inside space-y-1 text-xs text-[#737373] pl-1">
                        {exp.highlights.map((hl, i) => (
                          <li key={i}>{hl}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Education */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Education
                  </h3>
                  {profile.education.map((edu) => (
                    <div key={edu.id} className="flex justify-between items-baseline text-xs">
                      <div>
                        <span className="font-bold text-[#171717]">{edu.institution}</span>
                        <span className="text-[#737373]"> — {edu.degree} in {edu.fieldOfStudy}</span>
                      </div>
                      <span className="text-[11px] font-mono text-[#737373]">
                        {edu.startDate} – {edu.endDate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedTailored ? (
              // Tailored Resume Rendering
              <div className="space-y-6">
                <div className="border-b border-[#E8E8E8] pb-4 space-y-1">
                  <div className="flex justify-between items-center">
                    <h2 className="text-base font-bold text-[#171717]">
                      {profile?.personal.fullName}
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      TAILORED FOR {selectedTailored.company.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-[#737373] font-medium">{selectedTailored.position}</p>
                </div>

                {/* Tailored Summary */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Targeted Summary
                  </h3>
                  <p className="text-[#737373] leading-relaxed text-xs">{selectedTailored.tailoredSummary}</p>
                </div>

                {/* Priority Skills */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Keywords & Priority Competencies
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {selectedTailored.tailoredSkills.map((sk) => (
                      <span key={sk} className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#FAF9F8] border border-[#E8E8E8] text-[#171717]">
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tailored Experience Highlights */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-1">
                    Optimized Accomplishments
                  </h3>
                  {selectedTailored.tailoredExperience.map((exp, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-baseline font-medium text-xs text-[#171717]">
                        <span>{exp.role}</span>
                        <span className="text-[#737373]">{exp.company}</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-xs text-[#737373]">
                        {exp.bulletPoints.map((bp, bIdx) => (
                          <li key={bIdx}>{bp}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Strategy Notes */}
                <div className="p-3 bg-[#FAF9F8] border border-[#E8E8E8] rounded-md text-[11px] text-[#737373]">
                  <strong className="text-[#171717]">Tailoring Strategy:</strong> {selectedTailored.tailoringNotes}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

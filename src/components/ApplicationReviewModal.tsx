import React, { useState } from "react";
import {
  X,
  CheckCircle2,
  FileText,
  Mail,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Send,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import type {
  ApplicationRecord,
  Job,
  TailoredResume,
  TailoredCoverLetter,
  ApplicationStatus,
} from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface ApplicationReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: ApplicationRecord | null;
  job: Job | null;
  tailoredResume?: TailoredResume | null;
  coverLetter?: TailoredCoverLetter | null;
  onStatusChanged: (updated: ApplicationRecord) => void;
}

export const ApplicationReviewModal: React.FC<ApplicationReviewModalProps> = (props) => {
  if (!props.isOpen || !props.application) return null;
  return <ApplicationEditor key={props.application.id} {...props} application={props.application} />;
};

const ApplicationEditor: React.FC<ApplicationReviewModalProps & { application: ApplicationRecord }> = ({
  isOpen,
  onClose,
  application,
  job,
  tailoredResume,
  coverLetter,
  onStatusChanged,
}) => {

  const [activeTab, setActiveTab] = useState<"overview" | "resume" | "cover_letter" | "answers" | "timeline">("overview");
  const [editedAnswers, setEditedAnswers] = useState(() => structuredClone(application.applicationAnswers || []));
  const [reviewNotes, setReviewNotes] = useState(application.reviewNotes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpdateStatus = async (newStatus: ApplicationStatus, message?: string) => {
    const context = createActionContext();
    setIsSubmitting(true);
    try {
      const edits = { reviewNotes, applicationAnswers: editedAnswers };
      const preview = application.id.startsWith("app-preview-");
      let updated: ApplicationRecord;
      if (preview && ["Rejected", "Interview", "Submission Unverified"].includes(newStatus)) {
        updated = await api.recordManualApplication({ jobId: application.jobId, status: newStatus as "Rejected" | "Interview" | "Submission Unverified", ...edits }, context);
      } else {
        const stored = preview ? await api.createApplication({ jobId: application.jobId }, context) : application;
        assertActionContext(context);
        updated = await api.updateApplication(stored.id, { status: newStatus, ...edits }, context);
      }
      assertActionContext(context);
      onStatusChanged(updated);
      onClose();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to update application status: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-[#FFFFFF] border border-[#E8E8E8] rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#E8E8E8] flex items-center justify-between bg-[#FAF9F8]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold text-xs">
              {application.company.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-[#171717]">
                  {application.position}
                </h3>
                <span className="text-xs text-[#737373]">at {application.company}</span>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-[#737373] font-mono mt-0.5">
                <span>Source: {application.source}</span>
                <span>•</span>
                <span>Match: {application.matchPercentage}%</span>
                <span>•</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {application.status} • {application.isDemo ? "DEMO" : "UNVERIFIED"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-[#171717] p-1.5 rounded-md hover:bg-[#EFEFEF] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#E8E8E8] px-6 bg-white space-x-1 text-xs">
          {[
            { id: "overview", label: "Job & Decision" },
            { id: "resume", label: "Tailored Resume" },
            { id: "cover_letter", label: "Cover Letter" },
            { id: "answers", label: `Application Q&A (${editedAnswers.length})` },
            { id: "timeline", label: "Timeline History" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`py-2.5 px-3 border-b-2 font-medium transition-colors ${
                activeTab === t.id
                  ? "border-[#171717] text-[#171717]"
                  : "border-transparent text-[#737373] hover:text-[#171717]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {job && (
                <div className="p-4 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#171717]">Job Specification</span>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#171717] hover:underline flex items-center space-x-1 font-mono"
                    >
                      <span>Direct Portal Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-[#737373] leading-relaxed line-clamp-3">
                    {job.description}
                  </p>
                  <div>
                    <h5 className="text-[11px] font-semibold text-[#171717] uppercase tracking-wider mb-1.5">
                      Target Requirements
                    </h5>
                    <ul className="text-xs text-[#737373] space-y-1 list-disc list-inside">
                      {job.requirements.map((req, i) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="p-4 border border-[#E8E8E8] rounded-lg space-y-3">
                <label className="block text-xs font-semibold text-[#171717]">
                  Candidate Review Notes
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Notes regarding company culture, contact name, or specific compensation preferences..."
                  className="w-full text-xs p-2.5 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div className="p-4 border border-blue-100 bg-blue-50/30 rounded-lg flex items-start space-x-3 text-xs text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Submission evidence</p>
                  <p className="text-blue-800/80 text-[11px] mt-0.5">
                    No application is submitted by HireFlow. Drafts require your review. Historical and user-reported statuses are unverified.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RESUME */}
          {activeTab === "resume" && (
            <div className="space-y-4">
              {tailoredResume ? (
                <div className="p-5 border border-[#E8E8E8] rounded-lg bg-white space-y-4 font-sans text-xs">
                  <div className="border-b border-[#E8E8E8] pb-3">
                    <h4 className="text-sm font-semibold text-[#171717]">Tailored Summary</h4>
                    <p className="text-[#737373] mt-1 leading-relaxed">{tailoredResume.tailoredSummary}</p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#171717] mb-2">Targeted Core Competencies</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {tailoredResume.tailoredSkills.map((sk) => (
                        <span key={sk} className="px-2 py-0.5 rounded bg-[#F8F8F7] border border-[#E8E8E8] text-[#171717] font-mono text-[11px]">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h5 className="font-semibold text-[#171717]">Tailored Experience Highlights</h5>
                    {tailoredResume.tailoredExperience.map((exp, i) => (
                      <div key={i} className="p-3 border border-[#E8E8E8] rounded bg-[#FAF9F8] space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-medium text-[#171717]">
                          <span>{exp.role}</span>
                          <span className="text-[#737373] font-normal">{exp.company}</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[#737373] text-[11px]">
                          {exp.bulletPoints.map((bp, bIdx) => (
                            <li key={bIdx}>{bp}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[#737373]">
                  No tailored resume generated yet for this job. Use the "AI Matches" or "Resume Manager" tab to generate one.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COVER LETTER */}
          {activeTab === "cover_letter" && (
            <div className="space-y-4">
              {coverLetter ? (
                <div className="p-5 border border-[#E8E8E8] rounded-lg bg-white space-y-3">
                  <div className="flex items-center justify-between text-xs text-[#737373] border-b border-[#E8E8E8] pb-2">
                    <span>Tone: {coverLetter.tone}</span>
                    <span>Created: {new Date(coverLetter.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="whitespace-pre-line text-xs text-[#171717] leading-relaxed font-sans bg-[#FAF9F8] p-4 rounded border border-[#E8E8E8]">
                    {coverLetter.letterBody}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[#737373]">
                  No cover letter generated yet. Click generate in the Cover Letters section.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ANSWERS */}
          {activeTab === "answers" && (
            <div className="space-y-3">
              <p className="text-xs text-[#737373]">
                Suggested answers prepared locally. Review and confirm each answer; no portal was accessed.
              </p>
              {editedAnswers.map((ans, idx) => (
                <div key={idx} className="p-3.5 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] space-y-2">
                  <label className="block text-xs font-semibold text-[#171717]">
                    Q: {ans.question}
                  </label>
                  <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={ans.confirmed} onChange={e => setEditedAnswers(previous => previous.map((answer, i) => i === idx ? { ...answer, confirmed: e.target.checked } : answer))} />I reviewed this answer</label>
                  <textarea
                    rows={2}
                    value={ans.suggestedAnswer}
                    onChange={(e) => {
                      setEditedAnswers(previous => previous.map((answer, i) => i === idx ? { ...answer, suggestedAnswer: e.target.value, confirmed: false } : answer));
                    }}
                    className="w-full text-xs p-2 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: TIMELINE */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              <h5 className="text-xs font-semibold text-[#171717] mb-2">Recorded History (Unverified)</h5>
              <div className="space-y-2">
                {application.timeline.map((item, idx) => (
                  <div key={idx} className="flex items-start space-x-3 text-xs border-l-2 border-[#171717] pl-3 py-1">
                    <div className="flex-1">
                      <p className="font-semibold text-[#171717]">{item.status}</p>
                      <p className="text-[#737373] text-[11px]">{item.message}</p>
                    </div>
                    <span className="text-[10px] text-[#737373] font-mono whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="px-6 py-4 border-t border-[#E8E8E8] flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F8]">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-[#737373]">Current Status:</span>
            <span className="text-xs font-semibold font-mono text-[#171717]">{application.status}</span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            {/* Status transitions */}
            {application.status === "Awaiting Approval" && (
              <button
                onClick={() => handleUpdateStatus("Ready to Apply", "Approved by candidate for dispatch")}
                disabled={isSubmitting || application.isDemo}
                className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 transition-colors flex items-center space-x-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Local Package</span>
              </button>
            )}

            {application.status === "Ready to Apply" && (
              <button
                onClick={() => handleUpdateStatus("Submission Unverified")}
                disabled={isSubmitting || application.isDemo}
                className="text-xs font-medium bg-[#171717] text-white px-3 py-1.5 rounded-md hover:bg-black transition-colors flex items-center space-x-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Record Manual Application (Unverified)</span>
              </button>
            )}

            <button
              onClick={() => handleUpdateStatus("Interview", "Moved to interview stage")}
              disabled={isSubmitting || application.isDemo}
              className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
            >
              Moved to Interview
            </button>

            <button
              onClick={() => handleUpdateStatus("Rejected", "Application marked as rejected")}
              disabled={isSubmitting || application.isDemo}
              className="text-xs font-medium text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-md transition-colors"
            >
              Mark Rejected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

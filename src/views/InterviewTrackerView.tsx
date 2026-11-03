import React, { useState } from "react";
import {
  Calendar,
  Clock,
  Video,
  User,
  Sparkles,
  Plus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
} from "lucide-react";
import type { InterviewRecord, Job } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface InterviewTrackerViewProps {
  interviews: InterviewRecord[];
  jobs: Job[];
  onRefreshInterviews: () => void;
}

export const InterviewTrackerView: React.FC<InterviewTrackerViewProps> = ({
  interviews,
  jobs,
  onRefreshInterviews,
}) => {
  const [selectedInterviewId, setSelectedInterviewId] = useState<string>(interviews[0]?.id || "");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isGeneratingPrep, setIsGeneratingPrep] = useState(false);

  const [formData, setFormData] = useState({
    company: "",
    position: "",
    date: new Date().toISOString().split("T")[0],
    time: "",
    round: "Technical Round 1" as const,
    format: "Video Call" as const,
    interviewer: "",
    notes: "",
  });

  const selectedInterview = interviews.find((i) => i.id === selectedInterviewId) || interviews[0];

  const handleAddInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    const context = createActionContext();
    try {
      const created = await api.createInterview({
        ...formData,
        status: "Scheduled",
      }, context);
      assertActionContext(context);
      setShowAddModal(false);
      setSelectedInterviewId(created.id);
      onRefreshInterviews();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to schedule interview: " + err.message);
    }
  };

  const handleGeneratePrep = async () => {
    const context = createActionContext();
    if (!selectedInterview) return;
    setIsGeneratingPrep(true);
    try {
      await api.generateAndSaveInterviewPrep(selectedInterview.id, context);
      assertActionContext(context);

      onRefreshInterviews();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to generate prep: " + err.message);
    } finally {
      setIsGeneratingPrep(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight">
            Interview Tracker & AI Prep
          </h2>
          <p className="text-xs text-[#737373]">
            Track upcoming rounds and generate custom technical questions and architectural talking points with Gemini.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3.5 py-2 rounded-md hover:bg-black transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record Interview</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col (4): Interview List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373] px-1">
            Scheduled & Past Rounds ({interviews.length})
          </h3>

          {interviews.length === 0 ? (
            <div className="p-8 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373]">
              No interviews scheduled yet. Click "Record Interview" to track your first call.
            </div>
          ) : (
            <div className="space-y-2.5">
              {interviews.map((item) => {
                const isSelected = selectedInterview?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedInterviewId(item.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? "border-[#171717] bg-white shadow-xs"
                        : "border-[#E8E8E8] bg-[#FAF9F8] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-[#171717]">{item.company} <span className="text-[10px] font-mono text-[#737373]">{item.isDemo ? "DEMO" : "USER-RECORDED"}</span></h4>
                        <p className="text-[11px] text-[#737373]">{item.position}</p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {item.round}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-[#737373] font-mono pt-1">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-[#737373]" />
                        <span>{item.date}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-[#737373]" />
                        <span>{item.time}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col (8): Detail & AI Prep Sheet */}
        <div className="lg:col-span-8 space-y-4">
          {selectedInterview ? (
            <div className="p-6 border border-[#E8E8E8] rounded-xl bg-white space-y-5 shadow-xs">
              {/* Interview Top Card */}
              <div className="flex items-start justify-between border-b border-[#E8E8E8] pb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-semibold text-[#171717]">
                      {selectedInterview.company}
                    </h3>
                    <span className="text-xs text-[#737373]">({selectedInterview.position})</span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-[#737373]">
                    <span>Format: {selectedInterview.format}</span>
                    <span>•</span>
                    <span>Interviewer: {selectedInterview.interviewer || "Not recorded"}</span>
                    <span>•</span>
                    <span className="font-mono text-emerald-700 font-medium">
                      Status: {selectedInterview.status}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleGeneratePrep}
                  disabled={isGeneratingPrep}
                  className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3.5 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingPrep ? "animate-spin text-emerald-400" : ""}`} />
                  <span>{isGeneratingPrep ? "Generating Prep..." : "Generate AI Prep Sheet"}</span>
                </button>
              </div>

              {/* Notes */}
              {selectedInterview.notes && (
                <div className="p-3 bg-[#FAF9F8] border border-[#E8E8E8] rounded-md text-xs text-[#171717]">
                  <strong className="text-[#737373] block mb-0.5">Focus Notes:</strong>
                  {selectedInterview.notes}
                </div>
              )}

              {/* AI Prep Questions */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#171717] flex items-center space-x-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Predicted Technical & Behavioral Questions ({selectedInterview.aiPrepQuestions?.length || 0})</span>
                </h4>

                {selectedInterview.aiPrepQuestions && selectedInterview.aiPrepQuestions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedInterview.aiPrepQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] text-xs space-y-1"
                      >
                        <span className="font-mono text-[10px] text-emerald-800 font-semibold">
                          QUESTION {idx + 1}:
                        </span>
                        <p className="text-[#171717] font-medium">{q}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-[#737373] border border-dashed border-[#E8E8E8] rounded-lg">
                    Click "Generate AI Prep Sheet" to generate targeted technical questions based on your profile and this company stack.
                  </div>
                )}
              </div>

              {/* Strategic Talking Points */}
              {selectedInterview.talkingPoints && selectedInterview.talkingPoints.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#E8E8E8]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#171717] flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tactical Talking Points & Experience Links</span>
                  </h4>
                  <ul className="list-disc list-inside space-y-1.5 text-xs text-[#737373] bg-blue-50/20 p-3.5 rounded-lg border border-blue-100">
                    {selectedInterview.talkingPoints.map((tp, idx) => (
                      <li key={idx} className="text-[#171717]">
                        {tp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373]">
              Select an interview to view preparation notes and AI questions.
            </div>
          )}
        </div>
      </div>

      {/* Add Interview Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[#171717]">Record Interview Details</h3>
            <form onSubmit={handleAddInterview} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Company</label>
                  <input
                    type="text"
                    required
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                    placeholder="e.g. Supabase, Stripe"
                  />
                </div>
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Position</label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                    placeholder="e.g. 2:00 PM EST"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Interview Round</label>
                  <select
                    value={formData.round}
                    onChange={(e: any) => setFormData({ ...formData, round: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  >
                    <option value="Recruiter Screen">Recruiter Screen</option>
                    <option value="Technical Round 1">Technical Round 1</option>
                    <option value="System Design">System Design</option>
                    <option value="Hiring Manager">Hiring Manager</option>
                    <option value="Cultural Fit">Cultural Fit</option>
                    <option value="Final Executive">Final Executive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#171717] font-medium mb-1">Format</label>
                  <select
                    value={formData.format}
                    onChange={(e: any) => setFormData({ ...formData, format: e.target.value })}
                    className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  >
                    <option value="Video Call">Video Call</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#171717] font-medium mb-1">Interviewer Name(s) / Title</label>
                <input
                  type="text"
                  value={formData.interviewer}
                  onChange={(e) => setFormData({ ...formData, interviewer: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="e.g. Sarah K. (Engineering Manager)"
                />
              </div>

              <div>
                <label className="block text-[#171717] font-medium mb-1">Round Notes & Focus</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="Topics to prepare, links, or expectations..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-[#E8E8E8] rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#171717] text-white rounded-md hover:bg-black font-medium"
                >
                  Save Interview Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

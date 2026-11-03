import React, { useState } from "react";
import {
  Mail,
  Sparkles,
  Copy,
  Download,
  Building2,
  Calendar,
  Check,
  Edit3,
} from "lucide-react";
import type { TailoredCoverLetter, Job } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface CoverLettersViewProps {
  coverLetters: TailoredCoverLetter[];
  jobs: Job[];
  onRefreshCoverLetters: () => void;
}

export const CoverLettersView: React.FC<CoverLettersViewProps> = ({
  coverLetters,
  jobs,
  onRefreshCoverLetters,
}) => {
  const [selectedLetterId, setSelectedLetterId] = useState<string>(coverLetters[0]?.id || "");
  const [targetJobId, setTargetJobId] = useState<string>(jobs[0]?.id || "");
  const [selectedTone, setSelectedTone] = useState<"professional" | "assertive" | "conversational">("professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedLetter = coverLetters.find((l) => l.id === selectedLetterId) || coverLetters[0];

  const handleGenerate = async () => {
    const context = createActionContext();
    if (!targetJobId) return;
    setIsGenerating(true);
    try {
      const res = await api.generateCoverLetterForJob(targetJobId, selectedTone, context);
      assertActionContext(context);
      if (res.success && res.coverLetter) {
        setSelectedLetterId(res.coverLetter.id);
      }
      onRefreshCoverLetters();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to generate cover letter: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) { alert(error instanceof Error ? error.message : "Could not copy text"); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight">
            Cover Letters Management
          </h2>
          <p className="text-xs text-[#737373]">
            AI draft letters for saved jobs. Review all candidate and company claims before use.
          </p>
        </div>

        {/* Generate New Letter Controls */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <select
            value={targetJobId}
            onChange={(e) => setTargetJobId(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#E8E8E8] rounded-md bg-white text-[#171717]"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} — {j.position.substring(0, 22)}...
              </option>
            ))}
          </select>

          <select
            value={selectedTone}
            onChange={(e: any) => setSelectedTone(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#E8E8E8] rounded-md bg-white text-[#171717]"
          >
            <option value="professional">Tone: Professional</option>
            <option value="assertive">Tone: Assertive</option>
            <option value="conversational">Tone: Conversational</option>
          </select>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !targetJobId}
            className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3.5 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin text-emerald-400" : ""}`} />
            <span>{isGenerating ? "Synthesizing..." : "Generate Letter"}</span>
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col (4): Letters List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373] px-1">
            Generated Letters ({coverLetters.length})
          </h3>

          {coverLetters.length === 0 ? (
            <div className="p-8 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373]">
              No custom cover letters generated yet. Choose a job above and click "Generate Letter".
            </div>
          ) : (
            <div className="space-y-2">
              {coverLetters.map((letter) => {
                const isSelected = selectedLetter?.id === letter.id;
                return (
                  <div
                    key={letter.id}
                    onClick={() => setSelectedLetterId(letter.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#171717] bg-white shadow-xs"
                        : "border-[#E8E8E8] bg-[#FAF9F8] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#171717] truncate">
                        {letter.company}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#FAF9F8] border border-[#E8E8E8] text-[#737373]">
                        {letter.tone}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737373] truncate mt-0.5">{letter.position}</p>
                    <div className="mt-2 text-[10px] text-[#737373] font-mono">
                      {new Date(letter.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col (8): Letter Viewer */}
        <div className="lg:col-span-8 space-y-4">
          {selectedLetter ? (
            <div className="p-8 border border-[#E8E8E8] rounded-xl bg-white shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#171717]">
                    Cover Letter for {selectedLetter.company}
                  </h3>
                  <p className="text-xs text-[#737373]">{selectedLetter.position}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopy(selectedLetter.letterBody)}
                    className="flex items-center space-x-1 text-xs font-medium text-[#737373] hover:text-[#171717] bg-white border border-[#E8E8E8] px-2.5 py-1.5 rounded-md hover:bg-[#FAF9F8] transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center space-x-1 text-xs font-medium text-[#171717] bg-white border border-[#E8E8E8] px-2.5 py-1.5 rounded-md hover:bg-[#FAF9F8] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-[#737373]" />
                    <span>Print / PDF</span>
                  </button>
                </div>
              </div>

              {/* Key Hooks */}
              {selectedLetter.keyHooks && selectedLetter.keyHooks.length > 0 && (
                <div className="p-3 bg-[#FAF9F8] border border-[#E8E8E8] rounded-md space-y-1">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#737373]">
                    Articulated Value Propositions:
                  </span>
                  <ul className="text-xs text-[#171717] list-disc list-inside space-y-0.5">
                    {selectedLetter.keyHooks.map((hook, i) => (
                      <li key={i}>{hook}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Letter Body */}
              <div className="whitespace-pre-line text-xs text-[#171717] leading-relaxed font-sans bg-[#FAF9F8]/40 p-6 rounded-lg border border-[#E8E8E8]">
                {selectedLetter.letterBody}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373]">
              Select a cover letter on the left to inspect and export.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

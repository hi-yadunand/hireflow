import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Check,
  ShieldAlert,
  Play,
  Cpu,
  Sliders,
  Bell,
  Sparkles,
} from "lucide-react";
import type { AppSettings, AgentStatus } from "../types/index.js";
import { api } from "../lib/api.js";

interface SettingsViewProps {
  settings: AppSettings | null;
  agentStatus: AgentStatus | null;
  onRefreshSettings: () => void;
  onTogglePause: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  agentStatus,
  onRefreshSettings,
  onTogglePause,
}) => {
  if (!settings) return null;

  const [formData, setFormData] = useState<AppSettings>(JSON.parse(JSON.stringify(settings)));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isPaused = agentStatus?.isPaused || formData.emergencyPause;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateSettings(formData);
      onRefreshSettings();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
            <SettingsIcon className="w-4 h-4 text-[#171717]" />
            <span>Platform & Autonomous Agent Configuration</span>
          </h2>
          <p className="text-xs text-[#737373]">
            Fine-tune match thresholds, application modes, daily quotas, and Gemini model backend.
          </p>
        </div>

        {/* Emergency Stop Banner Control */}
        <button
          type="button"
          onClick={onTogglePause}
          className={`flex items-center space-x-1.5 text-xs font-medium px-4 py-2 rounded-md border transition-all ${
            isPaused
              ? "bg-[#171717] text-white border-[#171717] hover:bg-black"
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          }`}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          <span>{isPaused ? "Resume Autonomous Agent" : "Engage Emergency Stop"}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Autonomous Application Mode & Quota */}
        <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-2">
            1. Autonomous Application Mode & Limits
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#171717] font-medium mb-1">Application Mode</label>
              <select
                value={formData.applicationMode}
                onChange={(e: any) => setFormData({ ...formData, applicationMode: e.target.value })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] focus:outline-none focus:border-[#171717]"
              >
                <option value="hybrid">Hybrid (Automatic &gt;=88%, Review for 75-87%)</option>
                <option value="approval_required">Approval Required (Always Stage for Review)</option>
                <option value="automatic">Automatic (Autonomous Direct Staging)</option>
              </select>
              <p className="text-[11px] text-[#737373] mt-1">
                Controls whether the agent can queue submissions autonomously or holds them in Awaiting Approval.
              </p>
            </div>

            <div>
              <label className="block text-[#171717] font-medium mb-1">
                Daily Application Cap ({formData.dailyApplicationLimit})
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={formData.dailyApplicationLimit}
                onChange={(e) => setFormData({ ...formData, dailyApplicationLimit: Number(e.target.value) || 1 })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] focus:outline-none focus:border-[#171717]"
              />
              <p className="text-[11px] text-[#737373] mt-1">
                Prevents spamming ATS systems and ensures quality over high-volume spray-and-pray.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[#171717] font-medium mb-1">
              Minimum AI Compatibility Threshold ({formData.matchThreshold}%)
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={formData.matchThreshold}
                onChange={(e) => setFormData({ ...formData, matchThreshold: Number(e.target.value) })}
                className="flex-1 accent-[#171717]"
              />
              <span className="font-mono text-sm font-bold text-[#171717] w-12 text-right">
                {formData.matchThreshold}%
              </span>
            </div>
            <p className="text-[11px] text-[#737373] mt-1">
              Roles scoring below this percentage will not trigger tailored document synthesis.
            </p>
          </div>
        </div>

        {/* Section 2: Career Targets & Search Filters */}
        <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-2">
            2. Career Targets & Compensation
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#171717] font-medium mb-1">Target Job Titles (comma-separated)</label>
              <input
                type="text"
                value={formData.jobTitles.join(", ")}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    jobTitles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block text-[#171717] font-medium mb-1">Target Skills (comma-separated)</label>
              <input
                type="text"
                value={formData.skills.join(", ")}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block text-[#171717] font-medium mb-1">Minimum Annual Salary (USD)</label>
              <input
                type="number"
                value={formData.salaryMin}
                onChange={(e) => setFormData({ ...formData, salaryMin: Number(e.target.value) || 0 })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block text-[#171717] font-medium mb-1">Experience Level Target</label>
              <select
                value={formData.experienceLevel}
                onChange={(e: any) => setFormData({ ...formData, experienceLevel: e.target.value })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] focus:outline-none focus:border-[#171717]"
              >
                <option value="Any">Any Level</option>
                <option value="Entry">Entry Level</option>
                <option value="Mid">Mid Level</option>
                <option value="Senior">Senior Level</option>
                <option value="Lead">Lead / Staff</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: AI Engine & Gemini Model Config */}
        <div className="p-5 rounded-xl border border-[#E8E8E8] bg-white space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#171717] border-b border-[#E8E8E8] pb-2 flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#171717]" />
            <span>3. Gemini AI Backend Model</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#171717] font-medium mb-1">Active Model</label>
              <select
                value={formData.geminiModel}
                onChange={(e) => setFormData({ ...formData, geminiModel: e.target.value })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] focus:outline-none focus:border-[#171717] font-mono"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended: Low Latency & High Reasoning)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra-fast screening)</option>
              </select>
              <p className="text-[11px] text-[#737373] mt-1">
                Executed securely server-side via the official @google/genai TypeScript SDK.
              </p>
            </div>

            <div>
              <label className="block text-[#171717] font-medium mb-1">Notification Email</label>
              <input
                type="email"
                value={formData.notificationEmail}
                onChange={(e) => setFormData({ ...formData, notificationEmail: e.target.value })}
                className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
              />
            </div>
          </div>
        </div>

        {/* Save Footer */}
        <div className="flex items-center justify-between pt-2">
          {saveSuccess ? (
            <span className="text-xs text-emerald-600 font-medium flex items-center space-x-1">
              <Check className="w-4 h-4" />
              <span>Settings updated successfully!</span>
            </span>
          ) : (
            <span className="text-xs text-[#737373]">Changes take effect immediately on next background cycle.</span>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-5 py-2 rounded-md hover:bg-black transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

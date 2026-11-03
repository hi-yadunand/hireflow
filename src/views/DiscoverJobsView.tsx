import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Plus,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Layers,
  ArrowUpDown,
  FileText,
  Mail,
  Send,
  CheckCircle,
} from "lucide-react";
import type { Job, JobSource } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface DiscoverJobsViewProps {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  onRefreshJobs: () => void;
  onOpenTailorResume: (job: Job) => void;
  onOpenCoverLetter: (job: Job) => void;
}

export const DiscoverJobsView: React.FC<DiscoverJobsViewProps> = ({
  jobs,
  onSelectJob,
  onRefreshJobs,
  onOpenTailorResume,
  onOpenCoverLetter,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedWorkplace, setSelectedWorkplace] = useState<string>("all");
  const [selectedExperience, setSelectedExperience] = useState<string>("all");
  const [minMatch, setMinMatch] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"match" | "date" | "company">("match");

  // Manual job modal state
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [newJobData, setNewJobData] = useState({
    company: "",
    position: "",
    location: "Remote",
    country: "",
    employmentType: "Full-time" as const,
    workplaceType: "Remote" as const,
    salary: "",
    experienceLevel: "Senior" as const,
    source: "Direct Career Page" as JobSource,
    applyUrl: "",
    description: "",
    requirements: "",
  });

  const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);

  // Filtered & sorted jobs
  const filteredJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchCompany = j.company.toLowerCase().includes(q);
          const matchPos = j.position.toLowerCase().includes(q);
          const matchDesc = j.description.toLowerCase().includes(q);
          const matchSkills = j.matchingSkills?.some((s) => s.toLowerCase().includes(q));
          if (!matchCompany && !matchPos && !matchDesc && !matchSkills) return false;
        }

        if (selectedSource !== "all" && j.source.toLowerCase() !== selectedSource.toLowerCase()) {
          return false;
        }

        if (selectedWorkplace !== "all" && j.workplaceType.toLowerCase() !== selectedWorkplace.toLowerCase()) {
          return false;
        }

        if (selectedExperience !== "all" && j.experienceLevel.toLowerCase() !== selectedExperience.toLowerCase()) {
          return false;
        }

        if ((j.matchPercentage || 0) < minMatch) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "match") return (b.matchPercentage || 0) - (a.matchPercentage || 0);
        if (sortBy === "date") return new Date(b.firstDetectedDate).getTime() - new Date(a.firstDetectedDate).getTime();
        return a.company.localeCompare(b.company);
      });
  }, [jobs, searchTerm, selectedSource, selectedWorkplace, selectedExperience, minMatch, sortBy]);

  const handleRunAiAnalysis = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    const context = createActionContext();
    setAnalyzingJobId(job.id);
    try {
      await api.analyzeJob(job.id, context);
      assertActionContext(context);
      onRefreshJobs();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Analysis failed: " + err.message);
    } finally {
      setAnalyzingJobId(null);
    }
  };

  const handleCreateCustomJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const context = createActionContext();
    try {
      await api.createJob({
        ...newJobData,
        requirements: newJobData.requirements.split("\n").map((r) => r.trim()).filter(Boolean),
        niceToHave: [],
      }, context);
      assertActionContext(context);
      setShowAddJobModal(false);
      onRefreshJobs();
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to track job: " + err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search & Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight">
            Discovered Opportunities
          </h2>
          <p className="text-xs text-[#737373]">
            Manually saved listings. No job sources are connected. Sample records are labeled.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowAddJobModal(true)}
            className="flex items-center space-x-1.5 text-xs font-medium bg-[#171717] text-white px-3 py-2 rounded-md hover:bg-black transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Track New Job Listing</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-xl border border-[#E8E8E8] bg-white space-y-3 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search position, company, or tech stack (e.g. Distributed, React, Go)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717] bg-[#FAF9F8]"
            />
          </div>

          {/* Workplace Filter */}
          <select
            value={selectedWorkplace}
            onChange={(e) => setSelectedWorkplace(e.target.value)}
            className="text-xs px-2.5 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717] bg-[#FAF9F8]"
          >
            <option value="all">All Workplace Types</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on-site">On-site</option>
          </select>

          {/* Source Filter */}
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="text-xs px-2.5 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717] bg-[#FAF9F8]"
          >
            <option value="all">All Sources</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
            <option value="himalayas">Himalayas</option>
            <option value="peerlist">Peerlist</option>
            <option value="direct career page">Direct Career Pages</option>
          </select>
        </div>

        {/* Second Row: Experience, Match Threshold, Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F0F0EF] text-xs text-[#737373]">
          <div className="flex items-center space-x-4 flex-wrap gap-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium text-[#171717]">Min Match:</span>
              <input
                type="range"
                min="0"
                max="95"
                step="5"
                value={minMatch}
                onChange={(e) => setMinMatch(Number(e.target.value))}
                className="w-24 accent-[#171717]"
              />
              <span className="font-mono text-[11px] text-[#171717]">{minMatch}%</span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-medium text-[#171717]">Experience:</span>
              <select
                value={selectedExperience}
                onChange={(e) => setSelectedExperience(e.target.value)}
                className="text-xs px-2 py-1 border border-[#E8E8E8] rounded bg-white"
              >
                <option value="all">Any Level</option>
                <option value="entry">Entry</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead / Staff</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="text-xs px-2 py-1 border border-[#E8E8E8] rounded bg-white font-medium text-[#171717]"
            >
              <option value="match">Match Percentage</option>
              <option value="date">Date Detected</option>
              <option value="company">Company Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Jobs Feed / Cards */}
      <div className="space-y-3">
        <div className="text-xs text-[#737373] font-mono px-1 flex justify-between">
          <span>SHOWING {filteredJobs.length} QUALIFIED ROLES</span>
          <span>MANUAL PROCESSING ONLY</span>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center border border-[#E8E8E8] rounded-xl bg-white text-xs text-[#737373]">
            No jobs match your filter criteria. Try adjusting the match threshold or clearing the search term.
          </div>
        ) : (
          filteredJobs.map((job) => {
            const isAnalyzing = analyzingJobId === job.id;
            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job)}
                className="p-5 rounded-xl border border-[#E8E8E8] bg-white hover:border-[#171717] transition-all cursor-pointer shadow-2xs group space-y-3.5"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h3 className="text-sm font-semibold text-[#171717] group-hover:underline">
                        {job.position}
                      </h3>
                      {job.isDemo && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                          SAMPLE
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F8F8F7] border border-[#E8E8E8] text-[#171717]">
                        {job.source}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-[#737373] flex-wrap gap-y-1">
                      <span className="font-medium text-[#171717] flex items-center space-x-1">
                        <Building2 className="w-3.5 h-3.5 text-[#737373]" />
                        <span>{job.company}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-[#737373]" />
                        <span>{job.location} ({job.workplaceType})</span>
                      </span>
                      {job.salary && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-[#171717]">{job.salary}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Match Score Badge */}
                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <div
                      className={`px-3 py-1.5 rounded-lg border font-mono text-center ${
                        job.matchPercentage >= 85
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : job.matchPercentage >= 70
                          ? "bg-blue-50 border-blue-200 text-blue-800"
                          : "bg-gray-50 border-gray-200 text-gray-700"
                      }`}
                    >
                      <div className="text-sm font-bold leading-none">
                        {job.matchPercentage || 0}%
                      </div>
                      <div className="text-[9px] uppercase tracking-wider mt-0.5">FIT SCORE</div>
                    </div>
                  </div>
                </div>

                {/* Description Snippet */}
                <p className="text-xs text-[#737373] leading-relaxed line-clamp-2">
                  {job.description}
                </p>

                {/* Matching Skills vs Missing Skills */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F0F0EF] text-xs">
                  <span className="text-[11px] font-medium text-[#171717]">Matching:</span>
                  <div className="flex flex-wrap gap-1">
                    {job.matchingSkills?.slice(0, 5).map((sk) => (
                      <span
                        key={sk}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>

                  {job.missingSkills && job.missingSkills.length > 0 && (
                    <div className="flex items-center space-x-1.5 ml-auto text-[11px] text-[#737373]">
                      <span>Gaps:</span>
                      <span className="font-mono text-amber-700">{job.missingSkills.slice(0, 2).join(", ")}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action Strip */}
                <div className="flex items-center justify-between pt-2 text-xs">
                  <div className="flex items-center space-x-2 text-[10px] text-[#737373] font-mono">
                    <span>Published: {new Date(job.publicationDate).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.2 rounded bg-[#FAF9F8] border border-[#E8E8E8] text-[#171717]">
                      Status: {job.applicationStatus}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => handleRunAiAnalysis(e, job)}
                      disabled={isAnalyzing}
                      className="flex items-center space-x-1 text-[11px] font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-2.5 py-1 rounded transition-colors"
                      title="Run on-demand Gemini semantic evaluation"
                    >
                      <Sparkles className={`w-3 h-3 text-emerald-600 ${isAnalyzing ? "animate-spin" : ""}`} />
                      <span>{isAnalyzing ? "Analyzing..." : "Re-evaluate"}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTailorResume(job);
                      }}
                      className="flex items-center space-x-1 text-[11px] font-medium text-[#171717] hover:underline px-2 py-1"
                    >
                      <FileText className="w-3 h-3 text-[#737373]" />
                      <span>Tailor CV</span>
                    </button>

                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center space-x-1 text-[11px] font-medium text-[#171717] hover:underline px-2 py-1 font-mono"
                    >
                      <span>Direct Portal</span>
                      <ExternalLink className="w-3 h-3 text-[#737373]" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Manual Track Job Modal */}
      {showAddJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[#171717]">Track Custom Job Opportunity</h3>
            <form onSubmit={handleCreateCustomJob} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#171717] font-medium mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={newJobData.company}
                  onChange={(e) => setNewJobData({ ...newJobData, company: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="e.g. OpenAI, Figma, Anthropic"
                />
              </div>
              <div>
                <label className="block text-[#171717] font-medium mb-1">Job Title / Position</label>
                <input
                  type="text"
                  required
                  value={newJobData.position}
                  onChange={(e) => setNewJobData({ ...newJobData, position: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="e.g. Senior Backend Engineer"
                />
              </div>
              <div>
                <label className="block text-[#171717] font-medium mb-1">Direct Application URL</label>
                <input
                  type="url"
                  required
                  value={newJobData.applyUrl}
                  onChange={(e) => setNewJobData({ ...newJobData, applyUrl: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-[#171717] font-medium mb-1">Job Description</label>
                <textarea
                  rows={4}
                  required
                  value={newJobData.description}
                  onChange={(e) => setNewJobData({ ...newJobData, description: e.target.value })}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="Paste job posting details..."
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddJobModal(false)}
                  className="px-3 py-1.5 border border-[#E8E8E8] rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#171717] text-white rounded-md hover:bg-black font-medium"
                >
                  Track Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useRef } from "react";
import {
  X,
  User,
  GraduationCap,
  Briefcase,
  Code2,
  FolderGit2,
  Award,
  Sliders,
  Upload,
  Check,
  Plus,
  Trash2,
  Sparkles,
  FileText,
  AlertCircle,
} from "lucide-react";
import type { Profile, WorkExperience, Education, Project } from "../types/index.js";
import { api, createActionContext, isCurrentContext, assertActionContext } from "../lib/api.js";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onProfileUpdated: (profile: Profile) => void;
}

type TabKey = "personal" | "experience" | "education" | "skills" | "projects" | "preferences" | "import";

export const ProfileModal: React.FC<ProfileModalProps> = (props) => {
  if (!props.isOpen || !props.profile) return null;
  return <ProfileEditor key={props.profile.revision || props.profile.updatedAt} {...props} profile={props.profile} />;
};

const ProfileEditor: React.FC<ProfileModalProps & { profile: Profile }> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {

  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [formData, setDraft] = useState<Profile>(JSON.parse(JSON.stringify(profile)));
  const draftRevision = useRef(0);
  const confirmedRevision = useRef<number | null>(null);
  const setFormData: React.Dispatch<React.SetStateAction<Profile>> = update => {
    draftRevision.current++;
    confirmedRevision.current = null;
    setConfirmed(false);
    setDraft(previous => typeof update === "function" ? update(structuredClone(previous)) : structuredClone(update));
  };
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Resume Import State
  const [resumeText, setResumeText] = useState("");
  const resumeSource = useRef("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<Profile> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Skill input helper
  const [newSkill, setNewSkill] = useState("");

  const handleSave = async () => {
    const context = createActionContext(), savingRevision = draftRevision.current;
    if (!confirmed || confirmedRevision.current !== savingRevision) { alert("Review every profile field and confirm accuracy before saving."); return; }
    setIsSaving(true);
    try {
      const updated = await api.updateProfile(formData, confirmed, context);
      assertActionContext(context);
      if (draftRevision.current !== savingRevision) { setDraft(previous => ({ ...previous, revision: updated.revision })); return; }
      onProfileUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      if (isCurrentContext(context)) alert("Failed to save profile: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSkill = () => {
    if (!newSkill.trim()) return;
    if (!formData.skills.includes(newSkill.trim())) {
      setFormData({ ...formData, skills: [...formData.skills, newSkill.trim()] });
    }
    setNewSkill("");
  };

  const handleRemoveSkill = (skill: string) => {
    setFormData({ ...formData, skills: formData.skills.filter((s) => s !== skill) });
  };

  // Add work experience item
  const handleAddExperience = (type: WorkExperience["type"] = "Full-time") => {
    const newExp: WorkExperience = {
      id: `exp-${Date.now()}`,
      company: "",
      role: "",
      location: "",
      type,
      startDate: "",
      endDate: "",
      current: false,
      description: "",
      highlights: [""],
    };
    setFormData({ ...formData, experience: [newExp, ...formData.experience] });
  };

  const handleRemoveExperience = (id: string) => {
    setFormData({ ...formData, experience: formData.experience.filter((e) => e.id !== id) });
  };

  // Add education
  const handleAddEducation = () => {
    const newEdu: Education = {
      id: `edu-${Date.now()}`,
      institution: "",
      degree: "",
      fieldOfStudy: "",
      startDate: "",
      endDate: "",
      gpa: "",
    };
    setFormData({ ...formData, education: [newEdu, ...formData.education] });
  };

  // Add Project
  const handleAddProject = () => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      title: "",
      description: "",
      technologies: [],
      highlights: [""],
    };
    setFormData({ ...formData, projects: [newProj, ...formData.projects] });
  };

  // Handle Resume File Upload & Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.(txt|md)$/i.test(file.name)) { setParseError("PDF and Word extraction is not implemented. Paste extracted text or upload TXT/Markdown."); return; }
    const reader = new FileReader();
    reader.onerror = () => setParseError("Could not read the selected file.");
    reader.onload = (event) => {
      const content = event.target?.result as string;
      resumeSource.current = content || ""; setParsedPreview(null); setResumeText(content || "");
    };
    reader.readAsText(file);
  };

  const handleTriggerAIParsing = async () => {
    if (!resumeText.trim()) {
      setParseError("Please paste or upload resume text to analyze.");
      return;
    }
    const context = createActionContext(), parsingRevision = draftRevision.current, sourceText = resumeText;
    setParseError(null);
    setIsParsing(true);
    try {
      const res = await api.uploadResume(resumeText, context);
      assertActionContext(context);
      if (parsingRevision !== draftRevision.current || sourceText !== resumeSource.current) throw new Error("Profile or resume text changed during extraction. Run extraction again.");
      if (res.success && res.parsed) {
        setParsedPreview(res.parsed);
      }
    } catch (err: any) {
      if (isCurrentContext(context)) setParseError(err.message || "Failed to parse resume with AI.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleLoadLegacy = async () => {
    const context = createActionContext(), importingRevision = draftRevision.current;
    try {
      const legacy = await api.getLegacyProfile(context);
      assertActionContext(context);
      if (importingRevision !== draftRevision.current) throw new Error("Profile changed while loading legacy data. Review the current draft before importing again.");
      if (legacy.profile.isDemo) {
        alert("This preserved profile is demonstration data. Use Demo preview to inspect it; enter your own real profile here.");
        return;
      }
      setFormData({ ...legacy.profile, revision: formData.revision, isDemo: false, reviewedAt: undefined });
      alert(legacy.warning);
    } catch (error) {
      if (isCurrentContext(context)) alert(error instanceof Error ? error.message : "Could not load legacy profile");
    }
  };

  const handleApplyParsedResume = () => {
    if (!parsedPreview) return;
    setFormData((prev) => ({
      ...prev,
      personal: parsedPreview.personal || prev.personal,
      skills: parsedPreview.skills || [],
      experience: parsedPreview.experience || [],
      education: parsedPreview.education || [],
      languages: parsedPreview.languages || [],
      // Project/certification edits remain intact; only extracted sections are replaced.
      reviewedAt: undefined,
    }));
    setConfirmed(false);
    setParsedPreview(null);
    setResumeText("");
    setActiveTab("personal");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-[#FFFFFF] border border-[#E8E8E8] rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E8E8E8] flex items-center justify-between bg-[#FAF9F8]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#171717] tracking-tight">
                Master Professional Profile
              </h2>
              <p className="text-xs text-[#737373]">
                Review your profile for accuracy before using Gemini draft generation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-[#171717] p-1.5 rounded-md hover:bg-[#EFEFEF] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#E8E8E8] px-6 bg-[#FFFFFF] overflow-x-auto text-xs font-medium space-x-1">
          {[
            { id: "personal", label: "Personal & Links", icon: User },
            { id: "experience", label: "Work & Internships", icon: Briefcase },
            { id: "education", label: "Education", icon: GraduationCap },
            { id: "skills", label: "Skills & Certs", icon: Code2 },
            { id: "projects", label: "Projects", icon: FolderGit2 },
            { id: "preferences", label: "Preferences & Visa", icon: Sliders },
            { id: "import", label: "Resume Import (AI)", icon: Upload },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
                className={`py-3 px-3 flex items-center space-x-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "border-[#171717] text-[#171717]"
                    : "border-transparent text-[#737373] hover:text-[#171717]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PERSONAL & CONTACT */}
          {activeTab === "personal" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={formData.personal.fullName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        personal: { ...formData.personal, fullName: e.target.value },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">Professional Email</label>
                  <input
                    type="email"
                    value={formData.personal.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        personal: { ...formData.personal, email: e.target.value },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.personal.phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        personal: { ...formData.personal, phone: e.target.value },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">Location / Base</label>
                  <input
                    type="text"
                    value={formData.personal.location}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        personal: { ...formData.personal, location: e.target.value },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={formData.personal.headline}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      personal: { ...formData.personal, headline: e.target.value },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  placeholder="e.g. Senior Full-Stack & Distributed Systems Engineer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Executive Summary</label>
                <textarea
                  rows={3}
                  value={formData.personal.summary}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      personal: { ...formData.personal, summary: e.target.value },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div className="pt-2 border-t border-[#E8E8E8]">
                <h4 className="text-xs font-semibold text-[#171717] mb-3">Links & Profiles</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#737373] mb-1">LinkedIn URL</label>
                    <input
                      type="url"
                      value={formData.personal.linkedinUrl || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          personal: { ...formData.personal, linkedinUrl: e.target.value },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#737373] mb-1">GitHub URL</label>
                    <input
                      type="url"
                      value={formData.personal.githubUrl || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          personal: { ...formData.personal, githubUrl: e.target.value },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#737373] mb-1">Portfolio / Website</label>
                    <input
                      type="url"
                      value={formData.personal.portfolioUrl || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          personal: { ...formData.personal, portfolioUrl: e.target.value },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORK EXPERIENCE & INTERNSHIPS */}
          {activeTab === "experience" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#737373]">
                  Review all positions and accomplishments before generating AI drafts.
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleAddExperience("Full-time")}
                    className="flex items-center space-x-1 text-xs font-medium bg-[#171717] text-white px-2.5 py-1.5 rounded-md hover:bg-black transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Role</span>
                  </button>
                  <button
                    onClick={() => handleAddExperience("Internship")}
                    className="flex items-center space-x-1 text-xs font-medium bg-[#F8F8F7] border border-[#E8E8E8] text-[#171717] px-2.5 py-1.5 rounded-md hover:bg-[#EFEFEF] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Internship</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {formData.experience.map((exp, idx) => (
                  <div key={exp.id} className="p-4 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 mr-4">
                        <input
                          type="text"
                          placeholder="Role Title (e.g. Senior Software Engineer)"
                          value={exp.role}
                          onChange={(e) => {
                            const next = [...formData.experience];
                            next[idx].role = e.target.value;
                            setFormData({ ...formData, experience: next });
                          }}
                          className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                        />
                        <input
                          type="text"
                          placeholder="Company Name"
                          value={exp.company}
                          onChange={(e) => {
                            const next = [...formData.experience];
                            next[idx].company = e.target.value;
                            setFormData({ ...formData, experience: next });
                          }}
                          className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                        />
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Start (e.g. 2022-04)"
                            value={exp.startDate}
                            onChange={(e) => {
                              const next = [...formData.experience];
                              next[idx].startDate = e.target.value;
                              setFormData({ ...formData, experience: next });
                            }}
                            className="w-1/2 text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                          />
                          <input
                            type="text"
                            placeholder="End or Present"
                            value={exp.endDate}
                            onChange={(e) => {
                              const next = [...formData.experience];
                              next[idx].endDate = e.target.value;
                              setFormData({ ...formData, experience: next });
                            }}
                            className="w-1/2 text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveExperience(exp.id)}
                        className="text-[#737373] hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-medium text-[#737373]">
                        Key Highlights / Deliverables (Bullet Points)
                      </label>
                      {exp.highlights.map((hl, hlIdx) => (
                        <div key={hlIdx} className="flex items-center space-x-2">
                          <span className="text-xs text-[#737373] font-mono">•</span>
                          <input
                            type="text"
                            value={hl}
                            onChange={(e) => {
                              const nextExp = [...formData.experience];
                              nextExp[idx].highlights[hlIdx] = e.target.value;
                              setFormData({ ...formData, experience: nextExp });
                            }}
                            placeholder="Spearheaded architecture of distributed streaming pipeline reducing latency by 40%..."
                            className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                          />
                          {exp.highlights.length > 1 && (
                            <button
                              onClick={() => {
                                const nextExp = [...formData.experience];
                                nextExp[idx].highlights = nextExp[idx].highlights.filter((_, i) => i !== hlIdx);
                                setFormData({ ...formData, experience: nextExp });
                              }}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const nextExp = [...formData.experience];
                          nextExp[idx].highlights.push("");
                          setFormData({ ...formData, experience: nextExp });
                        }}
                        className="text-[11px] text-[#171717] hover:underline font-medium mt-1 inline-flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add bullet point</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EDUCATION */}
          {activeTab === "education" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#737373]">Degrees, institutions, and academic qualifications.</p>
                <button
                  onClick={handleAddEducation}
                  className="flex items-center space-x-1 text-xs font-medium bg-[#171717] text-white px-2.5 py-1.5 rounded-md hover:bg-black transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Education</span>
                </button>
              </div>

              {formData.education.map((edu, idx) => (
                <div key={edu.id} className="p-4 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 mr-4">
                      <input
                        type="text"
                        placeholder="Institution (e.g. UC Berkeley)"
                        value={edu.institution}
                        onChange={(e) => {
                          const next = [...formData.education];
                          next[idx].institution = e.target.value;
                          setFormData({ ...formData, education: next });
                        }}
                        className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      />
                      <input
                        type="text"
                        placeholder="Degree & Major (e.g. B.S. in Computer Science)"
                        value={edu.degree ? `${edu.degree} - ${edu.fieldOfStudy}` : ""}
                        onChange={(e) => {
                          const next = [...formData.education];
                          const parts = e.target.value.split("-");
                          next[idx].degree = parts[0]?.trim() || "";
                          next[idx].fieldOfStudy = parts[1]?.trim() || parts[0]?.trim() || "";
                          setFormData({ ...formData, education: next });
                        }}
                        className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      />
                      <input
                        type="text"
                        placeholder="Graduation Year / Dates"
                        value={`${edu.startDate || ""} - ${edu.endDate || ""}`}
                        onChange={(e) => {
                          const next = [...formData.education];
                          const parts = e.target.value.split(/\s+[–—-]\s+/);
                          next[idx].startDate = parts[0]?.trim() || "";
                          next[idx].endDate = parts[1]?.trim() || "";
                          setFormData({ ...formData, education: next });
                        }}
                        className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          education: formData.education.filter((e) => e.id !== edu.id),
                        })
                      }
                      className="text-[#737373] hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: SKILLS & CERTS */}
          {activeTab === "skills" && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-[#171717] mb-2">Technical Skills</label>
                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
                    placeholder="Add skill (e.g. Kubernetes, Rust, GraphQL)..."
                    className="flex-1 text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                  <button
                    onClick={handleAddSkill}
                    className="text-xs font-medium bg-[#171717] text-white px-3 py-2 rounded-md hover:bg-black transition-colors"
                  >
                    Add Skill
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {formData.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs bg-[#F8F8F7] border border-[#E8E8E8] text-[#171717] font-mono"
                    >
                      <span>{skill}</span>
                      <button
                        onClick={() => handleRemoveSkill(skill)}
                        className="text-[#737373] hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-[#E8E8E8]">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-semibold text-[#171717]">Certifications</label>
                  <button
                    onClick={() => {
                      const newCert = {
                        id: `cert-${Date.now()}`,
                        name: "",
                        issuer: "",
                        issueDate: "",
                      };
                      setFormData({ ...formData, certifications: [...formData.certifications, newCert] });
                    }}
                    className="text-xs font-medium text-[#171717] hover:underline"
                  >
                    + Add Certification
                  </button>
                </div>
                {formData.certifications.map((c, i) => (
                  <div key={c.id} className="p-3 border border-[#E8E8E8] rounded-md bg-[#FAF9F8] flex items-center justify-between mb-2">
                    <div className="text-xs">
                      {(["name", "issuer", "issueDate", "credentialUrl"] as const).map(field => <input key={field} aria-label={`Certification ${field}`} placeholder={field} value={c[field] || ""} onChange={e => setFormData(previous => ({ ...previous, certifications: previous.certifications.map((cert, index) => index === i ? { ...cert, [field]: e.target.value } : cert) }))} className="text-xs px-2 py-1 border border-[#E8E8E8] rounded-md" />)}
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          certifications: formData.certifications.filter((_, idx) => idx !== i),
                        })
                      }
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: PROJECTS */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#737373]">Featured open source and engineering projects.</p>
                <button
                  onClick={handleAddProject}
                  className="flex items-center space-x-1 text-xs font-medium bg-[#171717] text-white px-2.5 py-1.5 rounded-md hover:bg-black transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Project</span>
                </button>
              </div>

              {formData.projects.map((proj, idx) => (
                <div key={proj.id} className="p-4 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8] space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 mr-4">
                      <input
                        type="text"
                        placeholder="Project Title"
                        value={proj.title}
                        onChange={(e) => {
                          const next = [...formData.projects];
                          next[idx].title = e.target.value;
                          setFormData({ ...formData, projects: next });
                        }}
                        className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      />
                      <input
                        type="text"
                        placeholder="Repository URL / Demo URL"
                        value={proj.repoUrl || proj.liveUrl || ""}
                        onChange={(e) => {
                          const next = [...formData.projects];
                          next[idx].repoUrl = e.target.value;
                          setFormData({ ...formData, projects: next });
                        }}
                        className="text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                      />
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          projects: formData.projects.filter((p) => p.id !== proj.id),
                        })
                      }
                      className="text-[#737373] hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Project description and architecture overview..."
                    value={proj.description}
                    onChange={(e) => {
                      const next = [...formData.projects];
                      next[idx].description = e.target.value;
                      setFormData({ ...formData, projects: next });
                    }}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
              ))}
            </div>
          )}

          {/* TAB 6: PREFERENCES & VISA */}
          {activeTab === "preferences" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Expected Minimum Salary (Annual USD)
                  </label>
                  <input
                    type="number"
                    value={formData.preferences.expectedSalary.min}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        preferences: {
                          ...formData.preferences,
                          expectedSalary: {
                            ...formData.preferences.expectedSalary,
                            min: Number(e.target.value) || 0,
                          },
                        },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Remote Work Preference
                  </label>
                  <select
                    value={formData.preferences.remotePreference}
                    onChange={(e: any) =>
                      setFormData({
                        ...formData,
                        preferences: {
                          ...formData.preferences,
                          remotePreference: e.target.value,
                        },
                      })
                    }
                    className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                  >
                    <option value="remote_only">Remote Only</option>
                    <option value="hybrid_flexible">Hybrid / Flexible</option>
                    <option value="onsite_allowed">Onsite Allowed</option>
                    <option value="any">Any Workplace</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Target Job Titles (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.preferences.desiredTitles.join(", ")}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferences: {
                        ...formData.preferences,
                        desiredTitles: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Preferred Countries / Markets (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.preferences.preferredCountries.join(", ")}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferences: {
                        ...formData.preferences,
                        preferredCountries: e.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div className="pt-3 border-t border-[#E8E8E8]">
                <h4 className="text-xs font-semibold text-[#171717] mb-2">Work Authorization & Sponsorship</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-[#737373] mb-1">Status</label>
                    <select
                      value={formData.preferences.workAuthorization.status}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          preferences: {
                            ...formData.preferences,
                            workAuthorization: {
                              ...formData.preferences.workAuthorization,
                              status: e.target.value,
                            },
                          },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                    >
                      <option value="Not provided">Not provided</option>
                      <option value="Citizen">Citizen</option>
                      <option value="Permanent Resident">Permanent Resident (Green Card)</option>
                      <option value="Work Visa">Work Visa (H1B / TN / O1)</option>
                      <option value="Requires Sponsorship">Requires Visa Sponsorship</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#737373] mb-1">Details for Applications</label>
                    <input
                      type="text"
                      value={formData.preferences.workAuthorization.details}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          preferences: {
                            ...formData.preferences,
                            workAuthorization: {
                              ...formData.preferences.workAuthorization,
                              details: e.target.value,
                            },
                          },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: RESUME IMPORT (AI PARSER) */}
          {activeTab === "import" && (
            <div className="space-y-4">
              <div className="p-4 border border-[#E8E8E8] rounded-lg bg-[#FAF9F8]">
                <h4 className="text-xs font-semibold text-[#171717] mb-1 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Gemini-Powered Resume Parser</span>
                </h4>
                <p className="text-xs text-[#737373] mb-3">
                  Upload TXT / Markdown or paste extracted resume text. PDF / DOCX extraction is not implemented. Gemini will extract personal details, work history, skills, and education into your master profile for review.
                </p>

                <div className="flex items-center space-x-3 mb-3">
                  <label className="flex items-center space-x-2 text-xs font-medium bg-white border border-[#E8E8E8] px-3 py-2 rounded-md hover:bg-[#F8F8F7] cursor-pointer transition-colors">
                    <FileText className="w-4 h-4 text-[#737373]" />
                    <span>Upload Resume Text (TXT, MD)</span>
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-[#737373]">or paste raw text below</span>
                </div>

                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={(e) => { resumeSource.current = e.target.value; setParsedPreview(null); setResumeText(e.target.value); }}
                  placeholder="Paste resume text here (Experience, Education, Skills, Projects)..."
                  className="w-full text-xs p-3 font-mono bg-white border border-[#E8E8E8] rounded-md focus:outline-none focus:border-[#171717]"
                />

                {parseError && (
                  <div className="mt-2 text-xs text-red-600 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{parseError}</span>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleTriggerAIParsing}
                    disabled={isParsing || !resumeText.trim() || profile.isDemo}
                    className={`flex items-center space-x-1.5 text-xs font-medium px-4 py-2 rounded-md transition-colors ${
                      isParsing || !resumeText.trim()
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-[#171717] text-white hover:bg-black"
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isParsing ? "animate-spin" : ""}`} />
                    <span>{isParsing ? "Analyzing with Gemini..." : "Extract Profile Data"}</span>
                  </button>
                </div>
              </div>

              {/* Parsed Preview Modal Section */}
              {parsedPreview && (
                <div className="p-4 border-2 border-emerald-500/30 rounded-lg bg-emerald-50/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-semibold text-emerald-900 flex items-center space-x-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Review extraction — accepting replaces personal details, skills, experience, education and languages</span>
                    </h5>
                    <button
                      onClick={handleApplyParsedResume}
                      className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 transition-colors shadow-xs"
                    >
                      Replace Imported Sections
                    </button>
                  </div>

                  <div className="text-xs space-y-2 text-[#171717]">
                    <p>
                      <strong className="text-[#737373]">Extracted Name:</strong>{" "}
                      {parsedPreview.personal?.fullName} ({parsedPreview.personal?.headline})
                    </p>
                    <p>
                      <strong className="text-[#737373]">Identified Skills ({parsedPreview.skills?.length || 0}):</strong>{" "}
                      {parsedPreview.skills?.join(", ")}
                    </p>
                    <p>
                      <strong className="text-[#737373]">Experience Positions ({parsedPreview.experience?.length || 0}):</strong>{" "}
                      {parsedPreview.experience?.map((e: any) => `${e.role} at ${e.company}`).join(" • ")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#E8E8E8] flex items-center justify-between bg-[#FAF9F8]">
          <div className="text-xs text-[#737373]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={e => { confirmedRevision.current = e.target.checked ? draftRevision.current : null; setConfirmed(e.target.checked); }} />I reviewed all fields and confirm their accuracy</label>
            {profile.legacyProfileAvailable && <button type="button" className="underline" onClick={handleLoadLegacy}>Review preserved legacy profile (unverified)</button>}
            {saveSuccess ? (
              <span className="text-emerald-600 font-medium flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>Profile updated successfully!</span>
              </span>
            ) : (
              <span>Last updated: {new Date(formData.updatedAt).toLocaleDateString()}</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="text-xs font-medium text-[#737373] hover:text-[#171717] px-3 py-1.5 rounded-md hover:bg-[#EFEFEF] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || profile.isDemo}
              className="text-xs font-medium bg-[#171717] text-white px-4 py-1.5 rounded-md hover:bg-black transition-colors shadow-xs flex items-center space-x-1.5"
            >
              {isSaving && <Sparkles className="w-3 h-3 animate-spin" />}
              <span>{isSaving ? "Saving..." : "Save Master Profile"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

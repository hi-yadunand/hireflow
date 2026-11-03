import type {
  Profile,
  Job,
  ConnectorInfo,
  ApplicationRecord,
  TailoredResume,
  TailoredCoverLetter,
  InterviewRecord,
  AgentLog,
  AgentStatus,
  AppSettings,
} from "../types/index.js";

export interface ActionContext { readonly mode: "real" | "demo"; readonly generation: number; readonly signal: AbortSignal; }
let generation = 0;
let controller = new AbortController();
let currentContext: ActionContext = Object.freeze({ mode: "real", generation, signal: controller.signal });
export function setDataMode(mode: "real" | "demo") {
  controller.abort(); controller = new AbortController();
  currentContext = Object.freeze({ mode, generation: ++generation, signal: controller.signal });
}
export function getDataMode() { return currentContext.mode; }
export function createActionContext() { return currentContext; }
export function isCurrentContext(context: ActionContext) { return context === currentContext && !context.signal.aborted; }
export function assertActionContext(context: ActionContext) {
  if (!isCurrentContext(context)) throw new Error("Action cancelled: data mode changed.");
}
async function request<T>(url: string, options?: RequestInit, context: ActionContext = createActionContext()): Promise<T> {
  assertActionContext(context);
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}), "X-HireFlow-Mode": context.mode },
    signal: context.signal,
  });
  assertActionContext(context);
  const body = await res.json().catch(() => { throw new Error(`Invalid server response (HTTP ${res.status})`); });
  assertActionContext(context);
  if (!res.ok) throw new Error(body.error || body.message || `Request failed with status ${res.status}`);
  return body;
}

export const api = {
  // Profile
  getProfile: (context?: ActionContext) => request<Profile>("/api/profile", undefined, context),
  getLegacyProfile: (context?: ActionContext) => request<{ profile: Profile; warning: string }>("/api/profile/legacy", undefined, context),
  updateProfile: (profile: Partial<Profile>, confirmAccuracy = false, context?: ActionContext) =>
    request<Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ ...profile, confirmAccuracy, expectedVersion: profile.revision }),
    }, context),
  uploadResume: (rawText: string, context?: ActionContext) =>
    request<{ success: boolean; parsed: Partial<Profile> }>("/api/profile/upload-resume", {
      method: "POST",
      body: JSON.stringify({ rawText }),
    }, context),

  // Jobs
  getJobs: (params?: { search?: string; source?: string; workplaceType?: string; minMatch?: number }, context?: ActionContext) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.source) query.set("source", params.source);
    if (params?.workplaceType) query.set("workplaceType", params.workplaceType);
    if (params?.minMatch !== undefined) query.set("minMatch", params.minMatch.toString());
    const qs = query.toString();
    return request<Job[]>(`/api/jobs${qs ? `?${qs}` : ""}`, undefined, context);
  },
  createJob: (job: Partial<Job>, context?: ActionContext) =>
    request<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(job),
    }, context),
  getJob: (id: string, context?: ActionContext) => request<Job>(`/api/jobs/${id}`, undefined, context),
  updateJob: (id: string, updates: Partial<Job>, context?: ActionContext) =>
    request<Job>(`/api/jobs/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }, context),
  deleteJob: (id: string, context?: ActionContext) =>
    request<{ success: boolean }>(`/api/jobs/${id}`, {
      method: "DELETE",
    }, context),
  analyzeJob: (id: string, context?: ActionContext) =>
    request<{ success: boolean; analysis: any; job: Job }>(`/api/jobs/${id}/analyze`, {
      method: "POST",
    }, context),
  tailorResumeForJob: (id: string, context?: ActionContext) =>
    request<{ success: boolean; tailoredResume: TailoredResume }>(`/api/jobs/${id}/tailor-resume`, {
      method: "POST",
    }, context),
  generateCoverLetterForJob: (id: string, tone?: string, context?: ActionContext) =>
    request<{ success: boolean; coverLetter: TailoredCoverLetter }>(`/api/jobs/${id}/generate-cover-letter`, {
      method: "POST",
      body: JSON.stringify({ tone }),
    }, context),

  // Connectors
  getConnectors: (context?: ActionContext) => request<ConnectorInfo[]>("/api/connectors", undefined, context),
  updateConnector: (id: string, updates: Partial<ConnectorInfo>, context?: ActionContext) =>
    request<ConnectorInfo>(`/api/connectors/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }, context),

  // Applications
  getApplications: (context?: ActionContext) => request<ApplicationRecord[]>("/api/applications", undefined, context),
  createApplication: (app: Partial<ApplicationRecord>, context?: ActionContext) =>
    request<ApplicationRecord>("/api/applications", {
      method: "POST",
      body: JSON.stringify(app),
    }, context),
  updateApplication: (id: string, updates: Partial<ApplicationRecord> & { statusMessage?: string }, context?: ActionContext) =>
    request<ApplicationRecord>(`/api/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }, context),

  recordManualApplication: (data: { jobId: string; status: "Rejected" | "Interview" | "Submission Unverified"; reviewNotes?: string; applicationAnswers?: ApplicationRecord["applicationAnswers"] }, context?: ActionContext) =>
    request<ApplicationRecord>("/api/applications/record", { method: "POST", body: JSON.stringify(data) }, context),
  generateAndSaveInterviewPrep: (id: string, context?: ActionContext) =>
    request<InterviewRecord>(`/api/interviews/${id}/generate-prep`, { method: "POST" }, context),

  // Resumes & Letters
  getResumes: (context?: ActionContext) => request<TailoredResume[]>("/api/resumes", undefined, context),
  getCoverLetters: (context?: ActionContext) => request<TailoredCoverLetter[]>("/api/cover-letters", undefined, context),

  // Interviews
  getInterviews: (context?: ActionContext) => request<InterviewRecord[]>("/api/interviews", undefined, context),
  createInterview: (interview: Partial<InterviewRecord>, context?: ActionContext) =>
    request<InterviewRecord>("/api/interviews", {
      method: "POST",
      body: JSON.stringify(interview),
    }, context),
  updateInterview: (id: string, updates: Partial<InterviewRecord>, context?: ActionContext) =>
    request<InterviewRecord>(`/api/interviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }, context),
  generateInterviewPrep: (data: { company: string; position: string; round: string }, context?: ActionContext) =>
    request<{
      questions: string[];
      talkingPoints: string[];
      companyInsights: string;
      pitfallsToAvoid: string[];
    }>("/api/interviews/generate-prep", {
      method: "POST",
      body: JSON.stringify(data),
    }, context),

  // Agent Monitor
  getAgentStatus: (context?: ActionContext) => request<AgentStatus>("/api/agent/status", undefined, context),
  getAgentLogs: (context?: ActionContext) => request<AgentLog[]>("/api/agent/logs", undefined, context),
  setPaused: (paused: boolean, context?: ActionContext) =>
    request<{ isPaused: boolean; status: AgentStatus; settings: AppSettings; warning?: string }>("/api/agent/toggle-pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }, context),
  runAgentCycle: (context?: ActionContext) =>
    request<{
      success: boolean;
      discoveredCount: number;
      matchedCount: number;
      processedCount: number;
      message: string;
    }>("/api/agent/run-cycle", {
      method: "POST",
    }, context),

  // Settings
  getSettings: (context?: ActionContext) => request<AppSettings>("/api/settings", undefined, context),
  updateSettings: (settings: Partial<AppSettings>, context?: ActionContext) =>
    request<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }, context),

  // Demo Data Management
  clearDemoData: (context?: ActionContext) =>
    request<{ success: boolean; message: string }>("/api/demo/clear", {
      method: "POST",
    }, context),
};

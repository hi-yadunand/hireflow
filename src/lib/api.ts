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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Profile
  getProfile: () => request<Profile>("/api/profile"),
  updateProfile: (profile: Partial<Profile>) =>
    request<Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  uploadResume: (rawText: string) =>
    request<{ success: boolean; parsed: Partial<Profile> }>("/api/profile/upload-resume", {
      method: "POST",
      body: JSON.stringify({ rawText }),
    }),

  // Jobs
  getJobs: (params?: { search?: string; source?: string; workplaceType?: string; minMatch?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.source) query.set("source", params.source);
    if (params?.workplaceType) query.set("workplaceType", params.workplaceType);
    if (params?.minMatch) query.set("minMatch", params.minMatch.toString());
    const qs = query.toString();
    return request<Job[]>(`/api/jobs${qs ? `?${qs}` : ""}`);
  },
  createJob: (job: Partial<Job>) =>
    request<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(job),
    }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  updateJob: (id: string, updates: Partial<Job>) =>
    request<Job>(`/api/jobs/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  deleteJob: (id: string) =>
    request<{ success: boolean }>(`/api/jobs/${id}`, {
      method: "DELETE",
    }),
  analyzeJob: (id: string) =>
    request<{ success: boolean; analysis: any; job: Job }>(`/api/jobs/${id}/analyze`, {
      method: "POST",
    }),
  tailorResumeForJob: (id: string) =>
    request<{ success: boolean; tailoredResume: TailoredResume }>(`/api/jobs/${id}/tailor-resume`, {
      method: "POST",
    }),
  generateCoverLetterForJob: (id: string, tone?: string) =>
    request<{ success: boolean; coverLetter: TailoredCoverLetter }>(`/api/jobs/${id}/generate-cover-letter`, {
      method: "POST",
      body: JSON.stringify({ tone }),
    }),

  // Connectors
  getConnectors: () => request<ConnectorInfo[]>("/api/connectors"),
  updateConnector: (id: string, updates: Partial<ConnectorInfo>) =>
    request<ConnectorInfo>(`/api/connectors/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  // Applications
  getApplications: () => request<ApplicationRecord[]>("/api/applications"),
  createApplication: (app: Partial<ApplicationRecord>) =>
    request<ApplicationRecord>("/api/applications", {
      method: "POST",
      body: JSON.stringify(app),
    }),
  updateApplication: (id: string, updates: Partial<ApplicationRecord> & { statusMessage?: string }) =>
    request<ApplicationRecord>(`/api/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  // Resumes & Letters
  getResumes: () => request<TailoredResume[]>("/api/resumes"),
  getCoverLetters: () => request<TailoredCoverLetter[]>("/api/cover-letters"),

  // Interviews
  getInterviews: () => request<InterviewRecord[]>("/api/interviews"),
  createInterview: (interview: Partial<InterviewRecord>) =>
    request<InterviewRecord>("/api/interviews", {
      method: "POST",
      body: JSON.stringify(interview),
    }),
  updateInterview: (id: string, updates: Partial<InterviewRecord>) =>
    request<InterviewRecord>(`/api/interviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  generateInterviewPrep: (data: { company: string; position: string; round: string }) =>
    request<{
      questions: string[];
      talkingPoints: string[];
      companyInsights: string;
      pitfallsToAvoid: string[];
    }>("/api/interviews/generate-prep", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Agent Monitor
  getAgentStatus: () => request<AgentStatus>("/api/agent/status"),
  getAgentLogs: () => request<AgentLog[]>("/api/agent/logs"),
  togglePause: (paused?: boolean) =>
    request<{ isPaused: boolean; status: AgentStatus }>("/api/agent/toggle-pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),
  runAgentCycle: () =>
    request<{
      success: boolean;
      discoveredCount: number;
      matchedCount: number;
      processedCount: number;
      message: string;
    }>("/api/agent/run-cycle", {
      method: "POST",
    }),

  // Settings
  getSettings: () => request<AppSettings>("/api/settings"),
  updateSettings: (settings: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Demo Data Management
  clearDemoData: () =>
    request<{ success: boolean; message: string }>("/api/demo/clear", {
      method: "POST",
    }),
};

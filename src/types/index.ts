export interface RecordOrigin {
  isDemo?: boolean;
  legacyUnverified?: boolean;
}

export interface PersonalDetails {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  otherLinks?: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  achievements?: string[];
}

export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  type: 'Full-time' | 'Contract' | 'Part-time' | 'Internship' | 'Not provided';
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  highlights: string[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  liveUrl?: string;
  repoUrl?: string;
  highlights?: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  credentialUrl?: string;
}

export interface CareerPreferences {
  desiredTitles: string[];
  expectedSalary: {
    min: number;
    currency: string;
    period: 'annual' | 'monthly';
  };
  preferredCountries: string[];
  preferredLocations?: string[];
  experienceLevel?: string;
  noticePeriod?: string;
  remotePreference: 'remote_only' | 'hybrid_flexible' | 'onsite_allowed' | 'any';
  workAuthorization: {
    status: 'Not provided' | 'Citizen' | 'Permanent Resident' | 'Work Visa' | 'Requires Sponsorship';
    details: string;
    eligibleCountries: string[];
  };
}

export interface Profile extends RecordOrigin {
  personal: PersonalDetails;
  education: Education[];
  experience: WorkExperience[];
  skills: string[];
  projects: Project[];
  certifications: Certification[];
  languages: string[];
  preferences: CareerPreferences;
  revision?: string;
  reviewedAt?: string;
  legacyProfileAvailable?: boolean;
  rawResumeText?: string;
  professionalHighlights?: string[];
  updatedAt: string;
}

// Imported facts remain an unreviewed draft; unknown preference fields are omitted.
export type ResumeProfileImport = Omit<Partial<Profile>, "preferences"> & {
  preferences?: Omit<Partial<CareerPreferences>, "expectedSalary" | "workAuthorization"> & {
    expectedSalary?: Partial<CareerPreferences["expectedSalary"]>;
    workAuthorization?: Partial<CareerPreferences["workAuthorization"]>;
  };
  importWarnings?: string[];
};
export interface GeminiStatus {
  configured: boolean;
  model: string;
  connectivity: "not_checked" | "verified" | "failed";
  checkedAt?: string;
  error?: string;
}

export type JobSource =
  | 'LinkedIn'
  | 'Indeed'
  | 'Glassdoor'
  | 'Naukri'
  | 'Wellfound'
  | 'Peerlist'
  | 'Himalayas'
  | 'ZipRecruiter'
  | 'Greenhouse'
  | 'Lever'
  | 'Ashby'
  | 'Workday'
  | 'SmartRecruiters'
  | 'Direct Career Page';

export type ApplicationStatus =
  | 'Discovered'
  | 'Analysing'
  | 'Documents Generated'
  | 'Awaiting Approval'
  | 'Ready to Apply'
  | 'Applying'
  | 'Applied'
  | 'Submission Unverified'
  | 'Interview'
  | 'Rejected'
  | 'Expired';

export type ApplicationMode = 'automatic' | 'approval_required' | 'hybrid';

export interface Job extends RecordOrigin {
  id: string;
  company: string;
  position: string;
  location: string;
  country: string;
  employmentType: 'Full-time' | 'Contract' | 'Part-time' | 'Internship';
  workplaceType: 'Remote' | 'Hybrid' | 'On-site';
  salary?: string;
  experienceLevel: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Executive';
  publicationDate: string;
  firstDetectedDate: string;
  source: JobSource;
  applyUrl: string;
  description: string;
  requirements: string[];
  niceToHave: string[];
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
  recommendation?: "strong_match" | "moderate_match" | "low_match";
  processing?: { state: "pending" | "matched" | "resume_ready" | "complete" | "failed" | "paused"; error?: string; profileVersion?: string; model?: string; resumeId?: string; coverLetterId?: string };
  matchAnalysis?: string;
  matchStrengths?: string[];
  matchGaps?: string[];
  applicationStatus: ApplicationStatus;
}

export interface ConnectorInfo extends RecordOrigin {
  id: string;
  sourceName: JobSource;
  category: 'Aggregator' | 'Niche Community' | 'ATS Platform' | 'Direct Company';
  connectionStatus: 'Connected' | 'API Authorized' | 'Not Connected' | 'Unsupported' | 'Not implemented';
  discoverySupport: boolean;
  applicationSupport: boolean;
  lastSuccessfulCheck: string | null;
  lastError: string | null;
  configuredPollingIntervalMinutes: number;
  requiredCredentials: string;
  isConfigured: boolean;
  activeJobsFound: number;
}

export interface TailoredResume extends RecordOrigin {
  id: string;
  jobId: string;
  company: string;
  position: string;
  createdAt: string;
  tailoredSummary: string;
  tailoredSkills: string[];
  tailoredExperience: {
    company: string;
    role: string;
    bulletPoints: string[];
  }[];
  tailoringNotes: string;
}

export interface TailoredCoverLetter extends RecordOrigin {
  id: string;
  jobId: string;
  company: string;
  position: string;
  createdAt: string;
  letterBody: string;
  keyHooks: string[];
  tone: 'professional' | 'assertive' | 'conversational';
}

export interface ApplicationRecord extends RecordOrigin {
  id: string;
  jobId: string;
  company: string;
  position: string;
  location: string;
  source: JobSource;
  applyUrl: string;
  status: ApplicationStatus;
  applicationMode: ApplicationMode;
  matchPercentage: number;
  tailoredResumeId?: string;
  coverLetterId?: string;
  applicationAnswers?: {
    question: string;
    suggestedAnswer: string;
    confirmed: boolean;
  }[];
  stagedAt?: string;
  submissionOrigin?: "user_reported" | "legacy_unverified";
  reviewNotes?: string;
  discoveredAt: string;
  appliedAt?: string;
  lastUpdatedAt: string;
  timeline: {
    status: ApplicationStatus;
    timestamp: string;
    message: string;
  }[];
}

export interface InterviewRecord extends RecordOrigin {
  id: string;
  applicationId?: string;
  company: string;
  position: string;
  date: string;
  time: string;
  round: 'Recruiter Screen' | 'Technical Round 1' | 'System Design' | 'Hiring Manager' | 'Cultural Fit' | 'Final Executive';
  format: 'Video Call' | 'Phone Call' | 'On-site';
  interviewer?: string;
  status: 'Scheduled' | 'Completed' | 'Awaiting Feedback' | 'Passed' | 'Offer Received';
  notes: string;
  aiPrepQuestions: string[];
  talkingPoints: string[];
}

export interface AgentLog extends RecordOrigin {
  id: string;
  timestamp: string;
  category: 'discovery' | 'matching' | 'tailoring' | 'application' | 'system' | 'error';
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  jobId?: string;
  source?: JobSource;
}

export interface AgentStatus {
  isPaused: boolean;
  emergencyStop: boolean;
  workerState: 'idle' | 'running_discovery' | 'matching' | 'generating_docs' | 'paused';
  lastCycleRun: string;
  nextScheduledRun: string;
  dailyApplicationsCount: number;
  dailyApplicationLimit: number;
  totalJobsDiscoveredToday: number;
  activeConnectorsCount: number;
}

export interface AppSettings {
  jobTitles: string[];
  skills: string[];
  locations: string[];
  countries: string[];
  remotePreference: 'remote_only' | 'hybrid_flexible' | 'onsite_allowed' | 'any';
  salaryMin: number;
  salaryCurrency: string;
  experienceLevel: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Any';
  matchThreshold: number; // e.g. 75
  applicationMode: ApplicationMode;
  dailyApplicationLimit: number;
  notificationEmail: string;
  notifyOnDiscovery: boolean;
  notifyOnApprovalRequired: boolean;
  notifyOnApplied: boolean;
  geminiModel: string;
  emergencyPause: boolean;
}

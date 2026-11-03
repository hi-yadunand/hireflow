import fs from "fs";
import path from "path";
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
} from "../src/types/index.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "hireflow_db.json");

export interface DatabaseSchema {
  profile: Profile;
  jobs: Job[];
  connectors: ConnectorInfo[];
  applications: ApplicationRecord[];
  resumes: TailoredResume[];
  coverLetters: TailoredCoverLetter[];
  interviews: InterviewRecord[];
  logs: AgentLog[];
  status: AgentStatus;
  settings: AppSettings;
}

const DEFAULT_PROFILE: Profile = {
  personal: {
    fullName: "Alex Rivera",
    email: "alex.rivera@hireflow.dev",
    phone: "+1 (415) 890-4421",
    location: "San Francisco, CA / Remote",
    headline: "Senior Full-Stack & Distributed Systems Engineer",
    summary: "Senior Full-Stack Engineer with 6+ years designing high-throughput distributed microservices, TypeScript/React architectures, and reliable cloud infrastructure. Deep focus on latency reduction, engineering velocity, and scalable web apps.",
    portfolioUrl: "https://alexrivera.dev",
    githubUrl: "https://github.com/alexrivera-tech",
    linkedinUrl: "https://linkedin.com/in/alexrivera-eng",
  },
  education: [
    {
      id: "edu-1",
      institution: "University of Washington",
      degree: "Bachelor of Science",
      fieldOfStudy: "Computer Science & Engineering",
      startDate: "2016-09",
      endDate: "2020-06",
      gpa: "3.88",
      achievements: ["Dean's Honor List", "Undergraduate Research Fellow in Distributed Computing"],
    },
  ],
  experience: [
    {
      id: "exp-1",
      company: "Apex Cloud Technologies",
      role: "Senior Full-Stack Engineer",
      location: "San Francisco, CA (Remote)",
      type: "Full-time",
      startDate: "2022-04",
      endDate: "Present",
      current: true,
      description: "Architected enterprise edge compute platform and unified API layer.",
      highlights: [
        "Led migration of monolith services to Node.js/Go event-driven microservices serving 45,000 requests/sec with 99.99% SLA.",
        "Engineered React/TypeScript dashboard with WebSocket live streaming, cutting UI load time from 2.8s to 450ms.",
        "Instituted automated end-to-end testing pipelines and CI/CD workflows, shortening deployment lead time by 60%.",
      ],
    },
    {
      id: "exp-2",
      company: "Stratosphere Data Systems",
      role: "Software Engineer",
      location: "Seattle, WA",
      type: "Full-time",
      startDate: "2020-07",
      endDate: "2022-03",
      current: false,
      description: "Designed multi-tenant data analytics infrastructure and distributed caching layer.",
      highlights: [
        "Built query optimization engine on PostgreSQL and Redis that reduced p99 analytics queries by 72%.",
        "Developed reusable React design system components utilized across 4 enterprise web products.",
      ],
    },
    {
      id: "exp-3",
      company: "Veloce Labs",
      role: "Software Engineering Intern",
      location: "San Francisco, CA",
      type: "Internship",
      startDate: "2019-06",
      endDate: "2019-09",
      current: false,
      description: "Summer software engineering internship on customer identity and security team.",
      highlights: [
        "Implemented OAuth2 and SAML SSO connectors for enterprise clients.",
        "Refactored user permissions service reducing token validation latency by 35ms.",
      ],
    },
  ],
  skills: [
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Go",
    "PostgreSQL",
    "Redis",
    "GraphQL",
    "REST APIs",
    "Tailwind CSS",
    "Docker",
    "Kubernetes",
    "AWS",
    "Distributed Systems",
    "Microservices",
    "CI/CD",
  ],
  projects: [
    {
      id: "proj-1",
      title: "FlowPulse — Edge Monitoring Engine",
      description: "High-performance synthetic monitoring service built with Go and React for tracking global DNS and latency health.",
      technologies: ["Go", "React", "TypeScript", "TimescaleDB", "Tailwind CSS"],
      liveUrl: "https://flowpulse.dev",
      repoUrl: "https://github.com/alexrivera-tech/flowpulse",
      highlights: ["Processes 1M+ health pings daily", "Sub-50ms dashboard query response times"],
    },
    {
      id: "proj-2",
      title: "AsyncRelay — Distributed Job Queue",
      description: "Lightweight, reliable background queue library with at-least-once delivery guarantees and backpressure support.",
      technologies: ["TypeScript", "Node.js", "Redis"],
      repoUrl: "https://github.com/alexrivera-tech/async-relay",
      highlights: ["Over 2,400 GitHub stars", "Zero external dependencies beyond Redis"],
    },
  ],
  certifications: [
    {
      id: "cert-1",
      name: "AWS Certified Solutions Architect – Associate",
      issuer: "Amazon Web Services",
      issueDate: "2023-08",
      credentialUrl: "https://aws.amazon.com/verification",
    },
  ],
  languages: ["English (Native / Bilingual)", "Spanish (Professional Proficiency)"],
  preferences: {
    desiredTitles: [
      "Senior Full-Stack Engineer",
      "Senior Software Engineer",
      "Staff Software Engineer",
      "Lead Systems Engineer",
    ],
    expectedSalary: {
      min: 175000,
      currency: "USD",
      period: "annual",
    },
    preferredCountries: ["United States", "Canada", "United Kingdom", "Germany", "Remote Worldwide"],
    remotePreference: "remote_only",
    workAuthorization: {
      status: "Citizen",
      details: "US Citizen, eligible to work globally for US entities and international remote contracts without visa sponsorship.",
      eligibleCountries: ["United States"],
    },
  },
  updatedAt: new Date().toISOString(),
};

const DEFAULT_CONNECTORS: ConnectorInfo[] = [
  {
    id: "conn-greenhouse",
    sourceName: "Greenhouse",
    category: "ATS Platform",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: true,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 30,
    requiredCredentials: "Job Board API Token / Public Company Board Token",
    isConfigured: true,
    activeJobsFound: 24,
  },
  {
    id: "conn-lever",
    sourceName: "Lever",
    category: "ATS Platform",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: true,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 30,
    requiredCredentials: "Postings API Access or Lever Feed URL",
    isConfigured: true,
    activeJobsFound: 18,
  },
  {
    id: "conn-ashby",
    sourceName: "Ashby",
    category: "ATS Platform",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: true,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 20,
    requiredCredentials: "Public Ashby Organization Feed API",
    isConfigured: true,
    activeJobsFound: 15,
  },
  {
    id: "conn-himalayas",
    sourceName: "Himalayas",
    category: "Niche Community",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 60,
    requiredCredentials: "Himalayas Developer RSS/JSON Feed",
    isConfigured: true,
    activeJobsFound: 31,
  },
  {
    id: "conn-peerlist",
    sourceName: "Peerlist",
    category: "Niche Community",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 60,
    requiredCredentials: "Peerlist Public Jobs Endpoint",
    isConfigured: true,
    activeJobsFound: 12,
  },
  {
    id: "conn-wellfound",
    sourceName: "Wellfound",
    category: "Niche Community",
    connectionStatus: "API Authorized",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 120,
    requiredCredentials: "OAuth 2.0 Client Credentials or Verified Feed Token",
    isConfigured: true,
    activeJobsFound: 9,
  },
  {
    id: "conn-linkedin",
    sourceName: "LinkedIn",
    category: "Aggregator",
    connectionStatus: "Not Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "Enterprise LinkedIn Talent Solutions API / Partner credentials required",
    configuredPollingIntervalMinutes: 180,
    requiredCredentials: "LinkedIn Partner API or OAuth 2.0 Scope 'r_organization_social'",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-indeed",
    sourceName: "Indeed",
    category: "Aggregator",
    connectionStatus: "Not Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "Indeed Publisher API key not configured",
    configuredPollingIntervalMinutes: 180,
    requiredCredentials: "Indeed Developer Key / Client Secret",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-glassdoor",
    sourceName: "Glassdoor",
    category: "Aggregator",
    connectionStatus: "Not Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "Glassdoor API partner program registration pending",
    configuredPollingIntervalMinutes: 360,
    requiredCredentials: "Glassdoor Partner API Token",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-ziprecruiter",
    sourceName: "ZipRecruiter",
    category: "Aggregator",
    connectionStatus: "Not Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "ZipRecruiter Job Alert Feed API key missing",
    configuredPollingIntervalMinutes: 240,
    requiredCredentials: "ZipRecruiter Partner API Key",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-naukri",
    sourceName: "Naukri",
    category: "Aggregator",
    connectionStatus: "Unsupported",
    discoverySupport: false,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "No official public REST API available without recruiter enterprise licensing",
    configuredPollingIntervalMinutes: 720,
    requiredCredentials: "Naukri Enterprise Recruiter Gateway",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-workday",
    sourceName: "Workday",
    category: "ATS Platform",
    connectionStatus: "Unsupported",
    discoverySupport: false,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "Requires custom per-company tenant SAML / Workday Integration Cloud endpoints",
    configuredPollingIntervalMinutes: 720,
    requiredCredentials: "Workday Enterprise Tenant Credentials",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-smartrecruiters",
    sourceName: "SmartRecruiters",
    category: "ATS Platform",
    connectionStatus: "Not Connected",
    discoverySupport: true,
    applicationSupport: false,
    lastSuccessfulCheck: null,
    lastError: "API Key not entered",
    configuredPollingIntervalMinutes: 60,
    requiredCredentials: "SmartRecruiters Candidate API Key",
    isConfigured: false,
    activeJobsFound: 0,
  },
  {
    id: "conn-direct",
    sourceName: "Direct Career Page",
    category: "Direct Company",
    connectionStatus: "Connected",
    discoverySupport: true,
    applicationSupport: true,
    lastSuccessfulCheck: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    lastError: null,
    configuredPollingIntervalMinutes: 60,
    requiredCredentials: "Structured JSON-LD schema scraping & permitted sitemap feeds",
    isConfigured: true,
    activeJobsFound: 16,
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  jobTitles: [
    "Senior Full-Stack Engineer",
    "Senior Software Engineer",
    "Distributed Systems Engineer",
    "Staff Software Engineer",
    "Full-Stack Tech Lead",
  ],
  skills: [
    "TypeScript",
    "React",
    "Node.js",
    "Go",
    "PostgreSQL",
    "Redis",
    "AWS",
    "Docker",
    "Kubernetes",
    "Distributed Systems",
  ],
  locations: ["Remote", "San Francisco, CA", "New York, NY", "Seattle, WA"],
  countries: ["United States", "Canada", "United Kingdom", "Germany"],
  remotePreference: "remote_only",
  salaryMin: 175000,
  salaryCurrency: "USD",
  experienceLevel: "Senior",
  matchThreshold: 75,
  applicationMode: "hybrid",
  dailyApplicationLimit: 12,
  notificationEmail: "alex.rivera@hireflow.dev",
  notifyOnDiscovery: true,
  notifyOnApprovalRequired: true,
  notifyOnApplied: true,
  geminiModel: "gemini-3.8-flash",
  emergencyPause: false,
};

const DEFAULT_STATUS: AgentStatus = {
  isPaused: false,
  emergencyStop: false,
  workerState: "idle",
  lastCycleRun: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  nextScheduledRun: new Date(Date.now() + 1000 * 60 * 18).toISOString(),
  dailyApplicationsCount: 3,
  dailyApplicationLimit: 12,
  totalJobsDiscoveredToday: 18,
  activeConnectorsCount: 6,
};

// Initial Seed Jobs (clearly identified demo records)
const SEED_JOBS: Job[] = [
  {
    id: "job-stripe-101",
    company: "Stripe",
    position: "Senior Full-Stack Engineer — Billing Platform",
    location: "San Francisco, CA / Remote (US)",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Remote",
    salary: "$195,000 – $240,000 USD",
    experienceLevel: "Senior",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 17).toISOString(),
    source: "Greenhouse",
    applyUrl: "https://stripe.com/jobs/senior-full-stack-billing",
    description: "Stripe is seeking a Senior Full-Stack Engineer to scale our core recurring billing infrastructure. You will design fault-tolerant financial workflow systems using TypeScript, React, distributed microservices, and high-reliability datastores.",
    requirements: [
      "5+ years of software engineering experience building scalable web applications",
      "Proficiency in TypeScript, React, and Node.js or Go",
      "Solid foundation in relational databases (PostgreSQL), data modeling, and distributed transactions",
      "Experience leading complex architectural decisions across multiple squads",
    ],
    niceToHave: ["Familiarity with financial primitives, payment gateways, or multi-currency handling"],
    matchPercentage: 94,
    matchingSkills: ["TypeScript", "React", "Node.js", "Go", "PostgreSQL", "Distributed Systems", "AWS"],
    missingSkills: ["Stripe Billing internals", "Ruby on Rails"],
    matchAnalysis: "Exceptional alignment. Candidate's distributed microservices background (Apex Cloud 45k req/sec) and strong TypeScript/React frontend skills directly match Stripe's billing platform requirements.",
    matchStrengths: [
      "Demonstrated experience designing fault-tolerant high-throughput systems (45k req/sec)",
      "Deep expertise across full stack: React UI, TypeScript, Node.js, and PostgreSQL",
      "Proactive background in CI/CD pipeline automation and code quality",
    ],
    matchGaps: ["Could emphasize experience handling idempotency and financial transaction boundaries."],
    applicationStatus: "Ready to Apply",
    isDemo: true,
  },
  {
    id: "job-vercel-102",
    company: "Vercel",
    position: "Staff Software Engineer — Edge Runtime & Infrastructure",
    location: "Global Remote",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Remote",
    salary: "$210,000 – $260,000 USD",
    experienceLevel: "Lead",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    source: "Ashby",
    applyUrl: "https://vercel.com/careers/staff-edge-infra",
    description: "Join Vercel's Edge Compute division to push the boundaries of serverless runtimes. You will architect global routing, optimize micro-benchmarks in Node.js/Rust/Go, and ensure sub-10ms TTFB across hundreds of points of presence.",
    requirements: [
      "Demonstrated track record designing internet-scale low-latency distributed networks",
      "Expert knowledge of TypeScript, Node.js internals, V8, and systems programming (Go or Rust)",
      "Strong understanding of HTTP/3, TLS, WebSockets, and CDN caching topologies",
    ],
    niceToHave: ["Contributions to open-source edge runtimes or cloud primitives"],
    matchPercentage: 89,
    matchingSkills: ["TypeScript", "Node.js", "Go", "Distributed Systems", "Docker", "Kubernetes", "Redis"],
    missingSkills: ["Rust", "V8 internals"],
    matchAnalysis: "Strong match. Candidate's open-source project (FlowPulse & AsyncRelay) and experience leading edge platform services provides immediate technical relevance.",
    matchStrengths: [
      "Hands-on authorship of distributed queueing systems and synthetic edge monitoring",
      "Production Go and TypeScript distributed architecture experience",
    ],
    matchGaps: ["Deeper deep-dive on V8 isolate memory boundaries recommended."],
    applicationStatus: "Awaiting Approval",
    isDemo: true,
  },
  {
    id: "job-linear-103",
    company: "Linear",
    position: "Senior Product Engineer — Sync Engine",
    location: "Remote (North America / Europe)",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Remote",
    salary: "$180,000 – $220,000 USD + Equity",
    experienceLevel: "Senior",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 39).toISOString(),
    source: "Lever",
    applyUrl: "https://linear.app/careers/senior-product-engineer",
    description: "Linear builds software that feels magical, instantaneous, and offline-first. As a Senior Product Engineer on the Sync Engine team, you'll work on conflict resolution (CRDTs), optimistic UI updates, and real-time collaboration.",
    requirements: [
      "Extensive experience with high-fidelity React, TypeScript, and state management",
      "Deep empathy for UI performance (60fps, sub-50ms interactions)",
      "Experience with WebSockets, SQLite, indexedDB or local-first synchronization patterns",
    ],
    niceToHave: ["Familiarity with CRDTs, Replicache, or distributed state synchronization"],
    matchPercentage: 91,
    matchingSkills: ["React", "TypeScript", "Node.js", "Redis", "Distributed Systems", "Tailwind CSS"],
    missingSkills: ["CRDTs / Local-first Replicache", "IndexedDB direct drivers"],
    matchAnalysis: "High alignment. Candidate cut UI load time from 2.8s to 450ms at Apex Cloud and has strong React and real-time WebSocket chops.",
    matchStrengths: [
      "Obsessive focus on frontend speed and high-precision UI engineering",
      "Proven real-time streaming and WebSocket system delivery",
    ],
    matchGaps: ["Highlight transferable concepts in optimistic state rollback and event queues."],
    applicationStatus: "Documents Generated",
    isDemo: true,
  },
  {
    id: "job-datadog-104",
    company: "Datadog",
    position: "Senior Full-Stack Engineer — Observability Cloud",
    location: "New York, NY / Remote",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Remote",
    salary: "$190,000 – $230,000 USD",
    experienceLevel: "Senior",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    source: "Greenhouse",
    applyUrl: "https://careers.datadoghq.com/detail/502931",
    description: "Datadog is looking for engineers to build high-scale analytics interfaces for millions of developers. You will craft real-time telemetry charting, query optimizers, and cloud services in Go, Python, and React.",
    requirements: [
      "4+ years building production applications at scale",
      "Solid experience with React, TypeScript, and backend services in Go or Python",
      "Knowledge of distributed tracing, metrics, or time-series datastores",
    ],
    niceToHave: ["Experience with TimescaleDB, ClickHouse, or Kafka"],
    matchPercentage: 86,
    matchingSkills: ["React", "TypeScript", "Go", "Docker", "AWS", "Distributed Systems"],
    missingSkills: ["Python", "ClickHouse", "Kafka"],
    matchAnalysis: "Solid match. Candidate built synthetic monitoring tool FlowPulse with Go and TimescaleDB, proving domain alignment with observability.",
    matchStrengths: ["Domain expertise in monitoring and metrics collection."],
    matchGaps: ["Datadog heavily utilizes Python for agent orchestration."],
    applicationStatus: "Applied",
    isDemo: true,
  },
  {
    id: "job-supa-105",
    company: "Supabase",
    position: "Senior Cloud Infrastructure & Platform Engineer",
    location: "Remote Worldwide",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Remote",
    salary: "$175,000 – $210,000 USD",
    experienceLevel: "Senior",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 60).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 58).toISOString(),
    source: "Himalayas",
    applyUrl: "https://supabase.com/careers/cloud-infra",
    description: "Help build the open source Firebase alternative. Build the infrastructure orchestrating hundreds of thousands of PostgreSQL instances, Go microservices, and Docker containers in multi-cloud environments.",
    requirements: [
      "Deep PostgreSQL performance tuning and backup/restore automation",
      "Experience with Kubernetes, Docker, and AWS/GCP automation",
      "Proficient in Go, TypeScript, and infrastructure as code",
    ],
    niceToHave: ["Postgres extensions experience (pgvector, pg_stat_statements)"],
    matchPercentage: 88,
    matchingSkills: ["PostgreSQL", "Go", "Docker", "Kubernetes", "AWS", "TypeScript"],
    missingSkills: ["Elixir", "Postgres C-extensions"],
    matchAnalysis: "Strong match. Candidate has deep PostgreSQL optimization experience (-72% query latency at Stratosphere) and active Go engineering background.",
    matchStrengths: ["Direct Postgres indexing and high availability credentials."],
    matchGaps: ["Elixir/Phoenix knowledge would be an asset for Supabase Realtime."],
    applicationStatus: "Interview",
    isDemo: true,
  },
  {
    id: "job-canva-106",
    company: "Canva",
    position: "Senior Frontend Engineer — Realtime Canvas",
    location: "San Francisco, CA / Remote",
    country: "United States",
    employmentType: "Full-time",
    workplaceType: "Hybrid",
    salary: "$185,000 – $225,000 USD",
    experienceLevel: "Senior",
    publicationDate: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    firstDetectedDate: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
    source: "Direct Career Page",
    applyUrl: "https://canva.com/careers/senior-frontend-canvas",
    description: "Join the core collaborative design team at Canva. We are building browser-based graphics processing with WebGL, WebGPU, React, and TypeScript.",
    requirements: [
      "5+ years engineering responsive, complex web applications with React and TypeScript",
      "Understanding of browser rendering pipelines, WebGL/Canvas APIs, and memory management",
      "Collaborative mindset and passion for empowering millions of creators",
    ],
    niceToHave: ["Experience with WebAssembly or 2D rendering mathematics"],
    matchPercentage: 79,
    matchingSkills: ["React", "TypeScript", "Tailwind CSS", "Microservices"],
    missingSkills: ["WebGL", "WebGPU", "WebAssembly", "Canvas 2D rendering math"],
    matchAnalysis: "Moderate match. Candidate is an exceptional React/TypeScript engineer, but specific graphics rendering (WebGL/Canvas) is a gap.",
    matchStrengths: ["High-speed UI optimization and component design system mastery."],
    matchGaps: ["Heavy graphics pipeline math (matrices, WebGL)."],
    applicationStatus: "Discovered",
    isDemo: true,
  },
];

const SEED_APPLICATIONS: ApplicationRecord[] = [
  {
    id: "app-1",
    jobId: "job-stripe-101",
    company: "Stripe",
    position: "Senior Full-Stack Engineer — Billing Platform",
    location: "San Francisco, CA / Remote (US)",
    source: "Greenhouse",
    applyUrl: "https://stripe.com/jobs/senior-full-stack-billing",
    status: "Ready to Apply",
    applicationMode: "hybrid",
    matchPercentage: 94,
    tailoredResumeId: "res-stripe-101",
    coverLetterId: "cov-stripe-101",
    applicationAnswers: [
      {
        question: "Describe your experience scaling financial or mission-critical transaction workflows.",
        suggestedAnswer: "At Apex Cloud Technologies, I led the architecture of our core distributed microservices handling 45k req/sec with strict 99.99% SLAs, utilizing distributed transaction idempotency and PostgreSQL isolation guarantees.",
        confirmed: true,
      },
      {
        question: "Are you legally authorized to work in the United States?",
        suggestedAnswer: "Yes, US Citizen.",
        confirmed: true,
      },
      {
        question: "Will you now or in the future require visa sponsorship?",
        suggestedAnswer: "No, no sponsorship required.",
        confirmed: true,
      },
    ],
    reviewNotes: "Strong candidate package prepared. AI tailored resume and customized cover letter generated and verified against candidate achievements.",
    discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 17).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    timeline: [
      { status: "Discovered", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 17).toISOString(), message: "Discovered via Greenhouse job connector feed" },
      { status: "Analysing", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(), message: "Gemini semantic analysis: 94% compatibility match" },
      { status: "Documents Generated", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 15).toISOString(), message: "Tailored resume and custom cover letter generated" },
      { status: "Ready to Apply", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), message: "Package ready for autonomous dispatch or manual submission" },
    ],
  },
  {
    id: "app-2",
    jobId: "job-vercel-102",
    company: "Vercel",
    position: "Staff Software Engineer — Edge Runtime & Infrastructure",
    location: "Global Remote",
    source: "Ashby",
    applyUrl: "https://vercel.com/careers/staff-edge-infra",
    status: "Awaiting Approval",
    applicationMode: "approval_required",
    matchPercentage: 89,
    tailoredResumeId: "res-vercel-102",
    coverLetterId: "cov-vercel-102",
    applicationAnswers: [
      {
        question: "Link to open source systems or projects you have authored.",
        suggestedAnswer: "https://github.com/alexrivera-tech/flowpulse and https://github.com/alexrivera-tech/async-relay",
        confirmed: true,
      },
      {
        question: "What is your target compensation expectation?",
        suggestedAnswer: "$210,000 – $240,000 USD base + equity.",
        confirmed: true,
      },
    ],
    reviewNotes: "Requires user review before submission as match is in the 85-90% bracket with high-seniority Staff title.",
    discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    timeline: [
      { status: "Discovered", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), message: "Discovered via Ashby API" },
      { status: "Analysing", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), message: "Gemini scored at 89% match fit" },
      { status: "Documents Generated", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), message: "Edge-tailored resume and cover letter created" },
      { status: "Awaiting Approval", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), message: "Queued for candidate approval review" },
    ],
  },
  {
    id: "app-3",
    jobId: "job-datadog-104",
    company: "Datadog",
    position: "Senior Full-Stack Engineer — Observability Cloud",
    location: "New York, NY / Remote",
    source: "Greenhouse",
    applyUrl: "https://careers.datadoghq.com/detail/502931",
    status: "Applied",
    applicationMode: "automatic",
    matchPercentage: 86,
    appliedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    timeline: [
      { status: "Discovered", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), message: "Discovered via Greenhouse connector" },
      { status: "Analysing", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString(), message: "Analyzed: 86% match" },
      { status: "Documents Generated", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 46).toISOString(), message: "Customized resume and letter" },
      { status: "Ready to Apply", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(), message: "Verified application criteria" },
      { status: "Applied", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), message: "Application verified submitted via Greenhouse candidate gateway" },
    ],
  },
  {
    id: "app-4",
    jobId: "job-supa-105",
    company: "Supabase",
    position: "Senior Cloud Infrastructure & Platform Engineer",
    location: "Remote Worldwide",
    source: "Himalayas",
    applyUrl: "https://supabase.com/careers/cloud-infra",
    status: "Interview",
    applicationMode: "hybrid",
    matchPercentage: 88,
    appliedAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 58).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    timeline: [
      { status: "Discovered", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 58).toISOString(), message: "Discovered via Himalayas feed" },
      { status: "Applied", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(), message: "Application dispatched" },
      { status: "Interview", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), message: "Technical Round 1 invitation received from Engineering Lead" },
    ],
  },
];

const SEED_INTERVIEWS: InterviewRecord[] = [
  {
    id: "int-1",
    applicationId: "app-4",
    company: "Supabase",
    position: "Senior Cloud Infrastructure & Platform Engineer",
    date: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString().split("T")[0],
    time: "10:30 AM PST",
    round: "Technical Round 1",
    format: "Video Call",
    interviewer: "Marc D. (Staff Platform Engineer)",
    status: "Scheduled",
    notes: "Deep dive into PostgreSQL multi-tenancy architecture, container orchestration, and high-availability failovers.",
    aiPrepQuestions: [
      "How would you automate zero-downtime PostgreSQL minor version upgrades across 5,000 active customer clusters?",
      "Walk through your optimization at Stratosphere that reduced p99 query latency by 72%.",
      "How do you monitor and prevent connection pool exhaustion with PgBouncer under bursty workloads?",
    ],
    talkingPoints: [
      "Emphasize hands-on experience tuning PostgreSQL parameters (shared_buffers, work_mem, WAL archiving).",
      "Highlight Go microservices experience from Apex Cloud handling 45k req/sec.",
      "Ask about their roadmap for edge caching with pgvector embeddings.",
    ],
  },
];

const SEED_LOGS: AgentLog[] = [
  {
    id: "log-1",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    category: "discovery",
    severity: "info",
    message: "Completed automated polling cycle across 4 active ATS feeds (Greenhouse, Lever, Ashby, Himalayas). Found 6 new job postings.",
    source: "Greenhouse",
  },
  {
    id: "log-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    category: "matching",
    severity: "success",
    message: "Gemini semantic evaluator analyzed Stripe (Senior Full-Stack): Match Score 94%. Surpassed threshold (75%).",
    jobId: "job-stripe-101",
  },
  {
    id: "log-3",
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    category: "tailoring",
    severity: "info",
    message: "Generated tailored resume and customized cover letter for Stripe. Preserved 100% verified facts without hallucination.",
    jobId: "job-stripe-101",
  },
  {
    id: "log-4",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    category: "application",
    severity: "info",
    message: "Application package staged in 'Ready to Apply' queue. Waiting for scheduled batch dispatch.",
    jobId: "job-stripe-101",
  },
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading database file, using defaults:", e);
    }

    const initial: DatabaseSchema = {
      profile: DEFAULT_PROFILE,
      jobs: SEED_JOBS,
      connectors: DEFAULT_CONNECTORS,
      applications: SEED_APPLICATIONS,
      resumes: [],
      coverLetters: [],
      interviews: SEED_INTERVIEWS,
      logs: SEED_LOGS,
      status: DEFAULT_STATUS,
      settings: DEFAULT_SETTINGS,
    };

    this.save(initial);
    return initial;
  }

  private save(data?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data || this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving database file:", e);
    }
  }

  // Profile methods
  getProfile(): Profile {
    return this.data.profile;
  }

  updateProfile(profile: Partial<Profile>): Profile {
    this.data.profile = {
      ...this.data.profile,
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.profile;
  }

  // Jobs methods
  getJobs(): Job[] {
    return this.data.jobs;
  }

  getJob(id: string): Job | undefined {
    return this.data.jobs.find((j) => j.id === id);
  }

  addJob(job: Job): Job {
    const existing = this.data.jobs.findIndex((j) => j.id === job.id);
    if (existing >= 0) {
      this.data.jobs[existing] = job;
    } else {
      this.data.jobs.unshift(job);
    }
    this.save();
    return job;
  }

  updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const idx = this.data.jobs.findIndex((j) => j.id === id);
    if (idx < 0) return undefined;
    this.data.jobs[idx] = { ...this.data.jobs[idx], ...updates };
    this.save();
    return this.data.jobs[idx];
  }

  deleteJob(id: string): boolean {
    const initialLen = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => j.id !== id);
    this.save();
    return this.data.jobs.length < initialLen;
  }

  // Connectors
  getConnectors(): ConnectorInfo[] {
    return this.data.connectors;
  }

  updateConnector(id: string, updates: Partial<ConnectorInfo>): ConnectorInfo | undefined {
    const idx = this.data.connectors.findIndex((c) => c.id === id);
    if (idx < 0) return undefined;
    this.data.connectors[idx] = { ...this.data.connectors[idx], ...updates };
    this.save();
    return this.data.connectors[idx];
  }

  // Applications
  getApplications(): ApplicationRecord[] {
    return this.data.applications;
  }

  getApplication(id: string): ApplicationRecord | undefined {
    return this.data.applications.find((a) => a.id === id);
  }

  addApplication(app: ApplicationRecord): ApplicationRecord {
    const existing = this.data.applications.findIndex((a) => a.id === app.id);
    if (existing >= 0) {
      this.data.applications[existing] = app;
    } else {
      this.data.applications.unshift(app);
    }
    this.save();
    return app;
  }

  updateApplication(id: string, updates: Partial<ApplicationRecord>): ApplicationRecord | undefined {
    const idx = this.data.applications.findIndex((a) => a.id === id);
    if (idx < 0) return undefined;
    this.data.applications[idx] = {
      ...this.data.applications[idx],
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.applications[idx];
  }

  // Resumes
  getResumes(): TailoredResume[] {
    return this.data.resumes;
  }

  addResume(resume: TailoredResume): TailoredResume {
    this.data.resumes.unshift(resume);
    this.save();
    return resume;
  }

  // Cover Letters
  getCoverLetters(): TailoredCoverLetter[] {
    return this.data.coverLetters;
  }

  addCoverLetter(letter: TailoredCoverLetter): TailoredCoverLetter {
    this.data.coverLetters.unshift(letter);
    this.save();
    return letter;
  }

  // Interviews
  getInterviews(): InterviewRecord[] {
    return this.data.interviews;
  }

  addInterview(interview: InterviewRecord): InterviewRecord {
    this.data.interviews.unshift(interview);
    this.save();
    return interview;
  }

  updateInterview(id: string, updates: Partial<InterviewRecord>): InterviewRecord | undefined {
    const idx = this.data.interviews.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    this.data.interviews[idx] = { ...this.data.interviews[idx], ...updates };
    this.save();
    return this.data.interviews[idx];
  }

  // Logs
  getLogs(): AgentLog[] {
    return this.data.logs;
  }

  addLog(log: Omit<AgentLog, "id" | "timestamp">): AgentLog {
    const newLog: AgentLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...log,
    };
    this.data.logs.unshift(newLog);
    if (this.data.logs.length > 200) {
      this.data.logs = this.data.logs.slice(0, 200);
    }
    this.save();
    return newLog;
  }

  // Status
  getStatus(): AgentStatus {
    return this.data.status;
  }

  updateStatus(updates: Partial<AgentStatus>): AgentStatus {
    this.data.status = { ...this.data.status, ...updates };
    this.save();
    return this.data.status;
  }

  // Settings
  getSettings(): AppSettings {
    return this.data.settings;
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }

  // Reset or clear demo data
  clearDemoData() {
    this.data.jobs = this.data.jobs.filter((j) => !j.isDemo);
    this.data.applications = this.data.applications.filter((a) => !a.id.startsWith("app-"));
    this.save();
  }
}

export const db = new Database();

import type { ResumeProfileImport } from "../src/types/index.js";
export const masterResumeText = `Test Candidate
Email: candidate@example.test
Phone: +1 555 0100
Location: Example City
Headline: Software Intern
Summary: Building TypeScript tools.
LinkedIn: https://linkedin.com/in/example
GitHub: https://github.com/example
Portfolio: https://example.test
Other link: https://peerlist.io/example

Work and Internships
Test Employer | Software Intern | Internship | Example City
June 2025 - Present
Built TypeScript tools.
Documented the API.

Education
Example University | BS | Computer Science | 2021 - 2025
GPA 3.8
Research award

Skills
TypeScript, PostgreSQL, React, Communication
Languages: English

Certifications
Example Certificate | Example Organization | 2024
https://example.test/certificate

Projects
Example Project
Built a developer tool.
Technologies: React, PostgreSQL
Implemented the interface.
https://example.test/project
https://github.com/example/project

Professional Highlights
Team Lead award

Preferences explicitly stated
Target roles: Software Engineer
Preferred countries: Example Country
Preferred locations: Example City
Remote preferred
Notice period: 30 days
`;
export function importedResume(): ResumeProfileImport {
  return {
    personal: { fullName: "Test Candidate", email: "candidate@example.test", phone: "+1 555 0100", location: "Example City", headline: "Software Intern", summary: "Building TypeScript tools.", linkedinUrl: "https://linkedin.com/in/example", githubUrl: "https://github.com/example", portfolioUrl: "https://example.test", otherLinks: ["https://peerlist.io/example"] },
    skills: ["TypeScript", "PostgreSQL", "React", "Communication"],
    experience: [{ id: "imported-work", company: "Test Employer", role: "Software Intern", type: "Internship", location: "Example City", startDate: "June 2025", endDate: "Present", current: true, description: "Built TypeScript tools.", highlights: ["Documented the API."] }],
    education: [{ id: "imported-education", institution: "Example University", degree: "BS", fieldOfStudy: "Computer Science", startDate: "2021", endDate: "2025", gpa: "3.8", achievements: ["Research award"] }],
    certifications: [{ id: "imported-certification", name: "Example Certificate", issuer: "Example Organization", issueDate: "2024", credentialUrl: "https://example.test/certificate" }],
    projects: [{ id: "imported-project", title: "Example Project", description: "Built a developer tool.", technologies: ["React", "PostgreSQL"], liveUrl: "https://example.test/project", repoUrl: "https://github.com/example/project", highlights: ["Implemented the interface."] }],
    languages: ["English"], professionalHighlights: ["Team Lead award"],
    preferences: { desiredTitles: ["Software Engineer"], preferredCountries: ["Example Country"], preferredLocations: ["Example City"], remotePreference: "remote_only", noticePeriod: "30 days" },
    importWarnings: ["Salary and work authorization were not provided; those preferences were left unchanged."],
  };
}

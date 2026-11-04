import { describe, expect, it } from "vitest";
import { emptyProfile } from "../server/db.js";
import { mergeProfileImport, resolveImportConflict } from "../src/lib/profile-import.js";
import { importedResume } from "./resume-fixture.js";

describe("safe complete profile mapping", () => {
  it("automatically fills all supported fields without confirming or saving the draft", () => {
    const base = emptyProfile(), original = structuredClone(base), imported = importedResume();
    const { profile, conflicts } = mergeProfileImport(base, imported);
    expect(conflicts).toEqual([]); expect(profile.personal).toEqual(imported.personal);
    for (const field of ["experience", "education", "projects", "certifications", "professionalHighlights", "skills", "languages"] as const) expect(profile[field]).toEqual(imported[field]);
    expect(profile.preferences).toMatchObject(imported.preferences!); expect(profile.preferences.workAuthorization.status).toBe("Not provided"); expect(profile.preferences.expectedSalary.min).toBe(0);
    expect(profile.reviewedAt).toBeUndefined(); expect(base).toEqual(original); expect(profile).not.toHaveProperty("importWarnings");
  });
  it("preserves existing facts and exposes conflicts with explicit per-field resolution", () => {
    const base = emptyProfile(); base.personal.fullName = "Existing name"; base.personal.email = "existing@example.test"; base.revision = "current-revision"; base.reviewedAt = "reviewed";
    const { profile, conflicts } = mergeProfileImport(base, importedResume());
    expect(profile.personal.fullName).toBe("Existing name"); expect(profile.personal.email).toBe("existing@example.test"); expect(conflicts).toHaveLength(2); expect(profile.revision).toBe("current-revision");
    const conflict = conflicts.find(c => c.path.at(-1) === "email")!;
    expect(resolveImportConflict(profile, conflict).personal.email).toBe("candidate@example.test");
    const edited = structuredClone(profile); edited.personal.email = "edited@example.test";
    expect(() => resolveImportConflict(edited, conflict)).toThrow("field changed");
    expect(profile.personal.email).toBe("existing@example.test");
  });
  it("deduplicates retries and ignores new AI IDs without discarding existing IDs or achievements", () => {
    const once = mergeProfileImport(emptyProfile(), importedResume()).profile;
    once.experience[0].id = "existing-stable-id"; once.experience[0].highlights.push("User-authored achievement");
    const incoming = importedResume(); incoming.experience![0].id = "different-retry-id"; incoming.skills!.push("typescript"); incoming.projects!.push({ ...incoming.projects![0], id: "duplicate-model-id" });
    const { profile } = mergeProfileImport(once, incoming);
    for (const field of ["experience", "education", "projects", "certifications"] as const) expect(profile[field]).toHaveLength(1);
    expect(profile.experience[0].id).toBe("existing-stable-id"); expect(profile.experience[0].highlights).toEqual(["Documented the API.", "User-authored achievement"]);
    expect(profile.skills).toEqual(["TypeScript", "PostgreSQL", "React", "Communication"]);
  });
  it("never erases existing information when extraction leaves fields unavailable", () => {
    const existing = mergeProfileImport(emptyProfile(), importedResume()).profile;
    const incoming = { personal: { ...emptyProfile().personal }, skills: [], experience: [], education: [], projects: [], certifications: [], languages: [], professionalHighlights: [] };
    for (const prefer of [false, true]) {
      const mapped = mergeProfileImport(existing, incoming, prefer).profile;
      expect(mapped.personal).toEqual(existing.personal); expect(mapped.projects).toEqual(existing.projects); expect(mapped.skills).toEqual(existing.skills);
    }
  });
  it("keeps existing nonempty preference facts and detects conflicts without inferring authorization", () => {
    const base = emptyProfile(); base.preferences.remotePreference = "onsite_allowed"; base.preferences.expectedSalary.min = 50000; base.preferences.workAuthorization = { status: "Citizen", details: "User verified", eligibleCountries: ["Verified Country"] };
    const incoming = importedResume(); const { profile, conflicts } = mergeProfileImport(base, incoming);
    expect(profile.preferences.workAuthorization).toEqual(base.preferences.workAuthorization); expect(profile.preferences.expectedSalary.min).toBe(50000); expect(profile.preferences.remotePreference).toBe("onsite_allowed"); expect(conflicts).toHaveLength(1);
  });
  it("preserves duplicate employers with genuinely different start dates as separate tenures", () => {
    const first = importedResume(); const base = mergeProfileImport(emptyProfile(), first).profile;
    const next = importedResume(); next.experience![0].startDate = "June 2020";
    expect(mergeProfileImport(base, next).profile.experience).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { validateProfile, validateParsedProfile, strings } from "../server/validation.js";
import { normalizeProfileHighlights } from "../src/lib/profile.js";
import { realProfile } from "./fixtures.js";
import type { Profile } from "../src/types/index.js";

function profileWithHighlights(value: unknown): Profile {
  const profile = realProfile();
  profile.experience = [{ id: "internship", company: "Test employer", role: "Intern", location: "", type: "Internship", startDate: "2025-06", endDate: "2025-08", current: false, description: "", highlights: value as string[] }];
  profile.projects = [{ id: "project", title: "Test project", description: "", technologies: [], highlights: value as string[] }];
  return profile;
}

describe("optional profile highlights", () => {
  for (const [name, value] of [["missing", undefined], ["null", null], ["empty collection", []], ["blank editor row", [""]], ["whitespace editor rows", [" ", "\t", "\n"]]] as const) {
    it(`saves ${name} highlights as empty arrays without inventing content`, () => {
      const input = profileWithHighlights(value), before = structuredClone(input);
      const validated = validateProfile(input);
      expect(validated.experience[0].highlights).toEqual([]);
      expect(validated.projects[0].highlights).toEqual([]);
      expect(validated.experience[0]).toMatchObject({ id: "internship", company: "Test employer", role: "Intern" });
      expect(input).toEqual(before);
      expect(normalizeProfileHighlights(input).experience[0].highlights).toEqual([]);
    });
  }
  it("removes only blank rows and preserves genuine text, ordering and duplicates", () => {
    const highlights = ["", "Built a project", "  Authored documentation  ", "\t", "Résumé in 日本語", "Built a project"];
    const input = profileWithHighlights(highlights), expected = ["Built a project", "  Authored documentation  ", "Résumé in 日本語", "Built a project"];
    const output = validateProfile(input);
    expect(output.experience[0].highlights).toEqual(expected); expect(output.projects[0].highlights).toEqual(expected);
    expect(normalizeProfileHighlights(input).projects[0].highlights).toEqual(expected);
    expect(input.experience[0].highlights).toEqual(highlights);
  });
  it("saves a profile with every optional section empty", () => {
    const output = validateProfile(realProfile());
    for (const key of ["experience", "education", "projects", "certifications", "languages"] as const) expect(output[key]).toEqual([]);
  });
  for (const field of ["experience", "projects"] as const) {
    for (const value of ["not an array", 0, false, {}, [null], [false], [123], [{}], [[]]]) {
      it(`rejects invalid ${field} highlight types: ${JSON.stringify(value)}`, () => {
        const profile = profileWithHighlights([]);
        (profile[field][0] as any).highlights = value;
        expect(() => validateProfile(profile)).toThrow("highlights must be an array of strings");
        expect(() => validateProfile(profile)).toThrow(expect.objectContaining({ status: 400 }));
        expect(() => normalizeProfileHighlights(profile)).toThrow("highlights must be an array of strings");
      });
    }
  }
  for (const field of ["company", "role"] as const) it(`still rejects a missing required experience ${field}`, () => {
    const input = profileWithHighlights([]); input.experience[0][field] = " ";
    expect(() => validateProfile(input)).toThrow(`${field} must be a nonempty string`);
  });
  it("does not relax non-profile string collections or fabricate AI-import highlights", () => {
    expect(() => strings([""], "skills")).toThrow("nonempty string");
    const parsed = validateParsedProfile(profileWithHighlights(undefined));
    expect(parsed.experience![0].highlights).toEqual([]);
    const invalid = profileWithHighlights([123]);
    expect(() => validateParsedProfile(invalid)).toThrow("array of strings");
  });
});
it("rejects unsafe imported profile links while preserving ordinary user-provided web URLs", () => {
 const profile = realProfile();
 for (const value of ["javascript:alert(1)", "data:text/html,bad", "file:///private/file", "https://user:password@example.test"]) {
  profile.personal.githubUrl = value; expect(() => validateParsedProfile(profile)).toThrow("safe HTTP(S) URL"); expect(() => validateProfile(profile)).toThrow("safe HTTP(S) URL");
 }
 profile.personal.githubUrl = "https://github.com/example"; expect(validateProfile(profile).personal.githubUrl).toBe("https://github.com/example");
 profile.personal.portfolioUrl = "example.test/portfolio"; expect(validateProfile(profile).personal.portfolioUrl).toBe("example.test/portfolio");
});

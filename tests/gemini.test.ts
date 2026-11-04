import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ generateContent: vi.fn(), construct: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { constructor(options: unknown) { sdk.construct(options); } models = sdk; }, Type: { OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER", ARRAY: "ARRAY", BOOLEAN: "BOOLEAN" } }));
import { analyzeJobMatch, tailorResume, generateCoverLetter, parseResumeText, generateInterviewPrep } from "../server/gemini.js";
import { realProfile, job } from "./fixtures.js";
const operations = { matching: () => analyzeJobMatch(realProfile(), job()), resume: () => tailorResume(realProfile(), job()), letter: () => generateCoverLetter(realProfile(), job()), parsing: () => parseResumeText("Botanist. No software engineering experience."), preparation: () => generateInterviewPrep(job(), "Technical Round 1", realProfile()) };
beforeEach(() => { sdk.generateContent.mockReset(); sdk.construct.mockReset(); vi.stubEnv("GEMINI_API_KEY", "test-key-only"); });
afterEach(() => vi.unstubAllEnvs());
for (const [name, invoke] of Object.entries(operations)) {
  describe(name, () => {
    it("fails explicitly without a key and never calls the provider", async () => { vi.stubEnv("GEMINI_API_KEY", ""); await expect(invoke()).rejects.toThrow("configure GEMINI_API_KEY"); expect(sdk.generateContent).not.toHaveBeenCalled(); });
    it("fails explicitly when the provider fails", async () => { sdk.generateContent.mockRejectedValue(new Error("Provider failure")); await expect(invoke()).rejects.toThrow("failed"); });
    for (const text of [undefined, "", "not JSON", "{}", "null", "[]"]) it(`rejects invalid provider data: ${String(text)}`, async () => { sdk.generateContent.mockResolvedValue({ text }); await expect(invoke()).rejects.toThrow(); });
  });
}
it("uses an API key supplied after module import", async () => { sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ letterBody: "Draft", keyHooks: [] }) }); await expect(generateCoverLetter(realProfile(), job())).resolves.toMatchObject({ letterBody: "Draft" }); });
it("parses missing facts as empty fields without inventing qualifications", async () => {
  sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ personal: { fullName: "Test Botanist" }, skills: [], experience: [], education: [] }) });
  expect(await parseResumeText("Test Botanist")).toMatchObject({ personal: { fullName: "Test Botanist", email: "", phone: "", location: "" }, skills: [], experience: [], education: [] });
});
it("rejects out-of-range scores", async () => { sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ matchPercentage: 150 }) }); await expect(operations.matching()).rejects.toThrow("0 to 100"); });
it("rejects invented matching skills", async () => { sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ matchPercentage: 90, matchingSkills: ["InventedSkill"], missingSkills: [], matchAnalysis: "Test", matchStrengths: [], matchGaps: [], recommendation: "strong_match" }) }); await expect(operations.matching()).rejects.toThrow("absent"); });
it("rejects invented resume employers", async () => { sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ tailoredSummary: "Test", tailoredSkills: [], tailoredExperience: [{ company: "Fake Corp", role: "Engineer", bulletPoints: [] }], tailoringNotes: "Test" }) }); await expect(operations.resume()).rejects.toThrow("employment absent"); });
for (const current of ["false", "true", 0, 1, null, {}, []]) it(`rejects a supplied non-boolean experience current value: ${JSON.stringify(current)}`, async () => {
 sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ personal: {}, skills: [], experience: [{ company: "Real", role: "Engineer", current, highlights: [] }], education: [] }) });
 await expect(operations.parsing()).rejects.toThrow("current must be boolean");
});
for (const value of [42, false, null, {}]) it(`rejects invalid AI contact field type: ${JSON.stringify(value)}`, async () => {
 sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ personal: { phone: value }, skills: [], experience: [], education: [] }) });
 await expect(operations.parsing()).rejects.toThrow("phone must be a string");
});
it("keeps sanitized provider status/code without exposing its message or request", async () => {
 sdk.generateContent.mockRejectedValue({ status: 429, code: "RESOURCE_EXHAUSTED", message: "secret-key-and-resume", request: { prompt: "private" } });
 await expect(operations.matching()).rejects.toMatchObject({ status: 429, details: { providerStatus: 429, code: "RESOURCE_EXHAUSTED" } });
 try { await operations.matching(); } catch (error) { expect(String(error) + JSON.stringify(error)).not.toMatch(/secret-key-and-resume|private/); }
});
for (const [name, invoke] of Object.entries(operations)) it(`bounds a never-resolving Gemini ${name} request and aborts its SDK signal`, async () => {
 vi.useFakeTimers(); let late!: (value: { text: string }) => void;
 sdk.generateContent.mockReturnValueOnce(new Promise(resolve => { late = resolve; }));
 try {
  const pending = invoke(); const rejection = expect(pending).rejects.toMatchObject({ status: 504, details: { code: "AI_TIMEOUT" } });
  await vi.advanceTimersByTimeAsync(60_000); await rejection;
  expect(sdk.generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  late({ text: "{}" }); await vi.advanceTimersByTimeAsync(1); expect(vi.getTimerCount()).toBe(0);
 } finally { vi.useRealTimers(); }
});

it("configures the SDK HTTP timeout explicitly", async () => {
 sdk.generateContent.mockResolvedValue({ text: JSON.stringify({ letterBody: "Draft", keyHooks: [] }) }); await operations.letter();
 expect(sdk.construct).toHaveBeenCalledWith({ apiKey: "test-key-only", httpOptions: { timeout: 60_000 } });
});

it("returns full structured resume facts and keeps unavailable salary/authorization absent", async () => {
 const { importedResume, masterResumeText } = await import("./resume-fixture.js");
 const incoming = importedResume(); sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify(incoming) });
 const result = await parseResumeText(masterResumeText);
 expect(result.projects?.[0]).toMatchObject({ title: "Example Project", technologies: ["React", "PostgreSQL"], highlights: ["Implemented the interface."] });
 expect(result.certifications?.[0].credentialUrl).toBe("https://example.test/certificate"); expect(result.personal?.otherLinks).toEqual(["https://peerlist.io/example"]);
 expect(result.education?.[0].achievements).toEqual(["Research award"]); expect(result.professionalHighlights).toEqual(["Team Lead award"]);
 expect(result.preferences).toMatchObject({ preferredLocations: ["Example City"], noticePeriod: "30 days" });
 expect(result.preferences?.expectedSalary).toBeUndefined(); expect(result.preferences?.workAuthorization).toBeUndefined();
 expect(sdk.generateContent.mock.calls[0][0].config.responseSchema.properties).toHaveProperty("projects");
 expect(result).not.toHaveProperty("reviewedAt");
});
it("rejects an invented extracted skill or employer not present in the source", async () => {
 const { importedResume, masterResumeText } = await import("./resume-fixture.js");
 for (const field of ["skill", "employer"]) {
  const value = importedResume(); if (field === "skill") value.skills!.push("InventedSkill"); else value.experience![0].company = "Invented Employer";
  sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify(value) });
  await expect(parseResumeText(masterResumeText)).rejects.toMatchObject({ status: 502, details: { code: "AI_UNGROUNDED" } });
 }
});
it("reports configured versus verified status without exposing the key, and verifies only real responses", async () => {
 const { getGeminiStatus, checkConnection } = await import("../server/gemini.js");
 vi.stubEnv("GEMINI_API_KEY", "different-test-key-for-status");
 expect(getGeminiStatus()).toMatchObject({ configured: true, connectivity: "not_checked" });
 sdk.generateContent.mockResolvedValueOnce({ text: '{"ok":true}' });
 expect(await checkConnection()).toMatchObject({ connectivity: "verified", model: "gemini-3.8-flash" });
 expect(getGeminiStatus().connectivity).toBe("verified"); expect(JSON.stringify(getGeminiStatus())).not.toContain("different-test-key-for-status");
 vi.stubEnv("GEMINI_API_KEY", ""); expect(getGeminiStatus()).toMatchObject({ configured: false, connectivity: "not_checked" });
});
it("keeps malformed connection checks and provider failures unverified", async () => {
 const { checkConnection, getGeminiStatus } = await import("../server/gemini.js");
 vi.stubEnv("GEMINI_API_KEY", "connection-failure-test-key");
 sdk.generateContent.mockResolvedValueOnce({ text: '{"ok":false}' }); await expect(checkConnection()).rejects.toMatchObject({ status: 502 });
 expect(getGeminiStatus().connectivity).toBe("failed");
 sdk.generateContent.mockRejectedValueOnce({ status: 400, message: '{"error":{"details":[{"reason":"API_KEY_INVALID"}],"message":"private-test-secret"}}' });
 await expect(checkConnection()).rejects.toMatchObject({ status: 503, details: { code: "API_KEY_INVALID" } });
 expect(getGeminiStatus().error).not.toContain("private-test-secret");
});

it("does not silently accept a semantically empty extraction or a skill matching only part of a word", async () => {
 sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ personal: {}, skills: [], experience: [], education: [] }) });
 await expect(parseResumeText("Candidate has substantial readable resume information.")).rejects.toThrow("did not extract any usable");
 sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ personal: {}, skills: ["R"], experience: [], education: [] }) });
 await expect(parseResumeText("Research with TypeScript.")).rejects.toMatchObject({ details: { code: "AI_UNGROUNDED" } });
});
it("rejects inferred work authorization and workplace preferences", async () => {
 const { importedResume, masterResumeText } = await import("./resume-fixture.js");
 const value = importedResume(); value.preferences!.workAuthorization = { status: "Citizen", details: "Example City" };
 sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify(value) }); await expect(parseResumeText(masterResumeText)).rejects.toThrow("Authorization classification");
 const inferred = importedResume(); inferred.preferences!.remotePreference = "onsite_allowed";
 sdk.generateContent.mockResolvedValueOnce({ text: JSON.stringify(inferred) }); await expect(parseResumeText(masterResumeText)).rejects.toThrow("not explicitly stated");
});

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

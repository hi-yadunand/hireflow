import type { ResumeProfileImport } from "../src/types/index.js";
import { SafetyError } from "./validation.js";
const canonical = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
/** Extraction is verbatim, not resume rewriting. Reject unsupported facts rather
 * than turning model output into verified candidate information. Association and
 * completeness still require the candidate's explicit review. */
export function groundResumeImport(profile: ResumeProfileImport, source: string) {
  const haystack = canonical(source);
  const meaningful = Object.values(profile.personal || {}).some(value => typeof value === "string" && value.trim()) || [profile.skills, profile.experience, profile.education, profile.projects, profile.certifications, profile.professionalHighlights].some(list => list?.length);
  if (!meaningful) throw new SafetyError("Gemini did not extract any usable resume facts. Try clearer source text or another document; nothing was saved.", 502);
  const containsFact = (value: string) => {
    const needle = canonical(value); let start = haystack.indexOf(needle);
    while (start >= 0) {
      const before = haystack[start - 1] || "", after = haystack[start + needle.length] || "";
      if ((!/[\p{L}\p{N}]/u.test(needle[0]) || !/[\p{L}\p{N}]/u.test(before)) && (!/[\p{L}\p{N}]/u.test(needle.at(-1)!) || !/[\p{L}\p{N}]/u.test(after))) return true;
      start = haystack.indexOf(needle, start + 1);
    }
    return false;
  };
  const check = (value: unknown, path: string) => {
    if (typeof value !== "string" || !value.trim()) return;
    if (!containsFact(value)) throw new SafetyError(`Gemini extraction contains an unsupported fact in ${path}. Review the source or retry; nothing was saved.`, 502, { code: "AI_UNGROUNDED" });
  };
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) { value.forEach(item => walk(item, path)); return; }
    if (value && typeof value === "object") { for (const [key, item] of Object.entries(value)) if (!["id", "type", "current", "remotePreference", "status", "period", "experienceLevel", "importWarnings"].includes(key)) walk(item, `${path}.${key}`); return; }
    if (typeof value === "number") { if (value && !new RegExp(`(^|[^0-9])${value}([^0-9]|$)`).test(source.replace(/[, ]/g, ""))) throw new SafetyError(`Gemini extraction contains an unsupported number in ${path}; nothing was saved.`, 502); return; }
    check(value, path);
  };
  if (profile.projects?.some(p => !p.title.trim())) throw new SafetyError("Extracted projects must have a source name", 502);
  walk(profile, "profile");
  for (const e of profile.experience || []) {
    if (e.current && !/\b(present|current|ongoing|to date)\b/i.test(e.endDate)) throw new SafetyError("Current employment was not supported by the resume; retry extraction", 502);
    if (e.type !== "Not provided") {
      const evidence = { Internship: /\bintern(?:ship)?\b/i, "Full-time": /\bfull[ -]?time\b/i, "Part-time": /\bpart[ -]?time\b/i, Contract: /\bcontract(?:or)?\b/i }[e.type];
      if (!evidence.test(haystack)) throw new SafetyError("Employment type was not explicit in the resume; retry extraction", 502);
    }
  }
  const p = profile.preferences;
  if (p?.remotePreference && p.remotePreference !== "any") {
    const word = { remote_only: "remote", hybrid_flexible: "hybrid", onsite_allowed: "on.?site" }[p.remotePreference];
    const explicit = new RegExp(`(?:prefer|seeking|desired|target|open to)[^\\n]{0,60}\\b${word}\\b|\\b${word}\\b[^\\n]{0,60}(?:prefer|only|desired)`, "i");
    if (!explicit.test(source)) throw new SafetyError("Remote/workplace preference was not explicitly stated; retry extraction", 502);
  }
  if (p?.experienceLevel && p.experienceLevel !== "Any") check(p.experienceLevel, "experience level");
  if (p?.workAuthorization?.status && p.workAuthorization.status !== "Not provided") {
    if (!p.workAuthorization.details?.trim()) throw new SafetyError("Work authorization requires explicit source details", 502);
    check(p.workAuthorization.details, "work authorization");
    const evidence = { "Citizen": /\bcitizen(?:ship)?\b/i, "Permanent Resident": /\bpermanent residen|green card/i, "Work Visa": /\bwork visa|h.?1b|\bTN\b|\bO1\b/i, "Requires Sponsorship": /requires?.*sponsor|needs?.*sponsor|sponsor.*required/i }[p.workAuthorization.status];
    if (!evidence?.test(p.workAuthorization.details)) throw new SafetyError("Authorization classification lacks explicit supporting details; retry extraction", 502);
  }
  return profile;
}

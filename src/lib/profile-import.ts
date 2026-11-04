import type { Profile, ResumeProfileImport } from "../types/index.js";
import { normalizeProfileHighlights } from "./profile.js";
export interface ImportConflict { id: string; path: string[]; label: string; current: unknown; incoming: unknown; }
const key = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const empty = (value: unknown) => value === undefined || value === null || value === "" || value === "Not provided" || value === 0;
const union = (current: string[], incoming: string[]) => { const seen = new Set(current.map(key)); return [...current, ...incoming.filter(value => { const k = key(value); if (!k || seen.has(k)) return false; seen.add(k); return true; })]; };
function at(root: any, path: string[]) { return path.reduce((node, part) => Array.isArray(node) ? node.find(item => item.id === part) : node?.[part], root); }
function assign(root: any, path: string[], value: unknown) { const parent = at(root, path.slice(0, -1)); if (!parent) throw new Error("This profile section changed. Run extraction again before resolving the conflict."); parent[path.at(-1)!] = structuredClone(value); }
export function resolveImportConflict(profile: Profile, conflict: ImportConflict) {
  if (!same(at(profile, conflict.path), conflict.current)) throw new Error("This field changed after extraction. Review your edit or run extraction again.");
  const result = structuredClone(profile); assign(result, conflict.path, conflict.incoming); result.reviewedAt = undefined; return result;
}
/** Fill missing facts and merge genuine lists. Never overwrite a nonempty scalar
 * without an explicit per-field or bulk choice. Natural keys ignore AI-generated
 * IDs, so reimporting the same resume cannot duplicate its records. */
export function mergeProfileImport(base: Profile, incoming: ResumeProfileImport, preferIncoming = false) {
  const profile = normalizeProfileHighlights(structuredClone(base)), conflicts: ImportConflict[] = [];
  const merge = (target: any, source: any, path: string[], label: string) => {
    for (const [field, value] of Object.entries(source || {})) {
      if (["id", "revision", "reviewedAt", "updatedAt", "isDemo", "legacyUnverified", "legacyProfileAvailable", "rawResumeText", "importWarnings"].includes(field) || empty(value)) continue;
      const location = [...path, field], prior = target[field];
      if (Array.isArray(value)) {
        if (!value.length) continue;
        target[field] = preferIncoming ? union([], value as string[]) : union(Array.isArray(prior) ? prior : [], value as string[]); continue;
      }
      if (typeof value === "object") { target[field] ||= {}; merge(target[field], value, location, label); continue; }
      if (field === "current" && value === false && !source.endDate?.trim()) continue;
      if (empty(prior) || prior === "any" || prior === "Any" || same(prior, value) || preferIncoming) target[field] = value;
      else conflicts.push({ id: JSON.stringify(location), path: location, label: `${label}: ${field.replace(/([A-Z])/g, " $1").toLowerCase()}`, current: prior, incoming: value });
    }
  };
  merge(profile.personal, incoming.personal, ["personal"], "Personal details");
  for (const field of ["skills", "languages", "professionalHighlights"] as const) if (incoming[field]?.length) profile[field] = preferIncoming ? union([], incoming[field]!) : union(profile[field] || [], incoming[field]!);
  const identity: Record<"experience" | "education" | "projects" | "certifications", string[]> = { experience: ["company", "role"], education: ["institution", "degree", "fieldOfStudy"], projects: ["title"], certifications: ["name", "issuer"] };
  for (const collection of ["experience", "education", "projects", "certifications"] as const) {
    const records = profile[collection] as any[];
    for (const record of incoming[collection] || []) {
      const match = records.find(prior => identity[collection].every(field => !key(prior[field]) || !key((record as any)[field]) || key(prior[field]) === key((record as any)[field])) && (!("startDate" in record) || !prior.startDate || !record.startDate || key(prior.startDate) === key(record.startDate)));
      if (match) merge(match, record, [collection, match.id], `${collection === "experience" ? "Work" : collection}: ${(record as any).company || (record as any).title || (record as any).institution || (record as any).name}`);
      else records.push(structuredClone(record));
    }
  }
  if (incoming.preferences) merge(profile.preferences, incoming.preferences, ["preferences"], "Preferences (explicit source facts only)");
  profile.reviewedAt = undefined;
  return { profile: normalizeProfileHighlights(profile), conflicts };
}

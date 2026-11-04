import type { Profile } from "../types/index.js";

/** Optional profile bullets have one stored/wire representation: an array.
 * Blank editor rows are not candidate information. Do not coerce invalid types
 * or trim/rewrite a genuine user-provided highlight. */
export function normalizeHighlights(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new TypeError("highlights must be an array of strings");
  }
  return value.filter(item => item.trim().length > 0);
}

export function normalizeProfileHighlights(profile: Profile): Profile {
  return {
    ...profile,
    ...(profile.professionalHighlights === undefined ? {} : { professionalHighlights: normalizeHighlights(profile.professionalHighlights) }),
    personal: { ...profile.personal, ...(profile.personal.otherLinks === undefined ? {} : { otherLinks: normalizeHighlights(profile.personal.otherLinks) }) },
    preferences: { ...profile.preferences, ...(profile.preferences.preferredLocations === undefined ? {} : { preferredLocations: normalizeHighlights(profile.preferences.preferredLocations) }) },
    education: profile.education.map(item => ({ ...item, ...(item.achievements === undefined ? {} : { achievements: normalizeHighlights(item.achievements) }) })),
    experience: profile.experience.map(item => ({ ...item, highlights: normalizeHighlights(item.highlights) })),
    projects: profile.projects.map(item => ({ ...item, technologies: normalizeHighlights(item.technologies), highlights: normalizeHighlights(item.highlights) })),
  };
}

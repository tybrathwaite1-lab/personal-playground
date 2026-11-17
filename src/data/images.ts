/**
 * Editorial image registry. Every image here is free-licensed (Unsplash License,
 * Creative Commons or public domain) and is downloaded + converted to WebP during
 * the build by scripts/images/fetch.ts — the app serves its own copies, so they
 * work offline and nothing loads from the source sites at runtime.
 *
 * kind: 'venue'        → a real photo of that exact place (used only when correctly identified)
 *       'illustrative' → a mood photo; the app labels it as illustrative
 *
 * See IMAGE_CREDITS.md for the full attribution list.
 */
export interface EditorialImageMeta {
  id: string;
  kind: 'venue' | 'illustrative';
  /** Where the build downloads it from. */
  download: string;
  /** Human page for the photo (attribution link). */
  sourceUrl: string;
  credit: string;
  license: 'Unsplash License' | 'CC BY 2.0' | 'CC BY-SA 2.0' | 'CC BY-SA 3.0' | 'CC BY-SA 4.0' | 'CC BY 4.0' | 'Public domain' | 'CC0';
  alt: string;
  /** Subjects this image is used for: experience ids, place ids, edition ids, vibe ids… */
  subjects: string[];
  /** Interest/category tags used as a fallback match. */
  tags: string[];
  focus?: string;
}

export const IMAGES: EditorialImageMeta[] = [];

/** Best image for a subject: exact subject match first, then the first tag overlap. */
export function imageFor(subject: string, tags: string[] = []): EditorialImageMeta | null {
  const exact = IMAGES.find((i) => i.subjects.includes(subject));
  if (exact) return exact;
  const lower = tags.map((t) => t.toLowerCase());
  return IMAGES.find((i) => i.tags.some((t) => lower.some((l) => l.includes(t.toLowerCase())))) ?? null;
}

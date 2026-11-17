/**
 * Builds the copy-paste prompt for preparing a Weekly Drop edition with an
 * external research assistant (ChatGPT or similar). The reader's private taste
 * notes are added here, on the device, so they never live in the public repo.
 */
export interface PromptInput {
  issue: number;
  publishDate: string;
  notes: string;
}

export function buildAssistantPrompt({ issue, publishDate, notes }: PromptInput): string {
  const profile = notes.trim()
    ? `\n\nAbout the reader (use these as reference points and doorways — don't recommend the things they already know):\n${notes.trim()}`
    : '';
  return `You're the editor of "The Weekly Drop", a small personal culture magazine. Prepare issue ${issue}, publishDate ${publishDate} (a Friday), status "draft". Pick a theme and a short editorial title that tie the items together.

Research real things only. For every item give working https sources you have actually opened, and set verifiedAt to today's date. Label old material "freshness": "archive"; only use "contemporary" or "emerging" with a dated source and a "year".

Write 5–7 items across different columns (listen, screen, select-player, blackbook, fit, archive, lab, rabbit-hole, local-find, reset, wildcard): one "feature" of 300–700 words and the rest "brief"s of 40–100 words, as plain-text paragraphs. Give each item a "why". Add "related" thread links: mark documented connections "basis": "fact" and pairings "basis": "editorial".

Balance, as a loose guide: about half archive/nostalgia, a third timeless, a little contemporary; mostly lesser-known, some accessible, a few genuinely obscure. Voice: a knowledgeable friend who loves underground culture — no hype, no clickbait, no motivational lines. Local items should be in St. Petersburg / Tampa Bay, Florida.${profile}

Output only valid JSON matching the attached schema (content/drop/edition.schema.json) and example edition — no commentary.`;
}

/** The Friday on or after the day after `ymd`. */
export function nextFriday(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

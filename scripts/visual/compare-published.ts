/**
 * Default-appearance regression check (Creative Slice 03, Phase 3.1).
 *
 * Compares two branches' published Visual check screenshots on the `visual-results` branch,
 * pixel by pixel: by default this branch against `main`, at 390 and 1280 px, for every
 * standard route (full page and first screen) plus the open menu. Production code that should
 * look the same must produce the same pixels.
 *
 * Read-only: it fetches `visual-results` and reads blobs with git; it changes nothing, needs no
 * credentials for a public repository and never runs branch code. The screenshots were
 * produced from synthetic fixtures with a frozen clock and validated by the reviewed publisher.
 *
 * Usage:
 *   npx tsx scripts/visual/compare-published.ts --head <branch> [--base main]
 *       [--widths 390,1280] [--out report.md] [--no-fetch] [--strict]
 *
 * Verdicts per image:
 *   identical  every pixel equal
 *   noise      ≤ 0.5 % of pixels differ by more than 32 levels and the mean difference is
 *              ≤ 0.5 levels (seen between two runs of the same commit: the phone tab bar, which
 *              is fixed to the viewport, lands a few pixels differently in full-page captures)
 *   changed    anything more, or a different size
 * `--strict` exits 1 if anything is "changed"; without it the report is informational.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { STANDARD_ROUTES, folderFor } from './publish/policy.mjs';

export interface Raw {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}
export interface Diff {
  verdict: 'identical' | 'noise' | 'changed';
  /** Why, in a few words. */
  detail: string;
  changedPixels: number;
  changedRatio: number;
  meanDiff: number;
  /** First and last pixel row with a changed pixel. */
  rows: [number, number] | null;
}

export const PIXEL_THRESHOLD = 32;
export const NOISE_MAX_RATIO = 0.005;
export const NOISE_MAX_MEAN = 0.5;

/** Compares two decoded images of the same channel layout. */
export function compareRaw(a: Raw, b: Raw): Diff {
  if (a.channels !== b.channels) throw new Error(`channel mismatch: ${a.channels} vs ${b.channels}`);
  if (a.width !== b.width || a.height !== b.height)
    return { verdict: 'changed', detail: `size ${a.width}×${a.height} → ${b.width}×${b.height}`, changedPixels: NaN, changedRatio: NaN, meanDiff: NaN, rows: null };
  const c = a.channels;
  let changed = 0;
  let sum = 0;
  let first = -1;
  let last = -1;
  for (let px = 0; px < a.width * a.height; px++) {
    let worst = 0;
    for (let k = 0; k < c; k++) {
      const d = Math.abs(a.data[px * c + k] - b.data[px * c + k]);
      sum += d;
      if (d > worst) worst = d;
    }
    if (worst > PIXEL_THRESHOLD) {
      changed++;
      const row = Math.floor(px / a.width);
      if (first < 0) first = row;
      last = row;
    }
  }
  const ratio = changed / (a.width * a.height);
  const mean = sum / a.data.length;
  const rows: [number, number] | null = first < 0 ? null : [first, last];
  if (sum === 0) return { verdict: 'identical', detail: 'identical', changedPixels: 0, changedRatio: 0, meanDiff: 0, rows };
  const where = rows ? `rows ${rows[0]}–${rows[1]}` : 'faint everywhere';
  const stats = `${changed} px (${(ratio * 100).toFixed(2)} %), mean ${mean.toFixed(3)}, ${where}`;
  return ratio <= NOISE_MAX_RATIO && mean <= NOISE_MAX_MEAN
    ? { verdict: 'noise', detail: `noise: ${stats}`, changedPixels: changed, changedRatio: ratio, meanDiff: mean, rows }
    : { verdict: 'changed', detail: `changed: ${stats}`, changedPixels: changed, changedRatio: ratio, meanDiff: mean, rows };
}

export async function decode(buf: Buffer): Promise<Raw> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

/** The images compared for one width: each standard route full page and first screen, and the menu at 390. */
export function imagesFor(width: number): string[] {
  const files = STANDARD_ROUTES.flatMap((r) => [`${width}/${r}.jpg`, `${width}/${r}-fold.jpg`]);
  if (width === 390) files.push('states/menu-390.jpg');
  return files;
}

const git = (args: string[]) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });

async function main() {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const head = arg('head');
  if (!head) throw new Error('--head <branch> is required');
  const base = arg('base') ?? 'main';
  const widths = (arg('widths') ?? '390,1280').split(',').map(Number);
  if (!process.argv.includes('--no-fetch')) git(['fetch', '--no-tags', '--depth=1', 'origin', 'visual-results']);
  const ref = process.argv.includes('--no-fetch') ? 'origin/visual-results' : 'FETCH_HEAD';
  const [fb, fh] = [folderFor(base), folderFor(head)];
  const meta = (f: string) => JSON.parse(git(['show', `${ref}:${f}/meta.json`]).toString('utf8')) as { sha: string; runId: string };
  const [mb, mh] = [meta(fb), meta(fh)];

  const rows: string[] = [];
  const tally = { identical: 0, noise: 0, changed: 0 };
  for (const w of widths)
    for (const file of imagesFor(w)) {
      const d = compareRaw(await decode(git(['show', `${ref}:${fb}/${file}`])), await decode(git(['show', `${ref}:${fh}/${file}`])));
      tally[d.verdict]++;
      rows.push(`| \`${file}\` | ${d.verdict === 'identical' ? '✅ identical' : d.verdict === 'noise' ? `✅ ${d.detail}` : `❌ ${d.detail}`} |`);
    }
  const report = [
    `# Default appearance: \`${head}\` against \`${base}\``,
    '',
    `Base \`${base}\` at \`${mb.sha}\` (run ${mb.runId}); head \`${head}\` at \`${mh.sha}\` (run ${mh.runId}). Published Visual check screenshots, synthetic fixtures, frozen clock.`,
    '',
    `**${tally.identical} identical, ${tally.noise} within known noise, ${tally.changed} changed** (of ${rows.length}).`,
    '',
    '| Image | Result |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
  const out = arg('out');
  if (out) writeFileSync(out, report);
  console.log(report);
  if (process.argv.includes('--strict') && tally.changed) process.exit(1);
}

if (process.argv[1]?.endsWith('compare-published.ts')) await main();

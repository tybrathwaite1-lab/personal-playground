/**
 * Legacy colour inventory (Creative Slice 03, Phase 3.1).
 *
 * Counts every use of the fixed "Field Guide" palette in src/: Tailwind colour utilities built
 * on it (`text-paper`, `bg-ink2/60`, `md:hover:border-line`, …) in TS/TSX/CSS, and direct
 * `var(--pp-…)` references to its variables in CSS. Those colours don't follow the nearest
 * surface, so a page using them can't change look; the semantic tokens (`text-fg`,
 * `bg-surface`, `border-rule`, …) do. tests/legacy-colours.test.ts holds the count to the
 * committed baseline so it can only go down.
 *
 * Method (deterministic, formatting-independent):
 *  - The legacy colour names and variables are read from tailwind.config.js: every colour whose
 *    value uses a `--pp-*` variable (nested keys become `<name>-<key>`, DEFAULT becomes `<name>`).
 *  - Comments are removed, then every utility *token* is counted wherever it appears (class
 *    strings, template literals, helper calls, @apply), with any variant prefixes (`md:`,
 *    `hover:`), `!` important and `/opacity` suffix. Line breaks and ordering don't matter.
 *  - CSS also counts `var(--pp-<legacy variable>)`. Token definitions (any `tokens.css`) are
 *    the palette itself and are not counted.
 *
 * Usage: npx tsx scripts/inventory/legacy-colours.ts            print the inventory
 *        npx tsx scripts/inventory/legacy-colours.ts --write    update the committed baseline
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const BASELINE = join(ROOT, 'tests/fixtures/legacy-colours.json');

/** Tailwind utilities that take a colour. */
const PREFIXES = ['bg', 'text', 'border', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border-s', 'border-e', 'ring', 'ring-offset', 'outline', 'divide', 'from', 'via', 'to', 'fill', 'stroke', 'decoration', 'placeholder', 'caret', 'accent', 'shadow'];

export interface Palette {
  /** Utility colour names, e.g. ink, ink2, rust, rust-hover. */
  names: string[];
  /** CSS variables behind them, e.g. --pp-ink, --pp-rust-hover. */
  vars: string[];
}

/** The legacy palette, from the Tailwind config: colours backed by `--pp-*` variables. */
export function legacyPalette(colors: Record<string, unknown>): Palette {
  const names: string[] = [];
  const vars = new Set<string>();
  const visit = (name: string, v: unknown) => {
    if (typeof v === 'string') {
      const m = v.match(/--pp-[\w-]+/g);
      if (m) {
        names.push(name);
        m.forEach((x) => vars.add(x));
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) visit(k === 'DEFAULT' ? name : `${name}-${k}`, x);
    }
  };
  for (const [k, v] of Object.entries(colors)) visit(k, v);
  return { names: names.sort(), vars: [...vars].sort() };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Longest first, so `ink2` and `rust-hover` win over `ink` and `rust`. */
const alt = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(esc).join('|');

export function utilityPattern(p: Palette): RegExp {
  return new RegExp(`(?<![\\w-])(?:[\\w-]+:)*!?(?:${alt(PREFIXES)})-(?:${alt(p.names)})(?:\\/(?:\\d+|\\[[^\\]\\s]+\\]))?(?![\\w-])`, 'g');
}
export function varPattern(p: Palette): RegExp {
  return new RegExp(`var\\(\\s*(?:${alt(p.vars)})\\s*[,)]`, 'g');
}

/** Removes block and line comments (a `//` inside a URL such as `https://` is kept). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** Legacy uses in one file's text. */
export function countIn(src: string, kind: 'script' | 'css', p: Palette): number {
  const s = stripComments(src);
  const utilities = s.match(utilityPattern(p))?.length ?? 0;
  const vars = kind === 'css' ? (s.match(varPattern(p))?.length ?? 0) : 0;
  return utilities + vars;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

export interface Inventory {
  palette: Palette;
  total: number;
  /** Files with at least one use, path → count (repo-relative, sorted). */
  files: Record<string, number>;
}

export async function scan(root = ROOT): Promise<Inventory> {
  const config = (await import(pathToFileURL(join(root, 'tailwind.config.js')).href)).default as { theme: { extend: { colors: Record<string, unknown> } } };
  const palette = legacyPalette(config.theme.extend.colors);
  const files: Record<string, number> = {};
  for (const f of walk(join(root, 'src'))) {
    if (!/\.(tsx?|css)$/.test(f) || /(^|\/)tokens\.css$/.test(f)) continue;
    const n = countIn(readFileSync(f, 'utf8'), f.endsWith('.css') ? 'css' : 'script', palette);
    if (n) files[relative(root, f).split('\\').join('/')] = n;
  }
  return { palette, total: Object.values(files).reduce((a, b) => a + b, 0), files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inv = await scan();
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE, `${JSON.stringify(inv, null, 2)}\n`);
    console.log(`Wrote ${relative(ROOT, BASELINE)}: ${inv.total} legacy colour uses in ${Object.keys(inv.files).length} files.`);
  } else {
    for (const [f, n] of Object.entries(inv.files).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${f}`);
    console.log(`${String(inv.total).padStart(4)}  total in ${Object.keys(inv.files).length} files`);
  }
}

/**
 * Creative Slice 03, Phase 3.1: the legacy colour inventory may only go down.
 *
 * Fixed "Field Guide" colours (`text-paper`, `bg-ink`, `var(--pp-rust)`, …) don't follow the
 * nearest surface, so a page that uses them can't take on another look. The committed baseline
 * (tests/fixtures/legacy-colours.json) records every file's count today; this test fails when
 * any file goes up or a new file starts using them, and asks for the baseline to be lowered when
 * a migration brings a count down, so progress is recorded. Method: scripts/inventory/legacy-colours.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASELINE, countIn, legacyPalette, scan, stripComments, type Inventory } from '../scripts/inventory/legacy-colours.ts';

const UPDATE = 'npx tsx scripts/inventory/legacy-colours.ts --write';
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Inventory;

test('the palette is read from the Tailwind config, not hard-coded', async () => {
  const inv = await scan();
  assert.deepEqual(inv.palette.names, ['hunter', 'ink', 'ink2', 'line', 'muted', 'paper', 'rust', 'rust-hover']);
  assert.deepEqual(inv.palette.vars, ['--pp-hunter', '--pp-ink', '--pp-ink-2', '--pp-line', '--pp-muted', '--pp-paper', '--pp-rust', '--pp-rust-hover']);
  assert.deepEqual(inv.palette, baseline.palette, `the palette changed: review it, then ${UPDATE}`);
});

test('the counter counts utility tokens, not lines or formatting', () => {
  const p = legacyPalette({
    ink: 'rgb(var(--pp-ink) / <alpha-value>)',
    ink2: 'rgb(var(--pp-ink-2) / <alpha-value>)',
    rust: { DEFAULT: 'rgb(var(--pp-rust) / <alpha-value>)', hover: 'rgb(var(--pp-rust-hover) / <alpha-value>)' },
    accent: 'rgb(var(--accent) / <alpha-value>)',
  });
  assert.deepEqual(p.names, ['ink', 'ink2', 'rust', 'rust-hover']);
  const one = `<p className="text-ink bg-ink2/60 md:hover:border-rust !text-rust-hover ring-offset-ink">x</p>`;
  const split = `<p\n  className={cn(\n    'text-ink',\n    \`bg-ink2/60 \${x}\`,\n    "md:hover:border-rust",\n  )}\n  data-x="!text-rust-hover ring-offset-ink"\n/>`;
  assert.equal(countIn(one, 'script', p), 5);
  assert.equal(countIn(split, 'script', p), 5, 'same count however it is formatted');
  // Not legacy: semantic tokens, other colours, longer names, words in prose.
  assert.equal(countIn('text-accent bg-surface text-fg-muted text-inkwell bg-ink-3 text-rusty border-rule', 'script', p), 0);
  assert.equal(countIn('/* text-ink */ // bg-ink\nconst u = "https://example.test/a"; const c = "text-ink";', 'script', p), 1, 'comments ignored; a URL is not a comment');
  assert.equal(stripComments('a // b\nc'), 'a \nc');
  // CSS: @apply utilities and direct legacy variables, but not other variables.
  assert.equal(countIn('.x { @apply text-ink; color: rgb(var(--pp-rust)); background: rgb(var(--pp-ink-2) / 0.5); border-color: rgb(var(--pp-ns-ink)); }', 'css', p), 3);
  // Variables are counted only in CSS (in scripts they appear only via the palette config).
  assert.equal(countIn('style={{ color: "rgb(var(--pp-rust))" }}', 'script', p), 0);
});

test('legacy colour use never grows, and the baseline matches the repository', async () => {
  const now = await scan();
  const grew = Object.entries(now.files)
    .filter(([f, n]) => n > (baseline.files[f] ?? 0))
    .map(([f, n]) => `${f}: ${baseline.files[f] ?? 0} → ${n}`);
  assert.deepEqual(grew, [], 'Use semantic surface tokens (text-fg, bg-surface, border-rule, text-accent…) instead of fixed legacy colours.');
  const shrank = Object.entries(baseline.files)
    .filter(([f, n]) => (now.files[f] ?? 0) < n)
    .map(([f, n]) => `${f}: ${n} → ${now.files[f] ?? 0}`);
  assert.deepEqual(shrank, [], `Legacy colour use went down — record the progress: ${UPDATE}`);
  assert.equal(now.total, baseline.total);
});

test('the Phase 3.1 baseline: 471 legacy colour uses in 28 files', () => {
  // Recorded on main at 66110e5. Lower these numbers as pages migrate; never raise them.
  assert.equal(baseline.total, 471);
  assert.equal(Object.keys(baseline.files).length, 28);
  assert.equal(Object.values(baseline.files).reduce((a, b) => a + b, 0), baseline.total);
});

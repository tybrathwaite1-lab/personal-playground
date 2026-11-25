/**
 * Validates every standalone discovery record in content/discoveries/*.json and writes
 * public/data/discoveries.json with only the records that are public on the build date:
 * status "published" with a publishDate on or before it (New York). Draft and ready records,
 * and anything scheduled later, are never written. Each record is projected through an explicit
 * field allowlist (src/discovery/publish.ts), so editor-only and unknown fields never ship, and
 * its relations are kept only when their target is available on the same date. Invalid records
 * are reported and left out.
 *
 * Ids share one namespace with Weekly Drop items and thread nodes (collisions are errors).
 * Output is deterministic: records sorted by id, no timestamps beyond the build date.
 *
 * Usage: npx tsx scripts/discoveries/build.ts [--strict] [--today YYYY-MM-DD]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGES } from '../../src/data/images.ts';
import { publicDiscoveryFile } from '../../src/discovery/publish.ts';
import type { DiscoveryRecord } from '../../src/discovery/types.ts';
import { validateDiscoveryLibrary, validateDiscoveryRecord } from '../../src/discovery/validate.ts';
import type { DropEdition, DropFile, ThreadNode } from '../../src/types/drop.ts';
import { nyDate } from '../../src/utils/pulse.ts';

const strict = process.argv.includes('--strict');
const ti = process.argv.indexOf('--today');
const today = ti > 0 ? process.argv[ti + 1] : nyDate(Date.now());
const DIR = 'content/discoveries';
if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) {
  console.log(`✗ --today must be YYYY-MM-DD (got ${String(today)})`);
  process.exit(1);
}

let errorCount = 0;
const valid: DiscoveryRecord[] = [];
const images = new Map(IMAGES.map((i) => [i.id, i]));
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
for (const file of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: not valid JSON — ${(e as Error).message}`);
    errorCount++;
    continue;
  }
  const r = validateDiscoveryRecord(raw, { images, today }, file);
  r.warnings.forEach((w) => console.log(`  ! ${w.path}: ${w.message}`));
  r.errors.forEach((e) => console.log(`✗ ${e.path}: ${e.message}`));
  errorCount += r.errors.length;
  if (r.errors.length === 0) valid.push(raw as DiscoveryRecord);
}

// The shared id namespace: every Drop item (any status) and thread node.
const itemIds: string[] = [];
for (const f of readdirSync('content/drop/editions').filter((x) => x.endsWith('.json'))) {
  try {
    for (const it of (JSON.parse(readFileSync(join('content/drop/editions', f), 'utf8')) as DropEdition).items ?? []) itemIds.push(it.id);
  } catch {
    /* the Drop build reports unreadable editions */
  }
}
let nodeIds: string[] = [];
try {
  nodeIds = (JSON.parse(readFileSync('content/drop/nodes.json', 'utf8')) as ThreadNode[]).map((n) => n.id);
} catch {
  /* the Drop build reports an unreadable nodes file */
}
const lib = validateDiscoveryLibrary(valid, { itemIds, nodeIds });
lib.warnings.forEach((w) => console.log(`  ! ${w.path}: ${w.message}`));
lib.errors.forEach((e) => console.log(`✗ ${e.path}: ${e.message}`));
errorCount += lib.errors.length;
const colliding = new Set(lib.errors.map((e) => e.path));
// Relation targets are judged against what the Weekly Drop actually ships: its build (run first
// in npm run content / build) writes public/data/drop.json with only valid, non-draft editions and
// valid nodes. Without it, no Drop item or node counts as available (the conservative choice).
let drop: DropFile = { generatedAt: '', editions: [], nodes: [] };
if (existsSync('public/data/drop.json')) drop = JSON.parse(readFileSync('public/data/drop.json', 'utf8')) as DropFile;
else console.log('  ! public/data/drop.json not found: run the Drop build first; relations to Drop items and nodes are left out');
const file = publicDiscoveryFile(
  { editions: drop.editions, nodes: drop.nodes ?? [], discoveries: valid.filter((r) => !colliding.has(r.id)) },
  today,
);
const shippable = file.discoveries;

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/discoveries.json', JSON.stringify(file, null, 2) + '\n');
const by = (s: string) => valid.filter((r) => r.status === s).length;
console.log(
  `Discoveries: ${files.length} records (${by('draft')} draft, ${by('ready')} ready, ${by('published')} published), ${shippable.length} public as of ${today}, ${errorCount} errors → public/data/discoveries.json`,
);
if (strict && errorCount > 0) process.exit(1);

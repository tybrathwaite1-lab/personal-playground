/**
 * Validates every edition in content/drop/editions/*.json plus content/drop/nodes.json,
 * and writes public/data/drop.json with all non-draft editions (the app shows each
 * one from its publishDate). Invalid editions are left out and reported.
 *
 * Usage: npx tsx scripts/drop/build.ts [--strict]   (--strict exits 1 on any error)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMUNITIES } from '../../src/data/communities.ts';
import { IMAGES } from '../../src/data/images.ts';
import { SEED_PLACES } from '../../src/data/places.ts';
import type { DropEdition, DropFile, ThreadNode } from '../../src/types/drop.ts';
import { validateEdition, validateLibrary } from '../../src/utils/dropValidate.ts';

const strict = process.argv.includes('--strict');
const DIR = 'content/drop/editions';
const ctx = {
  knownImages: new Set(IMAGES.map((i) => i.id)),
  knownPlaces: new Set(SEED_PLACES.map((p) => p.id)),
  knownCommunities: new Set(COMMUNITIES.map((c) => c.id)),
};

let errorCount = 0;
const editions: DropEdition[] = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: not valid JSON — ${(e as Error).message}`);
    errorCount++;
    continue;
  }
  const { errors, warnings } = validateEdition(raw, ctx);
  warnings.forEach((w) => console.log(`  ! ${file} ${w.path}: ${w.message}`));
  if (errors.length) {
    errors.forEach((e) => console.log(`✗ ${file} ${e.path}: ${e.message}`));
    errorCount += errors.length;
    continue;
  }
  const ed = raw as DropEdition;
  console.log(`✓ ${file} — No. ${ed.issue} “${ed.title}” · ${ed.status} · ${ed.publishDate} · ${ed.items.length} items`);
  if (ed.status !== 'draft') editions.push(ed);
}

const nodesPath = 'content/drop/nodes.json';
const nodes: ThreadNode[] = existsSync(nodesPath) ? (JSON.parse(readFileSync(nodesPath, 'utf8')) as ThreadNode[]) : [];
const lib = validateLibrary(editions, nodes);
lib.warnings.forEach((w) => console.log(`  ! ${w.path}: ${w.message}`));
lib.errors.forEach((e) => console.log(`✗ ${e.path}: ${e.message}`));
errorCount += lib.errors.length;

const out: DropFile = { generatedAt: new Date().toISOString(), editions: editions.sort((a, b) => a.issue - b.issue), nodes };
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/drop.json', JSON.stringify(out));
console.log(`\nWeekly Drop: ${editions.length} editions, ${nodes.length} thread nodes → public/data/drop.json${errorCount ? ` (${errorCount} errors)` : ''}`);
if (strict && errorCount) process.exit(1);

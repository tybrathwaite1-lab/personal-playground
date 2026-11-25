/**
 * Checks every destination and source link in content/discoveries/*.json and reports each
 * one by class (scripts/discoveries/linkClass.ts): invalid, ok, intentional, permanent,
 * blocked or transient.
 *
 * By default it only reports and exits 0: external sites have outages and block bots, so a
 * network hiccup must never block CI. Editors run it with --require-reviews before
 * publishing: then it exits 1 if any link is invalid, or is permanently gone or blocked
 * without a recorded editorial decision (a linkReviews entry for that URL with decision
 * "keep"). Transient failures and declared intentional unavailability never fail it.
 *
 * Usage: npx tsx scripts/discoveries/check-links.ts [--require-reviews]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveryRecord } from '../../src/discovery/types.ts';
import { classifyLink, NEEDS_REVIEW, type CheckOutcome, type LinkClass } from './linkClass.ts';

const requireReviews = process.argv.includes('--require-reviews');
const DIR = 'content/discoveries';
const UA = 'Mozilla/5.0 (compatible; PersonalPlaygroundLinkCheck/1.0; +https://github.com/tybrathwaite1-lab/personal-playground)';

async function check(url: string): Promise<CheckOutcome> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (r.status === 405 || r.status === 403 || r.status === 404) r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    return { status: r.status };
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause;
    return { error: cause?.code ?? (e as Error).name };
  } finally {
    clearTimeout(t);
  }
}

const records = (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : []).map(
  (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as DiscoveryRecord,
);
const links: { record: DiscoveryRecord; url: string; role: string }[] = [];
for (const r of records) {
  if (r.destination?.url) links.push({ record: r, url: r.destination.url, role: 'destination' });
  for (const s of r.sources ?? []) links.push({ record: r, url: s.url, role: `source: ${s.label}` });
}

const counts = new Map<LinkClass, number>();
let failing = 0;
for (let i = 0; i < links.length; i += 6) {
  const batch = links.slice(i, i + 6);
  const outcomes = await Promise.all(batch.map((l) => check(l.url)));
  batch.forEach((l, j) => {
    const availability = l.role === 'destination' ? l.record.destination.availability : undefined;
    const cls = classifyLink(l.url, outcomes[j], availability);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
    if (cls === 'ok') return;
    const reviewed = (l.record.linkReviews ?? []).some((rv) => rv.url === l.url && rv.decision === 'keep');
    const unresolved = cls === 'invalid' || (NEEDS_REVIEW.has(cls) && !reviewed);
    if (unresolved) failing++;
    const o = outcomes[j];
    console.log(`${unresolved ? '✗' : '·'} ${cls.padEnd(11)} ${'status' in o ? o.status : o.error}  ${l.record.id} (${l.role})  ${l.url}${reviewed ? '  [reviewed: keep]' : ''}`);
  });
}
console.log(`\n${links.length} links: ${[...counts].map(([c, n]) => `${n} ${c}`).join(', ')}. ${failing} need an editorial decision.`);
if (requireReviews && failing > 0) process.exit(1);

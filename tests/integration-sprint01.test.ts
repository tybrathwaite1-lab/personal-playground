/**
 * Sprint 01 cross-PR checks (#14 dedupe × #16 prices). Synthetic feeds only.
 * Lives on the integration branch; lands once #14 and #16 are both merged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../src/utils/ics.ts';
import { dedupe, eventPriceRange, normalizeIcs } from '../src/utils/pulse.ts';

const NOW = '2026-11-17T12:00:00.000Z';
const feed = (desc: string, uid: string) =>
  parseIcs(
    `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Winter Concert\r\nDTSTART;TZID=America/New_York:20261212T190000\r\nLOCATION:Palladium\\, 253 5th Ave N\\, St. Petersburg\\, FL\r\nDESCRIPTION:${desc}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
  )[0];

test('merged event takes every price field from one real priceFrom() result', () => {
  // Source A: richer description, uncertain total (priceMin only). Source B: shorter, $28 incl. fees.
  const a = normalizeIcs(feed('An evening of seasonal choral works with guest soloists and a full orchestra. Tickets $20 + fees.', 'a1'), 'src-a', NOW)!;
  const b = normalizeIcs(feed('Tickets $20. Mandatory service fee $8.', 'b1'), 'src-b', NOW)!;
  assert.equal(a.priceMax, undefined);
  assert.equal(b.priceMax, 28);
  const [m] = dedupe([b, a]);
  assert.deepEqual(m.sourceIds, ['src-a', 'src-b']);
  const pick = { priceNote: m.priceNote, free: m.free, priceMin: m.priceMin, priceMax: m.priceMax };
  const fromA = { priceNote: a.priceNote, free: a.free, priceMin: a.priceMin, priceMax: a.priceMax };
  const fromB = { priceNote: b.priceNote, free: b.free, priceMin: b.priceMin, priceMax: b.priceMax };
  assert.ok(JSON.stringify(pick) === JSON.stringify(fromA) || JSON.stringify(pick) === JSON.stringify(fromB), JSON.stringify(pick));
  // Whichever listing wins, the merged event never claims a definite total under $25.
  assert.ok((eventPriceRange(m)?.[1] ?? Infinity) > 25);
});

test('a free listing merged with a priced one never mixes the free flag with an amount', () => {
  const a = normalizeIcs(feed('A long description of the free community concert in the park with local choirs. Free admission with RSVP.', 'a2'), 'src-a', NOW)!;
  const b = normalizeIcs(feed('Tickets $15.', 'b2'), 'src-b', NOW)!;
  const [m] = dedupe([a, b]);
  assert.ok(!(m.free && (m.priceMin ?? 0) > 0));
  assert.equal(m.priceMax, m.free ? 0 : 15);
});

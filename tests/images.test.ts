import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES, imageFor } from '../src/data/images.ts';
import { CREDITS } from '../scripts/images/credits.ts';

test('image registry: unique ids, free licenses, Commons sources, honest venue labels', () => {
  const ids = new Set<string>();
  for (const i of IMAGES) {
    assert.ok(!ids.has(i.id), `duplicate ${i.id}`);
    ids.add(i.id);
    assert.match(i.download, /^https:\/\/upload\.wikimedia\.org\//, `${i.id} download`);
    assert.match(i.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `${i.id} source`);
    assert.ok(i.alt.length > 15 && i.credit.length > 1, `${i.id} needs alt text and credit`);
    if (i.kind === 'venue') assert.ok(i.place, `${i.id}: venue photos must name the place`);
  }
});

test('venue photos are never used as a generic stand-in', () => {
  for (const v of IMAGES.filter((i) => i.kind === 'venue')) {
    const viaTags = imageFor('some-unrelated-subject', v.tags);
    assert.notEqual(viaTags?.id, v.id, `${v.id} matched by tag`);
  }
});

test('IMAGE_CREDITS.md is up to date with the registry', () => {
  assert.equal(readFileSync('IMAGE_CREDITS.md', 'utf8'), CREDITS, 'run: npx tsx scripts/images/credits.ts');
});

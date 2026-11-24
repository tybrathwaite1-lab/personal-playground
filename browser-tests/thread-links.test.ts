/**
 * Thread-node hardening (D-N): the "Follow the thread" panel renders a node's external link only
 * when isSafeUrl passes. The build already leaves unsafe nodes out of drop.json (tests/drop-nodes),
 * so to exercise the render guard this test serves a drop.json that bypassed the build: the real
 * first edition, with its lead item's thread pointing at synthetic nodes carrying each kind of URL.
 *
 * Unsafe URLs must never become links (no href, nothing to click, no script run), while the stop
 * itself stays readable and explorable. Valid links keep the existing convention: a new tab,
 * rel="noreferrer", the hostname as text. Real data is checked separately: every real node with a
 * URL still shows its link exactly as before.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, scenario, unsafeHrefs } from './helpers/harness.ts';

browserSuite();

const PAYLOAD = 'window.__ppUnsafeRan=1';
const NODES = {
  'node-safe-https': 'https://example.org/sample-node',
  'node-plain-http': 'http://example.com/sample-node',
  'node-javascript': `javascript:${PAYLOAD}`,
  'node-mixed-case-javascript': `JaVaScRiPt:${PAYLOAD}`,
  'node-space-javascript': ` javascript:${PAYLOAD}`,
  'node-data': `data:text/html,<script>${PAYLOAD}</script>`,
  'node-malformed': 'https//missing-colon.example/x',
  'node-no-url': undefined,
} as const;
type NodeId = keyof typeof NODES;
const title = (id: NodeId) => `Sample ${id.slice(5).replace(/-/g, ' ')}`;
const LINKED: NodeId[] = ['node-safe-https', 'node-plain-http'];

const edition = JSON.parse(readFileSync(new URL('../content/drop/editions/001-after-hours.json', import.meta.url), 'utf8'));
const lead = edition.items.find((i: { id: string }) => i.id === edition.featured);
lead.related = (Object.keys(NODES) as NodeId[]).map((to) => ({ to, relation: 'sample link', note: `A synthetic stop (${to}).`, basis: 'editorial' }));
const crafted = JSON.stringify({
  generatedAt: '2026-11-21T00:00:00.000Z',
  editions: [edition],
  nodes: (Object.keys(NODES) as NodeId[]).map((id) => ({ id, title: title(id), type: 'project', summary: `Synthetic thread stop for ${id}.`, ...(NODES[id] === undefined ? {} : { url: NODES[id] }) })),
});

const panel = (page: Page) => page.getByRole('dialog', { name: 'Follow the thread' });

test('unsafe node URLs never become links in the thread panel; safe ones keep the external-link convention', scenario({}, async ({ page, open }) => {
  await page.route(/\/data\/drop\.json(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: crafted }));
  await open(`drop?item=${lead.id}`);
  await panel(page).waitFor();
  const before = page.url();

  for (const id of Object.keys(NODES) as NodeId[]) {
    // Recentre on the node from the start of the trail.
    await panel(page).getByRole('navigation', { name: 'Trail' }).getByRole('button').first().click();
    await panel(page).getByRole('button', { name: `${title(id)} →` }).click();
    await panel(page).getByRole('heading', { name: title(id) }).waitFor();
    // The stop stays readable whatever its URL.
    await panel(page).getByText(`Synthetic thread stop for ${id}.`).waitFor();

    const links = panel(page).locator('a[target="_blank"]');
    if (LINKED.includes(id)) {
      assert.equal(await links.count(), 1, `${id}: one external link`);
      assert.equal(await links.getAttribute('href'), NODES[id], `${id}: href kept exactly`);
      assert.equal(await links.getAttribute('rel'), 'noreferrer', `${id}: rel="noreferrer"`);
      assert.equal((await links.textContent())?.trim(), new URL(NODES[id]!).hostname.replace(/^www\./, ''), `${id}: the hostname as text`);
    } else {
      assert.equal(await links.count(), 0, `${id}: no external link`);
      const hrefs = await panel(page).locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      assert.ok(!hrefs.some((h) => NODES[id] !== undefined && h === NODES[id]), `${id}: its URL appears in no href`);
    }
    assert.deepEqual(await unsafeHrefs(page), [], `${id}: no unsafe href anywhere on the page`);
  }

  // Clicking where an unsafe link would be does nothing: no script, no navigation, no new tab.
  await panel(page).getByRole('navigation', { name: 'Trail' }).getByRole('button').first().click();
  await panel(page).getByRole('button', { name: `${title('node-javascript')} →` }).click();
  const popups: string[] = [];
  page.on('popup', (p) => popups.push(p.url()));
  const here = page.url();
  await panel(page).getByRole('heading', { name: title('node-javascript') }).click();
  await panel(page).getByText(`Synthetic thread stop for node-javascript.`).click();
  assert.equal(await page.evaluate(() => (window as unknown as { __ppUnsafeRan?: number }).__ppUnsafeRan), undefined, 'no javascript: payload ran');
  assert.equal(page.url(), here, 'no navigation away');
  assert.equal(new URL(page.url()).origin, new URL(before).origin);
  assert.deepEqual(popups, [], 'no new tab');
}));

test('real thread nodes still show their links exactly as before', scenario({}, async ({ page, open }) => {
  const nodes = JSON.parse(readFileSync(new URL('../content/drop/nodes.json', import.meta.url), 'utf8')) as { id: string; title: string; url?: string }[];
  const first = JSON.parse(readFileSync(new URL('../content/drop/editions/001-after-hours.json', import.meta.url), 'utf8'));
  const start = first.items.find((i: { id: string }) => i.id === first.featured);
  await open(`drop?item=${start.id}`);
  await panel(page).waitFor();
  // The lead item's own source link.
  const own = panel(page).locator('a[target="_blank"]');
  assert.equal(await own.getAttribute('href'), start.sources[0].url);
  // Each real node it links to keeps its link.
  const targets = (start.related as { to: string }[]).map((r) => nodes.find((n) => n.id === r.to)).filter((n): n is (typeof nodes)[number] => !!n);
  assert.ok(targets.length >= 3, `${targets.length} real nodes to visit`);
  for (const n of targets) {
    await panel(page).getByRole('navigation', { name: 'Trail' }).getByRole('button').first().click();
    await panel(page).getByRole('button', { name: `${n.title} →` }).click();
    await panel(page).getByRole('heading', { name: n.title }).waitFor();
    const link = panel(page).locator('a[target="_blank"]');
    if (n.url) {
      assert.equal(await link.getAttribute('href'), n.url, n.id);
      assert.equal(await link.getAttribute('rel'), 'noreferrer', n.id);
    } else assert.equal(await link.count(), 0, n.id);
  }
  assert.deepEqual(await unsafeHrefs(page), []);
}));

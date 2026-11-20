/**
 * M2-6: the browser-level check deferred from PR #39. Unsafe URLs that arrive in personal
 * data through a backup import must never become clickable links — in Field Notes, both
 * Digital Playground link paths (the list and the random destination) and Plan a Day stops —
 * while the content they belong to stays readable. Real http(s) links must keep working.
 *
 * "Ran" is detected by a global the javascript: payloads would set; external pages are never
 * reached (the harness blocks every host but the local server), so a working link is proven
 * by the browser attempting to open it in a new tab.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Locator, Page } from 'playwright-core';
import { browserSuite, scenario, unsafeHrefs, type Session } from './helpers/harness.ts';
import { backup, experience, file, note, personal, site } from './helpers/data.ts';

browserSuite();

const PAYLOAD = 'window.__ppUnsafeRan=1';
const URLS = {
  https: 'https://example.org/sample-valid',
  http: 'http://example.com/sample-plain-http',
  javascript: `javascript:${PAYLOAD}`,
  'mixed-case javascript': `JaVaScRiPt:${PAYLOAD}`,
  'space-prefixed javascript': ` javascript:${PAYLOAD}`,
  data: `data:text/html,<script>${PAYLOAD}</script>`,
  malformed: 'http//missing-colon.example/x',
} as const;
type Kind = keyof typeof URLS;
const SAFE: Kind[] = ['https', 'http'];
const KINDS = Object.keys(URLS) as Kind[];
const title = (k: Kind) => `Sample note (${k})`;
const siteName = (k: Kind) => `Sample site (${k})`;
// Plan a Day shows three stops; the remaining kinds are covered by the other two screens.
const PLAN_KINDS: Kind[] = ['data', 'javascript', 'https'];
const expName = (k: Kind) => `Sample stop (${k})`;
const MOODS = ['relax', 'create', 'explore'];

const imported = backup(
  personal({
    fieldNotes: KINDS.map((k, i) => note(`n-${i}`, title(k), URLS[k])),
    websites: KINDS.map((k, i) => site(`custom-site-${i}`, siteName(k), URLS[k])),
    customExperiences: PLAN_KINDS.map((k, i) => experience(`custom-exp-${i}`, expName(k), MOODS[i], URLS[k])),
  }),
);

async function importBackup({ page, open }: Session) {
  await open('backup');
  await page.getByLabel('Choose a backup file').setInputFiles(file('links.json', imported));
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.getByText('Backup restored').waitFor();
}

async function noScriptRan(page: Page) {
  assert.equal(await page.evaluate(() => (window as unknown as { __ppUnsafeRan?: number }).__ppUnsafeRan), undefined, 'no javascript: payload ran');
}

/** Clicking the unsafe item's text (where a link would be) does nothing: no script, no navigation, no new tab. */
async function clickInert(s: Session, targets: Locator[]) {
  const before = s.page.url();
  const pages = s.ctx.pages().length;
  for (const target of targets) await target.click();
  await noScriptRan(s.page);
  assert.equal(s.page.url(), before, 'no navigation');
  assert.equal(s.ctx.pages().length, pages, 'no new tab');
}

/** A safe link opens its URL in a new tab, without referrer or opener. */
async function opensInNewTab(s: Session, link: Locator, url: string) {
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match((await link.getAttribute('rel')) ?? '', /\bnoreferrer\b/);
  const host = new URL(url).host;
  const [popup, request] = await Promise.all([
    s.ctx.waitForEvent('page'),
    s.ctx.waitForEvent('request', { predicate: (r) => new URL(r.url()).host === host, timeout: 5000 }),
    link.click(),
  ]);
  assert.equal(request.headers()['referer'], undefined, 'no referrer sent');
  assert.equal(await popup.evaluate(() => window.opener), null, 'no opener');
  await popup.close();
}

test('Field Notes: unsafe note URLs render no link, the note stays readable, and safe links open', scenario({}, async (s) => {
  await importBackup(s);
  await s.open('notes');
  for (const k of KINDS) {
    const card = s.page.getByRole('listitem').filter({ has: s.page.getByRole('heading', { name: title(k), exact: true }) });
    await card.getByText(`${title(k)} — notes stay readable.`).waitFor();
    const links = card.getByRole('link');
    if (SAFE.includes(k)) {
      assert.equal(await links.count(), 1, `${k}: one link`);
      await opensInNewTab(s, links.first(), URLS[k]);
    } else {
      assert.equal(await links.count(), 0, `${k}: no link`);
      await clickInert(s, [card.getByRole('heading', { name: title(k) }), card.getByText(`${title(k)} — notes stay readable.`)]);
    }
  }
  assert.deepEqual(await unsafeHrefs(s.page), [], 'no link anywhere on the page has a non-http(s) href');
}));

test('Digital Playground list: unsafe sites are named but not linked; safe sites link out', scenario({}, async (s) => {
  await importBackup(s);
  await s.open('digital');
  for (const k of KINDS) {
    const row = s.page.getByRole('listitem').filter({ hasText: siteName(k) });
    await row.getByText(`${siteName(k)} — description stays readable.`).waitFor();
    const named = row.getByRole('link', { name: siteName(k), exact: true });
    if (SAFE.includes(k)) await opensInNewTab(s, named, URLS[k]);
    else {
      assert.equal(await named.count(), 0, `${k}: the name is not a link`);
      await clickInert(s, [row.getByText(siteName(k), { exact: true }), row.getByText(`${siteName(k)} — description stays readable.`)]);
    }
  }
  assert.deepEqual(await unsafeHrefs(s.page), []);
}));

test('Digital Playground random destination: an unsafe pick offers no Visit link; a safe pick does', scenario({}, async (s) => {
  await importBackup(s);
  await s.open('digital');
  const panel = s.page.locator('section').filter({ hasText: 'Random destination' });
  for (const k of KINDS) {
    // Narrow the list to one site so the dice can only land on it.
    await s.page.getByPlaceholder('Search sites and tags').fill(siteName(k));
    await panel.getByRole('button', { name: /Roll the dice|Another/ }).click();
    await panel.getByRole('heading', { name: siteName(k), exact: true }).waitFor();
    await panel.getByText(`${siteName(k)} — description stays readable.`).waitFor();
    const visit = panel.getByRole('link', { name: /^Visit/ });
    if (SAFE.includes(k)) await opensInNewTab(s, visit, URLS[k]);
    else {
      assert.equal(await visit.count(), 0, `${k}: no Visit link`);
      await clickInert(s, [panel.getByRole('heading', { name: siteName(k), exact: true }), panel.getByText(`${siteName(k)} — description stays readable.`)]);
    }
    assert.deepEqual(await unsafeHrefs(s.page), [], `${k}: no unsafe href on the page`);
  }
}));

// Math.random is pinned near 1 so Plan a Day picks the last eligible ideas: the imported ones.
test('Plan a Day: an imported stop with an unsafe link shows its label as text; a safe one links out', scenario({ random: 0.999999 }, async (s) => {
  await importBackup(s);
  await s.open('plan');
  await s.page.getByRole('tab', { name: /Day plan/ }).click();
  await s.page.getByRole('button', { name: 'Full day' }).click();
  await s.page.getByRole('button', { name: 'Plan my day' }).click();
  const day = s.page.getByRole('article', { name: 'Your day' });
  await day.waitFor();
  for (const k of PLAN_KINDS) {
    const stop = day.getByRole('listitem').filter({ hasText: expName(k) });
    await stop.getByText(`${expName(k)} — description stays readable.`).waitFor();
    const label = `${expName(k)} link label`;
    if (SAFE.includes(k)) await opensInNewTab(s, stop.getByRole('link', { name: label }), URLS[k]);
    else {
      assert.equal(await stop.getByRole('link', { name: label }).count(), 0, `${k}: the link label is not a link`);
      await clickInert(s, [stop.getByText(label, { exact: true })]);
    }
  }
  assert.deepEqual(await unsafeHrefs(s.page), []);
}));

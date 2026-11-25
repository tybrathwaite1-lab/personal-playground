/**
 * PR 3, the discovery experience preview (#/preview/living?d=<id>), in a real browser. Uses the
 * real preview file the build writes (the ten verified Edition 001 records), and a few
 * synthetic preview files injected over it for states the real content doesn't have (an image,
 * an unsafe link, a failed load). Checks: direct links; creator attribution and the original
 * destination (never the first source); sources on request; connections both ways with their
 * explanations and basis; a discovery with none; missing, malformed and unavailable ids;
 * Back/Forward and focus; the keyboard; phone widths without overflow; isolation from
 * personal data, existing routes and navigation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { BASE, browserSuite, MOBILE, scenario, STORAGE_KEY } from './helpers/harness.ts';

browserSuite();

const P = 'preview/living';
const PREVIEW_DATA = /\/data\/preview\/living\.json(\?.*)?$/;
const view = (page: Page) => page.locator('main').getAttribute('data-living-view');
/** Waits until the preview has loaded and shows `kind` (index, missing, found, error). */
async function ready(page: Page, kind: string) {
  await page.waitForFunction((k) => document.querySelector('main')?.getAttribute('data-living-view') === k, kind);
}
const h1 = (page: Page) => page.locator('main h1').innerText();
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText?.trim() ?? '');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const sample = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'sample-one',
  title: 'A synthetic sample',
  subject: 'Sample one',
  context: 'Synthetic context for a test.',
  nature: 'work',
  credits: [{ name: 'Sample Maker', role: 'Artist' }],
  tags: ['sample'],
  destination: { url: 'https://example.org/original', label: 'The sample original', verifiedAt: '2026-11-25' },
  sources: [{ label: 'A sample source', url: 'https://example.org/source', kind: 'reference', verifiedAt: '2026-11-25' }],
  ...over,
});
async function serve(page: Page, discoveries: unknown[]) {
  await page.route(PREVIEW_DATA, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview: true, asOf: '2026-11-25', discoveries }) }));
}

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`a direct link opens the discovery with its creators, the original and its connections (${label})`, scenario({ viewport }, async ({ page, open }) => {
    await open(`${P}?d=jazz-kissa`);
    await ready(page, 'found');
    assert.equal(await h1(page), 'The art of listening');
    assert.equal(await page.title(), 'The art of listening (preview) — Personal Playground');
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
    const text = await page.locator('main').innerText();
    for (const s of ['Japanese jazz kissa', 'Philip Arneill', 'Photographer and creator, Tokyo Jazz Joints', 'James Catchpole', 'Collaborator and podcast co-host, Tokyo Jazz Joints']) assert.ok(text.includes(s), s);
    assert.match(await page.locator('.living-status').innerText(), /Preview, not yet published/);

    // The original destination is its own field, never the first source.
    const visit = page.getByRole('link', { name: /^Visit the original/ });
    assert.equal(await visit.getAttribute('href'), 'https://www.tokyojazzjoints.com/who');
    assert.equal(await visit.getAttribute('target'), '_blank');
    assert.equal(await visit.getAttribute('rel'), 'noopener noreferrer');
    assert.match((await visit.innerText()).replace(/\s+/g, ' '), /Tokyo Jazz Joints, by Philip Arneill with James Catchpole tokyojazzjoints\.com/);
    assert.match(await visit.evaluate((a) => a.textContent ?? ''), /opens in a new tab/);

    // Sources wait behind a disclosure, then list every source with where it's from and when it was checked.
    const sources = page.locator('details.living-sources');
    assert.equal(await sources.evaluate((d) => (d as HTMLDetailsElement).open), false);
    await page.getByText('Sources and further reading').click();
    assert.equal(await sources.evaluate((d) => (d as HTMLDetailsElement).open), true);
    const links = sources.locator('a');
    assert.equal(await links.count(), 3);
    assert.equal(await links.first().getAttribute('href'), 'https://www.nationalgeographic.com/culture/article/japanese-jazz-kissa-cafe');
    assert.notEqual(await links.first().getAttribute('href'), await visit.getAttribute('href'));
    assert.match(await sources.innerText(), /nationalgeographic\.com, checked 25 November 2026/);

    // One connection, as authored, with its explanation and its basis in words.
    const conn = page.locator('.living-connections');
    assert.equal(await conn.locator('h2').innerText(), 'There are connections here.');
    assert.equal(await conn.locator('li').count(), 1);
    assert.equal((await conn.locator('.living-claim').innerText()).replace(/\s+/g, ' '), 'Japanese jazz kissa shares a focus on listening with 60625.');
    assert.match(await conn.locator('.living-note').innerText(), /^In both, listening itself becomes the experience/);
    assert.equal(await conn.locator('.living-basis').innerText(), 'Editorial association, not a documented link');
    assert.equal(await conn.getByRole('link', { name: '60625: The sounds of shared walls' }).getAttribute('href'), '#/preview/living?d=mauricio-lopez-60625');

    // No save control (My Finds is a later PR), no counters, no outside requests.
    assert.equal(await page.getByRole('button', { name: /keep|save/i }).count(), 0);
    assert.ok((await overflow(page)) <= 0, 'no horizontal overflow');
  }));
}

test('connections work both ways, keep their direction, and Back/Forward retrace the path with focus on the heading', scenario({}, async ({ page, open }) => {
  await open(`${P}?d=jazz-kissa`);
  await ready(page, 'found');
  await page.getByRole('link', { name: '60625: The sounds of shared walls' }).click();
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'The sounds of shared walls');
  assert.equal(await page.evaluate(() => location.hash), '#/preview/living?d=mauricio-lopez-60625');
  assert.equal(await focused(page), 'The sounds of shared walls', 'focus moves to the new discovery');

  // Here the jazz kissa claim is incoming: still written from the kissa to 60625, never reversed.
  const claims = (await page.locator('.living-claim').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.deepEqual(claims, ['60625 also makes the overlooked audible, like Arboreal Serenade.', 'Japanese jazz kissa shares a focus on listening with 60625.']);
  assert.deepEqual(await page.locator('.living-connections li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.direction)), ['outgoing', 'incoming']);

  await page.getByRole('link', { name: 'Arboreal Serenade: A tree with something to say' }).click();
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'A tree with something to say');
  // The path so far: in memory only.
  assert.deepEqual(await page.locator('.living-path li').allInnerTexts(), ['Japanese jazz kissa', '60625', 'Arboreal Serenade']);
  assert.equal(await page.locator('.living-path [aria-current="page"]').innerText(), 'Arboreal Serenade');

  await page.goBack();
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'The sounds of shared walls');
  assert.equal(await focused(page), 'The sounds of shared walls', 'Back also focuses the heading');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'The art of listening');
  await page.goForward();
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'The sounds of shared walls');
  // Reload: the same discovery, and the path starts again (nothing persisted).
  await page.reload();
  await ready(page, 'found');
  assert.equal(await h1(page), 'The sounds of shared walls');
  assert.equal(await page.locator('.living-path').count(), 0);
}));

test('a discovery with no connections says so plainly and invents none', scenario({ viewport: MOBILE }, async ({ page, open }) => {
  await open(`${P}?d=william-onyeabor`);
  await ready(page, 'found');
  assert.equal(await h1(page), 'The man who made his own sound');
  const conn = page.locator('.living-connections');
  assert.equal(await conn.locator('h2').innerText(), 'This one stands on its own.');
  assert.equal(await conn.locator('li').count(), 0);
  assert.equal(await conn.locator('a').count(), 0);
  assert.equal(await conn.getAttribute('data-connections'), '0');
  // Strandbeest: its claim about SEED (a draft) is gone; the claim made about it remains.
  await open(`${P}?d=strandbeest`);
  await ready(page, 'found');
  assert.deepEqual((await page.locator('.living-claim').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')), ["Low-tech Magazine's solar-powered website also designs around intermittent energy, like Strandbeest."]);
  assert.match(await page.locator('.living-credits').innerText(), /This site needs JavaScript turned on in your browser\./);
  assert.ok(!(await page.locator('body').innerText()).includes('SEED'), 'the draft never appears');
  // A subject with no credits: no invented names.
  await open(`${P}?d=japanese-game-centers`);
  await ready(page, 'found');
  assert.equal(await page.locator('#living-credits-h').innerText(), 'Where to find it');
  assert.equal(await page.locator('.living-people').count(), 0);
}));

test('no id shows the preview index; missing, malformed and unavailable ids show one calm state', scenario({ viewport: MOBILE }, async ({ page, open }) => {
  await open(P);
  await ready(page, 'index');
  assert.equal(await h1(page), 'Discoveries in preview');
  const index = page.locator('.living-index a');
  assert.equal(await index.count(), 10);
  assert.ok((await index.allInnerTexts()).every((t) => !/SEED/.test(t)));
  for (const d of ['seed-erosion-blocks', 'nope', '..%2Fdrop', 'JAZZ-KISSA', '%3Cscript%3E', '']) {
    await open(`${P}?d=${d}`);
    await ready(page, d === '' ? 'index' : 'missing');
    if (d !== '') {
      assert.equal(await h1(page), "There's no discovery here", d);
      assert.equal(await page.title(), 'Not found (preview) — Personal Playground');
      assert.equal(await page.locator('.living-index a').count(), 10, 'a way on');
    }
  }
  assert.ok((await overflow(page)) <= 0);
}));

test('the keyboard: skip link first, connections and the original reachable, Enter follows a connection', scenario({}, async ({ page, open }) => {
  await open(`${P}?d=return-of-the-obra-dinn`);
  await ready(page, 'found');
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'Skip to the discovery');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  assert.notEqual(outline, 'none', 'focus is visible');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  assert.equal(await page.evaluate(() => location.hash), '#/preview/living?d=return-of-the-obra-dinn', 'the skip link keeps the route');
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    seen.push(await focused(page));
    if (seen.at(-1)!.startsWith("Low-tech Magazine's solar-powered website")) break;
  }
  assert.ok(seen.some((s) => s.startsWith('Visit the original')), seen.join(' | '));
  assert.ok(seen.includes('Sources and further reading'), seen.join(' | '));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'An internet that follows the sun');
  assert.equal(await focused(page), 'An internet that follows the sun');
  assert.match(await page.locator('.living-credits').innerText(), /This site goes offline at times, by design\./);
}));

test('optional imagery: a licensed registry image is shown with its credit; an unknown one is simply absent', scenario({}, async ({ page, open }) => {
  // Image ids come from the editorial registry (src/data/images.ts); the record names one.
  const imageId = await (async () => {
    const { IMAGES } = await import('../src/data/images.ts');
    return IMAGES[0].id;
  })();
  await serve(page, [sample({ id: 'with-image', image: imageId }), sample({ id: 'unknown-image', image: 'not-in-the-registry' }), sample()]);
  await open(`${P}?d=with-image`);
  await ready(page, 'found');
  assert.equal(await page.locator('article').getAttribute('data-composition'), 'image');
  const img = page.locator('.living-figure img');
  assert.ok((await img.getAttribute('alt'))!.length > 0, 'alt text from the registry');
  assert.match((await img.getAttribute('src'))!, new RegExp(`${BASE}images/editorial/${imageId}-1200\\.webp$`));
  assert.match(await page.locator('.living-figure figcaption').innerText(), /Wikimedia Commons/i);
  await open(`${P}?d=unknown-image`);
  await ready(page, 'found');
  assert.equal(await page.locator('article').getAttribute('data-composition'), 'type');
  assert.equal(await page.locator('figure, img').count(), 0, 'no placeholder');
  await open(`${P}?d=sample-one`);
  await ready(page, 'found');
  assert.equal(await page.locator('figure, img').count(), 0);
}));

test('unsafe links in the preview file never become clickable; a failed load says what to do', scenario({}, async ({ page, open, reload }) => {
  await serve(page, [
    sample({ id: 'unsafe-destination', destination: { url: 'javascript:window.__ppRan=1', label: 'x', verifiedAt: '2026-11-25' } }),
    sample({ id: 'unsafe-source', sources: [{ label: 'Bad', url: 'javascript:window.__ppRan=1', kind: 'read', verifiedAt: '2026-11-25' }, { label: 'Good', url: 'https://example.org/good', kind: 'read', verifiedAt: '2026-11-25' }] }),
  ]);
  await open(`${P}?d=unsafe-destination`);
  await ready(page, 'missing');
  await open(`${P}?d=unsafe-source`);
  await ready(page, 'found');
  assert.deepEqual(await page.locator('main a[href^="javascript"], main a[href^="data"]').count(), 0);
  assert.deepEqual(await page.locator('.living-sources a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))), ['https://example.org/good']);

  await page.unroute(PREVIEW_DATA);
  await page.route(PREVIEW_DATA, (r) => r.fulfill({ status: 500, body: 'nope' }));
  await reload();
  await ready(page, 'error');
  assert.equal(await h1(page), "The preview didn't load");
  assert.match(await page.locator('main').innerText(), /Check your connection, then reload the page\./);
}));

test('isolation: the preview reads only its own file, saves nothing, and leaves the app and its navigation unchanged', scenario(
  {},
  async ({ page, open, raw, blocked }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await open(`${P}?d=jazz-kissa`);
    await ready(page, 'found');
    const before = await raw(STORAGE_KEY);
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.getByRole('link', { name: '60625: The sounds of shared walls' }).click();
    await ready(page, 'found');
    await page.getByText('Sources and further reading').click();
    await page.goBack();
    const data = new Set(requests.filter((p) => p.includes('/data/')));
    assert.ok(data.has(`${BASE}data/preview/living.json`));
    // The app's own providers (useDrop, usePulse) load on every route, previews included; the
    // preview reads none of them, and never the public discoveries file.
    for (const p of data) assert.ok([`${BASE}data/preview/living.json`, `${BASE}data/drop.json`, `${BASE}data/pulse.json`].includes(p), p);
    // The file itself carries nothing editor-only and no publication status.
    const body = await page.evaluate((u) => fetch(u).then((r) => r.text()), `${BASE}data/preview/living.json`);
    assert.doesNotMatch(body, /editorialNotes|linkReviews|"status"|publishDate|seed-erosion-blocks/);
    // The public discoveries file is still empty.
    const pub = JSON.parse(await page.evaluate((u) => fetch(u).then((r) => r.text()), `${BASE}data/discoveries.json`));
    assert.deepEqual(pub.discoveries, []);
    assert.equal(await raw(STORAGE_KEY), before, 'personal data untouched');
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), keys, 'no new storage keys (no history, no tracking)');
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).length), 0);
    assert.equal([...blocked].length, 0, 'no outside requests');

    // The rest of the app: unchanged, and nothing links to the preview.
    await open('');
    assert.equal(await page.locator('a[href*="preview"]').count(), 0, 'not promoted anywhere on Home');
    assert.equal(await page.locator('meta[name="robots"]').count(), 0, 'the noindex tag leaves with the preview');
    await open('drop');
    assert.equal(await page.locator('a[href*="preview"]').count(), 0);
    assert.equal(await view(page).catch(() => null), null);
  },
));

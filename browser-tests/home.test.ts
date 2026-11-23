/**
 * Creative Slice 01: the Editorial Cover homepage and its atmosphere, in a real browser.
 * Behavioural assertions only (surfaces by their tested token name, links by destination,
 * controls by role), so later visual iterations aren't constrained by markup details.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, MOBILE, scenario, STORAGE_KEY } from './helpers/harness.ts';

browserSuite();

const KEY = 'personal-playground:atmosphere';
/** Local times in New York (the harness's time zone). */
const NY = (hhmm: string) => `2026-11-21T${hhmm}:00-05:00`;

/** The atmosphere in effect and the surfaces it paints. */
async function look(page: Page) {
  return page.evaluate(() => ({
    atmosphere: document.documentElement.dataset.atmosphere,
    cover: document.querySelector('[data-home-area="cover"]')?.getAttribute('data-surface'),
    band: document.querySelector('[data-home-area="window"] [data-surface]')?.getAttribute('data-surface'),
  }));
}
const radio = (page: Page, name: RegExp) => page.getByRole('radio', { name }).first();
/** Waits until every area has its real content (the Weekly Drop and the Pulse load asynchronously). */
const settled = async (page: Page) => {
  await page.locator('[data-home-area="issue"] section').waitFor();
  await page.locator('[data-home-area="window"] a[href^="#/pulse?view"]').first().waitFor();
};

for (const [time, want, cover] of [
  ['07:30', 'morning', 'cream'],
  ['15:00', 'afternoon', 'teal'],
  ['21:45', 'after-hours', 'editorial'],
] as const) {
  test(`Auto follows the local clock: ${time} is ${want}`, scenario({ time: NY(time) }, async ({ page, open, raw }) => {
    await open('');
    await page.waitForFunction((w) => document.documentElement.dataset.atmosphere === w, want);
    assert.equal((await look(page)).cover, cover);
    assert.equal(await radio(page, /^Auto/).isChecked(), true, 'Auto is the default');
    assert.equal(await raw(KEY), null, 'nothing stored for Auto');
  }));
}

test('Auto changes at 11:00 without a reload', scenario({ time: NY('10:59'), fakeTimers: true }, async ({ page, open }) => {
  await open('');
  await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'morning');
  const marker = await page.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 1));
  await page.clock.runFor(61_000);
  await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'afternoon');
  assert.equal((await look(page)).cover, 'teal');
  assert.equal(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload), marker, 'same document, no reload');
}));

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`a manual atmosphere persists across reloads until Auto is chosen again (${label})`, scenario({ viewport }, async ({ page, open, reload, raw }) => {
    await open('');
    await radio(page, /^After hours/).check();
    await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'after-hours');
    assert.deepEqual(await look(page), { atmosphere: 'after-hours', cover: 'editorial', band: 'teal' });
    assert.equal(await raw(KEY), 'after-hours');

    await reload();
    assert.equal((await look(page)).atmosphere, 'after-hours', 'kept after a reload');
    assert.equal(await radio(page, /^After hours/).isChecked(), true);
    await open('pulse');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.atmosphere), 'after-hours', 'kept across sections');

    await open('');
    // Keyboard: arrow keys move through the radio group.
    await radio(page, /^After hours/).focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'afternoon');
    assert.equal(await raw(KEY), 'afternoon');

    await radio(page, /^Auto/).check();
    assert.equal(await raw(KEY), null, 'Auto clears the stored choice');
    await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'afternoon'); // 3 PM
    await reload();
    assert.equal(await radio(page, /^Auto/).isChecked(), true);
  }));
}

test('the atmosphere changes styling only: same content, links, order and data in every state', scenario({}, async ({ page, open, raw }) => {
  await open('');
  await settled(page);
  // Text as written (not as CSS renders it), with images and their credits set aside: they load
  // on their own schedule and aren't affected by the atmosphere. Auto's "(now …)" hint is the
  // selector reporting its own state, so it is set aside too.
  const snapshot = () =>
    page.evaluate(() => ({
      text: (() => {
        const m = document.querySelector('main')!.cloneNode(true) as HTMLElement;
        m.querySelectorAll('figure, [role="img"], [data-atmosphere-picker] label > span > span').forEach((n) => n.remove());
        return m.textContent!.replace(/\s+/g, ' ');
      })(),
      links: [...document.querySelectorAll('main a[href]')].filter((a) => !a.querySelector('figure')).map((a) => `${a.textContent?.trim()} → ${a.getAttribute('href')}`),
      headings: [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => h.textContent?.trim()),
      controls: [...document.querySelectorAll('main button, main input')].map((c) => c.getAttribute('aria-label') ?? (c as HTMLInputElement).value ?? c.textContent),
    }));
  const before = await snapshot();
  const data = await raw(STORAGE_KEY);
  for (const name of [/^Morning/, /^Afternoon/, /^After hours/, /^Auto/]) {
    await radio(page, name).check();
    assert.deepEqual(await snapshot(), before, `${name}: identical content`);
  }
  assert.equal(await raw(STORAGE_KEY), data, 'personal data untouched');
}));

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`the homepage keeps its useful actions (${label})`, scenario({ viewport }, async ({ page, open }) => {
    await open('');
    await settled(page);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')));
    for (const want of ['#/pulse', '#/drop', '#/collection', '#/notes', '#/rediscover', '#/discover', '#/plan', '#/digital', '#/local', '#/pulse?quick=date', '#/pulse?quick=friends'])
      assert.ok(hrefs.includes(want), `links to ${want}`);
    assert.ok(hrefs.some((h) => h?.startsWith('#/discover?exp=')), 'the cover star opens in Discover');
    // The primary entry point is on the cover, visible without scrolling.
    const cta = page.locator('[data-home-area="cover"]').getByRole('link', { name: /What’s on nearby/ });
    assert.ok(await cta.isVisible());
    assert.ok(await cta.evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight), 'primary action above the fold');
    // Surprise me goes to a fresh Discovery pick.
    await page.getByRole('button', { name: 'Surprise me' }).click();
    await page.waitForFunction(() => location.hash.startsWith('#/discover?surprise='));
    await page.goBack();
    await page.locator('[data-home-area="go-wander"]').getByRole('button').first().waitFor(); // the vibe picker is there
  }));

  test(`acceptance: open the cover, save something real, find it again after a reload (${label})`, scenario({ viewport }, async ({ page, open, reload, stored }) => {
    await open('');
    const star = page.locator('[data-home-area="cover-star"]');
    const title = ((await star.getByRole('heading').textContent()) ?? '').trim();
    assert.ok(title, 'a real featured experience is on the cover');
    await star.getByRole('button', { name: `Save ${title} to collection` }).click();
    await star.getByRole('button', { name: `Remove ${title} from collection` }).waitFor();

    await reload();
    // It now shows in Your Space and on the cover's own line.
    await page.locator('[data-home-area="your-space"]').getByText(title).waitFor();
    await page.locator('[data-home-area="cover"]').getByText('1 saved, waiting for you').click();
    await page.waitForFunction(() => location.hash === '#/collection');
    await page.getByText(title).first().waitFor();
    assert.ok(((await stored())!.saved as { title: string }[]).some((s) => s.title === title));
  }));
}

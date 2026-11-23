/**
 * M2-6: core navigation in a real browser, at desktop and phone widths. Assertions are about
 * behaviour (which section is showing, where focus goes, what history does), not styling: a
 * section is identified by its URL, its document title and its single top-level heading.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { ROUTES } from '../src/hooks/useRoute.ts';
import { browserSuite, DESKTOP, MOBILE, scenario } from './helpers/harness.ts';

browserSuite();

/** The section showing now: route hash, title and its one h1. */
async function section(page: Page) {
  const headings = (await page.locator('main h1').allTextContents()).map((h) => h.replace(/\s+/g, ' ').trim());
  assert.equal(headings.length, 1, `exactly one top-level heading (found ${headings.length})`);
  return { hash: new URL(page.url()).hash, title: await page.title(), heading: headings[0].trim() };
}

/** Waits for the section whose document title starts with `label`. */
async function expectSection(page: Page, hash: string, label: string) {
  await page.waitForFunction(([h, l]) => location.hash === h && document.title.startsWith(l), [hash, label]);
  const s = await section(page);
  assert.ok(s.heading.includes(label.replace(/ — .*/, '')) || label === 'Personal Playground', `heading "${s.heading}" names the section "${label}"`);
}

for (const [label, viewport] of [['desktop', DESKTOP], ['phone', MOBILE]] as const) {
  test(`direct routes (${label}): every section opens from its URL; unknown routes fall back to Home`, scenario({ viewport }, async ({ page, open }) => {
    const seen = new Map<string, string>();
    for (const route of ROUTES) {
      await open(route === 'home' ? '' : route);
      await page.waitForFunction((r) => (r === 'home' ? document.title === 'Personal Playground' : document.title.endsWith('— Personal Playground')), route);
      const s = await section(page);
      assert.equal(s.hash, route === 'home' ? '#/' : `#/${route}`);
      if (route !== 'home') assert.ok(s.heading.includes(s.title.replace(/ — Personal Playground$/, '')), `#/${route}: heading "${s.heading}" names the section "${s.title}"`);
      assert.ok(!seen.has(s.title), `#/${route} has its own title (shared with #/${seen.get(s.title)})`);
      seen.set(s.title, route);
    }
    await open('no-such-section');
    const unknown = await section(page);
    await open('');
    const home = await section(page);
    assert.deepEqual([unknown.title, unknown.heading], [home.title, home.heading], 'an unknown route shows Home');
  }));
}

test('desktop: the main navigation moves between sections, and back/forward retrace them', scenario({ viewport: DESKTOP }, async ({ page, open }) => {
  await open('');
  const main = page.getByRole('navigation', { name: 'Main' });
  assert.ok(await main.isVisible(), 'desktop navigation is visible');
  assert.ok(!(await page.getByRole('navigation', { name: 'Primary' }).isVisible()), 'the phone tab bar is hidden on desktop');

  await main.getByRole('link', { name: 'Discover' }).click();
  await expectSection(page, '#/discover', 'Discovery Engine');
  await main.getByRole('link', { name: 'Plan' }).click();
  await expectSection(page, '#/plan', 'Plan an Outing');
  await main.getByRole('link', { name: 'Digital' }).click();
  await expectSection(page, '#/digital', 'Digital Playground');

  await page.goBack();
  await expectSection(page, '#/plan', 'Plan an Outing');
  await page.goBack();
  await expectSection(page, '#/discover', 'Discovery Engine');
  await page.goForward();
  await expectSection(page, '#/plan', 'Plan an Outing');
  // The current section is marked for assistive technology.
  assert.equal(await main.getByRole('link', { name: 'Plan' }).getAttribute('aria-current'), 'page');
}));

test('phone: tab bar and full menu navigate; the menu closes on Escape and after choosing', scenario({ viewport: MOBILE }, async ({ page, open }) => {
  await open('');
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  assert.ok(await tabs.isVisible(), 'phone tab bar is visible');
  assert.ok(!(await page.getByRole('navigation', { name: 'Main' }).isVisible()), 'desktop navigation is hidden on a phone');

  await tabs.getByRole('link', { name: 'Pulse' }).click();
  await expectSection(page, '#/pulse', 'The Local Pulse');

  const menu = page.getByRole('dialog', { name: 'All sections' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await menu.waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  await expectSection(page, '#/pulse', 'The Local Pulse');

  await page.getByRole('button', { name: 'Open menu' }).click();
  await menu.getByRole('link', { name: /Field Notes/ }).click();
  await expectSection(page, '#/notes', 'Field Notes');
  assert.equal(await menu.count(), 0, 'the menu closes after choosing a section');

  await page.goBack();
  await expectSection(page, '#/pulse', 'The Local Pulse');
  await page.goForward();
  await expectSection(page, '#/notes', 'Field Notes');
}));

for (const [label, viewport] of [['desktop', DESKTOP], ['phone', MOBILE]] as const) {
  test(`in-page navigation (${label}): the skip link focuses the content without leaving the section`, scenario({ viewport }, async ({ page, open }) => {
    await open('plan');
    const before = await page.evaluate(() => history.length);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to content', 'the first Tab stop is the skip link');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'main');
    await expectSection(page, '#/plan', 'Plan an Outing');
    assert.equal(await page.evaluate(() => history.length), before, 'no history entry added');
  }));

  test(`essential interaction (${label}): plan a day, then follow a stop to its details`, scenario({ viewport, random: 0.5 }, async ({ page, open }) => {
    await open('plan');
    await page.getByRole('tab', { name: /Day plan/ }).click();
    assert.equal(await page.getByRole('tab', { name: /Day plan/ }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Plan my day' }).click();
    const day = page.getByRole('article', { name: 'Your day' });
    await day.waitFor();
    const stop = day.locator('a[href^="#/discover?exp="]').first();
    const name = ((await stop.textContent()) ?? '').trim();
    assert.ok(name, 'the itinerary names its first stop');
    await stop.click();
    await page.waitForFunction(() => location.hash.startsWith('#/discover?exp='));
    await expectSection(page, new URL(page.url()).hash, 'Discovery Engine');
    await page.getByText(name, { exact: true }).first().waitFor();
    await page.goBack();
    await expectSection(page, '#/plan', 'Plan an Outing');
  }));
}

for (const [label, viewport, opener] of [
  ['desktop', DESKTOP, 'Open menu'],
  ['phone', MOBILE, 'More'],
] as const) {
  test(`the full menu (${label}): offers the atmosphere selector, and Escape or × returns focus to the button that opened it`, scenario({ viewport }, async ({ page, open }) => {
    await open('drop');
    const button = page.getByRole('button', { name: opener, exact: true }).first();
    const menu = page.getByRole('dialog', { name: 'All sections' });
    await button.click();
    await menu.waitFor();
    await menu.getByRole('group', { name: 'Atmosphere' }).waitFor();
    await menu.getByRole('radio', { name: /^Morning/ }).check();
    await page.waitForFunction(() => document.documentElement.dataset.atmosphere === 'morning');
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-expanded') !== null && document.activeElement?.getAttribute('aria-controls') === 'more-menu');
    assert.equal(await button.evaluate((b) => b === document.activeElement), true, 'focus is back on the opener');

    await button.click();
    await menu.getByRole('button', { name: 'Close menu' }).click();
    await menu.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-controls') === 'more-menu');
    // Settings and backup stay reachable from the menu.
    await button.click();
    await menu.getByRole('link', { name: /Backup & Settings/ }).click();
    await expectSection(page, '#/backup', 'Backup');
  }));
}

test('active states are visible: the current section is marked in the desktop bar and the phone tab bar', scenario({ viewport: DESKTOP }, async ({ page, open, ctx }) => {
  await open('collection');
  const bar = await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Collection' })
    .evaluate((a) => ({ current: a.getAttribute('aria-current'), mark: getComputedStyle(a, '::after').transform }));
  assert.equal(bar.current, 'page');
  assert.notEqual(bar.mark, 'matrix(0, 0, 0, 1, 0, 0)', 'the accent bar is drawn under the current section');
  const phone = await ctx.newPage();
  await phone.setViewportSize(MOBILE);
  await phone.goto(page.url());
  const tab = await phone
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Collection' })
    .evaluate((a) => ({ current: a.getAttribute('aria-current'), mark: getComputedStyle(a, '::before').content }));
  assert.deepEqual(tab, { current: 'page', mark: '""' });
}));

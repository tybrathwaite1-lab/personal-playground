/**
 * Creative Slice 02 (Make It Yours) prototype B1, in a real browser: the journey by keyboard,
 * honest interest feedback, Skip as an explicit "no aesthetic preference", hash-route steps
 * (direct links, Back/Forward, reload, exit), functional equivalence across looks without
 * requiring the same composition, and isolation from personal data and the network.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, MOBILE, scenario, STORAGE_KEY } from './helpers/harness.ts';

browserSuite();

const P = 'preview/make-it-yours';
const root = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('[data-miy]')!;
    return { look: r.dataset.miyLook, palette: r.dataset.miyPalette ?? null, type: r.dataset.miyType ?? null, step: r.dataset.miyStep };
  });
const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
const hash = (page: Page) => page.evaluate(() => location.hash);
const atHeading = async (page: Page, name: string | RegExp) => {
  await page.waitForFunction((n) => {
    const t = document.querySelector('main h1')?.textContent?.trim() ?? '';
    return typeof n === 'string' ? t === n : new RegExp(n.source, n.flags).test(t);
  }, typeof name === 'string' ? name : { source: name.source, flags: name.flags });
};

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`the whole journey works from the keyboard: looks, a sample idea, interests, arrival (${label})`, scenario({ viewport }, async ({ page, open }) => {
    await open(P);
    await atHeading(page, 'Studio');
    assert.match(await page.locator('main').innerText(), /Look 1 of 3/);
    assert.equal((await root(page)).look, 'studio');

    // Browse: Next and Previous step through all three looks, each fully styled and choosable.
    await page.getByRole('button', { name: /^Next look/ }).focus();
    await page.keyboard.press('Enter');
    await atHeading(page, 'The Quiet Room');
    assert.equal(await focused(page), 'The Quiet Room', 'focus moves to the new look');
    assert.match(await page.locator('main').innerText(), /Look 2 of 3/);
    assert.equal((await root(page)).look, 'quiet-room');
    assert.equal(await page.getByRole('button', { name: 'Choose The Quiet Room' }).count(), 1);
    await page.getByRole('button', { name: /^Next look/ }).press('Enter');
    await atHeading(page, 'The Underground');
    assert.equal((await root(page)).look, 'underground');
    assert.equal(await page.getByRole('button', { name: 'Choose The Underground' }).count(), 1);
    await page.getByRole('button', { name: /^Next look\W+Studio$/ }).press('Enter');
    await atHeading(page, 'Studio');
    await page.getByRole('button', { name: /^Previous look\W+The Underground$/ }).press('Enter');
    await atHeading(page, 'The Underground');
    await page.getByRole('button', { name: /^Next look\W+Studio$/ }).press('Enter');
    await atHeading(page, 'Studio');

    // A sample idea opens in the look and Back returns focus to the link that opened it.
    const openSample = page.getByRole('link', { name: 'Open a sample idea' });
    await openSample.focus();
    await page.keyboard.press('Enter');
    await atHeading(page, 'Music Rabbit Hole');
    assert.equal(await focused(page), 'Music Rabbit Hole');
    assert.match(await page.locator('main').innerText(), /Sample idea from the curated catalogue[\s\S]*isn’t a live listing or a recommendation/);
    assert.equal((await root(page)).look, 'studio', 'shown in the look being previewed');
    await page.getByRole('button', { name: 'Back to the cover' }).press('Enter');
    await atHeading(page, 'Studio');
    assert.equal(await focused(page), 'Open a sample idea', 'focus returns to the opener');

    // Choose, pick interests with the keyboard (Space toggles a checkbox), enter.
    await page.getByRole('button', { name: 'Choose Studio' }).press('Enter');
    await atHeading(page, 'Pick a few interests');
    await page.getByRole('checkbox', { name: /^Walks/ }).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.getByRole('checkbox', { name: /^Walks/ }).isChecked(), true);
    await page.getByRole('button', { name: 'Enter the Playground' }).press('Enter');
    await page.locator('[data-miy-arrival]').waitFor();
    assert.equal((await root(page)).look, 'studio');
    assert.equal(await page.locator('[data-miy-featured]').first().getAttribute('data-miy-featured'), 'exp-local-history');
    assert.match(await focused(page), /personal\s*playground/i, 'focus lands on the Playground heading');
  }));
}

test('interest feedback is visible, specific and honest, including zero matches', scenario({}, async ({ page, open }) => {
  await open(`${P}?step=look&look=studio`);
  await page.getByRole('button', { name: 'Choose Studio' }).click();
  await atHeading(page, 'Pick a few interests');
  const fb = page.locator('[data-miy-feedback]');
  const leads = page.locator('[data-miy-leads]');
  assert.equal(await fb.textContent(), 'No interests picked. The cover shows a mix from the 10 sample ideas.');
  assert.equal(await fb.getAttribute('aria-live'), 'polite', 'announced as it changes');
  assert.match((await leads.textContent()) ?? '', /Music Rabbit Hole/);
  // Each choice says how much of the sample it matches, before it's picked.
  assert.match((await page.locator('[data-miy-interest="walks"]').textContent()) ?? '', /3 sample ideas/);
  assert.match((await page.locator('[data-miy-interest="film"]').textContent()) ?? '', /none in this sample/);

  await page.getByRole('checkbox', { name: /^Walks/ }).check();
  assert.equal(await fb.textContent(), '3 of 10 sample ideas match. Local History Adventure now leads the cover.');
  assert.match((await leads.textContent()) ?? '', /Local History Adventure/);
  assert.match(await page.locator('.miy-legend').innerText(), /1 picked/);
  await page.getByRole('checkbox', { name: /^Walks/ }).uncheck();
  await page.getByRole('checkbox', { name: /^Film/ }).check();
  assert.equal(await fb.textContent(), 'Nothing in this sample matches Film yet. The cover keeps a mix instead.');
  assert.match((await leads.textContent()) ?? '', /Music Rabbit Hole/, 'zero matches leave the mix as it was');

  await page.getByRole('button', { name: 'Enter the Playground' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
  const main = await page.locator('main').innerText();
  assert.match(main, /Nothing in this sample matches Film yet, so here is a mix of ten sample ideas\./);
  assert.doesNotMatch(main, /picked for you|recommended|just for you/i);
  assert.equal(await page.locator('[data-miy-idea]').count(), 10, 'still a populated space');
  assert.equal(await page.locator('main .studio-match').count(), 0, 'nothing claims to match');
}));

test('Skip keeps an explicit “no look chosen” state: the fallback style is shown, not inferred as a choice', scenario({}, async ({ page, open }) => {
  await open(P);
  await atHeading(page, 'Studio');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.equal((await root(page)).look, 'default');
  assert.equal((await root(page)).palette, null);
  assert.match((await page.locator('[data-miy-summary]').textContent()) ?? '', /No look chosen\. You’re seeing the prototype’s default style, not a look chosen for you\./);
  assert.equal(await page.getByRole('link', { name: 'Choose a look' }).count(), 1);
  assert.equal(await page.locator('[data-miy-customise]').count(), 0, 'no colour controls without a chosen look');
  assert.equal(await page.locator('[data-miy-idea]').count(), 10, 'populated without any choices');

  // Choosing a look later works from there, and Skip interests keeps the look but no interests.
  await page.getByRole('link', { name: 'Choose a look' }).click();
  await atHeading(page, 'Studio');
  await page.getByRole('button', { name: 'Choose Studio' }).click();
  await page.getByRole('checkbox', { name: /^Music/ }).check();
  await page.getByRole('button', { name: 'Skip interests' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.equal((await root(page)).look, 'studio');
  assert.match((await page.locator('[data-miy-summary]').textContent()) ?? '', /Look: Studio \(Poster, Bold sans\)\. No interests picked\./);
}));

test('steps are hash routes: direct links, Back/Forward, reload and exit behave predictably', scenario({}, async ({ page, open, reload }) => {
  // Walk in, choosing things.
  await open(P);
  await page.getByRole('button', { name: 'Choose Studio' }).click();
  await atHeading(page, 'Pick a few interests');
  assert.equal(await hash(page), '#/preview/make-it-yours?step=interests');
  await page.getByRole('checkbox', { name: /^Music/ }).check();
  await page.getByRole('button', { name: 'Enter the Playground' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.equal(await hash(page), '#/preview/make-it-yours?step=arrival', 'the URL carries no look, interests or colours');

  // Back and Forward move through steps; choices made in this page survive the trip.
  await page.goBack();
  await atHeading(page, 'Pick a few interests');
  assert.equal(await page.getByRole('checkbox', { name: /^Music/ }).isChecked(), true);
  await page.goBack();
  await atHeading(page, 'Studio');
  await page.goForward();
  await page.goForward();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.equal((await root(page)).look, 'studio');
  assert.equal(await page.locator('[data-miy-fresh]').count(), 0);

  // An idea opened from the arrival: Back (browser or button) returns to the arrival.
  await page.locator('[data-miy-idea="exp-plant-workshop"] a').click();
  await atHeading(page, 'Plant Workshop');
  assert.equal(await hash(page), '#/preview/make-it-yours?step=arrival&sample=exp-plant-workshop');
  await page.goBack();
  await page.locator('[data-miy-arrival]').waitFor();
  await page.goForward();
  await atHeading(page, 'Plant Workshop');
  await page.getByRole('button', { name: 'Back to the Playground' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.match(await focused(page), /^Plant Workshop/, 'focus returns to the idea that was opened');

  // Reload: the URL is a place, not a saved preference. Choices are gone, and the page says so.
  await reload();
  await page.locator('[data-miy-arrival]').waitFor();
  assert.equal((await root(page)).look, 'default');
  assert.match((await page.locator('[data-miy-fresh]').textContent()) ?? '', /keeps choices only while the page is open/);
  assert.match((await page.locator('[data-miy-summary]').textContent()) ?? '', /No look chosen.*No interests picked/);

  // A direct link to an idea: Back to the cover stays in the prototype (no history to go back to).
  await open(`${P}?step=look&look=studio&sample=exp-home-cafe`);
  await atHeading(page, 'Home Café');
  await page.getByRole('button', { name: 'Back to the cover' }).click();
  await atHeading(page, 'Studio');
  assert.equal(await hash(page), '#/preview/make-it-yours?step=look&look=studio');
  // Unknown places fall back to the first look.
  await open(`${P}?step=nope&look=nope&sample=nope`);
  await atHeading(page, 'Studio');

  // Exit returns to the real app, which shows nothing of the prototype.
  await page.getByRole('link', { name: 'Exit preview' }).click();
  await page.waitForFunction(() => location.hash === '#/');
  await page.locator('[data-home-area="cover"]').waitFor();
  assert.equal(await page.locator('[data-miy]').count(), 0);
  assert.equal(await page.title(), 'Personal Playground');
}));

/** What someone can do and find on the arrival, independent of how a look composes it. */
const functions = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main')!;
    // (No local helper functions: the test runner's name wrapper doesn't exist in the page.)
    return {
      landmarks: ['header', 'main'].map((t) => document.querySelectorAll(`[data-miy] ${t}`).length),
      h1: [...main.querySelectorAll('h1')].map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()),
      headings: [...main.querySelectorAll('h2')].map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).sort(),
      // The way back to the looks opens on the chosen look; the destination is the same step.
      links: [...main.querySelectorAll('a[href]')].map((a) => (a.getAttribute('href') ?? '').replace(/look=[\w-]+/, 'look=*')).sort(),
      buttons: [...main.querySelectorAll('button')]
        .map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
        .filter((n) => n)
        .sort(),
      ideas: [...main.querySelectorAll('[data-miy-idea]')].map((e) => e.getAttribute('data-miy-idea')).sort(),
      featured: main.querySelector('[data-miy-featured]')?.getAttribute('data-miy-featured'),
      invitation: (main.querySelector('.miy-invite')?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
    };
  });
/** How it looks: the composition and type, which should differ between looks. */
const appearance = async (page: Page) => {
  return page.evaluate(() => {
    const h1 = document.querySelector('main h1')!;
    const cs = getComputedStyle(h1);
    return {
      cover: document.querySelector('[data-miy-cover]')?.getAttribute('data-miy-cover'),
      font: cs.fontFamily.split(',')[0],
      transform: cs.textTransform,
      background: getComputedStyle(document.querySelector('[data-miy]')!).backgroundColor,
    };
  });
};

/** Arrives in a look (by choosing it from the first look onwards) or, for null, by skipping. */
async function arriveIn(page: Page, open: (r: string) => Promise<void>, look: 'studio' | 'quiet-room' | 'underground' | null) {
  await open(look ? `${P}?step=look&look=${look}` : P);
  if (look) await page.getByRole('button', { name: /^Choose/ }).click();
  else await page.getByRole('button', { name: 'Skip for now' }).click();
  if (look) await page.getByRole('button', { name: 'Enter the Playground' }).click();
  await page.locator('[data-miy-arrival]').waitFor();
}

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`all three looks are functionally equivalent without sharing a composition (${label})`, scenario({ viewport }, async ({ page, open }) => {
    const seen: Record<string, { does: Awaited<ReturnType<typeof functions>>; looks: Awaited<ReturnType<typeof appearance>> }> = {};
    for (const look of ['studio', 'quiet-room', 'underground', null] as const) {
      await arriveIn(page, open, look);
      seen[look ?? 'none'] = { does: await functions(page), looks: await appearance(page) };
    }
    const base = seen.studio.does;
    assert.equal(base.ideas.length, 10);
    assert.deepEqual(base.landmarks, [1, 1]);
    for (const [name, { does }] of Object.entries(seen)) {
      // Same product: landmarks, headings, destinations, actions, content and the one invitation.
      assert.deepEqual(does, base, `${name}: same functions as the Studio`);
    }
    // …each in a genuinely different form: no two looks share a cover, a heading face or a page
    // colour. (With no look chosen the fallback style may resemble the Underground, per D3, but
    // its cover is its own.)
    const looks = ['studio', 'quiet-room', 'underground'];
    for (const [i, x] of looks.entries())
      for (const y of looks.slice(i + 1)) for (const k of ['cover', 'font', 'background'] as const) assert.notEqual(seen[x].looks[k], seen[y].looks[k], `${x} vs ${y}: ${k}`);
    for (const x of looks) assert.notEqual(seen[x].looks.cover, seen.none.looks.cover);
    assert.deepEqual(
      looks.map((n) => seen[n].looks.font.replace(/"/g, '')),
      ['IBM Plex Sans', 'Newsreader', 'Anton'],
    );
  }));
}

test('each look presents a sample idea in its own way, with the same facts', scenario({}, async ({ page, open }) => {
  const facts: string[] = [];
  const fonts = new Set<string>();
  for (const look of ['studio', 'quiet-room', 'underground'] as const) {
    await open(`${P}?step=look&look=${look}&sample=exp-street-photo`);
    await atHeading(page, 'Street Photography Walk');
    assert.equal((await root(page)).look, look);
    assert.equal(await page.locator('[data-miy-sample] [data-miy-layout]').getAttribute('data-miy-layout'), look, 'its own layout');
    facts.push(
      await page.evaluate(() =>
        [...document.querySelectorAll('main dl div')].map((d) => `${d.querySelector('dt')?.textContent}: ${d.querySelector('dd')?.textContent}`).join(' | '),
      ),
    );
    fonts.add(await page.evaluate(() => getComputedStyle(document.querySelector('main h1')!).fontFamily.split(',')[0]));
    assert.equal(await page.locator('main li').count(), 4, 'all four activities');
    assert.match(await page.locator('main').innerText(), /isn’t a live listing or a recommendation/);
  }
  assert.equal(new Set(facts).size, 1, 'the same time, cost and energy in every look');
  assert.equal(fonts.size, 3, 'three different heading faces');
}));

for (const [look, name, palette, type, summary] of [
  ['studio', 'Studio', ['Night studio', 'night'], ['Typewriter', 'mono'], 'Studio (Night studio, Typewriter)'],
  ['quiet-room', 'The Quiet Room', ['Lamplight', 'lamplight'], ['Serif and sans', 'serif-sans'], 'The Quiet Room (Lamplight, Serif and sans)'],
  ['underground', 'The Underground', ['Forest', 'forest'], ['Zine mono', 'zine'], 'The Underground (Forest, Zine mono)'],
] as const) {
  test(`colour and type are optional, apply at once, and can be revisited (${name})`, scenario({ viewport: MOBILE }, async ({ page, open }) => {
    await open(`${P}?step=look&look=${look}`);
    await atHeading(page, name);
    const details = page.locator('[data-miy-customise]');
    assert.equal(await details.evaluate((d) => (d as HTMLDetailsElement).open), false, 'closed by default');
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('[data-miy]')!).backgroundColor);
    await page.getByText('Adjust colour and type').click();
    await page.getByRole('radio', { name: palette[0] }).check();
    assert.equal((await root(page)).palette, palette[1], 'the preview recolours at once');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('[data-miy]')!).backgroundColor), before);
    await page.getByRole('button', { name: `Choose ${name}` }).click();
    await page.getByRole('button', { name: 'Enter the Playground' }).click();
    await page.locator('[data-miy-arrival]').waitFor();
    assert.equal((await root(page)).palette, palette[1]);
    await page.getByText('Adjust colour and type').click();
    assert.equal(await page.getByRole('radio', { name: palette[0] }).isChecked(), true);
    const faces = () =>
      page.evaluate(() => ['main h2', '[data-miy-subline]'].map((q) => getComputedStyle(document.querySelector(q)!).fontFamily).join(' | '));
    const facesBefore = await faces();
    await page.getByRole('radio', { name: type[0] }).check();
    assert.equal((await root(page)).type, type[1]);
    assert.notEqual(await faces(), facesBefore, 'the type pairing changes the type on screen');
    assert.match((await page.locator('[data-miy-summary]').textContent()) ?? '', new RegExp(`Look: ${summary.replace(/[()]/g, '\\$&')}`));
    // Revisit the looks: the choice is still there.
    await page.getByRole('link', { name: 'Change look' }).click();
    await atHeading(page, name);
    assert.deepEqual(await root(page), { look, palette: palette[1], type: type[1], step: 'look' });
  }));
}

test('the Quiet Room serif is self-hosted and loaded only by the prototype', scenario({}, async ({ page, open }) => {
  const fontRequests: string[] = [];
  page.on('request', (r) => /newsreader/i.test(r.url()) && fontRequests.push(new URL(r.url()).pathname));
  await open('');
  await page.locator('[data-home-area="cover"]').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  assert.deepEqual(fontRequests, [], 'the app shell never requests it');
  await open(`${P}?step=look&look=quiet-room`);
  await atHeading(page, 'The Quiet Room');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  assert.ok(await page.evaluate(() => document.fonts.check('400 16px Newsreader')), 'Newsreader is available in the Quiet Room');
  assert.ok(fontRequests.length > 0 && fontRequests.every((u) => u.startsWith('/personal-playground/')), `same-origin font files: ${fontRequests.join(', ')}`);
}));

test('isolation: a full journey leaves personal data and settings untouched and makes no outside request', scenario(
  {
    storage: {
      // Synthetic personal data and preferences, as a real device might have.
      [STORAGE_KEY]: { version: 1, saved: [{ id: 's1', kind: 'experience', refId: 'exp-new-game', title: 'New Game Discovery', savedAt: '2026-11-01T12:00:00.000Z' }], notes: [], favorites: [] },
      'personal-playground:atmosphere': 'after-hours',
    },
  },
  async ({ page, open, blocked }) => {
    await open('');
    await page.locator('[data-home-area="cover"]').waitFor();
    const snapshot = () =>
      page.evaluate(() => ({
        local: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
        session: sessionStorage.length,
      }));
    const before = await snapshot();

    await open(P);
    await page.getByRole('button', { name: /^Next look/ }).click();
    await page.getByRole('button', { name: /^Previous look/ }).click();
    await page.getByText('Adjust colour and type').click();
    await page.getByRole('radio', { name: 'Sherbet' }).check();
    await page.getByRole('link', { name: 'Open a sample idea' }).click();
    await page.getByRole('button', { name: 'Back to the cover' }).click();
    await page.getByRole('button', { name: 'Choose Studio' }).click();
    await page.getByRole('checkbox', { name: /^Games/ }).check();
    await page.getByRole('button', { name: 'Enter the Playground' }).click();
    await page.locator('[data-miy-arrival]').waitFor();
    // The preview save is clearly marked and stays in the preview.
    const save = page.locator('[data-miy-save]');
    await save.click();
    assert.equal(await save.getAttribute('aria-pressed'), 'true');
    assert.match((await page.locator('[data-miy-save-note]').textContent()) ?? '', /Saved in this preview only\. It isn’t added to your real Collection\./);
    assert.match((await page.locator('[data-miy-badge]').textContent()) ?? '', /nothing here is saved/);

    assert.deepEqual(await snapshot(), before, 'every storage key byte-identical');
    await page.getByRole('link', { name: 'Exit preview' }).click();
    await page.locator('[data-home-area="cover"]').waitFor();
    assert.deepEqual(await snapshot(), before);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.atmosphere), 'after-hours', 'the real atmosphere setting is untouched');
    assert.deepEqual([...blocked], [], 'no request left the origin');
  },
));

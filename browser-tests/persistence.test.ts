/**
 * M2-6: personal data survives a reload in a real browser, older stored records still load
 * (and are upgraded on the next save), and a corrupted record never breaks the app.
 * Storage is the scenario's own isolated, synthetic localStorage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSuite, MOBILE, scenario, STORAGE_KEY } from './helpers/harness.ts';
import { note } from './helpers/data.ts';

browserSuite();

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`edits survive a reload (${label}): a new field note, a favorite, a saved site and a setting`, scenario({ viewport }, async ({ page, open, reload, stored }) => {
    await open('notes');
    await page.getByRole('button', { name: 'New note' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Title').fill('Sample reload note');
    await form.getByLabel('URL (optional)').fill('https://example.org/reload');
    await form.getByRole('button', { name: 'Add note' }).click();
    await page.getByRole('heading', { name: 'Sample reload note' }).waitFor();

    await open('digital');
    const fav = page.getByRole('button', { name: /^Favorite / }).first();
    const siteName = ((await fav.getAttribute('aria-label')) ?? '').replace(/^Favorite /, '');
    await fav.click();
    await page.getByRole('button', { name: `Save ${siteName} to collection` }).click();

    await open('backup');
    await page.getByRole('button', { name: /Weather-aware picks: On/ }).click();
    await page.getByRole('button', { name: /Weather-aware picks: Off/ }).waitFor();

    await reload();
    assert.ok(await page.getByRole('button', { name: /Weather-aware picks: Off/ }).isVisible(), 'setting kept');
    await open('notes');
    await page.getByRole('heading', { name: 'Sample reload note' }).waitFor();
    assert.equal(await page.getByRole('link', { name: /example\.org/ }).getAttribute('href'), 'https://example.org/reload');
    await open('digital');
    assert.equal(await page.getByRole('button', { name: `Unfavorite ${siteName}` }).getAttribute('aria-pressed'), 'true', 'favorite kept');
    await open('collection');
    await page.getByText(siteName).first().waitFor();

    const d = (await stored())!;
    assert.equal((d.fieldNotes as { title: string }[])[0].title, 'Sample reload note');
    assert.equal((d.settings as { weatherAware: boolean }).weatherAware, false);
  }));
}

test('an older stored record loads, keeps its data, and is upgraded to the current shape', scenario(
  {
    storage: {
      // An early record: no presets, feedback, hidden sites or newer settings; one invalid favorite.
      [STORAGE_KEY]: { version: 1, saved: [], favorites: ['sample-fav', 7], fieldNotes: [note('legacy-1', 'Sample legacy note')], settings: { weatherAware: false } },
    },
  },
  async ({ page, open, stored }) => {
    await open('notes');
    await page.getByRole('heading', { name: 'Sample legacy note' }).waitFor();
    await page.getByText('Sample legacy note — notes stay readable.').waitFor();
    await open('backup');
    await page.getByRole('button', { name: /Weather-aware picks: Off/ }).waitFor();

    const d = (await stored())!;
    assert.deepEqual(d.favorites, ['sample-fav'], 'invalid entries dropped, valid ones kept');
    assert.deepEqual(d.customPresets, []);
    assert.deepEqual(d.hiddenWebsiteIds, []);
    assert.deepEqual(d.settings, { showAutopilot: false, weatherAware: false, location: null, radiusMiles: 10, transport: 'car', readerNotes: '' });
  },
));

test('a corrupted stored record opens an empty playground instead of failing, and the next edit saves cleanly', scenario(
  { storage: { [STORAGE_KEY]: '{"version":1,"fieldNotes":[{"id":' } },
  async ({ page, open, stored }) => {
    await open('notes');
    await page.getByText('Blank pages.').waitFor();
    await page.getByRole('button', { name: 'New note' }).click();
    await page.getByRole('dialog').getByLabel('Title').fill('Sample fresh note');
    await page.getByRole('dialog').getByRole('button', { name: 'Add note' }).click();
    await page.getByRole('heading', { name: 'Sample fresh note' }).waitFor();
    assert.equal(((await stored())!.fieldNotes as unknown[]).length, 1);
  },
));

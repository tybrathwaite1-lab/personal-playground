/**
 * M2-6: backup export and import in a real browser — the downloaded file, merge, replace,
 * cancel, and malformed files, judged by what the user sees and what is stored afterwards.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, scenario, STORAGE_KEY, SYNC_CONFIG_KEY } from './helpers/harness.ts';
import { backup, file, note, personal } from './helpers/data.ts';
import { SYNTHETIC_TOKEN } from './helpers/fake-github.ts';

browserSuite();

const mine = personal({ fieldNotes: [note('mine-1', 'Sample note already here')], favorites: ['sample-fav'] });
const theirs = backup(personal({ fieldNotes: [note('theirs-1', 'Sample imported note')] }));

const chooseFile = (page: Page, f: ReturnType<typeof file>) => page.getByLabel('Choose a backup file').setInputFiles(f);
const pending = (page: Page) => page.getByRole('status').filter({ hasText: 'Backup ready to import' });
const noteTitles = async (page: Page) => (await page.locator('main h2').allTextContents()).map((t) => t.trim()).sort();

test('export downloads the personal data (never the sync token), and an erased device restores from it', scenario(
  { storage: { [STORAGE_KEY]: mine, [SYNC_CONFIG_KEY]: { owner: 'sample-owner', repo: 'sample-data', path: 'playground-data.json', token: SYNTHETIC_TOKEN } } },
  async ({ page, open, stored, raw, dialogs }) => {
    await open('backup');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).click()]);
    assert.equal(download.suggestedFilename(), 'personal-playground-backup-2026-11-21.json', 'named for the (frozen) day');
    const text = await readFile((await download.path())!, 'utf8');
    const exported = JSON.parse(text) as { app: string; exportedAt: string; data: { fieldNotes: { title: string }[] } };
    assert.equal(exported.app, 'personal-playground');
    assert.equal(exported.exportedAt, '2026-11-21T20:00:00.000Z');
    assert.deepEqual(exported.data.fieldNotes.map((n) => n.title), ['Sample note already here']);
    assert.ok(!text.includes(SYNTHETIC_TOKEN) && !text.includes('sample-data'), 'the backup carries no sync token or repository');

    await page.getByRole('button', { name: /Erase personal data/ }).click();
    assert.match(dialogs.at(-1)!, /Erase all personal data/);
    await page.getByText('0 field notes', { exact: false }).waitFor();
    assert.deepEqual((await stored())!.fieldNotes, []);
    assert.equal(await raw(SYNC_CONFIG_KEY), null, 'erasing also disconnects sync on this device');

    await chooseFile(page, file('restore.json', text));
    await pending(page).getByText('1 field notes').waitFor();
    await pending(page).getByRole('button', { name: 'Replace everything' }).click();
    await page.getByText('Backup restored').waitFor();
    await open('notes');
    assert.deepEqual(await noteTitles(page), ['Sample note already here']);
  },
));

test('merge keeps what is here and adds the backup, and survives a reload', scenario({ storage: { [STORAGE_KEY]: mine } }, async ({ page, open, reload }) => {
  await open('backup');
  await chooseFile(page, file('theirs.json', theirs));
  await pending(page).getByText('1 field notes').waitFor();
  await pending(page).getByRole('button', { name: 'Merge with current' }).click();
  await page.getByText('Backup merged').waitFor();
  assert.equal(await pending(page).count(), 0, 'the import panel closes');
  await reload();
  await open('notes');
  assert.deepEqual(await noteTitles(page), ['Sample imported note', 'Sample note already here']);
}));

test('replace asks first: declining or cancelling changes nothing', scenario({ storage: { [STORAGE_KEY]: mine } }, async ({ page, open, raw, dismissNextDialog, dialogs }) => {
  await open('backup');
  const before = await raw(STORAGE_KEY);
  await chooseFile(page, file('theirs.json', theirs));
  dismissNextDialog();
  await pending(page).getByRole('button', { name: 'Replace everything' }).click();
  assert.match(dialogs.at(-1)!, /Replace everything on this device/);
  assert.equal(await pending(page).count(), 1, 'still waiting for a decision');
  await pending(page).getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await pending(page).count(), 0);
  assert.equal(await raw(STORAGE_KEY), before, 'stored data unchanged');
  await open('notes');
  assert.deepEqual(await noteTitles(page), ['Sample note already here']);
}));

test('malformed backups show an error and never touch the existing data', scenario({ storage: { [STORAGE_KEY]: mine } }, async ({ page, open, raw, reload }) => {
  await open('backup');
  const before = await raw(STORAGE_KEY);
  // Alternating messages, so each case's error is a new one rather than the previous still showing.
  const cases: [string, string, RegExp][] = [
    ['truncated.json', JSON.stringify(theirs).slice(0, 40), /not valid JSON/],
    ['other-app.json', JSON.stringify({ app: 'something-else', data: { fieldNotes: [] } }), /does not look like a Personal Playground backup/],
    ['empty.json', '', /not valid JSON/],
    ['array.json', '[1,2,3]', /does not look like a Personal Playground backup/],
    ['plain-text.json', 'Personal Playground backup', /not valid JSON/],
    ['null.json', 'null', /does not look like a Personal Playground backup/],
  ];
  for (const [name, content, message] of cases) {
    await chooseFile(page, file(name, content));
    const alert = page.getByRole('alert').filter({ hasText: message });
    await alert.waitFor();
    assert.equal(await pending(page).count(), 0, `${name}: nothing offered for import`);
    assert.equal(await raw(STORAGE_KEY), before, `${name}: stored data unchanged`);
  }
  await reload();
  await open('notes');
  assert.deepEqual(await noteTitles(page), ['Sample note already here'], 'still there after a reload');
}));

test('legacy backups (a bare data object, without the export wrapper) still import', scenario({ storage: { [STORAGE_KEY]: mine } }, async ({ page, open }) => {
  await open('backup');
  await chooseFile(page, file('bare.json', { version: 1, fieldNotes: [note('bare-1', 'Sample bare-format note')] }));
  await pending(page).getByRole('button', { name: 'Merge with current' }).click();
  await page.getByText('Backup merged').waitFor();
  await open('notes');
  assert.deepEqual(await noteTitles(page), ['Sample bare-format note', 'Sample note already here']);
}));

/**
 * Creative Slice 03, Phase 3.1 (safety net): the real app, as an older client, syncing a file
 * that a newer version wrote with entries this version doesn't know (an unknown `settings:*`
 * field and unknown entry kinds). Against the in-process fake GitHub; synthetic data only.
 * Tests only: no production code is changed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSuite, FROZEN_TIME, scenario, STORAGE_KEY, type Session } from './helpers/harness.ts';
import { note, personal } from './helpers/data.ts';
import { FakeGitHub, remoteFile, SYNTHETIC_TOKEN } from './helpers/fake-github.ts';

browserSuite();

const A = 'sample-owner/sample-data';
const NOW = Date.parse(FROZEN_TIME);
const EARLIER = NOW - 3_600_000;
const UNKNOWN = {
  'settings:appearance': { v: 1, look: 'studio', palette: 'night', type: 'mono' },
  'appearanceLook:quiet-room': { palette: 'sage', type: 'book' },
  'visitorInterests:walks': true,
};

async function connect({ page, open }: Session) {
  await open('backup');
  await page.getByLabel('Private repository').fill(A);
  await page.getByLabel('Fine-grained access token').fill(SYNTHETIC_TOKEN);
  await page.getByRole('button', { name: 'Connect & sync' }).click();
}

test('an older app keeps a newer version’s unknown entries through sync, a local edit and a reload', scenario(
  {
    storage: { [STORAGE_KEY]: personal({ fieldNotes: [note('mine-1', 'Sample note on this device')] }) },
    github: new FakeGitHub(),
  },
  async (s) => {
    const gh = s.github!;
    const repo = gh.addRepo(A);
    gh.setFile(A, remoteFile({ ...UNKNOWN, 'fieldNotes:phone-1': note('phone-1', 'Sample note from a newer app') }, EARLIER));
    const unknownIntact = (when: string) => {
      for (const [k, v] of Object.entries(UNKNOWN)) {
        assert.deepEqual(repo.file!.entries[k], v, `${when}: ${k} kept`);
        assert.equal(repo.file!.meta.stamps[k], EARLIER, `${when}: ${k} stamp kept`);
        assert.equal(k in repo.file!.meta.tombs, false, `${when}: ${k} not deleted`);
      }
    };
    const synced = () => s.page.getByText('Last synced just now').waitFor();

    // First sync: this device's note goes up; the newer entries stay as they were.
    await connect(s);
    await synced();
    assert.ok(repo.writes.length >= 1);
    assert.ok('fieldNotes:mine-1' in repo.file!.entries);
    unknownIntact('first sync');

    // A local settings edit, synced.
    await s.page.getByRole('button', { name: /Weather-aware picks: On/ }).click();
    await s.page.getByRole('button', { name: /Weather-aware picks: Off/ }).waitFor();
    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await synced();
    assert.equal(repo.file!.entries['settings:weatherAware'], false);
    unknownIntact('after a local edit');

    // A reload (fresh app state from localStorage), then another sync.
    await s.reload();
    await s.open('backup');
    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await synced();
    unknownIntact('after a reload');
    assert.equal(repo.file!.entries['settings:weatherAware'], false);

    // The app's own data is intact and holds no trace of the unknown entries (characterisation).
    const stored = (await s.raw(STORAGE_KEY))!;
    assert.ok(stored.includes('Sample note from a newer app') && stored.includes('Sample note on this device'));
    assert.equal(/appearance|visitorInterests/.test(stored), false);
  },
));

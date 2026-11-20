/**
 * M2-6: GitHub Sync in a real browser against an in-process fake GitHub
 * (helpers/fake-github.ts). Synthetic token and repositories only; nothing reaches github.com.
 *
 * Covers the first sync, pulling another device's changes (including an older app version's
 * single `settings` entry), a write conflict, representative failures, and the two races that
 * matter most: disconnecting, or switching repository, while a round is still in flight.
 * A stale round must not write, must not apply its data, and must not touch the new config.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, FROZEN_TIME, scenario, STORAGE_KEY, SYNC_CONFIG_KEY, type Session } from './helpers/harness.ts';
import { note, personal } from './helpers/data.ts';
import { anyWrite, FakeGitHub, isRead, isRepoCheck, isWrite, remoteFile, SYNTHETIC_TOKEN } from './helpers/fake-github.ts';

browserSuite();

const A = 'sample-owner/sample-data';
const B = 'sample-owner/sample-data-2';
const NOW = Date.parse(FROZEN_TIME);
const mine = personal({ fieldNotes: [note('mine-1', 'Sample note on this device')] });
const noteTitles = async (page: Page) => (await page.locator('main h2').allTextContents()).map((t) => t.trim()).sort();

async function connect({ page, open }: Session, repo: string, token = SYNTHETIC_TOKEN) {
  await open('backup');
  await page.getByLabel('Private repository').fill(repo);
  await page.getByLabel('Fine-grained access token').fill(token);
  await page.getByRole('button', { name: 'Connect & sync' }).click();
}
const synced = (page: Page) => page.getByText('Last synced just now').waitFor();
const syncError = (page: Page, text: RegExp) => page.getByRole('alert').filter({ hasText: text }).waitFor();
const config = async (s: Session) => JSON.parse((await s.raw(SYNC_CONFIG_KEY)) ?? 'null') as { owner: string; repo: string } | null;

test('first sync uploads this device, then pulls another device’s note and an older app’s settings', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    const repo = gh.addRepo(A);
    await connect(s, A);
    await s.page.getByText(`Syncing with ${A}`).waitFor();
    await synced(s.page);

    assert.equal(repo.writes.length, 1, 'one upload');
    assert.ok('fieldNotes:mine-1' in repo.file!.entries, 'this device’s note was uploaded');
    assert.ok(repo.file!.entries.settings && typeof repo.file!.entries.settings === 'object', 'a legacy settings mirror is kept for older app versions');
    assert.deepEqual(await config(s), { owner: 'sample-owner', repo: 'sample-data', path: 'playground-data.json', token: SYNTHETIC_TOKEN });
    assert.ok(!(await s.raw(STORAGE_KEY))!.includes(SYNTHETIC_TOKEN), 'the token is never stored with personal data');

    // Another device adds a note; an older app version changes the single `settings` entry.
    const later = NOW + 60_000;
    const f = structuredClone(repo.file!);
    f.entries['fieldNotes:phone-1'] = note('phone-1', 'Sample note from the phone');
    f.meta.stamps['fieldNotes:phone-1'] = later;
    f.entries.settings = { ...(f.entries.settings as object), weatherAware: false };
    f.meta.stamps.settings = later;
    gh.setFile(A, f);

    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await s.page.getByRole('button', { name: /Weather-aware picks: Off/ }).waitFor();
    await synced(s.page);
    await s.open('notes');
    assert.deepEqual(await noteTitles(s.page), ['Sample note from the phone', 'Sample note on this device']);
  },
));

test('a write conflict (another device wrote first) re-reads, merges and keeps both devices’ changes', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    gh.addRepo(A, { file: remoteFile({ 'fieldNotes:phone-1': note('phone-1', 'Sample note from the phone') }, NOW - 60_000) });
    gh.failNext(isWrite(A), 409, () => {
      // The other device's write lands just before ours.
      const f = structuredClone(gh.repos.get(A)!.file!);
      f.entries['fieldNotes:laptop-1'] = note('laptop-1', 'Sample note from the laptop');
      f.meta.stamps['fieldNotes:laptop-1'] = NOW - 30_000;
      gh.setFile(A, f);
    });
    await connect(s, A);
    await synced(s.page);
    assert.equal(await s.page.getByRole('alert').count(), 0, 'no error shown');
    assert.equal(gh.count(anyWrite), 2, 'one conflicted write, then one successful write');
    assert.deepEqual(Object.keys(gh.repos.get(A)!.file!.entries).filter((k) => k.startsWith('fieldNotes:')).sort(), ['fieldNotes:laptop-1', 'fieldNotes:mine-1', 'fieldNotes:phone-1']);
    await s.open('notes');
    assert.deepEqual(await noteTitles(s.page), ['Sample note from the laptop', 'Sample note from the phone', 'Sample note on this device']);
  },
));

test('connecting fails clearly for a rejected token or a public repository, and nothing is saved or written', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    gh.addRepo(A);
    gh.addRepo(B, { private: false });
    await connect(s, A, 'github_pat_SYNTHETIC_WRONG_TOKEN');
    await syncError(s.page, /rejected the token/);
    assert.equal(await config(s), null, 'no sync config saved');

    await connect(s, B);
    await syncError(s.page, /repository is public/);
    assert.equal(await config(s), null);
    assert.equal(gh.count(anyWrite), 0, 'nothing written anywhere');
    await s.page.getByRole('button', { name: 'Connect & sync' }).waitFor();
  },
));

test('a repository that stops confirming it is private, or an unreachable GitHub, stops sync until it recovers', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    const repo = gh.addRepo(A);
    await connect(s, A);
    await synced(s.page);
    const stored = await s.raw(STORAGE_KEY);

    repo.private = undefined; // e.g. a response without the privacy flag
    gh.setFile(A, { ...repo.file!, entries: { ...repo.file!.entries, 'fieldNotes:x': note('x', 'Sample note that must not arrive') } });
    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await syncError(s.page, /didn’t confirm the repository is private\. Nothing was written/);
    assert.equal(repo.writes.length, 1, 'no further write');

    repo.private = true;
    gh.failNext(isRead(A), 'network');
    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await syncError(s.page, /Couldn’t reach GitHub/);
    assert.equal(await s.raw(STORAGE_KEY), stored, 'personal data untouched by failed rounds');

    await s.page.getByRole('button', { name: 'Sync now' }).click();
    await synced(s.page);
    assert.equal(await s.page.getByRole('alert').count(), 0, 'the error clears after a good round');
  },
));

test('disconnecting while a round waits to write: the stale round never writes', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    gh.addRepo(A, { file: remoteFile({ 'fieldNotes:phone-1': note('phone-1', 'Sample note from the phone') }, NOW - 60_000) });
    // connect() checks the repo once; the round then checks, reads, and checks again before
    // writing. Hold that last check: the round is about to write.
    let checks = 0;
    const held = gh.hold((r) => isRepoCheck(A)(r) && ++checks === 3);
    await connect(s, A);
    await held.arrived;
    await s.page.getByRole('button', { name: /Disconnect this device/ }).click();
    await s.page.getByRole('button', { name: 'Connect & sync' }).waitFor();
    assert.equal(await config(s), null);
    held.release();

    // Reconnecting starts a new round only after the stale one has finished (one round at a
    // time), so its completion is the barrier for the checks below.
    await connect(s, A);
    await synced(s.page);
    assert.equal(gh.count(anyWrite), 1, 'only the new round wrote; the stale one stopped before writing');
    assert.equal(await s.page.getByRole('alert').count(), 0, 'no stale error');
  },
));

test('switching repository mid-round: the old repository’s response is ignored and the new config is untouched', scenario(
  { storage: { [STORAGE_KEY]: mine }, github: new FakeGitHub() },
  async (s) => {
    const gh = s.github!;
    gh.addRepo(A, { file: remoteFile({ 'fieldNotes:a-1': note('a-1', 'Sample note from the old repository') }, NOW - 60_000) });
    const repoB = gh.addRepo(B);
    const held = gh.hold(isRead(A));
    await connect(s, A);
    await held.arrived;

    await s.page.getByRole('button', { name: /Disconnect this device/ }).click();
    await connect(s, B);
    await s.page.getByText(`Syncing with ${B}`).waitFor();
    held.release(); // the old round now receives repository A's data

    // B's first round can only start once the stale round has finished.
    await synced(s.page);
    assert.deepEqual(await config(s), { owner: 'sample-owner', repo: 'sample-data-2', path: 'playground-data.json', token: SYNTHETIC_TOKEN }, 'config still points at B');
    assert.equal(gh.count(isWrite(A)), 0, 'nothing written to the old repository');
    assert.equal(repoB.writes.length, 1);
    assert.ok(!('fieldNotes:a-1' in repoB.file!.entries), 'the old repository’s data did not leak into the new one');
    assert.equal(await s.page.getByRole('alert').count(), 0);
    await s.open('notes');
    assert.deepEqual(await noteTitles(s.page), ['Sample note on this device'], 'the old repository’s data was not applied');
  },
));

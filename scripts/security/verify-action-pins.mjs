#!/usr/bin/env node
/**
 * Remote provenance check for the trusted action manifest (.github/action-pins.json).
 *
 * For every pinned action it asks GitHub (anonymous `git ls-remote`, public repositories only)
 * which commit the recorded release tag points to, and requires it to equal the pinned SHA.
 * It then fetches that one commit and checks its action.yml runtime matches the manifest.
 *
 * Read-only by design: it never edits the manifest or any workflow. A mismatch fails the run
 * and is reported; updating a trusted pin is always a reviewed change to the manifest.
 *
 * Usage: node scripts/security/verify-action-pins.mjs [--manifest path] [--summary path]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const manifestPath = opt('--manifest', '.github/action-pins.json');
const summaryPath = opt('--summary', process.env.GITHUB_STEP_SUMMARY);

const git = (argv, cwd) =>
  execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    // No prompts and no user or system git configuration (so no credential helpers or URL
    // rewrites); network proxy settings, if any, are inherited from the environment.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ASKPASS: '' },
  });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const rows = [];
let failed = 0;

for (const pin of manifest.pins) {
  const { action, tag, sha, runtime } = pin;
  const url = `https://github.com/${action}.git`;
  const row = { action, tag, sha, tagCommit: '', runtime: '', ok: false, note: '' };
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(action) || !/^v\d+\.\d+\.\d+$/.test(tag) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('malformed manifest entry');
    // Annotated tags list a peeled "^{}" line naming the commit; lightweight tags name it directly.
    const out = git(['ls-remote', '--tags', url, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
    const refs = Object.fromEntries(out.trim().split('\n').filter(Boolean).map((l) => l.split('\t').reverse()));
    const tagCommit = refs[`refs/tags/${tag}^{}`] ?? refs[`refs/tags/${tag}`];
    if (!tagCommit) throw new Error(`tag ${tag} not found upstream`);
    row.tagCommit = tagCommit;
    if (tagCommit !== sha) throw new Error(`tag ${tag} points to ${tagCommit}, manifest pins ${sha}`);

    const dir = mkdtempSync(join(tmpdir(), 'pin-'));
    try {
      git(['init', '--quiet'], dir);
      git(['fetch', '--quiet', '--depth=1', '--no-tags', url, sha], dir);
      const yml = git(['show', `${sha}:action.yml`], dir);
      const using = /^\s+using:\s*['"]?([\w-]+)['"]?\s*$/m.exec(yml)?.[1] ?? '';
      row.runtime = using;
      if (using !== runtime) throw new Error(`action.yml runs.using is "${using}", manifest says "${runtime}"`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    row.ok = true;
  } catch (err) {
    row.note = String(err.message ?? err).split('\n')[0];
    failed++;
  }
  rows.push(row);
  console.log(`${row.ok ? '✓' : '✗'} ${action}@${tag} ${sha}${row.ok ? ` (${row.runtime})` : ` — ${row.note}`}`);
}

const lines = [
  '## Action pin provenance',
  '',
  `Manifest: \`${manifestPath}\`. Each tag was resolved anonymously against its upstream repository at run time; nothing was modified.`,
  '',
  '| Action | Tag | Pinned SHA | Tag resolves to | Runtime | Result |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.action} | ${r.tag} | \`${r.sha}\` | \`${r.tagCommit || '—'}\` | ${r.runtime || '—'} | ${r.ok ? '✅' : `❌ ${r.note}`} |`),
  '',
  failed ? `**${failed} of ${rows.length} pins failed verification.** Do not update the manifest automatically; review the upstream change first.` : `**All ${rows.length} pins verified.**`,
];
if (summaryPath) appendFileSync(summaryPath, `${lines.join('\n')}\n`);
console.log(failed ? `${failed} of ${rows.length} pins failed` : `All ${rows.length} pins verified`);
process.exit(failed ? 1 : 0);

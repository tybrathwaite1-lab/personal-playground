/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures mutate arbitrary report JSON */
/**
 * Security regression tests for the visual-results publisher (scripts/visual/publish/).
 * Every malicious-artifact, structure, schema and provenance rule must reject; valid artifacts
 * must pass. Synthetic data only; no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { ZipError, readZip, safeEntryName } from '../scripts/visual/publish/zip.mjs';
import {
  AXE_WIDTHS,
  KEY_WIDTHS,
  LIMITS,
  PolicyError,
  ZIP_LIMITS,
  checkJpeg,
  checkRun,
  eligibility,
  folderFor,
  metaJson,
  parseMeta,
  parseReport,
  renderIndex,
  renderReport,
  resultPath,
  runIdCompare,
  selectArtifact,
  text,
  validateContents,
} from '../scripts/visual/publish/policy.mjs';
import { BRANCH, SHA, artifactEntries, fakeJpeg, goodArtifact, makeZip, reportObject, sampleReport } from './helpers/zipBuilder.ts';

const rejects = (fn: () => unknown, re: RegExp, label = String(re)) =>
  assert.throws(fn, (e: Error) => (e instanceof ZipError || e instanceof PolicyError) && re.test(e.message), label);
const EXP = { headSha: SHA, headBranch: BRANCH };
const jpg = fakeJpeg(390);

// ─── Archive structure ────────────────────────────────────────────────
test('a valid artifact (deflated, stored, directories) is read and verified', () => {
  const files = readZip(goodArtifact(), ZIP_LIMITS);
  assert.deepEqual([...files.keys()].sort(), ['390/home-fold.jpg', '390/home.jpg', 'REPORT.md', 'report.json', 'states/menu-390.jpg']);
});

test('zip64 archives and data descriptors (with and without signature, 4- and 8-byte) are supported', () => {
  assert.equal(readZip(goodArtifact({ zip64: true }), ZIP_LIMITS).size, 5);
  const streamed = artifactEntries().map((s, i) => ({ ...s, descriptor: i % 2 ? true : ('nosig' as const) }));
  assert.equal(readZip(makeZip(streamed), ZIP_LIMITS).size, 5);
  assert.equal(readZip(makeZip(streamed.map((s) => ({ ...s, descriptor: true })), { zip64: true }), ZIP_LIMITS).size, 5);
});

test('symlink entries are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.from('/etc/passwd'), mode: 0o120777 }]), ZIP_LIMITS), /symlink/);
});

test('non-regular entries (FIFO, device) are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, mode: 0o010644 }]), ZIP_LIMITS), /not a regular file/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, mode: 0o020644 }]), ZIP_LIMITS), /not a regular file/);
});

test('path traversal, absolute paths, backslashes and odd names are rejected', () => {
  for (const name of ['../390/home.jpg', '390/../../etc/x.jpg', '/390/home.jpg', '390\\home.jpg', './390/home.jpg', '390//home.jpg', '390/./home.jpg', '390/home .jpg', '390/hömé.jpg', '390/home.jpg\u0000.png', '']) {
    assert.equal(safeEntryName(name), false, JSON.stringify(name));
    if (name) rejects(() => readZip(makeZip([{ name, data: jpg }]), ZIP_LIMITS), /unsafe path/);
  }
});

test('only allowlisted files and directories are accepted', () => {
  for (const name of ['390/home.png', 'evil.sh', 'states/a.jpg.exe', '800/home.jpg', '390/sub/home.jpg', '.github/workflows/x.yml', 'index.html', '390/HOME.jpg', 'report.JSON', '.gitattributes'])
    rejects(() => readZip(makeZip([{ name, data: jpg }]), ZIP_LIMITS), /file not allowed/);
  rejects(() => readZip(makeZip([{ name: 'secret/' }]), ZIP_LIMITS), /unexpected directory/);
});

test('duplicate entries are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg }, { name: '390/home.jpg', data: jpg }]), ZIP_LIMITS), /duplicate/);
});

test('encryption, unknown flag bits and unsupported compression are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, flags: 0x0001 }]), ZIP_LIMITS), /encrypted/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, flags: 0x0040 }]), ZIP_LIMITS), /strong encryption/);
  for (const f of [0x0010, 0x0020, 0x2000, 0x8000]) rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, flags: f }]), ZIP_LIMITS), /unsupported flags/, `flag 0x${f.toString(16)}`);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, method: 12 }]), ZIP_LIMITS), /unsupported compression/);
});

test('zip bombs: high compression ratio, oversized files, total size and entry count are rejected', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.alloc(4_000_000, 0) }]), ZIP_LIMITS), /compression ratio/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: Buffer.alloc(LIMITS.maxFileBytes + 1, 1), method: 0 }]), ZIP_LIMITS), /file too large/);
  const many = Array.from({ length: LIMITS.maxEntries + 1 }, (_, i) => ({ name: `states/s${i}.jpg`, data: jpg }));
  rejects(() => readZip(makeZip(many), ZIP_LIMITS), /too many entries/);
  rejects(() => readZip(goodArtifact(), { ...ZIP_LIMITS, maxTotalBytes: 100 }), /too large when extracted/);
  rejects(() => readZip(goodArtifact(), { ...ZIP_LIMITS, maxZipBytes: 100 }), /zip too large/);
});

test('lying headers are rejected: CRC, size, local/central name, stored size', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, crc: 1234, localCrc: 1234 }]), ZIP_LIMITS), /CRC mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, size: 10, localSize: 10 }]), ZIP_LIMITS), /size mismatch|corrupt or oversized|compression ratio/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, localName: '../../../.bashrc' }]), ZIP_LIMITS), /name mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, method: 0, size: 5 }]), ZIP_LIMITS), /stored size mismatch/);
});

test('local headers must agree with the central directory: flags, CRC, sizes, descriptor', () => {
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, localFlags: 0x0800 }]), ZIP_LIMITS), /flags mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, localCrc: 0xdeadbeef }]), ZIP_LIMITS), /local\/central header mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, localSize: 7 }]), ZIP_LIMITS), /local\/central header mismatch/);
  // Deferred values may only be zero (or real) and the descriptor must agree.
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, descriptor: true, localCrc: 0x1234 }]), ZIP_LIMITS), /local\/central header mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, descriptor: true, descriptorCrc: 0x1234 }]), ZIP_LIMITS), /data descriptor mismatch/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, descriptor: true, descriptorCrc: 0x1234 }], { zip64: true }), ZIP_LIMITS), /data descriptor mismatch/);
});

test('archive boundaries: prepended, gap, trailing and overlapping data are rejected', () => {
  const two = [{ name: '390/home.jpg', data: jpg }, { name: 'states/menu-390.jpg', data: jpg }];
  rejects(() => readZip(makeZip(two, { prepend: Buffer.from('MZ-stub-or-hidden-payload') }), ZIP_LIMITS), /unaccounted data before 390\/home\.jpg/);
  rejects(() => readZip(makeZip(two, { gapAfterFirst: Buffer.from('smuggled bytes') }), ZIP_LIMITS), /unaccounted data before states/);
  rejects(() => readZip(makeZip(two, { trailing: Buffer.from('trailer') }), ZIP_LIMITS), /data after the end|end-of-central-directory/);
  // Entry B's local header hidden inside entry A's stored data; the directory points at both.
  const inner = makeZip([{ name: 'states/b.jpg', data: jpg, method: 0 }]);
  const innerLocal = inner.subarray(0, 30 + 'states/b.jpg'.length + jpg.length);
  const nameA = 'states/a.jpg';
  rejects(() => readZip(makeZip([{ name: nameA, data: innerLocal, method: 0 }, { name: 'states/b.jpg', data: jpg, method: 0, offset: 30 + nameA.length }]), ZIP_LIMITS), /overlapping entries|unaccounted/);
  // Two directory records for the same local record.
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg }, { name: '390/x.jpg', data: jpg, offset: 0 }]), ZIP_LIMITS), /name mismatch|overlapping/);
  // A directory offset beyond the archive body.
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: jpg, offset: 1_000_000 }]), ZIP_LIMITS), /outside the archive body/);
});

test('zip64 structure: locator disks, record placement and count agreement are enforced', () => {
  const e = artifactEntries();
  rejects(() => readZip(makeZip(e, { zip64: true, zip64LocatorDisk: 1 }), ZIP_LIMITS), /multi-disk/);
  rejects(() => readZip(makeZip(e, { zip64: true, zip64TotalDisks: 2 }), ZIP_LIMITS), /multi-disk/);
  rejects(() => readZip(makeZip(e, { zip64: true, zip64Gap: Buffer.alloc(8) }), ZIP_LIMITS), /misplaced|bad zip64 record|truncated/);
  rejects(() => readZip(makeZip(e, { zip64: true, zip64CountMismatch: true }), ZIP_LIMITS), /disagrees|inconsistent/);
  assert.equal(readZip(makeZip(e, { zip64: true, zip64Unsaturated: true }), ZIP_LIMITS).size, 5, 'zip64 records beside agreeing real values (Python) are accepted');
  rejects(() => readZip(makeZip(e, { zip64: true, zip64Unsaturated: true, zip64Gap: Buffer.alloc(4) }), ZIP_LIMITS), /misplaced|bad zip64|truncated|missing zip64/);
  // A saturated size with no zip64 field to resolve it.
  const z = makeZip([{ name: '390/home.jpg', data: jpg }]);
  const cd = z.length - 22 - (46 + '390/home.jpg'.length);
  const bad = Buffer.from(z);
  bad.writeUInt32LE(0xffffffff, cd + 24);
  rejects(() => readZip(bad, ZIP_LIMITS), /saturated size without zip64/);
});

test('malformed and truncated archives are rejected', () => {
  rejects(() => readZip(Buffer.from('not a zip at all, just text padding padding padding'), ZIP_LIMITS), /end-of-central-directory|truncated/);
  const z = goodArtifact();
  rejects(() => readZip(z.subarray(0, z.length - 30), ZIP_LIMITS), /end-of-central-directory|truncated|malformed|mismatch|end record/);
  const corrupt = Buffer.from(z);
  corrupt.writeUInt32LE(0xdeadbeef, corrupt.length - 22);
  rejects(() => readZip(corrupt, ZIP_LIMITS), /end-of-central-directory/);
  rejects(() => readZip(makeZip([{ name: '390/home.jpg', data: deflateRawSync(jpg), method: 0, size: 1 }]), ZIP_LIMITS), /stored size mismatch/);
  const cdShort = Buffer.from(z);
  cdShort.writeUInt32LE(cdShort.readUInt32LE(cdShort.length - 22 + 12) - 1, cdShort.length - 22 + 12);
  rejects(() => readZip(cdShort, ZIP_LIMITS), /central directory/);
});

// ─── JPEG structural sanity ───────────────────────────────────────────
test('JPEG structural checks: signature, markers, frame header, scan, end marker, width per folder', () => {
  assert.equal(checkJpeg('390/home.jpg', jpg), 390);
  rejects(() => checkJpeg('390/home.jpg', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n'), Buffer.alloc(300)])), /not a JPEG/);
  rejects(() => checkJpeg('390/home.jpg', jpg.subarray(0, jpg.length - 2)), /truncated JPEG/);
  rejects(() => checkJpeg('390/home.jpg', fakeJpeg(1280)), /does not match folder/);
  rejects(() => checkJpeg('states/menu.jpg', fakeJpeg(1000)), /unexpected width/);
  const tail = Buffer.concat([Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, 0x03, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
  const sof = (len: number, prec = 8, h = 600, w = 390, comps = 3) => Buffer.concat([Buffer.from([0xff, 0xc0, len >> 8, len & 0xff, prec, h >> 8, h & 0xff, w >> 8, w & 0xff, comps]), Buffer.alloc(Math.max(0, len - 8))]);
  const make = (...p: Buffer[]) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...p, tail]);
  rejects(() => checkJpeg('390/a.jpg', make(sos)), /without a frame header/);
  rejects(() => checkJpeg('390/a.jpg', make(sof(6), sos)), /frame header/, 'frame header too short');
  rejects(() => checkJpeg('390/a.jpg', make(sof(17, 8, 600, 390, 4), sos)), /frame header/, 'component count disagrees with length');
  rejects(() => checkJpeg('390/a.jpg', make(sof(17, 8, 600, 390, 0), sos)), /frame header/, 'no components');
  rejects(() => checkJpeg('390/a.jpg', make(sof(17, 16), sos)), /frame header/, 'unsupported precision');
  rejects(() => checkJpeg('390/a.jpg', make(sof(17, 8, 0), sos)), /zero dimension/);
  rejects(() => checkJpeg('390/a.jpg', make(sof(17, 8, 600, 0), sos)), /zero dimension/);
  rejects(() => checkJpeg('390/a.jpg', make(sof(17), sof(17), sos)), /multiple frame headers/);
  rejects(() => checkJpeg('390/a.jpg', make(Buffer.from([0xff, 0xe0, 0xff, 0xf0]), sof(17), sos)), /segment length/);
  rejects(() => checkJpeg('390/a.jpg', make(Buffer.from([0x00, 0x11]), sof(17), sos)), /expected a marker/);
  rejects(() => checkJpeg('390/a.jpg', make(Buffer.from([0xff, 0xd9]), sof(17), sos)), /unexpected marker/);
  rejects(() => checkJpeg('390/a.jpg', make(sof(17), Buffer.from([0xff, 0xda, 0x00, 0x04, 0, 0]))), /scan header/);
  rejects(() => checkJpeg('390/a.jpg', make(sof(17))), /no scan|segment length|expected a marker/);
  assert.equal(checkJpeg('390/a.jpg', make(Buffer.from([0xff, 0xff]), sof(17), sos)), 390, 'fill bytes allowed');
});

// ─── report.json strict schema ────────────────────────────────────────
test('report.json: a complete harness report is accepted; harness-only and unknown fields are dropped', () => {
  const r = parseReport(sampleReport({}, (j) => (j.secret = 'x')), EXP);
  assert.equal('secret' in r, false);
  assert.equal('axeSummary' in r, false);
  assert.equal('offenders' in r.shots[0], false);
  assert.deepEqual(r.shots[0].axe, [{ id: 'color-contrast', impact: 'serious', nodes: 3 }]);
  const all = parseReport(sampleReport({ widths: [320, 390, 768, 1280, 1440], routes: ['home', 'plan'] }), EXP);
  assert.equal(all.shots.length, 10);
  assert.equal(all.shots.find((s) => s.width === 768)!.axe, null, 'axe recorded as not run where the harness does not run it');
  assert.equal(all.keyboard.length, 2);
});

test('report.json: missing or malformed required data is an error, never a silent default', () => {
  rejects(() => parseReport(Buffer.from('{not json'), EXP), /not valid UTF-8 JSON/);
  rejects(() => parseReport(Buffer.from([0xff, 0xfe, 0x7b, 0x7d]), EXP), /not valid UTF-8 JSON/);
  rejects(() => parseReport(Buffer.from('[]'), EXP), /not an object/);
  rejects(() => parseReport(Buffer.alloc(LIMITS.maxReportBytes + 1, 0x20), EXP), /too large/);
  const cases: [string, (j: any) => void, RegExp][] = [
    ['other branch', (j) => (j.branch = 'main'), /branch does not match/],
    ['other commit', (j) => (j.commit = 'c'.repeat(40)), /commit does not match/],
    ['no commit', (j) => delete j.commit, /commit does not match/],
    ['no frozenTime', (j) => delete j.frozenTime, /frozenTime/],
    ['bad generatedAt', (j) => (j.generatedAt = 'yesterday'), /generatedAt/],
    ['axe not run', (j) => (j.axeAvailable = false), /did not run/],
    ['axe flag missing', (j) => delete j.axeAvailable, /did not run/],
    ['no widths', (j) => delete j.widths, /widths/],
    ['unknown width', (j) => (j.widths = [391]), /widths/],
    ['duplicate width', (j) => (j.widths = [390, 390]), /widths/],
    ['empty routes', (j) => (j.routes = []), /routes/],
    ['hostile route', (j) => (j.routes = ['x"><script>']), /routes/],
    ['no shots', (j) => delete j.shots, /shots missing/],
    ['missing shot', (j) => (j.shots = []), /missing shot home@390/],
    ['duplicate shot', (j) => j.shots.push({ ...j.shots[0] }), /duplicate shot/],
    ['undeclared shot', (j) => j.shots.push({ ...j.shots[0], route: 'other' }), /undeclared/],
    ['renamed file', (j) => (j.shots[0].file = 'states/menu-390.jpg'), /unexpected file names/],
    ['no overflow', (j) => delete j.shots[0].overflowPx, /overflowPx/],
    ['negative overflow', (j) => (j.shots[0].overflowPx = -1), /overflowPx/],
    ['no pageErrors', (j) => delete j.shots[0].pageErrors, /pageErrors/],
    ['non-string pageError', (j) => (j.shots[0].pageErrors = [{}]), /pageErrors/],
    ['axe results missing at an axe width', (j) => delete j.shots[0].axe, /accessibility results missing/],
    ['axe not an array', (j) => (j.shots[0].axe = 'none'), /accessibility results missing/],
    ['bad axe impact', (j) => (j.shots[0].axe[0].impact = 'catastrophic'), /malformed accessibility/],
    ['bad axe id', (j) => (j.shots[0].axe[0].id = '<b>x</b>'), /malformed accessibility/],
    ['bad axe nodes', (j) => (j.shots[0].axe[0].nodes = 1.5), /malformed accessibility/],
    ['no states', (j) => delete j.states, /states/],
    ['bad state file', (j) => (j.states[0].file = '../x.jpg'), /state record/],
    ['no keyboard', (j) => delete j.keyboard, /keyboard/],
    ['keyboard missing for a width', (j) => (j.keyboard = []), /keyboard results missing for 390px/],
    ['empty keyboard checks', (j) => (j.keyboard[0].checks = []), /keyboard record/],
    ['keyboard pass not boolean', (j) => (j.keyboard[0].checks[0].pass = 'yes'), /keyboard check/],
    ['no blockedHosts', (j) => delete j.blockedHosts, /blockedHosts/],
    ['hostile blocked host', (j) => (j.blockedHosts = ['evil.example/<img>']), /blockedHosts/],
  ];
  for (const [label, patch, re] of cases) rejects(() => parseReport(sampleReport({}, patch), EXP), re, label);
  rejects(() => parseReport(sampleReport({ widths: [768] }, (j) => (j.shots[0].axe = [])), EXP), /unexpected accessibility results/);
});

test('validateContents: screenshots and report must match exactly; branch REPORT.md dropped; report re-serialized', () => {
  const files = readZip(goodArtifact(), ZIP_LIMITS);
  const v = validateContents(files, EXP);
  assert.equal(v.files.has('REPORT.md'), false);
  assert.equal(JSON.parse(v.files.get('report.json')!.toString()).axeSummary, undefined);
  const without = (k: string) => new Map([...files].filter(([n]) => n !== k));
  rejects(() => validateContents(without('report.json'), EXP), /no report\.json/);
  rejects(() => validateContents(without('390/home-fold.jpg'), EXP), /references a missing screenshot: 390\/home-fold\.jpg/);
  rejects(() => validateContents(without('states/menu-390.jpg'), EXP), /references a missing screenshot/);
  rejects(() => validateContents(new Map([...files, ['states/extra.jpg', jpg]]), EXP), /not referenced by report\.json/);
  rejects(() => validateContents(new Map([...files, ['390/home.jpg', Buffer.from('#!/bin/sh\nrm -rf /\n'.padEnd(300, ' '))]]), EXP), /not a JPEG/);
  rejects(() => validateContents(files, { headSha: 'c'.repeat(40), headBranch: BRANCH }), /commit does not match/);
});

// ─── Rendering ────────────────────────────────────────────────────────
const HOSTILE = [
  '<img src=x onerror=alert(1)>',
  '[click](javascript:alert(1))',
  'https://evil.example/login',
  'www.evil.example',
  '`code` | col',
  '# heading',
  '**bold** _em_',
  'line1\nline2\r\n| injected | row |',
  'nul\u0000bell\u0007esc\u001b[31m',
  'bidi \u202eexe.gpj\u202c zero\u200bwidth \ufeffbom \u2066iso\u2069',
  '<!-- comment --> &lt;entity&gt; &#60;',
  '![img](https://evil.example/x.png)',
  '\\`escaped\\`',
];

/** Control, bidirectional and zero-width characters (checked by code point, not a regex). */
const hasInvisible = (s: string) =>
  [...s].some((c) => {
    const o = c.codePointAt(0)!;
    return o < 0x20 || (o >= 0x7f && o <= 0x9f) || (o >= 0x200b && o <= 0x200f) || (o >= 0x202a && o <= 0x202e) || (o >= 0x2066 && o <= 0x2069) || o === 0xfeff;
  });

test('text(): untrusted strings render as a single plain code span', () => {
  for (const s of HOSTILE) {
    const out = text(s);
    assert.match(out, /^`[^`]+`$/, JSON.stringify(s));
    assert.equal(hasInvisible(out) || out.includes('|'), false, `control/bidi/pipe removed: ${JSON.stringify(out)}`);
  }
  assert.equal(text(''), '—');
  assert.equal(text('\u0000\u200b'), '—');
  assert.equal(text('x'.repeat(500), 50).length, 52);
});

test('generated REPORT.md: only template markup, validated identifiers and code spans', () => {
  const report = parseReport(
    sampleReport({ widths: [390, 768], routes: ['home', 'plan'] }, (j) => {
      j.shots[0].pageErrors = HOSTILE;
      j.shots[0].overflowPx = 40;
      j.keyboard[0].checks = HOSTILE.map((h, i) => ({ name: h, pass: i % 2 === 0, detail: h }));
      j.states[0].name = HOSTILE[0];
      j.states[0].note = HOSTILE[1];
      j.states[0].ok = false;
    }),
    { headSha: SHA, headBranch: BRANCH },
  );
  const out = renderReport({ repo: 'o/r', folder: folderFor(BRANCH), branch: 'feature/<script>alert(1)</script>', sha: SHA, runId: '77' }, report);
  // Every HTML tag is one of our thumbnails with validated attributes.
  const outside = out.replace(/`[^`\n]*`/g, '');
  const tags = outside.match(/<[^>]*>/g) ?? [];
  assert.ok(tags.length > 0 && tags.every((t) => /^<img src="\d+\/[a-z0-9-]+\.jpg" width="120" alt="[a-z0-9-]+ at \d+px">$/.test(t)), tags.join(' '));
  // Every link target is a published file name or the run URL.
  const targets = [...outside.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(targets.every((t) => /^(?:\d+\/[a-z0-9-]+(?:-fold)?\.jpg|states\/[a-z0-9-]+\.jpg|https:\/\/github\.com\/o\/r\/actions\/runs\/77)$/.test(t)), targets.join(' '));
  // Hostile text appears only inside code spans; outside them, no URLs, autolinks or controls.
  assert.equal(/evil|javascript|onerror|<script|www\./.test(outside) || hasInvisible(outside.replace(/\n/g, '')), false);
  // Table rows stay intact: every row of the keyboard table has exactly 4 pipes.
  for (const line of out.split('\n').filter((l) => l.startsWith('| ') && l.includes('✅') !== l.includes('❌'))) assert.equal(line.split('|').length - 1, 4, line);
  assert.match(out, new RegExp(`Commit \`${SHA}\``), 'full SHA recorded');
  assert.match(out, /run \[77\]/);
  assert.match(out, /not run at other widths/);
});

test('README index renders branch names as code spans and links only to folders', () => {
  const m = { branch: 'feature/[x](https://evil.example)', folder: folderFor('feature/[x](https://evil.example)'), sha: SHA, runId: '9', publishedAt: '2026-11-18T00:00:00Z' };
  const out = renderIndex([m]);
  const outside = out.replace(/`[^`\n]*`/g, '');
  assert.deepEqual([...outside.matchAll(/\]\(([^)]*)\)/g)].map((x) => x[1]), [`${m.folder}/REPORT.md`]);
  assert.equal(/<|https:|www\./.test(outside), false, outside);
  assert.match(out, /`feature\/\[x\]\(https:\/\/evil\.example\)`/);
});

// ─── Results branch metadata and paths ────────────────────────────────
test('results paths: only README.md and validated folder contents', () => {
  const f = folderFor(BRANCH);
  for (const ok of ['README.md', `${f}/meta.json`, `${f}/REPORT.md`, `${f}/report.json`, `${f}/390/home.jpg`, `${f}/1440/plan-fold.jpg`, `${f}/states/menu-390.jpg`]) assert.ok(resultPath(ok), ok);
  for (const bad of ['.gitattributes', '.gitmodules', `${f}/.gitattributes`, `${f}/390/home.png`, 'feature-x/REPORT.md', `${f}/x/../meta.json`, `${f}/hooks/post-checkout`, `nested/${f}/meta.json`, `${f}/README.md`, 'index.html', `${f.toUpperCase()}/meta.json`])
    assert.equal(resultPath(bad), null, bad);
});

test('meta.json: strict, and must map back to its folder', () => {
  const f = folderFor(BRANCH);
  const m = { branch: BRANCH, folder: f, sha: SHA, runId: '77', publishedAt: '2026-11-18T00:00:00Z' };
  assert.deepEqual(parseMeta(metaJson(m), f), m);
  rejects(() => parseMeta(metaJson(m), folderFor('feature/y')), /does not match its folder/);
  rejects(() => parseMeta(Buffer.from(JSON.stringify({ ...m, branch: 'feature/y' })), f), /does not map to its folder/);
  rejects(() => parseMeta(Buffer.from(JSON.stringify({ ...m, extra: 1 })), f), /unexpected fields/);
  rejects(() => parseMeta(Buffer.from(JSON.stringify({ ...m, sha: 'x' })), f), /sha malformed/);
  rejects(() => parseMeta(Buffer.from(JSON.stringify({ ...m, runId: 77 })), f), /runId malformed/);
  rejects(() => parseMeta(Buffer.from('nope'), f), /not valid/);
  assert.equal(runIdCompare('100', '99'), 1);
  assert.equal(runIdCompare('44229030020', '44229030020'), 0);
  assert.equal(runIdCompare('9', '10'), -1);
});

// ─── Provenance and eligibility ───────────────────────────────────────
const goodRun = {
  id: 77,
  name: 'Visual check',
  path: '.github/workflows/visual.yml',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: SHA,
  head_branch: BRANCH,
  repository: { full_name: 'o/r' },
  head_repository: { full_name: 'o/r' },
  actor: { login: 'tybrathwaite1-lab' },
  triggering_actor: { login: 'tybrathwaite1-lab' },
};
const expected = { repo: 'o/r', runId: '77', headSha: SHA, headBranch: BRANCH };

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

test('eligibility: authorized contributors and ordinary development branches only', () => {
  assert.deepEqual(eligibility(goodRun, BRANCH), []);
  assert.deepEqual(eligibility(goodRun, 'main'), []);
  assert.match(eligibility({ ...goodRun, actor: { login: 'someone-else' } }, BRANCH).join(), /pushed by an account that is not an authorized contributor/);
  assert.match(eligibility({ ...goodRun, triggering_actor: { login: 'someone-else' } }, BRANCH).join(), /run triggered by/);
  assert.match(eligibility({ ...goodRun, actor: undefined }, BRANCH).join(), /not an authorized contributor/);
  for (const b of ['visual-results', 'image-scout-results', 'gh-pages', 'dependabot/npm/x', 'renovate/y', '-x', 'a..b', 'a//b', 'a/', 'x.lock', 'with space', 'x'.repeat(121), 'ünïcode'])
    assert.match(eligibility(goodRun, b).join(), /not an eligible development branch/, b);
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

test('branch folders: readable, bounded, collision-resistant, reserved names protected', () => {
  const f = folderFor('feature/x');
  assert.match(f, /^feature-x-[0-9a-f]{12}$/);
  assert.equal(folderFor('feature/x'), f, 'deterministic');
  // Names that a slug alone would merge get distinct folders.
  const colliding = ['feature/x', 'feature-x', 'Feature/X', 'feature x', 'feature/x/', `${'a'.repeat(60)}1`, `${'a'.repeat(60)}2`, '../../evil', 'evil'];
  assert.equal(new Set(colliding.map(folderFor)).size, colliding.length);
  for (const b of ['a b;$(id)`x`', '...', '-', '日本語', 'x'.repeat(255)]) assert.match(folderFor(b), /^[a-z0-9](?:[a-z0-9._-]{0,46}[a-z0-9])?-[0-9a-f]{12}$/, b);
  for (const b of ['', 'visual-results', 'gh-pages', 'image-scout-results', 'x'.repeat(256)]) assert.throws(() => folderFor(b), PolicyError, b);
  for (const b of colliding) for (const reserved of ['README.md', '.git', 'meta.json']) assert.notEqual(folderFor(b), reserved);
});

// ─── Policy stays in step with the harness and the workflows ──────────
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Workflow YAML without comments. */
const code = (y: string) =>
  y
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#\s.*$/, ''))
    .join('\n');
/** The shell source of every `run:` step. */
function runScripts(y: string) {
  const lines = code(y).split('\n');
  const out: string[] = [];
  lines.forEach((l, i) => {
    const m = /^(\s*)(?:- )?run: ?(.*)$/.exec(l);
    if (!m) return;
    if (m[2] !== '|') return void out.push(m[2]);
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > m[1].length); j++) out.push(lines[j]);
  });
  return out.join('\n');
}

test('policy constants match the screenshot harness (run.ts)', () => {
  const run = read('scripts/visual/run.ts');
  const arr = (name: string) => JSON.parse(new RegExp(`const ${name} = (\\[[^\\]]*\\])`).exec(run)![1]);
  assert.deepEqual(arr('AXE_WIDTHS'), AXE_WIDTHS);
  assert.deepEqual(arr('KEY_WIDTHS'), KEY_WIDTHS);
  assert.deepEqual(arr('DEFAULT_WIDTHS'), [320, 390, 768, 1280, 1440]);
});

test('capture workflow (branch code) has no write access, secrets or credentials', () => {
  const y = code(read('.github/workflows/visual.yml'));
  assert.match(y, /^permissions:\n {2}contents: read\n/m, 'read-only top-level permissions');
  assert.equal(/^ +permissions:/m.test(y), false, 'no job-level permission overrides');
  assert.equal(/secrets\.|github\.token|GITHUB_TOKEN|pull_request_target|workflow_run/.test(y), false, 'no secrets, tokens or privileged triggers');
  assert.match(y, /persist-credentials: false/);
  assert.ok(runScripts(y).includes('npm run visual --'), 'run scripts parsed');
  assert.equal(runScripts(y).includes('${{'), false, 'no expressions inside run scripts');
});

test('publish workflow: workflow_run only, least privilege, no third-party code, trusted checkout pinned', () => {
  const y = code(read('.github/workflows/visual-publish.yml'));
  assert.match(y, /^on:\n {2}workflow_run:\n {4}workflows: \[Visual check\]\n {4}types: \[completed\]\n/m);
  assert.match(y, /^permissions: \{\}$/m);
  assert.match(y, /permissions:\n\s+actions: read[^\n]*\n\s+contents: write[^\n]*\n\s+env:/);
  assert.equal((y.match(/permissions:/g) ?? []).length, 2);
  assert.equal(/^\s*-?\s*uses:/m.test(y), false, 'no actions at all');
  assert.equal(/npm|npx|yarn|pnpm|pip /.test(y), false, 'no package installs');
  assert.equal(/secrets\./.test(y), false);
  assert.match(y, /TRUSTED_SHA: \$\{\{ github\.workflow_sha \|\| github\.sha \}\}/);
  assert.match(y, /fetch --quiet --depth=1 --no-tags "https:\/\/github\.com\/\$REPO\.git" "\$TRUSTED_SHA"/);
  assert.ok(runScripts(y).includes('node scripts/visual/publish/publish.mjs'), 'run scripts parsed');
  assert.equal(runScripts(y).includes('${{'), false, 'no expressions inside run scripts');
  assert.equal((y.match(/GH_TOKEN/g) ?? []).length, 1, 'token in exactly one step');
});

test('reportObject helper stays a valid fixture', () => {
  assert.equal(reportObject().commit, SHA);
});

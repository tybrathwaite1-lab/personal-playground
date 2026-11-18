/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures build arbitrary report JSON */
/**
 * Test-only ZIP writer that can produce valid AND deliberately malicious archives
 * (symlinks, traversal names, bad CRCs, lying sizes, encryption flags, zip64, data descriptors,
 * prepended/trailing data, gaps, overlapping entries, malformed zip64 records, …), plus
 * complete synthetic visual-check artifacts.
 */
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../scripts/visual/publish/zip.mjs';

export interface ZipEntrySpec {
  name: string;
  data?: Buffer;
  method?: 0 | 8 | 12;
  /** Unix mode, stored in the external attributes (made by Unix). */
  mode?: number;
  flags?: number;
  crc?: number;
  size?: number;
  localName?: string;
  /** Streaming style: flag bit 3, zeros in the local header, a data descriptor after the data. */
  descriptor?: boolean | 'nosig';
  /** Lie in the descriptor (CRC). */
  descriptorCrc?: number;
  /** Lie in the local header only. */
  localCrc?: number;
  localSize?: number;
  localFlags?: number;
  /** Override the central directory's local-header offset. */
  offset?: number;
}

export interface ZipOpts {
  zip64?: boolean;
  /** Bytes before the first entry (offsets stay absolute). */
  prepend?: Buffer;
  /** Bytes between the first entry and the next. */
  gapAfterFirst?: Buffer;
  /** Bytes after the end record (not covered by its comment length). */
  trailing?: Buffer;
  zip64LocatorDisk?: number;
  zip64TotalDisks?: number;
  /** Bytes between the zip64 record and its locator. */
  zip64Gap?: Buffer;
  /** Write a non-saturated entry count in the end record that disagrees with the zip64 record. */
  zip64CountMismatch?: boolean;
  /** Write real (non-saturated) values in the end record alongside the zip64 records (as Python does). */
  zip64Unsaturated?: boolean;
}

export function makeZip(specs: ZipEntrySpec[], opts: ZipOpts = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = opts.prepend?.length ?? 0;
  if (opts.prepend) locals.push(opts.prepend);
  specs.forEach((s, idx) => {
    const data = s.data ?? Buffer.alloc(0);
    const method = s.method ?? (s.name.endsWith('/') ? 0 : 8);
    const comp = method === 8 ? deflateRawSync(data) : data;
    const crc = s.crc ?? crc32(data);
    const size = s.size ?? data.length;
    const name = Buffer.from(s.name, 'latin1');
    const lname = Buffer.from(s.localName ?? s.name, 'latin1');
    const flags = (s.flags ?? 0) | (s.descriptor ? 0x0008 : 0);
    const mode = s.mode ?? (s.name.endsWith('/') ? 0o040755 : 0o100644);
    const wideDesc = Boolean(opts.zip64 && s.descriptor);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(opts.zip64 ? 45 : 20, 4);
    lh.writeUInt16LE(s.localFlags ?? flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(s.localCrc ?? (s.descriptor ? 0 : crc), 14);
    lh.writeUInt32LE(wideDesc ? 0xffffffff : s.descriptor ? 0 : comp.length, 18);
    lh.writeUInt32LE(wideDesc ? 0xffffffff : (s.localSize ?? (s.descriptor ? 0 : size)), 22);
    let lextra = Buffer.alloc(0);
    if (wideDesc) {
      lextra = Buffer.alloc(20);
      lextra.writeUInt16LE(0x0001, 0);
      lextra.writeUInt16LE(16, 2);
    }
    lh.writeUInt16LE(lname.length, 26);
    lh.writeUInt16LE(lextra.length, 28);
    const parts = [lh, lname, lextra, comp];
    if (s.descriptor) {
      const sig = s.descriptor === 'nosig' ? Buffer.alloc(0) : Buffer.from([0x50, 0x4b, 0x07, 0x08]);
      const d = Buffer.alloc(wideDesc ? 20 : 12);
      d.writeUInt32LE(s.descriptorCrc ?? crc, 0);
      if (wideDesc) {
        d.writeBigUInt64LE(BigInt(comp.length), 4);
        d.writeBigUInt64LE(BigInt(size), 12);
      } else {
        d.writeUInt32LE(comp.length, 4);
        d.writeUInt32LE(size, 8);
      }
      parts.push(sig, d);
    }
    const localLen = parts.reduce((n, b) => n + b.length, 0);
    locals.push(...parts);

    const at = s.offset ?? offset;
    let extra = Buffer.alloc(0);
    if (opts.zip64) {
      extra = Buffer.alloc(4 + 24);
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(size), 4);
      extra.writeBigUInt64LE(BigInt(comp.length), 12);
      extra.writeBigUInt64LE(BigInt(at), 20);
    }
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);
    ch.writeUInt16LE(opts.zip64 ? 45 : 20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(opts.zip64 ? 0xffffffff : comp.length, 20);
    ch.writeUInt32LE(opts.zip64 ? 0xffffffff : size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(extra.length, 30);
    ch.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, 38);
    ch.writeUInt32LE(opts.zip64 ? 0xffffffff : at, 42);
    centrals.push(ch, name, extra);
    offset += localLen;
    if (idx === 0 && opts.gapAfterFirst) {
      locals.push(opts.gapAfterFirst);
      offset += opts.gapAfterFirst.length;
    }
  });
  const cd = Buffer.concat(centrals);
  const out = [...locals, cd];
  const cdOffset = offset;
  if (opts.zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(44n, 4);
    rec.writeUInt16LE(45, 12);
    rec.writeUInt16LE(45, 14);
    rec.writeBigUInt64LE(BigInt(specs.length), 24);
    rec.writeBigUInt64LE(BigInt(specs.length), 32);
    rec.writeBigUInt64LE(BigInt(cd.length), 40);
    rec.writeBigUInt64LE(BigInt(cdOffset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(opts.zip64LocatorDisk ?? 0, 4);
    loc.writeBigUInt64LE(BigInt(cdOffset + cd.length), 8);
    loc.writeUInt32LE(opts.zip64TotalDisks ?? 1, 16);
    out.push(rec);
    if (opts.zip64Gap) out.push(opts.zip64Gap);
    out.push(loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const sat = opts.zip64 && !opts.zip64Unsaturated;
  const count = opts.zip64CountMismatch ? specs.length + 1 : sat ? 0xffff : specs.length;
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(sat ? 0xffffffff : cd.length, 12);
  eocd.writeUInt32LE(sat ? 0xffffffff : cdOffset, 16);
  out.push(eocd);
  if (opts.trailing) out.push(opts.trailing);
  return Buffer.concat(out);
}

/** A structurally valid JPEG (SOI, SOF0 with the given width, SOS, EOI) of at least 200 bytes. */
export function fakeJpeg(width: number, height = 600): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, 0x03, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
  // Pseudo-random scan data (like real entropy-coded JPEG data, it barely compresses).
  let x = width * 7919 + height;
  const scan = Buffer.alloc(400);
  for (let i = 0; i < scan.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    scan[i] = (x >>> 16) & 0xfe; // never 0xFF, so no stray markers
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, scan, Buffer.from([0xff, 0xd9])]);
}

export const SHA = 'b'.repeat(40);
export const BRANCH = 'feature/x';

export interface ArtifactOpts {
  sha?: string;
  branch?: string;
  widths?: number[];
  routes?: string[];
}

/** A complete report.json object as the harness writes it (extra harness-only fields included). */
export function reportObject(o: ArtifactOpts = {}): Record<string, any> {
  const widths = o.widths ?? [390];
  const routes = o.routes ?? ['home'];
  return {
    branch: o.branch ?? BRANCH,
    commit: o.sha ?? SHA,
    frozenTime: '2026-11-21T15:00:00-05:00',
    generatedAt: '2026-11-21T20:00:00.000Z',
    axeAvailable: true,
    widths,
    routes,
    shots: widths.flatMap((width) =>
      routes.map((route) => ({
        route,
        width,
        file: `${width}/${route}.jpg`,
        fold: `${width}/${route}-fold.jpg`,
        overflowPx: 0,
        offenders: [],
        ...([390, 1280].includes(width) ? { axe: [{ id: 'color-contrast', impact: 'serious', help: 'Contrast', nodes: 3, targets: ['.x'] }] } : {}),
        pageErrors: [],
        ok: false,
      })),
    ),
    states: [{ name: 'Contents menu open (390px)', file: 'states/menu-390.jpg', ok: true }],
    axeSummary: [],
    keyboard: widths.filter((w) => [390, 1280].includes(w)).map((width) => ({ width, route: 'home', checks: [{ name: 'Tab moves focus into the page', pass: true, detail: 'a "Skip"' }], sequence: ['a'] })),
    blockedHosts: [],
  };
}

export const sampleReport = (o: ArtifactOpts = {}, patch: (r: Record<string, any>) => void = () => {}) => {
  const r = reportObject(o);
  patch(r);
  return Buffer.from(JSON.stringify(r));
};

/** Entries of a valid artifact like the visual check produces (plus a hostile REPORT.md). */
export function artifactEntries(o: ArtifactOpts = {}): ZipEntrySpec[] {
  const r = reportObject(o);
  const specs: ZipEntrySpec[] = [];
  for (const w of r.widths as number[]) {
    specs.push({ name: `${w}/` });
    for (const route of r.routes as string[]) {
      specs.push({ name: `${w}/${route}.jpg`, data: fakeJpeg(w) });
      specs.push({ name: `${w}/${route}-fold.jpg`, data: fakeJpeg(w, 844), method: 0 });
    }
  }
  specs.push({ name: 'states/' }, { name: 'states/menu-390.jpg', data: fakeJpeg(390, 844) });
  specs.push({ name: 'report.json', data: Buffer.from(JSON.stringify(r)) });
  specs.push({ name: 'REPORT.md', data: Buffer.from('# from the branch [phish](https://evil.example) <img src=x onerror=alert(1)>') });
  return specs;
}

/** A valid artifact like the visual check produces. */
export function goodArtifact(o: ArtifactOpts & ZipOpts = {}): Buffer {
  return makeZip(artifactEntries(o), o);
}

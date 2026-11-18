/**
 * Test-only ZIP writer that can produce valid AND deliberately malicious archives
 * (symlinks, traversal names, bad CRCs, lying sizes, encryption flags, zip64, …).
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
}

export function makeZip(specs: ZipEntrySpec[], opts: { zip64?: boolean } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const s of specs) {
    const data = s.data ?? Buffer.alloc(0);
    const method = s.method ?? (s.name.endsWith('/') ? 0 : 8);
    const comp = method === 8 ? deflateRawSync(data) : data;
    const crc = s.crc ?? crc32(data);
    const size = s.size ?? data.length;
    const name = Buffer.from(s.name, 'latin1');
    const lname = Buffer.from(s.localName ?? s.name, 'latin1');
    const flags = s.flags ?? 0;
    const mode = s.mode ?? (s.name.endsWith('/') ? 0o040755 : 0o100644);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(opts.zip64 ? 45 : 20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(lname.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, lname, comp);

    let extra = Buffer.alloc(0);
    if (opts.zip64) {
      extra = Buffer.alloc(4 + 24);
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(size), 4);
      extra.writeBigUInt64LE(BigInt(comp.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
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
    ch.writeUInt32LE(opts.zip64 ? 0xffffffff : offset, 42);
    centrals.push(ch, name, extra);
    offset += 30 + lname.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const parts = [...locals, cd];
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
    loc.writeBigUInt64LE(BigInt(cdOffset + cd.length), 8);
    loc.writeUInt32LE(1, 16);
    parts.push(rec, loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : specs.length, 8);
  eocd.writeUInt16LE(opts.zip64 ? 0xffff : specs.length, 10);
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : cd.length, 12);
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : cdOffset, 16);
  parts.push(eocd);
  return Buffer.concat(parts);
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

export const sampleReport = (extra: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      frozenTime: '2026-11-21T15:00:00-05:00',
      generatedAt: '2026-11-21T20:00:00.000Z',
      axeAvailable: true,
      widths: [390],
      routes: ['home'],
      shots: [{ route: 'home', width: 390, file: '390/home.jpg', fold: '390/home-fold.jpg', overflowPx: 0, pageErrors: [], axe: [{ id: 'color-contrast', impact: 'serious', nodes: 3 }] }],
      keyboard: [{ width: 390, checks: [{ name: 'Tab moves focus into the page', pass: true, detail: 'a "Skip"' }] }],
      blockedHosts: [],
      ...extra,
    }),
  );

/** A valid artifact like the visual check produces. */
export function goodArtifact(opts: { zip64?: boolean } = {}): Buffer {
  return makeZip(
    [
      { name: '390/' },
      { name: '390/home.jpg', data: fakeJpeg(390) },
      { name: '390/home-fold.jpg', data: fakeJpeg(390, 844), method: 0 },
      { name: 'states/' },
      { name: 'states/menu-390.jpg', data: fakeJpeg(390, 844) },
      { name: 'report.json', data: sampleReport() },
      { name: 'REPORT.md', data: Buffer.from('# from the branch [phish](https://evil.example) <img src=x onerror=alert(1)>') },
    ],
    opts,
  );
}

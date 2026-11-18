// @ts-check
/**
 * Minimal, defensive ZIP reader for UNTRUSTED artifacts. Zero dependencies (node:zlib only),
 * so the privileged publisher never runs third-party code.
 *
 * It parses the archive structure itself, validates every entry BEFORE anything is
 * decompressed, never touches the filesystem, and returns verified file contents as buffers.
 * It accepts only the plain single-disk structure that real artifact zips use and rejects
 * anything else:
 *  - archive boundaries: the end record must end the file (no trailing data), the central
 *    directory must end exactly where the (zip64) end record starts, and the local entries
 *    must tile [0, central directory) exactly: no prepended data, gaps or overlapping ranges;
 *  - ZIP64: the locator must point at a well-formed record placed immediately before it, on
 *    disk 0 of 1; zip64 fields are only read when the 32-bit field is saturated;
 *  - entries: encryption, unknown flag bits, unknown compression, symlinks and any
 *    non-regular type are rejected; names must be safe relative ASCII paths, unique and
 *    allowlisted;
 *  - directory entries must be empty (stored or deflated, size 0, CRC 0, decoding to nothing);
 *  - every local header must agree with the central directory (name, method, flags, and
 *    CRC/sizes, which may only be deferred to a data descriptor when flag bit 3 is set; a
 *    descriptor must then be present and agree too);
 *  - entry-count, per-file, total and compression-ratio limits (zip bombs); the inflater's
 *    output is capped at the declared size; every CRC-32 and size is verified.
 */
import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const SIG_DESC = 0x08074b50;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

/** Flag bits we understand: deflate options (1, 2), data descriptor (3), UTF-8 names (11). */
const ALLOWED_FLAGS = 0x0002 | 0x0004 | 0x0008 | 0x0800;
const FLAG_DESCRIPTOR = 0x0008;

/** @type {Uint32Array} */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} buf */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Buffer} b @param {number} off @param {number} len */
function need(b, off, len) {
  if (!Number.isSafeInteger(off) || !Number.isSafeInteger(len) || off < 0 || len < 0 || off + len > b.length) throw new ZipError('truncated or malformed zip');
}

/** Read a 64-bit little-endian integer as a safe JS number. */
function u64(/** @type {Buffer} */ b, /** @type {number} */ off) {
  need(b, off, 8);
  const v = b.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('size out of range');
  return Number(v);
}

/**
 * Parse an extra-field block into a map of id → [start, length]. Rejects overruns and
 * duplicate ids (a second zip64 block could otherwise disagree with the first).
 * @param {Buffer} buf @param {number} start @param {number} len
 */
function extras(buf, start, len) {
  /** @type {Map<number, [number, number]>} */
  const m = new Map();
  let x = start;
  const end = start + len;
  while (x < end) {
    if (x + 4 > end) throw new ZipError('malformed extra field');
    const id = buf.readUInt16LE(x);
    const l = buf.readUInt16LE(x + 2);
    if (x + 4 + l > end) throw new ZipError('malformed extra field');
    if (m.has(id)) throw new ZipError('duplicate extra field');
    m.set(id, [x + 4, l]);
    x += 4 + l;
  }
  return m;
}

/**
 * Resolve saturated 32-bit fields from a zip64 extra block, in the order the spec defines
 * (uncompressed size, compressed size, local header offset). A saturated field without a
 * zip64 value, or a zip64 block with unread trailing values, is rejected.
 * @param {Buffer} buf
 * @param {Map<number, [number, number]>} ex
 * @param {{ size: number, compressedSize: number, localOffset?: number }} f
 */
function applyZip64(buf, ex, f) {
  const z = ex.get(0x0001);
  const wantSize = f.size === U32_MAX;
  const wantComp = f.compressedSize === U32_MAX;
  const wantOff = f.localOffset === U32_MAX;
  if (!z) {
    if (wantSize || wantComp || wantOff) throw new ZipError('saturated size without zip64 field');
    return { ...f, zip64: false };
  }
  let [q, len] = z;
  const end = q + len;
  const take = () => {
    if (q + 8 > end) throw new ZipError('malformed zip64 field');
    const v = u64(buf, q);
    q += 8;
    return v;
  };
  const out = { ...f, zip64: true };
  if (wantSize) out.size = take();
  if (wantComp) out.compressedSize = take();
  if (wantOff) out.localOffset = take();
  return out;
}

/**
 * @typedef {{ name: string, isDir: boolean, method: number, flags: number, crc: number,
 *   compressedSize: number, size: number, localOffset: number, unixMode: number | null }} Entry
 * @typedef {{ maxZipBytes: number, maxEntries: number, maxFileBytes: number, maxTotalBytes: number,
 *   maxRatio: (name: string) => number, isAllowedPath: (name: string) => boolean,
 *   isAllowedDir: (name: string) => boolean }} Limits
 */

/** Strict, platform-independent path check (before any allowlist). */
export function safeEntryName(/** @type {string} */ name) {
  if (!name || name.length > 200) return false;
  if (!/^[A-Za-z0-9._\-/]+$/.test(name)) return false; // no backslash, NUL, spaces, unicode tricks
  if (name.startsWith('/') || name.includes('//')) return false;
  const parts = name.replace(/\/$/, '').split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..');
}

/**
 * Locate and validate the end records. Returns where the central directory is and where it
 * must end.
 * @param {Buffer} buf
 */
function endRecords(buf) {
  // The end record is the last 22 bytes plus a comment of at most 64 KiB. Scan backwards and
  // require the record's comment to end exactly at the end of the file.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - U16_MAX); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('no end-of-central-directory record');
  if (eocd + 22 + buf.readUInt16LE(eocd + 20) !== buf.length) throw new ZipError('data after the end of the archive');
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) throw new ZipError('multi-disk zips are not supported');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt16LE(eocd + 8) !== count) throw new ZipError('inconsistent entry counts');
  let cdEnd = eocd;

  // Zip64 end records are used when a field is saturated, and some writers (e.g. Python) also
  // emit them otherwise; either way they must be well formed and agree with the end record.
  const hasLocator = eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_EOCD64_LOC;
  if (count === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX || hasLocator) {
    const loc = eocd - 20;
    need(buf, loc, 20);
    if (buf.readUInt32LE(loc) !== SIG_EOCD64_LOC) throw new ZipError('missing zip64 locator');
    if (buf.readUInt32LE(loc + 4) !== 0 || buf.readUInt32LE(loc + 16) !== 1) throw new ZipError('multi-disk zips are not supported');
    const rec = u64(buf, loc + 8);
    need(buf, rec, 56);
    if (buf.readUInt32LE(rec) !== SIG_EOCD64) throw new ZipError('bad zip64 record');
    const recSize = u64(buf, rec + 4);
    // The record (no extensible data) must sit immediately before the locator.
    if (recSize !== 44 || rec + 12 + recSize !== loc) throw new ZipError('misplaced or extended zip64 record');
    if (buf.readUInt32LE(rec + 16) !== 0 || buf.readUInt32LE(rec + 20) !== 0) throw new ZipError('multi-disk zips are not supported');
    const onDisk = u64(buf, rec + 24);
    const total = u64(buf, rec + 32);
    if (onDisk !== total) throw new ZipError('inconsistent entry counts');
    // Only saturated 32-bit fields may defer to zip64; the others must agree with it.
    const size64 = u64(buf, rec + 40);
    const off64 = u64(buf, rec + 48);
    if ((count !== U16_MAX && count !== total) || (cdSize !== U32_MAX && cdSize !== size64) || (cdOffset !== U32_MAX && cdOffset !== off64)) throw new ZipError('zip64 record disagrees with end record');
    count = total;
    cdSize = size64;
    cdOffset = off64;
    cdEnd = rec;
  }
  if (cdOffset + cdSize !== cdEnd) throw new ZipError('central directory does not end at the end record');
  return { count, cdOffset, cdSize, cdEnd };
}

/**
 * Parse and validate the central directory. Throws ZipError on anything unexpected.
 * @param {Buffer} buf
 * @param {Limits} limits
 */
function directory(buf, limits) {
  if (!Buffer.isBuffer(buf)) throw new ZipError('not a buffer');
  if (buf.length > limits.maxZipBytes) throw new ZipError(`zip too large (${buf.length} bytes)`);
  if (buf.length < 22) throw new ZipError('truncated or malformed zip');
  const { count, cdOffset, cdSize, cdEnd } = endRecords(buf);
  if (count > limits.maxEntries) throw new ZipError(`too many entries (${count})`);
  need(buf, cdOffset, cdSize);

  /** @type {Entry[]} */
  const entries = [];
  const seen = new Set();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    need(buf, p, 46);
    if (p + 46 > cdEnd) throw new ZipError('central directory overruns its size');
    if (buf.readUInt32LE(p) !== SIG_CEN) throw new ZipError('bad central directory header');
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const disk = buf.readUInt16LE(p + 34);
    const external = buf.readUInt32LE(p + 38);
    need(buf, p + 46, nameLen + extraLen + commentLen);
    if (p + 46 + nameLen + extraLen + commentLen > cdEnd) throw new ZipError('central directory overruns its size');
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('latin1');
    const z = applyZip64(buf, extras(buf, p + 46 + nameLen, extraLen), {
      size: buf.readUInt32LE(p + 24),
      compressedSize: buf.readUInt32LE(p + 20),
      localOffset: buf.readUInt32LE(p + 42),
    });
    const { size, compressedSize } = z;
    const localOffset = /** @type {number} */ (z.localOffset);

    if (disk !== 0) throw new ZipError('multi-disk zips are not supported');
    if (flags & 0x0001) throw new ZipError(`encrypted entry: ${JSON.stringify(name)}`);
    if (flags & 0x0040) throw new ZipError(`strong encryption: ${JSON.stringify(name)}`);
    if (flags & ~ALLOWED_FLAGS) throw new ZipError(`unsupported flags 0x${flags.toString(16)}: ${JSON.stringify(name)}`);
    if (!safeEntryName(name)) throw new ZipError(`unsafe path: ${JSON.stringify(name)}`);
    if (seen.has(name)) throw new ZipError(`duplicate entry: ${name}`);
    seen.add(name);

    const isDir = name.endsWith('/');
    const unixMode = madeBy >> 8 === 3 ? (external >>> 16) & 0xffff : null;
    if (unixMode !== null && unixMode !== 0) {
      const type = unixMode & 0o170000;
      if (type === 0o120000) throw new ZipError(`symlink entry: ${name}`);
      if (type !== 0 && type !== (isDir ? 0o040000 : 0o100000)) throw new ZipError(`not a regular file: ${name}`);
    }
    if (external & 0x10 && !isDir) throw new ZipError(`directory attribute on a file name: ${name}`);
    if (localOffset >= cdOffset) throw new ZipError(`entry outside the archive body: ${name}`);

    if (isDir) {
      if (!limits.isAllowedDir(name)) throw new ZipError(`unexpected directory: ${name}`);
      if (method !== 0 && method !== 8) throw new ZipError(`unsupported compression (${method}): ${name}`);
      if (size !== 0 || crc !== 0 || (method === 0 && compressedSize !== 0) || (method === 8 && compressedSize > 16)) throw new ZipError(`directory with data: ${name}`);
    } else {
      if (!limits.isAllowedPath(name)) throw new ZipError(`file not allowed: ${name}`);
      if (method !== 0 && method !== 8) throw new ZipError(`unsupported compression (${method}): ${name}`);
      if (size > limits.maxFileBytes) throw new ZipError(`file too large: ${name} (${size} bytes)`);
      if (method === 0 && compressedSize !== size) throw new ZipError(`stored size mismatch: ${name}`);
      if (method === 8 && size > 0 && compressedSize > 0 && size / compressedSize > limits.maxRatio(name)) throw new ZipError(`suspicious compression ratio: ${name}`);
      if (method === 8 && size > 0 && compressedSize === 0) throw new ZipError(`suspicious compression ratio: ${name}`);
    }
    entries.push({ name, isDir, method, flags, crc, compressedSize, size, localOffset, unixMode });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cdEnd) throw new ZipError('central directory size mismatch');
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > limits.maxTotalBytes) throw new ZipError(`artifact too large when extracted (${total} bytes)`);
  return { entries, cdOffset };
}

/**
 * Parse and validate the central directory only.
 * @param {Buffer} buf
 * @param {Limits} limits
 * @returns {Entry[]}
 */
export function readEntries(buf, limits) {
  return directory(buf, limits).entries;
}

/**
 * Validate one entry's local header (and data descriptor) against the central directory.
 * Returns where its data starts and where the entry (including any descriptor) ends.
 * @param {Buffer} buf @param {Entry} e
 */
function localRecord(buf, e) {
  const p = e.localOffset;
  need(buf, p, 30);
  if (buf.readUInt32LE(p) !== SIG_LOC) throw new ZipError(`bad local header: ${e.name}`);
  const lFlags = buf.readUInt16LE(p + 6);
  const lMethod = buf.readUInt16LE(p + 8);
  const lCrc = buf.readUInt32LE(p + 14);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  need(buf, p + 30, nameLen + extraLen);
  const lName = buf.subarray(p + 30, p + 30 + nameLen).toString('latin1');
  if (lName !== e.name) throw new ZipError(`local/central name mismatch: ${e.name}`);
  if (lMethod !== e.method) throw new ZipError(`local/central method mismatch: ${e.name}`);
  if (lFlags !== e.flags) throw new ZipError(`local/central flags mismatch: ${e.name}`);
  const lz = applyZip64(buf, extras(buf, p + 30 + nameLen, extraLen), { size: buf.readUInt32LE(p + 22), compressedSize: buf.readUInt32LE(p + 18) });
  const start = p + 30 + nameLen + extraLen;
  need(buf, start, e.compressedSize);
  let end = start + e.compressedSize;

  if (e.flags & FLAG_DESCRIPTOR) {
    // Streaming writers put zeros (or the real values) in the local header and the real values
    // in a descriptor after the data. Anything else is a disagreement.
    const deferredOk = (/** @type {number} */ v, /** @type {number} */ real) => v === 0 || v === real;
    if (!deferredOk(lCrc, e.crc) || !deferredOk(lz.size, e.size) || !deferredOk(lz.compressedSize, e.compressedSize)) throw new ZipError(`local/central header mismatch: ${e.name}`);
    let d = end;
    need(buf, d, 4);
    if (buf.readUInt32LE(d) === SIG_DESC) d += 4;
    const wide = lz.zip64; // zip64 entries use 8-byte descriptor sizes
    need(buf, d, wide ? 20 : 12);
    const dCrc = buf.readUInt32LE(d);
    const dComp = wide ? u64(buf, d + 4) : buf.readUInt32LE(d + 4);
    const dSize = wide ? u64(buf, d + 12) : buf.readUInt32LE(d + 8);
    if (dCrc !== e.crc || dComp !== e.compressedSize || dSize !== e.size) throw new ZipError(`data descriptor mismatch: ${e.name}`);
    end = d + (wide ? 20 : 12);
  } else if (lCrc !== e.crc || lz.size !== e.size || lz.compressedSize !== e.compressedSize) {
    throw new ZipError(`local/central header mismatch: ${e.name}`);
  }
  return { start, end };
}

/**
 * Validate and decompress every file entry in memory. Nothing touches the filesystem.
 * @param {Buffer} buf
 * @param {Limits} limits
 * @returns {Map<string, Buffer>}
 */
export function readZip(buf, limits) {
  const { entries, cdOffset } = directory(buf, limits);
  // Structure first: every local record must agree with the directory, and together they
  // must tile the archive body exactly (no prepended data, gaps, or overlapping entries).
  const ranges = entries.map((e) => ({ e, ...localRecord(buf, e) })).sort((a, b) => a.e.localOffset - b.e.localOffset);
  let cursor = 0;
  for (const r of ranges) {
    if (r.e.localOffset !== cursor) throw new ZipError(r.e.localOffset < cursor ? `overlapping entries: ${r.e.name}` : `unaccounted data before ${r.e.name}`);
    cursor = r.end;
  }
  if (cursor !== cdOffset) throw new ZipError(cursor > cdOffset ? 'entry data overruns the central directory' : 'unaccounted data before the central directory');

  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const { e, start } of ranges) {
    if (e.isDir) {
      // A deflated directory entry must decode to nothing (the CRC of no data is 0).
      if (e.method === 8) {
        let d;
        try {
          d = inflateRawSync(buf.subarray(start, start + e.compressedSize), { maxOutputLength: 1 });
        } catch {
          throw new ZipError(`directory with data: ${e.name}`);
        }
        if (d.length) throw new ZipError(`directory with data: ${e.name}`);
      }
      continue;
    }
    const raw = buf.subarray(start, start + e.compressedSize);
    let data;
    try {
      data = e.method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size) + 1 });
    } catch {
      throw new ZipError(`corrupt or oversized data: ${e.name}`);
    }
    if (data.length !== e.size) throw new ZipError(`size mismatch: ${e.name}`);
    if (crc32(data) !== e.crc) throw new ZipError(`CRC mismatch: ${e.name}`);
    files.set(e.name, data);
  }
  return files;
}

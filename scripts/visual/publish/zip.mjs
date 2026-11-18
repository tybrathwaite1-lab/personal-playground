// @ts-check
/**
 * Minimal, defensive ZIP reader for UNTRUSTED artifacts. Zero dependencies (node:zlib only),
 * so the privileged publisher never runs third-party code.
 *
 * It parses the central directory itself, validates every entry BEFORE anything is extracted,
 * never touches the filesystem, and returns verified file contents as buffers:
 *  - rejects encryption, unknown compression, symlinks and any non-regular entry,
 *  - rejects absolute paths, backslashes, "." / ".." segments, duplicates and odd characters,
 *  - enforces entry-count, per-file, total and compression-ratio limits (zip bombs),
 *  - checks every local header against the central directory, and every CRC-32 and size.
 * Zip64 is supported (GitHub's artifact zips may use it).
 */
import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

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
  if (off < 0 || off + len > b.length) throw new ZipError('truncated or malformed zip');
}

/** Read a 64-bit little-endian integer as a safe JS number. */
function u64(/** @type {Buffer} */ b, /** @type {number} */ off) {
  need(b, off, 8);
  const v = b.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('size out of range');
  return Number(v);
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
 * Parse and validate the central directory. Throws ZipError on anything unexpected.
 * @param {Buffer} buf
 * @param {Limits} limits
 * @returns {Entry[]}
 */
export function readEntries(buf, limits) {
  if (!Buffer.isBuffer(buf)) throw new ZipError('not a buffer');
  if (buf.length > limits.maxZipBytes) throw new ZipError(`zip too large (${buf.length} bytes)`);
  if (buf.length < 22) throw new ZipError('truncated or malformed zip');

  // End of central directory (allowing a trailing comment of up to 64 KiB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('no end-of-central-directory record');
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) throw new ZipError('multi-disk zips are not supported');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt16LE(eocd + 8) !== count) throw new ZipError('inconsistent entry counts');

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    need(buf, loc, 20);
    if (buf.readUInt32LE(loc) !== SIG_EOCD64_LOC) throw new ZipError('missing zip64 locator');
    const rec = u64(buf, loc + 8);
    need(buf, rec, 56);
    if (buf.readUInt32LE(rec) !== SIG_EOCD64) throw new ZipError('bad zip64 record');
    count = u64(buf, rec + 32);
    if (u64(buf, rec + 24) !== count) throw new ZipError('inconsistent entry counts');
    cdSize = u64(buf, rec + 40);
    cdOffset = u64(buf, rec + 48);
  }
  if (count > limits.maxEntries) throw new ZipError(`too many entries (${count})`);
  need(buf, cdOffset, cdSize);

  /** @type {Entry[]} */
  const entries = [];
  const seen = new Set();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    need(buf, p, 46);
    if (buf.readUInt32LE(p) !== SIG_CEN) throw new ZipError('bad central directory header');
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    let compressedSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const disk = buf.readUInt16LE(p + 34);
    const external = buf.readUInt32LE(p + 38);
    let localOffset = buf.readUInt32LE(p + 42);
    need(buf, p + 46, nameLen + extraLen + commentLen);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const name = nameBytes.toString('latin1');

    // Zip64 extended information.
    let x = p + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = buf.readUInt16LE(x);
      const len = buf.readUInt16LE(x + 2);
      if (x + 4 + len > xEnd) throw new ZipError('malformed extra field');
      if (id === 0x0001) {
        let q = x + 4;
        if (size === 0xffffffff) (size = u64(buf, q)), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = u64(buf, q)), (q += 8);
        if (localOffset === 0xffffffff) (localOffset = u64(buf, q)), (q += 8);
        if (q > x + 4 + len) throw new ZipError('malformed zip64 field');
      }
      x += 4 + len;
    }

    if (disk !== 0) throw new ZipError('multi-disk zips are not supported');
    if (flags & 0x0001) throw new ZipError(`encrypted entry: ${JSON.stringify(name)}`);
    if (flags & 0x0040) throw new ZipError(`strong encryption: ${JSON.stringify(name)}`);
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
    if ((external & 0x10) && !isDir) throw new ZipError(`directory attribute on a file name: ${name}`);

    if (isDir) {
      if (!limits.isAllowedDir(name)) throw new ZipError(`unexpected directory: ${name}`);
      if (size !== 0) throw new ZipError(`directory with data: ${name}`);
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
  if (p !== cdOffset + cdSize) throw new ZipError('central directory size mismatch');
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > limits.maxTotalBytes) throw new ZipError(`artifact too large when extracted (${total} bytes)`);
  return entries;
}

/**
 * Validate and decompress every file entry in memory. Nothing touches the filesystem.
 * @param {Buffer} buf
 * @param {Limits} limits
 * @returns {Map<string, Buffer>}
 */
export function readZip(buf, limits) {
  const entries = readEntries(buf, limits);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const e of entries) {
    const p = e.localOffset;
    need(buf, p, 30);
    if (buf.readUInt32LE(p) !== SIG_LOC) throw new ZipError(`bad local header: ${e.name}`);
    const lFlags = buf.readUInt16LE(p + 6);
    const lMethod = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    need(buf, p + 30, nameLen + extraLen);
    const lName = buf.subarray(p + 30, p + 30 + nameLen).toString('latin1');
    if (lName !== e.name) throw new ZipError(`local/central name mismatch: ${e.name}`);
    if (lMethod !== e.method || (lFlags & 0x0001) !== (e.flags & 0x0001)) throw new ZipError(`local/central header mismatch: ${e.name}`);
    if (e.isDir) continue;
    const start = p + 30 + nameLen + extraLen;
    need(buf, start, e.compressedSize);
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

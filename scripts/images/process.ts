/**
 * Editorial image processing, shared by scripts/images/fetch.ts and its tests: one downloaded
 * original becomes two WebP copies, 1200 px and 600 px wide (never enlarged), with EXIF
 * orientation applied and metadata stripped.
 */
import sharp from 'sharp';

export const VARIANTS = [
  { width: 1200, quality: 72 },
  { width: 600, quality: 70 },
] as const;

/** Writes the 1200 px and 600 px WebP variants of `original` to `big` and `small`. */
export async function writeEditorialVariants(original: Buffer, big: string, small: string): Promise<void> {
  const base = sharp(original, { limitInputPixels: 300_000_000 }).rotate();
  await base.clone().resize({ width: VARIANTS[0].width, withoutEnlargement: true }).webp({ quality: VARIANTS[0].quality }).toFile(big);
  await base.clone().resize({ width: VARIANTS[1].width, withoutEnlargement: true }).webp({ quality: VARIANTS[1].quality }).toFile(small);
}

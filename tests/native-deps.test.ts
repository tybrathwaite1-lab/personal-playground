/**
 * M1: the native dependencies work with their install scripts denied (package.json
 * "allowScripts"). esbuild (via Vite and tsx) and sharp (editorial and scout image processing)
 * ship prebuilt platform binaries as optional dependencies; these synthetic checks fail if a
 * future version needs its install script after all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('esbuild transforms code with its install script denied', async () => {
  const esbuild = require('esbuild') as typeof import('esbuild');
  const out = await esbuild.transform('const x: number = 1 + 1; export default x;', { loader: 'ts', format: 'esm', minify: true });
  assert.match(out.code, /export\s*\{?\s*\w*\s*as default|export default/);
  // Vite bundles with its own esbuild copy; it must load too.
  const viteEsbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] })) as typeof import('esbuild');
  assert.ok((await viteEsbuild.transform('let a = 1', { loader: 'js' })).code.includes('let a = 1'));
});

test('sharp encodes WebP and JPEG from a synthetic image with its install script denied', async () => {
  const sharp = require('sharp') as typeof import('sharp');
  const base = sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 212, g: 126, b: 71 } } });
  const webp = await base.clone().resize(32).webp({ quality: 70 }).toBuffer({ resolveWithObject: true });
  assert.equal(webp.info.format, 'webp');
  assert.equal(webp.info.width, 32);
  const jpeg = await base.clone().jpeg({ quality: 70 }).toBuffer();
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8]);
});

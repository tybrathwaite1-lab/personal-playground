# Newsreader

The one self-hosted serif approved for The Quiet Room (Creative Slice 02, decision D1), first
for the Make It Yours prototype and, since Creative Slice 03 Phase 3.3, for the shell's Quiet
Room setting. Declared in `src/styles/newsreader.css` with the app's styles; browsers fetch a
declared face only when text on screen uses it, so only The Quiet Room requests these files
(tests/atmospheres.test.ts, browser-tests/atmospheres.test.ts and the strict style-guide check).

- Typeface: Newsreader, Production Type. Licence: SIL Open Font License 1.1 (`OFL.txt`).
- Source: Fontsource's published font files, `fontsource/font-files` at commit
  `5a72889057f592bb0659629e38337359f94d53b2`, `fonts/google/newsreader/files/` — the same files
  the `@fontsource/newsreader` 5.3.0 npm package ships. Copied, not modified.
- Why files instead of the npm package: the authoring environment could not reach the npm
  registry, and three files need no dependency, install step or lockfile change.
- Subset: Latin only (U+0000-00FF and common punctuation), weights 400 (normal and italic) and 500.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| newsreader-latin-400-normal.woff2 | 22480 | e66067814f1c672d33a457e4f4d102c818b481420e2234cf685ebdbf2f443904 |
| newsreader-latin-400-italic.woff2 | 24340 | fa9b900403949d9a723106752a5c8ad2797012a0c9057427b1da2db72d552148 |
| newsreader-latin-500-normal.woff2 | 23624 | 5613e2fc8377392c02e8ac9d55014689fb5320a5f2a7be55e8088a314728ac2c |

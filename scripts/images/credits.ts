/** Regenerates IMAGE_CREDITS.md from src/data/images.ts. Usage: npx tsx scripts/images/credits.ts */
import { writeFileSync } from 'node:fs';
import { IMAGES } from '../../src/data/images.ts';

const LICENSE_URL: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public domain': 'https://commons.wikimedia.org/wiki/Help:Public_domain',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const cell = (s: string) => s.replace(/\|/g, '\\|');
const row = (i: (typeof IMAGES)[number]) =>
  `| ${cell(i.alt)} | ${cell(i.credit)} | [${i.license}](${LICENSE_URL[i.license]}) | [Commons file page](${i.sourceUrl}) |`;

const venues = IMAGES.filter((i) => i.kind === 'venue');
const mood = IMAGES.filter((i) => i.kind === 'illustrative');

export const CREDITS = `# Image credits

Every photograph in Personal Playground is free-licensed and comes from **Wikimedia Commons**. Photos are downloaded and converted to WebP during the build (\`scripts/images/fetch.ts\`) and served from the app itself. This file is generated from \`src/data/images.ts\` by \`npx tsx scripts/images/credits.ts\`.

Changes made: resized to 600 and 1200 px wide, converted to WebP, and shown with a slight desaturation filter in the app. CC BY-SA photos remain under their original license.

## Photos of actual local places

These are labelled in the app as **"Photo: <place>"** wherever they appear. Each place was identified from its Commons file page.

| Image | Photographer | License | Source |
|---|---|---|---|
${venues.map(row).join('\n')}

## Illustrative photos

Mood photos labelled **"Illustrative photo"** in the app. None of them claims to show a specific local venue.

| Image | Photographer | License | Source |
|---|---|---|---|
${mood.map(row).join('\n')}

## Adding an image

1. Find a candidate on Wikimedia Commons (or run the image scout: push to the \`image-scout\` branch with search terms in \`scripts/images/briefs.txt\`; contact sheets land on \`image-scout-results\`).
2. Check the license is CC0, public domain, CC BY or CC BY-SA (no NC/ND), and the photo doesn't mainly reproduce someone else's artwork.
3. Add an entry to \`src/data/images.ts\` with the original file URL, the Commons page, the credit, license, alt text and the subjects/tags it illustrates. Use \`kind: 'venue'\` and \`place\` only for a photo of that exact place.
4. Run \`npx tsx scripts/images/credits.ts\` to update this file. The next build fetches and converts the image.
`;

if (process.argv[1]?.endsWith('credits.ts')) {
  writeFileSync('IMAGE_CREDITS.md', CREDITS);
  console.log(`IMAGE_CREDITS.md: ${venues.length} venue + ${mood.length} illustrative photos`);
}

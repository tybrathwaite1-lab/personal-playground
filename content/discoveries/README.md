# Standalone discoveries

One JSON file per discovery, named `<id>.json`. These are discoveries that don't belong to a Weekly Drop edition: PR 2 of [ARCHITECTURE_ASSESSMENT_V2](../../collaboration/ARCHITECTURE_ASSESSMENT_V2.md), decision D-B (b).

The schema is the `DiscoveryRecord` type in `src/discovery/types.ts`. Validation lives in `src/discovery/validate.ts`, and the build is `scripts/discoveries/build.ts`, which runs as part of `npm run content` and `npm run build`.

## Status and publication

| Status | Meaning | Shipped? |
|---|---|---|
| `draft` | Still being verified, or has an unresolved source or factual problem | Never |
| `ready` | Verified and awaiting a publication decision | Never |
| `published` | Public from `publishDate` (a New York date) | From that date, once a deploy runs |

The build writes `public/data/discoveries.json`. It contains **only** published records whose date has arrived, sorted by id, without `editorialNotes` or `linkReviews`. Draft, ready and future records never leave the repository's content folder, and the discovery graph never traverses them.

## Fields

- **`id`**: kebab-case and stable forever. It shares one namespace with Drop items and thread nodes; a collision is a build error.
- **`title`**, **`subject`** and **`context`**: `context` is the editorial introduction, at most 700 characters.
- **`nature`**: `work` (something specific people made, which needs at least one credit) or `subject` (a place, practice or culture; credits are optional).
- **`credits`**: `{ name, role }`, with roles as the project itself states them. Never invent them.
- **`destination`**: where a visitor goes for the original work or primary source, as `{ url, label, verifiedAt, availability? }`. It is kept separate from the research sources.
  - `availability: "intermittent"`: offline at times by design (for example solar-powered).
  - `availability: "javascript-required"`: the content renders only in a browser with JavaScript.
- **`sources`**: the research behind the text, in the Drop's shape: `{ label, url, kind, verifiedAt }`.
- **`related`**: relations in the Drop's shape (`to`, `relation`, `note`, `basis`). Author each claim once, on one record. Graph traversal gives both directions, so a reciprocal record is only needed when the other side makes its own distinct claim. Duplicates, including the same claim with conflicting notes, are errors.
- **`image`**: optional. It is an id in the editorial image registry (`src/data/images.ts`): open licences from Wikimedia Commons only, with credit, licence and alt text. Leave it out rather than use a placeholder.
- **`linkReviews`**: an editor's recorded decision about a link that failed a check. A published record can't carry an unresolved one (`replace` or `remove`).
- **`editorialNotes`**: notes for editors. They are never shipped.

All links must be absolute `https://` and pass `isSafeUrl`. Every `verifiedAt` and `reviewedAt` date must be a real date, not in the future.

## Link checks

Run `npm run links:discoveries`. It reports every link by class:

| Class | What it covers |
|---|---|
| `invalid` | Malformed or non-https links. The validator rejects these too. |
| `ok` | The link works. |
| `intentional` | The destination is declared `intermittent` and its outage is a known condition. |
| `permanent` | 404 or 410, or the host doesn't exist. |
| `blocked` | 401, 403 or 451, often bot protection. |
| `transient` | Timeouts, resets, 429 or 5xx. |

- **The check is report-only.** It isn't part of CI, so an external outage never blocks anyone.
- **Before publishing, run it with `--require-reviews`.** That run fails on invalid links, and on permanent or blocked links that have no `linkReviews` entry with decision `keep`.

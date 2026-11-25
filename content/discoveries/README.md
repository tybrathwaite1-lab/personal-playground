# Standalone discoveries

One JSON file per discovery, named `<id>.json`. These are discoveries that don't belong to a Weekly Drop edition: PR 2 of [ARCHITECTURE_ASSESSMENT_V2](../../collaboration/ARCHITECTURE_ASSESSMENT_V2.md), decision D-B (b).

The schema is the `DiscoveryRecord` type in `src/discovery/types.ts`. Validation lives in `src/discovery/validate.ts`, and the build is `scripts/discoveries/build.ts`, which runs as part of `npm run content` and `npm run build`.

## Status and publication

| Status | Meaning | Shipped? |
|---|---|---|
| `draft` | Still being verified, or has an unresolved source or factual problem | Never |
| `ready` | Verified and awaiting a publication decision | Never in `discoveries.json`; included in the unlisted preview file (below) |
| `published` | Public from `publishDate` (a New York date) | From that date, once a deploy runs |

The build writes `public/data/discoveries.json` through `publicDiscoveryFile` (`src/discovery/publish.ts`), a content publication boundary:
- **Records:** only those available on the build date by the discovery graph's own rule: published, on or after `publishDate`, no id collision. Sorted by id.
- **Fields:** an explicit allowlist, applied to nested objects and arrays too (credits, destination, sources, relations). `editorialNotes`, `linkReviews` and any unknown field never ship, whatever a record contains.
- **Relations:** only those whose target is available on the same date. A target can be a published standalone discovery, an item in a published Weekly Drop edition (as shipped in `public/data/drop.json`), or a thread node. Claims to drafts, ready or future records, unpublished Drop items, or ids that don't exist are left out, notes included. The source record keeps them, so they appear once their target is published.

This decides what the app's public data contains. It is **not** access control: everything committed to this public repository, drafts included, is public there.

### The unlisted preview file (PR 3)

Approved by the owner on 2026-11-25 ([proposal](../../collaboration/PR3_PREVIEW_PROPOSAL.md), option A). The same build also writes `public/data/preview/living.json` through `previewDiscoveryFile` (`src/discovery/preview.ts`), so verified records can be evaluated at `#/preview/living?d=<id>` before any publication decision.
- **Records:** `ready` records and available `published` ones, never drafts, and never a record with an unresolved link review (`replace` or `remove`). Statuses here are not changed.
- **Fields:** the public allowlist, minus `status` and `publishDate`. Editor-only and unknown fields never ship.
- **Relations:** only to other records in the preview file.
- **Readers:** only the preview route. `discoveries.json`, the Weekly Drop and every existing view are unaffected.
- **Visibility:** unlisted, not private. Anyone with the URL can read it, like everything on GitHub Pages, so only content that is publishable as is may become `ready`.

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
- **`image`**: optional. It is an id in the editorial image registry (`src/data/images.ts`). The entry's licence must be in the approved open-licence policy (`src/data/imageLicenses.ts`, the one list the registry type also uses), with credit, an https source and alt text. Leave the field out rather than use a placeholder.
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

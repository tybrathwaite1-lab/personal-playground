# PR 3: preview content mechanism (proposal)

**Status:** option A **approved by the owner** (2026-11-25), then implemented in PR 3. Written before implementation, as PR 3 §3 asks.

**One narrowing in implementation:** preview relations point only to other records in the preview file. No record relates to a Drop item or thread node today, so nothing is lost, and the preview stays self-contained.

## Why it needs a decision

The ten Edition 001 records are `ready`. The approved rules ([content/discoveries/README.md](../content/discoveries/README.md)) say a `ready` record is **never shipped**: `public/data/discoveries.json` holds only `published` records, and today it holds none.

The preview can only show those ten records on the deployed site if they ship somewhere. So any version you can open in a browser **changes the "ready: never shipped" rule**, even if their statuses stay the same. That's why this needs your approval before I build it.

## Proposal A (recommended): a separate preview file

Add a second generated file beside the public one, with its own rules.

**The file**
- It lives at `public/data/preview/living.json`. Like `discoveries.json`, it's built at deploy time and gitignored.
- Only the preview route reads it. The Drop, Discover, Home and every other existing view never load it, and a test enforces that.

**Which records go in**
- Records with status `ready` or available `published`, and nothing else. `seed-erosion-blocks` is a draft, so it stays out.
- Each record must pass strict validation and have no unresolved link review (`replace` or `remove`). That's the same bar as publishing, apart from the status.
- Statuses stay exactly as they are in `content/discoveries/`.

**Which fields go in**
- The same explicit field list as the public file, so `editorialNotes`, `linkReviews` and any unknown fields never ship.
- No `status` or `publishDate`, so a preview record can't be mistaken for a published one.

**Relations**
- A relation is kept only if its target is in the preview file, or is a published Drop item or thread node.
- The `strandbeest` → SEED relation therefore drops out, leaving 5 of the 6 authored relations.

**What stays the same**
- `publicDiscoveryFile`, `discoveries.json` (still 0 records) and the graph's availability rule don't change.
- The preview builds its graph from an in-memory copy in which eligible records count as available. The source files are never touched.

**What visitors see**
- The route is `#/preview/living?d=<id>`: lazy-loaded, linked from nowhere, kept out of the entry bundle, and robots-noindex while open.
- A quiet line on the page says the discovery is a preview and not yet published.

**What it means**
- Anyone with the URL can read these ten records. Both the deployed file and the repository are public, and the records already sit in the public repository.
- They're verified, credited and image-free, so they meet the "publishable as is" rule for previews (DECISIONS, 2026-11-24).
- To roll back, remove the route entry and the build step. No status changes are needed.

**Change to approved wording:** the README's `ready` row would read "Never in `discoveries.json`; included in the unlisted preview file."

## Alternative B: nothing deployed

The route ships, but production has no preview data, so it shows its calm "not available" state. The ten records appear only in tests, local development and screenshot evidence, which inject the data.

- **Upside:** no rule changes.
- **Downside:** you'd evaluate from screenshots only, not on your own phone.

## Not proposed

Changing statuses to `published`, or loading content from outside the repository.

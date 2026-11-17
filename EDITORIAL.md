# EDITORIAL.md — The Weekly Drop

*Worth exploring.* A small Friday magazine inside Personal Playground: music, film, games, art, streetwear, history, tech, odd websites and local finds. Archive-first, sourced, never in a hurry.

This guide covers how editions are structured, how to prepare one (for example with ChatGPT or another research assistant), how to validate and preview it, and how to publish it — **without touching application code**.

---

## 1. Where things live

| Path | What it is | Public? |
|---|---|---|
| `content/drop/editions/NNN-slug.json` | One file per edition | Yes — the repo and site are public |
| `content/drop/nodes.json` | The "Follow the Thread" library: artists, films, games, people, hardware… that items link to | Yes |
| `content/drop/edition.schema.json` | JSON Schema for an edition | Yes |
| `content/drop/template.json` | A starting template | Yes |
| `public/data/drop.json` | Built automatically from the above — don't edit | Generated |
| Your saves & reactions ("More like this", "Already know it", "Not my thing") | Private, in your synced personal data | **No** — never in the repo |

Editorial content is public; personalization stays private. Never put personal notes, locations or preferences in edition files.

## 2. The edition format

An edition is a JSON object. Required fields:

- `schemaVersion`: always `1`
- `issue`: whole number, **unique and never reused** (stable issue numbering)
- `slug`: kebab-case, e.g. `"after-hours"`
- `title`, `theme` (one line), `intro` (2–4 sentences)
- `status`: `"draft"` | `"scheduled"` | `"published"`
- `publishDate`: `YYYY-MM-DD`, America/New_York. Normally a **Friday**.
- `featured`: the `id` of the lead item
- `items`: 5–7 discoveries (minimum 3)
- `corrections` (optional): `[{ "date": "YYYY-MM-DD", "note": "What was fixed" }]`

Each item:

| Field | Notes |
|---|---|
| `id` | kebab-case, **unique across all editions forever** — saves and threads point at it |
| `column` | `listen` · `screen` · `select-player` · `blackbook` · `fit` · `archive` · `lab` · `rabbit-hole` · `local-find` · `reset` · `wildcard` |
| `format` | `brief` (~40–100 words) or `feature` (~300–700 words) |
| `title`, `dek`, `body[]`, `why` | `body` is an array of plain-text paragraphs. No HTML. `why` = why it might land for the reader |
| `freshness` | `archive` (from the past — labelled so) · `timeless` · `contemporary` · `emerging` |
| `depth` | `accessible` · `lesser-known` · `obscure` |
| `year` | Required for `contemporary`/`emerging` so recency is checkable |
| `sources[]` | At least one: `{ label, url (https), kind, verifiedAt }`. `kind`: official · reference · archive · press · listen · watch · read |
| `related[]` | Optional thread links: `{ to, relation, note, basis }` — `basis` is `fact` (documented) or `editorial` (our pairing) |
| `local` | Optional `{ placeId }` or `{ communityId }` tying the item to the Local Playground |
| `image` | Optional image id from `src/data/images.ts` |
| `tags`, `creators`, `exploreMinutes` | Optional helpers |

Valid ids for `local.placeId` and `local.communityId` are in `src/data/places.ts` and `src/data/communities.ts`.

## 3. Editorial rules

- **Never fabricate.** Every factual claim needs a source a reader can open. No invented quotes, dates, releases or events.
- **Archive ≠ new.** Old things are labelled `archive`. Only call something `contemporary` or `emerging` if a dated source shows it's recent, and set `year`.
- **Fact vs. recommendation.** Thread links marked `fact` must be documented (e.g. "scored by"). Comparisons and pairings are `editorial`.
- **Reference points, not repeats.** The reader's favorites are doorways to adjacent, less-obvious things, not recommendations. Those favorites live in your private **reader notes** (Editorial desk), never in this public repo — and the published text shouldn't name them as the reader's ("your favorite film"), because the site is public.
- **Voice:** a knowledgeable friend who loves underground culture. No clickbait, no hype, no motivational lines.
- **Guidelines, not quotas:** roughly half archive/nostalgia, a third timeless, some contemporary; mostly lesser-known, some accessible, a few obscure; mostly briefs plus one feature.

## 4. Preparing an edition with ChatGPT (or any assistant)

The easiest way: open **The Weekly Drop → Editorial desk → Prepare issue N with an assistant**. Fill in your private reader notes once (they sync between your devices), tap **Copy prompt**, and paste it into the assistant along with `content/drop/edition.schema.json` and one existing edition as an example. The issue number and Friday date are filled in for you.

Or paste this generic version yourself:

> You're the editor of "The Weekly Drop", a personal culture magazine. Prepare issue **N**, titled "**…**", theme "**…**", publishDate **YYYY-MM-DD** (a Friday), status "draft".
> Research real things only. For every item give working https sources you have verified, and set `verifiedAt` to today. Label old material `"freshness": "archive"`; only use `contemporary`/`emerging` with a dated source and a `year`.
> Write 5–7 items across different columns, one `feature` of 300–700 words and the rest `brief`s of 40–100 words, plain text paragraphs. Include `why` for each. Add `related` links (mark documented ones `"basis": "fact"`, comparisons `"basis": "editorial"`).
> Output **only** valid JSON matching the attached schema — no commentary.

Then **check its sources yourself**. Assistants can produce plausible-looking but wrong links and facts; the validator checks structure, and CI checks that links respond, but only you can confirm a claim is true.

## 5. Validate and preview (no code)

1. Open the app → **The Weekly Drop** → **Editorial desk**.
2. Paste the JSON or upload the `.json` file → **Validate**.
   - Errors (red) must be fixed before it can publish. Each one names the exact field, e.g. `items[2].sources[0].url — must be an https URL`.
   - Notes (grey) are advice — word counts, non-Friday dates, unknown image ids.
3. **Preview it here** shows the edition on this device only, marked *Preview*. Clear previews from the desk.

## 6. Publish

The simplest way, entirely in the browser:

1. Go to the repository on GitHub → `content/drop/editions/`.
2. **Add file → Upload files** (or **Create new file**) named like `009-your-slug.json`.
3. Set `"status": "scheduled"` and the Friday `publishDate`.
4. **Commit to `main`** (or open a pull request if you want the branch check to run first).

What happens next:

- The deploy workflow validates every edition. Invalid editions are **left out** (the site keeps working) and the errors are printed in the Actions log.
- The site rebuilds automatically on every push **and every morning**. A scheduled edition appears on its `publishDate` (New York time) — no manual step on Friday.
- Drafts (`"status": "draft"`) are never shown in the app.

Run the same checks locally with `npm run content` (strict validation) and `npm run links` (link check).

## 7. Corrections

- Fix the text or source in place, keep the same `issue`, `slug` and item `id`s, and add a `corrections` entry describing the change. The note is shown under the edition intro.
- Never renumber an issue or change an item `id` after publishing — saves and threads depend on them.
- To retract an item, remove it and add a correction note.

## 8. Thread library (`content/drop/nodes.json`)

Nodes are lightweight entries for things items link to but that don't have their own article: `{ id, title, type, year?, summary, url?, related? }`. `type` is one of artist · album · game · film · anime · manga · brand · designer · person · studio · event · website · project · hardware · movement · book. Node ids must not clash with item ids. The thread view shows links in both directions and explains each connection.

## 9. Automated candidates (stage B)

`scripts/drop/candidates.ts` runs during each daily build and reads a short list of permitted RSS/Atom feeds (see `src/data/candidateFeeds.ts`). It normalizes titles, links and dates, removes duplicates and anything already published, checks each link responds, and writes `public/data/candidates.json`. The Editorial desk shows these as **unreviewed leads** — they are never published automatically and never mixed into editions. Use them as research starting points.

No paid AI service is used. If you later want automated drafting with an AI API, that needs an API key stored as a GitHub Actions secret and a paid account — ask first; it isn't set up.

## 10. Cadence

| What | When |
|---|---|
| Weekly Drop | Appears Friday (by `publishDate`, New York); the site rebuilds daily ~5–6 a.m. ET |
| Local Pulse | Daily refresh with the same build |
| Candidate leads | Daily, with the build |
| Link check | On every branch push (`Check (branches)` workflow), report only |

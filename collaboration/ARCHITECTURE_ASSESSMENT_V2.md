# Architecture Assessment V2: realising Creative Blueprint V2

**Status.** This is a read-only engineering assessment (Claude, 2026-11-24), written for independent review by ChatGPT and approval by the owner. It recommends; it authorises nothing. No application code, content model, navigation, Sync, workflow or dependency was changed to produce it. Phase 3.4 and all feature work stay on hold until a sequence is approved.

**Inputs:**
- [Creative Blueprint V2](CREATIVE_BLUEPRINT_V2.md), which is authoritative;
- [Editorial Strategy v1](EDITORIAL_STRATEGY_V1.md) and [Living Cover Specification v1](LIVING_COVER_SPEC_V1.md), where they are compatible;
- the [Experience Lab 06 reference](references/experience-lab-06/README.md): reconstructed images and a written description;
- the repository at **`main` `cb09027`**.

**How to read it.** Each finding is labelled:
- **Fact**: verified in the repository at `cb09027`, with the file named;
- **Assumption**: believed but not verified;
- **Recommendation**: engineering judgement, open to challenge.

---

## 0. Summary

1. **The relationship model the Living Constellation needs already exists.** It is the Weekly Drop's thread graph:
   - `DropRelation {to, relation, note, basis: 'fact' | 'editorial'}` in `src/types/drop.ts`;
   - `ThreadNode`, in `content/drop/nodes.json`;
   - "Follow the thread" (`ThreadPanel` in `src/pages/Drop.tsx`), an accessible, list-based explorer. It has a retraceable trail, recentring, incoming and outgoing links, and "Documented" and "Our pick" labels.

   That is already Levels 2 and 3 in their non-visual form. **Recommendation:** build the constellation on this, not beside it.
2. **The Drop item is the nearest thing to the blueprint's "discovery".** Drop items have:
   - creators and a year;
   - sources, each with a kind and a `verifiedAt` date;
   - freshness and tags;
   - an image slot;
   - stable ids ("stable forever").

   Experiences, places and websites are activity or utility records without attribution fields. **Recommendation:** a staged hybrid. First, a small read-only `Discovery` view built over Drop items and thread nodes. Only later, and only if needed, a canonical record. No migration of existing models.
3. **Content and image rights, not code, are the critical path.**
   - No Drop item has an image today: 0 of 48.
   - The image policy allows only free-licensed Wikimedia Commons files, self-hosted at build time (`src/data/images.ts`, `scripts/images/fetch.ts`). Most of Lab 06's imagery fits that policy. Album artwork such as *Modal Soul* almost certainly does not.
   - How copyrighted cultural imagery is handled is a product and legal decision, and it should come first.
4. **Build the first visitor experience as a hidden preview route.** Slice 02 used this pattern: `#/preview/...`, code-split and isolated. It means:
   - no navigation change;
   - no change to Home;
   - reversible by deleting a folder.

   Promotion to the real cover and navigation is a separate, later approval, after visitor testing. A hidden route is *unlinked, not access-controlled*: anything in it is publicly reachable (B4, "Visibility").
5. **Do not build yet:**
   - a canonical content migration;
   - the editorial automation pipeline;
   - multi-personality support;
   - persistent exploration history;
   - interest-personalised supporting discoveries;
   - per-atmosphere cover components;
   - a graph library.

   None is needed to validate the experience.
6. **Conflicts to settle.** Two need owner decisions before building:
   - the image-rights policy;
   - "My Finds" and "My Collection" naming against the existing saved kind `'discovery'`.

   Two were settled in independent review (2026-11-24, §5):
   - The existing product pillars and tools stay alongside the new experience pillars: Go Somewhere, Do Something and Discover Something, with local discovery, Pulse and the outing tools.
   - The existing optional Mood filters stay unchanged for now. Their future UX review is a separate decision (D-M).

   Two are engineering gaps to close inside the slice:
   - thread nodes are not schema-validated;
   - link checks are report-only.

   One small security-maintenance candidate is recorded separately (B10, D-N).

---

## 1. Repository state and verification (pre-flight)

**Facts.**
- **`main` is at `cb09027`:** "Docs: preserve creative direction v1; record Phase 3.3 production check (#53)".
  - PR #53 was merged at 18:59 UTC on 2026-11-24.
  - Its tree is byte-identical to the reviewed head `95cde85`.
  - No open PRs other than this one.
- **Post-merge runs on `cb09027`:**

  | Workflow | Run | Result |
  |---|---|---|
  | Deploy to GitHub Pages (push) | 45465483258 | ✅ Smoke `--expect-commit cb09027` passed ("deployed commit cb09027") |
  | Deploy (scheduled, 20:40 UTC) | 45483038065 | ✅ Same commit |
  | Visual check | 45465483391 | ✅ |
  | Style guide evidence (strict) | 45465483285 | ✅ 0 findings |
  | Publish visual results | 45466185208 | ✅ `visual-results` `main` folder at `cb09027` |

- **Default screenshots:** `main`'s published screenshots are identical to Phase 3.3's reviewed head (`compare-published.ts`, 49/49 identical).
- **No changes since PR #53** affect this assessment.
- **Base for this work:** `cb09027eba0446247f166040200492ba380854ea`.

---

## 2. Current architecture: what exists (facts)

| Area | Representation | Notes |
|---|---|---|
| App | React 18, Vite, Tailwind 3 PWA on GitHub Pages; a hash router (`src/hooks/useRoute.ts`) with 12 named routes and 2 hidden previews (`styleguide`, `preview/make-it-yours`) | Unknown paths fall back to `home`. Previews are code-split, and the style guide check asserts they stay out of the entry bundle. |
| Dependencies | Runtime: react, react-dom, leaflet, lucide-react, four `@fontsource` packages | No graph or animation libraries. |
| Drop editions | `content/drop/editions/*.json` (8 editions, 48 items, 6 per edition). JSON Schema `content/drop/edition.schema.json`. Validated by `src/utils/dropValidate.ts`; built by `scripts/drop/build.ts --strict` (blocking in Check) into `public/data/drop.json` | Only 2 editions are visible today (`publishDate` ≤ today); 6 are scheduled through 2027-01-01. Drafts are never shipped. Scheduled editions *are* in the public JSON, filtered client-side by `visibleEditions`. |
| Drop item | `DropItem`: id ("stable forever"), column (11-value enum), format, title, dek, body, why, freshness (`archive`, `timeless`, `contemporary`, `emerging`), depth, year?, creators?, tags, sources (`{label, url, kind, verifiedAt}`, https enforced), image?, related?, local? | 37 archive and 11 timeless. 32 items have creators, 25 have relations, **0 have images**. No `wildcard` items yet. |
| Thread nodes | `content/drop/nodes.json`: 37 `ThreadNode {id, title, type (16 values), year?, summary, url?, related?}` | **Not schema-validated.** Only id collisions are checked (`validateLibrary`). URLs aren't checked for scheme (all 37 are https today). No sources, `verifiedAt` or creators. |
| Relations | `DropRelation {to, relation, note, basis}` on items and nodes. 65 in total: 56 documented, 9 editorial; 46 point to nodes, 19 to items; 8 reciprocal pairs | Dangling targets are *warnings* ("doesn't exist yet"), not errors. There's no check for self-links or duplicate targets. With only visible editions, 31 of 65 relations are usable and 14 nodes are isolated. |
| Thread UI | `ThreadPanel` in `src/pages/Drop.tsx`: a modal dialog, trail breadcrumbs (`nav aria-label="Trail"`), recentre, back to the article, incoming links computed by scanning, `maxDepth = 6`, "already on your trail" items not clickable, `basis` shown as "Documented" or "Our pick" | The trail is in-memory React state, lost when the panel closes. Node `url` is rendered as an `href` without `isSafeUrl`; item source URLs are validated as https. |
| Experiences | `src/data/experiences.ts`: 64 seed `Experience` (activity ideas: cost, duration, energy, moods, company, environments, interests, links?) plus private `customExperiences` | No creator, source or date. 17 have links. |
| Places | `src/data/places.ts`: 33 `Place` with `VerificationStatus` (`verified`, `check`, `placeholder`), `verifiedOn`, coords with provenance | Local (Tampa Bay). Plus private `customPlaces`. |
| Websites | `src/data/websites.ts`: 14 `Website {category: WebsiteCategory (8 values), tags?}` | Plus user websites and edited copies. |
| Pulse events | `src/types/pulse.ts`, ingested at deploy (`scripts/pulse/ingest.ts`) into `public/data/pulse.json` | Time-sensitive, with start and end dates. |
| Curated editions | `CuratedEdition {experienceIds, sequence…}` (8) | Already reference-based. |
| Images | `src/data/images.ts`: 39 Commons images, free licences only (CC0, PD, CC BY, CC BY-SA), each with credit, licence and alt. Downloaded and converted to WebP at build (`scripts/images/fetch.ts`, cached in Deploy). `EditorialImage` and `Credit` components | No runtime third-party image requests. The image scout is an isolated maintainer tool, with `image-scout-results` preserved. |
| Saved items | `PersonalData.saved: SavedItem {id, kind, refId, title, subtitle?, note?, url?, savedAt}`. 9 kinds, including `'drop'` and **`'discovery'`, which means a link the person added themselves** (`Collection.tsx`, `DiscoveryForm`) | Synced (personal data `version: 1`). Older versions keep unknown entry kinds only on the remote, not locally or in backups (`tests/sync-forward-compat.test.ts`). |
| Collection | `#/collection`, "My Collection": the personal saved shelf, filtered by kind | The blueprint's "Collection" is the *public library*. |
| Feedback | `PersonalData.feedback`; `applyFamiliarity` (`src/utils/novelty.ts`) always hides "Not for me" in Pulse; the Drop only sorts it last | No counts, scores or streaks (`FeedbackBar`). |
| Home cover | `src/pages/Home.tsx`: "Today's pick" is `seededShuffle(experiences, dailySeed())[0]`. The pool includes private custom experiences and is filtered to indoor when `weatherAware` and the weather is bad. Also: date line, Drop teaser, a local window from Pulse, "Your space" with "Field Notes (n)", "Go wander" | The Living Cover surfaces are fixed Newsstand colours, shifted by the time-of-day atmosphere (D5). |
| Appearance | `src/appearance/*`, `useAppearance`, a pre-paint script in `index.html`, `src/styles/atmospheres/{tokens,shell}.css` | Device-local, outside Sync. Shell only. Every atmosphere colour set is contrast-tested against all page pairs. |
| Prototype | `src/prototype/make-it-yours/` with **three separate look components** (`Studio.tsx`, `QuietRoom.tsx`, `Underground.tsx`) | Isolated. A counter-example for production (§B9). |
| Mood | The Discovery Engine dial "01 Mood" and Plan an Outing "Mood" chips (`src/utils/labels.ts`, `src/pages/Plan.tsx`), both optional; the `Experience.moods` field | Bears on blueprint §10 and §14. |
| CI | Check: lint, unit tests, strict content validation; link check *report-only* (`continue-on-error`). Visual check: protected harness (`HARNESS_PATHS`). Style guide evidence: strict, axe, findings fail. Deploy: images, candidates, Pulse ingest, build, smoke | The entry bundle has no size budget; prototype and style guide chunk isolation is asserted. |

---

## B1. Content architecture

**Findings.**
- **Fact:** Discovery-like content exists in four disconnected shapes:
  - Drop items, which are rich and attributed;
  - thread nodes, which are thin, unattributed and unvalidated;
  - websites, which are thin;
  - experiences and places, which are practical rather than cultural.

  Only Drop items meet the blueprint's discovery definition (§06) today.
- **Fact:** Drop items live *inside* editions. An item's visibility is tied to its edition's publish date. A discovery that isn't in any edition, such as Lab 06's deep-ocean or ceramics features, has no home except as a thin node.
- **Fact:** ids are stable and unique across items and nodes (`validateLibrary`). Saves, feedback and relations already point at them.

**The three options.**

| | Adapter only | Canonical discovery model | Staged hybrid (recommended) |
|---|---|---|---|
| What | A `Discovery` read interface and pure functions mapping `DropItem`, `ThreadNode` (and later `Website`, `Place`) into it | One new content type that everything migrates into | Adapter first. Then a small additive *standalone discovery* content file for things that aren't Drop items. Migrate nothing. |
| Changes to existing models | None | Every model, saves, feedback, Sync and the Drop | None at first. Later optional additive fields, which need approval. |
| Risk | Low | High: data migration, Sync, the editorial workflow | Low, then moderate when content is added |
| Gap | Can't add discoveries that aren't Drop items without misusing editions or nodes | — | Solved by the standalone file |
| Reversibility | Trivial | Hard | Easy: delete the adapter and the file |

**Recommendation: a staged hybrid.**
1. A pure `Discovery` view model in its own module:
   - `id`, `title`, `subject` or `creators`, `year`;
   - `kicker` (a topic label), `context` (the dek, or a summary);
   - `lookCloser?`, `image?`;
   - `sources[]`, `primaryUrl?`;
   - `relations[]` (normalised in both directions);
   - `availability`.

   It needs adapters from `DropItem` and `ThreadNode` only.
2. For the slice's discoveries that aren't Drop items, choose one, as an **owner and reviewer decision**:
   - **(a)** additive optional fields on `ThreadNode` (sources, creators, image, `lookCloser`, kicker), with node validation added;
   - **(b)** a new `content/discoveries/*.json` with its own schema, using the Drop's `DropSource` and `DropRelation` types.

   I lean toward **(b)**. Nodes would stay as lightweight "thread library" stops, and discoveries would get full validation from day one without changing what nodes mean to the Drop. Either way, ids share one namespace and are checked for collisions.
3. Websites, places and experiences get adapters only when a slice actually needs them. Pulse events stay out of the constellation: they're time-bound and expire.

---

## B2. Relationship architecture

**Can existing structures be reused?** Yes. `DropRelation` already covers:

| Need | Existing | Gap |
|---|---|---|
| Stable ids | ✅ item and node ids, collision-checked | Extend the collision check to the new discovery file |
| A description of why | ✅ `relation` (a verb phrase) plus `note` (one sentence) | The Lab 06 copy ("Nujabes helped shape its soundtrack") maps to `note` |
| Documented vs interpretive | ✅ `basis: 'fact' \| 'editorial'`, already shown as "Documented" or "Our pick" | The blueprint's "cultural, conceptual, unexpected" connection types are finer-grained. **Recommendation:** keep the binary `basis` as the trust signal, and optionally add a free-text flavour later. Don't build a taxonomy now. |
| Direction | Stored on the authoring record; `ThreadPanel` computes incoming links by scanning, and labels them "(from …)" | **Recommendation:** *traversal* may go both ways, so a visitor can reach A from B. *Meaning* stays exactly as authored: the source, the target, the `relation` verb, the `note` and the `basis`. An incoming link is shown from its author's point of view ("Nujabes → scored → *Samurai Champloo*", seen from the anime), never silently reversed into a different factual claim. If the reverse needs its own wording, it is authored as its own record. |
| Duplicates and self-links | ❌ not checked | Self-links: an error. **Duplicate claims** (same source, same target, same `relation`, same `basis`) are an error in `--strict` for discovery content. **Not duplicates:** a reciprocal record (B→A alongside A→B) or a second relation between the same pair with a different verb or basis. These can be independent, meaningful claims, each needing its own support, so they are kept. Today's 8 reciprocal pairs are valid. Display shows each record once, de-duplicating only *identical* records reached in both directions, and keeps every distinct claim and its note. |
| Dangling references | Warning only ("doesn't exist yet") | Keep warnings for the Drop's existing workflow. For relations a discovery shows, unresolved targets are filtered at render (already true: `itemById` resolves visible editions only) and reported in the build. |
| Archived or unavailable | ✅ partly: links to scheduled-edition items silently disappear | Make availability explicit in the adapter (`available` / `scheduled` / `withdrawn`). Never show a link to something the visitor can't open. |
| Editorial validation | Item relations are checked for shape; nodes are not checked at all | Validate nodes (shape, https `url`) or move discoveries to (b) above. Also a test that every `fact` relation on slice content has a source on at least one end (**Recommendation**; editorial to confirm). Machines check form; whether a relationship is meaningful (blueprint §07: never manufactured) is an editorial review gate (B8). |
| Wider-neighbourhood traversal | `ThreadPanel` steps one hop at a time | A pure `neighbourhood(id, depth ≤ 2, limit)`: deterministic breadth-first traversal, sorted by (basis, then id), capped per ring. Unit-tested. |
| Determinism and testability | Data is static JSON; `ThreadPanel` is UI-coupled | Pull graph logic into pure functions with fixture tests, as with `src/utils/discovery.ts`. |

**Scale (fact).** The graph has 85 vertices and 65 edges. Of those, 31 edges are usable today, and 14 nodes are isolated. Scanning all relations on every render costs about O(E) and is fine into the low thousands. **Recommendation:** no graph database, service or precomputed index. If the graph grows past a few thousand edges, emit an adjacency map from `scripts/drop/build.ts`.

**Editorial risk (assumption).** With most of today's graph sitting in scheduled editions, a constellation built only from visible content would feel sparse. The slice needs its own small, densely and meaningfully connected set. That's editorial work, not engineering.

---

## B3. Living Cover integration

**Facts.**
- The current cover's lead ("Today's pick") is a **daily seeded shuffle** of all experiences.
- That pool **includes the owner's private custom experiences**.
- It is **filtered by a personal weather setting**.
- The date line and Drop issue are shown.
- Supporting areas: a local Pulse window (today or the weekend), the latest Drop, "Your space" (recent saves plus a Field Notes count) and "Go wander".
- The surfaces are fixed Newsstand colours varied by time of day (D5). The Living Cover at `data-home-area="cover"` is protected by tests (teal at 3 PM, preserved under every atmosphere).
- The Drop edition model (`issue`, `publishDate`, `status`, `featured`, `items`, `corrections`) is already a deliberate, reviewable, dated publication. Only the owner can publish, by PR.

**Compatibility.**
- **Lead:** the specs require a shared editorial lead, stable for about 5–7 days. A daily seed, a private pool and a weather filter all conflict with that.
- **Supporting:** "may respond to interests". Nothing personalises Home's supporting areas today; that is compatible and can wait.
- **Finite:** Home is already finite.
- **Refresh:** "no arbitrary reshuffling". The daily reshuffle *is* arbitrary.

**Recommendations.**
1. **Leave Home untouched** until the slice has been tested with visitors.
2. **A cover issue as content, not an algorithm. This is a first-slice simplification.** A small `CoverIssue {id, publishDate, status, lead, sections[{layout, discoveryIds[]}], interlude?, closing}`, referencing discovery ids, with the same draft, scheduled and published lifecycle and validator pattern as Drop editions.
   - Refresh then becomes an editorial act: a PR changing one section, or a new issue. That gives deliberate, auditable, layered change with no randomness.
   - The visitor sees the latest published issue; earlier issues become Editions by reference, as the spec requires.
   - **In the first slice, the whole issue is identical for everyone and not personalised.** That keeps the slice testable and deterministic. It is not the long-term design.
   - **The long-term approved approach stays:** one shared editorial lead, plus supporting discoveries that *may* be shaped by visitor interests (Living Cover v1; blueprint §05), always leaving room for surprise. Personalisation expands, never filters out (blueprint §10).
   - The model should leave room for that later. For example, supporting sections could be marked as eligible for interest-informed ordering, while the lead and at least one "unexpected" slot stay fixed. Nothing personalised is built until it is separately approved (P4).
   - **Atmospheres change how the issue is presented, never which discoveries are in it.**
3. **The shared lead never comes from private data or weather.** Private custom experiences and weather can keep informing the *local* window and the existing tools.
4. **Content-led layouts.** A handful of section layouts chosen per content shape, not per atmosphere:
   - `lead-wide` (photography, architecture);
   - `square` (album art, objects);
   - `pair` (two related objects);
   - `interruption` (its own surface, like the deep ocean);
   - `trio` (small discoveries);
   - `interlude` (type only).

   Five or six layouts cover the whole Lab 06 cover.
5. **The deterministic seed stays where it is** (Discover, Home's current pick) until Home is replaced. Don't reuse it for the cover.

---

## B4. Discovery experience

**Reusable today (fact):**
- `EditorialImage` and `Credit`: licensed, captioned, self-hosted images with alt text and a focus point;
- `Surface`, `Artwork` (duotone) and the `Annotation` graphic primitives;
- the `.ui-*` surface-aware controls, already contrast-tested;
- the `toggleSave` and `isSaved` store API;
- `isSafeUrl` and `normalizeUrl`;
- the `ThreadPanel` list, trail and basis labelling;
- `FeedbackBar` (no counts);
- the hidden preview route pattern, plus its chunk-isolation assertion in the style guide check;
- the Slice 02 hash-route step and history pattern (back and forward tested).

**Recommendations for the page:**
- **Route.** One route, `#/preview/living?d=<id>`, during the slice. `PREVIEWS` lists exact paths, so it needs one entry plus a `d` parameter. Each discovery is a history entry, so Back and Forward retrace naturally, and every discovery is linkable.
- **Order** (as in Lab 06):
  1. image;
  2. kicker, title, creator and year, context;
  3. **Keep this** (a toggle button with `aria-pressed`);
  4. **Look closer** (a `<details>`/`summary` disclosure, which needs no script);
  5. **"There are connections here."**: a list of up to three links. Each shows its reason in `note`, a "Documented" or "Editorial" label in text (not colour alone), and a link to that discovery;
  6. **Explore the wider constellation**, a button that opens the constellation (B5);
  7. **Visit the original**: a primary-source link (`sources[0]`, kind `official`, `listen`, `watch` or `read`) with `rel="noreferrer"` and the external-link convention.
- **Attribution.** Creators and year under the title; sources listed with `verifiedAt`; the image credit through `Credit`.
- **Atmospheres.** The page uses the semantic tokens, so it follows the shell's colour sets automatically.
- **Visibility.** A hidden preview route is **unlinked, not access-controlled.** Assumptions about deployment:
  - The site is a public GitHub Pages deployment of a public repository. Anyone with the URL can open the route, and its code, content JSON and images are public files. (The Drop's scheduled editions are already public in `drop.json` in the same way.)
  - Hash routes aren't separately indexed, but a link can be shared freely.
  - Therefore everything in the preview, including visitor-testing content, must be **publishable as is**: verified, attributed and properly licensed. No placeholder imagery of uncertain rights, no unreviewed copy, nothing private.
  - Drafts stay out of the build, as with Drop drafts.
  - Real access control would need infrastructure this project doesn't have, and isn't proposed.

---

## B5. Living Constellation options

| Option | Fit |
|---|---|
| **A list-first explorer** (`ThreadPanel` generalised) | Already accessible: buttons, a trail `nav`, text labels. It is the *non-visual alternative* the blueprint requires (§13). Works the same on every device. |
| **Native SVG, deterministic radial layout** (recommended visual) | The centre, an inner ring of direct relations and an optional outer ring for the wider view, with angles assigned by sorted id. No physics, so layout is the same on every render and every screenshot. About 150–250 lines; no dependency. |
| Canvas or WebGL | Not needed at this scale. Worse for accessibility. |
| `d3-force` or a graph library | Not justified. It adds a dependency and non-determinism, the graph has under 100 vertices, and the blueprint asks *not* to expose the whole graph. |

**Recommended minimal design: an initial proposal, not a fixed specification.** The numbers below (fixed angular slots, two rings, 6/12 caps) are starting values for the first implementation. They should be adjusted to whatever real titles and real devices show. Lab 06's illustrative geometry is a reference, not a requirement.
- The SVG is an *enhancement over the list*. Each node is a real `<a>` or `<button>` in DOM order, with a 44 px minimum target. Edges are decorative (`aria-hidden`). The list carries the relationship text, so screen-reader users get the same content.
- **Bounded:**
  - inner ring ≤ 6;
  - outer ring ("Expand") ≤ 12, with second-degree links only;
  - labels truncated with the full title in the accessible name;
  - collisions avoided by fixed angular slots, with the overflow listed below the SVG rather than drawn.
- **Recentre:** choosing a node navigates to that discovery (a history entry), and the constellation redraws around it.
- **Retrace:** a trail `nav`, as in `ThreadPanel`. Unlike `ThreadPanel`, visited items stay clickable, because the blueprint asks for free movement. Drop the hard `maxDepth`, which reads as a limit, and keep only a gentle note.
- **Reduced motion:** no animated layout. Any opening transition is opacity-only and disabled under `prefers-reduced-motion`.
- **Mobile:** the inner view sits inline. "Expand" opens a full-screen sheet with the list visible first and the SVG below it. No pinch-zoom or drag.
- **Atmospheres:** the constellation surface is a fixed, tested surface. Lab 06's dark green is a "constellation" surface token, like the Newsstand surfaces, so all nine colour sets don't need re-testing for it.
- **Performance:** at most about 19 nodes drawn, with neighbourhoods computed from static JSON. No concern at expected sizes.

---

## B6. Collection, My Finds and navigation

**Facts.**
- "My Collection" (`#/collection`) is the *personal* shelf over `saved`.
- The saved kind `'discovery'` already means "a link I added myself".
- Drop items are saved as kind `'drop'`.
- `saved` syncs. An older client keeps unknown kinds only on the remote, not locally or in backups.

**Conflicts.**
- The blueprint's **Collection** is the public library, and **My Finds** is personal. Today's "My Collection" is personal.
- "Discovery" as a product noun collides with the existing saved kind `'discovery'`.

**Recommendations.**
- **No data migration.** My Finds is a *presentation* of `saved`. "Keep this" on a Drop-backed discovery saves as kind `'drop'`: exists today, no Sync change.
- **Standalone discoveries** (option b in B1) need a saved kind. Options:
  - **(i)** a new kind such as `'find'`. Sync-additive and forward-compatible by the characterised behaviour: older clients keep it on the remote but don't show it.
  - **(ii)** reuse `'drop'` for all discoveries. Wrong semantics.
  - **(iii)** keep the slice's saves in memory only. That doesn't meet "simple saving and retrieval".

  **Recommendation: (i).** It touches the Sync data contract, so it needs separate approval. Tests would cover the round trip on this version and the remote-only behaviour on an older version.
- **During the slice:** the preview route gets its own small Collection (library) view and My Finds view. The existing "My Collection" and its navigation stay unchanged.
- **Renaming** "My Collection" to "My Finds" and adding a public Collection to navigation is a later **navigation approval**, after testing. Keep `#/collection` working: redirect or alias it, never break saved links.
- **Product rename to decide:** the internal saved kind `'discovery'` can stay as it is in data. Only its *label* ("Discoveries", meaning your own links) would change, for example to "Links I added".

---

## B7. Exploration continuity and privacy

| Option | What's stored | Where | How long | Syncs? |
|---|---|---|---|---|
| **URL and history (recommended)** | The current discovery id in the hash; each step is a history entry | The browser's own session history | Until the tab closes | No |
| In-memory trail (recommended, alongside) | The list of ids visited in this exploration | JavaScript memory | Until reload or tab close | No |
| `sessionStorage` (optional) | The same id list | Per tab | Until the tab closes | No. Survives reload. |
| `localStorage` | Exploration history | Per device | Indefinitely | No, but it is persistent history and **needs approval** (Living Cover v1: "a separate privacy and value decision") |
| Personal data (`saved` or a new field) | History | Synced repo | Indefinitely | Yes. **Not recommended.** |

**Recommendation.** Use URL and history plus an in-memory trail for the slice, and nothing else. This gives retracing (§07) with no new storage and no tracking. Optionally add `sessionStorage` so a reload keeps the trail; ask for owner approval first, since it is low-risk. Add no analytics.

---

## B8. Editorial operations

**Facts.** The pipeline today is already Git-native:
- **leads:** `scripts/drop/candidates.ts` reads permitted RSS feeds, keeps https links only, de-duplicates, writes `candidates.json` and never publishes;
- **drafting:** assistant prompts (`dropPrompt.ts`) and the Editorial Desk preview import, which is validated and device-only;
- **publishing:** a PR adding an edition JSON, with blocking strict validation, report-only link checks, the reviewer and the owner merging;
- **images:** Commons only, with licence and credit required and an isolated scout workflow.

**For the first slice (essential).** These are acceptance gates: slice content doesn't ship until each is met.
1. Hand-curated content: about 12 discoveries, the relations between them, sources, and images that pass the rights decision.
2. Validator coverage for the new discovery file:
   - shape and https;
   - id collisions;
   - duplicate relations and self-links;
   - `basis` required;
   - for `fact` relations, a source on at least one end.
3. **Links:** each source and original link in slice content is verified when added: a recorded `verifiedAt` date, plus a reviewer's check in the content PR. An automated check runs on just the new or changed content and reports failures in the PR.
   - A failing check needs a human decision: fix it, replace the source, or record why it's a temporary outage.
   - It shouldn't automatically block every publish, because external sites flake.
   - The repo-wide link check stays report-only.
4. **Image rights:** each image carries an `EditorialImageMeta` credit and licence that meets the approved rights policy (D-A). This is a hard gate, enforced by tests.
5. **Verified content:** facts in the context and `fact` relations trace to a listed source.
6. **Relationship quality:** every relation shown has a meaningful `note`, and is reviewed editorially as not manufactured (blueprint §07). This is a reviewer gate, not a test.

**Longer term (not prerequisites):**
- batch approval;
- relation proposals from the scout;
- autopublishing;
- pause controls.

Much of this is already provided by Git:
- **audit** is the commit history;
- **rollback** is a revert;
- **pause** is disabling a workflow or schedule;
- **approval policies** are branch protection and review.

**Recommendation:** extend the Git-native model when volume justifies it. Don't build a service.

---

## B9. Atmospheres and mobile

**Facts.**
- One shared token system (`atmospheres/tokens.css`) re-points the palette roles for nine colour sets. All 29 page pairs and 16 control states are contrast-tested for each.
- Shell styling attaches through `data-shell` hooks.
- The pre-paint script prevents a flash of the wrong look.
- The Newsstand surfaces are fixed.
- The Slice 02 prototype built three *separate* look components, which is the pattern to avoid.
- The protected Visual harness covers the standard routes. The style guide workflow, which isn't protected, records preview routes, atmospheres and axe as findings.

**Recommendations.**
- **One set of composition components** (the B3 layouts and the B4 page). Atmospheres change them only through tokens: colour; type pairings through `--shell-*`-style variables extended to the content; spacing and density through a few `--compose-*` variables.
- **No per-atmosphere component trees.** Where an atmosphere needs a different hierarchy, Lab 06's own example sets the scope: the deep-ocean section's surface or the size of the lead. Express it as a variable or a data attribute on the section.
- **Image-led sections** need contrast tests for any text over imagery. **Recommendation:** never set text over a photograph without a solid band, which Lab 06 already does.
- **The interruption and constellation surfaces** are fixed, tested surfaces, like the Newsstand.
- **Evidence:** add the preview's states (cover, discovery, constellation nearby and wide, My Finds, Collection) at 390 and 1280 px, in the default and the three atmospheres' default sets, to the style guide workflow, with axe, overflow and errors as findings. Leave `HARNESS_PATHS` alone.
- **Mobile:** CI only *emulates* phones. Real-device checks on iOS Safari and Android Chrome (the owner's own) should be a written checklist per slice PR. The Lab 06 mobile reference keeps the pair side by side and drops the rest to a single column; follow that.

---

## B10. Security, performance and operational stability

| Risk | Today (fact) | Recommendation |
|---|---|---|
| External imagery | Commons only, downloaded and self-hosted at build; no runtime image hosts | Keep. Add no hotlinked images and no third-party embeds (album players) without a separate decision: they bring tracking and CSP questions. |
| Source links | Item sources must be https (validator); `isSafeUrl` exists. `ThreadPanel` renders node `url` without `isSafeUrl`, and nodes aren't validated | See the maintenance candidate below. New discovery content gets URL validation from its first PR. |
| Untrusted editorial inputs | Candidates are https-filtered and rendered as text plus `href` on the Editorial Desk | Keep candidates out of any public surface. Anything scout-proposed enters only through a reviewed PR. |
| Graph traversal | One-hop UI scanning; static data | Pure, bounded, deterministic functions (depth ≤ 2, capped rings); no recursion over unbounded input |
| Local storage | Personal data, appearance, time-of-day atmosphere, Sync settings | No new persistent keys in the slice except possibly `sessionStorage` (B7) |
| Sync compatibility | `version: 1`, forward-compat characterised | Only an additive saved kind, if approved (B6), with tests mirroring `sync-forward-compat` |
| Dependency growth | 8 runtime dependencies | None needed. Native SVG. |
| Bundle size | No entry budget; preview chunks asserted separate | Keep the slice in a lazy chunk, and assert the entry excludes it, as for the prototype. **Recommendation:** propose an entry-size report in the style guide evidence; report-only to start. |
| Deployment and rollback | Pages deploy on `main` with a smoke check; a revert redeploys | The preview route makes rollback trivial: removing the route entry hides it. |
| Scheduled content in the public JSON | Scheduled editions ship in `drop.json` and are filtered client-side | Existing behaviour, not a security issue, but don't rely on client-side filtering for anything confidential. Draft discoveries must never ship, matching the Drop's draft rule. |
| CI safeguards | Strict content, lint, unit, browser and visual tests, strict style guide, action pins, protected harness | Don't weaken any of them. Each slice PR adds its own unit, browser and style-guide evidence. |

**Security maintenance candidate (separate from the slice; not changed in this PR).**
- **Finding (fact):** `ThreadPanel` (`src/pages/Drop.tsx`) renders `href={current.url}` for thread nodes without `isSafeUrl`, and `content/drop/nodes.json` isn't schema-validated.
- **Severity:** a hardening gap, not a confirmed exploit. All 37 node URLs are `https://` today, and nodes reach `main` only through reviewed PRs.
- **Proposed minimal fix,** as its own small reviewable PR:
  - validate nodes at build (required fields, `https://` URL), in `validateLibrary` or a `validateNode`;
  - render node links only when `isSafeUrl(url)` is true, otherwise omit the link;
  - add tests for both.
- **Behaviour today:** unchanged, because every existing URL already passes. It can land before or independently of PR 1, and needs its own authorisation.

---

## 3. The proposed sequence, evaluated

| Proposed stage | Assessment |
|---|---|
| 1. Creative consolidation | Done in this PR. |
| 2. Architecture assessment | This document. |
| 3. Discovery foundation | **Narrow it.** Build only what the slice reads: the adapter, the graph functions, and a validated standalone-discovery file. A "reliable representation" of everything would be the canonical migration that isn't needed yet. |
| 4. First complete visitor experience | **Keep it, but as a hidden preview.** Build it in this order: discovery page → constellation → cover → Collection and My Finds. The cover comes after the page because it is a composition of discoveries; building it first means designing layouts around content that doesn't exist yet. |
| 5. Expression and expansion | **Move after visitor testing.** Atmosphere-specific compositions and library growth should respond to what testing shows. |
| 6. Independent visitor testing | **Move before Stage 5,** and before promoting anything to Home or navigation. The preview URL can be shared with testers without touching production navigation. |
| (new) Content and rights | **Add it in parallel with, and ahead of, Stage 3.** The image-rights decision and curating about 12 discoveries are the real critical path. |
| (new) Promotion | **Add it after testing:** replace Home's lead, change navigation, rename the Collection. Each needs explicit approval. |

**Critical path:**

> Image-rights decision → curated slice content (about 12 discoveries, relations, sources, licensed images) → PR 1 (foundation) → PR 2 (content) → PR 3 (discovery page) → PR 4 (constellation) → PR 5 (cover) → visitor testing → promotion decisions

**Off the critical path:**
- PR 6 (Collection and My Finds views);
- `sessionStorage` continuity;
- an entry-size report.

---

## 4. Proposed PR sequence

Each is independently reviewable, and none is merged without review and owner authorisation.

### PR 1: Discovery foundation (pure code, no UI)

- **Objective:** a read-only `Discovery` view model and graph functions over existing content.
- **Scope:**
  - new module `src/discovery/`: types; adapters `fromDropItem` and `fromThreadNode`;
  - `relationsFor(id)`: both directions, de-duplicated, availability-filtered;
  - `neighbourhood(id, {depth ≤ 2, innerMax, outerMax})`: deterministic.
  - Not imported by any production route.
- **Dependencies:** none.
- **Affected:** a new module and new tests. Reads `useDrop` data shapes; changes no existing files.
- **Protected:** the Drop, the thread panel, every route.
- **Acceptance:**
  - deterministic output for fixtures;
  - unavailable (scheduled) targets are excluded;
  - duplicate and self links are collapsed or ignored;
  - bounds are respected.
- **Tests:** unit tests with fixtures, plus the real `content/drop` data, as a characterisation test.
- **Accessibility and visual:** n/a.
- **Risk:** minimal. Rollback by deleting the module.
- **Owner decisions:** none.

### PR 2: Slice content and validation

- **Objective:** the content the slice needs, safely validated.
- **Scope:**
  - option (b) `content/discoveries/*.json` with a schema and validator, built into `public/data/discoveries.json` (drafts excluded);
  - node validation (shape, https);
  - relation checks: duplicates, self-links, basis, and a source for `fact` relations;
  - new Commons images in `src/data/images.ts`;
  - a blocking or recorded link check for slice content.
- **Dependencies:**
  - the image-rights decision;
  - curated content from editorial (ChatGPT and the owner).
- **Affected:**
  - `content/`;
  - `scripts/drop/build.ts`, or a sibling build script;
  - `src/utils/dropValidate.ts`, for node validation;
  - `src/data/images.ts`;
  - `IMAGE_CREDITS.md`;
  - tests.
- **Protected:**
  - existing editions must stay valid unchanged;
  - Drop rendering;
  - the image pipeline.
- **Acceptance (gates):**
  - strict validation passes;
  - existing editions and nodes still pass, or the specific node fixes are listed;
  - every image meets the approved rights policy, with credit and licence (tested);
  - every source link is verified (B8, item 3), with any failing link resolved by a recorded human decision rather than an automatic block;
  - facts and `fact` relations trace to sources;
  - every relation passed editorial review for meaning (B8, item 6).
- **Tests:**
  - validator unit tests, including the failure cases;
  - `drop.test.ts` unchanged and passing;
  - an image credits test.
- **Accessibility:** alt text required on every image.
- **Visual:** none (no UI).
- **Risk:** tightening node validation could fail the build on existing nodes. All 37 have https URLs today, but run it first and report.
- **Owner decisions:**
  - (a) or (b) from B1;
  - the image-rights policy;
  - the slice's discovery list and relations.

### PR 3: Discovery page (preview route)

- **Objective:** Levels 1 and 2. A visitor can open a discovery, read its context, look closer, see up to three explained connections, visit the original and keep it.
- **Scope:**
  - `#/preview/living?d=<id>`, lazy-loaded;
  - a `DiscoveryPage` built from `EditorialImage`, semantic tokens, `<details>` for Look closer, the connections list with text basis labels, and Visit Original;
  - "Keep this" through `toggleSave` (kind `'drop'` for Drop-backed discoveries; standalone ones wait on the B6 decision).
- **Dependencies:** PRs 1 and 2. The B6 decision for standalone saves.
- **Affected:**
  - `src/hooks/useRoute.ts` (one preview entry);
  - `src/App.tsx` (one lazy branch);
  - a new folder;
  - `scripts/visual/styleguide.ts` (evidence).
- **Protected:**
  - all routes and navigation;
  - Home;
  - Sync;
  - appearance;
  - the entry bundle, which must exclude the chunk.
- **Acceptance:**
  - every discovery renders;
  - Back and Forward and reload work;
  - unknown ids show a calm not-found state;
  - Keep this round-trips through saves.
- **Tests:**
  - unit tests;
  - browser tests at 390 and 1280 px across the default and three atmospheres, including keyboard, reduced motion and page errors;
  - a chunk-isolation assertion.
- **Accessibility:**
  - axe clean;
  - `aria-pressed` on Keep;
  - headings in order;
  - the basis shown in text;
  - external-link conventions.
- **Visual:** style guide states in the default and three atmospheres, phone and desktop.
- **Risk:** low. Rollback by removing the preview entry. The route is public once deployed (B4, "Visibility"), so only gate-passing content may ship in it.
- **Owner decisions:**
  - the route name;
  - the "Documented" and "Editorial" labels;
  - the Look closer copy pattern.

### PR 4: Living Constellation (preview)

- **Objective:** Level 3. Explore, expand, recentre, retrace.
- **Scope:**
  - a list-first explorer generalised from `ThreadPanel`'s behaviour (a new component; the Drop's panel is unchanged);
  - a native SVG radial view with fixed slots;
  - Expand for the second ring;
  - recentring through navigation;
  - a trail.
- **Dependencies:** PRs 1 and 3.
- **Affected:** the preview folder, plus tests and evidence.
- **Protected:**
  - the Drop's "Follow the thread", which stays unchanged;
  - production navigation.
- **Acceptance** (verified with the slice's *real* titles, not placeholders):
  - layout is deterministic: same screenshot on every run;
  - labels stay readable at 390 and 1280 px, with no overlap or clipping that hides meaning, and the full title in the accessible name;
  - every relationship and its reason is reachable in the list alternative, by keyboard and screen reader;
  - touch targets are at least 44 px and usable on a phone, checked on the owner's real devices as well as emulation;
  - every node is reachable by keyboard and named;
  - there is no completion pressure.
  - The ring counts and slot geometry are starting values and may change to meet these criteria.
- **Tests:**
  - layout unit tests (no overlap within the slot model);
  - browser tests: keyboard traversal, recentring, Back, reload, a 390 px sheet, reduced motion (no animation).
- **Accessibility:**
  - SVG decorative edges are `aria-hidden`;
  - focus order follows the list;
  - 44 px targets;
  - the constellation surface is contrast-tested.
- **Visual:** nearby and wider states, at 390 and 1280 px.
- **Risk:** label collisions with long titles. Mitigated by truncation plus full accessible names.
- **Owner decisions:**
  - initial ring limits (adjustable);
  - whether visited nodes are marked.

### PR 5: Living Cover (preview)

- **Objective:** Level 1 entrance. A finite, content-led cover issue.
- **Scope:**
  - `CoverIssue` content and validator (B3);
  - the five or six section layouts;
  - "Surprise me", unrestricted across the published discoveries;
  - an ending with onward exploration.
- **Dependencies:** PRs 2 and 3.
- **Affected:**
  - the preview folder;
  - content;
  - a validator;
  - tests and evidence.
- **Protected:** Home, and the Living Cover tests at `data-home-area="cover"`, which stay unchanged.
- **Acceptance:**
  - in this first slice, the published issue renders identically for everyone, with no personal data and no weather. This is a deliberate simplification (B3); interest-shaped supporting discoveries remain the long-term direction;
  - drafts are never shipped;
  - each layout works at 390 and 1280 px;
  - the cover is finite.
- **Tests:** validator units; browser tests (keyboard, reduced motion, atmospheres, mobile order).
- **Accessibility:**
  - one `h1`;
  - images with alt text;
  - no text over photographs without a solid band;
  - the interruption surface is contrast-tested.
- **Visual:** the full cover at 390 and 1280 px, in the default and three atmospheres.
- **Risk:** layout overfitting to Lab 06 content. Mitigated by choosing layouts by content shape.
- **Owner decisions:**
  - the cover issue model;
  - the refresh cadence (Living Cover v1 says about 5–7 days);
  - the editorial ownership of issues.

### PR 6: Collection and My Finds (preview)

- **Objective:** retrieval. A predictable library and a simple personal shelf.
- **Scope:**
  - a preview Collection with search, topic and sort over published discoveries;
  - My Finds over `saved` (the slice's kinds);
  - the empty state as an invitation.
- **Dependencies:** PR 3, and the B6 kind decision.
- **Protected:** the existing `#/collection` (My Collection), its data and navigation.
- **Acceptance:**
  - predictable search and sort;
  - My Finds lists what was kept, with nothing to "complete".
- **Tests:** unit tests for search and sort; browser tests; Sync forward-compat tests if a new kind is approved.
- **Accessibility:** a labelled search and live result counts.
- **Visual:** standard evidence.
- **Risk:** naming confusion with My Collection while both exist. It only lives in the preview.
- **Owner decisions:**
  - the naming;
  - the new saved kind (a Sync contract change).

### Gate: independent visitor testing (blueprint Stage 6)

- Testers use the preview URL on their own phones and computers, with no introduction.
- The owner and ChatGPT run it.
- Engineering supplies the checklist and fixes defects.

### Later, each needing explicit approval

- **P1, promotion:**
  - replace Home's lead with the cover issue;
  - add Collection and My Finds to navigation;
  - alias `#/collection`;
  - a migration note for "My Collection".
- **P2, atmosphere-specific compositions:** variables only (B9).
- **P3, library growth and adapters:** websites, places, experiences.
- **P4, interest-informed supporting discoveries:** expanding, never filtering.
- **P5, editorial operations:** batch approval, relation proposals.

### Not to build yet

- A canonical content model or any migration.
- An editorial automation service, autopublishing or relation generation.
- Persistent exploration history, analytics or visit counters.
- A graph library, force layout, or a full-graph view.
- Multi-personality support. Keep identity strings in content where convenient, but build nothing for it.
- Third-party embeds (players, maps beyond Leaflet).
- Per-atmosphere component trees.
- Changes to the Drop, Home, the Discovery Engine, Plan an Outing, Pulse, the Local Playground or Sync. The existing product pillars and tools stay (§5, item 2).
- New mood profiling of any kind. The existing optional Mood filters stay as they are (§5, item 3).

---

## 5. Risks, dependencies and unresolved questions

1. **Image rights.** Recognisable cultural imagery (album covers, product photography, prints) is central to the Lab 06 feel. The current policy allows only free-licensed Commons images.
   - Options:
     - keep the policy, using typographic treatments for non-free works (`CoverArt` already exists);
     - allow some non-free images under a documented policy;
     - link-out cards.
   - This is a legal and product decision, not engineering. *Owner.*
2. **Local discovery's place.**
   - **Settled (review, 2026-11-24):** the existing *product* pillars stay. Go Somewhere (local discovery, Pulse, Local Playground), Do Something (experiences, Plan an Outing, the Discovery Engine) and Discover Something (the Drop, Digital) coexist with the blueprint's *experience* pillars (Living Cover, Living Constellation, My Finds). The blueprint doesn't authorise removing any of them.
   - **Still open:** how they're arranged in navigation once the new experience is promoted. *Owner*, as a navigation decision.
3. **Mood filters.**
   - **Settled (review, 2026-11-24):** the existing optional Mood filters in the Discovery Engine and Plan an Outing, and `Experience.moods`, are preserved for now, unchanged.
   - The new experience adds no mood questions and no mood profiling.
   - **Still open:** a future UX review of the existing filters against blueprint §10 and §14, recorded as its own decision (D-M).
4. **Naming.**
   - Should "My Collection" become "My Finds"?
   - Should the public "Collection" join navigation?
   - Should the saved kind labelled "Discoveries" (your own links) be relabelled?

   *Owner.* Navigation changes need separate approval.
5. **Content volume vs density.**
   - About 12 discoveries need enough documented and editorial relations to make the constellation feel alive.
   - Most of today's Drop graph is in scheduled editions, so it isn't visible yet.
   - Bringing editions forward is an editorial decision.
6. **Archive ratio.** Editorial Strategy v1 suggests about 60/40. The blueprint suggests a balance across archival, timeless, contemporary and emerging without quotas. Which guidance stands? *Owner.*
7. **Link verification as a gate.** Functioning links are "mandatory publishing gates", but the repo-wide link check is report-only.
   - **Recommendation:** verify links on new content when it's added, with the date recorded and reviewer confirmation, plus an automated check that reports failures in the PR.
   - A failure gets a human decision rather than an automatic block (B8, item 3). Flaky external availability shouldn't stop all publishing.
   - Image rights, verified content and relationship quality are hard gates (B8, items 4–6).
   - *Owner and reviewer.*
8. **Sync contract.** A new saved kind for standalone discoveries (B6). *Owner*, with a separate Sync approval.
9. **Real-device testing.** CI only emulates phones; the owner's devices are the real-device check. *Owner.*
10. **Multi-personality.** It is approved as a later capability, and the assessment deliberately doesn't design for it now. Confirm that's acceptable. *Owner.*
11. **The Lab 06 visuals are reconstructed.** The wider constellation's exact behaviour, the Look closer content, the trail UI and atmosphere variants of the cover aren't shown. Useful references to add before PRs 3–5:
    - the Look closer opened;
    - the trail after several steps;
    - the cover in Studio, The Quiet Room and The Underground;
    - the constellation on a phone;
    - Collection and My Finds.

---

## 6. Decisions requiring owner approval (consolidated)

| # | Decision | Needed before |
|---|---|---|
| D-A | The image-rights policy for cultural imagery | PR 2 |
| D-B | Standalone discoveries: (a) extend `ThreadNode` or (b) a new `content/discoveries/` (recommended) | PR 2 |
| D-C | The slice's discovery list, relations and sources (editorial) | PR 2 |
| D-D | The link-verification gate for new content: verified when added and reported automatically, with human resolution and no indiscriminate blocking | PR 2 |
| D-E | The preview route name, and the slice running as a hidden preview | PR 3 |
| D-F | A new saved kind for standalone discoveries (a Sync contract change) | PRs 3 and 6 |
| D-G | Initial constellation limits (proposed: inner ≤ 6, outer ≤ 12, depth ≤ 2; adjustable against real titles and devices) and whether visited nodes are marked | PR 4 |
| D-H | The `CoverIssue` model, refresh cadence and editorial ownership | PR 5 |
| D-I | Collection and My Finds naming, and the relabelling of "Discoveries" | PR 6, promotion |
| D-J | How the preserved product pillars and tools (local discovery, Pulse, outing tools) are arranged in navigation after promotion | Promotion |
| D-K | `sessionStorage` for the trail across reloads (optional) | PR 4 |
| D-L | Which archive-balance guidance stands | Content |
| D-M | A future UX review of the existing optional Mood filters (preserved unchanged until then) | Separate, not on the slice's path |
| D-N | The ThreadPanel URL hardening (B10) as its own maintenance PR | Independent |

---

## 7. Confirmation

No feature implementation or production behaviour change was made. This assessment and its PR change documentation only:
- `collaboration/*.md`;
- the Experience Lab 06 reference images and notes.

**Not touched:**
- application code;
- content models;
- navigation;
- Sync;
- owner tools;
- ranking and personalisation;
- security safeguards;
- publishing;
- appearance persistence;
- deployment configuration;
- dependencies.

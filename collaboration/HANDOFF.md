# Handoff

## Latest — Claude (engineering) → ChatGPT and owner, 2026-11-23 (Creative Slice 02 B2: The Quiet Room and The Underground)

Baseline: `main` at `ff89cc6` (B1 merged). This completes Creative Slice 02 as authorised for B2. It stays inside the prototype: production onboarding, the homepage, every route, personal storage, Sync, ranking, Pulse, the planner and the visual publisher's policy are untouched. No tracking, APIs or remote assets; no npm dependency (see the serif note).

### The two new looks

- **The Quiet Room** (warm, spacious, literary): one centred column in Newsreader, sentence case, fine rules instead of boxes, italic notes in one deep accent instead of badges. The arrival's ideas are a reading list (name beside its description, separated by hairlines) with every fourth idea set as a centred pull quote. Its sample idea reads like a short essay: an italic lede, the activities, the facts under a rule. Colour: Linen, Sage, Lamplight (dark). Type: Book serif (serif throughout) or Serif and sans (Plex Sans body).
- **The Underground** (expressive, tactile): the app's own editorial language pushed further. Anton nameplate, the cover on a different tested surface from the page with a torn paper edge, the cover star taped on at an angle with a stamp, and ideas as a pasted-up wall of cards on varied paper stocks and angles, some taped, the first set as a poster. Its sample idea is a spread: a poster panel, a taped note, stamped fact boxes. Colour sets are choices of tested surfaces (Newsstand, Daylight, Forest), so every pair is already proven. Type: Poster condensed (Anton) or Zine mono (Plex Mono).
- **Studio and the B1 journey are unchanged**, apart from the shared refinements below. The fallback style after Skip is unchanged too; per D3 it stays a default, never presented as a chosen look.

### Same product in every look

All three offer the same content (the same ten ideas, featured idea, cover lines), the same interactions (browse, sample idea, choose, interests, arrival, preview save, change look or interests), the same optional customisation (three colour sets, two type pairings) and the same accessibility checks. The browser test now compares all three arrivals and the fallback: identical landmarks, headings, destinations, actions, ideas and invitation; and no two looks may share a cover composition, heading face or page colour. A second test opens the same idea in each look and requires the same facts, each look's own layout and three different heading faces.

### Creative refinements (kept small)

- **Discovery variety:** three distinct idea presentations (Studio's colour cards, the Quiet Room's reading list with pull quotes, the Underground's taped wall) and three distinct sample-idea layouts.
- **Interest feedback on phones:** the sticky bar now leads with a large count ("3 of 10 match") beside the idea now leading the cover, with the full sentence (the one announced) below. The count gives a short pop when it changes, only when motion is allowed; the text change is the real signal.
- **A curious arrival:** one honest line under the ideas' introduction, from the data: "Short on time? Ten Quick Sketches takes 20–30 min. Or open whichever name makes you curious."

### The serif (D1)

Newsreader (Production Type, SIL OFL 1.1). Three Latin WOFF2 files (400, 400 italic, 500; about 70 KB together) are committed under `src/prototype/make-it-yours/fonts/` with the licence and a README recording their source (Fontsource's published files at a pinned commit, the same files as the `@fontsource/newsreader` 5.3.0 package), sizes and SHA-256 hashes. I used the files rather than the npm package because this environment couldn't reach the npm registry; it also means no dependency or lockfile change. Tests check the hashes, the licence, that only the prototype's CSS declares the face, that the app shell never requests it, and that the build emits exactly three Newsreader files outside the entry chunk. If you'd rather have it as the npm package, that's a small follow-up once someone can run `npm install`.

### Evidence

- Unit `tests/make-it-yours.test.ts` (10 tests): adds contrast for every Quiet Room colour set, the Underground sets as tested surfaces only, and the serif's provenance and isolation.
- Browser `browser-tests/make-it-yours.test.ts` (13 scenarios): the keyboard journey through all three looks, all-look functional equivalence (desktop and phone), the sample idea in each look, colour and type in each look, the serif loaded only by the prototype, plus B1's feedback, Skip, hash-route and isolation scenarios.
- Strict style guide: 19 prototype states at 390 and 1280 px (each look, its sample idea, interests and arrival; an alternative colour and type for each; the skipped arrival) with axe, overflow, broken heading words and page errors as findings; plus the serif bundle check.
- Mutations, each caught and restored: the serif declared from elsewhere, an untested Underground surface, one look reusing another's discovery layout, a type pairing that does nothing, and the Quiet Room losing its own cover.

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (Creative Slice 02 B1: Make It Yours prototype)

Baseline: `main` at `983a371` (Slice 01 merged). This implements Phase B1 of Creative Slice 02 as approved on 2026-11-23 (D1–D7 verdicts and three required refinements). It is a prototype, not production onboarding: the homepage, every existing route, personal storage, Sync, discovery ranking, Pulse and the planner are untouched. No dependencies, remote assets, tracking or APIs were added.

### What it is

- **Entry:** `#/preview/make-it-yours`, a second hidden preview beside `#/styleguide` (one entry in `PREVIEWS`, lazy-loaded in `App.tsx`, its own JS and CSS chunk). Nothing in the app links to it. It renders outside the app layout with its own header: the wordmark, a permanent "Prototype preview: nothing here is saved" label and Exit preview.
- **Journey:** browse looks one at a time (Studio first; The Quiet Room and The Underground are listed honestly as not built until B2), open a sample idea and come back, choose a look or skip, optionally pick interests, optionally adjust colour and type, and land in a populated Playground. There's no welcome screen, questionnaire, checklist or congratulations step.
- **The Studio:** IBM Plex Sans (lower-case, loose grid) or Plex Mono (the Typewriter pairing); flat overlapping shapes in four colours; cards of differing size and colour. Three curated colour sets (Poster, Sherbet, Night studio) × two type pairings, all contrast-tested. It shares no composition with today's style.
- **Skip (D3 as modified):** Skip records an explicit "no aesthetic preference". The arrival then shows the prototype's fallback style (today's app surfaces) and says so: "No look chosen. You're seeing the prototype's default style, not a look chosen for you." No look is inferred; colour controls appear only once a look is chosen.
- **Content:** ten fixed, real ideas from the curated catalogue, identical in every look; no Pulse, Drop, weather, dates or times. Twelve broad interests map to catalogue tags; three (Making things, Film, Sport) match nothing in the sample on purpose.

### The three required refinements

1. **Honest, meaningful interest feedback.** Each interest shows how many sample ideas it matches before it's picked ("3 sample ideas", "none in this sample"). Picking writes out what changed and why ("3 of 10 sample ideas match. Local History Adventure now leads the cover."), names the idea now leading the cover, and updates the cover preview; on phones this is a sticky bar so it stays in view. Zero matches say so plainly and leave the mix unchanged ("Nothing in this sample matches Film yet. The cover keeps a mix instead."). The arrival repeats it. No copy says "for you" or "recommended".
2. **Functional equivalence without identical composition.** The browser test compares what someone can do and find on the arrival in the Studio and in the fallback style (landmarks, the h1, h2 headings, every link destination, every action, the ten ideas, the featured idea, the one invitation) and separately requires the two to differ in cover composition, heading typeface, text transform and page colour. It does not compare DOM structure or heading positions.
3. **Hash-route steps.** The URL holds only where you are (`step`, the `look` in view, an open `sample`); choices live in memory. Tested: direct links to any step, Back/Forward through steps with choices kept in the same page, an idea opened from the arrival and closed by Back or the button, reload (choices are gone and a note says the preview keeps choices only while the page is open), a direct link to an idea (its Back button stays in the prototype), unknown parameters (fall back to the first look), and Exit (the real homepage, no prototype left in the page).

### Evidence

- Unit: `tests/make-it-yours.test.ts` (7 tests): sample and interest mapping, ordering, feedback wording, URL round trip and position-only keys, choices (Skip ≠ any look), contrast for all three Studio colour sets, and static isolation (no storage, app data, sync or network access in `src/prototype/`; only `App.tsx` and `useRoute.ts` refer to it).
- Browser: `browser-tests/make-it-yours.test.ts` (9 scenarios): keyboard journey (desktop and phone), interest feedback including zero matches, Skip, hash routes, functional equivalence (desktop and phone), colour and type, and isolation (every storage key byte-identical after a full journey with a preview save; no request leaves the origin).
- Strict style guide: new `prototype/` screenshots and checks for 8 states × 390/1280 (Studio look, an unbuilt look, colour open, a sample idea, interests, two Studio arrivals, the skipped arrival): axe, overflow, broken heading words and page errors count as findings; the bundle check requires the prototype to be its own chunk.
- Mutations, each caught and then restored: Skip inferring a look, focus return removed, a storage write added, a muted colour weakened, and zero matches no longer reported.
- Existing tests: two allowlists gained the new route, nothing else changed. `graphic-primitives` now expects two previews; `url-safety` trusts `placeHref` as a builder (it only ever returns `#/preview/make-it-yours?…`, asserted in the new unit test).

### Notes for review

- The sample discovery is a step (`&sample=`) rather than a modal, so Back closes it and the look styles it fully. Focus returns to the link that opened it.
- No editorial photos in B1: sample ideas use decorative shape art. Photos and credits can come with B2's Underground.
- The app's reduced-motion rule gives every property a 0.01 ms transition; the prototype turns transitions off under reduced motion so a change of look is instant.

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (Creative Slice 01: The Living Cover)

Baseline: `main` at `6e0fe78`. This implements Creative Brief v1 (approved 2026-11-23). It adds no dependencies, APIs, remote assets or tracking, and changes no route identifiers. Pulse, the planner, discovery, Sync, privacy and backup logic are untouched.

### Design walkthrough
- **The cover is a magazine cover, not a hero.**
  - **Nameplate:** "Personal Playground." in Anton is the identity. It runs on one line on desktop, sized to the column, so real content starts within the fold. On phones it stacks on two lines.
  - **Beside it:** the question "What sounds good today?" and the functional entry points ("What's on nearby", "Surprise me").
  - **Cover lines:** the magazine device of short teasers that promise what's inside. Here each one is a live way in: today's first Pulse listing, this week's Drop lead, and your saved count.
  - **Cover star:** today's featured experience, as a taped-down photo with a "Today's pick" stamp and a Save button. That makes the acceptance path (open → recognise → explore something real → save → return) one tap from the cover.
- **Atmosphere is the light in the room**, not a theme switch. Each state paints the cover and the Window band with already-tested surfaces:

  | Atmosphere | Cover | Window band | Glow |
  |---|---|---|---|
  | Morning | cream (fresh newsprint) | orange | mustard, high on the left |
  | Afternoon | deep teal | cream | mustard, high on the right |
  | After hours | editorial ink | teal | low orange lamp |

  A thin rule in the atmosphere's colour runs under the header on every page. Nothing else changes: text, links, order, features and data are identical, and a browser test proves it.
- **Deep teal** is new: `#0E3A3D`, the brief's "deep teal". Paper text is 11.4:1, muted 7.7:1, mustard accent and focus 7.7:1, and every surface-aware control state is checked by `design-tokens.test.ts`.
- **The five areas, using existing content only:**
  - **Cover:** described above.
  - **The Window:** Local Pulse, with a lead listing (saveable), then the rest, the recurring community and the place. Weather and the three quick-plan buttons stay.
  - **The Issue:** the existing Weekly Drop teaser.
  - **Your Space:** recently saved, plus Collection, Field Notes (with count) and Rediscover.
  - **Go Wander:** Do something, Plan an outing, Wander online and Somewhere nearby, then Pick a vibe.
  - The editorial names are section concepts. Visible headings stay plain ("Around St. Pete", "Recently saved", "Pick a direction").
- **Navigation (refined, not rewritten):**
  - an accent bar under the current desktop section;
  - a bar over the current phone tab;
  - the atmosphere selector also in the full menu;
  - closing the menu with Escape or × returns focus to the button that opened it.

  Routes, labels, the skip link, settings and backup access are unchanged.
- **Tradeoffs:**
  - **Featured experience moved to the cover:** it was lower on the page, so the cover has something real to save.
  - **"Discover something" path dropped from Go Wander:** it linked to the Drop, which now has its own area. Go Wander gained Plan, Digital and Local.
  - **Numbers dropped:** the paths aren't a sequence, so the 01/02/03 markers are gone.
  - **Secondary pages:** keep the Field Guide look; only the shared navigation changed.
  - **Selector placement:** on the cover (not in the header) to keep the header uncrowded on phones, and in the menu for every other page.
  - **Device preference:** the atmosphere choice is a per-device preference, not personal data, so it isn't synced or included in backups.

### Evidence
- **Unit tests:** `tests/atmosphere.test.ts` covers:
  - hour boundaries, with every minute of the day mapped once;
  - Auto vs manual;
  - storage that is missing, invalid, blocked or failing;
  - tested-surface mapping.

  The token, primitive and style-guide tests were extended for teal and the atmosphere section. A new guard checks that only the style guide imports the graphic index, which loads the Caveat face.
- **Browser tests:** 14 new scenarios, 41 in total.
  - **Atmosphere:**
    - Auto at 07:30, 15:00 and 21:45;
    - Auto changing at 11:00 without a reload (fake timers);
    - manual choice persisting across reloads and sections until Auto, with the keyboard arrows working, at desktop and phone widths;
    - styling only: identical text, links, headings, controls and stored data in all four states.
  - **Homepage:** every useful action kept, with the primary action above the fold, at desktop and phone widths.
  - **Acceptance:** save the cover star, reload, find it in Your Space and the Collection, at desktop and phone widths.
  - **Navigation:** the menu's atmosphere selector and focus return, at desktop and phone widths; visible active states.
- **Mutations:** 9 caught and reverted:
  - morning boundary moved;
  - Auto stored instead of cleared;
  - Auto never re-checking the clock;
  - choice not persisted;
  - atmosphere changing content order;
  - cover star unsaveable;
  - Go Wander path lost;
  - menu focus not returned;
  - an untested surface mapping.
- **Strict style-guide evidence:** the harness now also opens the homepage in each atmosphere at 390 and 1280 px. It runs axe (WCAG A/AA, all impacts), checks overflow, page errors and that the atmosphere was applied, and checks that the nameplate breaks no words and has 2 lines on phones and 1 line on desktop. Screenshots are in `atmosphere/<state>-<width>[-fold].jpg` in the `styleguide-<sha>` artifact.
- **Found and fixed during CI review:**
  - Importing the primitives through the graphic index put the Caveat face in the app entry; the strict check caught it, and the guard now prevents it.
  - The nameplate broke "Playground" on phones; it now has its own size, and the strict check above prevents a recurrence.
- **Revision 1 (creative review): typographic cover art.** The cover star's fallback used to be the generic dark striped placeholder. That fallback shows when the featured experience has no editorial photo or it fails to load, and in the style-guide build, which has no photos. It is now a **type cover** (`CoverArt`), built only from existing pieces:
  - **Surface:** a tested Newsstand surface, orange on the cream morning cover and mustard otherwise, with Grain and a CSS halftone dot field.
  - **Type:** the experience's first word set huge, sized to fit and refitted if a different font is showing, then the rest of the name.
  - **Details:** its interests, and its Japanese kicker (or 特集).
  - **Disclosure:** a "Type cover" label, so it is never mistaken for a photo of the thing.
  - **Accessibility and provenance:** one accessible name ("Typographic cover for …"). No images, so there is nothing to credit and no new sources.
  - **Other changes:** `EditorialImage` gains an optional `fallback` (other callers unchanged), and the cover's tape is now cream.
  - **Tests:** a new browser scenario (desktop and phone) forces the photo to fail and checks the type cover: its name, the disclosure, no stripes, the word fitting, and that it follows the atmosphere. Three mutations were caught: fallback removed, fit disabled, disclosure removed.
- **Limitations:**
  - Secondary pages still use the Field Guide controls, so only the cover and Window band follow the atmosphere.
  - The cover star's editorial photo can be a generic illustrative image when no subject-specific one exists (existing image rules).
  - Atmosphere screenshots are in the style-guide artifact, not on `visual-results`: the publisher's state set is fixed by its security policy and wasn't changed.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (R4 closeout: reliability closeout R1–R4 complete)

- **R4 merge:** PR #45 was merged at the approved head `784ad82` as `49136fa567c79b57da19b3931cdb1541f5cb64c4` (parents `7ee7698`, `784ad82`). Both required checks were green before merging.
- **Production verification on `49136fa`:**
  - **Deploy 45252119246:** build 320/320 tests, none skipped, failed, cancelled or TODO. The ingest wrote 121 events from 6/7 sources (spaa HTTP 403, 18 carried over; no "Previous snapshot: left out" line).
  - **Smoke:** passed against `49136fa` in ~13 s for the job, with `PipeWrap ×2` logged at exit again (an observation only).
  - **Visual check 45252119205:** "Visual and browser tests" 27/27, including all 6 GitHub Sync scenarios: first sync, conflict, rejected token or public repo, privacy/network recovery, disconnect race and repository-change race.
  - **Style guide evidence 45252119318:** 0 findings at 390 and 1280 px.
  - **Publish visual results 45253042152:** tied to `49136fa` (run 45252119205).
  - **Verify action pins:** didn't run, as it is path-filtered to `.github/**` and R4 changed no workflow files. The last run on `main` (45247566480, `183c395`) passed, and the pins haven't changed since.
- **Sync configuration and privacy safeguards:** unaffected.
  - **Stored configurations:** `parseRepo` is only called by the connect form (`SyncPanel`). Saved configurations are loaded by `loadConfig`, which was unchanged, so an existing connection keeps working.
  - **Unchanged safeguards:** `verifyRepo` (fail-closed privacy, push permission), conflict handling, stale-round checks and R3's reply validation.
- **Repository safeguards:** the ruleset "Protect main" is active with no bypass actors and requires `check` and `Visual and browser tests` (GitHub Actions 15368). `image-scout-results` is unchanged at `71efe69`.
- **Reliability closeout summary:**

  | Item | PR | Merge | Production-verified |
  |---|---|---|---|
  | R1: previous Pulse snapshot validation | #42 | `b06c203` | yes |
  | R2: production smoke reliability | #43 | `183c395` | yes |
  | R3: malformed GitHub responses | #44 | `7ee7698` | yes |
  | R4: strict repository-name parsing | #45 | `49136fa` | yes |

- **Outstanding issues (not part of the closeout, not acted on):**
  - **SPAA:** HTTP 403 since ~2026-11-18; carried listings down to 18 and slowly expiring. Suggested step: contact the publisher.
  - **Lowry:** intermittent "Not an iCalendar feed" earlier, healthy since; carry-over handled it correctly.
  - **R2 diagnostic:** `PipeWrap ×2` at smoke exit on every run, closed by the explicit exit. The historical 10-minute tail's root cause isn't proven.
  - **Backup UX:** a low-priority ambiguity; a valid backup stays offered after a malformed file is chosen.
  - **Candidate fetch:** reports "vghf fetch failed". This is not part of Pulse.
  - **Limitations already noted:** browser coverage is Chromium only; GitHub Enterprise hosts aren't supported.
- **Next:** stop here. The owner and ChatGPT will prepare and approve Creative Brief v1 before the next implementation PR.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (R4: strict repository-name parsing)

Baseline: `main` at `7ee7698` (R3 merged and verified in production). This is the last item in the reliability closeout.

- **R3 production verification:** PR #44 was merged at the approved head `f98e05d` as `7ee76987a4c908627f548a1fc3608e1e7b8ac793` (parents `183c395`, `f98e05d`).
  - **Deploy 45249024662:**
    - build: 318/318 tests;
    - the ingest wrote 121 events from 6/7 sources, with spaa returning HTTP 403 and 18 listings carried over;
    - smoke passed against `7ee7698`, with `PipeWrap ×2` logged at exit again.
  - **Visual check 45249024518:** 27/27 browser tests.
  - **Style guide evidence 45249024668** and **Publish visual results 45249586359** (tied to `7ee7698`) both succeeded.
  - **Unchanged:** `image-scout-results` is still at `71efe69`.
  - No sync tests were run against real data or credentials.
- **Issue confirmed** (M2-4 defect 3): `parseRepo` wasn't anchored at the start, so it guessed:
  - `https://gitlab.example/octo/repo` → `octo/repo`;
  - `https://github.com.evil.example/octo/repo` → `octo/repo`;
  - `https://github.com/octo/repo/tree/main` → owner `tree`, repo `main`;
  - `oc to/repo` → `to/repo`.
  - `verifyRepo` always limited the impact: nothing syncs unless the token can write to a private repo.
- **Fix:** `parseRepo` now accepts exactly these forms:
  - `owner/repo`;
  - a github.com URL: `https://github.com/owner/repo`, also with `http`, `www.` or no scheme, case-insensitive host;
  - `git@github.com:owner/repo`.

  Each may end in `/` or `.git`.
  - **Owner:** letters, digits and hyphens, starting with a letter or digit, at most 39. Older accounts that end in or repeat a hyphen are allowed.
  - **Repo:** `[A-Za-z0-9._-]`, at most 100, not `.` or `..`.
  - **Rejected:** everything else. That includes other hosts and look-alikes, extra path segments, queries, fragments, credentials, ports, spaces and empty parts. The form shows its existing "Enter the repository as owner/name" message.
- **Tests:** the old test with its loose-parsing characterization is replaced by:
  - 18 accepted forms;
  - 39 rejected inputs (incomplete, foreign or look-alike hosts, extra paths, query, fragment, credentials, port, invalid names, length limits);
  - `sameConfig`, unchanged.
- **Mutations:** 6 caught, each reverted:
  - URL host not anchored;
  - last two path segments taken;
  - owner rule loosened;
  - repo rule loosened;
  - any SSH host accepted;
  - query stripped instead of rejected.
- **Limitations:**
  - GitHub Enterprise hosts aren't supported (they never were intentionally).
  - Names that pass the format check still have to exist and pass `verifyRepo`.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (R3: malformed GitHub responses)

Baseline: `main` at `183c395` (R2 merged and verified in production).

- **R2 production verification:** deploy run 45247566445 for `183c395` succeeded.
  - The smoke step took ~1 s (job 16 s). It reported the deployed commit `183c395`, matching, and passed.
  - **Exit:** the process exited promptly.
  - **Open-resource diagnostics (recorded as an observation):** both runs of the new script against the live site logged `still open at exit (closed by exiting): PipeWrap, PipeWrap`: the informational Check run on 2026-11-23 and this deploy. These are pipes, most likely the parent/child process link from running under `npx tsx`, not HTTP sockets. The explicit exit now closes them.
  - **Root cause still not proven:** the historical ~10-minute tail wasn't reproduced, so this is consistent with, but not proof of, the old tail being held by those pipes or by kept-alive connections.
  - **Failure path:** failures still exit non-zero, with exit 1 for a stalled bundle locally and in the unit tests. The `timeout-minutes` limits (smoke job 10, informational Check step 5) are in the workflows on `main`.
- **Issue confirmed** (M2-4 defect 2). `readRemote`/`writeRemote` parsed reply bodies outside their error handling:
  - **Malformed 200** (a proxy's HTML page, `null`): escaped as a raw `SyntaxError`/`TypeError`.
  - **Read without a `sha`:** returned as usable content with `sha: undefined`. The next write is based on that sha, so it would have been sent without one.
  - **Write reply without the new `sha`:** returned `''` as if saved.
  - `verifyRepo` already failed closed on malformed replies (unchanged).
- **Fix** (`src/utils/github.ts`):
  - **`replyObject()`:** an unreadable or non-object reply is a typed `SyncError` (kind `network`), never a raw exception.
  - **`readRemote`:** requires a non-empty string `sha`. Content of the wrong type is "too large or unreadable" (`format`), as empty content already was.
  - **`writeRemote`:** requires the new file's `sha`. Otherwise it reports "GitHub's reply to the save couldn't be read, so it isn't confirmed. Nothing on this device was changed" (`network`).
  - **Effect of an unconfirmed write:** the round stops without applying anything locally and isn't retried as a conflict. The next round re-reads and reconciles (a write that did land is then merged as remote data).
  - **Unchanged:** privacy checks, conflict handling (409/422), stale-round checks and local-data safeguards.
- **Tests** (`tests/github-sync-utils.test.ts`): the two defect characterizations are replaced by 3 regression tests:
  - 8 malformed read replies are typed errors, and wrong-type content is a `format` error;
  - 9 malformed write replies are "not confirmed";
  - through `syncOnce`, an unconfirmed write stops the round with one write attempt and nothing applied.
- **Mutation evidence:**
  - Caught (4): read sha not required; write confirmation not required; parse errors escaping raw; unconfirmed write treated as a conflict.
  - Equivalent (1): accepting arrays or strings as replies is observably identical, because such replies have no usable `sha` and are rejected by the field checks with the same error. The object check stays as a clear first guard.
- **Limitations:**
  - An unconfirmed write may in fact have been saved; the next sync reconciles it.
  - The user sees an error for that round, by design: nothing is assumed saved without GitHub's confirmation.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-23 (R2: production smoke reliability)

Baseline: `main` at `b06c203` (R1 merged and verified in production).

- **R1 production verification:** deploy run 45240667175 succeeded.
  - The ingest wrote `pulse.json`: 121 events from 6/7 sources.
  - No "Previous snapshot: left out" line, so the live snapshot passed validation unchanged.
  - spaa: HTTP 403, 18 carried over (20 before; two more expired). lowry: read normally (5 in feed, 5 kept).
  - Smoke passed against `b06c203`. Visual 27/27; publish tied to `b06c203`.
- **Investigation:** across the last 42 deploy runs there are 26 completed smoke jobs (median 12 s). Two took ~10 min: 44382058317 (2026-11-18) and 44443334819 (2026-11-19).
  - **What happened:** in both, every check passed and "Production smoke check passed." was printed within ~1 s of starting. The process then stayed alive for 599.9 s and 599.7 s before the step ended, still successfully.
  - **So:** no request hung. Node didn't exit after the result was known.
  - **Likely cause:** 600 s matches undici's default `keepAliveMaxTimeout` (10 min), which points at kept-alive connections from responses whose bodies were never read (the bundle, `sw.js`, the manifest).
  - **Not reproduced exactly:** I couldn't reproduce the 10-minute tail locally (Node 22 here, Node 24 in CI; GitHub Pages not reachable from here).
  - **Reproduced locally (HTTPS stand-in server):**
    - the old script reported "✓ bundle … loads" and passed for a bundle whose body stalled after the first chunk, because "loads" meant headers only;
    - requests had no deadline, and the smoke job had no `timeout-minutes` (GitHub's default is 6 h).
- **Fix** (`scripts/smoke/prod.ts`, workflows):
  - `fetchFull()` reads every body in full under one deadline per attempt (`REQUEST_MS` 30 s), keeping the existing 3 attempts and back-off. A stalled body is now a failure that names the URL ("did not finish within 30s (3 attempts)"). JSON is parsed from the read text, and invalid JSON is reported as a failure.
  - After reporting, the script logs anything still open ("still open at exit …") as evidence if the tail recurs, then exits explicitly with 0 or 1. Exit codes and every assertion are unchanged.
  - The smoke job has `timeout-minutes: 10`, and the informational smoke step in Check has `timeout-minutes: 5`.
- **Tests:** `tests/smoke-fetch.test.ts`, against a local server on 127.0.0.1:
  - a complete body is read in full;
  - a 503 is retried;
  - a final 404 is returned for reporting;
  - a stalled body or a server that never answers fails within the deadline;
  - structural: one fetch, no unbounded body reads, explicit exit with the result code.
- **Local reproductions with the new script:**
  - **Slow server:** passed and exited in 1 s. It logged "still open at exit: TCPSocketWrap", the kind of handle that can keep Node alive.
  - **Stalled bundle:** failed after 106 s (3 × 30 s plus back-off) with exit 1. The old script passed this case.
- **Limitations:**
  - The exact 10-minute tail wasn't reproduced. The fix removes the likely cause and bounds the run regardless.
  - A failure inside a request still stops the remaining checks ("unexpected error …"), as before.
  - If the "still open at exit" line appears in production, it identifies what was holding the process.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-20 (R1: previous Pulse snapshot validation)

Baseline: `main` at `4c6d9be` (M2 closed). This is the first of four reliability-closeout PRs (R1–R4), done one at a time.

- **Issue confirmed** (M2-5's characterization):
  - `sourceResult` read `previous?.sources.find(...)` and `e.sourceIds.includes(...)` without checking the shape, and `loadPrevious` only checked that the file was JSON. So a previous `pulse.json` that is JSON but the wrong shape (no `sources` list, a top-level array, a `null` event entry) made the ingest log "Pulse ingest crashed" and write no `pulse.json` at all.
  - Separately, an event with an unreadable date never expires (`isExpired` is false for NaN), so it was carried over on every failing run.
  - The `--previous` URL fetch had no timeout.
- **Fix:**
  - `usablePrevious(raw)` (in `scripts/pulse/assemble.ts`) checks the previous file before anything is carried over:
    - **Whole file:** anything that isn't an object is treated as absent. A missing or non-list `sources`/`events` counts as empty, so the other list is still used.
    - **Events left out:** non-objects, and events without a string `id`/`title`, a readable `start` (and `end` if present), a boolean `allDay`, a non-empty list of `sourceIds` strings, or string lists for `tags`/`categories`.
    - **Sources:** entries without an `id` are left out, and an unreadable `lastSuccess` becomes `null`.
    - **Valid entries are returned unchanged.** Expiry, freshness, the horizon, stale marking and attribution are unchanged; validation only decides what is eligible.
  - `loadPrevious` validates through `usablePrevious`, logs what was left out (`Previous snapshot: left out …`) and has a 20 s timeout on the URL fetch.
- **Tests** (`tests/pulse-ingest.test.ts`): the defect characterization is replaced by 6 regression tests:
  - a valid snapshot is unchanged and carry-over is identical;
  - a missing or non-object file is treated as absent;
  - missing or non-list `sources`/`events` no longer stop the ingest, and the valid part is still used;
  - 15 kinds of invalid event entry are left out, while valid ones are carried over with their attribution (a shared listing is carried for each of its sources);
  - unreadable dates no longer live forever, and expiry still applies;
  - invalid source entries are left out and an unreadable `lastSuccess` is forgotten.
  - The far-future characterization stays.
- **Mutation evidence:** 7 local mutations, each caught and then reverted:
  - start, end, title or sourceIds not checked;
  - a missing `sources` list discards the whole file;
  - a bad `lastSuccess` is kept;
  - ingest skips validation.
- **End-to-end evidence:** local runs with mocked feeds, comparing the `main` ingest and this one:

  | Previous snapshot | `main` | This PR |
  |---|---|---|
  | Valid | `pulse.json` written | identical counts |
  | No `sources` list | crashed, no `pulse.json` | written; valid events carried |
  | A `null` event, an unreadable start, a missing `sourceIds` | crashed, no `pulse.json` | written; those three left out |
  | Top-level array | crashed, no `pulse.json` | written; treated as absent |

- **Production check (after merge):** the deploy reads the previous snapshot from production. I couldn't download the current Pages artifact here (the artifact storage host isn't allowed from this session), so the first post-merge deploy log is the check: no "Previous snapshot: left out" line is expected, and carried counts (e.g. spaa, lowry) should match.
- **Limitations:** the validator checks the fields carry-over and dedupe depend on, not every optional display field (`venue`, `geo`, `priceNote` …). Those come from our own earlier output, and the app already treats them as optional. Carried listings are still not held to the horizon (unchanged, characterized).

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-20 (M2-6: browser behaviour tests)

Baseline: `main` at `eaa636e` (M2-5 closed: PR #40 merged, closeout independently verified). This is the final planned M2 package. No new dependencies (Option A: the existing `playwright-core` and Chromium), no app changes, no new services or permissions.

- **What runs:** `npm run test:browser` runs 27 scenarios in 5 files under `browser-tests/`. It reuses the M2-1 runner (`scripts/test/run.ts --root browser-tests`), so the same integrity rules apply: every file discovered and run, nothing focused, skipped or TODO, no empty suite.
- **Harness** (`browser-tests/helpers/`):
  - **Build under test:** the production build in `dist/`, served locally under the production base path by the visual check's `serveDist`.
  - **Isolation:** each scenario gets a fresh browser context with its own storage (empty, or a synthetic seed through `storageState`) and service workers blocked.
  - **Time and randomness:** the clock is frozen at the visual check's time, Sat 2026-11-21 3 PM New York, with timers still running. Only the Plan a Day scenarios pin `Math.random`.
  - **Network:**
    - the visual check's synthetic Pulse and weather fixtures are served;
    - `api.github.com` is answered by an in-process fake (`fake-github.ts`) when a scenario has one;
    - every other off-origin request is aborted and recorded.
  - **Failures:** page errors fail the scenario. A failure saves a full-page screenshot and a text report to `browser-out/` and adds the same diagnostics to the error: URL, page and console errors, dialogs, blocked hosts and the fake GitHub's request log.
  - **Waiting:** there are no fixed sleeps; tests wait for observable conditions.
- **CI:** a blocking step, "Browser behaviour tests (blocking)", in the Visual check workflow, after the existing build and screenshots. Chromium is already installed there. Permissions stay `contents: read`. On failure the diagnostics are uploaded as the `browser-tests-<sha>` artifact (14 days).
- **Bounded execution (revision 1):**
  - each browser action or wait fails after 10 s (`ACTION_MS`);
  - each scenario fails after 60 s (`SCENARIO_MS`), with diagnostics;
  - waiting for a held GitHub request fails after 10 s and names the request it expected;
  - when a scenario ends, pass or fail, every hold is released and the browser context is closed;
  - the CI step has `timeout-minutes: 10`, inside the job's existing 30.
  - **Evidence:** with the pre-write privacy re-check temporarily removed from `syncRun.ts`, the disconnect race failed after 10.5 s. The error read: "Held request "pre-write privacy check of repository A" did not arrive within 10s". The diagnostics listed the fake GitHub's requests (the write went out without a re-check) and "Outstanding holds: … (never arrived)", with a screenshot. The other 5 sync scenarios still ran and the process exited after 15 s. The mutation was reverted.
- **Merge gate (revision 1).** The Visual check job now has the display name **"Visual and browser tests"**, and that is the check context to require.
  - **Why the rename:** its job id `capture` was shared with the Style guide evidence job, so every commit had two check runs named `capture`, and requiring "capture" would have been ambiguous. The job id is unchanged, so the workflow-security tests and the publisher are unaffected.
  - **How it runs:**
    - it reports through GitHub Actions (integration id 15368, the same as the existing required `check`);
    - it is triggered by `push` on every branch except `image-scout`, `image-scout-results` and `visual-results`, with no path filters and no job or step conditions, so documentation-only commits run it too;
    - it attaches to the PR's head commit exactly as `check` does.
  - **No indefinitely pending check:** a pull request from those three excluded branches, or from a fork, would never get the check. The existing required `check` has the same exclusions, and no PR has ever come from them. `cancel-in-progress` only cancels runs for older commits on the same branch.
  - **Failure propagation:** the browser step has no `continue-on-error`, so a failure fails the job. A probe branch demonstrated this in CI; see the PR for the run.
  - **Owner instructions:**
    1. Settings → Rules → Rulesets → **Protect main** → Edit.
    2. Under "Require status checks to pass", keep `check` and choose **Add checks**.
    3. Search for **Visual and browser tests** (it is listed once a commit has reported it, e.g. PR #41's head). Select it with source **GitHub Actions**.
    4. Leave "Require branches to be up to date before merging" off (as now), then **Save changes**.
    5. After saving, PR #41 should list "Visual and browser tests" as required and passing.
    6. Don't add `capture`: that name is now only the Style guide evidence job.
- **Coverage.** Assertions are about behaviour: URL, document title, the single `h1`, roles and accessible names, stored data, downloads and requests. They don't depend on CSS classes or layout.
  - **Navigation** (desktop 1280 px and phone 390 px):
    - every route opens directly and has its own title and heading; unknown routes show Home;
    - the desktop nav moves between sections, with back/forward and `aria-current`;
    - the phone tab bar works, and the full menu closes on Escape and after choosing a section;
    - the skip link focuses `<main>` without changing the URL or history;
    - Day plan → "Plan my day" → following a stop opens it in Discover → back.
  - **Persistence** (both widths): a new field note, a favorite, a saved site and a setting survive a reload. An older stored record loads, keeps its data, drops invalid entries and is upgraded to the current shape on load. A corrupted record opens an empty playground and the next edit saves cleanly.
  - **Backup and restore:**
    - export downloads `personal-playground-backup-2026-11-21.json` (frozen day), which never contains the sync token or repository;
    - erase → restore from that file;
    - merge keeps both devices' notes and survives a reload;
    - "Replace everything" asks first, and declining or cancelling changes nothing;
    - six malformed files (truncated, empty, plain text, another app's file, an array, `null`) each show an error, offer nothing to import and leave stored data byte-identical;
    - a legacy bare-data backup still imports.
  - **GitHub Sync** (synthetic token, fake GitHub):
    - the first sync uploads, keeps the legacy `settings` mirror and stores the token only under its own key;
    - pulling picks up another device's note and an older app version's single `settings` entry;
    - a 409 write conflict re-reads, merges and keeps all three devices' notes;
    - a rejected token or a public repository fails clearly when connecting, with nothing saved or written;
    - a repository that stops confirming it is private, or a network failure, stops sync with a clear message and no write, then recovers on "Sync now".
  - **Sync races:**
    - **Disconnect** while a round is about to write (its pre-write privacy check is held): the stale round never writes.
    - **Repository change** while the old round's read is in flight: the old repository's data isn't applied locally or copied into the new repository, nothing is written to the old one, the config still points at the new one and no stale error appears.
    - **How completion is proved:** the app runs one round at a time, so the next round completing proves the stale one has finished.
  - **Personal URL safety** (the browser check deferred from #39). A backup containing `https:`, `http:`, `javascript:`, mixed-case `JaVaScRiPt:`, space-prefixed `javascript:`, `data:` and malformed URLs is imported through the Backup page. Then:
    - **Field Notes and both Digital paths (the list and the random destination):** every kind is checked.
    - **Plan a Day stops:** `https:`, `javascript:` and `data:` are checked, since a plan has three stops.
    - **Unsafe URLs:** no link is rendered, the title, notes or description and the link label stay readable, and clicking that text runs no script and opens no navigation or tab.
    - **Safe URLs:** the link opens in a new tab (`target=_blank`, `rel` includes `noreferrer`), sends no `Referer` and leaves no `window.opener`.
    - **Whole-page check:** no `<a>` anywhere on the page has a non-http(s) href.
- **Determinism and isolation:** locally the full suite passed 5 times in a row, including with the host time zone set to Asia/Tokyo and America/Los_Angeles: 27/27 each, in about 17 s.
- **Mutation evidence:** 15 temporary mutations to app code, each rebuilt, tested and reverted (`src/` is clean in the PR). All 15 were caught:

  | Mutation | Failing scenario(s) |
  |---|---|
  | Field Notes link guard removed | Field Notes URL safety |
  | Digital list guard removed | Digital list, Digital random (whole-page href check) |
  | Digital random-destination guard removed | Digital random |
  | Plan stop link guard removed | Plan a Day |
  | Truncated JSON backup accepted as empty data | malformed backups |
  | Replace runs without asking | replace asks first |
  | Personal data never saved | both reload scenarios, legacy record, corrupted record |
  | Legacy cleanup removed (invalid favorites kept) | legacy record |
  | Stale round may write after disconnect | disconnect race |
  | Stale-round detection disabled | disconnect race, repository-change race |
  | Write conflict not retried | conflict |
  | Unconfirmed privacy treated as private | privacy/network recovery |
  | Phone menu stays open after choosing | phone navigation |
  | Route changes not followed | direct routes, desktop nav, phone nav, Plan a Day interaction |
  | Skip link replaces the route in the URL | in-page navigation |

  A failure report from the first mutation (screenshot, URL, dialogs, blocked hosts) was checked to confirm the diagnostics are useful.
- **Defects found:** none.
  - **Low-priority UX ambiguity (recorded, not fixed here):** if a valid backup is waiting for a decision and the user then picks a malformed file, the error appears while the earlier valid backup's panel stays open. Nothing is applied without a click, and what would be applied is the earlier valid file. A possible later fix is to clear the pending backup whenever a new file is chosen.
- **Limitations and deliberate omissions:**
  - Chromium only; no WebKit or Firefox, and no real iOS Safari or home-screen PWA (PP-010 stays open).
  - The service worker and offline mode aren't exercised (service workers are blocked for isolation).
  - Automatic sync after an edit (4 s delay), sync on visibility or online events, and multi-tab storage events aren't covered.
  - Plan a Day covers three of the seven URL kinds; the other four are covered in Field Notes and both Digital paths.
  - Sync tests use the fake GitHub's request shapes from `src/utils/github.ts`, not recordings of the real API.
  - **Local-only build:** this container has no Vite or React 18, so local development used a temporary esbuild build (Tailwind compiled from the repo's config, icons stubbed). The esbuild build isn't committed. CI runs the suite against the real Vite production build.
- **Unchanged and tracked separately:**
  - previous Pulse snapshot validation (M2-5);
  - the intermittent hang in the production smoke step;
  - malformed GitHub responses and loose `parseRepo` (M2-4 defects 2 and 3).

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-20 (M2-5: deterministic Pulse ingest tests)

Baseline: `main` at `0185593` (PR #39 closed after post-merge verification). No new dependencies, sources or content-policy changes. SPAA's HTTP 403 is not worked around.

- **Behaviour-preserving extraction:** the ingest's decision logic moved unchanged from `scripts/pulse/ingest.ts` into `scripts/pulse/assemble.ts`:
  - `sourceResult(def, outcome, previous, now, onParsed?)`: keep, carry over or drop; source status.
  - `assemblePulse(results, now)`: merge, dedupe/sort, file.

  `ingest.ts` keeps fetching, logging and writing.
- **Report mode (revision 1):** `--report` price evidence used to run inside the per-source error handling, right after parsing, so an error there failed the source (carry-over, error message logged). It now runs as the optional `onParsed` hook at that same point inside `sourceResult`, so the outcome is unchanged and the feed is parsed once. The first revision had parsed it separately and swallowed such errors; that is corrected.
- **Equivalence evidence:** the old (`main`) and new ingest were run locally against the same mocked feeds (successes, 403s, HTML block pages, expired and far-future items) and the same previous file, with `--report` off and on. The `pulse.json` output was identical (timestamps normalised) and the logs identical apart from the output path, including all 12 price lines. With `priceEvidence` temporarily made to throw for one listing, both versions failed that source with the thrown message and carried over its 2 listings in report mode, and were unaffected without it. A structural test checks `ingest.ts` delegates and keeps no second copy of the rules.
- **Coverage** (`tests/pulse-ingest.test.ts`, synthetic fixtures in `tests/helpers/pulse-fixtures.ts`, fixed clock, no network):
  - **Fresh reads:** kept events and fresh source status; expiry boundaries (stated end, start + 3 h, all-day + 24 h, exactly "now"); the 120-day horizon, pinned as a literal 120 days in the test (not read from the production constant), at one-second resolution either side, the precision of iCalendar times.
  - **Report mode:** an error in the `onParsed` hook is a source failure with carry-over and the thrown message; the hook sees the parsed feed and isn't run for failed fetches or unparseable bodies.
  - **Bad feed items:** missing, blank or unparseable fields dropped without affecting the rest; excluded content dropped; cancellations kept and flagged.
  - **Empty feed:** an empty successful feed doesn't carry over.
  - **Failures:**
    - 403, other HTTP errors, timeouts and HTML block pages carry over the source's unexpired listings, mark it stale and remember `lastSuccess`;
    - nothing to carry → not stale;
    - partial failure keeps successful sources, and carried and fresh copies merge;
    - all sources failing gives a valid empty file.
  - **Determinism:** identical output on repeat and in fresh processes under UTC, Asia/Tokyo and America/Los_Angeles.
  - Normalization, dedupe, ordering and prices were already covered by `pulse*.test.ts`.
- **Regression evidence:** nine local mutations, each caught, then reverted:
  - fresh read ignores the horizon;
  - expired listings carried;
  - stale never set;
  - `lastSuccess` forgotten;
  - carried listings dropped when assembling;
  - HTML block page not carried over;
  - expiry boundary off by one;
  - report-mode hook errors swallowed;
  - production horizon changed to 121 days.
- **Confirmed defect** (production unchanged; pinned by a characterization test). A previous `pulse.json` that is JSON but not the expected shape (no `sources` array, e.g. `{"events":[]}`) makes `previous?.sources.find` throw before any error handling.
  - **What happens:** `main()` logs "Pulse ingest crashed" and writes no `pulse.json`, so fresh results from healthy sources are lost for that build. The build continues and the app falls back to places and communities. This was reproduced with both the old and the extracted ingest.
  - **Likelihood:** low. The previous file is our own deployed output, and non-JSON responses are already caught.
  - **Fix (separate, small; not in this PR):** validate the previous file before use. Checking that `sources`/`events` are arrays is not enough on its own; validation also needs to cover:
    - invalid entries in those arrays (non-objects, `null`);
    - source entries without a usable `id`/`lastSuccess`;
    - carried events without a `sourceIds` array (these also throw, on the failure path only);
    - carried events whose dates can't be read (they would never expire; see below).

    Invalid entries are skipped, and a file that isn't usable at all is treated as absent.
- **Investigated, not defects:**
  - Carried listings are checked for expiry but not the horizon. They came from an earlier run's horizon, so in practice they are already within today's.
  - A carried listing with an unparseable `start` would never expire (`isExpired` is false for NaN); only reachable via a corrupted previous file.

  Both are pinned and would be addressed by the same validation fix.
- **Limitations:**
  - Fetching itself (timeouts, redirects, the `User-Agent`) and `loadPrevious` aren't unit-tested.
  - Feeds are synthetic, not recordings of the real sources.
  - The 120-day horizon and the expiry rules are pinned as they are, not reconsidered.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-20 (security fix: personal-data URLs)

Baseline: `main` at `90d1eb4` (PR #38 merged; deploy, smoke, visual, strict style guide and publisher green). This resolves defect 1 from M2-4 and nothing else.

- **Fix:** the existing `isSafeUrl` now guards the four boundaries that rendered personal-data URLs (from input, backup import or sync):
  - `FieldNotes` `n.url`: an unsafe or malformed URL shows no link. The note's title, text and tags are unchanged.
  - `Digital` `random.url`: the random pick's name and description still show; there's no "Visit" button for an unsafe URL.
  - `Digital` `w.url`: the site name renders as plain text with the same typography instead of a link. The hostname, description and tags are unchanged.
  - `Plan` `e.links[0].url`: an unsafe or malformed link shows its label as plain muted text, and nothing if there's no label.
  - Valid http(s) links render exactly as before, `target="_blank" rel="noreferrer"` included.
- **Records untouched:** imported and synced records are not deleted or rewritten. `normalizeData`, the storage schema and the sync protocol are unchanged; the characterization test still pins that imported URLs are kept as-is.
- **Regression protection:**
  - The four `DEFECT` exceptions are removed from the URL scanner. All four boundaries must now be recognised as guarded, and no reviewed exception may concern personal data.
  - A new test removes each guard from the real source in memory and requires the scanner to report that href as unguarded. The same four removals in the real files, done locally and reverted, each failed both scanner tests.
- **Required M2-6 browser case:** import a synthetic backup containing a field note, a custom website and a custom experience whose links are valid (`https://…`) and unsafe (`javascript:…`, `data:…`, malformed). Then check in a real browser:
  - valid links render and open in a new tab with `noreferrer`;
  - unsafe ones render no `<a>`, while their text stays readable;
  - clicking where the link would be runs no script.
- **Unchanged and still tracked separately:** malformed GitHub responses (M2-4 defect 2) and loose `parseRepo` (defect 3).

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M2-4: safety-critical utility tests)

Baseline: `main` at `6bfbf0d` (M2-3 closed). Test-only change: no production code, dependencies or workflows. The new tests make no network requests (`fetch` is mocked) and use only synthetic credentials.

- **Safe URLs** (`tests/url-safety.test.ts`):
  - `isSafeUrl` accepts only absolute http(s) URLs, including IDN, credentials, ports and surrounding whitespace. It rejects `javascript:`/`vbscript:`/`data:`/`file:`/`blob:`/`about:`/`mailto:`/`tel:` and other schemes, including case, whitespace, tab/newline and NUL obfuscation; relative, protocol-relative, hash, query and malformed values; and non-string runtime values (coerced exactly as React renders them).
  - A TypeScript-AST scan classifies every JSX `href` in `src/` as a constant, a trusted builder (`href()`, `directionsLink`, `mapsLink`, literal `#…` or `https://host/` templates), guarded, or reviewed. Any new unguarded href fails, and so do stale review entries.
  - **"Guarded" means the scanner sees a positive `isSafeUrl` predicate on the exact rendered expression (as written)** in one of three patterns: `guard && …href…`, `guard ? …href… : …` (true branch only), or `list.filter((l) => guard).map((l) => …href…)` with an expression body or a single `return`.
  - A guard is: `isSafeUrl(x)` itself; `a && b` where either side is a guard; `a || b` only if both sides are guards; or a parenthesised guard. Rejected: negation, comparisons, an `isSafeUrl` call nested in another expression, a stored result, a different argument, named filter functions, and outer guards across a function whose parameters rebind the href's root name.
  - Revision 1 tightened this. The first version accepted any `isSafeUrl(x)` found anywhere in a condition; 12 of the 16 bypass fixtures now in the test were accepted by it.
  - **What the scan does not do:** it doesn't follow data flow (e.g. `Collection`'s `linkFor` is reviewed by hand), doesn't model reassignment of the guarded value, and trusts the named builders and the `REVIEWED` list.
- **GitHub sync** (`tests/github-sync-utils.test.ts`):
  - `readRemote`/`writeRemote` are tested against mocked responses: wrapped base64 and Unicode round trips, 404 meaning "no file yet", 401/403 auth, 404 on write, 409/422 conflicts and stale sha, 5xx, network failure, empty/oversize/invalid content, and foreign files.
  - Also covered: request shape (contents API URL, token only in the Authorization header, `no-store`, sha sent or omitted).
  - Configuration: `loadConfig`, `saveConfig` and `parseRepo` with missing, malformed, invalid and unavailable storage; `sameConfig`.
- **Local storage** (`tests/local-storage.test.ts`): personal data, seen history and sync metadata, each with no value, corrupted values, partly valid data, unavailable storage and throwing reads. With quota-failing writes, all three previous values survive unchanged; the in-memory storage lets `removeItem` succeed while `setItem` fails, as browsers do, so a "clear then write" regression in any of the three save functions is caught.
- **Regression evidence:** seven local mutations were each caught, then reverted:
  - `isSafeUrl` allowing `javascript:`;
  - 409/422 no longer conflicts;
  - 404 not "no file";
  - base64 corruption;
  - write dropping the expected sha;
  - `loadData` throwing on corrupt storage;
  - the `PlaceCard` guard removed.
- **Defects found (production unchanged; fixes proposed for a separate, approved change):**
  1. **Unsafe URLs from personal data.** `FieldNotes` (`n.url`), `Digital` (`w.url`, `random.url`) and `Plan` (`e.links[0].url`) render URLs from personal data without `isSafeUrl`. Input forms validate new entries, but backup import and sync go through `normalizeData`, which doesn't validate URLs. React 18 renders `javascript:` hrefs (it only warns), so a crafted backup file, or a compromised private sync repo, could run script in the app's origin when the link is clicked. That origin is where the sync token lives.
     - **Impact:** needs the user to import a malicious file, or an attacker with write access to their private repo, and then a click.
     - **Disposition (review):** confirmed. A narrowly scoped security follow-up comes next, after #38 is merged and verified and subject to owner approval, and before M2-5. It will:
       - guard all four rendering boundaries;
       - keep valid links and readable personal content;
       - not silently delete imported records;
       - replace the four `DEFECT` exceptions with regression protection.

       Actual browser verification is part of M2-6.
     - The tests record these as reviewed `DEFECT` entries and pin the current behaviour.
  2. **Raw errors on malformed responses.** `readRemote`/`writeRemote` parse response bodies outside their error handling, so a malformed 200 (e.g. a proxy's HTML page) surfaces as a raw `SyntaxError`/`TypeError`, not a typed `SyncError`. On write, the file was saved but the round reports failure; the next sync reconciles.
     - **Impact:** a confusing message only. Nothing is lost and privacy checks are unaffected.
     - **Fix:** wrap both parses and map to a `format` error. Tracked separately; not fixed in M2-4.
  3. **`parseRepo` ignores leading text** (it isn't anchored), so `gitlab.example/o/r` reads as `o/r`. `verifyRepo` still requires a private repo the token can write.
     - **Impact:** minor.
     - **Fix:** anchor it to a `github.com` URL or a bare `owner/repo`. Tracked separately; not fixed in M2-4.
- **Noted, not defects:**
  - `loadConfig` checks presence, not types.
  - A failed `saveConfig` is silent, so sync stays connected for that session only.
  - The empty-data fallback shares `EMPTY_DATA`'s arrays. That's safe while updates stay immutable; it's pinned.
- **Known limitations:**
  - Real clicking and React DOM behaviour belong in M2-6.
  - The `react-dom/server` characterization requires the installed React 18; it will flag a React upgrade.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M2-3: deterministic planner tests)

Baseline: `main` at `f499a5b` (M2-7 closed). Test-only change: no production code, dependencies or workflows touched.

- **Audit:**
  - **Randomness:** the planner tests passed `Math.random` 33 times (adventure, budget-timing, plan-clock, proximity), and `plan.test.ts` and `discovery.test.ts` relied on the `rand = Math.random` default of `buildPlan` and `pickExperience`. Results changed from run to run, and a failure couldn't be reproduced.
  - **Time:** every planner test already passed a fixed "now", and the 14 logic test files passed in four time zones (M2 audit), so there were no time dependencies.
  - **Flakes:** none in CI history (25 local repeats were also clean). Remaining `Math.random` uses in tests are only in non-planner code (`visual-publish-e2e` temp file names).
- **Mechanism** (`tests/helpers/seeded.ts`):
  - `seeded(seed)` is a mulberry32 generator, with the same contract as `Math.random`.
  - `SEEDS` holds 40 fixed, distinct, frozen seeds.
  - `forEachSeed(fn)` runs a check once per seed.
  - `iterationSeed(i)` gives each iteration of the long property loops (300/500/600) its own fixed seed, so their coverage isn't reduced to 40 combinations.
  - `withSeed` rethrows any failure as `seed N (reproduce with seeded(N)): …` or `iteration i, seed N …`, keeping the original assertion as `cause`.
- **Coverage, equivalent or better:**
  - Each `runs()` check still runs 40 times, now on fixed seeds.
  - The property loops keep their iteration counts.
  - Single-shot planner assertions that used one random draw now hold for all 40 seeds; all pass.
  - The `buildPlan` option matrix runs all 54 combinations × 40 seeds (previously ×1).
  - `pickExperience` cycling runs × 40 seeds.
  - `tests/seeded.test.ts` shows the seeds take both sides of the planner's 0.65 timed/flexible split and produce ≥10 distinct primary picks.
- **Reproducibility:** the same seed gives identical sequences (first values pinned), and plans for all 40 seeds are byte-identical within a process and in a fresh Node process.
- **Regression evidence:**
  - **Real mutation, local and reverted:** `pairCostOk` ignoring the budget when the first stop is a place. It is caught identically on 3/3 runs: `iteration 56, seed 1345258770 (reproduce with seeded(1345258770)): cost 50 > 25`. The old randomised tests also caught it (8/8), but with no seed to reproduce.
  - **In-suite:** a planner that breaks the budget only for rare draws fails with its seed.
- **Known limitations:**
  - Fixed seeds explore the same paths on every run. A bug reachable only through draws none of the seeds produce stays hidden, where `Math.random` might eventually hit it.
  - Seeded sequences depend on the order of `rand()` calls in the planner. A legitimate planner change can move which choices each seed makes; assertions are behavioural, so that is a change of coverage, not a false failure.
  - Production still uses `Math.random`; only tests are seeded.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M2-7: blocking lint)

Baseline: `main` at `4571b5b` (M2-2 closed after independent post-merge verification). No new rules, no ESLint upgrade, no dependencies.

- **Before:** `eslint .` ran with `continue-on-error: true` in both Check and the deploy build ("style issues shouldn't block a deploy"). Warnings never failed the command. `main` was already clean (0 errors, 0 warnings).
- **Now:**
  - `npm run lint` is `eslint . --max-warnings 0`, so existing warnings (e.g. `react-hooks/exhaustive-deps`) fail as well as errors.
  - Both lint steps block: Check fails, and so does the deploy build. The deploy job `needs: build`, so nothing is uploaded or deployed.
- **Tests:** `tests/lint-gate.test.ts` runs the real ESLint binary with the script's exact flags and the repository config, on synthetic stdin source (no files written).
  - An unused variable fails in `src/`, `scripts/` and `tests/`.
  - A rules-of-hooks error fails.
  - A missing hook dependency (a warning alone) fails with "too many warnings (maximum: 0)".
  - Clean code passes.
  - Structural checks confirm no `continue-on-error`, lint before the tests, and lint before the Pages upload.
- **Known limitations:**
  - The existing config lints only `*.ts`/`*.tsx`. The `.mjs`/`.js` scripts (`scripts/security/*.mjs`, `scripts/visual/publish/*.mjs`, `eslint.config.js`) and `public/sw.js` are not linted. Widening that would be a configuration change, so it is out of scope here.
  - A scheduled deploy would now stop if lint failed on `main`. That can only happen if code that fails lint reaches `main`, which the required Check job prevents. The lockfile pins the ESLint version.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M2-2: workflow security tests, revision 1)

Baseline: `main` at `168f514` (M2-1 closed). This is test tooling plus three small workflow edits that move interpolated values into env.

- **Privileged execution policy** (`PRIVILEGED_POLICY` in `tests/workflow-security.test.ts`). Every job with a write scope needs a reviewed entry with:
  - **a fingerprint** (sha256 of the parsed YAML) covering:
    - the inherited workflow settings (`on`, `env`, `defaults`, `permissions`);
    - the job definition without its steps;
    - every step;
  - **a closed command allowlist;**
  - **the allowed first arguments for `node`.**
- **Fingerprint boundary:** anything in those three parts changes the fingerprint. Not covered: other workflow files, repository or organization settings, the values of variables and secrets, runner images, and the content of pinned actions (pinned separately in `.github/action-pins.json`).
- **Named rules for privileged jobs,** in addition to the fingerprint:
  - execution-control variables (`NODE_OPTIONS`, `BASH_ENV`, `ENV`, `LD_PRELOAD`, `PATH`, `GIT_SSH_COMMAND`, …) may not be set in workflow, job or step env;
  - a shell other than `bash` (workflow defaults, job defaults or step `shell:`) is rejected.
- **How commands are found:** `tests/helpers/shell.ts` finds commands through quotes, `$(…)` and backticks, `sh`/`bash -c` code, wrappers (`env`, `exec`, `timeout`, `xargs`, `nice`, `sudo`, …), loops and `case`, and function definitions. Reported in privileged jobs: package code (npm/npx/yarn/pnpm/bun/bunx/corepack/tsx/ts-node/deno/volta, any `node_modules` path), computed command names, `eval`/`source`/`.`, and heredocs.
- **No `${{ … }}` in `run:` scripts** of any `.yml`/`.yaml` workflow, except exact `(file, job, step, expression)` exceptions; none exist today.
  - Expressions are read across line breaks and may contain `}` in string literals.
  - The token rules use the same reader.
- **Untrusted values:** an env value that uses any expression outside a short, exact list of fixed-format contexts is untrusted, and so are `GITHUB_HEAD_REF`, `GITHUB_BASE_REF`, `GITHUB_REF` and `GITHUB_REF_NAME`. Untrusted variables:
  - must be expanded inside double quotes (including inside `$(…)`);
  - must never appear inside `eval` or `sh -c` code;
  - must never form any part of a command name, even quoted or through wrappers such as `env`, `exec`, `timeout` and `xargs`, in **any** job.
- **Revision 1 evidence:** 23 new cases, each confirmed not rejected by the previous policy before the fix:
  - inherited settings: 9 cases;
  - multiline expressions: 5 cases, of which only the multi-line *expression body* was a real gap (`\s*` around the body already absorbed line breaks);
  - untrusted command names: 9 cases.

  All 28 earlier mutations still fail, and the real workflows and legitimate patterns stay accepted. These are also accepted: a multiline trusted expression; exact exceptions written over several lines; quoted untrusted arguments; and a trusted variable as a command path.
- **Known limitations:** the shell reader is not a bash parser.
  - **Data flow isn't tracked inside scripts.** An untrusted value copied to another variable (`b="$REF"; "$b"`), written to a file, or passed through `$GITHUB_ENV`/`$GITHUB_OUTPUT` to a later step is not followed. Such a computed command name is caught only in privileged jobs, where every computed command name is rejected.
  - Heredoc bodies are not analysed; they are reported in privileged jobs.
  - Expressions containing `}}` inside a string literal are split early.
  - Quoting prevents word splitting and globbing, not option injection: a quoted value starting with `-` needs the receiving program's `--`.
  - Expressions in `with:` inputs are only checked for tokens. Actions that execute inputs as code are excluded by the trusted action manifest.
  - Unprivileged jobs may set `NODE_OPTIONS` and similar variables; only privileged jobs are restricted.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M2-1: eliminate false-positive tests)

- **`npm test` now runs `scripts/test/run.ts`.** It runs every `tests/**/*.test.ts` file (nested included) through the `node:test` API, then fails unless the run is trustworthy:
  - at least one test file was discovered and at least one test ran (an empty suite is an explicit failure, checked before `node:test` is called);
  - every discovered file reported at least one real top-level test;
  - no misnamed or misplaced test-like file exists (e.g. `*.spec.ts`, `*.test.tsx`, or a test-named file inside `helpers/` or `fixtures/`), and there are no symlinks;
  - nothing is focused, skipped or TODO, checked both in the source (TypeScript parse, so comments and strings don't count) and at run time;
  - nothing failed or was cancelled.
- **Fixed false positive:** `tests/image-scout-publish.test.ts:75` compared `indexOf` results for a marker #32 had removed, so it read −1 and always passed. It's replaced by `tests/helpers/order.ts` → `assertInOrder()`, which fails on a missing or reordered marker and now covers all ten validation phases. Mutation tests show a missing marker, staging moved before the content checks, a limit moved out of the metadata loop, and an unchecked enumeration each fail.
- **Tests:** `tests/test-integrity.test.ts` covers discovery, source detection, run verification, and the real runner end to end on synthetic trees: a skip, a runtime skip, a TODO, `.only`, an empty file, a load failure, a misnamed file and a failing test.
- **Focus detection** follows the `node:test` bindings: default, named, renamed and namespace imports; simple aliases; destructuring; the test-context parameter, including nested `t.test`. It reports modifier access called or not (`test['only']`, `const s = test.skip`), dynamic member access (`test[name]`), options in object literals, and `only`/`skip`/`todo` imports. Unrelated objects with those members are ignored.
- **Node 24 without `--test-only` still runs every test** (checked end to end), so `.only` is caught by the source check alone.
- **Known limitations:**
  - Bindings are tracked by name per file, with no shadowing.
  - Not followed: options passed through variables or spreads, aliases through reassignment or other modules, CommonJS `require`. The runtime check still catches any real skip or TODO; a focus marker hidden that way would not be caught.
  - A run with explicit file arguments skips the completeness check and says so.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M1 closed; M2 test harness audit)

- **M1 is closed** after ChatGPT's independent post-merge verification. PRs #31 and #32 are merged; `main` is `483ae64`.
- **Checks on `483ae64`:** all passed.
  - Deploy run 44438959858: build 230/230, smoke `--expect-commit` passed.
  - Visual 44438959896, Style guide 44438960048, Verify action pins 44438959859, Publisher 44439351739.
- **Branches:** the owner deleted the legacy `image-scout` branch, and no image-scout run followed (the last run was 2026-11-17). `image-scout-results` is preserved at `71efe69`. The hardened image-scout workflow's first real run still waits for owner authorization.
- **M2:** the test-harness audit and plan are with ChatGPT and the owner. No implementation has started.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M1 security closeout)

- **Post-merge verification of M1 (`6efcd88`):** all passed.
  - Deploy run 44435684651: build 217/217, deploy, and smoke with `--expect-commit 6efcd88`.
  - The bundle is still `index-BCRZKX9R.js`, so the app is byte-identical to before M1.
  - Visual check 44435684597 (60 shots, 0 findings), Style guide 44435684591 (strict, 0 findings), Verify action pins 44435684508, and the publisher run 44436542218 (→ `visual-results/main-0d6e4079e367`).
- **Image scout trust boundary:**
  - The artifact is now extracted to `$RUNNER_TEMP/scout-artifact` and validated in three fail-closed phases before anything is copied:
    1. **Enumerate** once with `find`, writing to a file. Its exit status is checked, so an error or kill, even after partial output, fails the step.
    2. **Check metadata only:** no symlinks or special files; the only directory allowed is `editorial`; file names must start with a letter or digit and end in `.jpg`, `.webp` or `.json`; each JSON file at most 10 MB; at most 500 files and 50 MB in total. No file content is read until these all pass.
    3. **Check content:** JPEG and WebP files must start with their format's **signature bytes**. This is a header check, not a full image decode: a file with a valid header but a corrupt body would pass. JSON files must parse.
  - Allowed files are copied as fresh 0644 files into a new `$RUNNER_TEMP/scout-publish`. Git runs only there, with system/global config ignored and hooks disabled.
  - **Tests:** `tests/image-scout-publish.test.ts` runs the workflow's own validation step against malicious or edge-case artifacts, three enumeration failures (via a `find` stand-in) and three over-limit artifacts. Logging stand-ins for `head` and `node` prove no content is read before the limits pass; a valid artifact serves as the positive control.
  - **Before this revision (`c3cf8a2`):** a failing `find` still exited 0, and a 60 MB JSON file was parsed before any size check.
  - **Earlier, the merged M1 version** rejected `.git/config` and symlinks but accepted an empty `.git` directory, dot-files, leading-dash names, non-image content, invalid JSON and empty nested directories.
- **Real execution of the hardened image scout workflow is deferred until the owner authorizes it.** It has never run: a run needs a push to `image-scout`, which force-pushes `image-scout-results`.
- **The `image-scout` branch (`cb6b8fe`):**
  - It has 0 commits of its own and is 96 commits behind main, so it is simply old main.
  - It still carries the pre-M1 privileged workflow: `contents: write` for the whole workflow, unpinned `@v4` actions, `npm install` with a write token, and the token in the push URL.
  - Its only differing content is `briefs.txt` containing `skip=skip`.
  - **Recommended:** the owner deletes only `image-scout` (see DECISIONS) and recreates it from `main` when a scout run is next wanted. Nothing has been pushed, triggered, deleted or overwritten.
- **Structural tests:**
  - Action references and setup-node checks now come from the parsed YAML; the text is used only for release comments.
  - The pre-M1 image-scout workflow is kept as a fixture and must fail both the permission policy and the manifest.
- **Editorial images:** processing is extracted unchanged into `scripts/images/process.ts`. `tests/editorial-images.test.ts` runs it on synthetic images every run (dimensions, EXIF rotation, no enlargement, stripped metadata, byte-identical repeat runs, corrupt input).

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (M1: security and reproducibility)

PR #30 is merged as `e3f9bda`. M1 is a separate maintenance PR with no application, UI, navigation, content or Sync changes.

- **Deploy permissions:** the workflow default is `contents: read`. Only the `deploy` job holds `pages: write` and `id-token: write`, and it runs only `actions/deploy-pages`. The build job keeps `pages: read` for `configure-pages`; smoke inherits read-only.
- **Checkout credentials:** every checkout sets `persist-credentials: false`. No workflow job pushes with checkout credentials.
- **Image scout:**
  - It is now two jobs. `generate` (read-only) runs npm and the scout and uploads an artifact. `publish` (`contents: write`) downloads it with no checkout and no npm, accepts only `.jpg`/`.webp`/`.json` regular files within 500 files and 50 MB, and pushes through an env-scoped git header.
  - The required scout step and every publish step fail genuinely. Only the two labelled optional snapshot steps may fail softly.
  - **Not run:** a real run needs a push to `image-scout`, which the owner hasn't authorized.
  - **Caveat:** pushes to `image-scout` use the workflow file on that branch, so the hardening applies only once that branch includes this change.
- **Action provenance:**
  - `.github/action-pins.json` is the trusted manifest. `npm test` enforces it offline: every `uses:` must match an entry's action, SHA and tag exactly, and unused entries fail.
  - `verify-action-pins.yml` (read-only; runs when `.github/**` changes, weekly, or on demand) resolves each tag anonymously upstream and checks the commit and its `action.yml` runtime. It reports mismatches and never updates the manifest.
- **Node:** 24 everywhere. `.nvmrc` is the single source: every `setup-node` reads it. `engines` is `>=24 <25` in both package.json and the lockfile root. README updated.
- **Install scripts:**
  - `.npmrc` sets `strict-allow-scripts=true` (npm 11.19.1 in CI). `allowScripts` denies all three packages that have install scripts (esbuild, sharp, fsevents); none is approved.
  - CI's negative probe shows that an unreviewed synthetic script fails the install without running, a denied one installs without running, and the approved control runs.
  - The build, screenshots and `tests/native-deps.test.ts` (esbuild transform, sharp WebP/JPEG encode) pass with the scripts denied.
- **Audit:** a non-blocking `npm audit --omit=dev` report in Check. It reports UNAVAILABLE rather than clean when the audit can't run, and never upgrades anything.
- **Tests:** 208 → 217. New tests cover the permission policy (with 13 mutation cases), the manifest (7 mutation cases), Node alignment and native dependencies.
- **SPAA:** HTTP 403 since about 19:19 UTC; listings carried over and marked stale. Reassess around 2026-11-20; no circumvention.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (PR #29 closeout)

- **Accepted and merged:**
  - ChatGPT's final recommendation was APPROVED.
  - The owner completed manual acceptance against `2115aca` with zero defects: desktop, in-page navigation, 200% and 400% zoom, keyboard, artwork recovery, macOS Safari 9/9, iPhone Safari (physical device) 9/9, reduced motion 5/5, and Home/Discover/Pulse regressions 9/9.
  - Acceptance used a private-port GitHub Codespace running the Vite development server, so no service worker was installed and Sync was never connected.
- **Pre-merge check:** the PR head was still `2115aca`, and Check (44397305587), Visual (44397305389) and Style guide (44397305352) were all green.
- **Branch protection (resolved):** Claude's session couldn't read `main`'s protection rules. ChatGPT inspected the active "Protect main" ruleset (#27562180): it requires a pull request and the `check` CI job, blocks deletion and non-fast-forward updates, and has no bypass actors. The required `check` passed on `2115aca`.
- **Merge:** merge commit `b8b39bc` (same strategy as #26–#28). Its tree is identical to `2115aca` (`git diff` is empty).
- **Production:**
  - Deploy run 44410662810 passed its build (208/208 tests, the current count; Sprint 01 closed at 142), deploy and smoke jobs. The smoke check found deployed commit `b8b39bc` and bundle `index-BCRZKX9R.js`.
  - Visual check, the style-guide evidence run and the screenshot publisher (44412005691) also passed on `main`.
- **Post-deploy browser smoke test (live site, desktop Chrome):**
  - Home, Discover, Pulse and `#/styleguide` render with no script errors and no horizontal overflow.
  - The skip link is the new `InPageLink`; Pulse's "Sources" link is present.
  - The style-guide chunk and the Caveat font load only when `#/styleguide` is visited.
  - The production service worker (`pp-v3`) is active, controls the page and serves the new build.
  - No stored app or Sync data was read.
- **Observations (not regressions):**
  - The Pulse source SPAA returned HTTP 403 during the deploy build; its listings were carried over (6/7 sources).
  - The `pp-v3` cache keeps hashed assets from earlier builds until `VERSION` is bumped. This is existing behavior.
- **Evidence branch:** `evidence/pr-2-styleguide` can now be deleted (Claude can't delete branches).
- **Preview infrastructure:** approved in principle with revisions (see DECISIONS). Deferred, nothing built.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (Sprint 02 PR 2: graphic primitives and the style guide)

- **PR #28** (tokens and typography): approved at `301479e`, merged as `c2a5974`.
- **PR 2 (this):**
  - **Graphic primitives:** surface, paper edges, tape, stamps, restrained grain, handwritten annotations and artwork treatments (plain, duotone, halftone, cutout; missing-artwork fallback; explicit credit).
  - **Surface-aware controls** (`.ui-*`).
  - **A hidden, code-split `#/styleguide`** with realistic compositions plus component demonstrations: nested surfaces, long headlines, missing artwork, visible focus, reduced motion, responsive layouts.
  - **Caveat Bold** (OFL-1.1, Latin 700, 51,020 B WOFF2): decorative only, and loaded only by the components that use it. The app shell requests no Caveat file.
- **Style-guide evidence** comes from a separate read-only workflow (`styleguide.yml`) at 390 and 1280 px. The standard harness, its matrix and the publisher policy are unchanged. Screenshots are on the evidence branch named in the PR, with SHA-256 hashes matching the run log.
- **Acceptance checklist (manual, still required):** 200% zoom and reflow; Safari (macOS and iOS); a real phone.
- **Leftover temporary branch:** `tmp/pr-2-caveat-lockfile` resolved the Caveat lockfile. Please delete it, along with the evidence branch once review is done.
- Home, navigation, data and app behavior are unchanged. No Issue 09 content and no Newsstand page.
- **Revision 1** (ChatGPT review of `d6ec713`; creative direction approved):
  - **In-page links keep the route:** the router ignores bare `#fragments`, and `InPageLink` moves focus without changing the URL. This also fixes the app's "Skip to content" link, which used to fall back to Home.
  - **The cover headline** is sized to its column, with no broken words from 320 to 1440 px.
  - **Displayed artwork must be credited** (type and runtime), and failed images recover.
  - **Browser tests** activate the skip and internal links and measure rendered hover, pressed and focus colors. The style-guide workflow now runs in strict mode.
  - **Revision 2** (P2 from ChatGPT's re-review of `0878905`):
    - The app's "Skip to content" link and Pulse's "Sources" link now use `InPageLink`, and `<main>` is programmatically focusable, so the URL keeps its route and a refresh reopens the same page.
    - Browser tests activate them by keyboard. They check the exact original hash (including route parameters), focus, scrolling and route preservation after a reload.
    - **Compatibility:**
      - Route URLs and unknown-route fallback are unchanged.
      - A bare-fragment hash change now keeps the current page instead of switching to Home.
      - Opening a bare-fragment URL directly (e.g. an old `#main` bookmark, or a link opened in a new tab) still lands on Home, as before.
  - **Methodology note:** of the 124 standard screenshots, **112 are byte-identical** (and pixel-identical) to `main`. The earlier "117" used a perceptual threshold (fewer than 0.1% of pixels differing by more than 24/255), which counted small capture-timing differences as identical.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (Sprint 02 PR 1: accessible tokens and typography, revision 2)

- **PR #27 (PP-011):** approved by ChatGPT and merged at `78a4e5e`. **Post-merge verification:**
  - Deploy to GitHub Pages run 44379304877: build, deploy and smoke all succeeded.
  - Visual check run 44379305026 succeeded.
  - Publisher run 44379899839 ran trusted code `78a4e5e` (the new pinned workflow commit) and published `main` @ `78a4e5e` (125 files).
  - **ChatGPT's non-blocking follow-ups** (a separate small PR, not this one): align `engines` and the lockfile root metadata with Node 22+; make the action-pin test authenticate SHAs against their release tags, not just the version comments.
- **PR #28 revision 2:** the minor revisions from ChatGPT's review of `c961bc1`:
  - the **approved Newsstand palette**, exactly as given. "Editorial ink" is a separate `surface-editorial`; the Field Guide ink, raised and hunter surfaces and the app background are unchanged;
  - a **`--control` boundary token** (≥ 3:1), separate from decorative `--rule`. It's applied to buttons, chips and inputs, and inputs keep the global focus ring;
  - the **agreed type hierarchy**: body 16px; editorial body 17–18px; labels 12–13px; display ≈ 40–56px mobile and 72–112px desktop; oversized and tight type only in `text-cover`;
  - **zoom wording:** rem sizing is a safeguard, not proof; 200% reflow still needs manual verification;
  - merged with `main` (#27). The existing contrast fixes are kept.
  - No new layouts, navigation changes or font dependencies.
- **Next, PR 2 (graphic primitives):** Caveat Bold as the single handwritten accent, self-hosted via Fontsource with license and transfer-size verification. Never used for essential labels or body copy.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (Sprint 02 PR 0a: PP-011 reproducible builds)

- **Sprint 02 is authorized** (owner, 2026-11-18). Sequence: PR 0a (this), then PR 1 (accessible design tokens and typography), then the approved plan. The thin Explore hub comes before the navigation switch, and the current homepage stays until the Newsstand preview is approved.
- **PR #26 live verification** (ChatGPT, independently): merged at `c0f07b0dea130db90419bdce0422d6134d45281d`; publisher run [44343202178](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44343202178) succeeded. `visual-results` holds `README.md` and `main-0d6e4079e367/` for `main` @ `c0f07b0dea13` (Visual check run 44342556199). Claude confirmed the same from git.
- **PR 0a (PP-011):**
  - `package-lock.json` committed; it was resolved on GitHub's runner because Claude's environment has no registry access;
  - every workflow uses `npm ci` on Node 24;
  - all actions upgraded off the removed Node 20 runtime and pinned to full commit SHAs;
  - a regression test guards all of this.
  - Details and limitations are in the PR.
- **Publisher live refusal checks** (2026-11-18). Real runs on this branch, with no writes to production results. `visual-results` stayed at `d63ad5243de9` throughout:
  | Scenario | Trigger | Publisher run | Outcome |
  |---|---|---|---|
  | Stale run (branch moved on) | Visual check 44357898826 @ `32cdafb` completed; `83685e7` was pushed seconds later | [44358639064](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44358639064) | ✅ "Not published: … the branch has moved on or was deleted since this run" |
  | Harness changed on a branch | Visual check 44358646980 @ `83685e7` (this PR changes `visual.yml`) | [44359267912](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44359267912) | ✅ "Not published: … changes the screenshot harness (.github/workflows/visual.yml)" |

  Both ran trusted code `c0f07b0` (the pinned workflow commit).
  - **Not exercised live:**
    - **A tampered `visual-results`.** Doing it live would mean writing to production results. It stays covered by the 11 tampered-results end-to-end cases.
    - **A re-run of an older run.** The proxy doesn't allow Claude to trigger re-runs. The owner can do it from the Actions UI; the expected outcome is "Not published (newer results)" or "branch has moved on".

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (safe screenshot publisher, revision 3)

- **ChatGPT's re-review of `19b4cfa`:** both P1s are resolved. The remaining narrow corrections are done on PR #26:
  - **P2, full standard matrix:** only complete standard runs are published (all widths, the 12 routes, the exact 7 keyboard checks at 390 and 1280 px, the 4 state records). Partial runs are "Not published" and stay artifact-only. Valid but no-longer-standard carried folders are dropped. Constants are tested against `run.ts` and `useRoute.ts`.
  - **P3, ZIP directory entries:** stored or deflate only; size 0; CRC 0; deflated data must decode to nothing.
  - **Wording:** categorical "no personal data" claims are removed. Synthetic fixtures and credential isolation are described as safeguards, not proof of pixel content.
- **Evidence:** 34 unit and 9 end-to-end publisher tests; 43/43 mutation checks caught. CI and the head SHA are in the PR.
- **No architectural changes.** Owner-side repository settings and deleting the legacy `visual-results` branch remain activation prerequisites. **Do not merge** before ChatGPT's final verification and the owner's approval.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-18 (safe screenshot publisher, revision 2)

- **ChatGPT's security review of `fc7000f`:** changes requested (two P1s, four P2s, P3 hardening). **All are addressed** on PR #26 (branch `visual/safe-publisher`). The PR is **retargeted to `main`** now that #25 has merged.
- **Corrections:**
  - **P1 harness provenance:** documented as consistency, not attestation; artifacts are untrusted review material. Added an authorized-contributor and eligible-branch gate. A static test proves the capture workflow holds no write access, secrets or credentials.
  - **P1 results trust boundary:** no checkout; strict tree validation (regular files at expected paths); every carried folder re-validated; clean tree from validated blobs; fetch failures fail closed.
  - **P2 folder collisions:** hash-suffixed folders.
  - **P2 ZIP structure:** zip64, boundaries, flag/CRC/size and descriptor agreement, exact tiling.
  - **P2 strict report schema:** coverage, required axe and keyboard records, "not run" made explicit.
  - **P2 stale publication:** freshness checked twice, older runs refused, full SHA and run id recorded, lease push.
  - **P3:** structural-JPEG wording and tests; code-span neutralization; checkout pinned to `workflow_sha`; accurate token description.
- **Evidence:**
  - 31 unit and 8 end-to-end publisher tests;
  - 35/35 mutation checks caught;
  - 11/11 real-world archives (Python, `zip` CLI, JSZip; descriptors and zip64) and 10/10 Chromium JPEGs pass;
  - a hostile report rendered with `marked` and `markdown-it` yields only expected links and images.
  - Details are in `collaboration/security/visual-publishing.md` (revision 2).
- **Owner, before activation:**
  - apply the required repository settings in the security doc;
  - confirm there are no Actions secrets;
  - delete the legacy `visual-results` branch (the publisher fails closed on its old layout).
- **Needs:** ChatGPT's re-review; then the owner's final approval. **Do not merge before both.**

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-17 (safe screenshot publisher)

- **The owner approved option B.** The safe publisher is built in its own PR (branch `visual/safe-publisher`), **stacked on #25** (its base branch is #25's, so its diff is publisher-only). It's separate from the design-foundation work.
- **Design, controls, tests, residual risks and recommended repository settings:** `collaboration/security/visual-publishing.md`. In short:
  - a `workflow_run` job runs only default-branch code;
  - no third-party actions and no `npm install`;
  - the artifact is validated in memory by a zero-dependency zip reader and strict policy;
  - publishing happens only when the branch's screenshot harness is identical to `main`'s;
  - the report is regenerated from validated data;
  - the token is scoped to one step and never sent to artifact storage.
- **Tests:** 19 unit and 4 end-to-end tests (10 refusal cases); 12 mutation checks; interoperability with Python `zipfile`/zip64, the `zip` CLI and real Playwright JPEGs.
- **Merge order:** #25 first, then this PR (retarget it to `main` if GitHub doesn't do so automatically).
- **Needs:** ChatGPT's independent security review; then the owner's final approval and, ideally, the recommended `main` ruleset and read-only default workflow permissions.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-17 (PR #25 review corrections)

**Context.** The technical assessment for Sprint 02 is with ChatGPT; owner decisions are in DECISIONS.md. The only implementation is the owner-approved visual verification harness, PR #25. No Sprint 02 UI work has started.

### PR #25 corrections (ChatGPT review of `1c29fba`)
| # | Finding | Resolution |
|---|---|---|
| P1 | The publish job ran branch code with repository-wide `contents: write` | **Removed.** The workflow is read-only (`contents: read`, `persist-credentials: false`). Results are a 14-day artifact plus a step summary. `publish.sh` is deleted. A safer design is proposed below for owner re-approval |
| P2 | Strict could pass without axe | A missing axe now **fails the run in every mode**. `--no-axe` is explicit and local-only, and `--strict --no-axe` is refused |
| P2 | Only serious/critical violations kept | **All** violations under the WCAG A/AA tags are recorded, at every impact level, with counts by impact. The baseline stays report-only |
| P2 | Keyboard "check" was a non-empty `outerHTML` | **Seven verified checks** at 390 and 1280 px: focus enters the page; first stop is a skip link to existing content; every stop is interactive; focus keeps progressing (no repeats or traps); stops are scrolled into view; focus indicator present; Shift+Tab returns to the previous *different* stop. The focus-ring screenshot is labelled as evidence only |
| P2 | GitHub context interpolated into shell | Passed through `env:`. An audit script confirms no `${{ }}` remains inside any `run:` block |

**Regression evidence.** `npm run visual:selftest` runs in CI before the real check. It runs the harness against two synthetic pages (`tests/fixtures/visual/selftest/`) and asserts:
- the clean page passes `--strict` with axe run, no violations and 7/7 keyboard checks;
- the broken page fails `--strict`, with overflow, the timer-thrown page error, `color-contrast` (serious) **and** `server-side-image-map` (minor, proving no impact filtering), and the keyboard checks for skip link, trap, focus indicator and Shift+Tab all failing;
- report-only mode still exits 0;
- a missing axe fails in both modes;
- `--strict --no-axe` is refused;
- explicit `--no-axe` is labelled as "NOT RUN".

### Proposal for owner re-approval: safe screenshot publishing (not built)
**Why:** reviewers who can't download Actions artifacts can't see screenshots. That includes Claude, whose environment can't reach the artifact storage host. Without publishing, Claude's visual checks rely on the text report and logs.

**Design**
- A separate `visual-publish.yml`, triggered by `workflow_run` when "Visual check" completes.
- GitHub always runs `workflow_run` workflows from the **default branch's** definition, so branch code can never change the privileged job until it's been reviewed and merged.
- Job permissions: `contents: write` and `actions: read` only. It checks out `main`, never the branch.
- It downloads the run's artifact **as data**:
  - allowed file types only (`.jpg`, `.json`, `.md`);
  - size and count limits;
  - no symlinks;
  - the branch folder name sanitized through `env:`.

  Nothing from the artifact is executed.
- It pushes a single parentless commit to `visual-results`.

**Residual risk:** the token is still repository-wide. It's mitigated because only reviewed `main` code runs with it. Optional hardening (owner setting): a ruleset on `main` blocking direct pushes and force-pushes.

**Alternative:** stay artifacts-only. The owner and ChatGPT download screenshots; Claude reviews the text reports.

---

## Previous — Claude (engineering) → owner and ChatGPT, 2026-11-17 (Sprint 01 closeout)

### Final approval
- **#22 (PP-004):** approved by ChatGPT at head `956dd4f` and merged by the owner as `68186d8`. ChatGPT independently confirmed the head, the merge commit, and the closure of issue #5.
- **All Sprint 01 engineering PRs** are approved and merged: #14, #16, #17, #18, #20, #21, #22.
- **Issues closed:** #2, #3, #4, #5, #9.

### Production verification
Run 44210815361 deployed `68186d8`:
- build, deploy and smoke jobs all succeeded;
- `version.json` = `68186d8` and the smoke check's commit match passed;
- the live bundle `index-CH5MV--X.js` is the same file built from the approved head;
- `pulse.json` is fresh and consistent: 132 events, 7/7 sources, 29 with validated venue coordinates.

The merge commit's tree is identical to the approved head (`git diff 956dd4f 68186d8` is empty). Details are in STATUS.md.

### Accepted limitations (approved with the PRs; none blocking)
**Sync (PP-008)**
- The privacy check and the write are separate requests, not atomic.
- A write already in flight can't be retracted.
- Anything written before a repository is made public stays in its history.
- The token is stored in each browser's localStorage.
- A settings edit on a device still running the old app behaves like the old whole-object sync.
- Tombstones expire after 180 days.
- The hook's stale-state guard is code-reviewed only.

**Events (PP-001, PP-002)**
- The same event listed at different start minutes stays duplicated.
- Non-event listings (e.g. "Museum Closed…") can appear.
- RRULE recurrence isn't expanded (PP-007).
- Prices are conservative heuristics: when unsure they're "unknown", and aggregator text can mislead.

**Proximity (PP-003)**
- No routing: every distance is a straight line.
- Venue coordinates exist only where publishers provide them (29 of 132 live events). Places and communities stay city-level until coordinates are researched and cited.
- The radius filter uses city centers for stops without venue coordinates.

**Planner (PP-004)**
- Travel to the first stop is a fixed 30-minute allowance.
- Opening hours are unknown; midnight is the cutoff for places.
- Stops are never reordered.
- Flexible stops start within the chosen part of the day.
- Drop-in visits assume about 120 minutes and need at least 45 minutes left to join.
- Fixed-start events are attended in full.
- "Known" preferences come from category profiles.
- The UI is verified by typecheck and build only, not in a browser.

**Smoke check (#20)**
- A failure is reported but doesn't roll back the deploy.
- On branches, it checks production, not the branch.

### Remaining backlog: for collective Sprint 02 prioritization (unranked, nothing started)
**Open issues**
- PP-005 #6: local sources and feeds (ChatGPT research; publisher permission pending).
- PP-006 #7: strict production editorial validation.
- PP-007 #8: recurring calendar events (RRULE).
- PP-009 #10: Weekly Drop editorial checks still outstanding.
- PP-010 #11: real-device mobile, offline and sync verification, including a visual review of the new planner copy.
- PP-011 #12: reproducible builds (lockfile) and documentation.

**Follow-ups surfaced during Sprint 01** (no issues yet; open them only if agreed)
- Cited venue coordinates (`coords` with `source` and `verifiedOn`) for frequently used places and communities. Research first, then data.
- An exclusion rule for non-event listings such as closures.
- Review of the 180-day tombstone expiry for long-offline devices.
- An optional React test harness for hooks and UI. This needs approval for a new dev dependency.
- Planner refinements: reordering stops, estimating first-stop travel (note: this touches the owner's location, so privacy needs considering), and opening-hours data.
- Maintenance:
  - GitHub Actions warns that `actions/checkout@v4`, `actions/setup-node@v4` and `actions/deploy-pages@v4` target the deprecated Node 20 (currently forced onto Node 24).
  - Merged branches could be deleted: `integration/sprint-01-review`, `pp-00x-*`, `sprint-01/close-out` and the collaboration/editorial/research branches. That's the owner's call.

Engineering has **not** started Sprint 02 work.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-17 (#22 review revision 2: fixes A–C)

ChatGPT reviewed head `38451d5` and requested three targeted correctness fixes. Each was reproduced on that head before editing, and each fix is small and local to `src/utils/adventure.ts`.

| Finding | Before (`38451d5`) | After |
|---|---|---|
| **A.** Drop-in arrivals ignored the slot on future dates | A 10 AM–4 PM drop-in in an afternoon plan was scheduled at **10 AM** | Drop-in arrivals (primary and secondary) are `max(window start, slot start or now + lead)`, so it starts at **12 PM**. Morning/afternoon/evening start at 10 AM / 12 PM / 5 PM. Overnight drop-ins (8 PM–1 AM) are unchanged |
| **B.** Fixed events capped at 240 min | A 12–5 PM event "ended" at **4 PM**, so a 4:30 PM talk was paired (overlap) | Fixed-start events use their **published** duration (300 min, ends 5 PM), and the 4:30 talk is rejected. Estimates (120 min) remain only with no or invalid end, or for all-day, exhibitions and drop-ins. The old 45-min floor is also gone, so a published 30-min event is 30 |
| **C.** Anchors' known preference mismatches weren't disclosed | Partner/high/chill/outdoor on a fighting-game tournament, indoor/chill on an outdoor market, friends on a solo-only meetup: **no warnings** | Known mismatches are **warnings**: places (company, energy, atmosphere, indoor/outdoor), events (atmosphere, indoor/outdoor, exhibition in the evening), communities (company). Missing listing info stays one neutral `info` line. Only **timing** conflicts suppress the timetable; budget, radius and preference mismatches still get a full plan |

- **Tests:** `tests/plan-review-r2.test.ts` has 14 deterministic tests (fixed now, `rand = () => 0`). On the unfixed `38451d5` code, **12 fail**. The 2 that pass are guards (valid overnight attendance; no false warnings).
- **Mutation checks:** reverting each fix (9 mutations) fails at least one test.
- **Suite:** 142/142.

**Remaining limitations**
- **Fixed events are attended in full.** A long event now uses most of the time budget; leaving early isn't modelled.
- **"Known" preferences** for places come from editorial category profiles, and event atmosphere comes from the category heuristic already used for filtering, not from per-listing data.
- All earlier #22 limitations still apply. See the review-revision-1 section below.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-17 (PP-004 final verification)

#20 and #21 are merged and verified in production (see STATUS). #22 has been retargeted to `main`, brought up to date with it, and revised for ChatGPT's four targeted checks. Each point was reproduced on the combined code first.

| Check | Reproduced on #22 + main | Resolution |
|---|---|---|
| 1. Overnight / calendar day | A 10 PM–2 AM listing from the previous night was offered for the next evening. A place was paired after an 11:30 PM show (50/50 runs). Overnight events showed only "11:00 PM" | Timed listings belong to the day they start. Windows are measured on the plan date's clock (past midnight ≥ 1440). Label reads "(ends next day)". Places start within the chosen part of the day and finish by midnight |
| 2. Same day after start | At 8 PM the planner offered a 7 PM fixed-start talk, an 8:05 PM start, 28 morning options, and a 5–9 PM walk past its last useful entry | `planClock()`: nothing starts before now + 30 min. Fixed starts must be reachable. Drop-in windows can be joined late, with a shorter visit. A part of today that has passed offers nothing, and the UI says so. An impossible anchor gets a warning and no timetable |
| 3. Estimate scope | Not disclosed | `result.scope` (all `false`) plus a note under every plan, e.g. *"Time counts the stops and getting between them — not getting to the first stop, getting home or the food stop. Cost is per-person admission only — no parking, gas or food."* |
| 4. Company note | Read "Listings don't say their who it suits…", in the same list as conflicts | `warnings` (real conflicts, prominent) vs `info`: one neutral plan-level line, *"Not every listing says … so those preferences were only applied where it does."* |

- **Tests:** `tests/plan-clock.test.ts` has 16 tests, including a 500-plan same-day property test that produces 320 plans (208 with two stops). Twelve targeted mutations are each caught.
- **Existing tests:** updated for `warnings`/`info` and `time.start`/`time.end`. One PP-003 fixture moved to 3 PM, because a flexible stop can't start before the afternoon.
- **CI:** [run 44203197141](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44203197141): lint clean, 128/128 tests, typecheck and build OK.

**Remaining limitations**
- Travel to the first stop isn't estimated; the 30-minute lead is a fixed allowance.
- Place opening hours are unknown. Midnight is the hard stop for places.
- The secondary stop always comes after the primary; the planner doesn't reorder.
- A drop-in window assumes a 120-minute visit, and a late join needs at least 45 minutes left.
- UI changes are verified by typecheck and build only.

---

## Previous — Claude (engineering) → ChatGPT and owner, 2026-11-17 (Sprint 01 close-out)

Sprint 01 engineering PRs #14, #16, #18 and docs #17 are merged and deployed. This close-out PR adds:
- `tests/integration-sprint01.test.ts`: the #14 × #16 cross-PR tests (moved from `integration/sprint-01-review`, which can now be deleted), plus a test for the smoke check's rules.
- `scripts/smoke/prod.ts`: read-only production smoke check (public URLs, no credentials). Runs after every deploy (fails the workflow if the live site is broken or `pulse.json` is stale/inconsistent; the site itself stays deployed) and informationally on branch checks.
- `deploy.yml`: writes `dist/version.json` (`commit`, `builtAt`) so the smoke check can confirm which commit is live.

Production verification results are in STATUS.md.

### PP-003 and PP-004 (Sprint 01, engineering)
- **PP-003 → [#21](https://github.com/tybrathwaite1-lab/personal-playground/pull/21)** (`pp-003-venue-proximity`, base main).
  - Revalidated: city centers made every same-city pair "0 mi — an easy walk".
  - Now uses publisher ICS `GEO` venue coordinates when plausible (29 of 132 live events), and records precision per stop (venue, city or unknown).
  - Straight-line labels everywhere, and per-transport allowances for unverified distances.
  - No easy-walk claim without two pinned venues.
  - Optional sourced `coords` on places and communities, left empty: nothing invented.
  - 12 tests; 97/97 overall.
- **PP-004 → [#22](https://github.com/tybrathwaite1-lab/personal-playground/pull/22)** (`pp-004-budget-timing`, **stacked on #21**).
  - Revalidated all six findings.
  - Combined budget, no overlapping timed stops, and a strict time budget including travel and waits.
  - A random primary never runs longer than the outing.
  - Communities are filtered by their published time of day.
  - Explicit notes for anchor conflicts and for filters the listings can't answer. Food is never in the estimate.
  - 12 tests, including a 600-plan property test; 109/109 overall.

**Merge order:** #20, then #21, then #22. If #21's branch is deleted on merge, GitHub retargets #22 to main; otherwise change #22's base to main before merging.

**For ChatGPT / research:**
- Adding cited venue coordinates (`coords` with `source` and `verifiedOn`) for frequently used places and communities would make more pairs measurable.
- One judgment call to review: the "who it suits" note appears on every event when company isn't solo.

**Limitations:**
- No routing; all distances are straight lines.
- Place opening hours are unknown.
- The UI copy is verified by typecheck and build only, not in a browser.

---

## Previous — Claude → ChatGPT and owner, 2026-11-17 (review revisions)

Responds to ChatGPT's independent review of #14, #16, #17, #18. Every finding was reproduced before fixing (or explained below), and each fix has a regression test that fails when the fix is removed (mutation-checked locally). Synthetic fixtures and mocked services only; no private repository, data or credentials touched. Nothing merged.

### PR status (all mergeable; branches refreshed against main `7a69ad8`)
| PR | Branch | Check | Tests |
|---|---|---|---|
| [#18](https://github.com/tybrathwaite1-lab/personal-playground/pull/18) PP-008 | `pp-008-sync-safeguards` | [run 44193539402](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44193539402) ✅ | 45 |
| [#14](https://github.com/tybrathwaite1-lab/personal-playground/pull/14) PP-001 | `pp-001-event-sessions` | [run 44193828945](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44193828945) ✅ | 46 |
| [#16](https://github.com/tybrathwaite1-lab/personal-playground/pull/16) PP-002 | `pp-002-admission-price` | [run 44194150113](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44194150113) ✅ | 42 |
| integration (no PR) | `integration/sprint-01-review` | [run 44194241409](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44194241409) ✅ | 87 |
| #17 docs | `collaboration/sprint-01-engineering-handoff` | docs only | — |

**#17 "mergeability" finding:** not reproducible as a conflict — GitHub reported it mergeable/clean and `git merge-tree` is clean. The likely cause: the branch predated #15, so comparing its tip to main showed ChatGPT's `PP-005-integration-handoff.md` as "deleted", and `mergeable` reads `null` for a while after pushes. Main is now merged into the branch, so the file is present and nothing of ChatGPT's is overwritten.

### Findings and resolutions
**#18 — PP-008 sync**
| Finding | Reproduced? | Resolution · test |
|---|---|---|
| Re-verify immediately before each write | Yes — repo made public during the read (no conflict) still got the write | Second `verify` right before `write` · "repo made public during the read…" |
| Test real `verifyRepo()` with mocked fetch | Gap confirmed; malformed JSON threw a raw `SyntaxError` | Malformed/empty/non-object → fail closed (`public`) · 3 tests over public, missing, `"true"`, null, malformed, empty, 401/403/404/500, offline, no push |
| Full old → new → old compatibility | **Yes, real gap:** the old client only reads the single `settings` entry, so updated devices' setting changes never reached it, and a later old-device settings edit reverted them | File sent to GitHub also carries a legacy `settings` mirror (newest field stamp); reading it back is a no-op. Tested against a **verbatim copy of main's `sync.ts`** (`tests/fixtures/legacy/sync-v1.ts`) running the old loop. Format stays compatible → no new owner approval needed |
| Legacy value vs newer per-field tombstone | Yes — `upgradeReplica` ignored tombstones | Legacy wins only if newer than the field's last edit **or deletion** |
| Compare full config (owner/repo/path/token) | Yes — path and owner weren't compared | `sameConfig()` · tests incl. path-only change aborting a round |
| Stale error/completion state | Yes (code) | Stale rounds don't set status/error; `connect` also invalidates in-flight rounds. Code-reviewed only (no React test harness) |
| Document non-atomic verify/write; un-retractable writes | — | Documented in `syncRun.ts`, `github.ts` and #18 |
| *Found by the new tests:* old/new clients rewrote the file forever (key-order-sensitive comparison) | Yes | Order-insensitive change check · "…settle (no write ping-pong)" |

**#14 — PP-001 dedupe**
| Finding | Reproduced? | Resolution |
|---|---|---|
| Same venue name/street in conflicting cities or different addresses merged | Yes | Known differing cities or explicitly different street addresses never merge; venue-less listings still merge only into a single plausible match |
| Venue missing from UID-less fallback ids | Yes — same title/time at two venues collided | Venue slug added; final deterministic uniqueness pass |
| All-day vs timed at midnight | Yes — merged (same instant) | `allDay` must match |
| DST | Yes — 1:30 AM EDT and EST shared an id | UTC offset added only in the repeated hour; other ids stay readable |
| Price fields from one record | Yes, after combining with #16 — a free listing could inherit another's `priceMin` | Base listing stripped of all price fields; all four copied from one listing; absent ones stay absent. Cross-PR tests on the integration branch with real `priceFrom()` output |

**#16 — PP-002 prices** (all five fixtures reproduced; the RSVP one was already free)
| Listing text | Before | Now |
|---|---|---|
| Free cancellation up to 24 hours before the event. | Free | unknown |
| This event is not free. | Free | unknown |
| Free admission with RSVP. | Free | Free · RSVP |
| Tickets $20. Mandatory service fee $8. | $8–$20 (passed "≤ $25") | $28 incl. $8 fees |
| Tickets $25. Free photo booth. | Free and paid options | $25 |

Also: fees with no amount ("+ fees", "plus taxes and fees") or on several tiers keep the lowest price for display but no maximum, so `eventPriceRange` returns `null` and budget filters treat them as unknown; fees stated as included aren't added twice. Owner-approved lone-amount behavior unchanged. Kept as small rules, not a pricing engine.

### Remaining risks and accepted limitations
- **Sync:** privacy check and write are two requests (not atomic); an in-flight write can't be retracted; anything written before a repo goes public stays in its history. Mixed app versions: when an *old* device edits settings, it behaves like the old whole-object sync (could undo a concurrent change from a new device). Updating both devices removes this. Tombstones still expire after 180 days.
- **UID-less event ids** now include the venue (one-time id change for those listings, within the id change the owner already accepted for #14; no migration).
- **Dedupe:** the same event listed at different start minutes stays duplicated (deliberate); "Museum Closed…" non-event listings still appear; RRULE recurrence unexpanded (PP-007).
- **Prices:** free-text heuristics will still miss phrasings; when in doubt they now return unknown.
- **Not verified:** real devices, the React hook's stale-state guard (code review only), real-world sync with an actual private repo.

### Owner decisions
None required for these revisions. Earlier decisions stand (recorded in `DECISIONS.md` via #18):
1. PP-008 raised to P1 and fixed before PP-003/004.
2. PP-002: a lone dollar amount with no cue counts as the price.
3. PP-001: the merged-event id change is accepted (no alias map).
4. PP-008: per-field settings sync approved (now also mirrored for older app versions).

### Recommended merge order
1. **#18** (P1 privacy; independent of the others).
2. **#14**, then **#16** (they merge cleanly in either order; this order matches the integration branch). After both, the two cross-PR tests on `integration/sprint-01-review` (`tests/integration-sprint01.test.ts`) should land in a small follow-up PR.
3. **#17** last, so the docs describe what was merged.

Then PP-003 → PP-004, after review and owner approval.

---

## Previous — Claude → owner and ChatGPT, 2026-11-17 (first submission)
PP-001 (#14) and PP-002 (#16) submitted; PP-008 assessed (P1 recommended, no active exposure; [assessment](https://github.com/tybrathwaite1-lab/personal-playground/issues/9#issuecomment-6962315571)); owner confirmed the sync repository is private and answered the four decisions above; PP-008 fix submitted as #18. Superseded by the section above.

---

## Previous — ChatGPT → Claude, 2026-11-17

Await owner approval of Workshop PR before implementing. Read PROTOCOL.md, VISION.md, STATUS.md and AUDIT.md. Revalidate findings against current main and inspect open PRs; audit baseline is historical.

First engineering work: PP-001 and PP-002 (event normalization and dedupe), then PP-003 and PP-004 (planner accuracy). Prefer separate reviewable PRs. Add synthetic regression fixtures for distinct sessions, duplicate sources, free parking with paid admission, unknown pricing, distant venues in one city, overlapping events, aggregate budget, duration and anchor/filter conflicts. Do not fabricate coordinates or travel time. Preserve existing UI and data formats where possible; flag migrations for approval.

Evaluate privacy recheck concern PP-008 early; raise urgency if confirmed. No access to private data or tokens. Do not implement unrelated rewrites.

Return handoff: issue IDs, branch/PR URLs, changes, test commands/results, remaining risks, decisions needed and recommended next step. ChatGPT will independently review and research local sources/editorial content; owner approves merges.

Suggested session opener: "Read collaboration/HANDOFF.md and associated audit and protocol on main. Revalidate Sprint 01 findings, then implement the approved first task on a dedicated branch with tests and a PR. Report blockers and update the handoff."

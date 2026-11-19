# Handoff

## Latest — Claude (engineering) → ChatGPT and owner, 2026-11-19 (M1 security closeout)

- **Post-merge verification of M1 (`6efcd88`):** all passed.
  - Deploy run 44435684651: build 217/217, deploy, and smoke with `--expect-commit 6efcd88`.
  - The bundle is still `index-BCRZKX9R.js`, so the app is byte-identical to before M1.
  - Visual check 44435684597 (60 shots, 0 findings), Style guide 44435684591 (strict, 0 findings), Verify action pins 44435684508, and the publisher run 44436542218 (→ `visual-results/main-0d6e4079e367`).
- **Image scout trust boundary:**
  - The artifact is now extracted to `$RUNNER_TEMP/scout-artifact`. Every entry is validated before anything is copied, and validation fails closed:
    - no symlinks or special files;
    - the only directory allowed is `editorial`;
    - file names must start with a letter or digit and end in `.jpg`, `.webp` or `.json`;
    - JPEG and WebP signatures and JSON syntax are checked;
    - `results.json` is required, with at most 500 files and 50 MB.
  - Allowed files are copied as fresh 0644 files into a new `$RUNNER_TEMP/scout-publish`. Git runs only there, with system/global config ignored and hooks disabled.
  - `tests/image-scout-publish.test.ts` runs the workflow's own validation step against 23 malicious or edge-case artifacts.
  - The merged M1 version rejected `.git/config` and symlinks but accepted an empty `.git` directory, dot-files, leading-dash names, non-image content, invalid JSON and empty nested directories. No exploit path was found, but those gaps are now closed.
- **The `image-scout` branch (`cb6b8fe`):**
  - It has 0 commits of its own and is 96 commits behind main, so it is simply old main.
  - It still carries the pre-M1 privileged workflow: `contents: write` for the whole workflow, unpinned `@v4` actions, `npm install` with a write token, and the token in the push URL.
  - Its only differing content is `briefs.txt` containing `skip=skip`.
  - **Recommended:** the owner deletes the branch and recreates it from `main` when a scout run is next wanted. Nothing has been pushed, triggered or overwritten.
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

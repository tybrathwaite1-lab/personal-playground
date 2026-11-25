# Status — 2026-11-24 (creative exploration sprint closed; Creative Blueprint V2 approved; implementation planning beginning, Phase 3.4 on hold)

**Current verified baseline:** `main` at `cb09027` (PR #53, creative direction v1 docs, merged 2026-11-24; its tree is identical to the reviewed head `95cde85`). Deploy and smoke (`--expect-commit cb09027`, runs 45465483258 and scheduled 45483038065), Visual check (45465483391), strict style guide (45465483285, 0 findings) and visual publication (45466185208) all passed; the published default screenshots are 49/49 identical to Phase 3.3's reviewed head. Phase 3.3 production was verified at `8f3c41e`. The baseline before that was `49136fa` (R4, 2026-11-23: 27/27 browser, 320/320 unit and integration tests). Commits and test counts further down are historical baselines unless marked current.

**Sprint 02, "The Newsstand Effect", is in progress** (authorized by the owner on 2026-11-18). Sprint 01 "Make discovery dependable" is complete; production was verified at `68186d8`.

- **Screenshot review is live.** The verification harness (PR #25) and the safe screenshot publisher (PR #26) are merged. ChatGPT verified the live publication at `c0f07b0` (publisher run 44343202178), and every eligible branch's validated screenshots now appear on `visual-results`.
- **Done:** PR 0a / #27 (PP-011 reproducible builds), merged at `78a4e5e`; deploy and publisher verified on `main`.
- **Done:** PR 1 / #28 (accessible design tokens and typography with the approved Newsstand palette), merged at `c2a5974`.
- **Done:** PR 2 / #29 (graphic primitives, surface-aware controls, hidden `#/styleguide`, Caveat Bold accent). Owner-accepted at `2115aca` (zero manual defects), merged at `b8b39bc`, verified in production.
- **Done:** M1 security and reproducibility maintenance (#31), merged at `6efcd88` and verified in production (app byte-identical).
- **Done:** M1 closeout (#32): image scout artifact boundary, structural workflow tests, editorial image test.
- **M1 is closed** (ChatGPT's independent post-merge verification). The M1 baseline (historical) was `main` at `483ae64`: deploy, smoke (`--expect-commit`), visual, strict style guide, action pins and the publisher all passed; 230/230 tests.
  - The owner deleted the legacy `image-scout` branch (`cb6b8fe`); no image-scout run followed. `image-scout-results` is preserved at `71efe69`.
  - The hardened image-scout workflow has not run for real; that waits for owner authorization.
- **M2 test harness (closed):** the approved order was M2-1 → M2-2 → M2-7 → M2-3 → M2-4 → M2-5 → M2-6; all are merged and verified.
  - **M2-1 (test integrity) is closed:** PR #34 merged, `main` at `168f514`, post-merge checks passed.
  - **M2-2 (workflow security tests) is closed:** PR #35 merged, `main` at `4571b5b`, post-merge checks passed.
  - **M2-7 (blocking lint) is closed:** PR #36 merged, `main` at `f499a5b`, post-merge checks passed.
  - **M2-3 (deterministic planner tests) is closed:** PR #37 merged, `main` at `6bfbf0d`, post-merge checks passed.
  - **M2-4 (safety-critical utility tests) is closed:** PR #38 merged, `main` at `90d1eb4`, post-merge checks passed. It found one defect (personal-data URLs rendered without `isSafeUrl`) and two minor ones.
  - **Security fix (personal-data URLs) is closed:** PR #39 merged, `main` at `0185593`, post-merge checks passed (deploy and smoke on the new bundle). Real-browser verification is a required M2-6 case.
  - **M2-5 (Pulse ingest tests) is closed:** PR #40 merged, `main` at `eaa636e`, post-merge checks passed (closeout independently verified). It confirmed one defect, tracked separately: a previous `pulse.json` of the wrong shape stops the whole ingest.
  - **M2-6 (browser behaviour tests) is closed:** PR #41 merged, `main` at `4c6d9be`, post-merge checks passed. **M2 is closed** (independently verified). Required checks: `check` and `Visual and browser tests`.
- **Essential reliability closeout (not M3):** R1 previous Pulse snapshot validation → R2 production smoke reliability → R3 GitHub response validation → R4 repository-name parsing, one PR at a time.
  - **R1 is closed:** PR #42 merged as `b06c203`; production verified (ingest wrote `pulse.json`, previous snapshot validated with nothing left out, SPAA carry-over continuing).
  - **R2 is closed:** PR #43 merged as `183c395`; production smoke passed in ~1 s against `183c395` and exited promptly.
  - **R3 is closed:** PR #44 merged as `7ee7698`; production verified (deploy, smoke, visual, style guide and publish all passed).
  - **R4 is closed:** PR #45 merged as `49136fa`; production verified.
  - **The reliability closeout (R1–R4) is complete.** Creative implementation hasn't started; the owner and ChatGPT will prepare and approve Creative Brief v1 before the next implementation PR.
  - **Tracked separately:** low-priority UX ambiguity: a pending valid backup stays offered after a malformed file is chosen (M2-6).
- **Creative Brief v1 is approved** (owner and ChatGPT, 2026-11-23). **Creative Slice 01, "The Living Cover", is merged:** PR #47 as `983a371` (Deploy, Visual check, Style guide evidence and Publish visual results all succeeded on that commit).
- **Creative Slice 02, "Make It Yours":** Phase A approved with three refinements (2026-11-23). **B1 is merged** (PR #48 as `ff89cc6`): the isolated prototype at `#/preview/make-it-yours` with the journey shell and the Studio. **B2 is in review:** The Quiet Room (with its one self-hosted serif, Newsreader) and The Underground, completing all three looks. See HANDOFF.
- **Creative Slice 02 is merged** (PR #49 as `66110e5`). **Creative Slice 03, "From Prototype to Personal Playground":** the read-only architecture assessment is accepted with decisions D1–D6 (2026-11-24). Phase 3.1 (safety net) is merged (PR #50 as `8e56949`); Phase 3.2 (appearance foundation) is merged (PR #51 as `62c13c9`). **Phase 3.3 (shell atmospheres) is merged** (PR #52 as `8f3c41e`) and verified after merge: Deploy (smoke `--expect-commit 8f3c41e` passed), Visual check, strict style guide (0 findings) and visual publication all succeeded, and the published default screenshots are identical to the reviewed head (49/49). Phase 3.4 and later are not authorised.
- **Approved product direction (2026-11-24):** [Editorial Strategy v1](EDITORIAL_STRATEGY_V1.md) and [Living Cover Specification v1](LIVING_COVER_SPEC_V1.md). Direction, not implementation authorisation; conflicts with the current architecture are listed in HANDOFF and unresolved.
- **The creative exploration sprint is closed** (2026-11-24). [Creative Blueprint V2](CREATIVE_BLUEPRINT_V2.md) is the approved creative baseline, with [Experience Lab 06](references/experience-lab-06/README.md) as its primary interaction reference. DECISIONS (2026-11-24) records the sprint decisions and how they relate to earlier ones.
- **PR #54 (Blueprint V2 consolidation and architecture assessment) is merged** as `3e50d10`, verified after merge. D-N (thread-node URL hardening) is merged as `0a6f651`. PR 1 (Discovery foundation) is merged as `a731775`. **PR 2, the Editorial content foundation, is in review.** It adds validated standalone discovery records (the Edition 001 shortlist: 10 ready, 1 draft, none published), a public build that ships only published records, and report-only link classes. No UI changes. PR 3 and later need their own authorisation.
- **Implementation planning is beginning.** A read-only [architecture assessment](ARCHITECTURE_ASSESSMENT_V2.md) proposes a revised engineering sequence for review. **Phase 3.4 and all later feature work are on hold** until that sequence is approved. Earlier sequencing notes still stand: the thin Explore hub comes before the navigation switch, and browser-based PR previews are approved in principle and deferred (see DECISIONS).
- The Issue 09 creative package stays in draft until its integration phase. The current homepage stays until the Newsstand preview is approved.

## Sprint 01 — engineering (Claude): all merged
| ID | Issue | Outcome | PR · merge |
|---|---|---|---|
| PP-001 Preserve distinct event sessions | #2 closed | Sessions and venues kept apart; deterministic, order-independent dedupe | [#14](https://github.com/tybrathwaite1-lab/personal-playground/pull/14) · `0bba619` |
| PP-002 Admission price extraction | #3 closed | Admission-only prices, structured ranges, fees and uncertain totals, conservative "unknown" | [#16](https://github.com/tybrathwaite1-lab/personal-playground/pull/16) · `fec3c4e` |
| PP-008 Sync safeguards (raised to P1) | #9 closed | Privacy re-verified before every write, fails closed, old/new app versions compatible | [#18](https://github.com/tybrathwaite1-lab/personal-playground/pull/18) · `2dc4386` |
| Sprint 01 handoff docs | — | — | [#17](https://github.com/tybrathwaite1-lab/personal-playground/pull/17) · `8386c51` |
| Close-out: cross-PR tests + production smoke check | — | Post-deploy smoke job, `version.json` build stamp | [#20](https://github.com/tybrathwaite1-lab/personal-playground/pull/20) · `8205487` |
| PP-003 Venue proximity | #4 closed | Publisher venue coordinates when plausible, precision per stop, straight-line labels, no unverified "easy walk" | [#21](https://github.com/tybrathwaite1-lab/personal-playground/pull/21) · `7265213` |
| PP-004 Outing budget and timing | #5 closed | Combined budget, no overlaps, plan clock (overnight, same-day), drop-in vs fixed, scope disclosure, warnings vs neutral info | [#22](https://github.com/tybrathwaite1-lab/personal-playground/pull/22) · `68186d8` |

**Automated tests:** 24 at Sprint 01 start (`28607a2`) → **142** at Sprint 01 close (`68186d8`) → 230 at the M1 baseline (`483ae64`). **Current on main (`49136fa`): 320 unit and integration tests plus 27 browser scenarios, all passing.** Every Sprint 01 safeguard was mutation-checked: removing it makes at least one test fail.

## Production (verified)
**Current:** deploy of main `49136fa` (PR #45, run 45252119246): build ✅ (320/320), deploy ✅, smoke ✅ (`--expect-commit 49136fa`). Visual check 45252119205 (27/27 browser scenarios), style guide 45252119318 (0 findings) and publish 45253042152 all passed. Pulse 121 events from 6/7 sources (SPAA HTTP 403, 18 carried over). Branch protection now also requires `Visual and browser tests` alongside `check`.

Historical, M1 baseline: deploy of main `483ae64` (PR #32, run 44438959858): build ✅ (230/230), deploy ✅, smoke ✅ (`--expect-commit 483ae64`; bundle `index-BCRZKX9R.js`, unchanged since PR #29). Pulse 6/7 sources (SPAA 403, carried over).

Earlier: deploy of main `b8b39bc` (PR #29, [run 44410662810](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44410662810)):
- **Branch protection:** the active "Protect main" ruleset (#27562180) requires a pull request and the `check` CI job, blocks deletion and non-fast-forward updates, and has no bypass actors. `check` passed on the accepted commit `2115aca`. ChatGPT inspected the ruleset on 2026-11-18.
- **Jobs:** build ✅ (208/208 tests), deploy ✅, smoke ✅ (`--expect-commit b8b39bc` passed; bundle `index-BCRZKX9R.js`).
- **Pulse:** 128 events, 6/7 sources (SPAA HTTP 403, listings carried over).
- **Browser smoke test:** Home, Discover, Pulse and `#/styleguide` pass; the service worker is active and serves the new build.

Sprint 01 baseline:
Deploy of main `68186d8` ([run 44210815361](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44210815361)):
- **Jobs:** build ✅, deploy ✅ (Pages "Reported success"), smoke ✅.
- **Build log:** 142/142 tests (the Sprint 01 closing count); Pulse 134 listings → 132 events, 7/7 sources; 29 of 132 events with validated venue coordinates.
- **Post-deploy smoke check against the live site:** app shell, bundle, `sw.js` and manifest load; `pulse.json` fresh (generated 00:49Z), 132 events, 66 with structured prices, consistency checks pass.
- **`version.json` reports commit `68186d8`**, built 00:49:22Z. The smoke job's `--expect-commit` check passed.
- **Merged code = approved code:** `git diff 956dd4f 68186d8` is empty, so the merge commit's tree is identical to the head ChatGPT approved. The live bundle `index-CH5MV--X.js` is the same file CI built from `956dd4f` (run 44205215205).

## Research and editorial (ChatGPT)
- **PP-005** (#6, open): source inventory (#13) and feed diligence (#15) merged. Zero new feeds cleared; publisher permission and raw-feed tests are pending.
- **PP-009** (#10, open): editorial review (#19) and correction pass (#23) merged. Not an exhaustive certification; remaining checks are listed in `research/PP-009-corrections.md`.
- **Reviews:** independent reviews of #14, #16, #17, #18, #20, #21 and #22 all approved.

## Open backlog
Open issues: PP-005 #6, PP-006 #7, PP-007 #8, PP-009 #10, PP-010 #11, PP-011 #12. Follow-ups surfaced during Sprint 01 are in HANDOFF.md. **None are prioritized yet; that is the Sprint 02 planning conversation.**

## Outstanding verification
- PR 2 style guide: manual Safari (macOS and iOS, real device), zoom and reduced-motion acceptance **done** (owner, 2026-11-18).
- Real-device mobile/offline behavior, real-device sync, and visual review of the new planner and Pulse copy (PP-010).
- Reproducible-build lockfile (PP-011): done (#27). Follow-ups (Node metadata, authenticated action SHAs) were done in M1 (#31).
- **Pulse source degradation (SPAA):** the St. Petersburg Arts Alliance calendar has returned HTTP 403 to CI since about 19:19 UTC on 2026-11-18. It was reassessed on 2026-11-20 and is still 403 as of the `49136fa` deploy. Its listings are carried over, marked stale, and drop off as they expire: 23, then 20, now 18. The source's access restrictions will not be circumvented; the suggested next step is contacting the publisher.
- Recurrence expansion (PP-007).
- The React sync hook's stale-state guard is code-reviewed only.

Synthetic fixtures only throughout; no private data was accessed.

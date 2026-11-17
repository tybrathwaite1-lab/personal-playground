# Status — 2026-11-17 (night)

Phase I complete; Phase II live. Workshop merged (#1); Sprint 01 approved. ChatGPT's PP-005 research (#13, #15) merged. ChatGPT independently reviewed and approved #14, #16, #17, #18; **the owner merged all four.**

## Sprint 01 — engineering (Claude)
| ID | Issue | State | PR |
|---|---|---|---|
| PP-008 Sync safeguards | #9 | **Merged** (`2dc4386`) | [#18](https://github.com/tybrathwaite1-lab/personal-playground/pull/18) |
| PP-001 Preserve distinct event sessions | #2 | **Merged** (`0bba619`) | [#14](https://github.com/tybrathwaite1-lab/personal-playground/pull/14) |
| PP-002 Admission price extraction | #3 | **Merged** (`fec3c4e`) | [#16](https://github.com/tybrathwaite1-lab/personal-playground/pull/16) |
| Sprint 01 handoff docs | — | **Merged** (`8386c51`) | [#17](https://github.com/tybrathwaite1-lab/personal-playground/pull/17) |
| Close-out: cross-PR tests + production smoke check | — | In review · 88/88 · live smoke check passes | [#20](https://github.com/tybrathwaite1-lab/personal-playground/pull/20) |
| PP-003 Venue proximity | #4 | **In review.** Publisher GEO venue coords (29/132 live events), precision per stop, straight-line labels, no unverified "easy walk". 97/97 tests | [#21](https://github.com/tybrathwaite1-lab/personal-playground/pull/21) |
| PP-004 Outing budget and timing | #5 | **In review, stacked on #21.** Combined budget, no overlaps, strict time incl. travel/wait, long-primary rule, community time-of-day, disclosures. 109/109 tests | [#22](https://github.com/tybrathwaite1-lab/personal-playground/pull/22) |

## Production
Deploy of main `8386c51` ([run 44196232330](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44196232330)): 85/85 tests, build OK, Pages deployment reported success. The three earlier deploy runs were cancelled by the next merge (`concurrency: pages`), as designed.

Verified against the **live site** by the new smoke check (GitHub Actions; Claude's environment can't reach github.io directly): app shell, bundle `index-NnBygbxp.js` (same as the deploy build), `sw.js` and manifest load; `pulse.json` generated 23:06Z by that deploy, 132 events, 7/7 sources, 67 with structured prices (only produced by merged #16 code), 1 multi-source merge, consistency checks pass. From the next deploy on, `version.json` lets the check confirm the exact commit, and `deploy.yml` runs it after every deploy.

## Research and editorial (ChatGPT)
- PP-005: source inventory (#13) and feed-verification diligence (#15) merged. Zero new feeds cleared; publisher permission and raw feed tests pending. Integration steps in `research/PP-005-integration-handoff.md` depend on #14, #16 and PP-007.
- Independent review of #14, #16, #17, #18 completed and approved.

## Outstanding verification
Real-device mobile/offline behavior and real-device sync (PP-010), reproducible-build lockfile (PP-011) and recurrence expansion (PP-007) remain unverified. The React sync hook's stale-state guard is code-reviewed only (no React test harness; adding one is a new dependency). Synthetic fixtures only; no private data accessed.

## Next
ChatGPT reviews #20, #21, #22; owner approves merges (order in HANDOFF).

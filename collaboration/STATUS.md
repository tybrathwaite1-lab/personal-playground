# Status — 2026-11-18 (Sprint 02 "The Newsstand Effect" in progress)

**Sprint 02, "The Newsstand Effect", is in progress** (authorized by the owner on 2026-11-18). Sprint 01 "Make discovery dependable" is complete; production was verified at `68186d8`.

- **Screenshot review is live.** The verification harness (PR #25) and the safe screenshot publisher (PR #26) are merged. ChatGPT verified the live publication at `c0f07b0` (publisher run 44343202178), and every eligible branch's validated screenshots now appear on `visual-results`.
- **In review:** PR 0a (PP-011 reproducible builds and supported Actions runtimes); next, PR 1 (accessible design tokens and typography).
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

**Automated tests:** 24 at Sprint 01 start (`28607a2`) → **142** on main (all passing). Every Sprint 01 safeguard was mutation-checked: removing it makes at least one test fail.

## Production (verified)
Deploy of main `68186d8` ([run 44210815361](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44210815361)):
- **Jobs:** build ✅, deploy ✅ (Pages "Reported success"), smoke ✅.
- **Build log:** 142/142 tests; Pulse 134 listings → 132 events, 7/7 sources; 29 of 132 events with validated venue coordinates.
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
- Real-device mobile/offline behavior, real-device sync, and visual review of the new planner and Pulse copy (PP-010).
- Reproducible-build lockfile (PP-011): in review as Sprint 02 PR 0a.
- Recurrence expansion (PP-007).
- The React sync hook's stale-state guard is code-reviewed only.

Synthetic fixtures only throughout; no private data was accessed.

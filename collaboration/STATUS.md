# Status — 2026-11-17 (late evening)

Phase I complete; Phase II live. Workshop merged (#1); Sprint 01 approved. ChatGPT's PP-005 research (#13, #15) is merged. Engineering PRs are revised after ChatGPT's independent review; **nothing engineering is merged to main.**

## Sprint 01 — engineering (Claude)
| ID | Issue | State | PR · latest check |
|---|---|---|---|
| PP-008 Sync safeguards | #9 | **P1. Review revisions done.** Privacy verified at attempt start and immediately before every write; fails closed (incl. malformed responses); full-config staleness check; old/new app versions interoperate (legacy settings mirror). | [#18](https://github.com/tybrathwaite1-lab/personal-playground/pull/18) · [run 44193539402](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44193539402) — 45/45 |
| PP-001 Preserve distinct event sessions | #2 | **Review revisions done.** City/address conflicts never merge; all-day ≠ midnight; venue + DST-safe fallback ids; unique ids; price fields from one listing. | [#14](https://github.com/tybrathwaite1-lab/personal-playground/pull/14) · [run 44193828945](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44193828945) — 46/46 |
| PP-002 Admission price extraction | #3 | **Review revisions done.** Negation, policy/perk "free", stated mandatory fees added, uncertain totals excluded from budget filters, RSVP noted. | [#16](https://github.com/tybrathwaite1-lab/personal-playground/pull/16) · [run 44194150113](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44194150113) — 42/42 |
| PP-003 Venue proximity | #4 | Not started — waiting for review + owner approval | — |
| PP-004 Outing budget and timing | #5 | Not started (after PP-003) | — |

Each branch check runs lint, the full test suite, content checks, the live Pulse ingest and the production build (`tsc -b` typecheck + Vite).

**Combined:** `integration/sprint-01-review` = main + #14 + #16 + #18 + 2 cross-PR tests → [run 44194241409](https://github.com/tybrathwaite1-lab/personal-playground/actions/runs/44194241409): **87/87 tests, lint, typecheck and build pass.** Live ingest there: 127 listings → 125 events (2 genuine duplicates merged); prices: paid 40 · free 23 · free-for-some 2 · unknown 60. Against this morning's pre-revision report, every title present in both runs kept the same price except three free events that now say "· RSVP"; the higher unknown count comes from today's source mix (Lowry feed failed, TMA's "free with admission" listings returned).

## Research and editorial (ChatGPT)
- PP-005: source inventory (#13) and feed-verification diligence (#15) merged. Zero new feeds cleared; publisher permission and raw feed tests pending. Integration steps in `research/PP-005-integration-handoff.md` depend on #14, #16 and PP-007.
- Independent static review of #14, #16, #17, #18 completed; findings addressed (see HANDOFF).

## Outstanding verification
Real-device mobile/offline behavior and real-device sync (PP-010), reproducible-build lockfile (PP-011) and recurrence expansion (PP-007) remain unverified. The React sync hook's stale-state guard is code-reviewed only (no React test harness; adding one is a new dependency). Synthetic fixtures only; no private data accessed.

## Next
ChatGPT re-reviews the revisions; owner approves merges (suggested order in HANDOFF). PP-003 → PP-004 start only after that.

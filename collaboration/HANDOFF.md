# Handoff

## Latest — Claude (engineering) → ChatGPT and owner, 2026-11-17 (review revisions)

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

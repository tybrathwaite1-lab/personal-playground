# Handoff

## Latest — Claude (engineering) → owner and ChatGPT, 2026-11-17 (Sprint 01 closeout)

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
  - GitHub Actions warns that `actions/deploy-pages@v4` targets the deprecated Node 20.
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

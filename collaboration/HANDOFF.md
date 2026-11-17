# Handoff

## Latest — Claude (engineering) → owner and ChatGPT, 2026-11-17

**Issues:** PP-001 (#2), PP-002 (#3), PP-008 assessment (#9). All work is based on main `28607a2`. Nothing is merged, and only synthetic test fixtures were used. I didn't access any private data or tokens.

### PRs for review
- **PP-001, [#14](https://github.com/tybrathwaite1-lab/personal-playground/pull/14)** (`pp-001-event-sessions`)
  - Dedupe now requires the same title, the same start minute and the same venue (or street address).
  - Feed times are canonical New York instants, so UTC and TZID feeds no longer split duplicates.
  - The merged id is deterministic and order-independent. Cancellation applies per session. UID-less session ids include the time.
  - Main's logic hid 9 of 134 live listings.
- **PP-002, [#16](https://github.com/tybrathwaite1-lab/personal-playground/pull/16)** (`pp-002-admission-price`)
  - A price is read only from admission wording. Free extras, "free with admission" and member/qualifying-only free no longer count as free.
  - Mixed signals → "Free and paid options (see listing)". Ranges are kept.
  - New optional `priceMin`/`priceMax` fields, with a fallback for old data. The Pulse "cheap" filter is fixed.
  - The branch check prints a per-listing price report with its evidence sentences, for review.

### How to test
```
npm test        # #14: 36 pass · #16: 34 pass · both merged locally: 46 pass
npm run build   # both branch checks: lint clean, build OK
```
Live evidence is in each PR body and its linked Actions run (`check.yml` runs the real ingest).

### PP-008 assessment (#9): raise to P1
Confirmed: repository privacy is checked only at connect (`useSync.tsx:131`). Every later auto-sync writes without re-checking (`:58`, `:72`). The check also isn't fail-closed: only `private === false` is rejected.

If the private data repo is ever made public, every device would keep silently writing the full personal data set to it, including reader notes and the ~1 km location. Also confirmed:
- `settings` sync as one last-write-wins entry (`sync.ts:47`), so concurrent edits are lost.
- 180-day tombstone expiry (`sync.ts:31`).

This is not an active exposure. The fix is small: re-verify before every write and fail closed. Details and the proposed tests are in the issue comment. **Owner action now:** confirm the `playground-data` repo shows Private.

### Owner decisions (answered 2026-11-17, logged in DECISIONS.md via #18)
1. PP-008 raised to P1 and fixed **before** PP-003/004. Fix is in PR #18.
2. PP-002: a lone dollar amount with no cue **counts as the price** (current behavior kept).
3. PP-001: the merged-event id change is **accepted** as is (no alias map).
4. PP-008: per-field settings sync entries **approved** as part of the sync fix (included in #18).

### Remaining risks
- The same event listed at different start minutes stays duplicated (deliberate).
- Additive fees display as a range, and aggregator text sometimes mixes other events' prices.
- RRULE recurrence is still unexpanded (PP-007).
- A non-event listing ("Museum Closed for Thanksgiving") appears in live data. I suggest a small exclusion-rule follow-up.

### Recommended next step
Review and approve #14, #16 and #18 (independent; #14 and #16 merge cleanly together). Engineering then picks up PP-003 → PP-004. The PP-005 integration gates in #15 depend on #14 and #16 plus PP-007 for recurring feeds.

---

## Previous — ChatGPT → Claude, 2026-11-17

Await owner approval of Workshop PR before implementing. Read PROTOCOL.md, VISION.md, STATUS.md and AUDIT.md. Revalidate findings against current main and inspect open PRs; audit baseline is historical.

First engineering work: PP-001 and PP-002 (event normalization and dedupe), then PP-003 and PP-004 (planner accuracy). Prefer separate reviewable PRs. Add synthetic regression fixtures for distinct sessions, duplicate sources, free parking with paid admission, unknown pricing, distant venues in one city, overlapping events, aggregate budget, duration and anchor/filter conflicts. Do not fabricate coordinates or travel time. Preserve existing UI and data formats where possible; flag migrations for approval.

Evaluate privacy recheck concern PP-008 early; raise urgency if confirmed. No access to private data or tokens. Do not implement unrelated rewrites.

Return handoff: issue IDs, branch/PR URLs, changes, test commands/results, remaining risks, decisions needed and recommended next step. ChatGPT will independently review and research local sources/editorial content; owner approves merges.

Suggested session opener: "Read collaboration/HANDOFF.md and associated audit and protocol on main. Revalidate Sprint 01 findings, then implement the approved first task on a dedicated branch with tests and a PR. Report blockers and update the handoff."

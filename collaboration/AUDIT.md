# Phase II — preliminary static audit

Date: 2026-11-17. Baseline: [27c6400](https://github.com/tybrathwaite1-lab/personal-playground/commit/27c64001e5499e7af372a852c708fc2c150351bf). Source findings are static, not runtime reproductions. Revalidate against current head. Tests, live feeds, deployment, editorial facts, mobile and actual device sync were not independently verified. No private data inspected.

| ID | Priority | Finding / evidence | Acceptance criteria |
|---|---|---|---|
| PP-001 | P1 | [pulse.ts](../src/utils/pulse.ts): dedupe title/date/city can collapse different sessions or venues | Normalize start instant and venue; keep distinct sessions, merge genuine duplicates; stable IDs and cancellation behavior tested |
| PP-002 | P1 | [pulse.ts](../src/utils/pulse.ts): first dollar amount or free mention may not be admission | Free parking with paid admission not classified free; explicit admission costs/ranges retained; ambiguous text unknown; test fixtures |
| PP-003 | P1 | [adventure.ts](../src/utils/adventure.ts): city centroids used for stops | Verified venue coordinates where available, distinguish straight-line from route estimates, no claimed easy walk based merely on same city; unknown proximity labeled |
| PP-004 | P1 | [adventure.ts](../src/utils/adventure.ts): pair selection ignores combined budget and fixed-time overlap; duration, community constraints and anchor fallbacks need checks | Check total known cost and time including travel/buffer, no overlapping timed stops, long primary flagged or excluded, unknown costs explicit, date/company/energy/weather/anchor constraints consistently applied or disclosed; food excluded from estimate explicitly if unpriced |
| PP-005 | P1 | [pulseSources.ts](../src/data/pulseSources.ts): seven configured sources at audit, two marked unverified; narrow coverage is qualitative | Research 20–30 candidates with permission, reliability and freshness; prioritize independent music, markets, hands-on, games, waterfront and small gatherings; verify before activation |
| PP-006 | P2 | [check.yml](../.github/workflows/check.yml), [deploy.yml](../.github/workflows/deploy.yml), [build.ts](../scripts/drop/build.ts): strict content validation differs by environment | Production rejects duplicate issue/item IDs and invalid editorial library; keep last good deployment, review failure handling |
| PP-007 | P2 | [ics.ts](../src/utils/ics.ts): detects RRULE without expansion | Bounded recurrence expansion, exceptions, cancellations, timezones and distinct occurrence IDs tested |
| PP-008 | P2 | [github.ts](../src/utils/github.ts), [useSync.tsx](../src/hooks/useSync.tsx): privacy verified at connect, not each write. Browser token storage is a known tradeoff. Prior audit also flagged settings-level conflicts and 180-day tombstone expiry (reconfirm in sync.ts) | Fail closed on repository visibility before sync/write; synthetic tests for privacy changes, conflict handling, offline deletion, disconnect during sync; document residual race and token risks; no real data or credentials in tests |
| PP-009 | P2 | Eight initial editions not fact-checked independently | Verify claims, links, attribution, rights and editorial variety; follow EDITORIAL.md; reviewed changes only |
| PP-010 | P2 | Runtime behavior not independently verified | Record live mobile/desktop, offline/refresh, save/delete and synthetic concurrent sync test results; owner may optionally verify own devices |
| PP-011 | P3 | [deploy.yml](../.github/workflows/deploy.yml) uses npm install; README drift suspected | Determine lockfile status, use reproducible install where supported, reconcile docs with actual behavior |

Additional qualitative product opportunity: actual researched food suggestions rather than a generic nearby meal label; keep optional and do not invent establishments. Architecture is suitable for current scale. Priority labels are product triage, not formal security ratings. Potential privacy exposure deserves early investigation.

No code fixes or issue creation are part of Workshop initialization.

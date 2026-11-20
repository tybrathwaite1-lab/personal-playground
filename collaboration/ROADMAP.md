# Roadmap

## Sprint 01 — Make discovery dependable (complete, 2026-11-17)
Engineering items PP-001–PP-004 and PP-008 (elevated) are merged and verified in production (`68186d8`). Research and editorial items PP-005 and PP-009 have deliverables merged, with their issues still open for the remaining checks. See STATUS.md and HANDOFF.md.

| ID | Priority | Lead | Outcome |
|---|---|---|---|
| PP-001 | P1 | Claude | Preserve distinct event sessions: **done** (#14) |
| PP-002 | P1 | Claude | Accurate admission pricing or unknown: **done** (#16) |
| PP-003 | P1 | Claude | Venue-aware proximity, honest estimates: **done** (#21) |
| PP-004 | P1 | Claude | Respect outing budget, date, timing and constraints: **done** (#22) |
| PP-008 | P1 (elevated) | Claude | Sync privacy safeguards: **done** (#18) |
| PP-005 | P1 | ChatGPT | Research 20–30 candidate local sources, directory gaps and permitted collection: inventory and diligence merged (#13, #15); issue open |
| PP-009 | P2 | ChatGPT | Review eight editions; prepare curated expansion: review and corrections merged (#19, #23); issue open |

Engineering acceptance criteria are in AUDIT.md. Split work into small PRs. Research deliverable: source inventory with official URL, category, coverage, access/permission, freshness, cost, verification date and ingestion feasibility. Do not treat candidates as approved feeds. Review any proposed public content before publishing. Owner uses app naturally; feedback is optional, not homework.

## Sprint 02 — The Newsstand Effect (in progress, authorized 2026-11-18)
Shipped: PR 0a (#27, PP-011), PR 1 (#28 tokens and typography), PR 2 (#29 graphic primitives and hidden style guide). Next design step (thin Explore hub) awaits authorization. Browser-based PR previews: approved in principle, deferred.

Maintenance milestones:
- **M1 Security and reproducibility: closed** (#31, #32; baseline `483ae64`).
- **M2 Test harness: in progress.** M2-1 (test integrity, #34), M2-2 (workflow security tests, #35), M2-7 (blocking lint, #36), M2-3 (deterministic planner tests, #37) and M2-4 (safety-critical utilities, #38) are done. The personal-data URL security fix found by M2-4 is in review and comes before M2-5. Still to come: M2-5 (Pulse ingest), M2-6 (browser harness; must include imported valid and unsafe links).

## Sprint 01 backlog carried forward (status as of 2026-11-19)
Candidates, unranked:
- **Open issues:** PP-005 (sources), PP-006 (strict editorial validation), PP-007 (recurring calendars), PP-009 (remaining editorial checks), PP-010 (real-device mobile/offline/sync and UI review). PP-011 (reproducible builds) is done (#27, follow-ups in M1).
- **Sprint 01 follow-ups:** cited venue coordinates, non-event listing exclusion, tombstone expiry, React test harness (new dependency; now part of M2 planning), planner refinements, branch cleanup. Actions Node 20 deprecation is done (#27, M1).

Details are in HANDOFF.md. The standing principles still apply: prioritize confirmed security and data-integrity defects; no new backend or direct AI orchestration without a demonstrated need.

P1 high product priority, P2 medium, P3 maintenance; not security severity ratings.

# Decision log

## 2026-11-17 — Workshop initialization (proposed for owner review)
- Use existing public application repository as asynchronous coordination surface; documents hold persistent context, GitHub issues track work. Keep private information outside it.
- Keep ChatGPT as strategy/editorial/QA lead and Claude as engineering lead, owner retains approval. No direct API-to-API orchestration.
- Preserve the React/static GitHub Pages architecture and optional private sync; strengthen rather than rebuild.
- Prioritize local discovery reliability and breadth while retaining all three pillars. No productivity mechanics.
- Use branch and PR workflow; no direct main edits. Existing EDITORIAL.md remains publishing authority.
- Keep initial scope documentation-only; open tasks after owner approval. Sprint 01 priorities derived from preliminary audit, subject to revalidation against current main.

## 2026-11-17 — Owner decisions on Sprint 01 engineering findings
- **Fix PP-008 (sync privacy) next**, ahead of PP-003/PP-004. Raised to P1 priority; no active exposure (owner confirmed the sync repository is private).
- **PP-002:** a single dollar amount in a listing with no admission/other cue counts as the price.
- **PP-001:** accepted that merging duplicate listings now keeps the smallest source id, so a merged event's id may change once (a saved Pulse event can lose its link in that one case).
- **PP-008:** approved syncing settings as one entry per field (`settings:<name>`) instead of a single `settings` entry, as part of the sync fix. Old sync files upgrade automatically; devices on the old version keep working.

## 2026-11-17 — Sprint 01 closure
- **ChatGPT approved and the owner merged** all Sprint 01 engineering work: #14 (PP-001), #16 (PP-002), #18 (PP-008), #17 (docs), #20 (close-out and smoke check), #21 (PP-003) and #22 (PP-004, merge `68186d8`). Issues #2, #3, #4, #5 and #9 are closed.
- **Production verified at `68186d8`**, by the post-deploy smoke check and `version.json`.
- **Accepted limitations:** the limitations listed in HANDOFF.md ("Sprint 01 closeout") were accepted with these approvals. None are blocking; each stays a candidate for future work.
- **Sprint 02 priorities** will be agreed jointly by the owner, ChatGPT and Claude before any implementation starts. The open backlog and Sprint 01 follow-ups are recorded unranked.

## 2026-11-17 — Sprint 02 "The Newsstand Effect": owner decisions on the technical assessment
Context: Claude's read-only assessment of the approved creative direction (shared with ChatGPT for independent review). Implementation scope beyond item 1 still follows ChatGPT's review.
1. **Visual verification harness approved.** Browser screenshots plus layout and accessibility checks in CI. Dev-only `playwright-core` and `@axe-core/playwright`. Results are published to a dedicated `visual-results` branch, which needs `contents: write` in that workflow's publish job only. Built as its own PR; merge remains the owner's call.
2. **Fonts:** add one handwriting/annotation face; keep Anton for display (skewed with CSS where needed).
3. **Primary navigation:** Home, Explore, Plan, Pulse, Collection. Everything else stays reachable through the Contents menu, and no existing route is removed. Explore is a thin hub over Discover, Local and Digital. **No search in Sprint 02.**
4. **Japanese labels:** removed from navigation and section names; rare, relevant editorial use allowed.
5. **Rollout:** the new homepage ships first at a preview route and replaces Home only after the owner's real-device review (PP-010).
6. **Illustrations:** ChatGPT directs the art. AI-assisted illustration is acceptable for artwork only, never for anything presented as a real photograph. It's credited as such (e.g. "Illustration (AI-assisted)") and checked for resemblance to existing characters, logos or game sprites. Real places use real, licensed or owner-supplied photos (EXIF/GPS stripped).
7. **Practical pages** (Plan, Collection, Settings and the rest of the Toolkit) stay on the restrained dark ink surface.

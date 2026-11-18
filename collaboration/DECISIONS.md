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

## 2026-11-17 — PR #25 review: screenshot publishing withdrawn pending re-approval
- ChatGPT's review (P1) is correct: the owner approved publishing screenshots "to a dedicated branch", but the publish job ran branch-controlled code with `contents: write`, which GitHub grants **repository-wide**. Writing only to `visual-results` was a convention in a script, not a permission boundary.
- The harness is now **read-only**: screenshots and reports are an Actions artifact (14 days) plus a step summary. No job in this workflow can write to the repository.
- A safer publishing design (a `workflow_run` publisher that only ever runs reviewed code from `main` and treats the artifact as data) is proposed in HANDOFF.md. **It requires the owner's explicit re-approval** and a separate review before anything is built.
- The `visual-results` branch created by earlier runs holds only synthetic-fixture screenshots of the current app. It can be deleted at the owner's discretion.

## 2026-11-17 — Safe screenshot publishing (owner: option B)
- The owner approved building a safer screenshot publisher as a **separate, independently reviewed PR** (stacked on #25), kept apart from the design-foundation work. Long-term goal: Claude and ChatGPT can each evaluate visual work with minimal manual coordination by the owner.
- Requirements:
  - privileged code runs only from reviewed default-branch code;
  - artifacts are untrusted data;
  - validate provenance, file types, paths, sizes and counts;
  - reject symlinks, traversal and malformed artifacts;
  - least privilege; never execute artifact contents;
  - synthetic fixtures and public app content only;
  - security regression tests; documented residual risks; branch-protection recommendations.
- **No merge** until ChatGPT's independent security review and the owner's final approval. Design and residual risks: `collaboration/security/visual-publishing.md`.

## 2026-11-18 — Safe screenshot publisher, revision 2 (ChatGPT security review of `fc7000f`)
- **Screenshots are untrusted review material.** Branch code (app, build, package scripts, dependencies) produces them, so the harness-identity check is recorded as a consistency check, not an attestation. Reviewers treat screenshots as claims to verify.
- **Eligibility:** only pushes by an authorized contributor (`AUTHORIZED_ACTORS` in `policy.mjs`, currently the owner's account; changing it is a reviewed change to `main`) to an ordinary development branch are published, and only while that commit is still the branch head. Older runs never replace newer results.
- **Fail closed on the results branch:** the existing `visual-results` content is re-validated on every publish and never checked out. Anything unexpected stops publishing, leaving the branch untouched. As a result, the **legacy `visual-results` branch must be deleted before activation** (it uses the old layout).
- **Before activation, the owner applies the repository settings** in `collaboration/security/visual-publishing.md` (`main` ruleset, read-only default workflow permissions, fork-workflow approval, no Actions secrets) and **deletes the legacy branch**.
- PR #26 stays separate from Sprint 02 work and is retargeted to `main` now that #25 has merged.

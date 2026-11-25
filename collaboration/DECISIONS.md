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

## 2026-11-18 — Safe screenshot publisher, revision 3 (ChatGPT re-review of `19b4cfa`)
- **Only complete standard captures are published:** all widths, the 12 app routes, the full keyboard check set and all state records. Partial or diagnostic runs stay artifact-only. **A change to the app's route list must update `STANDARD_ROUTES` in the same PR** (a test enforces this). Older published folders that no longer match are dropped rather than carried forward.
- Synthetic fixtures and credential isolation are **safeguards, not proof** that published imagery contains no personal data. Screenshots remain untrusted review material.

## 2026-11-18 — Sprint 02 authorized; PR #26 verified live
- **Sprint 02 "The Newsstand Effect" is authorized.** Order: PR 0a (PP-011), then PR 1 (accessible tokens and typography), then the approved sequence. The thin functional Explore hub comes before the navigation switch, and the existing homepage stays functional until the owner approves the Newsstand preview.
- **Creative principles** (owner):
  - Consistency in experience; freedom in expression.
  - Creative freedom on the page; predictability in the controls.
  - Bold editorial compositions, expressive color, original artwork and varied edition identities.
  - St. Petersburg is our home, not our entire subject matter.
  - No goals, no quotas: just curiosity.
- **The Issue 09 creative package stays in draft** until its integration phase. No draft editorial content is published.
- **PR #26 live publication verified** by ChatGPT: production `c0f07b0`, publisher run 44343202178, results correctly generated on `visual-results`. Live refusal scenarios are exercised without writing to production results (HANDOFF.md).
- **PP-011 approach:**
  - The lockfile is generated on GitHub's runner (Node 24, npm 11), since Claude can't reach the registry.
  - Workflows use `npm ci` and Node 24.
  - Actions are pinned to full commit SHAs at releases verified to run on node24.
  - **Updating a dependency or action now means updating the lockfile or the pinned SHA in a reviewed PR.**

## 2026-11-18 — Design tokens and type hierarchy (PR #28 review)
- **Approved Newsstand palette** (background / foreground / muted / accent / focus):
  - Cream `#F1E3C6 / #20251F / #53594C / #923219 / #164AB7`
  - Editorial ink `#20251F / #FFF4DB / #C4C8B7 / #F4C632 / #F4C632`
  - Orange `#F47738 / #161A16 / #35231B / #44200D / #20251F`
  - Mustard `#F4C632 / #20251F / #51502B / #70310F / #164AB7`
  - Pink `#E99FB2 / #20251F / #51404A / #762345 / #164AB7`
  - Cobalt `#164AB7 / #FFF4DB / #DCE6FF / #F4C632 / #F4C632`
  - Olive `#A8B56B / #20251F / #394126 / #343D19 / #20251F`
  - Forest `#204E3F / #FFF4DB / #C5D8C7 / #F4C632 / #F4C632`
- **Surfaces:**
  - The Field Guide ink, raised and hunter surfaces are preserved. Editorial ink has its own semantic identity (`surface-editorial`), and the application background is unchanged.
  - Control boundaries use `--control` (≥ 3:1); `--rule` is decorative only.
- **Type hierarchy:** ordinary body 16px; editorial body 17–18px; labels 12–13px; display ≈ 40–56px mobile and 72–112px desktop. Oversized, unusually tight type is for deliberate cover treatments only.
- **Zoom:** rem-based sizing is a design safeguard, not proof of 200% zoom; manual reflow verification remains required.
- **PR 2's handwriting accent:** Caveat Bold, self-hosted via Fontsource with license and transfer-size verification. One handwritten face only, never for essential labels or body copy.

## 2026-11-18 — Graphic primitives and the style guide (PR 2)
- **Decoration and content are separate:** every decorative layer (paper edges, tape, grain, annotations, decorative stamps) renders through one `aria-hidden`, `pointer-events: none` wrapper. Essential text and controls never depend on it.
- **New components use the surface-aware controls and tokens** (`.ui-*`, `text-fg`, `border-control`, …), not fixed Field Guide color utilities.
- **Caveat Bold** (`@fontsource/caveat` 5.3.0, OFL-1.1) is the single handwritten face: decorative only, Latin 700, loaded only with the `Annotation` component.
- **Artwork credits are always explicit** (illustration, AI-assisted illustration, or photo). AI-assisted artwork is never presented as a photograph.
- **Preview routes** (e.g. `#/styleguide`) live outside `ROUTES` and navigation, and are code-split. Their screenshots come from a separate read-only evidence workflow, so the standard screenshot matrix and the publisher's security policy stay unchanged.

## 2026-11-18 — PR 2 accepted; browser-based PR previews (direction only)
- **PR #29 accepted and shipped:** ChatGPT approved it, the owner accepted `2115aca` with zero manual defects, and it was merged as `b8b39bc` and verified in production.
- **Manual acceptance without a local toolchain:** use a GitHub Codespace on the exact PR commit. Confirm the commit with `git rev-parse HEAD`, run the Vite development server (no service worker in development builds), keep the forwarded port **Private**, and never connect Sync.
- **Browser-based PR previews:** a gated Cloudflare Pages upload with Cloudflare Access is **approved in principle, with revisions**, and **deferred**. No infrastructure, secrets, accounts or workflows yet. Requirements before implementation:
  - Verify Access protects the immutable deployment addresses, branch aliases and the root `pages.dev` domain.
  - Reject `_worker.js`, Functions, deployment configuration files, archive traversal and symlinks in uploaded output.
  - Run Wrangler only from a trusted, pinned environment.
  - Reconcile the push-based Check and Visual workflows with preview eligibility, and handle races in workflow completion order.
  - Verify exact-commit artifact provenance and current PR eligibility before publishing.
  - Disable Sync in the underlying implementation, and test that no Sync requests occur.
  - Document that the API token's scope covers the whole Cloudflare account.
  - Evaluate owner-triggered previews as a simpler first iteration.
  - Include the strict style-guide checks in eligibility where applicable.

## 2026-11-18 — M1 maintenance: CI security and reproducibility
- **Least privilege by default:** every workflow sets an explicit read-only default. Write scopes live only on the job that needs them (Pages deploy, the two results publishers), and those jobs run no npm, npx or tsx. `tests/workflow-security.test.ts` enforces this, including job-level overrides.
- **No persisted checkout credentials; tokens only through step-level `env`:** never in `run:` text, URLs, action inputs, or job or workflow env.
- **Write-enabled publication is separated from generation** by an artifact boundary wherever the job also runs third-party code (image scout, as the screenshot publisher already did).
- **Action pins:** `.github/action-pins.json` is the trusted manifest. A pin changes only through a reviewed edit to it, after upstream verification; remote checks report and never update pins.
- **Node 24 via `.nvmrc`** is the single source for CI and local setup.
- **Dependency install scripts are denied by default** (`strict-allow-scripts`). Approving one requires a reviewed `allowScripts` entry with evidence it is needed.
- **The production dependency audit is informational:** an unavailable audit is never treated as clean, and remediation is always a separate reviewed change.
- **Pulse source access restrictions are respected:** a blocked source is reported and carried over until it expires, never worked around.

## 2026-11-19 — Image scout: artifact boundary and retiring the stale branch
- **Untrusted artifacts:** an artifact from a job that ran third-party code is extracted outside the workspace and checked in three fail-closed phases: a checked enumeration; metadata limits before any content read; then signature bytes and JSON syntax. Only allowed files are copied into a clean directory, and only that directory becomes a git repository. Image validation is a signature check, not a full decode, and is documented as such.
- **Retiring the stale branch:** `image-scout` at `cb6b8fe` is an old snapshot of main (0 unique commits) that still carries the pre-M1 privileged workflow. Strategy:
  - The owner deletes **only** `image-scout`; `image-scout-results` stays as the latest scout output.
  - When scouting is next needed, the owner recreates `image-scout` from current `main`, with real briefs.
  - That push is the first real run of the hardened workflow, so it happens only with explicit owner authorization.
  - Claude doesn't delete, push to or recreate either branch.
- **Owner steps to delete only `image-scout`:**
  1. On GitHub, open the repository → **Code** → the branch selector → **View all branches** (or go to `/branches`).
  2. Search for `image-scout`. Two branches will match: `image-scout` and `image-scout-results`.
  3. Confirm the row is exactly `image-scout`, with latest commit `cb6b8fe`.
  4. Click its trash-can icon. Don't touch the `image-scout-results` row.
  5. Check that `image-scout-results` is still listed at `71efe69`, and that the **Actions** tab shows no new "Image scout" run. Deleting a branch isn't expected to start one; if one appears, cancel it and report it.
  - GitHub offers **Restore** right after deletion if the wrong branch was removed.

## 2026-11-24 — Creative direction consolidated: Editorial Strategy v1 and Living Cover Specification v1
- The owner and ChatGPT approved [Editorial Strategy v1](EDITORIAL_STRATEGY_V1.md) ("The library has shelves. Curiosity doesn't.") and [Living Cover Specification v1](LIVING_COVER_SPEC_V1.md) ("One Playground. Many personalities.") as product direction.
- They are direction, not implementation authorisation: Phase 3.4 and any change to application code, data models, ranking, publishing, Sync or workflows still need their own scoped authorisation. Undecided algorithms and privacy policies (for example lead selection, recent-thread continuity) stay undecided.
- `EDITORIAL.md` remains the operational publishing guide for The Weekly Drop; where it differs from Editorial Strategy v1 (listed in HANDOFF, 2026-11-24), the difference is open for an owner decision, not silently reconciled.
- Phase 3.3 (shell atmospheres, PR #52 as `8f3c41e`) verified in production the same day.


## 2026-11-24 — Creative sprint closed: Creative Blueprint V2 is the creative baseline
The exploratory creative sprint is closed: ChatGPT was creative director and independent reviewer, the owner was product owner. The sprint's prototypes explored the magazine, the curiosity shop, the gallery, belonging, a unified experience, the constellation, progressive disclosure, and desktop and mobile layouts.

The owner approved [Creative Blueprint V2, Definitive Edition](CREATIVE_BLUEPRINT_V2.md) as the creative baseline. [Experience Lab 06](references/experience-lab-06/README.md) is its primary interaction reference: reconstructed images and a description, not production requirements.

This is direction, not implementation authorisation. Phase 3.4 and all later feature work are on hold until a revised engineering sequence is approved. The read-only assessment for that is in [ARCHITECTURE_ASSESSMENT_V2](ARCHITECTURE_ASSESSMENT_V2.md).

**Approved creative decisions from the sprint**
- **North Star**, to be preserved in project documentation:
  - *Old internet spirit, modern possibilities.*
  - *Build somewhere worth visiting, not something that demands attention.*
  - *Reveal the connections. Preserve the wonder.*
- **Objective:** somewhere people enjoy visiting, not engagement, time spent, clicks or consumption.
- **Four qualities of one experience** (not modes or destinations): Magazine, Curiosity Shop, Gallery, Hideaway.
- **Three experience pillars:**
  - **The Living Cover**, for anticipation ("What's waiting for me today?");
  - **The Living Constellation**, for association ("What else could this connect to?"), approved as a signature feature;
  - **My Finds**, for attachment ("What has stayed with me?").
  - **The Collection** gives predictable access to the published library.
- **A discovery** is any interesting thing worth sharing, including things not yet categorised. Its page offers:
  - visual presentation where appropriate;
  - concise context;
  - accurate creator and source attribution;
  - access to the original or a primary source;
  - a simple way to keep it;
  - optional deeper observations;
  - meaningful connections.
  Not every element is required.
- **Progressive disclosure:** Enjoy → Associate → Explore → Understand. Each level is optional.
- **Constellation principles:**
  - familiarity is an entrance, not a boundary;
  - connections may cross any subject;
  - connections are never manufactured to add density;
  - documented connections and editorial interpretations must be distinguishable;
  - visitors can explore, expand, recentre and retrace freely;
  - the wider view is optional, and the whole graph is not exposed by default;
  - there are no completion requirements.
- **Deliberately avoided:**
  - infinite feeds and artificial urgency;
  - mandatory onboarding;
  - mood-based categorisation;
  - restrictive personalisation;
  - manufactured connections;
  - unnecessary gamification;
  - literal virtual-space simulations;
  - exposed technical complexity;
  - mediocre content published for volume.
- **The voice is the founder's to begin with,** but the architecture must later support other editorial personalities without a separate app or a hard-coded identity.

**How the blueprint relates to earlier decisions**

Earlier decisions stay in force where compatible. Nothing below is silently reconciled: items marked *needs confirmation* are also listed as open questions in HANDOFF.

| Earlier decision | Blueprint V2 | Effect |
|---|---|---|
| VISION: three pillars, **Go Somewhere** (local), **Do Something**, **Discover Something**. Local discovery in Tampa Bay is a primary use case. | Three *experience* pillars: Cover, Constellation, My Finds. Places are one kind of discovery. Local discovery isn't mentioned. | **Coexists** (confirmed in review, 2026-11-24). The product pillars stay, and the experience pillars sit alongside them. Local discovery, Pulse and the outing tools are preserved; the blueprint doesn't authorise removing them. Their arrangement in navigation after promotion is still open. |
| Editorial Strategy v1, identity: culture magazine, exploratory gallery, personal library | Magazine, Curiosity Shop, Gallery, Hideaway | **Extends** (adds the Curiosity Shop and the Hideaway). |
| Editorial Strategy v1, voice: "confident, curious, expressive, knowledgeable…, occasionally playful" | "curious, confident, knowledgeable, understated and occasionally playful"; "We invite. We don't lecture." | **Clarifies.** "Understated" replaces "expressive" for the writing voice; expressiveness moves to composition. |
| Editorial Strategy v1, balance: about 60/40 archival to current, as guidance. `EDITORIAL.md`: about half archive, a third timeless, some contemporary. | "Balance archival, timeless, contemporary and emerging material without rigid quotas" | **Appears to supersede the 60/40 figure**, and is closer to `EDITORIAL.md`'s categories. *Needs confirmation.* |
| Editorial Strategy v1: open discovery, quality gates, sources, automation path | Same principles (§11) | **Consistent.** |
| Living Cover v1: shared lead; personalisation only in supporting discoveries; lead stable about 5–7 days; layered refresh; no urgency | A shared editorial identity stays recognisable; supporting content may respond to interests; the cover evolves deliberately, "when ready"; it is finite | **Consistent and extends.** Adds a finite cover, content-led composition, and occasional unexpected subjects. The 5–7 day guidance stands unless revised. |
| Living Cover v1: Collection (library), **Saved Discoveries** (personal shelf) | Collection (library), **My Finds** (personal) | **Supersedes the name** "Saved Discoveries" with "My Finds". The app's current **My Collection** is the personal shelf, so naming and navigation are *needs confirmation* (navigation changes need separate authorisation). |
| Living Cover v1: discovery pages with Visit Original, Save and connections | The same, plus *Look closer* and the constellation; "Keep this" for saving | **Extends.** |
| Living Cover v1: returning visitors get subtle continuity; recent-thread continuity needs a privacy decision | "Retrace" the current exploration; no dashboards | **Extends.** Retracing the *current* exploration is approved; persistence beyond it still needs that privacy decision. |
| Living Cover v1 and Slice 03 D3: the original appearance is preserved; atmospheres change presentation only | Same (§10) | **Consistent.** |
| Slice 03 D1–D6 (device-local appearance; separate taxonomy; preserve the default; shell and page consistent; time-of-day atmosphere; Erase later) | Not contradicted | **Stand.** |
| Slice 03 phase plan: 3.4 homepage compositions, 3.5 controls, 3.6 interest-guided discovery (as named in the Phase 3.3 authorisation) | Implementation proceeds incrementally, subject to engineering assessment | **On hold.** It will be replaced by a revised sequence once approved. |
| Slice 02 Make It Yours prototype (look choice, then interests) | "Earlier experiments provide supporting context, not additional mandatory features"; no mandatory onboarding | **Clarifies.** It stays an isolated preview, and any onboarding must be optional. |
| Discovery Engine "Mood" dial and Plan an Outing "Mood" chips, both optional filters (`src/utils/labels.ts`) | "We do not ask visitors to classify their emotional state or define their mood before exploring"; avoid mood-based categorisation | **Preserved for now** (review, 2026-11-24). The existing optional filters stay unchanged. The new experience adds no mood questions or profiling. A future UX review of the existing filters is a separate decision. |

**Review clarifications (ChatGPT, PR #54, 2026-11-24)**
- **The cover.** A cover issue that's identical for everyone is a *first-slice simplification* only.
  - The long-term approach stands: one shared editorial lead, plus supporting discoveries that may be shaped by interests, always leaving room for surprise.
  - Atmospheres change presentation, never selection.
- **Relationships.** Traversal may go both ways, but each relation's authored direction, factual meaning and note are preserved, never implicitly reversed.
  - Reciprocal or differently-worded records between the same pair are independent claims and are kept.
  - Only identical records (same source, target, relation and basis) are duplicates.
- **Hidden preview routes are unlinked, not access-controlled.** Anything in them, including visitor-testing content, must be public-ready and properly licensed.
- **Constellation geometry.** Fixed slots and two rings are initial proposals. Acceptance is about readable labels, accessible relationships, touch targets and mobile use with real titles, not prototype geometry.
- **Publishing gates.** Image rights, verified content and relationship quality are acceptance gates. Link failures get a human decision rather than an indiscriminate automatic block.
- **Security maintenance.** The `ThreadPanel` node-URL hardening is a separate maintenance candidate. It is not a confirmed exploit, since all current URLs are https.

## 2026-11-24 — D-N authorised: thread-node URL hardening (security maintenance)
- The owner authorised D-N as a standalone, preventive maintenance PR. It is not the discovery foundation or Phase 3.4.
- Thread nodes are now validated at build (required fields; https URLs passing `isSafeUrl`), and invalid ones are left out of `drop.json`. `ThreadPanel` renders node links only when `isSafeUrl` passes.
- Link *availability* checks and the content gate (D-D) are unchanged and still open.


## 2026-11-25 — Editorial Room: direction, creator-first policy, Edition 001 shortlist (PR 2)

**Editorial direction: Personal roots, limitless curiosity.**

The Playground has a recognisable editorial perspective without restricting itself to particular subjects, cultures or interests.
- A point of view, not a perimeter.
- The curator should be as open to discovery as the visitor.
- Balance should emerge over time, not be manufactured in every edition.
- Cast a wide scouting net, and select discoveries on their individual merits.
- Connections must be meaningful, never manufactured to satisfy a quota.
- A discovery may stand on its own.
- Categories, geography, historical periods and contemporary representation must not become mandatory editorial quotas. This settles D-L in favour of the blueprint's "balance without rigid quotas": the 60/40 figure in Editorial Strategy v1 is no longer guidance.

**Creator-first policy (approved).**
- Prominent creator recognition and attribution.
- Meaningful pathways to the original work.
- Respect for creator-controlled distribution and usage rights.
- An intention to support and commission independent creators if the project becomes financially sustainable.
- **Not authorised:** any compensation percentage, financial obligation or creator outreach programme.

**Prototype-stage image rule (settles D-A for now).** We are validating the experience, not preparing a commercial launch.
- The existing open-licence safeguards stay. Use only verified, compatible assets, original non-infringing graphics, or deliberately image-free presentation.
- **Never used:** unlicensed artwork, album covers, game screenshots, hotlinked images or copyrighted editorial photography.
- GitHub Pages previews are public even when unlisted. Neither prototype status nor the lack of monetisation overrides these safeguards.
- Missing imagery never keeps an otherwise suitable discovery out.
- **Deferred:** creator outreach, commissions, broader licensing and commercial publication review.

**Engineering decisions in PR 2.**
- **D-B:** option (b). Standalone records live in `content/discoveries/*.json`. They are validated, share one id namespace with Drop items and thread nodes, and join the discovery graph.
- **D-D:** structural link errors fail validation. Whether links work is checked by a report-only command that classifies each link as invalid, permanent, blocked, transient or intentional. A permanent or blocked link needs a recorded `linkReviews` decision before publication. Transient network failures never block CI.
- **D-C, Edition 001's working shortlist:** eleven discoveries, selected by the owner. Twelve was a target, not a requirement.
  - Ten are verified and marked `ready`.
  - SEED Erosion Blocks stays a `draft`: no creator documentation was found.
  - None is published. A publication date is a separate decision.
- **Relationships:** the eight proposed associations are recorded as editorial (interpretive) claims, each authored once. William Onyeabor has none, by design.

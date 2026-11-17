# The Workshop — collaboration protocol

## Roles
- Product owner: direction, priorities, approval and merge decisions.
- ChatGPT: product strategy, independent QA, research and editorial contributions.
- Claude: engineering, implementation and regression tests.

These are working roles, not GitHub account assignments. Sessions are initiated by the owner; assistants do not communicate autonomously.

## Working loop
1. Read VISION, STATUS, ROADMAP, HANDOFF and relevant issues; inspect current main and open PRs before editing.
2. Agree scope and acceptance criteria; use GitHub issues for individual tasks (PP IDs are stable references, not issue numbers).
3. Work on a dedicated branch, avoid overlapping edits, and keep PRs small. Link issue and evidence.
4. Run relevant tests/build and disclose failures, skipped checks, source limitations and assumptions. Independent review precedes owner approval.
5. Owner merges; update STATUS and HANDOFF with outcomes, next steps, branch/PR links and blockers. Record significant choices in DECISIONS.
6. Treat roadmap as directional; issues track execution. Do not duplicate existing editorial instructions.

## Guardrails
No direct writes to main, merges, destructive operations, paid services or expanded permissions without explicit owner approval. Public repository: no credentials, private user data, precise home location or personal notes. Never access private sync data without explicit authorization; use synthetic fixtures for tests. Keep secrets out of logs and commits. Use permitted sources, verify event facts and imagery rights, distinguish estimates and unknowns. No unreviewed editorial auto-publication. Preserve sync and backups; avoid unnecessary architectural complexity. If work conflicts, stop and coordinate through the owner.

## Definition of done
Acceptance criteria satisfied, tests and evidence recorded, limitations clear, no unintended scope changes, PR reviewed and owner approval obtained. Do not describe a proposed or untested change as completed.

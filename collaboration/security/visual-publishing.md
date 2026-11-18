# Security: publishing visual-check screenshots

**Purpose.** Let the owner, ChatGPT and Claude each review screenshots through git (the `visual-results` branch) without manual hand-offs and without ever giving branch code write access.
**Owner approval:** 2026-11-17 ("option B", with the requirements below). It was built as a separate PR and requires ChatGPT's independent security review and the owner's final approval before merge.

## Data flow
1. A push runs **Visual check** (`.github/workflows/visual.yml`): read-only, branch code, synthetic fixtures, frozen clock, external requests blocked. It uploads the artifact `visual-<sha>`.
2. When that run completes, **Publish visual results** (`.github/workflows/visual-publish.yml`) starts via `workflow_run`. GitHub always runs `workflow_run` workflows from the **default branch's** definition.
3. The publish job clones the **default branch** with plain `git` (unauthenticated, public repository) and runs `scripts/visual/publish/publish.mjs` from it with the runner's Node.
4. The script validates the run and the artifact, regenerates the report from validated data, and force-pushes one parentless commit to `visual-results`.

## Requirements and how each is met
| Requirement | Control |
|---|---|
| Privileged publishing executes only reviewed default-branch code | `workflow_run` uses the default branch's workflow file. The job clones only the default branch. **No third-party actions and no `npm install`** run in the job (zero-dependency `.mjs` modules) |
| Treat artifacts as untrusted data | The zip is parsed **in memory** by our own reader (`zip.mjs`) and validated in full before anything is written. Nothing from it is executed, imported or interpreted as code |
| Validate provenance | The triggering run must be: this repository, not a fork, event `push`, workflow name `Visual check` and path `.github/workflows/visual.yml`, `completed`/`success`, with id, sha and branch matching the event. Exactly one unexpired artifact named `visual-<sha>`, belonging to that run and commit |
| Validate harness provenance | Publishes **only if** `.github/workflows/visual.yml`, `scripts/visual/run.ts`, `scripts/visual/selftest.ts` and `tests/fixtures/visual/` have the **same git object ids** on the branch commit as on the default branch. A branch that changes the harness isn't published (its artifact stays downloadable) until the change is reviewed and merged |
| Validate file types, paths, sizes, counts | Strict allowlist: `<width>/<route>(-fold).jpg` for widths 320, 390, 768, 1280 and 1440; `states/<name>.jpg`; `report.json`; `REPORT.md` (ignored). Limits:<br>• ≤ 400 entries<br>• ≤ 8 MB per file<br>• ≤ 120 MB extracted<br>• ≤ 80 MB zip (also enforced while streaming the download)<br>• compression ratio ≤ 50× (JPEG) or 200× (JSON) |
| Reject symlinks, traversal, malformed artifacts | Rejects:<br>• symlinks and any non-regular Unix type<br>• absolute paths, backslashes, `.`/`..` segments, empty segments, non-ASCII or odd characters<br>• duplicates<br>• encryption; compression other than stored/deflate<br>• local/central header mismatches, CRC and size mismatches<br>• truncated archives, multi-disk archives<br>Zip64 is supported and validated |
| Content validation | JPEG: SOI/EOI markers, a frame header, and pixel width equal to its folder width. `report.json`: strict UTF-8 JSON object with the expected shape; unknown fields dropped; strings capped; re-serialized. **`REPORT.md` from the artifact is never published**: it's regenerated from validated data, with all artifact text escaped to plain text and links only to files that were published |
| Least privilege | Workflow-level `permissions: {}`. Job: `actions: read`, `contents: write`. The token lives in **one step's** environment and is used only for API reads and the final push. Git receives it through an env-scoped `http.extraheader`, never on a command line or in a URL. The artifact-storage redirect is fetched **without credentials** |
| No shell injection | Event values are passed only through `env:`. The script uses `execFile` with argument arrays (no shell). Folder names are sanitized to `[A-Za-z0-9._-]` |
| Screenshots limited to synthetic fixtures and public app content | Enforced by the **unchanged, reviewed harness** (harness-identity check): synthetic Pulse and weather fixtures, public `drop.json`, frozen clock, fresh browser profile, service worker blocked, all other external requests blocked. CI holds no personal data |

## Tests
- `tests/visual-publish.test.ts` (19 tests): every archive, path, content and provenance rule, with hand-crafted malicious zips.
- `tests/visual-publish-e2e.test.ts` (4 tests, 10 refusal cases): the real `publish.mjs` as a child process against a mock GitHub API and real local git repositories.
  - Happy path: one parentless commit; regenerated report; the branch's own Markdown is never published; no credentials sent to storage; token never printed.
  - Pruning of deleted branches.
  - Harness-changed branch: skipped, and the artifact is never fetched.
  - Refusals: symlink, traversal, executable payload, malformed zip, `pull_request` run, fork, other workflow, artifact from another commit, missing artifact, wrong-width screenshot. Each writes nothing.
- **Interoperability:** archives from Python `zipfile` (including forced zip64) and the `zip` CLI, and real Playwright JPEGs, pass validation.
- **Mutation checks:** removing any of 12 safeguards fails at least one test (symlink, character allowlist, dot segments, CRC, local name, push-only, fork, branch Markdown, JPEG check, Markdown escaping, credentials to storage, harness identity).

## Residual risks
1. **The `GITHUB_TOKEN` is repository-wide** during the publish job (GitHub can't scope it to one branch). Mitigation: only reviewed default-branch code runs with it, and the recommended `main` ruleset below stops it from changing `main`.
2. **Anyone with push access can get their branch's *app* rendered and published,** since the harness is unchanged but app code isn't. App code could render arbitrary text or images, and the build could embed external content. People with push access can already commit arbitrary content, so this adds visibility, not capability. Screenshots are public, like the repository.
3. **Pixel content isn't inspected;** only structure and dimensions are.
4. **The pre-merge test boundary:** `workflow_run` only activates from the default branch, so the full workflow can't run in CI before merge. The script is covered end to end locally and in `npm test`; live verification happens after merge (below).
5. **Trust in the runner image's `git` and `node`** (GitHub-hosted). If the repository becomes private, the unauthenticated clone fails closed.
6. **`visual-results` is force-pushed** by design. Anything pushed there manually is overwritten.

## Recommended repository settings (owner)
1. **Ruleset for `main`:** require a pull request before merging; block force pushes; restrict deletions; require the `check` status (Check (branches)). This keeps any workflow token, including this one, from changing `main` directly.
2. **Settings → Actions → General → Workflow permissions:** "Read repository contents and packages permissions" (read-only default), and leave "Allow GitHub Actions to create and approve pull requests" unchecked. Workflows then get write access only where they declare it.
3. **Fork pull-request workflows:** keep approval required for outside contributors (the default for public repositories).
4. **Don't add force-push protection to `visual-results`;** the publisher relies on it. Optionally add a ruleset preventing its *deletion*.

## Post-merge verification
After this PR and #25 are merged, the next push to `main` runs Visual check, then the publisher. Verify:
- the job log shows the trusted clone and the validation summary;
- `visual-results/main/REPORT.md` exists;
- the branch is one parentless commit;
- a test branch that changes the harness is reported as **Not published**.

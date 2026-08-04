# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Global npm installs for the next release no longer require
  `--allow-scripts=@ladybugdb/core`; LadybugDB is build-only, its qualified
  addon is embedded in macOS/Linux executables, and Windows retains the
  dependency-free reference fallback.

### Added

- **Windows ARM64 is now a first-class compiled release target** (LCLI-297).
  The launcher selects `@opum-ai/lore-win32-arm64`, the release workflow builds
  and qualifies it on `windows-11-arm`, and Windows ARM64 uses Lore's
  reference-index fallback because LadybugDB 0.19.0 publishes no matching
  native addon.

### Changed

- **The pinned Bun toolchain is now 1.3.14** (LCLI-297), the first qualified
  project pin with a Windows ARM64 runtime and `bun-windows-arm64` compile
  target. Runtime, CI, Docker, benchmark, and package qualification pins move
  together.

## [0.1.0] - 2026-08-03

### Added
- **`lore init` now detects and configures Claude Code and Codex independently**
  (LCLI-281). A bare interactive run offers each installed agent separately;
  prompt-free `--claude` and `--codex` flags provide deterministic setup for
  scripts and CI, while `--agents` remains an alias for Claude Code. Codex setup
  generates `.codex/skills/lore/SKILL.md` and surgically maintains Lore's
  managed block in `AGENTS.md`, preserving unrelated repository instructions
  and protecting a differing whole-file skill from overwrite. The additive
  `init` JSON result now includes `codex` only when that setup step runs.
- **`lore export` now emits a deterministic, consumer-neutral OKF projection for downstream
  indexes** (LCLI-279). The versioned JSONL stream contains a manifest, full canonical concepts,
  every authored concept edge, the current Backlog task snapshot, concept-to-task associations,
  dangling targets, stable SHA-256 content/bundle/stream hashes, and Git provenance, followed by a
  trailer. Duplicate authored links remain distinct through stable ordinal identity. Unsupported
  projection schema versions fail before bundle, Backlog, or Git reads; global `--json` wraps the
  same records in `kind: projection.export`. The command is registered in help and agent
  capability surfaces and documented in `docs/reference/okf-projection-contract.md`.

### Changed
- **The unpublished npm package family now uses the canonical `@opum-ai` scope** (LCLI-295).
  The user-facing launcher is `@opum-ai/lore`; its five OS/CPU-specific optional packages,
  Node launcher resolution, release tarball names, package qualification, install examples,
  tests, and Trusted Publisher instructions use the same scope. The earlier `@salient-data/lore`
  names remain only in historical changelog and completed-task evidence; no published package
  migration is required because both the old and new six-name families were unpublished.

### Fixed
- **The release dependency graph no longer carries the vulnerable `js-yaml@4.1.0` parser**
  (LCLI-280). Upgraded to `js-yaml@5.2.2`, migrated ESM imports to its named-export contract, and
  preserved lore's established empty-config and byte-stable leading-zero-string behavior across
  the major-version parser changes. Existing anchor-expansion bounds and prototype-pollution
  regression tests remain in force.
- **Release-facing documentation and bootstrap mechanics now match the implemented CLI and current
  npm policy** (LCLI-274/275 and release-readiness review). README/tech-stack no longer present the
  retired fork as a live git dependency, README identifies the hand-rolled parser and 0.1 release
  candidate state, and Docker E2E documentation records the active required `dev` check plus its
  admin bypass. The first-release runbook now uses an interactive 2FA publish of the exact
  CI-produced `0.1.0` tarballs before configuring Trusted Publishing, because npm requires a
  package to exist before trust can be created. A real `bun run build` script now matches the
  contributor instructions and compiles to a same-filesystem `dist/lore`.
- **`docker/e2e/run-e2e.sh` now fails closed instead of silently mutating the caller's working
  directory when run outside its Docker container** (LCLI-269). The harness deliberately runs
  under `set -uo pipefail` without `-e` (so it can keep going past individual failed assertions).
  Before the fix, the script already created `$RESULTS_DIR` and truncated `$REPORT` before ever
  reaching its unguarded `cd /workspace` — on a host, where `/workspace` doesn't exist, that `cd`
  failed but the script kept running anyway, silently executing every
  later phase (`git init`, `backlog init`, `lore init`, dozens of real, mutating `backlog`/`lore`
  calls) against whatever directory the caller happened to invoke it from. Hit for real during
  round 5 wave 1 (LCLI-267): a direct `bash docker/e2e/run-e2e.sh` on the host overwrote
  `backlog/config.yml`'s `project_name` (stripping its ADR-0012 header comment), created 3
  spurious real Backlog tasks under `backlog/tasks/`, and wrote stray `.lore/.gitignore`,
  `.lore/profile.toml`, `.lore/schemas/`, `.lore/templates/`, and `AGENTS.md` into a host
  worktree — all uncommitted and fully reverted that time, but only because it was noticed before
  anything was staged. Fixed with two independent, purpose-built signals checked immediately
  after `set -uo pipefail`, before `$RESULTS_DIR`/the report file are even created and before any
  mutating phase runs: a `LORE_E2E_CONTAINER=1` `ENV` now baked into `docker/e2e/Dockerfile`
  (present only in images built from it), and `/workspace` actually existing (the directory the
  same Dockerfile's `WORKDIR` guarantees). Either signal missing prints a clear message naming the
  correct invocation (`docker compose -f docker/e2e/docker-compose.yml up --build
  --exit-code-from e2e`) and exits 1. The literal `cd /workspace` line is also now guarded
  (`|| { ...; exit 1; }`) as defense-in-depth. `set -e` was deliberately NOT added — verified by
  temporarily flipping the expected exit code on two unrelated `step` assertions and re-running
  the full in-container harness: both were reported as `[FAIL]` by name and the run continued
  through all ~300 remaining checks to a final tally of `300 passed, 2 failed` (exit 1), proving
  the harness still reports every failing assertion rather than stopping at the first; reverting
  both restored `302 passed, 0 failed` (exit 0). Every other `cd`/directory-change in the script
  was swept (found at the pre-init probe, the docusaurus build, and the nested-checkout phase) —
  each is inside a subshell, command substitution, or `bash -c '...'`, always `&&`-chained to the
  command depending on it, so none can leak a changed cwd into the rest of the script or mutate the
  wrong directory the way the bare top-level `cd /workspace` did, and none needed a fail-closed
  guard of their own. LCLI-273 closes the separate reporting gap at the two nested-checkout
  carve-outs: backlog configuration is now a counted `step`, and the final git-status assertion
  runs inside a child whose failed `cd` returns nonzero instead of becoming a vacuous empty-string
  PASS. The other setup substitutions each have a named downstream assertion. LCLI-272 adds a
  Docker-free host regression test that executes the guard in an empty temporary directory,
  verifies exit 1 plus the exact supported Compose command and zero writes, and statically pins the
  script guard to the Dockerfile's container-only environment marker.
  A host-side invocation of the now-guarded script was verified by hand: `git status --porcelain`,
  `backlog/tasks/` file count, and `backlog/config.yml`'s checksum were snapshotted before and
  after and were byte-identical (the run printed the guard message and exited 1 without touching
  anything). `docs/runbooks/docker-e2e-testing-environment.md` gained a note warning against
  direct invocation and documenting the new guard.
- **`lore agents`'s pretty-mode output no longer paints a `protected` bridge file green** (LCLI-267,
  found during the LCLI-260 review). `protected` means a bridge file (currently only
  `.claude/skills/lore/SKILL.md`) looked hand-edited and was deliberately left untouched — the
  bridge is stale and needs `lore agents --force` — but `renderPretty` (`src/commands/agents.ts`)
  used a two-way `file.action === "unchanged" ? ANSI.dim : ANSI.green` mapping, so every non-
  `unchanged` action, `protected` included, came out the same green as an actual write. `lore init`'s
  own renderer already had the correct three-way mapping (`unchanged` dim, `protected` yellow, else
  green) since LCLI-260, so the same action rendered in two different colors depending on which
  command printed it. Fixed by extracting that three-way mapping into a single exported
  `bridgeActionColor()` in `src/commands/agents.ts`, which both `agents.ts`'s own `renderPretty` and
  `init.ts`'s `renderPretty` now call, so the two commands cannot diverge on this mapping again.
  `created`, `updated`, and `unchanged` keep their existing colors; `--json` output and exit codes
  are unchanged. A follow-up (LCLI-271) also makes the distinction textual rather than
  color-dependent: under `--check`, protected drift now reads
  `out of date (protected; needs --force)` in pretty output and
  `out-of-date-protected` in `--plain`, while ordinary stale files retain `out of date` /
  `out-of-date`. This intentionally updates the stable plain contract so `NO_COLOR`, piped, and CI
  consumers can identify the exact file requiring `--force`, preserving cli-contract.md §6's
  never-load-bearing color guarantee. Verified live under a
  real pty (`script`): both `lore agents` and `lore init --agents`, run against a hand-edited
  `SKILL.md`, now emit the identical `\x1b[33mprotected\x1b[0m` sequence (previously `lore agents`
  emitted `\x1b[32mprotected\x1b[0m`); a piped (non-TTY) run of the same case emits zero ANSI bytes.
  Tests in `test/agents.test.ts` pin `bridgeActionColor` for all four `BridgeAction` values,
  the live `protected`-is-yellow rendering, that `created`/`unchanged` keep their own colors, and the
  non-TTY suppression. `bridgeActionColor` itself is backed by a `Record<BridgeAction, string>`
  (`src/commands/agents.ts`), a total mapping with no fallback branch, so a future action added to
  the `BridgeAction` union without a matching entry is a `bun run typecheck` failure (TS2741, missing
  property), caught before any test runs rather than silently defaulting to green at runtime — proved
  by temporarily adding a fifth variant and confirming typecheck fails, then reverting it.
  `bun test` 2180/0 pass (2176/0 baseline, +4), `typecheck`/`lint` clean, `lore check` (40 files, 0
  errors/warnings), docker e2e harness 302/0 (unchanged baseline).
- **`.github/workflows/release.yml`'s `publish` job now declares `environment: release`, the out-of-file
  hook for closing the `workflow_dispatch`-on-any-ref exposure LCLI-255's reviewer flagged and
  LCLI-268 addresses — inert until two repo-admin steps are done (see below)**: npm Trusted Publishing
  matches an OIDC token on repository + workflow **filename**, not a ref, and this workflow
  is `workflow_dispatch`-reachable on any branch — so an actor with write access could push a branch
  carrying a `release.yml` with every in-file guard stripped (the `if: inputs.publish == true` gate,
  the `0.0.0` refusal, the npm-version floor) and dispatch it there, and the resulting OIDC token would
  still authenticate. An in-workflow `if: github.ref == …` guard is explicitly **not** a fix for this —
  it lives in the same file the attacker already controls, so it is trivially stripped along with
  everything else. `environment: release` instead ties the job to GitHub Environment protection rules
  (required reviewers / deployment branch policy), which are repo Settings configuration evaluated by
  GitHub's deployment subsystem, not workflow content — they still apply to a run using a
  wholesale-replaced copy of the file. **The declaration alone does not yet provide protection**: this
  change does not and cannot create the GitHub Environment or configure its protection rules (the same
  human/repo-admin boundary as LCLI-196/LCLI-257), and referencing an environment that doesn't exist
  yet auto-creates it with no rules by default. `docs/runbooks/release-publishing.md` gained a new
  "Repo-admin setup for the release Environment (LCLI-268)" section spelling out the two
  remaining manual steps — creating the `release` GitHub Environment with required reviewers
  (a deployment branch policy alone is not sufficient in this repo today), and setting all
  six packages' npm Trusted Publisher "Environment name" field to `release` (closing the
  residual loophole where an attacker simply omits the `environment:` line from a forged
  workflow copy) — and states plainly that the exposure remains open until both are done.
  `test/release-workflow.test.ts` gained a new assertion pinning `doc.jobs.publish.environment` to
  `"release"` (mutation-verified: deleting the line fails exactly that one test, 9 pass/1 fail, restored
  and re-verified green). Every existing LCLI-255 guarantee is unchanged: `workflow_dispatch`-only
  trigger, `publish` input defaulting `false`, `id-token: write` scoped to the `publish` job alone, the
  npm `>= 11.5.1` fail-closed floor, platform-packages-before-root publish ordering, and the `0.0.0`
  refusal. Verified against `dev`: `bun test` 2177/0 pass (baseline 2176 + 1 new test), `lore check` (40
  files, 0 errors/warnings), `typecheck`/`lint` clean, `actionlint .github/workflows/release.yml` clean.
- **`lore orphans` no longer reports a Backlog subtask as orphaned when its parent task is already
  linked to a doc** (LCLI-261, surfaced by the Meridian 56-concept/40-task e2e stress test: `orphans`
  first reported 8 orphaned tasks instead of the intended 2, because linking a parent task to a Story
  via `lore link` does not stamp each of its subtasks with its own `doc:` back-reference). Chose
  **orphans-side hierarchy awareness** over a link-side cascade or documenting the gap as expected
  behavior: `commands/orphans.ts`'s `computeOrphans` now walks a task's `parentTaskId` chain (the
  `--json` adapter already carries it on every task in the same `task list --json` snapshot `orphans`
  reads — no extra per-task `view` call) and exempts a subtask when any ancestor is forward-referenced
  by a concept's `tasks:` list or itself carries a `doc:` label; a corrupt/cyclic parent chain is
  guarded with a visited-id set and fails toward "still reported," never an infinite loop. A task under
  a genuinely unlinked parent — or a standalone task with no parent at all — is unaffected and still
  reported (no false negatives). `lore orphans`'s exit codes and the `orphans.report` `--json` shape
  are unchanged; only which tasks land in `orphanTasks` changes. `docs/reference/cli-surface.md`'s
  `orphans` entry updated to describe the hierarchy-aware scope. Verified against `dev`: `bun test`
  2136/0 pass (10 new regression cases covering linked-parent/unlinked-subtask, multi-level chains, a
  vanished-ancestor case, and cyclic/self-referencing `parentTaskId` data), `typecheck`/`lint` clean,
  `lore check` (39 files, 0 errors/warnings), plus a live run against a real `backlog`-backed bundle
  (a linked parent with two `--parent`-created subtasks) confirming both the exemption and, after
  fully unlinking the parent, that the same subtasks correctly reappear as orphans. A mutation check
  (reverting just this fix) reproduced 5 failing tests, confirmed fixed with the change restored.
- **`writeFileAtomic` / `writeFileNoFollow`'s commit `renameSync` now retries a bounded number of
  times on Windows' transient antivirus/indexer lock codes** (LCLI-256). Both write-temp-then-rename
  helpers finish with a single `renameSync(tmpPath, absPath)`, which on Windows can intermittently
  fail with `EPERM`/`EBUSY`/`EACCES` when an antivirus scanner or the Search indexer briefly holds
  the destination open — LCLI-252 fixed the deterministic `openSync` `ENOENT` but deliberately left
  this transient hazard for later. The commit step in both functions now goes through a new, shared,
  unexported `renameOverDestination` helper (`src/commands/fswrite.ts`): a bounded 4-total-attempt
  sequence (the first attempt plus up to 3 retries) with 20ms/40ms/80ms backoff between attempts via
  `Bun.sleepSync` — a first-party synchronous sleep, since `src/` is Bun-only (`package.json`
  `engines.bun`), needing no `Atomics.wait`/busy-wait fallback. Retried **only** on those three named
  errno codes, gated on the errno itself rather than `process.platform` — a POSIX run essentially
  never produces one of these codes in the narrow commit window, so the ordinary case is unchanged
  (still exactly one `renameSync` call). Any other errno is never retried, and once the bounded
  budget exhausts the LAST failure is what's thrown into each function's existing `catch`/`ioError`
  classification, so a persistent failure still ends in the identical classified outcome it always
  did (a persistent `EACCES`/`EPERM` still becomes the same `denied` `LoreError`) — never a
  swallowed false success. The LCLI-231 temp-leak guard, LCLI-117 mode/ownership
  preservation, and LCLI-130/92 symlink refusal are untouched — only the commit step can repeat.
  Verified with `bun test` (spying on `fs.renameSync` to throw a deterministic errno for an exact
  call count before delegating to the real implementation — not a real lock, not a sleep-based
  flake) and confirmed green on the `windows-latest` CI matrix leg (PR #249) since a local macOS
  worktree cannot produce that evidence directly. Re-verified against `dev`: `bun test` 2126/0 pass,
  `typecheck`/`lint` clean, `lore check` (39 files, 0 errors/warnings).
- **`lore rename` / `lore supersede --rewrite-links` now warn on stderr when a retargeted inbound
  link's display text still names the OLD id** (LCLI-262, surfaced by the Meridian e2e stress
  test, which needed a manual fix after the run). `rewriteInbound` (`src/core/rewrite.ts`) has
  always retargeted every inbound body link's *destination* correctly, but never checked whether
  the link's *visible text* still named the concept being renamed/superseded — so a supersession
  doc's own `[ADR-0005](…)` citation, retargeted to point at ADR-0006, could ship with the prose
  and the link silently disagreeing. The retarget itself is unchanged (LCLI-262 AC#2: no
  regression) — skipping it outright was rejected, because `rename` deletes the old file and a
  skipped link would become genuinely dangling. Instead, a new `RewritePlan.textMismatches:
  LinkTextMismatch[]` field (populated by `computeBodyEdits`'s new
  `oldIdNameCandidates`/`textNamesOldId` heuristic — the bare id, its basename, and for lore's
  `NNNN-slug` ADR/RFC ids, the digits and `<dir>-<digits>`, matched case-insensitively: substring
  for a full `dir/id`, word-boundary for a bare candidate) is rendered as one `warning:` line per
  mismatch by both `commands/rename.ts` and `commands/supersede.ts`, through a shared
  `renderLinkTextMismatchWarning`, on a fresh `WarningCollector` (not the already-flushed
  bundle-load one — `flush()` is non-draining). Scoped to **inbound** files only, never the moved
  file's own self-link retarget. Exit codes and the `--json` envelope are unchanged — this is
  advisory-only. Verified against `dev`: `bun test` 2110/0 pass (including the new
  `test/rename.test.ts`/`test/supersede.test.ts` coverage), `typecheck`/`lint` clean, `lore check`
  (39 files, 0 errors/warnings).
- **`loadBundle` no longer warns about lore's own generated `index`/`log` hubs** (LCLI-258).
  `src/core/bundle.ts`'s `loadBundle` previously fired the `no frontmatter mapping` advisory for
  *any* non-concept file, including the machine-generated `index.md`/`log.md` hubs that
  `indexes.ts`/`log.ts` regenerate wholesale and which are always frontmatter-free by design
  **below the bundle root** (the bundle-root `docs/index.md` is itself a concept with real
  frontmatter — LCLI-192, `BUNDLE_ROOT_INDEX_PATH`/`effectiveProfileFor`) — so every command that
  threads a `WarningCollector` through `loadBundle` — `link`, `unlink`, `sync` and `tasks` (the
  four the bug was filed against), plus `query`, `graph`, `context`, `orphans`, `rename` and
  `supersede`, all fixed uniformly by the single choke point — printed spurious warnings on every
  ordinary invocation, training users to ignore them entirely. `loadBundle` now checks the skipped
  file's basename against `RESERVED_STEMS` (`core/scaffold.ts`: `index`/`log`) and suppresses the
  advisory only for those two known-reserved stems; a genuinely unexpected non-concept file still
  warns exactly as before. `check` (never calls `loadBundle` — it runs its own file scan,
  deliberately, per LCLI-27) and `validate` (already tallies a silent `skippedCount`) needed no
  change. Verified against `dev`: `bun test` 2110/0 pass, `typecheck`/`lint` clean, `lore check`
  (39 files, 0 errors/warnings); a before/after repro on this repo's own bundle (mutating the
  `RESERVED_STEMS` guard to always warn) showed `sync --dry-run`/`tasks` dropping from 5 spurious
  warning lines — the five non-root reserved-stem hubs (`docs/adr/index.md`, `docs/log.md`,
  `docs/reference/index.md`, `docs/runbooks/index.md`, `docs/specs/index.md`) — to 0, with `check`
  unchanged.
- **ADR-0002 now distinguishes a missing `backlog` binary (exit `3`) from a present-but-incapable one (exit `6`)**
  (LCLI-60, a doc-accuracy gap found via the LCLI-56 Docker E2E harness against a real
  pinned-upstream `backlog` binary). Decision point 5 of `docs/adr/0002-backlog-integration-json-only.md`
  previously claimed that a missing, too-old, or non-`--json`-capable `backlog` binary all mapped to
  a single "validation/drift exit code `6`" — but the real, deliberate code in
  `src/adapters/backlog.ts` (`probeBacklog`) has always split this into two cases, with its own
  inline comment explaining why: a fully missing binary (`ENOENT` on `backlog --version`) throws
  `not_found` (exit `3`, with an install hint), while a present-but-too-old-or-incapable binary
  throws `validation` (exit `6`, pointing at the patch runbook) — so a caller can tell "install
  backlog" apart from "upgrade backlog" from the exit code alone, without parsing the message. The
  ADR text now states both cases explicitly and names the split as intentional. Confirmed
  `docs/reference/backlog-cli-contract.md` already documented the correct split and needed no
  change; `docs/runbooks/agent-onboarding.md` asserts no numeric exit code for the probe and also
  needed no change. `docs/runbooks/docker-e2e-testing-environment.md` and
  `docker/e2e/run-e2e.sh`'s inline comments, which had flagged this as an open doc-accuracy gap,
  are updated to reflect that it's now fixed.

- **`lore new Story` now scaffolds the `lore:tasks` managed block, so a fresh Story is `lore sync`-able
  immediately** (LCLI-59, found via the LCLI-56 Docker E2E harness against a real pinned-upstream
  `backlog` binary). `STORY_TEMPLATE` (`src/core/template.ts`) previously shipped no `<!-- lore:tasks:begin
  -->`/`<!-- lore:tasks:end -->` markers — just `# {{title}}` / `## Goal` / `## Acceptance criteria` /
  `## Notes` — even though Story is the one type carrying the `tasks:` coupling that `lore sync`
  regenerates in place. Because `managed-block.ts` treats a totally-absent block as a hard validation
  error (exit `6`) rather than something to create on first sync — a deliberate ADR-0008 §2 "never guess,
  never write a partial block" contract, already exercised by the existing `test/sync.test.ts` fail-loud
  test — the canonical `lore new` → `lore link` → `lore sync` → `lore check` loop documented in
  `agent-onboarding.md` failed at the `sync` step on every freshly-created Story, requiring an undocumented
  manual edit to hand-add the two marker lines before syncing would work. Fixed by giving `STORY_TEMPLATE`
  a `## Tasks` section carrying the empty managed block by default, between `## Acceptance criteria` and
  `## Notes`; `managed-block.ts`/`sync.ts` are untouched, so a Story whose markers are hand-deleted
  entirely still fails loud at exit `6` exactly as before. `docs/runbooks/agent-onboarding.md` and
  `docs/specs/lore-design.md` §3.2/§6.2 now document that the block ships empty from `lore new` and gets
  filled in by the first `lore sync`. Verified with a full unit pass (`bun test`: 1500/1500) plus a real
  pinned-upstream-binary run via `docker/e2e/` (82/82) — a freshly `lore new`-created Story now completes
  the full `new` → `link` → `sync` → `check` loop at exit `0`, with the managed block genuinely populated
  by rendered task content, not just empty markers. Updated `run-e2e.sh`'s LCLI-59 step (flipped expected
  exit `6`→`0`, removed the manual marker-append workaround, added a check that the rendered table is
  present) and the E2E runbook's known-regressions list accordingly.

- **`lore link`/`unlink --json` no longer leaks a success-shaped envelope on a nonzero exit**
  (LCLI-58, found via the LCLI-56 Docker E2E harness against a real pinned-upstream `backlog`
  binary). When a per-task Backlog back-reference write (or the `backlog/` commit) failed,
  `link`/`unlink` still printed a full, well-formed `link.result`/`unlink.result` envelope to
  stdout despite exiting `6` (`drift`), with stderr empty — violating cli-contract §4's "stdout
  parses or stays silent" invariant: a caller following the documented contract (nonzero exit →
  read the `ErrorEnvelope` from stderr) found nothing there. `runLink`/`runUnlink`
  (`src/commands/link.ts`) now throw a `drift` `LoreError` instead of emitting the report whenever
  any per-task edit or the commit fails — uniform with every other lore command. The doc-side
  frontmatter write and any successful per-task edits still happen and are not undone; the same
  per-task detail (`concept`/`changed`/`tasks`/`backlogCommit`) moves from the stdout report into
  the `ErrorEnvelope`'s `input` field on stderr instead of being lost. `docs/reference/cli-contract.md`,
  `docs/reference/cli-surface.md`, and `docs/runbooks/agent-onboarding.md` now say explicitly that a
  *partial* per-item failure on a multi-item command follows the same stdout/stderr rule as any other
  failure, closing the ambiguity that let the original bug ship unnoticed.

- **`editTask()` no longer sends an unsupported `--json` flag to `backlog task edit`** (LCLI-57,
  found via the LCLI-56 Docker E2E harness against a real pinned-upstream `backlog` binary). Per
  PR #790's scope, upstream Backlog.md only added `--json` to three read commands (`task list`,
  `task view`, `search`) — `task edit` never got one, so every real call to `backlog task edit
  <id> --json ...` failed immediately with `error: unknown option '--json'`, before Commander
  even parsed `--add-label`/`--remove-label`/`--status`/`--doc`. `editTask` never read any JSON
  from the response (it only checked `exitCode`/`stderr`), so `--json` was dead weight that
  actively broke the call. This silently broke every write that goes through `editTask`: `lore
  link`/`unlink`'s `doc:` back-reference label write and `lore rename`'s task back-ref
  repointing. The unit suite never caught it — it mocks `BacklogAdapter` entirely, so the fake
  never enforced the real CLI's flag surface.

- **`tech-stack.md` corrected to match the actually-shipped dependency set** (LCLI-14, a Bun
  compile-compatibility spike). The doc claimed three dependencies that were never actually
  adopted — `commander` (CLI parsing is hand-rolled in `src/cli.ts`; Commander remains the named
  but deferred eventual entrypoint), the full `unified`/`remark-parse`/`remark-stringify`
  pipeline (lore ships only the parser, `mdast-util-from-markdown`; every write is
  parse-to-locate-then-string-splice, never AST re-serialization — a deliberate byte-stability
  choice, not an oversight), and `remark-validate-links` (internal link/anchor validation is
  hand-rolled directly over the parsed mdast in `core/bundle.ts`/`core/check.ts`) — none of which
  are in `package.json`. Also tightens the existing `DEVELOPMENT.md` **compile-time caveat**
  (documented in an earlier session from the "cloned onto an external volume" angle): `bun build
  --compile` silently emits a 0-byte binary at exit `0` (no error on either stream) whenever
  `--outfile` lands on a **different mounted filesystem** than the source checkout (`EXDEV` on the
  internal rename step) — confirmed by compiling this repo's own checkout to same-device vs.
  cross-device output paths, resolving that note's earlier hedge ("very likely" the volume) to a
  precise, filesystem-boundary-agnostic root cause. The existing CI `compile smoke` job already
  avoided this (single-runner filesystem) and already asserted non-empty/working output, not just
  exit code; both docs' comments now explain why and cross-reference each other. Confirmed none of
  lore's four v1 runtime dependencies (`gray-matter`, `js-yaml`, `mdast-util-from-markdown`, `zod`)
  ship a native addon, so this caveat is the only `bun build --compile` gotcha the current
  dependency set has.

### Added
- **`lore init` folds the rest of onboarding into one command via a TTY-gated interactive wizard**
  (LCLI-260): a bare `lore init` on an interactive terminal now walks through the Claude Code agent
  bridge, a downstream doc-site scaffold (mkdocs/docusaurus), an Obsidian vault config, and a
  backlog `--json`-capability check, replacing the old `init` → `agents` → external `lore-setup.sh`
  → manual-Obsidian sequence. **Strictly TTY-gated** (the npm-init pattern, [ADR-0017](docs/adr/0017-interactive-init-wizard-tty-gated.md),
  amending [ADR-0004](docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md)/[ADR-0005](docs/adr/0005-cli-contract.md)):
  the wizard runs only when **both stdin and stderr** are real TTYs, `--json` was not requested,
  *and* none of `init`'s own flags was passed; a non-TTY stdin or stderr (CI, pipes, this repo's own
  docker e2e harness, or a caller that redirects only one of the two streams), `--json`, or **any**
  flag forces the fully non-interactive path with no prompt able to block it. Both streams matter
  because every wizard question is written to stderr (cli-contract §4) — gating on stdin alone would
  leave the wizard blocked on a prompt nobody can see behind a redirected stderr (the universal shell
  idiom `cmd >/dev/null 2>&1`, which `lore-setup.sh` itself uses). Every wizard question has a 1:1
  flag equivalent — `--agents` (the bridge), `--scaffold <target>` (repeatable; `mkdocs`/`docusaurus`/
  `obsidian`), `--obsidian` (shorthand for `--scaffold obsidian`), `--check-backlog`/`--no-backlog`
  (force/skip the advisory-only backlog check), and `--yes`/`--non-interactive` (skip the wizard even
  on a TTY, applying bare defaults — this is npm's `-y`, i.e. "skip every prompt," not "answer every
  question with its default": the agent-bridge question defaults to yes, but `--yes` installs
  nothing). EOF (Ctrl-D) mid-wizard is a `usage` error (exit `2`) with a rendered diagnostic, never a
  silent success. **The non-interactive default is completely unchanged**: with no flags and a
  non-TTY stdin (the automatic case for every existing caller), `lore init` does exactly what it
  always did — scaffold `docs/`/`.lore/` and nothing else; `interactive`/`scaffolds` are always
  present in the `--json` envelope (`false`/`[]` on the default path) and `agents`/`backlog` appear
  only when those steps ran — all four purely additive (ADR-0005 §versioning), so this is not a
  contract-breaking change. The agent-bridge and scaffold steps are idempotent because they reuse
  `lore agents`/`lore scaffold`'s own primitives directly — `applyAgentsBridge`
  (`src/commands/agents.ts`) and `applyScaffold` (`src/commands/scaffold.ts`) were extracted out of
  `runAgents`/`runScaffold` (which are now thin arg-parse/emit wrappers over them) specifically so
  `lore init` never prints a second, separate envelope onto the stdout stream its own `--json`
  contract owns. `lore init`'s own renderers reuse `lore agents`' actionable trailer verbatim
  (`renderTrailer`, now exported) for a hand-edited/`protected` bridge file, and paint `protected`
  as a warning rather than the same green as an actual write. The backlog-coupling check
  (`adapter.probe()`) is advisory-only — a missing or non-`--json`-capable `backlog` becomes a
  stderr warning plus `backlog: {capable: false, warning}` on the result, never a failed `init` run.
  The wizard's TTY gate and its prompt I/O are both injectable (`InitOptions.stdinIsTTY`/
  `stderrIsTTY`/`prompter`, resolved once at the `cli.ts` boundary alongside the existing
  `isTTY` handling) rather than read from `process.stdin`/`process.stderr` at the command call site,
  so the wizard is unit-tested with a scripted prompter and never touches a real terminal; `runInit`
  stays a plain (non-`async`) function returning `number | Promise<number>` (mirroring `lore check
  --external`'s existing sync/async split), so the common zero-flag path returns a plain number
  exactly as before this change. The agent bridge is applied before scaffold targets are
  pre-flighted, so a scaffold conflict (or an EOF after the bridge question) can leave the bridge
  already written while the run still exits non-zero — this ordering is unchanged/deliberate;
  idempotency is what makes re-running `lore init` afterward safe (it picks up exactly where the
  interrupted run left off). Documented in the new ADR-0017, [`cli-surface.md`](docs/reference/cli-surface.md)'s
  `init` entry, a new "Bootstrapping a brand-new repo" section in
  [`agent-onboarding.md`](docs/runbooks/agent-onboarding.md), and the README quickstart; discoverable
  via top-level `lore --help` and `lore help init`. Verified against `dev`: `bun test` 2176/0 pass (up
  from the 2136/0 baseline — 55 tests in `test/init.test.ts`, up from 19, plus 4 router-level
  wizard-wiring tests in `test/cli.test.ts`; the stdin/stderr TTY gate, the `--json` veto, the
  flag-bypass check, and the EOF/`close()` handling were each mutation-tested by reverting the fix
  and confirming their dependent tests genuinely fail — one of them (the EOF race) genuinely hangs
  once reverted, itself proof the regression test exercises a real bug — then restored to green),
  `typecheck`/`lint` clean, `lore check` (40 files, 0 errors/warnings), live pty verification of both
  the fixed hang (`lore init --plain >/dev/null 2>&1` under a real pty, previously hung forever, now
  completes in well under a second) and the fixed EOF behavior (Ctrl-D mid-wizard now renders `error:
  stdin closed or the wizard was interrupted before it finished (EOF/Ctrl-D or Ctrl-C)` and exits
  `2`, leaving only the base scaffold on disk), and a full run of the docker e2e harness
  (`docker/e2e/run-e2e.sh`) — 302 passed, 0 failed, unchanged from its existing baseline (no assertion
  needed changing: the harness never exercises `init`'s new flags, and the default path it does
  exercise is byte-for-byte unchanged).
  A follow-up review round found and fixed two blocking defects in the initial cut of this feature
  (the stdin-only TTY gate, and the EOF-hangs-forever wizard promise) plus several accuracy/UX
  corrections: the unknown-option error envelope on `lore init --bogus` normalizes to the same shape
  every other command's unknown-option error already uses (drops the `input.options` field, matches
  the `hint` wording) — a small, deliberate divergence from `dev`'s envelope for this one error; and
  `--plain` now prints a line for an already-up-to-date scaffold step instead of nothing.
- **`.github/workflows/release.yml` gained a real `publish` job — OIDC trusted publishing to npm,
  gated on an explicit dispatch input** (LCLI-255). The workflow stays `workflow_dispatch`-only
  (never push/tag-triggered); the new `publish` job additionally requires
  `if: ${{ inputs.publish == true }}`, with the `publish` boolean input defaulting to `false`, so a
  plain dispatch only builds/packages/dry-run-verifies every platform artifact and the `publish` job
  simply does not run. `id-token: write` is scoped to **only** the `publish` job — workflow-level
  `permissions:` stays `contents: read`, so no other job can mint an OIDC token — and publishing goes
  through npm's own OIDC Trusted Publishing (hence the CLI floor below), with `actions/setup-node`
  supplying the toolchain and the registry URL rather than a stored npm token. Before publishing
  anything, the job installs `npm@^11` and fails closed if the resolved CLI version is below the
  `>= 11.5.1` floor OIDC trusted publishing requires. The five platform packages are published
  **before** the root launcher (`optionalDependencies` on the root pin the platform packages at an
  exact version, and publishing root first would open a window where `npx @salient-data/lore`
  resolves a launcher whose platform deps 404); the publish loop is **resumable** — `publish_or_skip`
  checks the registry (`npm view`) before each publish and skips anything already there, so
  re-dispatching after a partial failure (`run:` steps execute under `bash -e`) completes the rest
  instead of 403ing on packages already published. A hard-refusal precondition rejects publishing the
  placeholder version `0.0.0` (checked once against the root tarball's manifest, before any tarball is
  published), closing a real window the First-release checklist's step ordering (Trusted Publisher
  setup before the version bump) would otherwise leave open. New regression tests
  (`test/release-workflow.test.ts`) parse `release.yml` with `js-yaml` (`JSON_SCHEMA`) and assert the
  dispatch gate, the `needs` chain, the scoped `id-token: write`, the publish-order partition, the
  0.0.0 refusal, and a fail-open extraction bug in `publish_or_skip`'s name/version parsing (a
  here-string always supplies `read` a delimiter, so a `tar`/`node` failure previously went unnoticed
  under `bash -e` without `pipefail`) — each mutation-verified to fail without its corresponding fix.
  Also adds `docs/runbooks/release-publishing.md`'s first-release checklist (version bump, the
  `bin.lore` flip, npm Trusted Publisher setup, post-publish smoke install) and a partial-publish
  rollback procedure, plus amendments to
  [ADR-0001](docs/adr/0001-runtime-build-distribution.md) and
  [tech-stack.md](docs/reference/tech-stack.md) correcting their prior "publish-free"/"a deliberate
  follow-up" wording now that the publish job is implemented. Verified against `dev`: `bun test`
  2126/0 pass, `typecheck`/`lint` clean, `actionlint` clean, `lore check` (39 files, 0
  errors/warnings).
- **Daily upstream-release watch for MrLesk/Backlog.md's tagged `--json` release** (LCLI-254). A
  new scheduled workflow (`.github/workflows/upstream-backlog-watch.yml`, daily `cron` plus
  `workflow_dispatch`) runs a new standalone script (`src/scripts/upstream-backlog-watch.ts`) —
  repo-maintenance tooling, not part of the `lore` CLI surface: no `--json` envelope, no
  exit-code contract, not reachable via `lore <command>`. lore's adapter
  (`src/adapters/backlog.ts`) and lore's own first npm release are both blocked on
  MrLesk/Backlog.md tagging a release whose history actually contains commit `22a091b` (PR #790 /
  BACK-545, stable `--json` output on `task list`/`task view`/`search`) — nothing upstream
  notifies lore when that happens, so LCLI-253 (the follow-up adapter migration) could otherwise
  stall indefinitely. The script filters the upstream Releases API to releases published at/after
  the PR's merge date (`candidateReleases`), resolves each candidate tag's commit sha, and
  ancestor-checks it against the target commit via GitHub's compare API
  (`isAncestorCompareStatus`: `status` `identical` or `ahead`) — distinguishing a genuinely
  `--json`-capable tag from one merely numbered newer than the last-known `v1.48.0`. The first
  qualifying release opens a one-time GitHub issue in this repo labeled `upstream-watch` naming
  LCLI-253 as the next step; kept idempotent by checking for an existing labeled issue (open or
  closed) before doing any upstream work, since every later release also contains the target
  commit forever after. Documented in the new
  `docs/runbooks/upstream-backlog-md-json-tag-watch.md` runbook. Included here even though it is
  repo-tooling rather than CLI behavior, matching this file's own existing precedent for logging
  CI/tooling additions (see the "CI (LCLI-8)" / "Dev tooling (LCLI-7)" entries below). Verified
  against `dev`: `bun test` 2110/0 pass (including 13 tests in
  `test/upstream-backlog-watch.test.ts` covering the date-cutoff filter, all four compare
  statuses, and `watchOnce`'s already-surfaced/no-match/opened paths against a stubbed fetcher),
  `typecheck`/`lint` clean, `actionlint` clean, `lore check` (39 files, 0 errors/warnings).
- **`lore scaffold obsidian` — the third consumer-scaffolding target** (LCLI-41). Writes a single
  `docs/.obsidian/app.json` preset (`useMarkdownLinks: true`, `newLinkFormat: "relative"`,
  `alwaysUpdateLinks: true` — consumer-compatibility.md §3.2), plus Files & Links UI guidance
  printed after the file summary (plain and `--json`), since Obsidian only reads `app.json` on
  startup and some builds (mobile in particular) don't honor it at all — the Settings UI is the
  real guarantee. Reuses the same never-silent-clobber/`--force` contract as `mkdocs`/`docusaurus`.
  Fixed a real `.gitignore` gap found while dogfooding against a live vault: the enumerated
  `docs/.obsidian/workspace*.json` / `docs/.obsidian/cache` patterns missed `appearance.json` and
  `core-plugins.json` (both real files a fresh Obsidian vault-open creates); replaced with an
  exclude-all-except pair (`docs/.obsidian/*` + `!docs/.obsidian/app.json`), which no longer
  depends on enumerating every file Obsidian might create. Verified against a real, running
  Obsidian instance (installed with its CLI enabled specifically for this): `docs/index.md`
  resolves 33 real outgoing links and receives backlinks from 12 files when `docs/` is opened as
  the vault, and `app.vault.getConfig(...)` confirmed the live app actually loaded the scaffolded
  settings from disk, not just that the bytes looked right.
- **`lore scaffold docusaurus` — the second consumer-scaffolding target** (LCLI-40). Writes a
  `website/` directory (additive, outside `docs/`, per ADR-0010): `package.json` pinning
  `@docusaurus/core`/`@docusaurus/preset-classic` to the same exact version (Docusaurus packages
  must stay in lockstep) plus `react`/`react-dom`; `docusaurus.config.js` with
  `markdown.format: 'detect'` (the load-bearing flip — without it, raw `<`/`{` in hand-written OKF
  prose and `<!-- lore:tasks:begin -->`-style comments are parsed as MDX/JSX and break the build),
  `onBrokenLinks`/`onBrokenAnchors: 'warn'` (the default `'throw'` would fail on OKF's tolerated
  broken links), `docs.path: '../docs'`, `blog: false`; and a fully-autogenerated `sidebars.js`.
  All three files are emitted as **CommonJS** (`module.exports = {...}`), not the ESM
  `export default` form consumer-compatibility.md previously (incorrectly) documented — verified
  against a real `docusaurus build` that the ESM form crashes the production build
  (`TypeError: require.resolveWeak is not a function`, an ESM/webpack-SSR interaction), while the
  identical settings succeed once CJS; the doc's snippet is corrected alongside this change. Reuses
  the same never-silent-clobber/`--force`/all-or-nothing-rollback contract `lore scaffold mkdocs`
  established, via a small generalization of `ConsumerScaffoldPlan` to carry its own `dirs` (mkdocs
  needed none beyond the always-present `docs/`; docusaurus needs a fresh `website/`). A real
  `docusaurus build` against the scaffolded config and this repo's own bundle — including its raw
  `<`/`{` prose — now runs as its own CI job (`scaffold-docusaurus`), mirroring `scaffold-mkdocs`'s
  separation of a heavyweight external toolchain from `bun test`. Any other target string, or one
  not yet implemented, is a `usage` error (exit `2`).
- **`lore scaffold mkdocs` — the first consumer-scaffolding target** (LCLI-39). Writes a repo-root
  `mkdocs.yml` (Material theme, `navigation.indexes`, `search`/`tags` plugins, `strict: false` with
  `not_found`/`anchors: warn` honoring OKF's broken-link tolerance, `absolute_links: relative_to_docs`)
  plus a `docs/tags.md` tag-index page — both additive and outside `docs/`, so the OKF bundle stays the
  single source of truth (ADR-0010). Unlike `lore init`'s silent-skip-if-present, scaffolding is
  **never-silent-clobber**: if any planned file already exists the whole run refuses (exit `5`, naming
  every collision) and writes nothing, until `--force` is passed. `docs/tags.md` is a normal, appendable
  OKF `Reference` concept once scaffolded (not a reserved stem like `index`/`log`), serialized against
  the structural default profile so a custom profile's required fields can't break the scaffold — the
  same choice `lore init`'s root index makes and for the same reason. A real `mkdocs build` against the
  scaffolded config and this repo's own bundle now runs as its own CI job (`scaffold-mkdocs`), mirroring
  the existing compile-smoke job's separation of a heavyweight external toolchain from `bun test`.
  `docusaurus`/`obsidian` remain documented targets pending their own tasks (LCLI-40/41); any other
  target string, or one not yet implemented, is a `usage` error (exit `2`). Under `--json` it emits
  `kind: scaffold.result` — `{ target, force, files: [{ path, action }] }`. Now advertised in `lore
  help`, the `lore help --json` manifest, and the generated agent bridge.

  A `/code-review max` fold on this entry fixed two SEVERE correctness bugs found post-merge:
  `writeAllOrRollback`'s rollback used to delete a pre-existing file it merely failed to *read*
  (e.g. a permission error) instead of restoring it, risking real data loss on rollback; and a
  freshly-created `docs/` directory was not tracked by the rollback undo stack, leaving a residual
  empty directory behind on a later write failure. Both are fixed and covered by regression tests
  that were confirmed to fail against the pre-fix code. Also closed a TOCTOU gap in the
  never-clobber guarantee (the `!force` write path now routes through the same atomic `wx`-based
  primitive `lore init`/`lore new` use), and promoted the rollback logic from a private
  `scaffold.ts` function into a shared, exported `fswrite.ts` primitive for future scaffolds to
  reuse.
- **Release pipeline mechanics: compiled binaries + dual-artifact npm packaging** (LCLI-9,
  ADR-0001). `bin/lore.cjs` is the published package's future launcher — plain, dependency-free
  Node CommonJS that resolves the current platform's compiled binary via `require.resolve`
  against five `optionalDependencies` (`@salient-data/lore-{darwin,linux}-{arm64,x64}` and
  `-win32-x64`, each npm `os`/`cpu`-gated) and execs it, forwarding argv/stdio/exit code verbatim.
  `package.json`'s `bin.lore` deliberately still points at `src/cli.ts`, not `bin/lore.cjs` —
  flipping it any earlier would break every pre-publish install path (git dependency, `npm`/`bun
  link`), since the platform packages it resolves don't exist until a real publish ships them;
  the flip is the first step of actually cutting a release (see the runbook below). A new
  `.github/workflows/release.yml` (`workflow_dispatch`-only — never fires on a push or tag) first
  asserts all six release `package.json` versions are in lockstep, then cross-compiles all five
  targets from a single runner, executes the native linux-x64 binary, size-checks the rest,
  `npm pack`s all six packages (packing the root with `bin.lore` patched to `bin/lore.cjs` in a
  scratch copy only, so the dry-run proves the launcher exactly as a real release will ship it
  without touching the committed file), and proves the full `npx`/launcher resolution chain
  end-to-end via a real pack+install+run — without ever calling `npm publish`. Verified locally
  end-to-end (compile, pack, install, run, and the missing-platform-package error path); a
  `bun:test` suite exercises the launcher itself under a real `node` subprocess via
  `NODE_PATH`-simulated installs. The workflow file itself awaits its first real GitHub Actions
  run (`workflow_dispatch` requires the file on the default branch to trigger, so this can only
  happen post-merge) — actionlint-clean, but not yet CI-verified; a maintainer should trigger it
  once and confirm green before relying on it for a release. Publishing is a deliberate follow-up
  gated on configuring npm's Trusted Publisher (OIDC) for all six packages — see the new
  [release-publishing runbook](docs/runbooks/release-publishing.md) for the exact steps.

  A third `/code-review high` fold caught two SEVERE correctness bugs plus five more: `bin/lore.cjs`
  was masking every `require.resolve` failure (a permission error, a corrupted install,
  `ERR_PACKAGE_PATH_NOT_EXPORTED`, …) as the generic "unsupported platform" message, hiding real,
  fixable install problems behind a misleading one — only `MODULE_NOT_FOUND` is now treated as
  "not installed," everything else propagates and is reported distinctly; a signal-terminated
  child now forwards the conventional `128 + signal` exit code (e.g. `143` for `SIGTERM`) instead
  of a flat `1`, so a caller inspecting `$?` sees the real signal. `verify-versions` now also
  checks the root `optionalDependencies` pin and `license`/`author`/`repository` metadata across
  all six release packages, not just the bare version number, so a missed bump anywhere in that
  chain fails loud before any compile work instead of surfacing later as "no compiled binary found
  for this platform." The five-platform list is now single-sourced from a new `setup` job instead
  of being hand-typed in three places in `release.yml`. `test/bin-lore.test.ts` switched to
  `beforeEach`/`afterEach` scratch-dir setup (matching the rest of the suite) and gained two new
  tests covering the signal-exit-code and error-masking fixes.

- **`lore orphans` — the bidirectional doc↔task coupling report** (LCLI-32). Surfaces two kinds of
  gap in one pass: **orphan tasks** (a Backlog task no concept lists in its `tasks:` frontmatter and
  that carries no `doc:<conceptId>` back-reference label — work documented nowhere) and **dangling
  links** (a concept `tasks:` id the current-branch Backlog snapshot no longer knows — a doc pointing
  at a deleted/renamed task). It reads Backlog **once** (`task list --json`, all statuses) and derives
  both directions by set arithmetic against the loaded graph — no per-task probing. `--tasks-only` /
  `--docs-only` narrow the report to one side. Under `--json` it emits `kind: orphans.report` —
  `{ orphanTasks[], danglingLinks[] }` (object-wrapped for additive growth; the section a flag excludes
  is omitted, never emitted as an empty array, so `--docs-only --json` can't be misread as "no orphan
  tasks"). Backlog capability is probed up front (a missing binary exits `3`, a non-`--json` binary
  exits `6`); it is a **report, not a gate** — always exit `0` on success, even when the report is
  non-empty. Now advertised in `lore help`, the `lore help --json` manifest, and the generated agent
  bridge.
- **`lore tasks <id>` — a concept's live Backlog task rollup** (LCLI-25). Loads the `docs/` bundle,
  resolves the concept, and prints each `tasks:`-linked task's **current** status pulled fresh from the
  Backlog JSON adapter — the read-only view of what `lore sync` materializes into the managed block,
  written nowhere. `--status <S>` filters to one Backlog status (case-insensitive). Under `--json` it
  emits `kind: tasks.rollup` — `{ concept, status?, tasks: [{ id, title, status }] }` (object-wrapped,
  like every list command, so the contract can grow additively). Backlog capability is probed up front
  (a missing binary exits `3`, a non-`--json` binary exits `6`), which lets a `tasks:` id Backlog no
  longer knows be dropped from the rollup with a stderr advisory (exit `0`) rather than mistaken for an
  outage; an `<id>` absent from the bundle exits `3`. Now advertised in `lore help`, the `lore help
  --json` manifest, and the generated agent bridge.
- **`lore help` — human help plus a machine-readable capability manifest** (LCLI-38). `lore help`
  prints the command catalog and `lore help <command>` prints one command's detail (args, flags,
  output `kind`, exit codes, examples); an unknown command exits `3`. Under `--json` it emits
  `kind: help.manifest` — a curated manifest of every **shipped** command (name, summary, args,
  flags, `--json` availability, `kind`, exit codes, examples) plus the global flags and the exit-code
  taxonomy, so an agent learns the whole CLI surface in one read. `lore help <command> --json` returns
  the same manifest shape scoped to that one command. The manifest is now the **single source** for
  help text: the hand-kept `USAGE` literal is gone and `lore --help` renders from it too, so the two
  are byte-identical. Flags/kinds/exit codes are transcribed from live command source (not the design
  docs), and the exit-code taxonomy is built from `errors.ts` so it cannot drift; a bidirectional
  lockstep test pins the manifest's command set to the real router (every advertised command
  dispatches, and every dispatch case is advertised).
- **`lore agents` — generate/refresh the Claude Code agent bridge** (LCLI-36, ADR-0004). Writes a
  generated `.claude/skills/lore/SKILL.md` (a small, grounded teacher that names the command surface,
  the `--json`/exit-code contract, and points at `lore instructions` as the source of truth) and a
  tiny marker-delimited `CLAUDE.md` nudge (`<!-- lore:agents:begin/end -->`) that points at the skill.
  Idempotent: regenerating with no change is byte-identical. The nudge is a **managed block** upserted
  via a new generic `upsertManagedBlock` engine (the insert-or-update sibling of the `lore:tasks`
  regenerator), so it never clobbers surrounding prose or an unrelated block (e.g. Backlog.md's).
  SKILL.md is a whole lore-owned file: the default run leaves a differing (hand-edited) one untouched
  and reports it, while `--force` overwrites it. `--check` reports drift without writing — a CI gate
  that exits `6` (`drift`) when the bridge is stale, `0` when current. Output is `kind: agents.result`.
  Generated content is grounded in live source, never a runbook (it names only real commands — no
  `lore tasks`), guarded by a lockstep test that runs each advertised command through the real router.
- **`lore link` / `lore unlink` — wire a concept's `tasks:` frontmatter to Backlog task ids**
  (LCLI-24, ADR-0009 §1–§2). `link` adds task ids to the concept's `tasks:` list and records the
  back-reference on each task: a queryable `doc:<conceptId>` label plus the concept's repo-relative
  path via `--doc` (display-only). `unlink` removes both sides. Every task id is validated to exist
  before `link` writes anything (fail loud, no partial edit); `unlink` tolerates a task id already
  deleted from Backlog — the doc-side reference is still cleaned up, the back-reference edit is
  simply skipped. Because `--doc` is a SET/REPLACE flag (backlog-cli-contract §2.4), both commands
  read the task's current `documentation` array first and write back the full desired array, so
  linking/unlinking never clobbers an unrelated doc reference on a multiply-referenced task; when
  removal would leave the array empty, `--doc` is omitted entirely (Backlog cannot clear it via an
  empty value) — the cosmetic drift ADR-0009 already documents as an accepted tradeoff. `--no-back-ref`
  skips the Backlog-side edit on either command. Every task's back-reference edit is independent and
  freshly re-read right before writing; a single Backlog subprocess failure is reported on that
  task's row (`backRef: "failed"`) rather than aborting the rest, and the command exits `6` (`drift`)
  when any edit failed — edits run one at a time within an invocation (ADR-0012 §5: no concurrent
  mutating Backlog commands). Neither command will target a reserved hub stem (`index`/`log`), or a
  concept whose id collides case-insensitively with another concept's — Backlog's own label store
  de-dups case-insensitively, so two such concepts could not have independently addressable `doc:`
  back-references. `lore rename` now also moves every linked task's `doc:<conceptId>` label and
  `--doc` path to the renamed concept's new id/path (the file move commits first; the back-ref move
  is best-effort per task, `drift`/exit `6` on a partial failure, and never attempted for an
  unlinked concept or under `--dry-run`) — closing the gap where a rename would otherwise silently
  orphan a task's back-reference. For a concept relocated **outside** `lore rename` (`git mv`, an
  IDE refactor), `lore unlink <id> <taskId…> --allow-missing` tolerates `<id>` not resolving to a
  live concept and cleans up just the stale Backlog-side `doc:` label/`--doc` entry (there is no
  concept file to touch `tasks:` on) — the case-collision guard still protects a *live* concept
  whose id collides with `<id>`. Now consumed by `lore sync` (LCLI-26); `lore check`'s read-only
  drift gate over the same data is LCLI-27's job.
- **`core/reconcile.ts` — roll a Story/Spec's linked task statuses up into one derived `status`**
  (LCLI-23). The pure engine behind the `status:` half of `lore sync`/`lore check` (ADR-0009 §3):
  `reconcileStatus(taskStatuses, statusFlow, overrides?)` classifies each linked task by its
  position in the project's **config-driven** ordered status flow — never hardcoded to the three
  Backlog defaults — and rolls up by elimination: every task terminal → `done`; any task in a
  non-first, non-terminal state → `in-progress`; otherwise → `todo`. A doc with no linked tasks
  returns `null` so its authored `status` is left untouched (a narrative-only doc is never forced
  into a workflow state). Fails loud (exit 6) on a task status absent from the flow (and with no
  override) or a degenerate (empty/duplicate) flow — lore reports a status it cannot classify rather
  than guessing. **`overrides` (LCLI-26)** — sourced from `.lore/config.toml`'s `[reconcile.overrides]`
  — lets a status map straight to a rollup value, bypassing flow position entirely; validated against
  the three rollup values here (`config.ts` deliberately defers that check to this module). Reading
  `backlog/config.yml`'s `statuses:` and resolving each linked task's live status are command-layer
  concerns; wired into `lore sync` (LCLI-26).
- **`core/managed-block.ts` — regenerate the `<!-- lore:tasks -->` region from live Backlog data**
  (LCLI-22). The pure engine behind `lore sync` (writes) and `lore check` (diffs) rewrites a Story's
  managed task table from the JSON the LCLI-21 adapter's `viewTask` returns. Markers are located
  **structurally** — the document is parsed with `mdast-util-from-markdown` and only a top-level
  `html` comment node is a candidate, so a sentinel inside a code fence or blockquote is never
  mistaken for a boundary — then the table is built as a **frozen-format string** and **spliced over
  the byte range between the markers**, copying frontmatter, editor modeline, and prose verbatim.
  This supersedes ADR-0008's `remark-stringify` step: lore ships no markdown serializer, so it
  follows the settled parse-to-locate + string-splice pattern of `rewrite.ts`/`indexes.ts` (ADR-0008
  amended). Regenerating an unchanged block is **byte-identical** (a fixpoint — a no-op `lore sync`
  touches zero bytes and the drift gate stays exact), and each row link comes from the task's
  `filePathRelative` (portable, cross-subtree, `%20`-encoded), never reconstructed from the
  upper-cased display id; a linked task with no on-disk file yet is tolerated (its id renders as
  plain text, never a broken link or an error). Malformed markers (missing/duplicated/crossed) fail
  loud (exit 6). Wired into `lore sync` (LCLI-26); `lore check` (LCLI-27) still diffs read-only.
- **`lore sync [paths…] [--dry-run] [--no-index]` — the write counterpart to `lore check`**
  (LCLI-26, ADR-0009, ADR-0012, ADR-0013). For every concept whose `tasks:` links Backlog tasks:
  resolves each linked task's live status (`viewTask`, every id validated to exist **before** any
  write — a missing id fails loud, `not_found`/exit 3, no partial state), recomputes `status` via
  `reconcile.ts` (honoring `[reconcile.overrides]`) and rewrites it when changed, and regenerates the
  `<!-- lore:tasks -->` managed block (`managed-block.ts`) from the same data. Unless `--no-index`,
  also regenerates every bundle `index.md` (`indexes.ts`) and the git-history-derived `log.md`
  (`log.ts`, via a new real `git log`-shelling adapter, `adapters/git.ts`) pinned to the current
  `HEAD` sha (a repo with no commits yet gets an empty log, not an error). Every write is a byte-diff
  against current disk content first, so a fully clean tree is a true no-op (AC#1) — verified end to
  end against a real git repository, not just fakes. `--dry-run` computes and reports the same diff
  but writes nothing (`docs/` or `backlog/`); `[paths…]` scopes which concepts get
  reconciled/managed-block-regenerated (index/log stay whole-bundle, being inherently global). Each
  changed file is written **atomically** (`fswrite.ts`'s new `writeFileAtomic`: temp file + rename) —
  `sync` is the one command that can write many files in one invocation, so a crash mid-run must
  never leave any single file truncated. **`src/state.ts` (new)** — the `.lore/`-and-git-ownership
  module the design spec calls for (§2.4): a fourth injectable seam (`GitSpawn`, mirroring
  `BacklogSpawn`) backing `commitBacklogIfDirty`, which detects whatever is currently uncommitted
  under `backlog/` (from an earlier `link`/`unlink`/`rename`, or a human's direct `backlog task
  edit`) and commits exactly those paths in one `lore`-authored commit — satisfying ADR-0012's "lore
  is the sole committer of `backlog/`" (AC#2) by vacuuming up drift regardless of source, rather than
  requiring every Backlog-writing command to commit its own touch (tracked as a follow-up,
  retrofitting `link`/`unlink`/`rename` to commit immediately per the design's own sequence flow).
  Skipped entirely under `--dry-run`. Also new: `adapters/backlog.ts`'s `readStatusFlow` reads the
  project's ordered status flow directly from `backlog/config.yml`'s `statuses:` (defaulting to the
  three Backlog defaults when absent), rather than shelling a further Backlog subcommand.
- **`lore check` — status reconciliation + managed-block drift, the last two ADR-0007 passes**
  (LCLI-27). `check` now reuses the exact pure engines `lore sync` writes with
  (`reconcile.ts`'s `reconcileStatus`, `managed-block.ts`'s `regenerateTaskBlock`) but only diffs
  against disk — this command never writes. A `Story`/`Spec` whose persisted `status` no longer
  matches its live Backlog rollup is a `status-drift` finding; a `<!-- lore:tasks -->` region that
  no longer matches what `sync` would render is a `managed-block-drift` finding — both are **errors**
  that always gate exit `6`, unlike the warn-only portability lint. **`commands/reconcile-shared.ts`
  (new)** extracts the task-resolution + reconcile-compute gather previously inline in `sync.ts` so
  both commands share one implementation rather than drifting apart; `sync.ts` was refactored onto
  it with no behavior change. Reconciliation runs per discovered bundle root (mirroring the existing
  multi-root link/anchor pass) but shares a single `BacklogAdapter` instance across roots, so its
  capability probe still runs at most once. A bundle with no `tasks:`-linked concept at all never
  constructs an adapter (mirrors `rename.ts`'s precedent) and `check` stays fully synchronous, the
  existing contract every caller relies on; otherwise `check` now returns a `Promise<number>`. A
  linked task id that no longer exists still fails loud (`not_found`, exit `3`); a concept with
  `tasks:` but malformed/missing managed-block markers still fails loud (`validation`, exit `6`) —
  both reuse `sync`'s own contracts unchanged. `check`'s file-discovery walk silently treats a
  malformed concept as reconciliation-ineligible **only when it carries no `tasks:` link** — that
  document's well-formedness is `lore validate`'s Tier-2 finding to report (ADR-0007's own
  validate/check split), not a second thing `check` re-derives. A malformed concept that DOES declare
  `tasks:` (or whose frontmatter YAML is itself unparseable, so its `tasks:` status can't be ruled
  out) still fails loud instead — `lore sync` would refuse to touch that exact file too, so silently
  treating it as un-linked would be the one case where `check` really would disagree with `sync`.
  **Behavior change:** discovery advisories (a skipped symlink, an unreadable sub-directory) now
  flush to stderr *before* the `check.report` is emitted to stdout, on every invocation — the reverse
  of `check`'s pre-LCLI-27 order, deliberately: advisories are now known and flushed in full before
  any reconciliation step that could throw, so a later failure can never silently drop them (mirrors
  `sync`'s own long-standing order). A script that merges stdout+stderr and assumes report-then-
  advisories should re-check that assumption.
- **`adapters/backlog.ts` — the typed JSON-only Backlog.md read/write surface** (LCLI-21). The
  capability probe (LCLI-4) now backs a full typed adapter over the same injectable `BacklogSpawn`
  seam — the sole place a `backlog` subprocess is spawned and the sole place the `--json` schema is
  parsed. Reads (`listTasks`, `viewTask`, `searchTasks`, `searchByLabel`) `JSON.parse` the
  `{schemaVersion, kind, data}` envelope, assert `schemaVersion`/`kind`, Zod-validate `data` against
  the promoted contract mirror (moved out of the test support module into `src/`, so runtime and the
  golden fixtures lock to one schema), and map into lore's internal `BacklogTask`/`BacklogTaskDetail`
  types — surfacing only the portable `filePathRelative`, dropping the non-durable AC/DoD/comment
  `index`, and keeping `id` as identity. There is **no `--plain` text fallback** (ADR-0002): a bad
  envelope fails loud (exit 6). Writes go through `createTask` (id captured from the `Created task
  <ID>` stdout line, never JSON) and `editTask` (incremental `--add-label`/`--remove-label`);
  `viewTask` returns `null` on a missing id via empty stdout, never trusting `task view`'s exit code.
  The probe is memoized into every path, so a non-`--json`-capable Backlog is refused before any
  output is trusted. **Not yet wired into the CLI** — the coupling commands (`link`/`sync`/…) are
  LCLI-22+; this is the adapter layer only.
- **`lore check --external` — opt-in external-URL liveness** (LCLI-48). With `--external`, `lore
  check` probes every `http(s)` link in the bundle with Bun `fetch` (no Rust/lychee runtime
  dependency) and reports dead, unreachable, or timed-out URLs as advisory `external-link`
  findings. Because liveness is **non-deterministic**, these findings are kept entirely out of the
  deterministic gate (ADR-0007): they **never change the exit code — not even under `--strict`** —
  and the network IO lives in the command layer, never in pure `core/` (ADR-0014). Each distinct
  URL is fetched once (bounded concurrency, per-request timeout) and reported per referencing file;
  the `--json` envelope carries them in a separate `externalFindings` array, leaving the gate
  `errorCount`/`warningCount` untouched.
- **`lore check` portability lint additions** (LCLI-48, warn-only): **MDX hazards** (un-escaped raw
  `<`/`{` in prose and raw HTML tags, which break Docusaurus's MDX build), **filename rules**
  (leading-underscore files/folders Docusaurus ignores as partials, and `.mdx` files), a precise
  **Obsidian block-reference** (`^id`) detector (sparing `x^2`, footnotes, and mid-prose carets
  while catching digit-leading auto ids), **accidental-colon filenames** (`notes:2026.md`, read as
  a `scheme:` URL), and **trailing-slash directory links** (`../reference/`).

- **`lore query` — full-text search the bundle with frontmatter filters** (LCLI-33). `lore query
  ["<text>"] [--type <T>] [--tag <t>]… [--status <S>] [--field k=v]… [--limit <n>]` ranks concepts by
  **BM25-style** in-memory relevance to the search text and filters them by frontmatter — `--type`,
  `--tag` (repeatable, AND), `--status`, and an arbitrary `--field key=value` (repeatable, AND), all
  matched **case-insensitively** (AC#1). The lexical index is built fresh from the loaded graph over
  each concept's id, `title`, `summary`, `description`, `tags`, and body; a text query also acts as a
  relevance filter (a concept with none of its terms is dropped), and ties — and a **filters-only**
  query, where every score is `0` — break by ascending id, so the order is fully deterministic. Each
  hit carries a `summary`-derived one-line snippet (falling back to `title`, else omitted — the same
  compaction `lore context` applies). Output is **bounded** by `--limit` (default 20) with the standard
  `total`/`shown`/`truncated` signal and a *narrow-it* hint (AC#2). **No vectors, RAG, or chunking**
  (ADR-0015) — a deterministic lexical index, not a semantic one. Output follows the uniform CLI modes:
  a ranked text listing (pretty/plain) or the `kind: query.results` envelope under the global `--json`.
  Exit `0` ok (zero hits is still `0`) · `2` bad usage (unknown/repeated/value-less flag, non-integer/
  too-large/non-positive `--limit`, malformed `--field`, or a second positional). The BM25 search lands
  in the shared `core/query.ts` beside the `subgraph` traversal — the two halves of "navigate the
  bundle" (lexical relevance and structural reach) over one `BundleGraph`.
- **`lore context` — assemble a token-budgeted context pack for a concept** (LCLI-34). `lore context
  <id> [--max-tokens <n>] [--depth <n>]` emits the target concept's **full body** plus a **one-line
  `summary` compaction** of its neighbors out to `--depth` hops (default 1), so an agent can be handed
  a concept *and* enough of what surrounds it within a budget. It is deliberately **structural, not
  ranked** (no relevance heuristics — that is `lore query`'s job): the neighborhood comes from the same
  shared, undirected, cycle-tolerant `core/query.ts` `subgraph` traversal `lore graph` uses, and
  neighbors are taken **nearest-first** (depth-1 before depth-2). Each token figure is the chars/4
  heuristic: the target is charged the whole-concept estimate (the same `~tokens` `lore graph` reports),
  and each neighbor is charged its emitted entry — `id` + `type` + `summary` (`summary` falls back to
  `title`, else nothing) — so a wide neighborhood of short summaries can't silently overrun the budget.
  `--max-tokens` trims neighbors greedily, **stopping at the first that would exceed the budget** (a
  predictable nearest-first prefix), reporting dropped neighbors via the standard `total`/`shown`/
  `truncated` signal with a *raise `--max-tokens`* hint. The **target is always included** even when it
  alone exceeds the budget — and that pack is honestly flagged `truncated` (with an `over budget` line),
  so a `truncated: false` always means "everything fit", never a silent overrun. With no `--max-tokens`
  the pack is bounded only by `--depth`. The `<id>` is normalized like `lore graph`/`rename`, and output
  follows the uniform CLI modes: a pasteable text pack (pretty/plain) or the `kind: context.export`
  envelope under the global `--json`. Exit `0` ok · `2` bad usage (missing or duplicate `<id>`,
  unknown/repeated/value-less flag, non-integer/too-large/out-of-range `--max-tokens` or `--depth`) ·
  `3` `<id>` not in the bundle. The `title` a concept reports is now byte-identical across `lore graph`
  and `lore context` (one shared `core/bundle.ts` `frontmatterScalar` coercion).
- **`lore graph` — emit the bundle's cross-link graph** (LCLI-31). `lore graph [<id>] [--dot] [--depth
  <n>]` surfaces the graph `loadBundle` already builds — concepts as nodes (each with its `type`,
  optional `title`, and a chars/4 token estimate), OKF body cross-links and the
  `specs`/`supersedes`/`superseded_by` frontmatter refs as edges (a broken reference is a visible
  `dangling` edge, never an error). With **no `<id>`** it exports the whole bundle; with an `<id>` it
  exports the **subgraph** rooted there, bounded to `--depth` hops (unbounded when `--depth` is
  omitted), narrowed by a new shared, undirected, cycle-tolerant neighborhood traversal
  (`core/query.ts` `subgraph`) that `lore context`/`orphans` will reuse. The `<id>` is normalized like
  `lore rename`'s, so a path/`.md`/`./` form resolves to the same concept. Output follows the uniform
  CLI modes: a human node/edge listing (pretty/plain) or the `kind: graph.export` envelope under the
  global `--json` (nodes, edges, summed token estimate). `--dot` instead emits Graphviz DOT, so `lore
  graph --dot | dot -Tpng` works (a piped stdout auto-selects plain); `--dot` and `--json` are
  mutually exclusive. Exit `0` ok · `2` bad usage (`--dot` with `--json`, unknown/repeated/value-less
  flag, non-integer or too-large `--depth`, `--depth` without a root) · `3` root `<id>` not in the
  bundle.
- **`lore schema export` — materialize the profile's editor JSON Schemas** (LCLI-20). `lore schema
  export [--out <dir>] [--type <T>]` writes one Draft-7 JSON Schema per active-profile type to
  `.lore/schemas/` (default), so the `# yaml-language-server: $schema=…` modeline `lore new`/`lore
  init` stamp resolves and drives YAML autocomplete/validation in VS Code and Obsidian (AC#1). The
  profile is loaded from the project's `.lore/profile.toml`, so a project's **custom** types export
  too (AC#2); with no profile present it is the built-in story-convention profile (zero-config). The
  per-type bytes come from the **shared** `core/schema.ts` `emitSchemaFiles` emitter that backs `lore
  init`, so an exported schema is byte-identical to a scaffolded one (two-space pretty JSON, one
  trailing newline). `--type <T>` exports a single type (resolved case-insensitively); `--out <dir>`
  redirects output and is **confined to the repo** (a `..`-escaping or absolute path is a usage error,
  so an overwrite can never clobber files outside the bundle). A **full** export (no `--type`) also
  **prunes** orphaned `<slug>.schema.json` files left by a type the profile no longer declares, so
  `.lore/schemas/` mirrors the active profile instead of drifting; a single-`--type` export prunes
  nothing. Two type names that reduce to the same lower-kebab slug — which would collide on one schema
  (and template) file — are now rejected at profile load (`core/profile.ts`) rather than silently
  overwriting each other. Output `kind: schema.result`; exit `0` ok · `2` bad usage / unknown or
  repeated flag / unknown `--type` / repo-escaping `--out` · `4` output directory not writable.
- **`lore supersede` — record a supersession both ways** (LCLI-35.3, the last of LCLI-35's three
  refactoring commands; delivers the supersede half of LCLI-35). `lore supersede <oldId> <newId>
  [--rewrite-links] [--dry-run]` marks one concept superseded by another and wires the relationship in
  both directions: on the **old** concept it sets `status: superseded` and `superseded_by: <newId>`;
  on the **new** concept it **appends** `<oldId>` to `supersedes` (normalizing a scalar to a list and
  never clobbering or duplicating an existing entry — a concept may supersede several). Both edits go
  through the byte-stable `serializeConcept` under the **active profile** (so the written `status` is
  validated against the project's own profile — a custom `status` enum that forbids `superseded` fails
  fast here rather than slipping through to break the next `lore validate`), in canonical key order,
  so the wiring is the only diff and the whole body round-trips verbatim (ADR-0011). Unlike `lore
  rename`, the old file is **preserved as history** — nothing moves, nothing is deleted, and no
  `index.md` is regenerated (listings are unchanged). With `--rewrite-links` it repoints inbound
  **body links** to the successor by reusing the same pure `core/rewrite.ts` `rewriteInbound` engine
  `lore rename` ships, in place-only (`move:false`) mode, with two supersede-specific restrictions:
  (a) `specs`/`supersedes`/`superseded_by` **frontmatter** refs are left intact — because the old file
  is preserved, a third party's ref to it is a valid historical record, not a dead pointer, so
  repointing it would fabricate a relationship that never happened; and (b) the two **principals** and
  the machine-owned `index.md`/`log.md` hubs are **excluded** — the old doc's own (historical) body
  links and the new doc's legitimate links *to* its predecessor stay intact (so the successor is never
  made to link to itself), and a generated hub is never hand-rewritten. All validation lives in the
  thin `commands/supersede.ts` (the engine's `move:false` path checks only that `oldId` exists): both
  ids must name concepts and neither may be a reserved hub name; the old concept must not already be
  superseded — `status: superseded` (matched case-insensitively) **or** an already-recorded
  `superseded_by` (which would otherwise be silently overwritten, losing the recorded successor).
  Exit `0` ok · `2` bad usage / self-supersede / reserved id · `3` either id not found · `5` old id
  already superseded. The `rewriteInbound` engine gained two reusable options for this —
  `rewriteFrontmatterRefs` (default `true`, preserving `lore rename`'s behavior) and an `exclude` id
  set — and `core/bundle.ts` now exports a shared `conceptNotInBundle` `not_found` factory so the
  command layer and the engine surface identical wording.
- **`lore rename` — graph-aware concept rename** (LCLI-35.2, the second of LCLI-35's three refactoring
  commands; delivers LCLI-35 AC#2). `lore rename <oldId> <newId> [--dry-run]` moves a concept to a new
  id/path and repoints **every** inbound reference to it — body cross-links (including used
  reference-style definitions, with any `#fragment`/`?query` preserved) and `specs`/`supersedes`/
  `superseded_by` frontmatter refs (rewritten to the canonical bare-id form) — then recomputes the
  moved file's **own** outbound links against its new directory (a sibling becomes a `../` link, a
  self-link retargets, and even a dangling link is corrected by pure path arithmetic), and regenerates
  the affected `index.md` listing hubs against the post-rename graph. The new pure `core/rewrite.ts`
  engine (`rewriteInbound`, 100% func) computes the rewrite plan from the bundle graph and edits link
  destinations by a **surgical mdast-position string splice** — never parse→stringify — so authored
  prose outside a changed destination is byte-for-byte unchanged (AC#3) and no markdown serializer is
  pulled in (ADR-0001/ADR-0008 §7). Because a parsed `node.url` is not byte-equal to its source
  (angle-bracket `<…>` wrapper stripped, `\(`→`(` unescaped, `"title"` dropped), the destination's
  exact byte range is located structurally inside each link node rather than by text search.
  Resolution mirrors the bundle graph's own rules (case-sensitive, leading-slash absorbed), so it
  rewrites exactly the edges the graph counts; only **concept** files are rewritten (a link from a
  non-concept file is left for `lore check`). The thin `commands/rename.ts` owns IO: it loads the
  bundle, relocates the renamed file atomically (`fswrite.moveFile` renames the inode), skips an
  unrelated already-canonical hub (no churn), and emits a `rename.result` report. Exit `0` ok · `2`
  bad usage / same id / reserved target name · `3` old id not found · `5` new id already exists.
  Hardened after a `/code-review max` pass that found 15 correctness defects, all folded — a cluster
  of them silent **data loss**: a case-only rename (`Foo`→`foo`) on a case-insensitive filesystem no
  longer deletes the just-written file (the file is **renamed**, not write-new-then-delete-old); a
  `newId` that collides with an existing file is rejected even when it differs only in **case** or is
  a **non-concept** `.md` (the conflict guard now checks the filesystem, not just the graph); renaming
  onto a reserved `index`/`log` name is refused; renaming into a **not-yet-existing directory** now
  creates it (`mkdir -p`) instead of failing ENOENT; and emptying a directory of its last concept now
  **clears that directory's stale `index.md` listing** instead of leaving a dead link in a managed
  block. The rewrite engine was tightened too: the moved file's own path-form **frontmatter** refs to
  *other* concepts and its **orphan** reference definitions are now recomputed for the new location
  (previously asymmetric with body links); a `#fragment`/`?query` is preserved from the **source**
  bytes (not the decoded `node.url`), keeping AC#3 byte-fidelity; and the engine now **reuses**
  `bundle.ts`'s `resolveRef`/`internalTarget`/`resolvePath`/`REF_FIELDS` (exported) instead of
  re-implementing them, so its trimming and classification can no longer drift from how the graph
  counts edges. (Full cross-file transactional rollback on a mid-commit IO failure remains a shared
  concern with `lore replace`, deferred.)
- **`lore replace` — managed-region-safe find-and-replace** (LCLI-35.1, the first of LCLI-35's three
  refactoring commands). Literal or regex (`--regex`, with `$1`/`$&` substitution) find-and-replace
  across one doc or the whole `docs/` bundle (`--in <glob>`, repeatable), with `--dry-run` to preview.
  Its inviolable rule is AC#1: a lore-**managed region is never touched**. The pure `replaceInText`
  engine (`core/replace.ts`) partitions each file at its managed-region boundaries and rewrites only
  the author-owned gaps, stitching every managed region back byte-for-byte and counting matches
  outside those regions only — so a refactor can never corrupt or churn machine-owned content that
  `lore sync` regenerates. Managed regions come from a small extensible marker registry
  (`MANAGED_MARKERS`); today the only kind is the `<!-- lore:index:begin/end -->` listing block
  (markers imported from `core/indexes.ts` for one source of truth), with `<!-- lore:tasks -->` a
  one-entry addition once LCLI-22 lands. The thin `commands/replace.ts` owns discovery/IO: `.md`-only
  targeting (a glob match on `mkdocs.yml` or other config is left alone), `Bun.Glob` scoping confined
  to the repo, overwrite writes via a new `fswrite.writeFileOverwriting`, and a `replace.result`
  report (per-file counts + run totals). Exit `0` ok · `2` invalid regex / bad usage. Delivered as
  pure core (100% line/func) + tests.
  Hardened after a `/code-review max` pass that found 11 correctness defects, all folded: the engine now
  runs **one pass over the whole document** (so regex anchors/`\b`/lookaround bind to the real document,
  not to the gaps around a managed block) and skips any match overlapping a managed region, with explicit
  `$1`/`$&`/`` $` ``/`$'`/`$<name>` expansion verified byte-for-byte against `String.prototype.replace`;
  an empty-**matching** pattern (`x*`, `a?`, `\b`, `^`, …) is rejected up front, not just the literal
  empty find; managed-region bounds are now located by the **shared** `indexes.locateManagedBlock`
  (first-begin → last-end) so `replace` protects exactly the span `lore sync`/`check` regenerate
  (including the prose between two blocks); discovery **skips symlinks** (a write can't escape the repo),
  **de-duplicates by canonical realpath** (one physical file rewritten once, never double-applied),
  resolves **absolute `--in` globs** correctly, and **excludes the generated `log.md`**; the pattern is
  validated **once up front** so a bad pattern fails even with zero matched files; all reads + replaces
  complete **before any write** (a read error or bad pattern aborts atomically, leaving the bundle
  untouched); a **no-op** replacement (`find === replace`) changes and reports nothing; and
  `writeFileOverwriting` maps `EISDIR` to a `conflict` (exit 5). The shared file-read/identity helpers
  were extracted to `commands/discover.ts` (`readSource`/`canonicalIdentity`/`toRepoRelative`/
  `withinRepo`), de-duplicating the copies in `check`/`validate`. (The shared flag-tokenizer cleanup
  across the four command parsers is deferred.)
- **`lore check` — internal link/anchor validation + portability lint** (LCLI-30). A new read-only
  coherence gate built on the pure `checkBundle(files)` engine (`core/check.ts`): a whole-bundle pass
  that (1) resolves every internal relative `.md` cross-link against the **full bundle file set**
  — concepts *and* the frontmatter-free `index.md`/`log.md` hubs, so a generated hub link to a
  non-concept sub-index resolves rather than falsely reporting broken (the LCLI-29 link-gate
  follow-up) — reporting a missing target as a `broken-link` **error**; (2) validates every
  `#fragment` against the target file's GitHub-style heading slugs (deduped `-1`/`-2`), reporting
  anchor rot as a `broken-anchor` **error** (AC#1), including same-file anchors; and (3) lints
  portability — non-portable link *form* via the shared `validateLink` classifier plus an
  mdast-text-node scan for wikilinks, embeds, callouts, highlights, `%%`-comments, and block refs
  — as **warnings** that never fail the gate on their own (AC#2). Built on the existing
  `mdast-util-from-markdown` + `walkMdast` machinery (no `remark-validate-links` / `unified`
  dependency, keeping zero-config `bunx`); the thin `commands/check.ts` owns discovery/IO/exit and
  exits `6` on any broken link/anchor (or any warning under `--strict`), `0` otherwise. `--external`
  (external-URL liveness) is **accepted but deferred** — a stable surface with no non-deterministic
  networking in the gate. Scope (LCLI-30): the two deterministic, dependency-free passes; the
  status-reconciliation and managed-block-drift passes (which need the Backlog JSON adapter +
  `lore sync`, LCLI-26) are wired in later. Delivered as pure core + tests (`core/check.ts` 100%
  line/func).
  Hardened after a `/code-review max` pass: the GitHub slugger now runs the full github-slugger
  collision loop (so `Release`/`Release 1`/`Release` yield `release`/`release-1`/`release-2`, not a
  false broken `#release-2`); each root passed to `lore check` is now an **independent bundle with
  its own id namespace** (two roots sharing a relative path like `index.md` no longer drop or shadow
  one another); a `/`-absolute link resolves against the bundle root (not the linking dir); the
  callout detector is anchored to the start of a blockquote line (a literal `[!important]` mid-prose
  no longer false-warns under `--strict`); the bundle-escape test no longer mis-skips a file literally
  named `..x.md`; each file body is parsed by mdast **once** and shared across the heading/link/
  portability passes; and `bodyText` reuses the canonical `normalizeInput` + gray-matter boundary
  (with `nodeText` hoisted to `bundle.ts` so anchor slugging and section matching can't drift). The
  noisy block-reference detector and accidental-colon-filename detection are deferred to LCLI-48.
- **`validateLink` `unencoded` lint aligned with the writer's alphabet** (LCLI-30, from the same
  review). A path segment is now canonical iff it is only RFC-3986 unreserved characters and valid
  `%`-escapes — so a raw `! ' *` (which `encodePathSegment` percent-encodes) is flagged, keeping the
  linter and writer in agreement, while an over-encoded `%41` or lowercase `%c3` still passes.
- **`validateLink` classifier hardening** (LCLI-30, folded from PR #19's `/code-review max`). Fixed
  the per-link portability classifier now that `lore check` is its first caller: a **wrong-case**
  `.md` (`orders.MD`) is flagged (404s on a case-sensitive host) while **dotfiles** (`.gitignore`),
  **directory links** (`../reference/`), and other **asset** extensions are correctly left alone; the
  extension is judged on the **decoded** path so the linter and the bundle resolver agree;
  destination-breaking characters in a `#fragment`/`?query` are now scanned (not just the path); a
  **valid-but-non-canonical** encoding (`a%41b.md`, lowercase `%c3`) is accepted instead of mislabeled
  `unencoded`; an interior `//` is reported; and a **malformed** `%`-escape gets its own message. A
  shared `pathPart()` (`stripQuery ∘ stripFragment`) replaces the three duplicated call sites and is
  reused by `bundle.ts`.
- **Graph-derived `index.md` generation — `core/indexes.ts`** (LCLI-29). A pure
  `generateIndexes(g, { existing })` that regenerates every bundle `index.md` as a deterministic,
  byte-stable **navigable hub**: the reserved root entry point plus one local hub per
  concept-bearing directory (and its ancestors, so the tree links from the root down), each listing
  its immediate child concepts and child-directory indexes as portable, percent-encoded relative
  `.md` links sorted with `compareCodeUnits`. Index files are **hand-authored documents with one
  machine-owned region**: only the `<!-- lore:index:begin -->…<!-- lore:index:end -->` block is
  regenerated, **string-spliced into the file's raw bytes** so frontmatter, the root index's in-fence
  modeline, and all curated prose survive byte-for-byte (lore-design §6.2) — never round-tripped
  through `serializeConcept` (which would drop the modeline). The current on-disk bytes enter through
  an injected `existing` seam (the determinism boundary `log.ts` draws with `GitAdapter`), keeping
  core pure; a sub-index that does not yet exist is synthesized **frontmatter-free** (AC#2), and the
  root index's `okf_version`/creation stays `lore init`'s job. Splicing is a **fixpoint** — a
  no-change run is a byte-level no-op — so `index.md` stays trustworthy under `lore check`'s
  regenerate-and-compare drift gate (AC#1). Delivered as pure core + tests (`indexes.ts` 100%
  line/func); the `lore sync` wiring that reads/writes the files is LCLI-26, the remark/mdast
  unification of all managed regions is LCLI-22, and the temporary local path-segment encoder is
  swapped for `links.ts`'s shared `encodePathSegments` once LCLI-28 lands on `dev`.
  Hardened after a `/code-review max` pass: untrusted titles are single-lined, bracket-escaped, and
  have HTML-comment sentinels neutralized (a title cannot break a link or poison its own block); the
  splice collapses duplicate blocks (first-begin → last-end) and rewrites a truncated region to EOF
  so regeneration converges to a fixpoint from a merge-corrupted file; and a present-but-empty index
  is synthesized like an absent one. Known follow-up for the link gate: a generated root hub links to
  frontmatter-free sub-indexes (not graph concepts), so `lore check` (LCLI-27) must treat reserved
  `index.md`/`log.md` link targets as resolved, not broken.
- **`core/links.ts` — the canonical cross-link form in one place** (LCLI-28). The single home for
  the ADR-0010 link rule (relative · URL-encoded · `.md`-suffixed · no leading slash · no
  wikilinks), so the form can never be spelled two ways. `normalizeLink(fromPath, toPath, anchor?)`
  is the deterministic **writer** (path arithmetic over `posix.relative`, canonical lowercase `.md`
  coercion, per-segment encoding); `validateLink(target)` is the per-link portability **classifier**
  (`leading-slash`/`missing-extension`/`unencoded`) that `lore check`'s lint will compose. The
  segment encoder (`encodePathSegments`) is shared with the `resource:` URL stamper, and the
  destination classifiers (`isExternalTarget`/`decodeTarget`/`stripFragment`/`stripQuery`) moved out
  of `bundle.ts` into `links.ts` and are re-imported there. Pure core (lore-design §2.1): string in,
  string/typed-finding out; non-portable input is a finding, never a throw. The command wiring
  (new/sync/link/index-gen/managed-block) and the graph-wide passes land with their consumers
  (`validateLinks`+anchors → LCLI-30; `rewriteInbound` → LCLI-35). **Behavior ripple:** the shared
  encoder now also percent-escapes the markdown-significant `! ' ( ) *` that `encodeURIComponent`
  leaves raw, so a `lore new` `resource` URL for a doc path containing those characters is now
  correctly escaped (an unbalanced `)` previously truncated such a link on CommonMark/MkDocs). To
  keep that ripple non-breaking, `lore validate`'s resource-drift check now compares decode-tolerantly
  (`decodeTarget` on both sides), so a `resource` stamped before the encoder tightened (literal
  `( ) ! ' *`) is recognized as equivalent — not falsely reported "stale" — on upgrade.
- **`GitAdapter` seam + git-history `log.md`, and `resource` stamping** (LCLI-47). Two pieces of
  the ECK↔lore alignment (D5):
  - The **third injectable deterministic seam, `GitAdapter`** (after the clock and the Backlog
    subprocess — lore-design §8, ADR-0014), plus a pure `generateLog` that renders the bundle's
    `log.md` from commit history: per-folder, directory-sorted, commits sorted by
    `(timestamp, hash)`, so output is order-independent and **byte-stable**. git is local,
    deterministic computation over a **pinned commit range** — not a network model — so it stays
    offline-, air-gap-, and CI-reproducible. `core/log.ts` (interface + pure fn) is delivered and
    tested against a **fixed fake history** (never real `git`); the real `git`-shelling adapter and
    the `lore sync` wiring that materializes `log.md` land with `sync`. Because a git-derived
    `log.md` changes on every commit, it is a `sync`-time artifact **excluded** from `lore check`'s
    drift gate (ADR-0007 amended); `index.md` and managed blocks stay gated.
  - `lore new` now **stamps the OKF-recommended `resource` key** from the profile's
    `[profile].resource_base`: `resource = <resource_base>/<repo-relative doc path>`, exactly one
    join slash, each path segment URL-encoded (slugs unchanged; spaces/non-ASCII percent-escaped),
    `.md` kept. It is **opt-in and byte-safe**: an empty `resource_base` (the default) omits the key
    entirely, and index/sub-index files never carry it, so zero-config output is unchanged.
    `resource` is a recognized OKF key (`schema.ts` `OKF_RESERVED_KEYS`), not a profile field, so it
    raises no extra-key warning and changes no generated validator or committed schema (ADR-0013
    amended) — except on an `index.md`, where a hand-authored `resource:` *is* warned (an index
    carries none). Whether to stamp is decided **per-type**: a type that declares its own `resource`
    field defers only for *that* type, and a `resource = { required = true }` string field is
    satisfied by the stamp (not failed) — an incompatible `datetime`/`enum`/`list` field still
    defers. `lore validate` also gains an advisory **`resource` drift** warning: a present `resource`
    that no longer matches its path + `resource_base` is flagged stale (inert under zero-config).
- **Declarative `.lore/profile.toml` — the type system is now data, not code** (LCLI-46). A
  committed, declarative profile is the single source of truth for the type vocabulary, each
  type's frontmatter shape, its required body sections, and its template; lore **generates** its
  runtime Zod validators *and* the editor Draft-7 JSON Schemas from it at load (inverting
  ADR-0006: declarative profile → generated Zod → `z.toJSONSchema`). The grammar (TOML, with a
  `.json` form) declares `[profile]` (name, okf_version, case, resource_base), `[base.fields]`
  (fields every type carries; `type` must be required), and `[[types]]` (name, `fields` with
  `kind`/`enum`/`items`/`required`/`default`, required `sections`, and a `template` ref). It is
  **zero-config**: absent — or every line commented — falls back to the built-in
  story-convention profile (Epic/Story/Spec/ADR/Runbook/Reference), so existing bundles behave
  byte-for-byte as before. A custom profile is read by the **standalone binary as data** — no
  code, no library; the declarative language is the boundary (no escape hatch). Two things stay
  lore built-ins (not declaratively expressible): the ADR-0006 §5 summary heuristic and the
  `supersedes`/`superseded_by` `string | list` coupling fields. A type's editor schema filename
  is its **LOWER-KEBAB slug** + `.schema.json` (`QA Plan` → `qa-plan.schema.json`); single-word
  story types are unchanged. `lore init` now scaffolds a commented `.lore/profile.toml`. The
  grammar is validated against ECK's 17-type SDD vocabulary with zero consumer-file edits.
  `src/core/profile.ts` owns loading + compiling; `schema.ts`/`concept.ts`/`validate.ts`/
  `scaffold.ts` and the commands thread the compiled `Profile` (ADR-0006/0007/0011/0013 amended).
- `lore validate [paths…]` (LCLI-19): tiered, per-file conformance reporting. Unlike the
  fail-fast write path, validate is an **aggregating reporter** — it surfaces *every* file's
  findings in one pass, tiered error/warning, and emits a `kind: validate.report` payload on
  stdout, then **returns** exit `6` when any error-tier finding exists (or any warning under
  `--strict`); the report is the payload, the exit code is the gate signal. Tiers (ADR-0007):
  **OKF §9** (frontmatter parses, non-empty `type`) and **per-type shape** — the strict Zod
  schema **plus per-type required body sections** — are errors; an **unknown type / extra key /
  summary** issue is a warning (OKF tolerance: unknown types never fail, LCLI-19 AC#1); and a
  cross-cutting **frontmatter quote-safety** check flags unquoted scalars a YAML-1.1 consumer
  would coerce (`yes`→bool, bare dates, leading `@`/`*`/… indicators, colon-space). Required
  sections follow a **minimal, evidence-based** policy (ADR → `Status`/`Context`/`Decision`/
  `Consequences`; Story → `Acceptance criteria`; others none) so the existing hand-authored
  bundle stays green while a fresh `lore new` of any type still validates clean. With no paths
  the whole `docs/` bundle is walked; explicit `[paths…]` (a file or directory) validate only
  those — the staged-only pre-commit run (AC#2). A non-concept file (no frontmatter) is
  **skipped**, not failed. Flags: `--type <T>` (limit to one type), `--strict` (warnings fail).
  `src/core/validate.ts` is the pure engine (`validateConceptText`/`validateFiles`/
  `quoteSafetyFindings`); `src/commands/validate.ts` the thin discovery/I/O layer. Required
  sections are a single source of truth in `schema.ts` (`requiredSectionsFor`); `walkMarkdown`
  is exported from `bundle.ts` for reuse.
- `lore new <type> "<title>"` (LCLI-18): scaffold a typed concept from a template.
  lore **owns the frontmatter** — it is built structurally (type/title/summary/timestamp,
  plus `--tags`) and serialized through the byte-stable concept boundary, so a title or
  summary containing YAML-special characters can never corrupt the file — while the
  **template owns the body**: a body-only markdown skeleton with `{{placeholders}}`
  resolved from `.lore/templates/<name>.md` when present, else a built-in per type. New
  docs **validate clean by construction** (a known type, a stub `summary`, and the editor
  modeline spliced inside the fence) and a re-run never clobbers an existing file (a
  `conflict`, exit `5`). `src/core/template.ts` is the pure renderer (`slugify`,
  `renderTemplate`, `buildNewConcept`); `src/commands/new.ts` the thin I/O layer. Flags:
  `--var k=v` (repeatable; an unfilled `{{var}}` fails loud, exit `6`), `--template <name>`,
  `--summary`, `--tags a,b`, `--out <path>` (confined to the `docs/` bundle root, never the
  reserved `index.md`). The type token is validated (no path-escaping/whitespace), `--`
  ends option parsing (a dash-leading title), a value-taking flag won't swallow a following
  flag, and a user template is resolved case-insensitively. Unknown types are accepted (OKF
  tolerance) and scaffolded against the lenient shape without a modeline.
  Type config gains a per-type output directory (`typeDirectory`) and case-insensitive
  type resolution (`canonicalType`) in `schema.ts`; `DOCS_DIR` is exported from
  `scaffold.ts`; the never-clobber/conflict write path is factored to `src/commands/fswrite.ts`
  and shared with `lore init`. (Coupling flags `--epic`/`--story`/`--resource` deferred to
  the story-task coupling work, ADR-0009.)
- Concept frontmatter layer (LCLI-15): `src/core/schema.ts` + `src/core/concept.ts` —
  the frontmatter boundary and Zod source of truth. `schema.ts` authors the
  story-convention profile (the six known types `Epic`/`Story`/`Spec`/`ADR`/`Runbook`/
  `Reference`) in Zod; `validateFrontmatter` enforces the OKF tiers — a missing `type`
  or a mistyped known field throws a `validation` `LoreError` (exit `6`), while an
  unknown type, an extra key on a known type, or a missing/over-long `summary` is a
  warning (OKF tolerance), recorded on a `WarningCollector` rather than printed.
  Validation never rewrites the data, and dates stay ISO **strings** (ADR-0006 §2).
  `concept.ts` turns a `.md` file into a typed `Concept {id, path, type, frontmatter,
  body}` (`parseConcept`) and back (`serializeConcept`) through one frozen
  gray-matter + js-yaml engine (`JSON_SCHEMA` keeps timestamps as strings; pinned dump
  options give deterministic block style, no wrapping, stable minimal quoting). Output
  is **byte-stable**: known keys emit in a fixed canonical order with unknown keys
  preserved verbatim, so re-serializing a canonical doc reproduces the exact bytes and
  the round-trip is a fixpoint (ADR-0011; golden + idempotency tests, design §9.2). A
  literal `__proto__` frontmatter key is preserved as data without prototype pollution.
  New runtime deps, version-pinned for serializer stability (ADR-0011): `gray-matter`,
  `js-yaml`, `zod`. JSON-Schema emission and the above-fence editor modeline are
  deferred to `lore init`/`lore new` (LCLI-17), where they are consumed.
- Output-mode layer (LCLI-12): `src/output.ts` — lore's single rendering seam.
  `resolveMode`/`resolveOutput` resolve one of three modes up front with the locked
  precedence `--json > --plain > pretty`; a non-TTY stdout auto-selects `--plain`
  (deterministic pipes without a flag) and `--json` always overrides (cli-contract §1).
  The returned `OutputContext` carries `mode` as the single routing key (plus the
  env-dependent `color`); `errorRenderOpts(ctx)` derives the `{ json, color }` pair
  `reportError`/`WarningCollector.flush` consume, so the success and error paths can't
  disagree and errors.ts keeps owning no TTY/mode logic. Color is enabled **only** in
  pretty mode with `NO_COLOR` unset (any value, including the empty string, suppresses;
  cli-contract §6). `successEnvelope` builds the additive-only
  `{ schemaVersion, kind, data }` success envelope (`SCHEMA_VERSION = 1`, §2). `emit`
  serializes the `--json` envelope **then validates those exact bytes** before writing,
  so a malformed/non-serializable payload (`undefined`/primitive/`Date`-like/`BigInt`/
  circular `data`, or a non-`object`/array result) throws with empty stdout (the "stdout
  parses or stays silent" invariant, §4) rather than emitting a lie at exit 0; pretty/
  plain output is normalized to exactly one trailing newline (an empty or whitespace-only
  body stays silent, significant trailing whitespace is preserved). `truncation`/
  `renderTruncationLine` provide explicit, count- and newline-guarded bounded-output
  hints (`showing 30 of 120 — narrow with …`, §3). Hardened across four `/code-review max`
  passes. Module + tests only; commands wire it in at M1 (matches the errors.ts/config.ts
  precedent). `errors.ts` additionally exports `singleLine`/`asText` (shared text
  discipline) used by the truncation hint.
- `.lore/config.toml` loader (LCLI-10): `src/config.ts` — `loadConfig({ root?, env? })`
  parses the committed config with **Bun-native TOML** (no added dependency) into a
  typed, validated `LoreConfig` (`reconcile`, `validate`, `confluence`). Zero-config
  (a missing file yields the documented defaults), deterministic via injectable
  `root`/`env` seams, and snake_case TOML keys map to camelCase fields. The Confluence
  token is read **only** from `$LORE_CONFLUENCE_TOKEN` and is never persisted; a token
  committed under `[confluence]` fails loud. Malformed TOML or an out-of-contract value
  throws a `validation` `LoreError` (exit `6`); unknown keys/sections are tolerated for
  forward-compatibility. lore's own `.lore/config.toml` is committed; `.lore/cache/`
  stays gitignored (ADR-0013).
- Shared error model (LCLI-11): `src/errors.ts` — the `LoreError` taxonomy and
  centralized semantic exit-code mapping (`0` ok, `2` usage, `3` not-found,
  `4` denied, `5` conflict, `6` validation/drift; `1` reserved for uncaught
  bugs), the `--json` `{error_type,message,hint,input}` error envelope rendered
  on stderr, and a warnings-not-errors `WarningCollector` (advisory warnings go
  to stderr and never change the exit code by themselves). Mode/color are caller
  inputs — the module resolves no TTY/`NO_COLOR` and never writes stdout
  (cli-contract §4–§5 / ADR-0005). The CLI wires this in at M1. The error path is
  crash-safe: the `--json` envelope serializes through a `safeStringify` fallback
  that tolerates a circular, `BigInt`-bearing, or throwing-`toJSON`/getter
  `LoreError.input` (true cycles → `[Circular]`, `BigInt` → decimal string, shared
  acyclic refs preserved, an individual unserializable field → `[Unserializable]`)
  while `error_type`/`message`/`hint` always survive; the safe path honors a
  custom `toJSON` (a `Date` → its ISO string), so it agrees with the fast path
  and respects a `toJSON` written to hide fields. The uncaught branch guards
  message derivation against a hostile `toString`/`Symbol.toPrimitive` and
  surfaces a thrown non-Error object's detail (its `message`, else a JSON
  projection, with an empty `message` honored as-is rather than dumping the
  object's other fields) instead of `"[object Object]"`. The envelope coerces
  `message`/`hint` to single-line strings, omits an empty `hint`, and echoes only
  a non-null, non-array object `input` (cli-contract §5.2).
  `WarningCollector.flush` is documented as non-draining, and `EXIT_CODES` is
  frozen.
- CI (LCLI-8): GitHub Actions workflow running `lint`, `typecheck`, and
  `bun test --isolate` across Ubuntu/macOS/Windows (Windows tuned with
  `--max-concurrency=4` for stability), plus a Linux compile smoke. The Bun
  version is sourced from `.bun-version` (single source of truth). A
  `.gitattributes` pins text files to LF so the lint gate is stable on Windows.
- Dev tooling (LCLI-7): Biome for lint + format (honoring `.editorconfig`) and the
  `bun test` harness with coverage (`bunfig.toml`, text + lcov reporters). Scripts:
  `format`, `lint`, `lint:fix`, `test`, `test:coverage`. (Biome was chosen over the
  task's original ESLint+Prettier to satisfy the *thin* and *match Backlog.md* rules.)
- Bun + TypeScript toolchain scaffold (LCLI-6): `package.json` (`@salient-data/lore`,
  bin `lore`), strict `tsconfig.json`, Bun pinned to `1.2.23` (`.bun-version` +
  `packageManager`/`engines`) with rationale and bump procedure in `DEVELOPMENT.md`,
  and a stub `lore` CLI (`src/cli.ts`).
- Project bootstrap: repository, MIT license, `.gitignore`/`.editorconfig`, community files.
- Product specification (`lore-spec.md`) and the OKF documentation bundle under `docs/`
  (architecture, tech stack, design, ADRs, runbooks, references).
- Build plan tracked as Backlog.md milestones and tasks.

### Changed
- **`lore link`/`lore unlink`'s `--plain` per-task line, the shared bad-concept-id hint, and
  `lore tasks`/`lore context`'s missing-arg usage text were harmonized in one pass** (LCLI-259).
  **The `--plain` reformat is a contract-level change** per
  [cli-contract.md](docs/reference/cli-contract.md) §1.3 ("substantial reformatting of `--plain`
  output is treated as a contract change, not a cosmetic one") and §7.2 (which separately lists
  substantially reformatting `--plain` output among the non-JSON changes still counted as breaking):
  `renderTaskReport`'s (`src/commands/link.ts`) per-task success line moved from
  `<task>: <status> (doc), back-ref <backRef>` to `<task>: tasks: <status>, back-ref: <backRef>` —
  naming the concept's own `tasks:` frontmatter field, which the bare, unexplained `(doc)` qualifier
  never did, so both halves of the line now read the same way. This is the entry most likely to break
  an existing consumer: any pipeline splitting the old line on `", "` or matching the literal string
  `(doc)` breaks. Second, the shared `conceptNotInBundle` `not_found` hint (`src/core/bundle.ts`) —
  surfaced through `link`/`unlink`, `tasks`, `rename`'s rewrite engine, `supersede`, and
  `graph`/`context`'s subgraph traversal — moved from ``run `lore check` to list concept ids`` to
  ``run `lore query` or `lore graph` to see known concept ids``: verified live that `lore check`
  only ever prints a pass/fail summary count and never lists an id, so the old hint misdirected
  every one of those commands' bad-id path. The same wrong ``run `lore check` to list concept
  ids`` clause also appeared standalone in `sync`'s `scopeConcepts` not-found path (behind its
  own `check the id/path and try again —` preamble, not routed through `conceptNotInBundle`) and
  was repointed the same way, so the harmonization doesn't leave a stale duplicate. Third,
  `lore tasks`/`lore context`'s missing-`<id>` usage error changed from the bare
  `missing concept <id>` to `` `lore tasks` needs a concept id `` / `` `lore context` needs a
  concept id `` respectively, matching the `` `lore
  <command>` needs a <thing> `` template `link`/`new`/`rename`/`replace`/`scaffold`/`supersede`/
  `schema` already used — `tasks` and `context` were the only two commands still diverging from it;
  each command's own actionable hint text is unchanged (the message itself is what changed, from the
  bare `missing concept <id>` to the templated form). **Exit codes and the `--json` envelope shape are
  unchanged** — every affected surface changed a `message`/`hint` string value (plus the one
  `--plain` line above); no envelope field was added, removed, or retyped.
  Verified against `dev`: `bun test` 2126/0 pass, `typecheck`/`lint` clean, `lore check` (39 files, 0
  errors/warnings).
- **`lore scaffold <target>` — a bare re-run against an unchanged config is now an idempotent
  no-op; exit `5` is narrowed to an actual user edit or a directory blocker** (LCLI-263). **A
  user-visible exit-code contract change.** Previously *any* already-existing planned file always
  hard-errored `conflict`/exit `5` on a bare re-run — even when its on-disk bytes were
  byte-identical to what the run would generate — so simply re-running `lore scaffold mkdocs` (or
  `docusaurus`/`obsidian`) against an untouched, already-scaffolded bundle always failed unless
  `--force` was passed. A new `classifyExistingFile` (`src/commands/fswrite.ts`: `missing` /
  `unchanged` / `differs`, `lstat`-based, never following a symlink, conservative — never
  `unchanged` — on a non-regular entry or a read failure) lets `runScaffold`
  (`src/commands/scaffold.ts`) now tell "nothing to do" apart from "the user edited this": exit
  `5` now names only a planned file whose on-disk bytes genuinely `differs` (a real user edit) and
  points at `--force`; a non-directory entry blocking a planned directory is the same exit `5` but
  a different hint from `conflictHint` — remove or rename the blocking entry, since `--force`
  cannot fix it (under `--force` this preflight is skipped entirely and the later `mkdirSync`
  throws `EEXIST` on the same entry, a second `conflict`) — the byte-identical case is no longer a
  collision at all. A byte-identical bundle now exits `0`,
  writes nothing (`scaffold.result.files: []`), and prints `<target> config already up to date —
  nothing to do`, mirroring `lore sync`'s own `0 files changed` no-op model. Classification is
  per-file, so a partially-recreated bundle (one generated file untouched, its sibling separately
  deleted) recreates only the missing file rather than refusing the whole run. `mkdocs`'s
  `docs/tags.md` stamps a real wall-clock `timestamp` on every fresh scaffold, which would
  otherwise defeat this idempotency on every real re-run purely because time moved forward; a
  bare (non-`--force`) `mkdocs` run now reuses the on-disk file's own `timestamp` via the new
  `preservedTagsTimestamp` instead of a fresh clock read (`--force` is unaffected, always
  stamping fresh). The docker e2e harness's `run-e2e.sh` Phase 18 assertions were rewritten at
  merge time to cover both regression directions (stale-conflict-on-unchanged and
  silent-clobber-on-edit); a follow-up doc-accuracy fix corrected
  `docs/reference/cli-surface.md`'s Exit/Output rows, which had briefly still described the
  pre-change always-conflicts contract. Verified against `dev`: `bun test` 2110/0 pass,
  `typecheck`/`lint` clean, `lore check` (39 files, 0 errors/warnings).
- **Deduped the shared task-summary-row type and aligned-row renderer** (LCLI-51). `lore tasks`'s
  `TaskRollupRow` and `lore orphans`' `OrphanTask` were byte-identical `{id, title, status}`
  redeclarations, and `orphans.ts`'s orphan-task block re-implemented `tasks.ts`'s id/status/title
  aligned-table logic independently. Both now share `output.ts`'s new `TaskSummaryRow` type and
  `renderTaskSummaryRows` (backed by the existing spread-free `maxLen`, which `tasks.ts`'s
  `Math.max(...array)` now inherits too, closing the same six-figure-list `RangeError` risk
  `orphans.ts` was already hardened against) — a column-layout change is now a one-place edit
  instead of two independently-drifting copies. No output change (golden tests pin it byte-for-byte).

  A `/code-review max` fold found this refactor had reintroduced the same `RangeError` class at a
  different call site: `orphans.ts`'s orphan-task block spread `renderTaskSummaryRows`'s output
  into `lines.push(...)`, and spreading a large array into a function-call argument list has its
  own engine argument-count ceiling — confirmed to throw at ~700,000 orphan tasks. Fixed with a
  plain per-item loop (matching the sibling `danglingLinks` block, which was never affected); a
  700k-scale regression test was added and confirmed to reproduce the original failure.
- **`lore link` / `lore unlink` / `lore rename` now commit their `backlog/` writes immediately**
  (LCLI-49): each command's `doc:<conceptId>` back-reference edit is committed in one `lore`-authored
  commit right after it is written (via `state.ts`'s new `commitBacklogFiles`), instead of being left
  uncommitted in the working tree until the next `lore sync` swept it up — matching design §3.6 and
  [ADR-0012](docs/adr/0012-backlog-coexistence-git-ownership.md) ("lore is the sole committer of
  `backlog/`"). The commit is **scoped to exactly the task file(s) the command edited** (ADR-0012 §1:
  "stage only the specific task file(s)") — each pathspec `:(literal)`-quoted so a wildcard in a
  filename (`[`, `*`, `?`) matches only itself and can never glob in an unrelated sibling — so an
  unrelated in-flight `backlog/` edit is never swept in, and `--no-back-ref`, a fully idempotent
  re-link/unlink, an unlinked rename, and `--dry-run` (which write nothing) commit nothing. `lore
  sync` remains the catch-all that later commits anything still uncommitted under `backlog/`. The
  outcome is now reported — `link.result` / `unlink.result` / `rename.result` gain a `backlogCommit:
  { committed, files }` field, and text output appends a `committed backlog/: N files` line. A failed
  commit surfaces loudly as `drift` (exit 6) — but is **captured, not thrown**, so the command still
  emits its per-task report (naming every write it made) with a `backlog/ commit failed: …` line
  before exiting, rather than dropping the report on the failure path.
- **`lore check` internals** (LCLI-48): the `validate`/`check` finding model is unified on a shared
  `Severity`/`Finding<Rule>` (`core/finding.ts`); the filesystem-errno→`LoreError` mapping is
  consolidated into one `ioError` policy (`errors.ts`); `bundle.ts`'s markdown walk is generalized to
  a predicate-driven `walkFiles`; and `normalizeLink` now rejects absolute operands and computes a
  cwd-independent relative link.

[Unreleased]: https://github.com/opum-ai/lore-cli/commits/dev
[0.1.0]: https://github.com/opum-ai/lore-cli/releases/tag/v0.1.0

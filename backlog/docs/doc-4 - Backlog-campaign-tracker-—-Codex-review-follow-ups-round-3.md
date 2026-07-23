---
id: doc-4
title: Backlog campaign tracker — Codex review follow-ups (round 3)
type: other
created_date: '2026-07-23 16:05'
updated_date: '2026-07-23 16:07'
---
Round 3 of the Codex-review follow-up campaign (see [[Backlog campaign tracker — Codex review follow-ups (round 2)]] / doc-3 for round 2, LORE-96..194, which closed all 78 medium findings; doc-1 for round 1, LORE-69..95, all 20 high). This round covers the **low-severity** findings from doc-2 ("Codex second-opinion review — lore codebase (2026-07-20)").

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch (parallel Sonnet implement + Fable review) → serialize the merge → update this tracker once more at settlement → loop until the queue is empty or blocked → write handover.

## Source

doc-2 “Low-severity findings” section held **97 findings across 25 clusters**. On 2026-07-23 a **50-agent re-audit** (one general-purpose reauditor + one adversarial verifier per cluster, in full wave-parallel mode) re-verified every one against the LIVE `dev` tree AFTER rounds 1–2 had merged (LORE-69..194 all Done). Result:

- **53 open + agent-resolvable** → this round’s queue (new tasks LORE-198..250), plus 2 already-filed follow-ups folded in (LORE-195 lint-baseline chore, LORE-197 check.ts multi-root advisory bug) = **55 agent-resolvable**.
- **25 resolved-by-merge** by the round-1/2 campaign — dropped (evidence captured in the re-audit output, .repro-scratch/round3-resolved-dismissed.json at init time).
- **12 dismissed** (non-issue / duplicate of an existing task).
- **7 needs-human** → "Not queued" below.

The adversarial verify pass corrected 4 classifications. The 3 follow-ups filed 2026-07-23 after round 2 completed: LORE-195 (lint) + LORE-197 (check.ts) fold into this queue; LORE-196 (docker-e2e required check) is repo-admin → "Not queued".

## Scope / order confirmation

- **Scope**: low-severity only (doc-2’s low section, 97 findings → 53 open-agent + the 2 folded follow-ups). User chose **"Full round 3 (re-audit)"** on 2026-07-23.
- **Order**: user confirmed **docs-first** on 2026-07-23 — lowest-risk-first (docs → chore → task → enhancement → bug, cluster-mates adjacent). This is the wave-builder’s **tie-break only**, NOT a strict execution order (item #7 will not necessarily run in the 7th slot); the ready set is recomputed live each restore.
- All 55 queued tasks carry **zero formal dependencies** (re-verify live via YAML parse each restore); readiness is gated purely by the live pairwise file-conflict graph (same-cluster items serialize).

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the start of every restore/wave — never trust a persisted "next wave" plan. Informational hint only: as of 2026-07-23 (round-3 init, before wave 1), **55 tasks are ready** (LORE-198..250 + LORE-195 + LORE-197), **0 in-flight**, **0 resolved**. Every item has zero unmet formal deps; wave membership is bounded by the live file-conflict graph + the 6-worker cap. Recompute live at next restore — do NOT hardcode a next-wave list.

## Queue (confirmed order)
| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 1 | LORE-198 | build-runtime | — | To Do | — | docs. Update test/fixtures/README.md backlog-json section to match the upstream recorder. [test/fixtures/README.md] |
| 2 | LORE-199 | cmd-check | — | To Do | — | docs. Correct check's cli-surface docs: it does not surface token estimates. [docs/reference/cli-surface.md] |
| 3 | LORE-200 | core-engine-b | — | To Do | — | docs. Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean coercion. [src/core/graph.ts] |
| 4 | LORE-201 | core-engine-b | — | To Do | — | docs. Fix the `validation` instructions topic's overstated colon quote-safety claim and add a regression test. [src/core/instructions.ts] |
| 5 | LORE-202 | core-engine-b | — | To Do | — | docs. Correct order.ts module-doc rationale: default Array.prototype.sort is code-unit-ordered and stable, not locale/engine-dependent. [src/core/order.ts] |
| 6 | LORE-203 | core-index-context | — | To Do | — | docs. Clarify `lore context` --max-tokens docs: omitting it applies no token cap (bounded only by --depth). [src/core/context.ts] |
| 7 | LORE-204 | build-ci-config | — | To Do | — | chore. release.yml: assert the compiled binary --version matches package.json exactly, not just non-empty (mirror ci.yml). [.github/workflows/release.yml] |
| 8 | LORE-205 | build-ci-config | — | To Do | — | chore. Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on the git subcommand, not on call index. [test/helpers.ts] |
| 9 | LORE-206 | build-runtime | — | To Do | — | chore. Make scripted git-spawn test fakes dispatch by observed command, not call index. [test/helpers.ts] |
| 10 | LORE-207 | cmd-check | — | To Do | — | chore. Release the response body in check's --external liveness fetch. [src/commands/check.ts] |
| 11 | LORE-208 | cmd-meta-d | — | To Do | — | chore. Export InstructionsData and drop the duplicated test-side declaration. [src/commands/instructions.ts] |
| 12 | LORE-209 | cmd-rename-supersede | — | To Do | — | chore. Correct the inaccurate comment and strengthen rename's "never constructs a Backlog adapter" test. [test/rename.test.ts] |
| 13 | LORE-210 | core-index-context | — | To Do | — | chore. Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder from links.ts (LORE-28 landed). [src/core/indexes.ts] |
| 14 | LORE-195 | cmd-crud-b/tooling | — | To Do | — | chore. Restore biome lint baseline to green (biome check . -> 0 errors/0 infos). Filed 2026-07-23. [test/context.test.ts, test/replace.test.ts, test/validate.test.ts, src/core/managed-block.ts] |
| 15 | LORE-211 | cmd-meta-a | — | To Do | — | task. Strengthen the tasks drift test: mix a dangling id with a failing read and assert empty streams. [test/tasks.test.ts] |
| 16 | LORE-212 | cmd-meta-d | — | To Do | — | task. Strengthen validate's realpath de-dup test with a genuine symlink alias. [test/validate.test.ts] |
| 17 | LORE-213 | core-concept-manifest | — | To Do | — | task. Guard manifest `kind` against drift from each command's emitted `kind:`. [test/help.test.ts] |
| 18 | LORE-214 | core-managed-template | — | To Do | — | task. Cover edge-case resource bases (and the new-path section boundary) in template.test.ts. [test/template.test.ts] |
| 19 | LORE-215 | core-replace | — | To Do | — | task. Scope replace.test.ts temp-dir hooks to the command suites and guard their cleanup. [test/replace.test.ts] |
| 20 | LORE-216 | errors-output-git | — | To Do | — | task. Replace tautological tasks/orphans byte-identity test with one exercising both command render paths. [test/output.test.ts] |
| 21 | LORE-217 | adapter-backlog | — | To Do | — | enhancement. Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout. [src/adapters/backlog.ts] |
| 22 | LORE-218 | adapter-backlog | — | To Do | — | enhancement. Remove the lone `this` binding in the backlog adapter's searchByLabel. [src/adapters/backlog.ts] |
| 23 | LORE-219 | core-concept-manifest | — | To Do | — | enhancement. Enforce the single-line modeline contract in serializeConceptWithModeline. [src/core/concept.ts] |
| 24 | LORE-220 | core-concept-manifest | — | To Do | — | enhancement. Freeze the manifest singletons returned by buildManifest(). [src/core/manifest.ts] |
| 25 | LORE-221 | errors-output-git | — | To Do | — | enhancement. Align id/status columns by terminal display width, not UTF-16 length. [src/output.ts] |
| 26 | LORE-222 | adapter-backlog | — | To Do | — | bug. Map spawn-rejections on all backlog calls (not just the probe's --version) to typed LoreErrors. [src/adapters/backlog.ts] |
| 27 | LORE-223 | cli-entry-state | — | To Do | — | bug. cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as flags. [src/cli.ts] |
| 28 | LORE-224 | cli-entry-state | — | To Do | — | bug. state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle prefix. [src/state.ts] |
| 29 | LORE-225 | cmd-check | — | To Do | — | bug. De-duplicate check's bundle roots by canonical filesystem identity. [src/commands/check.ts] |
| 30 | LORE-226 | cmd-check | — | To Do | — | bug. Sanitize control characters in check's finding output. [src/commands/check.ts] |
| 31 | LORE-197 | cmd-check | — | To Do | — | bug. Discovery advisories from an earlier bundle root lost when a later root throws inside collectBundles (LORE-191 residual). [src/commands/check.ts] |
| 32 | LORE-227 | cmd-crud-a | — | To Do | — | bug. new.ts: parse arguments before loading the profile so a malformed profile.toml can't mask a usage error. [src/commands/new.ts] |
| 33 | LORE-228 | cmd-crud-a | — | To Do | — | bug. replace.ts / validate.ts: reject an inline =value on boolean flags (--regex, --dry-run, --strict). [src/commands/replace.ts] |
| 34 | LORE-229 | cmd-crud-a | — | To Do | — | bug. replace.ts: sanitize discovered file paths in the report (strip ANSI/control chars) to prevent output forging. [src/commands/replace.ts] |
| 35 | LORE-230 | cmd-crud-b | — | To Do | — | bug. existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already exists' skip. [src/commands/fswrite.ts] |
| 36 | LORE-231 | cmd-crud-b | — | To Do | — | bug. writeFileAtomic leaks an uncleaned temp file when writeFileSync fails mid-write. [src/commands/fswrite.ts] |
| 37 | LORE-232 | cmd-crud-b | — | To Do | — | bug. lore query --type/--status/--tag values are not trimmed, inconsistent with --field. [src/commands/query.ts] |
| 38 | LORE-233 | cmd-link | — | To Do | — | bug. Bound runLink's up-front viewTask existence-check fan-out with a concurrency limit. [src/commands/link.ts] |
| 39 | LORE-234 | cmd-link | — | To Do | — | bug. runLink's doc-membership check is exact-case while unlink's is case-insensitive — a casing-variant documentation entry duplicates instead of dedups. [src/commands/link.ts] |
| 40 | LORE-235 | cmd-meta-a | — | To Do | — | bug. Bound resolveRollup's viewTask fan-out with the shared concurrency cap. [src/commands/reconcile-shared.ts] |
| 41 | LORE-236 | cmd-meta-a | — | To Do | — | bug. Strip ANSI/control/OSC escapes on the stderr warning path (WarningCollector.flush). [src/commands/tasks.ts] |
| 42 | LORE-237 | cmd-meta-b | — | To Do | — | bug. Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`, and repeated `--type`. [src/commands/validate.ts] |
| 43 | LORE-238 | cmd-meta-c | — | To Do | — | bug. scaffold: differentiate the conflict hint for structural directory blockers (--force cannot replace a file with a directory). [src/commands/scaffold.ts] |
| 44 | LORE-239 | core-bundle-check | — | To Do | — | bug. callout portability detector false-positives on inline formatting before [!type] in ordinary prose. [src/core/check.ts] |
| 45 | LORE-240 | core-bundle-check | — | To Do | — | bug. check portability lint mis-parses a leading indented code block in frontmatter-free files. [src/core/check.ts] |
| 46 | LORE-241 | core-bundle-check | — | To Do | — | bug. parseJson rewrites a valid-but-non-object profile.json into a misleading 'is not valid JSON' error. [src/core/profile.ts] |
| 47 | LORE-242 | core-bundle-check | — | To Do | — | bug. profile does not validate a field's `default` against its declared kind/enum. [src/core/profile.ts] |
| 48 | LORE-243 | core-engine-a | — | To Do | — | bug. Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle roots. [src/core/log.ts] |
| 49 | LORE-244 | core-index-context | — | To Do | — | bug. index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar (match graph/query/context). [src/core/indexes.ts] |
| 50 | LORE-245 | core-links-resolution | — | To Do | — | bug. validateLink: flag bare '.'/'..' navigation destinations instead of exempting them as dotfiles. [src/core/links.ts] |
| 51 | LORE-246 | core-query-validate | — | To Do | — | bug. matchesField: resolve case-insensitive field key across ALL case-variant spellings, not just the first. [src/core/query.ts] |
| 52 | LORE-247 | core-rewrite-engine | — | To Do | — | bug. Preserve above-repo-root outbound links during rename instead of silently clamp-retargeting them. [src/core/rewrite.ts] |
| 53 | LORE-248 | core-scaffold-consumer | — | To Do | — | bug. warnSummary counts UTF-16 code units but reports "chars" — non-BMP summaries warn prematurely. [src/core/schema.ts] |
| 54 | LORE-249 | errors-output-git | — | To Do | — | bug. Harden stderrHint: strip terminal control sequences and cap length. [src/errors.ts] |
| 55 | LORE-250 | errors-output-git | — | To Do | — | bug. Suppress ANSI color on stderr diagnostics when stderr is not a TTY. [src/output.ts] |

## Resolved
| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|

## Not queued — needs a human / blocked
- **(finding) build-ci-config** .github/workflows/ci.yml:77: The mkdocs/docusaurus scaffold smoke jobs install floating dependency ranges (`pip install "mkdocs>=1.6" "mkdocs-material>=9"`, and a lockfile-free `npm install` for the freshly scaffolded website/ project). — STILL PRESENT: ci.yml:77 `pip install "mkdocs>=1.6" "mkdocs-material>=9"` (floating) and ci.yml:114 `npm install` (no lockfile). But this is a deliberate CI-design tradeoff, not a mechanical fix an agent should make unil
- **(finding) build-ci-config** biome.json:10: biome's `includes` covers only `src/**/*.ts`, `test/**/*.ts`, and root `*.json`, leaving `bin/lore.cjs`, the five `npm/*/package.json` manifests, workflow YAML, the Dockerfile, and shell scripts outside any lint/format g — STILL PRESENT: biome.json:10 `"includes": ["src/**/*.ts", "test/**/*.ts", "*.json"]` — bin/lore.cjs and npm/*/package.json are outside the gate. But this needs a maintainer/tooling decision, not an autonomous fix: (1) Bi
- **(finding) build-ci-config** bunfig.toml:10: Coverage threshold is pinned at 0.0 with a comment claiming it will ratchet up 'as the core/ library lands', and coverage is not run in CI at all. — STILL PRESENT: bunfig.toml:10 `coverageThreshold = 0.0`; the comment (lines 8-9) says the floor 'is raised as the core/ library lands so coverage can only ratchet upward'; and ci.yml runs `bun test` (lines 30,33) with no
- **(finding) build-runtime** test/support/backlog-golden.ts:34: The golden test's 'contract mirror' schema is a direct re-export of the production adapter's own Zod schema, so loosening the runtime parser also loosens its own regression test. — Structurally STILL TRUE. test/support/backlog-golden.ts:30-39 re-exports `EnvelopeKind`, `EnvelopeSchema`, `SearchHitSchema`, `TaskSchema`, `TaskSummarySchema` straight from src/adapters/backlog.ts, where those schemas a
- **(finding) cmd-crud-b** src/commands/fswrite.ts:272: writeAllOrRollback's rollback restores/deletes paths without verifying they still hold this transaction's own written version. — Still live. `writeAllOrRollback`'s rollback (catch block, src/commands/fswrite.ts:566-575) replays each undo step: created files are deleted (`rmSync` pushed at :553/:563) and force-overwritten files are restored to thei
- **(finding) core-bundle-check** src/core/bundle.ts:286: The walk collects all file paths (checking `entry.isSymbolicLink()`/`isFile()` via `Dirent`) before any file is opened, so a TOCTOU window exists where a regular file could be replaced by a symlink between the walk and t — Still present in live code, exactly as described. `loadBundle` (src/core/bundle.ts:174) collects paths via `walkMarkdown`→`walkFiles`, whose per-entry checks use `Dirent` (`entry.isSymbolicLink()` at bundle.ts:362 skips 
- **(finding) core-managed-template** src/core/template.ts:66: resourceFor joins `resource_base` as an opaque trimmed string with no URL validation, so a base carrying a query string, fragment, or non-hierarchical scheme joins in a semantically odd way (e.g. `https://x/base?lang=en` — The defect still exists verbatim. resourceFor is now at src/core/template.ts:62-68; the cited behavior is line 66 `const base = resourceBase.trim().replace(/\/+$/, "");` followed by `return `${base}/${encodePathSegments(
- **LORE-196** [needs-human, repo-admin]: make the docker-e2e CI job a required status check on dev/main — a GitHub branch-protection/ruleset toggle an autonomous agent must not perform (repo currently has no protection/ruleset; required-check context string captured in the task).
- **LORE-42 / 43 / 44 / 45**: deferred v2 roadmap (lore mcp server; Confluence one-way publish adapter; Confluence production mirror; typed importable library build) — product deferrals, not agent-resolvable cleanup.

## Wave log

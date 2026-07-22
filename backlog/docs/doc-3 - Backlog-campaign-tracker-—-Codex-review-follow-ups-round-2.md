---
id: doc-3
title: Backlog campaign tracker — Codex review follow-ups (round 2)
type: other
created_date: '2026-07-21 22:27'
updated_date: '2026-07-22 14:32'
---
Round 2 of the Codex-review follow-up campaign (see [[Backlog campaign tracker]] / doc-1 for
round 1, LORE-69..95, which closed all 20 high-severity findings from doc-2). Re-initialised on
2026-07-22 for the **wave-parallel** `/backlog-handover` driver (Opus orchestrator + parallel
Sonnet workers + mandatory Fable review), replacing the original one-issue-per-session cursor
model this doc was first written under.

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch
(parallel Sonnet implement + Fable review) → serialize the merge → update this tracker once more
at settlement → loop until the queue is empty or blocked → write handover.

## Source

All 78 original queue items are LORE-96..173, created 2026-07-21 from a re-audit of doc-2 ("Codex
second-opinion review — lore codebase (2026-07-20)"). The re-audit (25 parallel agents, one per
review cluster) re-verified every one of doc-2's 201 confirmed findings against the live source
tree and the resolved task list as of 2026-07-21. Result: all 20 high-severity findings were
already resolved by round 1; 78 medium-severity findings were still open. Those 78 are this
round's queue (plus follow-ups filed mid-campaign, e.g. LORE-174 from the wave-1 integration
review). The 91 still-open low-severity findings were deliberately left out of scope (user chose
"medium only" on 2026-07-21, re-affirmed "re-arm the 78 medium" on 2026-07-22) — they are not
tracked as tasks yet; revisit via a fresh `/backlog-handover init` pass over doc-2's low-severity
section if/when this round completes.

## Scope / order confirmation

- **Scope**: medium-severity only (LORE-96..173, 78 tasks, plus mid-campaign follow-ups).
  Confirmed by the user 2026-07-21 ("medium only") and re-affirmed 2026-07-22 ("re-arm the 78
  medium"). The 91 low-severity findings and the 4 deferred v2/library tasks (LORE-42..45) are
  out of scope — see "Not queued".
- **Order**: the queue below is grouped by review cluster (alphabetical), matching doc-2's own
  structure for context-locality (same-file fixes stay adjacent). This is an implementation
  default, **not** a strict user-mandated sequence — under the wave-parallel driver it is only a
  tie-break priority for wave inclusion, never a guarantee any item lands in any specific wave.
  Reorder freely (via `backlog doc update`) if a different priority makes sense. Do not re-ask.
- **Formal dependencies**: none. All original 78 task files were YAML-parsed on 2026-07-22 —
  every `dependencies` list is empty. Readiness is therefore gated **only** by the file-conflict
  graph (recomputed live each wave), never by a topological dep order.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the
start of every restore/wave — never trust a persisted "next wave" plan; it can go stale the
moment a conflict changes. Informational hint only: as of 2026-07-22 after **waves 1-3 merged**, **20 tasks are Done** — wave 1 (LORE-96, 98, 102, 107, 110, 114), wave 2 (LORE-97, 99, 103, 108, 111, 115), wave 3 (LORE-109, 112, 116, 122, 126), plus 3 resolved-by-merge duplicates (LORE-127, 131 by LORE-107; LORE-173 by LORE-115). **1 held**: LORE-100 (impl complete + Fable-approved, escalated on merge — docker-e2e CI gate red-at-birth; branch feature/LORE-100 held; blocked on LORE-176 + a user CI-gate decision). **61 tasks remain To Do**: the original medium queue minus the above, plus 4 mid-campaign follow-ups (LORE-174, 175 from waves 1-2; LORE-176, 177 from wave 3). Every To Do item has zero unmet formal deps (LORE-100 is the only dep-gated item, dep LORE-176, and is held separately). Actual wave membership is bounded by the 6-worker cap and the live pairwise file-conflict graph (same-cluster items serialize). Recompute the ready set live at next restore — do NOT hardcode a next-wave list.

**Cross-cluster duplicate (RESOLVED):** LORE-107 (cli-entry-state) merged in wave 1,
fixing the `lore <command> --help` bug in src/cli.ts + test/help.test.ts and adding a `lore <cmd>
--help` == `lore help <cmd>` regression assertion. LORE-127 (cmd-meta-c, "`lore <command> --help`
shows top-level help") and LORE-131 (cmd-meta-c, "Add regression test asserting `lore <command>
--help` matches `lore help <command>`") describe the SAME bug/test — they are very likely now
the SAME bug/test — **both verified resolved-by-merge by LORE-107 and marked Done 2026-07-22** (help.test.ts:271
asserts `lore query --help` byte-identical to `lore help query`). No further action.

**Second cross-cluster duplicate (RESOLVED):** LORE-115 (cmd-crud-a, dispatched wave 2) and LORE-173
(errors-output-git, still To Do) both target `renderTaskSummaryRows` in `src/output.ts` (control-char
/ line normalization of Backlog id/status/title). They must never share a wave; once LORE-115 merges,
**LORE-173 verified resolved-by-merge by LORE-115 and marked Done 2026-07-22** — output.test.ts covers the newline/control-char row. No further action.

## Queue (confirmed order)

| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 1 | LORE-96 | adapter-backlog | — | Done | 1 | Validate/escape argv values passed to backlog CLI to prevent flag injection |
| 2 | LORE-97 | adapter-backlog | — | Done | 2 | createTask discards the new task id when the 'Created task <ID>' line fails to parse |
| 3 | LORE-98 | build-ci-config | — | Done | 1 | Pin third-party GitHub Actions to commit SHAs instead of mutable tags |
| 4 | LORE-99 | build-ci-config | — | Done | 2 | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed |
| 5 | LORE-100 | build-ci-config | LORE-176 | Blocked | 3 | HELD/ESCALATED: impl complete + Fable-approved; branch feature/LORE-100 @ `89f8133` pushed, worktree kept. Merge blocked — the new docker-e2e CI gate is red-at-birth (run-e2e.sh:1298 stale vs LORE-89). Blocked on LORE-176 + a user decision on wiring a Docker CI gate. Do NOT re-implement — MERGE the held branch once unblocked. |
| 6 | LORE-101 | build-ci-config | — | To Do | — | Scoped release packages missing publishConfig.access:public, will fail first npm publish |
| 7 | LORE-102 | build-runtime | — | Done | 1 | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs |
| 8 | LORE-103 | build-runtime | — | Done | 2 | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run |
| 9 | LORE-104 | build-runtime | — | To Do | — | Documented `docker compose up --build` invocation doesn't propagate e2e exit code |
| 10 | LORE-105 | build-runtime | — | To Do | — | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format |
| 11 | LORE-106 | build-runtime | — | To Do | — | Golden recorder trusts a live mutable task and an unverified upstream CLI path |
| 12 | LORE-107 | cli-entry-state | — | Done | 1 | lore <command> --help shows generic help instead of the command's own help |
| 13 | LORE-108 | cli-entry-state | — | Done | 2 | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' |
| 14 | LORE-109 | cli-entry-state | — | Done | 3 | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure |
| 15 | LORE-110 | cmd-check | — | Done | 1 | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency |
| 16 | LORE-111 | cmd-check | — | Done | 2 | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit |
| 17 | LORE-112 | cmd-check | — | Done | 3 | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run |
| 18 | LORE-113 | cmd-check | — | To Do | — | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels |
| 19 | LORE-114 | cmd-crud-a | — | Done | 1 | lore new --out bypasses reserved index/log stem policy |
| 20 | LORE-115 | cmd-crud-a | — | Done | 2 | orphans table rows skip control-character sanitization on task fields (renderTaskSummaryRows in src/output.ts) |
| 21 | LORE-116 | cmd-crud-a | — | Done | 3 | lore replace commit phase has no atomic write or rollback on partial failure |
| 79 | LORE-174 | cmd-crud-a | — | To Do | — | lore new default title-slug path bypasses reserved index/log stem policy (wave-1 integration follow-up of LORE-114; touches src/commands/new.ts + test/new.test.ts, conflicts with LORE-115/116) |
| 80 | LORE-175 | cli-entry-state | — | To Do | — | readConfigText denied error omits errno code field (wave-2 integration follow-up of LORE-108, low; touches src/config.ts + test/config.test.ts, conflicts with LORE-108-area) |
| 81 | LORE-176 | build-runtime | — | To Do | — | run-e2e.sh:1298 AC4 assertion is stale (lore check IS profile-bearing since LORE-89); blocks LORE-100's CI gate. Filed from the wave-3 escalation. Conflicts with LORE-104/105/106 (docker/e2e). |
| 82 | LORE-177 | cmd-link | — | To Do | — | lore link viewTask consumers don't verify returned id (sibling of LORE-122/125); filed from the wave-3 integration review. Touches src/commands/link.ts — conflicts with LORE-121. |
| 22 | LORE-117 | cmd-crud-b | — | To Do | — | writeFileAtomic drops destination's file mode/ownership on overwrite |
| 23 | LORE-118 | cmd-crud-b | — | To Do | — | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output |
| 24 | LORE-119 | cmd-crud-b | — | To Do | — | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits |
| 25 | LORE-120 | cmd-crud-b | — | To Do | — | sync's multi-file write loop has no cross-file rollback on mid-loop failure |
| 26 | LORE-121 | cmd-link | — | To Do | — | lore link retry after failed backlog commit silently no-ops instead of recommitting |
| 27 | LORE-122 | cmd-meta-a | — | Done | 3 | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id |
| 28 | LORE-123 | cmd-meta-a | — | To Do | — | schema export follows a symlink planted at a schema file's leaf path |
| 29 | LORE-124 | cmd-meta-a | — | To Do | — | Absolute --out inside the repo crashes schema export with an unhandled ENOENT |
| 30 | LORE-125 | cmd-meta-a | — | To Do | — | resolveRollup doesn't verify viewTask's returned id matches the requested id |
| 31 | LORE-126 | cmd-meta-b | — | Done | 3 | Collapse embedded newlines in graph node id/title before rendering |
| 32 | LORE-127 | cmd-meta-c | — | Done | 1 | RESOLVED-BY-MERGE by LORE-107 (PR #95): cli.ts routes `lore <cmd> --help` to runHelp; help.test.ts:271 asserts byte-identical to `lore help <cmd>` |
| 33 | LORE-128 | cmd-meta-c | — | To Do | — | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync |
| 34 | LORE-129 | cmd-meta-c | — | To Do | — | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it |
| 35 | LORE-130 | cmd-meta-c | — | To Do | — | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill |
| 36 | LORE-131 | cmd-meta-c | — | Done | 1 | RESOLVED-BY-MERGE by LORE-107 (PR #95): help.test.ts:271 is the byte-identical `lore <cmd> --help` == `lore help <cmd>` regression test |
| 37 | LORE-132 | cmd-rename-supersede | — | To Do | — | Close TOCTOU window in rename between target-free check and file move |
| 38 | LORE-133 | core-bundle-check | — | To Do | — | resolvePath does not special-case a leading-slash link target |
| 39 | LORE-134 | core-bundle-check | — | To Do | — | resolveRef tries frontmatter ref as a root id before trying it as a relative path |
| 40 | LORE-135 | core-bundle-check | — | To Do | — | Anchor-link check lower-cases fragments, masking case-mismatched broken anchors |
| 41 | LORE-136 | core-bundle-check | — | To Do | — | Heading slug computation ignores image alt text in headings |
| 42 | LORE-137 | core-bundle-check | — | To Do | — | reconcileDriftFindings ignores its own newStatus:null contract for managed-block drift |
| 43 | LORE-138 | core-bundle-check | — | To Do | — | bodyText's catch-all swallows any gray-matter exception, not just YAML parse errors |
| 44 | LORE-139 | core-bundle-check | — | To Do | — | Profile-declared type `template` path allows reading files outside .lore/templates/ via traversal |
| 45 | LORE-140 | core-bundle-check | — | To Do | — | parseFieldSpec accepts an empty `enum = []`, making the field impossible to satisfy |
| 46 | LORE-141 | core-concept-manifest | — | To Do | — | Malformed closing frontmatter fence bleeds bytes into concept body |
| 47 | LORE-142 | core-engine-a | — | To Do | — | Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts |
| 48 | LORE-143 | core-engine-a | — | To Do | — | Scope `git log` in GitAdapter.history to the docs root instead of the whole repo |
| 49 | LORE-144 | core-engine-a | — | To Do | — | serializeStructuralConcept's fixed default-profile write breaks `lore validate` under a custom Reference profile |
| 50 | LORE-145 | core-engine-b | — | To Do | — | Fix DOT quote() to not double-escape backslashes; escape newlines |
| 51 | LORE-146 | core-engine-b | — | To Do | — | Fix `linking` instructions: link/unlink now commit backlog/tasks themselves |
| 52 | LORE-147 | core-engine-b | — | To Do | — | Fix `check` instructions: expandRoot/reconciliation throws besides usage/not_found |
| 53 | LORE-148 | core-index-context | — | To Do | — | context export tokenEstimate ignores title field and JSON overhead |
| 54 | LORE-149 | core-index-context | — | To Do | — | linkText re-escapes already-escaped brackets, enabling injected markdown links |
| 55 | LORE-150 | core-index-context | — | To Do | — | generateIndexes never detects or removes an orphaned sub-index directory |
| 56 | LORE-151 | core-links-resolution | — | To Do | — | decodeTarget whole-path decode lets %2F forge a structural slash in link targets |
| 57 | LORE-152 | core-links-resolution | — | To Do | — | Dotted extensionless links (e.g. orders.v2) skip both portability lint and broken-link check |
| 58 | LORE-153 | core-links-resolution | — | To Do | — | LinkFinding.message interpolates raw link target unescaped into terminal-rendered text |
| 59 | LORE-154 | core-managed-template | — | To Do | — | cell() escapes pipes without escaping pre-existing backslashes first |
| 60 | LORE-155 | core-managed-template | — | To Do | — | upsertManagedBlock's update path skips the post-splice validation the insert path has |
| 61 | LORE-156 | core-managed-template | — | To Do | — | Same-line marker pair collapses into one mdast node and is invisible to locateLabeledMarkers |
| 62 | LORE-157 | core-managed-template | — | To Do | — | PLACEHOLDER regex silently passes through malformed {{...}} tokens instead of flagging them unresolved |
| 63 | LORE-158 | core-query-validate | — | To Do | — | Strip ANSI/control characters from query text output for id, type, and query text |
| 64 | LORE-159 | core-query-validate | — | To Do | — | h2Headings() counts nested headings (inside blockquotes/list items) as top-level sections |
| 65 | LORE-160 | core-query-validate | — | To Do | — | Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite ADR-0007 |
| 66 | LORE-161 | core-query-validate | — | To Do | — | Resource-drift finding message embeds raw frontmatter value unsanitized in CLI output |
| 67 | LORE-162 | core-replace | — | To Do | — | replace: validate expanded output, not just matched span, against managed ranges |
| 68 | LORE-163 | core-replace | — | To Do | — | replace: $<name> should stay literal when the regex has no named groups, not expand to "" |
| 69 | LORE-164 | core-rewrite-engine | — | To Do | — | Fix rewriteInbound: excluded move source yields rename with no matching write |
| 70 | LORE-165 | core-rewrite-engine | — | To Do | — | Add regression test for rewriteInbound's move + excluded-source-id combination |
| 71 | LORE-166 | core-scaffold-consumer | — | To Do | — | buildObsidianScaffold never emits the .gitignore entry the docs promise |
| 72 | LORE-167 | core-scaffold-consumer | — | To Do | — | validateFrontmatter misclassifies differently-cased known types as unknown |
| 73 | LORE-168 | core-scaffold-consumer | — | To Do | — | okf_version extra-key warning is exempted on every file, not just the root index |
| 74 | LORE-169 | errors-output-git | — | To Do | — | Harden realGitAdapter.history against quoted non-ASCII paths and sentinel collision |
| 75 | LORE-170 | errors-output-git | — | To Do | — | resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git |
| 76 | LORE-171 | errors-output-git | — | To Do | — | asText can return runtime undefined for Symbol/function input despite its string type |
| 77 | LORE-172 | errors-output-git | — | To Do | — | WarningCollector.flush writes raw multi-line/control-char warnings to stderr unnormalized |
| 78 | LORE-173 | errors-output-git | — | Done | 2 | RESOLVED-BY-MERGE by LORE-115 (PR #103): renderTaskSummaryRows now singleLine+stripAnsiAndControls id/status/title; output.test.ts covers newline/control-char rows |

## Resolved

| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|
| 1 | LORE-96 | Done 2026-07-22 / wave 1 | PR #92, merged into dev @ `fa9387d`. Fable verdict **approve** (0 fix rounds). Added `rejectFlagLike()` in src/adapters/backlog.ts rejecting any caller-controlled argv value beginning with `-` before spawn, across listTasks/viewTask/searchTasks/searchByLabel/createTask/editTask (folded into commaJoin); 9-case regression block in test/backlog-adapter.test.ts. Reviewer re-ran: adapter 39/0, full suite 1707/0, typecheck clean, no unguarded caller-controlled argv left. |
| 2 | LORE-98 | Done 2026-07-22 / wave 1 | PR #93, merged into dev @ `b2f1019`. Fable verdict **approve** (0 fix). Pinned all 7 third-party `uses:` refs (setup-bun/action.yml, ci.yml, release.yml) to 40-char commit SHAs with `# vX.Y.Z` comments. Reviewer independently re-resolved every SHA via git ls-remote + gh api (confirmed commit objects, not tag objects; byte-identical to current tag targets → zero behavior change), actionlint clean. |
| 3 | LORE-102 | Done 2026-07-22 / wave 1 | PR #94, merged into dev @ `02a485c`. Fable verdict **approve** (0 fix). Hardened docker/e2e/Dockerfile: digest-pinned `oven/bun:1.2.23@sha256:6ebf30…`, replaced curl\|bash NodeSource bootstrap with download→sha256-verify→execute, pinned mkdocs==1.6.1/mkdocs-material==9.7.7. Reviewer verified digest + script sha256 resolve. |
| 4 | LORE-107 | Done 2026-07-22 / wave 1 | PR #95, merged into dev @ `4df15fc`. Fable verdict **approve** (0 fix). src/cli.ts run() now renders a command's own help for `lore <cmd> --help`/`-h`; `lore --help`/`lore help` unchanged; 3 regression tests in test/help.test.ts incl. `lore <cmd> --help` == `lore help <cmd>`. Reviewer re-ran full suite 1710/0. **Note:** likely also resolves LORE-127 and LORE-131 (see queue re-check note). |
| 5 | LORE-110 | Done 2026-07-22 / wave 1 | PR #96, merged into dev @ `92e5f56`. Fable verdict **approve** (0 fix). Added `LIVENESS_MAX_URLS=500` ceiling on probeLiveness's distinct-URL worklist (src/commands/check.ts); excess URLs skipped (never fetched) and surfaced as an advisory external-link finding; new bounding test in test/check.test.ts. Reviewer re-ran full suite 1711/0. |
| 6 | LORE-114 | Done 2026-07-22 / wave 1 | PR #97, merged into dev @ `5476b15`. Fable verdict **approve** (0 fix). resolveOutPath() in src/commands/new.ts now calls shared assertNotReservedStem() on the extension-stripped `--out` path; nested index/log basenames throw the usage error rename/supersede/link already produce; root index keeps its own message. Reviewer re-ran full suite 1712/0. **Integration review found a sibling gap → filed LORE-174** (default title-slug path still bypasses the policy). |
| 7 | LORE-97 | Done 2026-07-22 / wave 2 | PR #98, merged into dev @ `cfa82a4`. Fable **approve** (0 fix). createTask now passes {title, stdout} as the drift LoreError's `input` when the `Created task <ID>` line fails to parse, so a caller can recover an orphaned Backlog task; regression test in test/backlog-adapter.test.ts. Reviewer re-ran full suite 1713/0. |
| 8 | LORE-99 | Done 2026-07-22 / wave 2 | PR #99, merged into dev @ `c044788`. Fable **approve** (0 fix). verify-versions in release.yml now validates each platform's os/cpu fields + binary filename (derived from platform name); build Verify step asserts the compiled-binary path exists for every platform, not just linux-x64. Reviewer executed the extracted node/shell steps against real + mutated fixtures. |
| 9 | LORE-103 | Done 2026-07-22 / wave 2 | PR #100, merged into dev @ `ff9e760`. Fable **approve** (0 fix). run-e2e.sh record()/check() now detect a failed $REPORT append (REPORT_WRITE_FAILURES counter → nonzero exit); Dockerfile/docker-compose.yml gained PUID/PGID build args to rebind the `bun` user to the host uid/gid. Reviewer bash -n + logic-traced exit propagation. |
| 10 | LORE-108 | Done 2026-07-22 / wave 2 | PR #101, merged into dev @ `2ee01ae`. Fable **approve** (0 fix). readConfigText throws `denied` on EACCES/EPERM (was `validation`), matching the shared contract; test in test/config.test.ts. Reviewer re-ran full suite 1714/0. **Integration review noted the denied `input` omits errno `code` → filed LORE-175.** |
| 11 | LORE-111 | Done 2026-07-22 / wave 2 | PR #102, merged into dev @ `a8f7554`. Fable **approve** (0 fix). Moved private mapWithConcurrency helper from check.ts into reconcile-shared.ts (exported) and capped resolveTaskDetails's viewTask fan-out at TASK_DETAILS_CONCURRENCY=8; test in test/reconcile-shared.test.ts. Integration review verified single definition, all callers updated, no import cycle. Full suite 1716/0. |
| 12 | LORE-115 | Done 2026-07-22 / wave 2 | PR #103, merged into dev @ `aff6f95`. Fable **approve** (1 fix round). renderTaskSummaryRows (src/output.ts, shared by lore tasks/orphans) now singleLine+stripAnsiAndControls id/status/title before formatting; test in test/output.test.ts. Reviewer re-ran full suite 1718/0. **Also resolves LORE-173.** |
| 13 | LORE-127 | Done 2026-07-22 / resolved-by-merge (wave 1) | Resolved-by-merge by LORE-107 (PR #95). Verified: cli.ts routes `lore <cmd> --help`/`-h` to runHelp; test/help.test.ts:271 asserts `lore query --help` byte-identical to `lore help query`; no-command top-level catalog preserved. Marked Done with evidence note (no re-fix). |
| 14 | LORE-131 | Done 2026-07-22 / resolved-by-merge (wave 1) | Resolved-by-merge by LORE-107 (PR #95). Verified: test/help.test.ts:271 is exactly the byte-identical `lore <cmd> --help` == `lore help <cmd>` regression test for `query`, and fails against the pre-LORE-107 short-circuit. Marked Done with evidence note (no re-fix). |
| 15 | LORE-173 | Done 2026-07-22 / resolved-by-merge (wave 2) | Resolved-by-merge by LORE-115 (PR #103). Verified: renderTaskSummaryRows applies stripAnsiAndControls(singleLine(asText(...))) to id/status/title; test/output.test.ts covers a newline/control-char title → single sanitized line. Marked Done with evidence note (no re-fix). |
| 16 | LORE-109 | Done 2026-07-22 / wave 3 | PR #104, merged into dev @ `cae05e8`. Fable **approve** (0 fix). commitBacklogFiles captures LoreError.hint into a new BacklogCommitResult.hint field; renderBacklogCommitLine appends it after the failure message; regression test in test/state.test.ts. Reviewer re-verified typecheck clean, full suite 1719/0. |
| 17 | LORE-112 | Done 2026-07-22 / wave 3 | PR #105, merged @ `15e30fa`. Fable **approve** (0 fix). Added required CheckReport.complete:boolean (src/core/check.ts); runCheck's two driftPromise branches emit complete=(error===null) before rethrowing; test in test/check.test.ts. Suite 1721/0. |
| 18 | LORE-116 | Done 2026-07-22 / wave 3 | PR #106, merged @ `936e429`. Fable **approve** (1 fix — test strengthened to be reversion-proof, mutation-checked). runReplace Phase-2 loop now writes each file via writeFileAtomic (temp+rename) instead of writeFileOverwriting; fswrite.ts docstrings updated; test in test/replace.test.ts. Suite 1722/0. |
| 19 | LORE-122 | Done 2026-07-22 / wave 3 | PR #107, merged @ `852f6a1`. Fable **approve** (0 fix). resolveTaskDetails rejects an adapter.viewTask result whose id != requested id (case-insensitive) as ok:false / not_found LoreError; test in test/reconcile-shared.test.ts. Suite 1725/0. Integration review confirmed clean composition with LORE-112's complete flag. |
| 20 | LORE-126 | Done 2026-07-22 / wave 3 | PR #108, merged @ `cec7d4e`. Fable **approve** (2 fix — edge endpoints + node.type also guarded, regression tests). renderText (graph.ts) + quote (core/graph.ts) run node id/title/type + edge endpoints through singleLine(); test/graph.test.ts. Final integrated suite 1729/0. |

## Not queued — needs a human / blocked

- LORE-42: `lore mcp server` — deferred v2 roadmap item, product/scope decision, not agent-resolvable now.
- LORE-43: Confluence one-way publish adapter — deferred, needs a live Confluence target + product decision.
- LORE-44: Confluence production mirror — deferred, same as LORE-43.
- LORE-45: Typed importable library build (.d.ts + subpath exports) — deferred, gated on the ECK-alignment decision to keep lore a standalone CLI (importable library deferred).

(All 78 medium findings were assessed as agent-resolvable at creation time; if one turns out not
to be, Fable escalates it and the orchestrator moves it here per the lifecycle's mid-flight
fallback.)

## Wave log

- 2026-07-22 — re-init (wave 0, no code): migrated this tracker from the round-1 cursor format to
  the wave-parallel skeleton (Frontier + Status/Wave columns + Wave log). No tasks worked; queue
  unchanged (78 To Do, LORE-96..173). Verified zero formal deps across all 78 via YAML parse.
- 2026-07-22 — **wave 1 COMPLETE** (issues: LORE-96, 98, 102, 107, 110, 114; workers: Sonnet 5,
  reviewer: Fable 5). One task per distinct cluster, file-disjoint (adapter-backlog, build-ci-config,
  build-runtime, cli-entry-state, cmd-check, cmd-crud-a). Worktrees created @ base `d6abe3b` under
  lore.worktrees/; dispatch marked at `d0c5857`. **All 6 approved by Fable on the first pass (0 fix
  rounds, 0 escalations)** — see Resolved table for per-task evidence, PRs, and merged SHAs. Merged
  serially (rebase onto moving dev, mandatory re-verify each: typecheck + full `bun test`, all
  clean) as PRs #92–#97; final integrated dev suite **1712 pass / 0 fail**, typecheck clean. Base
  `d6abe3b` → dev `5476b15`.
  - **Wave-level integration review (Fable):** overall SAFE, no blocking findings. Three findings:
    (1) *minor* — LORE-114 fixed only the `--out` path; the default title-slug path in
    resolveDocPath still creates reserved index/log stems (`lore new reference "Index"` → exit 0).
    Outside LORE-114's `--out` charter → **filed as LORE-174** (cmd-crud-a). (2) *nit* — LORE-107
    shifts two machine help contracts (unknown-cmd `--help` now exit 3; `--help --json` emits
    `help.manifest`); verified NO in-repo consumer (ci.yml, Dockerfile, run-e2e.sh) breaks. (3)
    *nit* — LORE-98/LORE-102 pin mkdocs at different strictness (Dockerfile exact vs ci.yml range);
    documented/intentional, flagged for awareness only. Per-task nits (probe-before-validate in
    LORE-96; URL-cap-vs-deadline tradeoff in LORE-110) recorded in PR bodies, none actioned.
- 2026-07-22 — wave 2 dispatched (issues: LORE-97, 99, 103, 108, 111, 115; workers: Sonnet 5,
  reviewer: Fable 5). One per distinct cluster, file-disjoint (adapter-backlog, build-ci-config,
  build-runtime, cli-entry-state, cmd-check, cmd-crud-a). Worktrees created @ base `19a3705` under
  lore.worktrees/. Settlement entry to follow.
- 2026-07-22 — **wave 2 COMPLETE** (issues: LORE-97, 99, 103, 108, 111, 115; workers: Sonnet 5,
  reviewer: Fable 5). One per distinct cluster, file-disjoint. Worktrees @ base `19a3705`; dispatch
  marked at `f78bb32`. **All 6 approved by Fable** (LORE-115 after 1 fix round; the rest 0). Merged
  serially as PRs #98–#103 (rebase onto moving dev, mandatory re-verify each: typecheck + full
  `bun test`, all clean; bash -n for LORE-103's shell). Base `19a3705` → dev `aff6f95`; final
  integrated suite **1718 pass / 0 fail**, typecheck clean.
  - **Resolved-by-merge duplicates closed this session** (orchestrator verified against merged dev,
    marked Done with evidence, no re-fix): LORE-127 + LORE-131 (by LORE-107, wave 1) and LORE-173
    (by LORE-115, wave 2). See Resolved rows 13–15.
  - **Wave-level integration review (Fable):** overall SAFE, no blocking/major cross-task defects;
    the LORE-111 mapWithConcurrency relocation verified clean (one definition, all callers updated,
    no import cycle). Findings: (1) *minor* — LORE-108's denied error omits errno `code` from its
    structured `input` (diverges from errors.ts's denied contract) + stale loadConfig docstring →
    **filed LORE-175** (cli-entry-state, low). (2) *nit* — LORE-99 left a dead `names` setup output
    in release.yml (zero consumers, harmless); not tasked — recorded here for a future cleanup.
- 2026-07-22 — wave 3 dispatched (issues: LORE-100, 109, 112, 116, 122, 126; workers: Sonnet 5,
  reviewer: Fable 5). One per distinct cluster, file-disjoint (build-ci-config, cli-entry-state,
  cmd-check, cmd-crud-a, cmd-meta-a, cmd-meta-b). Deferred this wave on file-conflict: LORE-104 (↔100,
  docker/e2e exit-code story), LORE-117 (↔116, src/commands/fswrite.ts), LORE-121 (↔109, src/state.ts).
  Worktrees created @ base `dda01bb` under lore.worktrees/. Settlement entry to follow.
- 2026-07-22 — **wave 3 COMPLETE** (issues dispatched: LORE-100, 109, 112, 116, 122, 126; workers:
  Sonnet 5, reviewer: Fable 5). One per distinct cluster, file-disjoint (build-ci-config, cli-entry-state,
  cmd-check, cmd-crud-a, cmd-meta-a, cmd-meta-b). Worktrees @ base `dda01bb`; dispatch marked at `cbf5d33`.
  **5 of 6 merged, all Fable-approved** (LORE-109/112/122 first pass; LORE-116 after 1 fix; LORE-126 after
  2 fix): PRs #104-#108, merged serially (rebase onto moving dev + mandatory re-verify each: typecheck +
  full `bun test`, all clean). Base `dda01bb` → dev `cec7d4e`; final integrated suite **1729 pass / 0 fail**,
  typecheck clean. Deferred this wave on file-conflict (to a later wave): LORE-104 (↔100, docker/e2e
  exit-code), LORE-117 (↔116, src/commands/fswrite.ts), LORE-121 (↔109, src/state.ts).
  - **LORE-100 ESCALATED (Fable, human_needed) — HELD, NOT merged.** The diff is approval-quality (all 3
    ACs independently confirmed; PUID/PGID + timeout fixes verified end-to-end via a real local Docker run;
    scope exact) but merging installs a *required* docker-e2e CI gate that is **red on every run**: two
    independent agents reproduced 298 pass / 1 fail because `docker/e2e/run-e2e.sh:1298` asserts 'lore check
    is NOT profile-bearing', contradicting LORE-89's intentional profile-aware check.ts
    (`src/commands/check.ts:47,142` loadProfile). The fix lives in run-e2e.sh, which LORE-100 is scoped not
    to touch. Disposition: branch `feature/LORE-100` @ `89f8133` kept pushed + worktree preserved; LORE-100
    set In Progress, dep LORE-176; **filed LORE-176** (fix the stale run-e2e.sh assertion). Merging LORE-100
    additionally needs a **user decision**: whether to wire a Docker-based CI gate at all (adds a ~15-45 min
    Docker job to every PR). Session STOPS after this wave per the escalation rule (R4j).
  - **Wave-level integration review (Fable): SAFE**, independently re-ran 1729/0, no blocking cross-task
    defects. Traced LORE-112↔LORE-122: a viewTask id-mismatch is never swallowed, correctly marks the check
    report `complete:false`, and throws through LORE-112's already-handled path. Findings: (1) *minor* —
    LORE-122's id-guard covers only resolveTaskDetails; sibling viewTask consumers stay unguarded:
    resolveRollup (already queued as LORE-125) and lore link (link.ts:180/212/346) → **filed LORE-177** for
    the link.ts half. (2) *info* — LORE-116's fswrite.ts hunks are docstring-only (benign; no conflict for
    deferred LORE-117).

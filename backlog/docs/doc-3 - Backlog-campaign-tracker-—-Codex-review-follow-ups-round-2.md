---
id: doc-3
title: Backlog campaign tracker — Codex review follow-ups (round 2)
type: other
created_date: '2026-07-21 22:27'
updated_date: '2026-07-22 12:07'
---
# Backlog campaign tracker — Codex review follow-ups (round 2)

Round 2 of the Codex-review follow-up campaign (see [[Backlog campaign tracker]] / doc-1 for
round 1, LORE-69..95, which closed all 20 high-severity findings from doc-2). Re-initialised on
2026-07-22 for the **wave-parallel** `/backlog-handover` driver (Opus orchestrator + parallel
Sonnet workers + mandatory Fable review), replacing the original one-issue-per-session cursor
model this doc was first written under.

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch
(parallel Sonnet implement + Fable review) → serialize the merge → update this tracker once more
at settlement → loop until the queue is empty or blocked → write handover.

## Source

All 78 queue items are LORE-96..173, created 2026-07-21 from a re-audit of doc-2 ("Codex
second-opinion review — lore codebase (2026-07-20)"). The re-audit (25 parallel agents, one per
review cluster) re-verified every one of doc-2's 201 confirmed findings against the live source
tree and the resolved task list as of 2026-07-21. Result: all 20 high-severity findings were
already resolved by round 1; 78 medium-severity findings were still open. Those 78 are this
round's queue. The 91 still-open low-severity findings were deliberately left out of scope (user
chose "medium only" on 2026-07-21, re-affirmed "re-arm the 78 medium" on 2026-07-22) — they are
not tracked as tasks yet; revisit via a fresh `/backlog-handover init` pass over doc-2's
low-severity section if/when this round completes.

## Scope / order confirmation

- **Scope**: medium-severity only (LORE-96..173, 78 tasks). Confirmed by the user 2026-07-21
  ("medium only") and re-affirmed 2026-07-22 ("re-arm the 78 medium"). The 91 low-severity
  findings and the 4 deferred v2/library tasks (LORE-42..45) are out of scope — see "Not queued".
- **Order**: the queue below is grouped by review cluster (alphabetical), matching doc-2's own
  structure for context-locality (same-file fixes stay adjacent). This is an implementation
  default, **not** a strict user-mandated sequence — under the wave-parallel driver it is only a
  tie-break priority for wave inclusion, never a guarantee any item lands in any specific wave.
  Reorder freely (via `backlog doc update`) if a different priority makes sense. Do not re-ask.
- **Formal dependencies**: none. All 78 task files were YAML-parsed on 2026-07-22 — every
  `dependencies` list is empty. Readiness is therefore gated **only** by the file-conflict graph
  (recomputed live each wave), never by a topological dep order.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the
start of every restore/wave — never trust a persisted "next wave" plan; it can go stale the
moment a conflict changes. Informational hint only: as of 2026-07-22 (re-init, 0 waves run), all
78 tasks are To Do with no formal deps, so all 78 are dependency-ready. Actual wave membership is
bounded by the 6-worker cap and the live pairwise file-conflict graph (same-cluster items are
treated as conflicting and will serialize across waves).

## Queue (confirmed order)

| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 1 | LORE-96 | adapter-backlog | — | To Do | — | Validate/escape argv values passed to backlog CLI to prevent flag injection |
| 2 | LORE-97 | adapter-backlog | — | To Do | — | createTask discards the new task id when the 'Created task <ID>' line fails to parse |
| 3 | LORE-98 | build-ci-config | — | To Do | — | Pin third-party GitHub Actions to commit SHAs instead of mutable tags |
| 4 | LORE-99 | build-ci-config | — | To Do | — | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed |
| 5 | LORE-100 | build-ci-config | — | To Do | — | Docker e2e harness is never invoked by CI or release workflows |
| 6 | LORE-101 | build-ci-config | — | To Do | — | Scoped release packages missing publishConfig.access:public, will fail first npm publish |
| 7 | LORE-102 | build-runtime | — | To Do | — | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs |
| 8 | LORE-103 | build-runtime | — | To Do | — | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run |
| 9 | LORE-104 | build-runtime | — | To Do | — | Documented `docker compose up --build` invocation doesn't propagate e2e exit code |
| 10 | LORE-105 | build-runtime | — | To Do | — | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format |
| 11 | LORE-106 | build-runtime | — | To Do | — | Golden recorder trusts a live mutable task and an unverified upstream CLI path |
| 12 | LORE-107 | cli-entry-state | — | To Do | — | lore <command> --help shows generic help instead of the command's own help |
| 13 | LORE-108 | cli-entry-state | — | To Do | — | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' |
| 14 | LORE-109 | cli-entry-state | — | To Do | — | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure |
| 15 | LORE-110 | cmd-check | — | To Do | — | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency |
| 16 | LORE-111 | cmd-check | — | To Do | — | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit |
| 17 | LORE-112 | cmd-check | — | To Do | — | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run |
| 18 | LORE-113 | cmd-check | — | To Do | — | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels |
| 19 | LORE-114 | cmd-crud-a | — | To Do | — | lore new --out bypasses reserved index/log stem policy |
| 20 | LORE-115 | cmd-crud-a | — | To Do | — | orphans table rows skip control-character sanitization on task fields |
| 21 | LORE-116 | cmd-crud-a | — | To Do | — | lore replace commit phase has no atomic write or rollback on partial failure |
| 22 | LORE-117 | cmd-crud-b | — | To Do | — | writeFileAtomic drops destination's file mode/ownership on overwrite |
| 23 | LORE-118 | cmd-crud-b | — | To Do | — | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output |
| 24 | LORE-119 | cmd-crud-b | — | To Do | — | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits |
| 25 | LORE-120 | cmd-crud-b | — | To Do | — | sync's multi-file write loop has no cross-file rollback on mid-loop failure |
| 26 | LORE-121 | cmd-link | — | To Do | — | lore link retry after failed backlog commit silently no-ops instead of recommitting |
| 27 | LORE-122 | cmd-meta-a | — | To Do | — | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id |
| 28 | LORE-123 | cmd-meta-a | — | To Do | — | schema export follows a symlink planted at a schema file's leaf path |
| 29 | LORE-124 | cmd-meta-a | — | To Do | — | Absolute --out inside the repo crashes schema export with an unhandled ENOENT |
| 30 | LORE-125 | cmd-meta-a | — | To Do | — | resolveRollup doesn't verify viewTask's returned id matches the requested id |
| 31 | LORE-126 | cmd-meta-b | — | To Do | — | Collapse embedded newlines in graph node id/title before rendering |
| 32 | LORE-127 | cmd-meta-c | — | To Do | — | `lore <command> --help` shows top-level help instead of the command's own help |
| 33 | LORE-128 | cmd-meta-c | — | To Do | — | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync |
| 34 | LORE-129 | cmd-meta-c | — | To Do | — | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it |
| 35 | LORE-130 | cmd-meta-c | — | To Do | — | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill |
| 36 | LORE-131 | cmd-meta-c | — | To Do | — | Add regression test asserting `lore <command> --help` matches `lore help <command>` |
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
| 78 | LORE-173 | errors-output-git | — | To Do | — | renderTaskSummaryRows prints raw Backlog id/status/title with no line normalization |

## Resolved

| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|

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

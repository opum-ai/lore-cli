---
id: doc-3
title: Backlog campaign tracker — Codex review follow-ups (round 2)
type: other
created_date: '2026-07-21 22:27'
updated_date: '2026-07-21 22:28'
---
# Backlog campaign tracker — Codex review follow-ups (round 2)

Second round of the one-issue-per-session Backlog campaign (see [[Backlog campaign tracker]]
/ doc-1 for round 1, LORE-69..95, which closed all 20 high-severity findings from doc-2).
Protocol: restore -> take the cursor issue -> feature-branch lifecycle -> advance cursor ->
append session log -> write handover. Same `/backlog-handover restore` driver loop as round 1.

## Source

All 78 queue items are LORE-96..173, created 2026-07-21 from a re-audit of doc-2 ("Codex
second-opinion review — lore codebase (2026-07-20)"). The re-audit (25 parallel agents, one
per review cluster) re-verified every one of doc-2's 201 confirmed findings against the live
source tree and the resolved task list as of 2026-07-21. Result: all 20 high-severity findings
were already resolved by round 1; 78 medium-severity findings were still open. Those 78 are
this round's queue. The 91 still-open low-severity findings were deliberately left out of this
round's scope (user chose "medium only" over "medium + low" when the re-audit was reported) —
they are not tracked as tasks yet; revisit via a fresh `/backlog-handover init` pass over doc-2's
low-severity section if/when this round completes.

## Cursor

**Next issue: LORE-96** — queue order confirmed by the user choosing the "medium only" scope on
2026-07-21; ordering within that scope (grouped by review cluster, alphabetical) is an
implementation default I chose for continuity with doc-2's own structure, not something the user
explicitly ordered — reorder freely if a different sequence makes more sense once work starts.
Do not re-ask before taking the next item.

## Queue (confirmed order)

| # | Issue | Cluster | One-line note |
|---|---|---|---|
| 1 | LORE-96 | adapter-backlog | Validate/escape argv values passed to backlog CLI to prevent flag injection |
| 2 | LORE-97 | adapter-backlog | createTask discards the new task id when the 'Created task <ID>' line fails to parse |
| 3 | LORE-98 | build-ci-config | Pin third-party GitHub Actions to commit SHAs instead of mutable tags |
| 4 | LORE-99 | build-ci-config | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed |
| 5 | LORE-100 | build-ci-config | Docker e2e harness is never invoked by CI or release workflows |
| 6 | LORE-101 | build-ci-config | Scoped release packages missing publishConfig.access:public, will fail first npm publish |
| 7 | LORE-102 | build-runtime | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs |
| 8 | LORE-103 | build-runtime | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run |
| 9 | LORE-104 | build-runtime | Documented `docker compose up --build` invocation doesn't propagate e2e exit code |
| 10 | LORE-105 | build-runtime | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format |
| 11 | LORE-106 | build-runtime | Golden recorder trusts a live mutable task and an unverified upstream CLI path |
| 12 | LORE-107 | cli-entry-state | lore <command> --help shows generic help instead of the command's own help |
| 13 | LORE-108 | cli-entry-state | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' |
| 14 | LORE-109 | cli-entry-state | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure |
| 15 | LORE-110 | cmd-check | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency |
| 16 | LORE-111 | cmd-check | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit |
| 17 | LORE-112 | cmd-check | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run |
| 18 | LORE-113 | cmd-check | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels |
| 19 | LORE-114 | cmd-crud-a | lore new --out bypasses reserved index/log stem policy |
| 20 | LORE-115 | cmd-crud-a | orphans table rows skip control-character sanitization on task fields |
| 21 | LORE-116 | cmd-crud-a | lore replace commit phase has no atomic write or rollback on partial failure |
| 22 | LORE-117 | cmd-crud-b | writeFileAtomic drops destination's file mode/ownership on overwrite |
| 23 | LORE-118 | cmd-crud-b | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output |
| 24 | LORE-119 | cmd-crud-b | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits |
| 25 | LORE-120 | cmd-crud-b | sync's multi-file write loop has no cross-file rollback on mid-loop failure |
| 26 | LORE-121 | cmd-link | lore link retry after failed backlog commit silently no-ops instead of recommitting |
| 27 | LORE-122 | cmd-meta-a | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id |
| 28 | LORE-123 | cmd-meta-a | schema export follows a symlink planted at a schema file's leaf path |
| 29 | LORE-124 | cmd-meta-a | Absolute --out inside the repo crashes schema export with an unhandled ENOENT |
| 30 | LORE-125 | cmd-meta-a | resolveRollup doesn't verify viewTask's returned id matches the requested id |
| 31 | LORE-126 | cmd-meta-b | Collapse embedded newlines in graph node id/title before rendering |
| 32 | LORE-127 | cmd-meta-c | `lore <command> --help` shows top-level help instead of the command's own help |
| 33 | LORE-128 | cmd-meta-c | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync |
| 34 | LORE-129 | cmd-meta-c | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it |
| 35 | LORE-130 | cmd-meta-c | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill |
| 36 | LORE-131 | cmd-meta-c | Add regression test asserting `lore <command> --help` matches `lore help <command>` |
| 37 | LORE-132 | cmd-rename-supersede | Close TOCTOU window in rename between target-free check and file move |
| 38 | LORE-133 | core-bundle-check | resolvePath does not special-case a leading-slash link target |
| 39 | LORE-134 | core-bundle-check | resolveRef tries frontmatter ref as a root id before trying it as a relative path |
| 40 | LORE-135 | core-bundle-check | Anchor-link check lower-cases fragments, masking case-mismatched broken anchors |
| 41 | LORE-136 | core-bundle-check | Heading slug computation ignores image alt text in headings |
| 42 | LORE-137 | core-bundle-check | reconcileDriftFindings ignores its own newStatus:null contract for managed-block drift |
| 43 | LORE-138 | core-bundle-check | bodyText's catch-all swallows any gray-matter exception, not just YAML parse errors |
| 44 | LORE-139 | core-bundle-check | Profile-declared type `template` path allows reading files outside .lore/templates/ via traversal |
| 45 | LORE-140 | core-bundle-check | parseFieldSpec accepts an empty `enum = []`, making the field impossible to satisfy |
| 46 | LORE-141 | core-concept-manifest | Malformed closing frontmatter fence bleeds bytes into concept body |
| 47 | LORE-142 | core-engine-a | Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts |
| 48 | LORE-143 | core-engine-a | Scope `git log` in GitAdapter.history to the docs root instead of the whole repo |
| 49 | LORE-144 | core-engine-a | serializeStructuralConcept's fixed default-profile write breaks `lore validate` under a custom Reference profile |
| 50 | LORE-145 | core-engine-b | Fix DOT quote() to not double-escape backslashes; escape newlines |
| 51 | LORE-146 | core-engine-b | Fix `linking` instructions: link/unlink now commit backlog/tasks themselves |
| 52 | LORE-147 | core-engine-b | Fix `check` instructions: expandRoot/reconciliation throws besides usage/not_found |
| 53 | LORE-148 | core-index-context | context export tokenEstimate ignores title field and JSON overhead |
| 54 | LORE-149 | core-index-context | linkText re-escapes already-escaped brackets, enabling injected markdown links |
| 55 | LORE-150 | core-index-context | generateIndexes never detects or removes an orphaned sub-index directory |
| 56 | LORE-151 | core-links-resolution | decodeTarget whole-path decode lets %2F forge a structural slash in link targets |
| 57 | LORE-152 | core-links-resolution | Dotted extensionless links (e.g. orders.v2) skip both portability lint and broken-link check |
| 58 | LORE-153 | core-links-resolution | LinkFinding.message interpolates raw link target unescaped into terminal-rendered text |
| 59 | LORE-154 | core-managed-template | cell() escapes pipes without escaping pre-existing backslashes first |
| 60 | LORE-155 | core-managed-template | upsertManagedBlock's update path skips the post-splice validation the insert path has |
| 61 | LORE-156 | core-managed-template | Same-line marker pair collapses into one mdast node and is invisible to locateLabeledMarkers |
| 62 | LORE-157 | core-managed-template | PLACEHOLDER regex silently passes through malformed {{...}} tokens instead of flagging them unresolved |
| 63 | LORE-158 | core-query-validate | Strip ANSI/control characters from query text output for id, type, and query text |
| 64 | LORE-159 | core-query-validate | h2Headings() counts nested headings (inside blockquotes/list items) as top-level sections |
| 65 | LORE-160 | core-query-validate | Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite ADR-0007 |
| 66 | LORE-161 | core-query-validate | Resource-drift finding message embeds raw frontmatter value unsanitized in CLI output |
| 67 | LORE-162 | core-replace | replace: validate expanded output, not just matched span, against managed ranges |
| 68 | LORE-163 | core-replace | replace: $<name> should stay literal when the regex has no named groups, not expand to "" |
| 69 | LORE-164 | core-rewrite-engine | Fix rewriteInbound: excluded move source yields rename with no matching write |
| 70 | LORE-165 | core-rewrite-engine | Add regression test for rewriteInbound's move + excluded-source-id combination |
| 71 | LORE-166 | core-scaffold-consumer | buildObsidianScaffold never emits the .gitignore entry the docs promise |
| 72 | LORE-167 | core-scaffold-consumer | validateFrontmatter misclassifies differently-cased known types as unknown |
| 73 | LORE-168 | core-scaffold-consumer | okf_version extra-key warning is exempted on every file, not just the root index |
| 74 | LORE-169 | errors-output-git | Harden realGitAdapter.history against quoted non-ASCII paths and sentinel collision |
| 75 | LORE-170 | errors-output-git | resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git |
| 76 | LORE-171 | errors-output-git | asText can return runtime undefined for Symbol/function input despite its string type |
| 77 | LORE-172 | errors-output-git | WarningCollector.flush writes raw multi-line/control-char warnings to stderr unnormalized |
| 78 | LORE-173 | errors-output-git | renderTaskSummaryRows prints raw Backlog id/status/title with no line normalization |

## Resolved

| # | Issue | Status/date/session | Evidence summary |
|---|---|---|---|

## Not queued — needs a human / blocked

(none yet — all 78 medium findings were assessed as agent-resolvable at creation time; if one
turns out not to be, move it here per the lifecycle's mid-flight fallback.)

## Session log

- 2026-07-21 — round 2 init: re-audited all 201 doc-2 findings against current source (25-cluster
  parallel verification workflow) and the round-1 resolved task list. Confirmed all 20 high
  findings fixed by round 1 (LORE-69..95). Drafted and created 78 tasks (LORE-96..173) for the
  still-open medium findings (24-cluster parallel drafting workflow, one `backlog task create`
  per finding, sequential to avoid Backlog.md task-ID collisions). Queue armed, cursor set to
  LORE-96, first handover written.

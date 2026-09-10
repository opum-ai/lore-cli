---
type: Story
title: Harden Lore CLI correctness and safety
tags:
  - hardening
  - security
  - quality
  - history
summary: Preserve the completed security, correctness, portability, testing, and contract-hardening campaigns.
timestamp: 2026-08-03T16:05:06.563Z
status: done
tasks:
  - lcli-61
  - lcli-62
  - lcli-63
  - lcli-64
  - lcli-69
  - lcli-70
  - lcli-71
  - lcli-72
  - lcli-73
  - lcli-74
  - lcli-75
  - lcli-76
  - lcli-77
  - lcli-78
  - lcli-79
  - lcli-80
  - lcli-81
  - lcli-82
  - lcli-83
  - lcli-84
  - lcli-85
  - lcli-86
  - lcli-87
  - lcli-91
  - lcli-93
  - lcli-65
  - lcli-66
  - lcli-68
  - lcli-88
  - lcli-89
  - lcli-96
  - lcli-97
  - lcli-98
  - lcli-99
  - lcli-100
  - lcli-101
  - lcli-102
  - lcli-103
  - lcli-104
  - lcli-105
  - lcli-106
  - lcli-107
  - lcli-108
  - lcli-109
  - lcli-110
  - lcli-111
  - lcli-112
  - lcli-113
  - lcli-114
  - lcli-115
  - lcli-116
  - lcli-117
  - lcli-118
  - lcli-119
  - lcli-120
  - lcli-121
  - lcli-122
  - lcli-123
  - lcli-124
  - lcli-125
  - lcli-126
  - lcli-127
  - lcli-128
  - lcli-129
  - lcli-130
  - lcli-131
  - lcli-132
  - lcli-133
  - lcli-134
  - lcli-135
  - lcli-136
  - lcli-137
  - lcli-138
  - lcli-139
  - lcli-140
  - lcli-141
  - lcli-142
  - lcli-143
  - lcli-144
  - lcli-145
  - lcli-146
  - lcli-147
  - lcli-148
  - lcli-149
  - lcli-150
  - lcli-151
  - lcli-152
  - lcli-153
  - lcli-154
  - lcli-155
  - lcli-156
  - lcli-157
  - lcli-158
  - lcli-159
  - lcli-160
  - lcli-161
  - lcli-162
  - lcli-163
  - lcli-164
  - lcli-165
  - lcli-166
  - lcli-167
  - lcli-168
  - lcli-169
  - lcli-170
  - lcli-171
  - lcli-172
  - lcli-173
  - lcli-174
  - lcli-176
  - lcli-177
  - lcli-179
  - lcli-180
  - lcli-183
  - lcli-184
  - lcli-186
  - lcli-190
  - lcli-192
  - lcli-193
  - lcli-67
  - lcli-90
  - lcli-92
  - lcli-94
  - lcli-95
  - lcli-175
  - lcli-181
  - lcli-182
  - lcli-185
  - lcli-187
  - lcli-188
  - lcli-189
  - lcli-191
  - lcli-194
  - lcli-195
  - lcli-196
  - lcli-197
  - lcli-198
  - lcli-199
  - lcli-200
  - lcli-201
  - lcli-202
  - lcli-203
  - lcli-204
  - lcli-205
  - lcli-206
  - lcli-207
  - lcli-208
  - lcli-209
  - lcli-210
  - lcli-211
  - lcli-212
  - lcli-213
  - lcli-214
  - lcli-215
  - lcli-216
  - lcli-217
  - lcli-218
  - lcli-219
  - lcli-220
  - lcli-221
  - lcli-222
  - lcli-223
  - lcli-224
  - lcli-225
  - lcli-226
  - lcli-227
  - lcli-228
  - lcli-229
  - lcli-230
  - lcli-231
  - lcli-232
  - lcli-233
  - lcli-234
  - lcli-235
  - lcli-236
  - lcli-237
  - lcli-238
  - lcli-239
  - lcli-240
  - lcli-241
  - lcli-242
  - lcli-243
  - lcli-244
  - lcli-245
  - lcli-246
  - lcli-247
  - lcli-248
  - lcli-249
  - lcli-250
  - lcli-178
---

# Harden Lore CLI correctness and safety

## Goal

Preserve the completed review campaigns that hardened filesystem confinement,
atomic writes, CLI output, Backlog integration, portability, documentation
coherence, tests, and release automation. The linked task set is historical
delivery evidence, not a runnable bug queue.

## Acceptance criteria

- Security and filesystem boundaries fail closed under traversal, symlink,
  partial-write, and untrusted-output cases.
- CLI and JSON contracts remain explicit, bounded, and consistently tested.
- Lore-managed documentation and Backlog coupling remain drift-detectable.
- Completed review tasks retain their status and acceptance history.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-61](../../.quest/tasks/LCLI-61.json) | docker/e2e never asserts failure output: add a step_fail helper and pin the stderr ErrorEnvelope + stdout-silence contract (incl. LCLI-58 induced partial failure) | Done |
| [LCLI-62](../../.quest/tasks/LCLI-62.json) | docker/e2e real-binary coupling gaps: missing-task signatures, present-but-incapable probe branch, linked-concept rename (F1) never exercised | Done |
| [LCLI-63](../../.quest/tasks/LCLI-63.json) | docker/e2e: reconciliation never value-asserted; custom status flows and the .lore/config.toml surface never run (defaults-only E2E) | Done |
| [LCLI-64](../../.quest/tasks/LCLI-64.json) | docker/e2e: declarative profile subsystem (LCLI-46) has zero E2E coverage beyond the default fallback | Done |
| [LCLI-69](../../.quest/tasks/LCLI-69.json) | commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal | Done |
| [LCLI-70](../../.quest/tasks/LCLI-70.json) | process.exit() after run() can truncate large piped --json output | Done |
| [LCLI-71](../../.quest/tasks/LCLI-71.json) | `lore check --external` is vulnerable to SSRF via unrestricted fetch() | Done |
| [LCLI-72](../../.quest/tasks/LCLI-72.json) | `lore new --template` allows path traversal to read arbitrary files | Done |
| [LCLI-73](../../.quest/tasks/LCLI-73.json) | lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap) | Done |
| [LCLI-74](../../.quest/tasks/LCLI-74.json) | lore orphans report has no output cap, contradicting the documented truncation contract | Done |
| [LCLI-75](../../.quest/tasks/LCLI-75.json) | lore schema export --out can irreversibly delete unrelated files outside its own directory | Done |
| [LCLI-76](../../.quest/tasks/LCLI-76.json) | lore scaffold --force writes follow symlinks, escaping the repo root | Done |
| [LCLI-77](../../.quest/tasks/LCLI-77.json) | lore init follows pre-existing symlinks at scaffold paths, escaping the repo root | Done |
| [LCLI-78](../../.quest/tasks/LCLI-78.json) | lore rename destination id is not validated for `..` traversal at the argument-parsing layer | Done |
| [LCLI-79](../../.quest/tasks/LCLI-79.json) | lore rename destination path is not confined to docs/ root at the command layer | Done |
| [LCLI-80](../../.quest/tasks/LCLI-80.json) | rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root | Done |
| [LCLI-81](../../.quest/tasks/LCLI-81.json) | lore rename index `<new>` (renaming FROM the reserved root index) is not rejected, corrupts docs/index.md | Done |
| [LCLI-82](../../.quest/tasks/LCLI-82.json) | loadBundle silently skips unreadable directories, letting rename/supersede commit against an incomplete graph | Done |
| [LCLI-83](../../.quest/tasks/LCLI-83.json) | profile.toml field/type declarations silently ignore unknown or misspelled attribute keys | Done |
| [LCLI-84](../../.quest/tasks/LCLI-84.json) | loadBundle never uses a project custom .lore/profile.toml | Done |
| [LCLI-85](../../.quest/tasks/LCLI-85.json) | Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor bomb) | Done |
| [LCLI-86](../../.quest/tasks/LCLI-86.json) | lore sync can silently delete hand-authored prose between duplicate or malformed managed-block markers | Done |
| [LCLI-87](../../.quest/tasks/LCLI-87.json) | rewriteInbound mis-locates reference-definition destinations when the label contains an escaped bracket | Done |
| [LCLI-91](../../.quest/tasks/LCLI-91.json) | lore new --template silently follows a symlink planted in .lore/templates/, reading outside the repo | Done |
| [LCLI-93](../../.quest/tasks/LCLI-93.json) | ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts follow symlinks, escaping docs/ to the real filesystem | Done |
| [LCLI-65](../../.quest/tasks/LCLI-65.json) | docker/e2e coupling mediums: field-isolated write read-backs, multi-doc SET semantics, backlog-side renames/archive, ADR-0012 commit scoping, nested checkout | Done |
| [LCLI-66](../../.quest/tasks/LCLI-66.json) | docker/e2e command-surface tail + housekeeping: vacuous replace/supersede steps, check --json/F2, flag coverage, misleading pseudo-cache step, weak assertions | Done |
| [LCLI-68](../../.quest/tasks/LCLI-68.json) | docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links after the LCLI-62 F1 rename sequence | Done |
| [LCLI-88](../../.quest/tasks/LCLI-88.json) | rewriteInbound (rename / supersede --rewrite-links) re-serializes and re-parses concepts against the built-in default profile, not the project's custom one | Done |
| [LCLI-89](../../.quest/tasks/LCLI-89.json) | lore check's own concept scan never forwards a project's custom .lore/profile.toml | Done |
| [LCLI-96](../../.quest/tasks/LCLI-96.json) | Validate/escape argv values passed to backlog CLI to prevent flag injection | Done |
| [LCLI-97](../../.quest/tasks/LCLI-97.json) | createTask discards the new task id when `Created task <ID>` fails to parse | Done |
| [LCLI-98](../../.quest/tasks/LCLI-98.json) | Pin third-party GitHub Actions to commit SHAs instead of mutable tags | Done |
| [LCLI-99](../../.quest/tasks/LCLI-99.json) | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed | Done |
| [LCLI-100](../../.quest/tasks/LCLI-100.json) | Docker e2e harness is never invoked by CI or release workflows | Done |
| [LCLI-101](../../.quest/tasks/LCLI-101.json) | Scoped release packages missing publishConfig.access:public, will fail first npm publish | Done |
| [LCLI-102](../../.quest/tasks/LCLI-102.json) | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs | Done |
| [LCLI-103](../../.quest/tasks/LCLI-103.json) | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run | Done |
| [LCLI-104](../../.quest/tasks/LCLI-104.json) | Documented `docker compose up --build` invocation doesn't propagate e2e exit code | Done |
| [LCLI-105](../../.quest/tasks/LCLI-105.json) | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format | Done |
| [LCLI-106](../../.quest/tasks/LCLI-106.json) | Golden recorder trusts a live mutable task and an unverified upstream CLI path | Done |
| [LCLI-107](../../.quest/tasks/LCLI-107.json) | `lore <command> --help` shows generic help instead of the command's own help | Done |
| [LCLI-108](../../.quest/tasks/LCLI-108.json) | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' | Done |
| [LCLI-109](../../.quest/tasks/LCLI-109.json) | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure | Done |
| [LCLI-110](../../.quest/tasks/LCLI-110.json) | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency | Done |
| [LCLI-111](../../.quest/tasks/LCLI-111.json) | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit | Done |
| [LCLI-112](../../.quest/tasks/LCLI-112.json) | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run | Done |
| [LCLI-113](../../.quest/tasks/LCLI-113.json) | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels | Done |
| [LCLI-114](../../.quest/tasks/LCLI-114.json) | lore new --out bypasses reserved index/log stem policy | Done |
| [LCLI-115](../../.quest/tasks/LCLI-115.json) | orphans table rows skip control-character sanitization on task fields | Done |
| [LCLI-116](../../.quest/tasks/LCLI-116.json) | lore replace commit phase has no atomic write or rollback on partial failure | Done |
| [LCLI-117](../../.quest/tasks/LCLI-117.json) | writeFileAtomic drops destination's file mode/ownership on overwrite | Done |
| [LCLI-118](../../.quest/tasks/LCLI-118.json) | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output | Done |
| [LCLI-119](../../.quest/tasks/LCLI-119.json) | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits | Done |
| [LCLI-120](../../.quest/tasks/LCLI-120.json) | sync's multi-file write loop has no cross-file rollback on mid-loop failure | Done |
| [LCLI-121](../../.quest/tasks/LCLI-121.json) | lore link retry after failed backlog commit silently no-ops instead of recommitting | Done |
| [LCLI-122](../../.quest/tasks/LCLI-122.json) | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id | Done |
| [LCLI-123](../../.quest/tasks/LCLI-123.json) | schema export follows a symlink planted at a schema file's leaf path | Done |
| [LCLI-124](../../.quest/tasks/LCLI-124.json) | Absolute --out inside the repo crashes schema export with an unhandled ENOENT | Done |
| [LCLI-125](../../.quest/tasks/LCLI-125.json) | resolveRollup doesn't verify viewTask's returned id matches the requested id | Done |
| [LCLI-126](../../.quest/tasks/LCLI-126.json) | Collapse embedded newlines in graph node id/title before rendering | Done |
| [LCLI-127](../../.quest/tasks/LCLI-127.json) | `lore <command> --help` shows top-level help instead of the command's own help | Done |
| [LCLI-128](../../.quest/tasks/LCLI-128.json) | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync | Done |
| [LCLI-129](../../.quest/tasks/LCLI-129.json) | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it | Done |
| [LCLI-130](../../.quest/tasks/LCLI-130.json) | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill | Done |
| [LCLI-131](../../.quest/tasks/LCLI-131.json) | Add regression test asserting `lore <command> --help` matches `lore help <command>` | Done |
| [LCLI-132](../../.quest/tasks/LCLI-132.json) | Close TOCTOU window in rename between target-free check and file move | Done |
| [LCLI-133](../../.quest/tasks/LCLI-133.json) | resolvePath does not special-case a leading-slash link target | Done |
| [LCLI-134](../../.quest/tasks/LCLI-134.json) | resolveRef tries frontmatter ref as a root id before trying it as a relative path | Done |
| [LCLI-135](../../.quest/tasks/LCLI-135.json) | Anchor-link check lower-cases fragments, masking case-mismatched broken anchors | Done |
| [LCLI-136](../../.quest/tasks/LCLI-136.json) | Heading slug computation ignores image alt text in headings | Done |
| [LCLI-137](../../.quest/tasks/LCLI-137.json) | reconcileDriftFindings ignores its own newStatus:null contract for managed-block drift | Done |
| [LCLI-138](../../.quest/tasks/LCLI-138.json) | bodyText's catch-all swallows any gray-matter exception, not just YAML parse errors | Done |
| [LCLI-139](../../.quest/tasks/LCLI-139.json) | Profile-declared type `template` path allows reading files outside .lore/templates/ via traversal | Done |
| [LCLI-140](../../.quest/tasks/LCLI-140.json) | parseFieldSpec accepts an empty `enum = []`, making the field impossible to satisfy | Done |
| [LCLI-141](../../.quest/tasks/LCLI-141.json) | Malformed closing frontmatter fence bleeds bytes into concept body | Done |
| [LCLI-142](../../.quest/tasks/LCLI-142.json) | Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts | Done |
| [LCLI-143](../../.quest/tasks/LCLI-143.json) | Scope `git log` in GitAdapter.history to the docs root instead of the whole repo | Done |
| [LCLI-144](../../.quest/tasks/LCLI-144.json) | serializeStructuralConcept's fixed default-profile write breaks `lore validate` under a custom Reference profile | Done |
| [LCLI-145](../../.quest/tasks/LCLI-145.json) | Fix DOT quote() to not double-escape backslashes; escape newlines | Done |
| [LCLI-146](../../.quest/tasks/LCLI-146.json) | Fix `linking` instructions: link/unlink now commit backlog/tasks themselves | Done |
| [LCLI-147](../../.quest/tasks/LCLI-147.json) | Fix `check` instructions: expandRoot/reconciliation throws besides usage/not_found | Done |
| [LCLI-148](../../.quest/tasks/LCLI-148.json) | context export tokenEstimate ignores title field and JSON overhead | Done |
| [LCLI-149](../../.quest/tasks/LCLI-149.json) | linkText re-escapes already-escaped brackets, enabling injected markdown links | Done |
| [LCLI-150](../../.quest/tasks/LCLI-150.json) | generateIndexes never detects or removes an orphaned sub-index directory | Done |
| [LCLI-151](../../.quest/tasks/LCLI-151.json) | decodeTarget whole-path decode lets %2F forge a structural slash in link targets | Done |
| [LCLI-152](../../.quest/tasks/LCLI-152.json) | Dotted extensionless links (e.g. orders.v2) skip both portability lint and broken-link check | Done |
| [LCLI-153](../../.quest/tasks/LCLI-153.json) | LinkFinding.message interpolates raw link target unescaped into terminal-rendered text | Done |
| [LCLI-154](../../.quest/tasks/LCLI-154.json) | cell() escapes pipes without escaping pre-existing backslashes first | Done |
| [LCLI-155](../../.quest/tasks/LCLI-155.json) | upsertManagedBlock's update path skips the post-splice validation the insert path has | Done |
| [LCLI-156](../../.quest/tasks/LCLI-156.json) | Same-line marker pair collapses into one mdast node and is invisible to locateLabeledMarkers | Done |
| [LCLI-157](../../.quest/tasks/LCLI-157.json) | PLACEHOLDER regex silently passes through malformed `{{...}}` tokens instead of flagging them unresolved | Done |
| [LCLI-158](../../.quest/tasks/LCLI-158.json) | Strip ANSI/control characters from query text output for id, type, and query text | Done |
| [LCLI-159](../../.quest/tasks/LCLI-159.json) | h2Headings() counts nested headings (inside blockquotes/list items) as top-level sections | Done |
| [LCLI-160](../../.quest/tasks/LCLI-160.json) | Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite ADR-0007 | Done |
| [LCLI-161](../../.quest/tasks/LCLI-161.json) | Resource-drift finding message embeds raw frontmatter value unsanitized in CLI output | Done |
| [LCLI-162](../../.quest/tasks/LCLI-162.json) | replace: validate expanded output, not just matched span, against managed ranges | Done |
| [LCLI-163](../../.quest/tasks/LCLI-163.json) | replace: `$<name>` should stay literal when the regex has no named groups, not expand to empty | Done |
| [LCLI-164](../../.quest/tasks/LCLI-164.json) | Fix rewriteInbound: excluded move source yields rename with no matching write | Done |
| [LCLI-165](../../.quest/tasks/LCLI-165.json) | Add regression test for rewriteInbound's move + excluded-source-id combination | Done |
| [LCLI-166](../../.quest/tasks/LCLI-166.json) | buildObsidianScaffold never emits the .gitignore entry the docs promise | Done |
| [LCLI-167](../../.quest/tasks/LCLI-167.json) | validateFrontmatter misclassifies differently-cased known types as unknown | Done |
| [LCLI-168](../../.quest/tasks/LCLI-168.json) | okf_version extra-key warning is exempted on every file, not just the root index | Done |
| [LCLI-169](../../.quest/tasks/LCLI-169.json) | Harden realGitAdapter.history against quoted non-ASCII paths and sentinel collision | Done |
| [LCLI-170](../../.quest/tasks/LCLI-170.json) | resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git | Done |
| [LCLI-171](../../.quest/tasks/LCLI-171.json) | asText can return runtime undefined for Symbol/function input despite its string type | Done |
| [LCLI-172](../../.quest/tasks/LCLI-172.json) | WarningCollector.flush writes raw multi-line/control-char warnings to stderr unnormalized | Done |
| [LCLI-173](../../.quest/tasks/LCLI-173.json) | renderTaskSummaryRows prints raw Backlog id/status/title with no line normalization | Done |
| [LCLI-174](../../.quest/tasks/LCLI-174.json) | lore new default title-slug path bypasses reserved index/log stem policy | Done |
| [LCLI-176](../../.quest/tasks/LCLI-176.json) | docker/e2e run-e2e.sh AC4 assertion is stale: lore check IS now profile-bearing since LCLI-89 | Done |
| [LCLI-177](../../.quest/tasks/LCLI-177.json) | lore link viewTask consumers do not verify returned id matches requested id (sibling of LCLI-122/125) | Done |
| [LCLI-179](../../.quest/tasks/LCLI-179.json) | lore unlink/rename retry after failed backlog commit silently no-ops on the leftover dirty file | Done |
| [LCLI-180](../../.quest/tasks/LCLI-180.json) | rewrite.ts newDestPathFor ignores leading-slash link targets, diverging from resolvePath (lore rename mis-derives /-absolute links) | Done |
| [LCLI-183](../../.quest/tasks/LCLI-183.json) | Guard moveBackRefs viewTask consumer + de-duplicate the id-mismatch check across link.ts/tasks.ts/reconcile-shared.ts | Done |
| [LCLI-184](../../.quest/tasks/LCLI-184.json) | resolveRef path-first precedence lets a mirroring directory shadow lore's own canonical bare-id refs (rewrite/supersede/rename) | Done |
| [LCLI-186](../../.quest/tasks/LCLI-186.json) | linkText in indexes.ts must double pre-existing backslashes before inserting bracket escapes (parity with LCLI-154's cell()) | Done |
| [LCLI-190](../../.quest/tasks/LCLI-190.json) | check/sync instructions mis-state the validation throw cause; collapsed same-line marker shape omitted (wave-11 LCLI-147/156 drift) | Done |
| [LCLI-192](../../.quest/tasks/LCLI-192.json) | loadBundle profile asymmetry: fresh scaffold under a custom Reference-required profile still fails lore graph/query/etc (sibling of LCLI-144) | Done |
| [LCLI-193](../../.quest/tasks/LCLI-193.json) | parseItems accepts an empty items enum = [], making a list field impossible to satisfy | Done |
| [LCLI-67](../../.quest/tasks/LCLI-67.json) | cli-surface.md documents behavior that does not exist: init --force/probe/exit-5, new type shorthands, check --fix, replace exit-6 gate; plus two dead validate config knobs | Done |
| [LCLI-90](../../.quest/tasks/LCLI-90.json) | commitBacklogFiles's backlog/ containment guard uses POSIX-only normalize, inconsistent with the project's win32 validation convention | Done |
| [LCLI-92](../../.quest/tasks/LCLI-92.json) | lore scaffold --force has a narrow TOCTOU window between the symlink guard and the overwrite write | Done |
| [LCLI-94](../../.quest/tasks/LCLI-94.json) | schema export: no regression test for --out near-miss boundaries, and isManagedSchemasDir doesn't resolve symlinks | Done |
| [LCLI-95](../../.quest/tasks/LCLI-95.json) | escapesRoot / assertConfinedToBundle accepts uncaught edge-case ids: Windows drive-relative paths and empty/self-cancelling newId | Done |
| [LCLI-175](../../.quest/tasks/LCLI-175.json) | readConfigText denied error omits errno code field, diverging from the shared denied contract | Done |
| [LCLI-181](../../.quest/tasks/LCLI-181.json) | Export a single shared stripAnsiAndControls sanitizer and de-duplicate query.ts's local copy | Done |
| [LCLI-182](../../.quest/tasks/LCLI-182.json) | schema confineOutDir: retain isAbsolute(rel) guard for win32 cross-drive --out | Done |
| [LCLI-185](../../.quest/tasks/LCLI-185.json) | Consolidate the two template-path confinement guards (profile.ts vs new.ts) and fix the now-stale readTemplateFile comment | Done |
| [LCLI-187](../../.quest/tasks/LCLI-187.json) | Refresh two stale O_NOFOLLOW comments left by LCLI-130 (schema.ts + fswrite.ts ioError docstring) | Done |
| [LCLI-188](../../.quest/tasks/LCLI-188.json) | Quote the git-log docs-root pathspec with :(literal) in realGitAdapter.history | Done |
| [LCLI-189](../../.quest/tasks/LCLI-189.json) | Fix stale src/commands/sync.ts module doc claiming link/unlink/rename do not self-commit | Done |
| [LCLI-191](../../.quest/tasks/LCLI-191.json) | Discovery advisories are lost when checkBundles throws in the scan phase (post-LCLI-138) | Done |
| [LCLI-194](../../.quest/tasks/LCLI-194.json) | Document/pin the throw-on-duplicate locator contract that assertNoInjectedMarker relies on | Done |
| [LCLI-195](../../.quest/tasks/LCLI-195.json) | Restore biome lint baseline to green on dev (bun run lint: 3 errors + 4 infos, all pre-existing) | Done |
| [LCLI-196](../../.quest/tasks/LCLI-196.json) | Make the docker-e2e CI job a required status check on dev/main (human repo-admin action) | Done |
| [LCLI-197](../../.quest/tasks/LCLI-197.json) | Discovery advisories from an earlier bundle root are lost when a later root throws inside collectBundles (residual of LCLI-191) | Done |
| [LCLI-198](../../.quest/tasks/LCLI-198.json) | Update test/fixtures/README.md backlog-json section to match the upstream recorder | Done |
| [LCLI-199](../../.quest/tasks/LCLI-199.json) | Correct check's cli-surface docs: it does not surface token estimates | Done |
| [LCLI-200](../../.quest/tasks/LCLI-200.json) | Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean coercion | Done |
| [LCLI-201](../../.quest/tasks/LCLI-201.json) | Fix the `validation` instructions topic's overstated colon quote-safety claim and add a regression test | Done |
| [LCLI-202](../../.quest/tasks/LCLI-202.json) | Correct order.ts module-doc rationale: default Array.prototype.sort is code-unit-ordered and stable, not locale/engine-dependent | Done |
| [LCLI-203](../../.quest/tasks/LCLI-203.json) | Clarify `lore context` --max-tokens docs: omitting it applies no token cap (bounded only by --depth) | Done |
| [LCLI-204](../../.quest/tasks/LCLI-204.json) | release.yml: assert the compiled binary --version matches package.json exactly, not just non-empty (mirror ci.yml) | Done |
| [LCLI-205](../../.quest/tasks/LCLI-205.json) | Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on the git subcommand, not on call index | Done |
| [LCLI-206](../../.quest/tasks/LCLI-206.json) | Make scripted git-spawn test fakes dispatch by observed command, not call index | Done |
| [LCLI-207](../../.quest/tasks/LCLI-207.json) | Release the response body in check's --external liveness fetch | Done |
| [LCLI-208](../../.quest/tasks/LCLI-208.json) | Export InstructionsData and drop the duplicated test-side declaration | Done |
| [LCLI-209](../../.quest/tasks/LCLI-209.json) | Correct the inaccurate comment and strengthen rename's "never constructs a Backlog adapter" test | Done |
| [LCLI-210](../../.quest/tasks/LCLI-210.json) | Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder from links.ts (LCLI-28 landed) | Done |
| [LCLI-211](../../.quest/tasks/LCLI-211.json) | Strengthen the tasks drift test: mix a dangling id with a failing read and assert empty streams | Done |
| [LCLI-212](../../.quest/tasks/LCLI-212.json) | Strengthen validate's realpath de-dup test with a genuine symlink alias | Done |
| [LCLI-213](../../.quest/tasks/LCLI-213.json) | Guard manifest `kind` against drift from each command's emitted `kind:` | Done |
| [LCLI-214](../../.quest/tasks/LCLI-214.json) | Cover edge-case resource bases (and the new-path section boundary) in template.test.ts | Done |
| [LCLI-215](../../.quest/tasks/LCLI-215.json) | Scope replace.test.ts temp-dir hooks to the command suites and guard their cleanup | Done |
| [LCLI-216](../../.quest/tasks/LCLI-216.json) | Replace tautological tasks/orphans byte-identity test with one exercising both command render paths | Done |
| [LCLI-217](../../.quest/tasks/LCLI-217.json) | Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout | Done |
| [LCLI-218](../../.quest/tasks/LCLI-218.json) | Remove the lone `this` binding in the backlog adapter's searchByLabel | Done |
| [LCLI-219](../../.quest/tasks/LCLI-219.json) | Enforce the single-line modeline contract in serializeConceptWithModeline | Done |
| [LCLI-220](../../.quest/tasks/LCLI-220.json) | Freeze the manifest singletons returned by buildManifest() | Done |
| [LCLI-221](../../.quest/tasks/LCLI-221.json) | Align id/status columns by terminal display width, not UTF-16 length | Done |
| [LCLI-222](../../.quest/tasks/LCLI-222.json) | Map spawn-rejections on all backlog calls (not just the probe's --version) to typed LoreErrors | Done |
| [LCLI-223](../../.quest/tasks/LCLI-223.json) | cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as flags | Done |
| [LCLI-224](../../.quest/tasks/LCLI-224.json) | state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle prefix | Done |
| [LCLI-225](../../.quest/tasks/LCLI-225.json) | De-duplicate check's bundle roots by canonical filesystem identity | Done |
| [LCLI-226](../../.quest/tasks/LCLI-226.json) | Sanitize control characters in check's finding output | Done |
| [LCLI-227](../../.quest/tasks/LCLI-227.json) | new.ts: parse arguments before loading the profile so a malformed profile.toml can't mask a usage error | Done |
| [LCLI-228](../../.quest/tasks/LCLI-228.json) | replace.ts / validate.ts: reject an inline =value on boolean flags (--regex, --dry-run, --strict) | Done |
| [LCLI-229](../../.quest/tasks/LCLI-229.json) | replace.ts: sanitize discovered file paths in the report (strip ANSI/control chars) to prevent output forging | Done |
| [LCLI-230](../../.quest/tasks/LCLI-230.json) | existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already exists' skip | Done |
| [LCLI-231](../../.quest/tasks/LCLI-231.json) | writeFileAtomic leaks an uncleaned temp file when writeFileSync fails mid-write | Done |
| [LCLI-232](../../.quest/tasks/LCLI-232.json) | lore query --type/--status/--tag values are not trimmed, inconsistent with --field | Done |
| [LCLI-233](../../.quest/tasks/LCLI-233.json) | Bound runLink's up-front viewTask existence-check fan-out with a concurrency limit | Done |
| [LCLI-234](../../.quest/tasks/LCLI-234.json) | runLink's doc-membership check is exact-case while unlink's is case-insensitive — a casing-variant documentation entry duplicates instead of dedups | Done |
| [LCLI-235](../../.quest/tasks/LCLI-235.json) | Bound resolveRollup's viewTask fan-out with the shared concurrency cap | Done |
| [LCLI-236](../../.quest/tasks/LCLI-236.json) | Strip ANSI/control/OSC escapes on the stderr warning path (WarningCollector.flush) | Done |
| [LCLI-237](../../.quest/tasks/LCLI-237.json) | Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`, and repeated `--type` | Done |
| [LCLI-238](../../.quest/tasks/LCLI-238.json) | scaffold: differentiate the conflict hint for structural directory blockers (--force cannot replace a file with a directory) | Done |
| [LCLI-239](../../.quest/tasks/LCLI-239.json) | callout portability detector false-positives on inline formatting before [!type] in ordinary prose | Done |
| [LCLI-240](../../.quest/tasks/LCLI-240.json) | check portability lint mis-parses a leading indented code block in frontmatter-free files | Done |
| [LCLI-241](../../.quest/tasks/LCLI-241.json) | parseJson rewrites a valid-but-non-object profile.json into a misleading 'is not valid JSON' error | Done |
| [LCLI-242](../../.quest/tasks/LCLI-242.json) | profile does not validate a field's `default` against its declared kind/enum | Done |
| [LCLI-243](../../.quest/tasks/LCLI-243.json) | Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle roots | Done |
| [LCLI-244](../../.quest/tasks/LCLI-244.json) | index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar (match graph/query/context) | Done |
| [LCLI-245](../../.quest/tasks/LCLI-245.json) | validateLink: flag bare '.'/'..' navigation destinations instead of exempting them as dotfiles | Done |
| [LCLI-246](../../.quest/tasks/LCLI-246.json) | matchesField: resolve case-insensitive field key across ALL case-variant spellings, not just the first | Done |
| [LCLI-247](../../.quest/tasks/LCLI-247.json) | Preserve above-repo-root outbound links during rename instead of silently clamp-retargeting them | Done |
| [LCLI-248](../../.quest/tasks/LCLI-248.json) | warnSummary counts UTF-16 code units but reports "chars" — non-BMP summaries warn prematurely | Done |
| [LCLI-249](../../.quest/tasks/LCLI-249.json) | Harden stderrHint: strip terminal control sequences and cap length | Done |
| [LCLI-250](../../.quest/tasks/LCLI-250.json) | Suppress ANSI color on stderr diagnostics when stderr is not a TTY | Done |
| [LCLI-178](../../.quest/tasks/LCLI-178.json) | Runbook docker-e2e-testing-environment.md doesn't mention the harness now runs as a CI gate (post-LCLI-100) | Done |
<!-- lore:tasks:end -->

## Notes

The completed campaigns are summarized by the repository's Backlog campaign
documents. This Story provides lifecycle ownership only; task records remain
the detailed evidence source.

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
| [LCLI-61](../../backlog/tasks/lcli-61%20-%20docker-e2e-never-asserts-failure-output-add-a-step_fail-helper-and-pin-the-stderr-ErrorEnvelope-stdout-silence-contract-incl.-LORE-58-induced-partial-failure.md) | docker/e2e never asserts failure output: add a step_fail helper and pin the stderr ErrorEnvelope + stdout-silence contract (incl. LCLI-58 induced partial failure) | Done |
| [LCLI-62](../../backlog/tasks/lcli-62%20-%20docker-e2e-real-binary-coupling-gaps-missing-task-signatures-present-but-incapable-probe-branch-linked-concept-rename-F1-never-exercised.md) | docker/e2e real-binary coupling gaps: missing-task signatures, present-but-incapable probe branch, linked-concept rename (F1) never exercised | Done |
| [LCLI-63](../../backlog/tasks/lcli-63%20-%20docker-e2e-reconciliation-never-value-asserted-custom-status-flows-and-the-.lore-config.toml-surface-never-run-defaults-only-E2E.md) | docker/e2e: reconciliation never value-asserted; custom status flows and the .lore/config.toml surface never run (defaults-only E2E) | Done |
| [LCLI-64](../../backlog/tasks/lcli-64%20-%20docker-e2e-declarative-profile-subsystem-LORE-46-has-zero-E2E-coverage-beyond-the-default-fallback.md) | docker/e2e: declarative profile subsystem (LCLI-46) has zero E2E coverage beyond the default fallback | Done |
| [LCLI-69](../../backlog/tasks/lcli-69%20-%20commitBacklogFiles-backlog-scope-guard-does-not-block-%60..%60-pathspec-traversal.md) | commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal | Done |
| [LCLI-70](../../backlog/tasks/lcli-70%20-%20process.exit-after-run-can-truncate-large-piped-json-output.md) | process.exit() after run() can truncate large piped --json output | Done |
| [LCLI-71](../../backlog/tasks/lcli-71%20-%20%60lore-check-external%60-is-vulnerable-to-SSRF-via-unrestricted-fetch.md) | `lore check --external` is vulnerable to SSRF via unrestricted fetch() | Done |
| [LCLI-72](../../backlog/tasks/lcli-72%20-%20%60lore-new-template%60-allows-path-traversal-to-read-arbitrary-files.md) | `lore new --template` allows path traversal to read arbitrary files | Done |
| [LCLI-73](../../backlog/tasks/lcli-73%20-%20lore-replace-can-corrupt-lore-tasks-managed-blocks-MANAGED_MARKERS-gap.md) | lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap) | Done |
| [LCLI-74](../../backlog/tasks/lcli-74%20-%20lore-orphans-report-has-no-output-cap-contradicting-the-documented-truncation-contract.md) | lore orphans report has no output cap, contradicting the documented truncation contract | Done |
| [LCLI-75](../../backlog/tasks/lcli-75%20-%20lore-schema-export-out-can-irreversibly-delete-unrelated-files-outside-its-own-directory.md) | lore schema export --out can irreversibly delete unrelated files outside its own directory | Done |
| [LCLI-76](../../backlog/tasks/lcli-76%20-%20lore-scaffold-force-writes-follow-symlinks-escaping-the-repo-root.md) | lore scaffold --force writes follow symlinks, escaping the repo root | Done |
| [LCLI-77](../../backlog/tasks/lcli-77%20-%20lore-init-follows-pre-existing-symlinks-at-scaffold-paths-escaping-the-repo-root.md) | lore init follows pre-existing symlinks at scaffold paths, escaping the repo root | Done |
| [LCLI-78](../../backlog/tasks/lcli-78%20-%20lore-rename-destination-id-is-not-validated-for-%60..%60-traversal-at-the-argument-parsing-layer.md) | lore rename destination id is not validated for `..` traversal at the argument-parsing layer | Done |
| [LCLI-79](../../backlog/tasks/lcli-79%20-%20lore-rename-destination-path-is-not-confined-to-docs-root-at-the-command-layer.md) | lore rename destination path is not confined to docs/ root at the command layer | Done |
| [LCLI-80](../../backlog/tasks/lcli-80%20-%20rewriteInbound-shared-engine-does-not-confine-fromId-toId-to-docs-bundle-root.md) | rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root | Done |
| [LCLI-81](../../backlog/tasks/lcli-81%20-%20lore-rename-index-new-renaming-FROM-the-reserved-root-index-is-not-rejected-corrupts-docs-index.md.md) | lore rename index `<new>` (renaming FROM the reserved root index) is not rejected, corrupts docs/index.md | Done |
| [LCLI-82](../../backlog/tasks/lcli-82%20-%20loadBundle-silently-skips-unreadable-directories-letting-rename-supersede-commit-against-an-incomplete-graph.md) | loadBundle silently skips unreadable directories, letting rename/supersede commit against an incomplete graph | Done |
| [LCLI-83](../../backlog/tasks/lcli-83%20-%20profile.toml-field-type-declarations-silently-ignore-unknown-or-misspelled-attribute-keys.md) | profile.toml field/type declarations silently ignore unknown or misspelled attribute keys | Done |
| [LCLI-84](../../backlog/tasks/lcli-84%20-%20loadBundle-never-uses-a-project-custom-.lore-profile.toml.md) | loadBundle never uses a project custom .lore/profile.toml | Done |
| [LCLI-85](../../backlog/tasks/lcli-85%20-%20Frontmatter-YAML-anchors-can-be-crafted-to-exhaust-memory-on-serialize-anchor-bomb.md) | Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor bomb) | Done |
| [LCLI-86](../../backlog/tasks/lcli-86%20-%20lore-sync-can-silently-delete-hand-authored-prose-between-duplicate-or-malformed-managed-block-markers.md) | lore sync can silently delete hand-authored prose between duplicate or malformed managed-block markers | Done |
| [LCLI-87](../../backlog/tasks/lcli-87%20-%20rewriteInbound-mis-locates-reference-definition-destinations-when-the-label-contains-an-escaped-bracket.md) | rewriteInbound mis-locates reference-definition destinations when the label contains an escaped bracket | Done |
| [LCLI-91](../../backlog/tasks/lcli-91%20-%20lore-new-template-silently-follows-a-symlink-planted-in-.lore-templates-reading-outside-the-repo.md) | lore new --template silently follows a symlink planted in .lore/templates/, reading outside the repo | Done |
| [LCLI-93](../../backlog/tasks/lcli-93%20-%20ensureDir-call-sites-in-new.ts-agents.ts-sync.ts-schema.ts-and-rename.ts-follow-symlinks-escaping-docs-to-the-real-filesystem.md) | ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts follow symlinks, escaping docs/ to the real filesystem | Done |
| [LCLI-65](../../backlog/tasks/lcli-65%20-%20docker-e2e-coupling-mediums-field-isolated-write-read-backs-multi-doc-SET-semantics-backlog-side-renames-archive-ADR-0012-commit-scoping-nested-checkout.md) | docker/e2e coupling mediums: field-isolated write read-backs, multi-doc SET semantics, backlog-side renames/archive, ADR-0012 commit scoping, nested checkout | Done |
| [LCLI-66](../../backlog/tasks/lcli-66%20-%20docker-e2e-command-surface-tail-housekeeping-vacuous-replace-supersede-steps-check-json-F2-flag-coverage-misleading-pseudo-cache-step-weak-assertions.md) | docker/e2e command-surface tail + housekeeping: vacuous replace/supersede steps, check --json/F2, flag coverage, misleading pseudo-cache step, weak assertions | Done |
| [LCLI-68](../../backlog/tasks/lcli-68%20-%20docker-e2e-renamed-storys-managed-block-carries-broken-backlog-tasks-links-after-the-LORE-62-F1-rename-sequence.md) | docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links after the LCLI-62 F1 rename sequence | Done |
| [LCLI-88](../../backlog/tasks/lcli-88%20-%20rewriteInbound-rename-supersede-rewrite-links-re-serializes-and-re-parses-concepts-against-the-built-in-default-profile-not-the-projects-custom-one.md) | rewriteInbound (rename / supersede --rewrite-links) re-serializes and re-parses concepts against the built-in default profile, not the project's custom one | Done |
| [LCLI-89](../../backlog/tasks/lcli-89%20-%20lore-checks-own-concept-scan-never-forwards-a-projects-custom-.lore-profile.toml.md) | lore check's own concept scan never forwards a project's custom .lore/profile.toml | Done |
| [LCLI-96](../../backlog/tasks/lcli-96%20-%20Validate-escape-argv-values-passed-to-backlog-CLI-to-prevent-flag-injection.md) | Validate/escape argv values passed to backlog CLI to prevent flag injection | Done |
| [LCLI-97](../../backlog/tasks/lcli-97%20-%20createTask-discards-the-new-task-id-when-the-Created-task-ID-line-fails-to-parse.md) | createTask discards the new task id when `Created task <ID>` fails to parse | Done |
| [LCLI-98](../../backlog/tasks/lcli-98%20-%20Pin-third-party-GitHub-Actions-to-commit-SHAs-instead-of-mutable-tags.md) | Pin third-party GitHub Actions to commit SHAs instead of mutable tags | Done |
| [LCLI-99](../../backlog/tasks/lcli-99%20-%20verify-versions-job-doesnt-check-os-cpu-fields-or-binary-filenames-only-linux-x64-build-is-executed.md) | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed | Done |
| [LCLI-100](../../backlog/tasks/lcli-100%20-%20Docker-e2e-harness-is-never-invoked-by-CI-or-release-workflows.md) | Docker e2e harness is never invoked by CI or release workflows | Done |
| [LCLI-101](../../backlog/tasks/lcli-101%20-%20Scoped-release-packages-missing-publishConfig.access-public-will-fail-first-npm-publish.md) | Scoped release packages missing publishConfig.access:public, will fail first npm publish | Done |
| [LCLI-102](../../backlog/tasks/lcli-102%20-%20Harden-e2e-Dockerfile-digest-pin-base-image-avoid-root-curl-bash-pin-mkdocs.md) | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs | Done |
| [LCLI-103](../../backlog/tasks/lcli-103%20-%20Surface-report-write-failures-and-fixed-UID-bind-mount-permission-risk-in-e2e-run.md) | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run | Done |
| [LCLI-104](../../backlog/tasks/lcli-104%20-%20Documented-%60docker-compose-up-build%60-invocation-doesnt-propagate-e2e-exit-code.md) | Documented `docker compose up --build` invocation doesn't propagate e2e exit code | Done |
| [LCLI-105](../../backlog/tasks/lcli-105%20-%20record-check-write-pretty-printed-JSON-breaking-report.jsonls-JSONL-format.md) | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format | Done |
| [LCLI-106](../../backlog/tasks/lcli-106%20-%20Golden-recorder-trusts-a-live-mutable-task-and-an-unverified-upstream-CLI-path.md) | Golden recorder trusts a live mutable task and an unverified upstream CLI path | Done |
| [LCLI-107](../../backlog/tasks/lcli-107%20-%20lore-command-help-shows-generic-help-instead-of-the-commands-own-help.md) | `lore <command> --help` shows generic help instead of the command's own help | Done |
| [LCLI-108](../../backlog/tasks/lcli-108%20-%20readConfigText-maps-EACCES-EPERM-config-read-failures-to-validation-not-denied.md) | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' | Done |
| [LCLI-109](../../backlog/tasks/lcli-109%20-%20commitBacklogFiles-discards-LoreError.hint-real-git-hook-stderr-on-commit-failure.md) | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure | Done |
| [LCLI-110](../../backlog/tasks/lcli-110%20-%20Cap-probeLivenesss-total-URL-count-and-wall-clock-time-not-just-per-URL-concurrency.md) | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency | Done |
| [LCLI-111](../../backlog/tasks/lcli-111%20-%20Bound-resolveTaskDetailss-per-task-adapter.viewTask-fan-out-with-a-concurrency-limit.md) | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit | Done |
| [LCLI-112](../../backlog/tasks/lcli-112%20-%20checks-JSON-report-doesnt-mark-itself-incomplete-when-reconciliation-errors-mid-run.md) | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run | Done |
| [LCLI-113](../../backlog/tasks/lcli-113%20-%20docPath-uses-raw-bundle.label-while-isDocsRoot-normalizes-it-so-the-two-disagree-on-non-canonical-labels.md) | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels | Done |
| [LCLI-114](../../backlog/tasks/lcli-114%20-%20lore-new-out-bypasses-reserved-index-log-stem-policy.md) | lore new --out bypasses reserved index/log stem policy | Done |
| [LCLI-115](../../backlog/tasks/lcli-115%20-%20orphans-table-rows-skip-control-character-sanitization-on-task-fields.md) | orphans table rows skip control-character sanitization on task fields | Done |
| [LCLI-116](../../backlog/tasks/lcli-116%20-%20lore-replace-commit-phase-has-no-atomic-write-or-rollback-on-partial-failure.md) | lore replace commit phase has no atomic write or rollback on partial failure | Done |
| [LCLI-117](../../backlog/tasks/lcli-117%20-%20writeFileAtomic-drops-destinations-file-mode-ownership-on-overwrite.md) | writeFileAtomic drops destination's file mode/ownership on overwrite | Done |
| [LCLI-118](../../backlog/tasks/lcli-118%20-%20query-renderText-interpolates-unsanitized-hit-id-type-snippet-and-query-text-into-terminal-output.md) | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output | Done |
| [LCLI-119](../../backlog/tasks/lcli-119%20-%20sync-overwrites-a-status-changed-doc-using-stale-in-memory-frontmatter-discarding-concurrent-on-disk-edits.md) | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits | Done |
| [LCLI-120](../../backlog/tasks/lcli-120%20-%20syncs-multi-file-write-loop-has-no-cross-file-rollback-on-mid-loop-failure.md) | sync's multi-file write loop has no cross-file rollback on mid-loop failure | Done |
| [LCLI-121](../../backlog/tasks/lcli-121%20-%20lore-link-retry-after-failed-backlog-commit-silently-no-ops-instead-of-recommitting.md) | lore link retry after failed backlog commit silently no-ops instead of recommitting | Done |
| [LCLI-122](../../backlog/tasks/lcli-122%20-%20resolveTaskDetails-doesnt-verify-viewTasks-returned-id-matches-the-requested-id.md) | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id | Done |
| [LCLI-123](../../backlog/tasks/lcli-123%20-%20schema-export-follows-a-symlink-planted-at-a-schema-files-leaf-path.md) | schema export follows a symlink planted at a schema file's leaf path | Done |
| [LCLI-124](../../backlog/tasks/lcli-124%20-%20Absolute-out-inside-the-repo-crashes-schema-export-with-an-unhandled-ENOENT.md) | Absolute --out inside the repo crashes schema export with an unhandled ENOENT | Done |
| [LCLI-125](../../backlog/tasks/lcli-125%20-%20resolveRollup-doesnt-verify-viewTasks-returned-id-matches-the-requested-id.md) | resolveRollup doesn't verify viewTask's returned id matches the requested id | Done |
| [LCLI-126](../../backlog/tasks/lcli-126%20-%20Collapse-embedded-newlines-in-graph-node-id-title-before-rendering.md) | Collapse embedded newlines in graph node id/title before rendering | Done |
| [LCLI-127](../../backlog/tasks/lcli-127%20-%20%60lore-command-help%60-shows-top-level-help-instead-of-the-commands-own-help.md) | `lore <command> --help` shows top-level help instead of the command's own help | Done |
| [LCLI-128](../../backlog/tasks/lcli-128%20-%20CLAUDE.md-nudge-update-silently-rewrites-CRLF-BOM-line-endings-on-every-managed-block-sync.md) | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync | Done |
| [LCLI-129](../../backlog/tasks/lcli-129%20-%20%60lore-agents-check-force%60-mislabels-a-stale-hand-edited-SKILL.md-and-prints-a-remedy-that-wont-fix-it.md) | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it | Done |
| [LCLI-130](../../backlog/tasks/lcli-130%20-%20writeAllOrRollbacks-force-overwrite-is-not-crash-safe-against-a-mid-write-kill.md) | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill | Done |
| [LCLI-131](../../backlog/tasks/lcli-131%20-%20Add-regression-test-asserting-%60lore-command-help%60-matches-%60lore-help-command-%60.md) | Add regression test asserting `lore <command> --help` matches `lore help <command>` | Done |
| [LCLI-132](../../backlog/tasks/lcli-132%20-%20Close-TOCTOU-window-in-rename-between-target-free-check-and-file-move.md) | Close TOCTOU window in rename between target-free check and file move | Done |
| [LCLI-133](../../backlog/tasks/lcli-133%20-%20resolvePath-does-not-special-case-a-leading-slash-link-target.md) | resolvePath does not special-case a leading-slash link target | Done |
| [LCLI-134](../../backlog/tasks/lcli-134%20-%20resolveRef-tries-frontmatter-ref-as-a-root-id-before-trying-it-as-a-relative-path.md) | resolveRef tries frontmatter ref as a root id before trying it as a relative path | Done |
| [LCLI-135](../../backlog/tasks/lcli-135%20-%20Anchor-link-check-lower-cases-fragments-masking-case-mismatched-broken-anchors.md) | Anchor-link check lower-cases fragments, masking case-mismatched broken anchors | Done |
| [LCLI-136](../../backlog/tasks/lcli-136%20-%20Heading-slug-computation-ignores-image-alt-text-in-headings.md) | Heading slug computation ignores image alt text in headings | Done |
| [LCLI-137](../../backlog/tasks/lcli-137%20-%20reconcileDriftFindings-ignores-its-own-newStatus-null-contract-for-managed-block-drift.md) | reconcileDriftFindings ignores its own newStatus:null contract for managed-block drift | Done |
| [LCLI-138](../../backlog/tasks/lcli-138%20-%20bodyTexts-catch-all-swallows-any-gray-matter-exception-not-just-YAML-parse-errors.md) | bodyText's catch-all swallows any gray-matter exception, not just YAML parse errors | Done |
| [LCLI-139](../../backlog/tasks/lcli-139%20-%20Profile-declared-type-%60template%60-path-allows-reading-files-outside-.lore-templates-via-traversal.md) | Profile-declared type `template` path allows reading files outside .lore/templates/ via traversal | Done |
| [LCLI-140](../../backlog/tasks/lcli-140%20-%20parseFieldSpec-accepts-an-empty-%60enum-%60-making-the-field-impossible-to-satisfy.md) | parseFieldSpec accepts an empty `enum = []`, making the field impossible to satisfy | Done |
| [LCLI-141](../../backlog/tasks/lcli-141%20-%20Malformed-closing-frontmatter-fence-bleeds-bytes-into-concept-body.md) | Malformed closing frontmatter fence bleeds bytes into concept body | Done |
| [LCLI-142](../../backlog/tasks/lcli-142%20-%20Add-missing-%60help%60-entry-to-LORE_COMMANDS-in-agent-bridge.ts.md) | Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts | Done |
| [LCLI-143](../../backlog/tasks/lcli-143%20-%20Scope-%60git-log%60-in-GitAdapter.history-to-the-docs-root-instead-of-the-whole-repo.md) | Scope `git log` in GitAdapter.history to the docs root instead of the whole repo | Done |
| [LCLI-144](../../backlog/tasks/lcli-144%20-%20serializeStructuralConcepts-fixed-default-profile-write-breaks-%60lore-validate%60-under-a-custom-Reference-profile.md) | serializeStructuralConcept's fixed default-profile write breaks `lore validate` under a custom Reference profile | Done |
| [LCLI-145](../../backlog/tasks/lcli-145%20-%20Fix-DOT-quote-to-not-double-escape-backslashes-escape-newlines.md) | Fix DOT quote() to not double-escape backslashes; escape newlines | Done |
| [LCLI-146](../../backlog/tasks/lcli-146%20-%20Fix-%60linking%60-instructions-link-unlink-now-commit-backlog-tasks-themselves.md) | Fix `linking` instructions: link/unlink now commit backlog/tasks themselves | Done |
| [LCLI-147](../../backlog/tasks/lcli-147%20-%20Fix-%60check%60-instructions-expandRoot-reconciliation-throws-besides-usage-not_found.md) | Fix `check` instructions: expandRoot/reconciliation throws besides usage/not_found | Done |
| [LCLI-148](../../backlog/tasks/lcli-148%20-%20context-export-tokenEstimate-ignores-title-field-and-JSON-overhead.md) | context export tokenEstimate ignores title field and JSON overhead | Done |
| [LCLI-149](../../backlog/tasks/lcli-149%20-%20linkText-re-escapes-already-escaped-brackets-enabling-injected-markdown-links.md) | linkText re-escapes already-escaped brackets, enabling injected markdown links | Done |
| [LCLI-150](../../backlog/tasks/lcli-150%20-%20generateIndexes-never-detects-or-removes-an-orphaned-sub-index-directory.md) | generateIndexes never detects or removes an orphaned sub-index directory | Done |
| [LCLI-151](../../backlog/tasks/lcli-151%20-%20decodeTarget-whole-path-decode-lets-2F-forge-a-structural-slash-in-link-targets.md) | decodeTarget whole-path decode lets %2F forge a structural slash in link targets | Done |
| [LCLI-152](../../backlog/tasks/lcli-152%20-%20Dotted-extensionless-links-e.g.-orders.v2-skip-both-portability-lint-and-broken-link-check.md) | Dotted extensionless links (e.g. orders.v2) skip both portability lint and broken-link check | Done |
| [LCLI-153](../../backlog/tasks/lcli-153%20-%20LinkFinding.message-interpolates-raw-link-target-unescaped-into-terminal-rendered-text.md) | LinkFinding.message interpolates raw link target unescaped into terminal-rendered text | Done |
| [LCLI-154](../../backlog/tasks/lcli-154%20-%20cell-escapes-pipes-without-escaping-pre-existing-backslashes-first.md) | cell() escapes pipes without escaping pre-existing backslashes first | Done |
| [LCLI-155](../../backlog/tasks/lcli-155%20-%20upsertManagedBlocks-update-path-skips-the-post-splice-validation-the-insert-path-has.md) | upsertManagedBlock's update path skips the post-splice validation the insert path has | Done |
| [LCLI-156](../../backlog/tasks/lcli-156%20-%20Same-line-marker-pair-collapses-into-one-mdast-node-and-is-invisible-to-locateLabeledMarkers.md) | Same-line marker pair collapses into one mdast node and is invisible to locateLabeledMarkers | Done |
| [LCLI-157](../../backlog/tasks/lcli-157%20-%20PLACEHOLDER-regex-silently-passes-through-malformed-...-tokens-instead-of-flagging-them-unresolved.md) | PLACEHOLDER regex silently passes through malformed `{{...}}` tokens instead of flagging them unresolved | Done |
| [LCLI-158](../../backlog/tasks/lcli-158%20-%20Strip-ANSI-control-characters-from-query-text-output-for-id-type-and-query-text.md) | Strip ANSI/control characters from query text output for id, type, and query text | Done |
| [LCLI-159](../../backlog/tasks/lcli-159%20-%20h2Headings-counts-nested-headings-inside-blockquotes-list-items-as-top-level-sections.md) | h2Headings() counts nested headings (inside blockquotes/list items) as top-level sections | Done |
| [LCLI-160](../../backlog/tasks/lcli-160%20-%20Quote-safety-check-omits-leading-colon-%60-%60-from-INDICATOR_CHARS-despite-ADR-0007.md) | Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite ADR-0007 | Done |
| [LCLI-161](../../backlog/tasks/lcli-161%20-%20Resource-drift-finding-message-embeds-raw-frontmatter-value-unsanitized-in-CLI-output.md) | Resource-drift finding message embeds raw frontmatter value unsanitized in CLI output | Done |
| [LCLI-162](../../backlog/tasks/lcli-162%20-%20replace-validate-expanded-output-not-just-matched-span-against-managed-ranges.md) | replace: validate expanded output, not just matched span, against managed ranges | Done |
| [LCLI-163](../../backlog/tasks/lcli-163%20-%20replace-name-should-stay-literal-when-the-regex-has-no-named-groups-not-expand-to.md) | replace: `$<name>` should stay literal when the regex has no named groups, not expand to empty | Done |
| [LCLI-164](../../backlog/tasks/lcli-164%20-%20Fix-rewriteInbound-excluded-move-source-yields-rename-with-no-matching-write.md) | Fix rewriteInbound: excluded move source yields rename with no matching write | Done |
| [LCLI-165](../../backlog/tasks/lcli-165%20-%20Add-regression-test-for-rewriteInbounds-move-excluded-source-id-combination.md) | Add regression test for rewriteInbound's move + excluded-source-id combination | Done |
| [LCLI-166](../../backlog/tasks/lcli-166%20-%20buildObsidianScaffold-never-emits-the-.gitignore-entry-the-docs-promise.md) | buildObsidianScaffold never emits the .gitignore entry the docs promise | Done |
| [LCLI-167](../../backlog/tasks/lcli-167%20-%20validateFrontmatter-misclassifies-differently-cased-known-types-as-unknown.md) | validateFrontmatter misclassifies differently-cased known types as unknown | Done |
| [LCLI-168](../../backlog/tasks/lcli-168%20-%20okf_version-extra-key-warning-is-exempted-on-every-file-not-just-the-root-index.md) | okf_version extra-key warning is exempted on every file, not just the root index | Done |
| [LCLI-169](../../backlog/tasks/lcli-169%20-%20Harden-realGitAdapter.history-against-quoted-non-ASCII-paths-and-sentinel-collision.md) | Harden realGitAdapter.history against quoted non-ASCII paths and sentinel collision | Done |
| [LCLI-170](../../backlog/tasks/lcli-170%20-%20resolveHeadSha-cant-tell-an-unborn-branch-from-a-corrupted-but-present-.git.md) | resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git | Done |
| [LCLI-171](../../backlog/tasks/lcli-171%20-%20asText-can-return-runtime-undefined-for-Symbol-function-input-despite-its-string-type.md) | asText can return runtime undefined for Symbol/function input despite its string type | Done |
| [LCLI-172](../../backlog/tasks/lcli-172%20-%20WarningCollector.flush-writes-raw-multi-line-control-char-warnings-to-stderr-unnormalized.md) | WarningCollector.flush writes raw multi-line/control-char warnings to stderr unnormalized | Done |
| [LCLI-173](../../backlog/tasks/lcli-173%20-%20renderTaskSummaryRows-prints-raw-Backlog-id-status-title-with-no-line-normalization.md) | renderTaskSummaryRows prints raw Backlog id/status/title with no line normalization | Done |
| [LCLI-174](../../backlog/tasks/lcli-174%20-%20lore-new-default-title-slug-path-bypasses-reserved-index-log-stem-policy.md) | lore new default title-slug path bypasses reserved index/log stem policy | Done |
| [LCLI-176](../../backlog/tasks/lcli-176%20-%20docker-e2e-run-e2e.sh-AC4-assertion-is-stale-lore-check-IS-now-profile-bearing-since-LORE-89.md) | docker/e2e run-e2e.sh AC4 assertion is stale: lore check IS now profile-bearing since LCLI-89 | Done |
| [LCLI-177](../../backlog/tasks/lcli-177%20-%20lore-link-viewTask-consumers-do-not-verify-returned-id-matches-requested-id-sibling-of-LORE-122-125.md) | lore link viewTask consumers do not verify returned id matches requested id (sibling of LCLI-122/125) | Done |
| [LCLI-179](../../backlog/tasks/lcli-179%20-%20lore-unlink-rename-retry-after-failed-backlog-commit-silently-no-ops-on-the-leftover-dirty-file.md) | lore unlink/rename retry after failed backlog commit silently no-ops on the leftover dirty file | Done |
| [LCLI-180](../../backlog/tasks/lcli-180%20-%20rewrite.ts-newDestPathFor-ignores-leading-slash-link-targets-diverging-from-resolvePath-lore-rename-mis-derives-absolute-links.md) | rewrite.ts newDestPathFor ignores leading-slash link targets, diverging from resolvePath (lore rename mis-derives /-absolute links) | Done |
| [LCLI-183](../../backlog/tasks/lcli-183%20-%20Guard-moveBackRefs-viewTask-consumer-de-duplicate-the-id-mismatch-check-across-link.ts-tasks.ts-reconcile-shared.ts.md) | Guard moveBackRefs viewTask consumer + de-duplicate the id-mismatch check across link.ts/tasks.ts/reconcile-shared.ts | Done |
| [LCLI-184](../../backlog/tasks/lcli-184%20-%20resolveRef-path-first-precedence-lets-a-mirroring-directory-shadow-lores-own-canonical-bare-id-refs-rewrite-supersede-rename.md) | resolveRef path-first precedence lets a mirroring directory shadow lore's own canonical bare-id refs (rewrite/supersede/rename) | Done |
| [LCLI-186](../../backlog/tasks/lcli-186%20-%20linkText-in-indexes.ts-must-double-pre-existing-backslashes-before-inserting-bracket-escapes-parity-with-LORE-154s-cell.md) | linkText in indexes.ts must double pre-existing backslashes before inserting bracket escapes (parity with LCLI-154's cell()) | Done |
| [LCLI-190](../../backlog/tasks/lcli-190%20-%20check-sync-instructions-mis-state-the-validation-throw-cause-collapsed-same-line-marker-shape-omitted-wave-11-LORE-147-156-drift.md) | check/sync instructions mis-state the validation throw cause; collapsed same-line marker shape omitted (wave-11 LCLI-147/156 drift) | Done |
| [LCLI-192](../../backlog/tasks/lcli-192%20-%20loadBundle-profile-asymmetry-fresh-scaffold-under-a-custom-Reference-required-profile-still-fails-lore-graph-query-etc-sibling-of-LORE-144.md) | loadBundle profile asymmetry: fresh scaffold under a custom Reference-required profile still fails lore graph/query/etc (sibling of LCLI-144) | Done |
| [LCLI-193](../../backlog/tasks/lcli-193%20-%20parseItems-accepts-an-empty-items-enum-making-a-list-field-impossible-to-satisfy.md) | parseItems accepts an empty items enum = [], making a list field impossible to satisfy | Done |
| [LCLI-67](../../backlog/tasks/lcli-67%20-%20cli-surface.md-documents-behavior-that-does-not-exist-init-force-probe-exit-5-new-type-shorthands-check-fix-replace-exit-6-gate-plus-two-dead-validate-config-knobs.md) | cli-surface.md documents behavior that does not exist: init --force/probe/exit-5, new type shorthands, check --fix, replace exit-6 gate; plus two dead validate config knobs | Done |
| [LCLI-90](../../backlog/tasks/lcli-90%20-%20commitBacklogFiless-backlog-containment-guard-uses-POSIX-only-normalize-inconsistent-with-the-projects-win32-validation-convention.md) | commitBacklogFiles's backlog/ containment guard uses POSIX-only normalize, inconsistent with the project's win32 validation convention | Done |
| [LCLI-92](../../backlog/tasks/lcli-92%20-%20lore-scaffold-force-has-a-narrow-TOCTOU-window-between-the-symlink-guard-and-the-overwrite-write.md) | lore scaffold --force has a narrow TOCTOU window between the symlink guard and the overwrite write | Done |
| [LCLI-94](../../backlog/tasks/lcli-94%20-%20schema-export-no-regression-test-for-out-near-miss-boundaries-and-isManagedSchemasDir-doesnt-resolve-symlinks.md) | schema export: no regression test for --out near-miss boundaries, and isManagedSchemasDir doesn't resolve symlinks | Done |
| [LCLI-95](../../backlog/tasks/lcli-95%20-%20escapesRoot-assertConfinedToBundle-accepts-uncaught-edge-case-ids-Windows-drive-relative-paths-and-empty-self-cancelling-newId.md) | escapesRoot / assertConfinedToBundle accepts uncaught edge-case ids: Windows drive-relative paths and empty/self-cancelling newId | Done |
| [LCLI-175](../../backlog/tasks/lcli-175%20-%20readConfigText-denied-error-omits-errno-code-field-diverging-from-the-shared-denied-contract.md) | readConfigText denied error omits errno code field, diverging from the shared denied contract | Done |
| [LCLI-181](../../backlog/tasks/lcli-181%20-%20Export-a-single-shared-stripAnsiAndControls-sanitizer-and-de-duplicate-query.tss-local-copy.md) | Export a single shared stripAnsiAndControls sanitizer and de-duplicate query.ts's local copy | Done |
| [LCLI-182](../../backlog/tasks/lcli-182%20-%20schema-confineOutDir-retain-isAbsoluterel-guard-for-win32-cross-drive-out.md) | schema confineOutDir: retain isAbsolute(rel) guard for win32 cross-drive --out | Done |
| [LCLI-185](../../backlog/tasks/lcli-185%20-%20Consolidate-the-two-template-path-confinement-guards-profile.ts-vs-new.ts-and-fix-the-now-stale-readTemplateFile-comment.md) | Consolidate the two template-path confinement guards (profile.ts vs new.ts) and fix the now-stale readTemplateFile comment | Done |
| [LCLI-187](../../backlog/tasks/lcli-187%20-%20Refresh-two-stale-O_NOFOLLOW-comments-left-by-LORE-130-schema.ts-fswrite.ts-ioError-docstring.md) | Refresh two stale O_NOFOLLOW comments left by LCLI-130 (schema.ts + fswrite.ts ioError docstring) | Done |
| [LCLI-188](../../backlog/tasks/lcli-188%20-%20Quote-the-git-log-docs-root-pathspec-with-literal-in-realGitAdapter.history.md) | Quote the git-log docs-root pathspec with :(literal) in realGitAdapter.history | Done |
| [LCLI-189](../../backlog/tasks/lcli-189%20-%20Fix-stale-src-commands-sync.ts-module-doc-claiming-link-unlink-rename-do-not-self-commit.md) | Fix stale src/commands/sync.ts module doc claiming link/unlink/rename do not self-commit | Done |
| [LCLI-191](../../backlog/tasks/lcli-191%20-%20Discovery-advisories-are-lost-when-checkBundles-throws-in-the-scan-phase-post-LORE-138.md) | Discovery advisories are lost when checkBundles throws in the scan phase (post-LCLI-138) | Done |
| [LCLI-194](../../backlog/tasks/lcli-194%20-%20Document-pin-the-throw-on-duplicate-locator-contract-that-assertNoInjectedMarker-relies-on.md) | Document/pin the throw-on-duplicate locator contract that assertNoInjectedMarker relies on | Done |
| [LCLI-195](../../backlog/tasks/lcli-195%20-%20Restore-biome-lint-baseline-to-green-on-dev-bun-run-lint-3-errors-4-infos-all-pre-existing.md) | Restore biome lint baseline to green on dev (bun run lint: 3 errors + 4 infos, all pre-existing) | Done |
| [LCLI-196](../../backlog/tasks/lcli-196%20-%20Make-the-docker-e2e-CI-job-a-required-status-check-on-dev-main-human-repo-admin-action.md) | Make the docker-e2e CI job a required status check on dev/main (human repo-admin action) | Done |
| [LCLI-197](../../backlog/tasks/lcli-197%20-%20Discovery-advisories-from-an-earlier-bundle-root-are-lost-when-a-later-root-throws-inside-collectBundles-residual-of-LORE-191.md) | Discovery advisories from an earlier bundle root are lost when a later root throws inside collectBundles (residual of LCLI-191) | Done |
| [LCLI-198](../../backlog/tasks/lcli-198%20-%20Update-test-fixtures-README.md-backlog-json-section-to-match-the-upstream-recorder.md) | Update test/fixtures/README.md backlog-json section to match the upstream recorder | Done |
| [LCLI-199](../../backlog/tasks/lcli-199%20-%20Correct-checks-cli-surface-docs-it-does-not-surface-token-estimates.md) | Correct check's cli-surface docs: it does not surface token estimates | Done |
| [LCLI-200](../../backlog/tasks/lcli-200%20-%20Correct-GraphNode.title-JSDoc-to-reflect-frontmatterScalars-number-boolean-coercion.md) | Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean coercion | Done |
| [LCLI-201](../../backlog/tasks/lcli-201%20-%20Fix-the-%60validation%60-instructions-topics-overstated-colon-quote-safety-claim-and-add-a-regression-test.md) | Fix the `validation` instructions topic's overstated colon quote-safety claim and add a regression test | Done |
| [LCLI-202](../../backlog/tasks/lcli-202%20-%20Correct-order.ts-module-doc-rationale-default-Array.prototype.sort-is-code-unit-ordered-and-stable-not-locale-engine-dependent.md) | Correct order.ts module-doc rationale: default Array.prototype.sort is code-unit-ordered and stable, not locale/engine-dependent | Done |
| [LCLI-203](../../backlog/tasks/lcli-203%20-%20Clarify-%60lore-context%60-max-tokens-docs-omitting-it-applies-no-token-cap-bounded-only-by-depth.md) | Clarify `lore context` --max-tokens docs: omitting it applies no token cap (bounded only by --depth) | Done |
| [LCLI-204](../../backlog/tasks/lcli-204%20-%20release.yml-assert-the-compiled-binary-version-matches-package.json-exactly-not-just-non-empty-mirror-ci.yml.md) | release.yml: assert the compiled binary --version matches package.json exactly, not just non-empty (mirror ci.yml) | Done |
| [LCLI-205](../../backlog/tasks/lcli-205%20-%20Test-fakes-dirtyGitSpawn-failingCommitGitSpawn-dispatch-the-dirty-status-on-the-git-subcommand-not-on-call-index.md) | Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on the git subcommand, not on call index | Done |
| [LCLI-206](../../backlog/tasks/lcli-206%20-%20Make-scripted-git-spawn-test-fakes-dispatch-by-observed-command-not-call-index.md) | Make scripted git-spawn test fakes dispatch by observed command, not call index | Done |
| [LCLI-207](../../backlog/tasks/lcli-207%20-%20Release-the-response-body-in-checks-external-liveness-fetch.md) | Release the response body in check's --external liveness fetch | Done |
| [LCLI-208](../../backlog/tasks/lcli-208%20-%20Export-InstructionsData-and-drop-the-duplicated-test-side-declaration.md) | Export InstructionsData and drop the duplicated test-side declaration | Done |
| [LCLI-209](../../backlog/tasks/lcli-209%20-%20Correct-the-inaccurate-comment-and-strengthen-renames-never-constructs-a-Backlog-adapter-test.md) | Correct the inaccurate comment and strengthen rename's "never constructs a Backlog adapter" test | Done |
| [LCLI-210](../../backlog/tasks/lcli-210%20-%20Remove-indexes.tss-duplicate-encodePathSegments-import-the-canonical-encoder-from-links.ts-LORE-28-landed.md) | Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder from links.ts (LCLI-28 landed) | Done |
| [LCLI-211](../../backlog/tasks/lcli-211%20-%20Strengthen-the-tasks-drift-test-mix-a-dangling-id-with-a-failing-read-and-assert-empty-streams.md) | Strengthen the tasks drift test: mix a dangling id with a failing read and assert empty streams | Done |
| [LCLI-212](../../backlog/tasks/lcli-212%20-%20Strengthen-validates-realpath-de-dup-test-with-a-genuine-symlink-alias.md) | Strengthen validate's realpath de-dup test with a genuine symlink alias | Done |
| [LCLI-213](../../backlog/tasks/lcli-213%20-%20Guard-manifest-%60kind%60-against-drift-from-each-commands-emitted-%60kind-%60.md) | Guard manifest `kind` against drift from each command's emitted `kind:` | Done |
| [LCLI-214](../../backlog/tasks/lcli-214%20-%20Cover-edge-case-resource-bases-and-the-new-path-section-boundary-in-template.test.ts.md) | Cover edge-case resource bases (and the new-path section boundary) in template.test.ts | Done |
| [LCLI-215](../../backlog/tasks/lcli-215%20-%20Scope-replace.test.ts-temp-dir-hooks-to-the-command-suites-and-guard-their-cleanup.md) | Scope replace.test.ts temp-dir hooks to the command suites and guard their cleanup | Done |
| [LCLI-216](../../backlog/tasks/lcli-216%20-%20Replace-tautological-tasks-orphans-byte-identity-test-with-one-exercising-both-command-render-paths.md) | Replace tautological tasks/orphans byte-identity test with one exercising both command render paths | Done |
| [LCLI-217](../../backlog/tasks/lcli-217%20-%20Bound-the-real-backlog-subprocess-spawn-bunBacklogSpawn-with-a-timeout.md) | Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout | Done |
| [LCLI-218](../../backlog/tasks/lcli-218%20-%20Remove-the-lone-%60this%60-binding-in-the-backlog-adapters-searchByLabel.md) | Remove the lone `this` binding in the backlog adapter's searchByLabel | Done |
| [LCLI-219](../../backlog/tasks/lcli-219%20-%20Enforce-the-single-line-modeline-contract-in-serializeConceptWithModeline.md) | Enforce the single-line modeline contract in serializeConceptWithModeline | Done |
| [LCLI-220](../../backlog/tasks/lcli-220%20-%20Freeze-the-manifest-singletons-returned-by-buildManifest.md) | Freeze the manifest singletons returned by buildManifest() | Done |
| [LCLI-221](../../backlog/tasks/lcli-221%20-%20Align-id-status-columns-by-terminal-display-width-not-UTF-16-length.md) | Align id/status columns by terminal display width, not UTF-16 length | Done |
| [LCLI-222](../../backlog/tasks/lcli-222%20-%20Map-spawn-rejections-on-all-backlog-calls-not-just-the-probes-version-to-typed-LoreErrors.md) | Map spawn-rejections on all backlog calls (not just the probe's --version) to typed LoreErrors | Done |
| [LCLI-223](../../backlog/tasks/lcli-223%20-%20cli.ts-rejectStrayCommandFlags-rejectCommandArgs-re-scan-post-%60-%60-tokens-as-flags.md) | cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as flags | Done |
| [LCLI-224](../../backlog/tasks/lcli-224%20-%20state.ts-%60.trim%60-on-git-show-prefix-corrupts-a-whitespace-leading-bundle-prefix.md) | state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle prefix | Done |
| [LCLI-225](../../backlog/tasks/lcli-225%20-%20De-duplicate-checks-bundle-roots-by-canonical-filesystem-identity.md) | De-duplicate check's bundle roots by canonical filesystem identity | Done |
| [LCLI-226](../../backlog/tasks/lcli-226%20-%20Sanitize-control-characters-in-checks-finding-output.md) | Sanitize control characters in check's finding output | Done |
| [LCLI-227](../../backlog/tasks/lcli-227%20-%20new.ts-parse-arguments-before-loading-the-profile-so-a-malformed-profile.toml-cant-mask-a-usage-error.md) | new.ts: parse arguments before loading the profile so a malformed profile.toml can't mask a usage error | Done |
| [LCLI-228](../../backlog/tasks/lcli-228%20-%20replace.ts-validate.ts-reject-an-inline-value-on-boolean-flags-regex-dry-run-strict.md) | replace.ts / validate.ts: reject an inline =value on boolean flags (--regex, --dry-run, --strict) | Done |
| [LCLI-229](../../backlog/tasks/lcli-229%20-%20replace.ts-sanitize-discovered-file-paths-in-the-report-strip-ANSI-control-chars-to-prevent-output-forging.md) | replace.ts: sanitize discovered file paths in the report (strip ANSI/control chars) to prevent output forging | Done |
| [LCLI-230](../../backlog/tasks/lcli-230%20-%20existingIsRegularFile-masks-non-ENOENT-lstat-failures-as-a-benign-already-exists-skip.md) | existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already exists' skip | Done |
| [LCLI-231](../../backlog/tasks/lcli-231%20-%20writeFileAtomic-leaks-an-uncleaned-temp-file-when-writeFileSync-fails-mid-write.md) | writeFileAtomic leaks an uncleaned temp file when writeFileSync fails mid-write | Done |
| [LCLI-232](../../backlog/tasks/lcli-232%20-%20lore-query-type-status-tag-values-are-not-trimmed-inconsistent-with-field.md) | lore query --type/--status/--tag values are not trimmed, inconsistent with --field | Done |
| [LCLI-233](../../backlog/tasks/lcli-233%20-%20Bound-runLinks-up-front-viewTask-existence-check-fan-out-with-a-concurrency-limit.md) | Bound runLink's up-front viewTask existence-check fan-out with a concurrency limit | Done |
| [LCLI-234](../../backlog/tasks/lcli-234%20-%20runLinks-doc-membership-check-is-exact-case-while-unlinks-is-case-insensitive-%E2%80%94-a-casing-variant-documentation-entry-duplicates-instead-of-dedups.md) | runLink's doc-membership check is exact-case while unlink's is case-insensitive — a casing-variant documentation entry duplicates instead of dedups | Done |
| [LCLI-235](../../backlog/tasks/lcli-235%20-%20Bound-resolveRollups-viewTask-fan-out-with-the-shared-concurrency-cap.md) | Bound resolveRollup's viewTask fan-out with the shared concurrency cap | Done |
| [LCLI-236](../../backlog/tasks/lcli-236%20-%20Strip-ANSI-control-OSC-escapes-on-the-stderr-warning-path-WarningCollector.flush.md) | Strip ANSI/control/OSC escapes on the stderr warning path (WarningCollector.flush) | Done |
| [LCLI-237](../../backlog/tasks/lcli-237%20-%20Harden-%60validate%60-arg-parser-reject-%60-strict-value-%60-repeated-%60-strict%60-and-repeated-%60-type%60.md) | Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`, and repeated `--type` | Done |
| [LCLI-238](../../backlog/tasks/lcli-238%20-%20scaffold-differentiate-the-conflict-hint-for-structural-directory-blockers-force-cannot-replace-a-file-with-a-directory.md) | scaffold: differentiate the conflict hint for structural directory blockers (--force cannot replace a file with a directory) | Done |
| [LCLI-239](../../backlog/tasks/lcli-239%20-%20callout-portability-detector-false-positives-on-inline-formatting-before-type-in-ordinary-prose.md) | callout portability detector false-positives on inline formatting before [!type] in ordinary prose | Done |
| [LCLI-240](../../backlog/tasks/lcli-240%20-%20check-portability-lint-mis-parses-a-leading-indented-code-block-in-frontmatter-free-files.md) | check portability lint mis-parses a leading indented code block in frontmatter-free files | Done |
| [LCLI-241](../../backlog/tasks/lcli-241%20-%20parseJson-rewrites-a-valid-but-non-object-profile.json-into-a-misleading-is-not-valid-JSON-error.md) | parseJson rewrites a valid-but-non-object profile.json into a misleading 'is not valid JSON' error | Done |
| [LCLI-242](../../backlog/tasks/lcli-242%20-%20profile-does-not-validate-a-fields-%60default%60-against-its-declared-kind-enum.md) | profile does not validate a field's `default` against its declared kind/enum | Done |
| [LCLI-243](../../backlog/tasks/lcli-243%20-%20Harden-log.ts-resolveRoot-against-equivalent-but-differently-spelled-bundle-roots.md) | Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle roots | Done |
| [LCLI-244](../../backlog/tasks/lcli-244%20-%20index.md-conceptTitle-coerce-numeric-boolean-titles-via-frontmatterScalar-match-graph-query-context.md) | index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar (match graph/query/context) | Done |
| [LCLI-245](../../backlog/tasks/lcli-245%20-%20validateLink-flag-bare-.-..-navigation-destinations-instead-of-exempting-them-as-dotfiles.md) | validateLink: flag bare '.'/'..' navigation destinations instead of exempting them as dotfiles | Done |
| [LCLI-246](../../backlog/tasks/lcli-246%20-%20matchesField-resolve-case-insensitive-field-key-across-ALL-case-variant-spellings-not-just-the-first.md) | matchesField: resolve case-insensitive field key across ALL case-variant spellings, not just the first | Done |
| [LCLI-247](../../backlog/tasks/lcli-247%20-%20Preserve-above-repo-root-outbound-links-during-rename-instead-of-silently-clamp-retargeting-them.md) | Preserve above-repo-root outbound links during rename instead of silently clamp-retargeting them | Done |
| [LCLI-248](../../backlog/tasks/lcli-248%20-%20warnSummary-counts-UTF-16-code-units-but-reports-chars-%E2%80%94-non-BMP-summaries-warn-prematurely.md) | warnSummary counts UTF-16 code units but reports "chars" — non-BMP summaries warn prematurely | Done |
| [LCLI-249](../../backlog/tasks/lcli-249%20-%20Harden-stderrHint-strip-terminal-control-sequences-and-cap-length.md) | Harden stderrHint: strip terminal control sequences and cap length | Done |
| [LCLI-250](../../backlog/tasks/lcli-250%20-%20Suppress-ANSI-color-on-stderr-diagnostics-when-stderr-is-not-a-TTY.md) | Suppress ANSI color on stderr diagnostics when stderr is not a TTY | Done |
| [LCLI-178](../../backlog/tasks/lcli-178%20-%20Runbook-docker-e2e-testing-environment.md-doesnt-mention-the-harness-now-runs-as-a-CI-gate-post-LORE-100.md) | Runbook docker-e2e-testing-environment.md doesn't mention the harness now runs as a CI gate (post-LCLI-100) | Done |
<!-- lore:tasks:end -->

## Notes

The completed campaigns are summarized by the repository's Backlog campaign
documents. This Story provides lifecycle ownership only; task records remain
the detailed evidence source.

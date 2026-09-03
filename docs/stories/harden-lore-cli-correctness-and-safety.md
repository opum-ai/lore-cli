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
| LCLI-61 | docker/e2e never asserts failure output: add a step_fail helper and pin the stderr ErrorEnvelope + stdout-silence contract (incl. LCLI-58 induced partial failure) | Done |
| LCLI-62 | docker/e2e real-binary coupling gaps: missing-task signatures, present-but-incapable probe branch, linked-concept rename (F1) never exercised | Done |
| LCLI-63 | docker/e2e: reconciliation never value-asserted; custom status flows and the .lore/config.toml surface never run (defaults-only E2E) | Done |
| LCLI-64 | docker/e2e: declarative profile subsystem (LCLI-46) has zero E2E coverage beyond the default fallback | Done |
| LCLI-69 | commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal | Done |
| LCLI-70 | process.exit() after run() can truncate large piped --json output | Done |
| LCLI-71 | `lore check --external` is vulnerable to SSRF via unrestricted fetch() | Done |
| LCLI-72 | `lore new --template` allows path traversal to read arbitrary files | Done |
| LCLI-73 | lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap) | Done |
| LCLI-74 | lore orphans report has no output cap, contradicting the documented truncation contract | Done |
| LCLI-75 | lore schema export --out can irreversibly delete unrelated files outside its own directory | Done |
| LCLI-76 | lore scaffold --force writes follow symlinks, escaping the repo root | Done |
| LCLI-77 | lore init follows pre-existing symlinks at scaffold paths, escaping the repo root | Done |
| LCLI-78 | lore rename destination id is not validated for `..` traversal at the argument-parsing layer | Done |
| LCLI-79 | lore rename destination path is not confined to docs/ root at the command layer | Done |
| LCLI-80 | rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root | Done |
| LCLI-81 | lore rename index `<new>` (renaming FROM the reserved root index) is not rejected, corrupts docs/index.md | Done |
| LCLI-82 | loadBundle silently skips unreadable directories, letting rename/supersede commit against an incomplete graph | Done |
| LCLI-83 | profile.toml field/type declarations silently ignore unknown or misspelled attribute keys | Done |
| LCLI-84 | loadBundle never uses a project custom .lore/profile.toml | Done |
| LCLI-85 | Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor bomb) | Done |
| LCLI-86 | lore sync can silently delete hand-authored prose between duplicate or malformed managed-block markers | Done |
| LCLI-87 | rewriteInbound mis-locates reference-definition destinations when the label contains an escaped bracket | Done |
| LCLI-91 | lore new --template silently follows a symlink planted in .lore/templates/, reading outside the repo | Done |
| LCLI-93 | ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts follow symlinks, escaping docs/ to the real filesystem | Done |
| LCLI-65 | docker/e2e coupling mediums: field-isolated write read-backs, multi-doc SET semantics, backlog-side renames/archive, ADR-0012 commit scoping, nested checkout | Done |
| LCLI-66 | docker/e2e command-surface tail + housekeeping: vacuous replace/supersede steps, check --json/F2, flag coverage, misleading pseudo-cache step, weak assertions | Done |
| LCLI-68 | docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links after the LCLI-62 F1 rename sequence | Done |
| LCLI-88 | rewriteInbound (rename / supersede --rewrite-links) re-serializes and re-parses concepts against the built-in default profile, not the project's custom one | Done |
| LCLI-89 | lore check's own concept scan never forwards a project's custom .lore/profile.toml | Done |
| LCLI-96 | Validate/escape argv values passed to backlog CLI to prevent flag injection | Done |
| LCLI-97 | createTask discards the new task id when `Created task <ID>` fails to parse | Done |
| LCLI-98 | Pin third-party GitHub Actions to commit SHAs instead of mutable tags | Done |
| LCLI-99 | verify-versions job doesn't check os/cpu fields or binary filenames; only linux-x64 build is executed | Done |
| LCLI-100 | Docker e2e harness is never invoked by CI or release workflows | Done |
| LCLI-101 | Scoped release packages missing publishConfig.access:public, will fail first npm publish | Done |
| LCLI-102 | Harden e2e Dockerfile: digest-pin base image, avoid root curl\|bash, pin mkdocs | Done |
| LCLI-103 | Surface report-write failures and fixed-UID bind-mount permission risk in e2e run | Done |
| LCLI-104 | Documented `docker compose up --build` invocation doesn't propagate e2e exit code | Done |
| LCLI-105 | record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL format | Done |
| LCLI-106 | Golden recorder trusts a live mutable task and an unverified upstream CLI path | Done |
| LCLI-107 | `lore <command> --help` shows generic help instead of the command's own help | Done |
| LCLI-108 | readConfigText maps EACCES/EPERM config read failures to 'validation' not 'denied' | Done |
| LCLI-109 | commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit failure | Done |
| LCLI-110 | Cap probeLiveness's total URL count and wall-clock time, not just per-URL concurrency | Done |
| LCLI-111 | Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a concurrency limit | Done |
| LCLI-112 | check's JSON report doesn't mark itself incomplete when reconciliation errors mid-run | Done |
| LCLI-113 | docPath uses raw bundle.label while isDocsRoot normalizes it, so the two disagree on non-canonical labels | Done |
| LCLI-114 | lore new --out bypasses reserved index/log stem policy | Done |
| LCLI-115 | orphans table rows skip control-character sanitization on task fields | Done |
| LCLI-116 | lore replace commit phase has no atomic write or rollback on partial failure | Done |
| LCLI-117 | writeFileAtomic drops destination's file mode/ownership on overwrite | Done |
| LCLI-118 | query renderText interpolates unsanitized hit id/type/snippet and query text into terminal output | Done |
| LCLI-119 | sync overwrites a status-changed doc using stale in-memory frontmatter, discarding concurrent on-disk edits | Done |
| LCLI-120 | sync's multi-file write loop has no cross-file rollback on mid-loop failure | Done |
| LCLI-121 | lore link retry after failed backlog commit silently no-ops instead of recommitting | Done |
| LCLI-122 | resolveTaskDetails doesn't verify viewTask's returned id matches the requested id | Done |
| LCLI-123 | schema export follows a symlink planted at a schema file's leaf path | Done |
| LCLI-124 | Absolute --out inside the repo crashes schema export with an unhandled ENOENT | Done |
| LCLI-125 | resolveRollup doesn't verify viewTask's returned id matches the requested id | Done |
| LCLI-126 | Collapse embedded newlines in graph node id/title before rendering | Done |
| LCLI-127 | `lore <command> --help` shows top-level help instead of the command's own help | Done |
| LCLI-128 | CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every managed-block sync | Done |
| LCLI-129 | `lore agents --check --force` mislabels a stale hand-edited SKILL.md and prints a remedy that won't fix it | Done |
| LCLI-130 | writeAllOrRollback's --force overwrite is not crash-safe against a mid-write kill | Done |
| LCLI-131 | Add regression test asserting `lore <command> --help` matches `lore help <command>` | Done |
| LCLI-132 | Close TOCTOU window in rename between target-free check and file move | Done |
| LCLI-133 | resolvePath does not special-case a leading-slash link target | Done |
| LCLI-134 | resolveRef tries frontmatter ref as a root id before trying it as a relative path | Done |
| LCLI-135 | Anchor-link check lower-cases fragments, masking case-mismatched broken anchors | Done |
| LCLI-136 | Heading slug computation ignores image alt text in headings | Done |
| LCLI-137 | reconcileDriftFindings ignores its own newStatus:null contract for managed-block drift | Done |
| LCLI-138 | bodyText's catch-all swallows any gray-matter exception, not just YAML parse errors | Done |
| LCLI-139 | Profile-declared type `template` path allows reading files outside .lore/templates/ via traversal | Done |
| LCLI-140 | parseFieldSpec accepts an empty `enum = []`, making the field impossible to satisfy | Done |
| LCLI-141 | Malformed closing frontmatter fence bleeds bytes into concept body | Done |
| LCLI-142 | Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts | Done |
| LCLI-143 | Scope `git log` in GitAdapter.history to the docs root instead of the whole repo | Done |
| LCLI-144 | serializeStructuralConcept's fixed default-profile write breaks `lore validate` under a custom Reference profile | Done |
| LCLI-145 | Fix DOT quote() to not double-escape backslashes; escape newlines | Done |
| LCLI-146 | Fix `linking` instructions: link/unlink now commit backlog/tasks themselves | Done |
| LCLI-147 | Fix `check` instructions: expandRoot/reconciliation throws besides usage/not_found | Done |
| LCLI-148 | context export tokenEstimate ignores title field and JSON overhead | Done |
| LCLI-149 | linkText re-escapes already-escaped brackets, enabling injected markdown links | Done |
| LCLI-150 | generateIndexes never detects or removes an orphaned sub-index directory | Done |
| LCLI-151 | decodeTarget whole-path decode lets %2F forge a structural slash in link targets | Done |
| LCLI-152 | Dotted extensionless links (e.g. orders.v2) skip both portability lint and broken-link check | Done |
| LCLI-153 | LinkFinding.message interpolates raw link target unescaped into terminal-rendered text | Done |
| LCLI-154 | cell() escapes pipes without escaping pre-existing backslashes first | Done |
| LCLI-155 | upsertManagedBlock's update path skips the post-splice validation the insert path has | Done |
| LCLI-156 | Same-line marker pair collapses into one mdast node and is invisible to locateLabeledMarkers | Done |
| LCLI-157 | PLACEHOLDER regex silently passes through malformed `{{...}}` tokens instead of flagging them unresolved | Done |
| LCLI-158 | Strip ANSI/control characters from query text output for id, type, and query text | Done |
| LCLI-159 | h2Headings() counts nested headings (inside blockquotes/list items) as top-level sections | Done |
| LCLI-160 | Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite ADR-0007 | Done |
| LCLI-161 | Resource-drift finding message embeds raw frontmatter value unsanitized in CLI output | Done |
| LCLI-162 | replace: validate expanded output, not just matched span, against managed ranges | Done |
| LCLI-163 | replace: `$<name>` should stay literal when the regex has no named groups, not expand to empty | Done |
| LCLI-164 | Fix rewriteInbound: excluded move source yields rename with no matching write | Done |
| LCLI-165 | Add regression test for rewriteInbound's move + excluded-source-id combination | Done |
| LCLI-166 | buildObsidianScaffold never emits the .gitignore entry the docs promise | Done |
| LCLI-167 | validateFrontmatter misclassifies differently-cased known types as unknown | Done |
| LCLI-168 | okf_version extra-key warning is exempted on every file, not just the root index | Done |
| LCLI-169 | Harden realGitAdapter.history against quoted non-ASCII paths and sentinel collision | Done |
| LCLI-170 | resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git | Done |
| LCLI-171 | asText can return runtime undefined for Symbol/function input despite its string type | Done |
| LCLI-172 | WarningCollector.flush writes raw multi-line/control-char warnings to stderr unnormalized | Done |
| LCLI-173 | renderTaskSummaryRows prints raw Backlog id/status/title with no line normalization | Done |
| LCLI-174 | lore new default title-slug path bypasses reserved index/log stem policy | Done |
| LCLI-176 | docker/e2e run-e2e.sh AC4 assertion is stale: lore check IS now profile-bearing since LCLI-89 | Done |
| LCLI-177 | lore link viewTask consumers do not verify returned id matches requested id (sibling of LCLI-122/125) | Done |
| LCLI-179 | lore unlink/rename retry after failed backlog commit silently no-ops on the leftover dirty file | Done |
| LCLI-180 | rewrite.ts newDestPathFor ignores leading-slash link targets, diverging from resolvePath (lore rename mis-derives /-absolute links) | Done |
| LCLI-183 | Guard moveBackRefs viewTask consumer + de-duplicate the id-mismatch check across link.ts/tasks.ts/reconcile-shared.ts | Done |
| LCLI-184 | resolveRef path-first precedence lets a mirroring directory shadow lore's own canonical bare-id refs (rewrite/supersede/rename) | Done |
| LCLI-186 | linkText in indexes.ts must double pre-existing backslashes before inserting bracket escapes (parity with LCLI-154's cell()) | Done |
| LCLI-190 | check/sync instructions mis-state the validation throw cause; collapsed same-line marker shape omitted (wave-11 LCLI-147/156 drift) | Done |
| LCLI-192 | loadBundle profile asymmetry: fresh scaffold under a custom Reference-required profile still fails lore graph/query/etc (sibling of LCLI-144) | Done |
| LCLI-193 | parseItems accepts an empty items enum = [], making a list field impossible to satisfy | Done |
| LCLI-67 | cli-surface.md documents behavior that does not exist: init --force/probe/exit-5, new type shorthands, check --fix, replace exit-6 gate; plus two dead validate config knobs | Done |
| LCLI-90 | commitBacklogFiles's backlog/ containment guard uses POSIX-only normalize, inconsistent with the project's win32 validation convention | Done |
| LCLI-92 | lore scaffold --force has a narrow TOCTOU window between the symlink guard and the overwrite write | Done |
| LCLI-94 | schema export: no regression test for --out near-miss boundaries, and isManagedSchemasDir doesn't resolve symlinks | Done |
| LCLI-95 | escapesRoot / assertConfinedToBundle accepts uncaught edge-case ids: Windows drive-relative paths and empty/self-cancelling newId | Done |
| LCLI-175 | readConfigText denied error omits errno code field, diverging from the shared denied contract | Done |
| LCLI-181 | Export a single shared stripAnsiAndControls sanitizer and de-duplicate query.ts's local copy | Done |
| LCLI-182 | schema confineOutDir: retain isAbsolute(rel) guard for win32 cross-drive --out | Done |
| LCLI-185 | Consolidate the two template-path confinement guards (profile.ts vs new.ts) and fix the now-stale readTemplateFile comment | Done |
| LCLI-187 | Refresh two stale O_NOFOLLOW comments left by LCLI-130 (schema.ts + fswrite.ts ioError docstring) | Done |
| LCLI-188 | Quote the git-log docs-root pathspec with :(literal) in realGitAdapter.history | Done |
| LCLI-189 | Fix stale src/commands/sync.ts module doc claiming link/unlink/rename do not self-commit | Done |
| LCLI-191 | Discovery advisories are lost when checkBundles throws in the scan phase (post-LCLI-138) | Done |
| LCLI-194 | Document/pin the throw-on-duplicate locator contract that assertNoInjectedMarker relies on | Done |
| LCLI-195 | Restore biome lint baseline to green on dev (bun run lint: 3 errors + 4 infos, all pre-existing) | Done |
| LCLI-196 | Make the docker-e2e CI job a required status check on dev/main (human repo-admin action) | Done |
| LCLI-197 | Discovery advisories from an earlier bundle root are lost when a later root throws inside collectBundles (residual of LCLI-191) | Done |
| LCLI-198 | Update test/fixtures/README.md backlog-json section to match the upstream recorder | Done |
| LCLI-199 | Correct check's cli-surface docs: it does not surface token estimates | Done |
| LCLI-200 | Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean coercion | Done |
| LCLI-201 | Fix the `validation` instructions topic's overstated colon quote-safety claim and add a regression test | Done |
| LCLI-202 | Correct order.ts module-doc rationale: default Array.prototype.sort is code-unit-ordered and stable, not locale/engine-dependent | Done |
| LCLI-203 | Clarify `lore context` --max-tokens docs: omitting it applies no token cap (bounded only by --depth) | Done |
| LCLI-204 | release.yml: assert the compiled binary --version matches package.json exactly, not just non-empty (mirror ci.yml) | Done |
| LCLI-205 | Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on the git subcommand, not on call index | Done |
| LCLI-206 | Make scripted git-spawn test fakes dispatch by observed command, not call index | Done |
| LCLI-207 | Release the response body in check's --external liveness fetch | Done |
| LCLI-208 | Export InstructionsData and drop the duplicated test-side declaration | Done |
| LCLI-209 | Correct the inaccurate comment and strengthen rename's "never constructs a Backlog adapter" test | Done |
| LCLI-210 | Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder from links.ts (LCLI-28 landed) | Done |
| LCLI-211 | Strengthen the tasks drift test: mix a dangling id with a failing read and assert empty streams | Done |
| LCLI-212 | Strengthen validate's realpath de-dup test with a genuine symlink alias | Done |
| LCLI-213 | Guard manifest `kind` against drift from each command's emitted `kind:` | Done |
| LCLI-214 | Cover edge-case resource bases (and the new-path section boundary) in template.test.ts | Done |
| LCLI-215 | Scope replace.test.ts temp-dir hooks to the command suites and guard their cleanup | Done |
| LCLI-216 | Replace tautological tasks/orphans byte-identity test with one exercising both command render paths | Done |
| LCLI-217 | Bound the real backlog subprocess spawn (bunBacklogSpawn) with a timeout | Done |
| LCLI-218 | Remove the lone `this` binding in the backlog adapter's searchByLabel | Done |
| LCLI-219 | Enforce the single-line modeline contract in serializeConceptWithModeline | Done |
| LCLI-220 | Freeze the manifest singletons returned by buildManifest() | Done |
| LCLI-221 | Align id/status columns by terminal display width, not UTF-16 length | Done |
| LCLI-222 | Map spawn-rejections on all backlog calls (not just the probe's --version) to typed LoreErrors | Done |
| LCLI-223 | cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as flags | Done |
| LCLI-224 | state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle prefix | Done |
| LCLI-225 | De-duplicate check's bundle roots by canonical filesystem identity | Done |
| LCLI-226 | Sanitize control characters in check's finding output | Done |
| LCLI-227 | new.ts: parse arguments before loading the profile so a malformed profile.toml can't mask a usage error | Done |
| LCLI-228 | replace.ts / validate.ts: reject an inline =value on boolean flags (--regex, --dry-run, --strict) | Done |
| LCLI-229 | replace.ts: sanitize discovered file paths in the report (strip ANSI/control chars) to prevent output forging | Done |
| LCLI-230 | existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already exists' skip | Done |
| LCLI-231 | writeFileAtomic leaks an uncleaned temp file when writeFileSync fails mid-write | Done |
| LCLI-232 | lore query --type/--status/--tag values are not trimmed, inconsistent with --field | Done |
| LCLI-233 | Bound runLink's up-front viewTask existence-check fan-out with a concurrency limit | Done |
| LCLI-234 | runLink's doc-membership check is exact-case while unlink's is case-insensitive — a casing-variant documentation entry duplicates instead of dedups | Done |
| LCLI-235 | Bound resolveRollup's viewTask fan-out with the shared concurrency cap | Done |
| LCLI-236 | Strip ANSI/control/OSC escapes on the stderr warning path (WarningCollector.flush) | Done |
| LCLI-237 | Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`, and repeated `--type` | Done |
| LCLI-238 | scaffold: differentiate the conflict hint for structural directory blockers (--force cannot replace a file with a directory) | Done |
| LCLI-239 | callout portability detector false-positives on inline formatting before [!type] in ordinary prose | Done |
| LCLI-240 | check portability lint mis-parses a leading indented code block in frontmatter-free files | Done |
| LCLI-241 | parseJson rewrites a valid-but-non-object profile.json into a misleading 'is not valid JSON' error | Done |
| LCLI-242 | profile does not validate a field's `default` against its declared kind/enum | Done |
| LCLI-243 | Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle roots | Done |
| LCLI-244 | index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar (match graph/query/context) | Done |
| LCLI-245 | validateLink: flag bare '.'/'..' navigation destinations instead of exempting them as dotfiles | Done |
| LCLI-246 | matchesField: resolve case-insensitive field key across ALL case-variant spellings, not just the first | Done |
| LCLI-247 | Preserve above-repo-root outbound links during rename instead of silently clamp-retargeting them | Done |
| LCLI-248 | warnSummary counts UTF-16 code units but reports "chars" — non-BMP summaries warn prematurely | Done |
| LCLI-249 | Harden stderrHint: strip terminal control sequences and cap length | Done |
| LCLI-250 | Suppress ANSI color on stderr diagnostics when stderr is not a TTY | Done |
| LCLI-178 | Runbook docker-e2e-testing-environment.md doesn't mention the harness now runs as a CI gate (post-LCLI-100) | Done |
<!-- lore:tasks:end -->

## Notes

The completed campaigns are summarized by the repository's Backlog campaign
documents. This Story provides lifecycle ownership only; task records remain
the detailed evidence source.

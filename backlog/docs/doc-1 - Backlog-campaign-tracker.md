---
id: doc-1
title: Backlog campaign tracker
type: other
created_date: '2026-07-19 23:15'
updated_date: '2026-07-21 12:45'
---
# Backlog campaign tracker

One issue per session. Protocol: restore → take the cursor issue → feature-branch
lifecycle → advance cursor → append session log → write handover.

## Cursor

**Next issue: LORE-77** — queue order confirmed by the user on 2026-07-21
("Use this order (Recommended)": independent fixes first, the interrelated
rename-destination-traversal cluster (LORE-80→79→78→81) last, since LORE-80's
shared-engine containment fix is what the other three build on). Do not re-ask
before taking the next item.

**Merge gate: self-merge (skill default)** — this queue runs under the
standard `backlog-handover` skill (`.claude/skills/backlog-handover/`), whose
own convention is no separate PR-approval gate: the lifecycle's step-6 review
(self or adversarial subagent) is the review; the PR that follows is an audit
trail, merged immediately (`gh pr merge --rebase --delete-branch`). Consistent
with the self-merge default the user confirmed for this repo on 2026-07-19.
CI runs post-merge on dev.

## Queue (confirmed order)

| # | Issue | Type | One-line note |
| --- | --- | --- | --- |
| 1 | LORE-77 | bug | lore init follows pre-existing symlinks at scaffold paths, escaping the repo root |
| 2 | LORE-73 | bug | lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap) |
| 3 | LORE-74 | bug | lore orphans report has no output cap, contradicting the documented truncation contract |
| 4 | LORE-75 | bug | lore schema export --out can irreversibly delete unrelated files outside its own directory |
| 5 | LORE-80 | bug | rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root |
| 6 | LORE-79 | bug | lore rename destination path is not confined to docs/ root at the command layer |
| 7 | LORE-78 | bug | lore rename destination id is not validated for `..` traversal at the argument-parsing layer |
| 8 | LORE-81 | bug | lore rename index <new> (renaming FROM the reserved root index) is not rejected |

## Resolved

| # | Issue | Status/date/session | Evidence summary |
| --- | --- | --- | --- |
| 1 | LORE-67 | Done, 2026-07-19, session 1 | cli-surface.md init/new/check/replace sections corrected to match src/commands/{init,new,check,replace}.ts (dropped --force/exit-5/probe, --epic/--story/--resource, --fix, the fabricated replace exit-6 gate; also fixed 2 more false init claims found during re-verification and an example line using a removed flag). AC5: ADR-0013's dead `[validate]` config knobs (src/config.ts:65-70) corrected from a false "consumed by the drift gate" claim to "parsed but not wired to any command." Verified: `lore check --plain` → 38 files/0 errors/0 warnings; `bun test` → 1500 pass/0 fail. |
| 2 | LORE-61 | Done, 2026-07-19, session 2 | Added `step_fail` (exit code + empty stdout + jq filter over the LAST line of stderr) to docker/e2e/run-e2e.sh; wired into the five exit-class spot checks (error_type literals) and a new LORE-58 induced write-failure pair (link + unlink) proving validation and drift genuinely share exit 6 but distinct error_type. Two real findings surfaced by running the real binary (not doc-assumed): stderr can carry `warning: ...` advisory lines ahead of the JSON envelope (loadBundle scans); `lore validate`/`check` are gates that report findings as stdout data, never a thrown ErrorEnvelope (the filing task's own exit-6 assumption was wrong — fixed by adding a genuinely-thrown validation case via a malformed `.lore/config.toml` fed through `lore sync`). Independent adversarial review: no blocking findings, one nice-to-have applied (exact vs prefix match on the induced-failure task's file lookup). Verified: `docker compose -f docker/e2e/docker-compose.yml up --build` green twice (88 passed/0 failed, exit 0; `down -v` clean both times); `bun test` 1500 pass/0 fail. |
| 3 | LORE-62 | Done, 2026-07-20, session 3 | Extended docker/e2e/run-e2e.sh with three real-binary phases: (1) probeBacklog's present-but-incapable exit-6 branch via two PATH-shadowed stub `backlog` binaries (below-floor version; version-capable but non-JSON); (2) raw missing-task signatures (`task view`/`task edit` of a nonexistent id) plus their lore-level consequences — link fail-before-write, and a genuine sync-vs-check asymmetry: a vanished linked task drives `sync` fail-loud with EMPTY stdout but `check` ALSO exits 3 while still emitting its check.report to stdout first (confirmed against src/commands/check.ts and test/check.test.ts's own regression test) — plus `tasks`'s soft-drop; (3) renaming the linked Story (not just the unlinked Reference doc) to exercise moveBackRefs, the per-write backlog commit, and the F1 exit-6-by-return asymmetry (rename.ts:203) under an induced back-ref failure. First harness run surfaced 4 bugs in the new shell assertions themselves (a jq filter broken by an embedded literal backslash-newline, a wrong stderr-emptiness assumption, a wrong bundle directory name, an uppercase/lowercase task-id mismatch) — fixed and reverified green. Independent adversarial review then found one more real issue: the F1 jq filter's `and`-with-generator construction only checked jq's LAST array element (passed today only by coincidence) — fixed to `any(...)`. Verified: three full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, final 108 passed/0 failed, exit 0, `down -v` clean every time; `bun test` 1500 pass/0 fail throughout (no src/ changes this task). |
| 4 | LORE-63 | Done, 2026-07-20, session 4 | Closed 4 reconciliation coverage gaps in docker/e2e/run-e2e.sh: (1) Phase 6's first post-mutation sync now asserts filesChanged >= 1, and the rendered managed-block rows are value-asserted against concrete status literals (TASK1→"In Progress", TASK2→"Done"); (2) Phase 9 now also induces managed-block BODY drift (a corrupted rendered status cell, distinct from the pre-existing frontmatter-status sed), caught by check (exit 6) and healed by sync; (3) new Phase 15c: a custom, non-default 4-status flow ("Review" inserted between "In Progress"/"Done") written directly to backlog/config.yml — confirmed against the real local backlog v1.48.0 binary that `backlog config set statuses ...` refuses, there is no CLI setter — reconciles end-to-end on a freshly-created, singly-linked Story (isolated so the rollup is driven purely by one task), and a malformed statuses: shape fails loud (exit 6, validation) via parseStatusFlow; (4) the same isolated Story exercises .lore/config.toml's [reconcile.overrides]: an override to a status DIFFERENT from what flow position would produce proves the override is actually honored (not coincidence), and an invalid override target fails loud (exit 6, validation) via core/reconcile.ts's own check. Independent adversarial review found and fixed 2 real issues before the final run: unanchored substring greps for the new status-value checks (also matched the frontmatter tasks: line; could prefix-collide past 9 tasks) — fixed to anchor on the row's literal "[TASK-n]" link-text bracket; and a dormant status drift left on the probe Story after the override test — fixed by re-heal-syncing it and restoring backlog/config.yml at the end of the phase. Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs (125/0 failed, then 127/0 failed after the review fixes), `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |
| 5 | LORE-64 | Done, 2026-07-20, session 5 | Added Phase 17b to docker/e2e/run-e2e.sh exercising the declarative profile subsystem's populated-profile path: a custom type + custom .lore/templates/ file (AC1: lore new succeeds, body from the custom template not the generic fallback); a profile-declared required field failing then passing lore validate on a hand-authored doc, since `lore new` can never populate a custom frontmatter field itself (AC2); lore schema export emitting the custom-slug schema with the field in its `required` list, confirmed empirically by compiling a real profile (AC3); a malformed profile (zero [[types]], profile.ts's own documented fail-loud case) making lore new/validate/sync fail loud at exit 6 while lore check — confirmed via source to never call loadProfile — stays byte-identical before/after (AC4, rewritten from a naive "exit 0" assumption after a real run disproved it, see below). Discovered a genuine, real interaction: a full `lore schema export` PRUNES any schema whose type the active profile no longer declares, so introducing then removing the custom profile pruned Phase 17's six default schemas — fixed by re-exporting once more after removing the custom profile, regenerating the six defaults and pruning the orphaned custom one. A first harness run also surfaced a real but UNRELATED pre-existing bug: `lore check` already reports 2 broken-link findings in stories/e2e-renamed-story-f1.md (backlog/tasks/ dash-vs-space filename mismatch) left over from the Phase 15b rename/F1 sequence, never re-checked by any later phase — filed separately as LORE-68 (kept unqueued per user confirmation, out of this task's scope), and AC4's check-invariance test rewritten to diff `lore check --json` output before/after the malformed profile rather than assume a clean baseline. Independent adversarial review found no genuine defects (one harmless dead-variable assignment fixed). Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, both 148 passed/0 failed, exit 0, `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |
| 6 | LORE-65 | Done, 2026-07-20, session 6 | Added four phases to docker/e2e/run-e2e.sh: Phase 4b (AC1) field-isolated real-record read-backs of the doc: label and --doc path (checked separately, not via lore's self-reported status) plus a multi-doc SET/REPLACE case (one task linked from two Stories) pinning preserve-the-other-doc semantics on both link and unlink; Phase 4c (AC2) documents that a `--title` edit does NOT rename the task file (the filing task's premise was wrong — verified against the pinned fork's own file-system/operations.ts saveTask, whose shouldPreservePath branch reuses the existing filePath on edit), then exercises the REAL file-move operation (`task archive`, a genuine rename() to backlog/archive/tasks/) on a linked task, pinning that it mirrors LORE-62's already-established vanished-task signature (sync not_found/exit 3/empty stdout; check exits 3 but emits its report first; tasks soft-drops it); Phase 4d (AC3) inspects a lore-authored commit's file list directly (backlog/ only), proves a pre-staged unrelated file survives a scoped commit unswept, and proves the :(literal) pathspec guard handles a backlog/ filename manually renamed to carry glob metacharacters byte-for-byte (the filing task's "metachar-titled task" technique was also disproven — Backlog's own sanitizeFilename strips ()[] entirely and turns * into a hyphen, so no CLI-driven title can ever produce such a filename); Phase 24b (AC4) builds a wholly separate nested-checkout fixture (an outer git repo with the lore+backlog project one directory down) exercising porcelainPaths' --show-prefix translation via both `lore link`'s per-write commit and `lore sync`'s catch-all sweep, previously dead in every other phase. Two new campaign conventions recorded (see below). Independent adversarial review found no functional test-logic defects (one misleading comment fixed). Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, both 200 passed/0 failed, exit 0, `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |
| 7 | LORE-66 | Done, 2026-07-20, session 7 | Closed the docker/e2e command-surface tail audit across all 6 ACs (fixed vacuous replace/supersede steps, pinned check --json's F2 dual-stream + --external + multi-root, added the full flag/lifecycle long-tail across nearly every lore subcommand, housekeeping). Three research forks launched for pre-implementation source verification went beyond their read-only directive and wrote ~320 lines of test code directly into run-e2e.sh; caught via git status, the two still-running ones stopped via TaskStop, and every line the forks wrote was independently re-verified against current source with the same rigor as self-authored code (most held up; retargeted the replace fix at index.md's real managed lore:index block, since core/replace.ts only protects that region, not lore:tasks as the forks assumed). Three full real-binary docker/e2e harness runs: the first two surfaced and fixed 3 genuine bugs in the NEW test code itself (lore --version wrongly assumed non-"0.0.0" when lore has no release yet; a hyphenated "zero hits" query phrase tokenized into common English words scoring >0 elsewhere; an unlink --allow-missing assertion didn't know link.ts's own documented ADR-0009 §2 tradeoff that a task's last documentation entry deliberately lingers since Backlog's CLI can't clear --doc via an empty value); an independent adversarial subagent review then found the query --tag/--status filter tests lacked negative controls (would pass even if the filter were a silent no-op) — fixed and reverified. Final: 295 passed/0 failed, exit 0, down -v clean; bun test 1500/1500 throughout (no src/ changes). PR #63, rebase-merged into dev. |
| 8 | LORE-68 | Done, 2026-07-20, session 8 | Root cause confirmed (NOT the filing task's dash-vs-space hypothesis, which was wrong): src/core/rewrite.ts's `newDestPathFor` recomputed a moved concept's outbound links in the BUNDLE-relative coordinate space instead of the REPO-relative space `normalizeLink` requires — the two coincide for a link staying inside `docs/` but silently truncate one `../` segment for a link escaping the bundle root (a Story's managed task block linking `backlog/tasks/…`). First src/ change of the whole E2E-coverage sub-campaign (LORE-61-67 were harness-only). Reproduced headlessly (no docker): a scratch lore+backlog project against the pinned MrLesk/Backlog.md `--json` binary (commit 22a091b, PR #790) showed a same-directory rename truncating `../../backlog/tasks/x.md` → `../backlog/tasks/x.md`; confirmed general with a depth-changing-move repro too. Fix: prefix `DOCS_DIR` onto the `normalizeLink` operands in both `isMoved` sub-cases. Added 2 unit tests in test/rename.test.ts, confirmed (via `git stash`) to fail without the fix and pass with it; full `bun test` 1502/1502; `tsc --noEmit` clean. Added the permanent full-unscoped `lore check` regression guard (Phase 17a, AC3) right after Phase 17; its first real run exposed an adjacent, separate gap — Phase 15c's cleanup restored `backlog/config.yml`'s status flow but left TASK6 on the now-unrecognized "Review" status, so the first full check to touch that Story threw a validation ErrorEnvelope — fixed by resetting TASK6's status and re-syncing at the end of Phase 15c. Verified: real `docker compose -f docker/e2e/docker-compose.yml up --build` → 299 passed/0 failed, exit 0, `down -v` clean (up from 295/0 pre-fix, 4 new steps added). |
| 9 | LORE-70 | Done, 2026-07-21, session 9 | Root cause: `cli.ts`'s `import.meta.main` block called `process.exit(code)` immediately after `run()` resolved; `emit()`/`reportError()` writes to `process.stdout`/`stderr` are async for a piped destination, so `process.exit()` could tear the process down before the write's underlying syscall completed — a large `--json` payload silently truncated at the pipe's internal buffer size with exit code 0. Fix: replaced both `process.exit(code)` and `process.exit(EXIT_UNCAUGHT)` with `process.exitCode = <code>` (no forced exit), letting the runtime drain pending I/O naturally; verified this carries no hang risk (the CLI's own async paths — `check --external`'s `fetch()`, the backlog adapter's `Bun.spawn` — already fully await before `run()` resolves). Added `test/cli-exit-flush.test.ts`, spawning the real `cli.ts` entrypoint through `sh -c "... | cat"` (a downstream-process pipe — Bun.spawnSync's own direct `stdout: "pipe"` capture reads too eagerly to reproduce the race) across `query`/`graph`/`context --json` with output sized 300KB-650KB. Confirmed via `git stash`: pre-fix, all three truncated to exactly 65536 bytes with invalid JSON and exit 0; post-fix, all three produced full valid JSON. Full `bun test` → 1505 pass/0 fail (up from 1500); `bun run typecheck` clean; `bun run lint` — 4 pre-existing infos in unrelated files, none in the changed files. |
| 10 | LORE-86 | Done, 2026-07-21, session 10 | Root cause: `src/core/indexes.ts`'s `locateManagedBlock` (a plain `indexOf`/`lastIndexOf` scan shared by index regeneration, `lore replace`, and `lore rename`) collapsed a duplicated marker pair to its first-begin→last-end span, silently deleting any hand-authored prose sitting between the two blocks — exactly the LORE-86 repro (a merge conflict/hand edit leaving duplicate `lore:index` markers). It also silently extended an unmatched begin (no end marker) to end-of-file. Fix: rewrote it to fail loud instead of guessing — 0 begins still returns `null` (unmanaged file, unchanged); >1 begins or >1 ends throws `LoreError('validation', ...)` naming the exact counts (duplicated); a single begin with 0 ends, or an end preceding the begin, throws too (unmatched/crossed). Mirrors `managed-block.ts`'s existing `findMarkers()` fail-loud pattern for the sibling `lore:tasks` block, so both managed-block engines refuse to guess in the same voice. Traced all 3 call sites (indexes.ts, replace.ts's `managedRanges`, rename.ts's `spliceEmptyListing`) to confirm no swallowing and no partial-write risk (writes only happen after the whole regenerate/rewrite step returns cleanly). Updated 4 existing tests that had pinned the old silent-collapse/truncate-to-EOF behavior as a feature; added a dedicated `locateManagedBlock` contract test plus AC2's exact scenario (duplicate pair with real prose between them → validation error, prose never touched since nothing gets written). End-to-end verified with the real CLI: a scratch bundle with duplicate `lore:index` markers and real prose between them now fails `lore sync` with exit 6 and a clear message, and the file is left completely byte-identical afterward (confirmed via diff, not just exit code). Full `bun test` → 1506 pass/0 fail (up from 1505); `bun run typecheck` clean; lint clean on changed files. |
| 11 | LORE-87 | Done, 2026-07-21, session 11 | Root cause: `src/core/rewrite.ts`'s `destRangeForDefinition` located a reference definition's closing label bracket via a plain `body.indexOf("]", span.start)`. A label containing an escaped bracket (e.g. `[a\]x:y]: ../reference/orders.md`) matched the escaped `\]` first, and the subsequent `indexOf(":", rb)` then ALSO matched the wrong colon (one inside the label text itself, e.g. "x:y"'s colon) — a compounding double mis-location, not a single off-by-one. Confirmed via a real mdast parse that a `definition` node carries NO `children` (only decoded `identifier`/`label`/`url`/`title` strings whose lengths are not byte-equal to raw source once escapes are involved) — unlike `destRangeForLink`, which derives its label-content end from the parsed node's own children offsets and was already structurally immune. Fix: added `findLabelClose`, an escape-aware forward scan mirroring `scanDestination`'s existing backslash-escape convention (`j += 2` on an escaped char), and used it in place of the naive `indexOf`. Added a test in test/rename.test.ts via `rewriteInbound` reproducing the task's exact repro (a USED definition, referenced so it's a real graph edge); confirmed via `git stash` the pre-fix output is exactly the corruption the task describes (`[a\]x:../reference/sales-orders.md ../reference/orders.md` — label truncated mid-scan, new destination spliced into the wrong place, old destination left dangling) and the post-fix output is correct (`[a\]x:y]: ../reference/sales-orders.md`, label fully intact). End-to-end verified through the real `lore rename` CLI on a scratch bundle: the escaped-bracket label survives completely intact, only the destination updates. Full `bun test` → 1507 pass/0 fail (up from 1506); `bun run typecheck` clean; lint clean (one formatter-only fix, no logic change). |
| 14 | LORE-82 | Done, 2026-07-21, session 14 | Root cause: `walkFiles` (`src/core/bundle.ts`) already warns (via `WarningCollector`, purely advisory free text) when a nested directory is unreadable during the walk — tolerant by design, one restricted folder doesn't abort the whole bundle load. `rename.ts`/`supersede.ts` never inspected that warning and committed writes unconditionally, so a concept hidden inside the skipped directory that links to the renamed/superseded concept never got its link rewritten, while the command still reported success. Confirmed via grep that no existing command-layer code inspects `WarningCollector.list()`/`.count` for gating decisions — the class's own docstring claims `validate`/`check` do, but they don't; a stale claim, not real precedent — so string-matching the warning text would have been the fragile, unprecedented choice. Fix: extended `WarningCollector` (`src/errors.ts`) with an optional machine-readable `kind` tag on `add()` and a new `has(kind)` query method (fully backward compatible — every existing `.add(message)` call site untouched); exported `UNREADABLE_DIRECTORY_WARNING` from `bundle.ts` and tagged the existing warning with it. `rename.ts` now unconditionally refuses to commit when that warning fired (its inbound-link rewrite always needs a complete graph); `supersede.ts` refuses only when `--rewrite-links` is passed (without it, supersede only edits the two principals' own frontmatter, no dependency on the rest of the bundle) — verified this distinction against `supersede.ts`'s own module docstring before implementing, so the check isn't an unjustified restriction on a scenario that can't happen. Both commands previously flushed load advisories only at the very END of the function (after already committing) — moved the flush earlier (mirroring `context.ts`/`graph.ts`'s established pattern) so the specific "skipping unreadable directory X: reason" line is visible alongside the new error, and removed the now-redundant late flush (non-draining — leaving both would double-print on the success path). Added a test per command (rename required by AC2, supersede added for parity per AC1 naming both) reproducing the exact scenario; confirmed via `git stash` (isolating just the command file, keeping `bundle.ts`/`errors.ts` fixed) both fail pre-fix with "expected a LoreError, but run\<Command\> returned" and pass post-fix. End-to-end verified with the real CLI: pre-fix `lore rename` moved a file at exit 0 while permanently orphaning an inbound link inside the unreadable directory; post-fix it refuses at exit 6 with the specific warning visible and nothing written. Full `bun test` → 1514 pass/0 fail (up from 1512); `bun run typecheck` clean; lint clean (one pre-existing info elsewhere, unrelated to changed lines). |
| 12 | LORE-83 | Done, 2026-07-21, session 12 | Root cause: `src/core/profile.ts`'s `parseFieldSpec`, `parseTypes`, and `parseItems` each read a fixed set of known attribute keys off a parsed TOML/JSON table by name with no check for keys OUTSIDE that set — a typo like `require = true` (meant `required`) was simply never read, silently leaving `required` at its `false` default; the profile loaded clean and every concept validated clean despite missing the field. Re-verified the task's scoping claim against `parseProfile`'s own docstring: the documented forward-compatible unknown-key tolerance is explicitly scoped to top-level/`[profile]` keys only (accurate) — the fix deliberately leaves that untouched. Fix: added `rejectUnknownKeys(table, allowed, where, source)`, mirroring this file's existing `asTable`/`asString`/`asBoolean`/`asEnum` validator style, wired into all 3 named functions against each table's fixed legal-key vocabulary (field spec: required/kind/enum/items/default; a `[[types]]` table: name/fields/sections/template; an items table: kind/enum) — consistent with every other structural check in this file (all fail-loud `LoreError('validation', ...)`; this module has no warning mechanism at all). Added 3 tests, one per call site, matching the existing `expectValidation` harness; confirmed via `git stash` that all 3 fixtures genuinely silently SUCCEED pre-fix (the call returns instead of throwing, matching the task's own "silently defaults... instead of erroring" framing) and correctly throw post-fix naming the exact unknown key. End-to-end verified with the real CLI: a scratch `.lore/profile.toml` with `base.fields.owner = { require = true }` (the task's exact typo example) now makes `lore new` fail at exit 6 with a message naming the bad key and a hint listing the correct legal keys. Full `bun test` → 1510 pass/0 fail (up from 1507, all pre-existing profile tests — default profile, ECK 17-type profile — unaffected); `bun run typecheck` clean; lint clean. |
| 13 | LORE-84 | Done, 2026-07-21, session 13 | Root cause: `LoadBundleOptions` (`src/core/bundle.ts`) had no `profile` field, and `loadBundle`'s one `tryParseConcept` call never passed one, so every concept always validated against `defaultProfile()` regardless of a project's `.lore/profile.toml` — `concept.ts`'s `parseConcept`/`tryParseConcept` already accepted an optional profile; the gap was purely `loadBundle` never forwarding it. Fix: added `profile?: Profile` to `LoadBundleOptions`, forwarded to `tryParseConcept`; updated all 9 `loadBundle` callers (`context`/`supersede`/`graph`/`rename`/`tasks`/`query`/`orphans`/`sync`/`link`) to load and forward the project's profile, reusing an already-loaded profile where `sync.ts`/`supersede.ts`/`link.ts` already had one rather than double-loading. `sync.ts` needed the most care: its profile load was deliberately conditional/late to preserve a documented LORE-27 precedence contract (a malformed `backlog/config.yml` surfacing before a malformed `.lore/profile.toml`) — since `loadBundle` runs unconditionally and reconciliation-eligibility is computed FROM the loaded graph, profile now loads unconditionally before `loadBundle`, necessarily flipping that one precedence case (profile now wins) — a structurally necessary consequence, not an implementation choice; updated the one `test/sync.test.ts` precedence test that pinned the old ordering, with a comment explaining why. `link.ts`'s `writeTasksIfChanged` had a second, separate `loadProfile()` call site — threaded the same already-loaded profile through instead of double-loading. Added 2 tests to `test/bundle.test.ts` directly proving the fix (the SAME doc missing a custom-required field is silently tolerated without a profile, rejected with one) plus end-to-end verification through the real CLI (`lore query`/`lore sync` against a scratch project with a custom profile). **Flagged, deliberately left unfixed**: `core/rewrite.ts`'s `rewriteInbound` (used by `lore rename`/`supersede --rewrite-links`) has its own internal `serializeConcept` calls with no profile parameter at all — a separate, adjacent gap outside `loadBundle`'s own AC scope; documented in the task notes as a follow-up candidate (see Not-queued section) since no live user turn was available this session to confirm filing a new task the way LORE-68 was in a prior live session. Independent review sharpened this finding: the concrete risk is a custom profile REDEFINING an existing default type name (e.g. `Story`) with different required fields — post-fix, `lore rename` on such a concept can pass `loadBundle`'s initial (now-correct) validation but then throw inside `buildPostRenameGraph`'s re-parse (still default-profile), a genuinely new mid-operation failure mode this fix introduces, not present before (previously the whole chain was uniformly wrong but self-consistent). Also flagged by review: `lore check` validates via its own separate `parseConcept`/`walkFiles` path, not `loadBundle` — architecturally distinct, also never honors a custom profile, its own follow-up candidate. Full `bun test` → 1512 pass/0 fail (up from 1510); `bun run typecheck` clean; lint clean on all 12 changed files. |
| 15 | LORE-85 | Done, 2026-07-21, session 15 | Root cause: js-yaml's `load()` never expands an alias at parse time (it points the SAME JS object reference back at its anchor, so parsing a doubling-anchor chain is always fast regardless of depth — confirmed empirically: an 18-level ~400-byte chain loads in ~1ms) — but `yaml.dump({noRefs: true})` (`YAML_DUMP_OPTIONS`, deliberately configured so a re-serialize never emits `&`/`*` anchors) walks the shared-reference graph naively, expanding the same chain to ~20MB in ~286ms; a few more levels reaches OOM or an uncaught `RangeError`. Confirmed via js-yaml 4.1.0's actual `LoadOptions` type that it has no built-in alias-count/depth limit (`maxAliasCount` is a feature of the DIFFERENT `eemeli/yaml` library, verified this distinction directly). Also confirmed js-yaml's `JSON_SCHEMA` permits a genuinely CYCLIC anchor to load (`a: &a {b: *a}` loads with `doc.a === doc.a.b`) — a second, distinct hazard (an unmemoized walk of a true cycle never terminates); `yaml.dump({noRefs:true})` on a real cyclic object throws `RangeError: Maximum call stack size exceeded` rather than hanging, matching the task's own framing. Confirmed the attack surface is broader than write paths: `bundle.ts`'s `tokenEstimate()` (used by read-only `lore graph`/`context`) also calls `serializeConcept` internally. Fix: added `assertBoundedYamlExpansion` (`src/core/concept.ts`) — a deliberately non-memoized, reference-blind walk mirroring what a real `dump` would do, but tracking a running "expanded units" total and aborting the instant it crosses a 100,000-unit budget (generous for real frontmatter, which is metadata not prose), plus path-scoped cycle detection (an ancestor `Set`, added on entering a node/removed on leaving) that correctly distinguishes a true cycle from harmless DAG-style anchor reuse (the same anchor referenced by two unrelated siblings, an ordinary safe pattern). Wired into the SINGLE gray-matter YAML parse hook every read path shares (`parseConcept`/`tryParseConcept`/`tryReadFrontmatter`), so a malicious file is rejected the moment it's first read — before validation, the bundle graph, token estimation, or a later dump can ever touch the dangerous object; a thrown error is automatically caught and path-annotated by `splitFrontmatter`'s existing `matter(...)` try/catch, exactly like a plain YAML syntax error already is. Added 4 tests (the task's 18-level repro; a 40-level chain proving the walk's own cost stays bounded regardless of attack depth; a cyclic-anchor case; a harmless-DAG-reuse negative control); confirmed via `git stash` all 3 malicious-payload tests fail pre-fix (parse alone doesn't trigger expansion — only downstream dump does — so `parseConcept` silently "succeeds" pre-fix, confirming the vulnerability is real and deferred) and pass post-fix. End-to-end verified with the real CLI: post-fix `lore query` on a malicious file exits 6 in 58ms; pre-fix `lore graph`'s CPU/timing signature (0.36s user, 133% CPU) confirms the expensive dump actually executed internally even though the tiny JSON output doesn't show it (only a computed token count is exposed, not the huge intermediate string). Full `bun test` → 1518 pass/0 fail (up from 1514); `bun run typecheck` clean; lint clean. |
| 16 | LORE-69 | Done, 2026-07-21, session 16 | Root cause: `src/state.ts`'s `commitBacklogFiles` guard was a plain `file.startsWith("backlog/")` string check, not real path containment — a pathspec like `backlog/../docs/secret.md` textually starts with `backlog/` but resolves outside it once git interprets the `..` segment, and confirmed live that git honors `..` even inside a `:(literal)`-quoted pathspec, so quoting alone never neutralized it. Fix: each candidate path is normalized via `node:path`'s `posix.normalize` BEFORE the prefix check, and the NORMALIZED form — not the raw one — is what's passed to `git status`/`add`/`commit` downstream; rejects on `posix.isAbsolute(normalized)` or `!normalized.startsWith("backlog/")`. The pre-existing sibling-prefix protection (`backlog-evil/x.md`) was preserved and covered by a dedicated test. **Independent adversarial review then found a genuine bypass of THAT fix**: an embedded NUL byte. `posix.normalize` treats a segment like `"..\0"` as an ordinary (non-`..`) component and leaves it untouched, so `"backlog/.." + "\0" + "/x"` still starts with `backlog/` and passes — but `Bun.spawn`'s argv is a NUL-terminated C string, silently truncated at that same NUL once it crosses into the real `git` process, so git only ever received `:(literal)backlog/..`, resolving to the repo root; confirmed live end-to-end (full argv trace) that an unrelated in-flight edit at the repo root got swept into the commit, breaking BOTH ADR-0012 invariants at once. Fixed by (1) rejecting any path containing a NUL byte outright before normalize ever runs, and (2) defense-in-depth: `porcelainPaths` itself now re-validates every path `git status` reports back against `backlog/` before use in `add`/`commit`, closing the "validate one value, use a different value downstream" bug class at the actual git-boundary choke point rather than just the one instance found. Also verified by the reviewer (not exploitable): a symlink planted inside `backlog/` — git refuses to traverse a pathspec through a symlink (`fatal: pathspec '...' is beyond a symbolic link`), confirmed live; this is a DIFFERENT risk class from LORE-76/77 (those are about `lore scaffold`/`lore init` *writing through* a pre-existing destination symlink, not about what `git commit` does with one that already exists) — don't conflate the two. Flagged, not fixed (not currently reachable via any real caller — Backlog's own filename sanitizer already strips `/` and `\` from task titles): `posix.normalize` is POSIX-only, `win32.normalize` of the same string resolves differently, and this repo ships a Windows build/CI matrix — a follow-up candidate, see Not-queued. 9 new regression tests total (6 direct-fix + 3 review-fix), each confirmed via `git stash` to fail pre-fix/pass post-fix, including one real-git end-to-end test reproducing the reviewer's exact NUL-byte repro. Full `bun test` → 1529 pass/0 fail (up from 1518); `bun run typecheck` clean; lint clean. |
| 17 | LORE-72 | Done, 2026-07-21, session 17 | Root cause: `src/commands/new.ts`'s `resolveTemplate` spliced the raw, unvalidated `--template` CLI flag value straight into `${TEMPLATES_DIR}/${candidate}.md` then `readFileSync` — no basename/traversal/absolute check at all. Fix: `assertTemplateNameConfined(name, root)`, called on `parsed.template` (the explicit flag only, not the profile-declared/type-name fallback) BEFORE it builds any candidate path — mirrors this same file's own already-proven `resolveOutPath` containment pattern (`resolve`+`relative` against the real target dir, checked for a `..`-prefixed or absolute result). Absolute-path rejection explicitly checks `isAbsolute` (host-bound) AND `posix.isAbsolute` AND `win32.isAbsolute` unconditionally — **this session proactively applied LORE-69's freshly-recorded "validate on the actual deployment platform, not just the host running the code" convention during implementation**, and it caught a real gap in the first draft: a Windows drive-letter `--template` value (`C:\Windows\...`) is inert on this session's POSIX host (backslash isn't a separator there) but genuinely absolute once compiled for the project's real `win32-x64` release target — relying only on the host-bound `isAbsolute` would have silently passed that case in every POSIX-hosted test run while remaining a live gap on the shipped Windows binary; the resulting test (deliberately run pre-fix too) confirmed the gap was real. Also explicitly checked (per the same convention) whether a NUL byte could defeat this guard the way it defeated LORE-69's first fix: it cannot — `readFileSync` is a direct fs syscall, and Bun/Node's own binding synchronously THROWS on any embedded NUL before ever reaching the OS (confirmed empirically), so there is no exec/argv boundary here for a NUL to exploit. Live pre-fix repro against the real CLI in a scratch bundle reproduced the task's exact finding (secret file content read and embedded verbatim into the generated concept, exit 0); post-fix the same command exits 2 with a clear usage error and writes nothing. 9 new tests in `test/new.test.ts` (5 for the fix, including the exact repro shape and the Windows-drive-letter case; 1 non-regression test for a legitimate `..`-PREFIXED-but-not-traversal name, mirroring `resolveOutPath`'s own existing test for the identical distinction), confirmed via `git stash` to fail pre-fix (the tell-tale `not_found` instead of `usage` — pre-fix it silently READ the outside file, found no matching name inside `.lore/templates/` after the fact, and only THEN fell through to the not-found path, meaning the read had already happened) and pass post-fix. Full `bun test` → 1534 pass/0 fail (up from 1529); `bun run typecheck` clean; lint clean (one formatter-only fix). **Independent adversarial review confirmed the direct fix has no bypass** (every traversal/absolute encoding tried against the real CLI was correctly rejected; both the NUL-byte and win32/posix cross-platform claims independently re-verified and held up) — ready to ship as scoped, one doc-comment accuracy tweak applied (no logic change: clarified that the resolve+relative containment layer, not just `win32.isAbsolute`, is what defends a drive-relative path to a DIFFERENT drive than the repo's own). **Review also found and explicitly recommended NOT blocking on** (outside this task's AC scope, documented not silently expanded): a SYMLINK gap — `assertTemplateNameConfined` is purely syntactic, so a symlink already planted inside `.lore/templates/` (repo-content-controlled, not CLI-flag-controlled) lets an innocuous bare `--template evil` read straight through it, confirmed live including a nested-subdirectory variant; this is the READ-path counterpart to the still-open LORE-76/LORE-77 (which are specifically about `scaffold`/`init`'s WRITE-path symlink-following — confirmed by reading both tasks, a different code path, NOT covering this) — see Not-queued for the follow-up candidate. Also noted (deliberately excluded, not a bug): a profile-declared `template` value in `.lore/profile.toml` is a separate, unguarded traversal primitive needing no `--template` flag at all, matching this task's AC wording which only ever covered the explicit CLI flag. |
| 18 | LORE-71 | Done, 2026-07-21, session 18 | Root cause: `src/commands/check.ts`'s `defaultFetch` (the real network probe behind `--external`'s liveness check) called the global `fetch()` on any discovered `http(s)` URL with zero destination validation and no control over redirect-following (native `fetch`'s implicit `redirect: "follow"`). Fix, two layers: (1) `src/core/check.ts`'s new pure `classifyAddress(ip)` — a uniform 128-bit-BigInt IP-range classifier (IPv4 mapped into `::ffff:a.b.c.d`'s numeric space so an attacker can't dodge an IPv4-only blocklist via the IPv6-mapped spelling, a well-known SSRF-filter bypass) covering loopback/link-local/RFC1918-private/carrier-grade-NAT and their IPv6 counterparts — not an exhaustive IANA sweep, deliberately scoped to ranges an attacker can reach something interesting through. (2) `src/commands/check.ts`'s new injectable `ResolveHost` DNS seam (defaults to real `node:dns`) plus `blockedDestination`, which resolves a URL's hostname to EVERY address it answers to and blocks if ANY is disallowed, classified BEFORE `fetchFn` is ever called; a literal-IP hostname is classified directly, bypassing `resolveHost` entirely (so the guard's correctness never depends on an injected fake actually inspecting its input — caught and fixed a real test-authoring bug from exactly this gap during implementation). `FetchLike` gained an optional `location` field; `defaultFetch` always requests manual redirect handling from the real `fetch()`, and `probeOne` re-validates each redirect's destination itself before following it (bounded to 10 hops) — a redirect to a blocked destination is refused with the blocked hop NEVER fetched (verified via call-count assertions, not just the resulting finding). Both new `FetchLike` fields are optional so every pre-existing fake keeps compiling unchanged; only a NEW `resolveHost` fake was needed on existing `--external` tests, since DNS is a genuinely new IO touchpoint the fix introduces (existing tests use RFC 2606-reserved `.example` hostnames that never resolve for real). **Self-caught implementation bug** (not review): an early draft called the destination check OUTSIDE `probeOne`'s try/catch, so a DNS-resolution fault (which `.example`-hostname test fixtures always produce) silently crashed the whole liveness probe with zero findings emitted — every pre-existing `--external` test failed until the check was moved inside the shared try/catch so a DNS fault reports as an ordinary "is unreachable" finding, same as a fetch fault, never a security block. `resolveHost` threaded through `CheckOptions` AND `cli.ts`'s `RunContext`, mirroring `fetch`'s existing injection point exactly. 6 new tests (the task's own literal cloud-metadata repro with a 0-fetch-calls assertion; loopback/private/IPv4-mapped-IPv6-encoded literals; a DNS-resolved-to-blocked-address case; a multiple-resolved-addresses-one-blocked case; a redirect-to-blocked-destination case asserting the second hop's URL never appears in the fetch call list; a redirect-to-allowed-destination positive control), confirmed via `git stash` that all 6 fail pre-fix and all 123 pre-existing tests are unaffected either way. Live end-to-end verified against the real CLI with real DNS/network: a scratch bundle linking the cloud-metadata address, loopback, and a real live site (`example.com`) correctly blocks the first two with the matched range named and lets the real link through with no false positive. Full `bun test` → 1540 pass/0 fail (up from 1534); `bun run typecheck` clean; lint clean (two formatter-only fixes). **Independent adversarial review**: built a differential fuzzer (a Python `ipaddress`-module oracle vs. `classifyAddress`, 285+ cases covering every CIDR boundary, malformed inputs, case/zone-id variants) — zero mismatches after the review caught and fixed a bug in its OWN oracle generator (an initial "confirmed bypass" mid-review turned out to be the fuzzer comparing numerically-DISTINCT address forms, not a real classifier bug). Flagged two genuinely-unclassified legacy IPv6 forms (deprecated IPv4-compatible `::a.b.c.d`, NAT64 well-known prefix `64:ff9b::/96`) but empirically confirmed via a real local HTTP server that neither is honored as "reach the embedded IPv4" by `fetch()` on an ordinary non-NAT64 network — not exploitable on typical CI, applied as cheap defense-in-depth anyway (both now blocked wholesale, not by re-deriving their embedded IPv4's own classification, since that would have mis-treated `::`/`::1` as meaning IPv4 `0.0.0.0`/`0.0.0.1`). Also recommended (both applied): 62 new direct unit tests for `classifyAddress` (previously untested directly — the review's main actionable finding); the DNS-rebinding TOCTOU limitation documented in `blockedDestination`'s own doc comment as a real-but-low-blast-radius accepted gap (`--external` never gates, `probeOne` never reads a response body). Two minor free fixes alongside (a `MAX_REDIRECTS` comment off-by-one; a fail-closed defensive check for a hypothetical `ResolveHost` returning an empty array instead of throwing). Full `bun test` after the review round → 1602 pass/0 fail (up from 1534 baseline); `bun run typecheck` clean; lint clean. |
| 19 | LORE-76 | Done, 2026-07-21, session 19 | Root cause: two symlink-following gaps in `src/commands/fswrite.ts`'s `writeAllOrRollback` (the shared write primitive all three scaffold targets — mkdocs/docusaurus/obsidian — use): `ensureDir`'s `mkdirSync(recursive:true)` transparently walks a symlinked ancestor directory (standard POSIX path resolution — no mkdir flag can disable this for intermediate segments), and under `--force` the overwrite branch's `existsSync`/`readFileSync`/`writeFileSync` all follow a symlink at the FINAL target too, writing straight through to whatever it points at. (The non-forced branch's `createIfAbsent` already used `lstatSync` for the exact-final-file case only — that half was already safe; the ancestor-directory case and the whole `--force` path were not.) Fix: `assertNoSymlinkInPath(root, relPath)` walks every path segment via `lstatSync` (never following), throwing the moment one is a symlink and naming the exact segment; called before the directory-ensure loop (catches a symlinked ancestor or directory target) and before each file write, ahead of the force/non-force branch split (catches a symlinked ancestor or final file, under BOTH write disciplines). Mirrors the codebase's existing read-path convention (`core/bundle.ts`, `commands/replace.ts`: explicit `lstatSync(...).isSymbolicLink()`) rather than inventing a new pattern. Deliberately scoped to `writeAllOrRollback` specifically (scaffold's own single call site) rather than the far more widely-shared `ensureDir` export (used by `init.ts`/`agents.ts`/`sync.ts`/`new.ts`/`schema.ts`/`rename.ts`) — extending `ensureDir` itself would have silently widened this task's scope into command paths with their own separate task (LORE-77, for `init.ts`) or no task coverage at all. Live pre-fix repro against the real CLI in scratch repos reproduced the task's own claim exactly (a `docs -> outside` symlink let `lore scaffold mkdocs` write into the outside directory; a `mkdocs.yml -> outside/mkdocs.yml` symlink let `--force` overwrite the outside file's real content, confirmed via `git stash` watching the outside file's bytes change from sensitive placeholder content to the generated config); post-fix both refuse at exit 5 naming the symlinked segment, with the outside content verified byte-identical before/after. 3 new tests in `test/consumer-scaffold.test.ts` (symlinked `docs/` ancestor without `--force`; symlinked `mkdocs.yml` final target under `--force` with an exact-bytes-unchanged assertion; symlinked ancestor under `--force` too, confirming the guard fires regardless of write discipline), confirmed via `git stash` to fail pre-fix (no exception thrown at all) and pass post-fix; protects docusaurus/obsidian too since they share the same primitive, matching this test file's own "shared primitive, tested once" convention (no per-target duplicates needed). Full `bun test` → 1605 pass/0 fail (up from 1602); `bun run typecheck` clean; lint clean (one formatter-only fix). **Independent adversarial review: NO bypass found** after extensive testing against the real CLI — symlink loops (self-referential and two-hop), a mid-plan attack (symlink on a LATER file in a multi-file plan, confirming rollback correctly undoes the earlier writes without touching the attacker's own symlink), and a path-normalization "validate A, use B" divergence check (confirmed empirically identical, and separately confirmed every `dirs`/`file.path` value is a fixed string constant, never attacker-influenceable). Independently re-verified the scope-boundary claim (grepped every `ensureDir` call site directly — none route through `writeAllOrRollback`, confirming no gap with LORE-77). One real but explicitly non-blocking finding: a narrow TOCTOU window in ONLY the `--force` branch (a concurrent process could plant a symlink between the check and the write) — low severity for a local single-user CLI, matching this codebase's existing trust model elsewhere (plain `writeFileSync` with no TOCTOU hardening is already used in other places). Not fixed in-task: the suggested close (swap to this file's own existing `writeFileAtomic` temp-file+rename pattern) is conceptually simple but would need real re-verification against `writeAllOrRollback`'s already-extensively-tested rollback invariants — documented as a follow-up candidate (Not-queued), not expanded into this task. |

## Not queued — needs a human / blocked

- LORE-42 (lore mcp server): deferred by recorded product decision (ADR-0004 CLI-first; milestone m-7). Un-deferring is a user decision, not a campaign step.
- LORE-43 (Confluence one-way publish adapter): deferred by recorded product decision (ADR-0016; milestone m-8).
- LORE-44 (Confluence production mirror): deferred (milestone m-9) AND blocked on LORE-43 (also deferred).
- LORE-45 (typed importable library build): deferred per ECK-alignment follow-up — its own notes say revisit ONLY if a real in-process import need appears.
- **Follow-up candidate, not yet filed** (found during LORE-84, 2026-07-21; sharpened by
  independent review the same session): `core/rewrite.ts`'s `rewriteInbound` (used by `lore
  rename` and `lore supersede --rewrite-links`) calls `serializeConcept()` internally with no
  `profile` parameter of its own, so it always serializes rewritten concepts against the
  built-in default profile — `loadBundle`'s initial READ now honors a project's custom profile
  (LORE-84), but `rewriteInbound`'s WRITE/re-serialize path (and `rename.ts`'s
  `buildPostRenameGraph`, which re-`parseConcept`s those same bytes) still doesn't. The
  concrete risk isn't "an unknown custom type name" (harmless — unknown-type is warning-only,
  no field check either way) but a custom profile that **redefines an EXISTING default-profile
  type name** (e.g. `Story`) with different required fields/enums: pre-LORE-84 the whole chain
  (`loadBundle`/`rewriteInbound`/`buildPostRenameGraph`) was uniformly wrong but at least
  mutually consistent; post-LORE-84, `loadBundle` correctly accepts such a concept while
  `buildPostRenameGraph`'s re-parse can now THROW re-validating the same concept against the
  wrong (default) profile — a genuinely NEW mid-operation `lore rename` failure mode this fix
  introduces on a project that reuses a built-in type name with a different custom shape,
  not present before. Fixing this needs `rewriteInbound` (and `buildPostRenameGraph`, kept
  paired with whatever profile `rewriteInbound` serialized with) to accept a profile too — a
  distinct change to `core/rewrite.ts`'s public API and its own tests, not something LORE-84's
  AC (specifically about `loadBundle`) covers. Needs a human to confirm priority/scope before
  filing as a new backlog task — the campaign ran unattended this session with no live turn to
  ask.
- **Separate, smaller follow-up candidate, not yet filed** (found by independent review during
  LORE-84, 2026-07-21): `lore check`'s command layer validates concept frontmatter through its
  own `parseConcept`/`walkFiles` path, not `loadBundle` — so it ALSO never passes a project's
  custom profile, architecturally separate from LORE-84's `loadBundle`-caller sweep (not a
  missed caller, a different code path entirely). Same underlying symptom (a custom profile
  silently ignored), different fix site. Also needs a human to confirm priority before filing.
- **Follow-up candidate, not yet filed** (found by independent review during LORE-69,
  2026-07-21): `src/state.ts`'s `commitBacklogFiles` guard uses `node:path`'s `posix.normalize`,
  which is POSIX-only — `win32.normalize` of the identical string can resolve differently
  (backslash-separator semantics), and this repo does ship a Windows build/CI matrix
  (`windows-latest` in lint/typecheck/test; a `win32-x64`/`lore.exe` release target). Not
  currently reachable via any real caller (Backlog's own `sanitizeFilename` already strips both
  `/` and `\` from task-title-derived filenames before they can reach this guard), but the guard
  itself doesn't know that — it's incidental protection from an unrelated regex, not a designed
  barrier, and `commitBacklogFiles` is exported specifically to be a hard boundary regardless of
  what any current caller happens to produce. Needs a human to confirm priority/scope before
  filing (cross-platform path validation is a small, self-contained fix, but worth a deliberate
  decision on how much backslash-handling this module should own).
- **Follow-up candidate, not yet filed** (found by independent review during LORE-72,
  2026-07-21 — the more significant of two out-of-scope findings): `src/commands/new.ts`'s
  `resolveTemplate`/`readTemplateFile` has NO symlink guard — `assertTemplateNameConfined`
  (LORE-72's own fix) is purely syntactic (`resolve`+`relative`), so a symlink already planted
  inside `.lore/templates/` (e.g. `.lore/templates/evil.md -> /outside/secret.md`, committed by
  whoever controls the repo's content) lets a completely innocuous bare `--template evil` — no
  `..`, no absolute syntax, nothing LORE-72's guard is designed to catch — read straight through
  it into a generated concept. Confirmed live against the real CLI, including a nested-subdirectory
  variant (`.lore/templates/sub/nested.md` as the symlink). This requires attacker control of REPO
  CONTENT (a malicious/cloned repo), a narrower threat model than LORE-72's own CLI-flag-only
  repro, but it is the exact escape class the codebase ALREADY has an established, precedented
  guard for on other read paths: `src/core/bundle.ts`'s `walkMarkdown` and `src/commands/replace.ts`
  both use `lstatSync(...).isSymbolicLink()` and explicitly skip/warn ("a symlink could resolve
  outside the bundle") — `new.ts`'s template read has no equivalent. This is the READ-path
  counterpart to the still-open **LORE-76**/**LORE-77** (confirmed by reading both tasks: those are
  specifically about `scaffold`/`init`'s WRITE-path symlink-following, a different code path
  entirely — neither covers this). A fix would mirror the existing `lstatSync` convention rather
  than invent a new pattern. Needs a human to confirm priority/scope before filing.
- **Noted, not filed (deliberately excluded scope, not a bug)**: also found during LORE-72's
  review — a profile-declared `template` value in `.lore/profile.toml` (the `declared` fallback in
  `resolveTemplate`, distinct from the `--template` CLI flag `assertTemplateNameConfined` guards)
  is a fully live, unguarded traversal primitive requiring no CLI flag at all
  (`template = "../../../outside_secret.md"` in a `[[types]]` block reads the outside file on
  every `lore new` of that type). LORE-72's own AC only ever covered the explicit `--template`
  flag, and repo config (`.lore/profile.toml`) is a trusted input elsewhere in this codebase's
  threat model too, so this isn't a regression LORE-72 introduced — recorded for awareness in case
  a future security pass wants to reconsider whether `.lore/profile.toml`'s trust boundary should
  extend to this field.
- **Follow-up candidate, not yet filed** (found by independent review during LORE-76,
  2026-07-21): `src/commands/fswrite.ts`'s `writeAllOrRollback` has a narrow TOCTOU window in its
  `--force` overwrite branch only — `assertNoSymlinkInPath` (LORE-76's own new guard) runs, then a
  moment later `existsSync`/`readFileSync`/`writeFileOverwriting` (a plain `writeFileSync`, no
  `O_EXCL`) actually performs the write; a symlink planted by a CONCURRENT process in that window
  would be followed. The non-`--force` path (`createIfAbsent`'s `wx`/`O_CREAT|O_EXCL`) is
  independently TOCTOU-safe by POSIX semantics regardless of this fix, so the gap is confined to
  `--force`. Low practical severity for this tool's actual threat model (a local, single-user CLI,
  not a multi-tenant server — exploiting it needs a concurrent attacker process racing a
  single-digit-millisecond window) and consistent with the trust model the rest of the codebase
  already assumes elsewhere (plain `writeFileSync` with no TOCTOU hardening is used in several
  other places too) — this is a PRE-EXISTING class of risk, not a regression LORE-76 introduced.
  A close is available nearly for free: this same file already has `writeFileAtomic` (used by
  `lore sync`) — write to a sibling temp file, then `renameSync` over the destination; POSIX
  `rename()` REPLACES a destination symlink rather than following it, so swapping the `--force`
  branch to that pattern would close the window. Not applied in-task because `writeAllOrRollback`'s
  rollback correctness is already extensively tested in this exact file (unreadable-pre-existing-
  file rollback, partial-plan rollback restoring previous bytes, fresh-directory rollback, etc.,
  in `test/consumer-scaffold.test.ts`'s "never-silent-clobber" block) — verifying a write-mechanism
  swap doesn't quietly violate any of those existing guarantees is real work, not a free change,
  despite the core idea being simple. Needs a human to confirm priority/scope before filing.

## Campaign conventions (durable, verified 2026-07-19)

- Every E2E task (LORE-61..66) must verify with a full real-binary harness run:
  `docker compose -f docker/e2e/docker-compose.yml up --build` (green required,
  ~2-3 min), then ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v`.
  A green `bun test` alone is NOT sufficient evidence for harness changes. LORE-68
  inherits this same standard (its own AC3 requires a green harness run).
- LORE-67 is docs-only: drive docs/ edits per the repo's lore CLI conventions
  (`lore instructions`, the lore skill) and re-verify each stale claim against
  current source before editing.
- Commits: Conventional Commits with the LORE-N scope (repo convention), plus
  the session's standard co-author/session trailers.
- `docs/.obsidian/` sits untracked in the working tree, pre-existing and
  unrelated — leave it alone. Still true as of the 2026-07-21 init: only
  `docs/.obsidian/app.json` is meant to be tracked per .gitignore:40-41, but
  it hasn't been committed yet either — not this campaign's concern to fix.
- All seven queue tasks from the first campaign originate from the 2026-07-19
  multi-agent E2E coverage audit (filed at dev @ 305efa8); each task description
  is self-contained with file:line evidence, but re-verify file:line references
  against current HEAD before editing — LORE-61 confirmed the filing task's own
  line numbers stayed accurate, but also found one of its own semantic
  assumptions (validate's exit 6 being the error_type=validation ErrorEnvelope
  case) was wrong. LORE-68 was filed the same way (during LORE-64's session) —
  re-verify its root-cause hypothesis against current source rather than trusting
  it at face value, same discipline. (Confirmed again by LORE-68 itself: its own
  filed dash-vs-space hypothesis was wrong too — the real cause was a coordinate-
  space bug in src/core/rewrite.ts, not a Backlog filename convention mismatch.)
- Don't trust an E2E task filing's proposed induction technique or exit-code
  assumption at face value — verify against the real binary during
  implementation, same as LORE-61 did for the validate/check gate distinction.
- When a new E2E assertion combines a boolean with a jq array generator inside
  `and`/`or`, use `any(...)`/`all(...)` to reduce it to one value first — a bare
  generator only leaves jq -e's exit status decided by the LAST emitted item,
  which can pass by coincidence rather than by testing the intended condition
  (LORE-62's F1 assertion, caught by adversarial review, not by the harness
  itself since both tasks under test happened to fail identically).
- A step_json/step_fail jq filter must stay on ONE physical line: `jq -e "$filter"`
  gets `$filter` as a raw string with no bash re-parsing, so an embedded literal
  backslash-newline (from wrapping the filter across lines inside a single-quoted
  bash string) is a jq syntax error, not a line continuation — unlike `check()`'s
  `eval "$expr"`, which DOES correctly join a backslash-continued multi-line
  expression because eval re-parses it as fresh bash source (LORE-62).
- A `check()` grepping a task id out of a doc for a status/value must anchor on
  the managed-block row's own syntax (e.g. the literal `"[TASK-n]"` link-text
  bracket), never a bare `grep -i "$TASKn"`: the id also appears, differently
  cased and bracket-free, in the frontmatter `tasks:` list (one id per line),
  so an unanchored match can silently pass by hitting that unrelated line, and
  can prefix-collide once any task id reaches double digits (LORE-63, caught
  by adversarial review, not by the harness — the collision never triggered
  because this campaign has only ever seeded single-digit task ids).
- Backlog.md has no CLI to set a custom `statuses:` flow (`backlog config set
  statuses ...` refuses on the real binary: "cannot be set directly... edit
  the config file directly") — a custom flow must be authored by editing
  `backlog/config.yml`'s `statuses:` key directly, in the exact flow-array
  shape `backlog init` itself writes (LORE-63).
- An E2E probe of a reconciliation-config surface (a custom status flow, a
  `.lore/config.toml` override) should isolate onto a FRESH, singly-linked
  concept rather than reusing an already-multiply-linked one — otherwise an
  unrelated linked task's own active/terminal classification can mask
  whatever the surface under test actually contributes to the rollup, giving
  a false-positive "it works" that would pass even if the surface were never
  read at all (LORE-63). If the probe touches a task's REAL status (not just
  the doc's on-disk value), reverting the config afterward is not enough —
  the task's own status must also be reset to something the restored default
  flow recognizes, or a LATER full reconciliation pass throws trying to
  reconcile it (LORE-68 found this exact gap in LORE-63's own Phase 15c
  cleanup, undetected until Phase 17a's regression guard first ran).
- `lore new` can NEVER populate a profile-declared custom frontmatter field —
  its frontmatter only ever carries type/title/summary/timestamp/tags(+stamped
  resource); `--var` only fills BODY template placeholders. An E2E probe of a
  required custom field must hand-author/edit the doc directly and run
  `lore validate` on it, not rely on `lore new` (LORE-64).
- A custom `.lore/profile.toml` REPLACES the built-in six-type vocabulary
  wholesale, it does not merge. A FULL `lore schema export` (no `--type`)
  PRUNES any `.lore/schemas/*.schema.json` belonging to a type the active
  profile no longer declares — so introducing then removing a custom profile
  around an existing schema export requires one more full export afterward to
  regenerate the pruned defaults and prune the now-orphaned custom schema
  (LORE-64).
- Don't assert a bare "exit 0" (or any specific baseline) to prove a command is
  unaffected by some surface under test — assert INVARIANCE instead: capture
  its output/exit code both with and without the surface present and diff
  them. A real run can already carry unrelated pre-existing drift (LORE-64
  found LORE-68 exactly this way), and a bare-exit-0 assumption would either
  false-fail on that unrelated drift or, worse, mask a real regression if the
  unrelated drift happened to also be exit 6.
- Backlog's real `task edit --title` does NOT rename the task's file — a
  `saveTask` call whose `task.filePath` is already set (always true on an
  edit) preserves that exact path (`file-system/operations.ts`). The
  filename stays anchored to the id + the title AT CREATION TIME forever
  after; only a genuine on-disk move (e.g. `task archive`, a real `rename()`
  to `backlog/archive/tasks/`) is a real backlog-side file-move event to test
  against sync's sweep + the managed block's href (LORE-65).
- Backlog's `sanitizeFilename` strips `()[]` entirely and turns `*` into a
  hyphen when building a task's filename from its title — no title the real
  CLI accepts can ever put a glob metacharacter into a backlog/ filename. To
  actually exercise state.ts's `:(literal)` pathspec guard, rename a file
  directly on disk (bypassing the CLI) rather than trying to induce it via a
  task title (LORE-65).
- `lore` itself has NOT cut a release yet — `package.json`'s `version` field
  is genuinely `"0.0.0"` (matches the Dockerfile's own build-time check,
  which compares the compiled binary's `--version` output against
  `package.json`'s real value rather than demanding a non-placeholder
  version). Never assert "a real, non-0.0.0 version" for `lore` itself; assert
  it MATCHES `package.json`'s real value instead — a broken compile-time
  embed would still show up as a mismatch (LORE-66).
- `core/replace.ts`'s `MANAGED_MARKERS` registry protects ONLY the
  `lore:index` listing block today — `lore:tasks` protection is aspirational
  doc-comment, not implemented. An E2E test of replace's managed-region
  protection must target an `index.md`'s listing block (regenerated by any
  whole-bundle `lore sync`), not a Story's `lore:tasks` block (LORE-66). This
  exact gap is now queued as LORE-73 for a real fix (2026-07-21 Codex review).
- `link.ts`'s `unlink`/`removeBackRefs` deliberately OMITS the `--doc` flag
  entirely when removing a task's last `documentation` entry would leave the
  array empty — Backlog's CLI cannot clear `--doc` via an empty value
  (ADR-0009 §2), so the stale path cosmetically lingers on a single-entry
  task. Assert the `doc:` LABEL removal (unconditional) as the real signal,
  not the `documentation` array, when the task under test has only one entry
  (LORE-66).
- A BM25-scored `query` filter test needs a genuine NEGATIVE control (a doc
  that must be ABSENT from the hits), not just a positive one — an
  inclusion-only assertion passes even if the filter were silently a no-op
  returning the whole unfiltered bundle. A hyphenated "zero hits" search
  phrase also isn't safe by construction: it tokenizes into its individual
  words, some of which may be common enough to genuinely score > 0 elsewhere
  — use one unbroken nonsense token instead (LORE-66, both caught by
  adversarial review/a real harness run, not by inspection).
- A subagent forked mid-implementation inherits the FULL conversation context
  (including the broader task-list/plan), not just its own narrow prompt —
  even an explicitly "research only, report back, do not edit files"
  directive can get overridden by the fork's own read of the larger goal.
  When precision control over WHO writes WHAT matters (e.g. dispatching
  several research-only forks before writing any code), check `git status`
  after they return and be ready to `TaskStop` any still-running one that
  might conflict, rather than trusting the directive alone (LORE-66).
- This project's Agent tool registry does NOT include a `code-reviewer`
  subagent type — available types are `claude`, `claude-code-guide`,
  `Explore`, `general-purpose`, `Plan`, `statusline-setup`. Use
  `general-purpose` for an independent/adversarial review subagent in the
  per-issue lifecycle's step 6.
- To run the real `--json`-capable `backlog` binary WITHOUT docker (for a fast
  headless repro instead of a full ~2-3 min harness build), clone
  `MrLesk/Backlog.md`, checkout the pinned commit the Dockerfile builds
  (`docker/e2e/Dockerfile`'s `BACKLOG_COMMIT` ARG), `HUSKY=0 bun install &&
  HUSKY=0 bun run build`, and put `dist/backlog` on `PATH` ahead of any
  globally-installed `backlog` (which may be a stock release predating the
  `--json` PR and will silently fail lore's capability probe) (LORE-68).
- A concept's own outbound links only need REPO-relative arithmetic
  (`normalizeLink`'s actual contract) when they can point OUTSIDE the bundle
  root — same-bundle links tolerate the cheaper bundle-relative shortcut
  because a constant `docs/` prefix cancels out of a `posix.relative`
  computation between two paths that both carry it. Any future engine that
  recomputes a moved/renamed file's own body links (mirroring
  `src/core/rewrite.ts`'s `newDestPathFor`) must resolve them in the
  REPO-relative coordinate space, not the bundle-relative id space the graph
  itself uses for concept membership/self-link matching — the two are NOT
  interchangeable the moment a link can legitimately escape `docs/` (a
  managed task block linking `backlog/tasks/…` is exactly such a link)
  (LORE-68).
- This third campaign (LORE-69..87) originates from a full-codebase Codex
  (gpt-5.6-sol) second-opinion review, not an E2E coverage audit — the source
  document is `backlog/docs/reviews/doc-2`, not a filing task's own prose.
  Every task description already carries a verified repro or concrete trace;
  still re-verify against current HEAD before implementing, same discipline
  as every prior campaign task (2026-07-21).
- Three of the queued issues (LORE-78, 79, 80) describe the SAME underlying
  gap (lore rename's destination is never confined to the bundle root) at
  three different layers of one call chain: argument parsing (78), the
  rename command (79), and the shared `rewriteInbound` engine (80, queued
  last of the three so its containment fix is available for the other two to
  build on or reference). Read all three task descriptions before starting
  any one of them — fixing 80 first may substantially reduce or reshape the
  remaining work in 79/78 (2026-07-21).
- A real subprocess test that wants to reproduce `process.exit()`-vs-async-
  stdout-write truncation on a piped destination MUST route through an
  actual downstream process (`sh -c "bun cli.ts ... | cat"`), not Bun's own
  `Bun.spawnSync(..., { stdout: "pipe" })` capture directly on the CLI — the
  latter's read side drains eagerly enough (reading before the child even
  starts writing) that the race the bug depends on never triggers, so a test
  built that way would pass even against unfixed code. Confirmed empirically
  by `git stash`-ing the LORE-70 fix and running both harness shapes against
  identical large `--json` output: the direct-capture harness stayed green
  on the broken code (false negative), the `sh -c "... | cat"` harness
  correctly failed (LORE-70).
- When a "malformed input recovery" bug needs a fail-loud fix, check whether
  `src/core/managed-block.ts` (LORE-22/36's mdast-based `lore:tasks` engine)
  already solved the identically-shaped problem — it did, for marker
  validation: `findMarkers()`/`locateLabeledMarkers()` throw a
  `LoreError('validation', ...)` on a missing/duplicated/crossed marker pair
  instead of guessing. `src/core/indexes.ts`'s older, plain-string-scan
  `locateManagedBlock` (shared by index regeneration, `lore replace`, `lore
  rename`) had NOT been brought in line with that pattern — it silently
  collapsed a duplicated marker pair (deleting any hand-authored prose
  between the two blocks) and silently extended an unmatched begin to
  end-of-file. LORE-86 rewrote it to match managed-block.ts's fail-loud
  contract and error-message voice. Any other "recover from malformed
  input" code discovered later in the bundle should be checked against this
  same pattern before inventing a new one (LORE-86, 2026-07-21).
- In `src/core/rewrite.ts`, a raw-source structural scan (locating a byte
  range without a text search on the decoded `node.url`/`node.label`) can
  ONLY reuse the parsed node's own `children` offsets (as `destRangeForLink`
  does via `maxChildEnd`) when the mdast node type actually HAS children. A
  `definition` node does not — mdast gives only its already-escape-decoded
  `identifier`/`label`/`url`/`title` strings, whose lengths are not
  byte-equal to raw source once any escape is involved. Any such scan needs
  its OWN escape-aware walk (mirroring `scanDestination`'s `\` handling)
  rather than assuming a `maxChildEnd`-style shortcut is available — verify
  with a real mdast parse (`fromMarkdown`) which node types actually carry
  `children` before assuming one does (LORE-87, 2026-07-21).
- A hand-rolled TOML/JSON grammar validator (like `profile.ts`'s) that reads
  known attribute keys off a table BY NAME with no unknown-key check will
  silently no-op a typo (`require` for `required`) instead of erroring —
  the value just never gets read, so the field keeps its default with no
  signal anything was wrong. Any nested table with a small, FIXED attribute
  vocabulary (unlike the intentionally-tolerant top-level/`[profile]` table)
  needs an explicit `rejectUnknownKeys`-style gate; don't assume "reads
  known keys" implies "rejects unknown ones" without checking (LORE-83,
  2026-07-21).
- When a fix threads a new option through a shared function's ~9 callers,
  check EVERY caller individually for a pre-existing, deliberately-ordered
  side effect before mechanically repeating the same edit — one caller
  (`sync.ts`) had a documented, test-pinned error-precedence contract
  (LORE-27) between two failure modes that the new unconditional profile
  load necessarily reordered; a purely mechanical "add the option
  everywhere" pass would have silently broken that contract's own
  regression test instead of updating it with a clear explanation
  (LORE-84, 2026-07-21).
- A fix can legitimately surface a SEPARATE, adjacent gap in the same
  subsystem without that gap being in scope to also fix — `loadBundle`
  (LORE-84) now honors a custom profile for reading concepts, but
  `core/rewrite.ts`'s `rewriteInbound` (used by `lore rename`/`supersede`)
  still has no profile parameter for its own internal `serializeConcept`
  calls, so the WRITE path still uses the default profile. Document such a
  finding clearly (task notes + tracker's Not-queued section) rather than
  silently expanding the current task's scope or silently ignoring it; file
  it as a real follow-up task only when a live user turn is available to
  confirm priority (LORE-84, 2026-07-21).
- Before making a command refuse-to-proceed based on an existing advisory
  `WarningCollector` warning, check whether any code ALREADY inspects
  `.list()`/`.count` programmatically — grepped and found none (despite
  `WarningCollector`'s own docstring claiming `validate`/`check` do; a
  stale, inaccurate claim). Warnings in this codebase are display-only
  today; a machine decision needs its own structured signal, not
  string-matching the human-readable message text. Extended
  `WarningCollector` with an optional `kind` tag + `has(kind)` query
  (backward compatible) rather than pattern-matching — a reusable pattern
  for any future "refuse based on a specific advisory" need (LORE-82,
  2026-07-21).
- When gating a mutation command on a bundle-completeness signal, check
  EACH mutation command's actual write dependency on graph completeness
  individually, not just its name/category — `lore rename` always needs a
  complete inbound-link view, but `lore supersede` only does when
  `--rewrite-links` is passed (without it, supersede edits only the two
  principal concepts' own frontmatter). Gating supersede unconditionally
  would have refused a perfectly safe operation for a scenario that can't
  actually occur (LORE-82, 2026-07-21).
- For a resource-exhaustion (DoS-shaped) bug, verify the fix at the CHEAPEST
  possible enforcement point, not every downstream call site — a
  YAML anchor-bomb's real hazard is in ANY naive (non-memoized) walk of the
  parsed object, which could be `serializeConcept`'s dump, `tokenEstimate`,
  or any future consumer; enforcing the bound once at the shared PARSE
  choke point (before a dangerous object can exist anywhere in the system)
  is both simpler and strictly safer than patching every current and future
  serialize call site individually (LORE-85, 2026-07-21).
- Before implementing a size/depth limit against a third-party parser
  library, check that library's ACTUAL installed version's options/types
  directly (e.g. `node_modules/@types/<pkg>/index.d.ts`) rather than
  assuming a feature exists by name-recognition from a similar library —
  `maxAliasCount` is real, but on `eemeli/yaml`, not the `js-yaml` this
  project actually pins; confusing the two would have wasted an
  implementation attempt on an option that silently doesn't exist here
  (LORE-85, 2026-07-21).
- When bounding an exponential-blowup attack with an early-exit budget
  check, the check must be a genuinely NAIVE (non-memoized) walk that
  mirrors the real vulnerable operation's own traversal shape — a
  memoized/DAG-aware walk would UNDERCOUNT the very blowup being guarded
  against and let the attack through. Distinguish this deliberately from
  true CYCLES (a node referencing its own ancestor, which IS legal under
  js-yaml's `JSON_SCHEMA`) via separate, path-scoped ancestor tracking — a
  budget check alone doesn't terminate on a real cycle since an unmemoized
  walk of a cycle never returns (LORE-85, 2026-07-21).
- A `startsWith(dir)` containment check on a path is not real path
  containment — normalize the candidate (`posix.normalize`, since git always
  reports/expects forward-slash paths regardless of host OS) BEFORE the
  prefix check, and use the NORMALIZED string for every downstream
  operation, not just for validation: git resolves `..` even inside a
  `:(literal)`-quoted pathspec, so a check that validates one string while
  shelling out a different (raw) one stays exploitable (LORE-69,
  2026-07-21). A symlink already sitting inside the guarded directory does
  NOT bypass this specific guard: `git status`/`add`/`commit` treat a
  symlink as an opaque tracked blob (its target-string content, not a
  traversal point), so a path reaching *through* one is either a no-op
  (unmatched by porcelain) or commits only the symlink object itself, still
  genuinely under the guarded directory. That's a distinct risk class from
  a command *writing through* a pre-existing destination symlink (LORE-76/
  77's `lore scaffold`/`lore init` gap) — don't conflate git-commit-time
  symlink safety with filesystem-write-time symlink safety when working
  those tasks.
- **CRITICAL for every remaining security-labeled task in this queue**
  (LORE-71 SSRF, LORE-72/76/77/78/79/80 traversal/symlink): a path/string
  validation check is only as strong as the guarantee that the EXACT value
  validated is the EXACT value used downstream. `posix.normalize` correctly
  rejects a `..`-based traversal string, but does NOT know that a NUL byte
  embedded in that same string will silently TRUNCATE the value at the
  process-exec boundary (`Bun.spawn`'s argv is a NUL-terminated C string) —
  so a payload can pass JS-level validation yet have git (or any spawned
  process) receive a shorter, differently-resolving string. This is a
  general class, not a one-off: ANY time a validated string crosses an
  exec/argv/FFI/serialization boundary, ask "could a byte the validator
  treats as ordinary data cause the CONSUMER to interpret the string as
  shorter/different?" — for exec boundaries specifically, that byte is NUL
  (C-string termination); other boundaries (SQL, shell-via-string, URL
  parsers, etc.) have their own distinct injection/truncation bytes and must
  be checked against THAT consumer's actual parsing behavior, not assumed
  identical. Independent adversarial review caught this on the first fix
  attempt — self-review alone had not considered it (LORE-69, 2026-07-21).
  Also record the general fix pattern that worked here: reject the
  dangerous byte class OUTRIGHT (don't try to sanitize/strip it), AND add a
  defense-in-depth re-check at the actual choke point right before the
  dangerous operation (here: `porcelainPaths` re-validating what `git
  status` itself reports, not just what the caller supplied) — the second
  layer closes the whole "validate A, use B" bug class rather than just the
  one instance found.
- **Confirmation that the above convention works** (LORE-72, 2026-07-21):
  applied proactively DURING implementation this time, not caught by a later
  review. Checking `win32.isAbsolute` unconditionally (not just the
  host-bound `isAbsolute`) caught a real gap in the first draft of LORE-72's
  own fix — a Windows drive-letter `--template` value is inert on this
  session's POSIX host but genuinely absolute on the project's real
  `win32-x64` release target, and a test written specifically to probe that
  cross-platform gap failed against the first-draft fix, confirming it was
  real rather than theoretical. Also explicitly checked (and confirmed safe,
  no fix needed) whether a NUL byte could defeat the new guard the same way
  it defeated LORE-69's first attempt — it can't here, since `readFileSync`
  is a direct fs syscall that throws synchronously on an embedded NUL rather
  than silently truncating at an exec/argv boundary. Keep asking BOTH
  questions (platform-binding gaps, NUL/boundary-truncation gaps) on every
  remaining security-labeled task, even when the immediate vulnerability
  class looks different from LORE-69's.
- **When a security fix's own AC has a narrow, explicit scope (a specific
  CLI flag, a specific traversal shape), an adversarial review will often
  find a REAL, live bypass of the broader vulnerability class that is still
  legitimately outside that AC's scope** — e.g. LORE-72's AC covers only the
  `--template` flag's `..`/absolute forms, but the review found a symlink-
  based read (repo-content-controlled, not flag-controlled) and a profile-
  config-based traversal (a different input entirely) that both still read
  arbitrary files via the same command. Do NOT silently expand the task's
  scope to fix these (that risks under-testing a rushed addition, and the
  campaign's whole model is small reviewed units) NOR silently ignore them.
  Ask: is this the SAME code this task already touches with a well-
  precedented fix (LORE-69's `porcelainPaths` defense-in-depth WAS in that
  category, so it got fixed in-task) or a GENUINELY SEPARATE vector needing
  its own scoped task (LORE-72's symlink gap: yes, precedented via
  `bundle.ts`/`replace.ts`'s `lstatSync` convention, but still its own
  distinct fix + tests + review, and explicitly recommended as a follow-up
  by the reviewer rather than folded in) — when unsure, default to flagging
  it in this Not-queued section rather than scope-creeping the PR (LORE-72,
  2026-07-21).
- **Before assuming a newly-found security gap is uncovered, check whether
  a LATER item already in the queue covers it** — LORE-72's symlink finding
  looked at first glance like it might overlap LORE-76/LORE-77 (both also
  about symlink-escapes), but reading both tasks' own descriptions showed
  they are specifically about `scaffold`/`init`'s WRITE-path (following a
  symlink when WRITING scaffold content), while LORE-72's finding is a
  READ-path gap (`lore new --template` following a symlink when READING a
  template) — same general escape CLASS, opposite data-flow direction,
  genuinely different code and genuinely uncovered by either queued item.
  Don't assume "sounds similar" means "already covered" without actually
  reading the other task's AC (LORE-72, 2026-07-21).
- **When a fix adds a NEW injectable IO seam (a second `resolveHost` beside
  an existing `fetch`, say), make the destination-check and the
  network-call share ONE try/catch, not two separate ones** — a fault from
  the NEW seam (DNS resolution failing) needs to be classified the SAME way
  a fault from the OLD seam (the fetch itself failing) already is (here:
  both become an ordinary "is unreachable" liveness finding, never a
  security block and never an uncaught rejection). Splitting them into
  separate try/catches (or checking the new seam outside any try/catch at
  all) lets a fault from the new seam escape uncaught — self-caught here
  when EVERY pre-existing `--external` test started failing with zero
  findings emitted at all, because their `.example` test hostnames
  genuinely fail real DNS resolution and the destination check wasn't
  wrapped (LORE-71, 2026-07-21).
- **A new injectable seam a fix introduces (DNS resolution, here) needs its
  own default test double wherever the OLD seam already had one** — adding
  `resolveHost` alongside an existing `fetch` injection point broke every
  pre-existing test that only faked `fetch`, because those tests'
  placeholder hostnames (`.example`, RFC 2606-reserved, never resolve for
  real) now hit REAL DNS through the new seam and genuinely failed. Fix by
  giving the shared test option-builder helpers (`opts()`/`ctx()`) a safe
  default fake for the NEW seam too, so only tests that actually want to
  exercise it opt out of the default (LORE-71, 2026-07-21).
- **A destination/allowlist check must classify a literal IP directly,
  never by deferring to an injectable resolver seam** — routing a literal
  IP through `resolveHost(ip)` anyway means the guard's correctness now
  depends on that resolver actually inspecting its input; a reasonable
  "allow everything" test fake that ignores its argument (a common,
  otherwise-harmless simplification) would then silently rubber-stamp a
  literal blocked-IP URL a test meant to catch. Short-circuit: if the
  hostname is already a valid IP literal (`node:net`'s `isIP`), classify it
  directly and skip the resolver entirely — this also matches how a real
  socket connection never does a DNS lookup for a literal IP (LORE-71,
  2026-07-21).
- **A symlink-write guard belongs on the SHARED write primitive with the
  fewest, most-scoped-to-this-task call sites, not on the widest-reach
  helper that happens to touch the vulnerable code** — `writeAllOrRollback`
  (scaffold's own single call site) was the right place for LORE-76's fix;
  `ensureDir` (its own internal `mkdirSync` call, but shared by six OTHER
  commands with no task coverage for this exact gap) would have been the
  wrong one, even though patching `ensureDir` looks like it "covers more
  ground for free." Silently widening a security fix's blast radius beyond
  its own AC — even toward MORE safety — still means shipping unreviewed,
  untested behavior change in unrelated command paths. If those other paths
  need the same guard, that's its own task (LORE-77 already exists for
  `init.ts`'s own version of this exact gap) (LORE-76, 2026-07-21).
- **Standard `mkdirSync`/`writeFileSync`-family calls always transparently
  resolve a symlink in the MIDDLE of a path** — this is ordinary POSIX path
  resolution, not a behavior any `O_CREAT`/`O_EXCL`-style flag can disable;
  `O_NOFOLLOW`-equivalent protections (like `wx`'s EEXIST-on-symlink
  behavior this codebase already relies on in `createIfAbsent`) only ever
  guard the FINAL path component. A write-path symlink guard must therefore
  walk and `lstatSync` every ANCESTOR segment explicitly — checking only the
  final component (as `createIfAbsent` already did) misses the ancestor-
  directory case entirely, which is exactly the gap LORE-76's task
  description called out (LORE-76, 2026-07-21).
- **A reviewer-suggested "nearly free" close for a residual gap (a helper
  already exists in the same file!) is NOT automatically in-task, even
  under this campaign's own "same code + precedented fix → fix in-task"
  rule** — check whether adopting it would touch behavior with its OWN
  extensively-tested existing invariants (here: `writeAllOrRollback`'s
  rollback correctness, pinned by several dedicated regression tests) that
  a mechanical swap could silently violate without careful
  re-verification. "The idea is simple" and "verifying it's still correct
  is simple" are different claims — when they diverge, and the review
  itself frames the finding as explicitly non-blocking, prefer documenting
  a follow-up over expanding the current PR's diff and review surface
  (LORE-76, 2026-07-21).

## Session log

- 2026-07-19 — session 0 (init): tracker created. Queue = LORE-67, 61, 62, 63,
  64, 65, 66 (user-confirmed); merge gate = self-merge (user-confirmed).
  LORE-42/43/44/45 parked as deferred-by-decision. Preconditions verified:
  `.claude/handovers/` gitignored (.gitignore:52), `archive/handovers/` exists
  and tracked, dev clean @ 305efa8, no leftover feature/* branches.
- 2026-07-19 — session 1: resolved LORE-67 (docs-only cli-surface.md +
  ADR-0013 fixes; see Resolved table). Branch `feature/LORE-67` off
  `dev @ 6d7a38e`. Cursor advanced to LORE-61.
- 2026-07-19 — session 2: resolved LORE-61 (step_fail helper + failure-output
  contract, incl. LORE-58 induced partial failure; see Resolved table).
  Branch `feature/LORE-61` off `dev @ b0702d8`. Cursor advanced to LORE-62.
- 2026-07-20 — session 3: resolved LORE-62 (three new real-binary E2E phases;
  see Resolved table). Branch `feature/LORE-62` off `dev @ b1f0784`. Two new
  campaign conventions recorded (jq any/all over bare generators; one-physical-
  line jq filters for step_json/step_fail). Cursor advanced to LORE-63.
- 2026-07-20 — session 4: resolved LORE-63 (reconciliation value-assertions,
  managed-block body drift, custom status flows, .lore/config.toml overrides;
  see Resolved table). Branch `feature/LORE-63` off `dev @ bf3b641`. Two new
  campaign conventions recorded (anchor status-value greps on the row's own
  link-text bracket; isolate a reconciliation-config probe onto a fresh,
  singly-linked concept). Cursor advanced to LORE-64.
- 2026-07-20 — session 5: resolved LORE-64 (populated-profile E2E coverage:
  custom type + template, required field, schema export, malformed profile;
  see Resolved table). Branch `feature/LORE-64` off `dev @ e1ccbf5`. Filed
  LORE-68 for a real, unrelated pre-existing broken-link bug the harness run
  surfaced (kept unqueued per user confirmation). Three new campaign
  conventions recorded (lore new cannot populate custom fields; a full schema
  export prunes orphaned type schemas across a profile switch; assert
  invariance via before/after diff, not a bare exit-code assumption, when
  proving a command is unaffected by a surface under test). Cursor advanced
  to LORE-65.
- 2026-07-20 — session 6: resolved LORE-65 (field-isolated read-backs +
  multi-doc SET/REPLACE, backlog-side file moves via task archive, ADR-0012
  commit scoping incl. the :(literal) pathspec guard, nested-checkout
  --show-prefix translation; see Resolved table). Branch `feature/LORE-65`
  off `dev @ 8b85c1f`. Two new campaign conventions recorded (--title edit
  never renames a task's file; sanitizeFilename strips glob metachars from
  CLI-driven titles). Cursor advanced to LORE-66.
- 2026-07-20 — session 7: resolved LORE-66 (docker/e2e command-surface tail +
  housekeeping — the LAST queued item of the first campaign; see Resolved
  table). Branch `feature/LORE-66` off `dev @ 18b516f`. Three research forks
  dispatched before implementation went beyond their read-only directive and
  wrote code directly into run-e2e.sh; caught, the two still-running ones
  stopped, and every line independently re-verified against source. Five new
  campaign conventions recorded (lore's own pre-release version is genuinely
  0.0.0; replace's managed-region registry only protects lore:index, not
  lore:tasks; unlink's --doc omission on a single-entry task is a documented
  tradeoff, not a bug; query filter tests need a genuine negative control; a
  forked subagent can override even an explicit research-only directive).
  Queue emptied — first campaign complete.
- 2026-07-20 — init (fresh queue, this skill): re-ran `/backlog-handover init`
  under the standard `backlog-handover` skill (superseding the prior session's
  bespoke process — same conventions, formalized). Inventoried every non-Done
  task via `backlog task list --plain`: only LORE-68 is agent-resolvable and
  not deferred-by-decision (LORE-42/43/44/45 unchanged, still deferred). User
  confirmed queue = [LORE-68] only, and to reuse this tracker doc (doc-1)
  rather than create a new one. Cursor advanced to LORE-68. Recorded one more
  durable convention (no `code-reviewer` subagent type registered in this
  project's Agent tool — use `general-purpose` for lifecycle step 6 review).
  First handover written for LORE-68.
- 2026-07-20 — session 8: resolved LORE-68 (see Resolved table). Branch
  `feature/LORE-68` off `dev @ eda8a6a`. This was the first `src/` change of
  the whole E2E-coverage sub-campaign — the filing task's own dash-vs-space
  hypothesis was wrong; the real cause was a coordinate-space bug in
  `src/core/rewrite.ts`. Three new campaign conventions recorded (a
  reconciliation-config probe must also reset the task's REAL status, not
  just the config, or a later full check throws; how to build the real
  `--json`-capable backlog binary without docker for a fast headless repro;
  a moved-file's own outbound-link recompute must resolve in the
  REPO-relative coordinate space, not the bundle-relative one). Second
  campaign complete — queue empty, only LORE-42/43/44/45 remain, all
  deferred by recorded product decision.
- 2026-07-21 — init (third campaign): a full-codebase Codex second-opinion
  review (separate session, see `backlog/docs/reviews/doc-2`) surfaced 201
  confirmed findings; the 20 high-severity ones became 19 new backlog tasks
  (LORE-69..87, one pair of duplicate findings merged into LORE-73), all
  filed To Do with acceptance criteria. Inventoried every non-Done task:
  LORE-69..87 are agent-resolvable now; LORE-42/43/44/45 remain unchanged in
  "Not queued." User confirmed the proposed queue order (independent fixes
  first, the LORE-78/79/80 rename-traversal cluster last) and reuse of this
  tracker doc (doc-1). Cursor advanced to LORE-70. Recorded one new
  convention: LORE-78/79/80 are three layers of the same gap, read all three
  before starting any one. Committed the review doc + 19 task files directly
  to dev @ b11bd0d (docs/task-metadata housekeeping, not campaign code, so no
  branch/PR). `.repro-scratch/` (disposable review-verification scratch) and
  `docs/.obsidian/` (pre-existing, unrelated) both left untracked/untouched
  per the user's own steer this session. First handover being written for
  LORE-70.
- 2026-07-21 — session 9: resolved LORE-70 (see Resolved table). Branch
  `feature/LORE-70` off `dev @ c1b298f`. One new campaign convention recorded
  (a real subprocess truncation repro needs a downstream-process pipe, not
  Bun.spawnSync's own direct capture, or the test passes even against broken
  code). Cursor advanced to LORE-86.
- 2026-07-21 — session 10: resolved LORE-86 (see Resolved table). Branch
  `feature/LORE-86` off `dev @ e4243d8`. One new campaign convention recorded
  (check whether managed-block.ts already solved a "malformed input
  recovery" problem in the identically-shaped way before inventing a new
  fail-loud pattern). Cursor advanced to LORE-87.
- 2026-07-21 — session 11: resolved LORE-87 (see Resolved table). Branch
  `feature/LORE-87` off `dev @ c73d1ce`. One new campaign convention recorded
  (a raw-source structural scan in rewrite.ts can only reuse a parsed node's
  children offsets when that mdast node type actually has children —
  definition nodes don't, so they need their own escape-aware scan). Cursor
  advanced to LORE-83.
- 2026-07-21 — session 12: resolved LORE-83 (see Resolved table). Branch
  `feature/LORE-83` off `dev @ 8a11f2f`. One new campaign convention recorded
  (a hand-rolled TOML/JSON grammar validator that reads known keys by name
  needs an explicit unknown-key rejection gate on any fixed-vocabulary
  nested table, or a typo silently no-ops instead of erroring). Cursor
  advanced to LORE-84.
- 2026-07-21 — session 13: resolved LORE-84 (see Resolved table). Branch
  `feature/LORE-84` off `dev @ 02d4959`. Larger than recent sessions — 9
  `loadBundle` callers updated, plus a documented, necessary reordering of
  `sync.ts`'s LORE-27 error-precedence contract (one existing test updated
  with an explanation, not silently broken). Two new campaign conventions
  recorded (check every caller individually for a pre-existing ordering
  contract before a mechanical multi-caller edit; document — don't silently
  fix or silently ignore — a genuinely separate adjacent gap a fix
  surfaces). Flagged (not filed, no live user turn to confirm) a follow-up
  candidate: `core/rewrite.ts`'s `rewriteInbound` still serializes with the
  default profile, unlike `loadBundle`'s now-fixed read path — see the
  Not-queued section. Cursor advanced to LORE-82.
- 2026-07-21 — session 14: resolved LORE-82 (see Resolved table). Branch
  `feature/LORE-82` off `dev @ d249584`. Closely related to LORE-84 (both
  touch `loadBundle`/its callers). Two new campaign conventions recorded
  (a warning-based refusal decision needs a structured `WarningCollector`
  signal, not string-matching — no existing precedent for the latter
  despite a stale docstring claim; gate a mutation command's completeness
  check on that specific command's actual write dependency, not a blanket
  "it's a mutation command" assumption — `supersede`'s check is
  `--rewrite-links`-gated, `rename`'s is unconditional). Cursor advanced
  to LORE-85.
- 2026-07-21 — session 15: resolved LORE-85 (see Resolved table). Branch
  `feature/LORE-85` off `dev @ 01b09e0`. First security-labeled task this
  campaign (YAML anchor-bomb DoS). Three new campaign conventions recorded
  (enforce a resource-exhaustion bound at the cheapest/shared choke point,
  not every downstream call site; verify a third-party library's ACTUAL
  installed option surface directly rather than assuming a feature exists
  by name-recognition from a similar library; an exponential-blowup budget
  check must be a genuinely non-memoized walk, with SEPARATE path-scoped
  cycle detection since a budget alone doesn't terminate on a true cycle).
  Cursor advanced to LORE-69.
- 2026-07-21 — session 16: resolved LORE-69 (see Resolved table). Branch
  `feature/LORE-69` off `dev @ 2da713a`. Second security-labeled task this
  campaign (`..` pathspec traversal past the backlog/ commit-scope guard).
  Independent adversarial review found and the session fixed a genuine
  bypass of the first fix attempt (an embedded NUL byte defeating
  `posix.normalize` via exec-boundary argv truncation) before merge — the
  review process caught a real, live, reproducible vulnerability the initial
  implementation missed. Two new campaign conventions recorded (normalize a
  candidate path BEFORE a containment prefix check and use the normalized
  form downstream, not just for validation, plus the general "does a byte
  the validator treats as data cause the downstream CONSUMER to truncate/
  reinterpret the string" question to ask at every exec/argv/FFI boundary —
  flagged CRITICAL for every remaining security-labeled queue item; a
  symlink already inside the guarded directory does not bypass this
  specific guard, a distinct risk class from LORE-76/77's write-through-
  symlink gap). Cursor advanced to LORE-72.
- 2026-07-21 — session 17: resolved LORE-72 (see Resolved table). Branch
  `feature/LORE-72` off `dev @ 7692e77`. Third security-labeled task this
  campaign. Applied LORE-69's freshly-recorded cross-platform-validation
  convention proactively during implementation (not caught by review this
  time) — checking `win32.isAbsolute` unconditionally caught a real gap in
  the first-draft fix (a Windows drive-letter `--template` value, inert on
  this POSIX host, genuinely absolute on the project's real Windows release
  target), confirmed via a test that failed against the first draft. Also
  explicitly verified (and confirmed not applicable, no fix needed) whether
  LORE-69's NUL-byte exec-boundary trick applied here — it doesn't, since
  `readFileSync` throws synchronously on an embedded NUL rather than
  truncating at an exec/argv boundary. Independent adversarial review found
  no bypass of the fix's own AC scope, but surfaced a real, separate symlink-
  read gap (a symlink planted inside `.lore/templates/` bypasses containment
  entirely) and a profile-declared-template gap — both explicitly outside
  this task's AC and recommended not to block the PR on; documented as a
  Not-queued follow-up candidate (symlink) and a noted-but-excluded finding
  (profile), not silently fixed or ignored. One doc-comment accuracy fix
  applied from the review (no logic change). Three new campaign conventions
  recorded (confirmation that the LORE-69 cross-platform/NUL-boundary
  convention generalizes and pays off when applied proactively; how to
  decide whether an out-of-scope review finding belongs in-task vs. as a
  flagged follow-up; check a candidate follow-up against ALL nearby queued
  items' actual AC wording, not just their title, before assuming overlap
  or non-overlap). Cursor advanced to LORE-71.
- 2026-07-21 — session 18: resolved LORE-71 (see Resolved table). Branch
  `feature/LORE-71` off `dev @ fa3a4eb`. Fourth security-labeled task this
  campaign, and the first genuinely new capability (an IP-range classifier
  + a second injectable IO seam), not just a containment fix on an existing
  path. Self-caught (not review) a real implementation bug where the new
  destination check sat outside the existing fetch try/catch, silently
  crashing the whole liveness probe on any DNS fault — every pre-existing
  test failed until fixed, since their placeholder hostnames genuinely
  don't resolve. Three new campaign conventions recorded (share one
  try/catch between a new IO seam and the old one it sits beside, don't
  split them; give shared test option-builders a safe default fake for
  ANY newly-introduced injectable seam, not just the one a fix's own ACs
  are about; classify a literal IP directly rather than routing it through
  an injectable resolver, so the guard's correctness never depends on a
  test fake actually inspecting its input). Cursor advanced to LORE-76.
- 2026-07-21 — session 19: resolved LORE-76 (see Resolved table). Branch
  `feature/LORE-76` off `dev @ 2a671b0`. Fifth security-labeled task this
  campaign, and the first write-path (not read-path) symlink fix. Live
  pre-fix repro against the real CLI reproduced both AC scenarios exactly
  (a symlinked ancestor directory, a symlinked final target under
  `--force`) before fixing. Two new campaign conventions recorded (scope a
  symlink-write guard to the narrowest shared primitive actually needed by
  this task, not the widest-reach helper that happens to touch the
  vulnerable code, even when patching the wider one looks like "more
  coverage for free"; a write-path symlink guard must walk every ANCESTOR
  path segment via `lstatSync`, not just the final component, since
  standard mkdir/write syscalls always transparently resolve an
  intermediate symlink and no `O_CREAT`-style flag can prevent that).
  Independent adversarial review found NO bypass after extensive testing
  (symlink loops, mid-plan attack ordering, path-normalization checks,
  independently re-verified scope-boundary claim) — the first review this
  campaign that confirmed a fix clean on the first pass, no fix-and-
  re-review round needed. Flagged one narrow, explicitly non-blocking
  TOCTOU gap in the `--force` branch; documented as a Not-queued follow-up
  rather than fixed in-task, since closing it would touch
  `writeAllOrRollback`'s already-extensively-tested rollback invariants and
  the review itself framed it as non-blocking. One more campaign convention
  recorded (a reviewer's "nearly free" suggested close using an existing
  same-file helper is not automatically in-task — check whether adopting it
  touches OTHER already-tested invariants first). Cursor advanced to
  LORE-77.

---
id: doc-1
title: Backlog campaign tracker
type: other
created_date: '2026-07-19 23:15'
updated_date: '2026-07-21 08:47'
---
# Backlog campaign tracker

One issue per session. Protocol: restore → take the cursor issue → feature-branch
lifecycle → advance cursor → append session log → write handover.

## Cursor

**Next issue: LORE-70** — queue order confirmed by the user on 2026-07-21
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
| 1 | LORE-70 | bug | process.exit() after run() can truncate large piped --json output |
| 2 | LORE-86 | bug | lore sync can silently delete prose between duplicate/malformed managed-block markers |
| 3 | LORE-87 | bug | rewriteInbound mis-locates a reference-definition destination when the label has an escaped `]` |
| 4 | LORE-83 | bug | profile.toml silently ignores unknown/misspelled field attribute keys |
| 5 | LORE-84 | bug | loadBundle never uses a project's custom .lore/profile.toml |
| 6 | LORE-82 | bug | loadBundle silently skips unreadable directories; mutations commit against an incomplete graph |
| 7 | LORE-85 | bug | Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor bomb) |
| 8 | LORE-69 | bug | commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal |
| 9 | LORE-72 | bug | lore new --template allows path traversal to read arbitrary files |
| 10 | LORE-71 | bug | lore check --external is vulnerable to SSRF via unrestricted fetch() |
| 11 | LORE-76 | bug | lore scaffold --force writes follow symlinks, escaping the repo root |
| 12 | LORE-77 | bug | lore init follows pre-existing symlinks at scaffold paths, escaping the repo root |
| 13 | LORE-73 | bug | lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap) |
| 14 | LORE-74 | bug | lore orphans report has no output cap, contradicting the documented truncation contract |
| 15 | LORE-75 | bug | lore schema export --out can irreversibly delete unrelated files outside its own directory |
| 16 | LORE-80 | bug | rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root |
| 17 | LORE-79 | bug | lore rename destination path is not confined to docs/ root at the command layer |
| 18 | LORE-78 | bug | lore rename destination id is not validated for `..` traversal at the argument-parsing layer |
| 19 | LORE-81 | bug | lore rename index <new> (renaming FROM the reserved root index) is not rejected |

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

## Not queued — needs a human / blocked

- LORE-42 (lore mcp server): deferred by recorded product decision (ADR-0004 CLI-first; milestone m-7). Un-deferring is a user decision, not a campaign step.
- LORE-43 (Confluence one-way publish adapter): deferred by recorded product decision (ADR-0016; milestone m-8).
- LORE-44 (Confluence production mirror): deferred (milestone m-9) AND blocked on LORE-43 (also deferred).
- LORE-45 (typed importable library build): deferred per ECK-alignment follow-up — its own notes say revisit ONLY if a real in-process import need appears.

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

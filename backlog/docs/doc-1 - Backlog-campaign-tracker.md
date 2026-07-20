---
id: doc-1
title: Backlog campaign tracker
type: other
created_date: '2026-07-19 23:15'
updated_date: '2026-07-20 15:50'
---
# Backlog campaign tracker

One issue per session. Protocol: restore → take the cursor issue → feature-branch
lifecycle → advance cursor → append session log → write handover.

## Cursor

**Next issue: LORE-66** — queue order confirmed by the user on 2026-07-19
(selected "67 first, then 61–66 (Recommended)" — LORE-67 docs-only shakes down
the campaign loop, then LORE-61 whose `step_fail` helper LORE-62/66 depend on,
then 62 → 63 → 64 → 65 → 66 by dependency and priority); do not re-ask before
taking the next item.

**Merge gate: self-merge (skill default)** — confirmed by the user on 2026-07-19
(selected "Self-merge (skill default)"): each session reviews adversarially,
opens the PR into `dev`, and merges immediately (`gh pr merge --rebase
--delete-branch`); the PR is an audit trail, not an approval gate. CI runs
post-merge on dev.

## Queue (confirmed order)

| # | Issue | Type | One-line note |
| --- | --- | --- | --- |
| 1 | LORE-66 | e2e | Command-surface tail + housekeeping: vacuous replace/supersede, check --json/F2, flag long-tail, pseudo-cache step (depends on LORE-61, now Done) |

## Resolved

| # | Issue | Status/date/session | Evidence summary |
| --- | --- | --- | --- |
| 1 | LORE-67 | Done, 2026-07-19, session 1 | cli-surface.md init/new/check/replace sections corrected to match src/commands/{init,new,check,replace}.ts (dropped --force/exit-5/probe, --epic/--story/--resource, --fix, the fabricated replace exit-6 gate; also fixed 2 more false init claims found during re-verification and an example line using a removed flag). AC5: ADR-0013's dead `[validate]` config knobs (src/config.ts:65-70) corrected from a false "consumed by the drift gate" claim to "parsed but not wired to any command." Verified: `lore check --plain` → 38 files/0 errors/0 warnings; `bun test` → 1500 pass/0 fail. |
| 2 | LORE-61 | Done, 2026-07-19, session 2 | Added `step_fail` (exit code + empty stdout + jq filter over the LAST line of stderr) to docker/e2e/run-e2e.sh; wired into the five exit-class spot checks (error_type literals) and a new LORE-58 induced write-failure pair (link + unlink) proving validation and drift genuinely share exit 6 but distinct error_type. Two real findings surfaced by running the real binary (not doc-assumed): stderr can carry `warning: ...` advisory lines ahead of the JSON envelope (loadBundle scans); `lore validate`/`check` are gates that report findings as stdout data, never a thrown ErrorEnvelope (the filing task's own exit-6 assumption was wrong — fixed by adding a genuinely-thrown validation case via a malformed `.lore/config.toml` fed through `lore sync`). Independent adversarial review: no blocking findings, one nice-to-have applied (exact vs prefix match on the induced-failure task's file lookup). Verified: `docker compose -f docker/e2e/docker-compose.yml up --build` green twice (88 passed/0 failed, exit 0; `down -v` clean both times); `bun test` 1500 pass/0 fail. |
| 3 | LORE-62 | Done, 2026-07-20, session 3 | Extended docker/e2e/run-e2e.sh with three real-binary phases: (1) probeBacklog's present-but-incapable exit-6 branch via two PATH-shadowed stub `backlog` binaries (below-floor version; version-capable but non-JSON); (2) raw missing-task signatures (`task view`/`task edit` of a nonexistent id) plus their lore-level consequences — link fail-before-write, and a genuine sync-vs-check asymmetry: a vanished linked task drives `sync` fail-loud with EMPTY stdout but `check` ALSO exits 3 while still emitting its check.report to stdout first (confirmed against src/commands/check.ts and test/check.test.ts's own regression test) — plus `tasks`'s soft-drop; (3) renaming the linked Story (not just the unlinked Reference doc) to exercise moveBackRefs, the per-write backlog commit, and the F1 exit-6-by-return asymmetry (rename.ts:203) under an induced back-ref failure. First harness run surfaced 4 bugs in the new shell assertions themselves (a jq filter broken by an embedded literal backslash-newline, a wrong stderr-emptiness assumption, a wrong bundle directory name, an uppercase/lowercase task-id mismatch) — fixed and reverified green. Independent adversarial review then found one more real issue: the F1 jq filter's `and`-with-generator construction only checked jq's LAST array element (passed today only by coincidence) — fixed to `any(...)`. Verified: three full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, final 108 passed/0 failed, exit 0, `down -v` clean every time; `bun test` 1500 pass/0 fail throughout (no src/ changes this task). |
| 4 | LORE-63 | Done, 2026-07-20, session 4 | Closed 4 reconciliation coverage gaps in docker/e2e/run-e2e.sh: (1) Phase 6's first post-mutation sync now asserts filesChanged >= 1, and the rendered managed-block rows are value-asserted against concrete status literals (TASK1→"In Progress", TASK2→"Done"); (2) Phase 9 now also induces managed-block BODY drift (a corrupted rendered status cell, distinct from the pre-existing frontmatter-status sed), caught by check (exit 6) and healed by sync; (3) new Phase 15c: a custom, non-default 4-status flow ("Review" inserted between "In Progress"/"Done") written directly to backlog/config.yml — confirmed against the real local backlog v1.48.0 binary that `backlog config set statuses ...` refuses, there is no CLI setter — reconciles end-to-end on a freshly-created, singly-linked Story (isolated so the rollup is driven purely by one task), and a malformed statuses: shape fails loud (exit 6, validation) via parseStatusFlow; (4) the same isolated Story exercises .lore/config.toml's [reconcile.overrides]: an override to a status DIFFERENT from what flow position would produce proves the override is actually honored (not coincidence), and an invalid override target fails loud (exit 6, validation) via core/reconcile.ts's own check. Independent adversarial review found and fixed 2 real issues before the final run: unanchored substring greps for the new status-value checks (also matched the frontmatter tasks: line; could prefix-collide past 9 tasks) — fixed to anchor on the row's literal "[TASK-n]" link-text bracket; and a dormant status drift left on the probe Story after the override test — fixed by re-heal-syncing it and restoring backlog/config.yml at the end of the phase. Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs (125/0 failed, then 127/0 failed after the review fixes), `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |
| 5 | LORE-64 | Done, 2026-07-20, session 5 | Added Phase 17b to docker/e2e/run-e2e.sh exercising the declarative profile subsystem's populated-profile path: a custom type + custom .lore/templates/ file (AC1: lore new succeeds, body from the custom template not the generic fallback); a profile-declared required field failing then passing lore validate on a hand-authored doc, since `lore new` can never populate a custom frontmatter field itself (AC2); lore schema export emitting the custom-slug schema with the field in its `required` list, confirmed empirically by compiling a real profile (AC3); a malformed profile (zero [[types]], profile.ts's own documented fail-loud case) making lore new/validate/sync fail loud at exit 6 while lore check — confirmed via source to never call loadProfile — stays byte-identical before/after (AC4, rewritten from a naive "exit 0" assumption after a real run disproved it, see below). Discovered a genuine, real interaction: a full `lore schema export` PRUNES any schema whose type the active profile no longer declares, so introducing then removing the custom profile pruned Phase 17's six default schemas — fixed by re-exporting once more after removing the custom profile, regenerating the six defaults and pruning the orphaned custom one. A first harness run also surfaced a real but UNRELATED pre-existing bug: `lore check` already reports 2 broken-link findings in stories/e2e-renamed-story-f1.md (backlog/tasks/ dash-vs-space filename mismatch) left over from the Phase 15b rename/F1 sequence, never re-checked by any later phase — filed separately as LORE-68 (kept unqueued per user confirmation, out of this task's scope), and AC4's check-invariance test rewritten to diff `lore check --json` output before/after the malformed profile rather than assume a clean baseline. Independent adversarial review found no genuine defects (one harmless dead-variable assignment fixed). Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, both 148 passed/0 failed, exit 0, `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |
| 6 | LORE-65 | Done, 2026-07-20, session 6 | Added four phases to docker/e2e/run-e2e.sh: Phase 4b (AC1) field-isolated real-record read-backs of the doc: label and --doc path (checked separately, not via lore's self-reported status) plus a multi-doc SET/REPLACE case (one task linked from two Stories) pinning preserve-the-other-doc semantics on both link and unlink; Phase 4c (AC2) documents that a `--title` edit does NOT rename the task file (the filing task's premise was wrong — verified against the pinned fork's own file-system/operations.ts saveTask, whose shouldPreservePath branch reuses the existing filePath on edit), then exercises the REAL file-move operation (`task archive`, a genuine rename() to backlog/archive/tasks/) on a linked task, pinning that it mirrors LORE-62's already-established vanished-task signature (sync not_found/exit 3/empty stdout; check exits 3 but emits its report first; tasks soft-drops it); Phase 4d (AC3) inspects a lore-authored commit's file list directly (backlog/ only), proves a pre-staged unrelated file survives a scoped commit unswept, and proves the :(literal) pathspec guard handles a backlog/ filename manually renamed to carry glob metacharacters byte-for-byte (the filing task's "metachar-titled task" technique was also disproven — Backlog's own sanitizeFilename strips ()[] entirely and turns * into a hyphen, so no CLI-driven title can ever produce such a filename); Phase 24b (AC4) builds a wholly separate nested-checkout fixture (an outer git repo with the lore+backlog project one directory down) exercising porcelainPaths' --show-prefix translation via both `lore link`'s per-write commit and `lore sync`'s catch-all sweep, previously dead in every other phase. Two new campaign conventions recorded (see below). Independent adversarial review found no functional test-logic defects (one misleading comment fixed). Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, both 200 passed/0 failed, exit 0, `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |

## Not queued — needs a human / blocked

- LORE-42 (lore mcp server): deferred by recorded product decision (ADR-0004 CLI-first; milestone m-7). Un-deferring is a user decision, not a campaign step.
- LORE-43 (Confluence one-way publish adapter): deferred by recorded product decision (ADR-0016; milestone m-8).
- LORE-44 (Confluence production mirror): deferred (milestone m-9) AND blocked on LORE-43 (also deferred).
- LORE-45 (typed importable library build): deferred per ECK-alignment follow-up — its own notes say revisit ONLY if a real in-process import need appears.
- LORE-68 (docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links after the LORE-62 F1 rename sequence): filed 2026-07-20 during LORE-64's session (a real, verified, pre-existing bug the harness run surfaced — see LORE-64's Resolved row). Kept unqueued per explicit user confirmation on 2026-07-20 (asked because filing it without approval deviated from the task-finalization guide); pick it up only if the user asks to queue it.

## Campaign conventions (durable, verified 2026-07-19)

- Every E2E task (LORE-61..66) must verify with a full real-binary harness run:
  `docker compose -f docker/e2e/docker-compose.yml up --build` (green required,
  ~2-3 min), then ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v`.
  A green `bun test` alone is NOT sufficient evidence for harness changes.
- LORE-67 is docs-only: drive docs/ edits per the repo's lore CLI conventions
  (`lore instructions`, the lore skill) and re-verify each stale claim against
  current source before editing.
- Commits: Conventional Commits with the LORE-N scope (repo convention), plus
  the session's standard co-author/session trailers.
- `docs/.obsidian/` sits untracked in the working tree, pre-existing and
  unrelated — leave it alone.
- All seven queue tasks originate from the 2026-07-19 multi-agent E2E coverage
  audit (filed at dev @ 305efa8); each task description is self-contained with
  file:line evidence, but re-verify file:line references against current HEAD
  before editing — LORE-61 confirmed the filing task's own line numbers stayed
  accurate, but also found one of its own semantic assumptions (validate's
  exit 6 being the error_type=validation ErrorEnvelope case) was wrong.
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
  read at all (LORE-63).
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

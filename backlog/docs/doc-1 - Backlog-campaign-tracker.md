---
id: doc-1
title: Backlog campaign tracker
type: other
created_date: '2026-07-19 23:15'
updated_date: '2026-07-20 13:02'
---
# Backlog campaign tracker

One issue per session. Protocol: restore → take the cursor issue → feature-branch
lifecycle → advance cursor → append session log → write handover.

## Cursor

**Next issue: LORE-64** — queue order confirmed by the user on 2026-07-19
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
| 1 | LORE-64 | e2e | LORE-46 declarative profile subsystem — zero populated-profile E2E |
| 2 | LORE-65 | e2e | Coupling mediums: field-isolated read-backs, multi-doc SET semantics, backlog-side renames/archive, commit scoping, nested checkout |
| 3 | LORE-66 | e2e | Command-surface tail + housekeeping: vacuous replace/supersede, check --json/F2, flag long-tail, pseudo-cache step (depends on LORE-61, now Done) |

## Resolved

| # | Issue | Status/date/session | Evidence summary |
| --- | --- | --- | --- |
| 1 | LORE-67 | Done, 2026-07-19, session 1 | cli-surface.md init/new/check/replace sections corrected to match src/commands/{init,new,check,replace}.ts (dropped --force/exit-5/probe, --epic/--story/--resource, --fix, the fabricated replace exit-6 gate; also fixed 2 more false init claims found during re-verification and an example line using a removed flag). AC5: ADR-0013's dead `[validate]` config knobs (src/config.ts:65-70) corrected from a false "consumed by the drift gate" claim to "parsed but not wired to any command." Verified: `lore check --plain` → 38 files/0 errors/0 warnings; `bun test` → 1500 pass/0 fail. |
| 2 | LORE-61 | Done, 2026-07-19, session 2 | Added `step_fail` (exit code + empty stdout + jq filter over the LAST line of stderr) to docker/e2e/run-e2e.sh; wired into the five exit-class spot checks (error_type literals) and a new LORE-58 induced write-failure pair (link + unlink) proving validation and drift genuinely share exit 6 but distinct error_type. Two real findings surfaced by running the real binary (not doc-assumed): stderr can carry `warning: ...` advisory lines ahead of the JSON envelope (loadBundle scans); `lore validate`/`check` are gates that report findings as stdout data, never a thrown ErrorEnvelope (the filing task's own exit-6 assumption was wrong — fixed by adding a genuinely-thrown validation case via a malformed `.lore/config.toml` fed through `lore sync`). Independent adversarial review: no blocking findings, one nice-to-have applied (exact vs prefix match on the induced-failure task's file lookup). Verified: `docker compose -f docker/e2e/docker-compose.yml up --build` green twice (88 passed/0 failed, exit 0; `down -v` clean both times); `bun test` 1500 pass/0 fail. |
| 3 | LORE-62 | Done, 2026-07-20, session 3 | Extended docker/e2e/run-e2e.sh with three real-binary phases: (1) probeBacklog's present-but-incapable exit-6 branch via two PATH-shadowed stub `backlog` binaries (below-floor version; version-capable but non-JSON); (2) raw missing-task signatures (`task view`/`task edit` of a nonexistent id) plus their lore-level consequences — link fail-before-write, and a genuine sync-vs-check asymmetry: a vanished linked task drives `sync` fail-loud with EMPTY stdout but `check` ALSO exits 3 while still emitting its check.report to stdout first (confirmed against src/commands/check.ts and test/check.test.ts's own regression test) — plus `tasks`'s soft-drop; (3) renaming the linked Story (not just the unlinked Reference doc) to exercise moveBackRefs, the per-write backlog commit, and the F1 exit-6-by-return asymmetry (rename.ts:203) under an induced back-ref failure. First harness run surfaced 4 bugs in the new shell assertions themselves (a jq filter broken by an embedded literal backslash-newline, a wrong stderr-emptiness assumption, a wrong bundle directory name, an uppercase/lowercase task-id mismatch) — fixed and reverified green. Independent adversarial review then found one more real issue: the F1 jq filter's `and`-with-generator construction only checked jq's LAST array element (passed today only by coincidence) — fixed to `any(...)`. Verified: three full `docker compose -f docker/e2e/docker-compose.yml up --build` runs, final 108 passed/0 failed, exit 0, `down -v` clean every time; `bun test` 1500 pass/0 fail throughout (no src/ changes this task). |
| 4 | LORE-63 | Done, 2026-07-20, session 4 | Closed 4 reconciliation coverage gaps in docker/e2e/run-e2e.sh: (1) Phase 6's first post-mutation sync now asserts filesChanged >= 1, and the rendered managed-block rows are value-asserted against concrete status literals (TASK1→"In Progress", TASK2→"Done"); (2) Phase 9 now also induces managed-block BODY drift (a corrupted rendered status cell, distinct from the pre-existing frontmatter-status sed), caught by check (exit 6) and healed by sync; (3) new Phase 15c: a custom, non-default 4-status flow ("Review" inserted between "In Progress"/"Done") written directly to backlog/config.yml — confirmed against the real local backlog v1.48.0 binary that `backlog config set statuses ...` refuses, there is no CLI setter — reconciles end-to-end on a freshly-created, singly-linked Story (isolated so the rollup is driven purely by one task), and a malformed statuses: shape fails loud (exit 6, validation) via parseStatusFlow; (4) the same isolated Story exercises .lore/config.toml's [reconcile.overrides]: an override to a status DIFFERENT from what flow position would produce proves the override is actually honored (not coincidence), and an invalid override target fails loud (exit 6, validation) via core/reconcile.ts's own check. Independent adversarial review found and fixed 2 real issues before the final run: unanchored substring greps for the new status-value checks (also matched the frontmatter tasks: line; could prefix-collide past 9 tasks) — fixed to anchor on the row's literal "[TASK-n]" link-text bracket; and a dormant status drift left on the probe Story after the override test — fixed by re-heal-syncing it and restoring backlog/config.yml at the end of the phase. Verified: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs (125/0 failed, then 127/0 failed after the review fixes), `down -v` clean both times; `bun test` 1500/1500 throughout (no src/ changes this task). |

## Not queued — needs a human / blocked

- LORE-42 (lore mcp server): deferred by recorded product decision (ADR-0004 CLI-first; milestone m-7). Un-deferring is a user decision, not a campaign step.
- LORE-43 (Confluence one-way publish adapter): deferred by recorded product decision (ADR-0016; milestone m-8).
- LORE-44 (Confluence production mirror): deferred (milestone m-9) AND blocked on LORE-43 (also deferred).
- LORE-45 (typed importable library build): deferred per ECK-alignment follow-up — its own notes say revisit ONLY if a real in-process import need appears.

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

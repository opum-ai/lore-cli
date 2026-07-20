# Handover — resolve LORE-68 (docker/e2e broken backlog/tasks/ links) (LORE-68)

**Date**: 2026-07-20 | **Grounded against**: `dev @ eda8a6a`, clean (only pre-existing untracked `docs/.obsidian/`, leave alone), pushed, up to date with `origin/dev` | **Tracker**: doc-1 (`backlog/docs/doc-1 - Backlog-campaign-tracker.md`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-68 — docker/e2e: renamed-story's managed block carries broken
backlog/tasks/ links after the LORE-62 F1 rename sequence. Queue order
confirmed by the user on 2026-07-20 (queue = [LORE-68] only); do not re-ask.
No feature/LORE-68 branch exists yet — this is a fresh start, not a resume.
```

## State

| Item | Status |
| --- | --- |
| Branch | `dev` (no `feature/LORE-68` branch created yet) |
| Cursor issue | LORE-68, status `To Do`, not yet assigned/In Progress |
| Working tree | clean |
| Open PRs | none |
| Queue | `[LORE-68]` only (confirmed 2026-07-20); LORE-42/43/44/45 remain deferred-by-decision, not in scope |

## Next steps

1. `git checkout -b feature/LORE-68 dev`, mark LORE-68 In Progress + assign, per the skill's per-issue lifecycle step 1-2.
2. Re-read `backlog task view LORE-68 --plain` in full and re-verify its root-cause hypothesis against **current** source before trusting it (established campaign discipline — LORE-61/64/65 all found the filing task's own technical premise was wrong at least once). The filing task guesses the mismatch lives in `src/core/managed-block.ts`'s `renderRow` / `normalizeLink`/`encodePathSegments` chain (`backlog.ts`'s `file` field reported for a task vs. the real on-disk `backlog/tasks/` filename), but says explicitly "not yet confirmed."
3. **AC1**: confirm exactly which side carries the wrong dash-vs-space convention — the adapter-reported task file path, or the real filename Backlog's `sanitizeFilename` produces (recall from the tracker's conventions: Backlog's `sanitizeFilename` strips `()[]` and turns `*` into `-`, but the task title here was created verbatim as "Design the archive endpoint" via `backlog task create`, so the real on-disk file likely uses spaces while lore's stored/reported value has dashes, or vice versa — trace it, don't assume).
4. **AC2**: fix docker/e2e/run-e2e.sh's Phase 15b/16 sequence (the linked-rename + F1-induced-failure + supersede sequence) — or the real root-cause site if it's in `src/` — so a full, unscoped `lore check --json` run right after Phase 17 (schema export) shows 0 broken-link findings. Note LORE-64's session already confirmed the repro: run `lore check --json` against the docker/e2e scratch bundle after Phase 17 and before any profile-subsystem changes, and the 2 broken-link errors on `stories/e2e-renamed-story-f1.md` reproduce.
5. **AC3**: add that full, unscoped `lore check` as a permanent regression-guard step in run-e2e.sh at that point in the script (between Phase 9's drift loop and Phase 24's targeted exit-code checks — nothing currently runs a full unscoped check there, which is *why* this gap went undetected through the whole first campaign).
6. Verify with a full real-binary harness run (`docker compose -f docker/e2e/docker-compose.yml up --build`, always `down -v` after) — the tracker's standing convention (not `bun test` alone) applies to LORE-68 too, per its own AC3 wording.
7. Independent adversarial review of the branch diff before opening the PR (use `general-purpose` subagent — this project's Agent registry has no `code-reviewer` type).
8. PR into `dev`, merge (`gh pr merge --rebase --delete-branch`), sync local `dev`, prune the branch, advance the tracker cursor (queue will be empty again), archive this handover, write the closing note, push `dev`.

## Critical context / traps

- This is a **fresh start**, not a resume — no `feature/LORE-68` branch exists. Don't treat step 0's "leftover branch" check as finding prior work; there is none.
- Whatever the fix touches (`src/core/managed-block.ts`, `src/adapters/backlog.ts`, or purely `docker/e2e/run-e2e.sh`), re-derive the exact current line numbers before editing — every prior E2E task in this campaign found the filing task's own file:line citations went stale between filing and implementation.
- If the root cause turns out to be a genuine `src/` bug (not just a harness sequencing issue), this task will touch `src/` for the first time in the E2E-coverage sub-campaign (LORE-61-66 were all harness-only) — budget for `bun test` regression risk accordingly, and don't assume "harness-only, no src/ changes" the way those tasks' evidence sections did.
- Full campaign conventions (jq `any()`/`all()` over bare generators, one-physical-line jq filters, anchor status greps on `[TASK-n]` link-text, isolate reconciliation-config probes on fresh concepts, `lore new` can't populate custom fields, full `schema export` prunes orphaned type schemas, assert invariance not bare exit codes, `--title` edit never renames a file, `sanitizeFilename` strips glob metachars, `lore --version`'s real value is `0.0.0` pre-release, `replace` only protects `lore:index` not `lore:tasks`, `unlink`'s `--doc` omission on a single-entry task is a documented tradeoff, query filters need negative controls, forked subagents can override read-only directives, no `code-reviewer` agent type here) are all recorded in doc-1's "Campaign conventions" section — read it before implementing, don't re-derive from scratch.

## Do not repeat

- Nothing attempted yet this session — this is the first session against LORE-68.

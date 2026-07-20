# Handover — Backlog campaign session 7: LORE-66 (docker/e2e command-surface tail + housekeeping)

**Date**: 2026-07-20 | **Grounded against**: `dev @ 18b516f`, clean (only pre-existing untracked `docs/.obsidian/`), pushed and in sync with `origin/dev` | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LORE-66 — docker/e2e:
command-surface tail (vacuous replace/supersede steps, check --json/F2 dual
stream, a long flag/lifecycle tail, misleading pseudo-cache step, weak
assertions). This is the LAST item in the confirmed queue (67, 61-66) — once
it resolves, the campaign queue is empty; summarize and suggest `init` for a
fresh queue rather than re-asking for a new queue yourself. Queue order
confirmed by the user on 2026-07-19; do not re-ask. Merge gate: self-merge
(`gh pr merge --rebase --delete-branch` into dev) confirmed by the user on
2026-07-19 — the PR is an audit trail, not an approval gate.

LORE-66 depends on LORE-56 and LORE-61 (both Done). This is an E2E task:
verification REQUIRES the real Docker harness (`docker compose -f
docker/e2e/docker-compose.yml up --build`, ~2-3 min, ALWAYS `docker compose
-f docker/e2e/docker-compose.yml down -v` after, even on failure) — a green
`bun test` alone is NOT sufficient evidence (campaign convention, tracker's
"Campaign conventions" section).

Re-derive every technique against CURRENT source before writing a fixture —
every prior E2E session in this campaign (61/62/63/64/65) found at least one
wrong assumption in its own filing task's description; LORE-65 specifically
found TWO (a `--title` edit does not rename a Backlog task's file; Backlog's
own `sanitizeFilename` strips glob metacharacters from a CLI-driven title,
so a metachar-carrying filename can only be produced by a direct on-disk
rename, not via `backlog task create`/`edit --title`). The filing task cites
`src/commands/check.ts` line numbers (F2 dual-stream shape, ~156-164) and
`docker/e2e/run-e2e.sh` line numbers (replace ~L285-290, supersede
~L303-308, stale-cache step ~L213-215, `lore --version` ~L120, git-log-wc-l
~L226, auto-plain ~L358) — re-locate every one by content/comment before
trusting the number: LORE-65 added ~214 net lines to run-e2e.sh, so every
prior line citation in that file is now stale. Follow `backlog instructions
task-execution` -> `task-finalization` for the task lifecycle.

Two new campaign conventions from the LORE-65 session, apply here too if
relevant: (a) Backlog's real `task edit --title` does NOT rename the task's
file (`saveTask`'s `shouldPreservePath` branch in the pinned fork's
`file-system/operations.ts` reuses the existing `filePath` on any edit) —
irrelevant to LORE-66's own surface, noted only for completeness; (b) when
an E2E task's filing description proposes an induction technique via a
Backlog CLI **title** string, check whether `sanitizeFilename` (or any other
real Backlog input-normalization) would silently neuter it before writing
the fixture — LORE-65's own "metachar-titled task" premise for the
`:(literal)` pathspec guard turned out to be exactly this trap.

LORE-68 (docs/reference broken-link bug LORE-64 discovered) is still NOT
queued — kept unqueued per explicit user confirmation on 2026-07-20. Do not
pick it up as part of this campaign unless the user explicitly asks to
queue it.
```

## State

| Item | Status |
| --- | --- |
| LORE-65 | Done and merged into `dev` (PR #62, rebase-merged). Added four phases to `docker/e2e/run-e2e.sh`: Phase 4b (AC1) field-isolated real-record read-backs of the `doc:` label and `--doc` path (checked separately) plus a multi-doc SET/REPLACE case (one task linked from two Stories) pinning preserve-the-other-doc semantics on both link and unlink; Phase 4c (AC2) documents that `--title` edit does NOT rename the task file (the filing task's premise was wrong — verified against the pinned fork's own `file-system/operations.ts` `saveTask`), then exercises the REAL file-move operation (`task archive`) on a linked task, pinning it mirrors LORE-62's vanished-task signature (sync not_found/exit 3/empty stdout; check exits 3 but emits its report first; tasks soft-drops it); Phase 4d (AC3) inspects a lore-authored commit's file list (backlog/ only), proves an unrelated file survives a scoped commit unswept, and proves the `:(literal)` pathspec guard via a directly-renamed backlog/ filename carrying glob metacharacters (the filing task's "metachar-titled task" technique was also disproven — Backlog's `sanitizeFilename` strips those characters from any CLI title); Phase 24b (AC4) a wholly separate nested-checkout fixture exercising `porcelainPaths`' `--show-prefix` translation via both `lore link`'s per-write commit and `lore sync`'s catch-all sweep. Independent adversarial review found no functional test-logic defects (one misleading comment fixed, `b4c805c`/`12b9d59`). Final verification: 2 full docker/e2e harness runs (200/0 failed, exit 0 both times, `down -v` clean both times); `bun test` 1500/1500 (no `src/` changes). |
| Tracker | doc-1 updated on `dev`: LORE-65 moved to Resolved, cursor advanced to LORE-66, session-log appended, two new campaign conventions recorded (see above). |
| Handover | This session's own consumed handover archived to `archive/handovers/HANDOVER-2026-07-20-backlog-campaign-3.md` (a `-3` suffix — two earlier same-date, same-topic files already occupied the unsuffixed and `-2` names), committed (`18b516f`). Pushed. |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LORE-65` deleted both sides via `gh pr merge --delete-branch`, confirmed via `git fetch --prune` removing the stale local remote-tracking ref). |
| `dev` vs `origin/dev` | In sync — both LORE-65's merge commit and the handover-archive commit (`18b516f`) are pushed. |
| LORE-66 dependencies | LORE-56 and LORE-61, both Done. Fully unblocked, no re-verification needed next session. |
| **Queue after LORE-66**: EMPTY. This is the last confirmed item (67, 61-66). The next session should resolve LORE-66 and then, per the skill's "Queue empty" branch, summarize the full campaign and suggest `/backlog-handover init` for a fresh queue rather than assuming more work. | |
| LORE-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |
| LORE-68 | Still parked in tracker "Not queued" — real, verified, pre-existing broken-link bug, kept unqueued per user confirmation. Do not pick up unless asked. |

## Next steps

1. Per-issue lifecycle on LORE-66 (`backlog task view LORE-66 --plain` for the six ACs): branch `feature/LORE-66` off `dev`, plan on the task.
2. Re-read the CURRENT `docker/e2e/run-e2e.sh` end-to-end before writing anything — every line number the filing task cites is stale after LORE-65's ~214-line addition. Locate the vacuous `replace`/`supersede --rewrite-links` steps, the `lore --version`/git-log-wc-l/auto-plain steps, and the misleading "stale-cache" step by their own comment headers and content.
3. AC1: rewrite the `replace` step so it genuinely matches ≥1 occurrence (`totalMatches >= 1`, `filesChanged >= 1`) with the managed-region protection actually triggered by a match landing inside the block region; cover `--regex`/`--in`/`--dry-run`/an invalid-regex usage-2 case.
4. AC2: give `supersede --rewrite-links` a REAL inbound body link to rewrite so `rewroteLinks == true` is a genuine assertion, not a vacuously-false one; cover the conflict-5 re-run path (run the same supersede twice).
5. AC3: exercise `check --json` (assert `kind == "check.report"`) and pin the F2 dual-stream shape (report envelope on stdout PLUS an ErrorEnvelope on stderr) on a deferred reconciliation error — re-derive the exact mechanics from `src/commands/check.ts` first (re-locate the relevant lines by content, not the filing task's stale ~156-164 citation); this campaign already has a "vanished linked task" induction pattern from LORE-62/65's Phase 5b/4c to reuse or adapt.
6. AC4: work through the flag/lifecycle tail systematically — `sync --dry-run` (writes nothing), `link --no-back-ref`/`unlink --allow-missing`, `init` idempotent re-run, `agents --check`/`--force` + the CLAUDE.md nudge-block prose preservation, `validate --strict`, `check --external` (offline container proves liveness failures never gate — every URL must fail, exit stays 0), `scaffold` re-run/`--force`/unknown-target, multi-root `check` per-root isolation, `query` truncation + zero-hits, and the long-tail one-liners (`new --var/--template/--summary/--tags/--out`, `query --tag/--status/--field`, `tasks --status`, `orphans --docs-only`, `graph --depth`, `instructions` topics + unknown-topic-3, `help` positional + unknown-command-3, `-v`/`-h`, bare `lore`, unknown command, pre-init not-a-lore-project exit 3). Re-verify each command's real flag/behavior against current source before asserting it — do not trust the filing task's flag list at face value.
7. AC5 (housekeeping): rename or delete the "stale-cache" step (tests a mechanism that does not exist — no cross-process probe cache anywhere in the code); make `lore --version` demand a non-`0.0.0` version (mirroring the existing `backlog --version` check); replace the `git log | wc -l > 0` step with a real commit-content check; make the auto-plain step assert ANSI-free piped output; document the not-coverable items (exit-1 uncaught, live Obsidian consumer verification, true TTY pretty rendering) in the runbook header (`docs/runbooks/docker-e2e-testing-environment.md`).
8. AC6: run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green — this is the verification evidence; `bun test` alone does not satisfy any AC here. Iterate EARLY and often against the real harness (2-3 min/cycle), not once at the end.
9. Review the branch diff adversarially (independent subagent, not self-review) before opening the PR — this caught real, non-obvious bugs or comment-accuracy issues in every one of the last five sessions (61/62/63/64/65).
10. Update the tracker on the branch: since the queue is empty after LORE-66, do NOT set "Next issue: <KEY>" to a nonexistent item — record the queue as empty, move LORE-66 to Resolved, append the session-log entry, and note the campaign is complete pending a fresh `init`.
11. Archive this handover (check `archive/handovers/` for a name collision first — the next unsuffixed slot is free since this session used `-3`), write a short closing note (not a paste-ready "next cursor" prompt, since there is none), push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **LORE-66 requires the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- **This is the LAST queued item.** Do not invent additional queue items or silently pull in LORE-68/42/43/44/45 — those are explicitly parked. When LORE-66 resolves, the correct next action is to report campaign completion, not to keep driving.
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- **Line numbers in a filing task's description go stale fast** — LORE-65 alone added ~214 net lines to `run-e2e.sh`. Locate existing phases and the specific steps LORE-66 targets by their own comment headers/content, never by a filing task's cited line numbers.
- **Don't trust a filing task's proposed induction technique or shape assumption at face value** — every E2E session so far (61/62/63/64/65) found at least one wrong assumption in its own filing task's description; LORE-65 found two, both from trusting a Backlog CLI title string would carry through unmodified when Backlog's own input normalization (title→filename sanitization, `--title` never renaming a file) silently disproved the premise.
- **When proving a command is UNAFFECTED by a surface under test, diff before/after output — don't assert a bare exit code/baseline** (LORE-64's lesson, still standing).
- **A step_json/step_fail jq filter must stay on ONE physical line**; `check()`'s `eval "$expr"` can span multiple lines via backslash continuation (LORE-62's lesson).
- **Anchor a status/value grep on the managed-block row's own `"[TASK-n]"` link-text bracket**, never a bare `grep -i "$TASKn"` (LORE-63's lesson).

## Do not repeat

- Multi-line jq filters inside a single-quoted bash string passed directly to `step_json`/`step_fail` — always collapse to one physical line.
- Asserting `[ ! -s <stderr-file> ]` (stderr fully empty) as a proxy for "no error was thrown" — routine `warning: skipping non-concept index.md` advisories land on stderr for every bundle-loading command regardless of success/failure.
- A bare `grep -i "$TASKn"` to prove a rendered STATUS/value in a managed block — anchor on the row's own `"[TASK-n]"` link-text bracket instead.
- Leaving induced test state uncleaned when nothing later re-checks it — even if currently dormant/harmless, it silently breaks the moment a later phase does re-check it. Restore/re-heal before moving on (LORE-65's Phase 4b/4c/4d each explicitly restored or scoped their own induced state; the `/tmp/nested-e2e` fixture in Phase 24b is fully outside the main bundle and self-removed).
- Trusting a filing task's own proposed technique/shape/line-number citations without independently re-reading the actual current source first — LORE-61 through LORE-65 each found at least one wrong assumption this way; LORE-65 found two (the `--title`-renames-file premise, and the metachar-title premise), both caught by reading the pinned fork's real source (`file-system/operations.ts`) BEFORE writing any fixture, saving a wasted docker cycle each time.
- Filing a follow-up backlog task without asking the user first — the task-finalization guide says not to; LORE-64's session did this once (LORE-68) and had to check in retroactively. Ask before creating, not after, when a genuine out-of-scope finding surfaces.
- Assuming a `git diff-tree HEAD` (no `--root`) will show a commit's files when that commit might be the repo's very first (root) commit — it shows nothing without `--root` (LORE-65's own AC4 test bug, caught by the real harness run, not by review).
- Asserting a per-write commit (`lore link`'s scoped `commitBacklogFiles`) leaves the WHOLE `backlog/` tree clean — it deliberately does NOT sweep pre-existing dirty files outside what it wrote (ADR-0012 §1); that's `lore sync`'s catch-all sweep's job. Assert "clean" only after a sync, not after a bare link (LORE-65's own AC4 test bug, same run).

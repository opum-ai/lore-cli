# Handover — Backlog campaign session 5: LORE-64 (docker/e2e declarative-profile coverage)

**Date**: 2026-07-20 | **Grounded against**: `dev @ e1ccbf5`, clean (only pre-existing untracked `docs/.obsidian/`), 1 commit ahead of `origin/dev` (this session's own archive commit — pushed as the final step of this handover's write-up) | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LORE-64 — docker/e2e: the
declarative profile subsystem (LORE-46) has zero E2E coverage beyond its
zero-config default fallback. Every populated-profile behavior is untested:
(1) `lore new <CustomType>` against a custom `.lore/profile.toml` type +
custom `.lore/templates/<slug>.md` template; (2) a profile-declared required
field failing `lore validate` at exit 6 (the generated Zod validator); (3)
`lore schema export` emitting the custom-slug schema file; (4) a malformed
profile making every loadProfile-bearing command fail loud at exit 6. Queue
order (64, 65, 66 remaining) confirmed by the user on 2026-07-19; do not
re-ask. Merge gate: self-merge (`gh pr merge --rebase --delete-branch` into
dev) confirmed by the user on 2026-07-19 — the PR is an audit trail, not an
approval gate.

LORE-64 depends on LORE-56 (Done) and LORE-46 (verify its status — the
filing task lists it as a dependency but doesn't say Done; check
`backlog task view LORE-64 --plain`'s Dependencies line and
`backlog task view LORE-46 --plain` before assuming it's unblocked). This is
an E2E task: verification REQUIRES the real Docker harness (`docker compose
-f docker/e2e/docker-compose.yml up --build`, ~2-3 min, ALWAYS
`docker compose -f docker/e2e/docker-compose.yml down -v` after, even on
failure) — a green `bun test` alone is NOT sufficient evidence (campaign
convention, tracker's "Campaign conventions" section).

Re-derive the EXACT `.lore/profile.toml` TOML shape from `src/core/profile.ts`
directly before writing any fixture — do not trust the filing task's own
description of the keys/shape at face value (every prior E2E session in this
campaign found at least one of the filing task's own technique or shape
assumptions was wrong: LORE-61 on validate's exit-6 case, LORE-62 on the
check-vs-sync stdout asymmetry, LORE-63 on how a custom Backlog status flow is
actually persisted). `src/core/profile.ts` is 841 lines; a fail-loud
"a profile must declare at least one [[types]]" case sits around
lines 328-341 (re-locate by content/comment, not this line number, since it
may have shifted). Also re-verify: the exact `[[types]]`/`[base.fields]`
table shape, how a custom type's own body template is located
(`.lore/templates/<slug>.md` — confirm the slug-casing convention), and
whether `lore schema export`'s custom-slug output file naming matches what
AC3 assumes. Follow `backlog instructions task-execution` ->
`task-finalization` for the task lifecycle.

Two new campaign conventions from the LORE-63 session, apply here too if
relevant: (a) any `check()` grepping a task id out of a rendered doc for a
status/value must anchor on the managed-block row's own link-text syntax
(literal `"[TASK-n]"`), never a bare `grep -i "$TASKn"` — the id also appears,
differently cased and bracket-free, in the frontmatter `tasks:` list, so an
unanchored match can silently pass on the wrong line, or prefix-collide once
any id reaches double digits; (b) an E2E probe of a config-driven surface
(a custom profile type is the LORE-64 analogue of LORE-63's custom status
flow) should isolate onto a FRESH, minimally-coupled concept rather than
reusing one that already carries other state — otherwise unrelated existing
behavior can mask whatever the surface under test actually contributes,
giving a false-positive "it works" that would pass even if the surface were
never read at all. Iterate against the real docker harness EARLY and often
(2-3 min/cycle) rather than writing the whole diff blind — every E2E session
so far (LORE-61/62/63) caught real bugs this way that pure code review
missed, and an independent adversarial review pass after the first green run
caught at least one more real issue each of the last two sessions (LORE-62's
jq any/all bug; LORE-63's unanchored-grep and dormant-drift bugs) — keep
using both.
```

## State

| Item | Status |
| --- | --- |
| LORE-63 | Done and merged into `dev` (PR #60, rebase-merged). Closed 4 reconciliation coverage gaps in `docker/e2e/run-e2e.sh`: value-asserted the first post-mutation sync's rendered rows + `filesChanged`; induced/caught/healed managed-block BODY drift (distinct from frontmatter drift); a custom non-default Backlog status flow (written directly to `backlog/config.yml`, since `backlog config set statuses` has no CLI setter) reconciling end-to-end plus its malformed-shape exit-6 case; `.lore/config.toml`'s `[reconcile.overrides]` exercised end-to-end plus its own malformed-target exit-6 case. Independent adversarial review found and fixed 2 real issues (unanchored substring greps that could match the wrong line/task past 9 tasks; a dormant status-drift left on the probe Story after the override test). Final verification: 2 full docker/e2e harness runs (125/0 then 127/0 failed, exit 0 both times, `down -v` clean both times); `bun test` 1500/1500 throughout (no `src/` changes). |
| Tracker | doc-1 updated on `dev`: LORE-63 moved to Resolved, cursor advanced to LORE-64, session-log appended, two new campaign conventions recorded (see above). |
| Handover | This session's own consumed handover archived to `archive/handovers/HANDOVER-2026-07-20-backlog-campaign.md` (no name collision — the only prior same-date file for this topic was the one just consumed), committed. Not yet pushed — this session's remaining step (see State row below). |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LORE-63` deleted both sides — GitHub's own post-merge courtesy cleanup switched the local checkout back to `dev` and removed the local branch automatically, in addition to the remote `--delete-branch`). |
| `dev` vs `origin/dev` | 1 commit ahead (this session's archive commit, `e1ccbf5`) — will be pushed as the literal last step of this write-up, per the skill's R5.3 (unconditional push every session). |
| LORE-64 dependencies | Lists `LORE-56, LORE-46` — LORE-56 is Done (this whole E2E harness exists because of it); **LORE-46's status was NOT re-verified this session** — check it first thing next session. |
| LORE-65/66 | Still ahead in the queue after LORE-64. LORE-66 depends on LORE-61 (Done, unblocked). |
| LORE-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |

## Next steps

1. **First**: `backlog task view LORE-46 --plain` to confirm it's Done/unblocked before starting the lifecycle — the filing task lists it as a dependency without stating its status.
2. Per-issue lifecycle on LORE-64 (`backlog task view LORE-64 --plain` for the five ACs): branch `feature/LORE-64` off `dev`, plan on the task.
3. Read `src/core/profile.ts` in full (841 lines) to re-derive the current, exact `.lore/profile.toml` shape: the `[profile]` table's own keys, `[base.fields]`'s required-`type` rule, `[[types]]`'s field-kind/enum/required-section vocabulary, and how a type's `template` key (if any) maps to a `.lore/templates/<slug>.md` file lookup. Do not trust the filing task's description verbatim — every prior session in this campaign found at least one wrong assumption in the filing task.
4. AC1: write a populated `.lore/profile.toml` declaring one custom type (with a distinct slug, not colliding with the built-in six) plus a custom `.lore/templates/<slug>.md` template; run `lore new <CustomType> "..." --json` and assert it succeeds AND the written file's body actually comes from the custom template (not the generic fallback) — grep for a distinctive string only the custom template contains.
5. AC2: give the custom type a profile-declared required field (or required section) that a doc omits; assert `lore validate` on that doc fails at exit 6, and that a doc satisfying the requirement passes.
6. AC3: `lore schema export --json`, then assert the custom type's own schema file was written under `.lore/schemas/` (confirm the exact naming convention — lowercase slug, matching the existing `epic.schema.json`-style pattern used for built-ins) and is valid JSON.
7. AC4: write a malformed `.lore/profile.toml` (e.g., a `[[types]]` block missing `name`, or the file simply undecodable TOML) and assert a `loadProfile`-bearing command (try both `lore new` and `lore sync`/`lore check` if they differ) fails loud at exit 6, `error_type: validation`. Also consider the "zero `[[types]]` declared" fail-loud case mentioned in the filing task (re-verify its current line location, not the cited 335-342).
8. AC5: run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green — this is the verification evidence; `bun test` alone does not satisfy any AC here. Iterate EARLY and often against the real harness (2-3 min/cycle), not once at the end.
9. Review the branch diff adversarially (independent subagent, not self-review) before opening the PR — this caught real, non-obvious bugs in each of the last three sessions.
10. Advance the tracker cursor to LORE-65 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
11. Archive this handover (check `archive/handovers/` for a name collision first), write the next one pointed at LORE-65, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **Every E2E task (61-66) requires the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- LORE-65/66 still ahead in the queue after LORE-64; LORE-66 depends on LORE-61 (Done, unblocked).
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- **Line numbers in a filing task's description go stale fast** — LORE-63 alone added ~85 net lines to `run-e2e.sh` across three new/extended phases. Locate existing phases by their `# ── Phase N: ...` comment headers and content, never by a filing task's cited line numbers, and the same applies to `src/core/profile.ts` line citations for LORE-64.
- **Don't trust a filing task's proposed induction technique or shape assumption at face value** — every E2E session so far (LORE-61/62/63) found at least one wrong assumption in its own filing task's description. For LORE-64 specifically: don't assume the profile TOML shape, the template-lookup slug convention, or the schema-export file-naming convention without reading `src/core/profile.ts` (and whatever export/`schema.ts` command backs AC3) directly first.
- **Isolate config-driven-surface probes onto a fresh, minimally-coupled concept** (LORE-63's lesson, generalizes directly to LORE-64's custom profile type): create a NEW doc of the custom type for these tests rather than retrofitting an existing one, so a false-positive "it works" from unrelated pre-existing state can't mask a surface that was never actually read.
- **`check()` status/value greps must anchor on the managed-block row's own syntax** (e.g. the literal `"[TASK-n]"` link-text bracket) if LORE-64 ever needs to grep a rendered doc for a value — a bare `grep -i` also hits the frontmatter list and can prefix-collide (LORE-63's finding).
- **Backlog task ids are case-sensitive in casing convention, not in identity**: the CLI displays/creates ids uppercased ("TASK-4") but frontmatter/internal error messages use the lowercase form ("task-4") — any `.message | contains(...)` or similar string check needs the lowercase form; `grep -qi`/case-insensitive comparisons sidestep this entirely (unrelated to LORE-64's own surface, but a recurring trap in this file).

## Do not repeat

- Multi-line jq filters inside a single-quoted bash string passed directly to `step_json`/`step_fail` (as opposed to `check()`'s `eval`-based path) — always collapse to one physical line.
- Asserting `[ ! -s <stderr-file> ]` (stderr fully empty) as a proxy for "no error was thrown" — every bundle-loading `lore` command unconditionally flushes routine `warning: skipping non-concept index.md` advisories to stderr via `WarningCollector`, regardless of success/failure, so stderr is essentially NEVER empty for any command that loads the full bundle.
- A bare `grep -i "$TASKn"` (or any id) to prove a rendered STATUS/value in a managed block — it also matches the frontmatter `tasks:` list line and can prefix-collide past 9 tasks. Anchor on the row's own `"[TASK-n]"` link-text bracket instead (LORE-63).
- Leaving induced test state (a rewritten `backlog/config.yml`, a written `.lore/config.toml`, a probe concept's on-disk status) uncleaned when nothing later re-checks it — even if currently dormant/harmless, it silently breaks the moment a later phase (or a future session's addition) does re-check it. Restore/re-heal before moving on, matching this file's existing chmod-restore / config-restore precedent throughout (LORE-63).
- Trusting a filing task's own proposed TOML/shape/line-number citations without independently re-reading the actual current source first (LORE-61 on validate's exit-6 case, LORE-62 on the check-vs-sync stdout asymmetry, LORE-63 on how a custom status flow is actually persisted — apply the same skepticism to LORE-64's profile-shape assumptions).

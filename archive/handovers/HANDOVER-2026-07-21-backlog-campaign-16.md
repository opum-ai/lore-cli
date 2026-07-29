# Handover — third backlog campaign, cursor at LCLI-80 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 11846aa`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 unpushed commit (this session's own archive commit — push before/at the start of the next session's preflight if not already done), 0 behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-80 — rewriteInbound (core/rewrite.ts), the shared engine behind
both `lore rename` and `lore supersede --rewrite-links`, never confines
fromId/toId to the docs/ bundle root; idFromPath (core/concept.ts:540) only
posix.normalizes and strips .md, it does not reject `..` segments or absolute
paths. Labels: codex-review, security — first of a genuinely REAL security
task since LCLI-71/76/77 (LCLI-75 in between was correctness/destructive, not
security-labeled). Queue order confirmed by user on 2026-07-21 (independent
fixes first, the LCLI-80→79→78→81 rename-traversal cluster last, LCLI-80
first of that cluster since its shared-engine containment fix is what LCLI-79
and LCLI-78 build on/reference — read all three tasks' descriptions before
starting LCLI-80). Merge gate is self-merge (skill default, user-confirmed
2026-07-19) — no PR-approval wait. Run the lifecycle's step 6 independent
review (general-purpose subagent) AFTER committing the fix+tests, THEN write
the outcome into the tracker — this ordering discipline has now been
followed cleanly two sessions running (LCLI-75, and the corrected mistake
originally made in LCLI-74); don't regress on it. 3-issue queue remaining
after LCLI-80 (LCLI-79, 78, 81), all from a full-codebase Codex review (see
backlog/docs/reviews/doc-2 for full context/repro detail on every issue, and
doc-1's Cursor/Queue/Campaign-conventions sections for the rest). Also: when
live-CLI-verifying against a scratch repo, do NOT use `bun run --cwd <dir>
<script>` — it overrides process.cwd() back to `<dir>`, silently redirecting
the run onto the wrong repo if the shell's own cwd is already elsewhere (this
session's own mistake, caught only by an unexpected `git status` diff on the
real repo — see doc-1's newest campaign convention). cd into the scratch dir
first, then run `bun run <absolute-path-to-src/cli.ts> ...` with NO --cwd
flag, and run `git status --porcelain` in the real repo immediately after
every such step.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-80, Queue = 4 items, LCLI-75 moved to Resolved with its review evidence, one new campaign convention recorded, two non-blocking review follow-ups added to Not-queued) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 3 tasks remaining (LCLI-80, 79, 78, 81 minus 80 = LCLI-79, 78, 81 after LCLI-80), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean, 1 commit ahead of `origin/dev` (this session's archive commit) at handover-write time — push before starting LCLI-80's preflight if not already pushed |
| Leftover branches/PRs | none — `feature/LCLI-75` fully merged (PR #79, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune` + `git branch -a`) |
| Not queued | LCLI-42/43/44/45 (deferred) plus the same follow-up candidates as before, plus two new ones from LCLI-75's review (near-miss directory-name test coverage; `isManagedSchemasDir`'s lexical-only comparison has no realpath/symlink resolution) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-80** (`rewriteInbound` shared engine does not confine `fromId`/`toId` to `docs/` bundle root): branch `feature/LCLI-80` off `dev`, read the task's AC, implement, verify, review, PR, self-merge, prune. Grounded code pointers (verified this session, not just the filing task's own prose):
   - `rewriteInbound` (`src/core/rewrite.ts:155`): calls `idFromPath(fromId)`/`idFromPath(toId)` (line ~164-165) with no containment check on either result.
   - `idFromPath` (`src/core/concept.ts:540`): `posix.normalize(path)` then strips a trailing `.md` — normalizes `.`/`..` segments (e.g. `a/../adr/x.md` → `adr/x`) but does **not** reject a result that still contains leading `..` segments or is absolute. A `toId` of `../../../../tmp/pwned` normalizes to itself unchanged and passes straight through.
   - This is the **shared** engine behind both `lore rename` and `lore supersede --rewrite-links` — a fix here closes the gap for every caller at once (per the task's own description), including whatever `lore supersede` does independently. Confirm both callers' actual call sites into `rewriteInbound` before implementing.
   - `src/commands/new.ts` already has a proven containment pattern for a comparable problem (`resolveOutPath`, referenced by LCLI-79's own AC as the pattern to mirror) — read it before designing LCLI-80's own fix; the shapes may not be identical (`new.ts` confines a directory argument, `rewriteInbound` confines a concept id that must resolve to a path under `docs/`), but the resolve+relative containment idiom this campaign has used repeatedly (LCLI-69, LCLI-72, LCLI-76/77) likely still applies.
   - AC#2 only requires a test calling `rewriteInbound` **directly** with a traversal `toId` — this is a `core/` unit-level fix+test, not necessarily a CLI-level repro, though a live-CLI `lore rename`/`lore supersede` end-to-end check is still worth doing per this campaign's own "run the real CLI, don't just trust synthetic fixtures" discipline.
2. Read **LCLI-79** and **LCLI-78** (already queued next) before finishing LCLI-80 — per doc-1's own recorded convention, fixing LCLI-80 first may substantially reduce or reshape the remaining work in those two, since all three describe the same underlying gap at three different layers (args parsing, the rename command, the shared engine).
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4), advancing the cursor to **LCLI-79** (`lore rename` destination path is not confined to `docs/` root at the command layer) — the next queue item; re-confirm against the tracker's own Queue table at restore time in case of drift.
4. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **after** committing the fix and its tests, **then** write the outcome into the tracker — the ordering this session (LCLI-75) followed cleanly, correcting LCLI-74's own earlier mistake of writing the tracker claim before the review ran. Keep following it.
5. Archive this handover to `archive/handovers/` and write the next one. Note: today's date (`2026-07-21`) already has FIFTEEN prior archived handovers (base, `-2` through `-15`) — this session's own archival will need suffix `-16`.

## Critical context / traps

- **LCLI-80 is security-labeled** (`codex-review, security`) and is the deepest of the three rename-traversal-cluster layers — a fix here is the one the other two (LCLI-79, LCLI-78) may build on or reference. Give it this campaign's established full-rigor treatment for security tasks: live pre-fix repro against the real CLI, adversarial review, cross-platform (`win32.isAbsolute`) and NUL-byte-at-exec-boundary checks per LCLI-69/72's own recorded conventions (both flagged CRITICAL for every remaining security-labeled task).
- **This session (LCLI-75) followed the review-then-write ordering cleanly** — committed the fix+tests first, ran the independent review, THEN wrote the outcome into the tracker, avoiding the correction-commit LCLI-74 needed. Keep this discipline: write nothing about a review's outcome (clean, or what it found) until the review has actually returned.
- `.repro-scratch/` keeps accumulating scratch files from every review (unchanged this session — LCLI-75 added none beyond ephemeral scratch-repo dirs under the system temp dir, not this project's own scratchpad) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight — 23 prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **`bun run --cwd <dir> <script>` overrides `process.cwd()` back to `<dir>`** — a live-CLI scratch-repo verification step run from inside a `mktemp -d` directory must NOT pass `--cwd <lore-repo>`; doing so silently redirects every write/delete onto the real repo instead of the scratch one. This session's own mistake, caught only by an unexpected `git status --porcelain` diff at the real repo root right after the first (broken) scratch run — the accidental files were untracked-only and cleanly removed before any tracked file was touched, but always verify `git status --porcelain` on the real repo immediately after any such step, every time, going forward.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature branch** when it's the currently-checked-out one — `git checkout dev` / `git branch -d feature/<KEY>` may report "already on"/"not found" as a result; not an error, verify with `git branch -a` + `git fetch --prune`. This session it worked cleanly on the first try.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too (this campaign's standing discipline since LCLI-73's costliest miss).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check. Run the command (or the review) first, then write the claim.
- Don't use `bun run --cwd <lore-repo-path> src/cli.ts ...` when you've already `cd`'d into a scratch directory for live-CLI verification — the `--cwd` flag wins and silently redirects the command onto the real repo. `cd` into the scratch dir, then invoke `bun run <absolute-path-to-cli.ts>` with no `--cwd` at all.
- Don't assume a "non-security" (correctness) label means lighter verification is fine, and conversely don't assume a security label demands MORE rigor than a genuinely destructive correctness bug — LCLI-75 (correctness, destructive `rmSync`) got the same evidence-based verification discipline (live CLI check against the sharpest repro, `git stash` pre/post-fix proof, independent review) this campaign has used for every security-labeled task too.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature branch — it switches to the base branch automatically.

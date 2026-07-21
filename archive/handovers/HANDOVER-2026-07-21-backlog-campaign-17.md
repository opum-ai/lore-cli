# Handover — third backlog campaign, cursor at LORE-79 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 61f80f0`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits at write time (pushed immediately after writing this), 0 behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-79 — lore rename's destination path (newId) is never confined to
the docs/ bundle root at the COMMAND layer (commands/rename.ts), before
assertTargetFree/commitWrites resolve and write to it. Reproduced directly in
the filing task: `lore rename reference/orders ../../../../tmp/pwned`
relocates content outside docs/. Labels: codex-review, security — second of
the interrelated rename-destination-traversal cluster (LORE-80→79→78→81).
Queue order confirmed by user on 2026-07-21 (independent fixes first, this
cluster last, LORE-80 first since its shared-engine fix is what LORE-79/78
build on/reference). LORE-80 is now Done (see Resolved table) — read its
final summary and task notes before starting LORE-79: it added
`assertConfinedToBundle`/`escapesRoot` INSIDE `core/rewrite.ts`'s
`rewriteInbound` (the shared engine `rename.ts` calls into), checked on the
raw fromId/toId before idFromPath, using a separator-agnostic segment walk
(splits on either `/` or `\`, tracks depth) rather than posix.normalize +
win32.isAbsolute alone — that combination was proven insufficient by an
independent review mid-LORE-80 (a backslash-spelled `..\pwned` traversal
bypassed it). LORE-79's own AC is about `commands/rename.ts` specifically
confining the destination BEFORE calling into rewriteInbound (mirroring
`new.ts`'s `resolveOutPath`) — read LORE-80's task notes/final summary AND
the diff in commit range `11846aa..daa5995` (or `git log --oneline -5 --
src/core/rewrite.ts`) before implementing, since rewriteInbound's now-shared
containment check may already reject a bad newId (defense in depth) and
LORE-79 might reduce to "add command-layer confinement anyway, matching
new.ts's pattern for defense-in-depth and a clearer usage-level error" rather
than "close a still-open gap." Confirm this empirically (live-CLI repro
first) rather than assuming either way. Merge gate is self-merge
(skill default, user-confirmed 2026-07-19) — no PR-approval wait. Run the
lifecycle's step 6 independent review (general-purpose subagent) AFTER
committing the fix+tests, THEN write the outcome into the tracker — this
ordering discipline has now held cleanly across LORE-74 (after a correction),
LORE-75, and LORE-80; don't regress on it. 2-issue queue remaining after
LORE-79 (LORE-78, LORE-81). Also apply LORE-80's newly-recorded campaign
convention if this task (or any future one) needs its own traversal
containment check: split on BOTH `/` and `\`, don't rely on
posix.normalize/win32.isAbsolute alone — see doc-1's Campaign-conventions
section. When live-CLI-verifying against a scratch repo, do NOT use `bun run
--cwd <dir> <script>` — cd into the scratch dir first, then run `bun run
<absolute-path-to-src/cli.ts> ...` with NO --cwd flag, and run `git status
--porcelain` in the real repo immediately after every such step.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-79, Queue = 3 items, LORE-80 moved to Resolved with its round-1/round-2/review evidence, one new campaign convention recorded, one new non-blocking Not-queued follow-up added) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 2 tasks remaining after LORE-79 (LORE-78, LORE-81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean, in sync with `origin/dev` (this session's archive commit pushed immediately after this handover is written) |
| Leftover branches/PRs | none — `feature/LORE-80` fully merged (PR #80, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune` + `git branch -a`) |
| Not queued | LORE-42/43/44/45 (deferred) plus prior follow-up candidates, plus one new one from LORE-80: `rewriteInbound`'s new containment check doesn't catch a Windows drive-relative id (e.g. `C:foo`) — narrow, self-identified (not by the review), needs a human to confirm priority |

## Next steps

1. Run the per-issue lifecycle on **LORE-79** (`lore rename` destination path is not confined to `docs/` root at the command layer): branch `feature/LORE-79` off `dev`, read the task's AC, implement, verify, review, PR, self-merge, prune. Grounded code pointers (verified this session in the course of LORE-80, not just the filing task's own prose):
   - `commands/rename.ts:121-163` (`runRename`): computes `oldId`/`newId` via `idFromPath`, calls `assertNotReservedStem(newId, ...)`, loads the bundle, then calls `rewriteInbound(graph, oldId, newId, { move: true })` at line 163 — no containment check on `newId` before that call, today's actual gap this task targets.
   - `rewriteInbound` (`core/rewrite.ts:155`) NOW has its own containment check (`assertConfinedToBundle`, added by LORE-80, checked on the raw `fromId`/`toId` before `idFromPath`) — so as of this handover, calling `runRename` with a traversal `newId` should already throw a `"validation"` LoreError from inside `rewriteInbound`, one layer down from where LORE-79 asks for it. **Verify this live first** (`lore rename reference/orders ../pwned` against a scratch repo) before assuming LORE-79 is fully closed by LORE-80 — the task's own AC#1 asks specifically for `commands/rename.ts` to confine the destination BEFORE calling into `rewriteInbound` (matching `new.ts`'s `resolveOutPath` pattern), which is a distinct, arguably still-valuable command-layer improvement (a clearer `usage`-level error at exit 2, versus `rewriteInbound`'s `validation` at exit 6; defense-in-depth so the command layer doesn't rely on the engine's own internal guard) even if the underlying escape is already blocked.
   - `src/commands/new.ts`'s `resolveOutPath` (referenced by LORE-79's own AC as the pattern to mirror) is the proven containment idiom already used at a command layer: `resolve`+`relative` against the real root directory, rejecting a `..`-prefixed or absolute result. Note `commands/rename.ts` doesn't have a filesystem "root" resolve step the same way `new.ts` does for `--out` — `rename` operates on bundle-relative CONCEPT IDS, not raw filesystem paths — so a direct copy-paste of `resolveOutPath` won't fit; the shape will likely need to mirror LORE-80's own `escapesRoot`/`assertConfinedToBundle` (segment-walk over the raw id) rather than `resolveOutPath`'s real-filesystem-resolve approach. Decide and justify which idiom actually fits `rename.ts`'s own coordinate space before implementing.
2. Read **LORE-78** (already queued next, args-parsing layer) before finishing LORE-79 — per doc-1's own recorded convention, LORE-80's fix may have already substantially reduced or reshaped the remaining work in both LORE-79 and LORE-78, since all three describe the same underlying gap at three different layers (args parsing, the rename command, the shared engine — LORE-80 was the deepest/shared one, now closed).
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4), advancing the cursor to **LORE-78** — the next queue item; re-confirm against the tracker's own Queue table at restore time in case of drift.
4. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **after** committing the fix and its tests, **then** write the outcome into the tracker — the ordering LORE-74 (after a correction), LORE-75, and LORE-80 all followed cleanly. Keep following it. LORE-80 itself is the clearest illustration yet of why: the review caught a real, concrete bypass (the backslash traversal) that a same-session self-review might well have missed, since the first fix passed its own full test suite and live repro cleanly before the review even started.
5. Archive this handover to `archive/handovers/` and write the next one. Note: today's date (`2026-07-21`) already has SIXTEEN prior archived handovers (base, `-2` through `-16`) — this session's own archival will need suffix `-17`.

## Critical context / traps

- **LORE-79 is security-labeled** (`codex-review, security`), the second of the three rename-traversal-cluster layers. Give it this campaign's established full-rigor treatment: live pre-fix repro against the real CLI (verify whether LORE-80's fix already blocks it before assuming LORE-79 is a no-op or a pure defense-in-depth addition), adversarial review, and apply LORE-80's own freshly-recorded convention if any new containment check is needed (split on BOTH `/` and `\`, don't rely on `posix.normalize`/`win32.isAbsolute` alone — see doc-1's Campaign-conventions section, added this session).
- **This session (LORE-80) needed TWO fix rounds** — the first (posix-`../` + `posix.isAbsolute`/`win32.isAbsolute` on the post-`idFromPath` value) passed its own full test suite and live repro cleanly, but an independent review found a real bypass (`..\pwned`, backslash-spelled) that neither check caught. The corrected fix checks the RAW `fromId`/`toId` (before `idFromPath`) with a separator-agnostic segment walk. This is the strongest evidence yet in this campaign that the review step catches real, non-obvious gaps even after a fix looks completely clean by every other measure — don't skip or shortcut it, and don't assume "tests pass + live repro clean" alone means a containment fix is complete.
- `.repro-scratch/` keeps accumulating scratch files from every review (unchanged this session — LORE-80 added none beyond ephemeral scratch-repo dirs under the system temp dir, and its own tracker-update helper script, both cleaned up before commit) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight — 24 prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **`bun run --cwd <dir> <script>` overrides `process.cwd()` back to `<dir>`** — a live-CLI scratch-repo verification step run from inside a `mktemp -d` directory must NOT pass `--cwd <lore-repo>`; doing so silently redirects every write/delete onto the real repo instead of the scratch one. `cd` into the scratch dir first, then run `bun run <absolute-path-to-cli.ts>` with NO `--cwd` flag, and verify `git status --porcelain` on the real repo immediately after every such step, every time.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature branch** when it's the currently-checked-out one — `git checkout dev` / `git branch -d feature/<KEY>` may report "already on"/"not found" as a result; not an error, verify with `git branch -a` + `git fetch --prune`. This session it worked cleanly again.
- **A separator-agnostic traversal check needs its own dedicated test cases** — LORE-80's first fix had 3 tests (toId traversal, toId absolute, fromId traversal) that all passed even though the fix had a real backslash-shaped bypass; none of those 3 used a backslash. If LORE-79/78 add their own containment checks, make sure the test set includes a backslash-spelled and a mixed-separator case, not just forward-slash and absolute-path cases.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too (this campaign's standing discipline since LORE-73's costliest miss).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check. Run the command (or the review) first, then write the claim.
- Don't assume a containment check is complete just because it passes its own test suite and a live repro cleanly — LORE-80's first attempt did both, and still had a real, review-caught bypass (backslash-spelled traversal). Get an independent adversarial pass before calling a security fix done.
- Don't use `bun run --cwd <lore-repo-path> src/cli.ts ...` when you've already `cd`'d into a scratch directory for live-CLI verification — the `--cwd` flag wins and silently redirects the command onto the real repo. `cd` into the scratch dir, then invoke `bun run <absolute-path-to-cli.ts>` with no `--cwd` at all.
- Don't design a new containment check around `posix.normalize`/`win32.isAbsolute` alone — that combination misses a relative traversal spelled with backslashes (`..\pwned`). Use a separator-agnostic segment walk (split on either `/` or `\`, track directory depth) instead, per LORE-80's own newly-recorded campaign convention.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature branch — it switches to the base branch automatically.

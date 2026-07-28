---
id: LCLI-93
title: >-
  ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts
  follow symlinks, escaping docs/ to the real filesystem
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
labels:
  - backlog-campaign-followup
  - security
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: high
type: bug
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`assertNoSymlinkInPath` (src/commands/fswrite.ts:57), the segment-by-segment lstatSync guard LCLI-76 added (scaffold) and LCLI-77 reused (init) to stop mkdirSync's ordinary symlink-following from redirecting a write through a pre-existing symlinked ancestor directory, is only ever called from writeAllOrRollback and init.ts's own two loops. The module's exported `ensureDir` (fswrite.ts:82) is a bare `mkdirSync(absPath, {recursive:true})` with no guard of its own — every other caller inherits the symlink-following hole. Five call sites still call it directly and unguarded: new.ts:127, agents.ts:72, sync.ts:174, schema.ts:106, and rename.ts:278/284 (inside commitWrites).

Concrete evidence, live-CLI-verified against current dev HEAD (post LCLI-78/79/80/81, none of which validate resolved filesystem identity, only the destination id string), in a fresh scratch bundle with `docs/evil` symlinked to a directory outside the bundle:
- `lore rename reference/orders evil/pwned` prints "warning: skipping symlink evil: symlinks are not followed" (loadBundle's graph-walk guard) but then reports a successful rename, exit 0 — both the renamed file and a regenerated index.md are actually written to the real directory outside the bundle; docs/reference/orders.md no longer exists anywhere inside docs/. The printed warning is actively misleading: it describes loadBundle's read-path behavior, not the write path, which does follow the symlink.
- `lore new reference "New Evil Doc" --out docs/evil/newevil.md` reports success, exit 0, with no warning at all (new.ts never calls loadBundle) — the file lands in the real outside directory, never inside docs/.

agents.ts and sync.ts share the identical unguarded-ensureDir shape though their write targets are less directly attacker-steerable than rename's destination id or new --out; schema.ts's --out is likewise only lexically confined to the repo before ensureDir runs. This is the identical vulnerability class already fixed and priced High-severity for `lore scaffold` (LCLI-76) and `lore init` (LCLI-77) — a symlink planted under docs/ (via prior write access to the bundle, or checked into a repo a victim clones and runs ordinary lore commands against) silently redirects real file writes to anywhere on the filesystem the process can reach, entirely outside the repo, while the CLI reports success and, in rename's case, prints a warning whose own text falsely claims the symlink was not followed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `lore rename` refuses (rather than writes through) when its destination path has a pre-existing symlinked ancestor: the docs/evil -> outside repro writes no file outside docs/, and the source concept is left untouched rather than silently relocated through the symlink.
- [x] #2 `lore new` refuses (rather than writes through) when its resolved output path — default-derived or via --out — has a pre-existing symlinked ancestor.
- [x] #3 `lore agents`, `lore sync`, and `lore schema export` each refuse the same way when their own write targets have a pre-existing symlinked ancestor, rather than writing through it.
- [x] #4 Every refusal case above leaves the pre-existing symlink and whatever it points to completely unmodified, and leaves no partially-written files either inside docs/ at the symlinked path or outside it at the symlink's real target.
- [x] #5 A multi-file operation that hits the guard partway through (e.g. rename's index regeneration, sync's multi-file writes) does not leave some files written and others not — matches this codebase's existing all-or-nothing / clear-error convention for the same guard in scaffold and init.
- [x] #6 Regression tests reproduce the docs/evil-style escape for at least rename and new, asserting a refusal error rather than a successful exit code and rather than any file appearing outside the bundle root.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing (line numbers matched the
filing task's citations exactly for new.ts:127/agents.ts:72/sync.ts:174/schema.ts:106; rename.ts
had drifted from 278/284 to 280/286, one session's worth of churn from LCLI-88): the exported
ensureDir (fswrite.ts) was a bare mkdirSync(absPath, {recursive:true}) with no guard, unlike
writeAllOrRollback and init.ts's own loops, which separately call assertNoSymlinkInPath BEFORE
their own ensureDir call. Five call sites had no guard at all: new.ts, agents.ts, sync.ts,
schema.ts, rename.ts (x2, inside commitWrites).

Design: a BLANKET fix at ensureDir itself, not five separate per-call-site patches. Changed
ensureDir's signature from (absPath, relPath) to (root, relPath) -- it now calls
assertNoSymlinkInPath(root, relPath) internally before mkdirSync, deriving the absolute path
itself. This closes all 5 previously-unguarded call sites AND the 2 already-guarded ones
(writeAllOrRollback, init.ts) in one place -- their now-redundant separate assertNoSymlinkInPath
calls were removed. All 8 call sites across new.ts/agents.ts/sync.ts/schema.ts/rename.ts(x2)/
init.ts/fswrite.ts itself were updated and individually traced (the signature change is
string/string -> string/string, so TypeScript's own type-checker could not catch a semantic
mismatch -- verified by hand, not just by compiling).

Caught and fixed one real bug while converting: several call sites' ORIGINAL relPath argument was
the FULL FILE path (decorative before this change, only used in the ioError message, since absPath
was already fully resolved) rather than the file's DIRECTORY -- with the new signature, relPath
directly determines the mkdir target, so passing a file path would have tried to mkdir the file
itself. Fixed by computing dirname() at each such site (sync.ts, rename.ts) before the ensureDir
call.

AC#5 (all-or-nothing for multi-file operations): ensureDir's own per-call guard is REACTIVE -- in
a loop writing several files, it only refuses once the loop reaches a bad target, by which point
earlier targets may already be on disk. Added a new exported assertNoSymlinkInAnyPath(root,
relPaths) helper (fswrite.ts) sweeping a WHOLE planned write set before any single write begins,
wired into the three multi-file write loops: rename.ts's commitWrites (also swept
plan.rename.from -- writes already contains plan.rename.to per RewritePlan's own documented
contract, independently confirmed by the reviewer reading core/rewrite.ts's actual push() call),
sync.ts's write loop, and agents.ts's 2-file loop. rename.ts's commitWrites sweeps FULL file paths
(not just dirnames) because its writeFileOverwriting (plain writeFileSync) follows a symlink at
the final path component, unlike writeFileAtomic's renameSync, which atomically replaces whatever
is at the destination without ever dereferencing it -- this specific claim was independently
verified by the reviewer via a standalone empirical Node repro (renameSync left an outside target
file byte-identical; writeFileSync wrote straight through). sync.ts/agents.ts's own sweeps also
happen to cover full paths, not just ancestor directories (my own earlier description called this
"ancestor directories only" -- inaccurate; the code and its comments were already correct, only my
own prose summary undersold it).

Genuinely non-obvious finding: sync.ts's write targets are ALWAYS derived from paths
core/bundle.ts's loadBundle already discovered during its own walk, and that walk unconditionally
skips symlinked directories (independently confirmed by the reviewer reading walkFiles's exact
isSymbolicLink() check, which runs before the isDirectory/isFile branches for every entry) -- so a
STATIC pre-existing symlink can never reach sync.ts's write path for a new target; the concept
would never be discovered. sync.ts's guard is pure TOCTOU-race defense-in-depth, not a
live-reproducible static gap -- which is why AC#6 only required tests for "at least rename and
new." No misleading test was forced for sync.ts.

An unrelated interaction was found and resolved: two existing LCLI-94 tests
(test/schema-export.test.ts) had pinned the narrower LCLI-94 behavior ("skip pruning but still
write through a symlinked .lore/schemas"). LCLI-93's own AC#3 explicitly supersedes this --
updated both tests to assert a conflict refusal instead. The reviewer independently confirmed the
ORIGINAL LCLI-94 tests never actually asserted "still writes through" as a positive claim (only
that pruning didn't happen), so no real coverage was lost in the rewrite, though my own framing of
"superseding a behavior" was a slight overstatement -- the corrected behavior is still strictly
better and matches AC#3's own explicit wording.

AC#1/#2/#3/#6: regression tests added -- 2 in test/rename.test.ts (the docs/evil repro exactly as
filed, plus an AC#5 all-or-nothing test -- independently verified by the reviewer via tracing
`writes`'s ascending sort order that this test genuinely discriminates the sweep, since bulk.md's
legitimate rewrite would otherwise land before commitWrites ever reaches the symlinked
destination), 1 in test/new.test.ts (the --out repro exactly as filed), 1 in test/agents.test.ts
(a symlinked .claude/skills/lore refusing both bridge files), plus the 2 updated
schema-export.test.ts tests.

Live-CLI verification: .repro-scratch/lore93-verify/ and .repro-scratch/lore93-agents-verify/,
driving the real CLI against real scratch bundles with real symlinked directories. git stash
comparison on the 7 changed source files: PRE-FIX reproduced the filing task's own repro exactly
(misleading "skipping symlink" warning, exit 0, both the renamed concept and a regenerated
index.md written into the outside directory for rename; silent exit-0 success with the file
landing outside the repo for new --out). POST-FIX both refuse at exit 5, nothing written outside
the repo. Also live-verified lore agents post-fix.

Independent review (general-purpose subagent, asked for complete findings in one response, given
extra time given this was the campaign's largest/final diff): NO BLOCKING FINDINGS. Independently
re-verified every one of the 8 ensureDir call-site conversions by hand; independently confirmed
RewritePlan.writes's toPath contract by reading core/rewrite.ts directly; independently and
EMPIRICALLY verified the renameSync-vs-writeFileSync symlink-following claim via a standalone Node
script; independently confirmed walkFiles's symlink-skip behavior by reading core/bundle.ts
directly; ran its own live-CLI verification (rename/new/agents/schema export) from this branch's
source against fresh scratch bundles, matching this session's own results; temporarily DISABLED
the assertNoSymlinkInAnyPath call in agents.ts and reran its own new test to check whether the
test actually discriminates the sweep -- found it does NOT (agents.ts's plan.files always orders
SKILL.md, the symlinked target, first, so ensureDir's own reactive per-call guard already throws
before the sweep's ordering property is ever exercised) -- a genuine, honest, non-blocking test-
quality gap, fixed this session by rewriting the test's docstring to accurately describe what it
does and doesn't prove (CLAUDE.md has no separate ancestor directory to symlink, and a symlinked
CLAUDE.md FILE itself is inherently safe via renameSync regardless, so there is no black-box way to
construct a genuinely discriminating test for agents.ts specifically -- test/rename.test.ts's own
AC#5 test is what actually proves the sweep mechanism, confirmed independently by the reviewer).

Verified (final): bun test -> 1697 pass/0 fail (up from 1693); bun run typecheck clean; bun run
lint clean on all changed files -- 4 pre-existing infos remain in unrelated files, untouched.

**Correction (2026-07-26, round 5 wave 2, via LCLI-266).** The Implementation Notes above state that a symlinked `CLAUDE.md` file is "inherently safe via renameSync regardless, so there is no black-box way to construct a genuinely discriminating test for agents.ts specifically". **That is false**, and it was the written rationale that let the LCLI-93 AC#5 sweep go untested until LCLI-266.

Disproved by execution during LCLI-266's review gate: with `assertNoSymlinkInAnyPath` neutered in `src/commands/agents.ts`, `applyAgentsBridge` writes SKILL.md (the FIRST target) and then **destroys the CLAUDE.md symlink** — `writeFileAtomic`'s `renameSync` commit replaces whatever sits at the destination path, symlink or not. Verified in two scenarios, including a symlink pointing at a real file outside the repo: the write does not escape the repo (the outside victim is byte-identical afterwards), but the symlink is replaced outright. That replacement is precisely the failure the up-front sweep exists to prevent, and it IS reachable black-box.

The related claim that `test/rename.test.ts`'s own AC#5 test "is what actually proves the sweep mechanism" was also false at the time it was written: that test was non-discriminating (115/115 under mutation) because its symlinked `evil` destination sorted first, so `ensureDir`'s reactive per-call guard alone caught it. LCLI-266 renamed the fixture to `zzz-evil` so the bad target sorts after a legitimate rewrite, making it genuinely discriminating (114/1 under mutation).

All three call sites (`agents.ts`, `rename.ts`, `sync.ts`) are now pinned by discriminating regression tests. This note is appended rather than rewriting the original record.
<!-- SECTION:NOTES:END -->

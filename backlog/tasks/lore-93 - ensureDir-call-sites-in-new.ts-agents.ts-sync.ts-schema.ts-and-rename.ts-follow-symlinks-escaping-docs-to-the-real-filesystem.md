---
id: LORE-93
title: >-
  ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts
  follow symlinks, escaping docs/ to the real filesystem
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 18:52'
updated_date: '2026-07-21 21:40'
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
`assertNoSymlinkInPath` (src/commands/fswrite.ts:57), the segment-by-segment lstatSync guard LORE-76 added (scaffold) and LORE-77 reused (init) to stop mkdirSync's ordinary symlink-following from redirecting a write through a pre-existing symlinked ancestor directory, is only ever called from writeAllOrRollback and init.ts's own two loops. The module's exported `ensureDir` (fswrite.ts:82) is a bare `mkdirSync(absPath, {recursive:true})` with no guard of its own — every other caller inherits the symlink-following hole. Five call sites still call it directly and unguarded: new.ts:127, agents.ts:72, sync.ts:174, schema.ts:106, and rename.ts:278/284 (inside commitWrites).

Concrete evidence, live-CLI-verified against current dev HEAD (post LORE-78/79/80/81, none of which validate resolved filesystem identity, only the destination id string), in a fresh scratch bundle with `docs/evil` symlinked to a directory outside the bundle:
- `lore rename reference/orders evil/pwned` prints "warning: skipping symlink evil: symlinks are not followed" (loadBundle's graph-walk guard) but then reports a successful rename, exit 0 — both the renamed file and a regenerated index.md are actually written to the real directory outside the bundle; docs/reference/orders.md no longer exists anywhere inside docs/. The printed warning is actively misleading: it describes loadBundle's read-path behavior, not the write path, which does follow the symlink.
- `lore new reference "New Evil Doc" --out docs/evil/newevil.md` reports success, exit 0, with no warning at all (new.ts never calls loadBundle) — the file lands in the real outside directory, never inside docs/.

agents.ts and sync.ts share the identical unguarded-ensureDir shape though their write targets are less directly attacker-steerable than rename's destination id or new --out; schema.ts's --out is likewise only lexically confined to the repo before ensureDir runs. This is the identical vulnerability class already fixed and priced High-severity for `lore scaffold` (LORE-76) and `lore init` (LORE-77) — a symlink planted under docs/ (via prior write access to the bundle, or checked into a repo a victim clones and runs ordinary lore commands against) silently redirects real file writes to anywhere on the filesystem the process can reach, entirely outside the repo, while the CLI reports success and, in rename's case, prints a warning whose own text falsely claims the symlink was not followed.
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
had drifted from 278/284 to 280/286, one session's worth of churn from LORE-88): the exported
ensureDir (fswrite.ts) was a bare mkdirSync(absPath, {recursive:true}) with no guard, unlike
writeAllOrRollback and init.ts's own loops, which separately call assertNoSymlinkInPath BEFORE
their own ensureDir call. Five call sites had no guard at all: new.ts, agents.ts, sync.ts,
schema.ts, rename.ts (x2, inside commitWrites).

Design: a BLANKET fix at ensureDir itself, not five separate per-call-site patches. Changed
ensureDir's signature from (absPath, relPath) to (root, relPath) -- it now calls
assertNoSymlinkInPath(root, relPath) internally before mkdirSync, deriving the absolute path
itself. This closes all 5 previously-unguarded call sites AND the 2 already-guarded ones
(writeAllOrRollback, init.ts) in one place -- their now-redundant separate assertNoSymlinkInPath
calls were removed. Every one of the ~8 call sites across new.ts/agents.ts/sync.ts/schema.ts/
rename.ts(x2)/init.ts/fswrite.ts itself was updated by hand (the signature change is
string/string -> string/string, so TypeScript's own type-checker could not catch a semantic
mismatch -- each site was individually traced and verified to pass the correct root+relPath pair,
not just left to compile).

Caught and fixed one real bug while converting: several call sites' ORIGINAL relPath argument was
the FULL FILE path (used only for the ioError message, decorative, since absPath was already fully
resolved) rather than the file's DIRECTORY -- with the new signature, relPath directly determines
the mkdir target, so passing a file path would have tried to mkdir the file itself. Fixed by
computing dirname() at each such site (sync.ts, rename.ts) before the ensureDir call.

AC#5 (all-or-nothing for multi-file operations): ensureDir's own per-call guard is REACTIVE -- in
a loop writing several files, it only refuses once the loop reaches a bad target, by which point
earlier targets may already be on disk. Added a new exported assertNoSymlinkInAnyPath(root,
relPaths) helper (fswrite.ts) that sweeps a WHOLE planned write set before any single write begins,
wired into the three genuinely multi-file write loops: rename.ts's commitWrites (also swept
plan.rename.from, and relies on writes already containing plan.rename.to per RewritePlan's own
contract -- verified this to avoid a duplicate-check bug), sync.ts's write loop, and agents.ts's
2-file loop (for consistency, even though its writeFileAtomic is rename()-based and thus
final-component-safe already -- the ordering concern still applies to its own ancestor
directories). rename.ts's commitWrites also needed its OWN targets to include the FULL file paths,
not just their dirnames, because writeFileOverwriting (plain writeFileSync, unlike writeFileAtomic)
DOES follow a symlink at the final path component -- confirmed this distinction by reasoning
through POSIX rename() semantics (renameSync atomically replaces whatever is at the destination,
never dereferencing it, so writeFileAtomic's callers were already final-component-safe;
writeFileSync has no such guarantee).

Genuinely non-obvious finding, recorded for the review: sync.ts's write targets are ALWAYS derived
from paths core/bundle.ts's loadBundle already discovered during its own walk, and that walk
already skips symlinked directories entirely (confirmed by reading walkFiles) -- so a STATIC,
pre-existing symlink (the task's own "docs/evil -> outside, committed into a cloned repo" threat
model) can never actually reach sync.ts's write path for a NEW target inside it; the concept would
simply never be discovered in the first place. sync.ts's ensureDir/preflight guard is therefore
pure defense-in-depth against a narrower TOCTOU race (a symlink swapped in AFTER discovery, DURING
the same runSync call, before the write phase) -- not a live-reproducible static repro the way
rename.ts/new.ts/agents.ts's guards are (their destination paths are user-supplied strings never
filtered through prior symlink-aware discovery). This is why AC#6 only requires regression tests
for "at least rename and new" -- sync's own gap genuinely isn't constructible the same way. Did not
force a misleading test for it; the fix is still correct and in place.

An unrelated interaction surfaced and was resolved: two existing LORE-94 tests
(test/schema-export.test.ts) had pinned the NARROWER LORE-94 behavior ("skip pruning but still
write through a symlinked .lore/schemas"). LORE-93's own AC#3 explicitly supersedes this ("lore
schema export... refuse... rather than writing through it") -- updated both tests to assert a
conflict refusal (writing nothing at all) instead of a silent partial success, which is the
correct, stricter evolution AC#3 calls for, not a regression.

AC#1/#2/#3/#6: regression tests added -- 2 in test/rename.test.ts (the docs/evil repro exactly as
filed, plus an AC#5 all-or-nothing test proving a legitimate unrelated inbound rewrite is NOT
written when the move destination is symlinked), 1 in test/new.test.ts (the --out repro exactly as
filed), 1 in test/agents.test.ts (a symlinked .claude/skills/lore refusing both bridge files), plus
the 2 updated schema-export.test.ts tests. All POSIX-only, matching this codebase's established
symlink-test skip guard.

Live-CLI verification (per this campaign's standing discipline): .repro-scratch/lore93-verify/ and
.repro-scratch/lore93-agents-verify/, driving the real CLI against real scratch bundles with real
symlinked directories. git stash comparison on the 7 changed source files: PRE-FIX, `lore rename
reference/orders evil/pwned` reproduced the filing task's own repro exactly -- a MISLEADING
"skipping symlink evil: symlinks are not followed" warning (describing loadBundle's unrelated
read-path behavior) followed by exit 0 and both the renamed concept AND a regenerated index.md
actually written into the outside directory; `lore new --out docs/evil/newevil.md` silently
succeeded (exit 0) with the file landing outside the repo entirely, no warning at all. POST-FIX,
both refuse at exit 5 (conflict), nothing written outside the repo, the pre-existing symlinks
themselves untouched. Also live-verified `lore agents` post-fix (real CLI, real symlinked
.claude/skills/lore): refuses at exit 5, neither bridge file written.

Verified: bun test -> 1697 pass/0 fail (up from 1693); bun run typecheck clean; bun run lint clean
on all changed files -- 4 pre-existing infos remain in unrelated files, untouched.
<!-- SECTION:NOTES:END -->

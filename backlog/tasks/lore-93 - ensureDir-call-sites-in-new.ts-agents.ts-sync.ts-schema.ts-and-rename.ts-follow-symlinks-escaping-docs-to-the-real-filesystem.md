---
id: LORE-93
title: >-
  ensureDir call sites in new.ts, agents.ts, sync.ts, schema.ts, and rename.ts
  follow symlinks, escaping docs/ to the real filesystem
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
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
- [ ] #1 `lore rename` refuses (rather than writes through) when its destination path has a pre-existing symlinked ancestor: the docs/evil -> outside repro writes no file outside docs/, and the source concept is left untouched rather than silently relocated through the symlink.
- [ ] #2 `lore new` refuses (rather than writes through) when its resolved output path — default-derived or via --out — has a pre-existing symlinked ancestor.
- [ ] #3 `lore agents`, `lore sync`, and `lore schema export` each refuse the same way when their own write targets have a pre-existing symlinked ancestor, rather than writing through it.
- [ ] #4 Every refusal case above leaves the pre-existing symlink and whatever it points to completely unmodified, and leaves no partially-written files either inside docs/ at the symlinked path or outside it at the symlink's real target.
- [ ] #5 A multi-file operation that hits the guard partway through (e.g. rename's index regeneration, sync's multi-file writes) does not leave some files written and others not — matches this codebase's existing all-or-nothing / clear-error convention for the same guard in scaffold and init.
- [ ] #6 Regression tests reproduce the docs/evil-style escape for at least rename and new, asserting a refusal error rather than a successful exit code and rather than any file appearing outside the bundle root.
<!-- AC:END -->

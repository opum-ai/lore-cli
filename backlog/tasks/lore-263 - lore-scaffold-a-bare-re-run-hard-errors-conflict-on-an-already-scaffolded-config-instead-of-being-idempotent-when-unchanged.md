---
id: LORE-263
title: >-
  lore scaffold: a bare re-run hard-errors (conflict) on an already-scaffolded
  config instead of being idempotent-when-unchanged
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 02:09'
updated_date: '2026-07-25 02:31'
labels:
  - cli-ux
  - cmd-meta-c
dependencies: []
references:
  - src/commands/scaffold.ts
priority: low
type: enhancement
ordinal: 365000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Re-running 'lore scaffold <target>' on a bundle that already has that config should be a safe no-op when the on-disk config is unchanged (exit 0, 'nothing to do'), matching 'lore sync's idempotency model — rather than hard-failing so the user has to hand-edit the file or remember --force.

## Observed (Meridian stress test)
'lore scaffold obsidian' hard-errors with error_type: conflict if docs/.obsidian/ already exists — it is NOT additive/re-runnable. To confirm or repair Obsidian settings on an already-scaffolded bundle you must inspect/edit docs/.obsidian/app.json directly (or pass --force, which overwrites). This surprised the tester and blocks a 'just re-assert the config' workflow. (Same never-clobber applies to mkdocs/docusaurus targets.)

## Nuance (why this isn't just 'use --force')
The never-clobber + --force design is deliberate: it protects a user's hand-customized config (e.g. edited app.json) from silent overwrite. But erroring even when the on-disk config is BYTE-IDENTICAL to what scaffold would generate is unnecessary friction. The good pattern already exists in lore: 'lore sync' reports '0 files changed' when nothing differs.

## Direction (decide in plan)
- Make a bare re-run IDEMPOTENT: if the existing generated file(s) are byte-identical to what would be produced, no-op with exit 0 and a 'nothing to do' line; only raise the conflict (and point at --force) when the on-disk config DIFFERS (i.e. the user modified it). Apply uniformly to obsidian/mkdocs/docusaurus.
- At minimum, make the conflict error message explicitly tell the user to re-run with --force (surface the recovery path).

## Refs
src/commands/scaffold.ts; the writeAllOrRollback never-clobber/--force path in src/commands/fswrite.ts; 'lore sync's idempotency ('0 files changed') as the pattern to mirror.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Re-running 'lore scaffold <target>' when the existing generated config is byte-identical to what it would generate is a no-op: exit 0 with a clear 'nothing to do / unchanged' message (mirrors sync's '0 files changed'), for obsidian, mkdocs, and docusaurus.
- [x] #2 When the on-disk config DIFFERS from what scaffold would generate (user-modified), lore still refuses to clobber, and the conflict error explicitly points the user at --force.
- [x] #3 '--force' behavior is unchanged (overwrites to the freshly-generated config).
- [x] #4 Regression tests cover unchanged-re-run (no-op), user-modified-re-run (conflict + --force hint), and --force overwrite; full suite + lore check stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decision (AC direction): classify each planned file, per-file, as missing / unchanged (byte-identical) / differs, via a new shared fswrite.ts helper `classifyExistingFile(absPath, contents)` (lstat-based: non-regular entry or unreadable => "differs", never silently treated as a match).
2. In `runScaffold`'s !force preflight: keep the existing structural blockedDirs check unchanged. Replace the old "any existing file = collision" check with: collisions = blockedDirs + files classified "differs". A file classified "unchanged" is NOT a collision (idempotent). Conflict error/hint wording stays as-is (already points at --force).
3. Compute the actual write set: under !force, only files classified "missing" are passed to writeAllOrRollback (files already present+matching are left untouched, never rewritten) — this also gracefully handles a partial pre-existing state (e.g. one of two generated files hand-deleted) by recreating only what's absent, without touching the untouched match. Under force, behavior is unchanged (full plan.files, overwrite semantics untouched).
4. Because a full-match re-run now yields filesToWrite=[], writeAllOrRollback naturally returns files: [] with zero side effects — reuse this (mirroring sync's "0 files changed" idiom) rather than adding a new boolean/field: render() prints a "<target> config already up to date — nothing to do" line when files.length === 0, else the existing "scaffolded N files" summary. JSON envelope carries files: [] for the no-op case, distinguishable via files.length + force:false.
5. Update scaffold.ts's module docstring (never-silent-clobber paragraph) to describe the new idempotent-when-unchanged behavior instead of "any planned file already exists => refuse".
6. Tests (test/consumer-scaffold.test.ts, per target: mkdocs/docusaurus/obsidian):
   - Rewrite the existing "a re-run without --force refuses with a conflict" tests: a bare identical re-run (same clock) is now exit 0, 0 files, "nothing to do" message, on-disk bytes untouched.
   - Add a new "a re-run when the on-disk file was hand-modified still refuses with a conflict (+ --force hint)" test per target (mutate one on-disk generated file's bytes, re-run bare, expect conflict, message/hint unchanged, files on disk untouched).
   - Keep "--force overwrites ... reports updated" tests as-is (unaffected code path) — run them to confirm no regression.
   - Existing "hand-authored file alone (sibling absent) still refuses" test already covers a differs+missing mix — keep, verify still passes.
   - Add one test locking in the partial-recreate decision (step 3) for one target: one generated file present+unchanged, its sibling deleted -> re-run recreates only the missing sibling, exit 0, the present file's bytes/mtime-content untouched.
7. tests (test/fswrite.test.ts): unit-test the new `classifyExistingFile` directly — missing path, byte-identical match, differing content, and a non-regular entry (directory or symlink) at the path never reporting "unchanged".
8. Run bun test, bun run typecheck, bun run lint, bun run src/cli.ts check; fix any fallout; update task ACs + notes; commit with Refs: LORE-263; push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: idempotency check is per-file (fswrite.ts's new classifyExistingFile: missing/unchanged/differs via lstat + byte compare — non-regular entries and unreadable files always classify as "differs", never silently "unchanged", so a symlinked target can never skip the write loop's own symlink guard). scaffold.ts's !force preflight now only treats "differs" files (plus structural dir blockers) as collisions; "missing" files are written, "unchanged" files are left untouched. A partial state (one generated file present+matching, its sibling separately deleted) is handled uniformly by this same classification: only the missing sibling is (re)created, the untouched one is never rewritten. No-op detection needs no new boolean/field: files.length===0 is only reachable on a bare (non --force) run where every planned file already matched, since --force always (re)writes the full non-empty plan — render() prints "<target> config already up to date — nothing to do" in that case, mirroring lore sync's "0 files changed" idiom, guidance notes (obsidian) still print.

Verification:
- bun test -> 2073 pass, 0 fail (full suite, includes 6 new/rewritten scenarios per target in test/consumer-scaffold.test.ts + a new classifyExistingFile unit-test describe block in test/fswrite.test.ts covering missing/unchanged/differs/directory/symlink/unreadable-file)
- bun run typecheck -> clean (tsc --noEmit)
- bun run lint -> clean (biome check ., 109 files)
- bun run src/cli.ts check -> 38 files, 0 errors, 0 warnings
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lore scaffold <target> is now idempotent when unchanged, for all three targets (mkdocs/docusaurus/obsidian). A bare re-run classifies each planned file per-file (new fswrite.ts classifyExistingFile: missing/unchanged/differs, lstat-based, never silently "unchanged" for a non-regular entry or an unreadable file) instead of the old plain-existence check: files that already match byte-for-byte are left untouched and excluded from the conflict; only files that genuinely differ (a hand-edit) still block the run with a conflict error pointing at --force. A run where every planned file already matches writes nothing and exits 0 with a "<target> config already up to date — nothing to do" line (mirrors lore sync's "0 files changed"). --force is unaffected (still overwrites the whole plan). Verified via bun test (2073 pass, 0 fail, including rewritten + new per-target scenarios and a new classifyExistingFile unit suite), bun run typecheck (clean), bun run lint (clean), and bun run src/cli.ts check (38 files, 0 errors, 0 warnings).
<!-- SECTION:FINAL_SUMMARY:END -->

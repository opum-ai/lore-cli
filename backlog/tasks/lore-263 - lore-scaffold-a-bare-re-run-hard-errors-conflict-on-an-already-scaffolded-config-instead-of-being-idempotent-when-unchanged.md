---
id: LORE-263
title: >-
  lore scaffold: a bare re-run hard-errors (conflict) on an already-scaffolded
  config instead of being idempotent-when-unchanged
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 02:09'
updated_date: '2026-07-25 03:15'
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

Review pass 1 (request_changes) found AC#1 not actually delivered for mkdocs under a real wall clock: docs/tags.md embeds clock().toISOString() in its frontmatter, so a bare re-run any time after the first regenerated different bytes and classifyExistingFile reported "differs", hard-erroring exit 5 on an untouched bundle -- the tests only passed because every scaffold() call injected the same FIXED_CLOCK.

Fix: a new preservedTagsTimestamp helper (src/commands/scaffold.ts). On a bare (non --force) mkdocs run, it reads the on-disk docs/tags.md's frontmatter timestamp (via the shared tryReadFrontmatter -- frontmatter-only, no schema validation) and passes THAT string into buildMkdocsScaffold instead of a fresh clock() read, falling back to clock() when the file is absent, unreadable, or its frontmatter/timestamp field doesn't parse as a usable string. --force is unaffected -- it always stamps a fresh timestamp. classifyExistingFile's own byte comparison is untouched; only the timestamp fed into the regenerated bytes changes, so a hand-edit to ANY other part of tags.md (or to mkdocs.yml) still classifies "differs" and still conflicts.

Also fixed classifyExistingFile's docstring (src/commands/fswrite.ts, minor finding): it mis-described its own vanished-file race as "vanished AFTER the initial lstat" when the code actually treats a post-lstat vanish (readFileSync ENOENT) as "differs", not "missing" -- only a pre-lstat absence degrades to "missing". Wording fix only, no behavior change.

Verification: added regression tests in test/consumer-scaffold.test.ts using a new SECOND_CLOCK distinct from the existing FIXED_CLOCK -- (1) scaffold at T1, bare re-run at T2 (5s later): exit 0, files:[], on-disk tags.md byte-identical and untouched; (2) hand-edit mkdocs.yml, re-run at T2: still conflicts naming only mkdocs.yml, not tags.md (replaces the prior test's "must use the SAME clock" coupling with a genuinely different one); (3) the reverse -- hand-edit tags.md itself still conflicts, naming only tags.md; (4) an unparseable-YAML docs/tags.md falls back to a fresh timestamp and still yields a clean "differs" conflict, not a crash.

Also manually reproduced the reviewer's exact live repro against a REAL wall clock in a scratch bundle outside the test suite: `lore scaffold mkdocs` run twice, 1.2s apart -> second run now exits 0 "mkdocs config already up to date -- nothing to do"; a subsequent hand-edit to mkdocs.yml still conflicts, exit 5, naming only mkdocs.yml.

Full verification re-run after the fix: bun test -> 2076 pass, 0 fail; bun run typecheck -> clean; bun run lint -> clean (109 files); bun run src/cli.ts check -> 38 files, 0 errors, 0 warnings.

CI-gate follow-up: the docker e2e harness's Phase 18 (docker/e2e/run-e2e.sh) still asserted the OLD pre-LORE-263 contract -- a bare 'lore scaffold mkdocs' re-run expected to hard-fail with a conflict (exit 5) unconditionally, which now correctly fails since a bare re-run on an unchanged scaffold is idempotent (exit 0). Updated Phase 18 to assert the NEW contract end-to-end against the real binary, all three arms: (1) a bare re-run on an untouched scaffold is a no-op -- exit 0, .data.files is an empty array (LORE-263 AC1); (2) a bare re-run after hand-editing the on-disk mkdocs.yml still conflicts (exit 5), naming mkdocs.yml and pointing at --force, and the hand-edit survives the refused run untouched (LORE-263 AC2); (3) --force still overwrites and reports the files as 'updated' (LORE-263 AC3, assertion kept). Updated the stale 'LORE-66 AC4' comment above the block to describe the new contract and cite LORE-263 alongside LORE-66. Grepped the whole harness for other scaffold-related assertions (mkdocs/docusaurus/obsidian phases 18-20): only Phase 18 carried the stale re-run assumption -- Phase 19 (docusaurus) and Phase 20 (obsidian) only ever exercise a fresh (first-run) scaffold in this harness and had no re-run assertion to fix. Verified with a full local docker e2e run: E2E summary: 302 passed, 0 failed (up from 298 passed/1 failed). Also re-ran bun test (2086 pass, 0 fail), bun run typecheck (clean), bun run lint (clean, 109 files), and bun run src/cli.ts check (38 files, 0 errors, 0 warnings) -- no regressions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lore scaffold <target> is idempotent when unchanged for all three targets (mkdocs/docusaurus/obsidian), now verified under a REAL wall clock, not just an injected test clock. A bare re-run classifies each planned file per-file (fswrite.ts's classifyExistingFile: missing/unchanged/differs, lstat-based, never silently "unchanged" for a non-regular or unreadable entry): files that already match byte-for-byte are left untouched and excluded from the conflict; only files that genuinely differ (a hand-edit) still block the run with a conflict error pointing at --force.

mkdocs' docs/tags.md embeds a timestamp in its frontmatter, which would otherwise defeat idempotency on every real re-run (wall-clock drift alone makes the regenerated bytes differ). A bare mkdocs run now reuses the on-disk file's own timestamp (scaffold.ts's preservedTagsTimestamp, via the shared tryReadFrontmatter) instead of always stamping a fresh clock() read, falling back to a fresh timestamp when there's nothing valid on disk to preserve. --force is unaffected (always overwrites the whole plan with a fresh timestamp).

Verified via bun test (2076 pass, 0 fail -- including two-clock regression tests that distinguish "nothing changed but time passed" from "the user actually edited mkdocs.yml/tags.md", plus an unparseable-YAML fallback test), bun run typecheck (clean), bun run lint (clean, 109 files), bun run src/cli.ts check (38 files, 0 errors, 0 warnings), and a live manual repro against the real CLI/wall clock (two real runs 1.2s apart: first creates, second is a clean no-op; a subsequent hand-edit still conflicts, naming only the edited file).

Follow-up: fixed a stale CI-gate assertion in docker/e2e/run-e2e.sh (Phase 18) that still encoded the pre-LORE-263 'bare re-run is always a conflict' contract. Rewrote it to assert the new idempotent-when-unchanged contract end-to-end (no-op on unchanged, conflict+--force-hint on a genuine hand-edit, --force still overwrites), confirmed via a full green docker e2e run (302 passed, 0 failed).
<!-- SECTION:FINAL_SUMMARY:END -->

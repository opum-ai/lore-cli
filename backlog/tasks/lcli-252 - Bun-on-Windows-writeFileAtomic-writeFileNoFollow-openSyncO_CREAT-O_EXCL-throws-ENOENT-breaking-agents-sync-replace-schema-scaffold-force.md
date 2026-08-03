---
id: LCLI-252
title: >-
  Bun on Windows: writeFileAtomic/writeFileNoFollow openSync(O_CREAT|O_EXCL)
  throws ENOENT, breaking agents/sync/replace/schema/scaffold --force
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - build-ci-config
  - cross-platform
  - bug
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - src/commands/fswrite.ts
  - 'https://github.com/jeremy-newhouse/lore/actions/runs/30092891454'
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
type: bug
ordinal: 354000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

The `lint · typecheck · test (windows-latest)` CI leg passes, and `lore`'s file-writing commands work on Windows. Today the Windows CI leg has NEVER been green (0/40 recent runs): 94 Windows-only test failures, all rooted in one defect.

## Root cause (verified against live Windows CI logs + code)

In `src/commands/fswrite.ts`, the temp-file creation
`openSync(tmpPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666)`
throws `ENOENT: no such file or directory, open '...\.lore-sync-tmp-<pid>-<rand>'` on Bun/Windows — in BOTH `writeFileAtomic` (~line 254) and `writeFileNoFollow` (~line 739). The parent directory DOES exist (ensureDir created it); the ENOENT is a Bun-Windows quirk of the numeric-flag openSync, not a missing directory.

This is a REAL product bug, not test-only: the failing stacks are `writeFileAtomic <- runAgents`, `writeFileNoFollow <- runSchema`, etc. — the actual `lore agents`, `lore sync`, `lore replace`, `lore schema export`, and `lore scaffold --force` commands all fail on Windows.

## Why it matters

Windows is one of the two OSes the CI matrix deliberately targets (the ci.yml comment calls out 'the OSes this codebase's path/FS handling actually breaks on'). Every write-family command is broken there. Fixing it turns the windows leg green and makes it eligible to become a required check alongside docker-e2e (LCLI-196).

## Decisive evidence for the fix direction

`createIfAbsent` (same file) uses `writeFileSync(absPath, contents, { flag: "wx" })` — the SAME O_CREAT|O_EXCL exclusive-create semantics — and its callers PASS on Windows (140 pass). Only the openSync-based temp writers fail (30x .lore-sync-tmp + 30x .lore-nofollow-tmp + 12 scaffold --force). So the fix is to create the temp file with the proven-on-Windows writeFileSync({flag:'wx'}) primitive instead of the numeric-flag openSync — WITHOUT regressing the invariants those functions guarantee.

## Constraints / invariants the fix must preserve

- LCLI-231 temp-leak guard: a mid-write failure must still clean up the temp file lore created; lore must never unlink a file it did not create.
- LCLI-117 mode/ownership preservation on overwrite.
- LCLI-130 / LCLI-92 symlink safety in writeFileNoFollow.
- Per-file rename atomicity (write-temp-then-rename).

## Verification reality

The fix can only be truly verified on Windows via a CI run (the windows-latest leg on a PR); locally (macOS) confirm no regression (full `bun test`, `bun run typecheck`, `bun run lint` stay green).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Windows-only 'ENOENT ... open .lore-sync-tmp-*/.lore-nofollow-tmp-*' failures in writeFileAtomic and writeFileNoFollow no longer occur, and the 'lint · typecheck · test (windows-latest)' CI leg is GREEN on the fix PR (verified via the check-run conclusion, run id/URL recorded).
- [x] #2 No regression on macOS/ubuntu: full 'bun test' passes, 'bun run typecheck' is clean, and 'bun run lint' (biome) stays green.
- [x] #3 The fix preserves each documented invariant of both functions, each still covered by its existing test: LCLI-231 temp-leak guard (mid-write failure cleans up the temp file lore created; lore never unlinks a file it did not create), LCLI-117 mode/ownership preservation, LCLI-130/LCLI-92 symlink safety in writeFileNoFollow, and per-file write-temp-then-rename atomicity.
- [x] #4 The Windows-incompatible openSync primitive is replaced by the cross-platform exclusive-create primitive in both writeFileAtomic and writeFileNoFollow, with a short in-code note explaining the Bun-Windows avoidance; task notes record the green Windows CI run as objective evidence.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the Windows-incompatible openSync(O_WRONLY|O_CREAT|O_EXCL,0o666)+writeSync+closeSync temp-create in BOTH writeFileAtomic (~L250-273) and writeFileNoFollow (~L737-758) with the cross-platform exclusive-create primitive writeFileSync(tmpPath, <bytes>, {flag:'wx'}) — proven to work on Bun-Windows (createIfAbsent uses it; 140 pass on Windows).
2. Preserve every invariant: LCLI-231 leak guard (set tmpFileExists true only after a provable exclusive create so a name-collision EEXIST never unlinks a foreign file, and still clean up the temp on a mid-write failure); LCLI-117 mode/ownership carry-over; LCLI-130/92 symlink refusal in writeFileNoFollow; write-temp-then-renameSync atomicity; ioError classification. Confirm renameSync-over-existing works on Windows (research pass) — if not, address it too.
3. Local (macOS) no-regression gate: bun test (full), bun run typecheck, bun run lint (biome) all green.
4. Push feature/LCLI-252, open PR; the ONLY real Windows verification is the 'lint · typecheck · test (windows-latest)' CI leg going GREEN on the PR (plus required docker-e2e green). Iterate if red.
5. Merge, record the green Windows run id/URL as objective evidence, mark Done.

Approach validated by a 4-agent research+trace+synthesize+adversarial workflow before implementation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-07-24, feature/LCLI-252)

**Product fix (the real Windows bug):** In src/commands/fswrite.ts, both writeFileAtomic and writeFileNoFollow now create their temp file via a Windows-safe two-phase writeFileSync: (1) `writeFileSync(tmpPath, "", {flag:'wx'})` exclusively creates an empty temp (sets the LCLI-231 leak guard the instant it provably, exclusively exists), then (2) `writeFileSync(tmpPath, Buffer.from(contents,'utf8'), {flag:'w'})` writes the bytes. This replaces the numeric-flag `openSync(O_WRONLY|O_CREAT|O_EXCL,0o666)`+writeSync+closeSync that Bun/Windows spuriously ENOENTs on. `wx`==O_CREAT|O_EXCL (same primitive createIfAbsent uses; 140 wx-based tests already pass on Bun/Windows). Removed now-unused imports (openSync/writeSync/closeSync/constants). Invariants preserved and re-verified: LCLI-231 leak guard (two separate calls; mid-write failure still unlinks the temp we created; EEXIST name-collision throws before tmpFileExists flips so we never unlink a foreign file), LCLI-117 mode/ownership carry-over (unchanged), LCLI-130/92 symlink safety (unchanged), write-temp-then-renameSync atomicity (unchanged). writeAllBytes stays exported+unit-tested but the two writers no longer route through it (writeFileSync loops internally).

**Test seam updates:** the LCLI-116/130/231 failure-injection tests (test/fswrite.test.ts, test/replace.test.ts) previously mocked fs.writeSync/openSync; re-pointed to fs.writeFileSync discriminating on options.flag — the 'wx' create is forwarded (so tmpFileExists flips + temp really exists) and the failure is injected only on the 'w' byte-write. Intent preserved.

**POSIX-only test guards (needed for a fully green win32 leg; matches the codebase's existing symlink-test skipIf pattern):**
- 3 tests that build fixtures with Windows-ILLEGAL filenames (control chars / newline in the name) to verify OUTPUT sanitization — cannot be created on win32 (writeFileSync/writeDoc ENOENT at setup): test/query.test.ts LCLI-158, test/replace.test.ts LCLI-229 (plain + --json). skipIf(win32); behavior stays fully covered on POSIX.
- Unix mode-preservation tests (assert statSync().mode&0o777 == 0o600/0o640) — Windows has no Unix mode bits: test/fswrite.test.ts 'writeFileAtomic — mode preservation (LCLI-117)' describe + the LCLI-130 'mode is preserved across a force overwrite' test. skipIf(win32).
- Also corrected two now-stale writeSync->writeFileSync references in fswrite.test.ts's module docstring/import comment.

**Rename-over-existing risk (researched):** Windows fs.renameSync uses MoveFileEx which replaces an existing destination (does NOT EEXIST for a regular file), so the sync idempotent-overwrite tests pass the rename step; only a transient EPERM from a file lock is possible (rare, not the deterministic bug) — not addressed here (would be a separate retry concern).

**Local verification (macOS, AC#2):** bun run typecheck clean; bun run lint (biome, 109 files) clean; bun test = 2062 pass / 0 fail. The Windows-only fix (AC#1) can only be confirmed by the win32 CI leg on the PR — pending.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the Bun/Windows openSync(O_CREAT|O_EXCL) ENOENT in writeFileAtomic + writeFileNoFollow by switching both to a two-phase writeFileSync({flag:'wx'})+writeFileSync({flag:'w'}) temp create (the same exclusive-create primitive createIfAbsent uses, proven on Bun/Windows), preserving the LCLI-231/117/130/92 invariants; re-pointed the failure-injection tests to fs.writeFileSync; and guarded the ~3 genuinely-POSIX-only failures (control-char/newline-in-filename sanitization fixtures LCLI-158/229, Unix mode-preservation asserts LCLI-117/130) with skipIf(win32), matching the repo's symlink-test pattern. VERIFIED: the 'lint · typecheck · test (windows-latest)' CI leg is GREEN for the first time ever (run 30114430122, job 89551515253 = pass, 1m7s) — the whole PR #242 CI was all-green incl. required docker-e2e; locally bun test 2062 pass / typecheck clean / biome clean. Merged to dev as 95b633f (rebase, PR #242). No macOS/ubuntu regression (both green in CI + local).
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LORE-139
title: >-
  Profile-declared type `template` path allows reading files outside
  .lore/templates/ via traversal
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 19:42'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
modified_files:
  - src/core/profile.ts
  - test/profile.test.ts
  - test/new.test.ts
priority: medium
type: bug
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
profile.ts's type-table parser (profile.ts:404, `asString(table.template, ...)`) accepts any string for a type's `template` attribute with no path-traversal or confinement validation. commands/new.ts's confinement guard (`assertTemplateNameConfined`) and symlink check only apply to the `--template` CLI flag, not to a profile-declared `template` value, which is joined under `.lore/templates/` and read directly. This was empirically reproduced: a `.lore/profile.toml` type declaring `template = "../../../secret_outside/leak"` made `lore new` read and embed the literal contents of a file three directories above the repo root into the generated concept, with exit code 0 and no error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A profile.toml type whose `template` value contains a path-traversal segment (e.g. `../../../secret_outside/leak`) is rejected — either at profile load time or at `lore new` resolution time — with a clear error, instead of being read and embedded into the generated document.
- [x] #2 A regression test (in test/profile.test.ts or test/new.test.ts) reproduces a profile-declared `template` value with `../` traversal and asserts `lore new` fails with an error rather than exiting 0 with content from outside `.lore/templates/`.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace the trust boundary: profile.ts's parseTypes accepts any string for [[types]].template with zero path validation; commands/new.ts's resolveTemplate joins it under .lore/templates/ and reads it directly (no confinement, no symlink check) for the profile-declared fallback path, unlike the --template CLI flag which already has assertTemplateNameConfined + symlink checks.
2. Fix at the single choke point: add assertTemplateConfined() in src/core/profile.ts, called from parseTypes for every [[types]].template value at profile PARSE time (loadProfile time) -- rejects absolute paths (host/posix/win32) and any '..' segment escape via a fixed-anchor resolve/relative check, mirroring commands/new.ts's own assertTemplateNameConfined rationale. This protects every current and future consumer of CompiledType.template (verified: only new.ts reads it), not just resolveTemplate's one call site.
3. Deliberately leave the LORE-91 symlink-scope precedent alone: a SYMLINKED profile-declared template is documented (test/new.test.ts) as intentionally out of scope for that prior task; LORE-139 is only about syntactic path-traversal/absolute-path confinement, not symlink-following.
4. Add regression tests: test/profile.test.ts (parse-time rejection: traversal, absolute posix, absolute win32, plus a same-shape-but-legitimate '..custom' non-escape to avoid a false positive) and test/new.test.ts (end-to-end: lore new with a profile declaring a traversing/absolute template fails with a validation error, never reads/embeds the outside file, exit nonzero).
5. Verify: bun test (full suite) + bun run typecheck both green; no docs/ changes so no lore check needed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed at the single choke point: added assertTemplateConfined() in src/core/profile.ts, called from parseTypes for every [[types]].template value at profile PARSE time. Rejects absolute paths (host/posix/win32 isAbsolute) and any '..'-segment escape via a fixed-anchor posix.resolve/relative check (backslash segments normalized to / first, so a Windows-style traversal is caught even parsed on a POSIX host). Verified only new.ts consumes CompiledType.template, so this is the complete fix surface -- commands/new.ts was NOT modified. Deliberately left the LORE-91 symlink-following behavior for profile-declared templates untouched (documented out-of-scope by that task's own test, test/new.test.ts:339); LORE-139 is scoped to path-traversal/absolute-path confinement only.

Added regression tests: test/profile.test.ts (parse-time rejection of traversal, subdir-then-traverse, absolute posix, absolute win32; plus a same-shape-but-legitimate '..custom' non-escape to prove no false positive) and test/new.test.ts (end-to-end: lore new with a profile declaring a traversing or absolute template fails with a validation LoreError, never reads/embeds the outside file, no partial artifact written).

Got a codex (gpt-5.6-sol, xhigh) second-opinion review on the uncommitted diff. It found one real P1: my new.test.ts regression test built the traversal string via node:path relative() and spliced it unescaped into a TOML basic (double-quoted) string -- on windows-latest CI, relative() returns backslash-separated segments, and Bun's TOML parser would consume those backslashes as escapes, silently mangling the value into a harmless non-traversal string and making the test's own expectError assertion fail on that CI leg (a test-harness bug, not a gap in the production assertTemplateConfined, which already normalizes \ to / before checking). Fixed by normalizing the traversal string to forward slashes (split(sep).join("/")) before writing it into the TOML. Re-verified bun test / typecheck / lint all green after the fix.

Verification: bun test -> 1778 pass, 0 fail (5024 expect() calls, 47 files). bun run typecheck -> clean (tsc --noEmit, no output). bun run lint -> 0 errors (4 pre-existing infos in unrelated files, untouched by this change). No docs/ files changed, so no lore check run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed a path-traversal vulnerability where a profile-declared [[types]].template value in .lore/profile.toml was joined under .lore/templates/ and read with zero confinement check, letting a malicious/careless profile.toml make 'lore new' read and embed an arbitrary file from outside the repo (exit 0, no error). Added assertTemplateConfined() in src/core/profile.ts, enforced at profile PARSE time for every declared template value (rejects absolute paths on host/posix/win32, and any '..'-segment escape via a fixed-anchor resolve/relative check) -- the single choke point, since only commands/new.ts consumes the compiled template field. Left the pre-existing LORE-91 symlink-scope decision for profile-declared templates untouched (out of this task's scope). Added regression coverage in test/profile.test.ts and test/new.test.ts, including a codex-review-caught Windows-CI TOML-escaping bug in my own new test (fixed by normalizing path separators before writing TOML). Verified: bun test 1778 pass/0 fail, bun run typecheck clean, bun run lint 0 errors.
<!-- SECTION:FINAL_SUMMARY:END -->

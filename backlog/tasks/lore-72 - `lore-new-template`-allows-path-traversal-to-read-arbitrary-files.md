---
id: LORE-72
title: '`lore new --template` allows path traversal to read arbitrary files'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 11:30'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The --template flag value is interpolated into a file path under .lore/templates/ with no basename or traversal validation. Reproduced directly: `lore new adr "Test" --template ../../../../../../tmp/outside_secret --out docs/adr/test.md` reads /tmp/outside_secret.md and copies its exact bytes into the generated concept, entirely outside .lore/templates/ and the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A --template value containing `..` segments or resolving outside .lore/templates/ is rejected with a clear usage error
- [x] #2 An absolute-path --template value is likewise rejected
- [x] #3 A test reproduces the traversal repro above and asserts it now fails instead of reading the outside file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: src/commands/new.ts's resolveTemplate() built the file path to read as
`${TEMPLATES_DIR}/${candidate}.md` where `candidate` derives from `base = parsed.template ?? declared
?? type`, with `parsed.template` being the raw, completely unvalidated --template CLI flag value
spliced straight into join(root, relPath) then readFileSync — no basename/traversal/absolute check
at all before this fix.

Fix: added assertTemplateNameConfined(name, root), called on parsed.template (only the explicit
CLI flag, not the profile-declared or type-name fallback bases, matching the AC's scope) BEFORE it
is ever used to build `base`/a candidate path. Two layers, mirroring resolveOutPath's own
already-proven containment pattern in this same file: (1) reject any value that LOOKS absolute
under isAbsolute (host-bound) OR posix.isAbsolute OR win32.isAbsolute explicitly — checking win32
unconditionally regardless of host platform matters because this ships as a compiled binary for
both platforms from the same source, and a Windows drive-letter path is inert on a POSIX host
(backslash isn't special there) but genuinely absolute once compiled for win32; relying only on the
host-bound isAbsolute would silently miss this platform-mismatch case on whichever host happens to
be running the test suite. (2) reject anything whose resolve()+relative() result against the real
templates directory escapes it (`..`-prefixed or absolute) — catches `..` segments, `./../`
variants, doubled slashes, and nested subdir-then-climb-out forms, all via real path resolution
rather than a naive string/segment scan.

Verified a NUL byte does NOT need the same LORE-69-style guard here: unlike LORE-69's exec/argv
boundary (Bun.spawn truncating a C-string at NUL), readFileSync is a direct fs syscall that Bun/Node
validates and synchronously THROWS on any embedded NUL before ever reaching the OS — confirmed
empirically (`bun -e` repro) that a NUL-containing path throws a TypeError naming the exact bad
string, no silent truncation, so there is no validate-vs-execute divergence to exploit at this
particular boundary. Checked per the campaign's new LORE-69 convention rather than assumed.

Live end-to-end verification against the real CLI (scratch bundle):
- Pre-fix: `lore new adr "Test" --template ../../../lore72-secret --out docs/adr/test.md` (computed
  relative traversal to a real file outside the scratch repo) exited 0 and embedded the outside
  file's exact content into the generated concept — the task's own repro, reproduced live.
- Post-fix: same command exits 2 with `--template value "..." must not escape .lore/templates/`;
  no file is created at all (no partial artifact).
- Absolute path (`/etc/passwd`) exits 2, `must not be an absolute path`.
- A `--template ..custom` (a name merely STARTING with `..`, not a real `..` segment — same
  distinction resolveOutPath's own tests already establish for --out) is correctly NOT rejected
  and resolves its real template file.
- The no-flag fallback path (profile-declared or bare type name) is unaffected — the new guard
  only runs when parsed.template is explicitly set.

9 new automated tests in test/new.test.ts (5 for the traversal/absolute-path fix incl. the exact
task repro shape and a Windows-drive-letter case, confirmed via git stash to fail pre-fix with the
tell-tale `not_found` instead of `usage` — i.e. pre-fix it silently fell through to the ENOENT path
after actually reading — and pass post-fix; 1 legit-name non-regression test unaffected either way).

Full bun test: 1534 pass / 0 fail (up from 1529 baseline). bun run typecheck clean. bunx biome
check clean (one formatter-only fix applied).
<!-- SECTION:NOTES:END -->

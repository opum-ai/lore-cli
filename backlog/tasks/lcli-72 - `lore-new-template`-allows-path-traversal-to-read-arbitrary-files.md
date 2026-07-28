---
id: LCLI-72
title: '`lore new --template` allows path traversal to read arbitrary files'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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

Verified a NUL byte does NOT need the same LCLI-69-style guard here: unlike LCLI-69's exec/argv
boundary (Bun.spawn truncating a C-string at NUL), readFileSync is a direct fs syscall that Bun/Node
validates and synchronously THROWS on any embedded NUL before ever reaching the OS — confirmed
empirically (`bun -e` repro) that a NUL-containing path throws a TypeError naming the exact bad
string, no silent truncation, so there is no validate-vs-execute divergence to exploit at this
particular boundary. Checked per the campaign's new LCLI-69 convention rather than assumed.

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

INDEPENDENT REVIEW: the direct fix (traversal/absolute --template rejection, ACs 1-3) has NO
bypass found — every encoding tried against the real CLI (the task's own repro, absolute paths,
Windows drive-letter paths, UNC paths, doubled slashes, ./../ variants, nested subdir-then-climb,
empty/./..-alone) was correctly rejected; the "..custom" non-regression case correctly still
passes. NUL-byte non-applicability and the win32/posix cross-platform absolute-path handling were
both independently re-verified and confirmed to hold. Doc comment tweaked (not a functional
change) per the review's one nuance: the resolve+relative containment layer, not just the
win32.isAbsolute check, is what actually defends a drive-relative path to a DIFFERENT drive than
the repo's own (e.g. --template D:foo from a C:-hosted repo) — confirmed via path.win32 simulation
that win32.relative() between disjoint drives returns the target unchanged, still caught by the
containment check. Verdict: ready to ship as scoped.

REVIEW ALSO FOUND (explicitly recommended NOT to block this PR on, since both are outside this
task's AC scope — documented here per campaign convention, not silently fixed or silently
ignored):

(a) SYMLINK GAP (the more significant finding): assertTemplateNameConfined is purely syntactic
(resolve+relative), no lstatSync/realpath check. A symlink already planted inside .lore/templates/
(e.g. .lore/templates/evil.md -> /outside/secret.md, committed into the repo by whoever controls
its content) makes a completely innocuous-looking bare --template evil read straight through it —
confirmed live against the real CLI, including a nested-subdirectory variant. This requires
attacker control of REPO CONTENT (a malicious/cloned repo), not just the --template flag, so it's
a narrower threat model than this task's own CLI-flag-only repro and outside its AC. But it is the
SAME escape class the codebase already has an established, precedented guard for on READ paths —
src/core/bundle.ts's walkMarkdown and src/commands/replace.ts both use lstatSync(...).isSymbolicLink()
and explicitly skip/warn ("a symlink could resolve outside the bundle") — new.ts's readTemplateFile
has no equivalent check. It is the READ-path counterpart to the still-open LCLI-76/LCLI-77 (which
are specifically about scaffold/init's WRITE-path symlink-following, a different code path
entirely, confirmed by reading both tasks) — NOT covered by either. See tracker's Not-queued
section for the follow-up candidate.

(b) PROFILE-DECLARED TEMPLATE (deliberately excluded, not a bug in this PR): assertTemplateNameConfined
only runs on parsed.template (the explicit CLI flag), not `declared` (a .lore/profile.toml type's
own `template` field) — by design, matching this task's AC wording ("A --template value..."). The
review confirmed a profile.toml with template = "../../../outside_secret.md" is still a live,
unguarded arbitrary-file-read primitive with NO --template flag needed at all. Repo config is a
trusted input elsewhere in this codebase too (see profile.ts's own trust model), so this isn't a
regression or a gap THIS task introduces — but it means "arbitrary file read via lore new" isn't
fully closed as a class, only narrowed to the CLI flag. Noted for awareness, not filed separately
(same trust-boundary reasoning as the rest of profile.toml's existing attack surface).

Full bun test after the doc-comment fix: 1534 pass/0 fail (unchanged, no logic change). bun run
typecheck clean. bunx biome check clean.
<!-- SECTION:NOTES:END -->

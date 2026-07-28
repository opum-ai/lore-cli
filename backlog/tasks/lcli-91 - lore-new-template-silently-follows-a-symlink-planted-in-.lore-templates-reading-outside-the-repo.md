---
id: LCLI-91
title: >-
  lore new --template silently follows a symlink planted in .lore/templates/,
  reading outside the repo
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - backlog-campaign-followup
  - security
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: high
type: bug
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/new.ts's readTemplateFile (line 428) reads the resolved template path via a plain `readFileSync(absPath, "utf8")` with no `lstatSync(...).isSymbolicLink()` guard anywhere in the read path. LCLI-72's assertTemplateNameConfined (new.ts, ~lines 379-414), the only validation --template's value goes through, is purely syntactic: it resolves the NAME string and checks containment (`..`, absolute-path forms) but never stats the resulting file. A bare, unsuspicious `--template <name>` passes cleanly even when `.lore/templates/<name>.md` is itself a symlink pointing outside `.lore/templates/`.

Confirmed live on current dev HEAD: with `.lore/templates/evil.md` symlinked to an out-of-repo file, running `lore new adr "Test Evil" --template evil --out docs/adr/test-evil.md` exits 0 and writes the generated concept with the linked-to file's exact content as its body. The same holds for a symlink nested in a subdirectory.

The codebase already has a precedented guard for exactly this escape class on other read paths: src/core/bundle.ts's walkMarkdown and src/commands/replace.ts's symlink check both detect a symlink and skip/warn rather than follow it, with the explicit rationale that "a symlink could resolve outside the bundle." new.ts's template read has no equivalent check. LCLI-76/LCLI-77's write-path symlink guard (fswrite.ts's exported `assertNoSymlinkInPath`) is wired only into init.ts's scaffold loops and fswrite.ts's own writeAllOrRollback — it does not cover new.ts, so it does not incidentally close this gap.

This requires attacker control of repo CONTENT (a symlink committed into `.lore/templates/` by whoever authors or distributes the repo), narrower than LCLI-72's own CLI-flag-only path-traversal repro. But it is a genuine information-disclosure primitive under the exact threat model the already-shipped LCLI-76/77 write-path fixes treat as worth guarding: a user who clones a repo and runs the ordinary-looking `lore new <type> "<title>" --template <name>` can have an arbitrary local file's contents silently copied into a newly generated, possibly-committed document.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore new <type> "<title>" --template <name>` where the resolved template file (`.lore/templates/<name>.md` or its lower-cased candidate) is a symlink refuses to read through it and reports a clear error instead of embedding the link target's content into the generated concept.
- [x] #2 The same refusal fires when the symlink is nested inside a subdirectory of .lore/templates/, not only at the top level.
- [x] #3 When the refusal fires, no output file is created at the computed docPath - the command leaves no partial artifact and does not silently fall back to a built-in template in place of the rejected symlink.
- [x] #4 A profile-declared template base (the non---template fallback path) is unaffected by the new check's scope, consistent with LORE-72's own precedent of scoping its guard to the explicit CLI flag only and leaving the profile-declared path's separate, already-recorded-as-out-of-scope trust boundary untouched.
- [x] #5 Automated tests cover both the top-level and nested-subdirectory symlinked-template cases and assert the current live-repro behavior (silent read-through, exit 0, secret content embedded) now fails/rejects instead.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/new.ts: add a checkSymlink parameter to readTemplateFile, using
   fswrite.ts's existing findSymlinkSegment (LCLI-94 precedent) to refuse a
   symlinked template path before reading it. Scoped to the explicit --template
   CLI flag only (AC#4) via a new explicitTemplate flag computed in
   resolveTemplate from parsed.template !== undefined, matching LCLI-72's own
   precedent of scoping its confinement guard to the explicit flag.
2. Tests in test/new.test.ts: top-level symlinked template, nested-subdirectory
   symlinked template, symlinked ancestor directory, plus two tests proving
   AC#4 (a normal declared template still works; a symlinked declared template
   is deliberately still followed, documenting the intentional scope boundary).
3. Live-CLI verification via .repro-scratch/lore91-verify + git stash pre/post
   comparison against a real symlinked template.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing (line numbers matched the
filing task's citations closely: readTemplateFile at new.ts:428, assertTemplateNameConfined at 399
vs the cited ~379-414 range): src/commands/new.ts's readTemplateFile read the resolved template
path via a plain readFileSync with no lstatSync/symlink guard anywhere in the read path.
assertTemplateNameConfined (the only validation --template's value goes through) is purely
syntactic -- containment via resolve()+relative(), never a stat -- so a bare --template evil whose
resolved .lore/templates/evil.md was itself a symlink to an outside file passed cleanly and had
that file's exact content embedded in the generated concept.

Fix: added a checkSymlink parameter to readTemplateFile, using fswrite.ts's existing
findSymlinkSegment (the same non-throwing per-segment lstatSync walk LCLI-94 extracted from
LCLI-76/77's assertNoSymlinkInPath, reused here rather than re-derived) to refuse -- with a
conflict LoreError naming the offending segment -- before the read ever happens. Scoped to the
explicit --template CLI flag only (AC#4): resolveTemplate computes
explicitTemplate = parsed.template !== undefined once (loop-invariant, computed before the
candidate loop, same condition that already gates assertTemplateNameConfined) and threads it
through as checkSymlink, so the profile-declared template fallback path is completely untouched,
matching LCLI-72's own precedent of scoping its confinement guard to the explicit flag.

AC#1/AC#2/AC#5: 3 regression tests -- top-level symlinked template, nested-subdirectory symlinked
template, and a symlinked ANCESTOR directory (not just the final file, a genuinely distinct case:
the symlinked-ancestor test's final resolved path doesn't even exist under the real target, so a
weaker final-lstat-only implementation would have produced not_found instead of conflict --
verified this distinction is load-bearing, not just documentation flavor).

AC#4: two companion tests -- a normal profile-declared template still resolves correctly
(baseline), and a SYMLINKED profile-declared template is deliberately still followed unchanged
(documents the intentional, already-recorded scope boundary explicitly).

Live-CLI verification: .repro-scratch/lore91-verify/, driving the real `lore new` CLI against a
real scratch bundle with an actual symlinked .lore/templates/evil.md. git stash comparison on
new.ts: PRE-FIX, the identical command exited 0 and wrote the generated concept with the linked-to
file's exact "SUPER SECRET DATA" content as its body. POST-FIX, the same command refuses at exit 5
naming the symlink, no output file ever created.

Independent review (general-purpose subagent, asked for complete findings in one response): no
blocking findings. Independently traced the scoping mechanism (confirmed explicitTemplate is
loop-invariant, no per-candidate branching gap); read findSymlinkSegment directly and confirmed it
correctly walks every path segment including non-existent intermediate ones (graceful, no false
positive); independently verified the ancestor-directory test is load-bearing, not redundant with
the nested-file test, by reasoning through what a weaker final-lstat-only implementation would
produce; ran its OWN live-CLI verification from this branch's source against fresh scratch bundles
(top-level, nested, ancestor-symlink refusals; profile-declared-symlink pass-through), all matching
this session's own results independently; confirmed the "conflict" error type is consistent with
fswrite.ts's own assertNoSymlinkInPath (the identical write-path precedent) and with ioError's
existing convention of folding ELOOP/EEXIST/ENOTDIR/EISDIR into one conflict category; confirmed
readTemplateFile has exactly one call site so the new 4th parameter breaks nothing; confirmed no
scope bleed from the still-To-Do sibling LCLI-93. Two non-blocking notes, both judged acceptable:
(a) no dedicated test for a symlink at the lower-cased-only candidate specifically (mechanism is
structurally sound regardless, per source-level tracing -- macOS's case-insensitive filesystem
makes a live differential check impractical here); (b) a check-then-act TOCTOU window between the
lstatSync walk and the plain readFileSync, confirmed to be PARITY with this codebase's own existing
read-path precedent elsewhere (core/bundle.ts's walkMarkdown, commands/replace.ts both have the
identical shape), not a new or weaker gap, out of scope for this task.

Process note: branched late this session -- implemented the fix directly on `dev` before realizing
the per-issue lifecycle's step 1 (branch) had been skipped. Caught before anything was committed;
recovered via `git checkout -b feature/LCLI-91` from the same HEAD, which carried the uncommitted
working-tree changes over cleanly with no loss and no `dev` pollution. No functional impact.

Verified: bun test -> 1693 pass/0 fail (up from 1688); bun run typecheck clean; bun run lint clean
on all changed files -- 4 pre-existing infos remain in unrelated files, untouched.
<!-- SECTION:NOTES:END -->

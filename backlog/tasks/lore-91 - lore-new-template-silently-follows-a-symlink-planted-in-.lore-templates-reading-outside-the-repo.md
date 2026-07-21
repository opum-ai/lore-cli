---
id: LORE-91
title: >-
  lore new --template silently follows a symlink planted in .lore/templates/,
  reading outside the repo
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
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/new.ts's readTemplateFile (line 428) reads the resolved template path via a plain `readFileSync(absPath, "utf8")` with no `lstatSync(...).isSymbolicLink()` guard anywhere in the read path. LORE-72's assertTemplateNameConfined (new.ts, ~lines 379-414), the only validation --template's value goes through, is purely syntactic: it resolves the NAME string and checks containment (`..`, absolute-path forms) but never stats the resulting file. A bare, unsuspicious `--template <name>` passes cleanly even when `.lore/templates/<name>.md` is itself a symlink pointing outside `.lore/templates/`.

Confirmed live on current dev HEAD: with `.lore/templates/evil.md` symlinked to an out-of-repo file, running `lore new adr "Test Evil" --template evil --out docs/adr/test-evil.md` exits 0 and writes the generated concept with the linked-to file's exact content as its body. The same holds for a symlink nested in a subdirectory.

The codebase already has a precedented guard for exactly this escape class on other read paths: src/core/bundle.ts's walkMarkdown and src/commands/replace.ts's symlink check both detect a symlink and skip/warn rather than follow it, with the explicit rationale that "a symlink could resolve outside the bundle." new.ts's template read has no equivalent check. LORE-76/LORE-77's write-path symlink guard (fswrite.ts's exported `assertNoSymlinkInPath`) is wired only into init.ts's scaffold loops and fswrite.ts's own writeAllOrRollback — it does not cover new.ts, so it does not incidentally close this gap.

This requires attacker control of repo CONTENT (a symlink committed into `.lore/templates/` by whoever authors or distributes the repo), narrower than LORE-72's own CLI-flag-only path-traversal repro. But it is a genuine information-disclosure primitive under the exact threat model the already-shipped LORE-76/77 write-path fixes treat as worth guarding: a user who clones a repo and runs the ordinary-looking `lore new <type> "<title>" --template <name>` can have an arbitrary local file's contents silently copied into a newly generated, possibly-committed document.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore new <type> "<title>" --template <name>` where the resolved template file (`.lore/templates/<name>.md` or its lower-cased candidate) is a symlink refuses to read through it and reports a clear error instead of embedding the link target's content into the generated concept.
- [ ] #2 The same refusal fires when the symlink is nested inside a subdirectory of .lore/templates/, not only at the top level.
- [ ] #3 When the refusal fires, no output file is created at the computed docPath - the command leaves no partial artifact and does not silently fall back to a built-in template in place of the rejected symlink.
- [ ] #4 A profile-declared template base (the non---template fallback path) is unaffected by the new check's scope, consistent with LORE-72's own precedent of scoping its guard to the explicit CLI flag only and leaving the profile-declared path's separate, already-recorded-as-out-of-scope trust boundary untouched.
- [ ] #5 Automated tests cover both the top-level and nested-subdirectory symlinked-template cases and assert the current live-repro behavior (silent read-through, exit 0, secret content embedded) now fails/rejects instead.
<!-- AC:END -->

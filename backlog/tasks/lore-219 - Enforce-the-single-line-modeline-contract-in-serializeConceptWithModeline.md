---
id: LORE-219
title: Enforce the single-line modeline contract in serializeConceptWithModeline
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-concept-manifest
  - codex-review-followup
  - hardening
dependencies: []
priority: low
type: enhancement
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `serializeConceptWithModeline` (src/core/concept.ts:390-397) rejects a `modeline` argument that is not a single line instead of splicing it verbatim.

**Why:** The function splices `modeline` as the first line inside the opening `---` fence (`return \`${FENCE}${modeline}\n${serialized.slice(FENCE.length)}\``) and its docstring (L373-389) explicitly assumes a one-line `# yaml-language-server:` comment, but it performs no validation. A `modeline` containing a newline would inject arbitrary extra lines inside/after the fence, corrupting the emitted document (potentially breaking the very byte-stability / parse-back guarantee concept.ts exists to uphold). concept.ts is otherwise built entirely on fail-loud invariants, so this is the one unenforced one.

**Live context:** All current callers (src/core/template.ts:217, src/core/scaffold.ts:173) pass `schemaModeline(...)` output, which is single-line by construction (slugForTypeName at src/core/profile.ts:196-203 collapses non-alphanumerics), so there is **no reachable trigger today** — this is defensive contract-enforcement, not a live-triggerable bug.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster core-concept-manifest; re-audit round 3 confirmed still-present against dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 serializeConceptWithModeline throws a LoreError (validation type, exit 6) when its `modeline` argument contains a newline (i.e. is not a single line), rather than splicing it verbatim.
- [ ] #2 A single-line modeline still splices byte-identically to today: the existing test/concept.test.ts 'serializeConceptWithModeline — modeline spliced inside the opening fence' cases (L281-311) remain green unchanged.
- [ ] #3 A new regression test in test/concept.test.ts asserts that a multi-line modeline (e.g. one containing '\n') is rejected and never spliced into the output.
- [ ] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->

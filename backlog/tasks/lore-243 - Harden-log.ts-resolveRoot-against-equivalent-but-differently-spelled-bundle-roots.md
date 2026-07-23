---
id: LORE-243
title: >-
  Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle
  roots
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-engine-a
  - codex-review-followup
  - core
dependencies: []
priority: low
type: bug
ordinal: 345000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome.** `resolveRoot` in `src/core/log.ts:179-181` should treat equivalent spellings of the same bundle root as identical, so a root authored as `./docs`, `docs/.`, `./docs/`, or with internal redundant separators (`docs//adr`, `docs/./adr`) scopes `log.md` to the same folders as `docs` instead of silently producing an empty log.

**Why.** The helper's only transform today is `(root || DOCS_DIR).replace(/\/+$/, "") || DOCS_DIR` — it strips trailing slashes and falls back on all-slashes/empty roots, but leaves leading `./`, trailing `/.`, and internal `/./` or `//` un-normalized. `isUnderRoot` (`src/core/log.ts:204-206`) then compares `file.startsWith(`${root}/`)` against the non-canonical root and matches nothing, yielding just `# Change log\n`. Because `resolveRoot` is the single seam shared by both `generateLog` (post-filter) and `buildLog` (the pathspec handed to `GitAdapter.history`), the two must resolve to the same canonical root — fix belongs in that one place so they stay in agreement.

**Live context / reachability.** Empirically confirmed on `dev`: `generateLog(hist, { root })` for `root` in `./docs`, `docs/.`, `docs/./adr`, `./docs/` all return an empty log, while `docs`, `docs/`, `docs///` match. Currently latent — the only production caller (`src/commands/sync.ts:289-290`) passes the hardcoded `DOCS_DIR` ("docs") constant, so no malformed spelling reaches it today; `src/adapters/git.ts:42-43` documents the root seam as a "no-op in practice" retained for a "plausible future" profile-configurable docs root, which is when this would bite. `posix` is already imported in this module. Existing normalization tests live at `test/log.test.ts:158,192-193`.

**Provenance.** Codex second-opinion review (backlog doc-2), low-severity finding, cluster `core-engine-a`; round-3 re-audit confirmed still-open (not resolved by the round-1/2 campaign).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given commits touching files under `docs/`, `generateLog(commits, { root })` produces byte-identical output for `root` values "docs", "./docs", "docs/.", and "./docs/" (none silently empty).
- [ ] #2 A root with internal redundant separators — "docs//adr" and "docs/./adr" — resolves to the same bundle root as "docs/adr".
- [ ] #3 Existing behavior preserved: an empty or all-slashes root still falls back to DOCS_DIR, and "docs"/"docs/"/"docs///" continue to match — the existing assertions at test/log.test.ts:158,192-193 stay green.
- [ ] #4 buildLog forwards the same canonicalized root to `adapter.history` as the pathspec (extend the LORE-143 assertion in test/log.test.ts so generateLog's post-filter and the adapter walk still agree on the resolved root).
- [ ] #5 New tests added in test/log.test.ts covering the equivalent-spelling cases above; `bun test test/log.test.ts` passes and no other suite regresses.
<!-- AC:END -->

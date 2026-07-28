---
id: LCLI-243
title: >-
  Harden log.ts resolveRoot against equivalent-but-differently-spelled bundle
  roots
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
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
- [x] #1 Given commits touching files under `docs/`, `generateLog(commits, { root })` produces byte-identical output for `root` values "docs", "./docs", "docs/.", and "./docs/" (none silently empty).
- [x] #2 A root with internal redundant separators — "docs//adr" and "docs/./adr" — resolves to the same bundle root as "docs/adr".
- [x] #3 Existing behavior preserved: an empty or all-slashes root still falls back to DOCS_DIR, and "docs"/"docs/"/"docs///" continue to match — the existing assertions at test/log.test.ts:158,192-193 stay green.
- [x] #4 buildLog forwards the same canonicalized root to `adapter.history` as the pathspec (extend the LORE-143 assertion in test/log.test.ts so generateLog's post-filter and the adapter walk still agree on the resolved root).
- [x] #5 New tests added in test/log.test.ts covering the equivalent-spelling cases above; `bun test test/log.test.ts` passes and no other suite regresses.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/log.ts, harden resolveRoot to run posix.normalize() before stripping trailing slashes so ./docs, docs/., ./docs/, docs//adr, docs/./adr all canonicalize like docs/docs/adr; keep DOCS_DIR fallback for empty/all-slashes/dot results.
2. Add new tests in test/log.test.ts: (a) generateLog byte-identical across docs/./docs/docs/./ (docs/) spellings, (b) internal redundant separators docs//adr and docs/./adr resolve like docs/adr, (c) extend the LCLI-143 buildLog assertion so an equivalent-spelling root also arrives at adapter.history identically to its canonical form.
3. Verify existing AC#3 assertions (test/log.test.ts:157-158, 191-193) stay green unmodified.
4. Run bun test + bun test test/log.test.ts + bun run typecheck; spot-check biome on changed files only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed resolveRoot (src/core/log.ts) to run posix.normalize() before stripping trailing slashes, so ./docs, docs/., ./docs/, docs//adr, docs/./adr all canonicalize to the same root as docs/docs/adr; empty/all-slashes/'.' results still fall back to DOCS_DIR. Single seam still shared by generateLog and buildLog. Verified: bun test test/log.test.ts -> 23 pass/0 fail; full bun test -> 1975 pass/0 fail; bun run typecheck -> clean; bunx biome check src/core/log.ts test/log.test.ts -> no issues. Added 3 new tests: equivalent-spelling byte-identical (AC1), internal-separator canonicalization docs//adr & docs/./adr -> docs/adr (AC2), and an extended LCLI-143 buildLog assertion proving './docs/' forwards as 'docs' to adapter.history (AC4). Pre-existing AC3 assertions at test/log.test.ts:157-158 and 191-193 (now shifted a few lines due to insertions but same assertions/content) remain green and unmodified in substance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened resolveRoot in src/core/log.ts to posix.normalize() the root before stripping trailing slashes, so equivalent spellings (./docs, docs/., ./docs/, docs//adr, docs/./adr) canonicalize identically to docs/docs/adr instead of silently producing an empty log.md. Empty/all-slashes/'.' roots still fall back to DOCS_DIR. Fixed in the single seam shared by generateLog (post-filter) and buildLog (adapter pathspec), so the two never disagree. Verified via bun test (1975 pass/0 fail incl. 23/23 in test/log.test.ts), bun run typecheck (clean), and bunx biome check on both changed files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LCLI-17
title: lore init
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - cmd
  - 'doc:stories/build-the-lore-cli-foundation'
milestone: m-2
dependencies:
  - LCLI-15
  - LCLI-16
documentation:
  - docs/reference/cli-surface.md
  - docs/stories/build-the-lore-cli-foundation.md
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the docs/ bundle, .lore/ state, and the root index.md (okf_version on root only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 init produces a conformant empty OKF bundle
- [x] #2 Re-running init is idempotent
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/schema.ts: add schemaFileName(type), jsonSchemaFor(type) via z.toJSONSchema(draft-7), schemaModeline(docPath,type). Lenient editor schema (additionalProperties open) descends from existing looseObject SCHEMAS.
2. core/scaffold.ts (PURE, no I/O): buildScaffold({timestamp}) -> {dirs[], files[{path,contents}]}: 6 .lore/schemas/<type>.schema.json (byte-stable JSON), .lore/.gitignore (cache/), .lore/config.toml default (commented), .lore/templates/.gitkeep (content deferred to LCLI-18), .lore/cache/ dir, docs/index.md minimal root (modeline + okf_version: 0.1, ONLY okf_version carrier). Type dirs created lazily (NOT here).
3. commands/init.ts: resolve root + injectable clock; build plan; apply IDEMPOTENTLY (write-if-absent, never clobber; mkdir -p); collect created vs skipped; render via output.emit (kind init); return exit code.
4. cli.ts: minimal hand-rolled router (init + --version/--help/--json/--plain); NO new dependency (Commander deferred to keep PR dependency-neutral re: EXDEV/CI-isolated-linker; design says Commander -> flag for review).
5. Tests: test/scaffold.test.ts (golden bytes: schemas, index, config, modeline) + test/init.test.ts (temp-dir: fresh tree+exit0+json envelope; AC#2 idempotent byte-identical re-run; never-clobber existing index.md; AC#1 conformance: index parses, okf_version sole carrier, schemas valid JSON; partial fill-in).
6. Gates: bun test/lint/typecheck/coverage -> /code-review max -> PR into dev (ask before merge).
Scope (confirmed w/ Jeremy): minimal root index only (no generateIndexes/log.md -> LCLI-29); template content deferred to LCLI-18.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore init: core/scaffold.ts (pure plan), commands/init.ts (idempotent write-if-absent apply), schema.ts JSON-Schema emission + modeline helpers, cli.ts router. 284 tests green (was 247); lint+typecheck clean; coverage 99% funcs / 97% lines (scaffold+schema 100%).

AC#1 (conformant empty bundle): init emits .lore/{config.toml default, .gitignore, schemas/<6>.schema.json (z.toJSONSchema draft-7, lenient open additionalProperties), templates/.gitkeep, cache/} + docs/index.md (Reference, okf_version: 0.1 — sole carrier). Verified: emitted index round-trips through parseConcept and loadBundle indexes it as a concept.
AC#2 (idempotent): write-if-absent via atomic wx flag — re-run (even with a different clock) creates nothing, exits 0, byte-identical tree; never clobbers an existing index.md; fills only missing pieces after partial delete.

DEVIATION FROM KICKOFF HANDOVER (flagged for review): the handover said emit the modeline ABOVE the fence. Verified against the codebase that is WRONG — parseConcept needs --- at byte 0, so an above-fence modeline makes loadBundle skip index.md as a non-concept; all 16 modeline-bearing docs in this bundle put it INSIDE the fence (line 1 of frontmatter). Emitting inside-fence to match. Trade-off: js-yaml drops the in-fence comment on re-serialize (documented concept.ts limitation, applies bundle-wide; init writes once, never rewrites).

SCOPE (confirmed w/ Jeremy): minimal root index only — generateIndexes()/log.md deferred to LCLI-29/M3; template CONTENT deferred to LCLI-18 (init only ensures templates/ dir).
DEPENDENCY NOTE: no Commander added — hand-rolled minimal router to keep the PR dependency-neutral re: EXDEV/CI-isolated-linker. Design names Commander as eventual entrypoint; adoption deferred. Flag for review.

/code-review max (44 agents, 8 changed files): 14 reported findings. Fixed in 9f84b28:
- CORRECTNESS: (1) cli.ts unknown-flag swallowing on version/help/no-command paths -> reject flags on every path; (2) --version/--help now honor --json via the emit() envelope; (3) empty-string cwd coalescing (|| not ??); (4) okf_version self-warning -> exempt OKF-reserved key, freshly-init'd bundle now loads with 0 warnings.
- COUPLING: export+reuse SCHEMAS_DIR, OKF_VERSION, CONFIG_REL_PATH so producer (scaffold) and consumers stay in lockstep.
- TEST QUALITY: include test/ in typecheck (closed the gap that masked a dead json:undefined field; fixed the 3 issues it surfaced incl. a 1-line type-safe recast of a LCLI-12 output.test shim); removed inert temp-dir ceremony; build scaffold plan once; +5 tests. 289 green.

DEFERRED (documented, not blockers):
- #8 modeline-inside-fence is not a serialization fixpoint: js-yaml drops the in-fence comment on re-serialize. Inherent to inside-fence placement (parseConcept needs --- at byte 0) and affects all 16 modeline docs equally; init writes once. REAL future concern for LCLI-26/29 sync (rewriting the root index would drop the modeline) — flag when sync lands; proper fix is modeline-aware concept.ts (own task).
- #9 zod-byte coupling: schema bytes track z.toJSONSchema; tests assert STRUCTURE not exact bytes so a zod bump won't false-fail. Cross-version idempotency is a separate release/upgrade concern.
- #12 'docs' bundle-root literal: bundle.ts takes root as a param (no hardcoded 'docs'); a shared DOCS_ROOT const is nice-to-have.

Post-PR /code-review max (8 finder angles + verify) on PR #14 — resolved findings on feat/lore-17-init:
- ROBUSTNESS (createIfAbsent/ioError, init.ts): a directory/symlink occupying a scaffold FILE path mapped every EEXIST to 'skipped' → init claimed success (exit 0) on a malformed bundle. Now lstat-checks the existing entry: a regular file is the normal never-clobber skip; a non-regular entry throws a 'conflict' LoreError (exit 5). ioError also maps EEXIST/ENOTDIR (file blocking a directory path) to 'conflict' with an actionable hint instead of a raw exit-1 crash. +3 conflict tests (dir/symlink/file-at-dir).
- ALTITUDE/REUSE (modeline splice): extracted serializeConceptWithModeline(concept, modeline) into concept.ts — slices the known FENCE prefix (no fragile first-occurrence .replace content-search) and is the single home LCLI-18 'lore new' will reuse. scaffold.ts consumes it; bytes unchanged (golden still passes). Fixed the stale concept.ts header that said modeline goes ABOVE the fence. +3 concept tests.
- REUSE (ANSI dup): exported shared ANSI palette + paint() from errors.ts; init.ts renderPretty consumes them instead of its own GREEN/DIM/RESET.
- MINOR: cli.ts parseArgs now honors the POSIX '--' end-of-options terminator and treats a bare '-' as a positional (not an unknown flag); +2 cli tests. isTTY seam: an injected stdout sink with no TTY hint resolves to non-TTY (no stray ANSI in a captured buffer). EXIT_OK used for the success returns (was a bare 0).
- DEFERRED (intentional, not changed): OKF_RESERVED_KEYS exemption applies to all types — per-file validation lacks the bundle context to enforce 'only the root index may carry okf_version'; that placement check belongs to bundle-level lore validate/check (LCLI-26), where it can see the root. Enforcing it in warnExtraKeys would be fragile (depends on repo- vs bundle-relative path). Cross-version schema drift and buildScaffold-throws-on-bad-timestamp left as documented by-design.
Gates: 297 tests pass (was 289); lint+typecheck clean; coverage 98% funcs/96% lines (scaffold/schema/concept 100%). Verified end-to-end via real CLI: init -- (exit 0), conflict dir/symlink (exit 5, text+json envelope).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered `lore init` (M1 first command surface) via PR #14, squash-merged to dev as a0f6815. Scaffolds an empty, conformant OKF bundle: pure core/scaffold.ts byte-plan, thin idempotent commands/init.ts (atomic wx write-if-absent, never clobbers), hand-rolled cli.ts router (no Commander), and Zod->Draft-7 JSON-Schema + modeline helpers in schema.ts. AC#1 (conformant empty bundle, index round-trips + loads with 0 warnings) and AC#2 (idempotent re-run, byte-identical) both verified. Two review rounds (/code-review max, pre- and post-PR): a non-regular entry (dir/symlink) at a scaffold file path now raises a conflict (exit 5) instead of a silent success on a malformed bundle; modeline splice extracted to serializeConceptWithModeline (LCLI-18 reuses it); shared ANSI/paint; POSIX -- terminator. 297 tests green; lint+typecheck clean; all 4 CI jobs (ubuntu/macos/windows + compile-smoke) green. Deferred (documented): root-only okf_version placement -> LCLI-26 validate/check; template content -> LCLI-18.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LCLI-48
title: 'lore check follow-ups: --external liveness, MDX/filename portability rules'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:23'
labels:
  - cmd
  - ci
dependencies:
  - LCLI-30
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-ups deferred from LCLI-30 (lore check shipped link/anchor + portability passes).

Scope:
1. --external external-URL liveness — LCLI-30 accepts the flag but defers the network check. Implement opt-in, non-deterministic liveness on a separate non-blocking path (excluded from the default deterministic gate, ADR-0007). No Rust/lychee runtime dep.
2. Portability lint additions (warn-only) not yet covered:
   - MDX hazards: raw </{ in non-code prose (Docusaurus MDX build errors).
   - Filename rules (command layer): leading-underscore filenames and .mdx files (portable-markdown.md).
3. Carry-forward non-LCLI-30 items parked in LCLI-30 notes from PR #19's /code-review max:
   - normalizeLink uses posix.relative → cwd-dependent for an absolute toPath or ..-escaping fromPath; guard when LCLI-35/index-gen pass non-relative paths.
   - Reuse/efficiency minors in links.ts (ensureMarkdownSuffix composing idFromPath; drop redundant double posix.normalize; hoist regex literals).

Status-reconciliation and managed-block-drift passes of lore check are NOT here — they are their own tasks gated on the Backlog JSON adapter + lore sync (LCLI-26).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore check --external performs opt-in external-URL liveness via Bun fetch (no Rust/lychee/network runtime dep); without --external no network is touched and behavior is byte-identical to today. The deferred-notice advisory (commands/check.ts:72-73) is removed.
- [x] #2 External-liveness findings are advisory: reported under a distinct rule but never change the exit code — not even under --strict — preserving the ADR-0007 deterministic gate; the network IO lives in the command layer, not pure core/check.ts (ADR-0014).
- [x] #3 MDX-hazard lint (warn-only): un-escaped raw < or { in non-code prose (text nodes; inline/fenced code excluded) is flagged as a portability warning per portable-markdown.md MDX-safety; no auto-escape.
- [x] #4 Filename-portability lint (command layer, warn-only): a bundle file whose name begins with _ or ends in .mdx is flagged as a portability warning.
- [x] #5 Precise Obsidian block-reference detector (warn-only): flags ^id block-ref markers including digit-leading auto-IDs (e.g. ^3f9a2b) without flagging carets in ordinary prose/math.
- [x] #6 Accidental-colon filename detection (warn-only): a relative link whose first path segment carries a colon (e.g. notes:2026.md) — currently read as a URL scheme and skipped by both gate and lint — is flagged; the over-promising links.ts docstring is corrected.
- [x] #7 Trailing-slash directory-link policy: a trailing-slash concept link (e.g. ../reference/) is flagged as a portability warning (likely a dropped filename).
- [x] #8 Finding-model convergence: check.ts CheckSeverity/CheckFinding and validate.ts Severity/Finding share one type definition; all existing tests pass with no behavior change.
- [x] #9 IO-policy consolidation: the errno->LoreError mapping duplicated across core/bundle.ts, commands/discover.ts, commands/check.ts, and commands/validate.ts is consolidated into one errors.ts helper; exit codes 3/4 unchanged.
- [x] #10 normalizeLink (core/links.ts) is guarded against cwd-dependent posix.relative for a non-relative or ..-escaping input; links.ts reuse/efficiency minors folded (ensureMarkdownSuffix via idFromPath, drop redundant double posix.normalize, hoist regex literals).
- [x] #11 Docs updated: cli-surface.md check-section and portable-markdown.md reflect the implemented --external liveness + MDX/filename lints; CHANGELOG Unreleased updated. New/changed behavior is covered by tests and core stays 100% func+line.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Land as ONE PR on feat/lore-48-check-followups off dev. Decisions (Jeremy, this session): --external liveness is ADVISORY-ONLY (never affects exit, not even --strict); trailing-slash dir links WARN; all work (features + refactors) in one PR.

1. Refactors first (low-risk, unblock convergence):
   (e) Add classifyIoError(cause, ...) to errors.ts; rewire bundle.ts readError, commands/discover.ts readSource, commands/check.ts expandRoot, commands/validate.ts statSync handler. Exit codes 3/4 unchanged.
   (d) Lift shared Severity/Finding to one home; check.ts CheckSeverity/CheckFinding reuse it (no behavior change).
2. Pure core lint additions:
   - core/check.ts: MDX raw </{ detector + precise ^id block-ref detector, both text-node scans (skip code).
   - core/links.ts validateLink: accidental-colon filename (first segment has colon) + trailing-slash dir link -> portability findings; fix the over-promising docstring; guard normalizeLink against cwd-dependent posix.relative; fold ensureMarkdownSuffix via idFromPath, drop double posix.normalize, hoist regex literals.
3. Command layer (commands/check.ts):
   - Filename lint (_-prefix, .mdx) during discovery -> portability warnings.
   - --external: a pure core collector lists external http(s) targets per file; the command fetches them (Bun fetch) on a separate non-gate path and emits advisory findings; remove the deferred-notice advisory.
4. Tests: extend test/check.test.ts + test/links.test.ts; mock fetch for liveness; core 100% func+line.
5. Gates: bun test + bunx biome check src/ test/ + bunx tsc --noEmit + bun test --coverage. Then Skill code-review max -> fold verified findings.
6. Docs: cli-surface.md check-section, portable-markdown.md, CHANGELOG Unreleased. PR into dev via gh token; Jeremy reviews/merges.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded with deferred items surfaced by the LCLI-30 /code-review max (PR #21): (a) accidental-colon-filename detection (notes:2026.md read as a scheme today, skipped by both the gate and the lint — links.ts docstring previously over-promised this to LCLI-30); (b) a precise Obsidian block-reference detector (^id) that both avoids carets in prose/math AND catches digit-leading auto-IDs like ^3f9a2b (the naive text-node regex could not, so block-ref detection was removed from LCLI-30); (c) trailing-slash directory-link policy (../reference/ is currently flagged by neither the missing-extension lint — folded defect-3 deliberately exempts dir links — nor the broken-link gate — non-.md; decide whether a typo'd trailing-slash concept link should warn); (d) converge the finding model (share validate.ts Severity/Finding with check.ts's CheckFinding); (e) consolidate the errno->LoreError IO policy duplicated across commands/check.ts, commands/validate.ts, and bundle.ts readError into one errors.ts helper.

/code-review max (workflow) folded: 3 finders / 13 candidates / 10 verifiers / 6 verified. 5 confirmed correctness findings fixed (commit 0743f00) with regression tests: (a) accidentalColonFile mailto/.md-TLD false positive; (b) async check --external bypassed run() reportError seam; (c) MDX raw-HTML skipped a node beginning with a comment; (d) block-ref ^id anchored to text-node end not block end (false positive on '^id **bold**'); (e) ioError dropped the errno code field. Deferred [efficiency]: collectExternalLinks double-parse — dwarfed by --external network IO, and folding into checkBundle would pollute the pure gate API.
Final gates: 974 tests pass; tsc clean; biome 0; core/check.ts 100% func+line; lore check docs (gate + --external) 0 warnings. 6 commits on feat/lore-48-check-followups, ready for PR into dev.

Delivered via PR #29 (squash b9049fe on dev, 2026-07-01). Phase 1 complete.
<!-- SECTION:NOTES:END -->

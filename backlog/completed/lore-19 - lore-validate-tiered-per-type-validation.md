---
id: LORE-19
title: 'lore validate: tiered per-type validation'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-25 19:13'
labels:
  - cmd
milestone: m-2
dependencies:
  - LORE-15
documentation:
  - docs/adr/0007-validation-and-coherence.md
  - docs/reference/okf-conformance.md
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF section 9 conformance = error; per-type frontmatter shape + required sections = error; unknown type / extra key = warning; plus frontmatter quote-safety.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unknown types do not fail validation
- [x] #2 validate [PATHS] supports staged-only pre-commit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. schema.ts: add REQUIRED_SECTIONS (minimal, evidence-based) + requiredSectionsFor(type). ADR -> Status/Context/Decision/Consequences (universal across all 16 ADRs + template); Story -> Acceptance criteria (ADR-0007 named); Epic/Spec/Runbook/Reference -> [] (existing bundle docs too heterogeneous; keeps docs/ green). Templates stay a superset so 'lore new' output validates clean.
2. core/validate.ts (PURE, no fs): aggregating per-file reporter. Finding{severity,rule,message}; FileReport{path,type?,findings,skipped,ok}; ValidateReport{files,errorCount,warningCount,skippedCount}. validateConceptText(path,raw): tryParseConcept in try/catch -> tier-1/2 errors from caught LoreError; tier-3 + summary warnings via WarningCollector; non-concept(null) -> skipped. On clean parse add required-section checks (mdast H2 headings) + quote-safety.
3. Quote-safety: analyze simple top-level unquoted key: value lines in raw frontmatter: YAML-1.1 bool aliases (yes/no/on/off/y/n) -> error; leading indicator chars (@`!&*|>%[{) -> error; colon-space in value -> error; bare date -> warning. Skip quoted/list/nested/block/empty (documented limitation).
4. commands/validate.ts (thin I/O): parse [paths..] + --type + --strict; default docs/ walk, dir->walk, file->direct (reuse exported walkMarkdown); read bytes; core per file; filter by --type; emit kind:validate.report; exit 6 on any error (or any warning under --strict).
5. bundle.ts: export walkMarkdown. cli.ts: add validate to dispatch + USAGE.
6. Tests: validate.test.ts (core+command), cli.test.ts dispatch, schema.test.ts required-sections drift (templates satisfy required set), AC#1 (unknown types pass), AC#2 (explicit paths). CHANGELOG.
7. Gates: bun test + biome + tsc + coverage -> /code-review max -> PR feat/lore-19-validate into dev (no self-merge).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore validate (LORE-19). core/validate.ts = pure aggregating reporter (validateConceptText/validateFiles/quoteSafetyFindings); commands/validate.ts = thin discovery/I-O; wired into cli.ts dispatch+USAGE. Tiers reuse the existing frontmatter engine (parseConcept under try/catch + WarningCollector) and add per-type required sections + frontmatter quote-safety. Decisions (confirmed with Jeremy): required-sections = minimal/evidence-based (ADR->Status/Context/Decision/Consequences; Story->Acceptance criteria; Epic/Spec/Runbook/Reference->none) so the existing hand-authored bundle stays green AND a fresh 'lore new' of any type validates clean (pinned by test); quote-safety landed in-PR. AC#1: unknown types warn, never error (asserted). AC#2: explicit [paths..] validate only those (staged pre-commit). Exit = report on stdout + return 6 on any error (or any warning under --strict), not a thrown error. Gates green: 403 tests pass, tsc + biome clean, core/validate.ts 100% func/99% line. 'lore validate' on the real docs/ bundle = 0 errors (16 pre-existing over-200-char summary warnings, 1 skip). Required-sections single source of truth = schema.ts requiredSectionsFor; walkMarkdown exported from bundle.ts.

/code-review max (56 agents): 15 findings (13 CONFIRMED, 1 PLAUSIBLE, 11 refuted). Fixed in 83e7d09. Correctness: (1) --type silently dropped error-tier files -> per-type gate went green over malformed concepts [DOMINANT] -> keepForType always keeps error files; (2) quote-safety false-errored on trailing YAML comments w/ colon -> strip comments from unquoted scalars; (3) required-section failed on interior-double-space headings -> normalize interior whitespace; (4) error files now surface quote-safety same-pass. Robustness: dir discovery flushes skipped-symlink/unreadable-subdir advisories to stderr (was swallowed); realpath de-dup (case-insensitive double-count); parse-once (was 2-3x); reuse walkMdast; collapse plain/pretty renderers; generalize walkMarkdown msg; drop dead re-export. ACCEPTED (not changed): top-level symlink-follow on an explicitly-named dir target (intended: user named it; links INSIDE still skipped, matches loadBundle); dangling-symlink 'does not exist' msg (minor); errno-mapping duplication across commands (PLAUSIBLE, lowest tier — bundle/fswrite helpers not exported; not worth widening scope). 11 regression tests added; 414 pass.
<!-- SECTION:NOTES:END -->

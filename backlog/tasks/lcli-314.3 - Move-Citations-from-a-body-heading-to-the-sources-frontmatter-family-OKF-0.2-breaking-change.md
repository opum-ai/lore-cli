---
id: LCLI-314.3
title: >-
  Move Citations from a body heading to the sources frontmatter family (OKF 0.2
  breaking change)
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:47'
updated_date: '2026-08-05 13:00'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/reference/okf-conformance.md
modified_files:
  - docs/reference/okf-conformance.md
  - src/commands/check.ts
  - src/core/schema.ts
  - src/core/bundle.ts
  - src/core/check.ts
  - src/core/rewrite.ts
  - src/core/graph.ts
  - src/core/ladybug-driver.ts
  - test/schema.test.ts
  - test/validate.test.ts
  - test/scaffold.test.ts
  - test/bundle.test.ts
  - test/check.test.ts
  - test/concept.test.ts
  - test/rename.test.ts
parent_task_id: LCLI-314
priority: medium
type: feature
ordinal: 430000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF 0.2 §13.1 replaces the body-level `# Citations` list with a `sources` frontmatter key (§5.1). `sources` also carries optional credibility signals — `author`, `usage_count`, `last_modified` — that 0.1 had nowhere to put.

Scope for lore: teach the schema, template, and check layers about `sources`; stop treating a `# Citations` heading as the citation carrier under 0.2; and decide what a 0.1 bundle keeps doing.

Grounding to establish first, because it changes the size of this task: search the profile section vocabulary in `src/core/template.ts` and the built-in profile in `src/core/profile.ts` for whether any lore type currently declares a `Citations` section at all. If no built-in type does, the body-side work is limited to tolerating and optionally migrating hand-authored `# Citations` sections rather than removing a shipped heading. Record what was found in the implementation notes — do not assume either way.

Interaction to check: `sources` entries that point at other concepts in the bundle may look like links. Decide explicitly whether they participate in the link graph that `lore check` walks (`src/core/bundle.ts`, `src/commands/check.ts`). If they do, a dangling `sources` entry needs a defined finding tier; if they do not, say so in the conformance doc so the exclusion is deliberate rather than an oversight.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 sources is a recognized frontmatter key under okf_version 0.2, including the author, usage_count, and last_modified credibility signals
- [x] #2 A malformed sources value fails as a validation error (exit 6) with a diagnostic naming the offending file and key
- [x] #3 Whether sources entries participate in the link graph is decided, implemented, and documented in docs/reference/okf-conformance.md
- [x] #4 An existing body-level # Citations section is tolerated and never silently deleted
- [x] #5 Under okf_version 0.1, behavior is unchanged
- [x] #6 Tests cover a well-formed sources block, a malformed one, and the 0.1 no-change path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add version-gated OKF 0.2 runtime and editor schemas for sources and usage_window, including required source.resource plus optional id, title, author, usage_count, last_modified, and per-source usage_window; keep 0.1 treatment unchanged.
2. Treat sources[].resource values that resolve to bundle concepts as authored provenance edges, preserve those edges through graph projection and lore rename, and ignore external URLs/non-path scope descriptors.
3. Add warning-tier lore check findings for unresolved internal .md source paths so the quality signal is visible without turning OKF 0.2's broken-link tolerance into a default conformance rejection.
4. Add regression coverage for well-formed/malformed sources, exit-6 diagnostics naming file/key, editor schema emission, graph/rename behavior, legacy # Citations preservation, and unchanged 0.1 behavior.
5. Update docs/reference/okf-conformance.md through lore replace, then run focused tests, lint, typecheck, the full suite, lore sync, strict Lore validation/checking, git diff checks, and adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Grounding 2026-08-05: the built-in story-convention profile declares no Citations section and no built-in body template emits one; existing body text is therefore preservation-only. Official OKF 0.2 §5.1 makes source.resource required, defines optional id/title/author/usage_count/last_modified and shared/per-source usage_window, and states that a source resource pointing to another concept is a derivation edge. Design decision: model resolvable internal concept sources as provenance edges; unresolved internal .md resources are warning-tier check findings, while external URLs and scope descriptors are not graph edges.

Implementation and acceptance verification 2026-08-05:
- OKF 0.2 sources/usage_window runtime and editor schemas accept the complete credibility family and reject malformed nested values with file/key diagnostics; command coverage proves exit 6.
- Resolvable relative paths and bare concept ids create sources provenance edges. External URLs and free-form scope descriptors stay outside the concept graph. Missing internal .md paths produce warning-tier broken-source findings, and lore rename preserves credibility metadata while repointing the concept source.
- The built-in profile/templates have no Citations section; a hand-authored # Citations body round-trips byte-identically with no implicit migration.
- OKF 0.1 keeps sources as a preserved unknown extension, creates no source graph edges, and emits no source-check findings.
- Focused suite: 636 pass, 0 fail. Full suite: 2493 pass, 1 skip, 0 fail across 76 files with 8418 expect calls. npm run lint, npm run typecheck, lore validate --strict --json, lore check --strict --json, lore sync --dry-run, and git diff --check passed.
- Adversarial self-review specifically exercised resolved vs dangling vs external/scope resources, rename preservation, 0.1 byte stability, and legacy body preservation. No independent reviewer was authorized.
Delivery blocker: actual lore sync/local commit delivery is not authorized, and lore sync can commit all dirty backlog paths including unrelated untracked LCLI-317 through LCLI-319. The task remains In Progress pending explicit local commit authority; no remote action is requested.
<!-- SECTION:NOTES:END -->

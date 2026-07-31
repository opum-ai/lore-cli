---
id: LCLI-283.1.3
title: Route graph query and context through indexed retrieval
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-07-31 00:23'
labels:
  - ladybugdb
  - retrieval
  - compatibility
milestone: m-13
dependencies:
  - LCLI-283.1.2
  - LCLI-284
documentation:
  - docs/specs/local-graph-platform-roadmap.md
modified_files:
  - docs/index.md
  - docs/log.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
  - docs/reference/tech-stack.md
  - docs/runbooks/dev-kickoff.md
  - docs/runbooks/lore-cli-release-campaign-handover.md
  - docs/specs/local-graph-platform-roadmap.md
  - src/cli.ts
  - src/commands/context.ts
  - src/commands/graph.ts
  - src/commands/query.ts
  - src/core/ladybug-driver.ts
  - src/core/ladybug-lifecycle.ts
  - src/core/ladybug-native.ts
  - src/core/ladybug-source.ts
  - src/core/retrieval.ts
  - src/errors.ts
  - test/cli.test.ts
  - test/context.test.ts
  - test/errors.test.ts
  - test/graph.test.ts
  - test/indexed-retrieval.test.ts
  - test/query.test.ts
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 389000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use the fresh LadybugDB projection for local graph, lexical query, and context operations while keeping the documented CLI envelopes and deterministic semantics authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Indexed and reference in-memory implementations pass the same graph, query, context, error, ordering, truncation, and provenance conformance fixtures
- [x] #2 Lexical ranking and filters remain deterministic and no embeddings, vector indexes, or model calls enter the default path
- [x] #3 Missing, stale, incompatible, corrupt, or contended indexes follow the documented rebuild or fallback policy without partial output
- [x] #4 No public command exposes raw Cypher or database-specific identifiers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a native-safe Ladybug boundary that records the exact 0.18.2/storage-42 compatibility facts without importing the addon, dynamically loads and verifies the native driver only after platform support and control-manifest preflight select an indexed operation, and refactor lifecycle inspection/build/reuse to use that loader without changing the frozen state ordering or recovery rules.
2. Add a verified indexed read model that reads canonical ConceptRecord and AuthoredEdgeRecord payloads from an immutable generation, validates and reconstructs the deterministic BundleGraph shape using stored token estimates and source identities, excludes task edges from concept traversal, preserves duplicates/dangling/additive fields, and exposes no Cypher, native ids, database paths, or native errors.
3. Add a Lore-owned retrieval resolver that attempts lifecycle reconcile plus verified indexed read on supported hosts and otherwise loads the existing in-memory graph; make fallback decisions before output, discard failed indexed warnings/results, retain the reference loader as an injectable conformance oracle, and preserve source-file read-only behavior.
4. Route graph, query, and context through that resolver by extending the existing Commander RunContext/handler injection boundary; keep manifest parsing, validation, renderers, envelopes, stream ownership, exit codes, output precedence, TTY/NO_COLOR, lexical BM25/filtering, traversal, budgets, truncation, and error semantics unchanged.
5. Add shared indexed-versus-reference command/core fixtures and focused lifecycle tests covering JSON/plain/pretty parity, errors, ordering/ties/filters/depth/budgets/provenance, Unicode, duplicate/dangling/additive/empty/boundary cases, missing/stale/incompatible/corrupt/locked/contended/unsupported states, no partial output, source no-write, absence of public database details, and objective native lazy-loading/Windows-safe fallback.
6. Update architecture, CLI, roadmap, and campaign handover prose through Lore, then verify only with Bun 1.2.23: focused and full tests, lint, typecheck, source/compiled startup and versions, supported compiled/native smokes, frozen install, package dry-run, audit, Lore sync/strict validation/check, and git diff hygiene. Follow Backlog finalization, map executed evidence to all four criteria, and complete only LCLI-283.1.3 without changing its parent or siblings.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final design and evidence (Bun 1.2.23):

- Architecture: the existing Commander handlers inject a Lore-owned retrieval resolver. Supported hosts reconcile and verify one immutable content-addressed generation, dynamically load the native driver only when needed, reconstruct the existing BundleGraph from canonical ConceptRecord and AuthoredEdgeRecord payloads, then reuse the unchanged graph/query/context algorithms and emitters. The filesystem/in-memory loader remains the conformance oracle and automatic fallback.
- AC #1: shared indexed/reference command fixtures plus affected command/lifecycle tests passed 237/237 with 671 assertions across 6 files. Exact output parity covers graph/query/context JSON, plain, and pretty success; error envelopes and semantic exits; ordering, ties, filters, depth, budgets, truncation, internal provenance, Unicode, duplicate and dangling edges, additive fields, empty inputs, and limits. Full suite passed 2,295/2,295 with 6,652 assertions across 54 files.
- AC #2: shared lexical fixtures prove identical BM25 ranking, ascending-id tie breaks, filters, punctuation-only and filters-only behavior. The resolver and docs retain the no-vector/no-embedding/no-model boundary; no network or inference surface was added.
- AC #3: focused tests prove missing/stale build and replacement, known-incompatible rebuild, corruption quarantine/rebuild under ownership, exact-generation reuse under an active lock, contention fallback without native load, newer unsupported preservation, native-read fallback, one-result/no-partial-output behavior, and repository-source byte preservation.
- AC #4: public stdout/stderr fixtures reject Cypher, native record ids, database paths, fingerprints, and private native error details. Cypher and physical schema remain inside the dynamically loaded driver only.
- Windows boundary: Bun 1.2.23 segfaults while loading the Ladybug addon on Windows. CLI import, lifecycle preflight, reference fallback, newer-unsupported, contention, usage-error, and simulated Windows paths do not evaluate the addon. Native Windows packaging support is not claimed and remains exclusively LCLI-283.1.4 scope.
- Additional verification: lint clean across 126 files; typecheck clean; source and compiled version/JSON-version checks passed; build compiled 241 modules; compiled graph/query/context created and reused a real Ladybug generation on Darwin; launcher/release/flush/local-contract tests passed 25/25 with 102 assertions; frozen install checked 98 installs across 109 packages with no changes; package dry-run contained 70 files and 1.38 MB unpacked; audit found no vulnerabilities; Lore sync changed 0 files; strict validation and check each reported 46 concepts, 0 errors, 0 warnings; git diff check clean.
- Publication and scope: no push, PR, merge, tag, release version, npm publication, or GitHub setting change occurred. Parent LCLI-283.1 and sibling LCLI-283.1.4 remain To Do; the linked Wave 2 worktree remains untouched.

Landing review corrections and post-review evidence (Bun 1.2.23): preserved newer unsupported control formats before applying this version’s immutable-permission rules; made native-loader/runtime failures fall back without quarantining an otherwise valid generation; and made projection-source retry warnings transactional so an abandoned snapshot attempt cannot duplicate public advisories. Focused indexed/reference and affected lifecycle/command suite: 238 passed, 0 failed, 678 assertions across 6 files. Full suite: 2,296 passed, 0 failed, 6,662 assertions across 54 files. Launcher/release/flush/local-contract: 25 passed, 102 assertions. Lint: 126 files clean; typecheck clean; build: 241 modules. Source/compiled help, version, JSON-version, and JSON-usage checks passed; compiled graph/query/context created and reused one immutable real Ladybug generation. Frozen install checked 98 installs across 109 packages with no changes; package dry-run was 70 files/1.38 MB; audit found no vulnerabilities. The pre-existing installed package tree initially lacked its copied lbugjs.node; the exact trusted package install script restored it from the locked Darwin package without changing source or lock state. Clean-install and wider platform qualification remain LCLI-283.1.4 scope. No push, PR, merge, tag, release, package publication, task activation, parent advancement, or GitHub setting change occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landing-reviewed graph, lexical query, and context routing through fully verified LadybugDB generations behind the existing Commander/handler boundary, retaining deterministic in-memory conformance and pre-output fallback. Review hardened unsupported-format preservation, native-loader failure recovery, and source-retry warning parity. All 2,296 tests, lint, typecheck, build, compiled native create/reuse smoke, frozen install, package dry-run, audit, and strict Lore gates pass; native Windows packaging, performance, scale, and wider qualification remain deferred to LCLI-283.1.4.
<!-- SECTION:FINAL_SUMMARY:END -->

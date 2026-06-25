---
id: LORE-16
title: 'bundle.ts: walk docs/ and build the model + cross-link graph'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-25 05:06'
labels:
  - core
milestone: m-2
dependencies:
  - LORE-15
documentation:
  - docs/reference/architecture.md
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Walk the OKF bundle, build the in-memory concept model and cross-link graph reused by graph/query/context/links.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bundle model lists all concepts with types and links
- [x] #2 Graph is deterministic and cycle-tolerant
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/bundle.ts: loadBundle(root,{warnings?}) walks docs/ (sorted, symlink-safe, skips non-.md + frontmatter-less files w/ warning), parses each concept via bundle-root-relative paths, delegates to pure buildGraph(concepts).
2. BundleGraph = { concepts: ReadonlyMap<id,Concept>; edges: readonly Edge[]; tokenEstimate(id?) }. Edges are concept<->concept: body cross-links (relative .md, code-stripped) + frontmatter refs (specs/supersedes/superseded_by). tasks excluded (->Backlog, not concepts). Dangling links tolerated (to:null).
3. Determinism (AC#2): sorted walk + sorted buildGraph + fixed edge order (frontmatter kinds then body, doc order). Cycle-tolerant: flat edge list, no traversal.
4. tokenEstimate: chars/4 over canonical serializeConcept bytes; per-id (not_found if absent) or whole-bundle sum.
5. Add hasFrontmatter() to concept.ts (reuses normalizeInput) so loadBundle skips non-concept .md instead of throwing (adr/index.md has no frontmatter).
6. test/bundle.test.ts: determinism, cycles, code-fence stripping, dangling, URL-encoded/anchor targets, frontmatter refs (id- and relative-style), tokenEstimate, temp-dir walk integration, hasFrontmatter.
SCOPE: graph only; generateIndexes() deferred to LORE-17/M2 (Jeremy approved 2026-06-24).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/core/bundle.ts (loadBundle + pure buildGraph; BundleGraph concepts/edges/tokenEstimate) + concept.ts hasFrontmatter/idFromPath exports. 235 tests green, typecheck+lint clean.
Body-link extraction uses a real CommonMark parser (mdast-util-from-markdown@2.0.3, pinned exact) per Jeremy's call — NOT hand-rolled regex. Links in code/inline-code excluded by construction; linked-images, angle/space destinations, reference links handled correctly.
Caught + fixed a latent bug: docs/adr/0009 and docs/specs/lore-design had invalid-YAML frontmatter (unquoted colon-space in summary/description) — never surfaced before because nothing walked docs/ until bundle.ts. Quoted the values (content-preserving).
/code-review max round 1: 37 verified findings → addressed (mdast rewrite resolves 8 link-parser findings at root; single-decode, memoized tokenEstimate, symlink warn, hasFrontmatter via matter.test, DRY consolidation). #2/#12/#13 documented as consistent/defensible.

/code-review max round 2: 13 verified findings on the rewritten layer. Fixed: thematic-break doc crashing whole loadBundle (concept.ts now exposes tryParseConcept + discriminated splitFrontmatter — non-concept frontmatter returns null/skip, malformed mapping still throws); orphan reference-definitions becoming phantom edges (two-pass extraction: only linkReference-used definitions count); tokenEstimate validation-vs-not_found contract (buildGraph re-asserts validateFrontmatter); resolveRef ?query strip; idFromPath POSIX-normalizes (path/id symmetry); EACCES→denied classification; restored an accidentally-staged bunfig.toml deletion (bun add side effect); real @types/mdast Nodes types (dropped as-unknown cast); single-parse per file. Documented-as-intentional: scheme/colon (RFC-3986), case-sensitive resolution (cross-platform determinism), ReadonlyMap view. 241 tests green, typecheck+lint clean.

/code-review max round 3: 15 findings. Fixed: case-variant .md conflict crash on Linux (walk now lowercase .md only); unreadable subdir aborting whole load (subdirs warn+skip, only root is fatal); bare-anchor frontmatter ref ('#section') mis-resolving to sibling directory (empty-after-strip guard → dangles); tokenEstimate/buildGraph validation design (REVERTED round-2's buildGraph re-validation — it double-validated AND didn't fix post-build mutation; now honest snapshot docstring, validation stays at the parse boundary); shared errnoCode extracted to errors.ts (config.ts + bundle.ts reuse). Documented-intentional: raw-HTML links (non-canonical, lint's job), scheme/colon (RFC-3986), footnote-link wording, numeric refs (schema-gated unreachable), body-link .md vs ref id-form (by design), non-mapping frontmatter skip (loader tolerance; validate is the loud gate). 243 tests green. Round 4 = final verification pass.

/code-review max round 4 (final, budgeted): mostly repeats of round-3 documented decisions + one false positive (#15 backlog file 'hand-edited' — it was edited VIA the CLI, as required). Fixed actionable items: walkMdast made iterative (a ~20k-deep nested body overflowed the recursive AST walk → hard crash; fromMarkdown itself parses iteratively, now the walk does too) + collapsed to a single tree-walk; protocol-relative //host URLs classified external; resolveRef now applies the shared external-scheme guard (absolute-URL refs dangle instead of being path-mangled); toRefList coerces a YAML numeric/boolean ref to string (visible dangling edge vs silent drop, reachable on unknown types); Edge.target docstring made honest (resolved form, not byte-verbatim). Held as documented design decisions: non-mapping frontmatter skip (loader tolerance), id-first ref precedence (lore writes ids), colon/scheme (RFC-3986), lowercase-.md walk (cross-platform determinism), serialize re-validation (inherent). 247 tests green, typecheck+lint clean. CONVERGED at 4 rounds.

Delivered via PR #13 (https://github.com/jeremy-newhouse/lore/pull/13) into dev, awaiting Jeremy's review/merge. Both ACs checked. New dep: mdast-util-from-markdown@2.0.3 (pinned exact).

CI green on PR #13: lint·typecheck·test pass on ubuntu/macos/windows + compile smoke. Fixed one CI-only break (@types/mdast must be a direct devDep for the isolated linker). Mergeable, awaiting Jeremy.
<!-- SECTION:NOTES:END -->

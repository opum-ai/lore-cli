---
id: LORE-15
title: 'concept.ts: frontmatter parse/serialize + Zod per-type schemas'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-24 22:19'
labels:
  - core
milestone: m-2
dependencies:
  - LORE-11
documentation:
  - docs/adr/0006-schema-types-templates.md
  - docs/adr/0011-frontmatter-serialization-stability.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
gray-matter parse/serialize with byte-stable round-trip; strict Zod schemas for known types, lenient type-only for unknown; pass through custom keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Round-tripping a doc is byte-identical
- [x] #2 Unknown types validate on type only and keep extra keys
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add deps: gray-matter (frontmatter boundary, ADR-0011), js-yaml + @types/js-yaml (to PIN dump options + a no-Date-coercion parse schema), zod (per-type schemas, ADR-0006).
2. src/core/schema.ts — Zod source of truth: Base + known per-type schemas (Epic/Story/Spec/ADR/Runbook/Reference), Unknown=type-only loose. Keys never dropped (passthrough). validateFrontmatter(fm, warnings?) -> typed | throw LoreError('validation'); wrong field TYPE or missing/empty type = ERROR; unknown type / extra keys on known type / missing|overlong summary = WARNING. + toJsonSchema(type) via z.toJSONSchema (editor-open additionalProperties:true per ADR-0006 s3).
3. src/core/concept.ts — Concept {id,path,type,frontmatter,body}. parseConcept(path,raw): gray-matter parse w/ frozen js-yaml engine (JSON_SCHEMA => ISO timestamps stay STRINGS, no Date coercion) -> validateFrontmatter -> Concept (id = path minus .md). serializeConcept(c): DETERMINISTIC bytes — canonical key order for known keys + insertion order for passthrough; js-yaml dump pinned (lineWidth -1, no sort, noRefs, minimal quoting); fence + body. parse->serialize->parse = FIXPOINT.
4. Tests: unit (schema known/unknown/extra-keys/wrong-type), GOLDEN byte-exact serialize fixtures (s9.2), round-trip fixpoint + idempotent-second-application, quote-safety edge cases (leading @, ':' values, multiline, unicode), unknown-type passthrough (AC#2), bad frontmatter throws validation (exit 6).
5. Gates: bun test / lint / typecheck. /code-review max (3-4 passes). CHANGELOG Unreleased. PR into dev.

DECISIONS (doc conflict — flag in PR): (a) Modeline canonical = ABOVE the --- fence per ADR-0011 (in-frontmatter YAML comments can't survive gray-matter/js-yaml round-trip); concept.ts canonical doc starts with '---'; modeline emission deferred to lore new (LORE-17). Existing docs/ files use in-fence modeline (non-canonical, reflow-once accepted per ADR-0011). (b) byte-identical (AC#1) = fixpoint over CANONICAL fixtures, not arbitrary input. (c) schema.ts shipped with concept.ts (LORE-15 title bundles 'Zod per-type schemas').
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema.ts (Zod source of truth, OKF-tiered validateFrontmatter) + concept.ts (parse/serialize, byte-stable). Deps pinned exact (ADR-0011): gray-matter@4.0.3, js-yaml@4.1.0 (NOT 5.x — bun resolved 5.1.0 by default; 5.x lacks default export + mismatches @types@4.x + gray-matter's bundled 3.x), zod@4.4.3.

/code-review max ROUND 1 (37 agents, 21 kept/6 refuted) — fixed:
- BUG: literal __proto__ frontmatter key SILENTLY DROPPED on serialize — gray-matter.stringify internally Object.assigns ([[Set]] drops __proto__), defeating canonicalize. FIX: serialize now composes the fence directly (---+yaml.dump+---+body); gray-matter kept only as the PARSE boundary. __proto__ now preserved (test asserts survival; prior test masked it).
- BUG: requireType built error envelope input.path from the ' in <path>' display string. FIX: pass raw options.path.
- Fixpoint/normalization gaps (ADR-0011 §8 corpus): leading blank line before fence hard-errored; BOM/CRLF not normalized. FIX: normalizeInput on parse (strip BOM, CRLF/CR->LF, strip leading blank lines) — non-canonical inputs now accepted + normalized + fixpoint. Tests added for each.
- Maintainability: CANONICAL_KEY_ORDER moved to schema.ts as single source of truth + declaredKnownFields() drift guard test; DECLARED_FIELDS precomputed (per-call Set alloc removed); reason() replaced by exported errors.deriveMessage; engine option objects Object.frozen; canonicalize uses Object.create(null) (mirrors errors.ts technique).

DOCUMENTED LIMITATIONS (pathological, pinned by tests): in-frontmatter YAML comments not preserved (emitter drops comments, ADR-0011); a scalar ending in 2+ newlines emits |+ that abuts the fence and converges on the 2nd write, not the 1st.

Gates green: bun test (187), lint, typecheck. Round 2 /code-review max in flight.

/code-review max ROUND 2 (36 agents, 17 kept/9 refuted) — fixed defects in round-1 fixes:
- schema: known fields .optional()->.nullish() — a YAML empty 'key:' (null) was promoted to a HARD validation error (exit 6); now tolerated (OKF) + preserved verbatim.
- schema: requireType now returns type.trim(); validateFrontmatter returns the resolved type — a whitespace-padded known type (' Story ') was silently demoted to unvalidated unknown; now classifies as Story and fails loudly. parseConcept uses the trimmed type for Concept.type mirror; frontmatter.type kept verbatim.
- concept: serializeConcept now floor-checks (requireSerializableType) — a hand-built Concept with no type could serialize to bytes parse rejects (write/read asymmetry); now throws.
- concept: normalizeInput strips ALL leading BOMs (/^﻿+/, was single) — matches config.ts; multi-BOM no longer rejects a valid file.
- concept: broadened 'no usable frontmatter (missing/empty/null)' diagnostic — a null frontmatter block previously got the misleading 'no frontmatter' message.
- doc: Concept.type documented as read-only mirror (frontmatter.type authoritative); LF line-ending canonicalization made explicit policy (.gitattributes); |+ trailing-newline limitation reframed as a one-time value change for the pathological class (scalars ending in 2+ newlines), fixed dead {@link}.
Gates green: bun test (194), lint, typecheck. Round 3 /code-review max in flight (verifying round-2 deltas).

/code-review max ROUND 3 (33 agents) + ROUND 4 (22 agents) — converged (findings 21->17->10->2):
Round 3 fixed defects in round-2 fixes:
- serializeConcept now re-runs the SAME validateFrontmatter the read path uses (warnings dropped) => EXACT write/read symmetry (round-2's partial floor let a padded/mistyped known-type Concept serialize to bytes parse rejected). Removed the duplicate predicate.
- warnSummary treats null as missing (nullish made a cleared 'summary:' pass silently).
- requireType distinguishes absent ('missing a type') vs present-but-non-string ('invalid type', e.g. numeric type: 2026 — hint to quote).
- normalizeInput strips leading whitespace /^\s+/ (spaces/tabs, not just blank lines) before the fence.
- doc accuracy: null re-serializes as explicit 'null' (one-time normalization, not byte-preserved); frontmatter values may be null (consumers must be null-safe).
Round 4 converged to 2 PATHOLOGICAL, representation-inherent edges — DOCUMENTED as limitations (not fixable without abandoning Record<string,unknown> / JSON_SCHEMA, which would regress worse), both reach a fixpoint:
- integer-like frontmatter keys reorder ascending (JS object loses integer-key order at js-yaml.load time).
- large/high-precision unquoted numeric values lose precision (JS doubles) — quote to keep exact.
All four documented limitations (in-frontmatter comments, |+ trailing-newline scalar, integer keys, big numbers) are pinned by convergence tests. Final gates: bun test (198), lint, typecheck all green.

Delivered as PR #12 (https://github.com/jeremy-newhouse/lore/pull/12) into dev — awaiting review/merge by Jeremy. Status stays In Progress; mark Done ON MERGE via a direct-to-dev chore commit (LORE-10/12 precedent).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered src/core/schema.ts (Zod source of truth: 6 known types, OKF-tiered validateFrontmatter — missing/mistyped type or known-field type error=exit6; unknown type/extra keys/summary warn) and src/core/concept.ts (parseConcept/serializeConcept via gray-matter + pinned js-yaml@4.1.0 JSON_SCHEMA). Byte-stable: canonical key order + verbatim passthrough, fixpoint round-trip (AC#1 golden/idempotency tests), __proto__-safe, input normalization (BOM/CRLF/whitespace). Unknown types validate on type only + keep extra keys (AC#2). Exact write/read symmetry. Deps pinned exact (ADR-0011): gray-matter, js-yaml, zod. Hardened across FOUR /code-review max passes (21->17->10->2 findings, converged to documented pathological-only limitations). 198 tests; lint+typecheck green. Deferred to LORE-17: JSON-Schema emission + above-fence editor modeline. Status stays In Progress until PR #N merges (LORE-10/12 precedent).
<!-- SECTION:FINAL_SUMMARY:END -->

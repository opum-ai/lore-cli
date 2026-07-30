---
id: LCLI-288
title: Consolidate Lore config shape validation on Zod
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 17:08'
labels:
  - zod
  - configuration
  - validation
  - maintenance
dependencies: []
references:
  - src/config.ts
  - test/config.test.ts
documentation:
  - docs/reference/dependency-boundary-audit.md
priority: medium
type: chore
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the repetitive generic type, table, enum, and mapping validators at the parsed TOML boundary with schemas built on Lore’s already-pinned Zod dependency. Keep domain-sensitive behavior outside the schema where it is clearer and safer: recursive committed-secret detection, environment overlay, Bun TOML parsing, zero-config defaults, unsafe override-key rejection, page-id precision rules, and Lore-specific error mapping remain explicit. The objective is one declarative configuration shape without turning Zod into the owner of operational policy. This independent maintenance task does not gate or reorder M6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All currently accepted .lore/config.toml shapes, defaults, unknown-key tolerance, snake_case-to-TypeScript projection, and environment overlay behavior remain compatible
- [ ] #2 Every currently rejected malformed table, boolean, enum, override map, reserved override key, committed token, and invalid or imprecise page id remains rejected with stable credential-safe Lore error semantics
- [ ] #3 The parsed TOML shape is expressed through reusable Zod schemas using the existing pinned dependency; obsolete generic hand-written shape helpers are removed rather than retained in parallel
- [ ] #4 Secret scanning, environment-only token handling, TOML I/O and parse error mapping, and other operational policy remain explicit and covered outside the generic schema boundary
- [ ] #5 Unit tests include before-and-after conformance fixtures and the full suite, typecheck, lint, and bun build --compile smoke test pass under the pinned Bun runtime
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the pre-change Bun 1.2.23 behavior oracle before editing: config suite 37 passed / 118 assertions and host binary 61,352,400 bytes. Add versioned accepted fixtures for missing/empty/partial/full config, defaults, unknown top-level/nested keys, snake_case projection, overrides, numeric/string/huge-string page ids, and environment overlay; add rejected fixtures that pin exact LoreError type/message/hint/input and credential safety for malformed tables, booleans, enums, override maps/values, reserved keys, committed tokens, invalid/imprecise page ids, TOML failures, and unreadable files. 2. Reuse the exact-pinned zod@4.4.3 already in package.json/bun.lock. Official registry/upstream research on 2026-07-30: current stable/latest release (2026-05-04), MIT, ESM with built-in types, no engine declaration, no runtime/transitive or peer dependencies, 4,558,122 unpacked bytes, integrity sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==, actively maintained and broadly adopted; official GitHub advisory feed is empty. Bun 1.2.23 already source-runs, typechecks, tests, and compiles the same exact package throughout the repository; confirm bun audit/frozen lock and final packaging. 3. Define reusable z.looseObject parsed-TOML schemas for the root and known reconcile/validate/confluence tables, with optional known fields, enums, booleans, string values, and string-or-number page-id input. Preserve unknown-key tolerance. Parse once with safeParse and map the first schema issue through a focused Lore-owned diagnostic mapper so all existing credential-safe validation messages, hints, structured input, error type, and exit remain stable. Remove asTable/asBoolean/asString/asEnum/asStringMap rather than retain parallel generic validators. 4. Keep operational/domain policy visibly outside Zod: strip BOM and use Bun.TOML.parse with existing cause mapping; scan raw confluence recursively for committed token before shape parsing; reject reserved override keys explicitly after generic string-map validation; enforce positive/safe page-id precision in the existing explicit policy; apply defaults, snake_case projection, and environment-only token overlay in Lore code. 5. Run the versioned conformance and focused config suite, audit/frozen install, full test/lint/typecheck/build/source+compiled version gates, host size comparison, all five Bun 1.2.23 release-target compile/non-empty checks, npm dry-run packaging, Lore sync/strict validation/strict check, and diff hygiene. Record individual AC evidence, finalize LCLI-288, commit/integrate only its focused work, then reconcile the campaign handover as complete and return the normal cursor to docs/runbooks/dev-kickoff.md / LCLI-283.1.1 M6.
<!-- SECTION:PLAN:END -->

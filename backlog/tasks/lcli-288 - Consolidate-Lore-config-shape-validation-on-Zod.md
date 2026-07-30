---
id: LCLI-288
title: Consolidate Lore config shape validation on Zod
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 17:18'
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
modified_files:
  - src/config.ts
  - test/config.test.ts
  - docs/reference/dependency-boundary-audit.md
  - docs/reference/tech-stack.md
  - docs/reference/architecture.md
  - docs/log.md
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
- [x] #1 All currently accepted .lore/config.toml shapes, defaults, unknown-key tolerance, snake_case-to-TypeScript projection, and environment overlay behavior remain compatible
- [x] #2 Every currently rejected malformed table, boolean, enum, override map, reserved override key, committed token, and invalid or imprecise page id remains rejected with stable credential-safe Lore error semantics
- [x] #3 The parsed TOML shape is expressed through reusable Zod schemas using the existing pinned dependency; obsolete generic hand-written shape helpers are removed rather than retained in parallel
- [x] #4 Secret scanning, environment-only token handling, TOML I/O and parse error mapping, and other operational policy remain explicit and covered outside the generic schema boundary
- [x] #5 Unit tests include before-and-after conformance fixtures and the full suite, typecheck, lint, and bun build --compile smoke test pass under the pinned Bun runtime
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the pre-change Bun 1.2.23 behavior oracle before editing: config suite 37 passed / 118 assertions and host binary 61,352,400 bytes. Add versioned accepted fixtures for missing/empty/partial/full config, defaults, unknown top-level/nested keys, snake_case projection, overrides, numeric/string/huge-string page ids, and environment overlay; add rejected fixtures that pin exact LoreError type/message/hint/input, source-order/failure precedence, and credential safety for malformed tables, booleans, enums, override maps/values, reserved keys, committed tokens, invalid/imprecise page ids, TOML failures, and unreadable files. 2. Reuse the exact-pinned zod@4.4.3 already in package.json/bun.lock. Official registry/upstream research on 2026-07-30: current stable/latest release (2026-05-04), MIT, ESM with built-in types, no engine declaration, no runtime/transitive or peer dependencies, 4,558,122 unpacked bytes, integrity sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==, actively maintained and broadly adopted; official GitHub advisory feed is empty. Bun 1.2.23 already source-runs, typechecks, tests, and compiles the same exact package throughout the repository; confirm bun audit/frozen lock and final packaging. 3. Define reusable z.looseObject parsed-TOML schemas for the root and known reconcile/validate/confluence tables, with optional known fields, enums, booleans, string values, and string-or-number page-id input. Preserve unknown-key tolerance. Parse once with safeParse and map Zod issues through a focused Lore-owned diagnostic mapper in the legacy public failure order so messages, hints, structured input, error type, exit, and multi-failure precedence remain stable. Remove asTable/asBoolean/asString/asEnum/asStringMap rather than retain parallel generic validators. 4. Keep operational/domain policy visibly outside Zod: strip BOM and use Bun.TOML.parse with existing cause mapping; inspect the raw override map between generic reconcile and validate failures so reserved keys and source order remain secure before Zod can copy __proto__; scan raw confluence recursively for committed tokens before exposing its generic shape errors; enforce positive/safe page-id precision explicitly; apply defaults, snake_case projection, and environment-only token overlay in Lore code. 5. Run the versioned conformance and focused config suite, audit/frozen install, full test/lint/typecheck/build/source+compiled version gates, host size comparison, all five Bun 1.2.23 release-target compile/non-empty checks, npm dry-run packaging, Lore sync/strict validation/strict check, and diff hygiene. Record individual AC evidence, finalize LCLI-288, commit/integrate only its focused work, then reconcile the campaign handover as complete and return the normal cursor to docs/runbooks/dev-kickoff.md / LCLI-283.1.1 M6.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented commit b9dcc4a on feature/lcli-288-zod-config-shape. Dependency research: existing exact zod 4.4.3 is the current stable/latest 2026-05-04 release, MIT, ESM with built-in types, no engine declaration, no runtime/transitive or peer dependencies, 4,558,122 unpacked bytes, registry integrity sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==, actively maintained and broadly adopted. Official GitHub advisory feed returned []; bun audit found no vulnerabilities. Bun 1.2.23 (cf136713) already exercises the exact package across profile/schema/backlog boundaries, and final source, typecheck, tests, and compilation passed without changing package.json or bun.lock.

AC1 evidence: ACCEPTED_CONFIG_CONFORMANCE_V1 plus existing tests preserve missing/empty defaults, partial/full files, unknown top-level/nested tolerance, every snake_case projection, normal override maps, numeric/string/huge-string page ids, the committed default sample, and injected/trimmed/blank/unset environment overlay. Focused config suite passed 39 tests / 196 assertions. AC2 evidence: REJECTED_CONFIG_CONFORMANCE_V1 pins exact LoreError message/hint/input for all known tables, both booleans, both enums, malformed override map/value, base-url string, reserved __proto__, committed token without credential text, invalid page-id type/value, and imprecise numeric page id. It also pins legacy multi-failure precedence and source-order interactions. Existing nested/array token, BOM bypass, parser-reason, denied-read, all reserved Object.prototype keys, and all page-id form regressions remain green. AC3 evidence: reusable loose ReconcileTableSchema, ValidateTableSchema, ConfluenceTableSchema, and ParsedConfigSchema now recognize the generic parsed shape in one safeParse boundary while preserving unknown keys; asTable, asBoolean, asString, asEnum, and asStringMap were removed. AC4 evidence: Bun TOML reading/parsing and cause mapping, raw recursive secret scanning, raw reserved-key defense before Zod can drop __proto__, environment-only token overlay, defaults/projection, explicit page-id value/precision policy, failure precedence, and Lore error mapping remain separate and directly covered. AC5 evidence: pre-change focused baseline 37 tests / 118 assertions; post-change focused 39 / 196; final full suite 2,245 tests / 6,453 assertions across 51 files. lint, typecheck, source version 0.0.0, host build (222 modules), and compiled version 0.0.0 passed.

Packaging/security evidence under Bun 1.2.23: frozen install checked 50 installs across 58 packages with no changes; npm pack dry-run passed with 65 entries and bundled []; all five binaries compiled non-empty: darwin-arm64 61,352,400, darwin-x64-baseline 67,433,136, linux-arm64 98,404,225, linux-x64-baseline 105,267,584, windows-x64-baseline 119,891,456 bytes. Versus the LCLI-285 baseline, host/Darwin sizes and 222-module count are unchanged, Linux targets are +2,825 bytes each, and Windows is +3,072 bytes.

Documentation/repository evidence: architecture, dependency audit, and tech stack describe the shipping boundary outside Lore-managed regions; lore sync reached 0 pending changes after updating docs/log.md; lore validate --strict passed 45 files with 0 errors/warnings and 5 skipped indexes; lore check --strict passed 45 files with 0 errors/warnings; git diff --check passed. No new dependency or deferred scope was introduced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Consolidated generic parsed-TOML shape recognition on the existing exact-pinned Zod 4.4.3 boundary and removed the five parallel hand-written table/boolean/string/enum/map validators. Lore still owns Bun TOML I/O, defaults and snake-case projection, recursive credential-safe token scanning, environment overlay, reserved override keys, page-id value/precision policy, failure precedence, and public error mapping. Versioned accepted/rejected conformance plus legacy regressions passed 39 focused tests / 196 assertions; the final Bun 1.2.23 matrix passed 2,245 tests / 6,453 assertions, lint, typecheck, source/compiled version, host and five-target builds, clean audit/frozen lock, npm dry-run packaging, strict Lore validation/check, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->

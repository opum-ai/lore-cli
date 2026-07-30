---
id: LCLI-288
title: Consolidate Lore config shape validation on Zod
status: To Do
assignee: []
created_date: '2026-07-30 15:27'
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

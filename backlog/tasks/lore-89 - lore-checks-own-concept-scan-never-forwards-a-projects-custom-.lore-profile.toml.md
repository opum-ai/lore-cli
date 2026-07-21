---
id: LORE-89
title: >-
  lore check's own concept scan never forwards a project's custom
  .lore/profile.toml
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
labels:
  - backlog-campaign-followup
  - correctness
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: medium
type: bug
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/check.ts discovers and parses concepts through its own `walkFiles` + `parseConcept` path (`tryConceptsForBundle`, check.ts:264-281), entirely separate from `core/bundle.ts`'s `loadBundle` (which LORE-84 fixed to thread a project's `.lore/profile.toml` through). check.ts imports nothing from `core/profile.ts` — no `loadProfile`, no `Profile` type anywhere in the file — and its one `parseConcept(file.path, file.raw)` call at check.ts:273 passes no `options.profile`, so `core/concept.ts`'s `options.profile ?? defaultProfile()` fallback (concept.ts:357) always resolves to the built-in default profile, never the project's own.

This parse is not incidental: it is the only frontmatter validation `lore check` performs, and it runs for every `tasks:`-linked concept (the ones `tryConceptsForBundle` fully parses, to build `Concept`s for status/managed-block reconciliation, ADR-0007/LORE-27). Reproduced live: a scratch bundle with `.lore/profile.toml` redefining the built-in `Story` type to require an additional `owner` field, and a `tasks:`-linked doc declaring `type: Story` that satisfies the *default* Story schema but omits the custom-required `owner`. `lore check` reports "0 errors, 0 warnings" for that file — the concept parses and is accepted with no frontmatter finding — while `lore query` (loadBundle, profile-aware since LORE-84) and `lore validate` (calls `loadProfile` directly) both correctly reject the identical file with "invalid Story frontmatter... owner: Invalid input: expected string, received undefined" (exit 6).

This three-way disagreement matters because ADR-0007 documents `lore check` as the trustworthy, authoritative CI gate, specifically so `validate`/`check` never silently diverge. A project that defines custom required fields via `.lore/profile.toml` can merge a `tasks:`-linked doc that violates its own schema, because `check`'s reconciliation-eligibility parse silently falls back to the wrong (default) schema — the CI gate goes green on exactly the class of drift it exists to catch. LORE-84's own adversarial reviewer independently surfaced this exact gap during that task's review and explicitly deferred it as a pre-existing, architecturally distinct gap worth its own follow-up, corroborating this is not something LORE-84 already covers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore check` against a bundle with a project-defined `.lore/profile.toml` validates every concept it parses (via check.ts's own tryConceptsForBundle scan, not only via loadBundle) against that profile, not the built-in default.
- [ ] #2 A `tasks:`-linked concept that violates a custom-profile-required field, while still satisfying the built-in default schema for the same type name, causes `lore check` to report a frontmatter/validation finding and fail the gate (exit 6) — matching what `lore query`, `lore validate`, and `lore sync` already report for the identical file.
- [ ] #3 A `tasks:`-linked concept that satisfies the project's custom profile continues to pass `lore check` cleanly, with no regression to bundles that declare no custom profile.
- [ ] #4 A test exercises `lore check`'s own command-layer scan (not core/bundle.ts's loadBundle in isolation) with a custom profile that redefines a built-in type name, proving the previously-silent false negative is now caught and that `check` and `validate`/`query` agree on the same file.
<!-- AC:END -->

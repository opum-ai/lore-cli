---
id: LORE-47
title: 'GitAdapter seam: git-history log.md + resource_base stamping'
status: To Do
assignee: []
created_date: '2026-06-21 20:16'
updated_date: '2026-06-22 02:06'
labels:
  - eck-alignment
  - core
milestone: m-2
dependencies: []
documentation:
  - docs/adr/0014-core-has-no-llm-dependency.md
priority: medium
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the third injectable deterministic seam (GitAdapter) and the resource_base config, per the ECK<->Lore alignment (D5). (1) Make log.md git-history-derived (per-folder list of commits touching each folder) via an injectable GitAdapter alongside the clock and Backlog seams (ADR-0014 sec 8): deterministic over a pinned commit range, directory-sorted, byte-stable, idempotent (git is local computation; offline/air-gap hold). Because a git-derived log.md changes on every commit, materialize it on 'lore sync' and EXCLUDE it from 'lore check's regenerate-and-compare drift gate (otherwise it reports permanent exit-6 drift and breaks on shallow/read-only CI checkouts). (2) Add an optional resource_base key to .lore/config.toml so 'lore new' stamps the OKF-recommended 'resource' key; empty default omits it (byte-identical to today). resource value = resource_base joined with the concept's stable relative path/id (documented trailing-slash/join normalization); producer-side only, never on root/sub-index files. Consumed by LORE-29 (log.md) and LORE-15 (resource stamping).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0014 sec 8 amended to name the GitAdapter as the third injectable seam (faked in tests; git = local deterministic computation, not network/model)
- [ ] #2 ADR-0007 amended: log.md is a sync-time materialized artifact excluded from 'lore check' drift-compare; index.md + managed blocks stay gated as today
- [ ] #3 log.md git-history-derived, per-folder, directory-sorted, byte-stable over a pinned range; tested against a fixed fake-history fixture (not real history) and excluded from byte-equality goldens
- [ ] #4 'lore new' stamps 'resource' only when resource_base is set; value = resource_base + concept path with documented normalization; omitted when empty
- [ ] #5 ADR-0013 amended: resource_base is a key in .lore/profile.toml [profile] (NOT config.toml — reconciles with LORE-46); empty default => resource omitted. Introduces .lore/profile.toml as a 2nd committed TOML (config=operational knobs; profile=type/schema source)
<!-- AC:END -->

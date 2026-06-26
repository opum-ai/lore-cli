---
id: LORE-47
title: 'GitAdapter seam: git-history log.md + resource_base stamping'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 20:16'
updated_date: '2026-06-26 11:59'
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
- [x] #1 ADR-0014 sec 8 amended to name the GitAdapter as the third injectable seam (faked in tests; git = local deterministic computation, not network/model)
- [x] #2 ADR-0007 amended: log.md is a sync-time materialized artifact excluded from 'lore check' drift-compare; index.md + managed blocks stay gated as today
- [x] #3 log.md git-history-derived, per-folder, directory-sorted, byte-stable over a pinned range; tested against a fixed fake-history fixture (not real history) and excluded from byte-equality goldens
- [x] #4 'lore new' stamps 'resource' only when resource_base is set; value = resource_base + concept path with documented normalization; omitted when empty
- [x] #5 ADR-0013 amended: resource_base is a key in .lore/profile.toml [profile] (NOT config.toml — reconciles with LORE-46); empty default => resource omitted. Introduces .lore/profile.toml as a 2nd committed TOML (config=operational knobs; profile=type/schema source)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Scope (confirmed with Jeremy): build the GitAdapter seam + pure log fn now; DEFER command wiring (no `lore sync`/`lore check` yet — only init/new/validate exist).

1. resource stamping (AC#4) — least-churn home:
   - schema.ts: add `resource` to OKF_RESERVED_KEYS so a stamped resource never trips the extra-key warning, WITHOUT touching the profile, generated validators, or committed .lore/schemas/*.json (no schema churn).
   - template.ts buildNewConcept: pure helper resourceFor(resourceBase, docPath). Stamp frontmatter.resource ONLY when profile.resourceBase is non-empty AND posix.basename(docPath) !== 'index.md' (never root/sub-index). Value = resourceBase (trailing slashes trimmed) + '/' + docPath, each docPath segment encodeURIComponent'd (slugs unchanged, spaces/unicode encoded), '.md' kept, exactly one join slash. resource trails as a recognized non-profile key (byte-stable, like other producer keys).

2. GitAdapter seam + log.md (AC#1/#3) — new core/log.ts:
   - GitCommit { hash, timestamp(ISO), subject, files[] }, GitLogRange, GitAdapter { history(range): GitCommit[] } interface (the 3rd injectable seam, faked in tests).
   - pure generateLog(commits): per-folder grouping (each docs/ folder a commit touched), folders directory-sorted, commits under each sorted by (timestamp, hash) → byte-stable, idempotent markdown. No real spawning adapter (that is sync-time wiring; deferred + documented).
   - test/log.test.ts: fixed FAKE history fixture; assert grouping/sort/byte-stability/idempotence. Excluded from byte goldens.

3. ADR amendments:
   - ADR-0014: Amended note naming GitAdapter as the 3rd injectable seam (clock, BacklogAdapter, GitAdapter); git = local deterministic computation, faked in tests (AC#1). Mirror in lore-design §8.
   - ADR-0007: Amended note — log.md is a sync-time materialized artifact EXCLUDED from `lore check` drift-compare; index.md + managed blocks stay gated (AC#2).
   - ADR-0013: refine existing LORE-46 amendment — resource_base in profile.toml [profile] (NOT config.toml), empty default => resource omitted, stamping now implemented (AC#5).

4. test/new.test.ts: resource stamped when resourceBase set; omitted when empty; omitted on index.md; URL-encoding + one-slash join.
5. CHANGELOG (Unreleased) entry. Gates: bun test + biome + tsc + coverage -> /code-review max -> PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered on feat/lore-47-gitadapter-resource (scope confirmed with Jeremy: build the GitAdapter seam + pure log fn now; DEFER the lore sync/check command wiring — only init/new/validate exist today).

AC#4 (resource stamping): src/core/template.ts resourceFor() + stampResource(); src/core/schema.ts adds 'resource' to OKF_RESERVED_KEYS (recognized OKF key, no extra-key warning, NO change to any generated validator or committed .lore/schemas/*.json). Value = resource_base (trailing slashes trimmed) + '/' + repo-relative docPath with each segment encodeURIComponent'd (slugs unchanged, spaces/non-ASCII escaped, .md kept, exactly one join slash). Gated: empty resource_base (default) OR index/sub-index (basename index.md) => omitted, so zero-config output is byte-identical to before. resource trails the profile's declared keys in canonical order; round-trips byte-stably (fixpoint test). Tests: test/template.test.ts (resourceFor + stamping), test/new.test.ts (full lore new threads profile.resourceBase). 100% line/func coverage on template.ts + schema.ts.

AC#1/#3 (GitAdapter seam + log.md): src/core/log.ts — GitCommit/GitLogRange/GitAdapter interface (the 3rd injectable seam) + pure generateLog (per-folder grouping, directory-sorted folders, commits sorted by (timestamp,hash), byte-stable/idempotent, bundle-root scoped, multi-line subject collapsed) + buildLog(adapter,range) that exercises the seam. test/log.test.ts uses a FIXED FAKE history (never real git); 100% coverage. The real git-shelling adapter + the lore sync materialization wiring are DEFERRED to the sync task (documented in ADR-0014/0007 amendments). AC#3's 'excluded from byte-equality goldens' is satisfied structurally: log.md has no golden/command yet and the pure fn is asserted directly; the drift-gate exclusion is documented in ADR-0007.

ADRs: ADR-0014 (names GitAdapter as 3rd seam), ADR-0007 (log.md sync-materialized, excluded from check), ADR-0013 (resource_base in profile.toml [profile], empty default omits), lore-design §8 (GitAdapter bullet). CHANGELOG Unreleased entry added.

DEFERRED follow-up (for the lore sync task): (1) real GitAdapter that shells 'git log' over a pinned range + parses name-only output; (2) wire generateLog into 'lore sync' to materialize docs/log.md; (3) ensure 'lore check' skips log.md. Gates green: 485 tests pass, tsc clean, biome clean, lore validate on edited docs = 0 errors.

/code-review max disposition (run wf_df76fedf-0cd, 47 agents, 34 verified -> 15 reported). Fixed in commit 7e36a14:
CORRECTNESS: (1) profile declaring its own [base.fields] resource -> lore now defers (no auto-stamp; was exit-6 crash on every create). (2) log.ts chronological sort by parsed instant not lexical text (ISO offsets). (3) log.ts file-equals-root no longer emits spurious '## .' section. (4) log.ts per-folder arrays (push) not hash-keyed Map -> abbreviated-hash collisions both render; subject collapsed once/commit. (5) log.ts empty-root option falls back to default.
REUSE: new core/order.ts compareCodeUnits shared by bundle.ts + log.ts (dup comparator); log.ts imports DOCS_DIR not a re-spelled literal.
DOCS/TESTS: ADR-0013 LORE-47 stamping split into its own dated amendment (was misattributed to the LORE-46 block); lore-design §8 reworded (git is deterministic/seamed-for-impurity, not 'genuinely nondeterministic'); fixpoint test now does the real serialize(parse(x))===x round-trip; added offset-sort/file-equals-root/hash-collision/empty-root/tie-break/profile-owned-resource tests.
DECLINED w/ reasoning: (a) index.md authored page omits resource — by-design per AC#4/#5 ('never on root/sub-index files'); lore can't distinguish a generated sub-index from an authored page named index.md at new-time. (b) global resource warning-suppression — intended: resource is now a recognized OKF key like title/summary (a stray correct-spelling resource: is indistinguishable from intent; a misspelling still warns), consistent with okf_version. (c) extract shared under-root predicate between log.ts and new.ts — they legitimately differ after fix #3 (log wants strictly-under-root; new.ts confines incl. the root index). REFUTED by verifiers: backlog-md hand-edit (used CLI), encodeURIComponent JSDoc, the cast-crash claim. Gates: 491 tests pass, tsc+biome clean, 100% cov on log.ts/order.ts/template.ts/schema.ts.
<!-- SECTION:NOTES:END -->

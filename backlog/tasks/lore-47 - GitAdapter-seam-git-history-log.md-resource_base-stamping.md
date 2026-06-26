---
id: LORE-47
title: 'GitAdapter seam: git-history log.md + resource_base stamping'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 20:16'
updated_date: '2026-06-26 20:00'
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
Fix-everything disposition of the 13 /code-review max findings (Jeremy approved 2026-06-26). Order:
1. profile.ts: add CompiledType.acceptsStampedResource (true unless the type OWNS a resource field whose kind!=string or has an enum) — the per-type fact stampResource needs.
2. template.ts: (#1/#2) replace the global canonicalKeyOrder.includes('resource') guard with a per-type check via new shared expectedResource(type,docPath,profile); stampResource + the validate drift-check both consume it (single source). (#3) trim resourceBase in resourceFor and at the profile.ts parse boundary so whitespace base is normalized/treated-as-unset.
3. schema.ts: (#4) treat 'resource' as reserved-except-on-index so a hand-authored resource: on index.md is warned again; okf_version stays always-reserved.
4. log.ts: (#6) import singleLine from ../errors (U+2028/29); (#7) normalize trailing-slash root; (#8) subject tiebreak; (#9) only offset-bearing ISO yields an absolute instant, else deterministic text fallback (no local-TZ dependence); (#11) drop timestamp-text primary fallback; (#12) cache instant on LogEntry.
5. validate.ts: (#5) new 'resource' warning rule — a present resource that != expectedResource(...) is flagged stale (drift), advisory tier since resource is advisory metadata.
6. tests: (#13) give profileWithResourceBase an extra-base-fields arg; add tests for required-string resource stamped, cross-type non-suppression, whitespace base, index hand-authored-resource warning, resource drift, log subject/offset-less tiebreaks.
Gate: bun test + biome + tsc + coverage -> push via gh-token, keep PR #18 open.
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

## /code-review max of PR #18 — 2026-06-26 (13 verified findings; disposition PENDING Jeremy)

Workflow-backed review (35 agents, 10 finder angles, every candidate independently verified): 22 candidates → 6 refuted → 13 distinct findings. PR #18 still open/unreviewed at a9177cc when run. NONE applied yet — awaiting Jeremy's call: fix-on-branch / inline PR comments / defer the log.ts ones to the deferred sync follow-up task.

CORRECTNESS — stampResource guard (worst two; root cause: `canonicalKeyOrder.includes('resource')` tests the profile-GLOBAL field list, not the concept's own type):
1. template.ts:218 (CONFIRMED) — declaring a typed `resource` on ANY one type suppresses auto-stamping for EVERY type (global canonicalKeyOrder aggregates all types' fields). Fix: test the concept's own type's declared fields.
2. template.ts:214 (CONFIRMED) — a `resource = {required=true}` field makes `lore new <type>` fail exit 6 forever: stampResource defers (no stamp) → validateFrontmatter rejects missing required field; no --resource flag to supply it. The guard's doc comment wrongly claims deferral prevents this.
CORRECTNESS — resource stamping (smaller):
3. template.ts:60 (CONFIRMED) — resource_base with surrounding whitespace neither normalized nor treated as unset (omit guard is exact ===''); yields 'resource: https://x.com/ /docs/...md' (embedded space → broken URL).
4. schema.ts:55 (CONFIRMED) — adding 'resource' to global OKF_RESERVED_KEYS means a hand-authored `resource:` on an index.md is no longer warned, contradicting the index-files-carry-no-resource invariant.
5. template.ts:222 (CONFIRMED) — stamped `resource` is never regenerated/drift-checked (unlike index.md/log.md/managed blocks); after a rename or resource_base change the stale URL ships green.
CORRECTNESS — log.ts (LATENT: no production caller until lore sync is wired):
6. log.ts:174 (CONFIRMED) — private singleLine() (/\s*[\r\n]+\s*/g) drops U+2028/U+2029 that canonical errors.ts singleLine handles; a commit subject with U+2028 splits its log entry across two lines. Fix: import singleLine from ../errors (no cycle).
7. log.ts:114 (PLAUSIBLE) — isUnderRoot startsWith(`${root}/`) never normalizes root; root='docs/' → compares 'docs//' → matches nothing → silently empty log.md. Asymmetric with resourceFor (same PR) which strips trailing slashes.
8. log.ts:191 (PLAUSIBLE) — compareEntries sorts by (timestamp,hash) only; missing subject tiebreak → equal-ts+equal-abbrev-hash commits fall back to input order → non-reproducible churn.
9. log.ts:186 (PLAUSIBLE) — Date.parse on an offset-LESS ISO timestamp resolves in host-local TZ → per-machine ordering; reintroduces the machine-dependence order.ts was made to kill.
10. template.ts:65 (PLAUSIBLE) — resourceFor joins base to full repo-rel path incl. 'docs/'; a base already at the docs root double-prefixes → <base>/docs/docs/...  (by-design AC#4 but silently accepted misconfig).
CLEANUPS:
11. log.ts:185 (CONFIRMED) — dead NaN/lexical-fallback branch unreachable for ISO contract; where reachable it tie-breaks by timestamp TEXT, contradicting the 'tie-broken by hash' doc. Simpler: (ta<tb?-1:ta>tb?1:0)||compareCodeUnits(a.hash,b.hash).
12. log.ts:186 (CONFIRMED) — Date.parse re-run inside comparator O(N log N)/folder; cache numeric instant on LogEntry at construction (line 127) → commits.length parses total.
13. test/template.test.ts:273 (PLAUSIBLE) — inline Bun.TOML.parse re-inlines profileWithResourceBase wholesale; give the helper an extra-base-fields arg.

REFUTED (6, not actionable, for the record): broader unknown-key-warning widening (intended/tested); encodeURIComponent surrogate-throw (unreachable on slugged paths); isUnderRoot-as-own-function (style); seam-has-no-caller (intentional defer); hardcoded 'index.md' literal; 'recursive folder' doc reading.

Full transcript: workflow wf_dbed19c0-3ff.

## Disposition of the 13 /code-review max findings — FIXED ON BRANCH (2026-06-26, Jeremy chose 'fix everything')

All 13 applied on feat/lore-47-gitadapter-resource; +15 tests; gates green (506 pass, tsc/biome clean, core files template/log/schema/order 100% cov).
- #1/#2 (template.ts stampResource): replaced the global canonicalKeyOrder.includes('resource') guard with a per-type check. New CompiledType.acceptsStampedResource (profile.ts) = true unless the concept's OWN type declares a resource field whose kind!=string or has an enum. Cross-type suppression gone; a required-STRING resource is now satisfied by the stamp (no exit-6); an incompatible (datetime/enum) field still defers. Extracted shared expectedResource(type,docPath,profile) — single source for stamp + drift-check.
- #3 (resourceFor:60 + profile parse): trim the base in resourceFor AND trim resource_base at the parse boundary, so a whitespace base is normalized / treated-as-unset (no embedded-space URL).
- #4 (schema.ts:55): new isReservedKey(key,isIndex) — resource is reserved (no extra-key warn) EXCEPT on index.md, where a hand-authored resource: is now warned again; okf_version stays always-reserved.
- #5 (validate.ts): new 'resource' warning rule — a present resource != expectedResource(...) is flagged stale (drift); advisory tier (resource is advisory metadata), inert under zero-config (no resource_base).
- #6 (log.ts:174): dropped private singleLine; import canonical singleLine from ../errors (handles U+2028/2029).
- #7 (log.ts:114): strip trailing slash(es) from root (docs/ -> docs) so it isn't a silently-empty log.
- #8/#9/#11/#12 (log.ts compareEntries): cache an 'instant' on LogEntry (parse once); only offset-bearing ISO yields an absolute instant (offset-less -> NaN -> deterministic text fallback, no host-local-TZ dependence); subject added as final tiebreak; dropped the timestamp-text primary fallback.
- #13 (template.test.ts): profileWithResourceBase now takes an extraBaseFields arg; the owns-resource test uses it.
The 6 REFUTED findings remain not-actionable (recorded above).
<!-- SECTION:NOTES:END -->

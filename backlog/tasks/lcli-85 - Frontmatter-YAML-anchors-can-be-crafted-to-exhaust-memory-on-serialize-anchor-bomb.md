---
id: LCLI-85
title: >-
  Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor
  bomb)
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:24'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
yaml.load has no alias/anchor expansion limit, and YAML_DUMP_OPTIONS sets noRefs:true, so a small frontmatter payload using nested YAML anchors parses instantly but expands exponentially on serialize. Reproduced directly: an 18-level doubling-anchor chain (~417 bytes of YAML) expands to a 64MB string in ~600ms on yaml.dump; a few more levels reaches OOM or an uncaught V8 RangeError. serializeConcept is reached broadly (bundle.ts, sync.ts, rewrite.ts, indexes.ts, template.ts, scaffold.ts, commands/link.ts, commands/supersede.ts), so a single crafted concept file anywhere in a bundle can crash most lore commands the next time they touch it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frontmatter parsing or serialization enforces a bound on anchor/alias expansion (e.g. a maximum expanded size or depth) and fails with a clean LoreError instead of an uncaught RangeError or unbounded memory growth
- [x] #2 A test covers a crafted anchor-chain payload and asserts a clean, bounded error rather than a crash or multi-second/multi-megabyte expansion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduced the exact mechanism directly against js-yaml 4.1.0 (the pinned version): yaml.load never expands an alias at parse time -- it points the SAME JS object reference back at its anchor, so parsing a doubling-anchor chain is always fast regardless of depth (confirmed: an 18-level ~400-byte chain loads in ~1ms). The danger is entirely downstream: yaml.dump({noRefs:true}) (YAML_DUMP_OPTIONS in concept.ts, chosen specifically so a re-serialize never emits &/* anchors) walks the shared-reference graph naively, re-expanding each shared subtree once per incoming reference -- confirmed the same 18-level chain expands to ~20MB in ~286ms via yaml.dump alone.
2. Checked js-yaml 4.1.0's actual LoadOptions type (node_modules/@types/js-yaml) for any built-in alias-count/depth limit: none exists (maxAliasCount is a feature of the DIFFERENT eemeli/yaml library, not js-yaml -- verified this distinction directly rather than assuming). So the bound has to be enforced by lore's own code.
3. Also confirmed empirically that js-yaml's JSON_SCHEMA permits a genuinely CYCLIC anchor to load successfully (a: &a {b: *a} loads with doc.a === doc.a.b, a real cycle) -- a second, distinct hazard a size budget alone can't catch (an unmemoized walk of a true cycle never terminates); confirmed yaml.dump({noRefs:true}) on a real cyclic object throws RangeError: Maximum call stack size exceeded rather than hanging forever, matching the task's own 'uncaught RangeError' framing.
4. Confirmed the attack surface is broader than just 'lore sync' writes: bundle.ts's tokenEstimate() (used by lore graph/context, read-only commands) also calls serializeConcept internally -- so this isn't only a write-path risk.
5. Chose to enforce the bound at PARSE time (inside concept.ts's single gray-matter yaml-engine parse hook, the one choke point every read path -- parseConcept/tryParseConcept/tryReadFrontmatter -- shares) rather than at every individual serialize call site, so a malicious file is rejected the moment it's first read, before ANY downstream consumer (validation, the bundle graph, token estimation, a later dump) can ever touch the dangerous object. A thrown error there is automatically caught and path-annotated by splitFrontmatter's existing matter(...) try/catch, exactly like a plain YAML syntax error already is.
6. Implemented assertBoundedYamlExpansion: a deliberately non-memoized (reference-blind) walk that mirrors what a real dump would do -- but tracks a running 'expanded units' total and aborts the instant it crosses a 100,000-unit budget (frontmatter is metadata, never prose, so this is generous headroom over any real use while catching a doubling attack within ~17 levels, almost instantly regardless of how much deeper the malicious chain goes). Cycle detection via a path-scoped ancestor Set (added on entering a node, removed on leaving), which correctly distinguishes a true cycle from harmless DAG-style anchor reuse (the same anchor referenced by two unrelated siblings -- an ordinary, safe YAML pattern that must not be rejected).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
End-to-end verified with the real CLI (not just unit tests): built a scratch bundle with docs/bomb.md carrying the exact 18-level doubling-anchor payload. Post-fix: lore query --json exits 6 in 58ms total wall-clock with a clean validation error naming the exact size-bound violation. Pre-fix (git stash): lore graph --json (whole-bundle export, which calls tokenEstimate -> serializeConcept -> yaml.dump for every node) exits 0 but takes 0.36s user CPU at 133% CPU utilization -- consistent with the expensive ~20MB dump having actually executed internally (confirmed the same 18-level payload takes ~286ms via yaml.dump alone in isolation); the tiny JSON output doesn't show the danger since only a computed token-count integer is exposed, not the huge intermediate string, so the CPU/timing signature is the real tell.

Verified the fix does NOT reject legitimate, harmless anchor reuse (the same anchor referenced by two unrelated sibling fields, e.g. a shared tags list) -- an ordinary, safe YAML pattern, distinct from the exponential/cyclic attack shapes. Verified the guard doesn't affect the real docs/ bundle (loads cleanly, 33 concepts, unchanged).

Added 4 tests to test/concept.test.ts: the task's own 18-level repro (asserts clean validation error, under 1s); a much deeper 40-level chain (2^40 would be ~1 trillion naive steps without early-exit -- proves the walk's cost is bounded by the budget, not by how deep the malicious chain goes, still resolves in milliseconds); a genuinely cyclic anchor (asserts rejection naming 'cyclic', not a stack overflow); and the harmless-DAG-reuse negative control (must NOT be rejected). Confirmed via git stash that all 3 malicious-payload tests fail pre-fix (parseConcept returns successfully instead of throwing -- since parse alone doesn't trigger expansion, only downstream dump does, confirming the vulnerability is real and deferred) and pass post-fix; the negative-control test correctly passes in both states.

Full bun test: 1518 pass/0 fail (up from 1514). bun run typecheck clean. bun run lint clean on both changed files.

Independent ADVERSARIAL security review (general-purpose subagent) actively tried to construct a bypass rather than just re-confirming the given repro -- no bypass found across 9+ variants tested directly through parseConcept (not just yaml.dump in isolation): a wide/shallow fan-out tree (10 refs/level instead of doubling, correctly rejected once total crosses budget regardless of shape), a map/object-based bomb (not array-based), a long-string-leaf bomb (string length accounting correctly multiplies cost), a YAML merge-key disguise (<<: [*a, *a] -- confirmed JSON_SCHEMA doesn't resolve merge keys, so it's walked as a literal key like any other), a deep (3-level) cycle, a cycle through an array, and -- critically -- a deliberately cycle-shaped-but-actually-safe diamond DAG (a shared leaf reached via two different parents) which correctly was NOT rejected (no false positive). Also verified up to 8000 realistic tags (102KB source) are correctly accepted, not rejected -- no plausible legitimate frontmatter risks tripping the budget. Confirmed the units>MAX check runs at the end of EVERY walk() call (leaf and container alike), the tightest possible granularity -- worst-case overrun is bounded by a single node's own cost.

One minor, non-blocking hygiene note from the review (not fixed, correctly out of scope): src/adapters/backlog.ts:844 (parseStatusFlow, parsing backlog/config.yml) has a SECOND, unguarded yaml.load call site. Traced its sole consumer (reconcile-shared.ts) -- the parsed object is only read as a shallow string array, never passed to yaml.dump anywhere, so it is NOT currently exploitable for this same DoS (load() alone is always fast regardless of anchors, the vulnerability's whole premise). Flagged as a latent risk only if future code ever adds a dump on that object -- not filed as a follow-up task since it's not a live vulnerability today, just noted here for the record. profile.ts/config.ts use Bun.TOML.parse (no anchor/alias concept in TOML), correctly out of scope entirely.

Independently reproduced the pre/post-fix comparison (git-diff-swap on concept.ts) and the live CLI end-to-end check, both matching the implementer's claims almost exactly (pre-fix lore graph reported tokenEstimate: 5,242,909 for the bomb file, directly proving the ~20MB string was actually materialized internally). Full bun test 1518/1518 pass, typecheck clean, lint clean (4 pre-existing infos in an unrelated test file, not this diff). No code changes needed as a result of this review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the YAML anchor-bomb DoS: js-yaml's load() never expands aliases at parse time (fast regardless of depth), but yaml.dump({noRefs: true}) -- deliberately configured so a re-serialize never emits anchors -- walks the shared-reference graph naively, causing an ~18-level doubling-anchor chain (~400 bytes) to expand to ~20MB, and this is reachable not just from lore sync's writes but from any read-only command that calls bundle.ts's tokenEstimate() (e.g. lore graph/context), which internally calls serializeConcept. Added a bounded, cycle-safe expansion-size walker (assertBoundedYamlExpansion, src/core/concept.ts) wired into the single gray-matter YAML parse hook every read path shares, so a malicious file is rejected the moment it's first read -- exit 6, clean LoreError, milliseconds -- before any downstream consumer can ever touch the dangerous object. Also catches genuinely cyclic anchors (legal under js-yaml's JSON_SCHEMA), which previously threw an uncaught-looking RangeError: Maximum call stack size exceeded rather than a clean error. Verified the fix does not affect legitimate anchor reuse (a shared value referenced by two sibling fields) or the real docs/ bundle. Added 4 tests (the task's 18-level repro, a 40-level chain proving the walk's own cost stays bounded regardless of attack depth, a cyclic-anchor case, and a harmless-reuse negative control); confirmed via git stash all malicious-payload tests fail pre-fix and pass post-fix. End-to-end verified through the real CLI: pre-fix lore graph's CPU/timing signature confirms the expensive dump actually executes internally even though the small JSON output doesn't show it; post-fix the same file is rejected in ~58ms. Full bun test 1518/1518 pass (up from 1514), typecheck clean, lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LCLI-194
title: >-
  Document/pin the throw-on-duplicate locator contract that
  assertNoInjectedMarker relies on
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-replace
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-12 integration finding (low) on LCLI-162. assertNoInjectedMarker (src/core/replace.ts:245) re-runs managedRanges / MANAGED_REGION_LOCATORS (replace.ts:103-106) to reject a regex/literal replacement whose expansion duplicates a managed-block marker. Its guarantee holds ONLY because each current locator (locateManagedBlock for the index block, locateTaskBlock for lore:tasks) THROWS when its marker appears more than once, even when both copies are well-formed blocks. The registry doc says only that "a new managed block is protected by adding one entry" — it does not state that a locator MUST throw on duplication rather than return the first span. A future locator that silently returns the first span would silently reopen LCLI-162 for that marker kind with no existing test failing. Document the throw-on-duplicate requirement on MANAGED_REGION_LOCATORS and pin it with a guard/test. Nothing is broken today; both current locators satisfy the contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The MANAGED_REGION_LOCATORS registry (src/core/replace.ts) documents that every locator must throw when its marker appears more than once (not return the first span), so assertNoInjectedMarker's duplicate-rejection guarantee is explicit rather than incidental.
- [x] #2 A test (or type-level guard) pins the contract so a future locator that returns a first-span-on-duplicate for a well-formed duplicated marker is caught.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an explicit throw-on-duplicate contract paragraph to the MANAGED_REGION_LOCATORS JSDoc in src/core/replace.ts, naming why assertNoInjectedMarker's LCLI-162 guarantee depends on it.
2. Restructure MANAGED_REGION_LOCATORS entries from bare locate functions into {locate, duplicateProbe} descriptors (duplicateProbe = a synthetic, individually-well-formed duplicated instance of that marker pair), and export the registry + a new pure predicate locatorThrowsOnDuplicate(locate, duplicateProbe) for test consumption.
3. Update managedRanges() to destructure the new descriptor shape.
4. In test/replace.test.ts, add a generic test that iterates the real MANAGED_REGION_LOCATORS registry and asserts every entry's duplicateProbe makes it throw (pins the two current locators), plus a second test that feeds a deliberately broken (first-span-on-duplicate) synthetic locator into locatorThrowsOnDuplicate and asserts it is flagged false, proving the guard itself detects the exact regression class this task is about.
5. Verify: bun test (full suite) and bun run typecheck both green; mutation-check by reverting src/core/replace.ts via git apply -R (test file fails - import error) then restoring (passes); separately mutate locatorThrowsOnDuplicate to a tautological `return true` and confirm only the "guard flags a violation" test fails, then restore.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Documented and pinned the throw-on-duplicate locator contract in src/core/replace.ts. MANAGED_REGION_LOCATORS now carries an explicit contract paragraph in its JSDoc, restructured into {locate, duplicateProbe} descriptors, and exports both the registry and a new pure predicate locatorThrowsOnDuplicate for test consumption. test/replace.test.ts adds two regression tests: one iterates the real registry asserting every entry's duplicateProbe makes it throw a LoreError (pins today's two locators), and one feeds a deliberately broken synthetic first-span-on-duplicate locator into the predicate to prove the guard itself catches that exact regression class.

Verification: `bun test` = 1874 pass / 0 fail (47 files); `bun run typecheck` clean. Mutation-check #1: `git apply -R` on src/core/replace.ts's diff (test file left in place) makes the whole test file fail to load (named export not found); re-applying restores 85/85 passing in replace.test.ts. Mutation-check #2: temporarily made locatorThrowsOnDuplicate tautological (`return true`) — exactly the "guard itself flags a violation" test failed while the registry-iterating test still passed; reverted, both green again.
<!-- SECTION:NOTES:END -->

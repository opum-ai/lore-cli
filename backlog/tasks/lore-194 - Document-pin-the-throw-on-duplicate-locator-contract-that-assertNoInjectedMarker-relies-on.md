---
id: LORE-194
title: >-
  Document/pin the throw-on-duplicate locator contract that
  assertNoInjectedMarker relies on
status: To Do
assignee: []
created_date: '2026-07-23 01:00'
labels:
  - codex-review-followup
  - core-replace
dependencies: []
priority: low
type: bug
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-12 integration finding (low) on LORE-162. assertNoInjectedMarker (src/core/replace.ts:245) re-runs managedRanges / MANAGED_REGION_LOCATORS (replace.ts:103-106) to reject a regex/literal replacement whose expansion duplicates a managed-block marker. Its guarantee holds ONLY because each current locator (locateManagedBlock for the index block, locateTaskBlock for lore:tasks) THROWS when its marker appears more than once, even when both copies are well-formed blocks. The registry doc says only that "a new managed block is protected by adding one entry" — it does not state that a locator MUST throw on duplication rather than return the first span. A future locator that silently returns the first span would silently reopen LORE-162 for that marker kind with no existing test failing. Document the throw-on-duplicate requirement on MANAGED_REGION_LOCATORS and pin it with a guard/test. Nothing is broken today; both current locators satisfy the contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The MANAGED_REGION_LOCATORS registry (src/core/replace.ts) documents that every locator must throw when its marker appears more than once (not return the first span), so assertNoInjectedMarker's duplicate-rejection guarantee is explicit rather than incidental.
- [ ] #2 A test (or type-level guard) pins the contract so a future locator that returns a first-span-on-duplicate for a well-formed duplicated marker is caught.
<!-- AC:END -->

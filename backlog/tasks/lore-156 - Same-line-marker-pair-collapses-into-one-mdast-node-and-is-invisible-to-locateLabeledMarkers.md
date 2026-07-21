---
id: LORE-156
title: >-
  Same-line marker pair collapses into one mdast node and is invisible to
  locateLabeledMarkers
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a managed block's begin and end markers are placed on a single line with no intervening blank line (e.g. `<!-- lore:agents:begin --><!-- lore:agents:end -->`), mdast's fromMarkdown collapses them into one top-level `html` node whose trimmed value matches neither the begin nor the end regex used by collectMarkerSpans. locateLabeledMarkers (src/core/managed-block.ts:417-444) then sees 0 begins and 0 ends and returns null — the same signal as "no block yet" — so upsertManagedBlock treats a malformed same-line pair as an absent block and appends a brand-new well-formed block after it, leaving the original malformed pair untouched in the file, instead of failing loud on a detected-but-malformed pair.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calling upsertManagedBlock on content containing a same-line marker pair for the given label (e.g. `<!-- lore:agents:begin --><!-- lore:agents:end -->` with no separating newline) either repairs the pair in place or throws a validation error identifying the malformed same-line markers — it must not silently append a second, duplicate block while leaving the malformed pair in place.
- [ ] #2 A regression test in test/managed-block.test.ts reproduces the same-line marker case and asserts the file does not end up with two block instances (one malformed, one freshly appended) after calling upsertManagedBlock.
<!-- AC:END -->

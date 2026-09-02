---
id: LCLI-368
title: >-
  No corroboration row for lore: published tarballs are never compared against
  the qualification reports
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 14:04'
updated_date: '2026-09-02 22:35'
labels:
  - release
  - evidence
  - provenance
  - gate
dependencies: []
priority: medium
type: bug
ordinal: 495000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opum-cli-e2e's corroboration row — 'every platform's executable digest is identical across independently produced sources' — has three sources on the QUEST side (bundle + receipt + published) and NO EQUIVALENT for lore. Nothing compares lore's published tarballs against anything lore itself produced.

WHY THIS MATTERS NOW RATHER THAN IN PRINCIPLE. On 2026-08-30 I asserted that the packed lore candidate was byte-identical to the published tarball, and it was not: package/bin/lore published e40154bd757d..., candidate 46818b7b6552.... The launcher matched (0259e7748f77...) because it is plain JavaScript copied verbatim; only the COMPILED binary differed — the half that matters, and the half a casual check skips. Bun's --compile is not byte-reproducible across machines (quest-cli, measured), so those could never have matched. I had both facts and asserted the conclusion they contradict; opum-cli-e2e caught it by recomputing rather than accepting. A lore-side corroboration row would have caught it without anyone noticing by hand, which is the entire argument for building one.

THE THIRD SOURCE ALREADY EXISTS AND IS LOAD-BEARING. lore's per-platform qualification report carries package.platformTarballSha256, and the package job RECOMPUTES that digest over the tarball bytes and refuses to assemble on mismatch. So it is not a convenient number chosen for comparison — it already gates lore's own pipeline. Published tarball + qualification report + candidate bundle are three independently produced sources.

TWO MECHANICAL DIFFERENCES from the quest row, both already flagged by opum-cli-e2e and neither a blocker:
- GRANULARITY. lore's digest hashes the TARBALL; quest's corroboration hashes the inner executable (package/bin/quest). Both valid, cannot be mixed in one comparison. lore's row runs at tarball granularity.
- FORMAT. lore emits 'sha256:<hex>'; a bare-64-hex validator would treat it as ABSENT and silently drop to two sources. Their normalizeDigest already accepts both, and now distinguishes unparseable from absent so a malformed value BLOCKS rather than quietly reducing the source count.

opum-cli-e2e has offered to build it and is the right owner — the row lives in their harness. This task is lore's side: confirm the qualification report artifact is retrievable for a published release, and that platformTarballSha256 is present for all six platforms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A corroboration row compares lore's published platform tarballs against the per-platform qualification reports and the candidate bundle, with every digest recomputed from bytes rather than read from a document asserting it
- [ ] #2 The row runs at tarball granularity for lore and is never mixed with quest's executable-granularity comparison in one assertion
- [ ] #3 A source that cannot be produced, or produces an unparseable digest, BLOCKS the row rather than silently reducing the number of sources
- [ ] #4 Proven by a negative control: substituting one platform's tarball for a different build makes the row fail and name that platform and both digests
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 22:35
---
Lore-side scope confirmed and executed live (2026-09-02), not just checked for feasibility:

1. The qualification report artifact IS retrievable for a published release: Release run 33296350640 (v0.3.5, published 2026-08-30) still has all six ladybug-package-qualification-<platform>-33296350640-1 artifacts, non-expired, downloadable via `gh run download`.
2. platformTarballSha256 IS present for all six platforms (darwin-x64/arm64, linux-x64/arm64, win32-x64/arm64) -- confirmed by reading each report JSON directly.

Went further and actually ran the full three-way corroboration by hand, since the artifacts were already in hand: for every platform, recomputed sha256 over the downloaded candidate tarball's real bytes and confirmed it equals the report's platformTarballSha256 (all 6 match), then separately computed sha1 over the same tarball and confirmed it equals `npm view @opum-ai/lore-<platform>@0.3.5 dist.shasum` -- the actual currently-published registry artifact (all 6 match). Published tarball == candidate bundle == qualification report, for real, right now, not asserted.

This closes lore-cli's side. The row itself (opum-cli-e2e's harness, ACs #1-4) is out of scope here -- opum-cli-e2e owns it and has the exact digests above if useful for building it.
---
<!-- COMMENTS:END -->

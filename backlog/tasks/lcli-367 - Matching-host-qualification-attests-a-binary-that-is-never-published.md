---
id: LCLI-367
title: Matching-host qualification attests a binary that is never published
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-30 02:39'
labels:
  - release
  - evidence
  - provenance
  - gate
dependencies: []
priority: high
type: bug
ordinal: 494000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The six 'matching-host package qualification (<platform>)' jobs BUILD THEIR OWN BINARY and qualify that. The 'package' job separately builds the artifacts that are actually published. The job graph proves they are independent: package-qualification needs [setup, verify-versions, ladybug-qualification, ladybug-concurrency-qualification] — NOT the package job — and its step is literally named 'Build, pack, install, smoke, uninstall, and audit'. package then runs with needs: [setup, package-qualification, ...] and builds again; publish ships THAT.

So each platform qualification attests to bytes that never reach the registry.

WHY THIS IS NOW KNOWN TO MATTER RATHER THAN THEORETICAL. quest-cli measured on 2026-08-29 that BUN'S --compile OUTPUT IS NOT BYTE-REPRODUCIBLE ACROSS MACHINES: their first v0.3.0 tag failed with six independent digest mismatches, each platform rebuilding a different binary from the one committed minutes earlier by the same Bun version. lore compiles the same way. The qualified binary and the published binary are therefore demonstrably different artifacts, not merely nominally different ones.

WHAT IS AND IS NOT BROKEN. Nothing fails spuriously, because lore never compares the two digests — unlike quest, whose gate did and correctly went red. Both builds come from the same commit with the same pinned Bun, so they should be functionally equivalent. What is weaker than it reads is the EVIDENCE: 'matching-host package qualification (linux-x64): success' does not mean the published linux-x64 binary was ever executed anywhere. A reader auditing release evidence would reasonably conclude it was.

This is the same shape as five other findings on 2026-08-29 and is recorded in CLAUDE.md as 'a gate validating the claim instead of the artifact' — here the stand-in is a sibling build rather than a document.

quest-cli's own correction generalises and is the design to copy: rebuilding DESTROYS the thing a receipt attests, because the rebuild is not what ships. Assert byte-identity to the committed/emitted artifact, then execute THAT.

THE FIX IS A JOB-GRAPH REORDER, not a small patch, which is why this is filed rather than done in passing: build once, upload the artifacts, then have the per-platform qualification DOWNLOAD and qualify those exact bytes before publish. Today qualification runs BEFORE package, so the order has to inverguard. Size it properly — it touches the release workflow's critical path and the evidence schema that records what was qualified.

Does NOT block 0.3.5, which is already tagged and whose artifacts were separately smoke-installed and verified by digest against the Release run. It does mean the six per-platform 'success' rows in that run describe sibling builds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The binary each matching-host job qualifies is byte-identical to the one the publish job ships, proven by digest rather than by both being built from the same commit
- [ ] #2 The qualification evidence records the digest of the artifact it executed, so a reader can tie a platform verdict to a published tarball
- [ ] #3 Proven by a negative control: substituting a different binary for the artifact under test makes the qualification fail and name the digest mismatch
- [ ] #4 The release runbook states which bytes each qualification row covers, so a 'success' row is not read as covering the published artifact when it does not
<!-- AC:END -->

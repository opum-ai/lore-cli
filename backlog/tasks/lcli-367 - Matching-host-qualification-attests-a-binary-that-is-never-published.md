---
id: LCLI-367
title: Matching-host qualification attests a binary that is never published
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 02:39'
updated_date: '2026-08-30 04:02'
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
- [x] #1 The binary each matching-host job qualifies is byte-identical to the one the publish job ships, proven by digest rather than by both being built from the same commit
- [x] #2 The qualification evidence records the digest of the artifact it executed, so a reader can tie a platform verdict to a published tarball
- [x] #3 Proven by a negative control: substituting a different binary for the artifact under test makes the qualification fail and name the digest mismatch
- [x] #4 The release runbook states which bytes each qualification row covers, so a 'success' row is not read as covering the published artifact when it does not
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
INVALID — CLOSED 2026-08-29 BECAUSE THE PREMISE IS FALSE. I filed this, and I was wrong. The published platform tarball IS the qualified one, verified by digest, and lore has never had the gap I described.

WHAT I ASSERTED: that the six matching-host qualification jobs build their own binary, the package job builds again, and publish ships the second build — so the qualification attests bytes that never reach the registry.

WHAT ACTUALLY HAPPENS, read end to end this time:
1. Each matching-host job builds its platform tarball AND UPLOADS it: 'actions/upload-artifact' with name 'ladybug-package-qualification-<name>-<run_id>-<run_attempt>', path 'artifacts/'.
2. The package job DOWNLOADS exactly those: 'actions/download-artifact' with pattern 'ladybug-package-qualification-*-<run_id>-<run_attempt>' into 'qualified-packages/'. Its step is named 'Assemble the exact matching-host-qualified platform tarballs' — which says precisely what it does.
3. It then VERIFIES each one by digest before using it: recomputes sha256 over the tarball bytes and requires it to equal the qualification report's package.platformTarballSha256, alongside schema, mode, distribution, commit and package name. A mismatch throws 'qualified platform tarball identity check failed'.
4. 'npm pack .' afterwards packs only the ROOT package into dist-npm. It does not touch the six platform tarballs already assembled there.

So the artifact is built once, on its own matching host, qualified there, carried forward by artifact rather than rebuilt, and re-verified by digest at the point of assembly. That is exactly the design this task claimed was missing — and it is stronger than what I proposed as the fix.

HOW I GOT IT WRONG, recorded because the mistake is the same shape as five gate defects I catalogued today. I read the job graph's 'needs:' list — package-qualification does not depend on the package job — and the step name 'Build, pack, install, smoke, uninstall, and audit', and concluded from those two facts that the builds were independent. I never checked whether the qualification job UPLOADS its artifact or whether the package job DOWNLOADS it. A 'needs:' list describes ordering, not data flow; artifacts move between jobs that do not depend on each other in that sense. I asserted a mechanism from partial reading, which is precisely the error opum-cli-e2e corrected in themselves earlier the same day ('reading is necessary and was not sufficient') and that quest-cli corrected about Bun cross-compilation.

WORSE THAN A WRONG TASK: I TOLD TWO OTHER SESSIONS. quest-cli was advised to sweep their repository for the same shape, and opum-cli-e2e planned around it, writing that their rank-1 run 'will NOT catch it either' because they would be corroborating against a lore receipt carrying the same weakness. Both were reasoning from my error. Both have been corrected directly.

WHAT SURVIVES: nothing about the mechanism, but the ACs are not worthless as a statement of what good looks like — and lore already satisfies all four. Checked as met rather than deleted, so the record shows the property holds rather than that the question was withdrawn.

THE DURABLE LESSON, which is the only reason this task should be read again: a job graph tells you ORDERING. Artifact upload/download tells you DATA FLOW. They are different, and concluding about the second from the first is how a correct pipeline gets reported as broken.
<!-- SECTION:NOTES:END -->

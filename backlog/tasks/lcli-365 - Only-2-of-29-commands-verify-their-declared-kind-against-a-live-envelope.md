---
id: LCLI-365
title: Only 2 of 29 commands verify their declared kind against a live envelope
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-30 01:17'
labels:
  - manifest
  - contract
  - test-coverage
  - gate
dependencies: []
priority: medium
type: bug
ordinal: 492000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/help.test.ts's cross-check was named 'each command's declared kind matches the live handler's emitted kind'. It does not do that and never did. Its golden map is TRANSCRIBED BY HAND from each handler's kind: literal; nothing in it runs a handler or reads an emitted envelope. The name has been corrected in place, but the coverage gap it was concealing is real and is this task.

What the transcription DOES catch, and why it is worth keeping: one-sided drift between two independent documents — a manifest entry hand-edited or left stale against the handler source. That is LCLI-350's exact failure, so the test earns its place.

What it CANNOT catch: a handler whose kind: literal changes. The manifest and the golden then go stale TOGETHER, agree with each other, and pass. Two documents agreeing prove nothing about what the command actually emits. This is the 'gate validating the claim instead of the artifact' shape recorded in CLAUDE.md, and it fails GREEN — the most confident possible false clear.

Measured, not estimated: 'expect(envelope.kind).toBe(manifest.kind)' against a REAL envelope appears exactly twice in the suite, for init and new (test/cli.test.ts). The manifest declares 29 commands. So 27 of 29 are covered only by the hand transcription.

This is the same class quest-cli hit with QCLI-151 (instructions declared one envelope kind while the CLI emitted three) and that LCLI-350 already hit once here with agent.profiles. It has bitten this family twice; the gate that would catch it a third time does not exist.

Design note: running all 29 commands in a unit test is not obviously right — many need fixtures, and the docker e2e already drives the real binary. Two candidate approaches, decide explicitly:
(a) derive the golden at test time by invoking each command's handler with a minimal fixture and reading the emitted kind, replacing the transcription entirely;
(b) leave the transcription as the manifest-drift check it actually is, and add live kind assertions to the docker e2e for every command that already has a case there — the harness runs the real binary and most commands already appear.
(b) is likely cheaper and covers more commands honestly; (a) removes the transcription's staleness risk at the source. Neither should be chosen without checking how many commands the e2e already exercises.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every command in the manifest has its declared kind verified against a kind actually emitted by running that command, not against a transcription
- [ ] #2 The verification derives the kind at check time rather than reading it from any committed document, per CLAUDE.md's bind-on-content rule
- [ ] #3 Proven by a negative control: changing one handler's emitted kind without touching the manifest makes the check fail and name that command
- [ ] #4 If the hand-transcribed golden is retained, its name and comment state exactly what it covers and what it does not, so a pass is never read as live coverage
<!-- AC:END -->

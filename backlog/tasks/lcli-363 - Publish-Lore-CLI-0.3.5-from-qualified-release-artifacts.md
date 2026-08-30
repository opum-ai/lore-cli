---
id: LCLI-363
title: Publish Lore CLI 0.3.5 from qualified release artifacts
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-30 00:07'
updated_date: '2026-08-30 00:09'
labels:
  - release
  - quest
  - pairing
  - npm
dependencies:
  - LCLI-356
priority: high
type: task
ordinal: 490000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish 0.3.5 to close the live lore/quest pairing break. Published lore 0.3.4 carries a frozen SUPPORTED_QUEST_VERSIONS=[0.2.7,0.2.8] and refuses the published quest 0.2.9, so as observed on 2026-08-28 the two current releases of the pair could not be used together at all — every tracker-touching command exited 6.

The code is done and merged: dev a99391d aligns all seven manifests and the root exact optional-dependency pins at 0.3.5 and records the candidate in CHANGELOG and docs/reference/lore-cli-release-truth.md. What remains is mechanical release execution per docs/runbooks/release-publishing.md section 3 steps 4-6, and the npm publish itself REQUIRES INTERACTIVE 2FA AND EXPLICIT OWNER AUTHORIZATION — no agent can complete it.

Already qualified: opum-cli-e2e ran the full 407-row matrix against the 0.3.5 packed candidate and the published quest 0.2.9 and reported FIXED 11 / 400 PASS (evidence commit 67945ca). That closed LCLI-356 AC#5 on rank-2 evidence.

Contents beyond LCLI-356: LCLI-357 (scaffold mkdocs generated a docs/tags.md that lore validate --strict rejected), LCLI-361 (docs/index.md no longer names a version), and the LCLI-358.1-.5 lore init onboarding rebuild.

Version choice 0.3.5 rather than 0.4.0 was confirmed with the product owner on 2026-08-29, following this repository's own precedent — 0.3.3 shipped an '### Added' section as a patch — despite five feat(init) commits and a changed 'lore init --tracker quest' outcome being a defensible minor-bump argument.

Do NOT publish a locally packed tarball. The runbook is explicit: the Release workflow artifacts are the qualified release inputs. A local pack was produced during this work for opum-cli-e2e qualification only and must never reach the registry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dev is promoted to main, the full main CI matrix is green, and that exact verified commit is tagged v0.3.5 with the tag pushed
- [ ] #2 Release is dispatched with publish:false on the tag; its npm-packages artifact is downloaded and the seven .tgz files are listed and checksummed
- [ ] #3 Those exact workflow artifacts — never a locally rebuilt tarball — are published with interactive 2FA under explicit owner authorization: all six platform packages first, @opum-ai/lore last
- [ ] #4 Every name@version is verified present in the registry and a clean 'npx @opum-ai/lore@0.3.5 --version' in a fresh temporary directory reports 0.3.5
- [ ] #5 docs/reference/lore-cli-release-truth.md is updated from candidate to released with the immutable tag, workflow run, registry, and install evidence, and a non-draft non-prerelease GitHub Release exists for v0.3.5
- [ ] #6 opum-cli-e2e re-runs the 407-row matrix against the published 0.3.5 at rank-1 (registry install), closing LCLI-363 on published-artifact evidence
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 00:09
---
MECHANICS FROM THE 0.3.4 PRECEDENT (LCLI-355), recorded before execution so the operator is not surprised mid-release. The publish is TWO PHASES, not one, and my AC list above collapses them — read this alongside it.

Phase A: publish the artifacts. The Release workflow's npm-packages artifact holds the seven .tgz files. Publish those exact files — never a locally rebuilt tarball, and never 'npm pack' output. Order: all six platform packages first, @opum-ai/lore LAST, so the launcher never resolves before its binary exists. At 0.3.4 these landed under a 'release-candidate' dist-tag rather than 'latest'.

Phase B: move the 'latest' dist-tag, and this is where 0.3.4 stalled. Every dist-tag move needs a fresh OTP:

  npm dist-tag add @opum-ai/lore-darwin-arm64@0.3.5 latest --otp=<code>
  npm dist-tag add @opum-ai/lore-darwin-x64@0.3.5   latest --otp=<code>
  npm dist-tag add @opum-ai/lore-linux-arm64@0.3.5  latest --otp=<code>
  npm dist-tag add @opum-ai/lore-linux-x64@0.3.5    latest --otp=<code>
  npm dist-tag add @opum-ai/lore-win32-arm64@0.3.5  latest --otp=<code>
  npm dist-tag add @opum-ai/lore-win32-x64@0.3.5    latest --otp=<code>
  npm dist-tag add @opum-ai/lore@0.3.5              latest --otp=<code>

At 0.3.4 an agent probe hit EOTP ('this operation requires a one-time password'). The correct handling was recorded there and should be repeated: FAIL CLOSED after exactly one attempt. No retry loop, no browser or MFA interaction, no attempt to source a code. The operator runs these; an agent's only job afterwards is read-only verification.

Verification after Phase B, read-only:
  npm view @opum-ai/lore dist-tags          # and each of the six platform packages
Expect latest=0.3.5 on all seven.

PRECONDITION WORTH REPEATING FROM 0.3.4: before moving any tag, prove the registry artifacts byte-match the qualified candidate — compare npm_shasum and npm_integrity for each of the six platform packages against the Release run's provenance. 0.3.4 did exactly this and recorded all six digests. A dist-tag move is the point of no return for users; verify the bytes first.

Also still required and easy to forget: a non-draft, non-prerelease GitHub Release for v0.3.5 at the qualified source commit (AC#5 above), and the release-truth record flipped from 'candidate' to 'released'. The release-truth entry I wrote today says explicitly 'Not yet published' — that sentence must be replaced, not merely supplemented, or the bundle's single source of published-version truth will be lying.
---
<!-- COMMENTS:END -->

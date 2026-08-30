---
id: LCLI-363
title: Publish Lore CLI 0.3.5 from qualified release artifacts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-30 00:07'
updated_date: '2026-08-30 00:48'
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
- [x] #1 dev is promoted to main, the full main CI matrix is green, and that exact verified commit is tagged v0.3.5 with the tag pushed
- [x] #2 Release is dispatched with publish:false on the tag; its npm-packages artifact is downloaded and the seven .tgz files are listed and checksummed
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

author: @claude
created: 2026-08-30 00:13
---
AC#1 DONE, 2026-08-29.

Promotion: PR #457 merged dev -> main as fda122cace9451389bcf0377fe7bde554946f04e.
Full main CI matrix on that exact commit: run 33282621112, completed/SUCCESS.
Tagged v0.3.5 at fda122c (annotated, tag object 7bddce5de83ec01a14acc6b44a85d0ffa7998eca) and pushed. The head was re-read and byte-compared against the CI-verified sha before tagging, rather than assuming main had not moved.

Independent verification of main's tree before the tag, not taken on trust:
  all seven manifests            0.3.5
  optionalDependencies           every pin 0.3.5 (single distinct value)
  package.json bin.lore          bin/lore.cjs   (runbook step 1's flip, correctly NOT reverted)

AC#2 IN FLIGHT: Release workflow dispatched on the v0.3.5 tag with publish:false — run 33282804802. When it completes, download ONLY its npm-packages artifact and list/checksum the seven .tgz files.

AC#3 IS THE OWNER'S AND CANNOT BE DONE BY AN AGENT. It needs npm login plus a fresh OTP per operation. See the mechanics comment above for the exact command set and for the fail-closed rule proven at 0.3.4.

Release notes for the GitHub Release (AC#5) are drafted and ready to publish alongside the tag.
---

author: @claude
created: 2026-08-30 00:19
---
AC#2 DONE, 2026-08-29. Release run 33282804802 on tag v0.3.5 with publish:false completed SUCCESS. Its verify-versions job — which gates build and asserts all seven versions, the optionalDependencies pin, and license/author/repository metadata — passed, so the manifest alignment is confirmed by the workflow independently of my own check.

npm-packages artifact downloaded. All seven .tgz present, each self-reporting 0.3.5 from its own package/package.json inside the tarball (not merely by filename):

  opum-ai-lore-0.3.5.tgz                      9447  afad920523b8636f5be62044b6873b468e16212cf77100fc85080f8a94e1c86a
  opum-ai-lore-darwin-arm64-0.3.5.tgz     29707805  b956a56de8d12c44a4d28de48d5b28ebf92e144ff06d1d9fcb14b0f54b29f900
  opum-ai-lore-darwin-x64-0.3.5.tgz       32658319  b802571acad811982ae8fceeb5fa67600e58228cab64186b1bf3c0365056e788
  opum-ai-lore-linux-arm64-0.3.5.tgz      46295162  7fb51afc80932c3587bc5b28ba2805aedb19965e9ccec15dafd3591fb33c5fa9
  opum-ai-lore-linux-x64-0.3.5.tgz        46512850  679be3e1c4e7ba288f8dbf6cd31bac6c10c6100ff33e30b7c788df94509e4e1c
  opum-ai-lore-win32-arm64-0.3.5.tgz      38337674  34172042c26e3cd2b2ec14375e4dd3811a10c46fbd8ab7b0687edb206ae3ccc9
  opum-ai-lore-win32-x64-0.3.5.tgz        39384867  76c49557572d0e8a184841945eb553be2b4934666f122c8f9cfc0f3dbc69a969

Staged at (this host, ephemeral scratch — re-download from the run if it is gone):
  /private/tmp/claude-501/-Volumes-external-repos-lore-cli/1d74129c-dcf8-4437-a6d6-0d4fd1908282/scratchpad/release-0.3.5/

These are the qualified release inputs. Publish THESE FILES. Do not run npm pack, and do not publish the local candidate pack built earlier for opum-cli-e2e qualification — its digests (4ebd7ab71a72..., 065b6e65c1ca...) deliberately DO NOT match the rows above, because it was hand-packed from a local bun build rather than produced by the workflow. If a digest you are about to publish matches a candidate-pack value rather than a row above, stop.

AC#3 is now the only thing standing between this and a published release, and it is the owner's: npm login plus a fresh OTP per operation. AC#5's GitHub Release is deliberately NOT created yet — the drafted notes tell readers to upgrade, which is not true until the registry has it.
---

author: @claude
created: 2026-08-30 00:48
---
PRE-PUBLISH SMOKE ON THE REAL WORKFLOW ARTIFACTS, 2026-08-29. Done BEFORE publication deliberately: a broken artifact is cheap to catch now and expensive once it is on the registry and users have resolved it.

These are the Release run 33282804802 artifacts — the exact bytes to publish — not the hand-packed candidate. Installed root + darwin-arm64 into a throwaway prefix:
  npm i <darwin-arm64>.tgz <root>.tgz   -> 'added 2 packages'
  lore --version                        -> 0.3.5, exit 0
  lore help                             -> exit 0
  lore --json help                      -> kind help.manifest, 29 commands

BOTH DEFECTS THIS RELEASE EXISTS TO FIX ARE VERIFIED FIXED ON THE SHIPPING ARTIFACT, against the real installed quest 0.2.9:
  LCLI-356 (the pairing break)
    quest --version                          -> 0.2.9
    quest init --json                        -> exit 0
    lore init --yes --tracker quest --json   -> exit 0
    lore orphans --json                      -> exit 0    (published 0.3.4 exits 6 here)
    lore tasks <unknown-id>                  -> not_found (AC#3; was validation)
  LCLI-357 (scaffold rejected by lore's own strict gate)
    validate --strict before scaffold        -> exit 0
    scaffold mkdocs --json                   -> exit 0
    validate --strict after scaffold         -> exit 0    (published 0.3.4 exits 6 here)

CROSS-PLATFORM COVERAGE, recorded so nobody wonders whether that smoke was darwin-only. It was — but the Release run separately qualified ALL SIX platform packages on their own matching hosts (darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64), plus 'package + install-sanity (dry-run)' and the verify-versions gate. Neither covers the other: CI cannot run the quest interop repro, and this host cannot execute five of the six binaries. The 'publish (npm, OIDC trusted publishing)' job shows SKIPPED, which is the publish:false input behaving correctly and is the evidence the run touched no registry. If a future run shows that job as success, the release was published by the workflow rather than interactively, which is not the sanctioned path while LCLI-278 is open.

This DOES NOT check AC#4. A local install of the same bytes is evidence about the ARTIFACT, not about the registry; AC#4's clean 'npx @opum-ai/lore@0.3.5 --version' cannot run until the registry has it.

Artifacts remain staged at the ephemeral scratch path recorded earlier. If that directory is gone, re-download from run 33282804802 and re-verify the seven sha256 rows before publishing.
---
<!-- COMMENTS:END -->

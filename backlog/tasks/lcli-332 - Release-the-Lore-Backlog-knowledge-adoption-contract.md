---
id: LCLI-332
title: Release the Lore Backlog knowledge-adoption contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-14 18:04'
updated_date: '2026-08-16 13:52'
labels:
  - release
  - quest
  - backlog
  - migration
  - knowledge
  - quest-0.1-blocker
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-331
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - package.json
  - bun.lock
  - npm/darwin-arm64/package.json
  - npm/darwin-x64/package.json
  - npm/linux-arm64/package.json
  - npm/linux-x64/package.json
  - npm/win32-arm64/package.json
  - npm/win32-x64/package.json
  - CHANGELOG.md
  - test/ladybug-package-qualification.test.ts
  - benchmark/ladybug/fixtures/v1/small.json
  - benchmark/ladybug/fixtures/v1/large.json
  - test/ladybug-benchmark-report.test.ts
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/log.md
priority: high
type: task
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the first Lore release that contains the public Backlog knowledge-adoption contract required by Quest full-fidelity migration. Publication remains a separate owner-authorized action and must not be inferred from implementation completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release version is selected according to Lore semver policy after checking the current published version
- [ ] #2 All platform artifacts contain the same knowledge-adoption manifest and behavior
- [ ] #3 Clean-install and migration smoke tests pass against the immutable release artifacts
- [ ] #4 Publication occurs only with explicit owner authorization and immutable release evidence is recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the live npm registry baseline and inspect the prior 0.2.0 release metadata/workflow path.
2. Bump all seven package versions and root optional-dependency pins to 0.3.0; update release-facing authored documentation and changelog without altering historical evidence.
3. Run release-relevant unit, build, packaging, Lore, and diff gates; obtain independent review.
4. Deliver the qualified release-preparation commit to dev, promote the verified commit to main, tag it, and run the Release workflow with publish disabled.
5. Hand the immutable tarballs and verification evidence to the owner for 2FA interactive publication; record registry/install/release evidence and settle LCLI-332.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner authorization recorded 2026-08-16: release scope including dev-to-main promotion, tag, seven public npm packages, and GitHub Release; target version 0.3.0; owner-authorized interactive publication path; owner performs external approval and npm 2FA publication. Automated publish remains prohibited while LCLI-278 is unresolved.

Release-preparation validation on release/0.3.0-preparation: live npm registry reports @opum-ai/lore latest 0.2.0; additive LCLI-331 command family supports 0.3.0. Seven manifest/six exact-pin comparison passed. Targeted release/adoption suite passed 72 tests with 1 expected Windows-only skip. Full bun test, typecheck, lint, build, compiled dist/lore --version (0.3.0), all seven explicit npm publish --dry-run checks, strict lore validate/check, and git diff --check passed. Bun install --frozen-lockfile could not run because this environment denies Bun temp-file creation even with a permitted temporary directory; the existing lockfile was instead verified by the version/pin comparison and all test/build/package gates.

Delivery and immutable qualification complete: PR #383 merged to dev as d8f780d after all required checks; PR #384 promoted the exact dev merge to main as 05404f7 after all required checks. Lightweight tag v0.3.0 resolves to 05404f7. Release workflow run 31950668955 on v0.3.0 completed successfully with publish=false; all qualification, six matching-host package jobs, acceptance evidence, package/install-sanity passed, and OIDC publication was skipped. npm-packages artifact 9264624493 is unexpired through 2026-11-14 and was downloaded unchanged to /private/tmp/lcli-332-0.3.0-IXVNsa. It contains exactly seven 0.3.0 tarballs; SHA-256 inventory is retained in the campaign handover. Pending owner action: authenticate with npm 2FA and publish those exact downloaded platform tarballs first, root launcher last; then provide publication results for registry/install/GitHub Release evidence.
<!-- SECTION:NOTES:END -->

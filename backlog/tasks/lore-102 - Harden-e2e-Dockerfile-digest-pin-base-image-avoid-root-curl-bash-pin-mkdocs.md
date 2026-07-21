---
id: LORE-102
title: 'Harden e2e Dockerfile: digest-pin base image, avoid root curl|bash, pin mkdocs'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docker/e2e/Dockerfile:11 pins the base image only by the mutable tag `oven/bun:1.2.23` (no `@sha256` digest), so the same tag can silently resolve to different bytes over time and break the harness's claim to be a hermetic, reproducible E2E environment. The NodeSource setup script is fetched with `curl -fsSL https://deb.nodesource.com/setup_22.x | bash -` and executed before `USER bun` is set (line 81), i.e. it runs as root with no integrity check on the downloaded script. Separately, mkdocs and mkdocs-material are installed via floating ranges (`mkdocs>=1.6`, `mkdocs-material>=9`), so a new upstream release can change the image's build output without any corresponding change to this Dockerfile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `FROM oven/bun:1.2.23` line is pinned by an immutable `@sha256:` digest (in addition to or instead of the mutable tag), so rebuilding the image from an unchanged Dockerfile always resolves to the same base image bytes.
- [ ] #2 The NodeSource setup script is no longer piped directly into a root shell without verification (e.g. download-then-verify-then-execute, or an equivalent integrity check is added before execution).
- [ ] #3 mkdocs and mkdocs-material are installed at pinned exact versions rather than open-ended `>=` ranges, so the image's Python doc-tooling versions are reproducible across rebuilds.
<!-- AC:END -->

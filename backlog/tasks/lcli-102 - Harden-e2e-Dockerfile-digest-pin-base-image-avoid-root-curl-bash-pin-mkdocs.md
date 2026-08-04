---
id: LCLI-102
title: 'Harden e2e Dockerfile: digest-pin base image, avoid root curl|bash, pin mkdocs'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - build-runtime
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 The `FROM oven/bun:1.2.23` line is pinned by an immutable `@sha256:` digest (in addition to or instead of the mutable tag), so rebuilding the image from an unchanged Dockerfile always resolves to the same base image bytes.
- [x] #2 The NodeSource setup script is no longer piped directly into a root shell without verification (e.g. download-then-verify-then-execute, or an equivalent integrity check is added before execution).
- [x] #3 mkdocs and mkdocs-material are installed at pinned exact versions rather than open-ended `>=` ranges, so the image's Python doc-tooling versions are reproducible across rebuilds.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC1: digest-pin FROM oven/bun:1.2.23 by resolving its manifest-list sha256 via Docker Hub registry API (cross-checked with docker pull), appending @sha256:<digest>.
2. AC2: replace 'curl ... | bash -' with download-to-file, verify sha256 (pinned ARG, computed from the real NodeSource setup_22.x script), then execute the verified file as root before USER bun is set.
3. AC3: pin mkdocs and mkdocs-material to exact versions (current latest satisfying existing >= floors: mkdocs==1.6.1, mkdocs-material==9.7.7) instead of open ranges.
4. Verify: resolve digest two independent ways, verify sha256 of fetched script is stable across two fetches, attempt a real 'docker build' of the image to confirm the Dockerfile is valid and the verify+install steps succeed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified with real docker builds (docker 29.6.1, docker daemon available in this environment):
- AC1: resolved oven/bun:1.2.23's manifest-list digest two independent ways — (a) Docker Hub registry v2 API with an anonymous pull token, (b) 'docker pull oven/bun:1.2.23 && docker inspect --format={{index .RepoDigests 0}}'. Both agree: sha256:6ebf306367da43ad75c4d5119563e24de9b66372929ad4fa31546be053a16f74. 'docker build --check' against the edited Dockerfile resolves the pinned FROM with no warnings.
- AC2: fetched the live https://deb.nodesource.com/setup_22.x script twice independently, confirmed byte-identical (diff clean) and stable sha256 575583bbac2fccc0b5edd0dbc03e222d9f9dc8d724da996d22754d6411104fd1, pinned that as the ARG default. Built a standalone copy of the Dockerfile's first RUN layer with docker build: log shows '/tmp/nodesource-setup.sh: OK' from sha256sum -c, followed by the real NodeSource install producing node v22.23.1 / npm 10.9.8. Negative control: same layer rebuilt with a corrupted ARG hash fails closed with 'sha256sum: WARNING: 1 computed checksum did NOT match' / '/tmp/nodesource-setup.sh: FAILED' and a non-zero docker build exit — proves the check is load-bearing, not a no-op.
- AC3: pinned mkdocs==1.6.1 / mkdocs-material==9.7.7 (current PyPI latest satisfying the prior >=1.6 / >=9 floors). Same build layer confirms 'mkdocs, version 1.6.1' and mkdocs-material 'Version: 9.7.7' actually installed.
- Full-image sanity: ran a complete 'docker build -f docker/e2e/Dockerfile .' end to end (all 11 layers) — succeeded, including the downstream backlog/lore compile stages, proving the AC1-3 changes don't break the rest of the pipeline. Test images removed after verification (docker rmi).
Scope: only docker/e2e/Dockerfile touched, per task's expected-file list.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened docker/e2e/Dockerfile per the codex-review finding: (1) FROM oven/bun:1.2.23 is now digest-pinned to @sha256:6ebf306367da43ad75c4d5119563e24de9b66372929ad4fa31546be053a16f74 (resolved via the Docker Hub registry API and cross-checked with 'docker pull'+'docker inspect'). (2) The NodeSource setup_22.x script is downloaded to a file, verified via 'sha256sum -c' against a pinned ARG (575583bb...11104fd1, taken from two independent live fetches), and only then executed as root — no more blind curl|bash. (3) mkdocs and mkdocs-material are pinned to exact versions (1.6.1 / 9.7.7, the current releases satisfying the prior >= floors) instead of open ranges. Verified with real docker builds: digest resolution cross-checked two ways, sha256 verification proven both to pass on the real script and to fail-closed on a corrupted hash (negative control), pinned mkdocs/mkdocs-material versions confirmed installed, and a full end-to-end 'docker build' of the whole Dockerfile succeeded. Only docker/e2e/Dockerfile was modified.
<!-- SECTION:FINAL_SUMMARY:END -->

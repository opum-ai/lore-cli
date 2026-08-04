---
id: LCLI-302
title: >-
  Native LadybugDB backend never activates in the compiled/published lore binary
  -- every graph-family command silently falls back to the reference index
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:23'
updated_date: '2026-08-04 14:34'
labels:
  - ladybugdb
  - packaging
  - release
  - native-addon
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
modified_files:
  - .github/workflows/release.yml
  - src/core/retrieval.ts
  - src/core/workspace-retrieval.ts
  - test/indexed-retrieval.test.ts
  - test/ladybug-benchmark-workflow.test.ts
  - test/ladybug-package-qualification.test.ts
  - test/release-workflow.test.ts
  - test/workspace-retrieval.test.ts
priority: high
type: bug
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The real, globally npm-installed `lore` v0.1.0 binary should build and reuse a persistent native LadybugDB projection per ADR-0018, for graph/query/context/path/impact/snapshot/changed/provenance/explorer.

## Observed
During a comprehensive live E2E pass, dozens of real invocations of `path`/`impact`/`graph --workspace`/etc left `.lore/cache/graph/ladybug/1/generations/` permanently empty -- every command silently fell back to the in-memory reference backend, with zero user-visible signal (no warning, no non-zero exit, no --json field). A fresh empty `.building-<token>-0` staging dir is created and abandoned on every single invocation.

Root-caused: `@opum-ai/lore-darwin-arm64`'s package (installed under the global `@opum-ai/lore` npm install) contains only a compiled Mach-O binary (`bun build --compile`) + package.json -- no adjacent node_modules for its dynamic native `@ladybugdb` addon import to resolve/dlopen against at runtime. Running the identical source (same v0.1.0, same @ladybugdb/core-darwin-arm64@0.19.0) via `bun run` directly from the lore-cli dev checkout against the same target repo succeeds completely -- a real ~8.2MB projection.lbdb + index.json is built and promoted. This isolates the defect to the compiled binary's packaging, not the algorithm, native package, platform, or target bundle.

Also confirmed the compiled binary contains zero occurrences of `LORE_INTERNAL_PACKAGE_QUALIFICATION` (the source-level env hook meant to force policy:'indexed' with no silent fallback, for exactly this kind of diagnosis) even though it's present in the shipped reference src/cli.ts copy under the same npm package -- a version/build skew between the compiled binary and the "reference" source files shipped alongside it.

## Why it matters
This silently defeats ADR-0018's entire persistent-index/performance architecture in the actual distributed v0.1.0 release artifact -- not a lore-test-specific quirk. No warm/cold timing difference was measurable (~17ms noise) across dozens of calls. Correctness is unaffected (fallback output is correct), but performance and the whole M6/M7/M8 roadmap this backend exists for gets zero benefit for any real user of the published package.

## Repro
    cd <any lore bundle> && rm -rf .lore/cache/graph/ladybug
    lore impact <some-concept-id> --kind concept --direction inbound --json > /dev/null
    find .lore/cache/graph/ladybug -type f | wc -l   # -> 0, expected > 0
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A native platform package (e.g. @opum-ai/lore-darwin-arm64) ships whatever the native @ladybugdb addon needs to resolve at runtime from a bun build --compile binary, OR the packaging strategy changes so native module resolution works
- [x] #2 After the fix, a real generation appears under .lore/cache/graph/ladybug/1/generations/ after a path/impact/graph call against a real bundle on a supported platform
- [x] #3 If native activation is genuinely unavailable (e.g. a truly unsupported platform), the CLI surfaces a clear, user-visible signal rather than a silent, indistinguishable fallback
- [x] #4 LORE_INTERNAL_PACKAGE_QUALIFICATION (or an equivalent diagnostic hook) works against the actual compiled/published binary, not just source
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the matching-host package qualification artifact the single source of each release platform tarball; stop assembling publishable packages from separately cross-compiled Ubuntu artifacts. 2. In the package job, download the six exact qualification artifacts, validate each report's platform/version/provenance and SHA-256 against its tarball, then copy those byte-identical platform tarballs into the publish set and pack only the root launcher there. 3. Surface a sanitized advisory whenever automatic repository or workspace retrieval falls back because native indexing is unsupported or failed, while keeping forced indexed qualification fail-closed and preserving successful indexed output. 4. Add regression tests for release artifact lineage, hash enforcement, forced-indexed compiled-binary evidence, and repository/workspace fallback advisories. 5. Run focused tests, a real matching-host package qualification against the compiled/packed/installed binary, full repository gates, diff hygiene, and adversarial self-review; finalize only with objective evidence for all four criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore research at dev 405606891a227a9012b87de625d909eba56fec6b found doc-11 as the sole pre-existing dirty artifact, all six campaign tasks live and dependency-free, and LCLI-302 eligible for sequential wave 1. Root cause: package-qualification compiles, packs, installs, and forces indexed retrieval on a matching host, but package later downloads the separate build job's cross-compiled binaries and repacks those instead. A Darwin binary built on Ubuntu cannot embed the matching Darwin @ladybugdb addon present only on the macOS qualification runner, so qualification and publication prove different bytes. Current auto retrieval also deliberately discards native failure warnings before reference fallback, reproducing the silent-user-signal defect.

Implemented the verified-but-undelivered LCLI-302 fix. Release packaging now consumes the exact platform tarballs produced by matching-host package qualification instead of discarding them for separately cross-compiled Ubuntu binaries. The package job validates qualification schema/mode, platform identity, current commit, package name, and the report's sha256-prefixed tarball digest before copying any platform artifact into the publish set; the redundant cross-build job is removed. Repository and workspace automatic retrieval now emit one sanitized advisory when native indexing is unsupported or fails, while forced indexed policy still fails closed and native loader details remain redacted.

Objective evidence on macOS ARM64: the exact package qualification runner compiled, packed, globally installed, project-installed, and executed @opum-ai/lore plus @opum-ai/lore-darwin-arm64 through both the Node launcher and relocated standalone binary with LORE_INTERNAL_PACKAGE_QUALIFICATION=require-indexed. Report /tmp/lcli-302-ladybug-package-qualification-darwin-arm64.json records schema lore.ladybug-package-qualification/3, Bun 1.3.14, embeddedNativeIndexVerified true, databaseCreated true, executableEvidence true, probeOutcome pass, commandOutputsStable true, installedCoreAbsent true, globalLauncherSmoke true, all eight cleanup fields true, and platform tarball digest sha256:94f82d18a4d97eced2ef929be4d5b29e542c5b0165664a268a5ec907ad0f9215. The first sandboxed run reached the final uninstall audit after passing both executable smokes but npm uninstall timed out at 300000ms; the exact rerun with approved registry access completed cleanly.

Verification: focused suite 70/70 with 343 expectations; full suite 2,434/2,434 with 8,144 expectations; npm run typecheck passed; npm run lint passed across 186 files; actionlint passed for release.yml; git diff --check passed. Adversarial self-review caught and fixed an initial bare-hex versus sha256:-prefixed digest mismatch before final verification, confirmed the package job downloads only matching-host qualification artifacts, and confirmed fallback tests preserve stdout, emit the advisory, and redact private native errors. During the wave, unrelated LCLI-308 work advanced dev from 405606891a227a9012b87de625d909eba56fec6b to bb33bd38a9fec3b582944209ee240d5853dbce76 and committed the initial tracker/task dispatch; its source/docs paths do not overlap this eight-file implementation. No commit or remote action was authorized for LCLI-302, so acceptance criteria remain unchecked and the task remains In Progress pending explicit local commit authority.

Authorized local delivery completed in source commit 973075a (fix(release): publish qualified native binaries), containing only the eight verified workflow/source/test files. No push or remote mutation was performed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the native-package release gap by publishing the exact platform tarballs that pass matching-host forced-indexed qualification, with commit/package/SHA identity checks, and made automatic repository/workspace native fallback emit a sanitized advisory. Verified with a real macOS ARM64 compiled, packed, installed launcher and standalone qualification that created a Ladybug generation and passed cleanup; 2,434 tests, typecheck, lint, actionlint, and diff hygiene also passed. Delivered locally in source commit 973075a; no remote action occurred.
<!-- SECTION:FINAL_SUMMARY:END -->

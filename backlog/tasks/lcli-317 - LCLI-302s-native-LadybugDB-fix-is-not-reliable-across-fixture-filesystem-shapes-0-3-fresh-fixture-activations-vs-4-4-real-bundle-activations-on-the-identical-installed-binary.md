---
id: LCLI-317
title: >-
  LCLI-302's native LadybugDB fix is not reliable across fixture/filesystem
  shapes -- 0/3 fresh-fixture activations vs 4/4 real-bundle activations on the
  identical installed binary
status: To Do
assignee: []
created_date: '2026-08-05 11:56'
labels:
  - ladybug
  - graph
  - reliability
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.1 comprehensive E2E re-verification
    pass (branch e2e/v0.1.1-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v0.1.1.md section 5 (reconciliation
    note) and section 7 defect H
  - plus docs/runbooks/e2e-verification-v0.1.1.md
  - in that repo.
priority: medium
type: bug
ordinal: 440000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The LCLI-302 fix (native LadybugDB packaging) should make the native backend activate reliably on macOS ARM64 wherever the `lore` binary is invoked, not just against one specific bundle/filesystem shape.

## Observed
During the lore-test repo's v0.1.1 comprehensive E2E re-verification pass, LCLI-302 was tested twice against the identical globally-installed `@opum-ai/lore-darwin-arm64` v0.1.1 binary, in the same time window:

- **Real bundle** (`/Volumes/external/repos/lore-test-v0.1.1-pass`, an external APFS volume, `disk7s1`): 4/4 independent cold cycles (via `impact`/`graph`/`query --json`) produced a genuine, well-formed `projection.lbdb` (8,372,224 bytes, `LBUG+` header) + matching `index.json` in `.lore/cache/graph/ladybug/1/generations/`, plus a real, repeatable ~2x warm/cold timing delta (~0.82s vs ~1.73s). Survived a dedicated adversarial re-verification pass (forced-fallback test, binary-string inspection confirming the `LORE_INTERNAL_PACKAGE_QUALIFICATION` diagnostic hook is now present in the real executed binary, independent timing) that found no evidence contradicting "fixed."
- **Fresh scratch fixtures** (`/private/tmp/.../scratchpad/...`, the internal boot volume's data partition, `disk3s5`): 0/3 runs across two separate throwaway fixtures activated the native backend at all -- `.lore/cache/graph/ladybug` was never created (not just left with an empty `generations/`), and the new, correctly-working advisory string `warning: native indexed retrieval failed; using the in-memory reference backend` fired instead.

Command *output* was correct in every case on both sides of the split -- this is purely about whether the persistent native index ever activates.

## Repro
    # On an external volume, real multi-concept bundle:
    cd /Volumes/external/repos/<a lore-managed bundle with several concepts>
    chmod -R u+w .lore/cache/graph/ladybug 2>/dev/null; rm -rf .lore/cache/graph/ladybug/1/generations
    lore graph --json > /dev/null
    find .lore/cache/graph/ladybug -type f   # expect: real projection.lbdb + index.json

    # On the internal boot volume, a fresh isolated fixture:
    cd /private/tmp/some-fresh-fixture && lore init && lore new adr "Fixture"
    lore graph --json > /dev/null   # observed: exit 0, correct output, but...
    find .lore/cache/graph/ladybug -type f   # observed: No such file or directory

## Candidate root causes (neither confirmed this pass)
- **Filesystem/volume boundary**: every real-bundle success ran on a separate external APFS volume; both fresh-fixture failures ran on the internal boot volume. Plausible if the Bun-compiled binary's `$bunfs`-embedded native addon extraction/staging behaves differently across a volume boundary.
- **Concurrency**: the failing fresh-fixture runs happened while several sibling subagents were concurrently invoking the same shared global `lore` install (a parallel Workflow batch) -- plausible race in extracting/loading the one shared embedded addon from concurrent invocations.

`lore-cli/src/core/ladybug-native.ts::supportsLadybugNative` is a pure `platform !== "win32"` check, and `lore-cli/src/core/retrieval.ts::loadRetrievalGraph`'s `"auto"` policy falls back silently on any thrown error from `reconcileLadybugProjection`/`loadNative()` -- no fixture-size/shape gate was found in source that would explain a deterministic split. Root cause is genuinely open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause identified for why an isolated, single-concept `lore init` fixture on the internal boot volume fails to activate the native LadybugDB backend while a real multi-concept bundle on an external volume succeeds 4/4 times on the identical installed binary
- [ ] #2 A controlled repro isolates the volume-boundary and concurrency variables independently (same fixture shape run alone on each volume, and run concurrently vs. serially) to confirm which one actually explains the split
- [ ] #3 Native backend activation is reliable -- or, if activation genuinely cannot be guaranteed in some environment, the fallback path fires consistently with an accurate advisory -- regardless of which variable turns out to matter
<!-- AC:END -->

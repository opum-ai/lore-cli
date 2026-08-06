---
id: LCLI-317
title: >-
  LCLI-302's native LadybugDB fix is not reliable across fixture/filesystem
  shapes -- 0/3 fresh-fixture activations vs 4/4 real-bundle activations on the
  identical installed binary
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-05 11:56'
updated_date: '2026-08-06 01:29'
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
modified_files:
  - src/core/retrieval.ts
  - test/indexed-retrieval.test.ts
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
- [x] #1 Root cause identified for why an isolated, single-concept `lore init` fixture on the internal boot volume fails to activate the native LadybugDB backend while a real multi-concept bundle on an external volume succeeds 4/4 times on the identical installed binary
- [x] #2 A controlled repro isolates the volume-boundary and concurrency variables independently (same fixture shape run alone on each volume, and run concurrently vs. serially) to confirm which one actually explains the split
- [x] #3 Native backend activation is reliable -- or, if activation genuinely cannot be guaranteed in some environment, the fallback path fires consistently with an accurate advisory -- regardless of which variable turns out to matter
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Track whether the repository-local indexed attempt reached the lazy Ladybug loader so automatic fallback can distinguish a pre-native indexed preflight/source failure from an actual native runtime failure without exposing private exception details.
2. Emit a precise sanitized preflight advisory when source loading fails before Ladybug activation, while preserving the existing native-failure advisory unchanged for loader, lifecycle, and indexed-read failures.
3. Add focused regression coverage proving an adapter/source failure never invokes the native loader, preserves the reference result, and reports the preflight advisory; retain the existing native-failure assertions as compatibility guards.
4. Verify focused indexed retrieval tests, typecheck, lint, full tests, diff hygiene, and the controlled installed-binary serial/concurrent volume matrix; perform adversarial self-review against all acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Controlled reproduction before implementation (installed @opum-ai/lore 0.1.1 Darwin ARM64 binary, Bun 1.3.14): an uninitialized internal-volume fixture fell back, and indexed-required mode exposed a Backlog task-list validation failure before any native load. After initializing independent Backlog projects and nested Git roots, identical one-concept fixtures activated indexed retrieval on both /private/tmp (disk3s5) and /Volumes/external (disk7s1). Eight simultaneous independent fixtures, four per volume, all exited 0, created exactly one projection.lbdb each, and emitted zero stderr. This rules out volume boundary and shared-addon concurrency; the original split was a pre-native Backlog source-read failure whose generic advisory incorrectly said native indexed retrieval failed.

Implementation and verification (2026-08-06 UTC): repository-local automatic retrieval now records whether the lazy native boundary was reached. A successful reference fallback reports `indexed retrieval preflight failed before native activation` when source/cache preflight fails first, while actual loader/read failures retain the existing `native indexed retrieval failed` advisory. Private exception detail remains suppressed, and explicit indexed policy still rethrows unchanged.

Objective evidence:
- Controlled installed-binary matrix: serial identical initialized fixtures succeeded on internal disk3s5 and external disk7s1; 8 simultaneous independent initialized fixtures (4 per volume) all exited 0, produced exactly one native database each, and emitted zero stderr.
- Real source CLI probe on an uninitialized internal-volume fixture: exit 0 with `warning: indexed retrieval preflight failed before native activation; using the in-memory reference backend`; no Ladybug cache was created.
- `bun test test/indexed-retrieval.test.ts` — 34 passed, 0 failed, 81 expectations. New regression proves preflight adapter failure preserves reference output, does not invoke the native loader, emits the accurate advisory, and does not leak private detail; existing native loader/read assertions remain green.
- `bun run typecheck` — passed.
- `bun run lint` — passed; 191 files checked, no fixes.
- `bun test` — 2,527 passed, 1 skipped, 0 failed across 76 files; the skip is the pre-existing published-launcher redirected-output qualification.
- `git diff --check` — passed.

Adversarial self-review: the diagnostic state is monotonic once any native call is attempted, so memoized loader failures cannot be downgraded to preflight; unsupported-platform and explicit-indexed behavior are unchanged; both warning paths remain sanitized; no workspace behavior or documentation was expanded. No unresolved acceptance gap found.

Delivery state: all three acceptance criteria are verified, but the four tracked changes are uncommitted on local branch fix/lcli-317-indexed-preflight-advisory from origin/dev because commit, push, PR, and merge authority is absent. Task remains In Progress pending delivery disposition.

Local delivery authorization update (2026-08-06 UTC): the user approved the requested next step, authorizing one local commit of the four tracked LCLI-317 campaign paths on fix/lcli-317-indexed-preflight-advisory. Push, PR creation, merge, branch deletion, publication, and LCLI-318 dispatch remain unauthorized. LCLI-317 stays In Progress pending integration.
<!-- SECTION:NOTES:END -->

---
id: LCLI-207
title: Release the response body in check's --external liveness fetch
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: chore
ordinal: 309000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The real-network fetch used by `lore check --external` never releases the HTTP response body.

**Live context.** `defaultFetch` at `src/commands/check.ts:785-788` awaits `fetch(url, { signal, redirect: "manual" })` and returns `{ ok, status, location }` from the headers — it never reads or cancels `response.body`. `probeLiveness`/`probeOne` (`src/commands/check.ts:816-939`) drive this for up to `LIVENESS_MAX_URLS` (500) distinct URLs at concurrency 8, so up to hundreds of responses per pass leave an undrained body, retaining the underlying connection/socket until GC.

**Why.** Resource hygiene on the one network-touching path. The fix must preserve the SSRF property documented at `src/commands/check.ts:856-864` (the probe deliberately never *reads* a response body) — cancelling the body stream releases the socket without reading it, so the security property is unchanged.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, finding [1]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `--external` liveness fetch releases (cancels, not reads) the response body after the headers/status/location are captured, on both the 3xx-redirect and the terminal-response paths.
- [x] #2 The SSRF invariant is preserved: the probe still never reads or reports any response body content.
- [x] #3 A test observes the real-fetch path releasing the body (e.g. a stubbed global fetch whose response body `cancel` is asserted to be called).
- [x] #4 The existing --external liveness, redirect, and SSRF tests in test/check.test.ts still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In defaultFetch (check.ts:785), after capturing {ok,status,location} from headers, cancel response.body (await response.body?.cancel().catch(()=>{})) without ever reading it. Single call site covers both 3xx-redirect hops and terminal responses since probeOne calls fetchFn once per hop. 2. Add a test in check.test.ts that stubs globalThis.fetch (not the FetchLike injection point) so defaultFetch itself runs, with a fake Response exposing body.cancel and a text() spy, asserting cancel was called and text/read was never invoked. 3. Verify full bun test + typecheck + existing --external/redirect/SSRF suite + CLI sanity run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed defaultFetch (check.ts:785-796) to cancel response.body (never read) after capturing ok/status/location — a single unconditional call site covers both the 3xx-redirect hop and the terminal-response hop since probeOne invokes fetchFn once per hop. Added test 'LCLI-207: the real-fetch path cancels (never reads) the response body once headers are captured' in test/check.test.ts, which stubs globalThis.fetch (exercising defaultFetch itself, not the FetchLike test-injection seam) with a fake Response exposing body.cancel and a text() spy — asserts cancel was called exactly once and text/read was never invoked. Verification: bun test -> 1914 pass / 0 fail (full suite); bun test test/check.test.ts -> 207 pass / 0 fail including all pre-existing --external liveness/redirect/LCLI-71 SSRF tests; bun run typecheck clean; bunx biome check on both changed files clean; bun run src/cli.ts check runs clean (38 files, 0 errors, 0 warnings).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
defaultFetch (src/commands/check.ts) now cancels — never reads — response.body once ok/status/location are captured from headers, releasing the socket on every hop (redirect and terminal alike, since the function runs once per hop). LCLI-71's SSRF invariant is unchanged: no body content is ever read or reported. Added a globalThis.fetch-stubbing test in test/check.test.ts that asserts body.cancel() is called on the real-fetch path and that no body-read method fires. Verified: bun test (1914 pass/0 fail), bun test test/check.test.ts (207 pass/0 fail, including all pre-existing --external/redirect/SSRF tests), bun run typecheck (clean), bunx biome check on both changed files (clean), and a live 'bun run src/cli.ts check' sanity run (38 files, 0 errors, 0 warnings).
<!-- SECTION:FINAL_SUMMARY:END -->

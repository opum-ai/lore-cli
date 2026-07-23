---
id: LORE-207
title: Release the response body in check's --external liveness fetch
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 The `--external` liveness fetch releases (cancels, not reads) the response body after the headers/status/location are captured, on both the 3xx-redirect and the terminal-response paths.
- [ ] #2 The SSRF invariant is preserved: the probe still never reads or reports any response body content.
- [ ] #3 A test observes the real-fetch path releasing the body (e.g. a stubbed global fetch whose response body `cancel` is asserted to be called).
- [ ] #4 The existing --external liveness, redirect, and SSRF tests in test/check.test.ts still pass.
<!-- AC:END -->

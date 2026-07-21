---
id: LORE-71
title: '`lore check --external` is vulnerable to SSRF via unrestricted fetch()'
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `--external` link-checker fetches every http(s) URL found in bundle markdown with no restriction on destination. A malicious PR could add a link to a loopback, private, link-local, or cloud metadata address (e.g. `http://169.254.169.254/...`), and a CI job running `lore check --external` over that content issues the request from the runner network with no allowlist and no redirect re-validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore check --external refuses (or explicitly opts out of) fetching to loopback, link-local, and private/reserved IP ranges by default
- [ ] #2 A redirect to a disallowed destination is rejected rather than silently followed
- [ ] #3 A test covers at least one blocked-destination case and confirms no request is actually issued
<!-- AC:END -->

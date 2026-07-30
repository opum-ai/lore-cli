---
id: LCLI-286
title: Delegate SSRF address parsing and CIDR matching to ipaddr.js
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:21'
labels:
  - dependencies
  - security
  - ssrf
  - networking
  - maintenance
dependencies: []
references:
  - src/core/check.ts
  - src/commands/check.ts
  - test/check.test.ts
documentation:
  - docs/reference/dependency-boundary-audit.md
priority: high
type: chore
ordinal: 401000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Lore’s generic hand-written IPv4/IPv6 parser, normalization, BigInt conversion, and CIDR range-matching machinery with an exact-pinned ipaddr.js boundary. Keep Lore’s explicit outbound-request policy authoritative: the package parses and classifies addresses, while Lore continues to decide which ranges are blocked and retains DNS resolution, redirect revalidation, bounded timeouts, fail-closed behavior, and redacted diagnostics. This reduces security-sensitive custom code without pretending to solve the separately documented DNS-rebinding limitation. This independent maintenance task does not gate or reorder M6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A versioned conformance table proves equivalent allow/block decisions for every currently supported IPv4 and IPv6 policy range, including range boundaries, IPv4-mapped IPv6, NAT64, loopback, link-local, private, documentation, multicast, and public addresses
- [ ] #2 Malformed, ambiguous, legacy-form, and resolver-returned address inputs remain fail-closed with stable redacted Lore errors; no destination is newly allowed without an explicit policy decision
- [ ] #3 DNS resolution, redirect-hop revalidation, timeout limits, response-body disposal, and the documented DNS-rebinding limitation remain covered and behaviorally unchanged
- [ ] #4 The selected ipaddr.js release is exact-pinned and passes the pinned Bun runtime, unit suite, typecheck, lint, and bun build --compile smoke test
- [ ] #5 The package owns only address parsing, normalization, and range matching; Lore’s block policy remains explicit and reviewable in repository code
<!-- AC:END -->

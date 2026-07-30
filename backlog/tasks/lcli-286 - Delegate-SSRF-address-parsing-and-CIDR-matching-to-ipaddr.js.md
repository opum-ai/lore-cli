---
id: LCLI-286
title: Delegate SSRF address parsing and CIDR matching to ipaddr.js
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:23'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the pinned-Bun 1.2.23 baseline: add and run a versioned before-change conformance matrix for all 13 current policy CIDRs, exact boundaries, IPv4-mapped IPv6, NAT64, loopback, link-local, private, documentation, multicast, public, malformed, ambiguous, legacy, zone-id, and resolver-returned inputs; retain existing DNS, redirect, timeout, body-disposal, advisory-output, and redaction fixtures. Measure the pre-change compiled binary. 2. Exact-pin ipaddr.js@2.4.0. Registry and upstream research on 2026-07-30: MIT, zero runtime/transitive dependencies, Node >=10 engine, built-in TypeScript declarations, 63,756-byte unpacked package, current May 2026 release, active June 2026 registry metadata, and no upstream-published security advisories. Verify the installed integrity and run the repository audit. 3. Replace node:net/BigInt/manual IPv4 and IPv6 parsing, normalization, CIDR construction, and inclusive comparisons with a narrow ipaddr.js boundary: accept IPv4 only through strict four-part-decimal validation, accept IPv6 including current zone-id spellings, normalize IPv4-mapped IPv6 to IPv4, parse the explicit Lore policy CIDRs once, and delegate membership matching to ipaddr.js. Keep labels, range order, and fail-closed invalid-input reasons stable. 4. Route literal-address detection through the same package-backed strict parser while leaving Lore-owned DNS resolution, all-address rejection, redirect-hop revalidation, 5-second timeout, redirect and URL caps, response-body cancellation, DNS-rebinding limitation, advisory semantics, deterministic output, and credential-safe diagnostics unchanged. 5. Run task-specific unit/conformance tests, bun audit, lint, typecheck, full tests, same-filesystem compile and non-empty/version smoke, packaging checks, and before/after binary-size comparison under Bun 1.2.23; then run the complete Lore and git gates and record objective evidence before finalization.
<!-- SECTION:PLAN:END -->

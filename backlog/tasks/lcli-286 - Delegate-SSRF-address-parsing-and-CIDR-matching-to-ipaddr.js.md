---
id: LCLI-286
title: Delegate SSRF address parsing and CIDR matching to ipaddr.js
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:34'
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
modified_files:
  - package.json
  - bun.lock
  - src/core/check.ts
  - src/commands/check.ts
  - test/check.test.ts
  - docs/reference/dependency-boundary-audit.md
  - docs/reference/tech-stack.md
  - docs/runbooks/dependency-boundary-campaign-handover.md
  - docs/runbooks/index.md
  - docs/log.md
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
- [x] #1 A versioned conformance table proves equivalent allow/block decisions for every currently supported IPv4 and IPv6 policy range, including range boundaries, IPv4-mapped IPv6, NAT64, loopback, link-local, private, documentation, multicast, and public addresses
- [x] #2 Malformed, ambiguous, legacy-form, and resolver-returned address inputs remain fail-closed with stable redacted Lore errors; no destination is newly allowed without an explicit policy decision
- [x] #3 DNS resolution, redirect-hop revalidation, timeout limits, response-body disposal, and the documented DNS-rebinding limitation remain covered and behaviorally unchanged
- [x] #4 The selected ipaddr.js release is exact-pinned and passes the pinned Bun runtime, unit suite, typecheck, lint, and bun build --compile smoke test
- [x] #5 The package owns only address parsing, normalization, and range matching; Lore’s block policy remains explicit and reviewable in repository code
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the pinned-Bun 1.2.23 baseline: add and run a versioned before-change conformance matrix for all 13 current policy CIDRs, exact boundaries, IPv4-mapped IPv6, NAT64, loopback, link-local, private, documentation, multicast, public, malformed, ambiguous, legacy, zone-id, and resolver-returned inputs; retain existing DNS, redirect, timeout, body-disposal, advisory-output, and redaction fixtures. Measure the pre-change compiled binary. 2. Exact-pin ipaddr.js@2.4.0. Registry and upstream research on 2026-07-30: MIT, zero runtime/transitive dependencies, Node >=10 engine, built-in TypeScript declarations, 63,756-byte unpacked package, current May 2026 release, active June 2026 registry metadata, and no upstream-published security advisories. Verify the installed integrity and run the repository audit. 3. Replace node:net/BigInt/manual IPv4 and IPv6 parsing, normalization, CIDR construction, and inclusive comparisons with a narrow ipaddr.js boundary: accept IPv4 only through strict four-part-decimal validation, accept IPv6 including current zone-id spellings, normalize IPv4-mapped IPv6 to IPv4, parse the explicit Lore policy CIDRs once, and delegate membership matching to ipaddr.js. Keep labels, range order, and fail-closed invalid-input reasons stable. 4. Route literal-address detection through the same package-backed strict parser while leaving Lore-owned DNS resolution, all-address rejection, redirect-hop revalidation, 5-second timeout, redirect and URL caps, response-body cancellation, DNS-rebinding limitation, advisory semantics, deterministic output, and credential-safe diagnostics unchanged. 5. Run task-specific unit/conformance tests, bun audit, lint, typecheck, full tests, same-filesystem compile and non-empty/version smoke, packaging checks, and before/after binary-size comparison under Bun 1.2.23; then run the complete Lore and git gates and record objective evidence before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final evidence (2026-07-30, Bun 1.2.23):

- Package research: ipaddr.js 2.4.0 is the current May 2026 MIT release; npm registry integrity sha512-9VGk3HGanVE6JoZXHiCpnGy5X0jYDnN4EA4lntFPj+1vIWlFhIylq2CrrCOJH9EAhc5CYhq18F2Av2tgoAPsYQ==, 63,756-byte unpacked package, zero runtime/transitive dependencies, Node >=10 engine, and built-in TypeScript declarations. Upstream repository showed active 2026 maintenance and no published repository security advisories. bun audit: no vulnerabilities found.
- AC1/AC2 before/after oracle: ADDRESS_POLICY_CONFORMANCE_V1 covers every one of the 13 Lore CIDRs and exact edges; mapped IPv6, NAT64, deprecated compatible forms, zone IDs, documentation, multicast, broadcast, public, malformed, ambiguous, legacy, and resolver-returned forms. bun test test/check.test.ts passed against the original classifier and unchanged after delegation: 255 passed, 0 failed both times. WHATWG legacy URL normalization and stable resolver-failure reasons are explicit regression fixtures.
- Compatibility decision: ipaddr.js normalizes dotted ::127.0.0.1 as IPv4-mapped. Lore detects that already-validated authored spelling before mapped conversion so the existing deprecated ::/96 policy label remains stable. This is the only syntax-sensitive Lore policy adapter; package parsing, IPv4-mapped conversion, CIDR parsing, and match operations remain delegated.
- AC3: existing injected DNS, multi-address rejection, every-redirect-hop validation, 5-second timeout, redirect/URL caps, response-body cancellation without reads, advisory-only output, JSON envelope, and DNS-rebinding limitation coverage all remain unchanged and passed in the full suite.
- AC4 packaging/security: package.json and bun.lock exact-pin 2.4.0 with registry integrity. bun test: 2,227 passed, 0 failed across 51 files; bun run lint: pass; bun run typecheck: pass; bun run build and ./dist/lore --version: pass, 0.0.0. All five release targets compiled non-empty under Bun 1.2.23: darwin-arm64 61,335,888; darwin-x64-baseline 67,416,752; linux-arm64 98,382,432; linux-x64-baseline 105,245,782; windows-x64-baseline 119,869,440 bytes. npm pack --dry-run --json passed. Host binary increased from 61,302,864 to 61,335,888 bytes (+33,024; one bundled module).
- AC5: removed node:net IP detection, addressToBigInt, v4ToBigInt, v6ToBigInt, manual CIDR builders, masks, and inclusive BigInt comparisons. The explicit ordered Lore policy table and labels remain in src/core/check.ts; DNS/fetch policy remains in src/commands/check.ts.
- Final repository gates: lore sync (0 changes), lore validate --strict (45 files, 0 errors, 0 warnings), lore check --strict (45 files, 0 errors, 0 warnings), and git diff --check all passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Exact-pinned ipaddr.js 2.4.0 now owns strict IP parsing, mapped-address normalization, CIDR parsing, and membership matching. Lore retains its explicit 13-range SSRF policy and all DNS, redirect, timeout, body-disposal, fail-closed, diagnostic, and DNS-rebinding contracts. A versioned pre/post oracle and resolver/legacy regressions prove behavior; 2,227 tests, lint, typecheck, audit, host and five-target compiled packaging, npm dry-run packaging, strict Lore gates, and diff hygiene all pass under pinned Bun 1.2.23.
<!-- SECTION:FINAL_SUMMARY:END -->

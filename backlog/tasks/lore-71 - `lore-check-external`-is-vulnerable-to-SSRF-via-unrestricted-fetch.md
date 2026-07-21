---
id: LORE-71
title: '`lore check --external` is vulnerable to SSRF via unrestricted fetch()'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 12:03'
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
- [x] #1 lore check --external refuses (or explicitly opts out of) fetching to loopback, link-local, and private/reserved IP ranges by default
- [x] #2 A redirect to a disallowed destination is rejected rather than silently followed
- [x] #3 A test covers at least one blocked-destination case and confirms no request is actually issued
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: src/commands/check.ts's defaultFetch (the real network probe backing --external's
liveness check) called the global fetch() on any http(s) URL discovered in the bundle with zero
destination validation and zero control over redirect-following (native fetch's implicit
redirect: "follow" default) -- confirmed the task's own concern live: pre-fix, a link to
http://169.254.169.254/... or any private/loopback address would have been fetched exactly like
any other URL.

Fix, two layers:
1. src/core/check.ts: new PURE classifyAddress(ip) -- an IP-range classifier built on a uniform
   128-bit BigInt address space (IPv4 mapped into ::ffff:a.b.c.d's numeric range) so an IPv4
   address and its IPv6-mapped spelling always classify identically -- closes a well-known
   SSRF-filter bypass (an IPv4-blocklist-only check missing ::ffff:169.254.169.254). Blocks:
   IPv4 this-network (0.0.0.0/8), private (10/8, 172.16/12, 192.168/16), carrier-grade NAT
   (100.64.0.0/10), loopback (127/8), link-local (169.254.0.0/16, where the task's own cloud-
   metadata example lives); IPv6 loopback (::1), unspecified (::), link-local (fe80::/10),
   unique-local (fc00::/7). Not an exhaustive IANA special-purpose-registry sweep (documentation
   ranges like 192.0.2.0/24 omitted as low real-world SSRF risk) -- deliberately scoped to ranges
   an attacker can actually reach something interesting through, matching the task's own AC1
   wording ("loopback, link-local, and private/reserved").
2. src/commands/check.ts: a new injectable ResolveHost DNS seam (defaults to real node:dns
   lookup(hostname, {all:true})) plus blockedDestination(url, resolveHost), which resolves a
   URL's hostname to EVERY IP it answers to (blocking if ANY resolved address is disallowed --
   conservative, since a single-address check could miss a DNS record deliberately returning a
   mix) and classifies each via classifyAddress BEFORE fetchFn is ever called. A literal IP
   hostname is classified DIRECTLY (bypassing resolveHost entirely, matching how a real socket
   connection never does a DNS lookup for a literal IP) -- this also makes the guard's
   correctness independent of whether an injected resolveHost fake actually inspects its input.
   FetchLike's return type gained optional location?: string|null (AC2): defaultFetch always
   requests redirect: "manual" from the real fetch() and surfaces the raw Location header;
   probeOne manually follows a 3xx by re-validating the NEW destination via blockedDestination
   BEFORE following it, looping up to MAX_REDIRECTS=10 hops -- a redirect to a blocked
   destination is refused with the SAME "was not probed" finding, and critically the blocked hop
   is NEVER fetched (confirmed via call-count assertions in tests, not just the resulting
   finding). Both optional fields keep every pre-existing FetchLike fake (which only ever
   returns {ok, status}) satisfying the type unchanged -- no existing test needed a shape change,
   only a NEW resolveHost fake (since DNS is a genuinely new IO touchpoint the fix introduces;
   existing --external tests use RFC 2606-reserved .example hostnames that never resolve for
   real, so they now inject a shared ALLOW_ALL_HOSTS fake resolving everything to a public IP).
   resolveHost threaded through CheckOptions AND cli.ts's RunContext (mirroring the existing
   fetch injection point exactly) so CLI-dispatch-level tests can also stub DNS.

Verified: DNS-resolution failure (a genuinely nonexistent host, a resolver fault) is NOT treated
as a security block -- it shares probeOne's existing try/catch with fetchFn faults and surfaces
as the same ordinary "is unreachable" liveness finding, never a silent uncaught rejection (caught
this exact bug during implementation: an early draft called blockedDestination OUTSIDE probeOne's
try/catch, which silently crashed the whole liveness probe -- with NO external findings at all --
whenever real DNS failed for a test's .example fixture hostname; every pre-existing --external
test failed until fixed).

6 new tests added to test/check.test.ts covering: AC1's exact literal repro (169.254.169.254,
never fetched, calls=0); loopback/private/IPv4-mapped-IPv6-encoded literal addresses (4 URLs, 0
fetches); a hostname that RESOLVES (via DNS mock) to a blocked address, not just a literal IP;
a hostname resolving to MULTIPLE addresses blocked because ANY one is disallowed; AC2's redirect-
to-blocked-destination case (asserts the SECOND hop's URL is never in the fetch call list, not
just that the finding says "blocked"); a redirect-to-ALLOWED-destination positive control (proves
redirects still work normally when the target is fine). Confirmed via git stash (isolating
src/cli.ts + src/commands/check.ts + src/core/check.ts, keeping only the new tests) that all 6
new tests fail against pre-fix code and all 123 pre-existing tests are unaffected either way.

Live end-to-end verification against the real CLI (scratch bundle, real DNS, real network): a
doc linking http://169.254.169.254/latest/meta-data/, http://127.0.0.1/, and
https://example.com/ -- the first two report "was not probed: resolves to a blocked address"
with the specific matched range named; the real example.com link succeeds normally with no
finding (proving the fix does not break legitimate external links). Also independently verified
via `bun -e` that node:dns's lookup() short-circuits a literal-IP input with 0ms latency (no real
DNS query), and that a NUL byte or malformed IP literal is correctly rejected by classifyAddress.

Full bun test: 1540 pass/0 fail (up from 1534). bun run typecheck clean. bunx biome check clean
(two formatter-only fixes applied).
<!-- SECTION:NOTES:END -->

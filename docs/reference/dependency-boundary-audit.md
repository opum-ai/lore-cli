---
type: Reference
title: Dependency boundary audit
tags:
  - dependencies
  - architecture
  - maintenance
  - packages
  - investigation
summary: Records which generic primitives should move to maintained packages, which substitutions require compatibility spikes, and which Lore-specific behavior remains custom.
timestamp: 2026-07-30T15:27:43.592Z
---

# Dependency boundary audit

This reference records where Lore should delegate a generic infrastructure
primitive to a maintained package and where its behavior is product-specific
enough to remain repository-owned. It is the durable companion to the
implementation tasks; package versions are selected and exact-pinned only when
the owning task is activated and verified against the pinned Bun toolchain.

The governing rule is narrow delegation: a package may own a standards-heavy
primitive, but it does not inherit Lore’s policy, output contracts, domain
semantics, or error model. See the [tech stack](tech-stack.md),
[system architecture](architecture.md), [CLI contract](cli-contract.md), and
[frontmatter stability decision](../adr/0011-frontmatter-serialization-stability.md).

## Approved package delegations

| Task | Boundary to delegate | Boundary Lore retains |
|---|---|---|
| `LCLI-285` | Terminal display-column measurement via [`string-width`](https://www.npmjs.com/package/string-width) | Pretty-row composition, padding policy, output modes, ANSI policy, and all machine contracts |
| `LCLI-286` | IPv4 and IPv6 parsing, normalization, and CIDR matching via [`ipaddr.js`](https://www.npmjs.com/package/ipaddr.js) | The explicit blocked-range policy, DNS resolution, redirect revalidation, timeouts, fail-closed behavior, and redacted errors |
| `LCLI-287` | GitHub-compatible slug and duplicate-anchor state via [`github-slugger`](https://www.npmjs.com/package/github-slugger) | mdast heading-text extraction, including the verified exclusion of image alt text, plus Lore link findings and reporting |
| `LCLI-288` | Parsed TOML shape validation through the already-installed [Zod](https://zod.dev/) | Bun TOML parsing, recursive secret detection, environment overlay, defaults, page-id precision, unsafe-key policy, and Lore error mapping |

These tasks are independent maintenance work. They do not change the M6
LadybugDB → M7 explorer → M8 capability order and do not become implicit
prerequisites of `LCLI-283` or Commander. Each should ship as a focused change
with before-and-after conformance fixtures.

## Package acceptance gate

A candidate is accepted only when its owning task proves all of the following:

1. The dependency is exact-pinned and its license, maintenance state, transitive
   dependencies, and security posture are reviewed at activation time.
2. Source execution, typechecking, tests, and `bun build --compile` pass under
   the repository-pinned Bun version. A result from a newer workstation Bun is
   useful research but not release evidence.
3. Deterministic ordering, byte-stable outputs, JSON and plain envelopes,
   stdout/stderr separation, semantic exit codes, and redaction remain intact.
4. The package replaces the generic primitive instead of creating two competing
   implementations. Lore-owned policy remains explicit and directly tested.
5. Binary size and platform packaging regressions are measured when the package
   enters the compiled runtime surface.

## Future investigation: atomic filesystem primitive

The current `src/commands/fswrite.ts` layer does more than an atomic rename. It
combines temporary-file cleanup, file-mode behavior, symlink no-follow checks,
Windows transient-lock retries, multi-file rollback, confinement, and Lore
error classification. A future compatibility spike may evaluate
[`write-file-atomic`](https://www.npmjs.com/package/write-file-atomic) for the
single-file temporary-write-and-rename primitive only.

Do not open a migration task merely because the package exists. Open one when a
worker can prove, under pinned Bun and every supported platform, that delegation
preserves mode and ownership behavior, no-follow and confinement guarantees,
cleanup after partial writes, Windows retry semantics, compiled packaging, and
the existing adversarial suite. Multi-file rollback and Lore diagnostics remain
repository-owned even if the inner primitive is delegated. If the package
cannot satisfy those constraints cleanly, retain the current implementation.

## Future investigation: frontmatter pipeline

The shipping frontmatter boundary is Lore-owned fence detection plus exact-pinned
`js-yaml`; `gray-matter` is not a current dependency. It was removed during YAML
security maintenance, while several descriptive documents remained stale.
Reintroducing it is not the default recommendation.

A future spike may compare the maintained [`yaml`](https://eemeli.org/yaml/)
package and [`mdast-util-frontmatter`](https://www.npmjs.com/package/mdast-util-frontmatter)
with the current boundary. Adoption requires golden proof for malformed and
missing fences, empty scalars, JSON-schema timestamp behavior, alias expansion
limits and cycles, unknown keys including `__proto__`, canonical key order,
modeline handling, comment limitations, CRLF and BOM normalization, stable
quoting, and the serialize-parse fixpoint. The mdast extension may locate
frontmatter, but Lore should continue string-splicing authored Markdown rather
than serializing whole documents through a remark pipeline. Until a spike proves
all of these contracts with lower complexity, keep the direct `js-yaml`
implementation.

## Opportunistic runtime cleanup

`src/adapters/backlog.ts` contains a small release-triple comparator for the
Backlog capability floor. A future worker may replace it with
[`Bun.semver`](https://bun.sh/docs/runtime/semver) after confirming that the
repository-pinned Bun exposes the needed behavior and that Lore continues to
accept and report the same version forms. Its size and low risk do not justify a
standalone task today.

ANSI stripping may likewise use a runtime or package primitive as part of
`LCLI-285`, but Lore must retain its separate removal of unsafe control bytes
and its credential-safe diagnostic bounds.

## Deliberately repository-owned behavior

The audit does not recommend packages for Lore’s managed-block reconciliation,
Story-to-Backlog coupling, portable-link policy, deterministic graph/context
contracts, BM25 reference implementation, Git transaction rules, or stable
error and output envelopes. Those are Lore behavior rather than generic
infrastructure.

The current interactive prompt adapter and bounded concurrency helper are also
small, isolated, and well matched to the present surface. Reconsider a prompt
package only if onboarding grows beyond the current confirm/select flow;
reconsider a concurrency package only if cancellation, priorities, or dynamic
limits become real requirements. A dependency should remove material complexity
or standards risk, not merely replace a short readable helper.

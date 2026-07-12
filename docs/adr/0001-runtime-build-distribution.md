---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: "ADR-0001: Runtime, build & distribution"
description: >-
  Records the choice of Bun + TypeScript as lore's runtime and language, a
  single-file compiled binary via `bun build --compile` with -baseline x64
  targets, and a dual-artifact npm distribution (thin Node .cjs launcher plus
  per-platform compiled binaries as optionalDependencies).
tags: [adr, runtime, build, distribution, bun, typescript, npm, packaging]
summary: >-
  lore is built on Bun + TypeScript and shipped as a `bun build --compile`
  -baseline binary, distributed on npm as a Node .cjs launcher plus
  per-platform binary optionalDependencies under @salient-data/lore (bin `lore`).
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0001: Runtime, build & distribution

## Status

Accepted — 2026-06-21.

## Context

lore is a thin, zero-config, CLI-primary documentation tool. Its two hard
constraints shape every distribution decision:

1. **It must be trivial to invoke from agents, CI, and developer shells.** A
   single self-contained executable with no `node_modules` install step, no
   runtime version negotiation, and fast cold start is the ideal — every
   `lore check` / `lore context` call in an agent loop pays startup cost.
2. **It is tightly coupled to Backlog.md.** lore shells out to a forked,
   `--json`-capable Backlog.md (see ADR-0002 and
   [the Backlog --json patch runbook](../runbooks/backlog-json-patch.md)).
   Matching Backlog.md's own stack and distribution model keeps the two tools
   mentally and operationally aligned, and lets us reuse a proven packaging
   recipe rather than inventing one.

Backlog.md (MrLesk/Backlog.md, the basis of our fork
jeremy-newhouse/Backlog.md) is itself a Bun + TypeScript project that already
ships exactly the way we want to: its CLI dependencies — Commander, the MCP
SDK, gray-matter, and friends — are bundled into a single compiled binary via
`bun build --compile`, and its release targets use Bun's **`-baseline`** x64
variants. The `-baseline` choice is not cosmetic: the default
`bun build --compile` x64 output assumes AVX2, and running it on pre-AVX2 (or
some virtualized / older-cloud) CPUs produces an immediate `illegal
instruction` (SIGILL) crash. `-baseline` trades a little throughput for
running everywhere, which is mandatory for a CI/agent tool whose execution
environment we do not control.

A complication we inherited from validating against Backlog.md: **its own Bun
version pins are internally inconsistent** — CI pins Bun `1.3.11` while its
`DEVELOPMENT.md` and Nix flake pin `1.2.23`. We must not propagate that drift
into lore.

Within those constraints the open questions were: (a) runtime + language,
(b) how to produce the executable, and (c) how to get it onto developer and CI
machines through the channel they already use (npm / `npx` / `bunx`).

## Decision

**Runtime & language: Bun (pinned) + TypeScript.**

- lore is written in TypeScript and runs on **Bun**, matching Backlog.md so the
  two share one toolchain, one bundler, and one mental model. See
  [tech-stack](../reference/tech-stack.md) for the full dependency set.
- The Bun version is **pinned to a single value across every surface** —
  `package.json` (`packageManager` / `engines`-equivalent), CI, the Nix flake,
  `.tool-versions`/`DEVELOPMENT.md`, and the `Dockerfile` if any — precisely to
  avoid the CI-vs-flake split that Backlog.md suffers. One source of truth for
  the pin, asserted in CI.
- **Escape hatch:** the pin is a *floor + tested ceiling*, not a cage.
  Contributors may run a newer Bun locally; the single documented place to bump
  the pin is recorded so a version upgrade is a one-line, reviewable change.
  Native/optional modules are kept lazy so a Bun upgrade can't break startup for
  features a given command doesn't use.

**Build: `bun build --compile`, `-baseline` x64 targets.**

- The CLI is compiled to a **single self-contained executable** with
  `bun build --compile`. All JS/TS dependencies (gray-matter,
  mdast-util-from-markdown, zod, the deferred Commander/MCP SDK) are bundled
  into the binary — no `node_modules` at runtime. See
  [tech-stack](../reference/tech-stack.md) for what is actually a v1 dependency
  versus a named-but-deferred one.
- x64 targets use the **`-baseline`** variant to avoid AVX2-only SIGILL crashes
  on older/virtualized CPUs. arm64 targets use the standard variant.
- **Native modules stay optional and lazily required**, never eagerly imported
  at process start, so the compiled binary loads and runs on a clean machine
  and a missing/incompatible native addon degrades a single feature instead of
  bricking the binary.

**Distribution: dual artifact on npm.**

- Published to npm as **`@salient-data/lore`**, exposing **`bin: lore`**.
- The published package is a **dual artifact**:
  1. A **thin Node `.cjs` launcher** (`bin/lore.cjs`) that runs under plain
     Node — this is the entry point npm wires up, so `npx @salient-data/lore`
     and a global install work with only Node present. The launcher resolves
     and `exec`s the correct platform binary.
  2. **Per-platform compiled binaries published as `optionalDependencies`**
     (one package per `{os, cpu}` triple, each gated by npm's `os`/`cpu`
     fields). npm installs only the binary matching the host; the others are
     skipped. The launcher locates the resolved optional dependency and hands
     off to it.
- This is the same pattern proven by esbuild / swc / Backlog.md: Node-only
  bootstrap for maximum reach, native-speed Bun binary for actual work, no
  postinstall compilation, and `npx`/`bunx` "just work".

**License & coordinates.** MIT, © Jeremy Newhouse, 2026. Repo
`github.com/jeremy-newhouse/lore` (private; `main` + `dev`, `dev` is default).

## Consequences

### Positive

- **Single-binary speed and self-containment.** No runtime `node_modules`, fast
  cold start, ideal for tight agent/CI loops (`lore check`, `lore context`).
- **`-baseline` portability.** Runs on pre-AVX2 and virtualized CPUs that would
  SIGILL on a default Bun compile — a hard requirement for a tool that runs in
  arbitrary CI.
- **Reach without a Bun prerequisite.** The Node `.cjs` launcher means
  `npx @salient-data/lore` works for anyone with Node; users with Bun get
  `bunx @salient-data/lore`. No global Bun install is forced on consumers.
- **Toolchain parity with Backlog.md.** One bundler, one language, one packaging
  recipe across the two coupled tools; we reuse a battle-tested release shape
  instead of inventing one (see [architecture](../reference/architecture.md)).
- **Clean upgrades.** Optional per-platform binaries mean a release ships every
  triple independently; npm picks the right one with no build step on the
  consumer's machine.

### Negative / tradeoffs

- **Release-matrix complexity.** We must cross-compile and publish one binary
  package per platform triple, keep their versions lockstep with the launcher,
  and test each — more CI surface than a pure-JS package.
- **Larger download than source-only npm.** Self-contained binaries embed the
  Bun runtime; the per-platform package is tens of MB rather than a few KB of
  JS. Acceptable for a CLI; noted.
- **`-baseline` leaves some throughput on the table** versus an AVX2 build. lore
  is I/O- and parse-bound, not compute-bound, so this is immaterial in practice.
- **Two-runtime cognitive surface.** The launcher runs under Node while the
  payload runs under Bun. Contributors must remember the launcher must stay
  plain, dependency-light, Node-compatible CJS — it cannot use Bun-only APIs.
- **Pin discipline required.** A single pinned Bun version must be enforced
  everywhere or we recreate Backlog.md's CI-vs-flake drift; this is a standing
  maintenance obligation, mitigated by a CI assertion on the pin.

## Alternatives considered

- **Node + TypeScript, published as plain JS (`tsc`/bundler, no compile).**
  Smallest package, universal `npx`. Rejected as the *primary* shape: slower
  cold start, requires a Node runtime and a resolvable dependency tree at run
  time, and diverges from Backlog.md's toolchain. (We still keep a Node `.cjs`
  *launcher* — the best part of this option — to preserve `npx` reach.)
- **Deno + `deno compile`.** Comparable single-binary story and good TS
  ergonomics, but abandons stack parity with Backlog.md and its npm-native
  distribution expectations, and complicates consuming the Backlog.md fork.
  Rejected.
- **Default (non-`-baseline`) `bun build --compile` x64 binaries.** Faster on
  modern hardware but crashes with `illegal instruction` on pre-AVX2 /
  virtualized CPUs — unacceptable for a CI/agent tool. Rejected; `-baseline` is
  mandatory for x64.
- **Single fat binary per OS without the npm optionalDependency split** (e.g.
  GitHub Releases only, or one npm package that downloads a binary on
  postinstall). Rejected: GitHub-only loses the `npx`/`bunx` ergonomics, and
  a postinstall downloader breaks in sandboxed/air-gapped CI and adds a network
  failure mode at install time. The optionalDependencies split keeps install
  hermetic and offline-friendly.
- **Bundling native modules eagerly into the compiled binary.** Rejected:
  eager native imports make a single incompatible addon fail the whole binary
  at startup; keeping them optional and lazy contains the blast radius.

## Related

- ADR-0002 — Backlog.md integration via a forked `--json` CLI (the coupling
  this runtime/distribution choice is built to serve).
- [Tech stack](../reference/tech-stack.md) — full runtime/dependency reference.
- [Architecture](../reference/architecture.md) — how the binary, core, and
  adapters fit together.
- [lore design spec](../specs/lore-design.md) — overall design context.
- [Backlog --json patch runbook](../runbooks/backlog-json-patch.md) — building
  and consuming the forked Backlog.md whose distribution model we mirror.

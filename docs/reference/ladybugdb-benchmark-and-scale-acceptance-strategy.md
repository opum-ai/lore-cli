---
type: Reference
title: LadybugDB benchmark and scale acceptance strategy
tags:
  - ladybugdb
  - benchmark
  - performance
  - scale
summary: Records upstream performance evidence and the bounded Lore-specific benchmark envelope for LadybugDB integration.
timestamp: 2026-08-01T00:29:37.361Z
---

# LadybugDB benchmark and scale acceptance strategy

## Decision

Lore will qualify a bounded local-use envelope instead of attempting to find
LadybugDB's maximum graph size. The blocking scale gate uses a deterministic
100 MiB authored-repository fixture and completes in at most 15 minutes. A
1 GiB fixture is an opt-in, time-boxed, informational run; it is not a release
gate until measured evidence supports a separate decision.

This boundary reflects the product claim being tested: local Lore graph,
query, and context operations should remain practical for an unusually large
authored repository. It is not a general-purpose database benchmark and its
results must not be published as LadybugDB performance claims.

## Why the earlier run was not representative

The superseded harness combined a 30-pair bootstrap with 3,976 fresh worker
processes and a four-to-six-hour timeout. Most of that elapsed time exercised
process startup and a synthetic scenario matrix, not a user waiting for one
local graph query. It could expose lifecycle defects, but it could not provide
a useful release threshold for normal Lore use.

Concurrency, crash recovery, native loading, and platform installation remain
important. They are separate, focused qualification gates so failures have a
clear meaning and do not distort the scale measurement.

## Upstream evidence

LadybugDB, formerly Kùzu, is an embedded graph database whose official source
repository includes dedicated benchmark tooling. The Kùzu CIDR 2023 paper
evaluated the engine with LDBC datasets up to scale factor 100 on a server
with 256 GiB of memory. It ran queries three times and reported the fastest
execution; its reported short-read results were generally in the low
millisecond range.

That evidence shows the engine is designed for graphs far beyond Lore's first
100 MiB acceptance fixture. It does not establish Lore's performance because
it used a different engine version, hardware, data model, query set, and
runtime. In particular, it does not cover Lore's authored-source loader,
canonical projection, Bun native-addon boundary, freshness checks, output
contracts, packaging, or recovery behavior. Lore therefore needs a small,
repeatable integration benchmark even though upstream benchmarks exist.

## Blocking 100 MiB acceptance envelope

The fixture size is the sum of authored OKF and Backlog source bytes before
projection. Fixture generation must be deterministic and record the seed,
source-byte count, document and task counts, projected node and edge counts,
and export digest so results can be compared across runs.

The blocking job performs one cold projection build followed by five warm
samples for representative query, graph, and context operations. The wider
functional scenario matrix belongs in fast non-timing tests. Initial budgets
are deliberately conservative and may only be changed with recorded evidence:

| Measurement | Initial blocking budget |
| --- | ---: |
| Cold projection build | 30 seconds |
| Warm projection open | 3 seconds |
| Ordinary lexical query | 500 milliseconds |
| Graph or context operation | 1 second |
| Peak resident memory | 2 GiB |
| Complete benchmark job | 15 minutes |

Report each sample and summary statistic rather than hiding variance behind a
single best result. A threshold failure is a Lore qualification failure; it is
not evidence of LadybugDB's absolute limit.

## Optional 1 GiB observation

The 1 GiB fixture uses the same deterministic accounting but runs only by an
explicit manual or nightly opt-in. It performs one cold build and a small set
of representative warm operations, stops after 30 minutes, and reports its
result without blocking a release. Promoting it to a release gate requires a
separate product need, stable measurements on named hardware, and an explicit
budget decision.

## Separate qualification gates

The scale job does not replace these independent checks:

- bounded multi-reader and writer-contention tests;
- interrupted-build, stale-index, and corrupt-index recovery tests;
- native addon installation and loading on every supported host;
- output and error parity with the in-memory implementation; and
- disk-growth accounting for the generated projection and retained artifacts.

## Dependency version status

Lore currently pins `@ladybugdb/core@0.18.2`, while the npm `latest` tag
reported `0.19.0` on 2026-07-31. A newer package is not automatically a safer
supported package: native loading, Bun compatibility, storage-version changes,
platform artifacts, and existing Lore contracts must all be checked.

`LCLI-283.1.5` owns that audit. It must either update every exact pin and
recorded runtime/storage constant coherently or document the objective blocker
for retaining `0.18.2`. Final `LCLI-283.1.4` evidence is authoritative only
after that version decision.

## Sources

- [LadybugDB source repository](https://github.com/LadybugDB/ladybug)
- [LadybugDB developer guide](https://docs.ladybugdb.com/developer-guide/)
- [Kùzu Graph Database Management System, CIDR 2023](https://www.vldb.org/cidrdb/papers/2023/p48-jin.pdf)
- [`@ladybugdb/core` on npm](https://www.npmjs.com/package/@ladybugdb/core)
- [LadybugDB releases](https://github.com/LadybugDB/ladybug/releases)

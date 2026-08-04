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
samples for representative query, graph, and context operations. Each
repetition starts one fresh indexed session and one fresh reference session in
a deterministic AB/BA order, measures warm open once per policy, and then
measures the representative operations against that loaded session. Source
bytes are hashed before and after each session. This keeps the samples
independent without reparsing the same 100 MiB repository once per operation.
The wider functional scenario matrix belongs in fast non-timing tests. Initial budgets
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

## Qualified implementation approach

The performance recovery follows LadybugDB's recommended bulk-import path:
Lore writes bounded temporary CSV batches, loads them with `COPY`, checkpoints
between phases, and removes staging files. Primary-keyed term nodes plus
concept-to-term postings provide the persistent lexical lookup while preserving
Lore's exact BM25 behavior. Warm retrieval opens one immutable read-only
generation, uses promoted metadata for graph output and filters, and builds the
deterministic undirected neighbor lookup once while materializing those edges.
Graph and context traversals reuse that lookup instead of rebuilding it for each
command, while a full document body is still fetched only when context output
needs it.

Cold construction avoids reparsing syntax-free oversized prose as Markdown link
structure, skips freshness reads when no generation can be reused, and retains
lexical lengths computed during posting construction. Full staged verification
still covers every body: LadybugDB computes SHA-256 inside one bounded scan and
Lore compares those digests with the validated source before publication.

Large source passes retain explicit cleanup points but run them once per 1,024
records instead of once per 256. Bun documents `Bun.gc(true)` as synchronous and
its runtime already sizes the garbage-collected heap from available memory,
including container limits. The wider interval removes repeated full-collector
pauses while the separate 16 MiB import batches and blocking memory gate continue
to bound the qualification envelope.

Lore does not depend on LadybugDB's separately installed full-text-search
extension. That extension has its own installation and user-global storage
lifecycle, while the release requirement is a repository-contained,
offline-capable native package. The private posting schema therefore uses only
the exact pinned core package and automatic primary-key indexes.

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

`LCLI-283.1.5` selected exact `@ladybugdb/core@0.19.0` and storage version `43`
on 2026-07-31. The decision covered every stable release after Lore's former
`0.18.2` pin:

| Candidate | Published | Storage | Qualification result |
|---|---:|---:|---|
| `0.18.2` | 2026-07-15 | `42` | Former baseline; exact Bun 1.2.23 native lifecycle/retrieval suite passed. |
| `0.18.3` | 2026-07-21 | `42` | Patch candidate; the same exact-Bun suite passed, including projection build/reuse/rebuild and indexed output parity. |
| `0.19.0` | 2026-07-30 | `43` | Selected current npm `latest`; the same suite and audit passed. A real `0.18.2` storage-42 database reopened read-only and returned identical data under `0.19.0`. |

The 0.18.3 tag fixes shortest-path filtering, boolean-filter selection, and
interval conversion without changing storage format. The 0.19.0 release adds
storage-43 sorted-table metadata plus fixes directly relevant to Lore's
boundary: read-only opens during checkpoints, WAL forward reads, checkpoint
lock cleanup, and macOS native-addon OpenSSL resolution. Upstream permits a
storage-43 runtime to read storage 42, but Lore deliberately does not reuse the
old generation: package and storage versions participate in the source
fingerprint and control manifest, so the transition builds and verifies a new
immutable generation.

The selected lock contains the core package plus these five exact optional
platform artifacts and audited npm integrity values:

- `@ladybugdb/core@0.19.0` — `sha512-vlE2D2b6Ej/OiwtBCRtye34j8uRH9aV/ziJM+ZnXow77VkVr8zeVjSrAEj/eisj+uPPQ/pmuOXzJjJra0m0Bbg==`;
- `@ladybugdb/core-darwin-arm64@0.19.0` — `sha512-3Ut3XL9kowzBoHw0wrN3QnW4xy5wYoPBypeuMtH92j59fol2w9e3lQJ6DM29YJ4F6mAVfW2cYGBXH2l9aXGmmw==`;
- `@ladybugdb/core-darwin-x64@0.19.0` — `sha512-KHuCBx+jkyxdfFEmmbsfUS1f108P4rS+VNkwCrMLvzJmJOZTZgNKeRmT0vO7qRum5KEoHSIPJLj2Le//rCYigQ==`;
- `@ladybugdb/core-linux-arm64@0.19.0` — `sha512-z4Z67LZlgj6H7YnKMB1PornbdmeszVxfENusfDQ2MFyOyrze1X6c/3MkhVPyunuaTtriN9SBnEdyK39mB7NdyQ==`;
- `@ladybugdb/core-linux-x64@0.19.0` — `sha512-aJOh7+XbTzCLNloK+KlDXuRmHgr7nLqyQwR/BR8fP/XsWVnxCKGpVVL8s+Lms7JNQAh6vEsvExttGgUq9hAu1Q==`; and
- `@ladybugdb/core-win32-x64@0.19.0` — `sha512-y2/IOMKmydo4ZfQPDZuZhiFC104VJQ9lwc0w1KVdvb4Z2RIUUL8/tn5QD4Uq8DUrJGxQhoEESPnlkk69cKaaDQ==`.

All six packages declare MIT licensing. Bun 1.2.23 installation and `bun
audit` reported no vulnerabilities. Exact-host workflow evidence passed native
loading and the full suite on Darwin arm64/x64 and Linux arm64/x64, plus the
explicit Windows x64 import-safe fallback. `LCLI-283.1.5` is complete; final
`LCLI-283.1.4` evidence combines the bounded Linux-x64 100 MiB scale gate
with separate concurrency/crash and five-host package gates. A strict final
manifest accepts those artifacts only when they all pass on one clean commit;
the matching-host package reports, rather than a duplicate Darwin timing run,
carry the Darwin executable-platform evidence.

## Sources

- [LadybugDB source repository](https://github.com/LadybugDB/ladybug)
- [LadybugDB bulk import](https://docs.ladybugdb.com/import/)
- [LadybugDB CSV import](https://docs.ladybugdb.com/import/csv/)
- [LadybugDB table and primary-key definitions](https://docs.ladybugdb.com/cypher/data-definition/create-table/)
- [LadybugDB hash functions](https://docs.ladybugdb.com/cypher/expressions/hash-functions/)
- [LadybugDB full-text-search extension](https://docs.ladybugdb.com/extensions/full-text-search/)
- [Bun `gc` API](https://bun.com/reference/bun/gc)
- [Bun runtime memory controls](https://bun.com/docs/runtime)
- [LadybugDB developer guide](https://docs.ladybugdb.com/developer-guide/)
- [Kùzu Graph Database Management System, CIDR 2023](https://www.vldb.org/cidrdb/papers/2023/p48-jin.pdf)
- [`@ladybugdb/core` on npm](https://www.npmjs.com/package/@ladybugdb/core)
- [LadybugDB releases](https://github.com/LadybugDB/ladybug/releases)
- [LadybugDB 0.18.2...0.18.3 comparison](https://github.com/LadybugDB/ladybug/compare/v0.18.2...v0.18.3)
- [LadybugDB 0.19.0 release](https://github.com/LadybugDB/ladybug/releases/tag/v0.19.0)

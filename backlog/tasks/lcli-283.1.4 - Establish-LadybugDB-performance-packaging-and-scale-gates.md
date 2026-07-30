---
id: LCLI-283.1.4
title: Establish LadybugDB performance packaging and scale gates
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
labels:
  - ladybugdb
  - benchmark
  - packaging
  - performance
milestone: m-13
dependencies:
  - LCLI-283.1.3
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 390000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prove that the persistent index improves repeated retrieval at acceptable startup, memory, disk, packaging, and concurrency cost across Lore supported platforms before M6 is accepted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Benchmarks report cold build, warm open, graph, query, and context latency plus memory and disk usage on versioned small and large fixtures
- [ ] #2 M6 defines quantitative regression thresholds and demonstrates a material warm-query improvement without unacceptable small-repository regression
- [ ] #3 Node and Bun distribution paths pass supported native platform install, build, smoke, and clean-uninstall tests
- [ ] #4 Single-writer and multi-reader scenarios, CLI and future long-running-process contention, crash recovery, and file-lock diagnostics are tested
<!-- AC:END -->

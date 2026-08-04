# Architecture Decision Records

This is the ADR log for **lore** — the OKF-native documentation CLI that couples
repo-resident docs to [Backlog.md](../runbooks/backlog-json-patch.md). Each
record below captures one significant, hard-to-reverse decision: the context,
the choice, and the consequences. Together they explain *why* lore is shaped the
way it is. For the design that these decisions implement, see the
[lore design spec](../specs/lore-design.md); for the broader rationale entry
point, start at the [bundle index](../index.md).

## Process

ADRs are plain markdown concept files (`type: ADR`) and are **immutable once
Accepted** — the historical record of a decision is never rewritten in place. To
change a past decision you author a **new ADR** that supersedes the old one and
run `lore supersede <old> <new>`, which sets `status: superseded`,
`superseded_by`/`supersedes` frontmatter on both records, and rewrites inbound
graph links. Statuses follow the usual lifecycle: `Proposed` → `Accepted` →
(`Deprecated` | `Superseded`). All records currently in this log are **Accepted**
as of 2026-06-21.

## Index

<!-- lore:index:begin -->
- [ADR-0001: Runtime, build & distribution](0001-runtime-build-distribution.md)
- [ADR-0002: Backlog.md integration: JSON-only via --json (fork → upstream)](0002-backlog-integration-json-only.md)
- [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md)
- [ADR-0004: CLI-first; reusable Core; SKILL.md agent bridge; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md)
- [ADR-0005: CLI contract: output modes, exit codes, error envelope](0005-cli-contract.md)
- [ADR-0006: Schema, types & templates: Zod as source of truth](0006-schema-types-templates.md)
- [ADR-0007: Validation & coherence checking](0007-validation-and-coherence.md)
- [ADR-0008: Managed task block via remark/mdast AST](0008-managed-block-remark-ast.md)
- [ADR-0009: Story↔Task coupling & status reconciliation](0009-story-task-coupling-reconciliation.md)
- [ADR-0010: Multi-consumer docs layer & link convention](0010-multi-consumer-docs-layer.md)
- [ADR-0011: Frontmatter serialization & diff stability](0011-frontmatter-serialization-stability.md)
- [ADR-0012: Backlog operational coexistence & git ownership](0012-backlog-coexistence-git-ownership.md)
- [ADR-0013: .lore/ state directory](0013-lore-state-directory.md)
- [ADR-0014: Core lore has no LLM dependency](0014-core-has-no-llm-dependency.md)
- [ADR-0015: Lightweight retrieval: full-text + graph context, no vectors](0015-lightweight-retrieval-no-vectors.md)
- [ADR-0016: Confluence publish: one-way, Cloud/ADF, deferred](0016-confluence-one-way-publish-deferred.md)
- [ADR-0017: Interactive `lore init` wizard, TTY-gated](0017-interactive-init-wizard-tty-gated.md)
- [ADR-0018: Persistent local graph projection with LadybugDB](0018-persistent-local-graph-projection-with-ladybugdb.md)
<!-- lore:index:end -->

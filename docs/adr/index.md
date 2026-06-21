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

| ADR | Title | Status |
|---|---|---|
| [0001](0001-runtime-build-distribution.md) | Runtime, build & distribution | Accepted |
| [0002](0002-backlog-integration-json-only.md) | Backlog.md integration: JSON-only via `--json` (fork → upstream) | Accepted |
| [0003](0003-okf-substrate.md) | OKF as the documentation substrate | Accepted |
| [0004](0004-cli-first-skill-bridge-mcp-deferred.md) | CLI-first; reusable Core; SKILL.md agent bridge; MCP deferred | Accepted |
| [0005](0005-cli-contract.md) | CLI contract: output modes, exit codes, error envelope | Accepted |
| [0006](0006-schema-types-templates.md) | Schema, types & templates: Zod as source of truth | Accepted |
| [0007](0007-validation-and-coherence.md) | Validation & coherence checking | Accepted |
| [0008](0008-managed-block-remark-ast.md) | Managed task block via remark/mdast AST | Accepted |
| [0009](0009-story-task-coupling-reconciliation.md) | Story ↔ Task coupling & status reconciliation | Accepted |
| [0010](0010-multi-consumer-docs-layer.md) | Multi-consumer docs layer & link convention | Accepted |
| [0011](0011-frontmatter-serialization-stability.md) | Frontmatter serialization & diff stability | Accepted |
| [0012](0012-backlog-coexistence-git-ownership.md) | Backlog operational coexistence & git ownership | Accepted |
| [0013](0013-lore-state-directory.md) | `.lore/` state directory | Accepted |
| [0014](0014-core-has-no-llm-dependency.md) | Core lore has no LLM dependency | Accepted |
| [0015](0015-lightweight-retrieval-no-vectors.md) | Lightweight retrieval: full-text + graph context, no vectors | Accepted |
| [0016](0016-confluence-one-way-publish-deferred.md) | Confluence publish: one-way, Cloud/ADF, deferred | Accepted |

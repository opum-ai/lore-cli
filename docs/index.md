---
type: Reference
title: lore documentation
description: Root index for the lore documentation bundle — a thin, OKF-native documentation CLI (Bun + TypeScript) that couples repo-resident docs to Backlog.md and serves them to agents and humans. This is the progressive-disclosure entry point into the bundle's references, design, decisions, and runbooks.
tags:
  - lore
  - okf
  - documentation
  - cli
  - backlog
  - index
summary: "The OKF root index and reading hub for lore's documentation bundle: start here, then follow links into architecture, references, ADRs, and runbooks."
timestamp: 2026-06-21T00:00:00Z
okf_version: "0.1"
---

# lore documentation

**lore** is a thin, OKF-native documentation CLI — Bun + TypeScript, released
on npm as `@opum-ai/lore@0.2.0` (bin `lore`). It makes repo-resident markdown
a first-class, agent-readable [Open Knowledge Format](reference/okf-conformance.md)
bundle, couples that bundle to [Backlog.md](runbooks/backlog-json-patch.md)
tasks, and serves it to both humans and coding agents through a deterministic,
non-interactive CLI. The repository is the single source of truth.
Its canonical GitHub location is
[`opum-ai/lore-cli`](https://github.com/opum-ai/lore-cli), which is **private** —
the published package is public, the source repository is not, so that URL is
not a destination to send a reader to.

lore is deliberately **thin** and **zero-config**: it does not reimplement
Backlog.md, Confluence, or the documentation consumers (MkDocs, Docusaurus,
Obsidian). Its core is deterministic with **no LLM dependency** — every command
is reproducible, idempotent, CI- and agent-safe (non-interactive by default,
stable exit codes, machine-readable `--json`). The agent bridge is a generated
`.claude/skills/lore/SKILL.md` plus `lore instructions`; an MCP server is a
secondary, deferred transport over the same core.

This file is the OKF bundle's reserved **root `index.md`** — the only file in the
bundle that carries `okf_version`. It doubles as the Obsidian hub, the
MkDocs/Docusaurus landing page, and the file lore's own index generator will
later manage. Below is a progressive-disclosure map of the bundle: skim the
sections, then follow a link.

> **New here?** Read the [lore design spec](specs/lore-design.md) for the whole
> picture in one document, or jump to
> [agent onboarding](runbooks/agent-onboarding.md) to wire lore into a coding
> agent.

## Current control set

Use these records before inferring task or release state:

- [Maintain Lore CLI documentation authority](stories/maintain-lore-cli-documentation-authority.md)
  — the active owner Story for release truth, handover lifecycle, and coupling.
- [0001 — Runtime, build & distribution](adr/0001-runtime-build-distribution.md)
  — the controlling distribution decision.
- [lore design](specs/lore-design.md) — the controlling end-to-end Spec.
- [Lore CLI release truth](reference/lore-cli-release-truth.md) — the immutable
  tag, workflow, registry, install, and owner-control evidence for `0.2.0`.
- [Lore CLI documentation ownership](reference/lore-cli-documentation-ownership.md)
  — local and cross-repository authority boundaries.
- [Lore CLI handover](runbooks/lore-cli-handover.md) — the only current,
  context-free fresh-session route.

## Architecture & design

How lore is built and how its pieces fit together.

- [lore design spec](specs/lore-design.md) — the end-to-end design: command
  surface, core data flow, the Backlog.md coupling, and how the OKF bundle is
  produced and kept coherent.
- [Local graph platform roadmap](specs/local-graph-platform-roadmap.md) — the
  completed M6–M8 sequence for indexed `graph`/`query`/`context`, packaging
  gates, the local graph explorer, workspace impact, and provenance.
- [Architecture](reference/architecture.md) — the deterministic-core /
  thin-transport shape: `core/` library, the CLI as primary transport, the
  Backlog and Confluence adapters, and `.lore/` state.
- [Tech stack](reference/tech-stack.md) — Bun (pinned), TypeScript, the
  exact-pinned Commander parser and Lore-owned lifecycle/output seams, the
  `js-yaml` frontmatter boundary, mdast parsing, Zod, and approved generic
  primitive delegations, plus the `bun build --compile` + dual-artifact npm
  distribution.
- [Dependency boundary audit](reference/dependency-boundary-audit.md) — approved
  `string-width`, `ipaddr.js`, `github-slugger`, and Zod consolidation tasks;
  package acceptance gates; deferred filesystem/frontmatter investigations; and
  the behavior that intentionally remains Lore-owned.

## References

Stable, factual concepts: contracts, schemas, and conformance facts that other
docs and tools rely on.

- [CLI surface](reference/cli-surface.md) — every `lore` command, its flags,
  and what it does (`init`, `new`, `link`, `sync`, `check`, `validate`,
  `query`, `context`, `graph`, `replace`, `rename`, `supersede`, `scaffold`,
  `instructions`).
- [CLI contract](reference/cli-contract.md) — the additive-only output and
  behavior contract: `--json` / `--plain` / pretty precedence, the
  `{schemaVersion, kind, data}` envelope, semantic exit codes, the JSON error
  envelope, and `NO_COLOR`.
- [Backlog JSON schema](reference/backlog-json-schema.md) — the canonical
  `{schemaVersion, kind, data}` envelopes lore parses from Backlog.md's
  `--json` output for `task list`, `task view`, and `search`.
- [Backlog CLI contract](reference/backlog-cli-contract.md) — exactly how lore
  drives Backlog.md and the optional jira-cli backend: the `--json` capability probe and min version, reading via
  list/view/search, writing via `task create`/`edit`, the `doc:<conceptId>`
  back-reference label, and the coexistence rules (lore is the sole committer of
  `backlog/`).
- [Consumer compatibility](reference/consumer-compatibility.md) — how the
  bundle renders across GitHub, Obsidian, MkDocs, and Docusaurus, and what lore
  guarantees (and does not) across renderers.
- [Portable Markdown](reference/portable-markdown.md) — the cross-link rule
  (relative, URL-encoded, `.md`-suffixed, no leading slash, no wikilinks) and
  the portability lint that enforces it.
- [OKF conformance](reference/okf-conformance.md) — how lore consumes and
  produces OKF 0.2 and 0.1, separates the permissive conformance floor from
  Lore-specific gates, and classifies the versioned fields.
- [Lore CLI release truth](reference/lore-cli-release-truth.md) — current
  version, tag, artifact, registry-install, and owner-gate evidence.
- [Lore CLI documentation ownership](reference/lore-cli-documentation-ownership.md)
  — component ownership, external authority routes, and historical provenance
  boundaries.
- [MCP tools](reference/mcp-tools.md) — the **on-hold** local MCP design:
  the tools and resources it will expose over the same core functions.

## ADRs

The significant, hard-to-reverse decisions behind lore — context, choice, and
consequences. See the [ADR log](adr/index.md) for the full, ordered index.

- [ADR log](adr/index.md) — index of all architecture decision records and the
  ADR process (immutable once Accepted; supersede via a new ADR).
- [0001 — Runtime, build & distribution](adr/0001-runtime-build-distribution.md)
- [0002 — Backlog.md integration: JSON-only via `--json`](adr/0002-backlog-integration-json-only.md)
- [0003 — OKF as the documentation substrate](adr/0003-okf-substrate.md)
- [0004 — CLI-first; reusable Core; SKILL.md bridge; MCP deferred](adr/0004-cli-first-skill-bridge-mcp-deferred.md)
- [0005 — CLI contract: output modes, exit codes, error envelope](adr/0005-cli-contract.md)
- [0006 — Schema, types & templates: Zod as source of truth](adr/0006-schema-types-templates.md)
- [0007 — Validation & coherence checking](adr/0007-validation-and-coherence.md)
- [0008 — Managed task block via remark/mdast AST](adr/0008-managed-block-remark-ast.md)
- [0009 — Story ↔ Task coupling & status reconciliation](adr/0009-story-task-coupling-reconciliation.md)
- [0010 — Multi-consumer docs layer & link convention](adr/0010-multi-consumer-docs-layer.md)
- [0011 — Frontmatter serialization & diff stability](adr/0011-frontmatter-serialization-stability.md)
- [0012 — Backlog operational coexistence & git ownership](adr/0012-backlog-coexistence-git-ownership.md)
- [0013 — `.lore/` state directory](adr/0013-lore-state-directory.md)
- [0014 — Core lore has no LLM dependency](adr/0014-core-has-no-llm-dependency.md)
- [0015 — Lightweight retrieval: full-text + graph context, no vectors — superseded](adr/0015-lightweight-retrieval-no-vectors.md)
- [0016 — Confluence publish: one-way, Cloud/ADF, deferred](adr/0016-confluence-one-way-publish-deferred.md)
- [0017 — Interactive init wizard, TTY-gated](adr/0017-interactive-init-wizard-tty-gated.md)
- [0018 — Persistent local graph projection with LadybugDB](adr/0018-persistent-local-graph-projection-with-ladybugdb.md)

## Runbooks

Operational procedures for working on and with lore.

- [Backlog.md `--json` patch](runbooks/backlog-json-patch.md) — the historical
  fork/upstreaming procedure plus the completed migration from upstream PR
  #790's pinned merge commit to published Backlog.md `v1.49.0`.
- [Agent onboarding](runbooks/agent-onboarding.md) — how a coding agent (e.g.
  Claude Code) discovers and uses lore: the generated `SKILL.md`, the CLAUDE.md
  nudge, and `lore instructions`.
- [Lore CLI handover](runbooks/lore-cli-handover.md) — the only current,
  context-free route from a fresh session to live owner evidence.
- [Historical Lore CLI development kickoff](reference/historical-lore-cli-development-kickoff.md)
  — non-executable provenance for the superseded development cursor.
- [Docker E2E testing environment](runbooks/docker-e2e-testing-environment.md) —
  build real `lore`/`backlog` binaries and exercise the full command surface
  against a real, mutating backlog project; how to run it and triage findings.
- [Release publishing](runbooks/release-publishing.md) — how to configure npm
  trusted publishing and cut a release once the dry-run pipeline is verified.
- [Historical upstream Backlog.md JSON tag watch](reference/historical-upstream-backlog-json-tag-watch.md)
  — non-executable provenance for the completed LCLI-254/LCLI-253 dependency
  gate.

---

*This bundle is a valid OKF v0.1 bundle on its own — `cat`-readable,
GitHub-renderable, and consumable with or without lore installed. Cross-links
are relative, URL-encoded, and `.md`-suffixed so they resolve identically on
GitHub, in Obsidian, and under MkDocs/Docusaurus.*

<!-- lore:index:begin -->
- [adr](adr/index.md)
- [reference](reference/index.md)
- [runbooks](runbooks/index.md)
- [specs](specs/index.md)
- [stories](stories/index.md)
<!-- lore:index:end -->

---
type: ADR
title: "ADR-0016: Confluence publish: one-way, Cloud/ADF, deferred"
description: >-
  Define the Confluence publish channel as a one-way, repo-to-Confluence target
  on Cloud/ADF (v2 REST), isolated in an adapter with zero core dependency, made
  idempotent via content-hash in sync-state.json, marked on every page with a
  provenance banner, and rendering unresolved links as plain text plus a warning;
  the renderer and implementation are deferred to milestones M7/M8.
tags: [architecture, confluence, publish, adapter, deferred, idempotency, links]
summary: Confluence is a one-way repo-to-Cloud/ADF publish target via an isolated, idempotent adapter with provenance banners, deferred to M7/M8.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0016: Confluence publish: one-way, Cloud/ADF, deferred

## Status

Accepted — 2026-06-21.

Refines the v0.2 spec (`lore-spec.md` §7, §10.3) into locked decisions and an
explicit deferral. The renderer and implementation are scheduled as milestones
**M7** (Confluence publish) and **M8** (Confluence mirror), not in the initial
release. Builds on [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md)
(the bundle this adapter consumes), [ADR-0004: CLI-first; SKILL bridge; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md)
(the surface that invokes it), and the portable-link rules in
[portable-markdown.md](../reference/portable-markdown.md) that the link rewriter
must resolve. The repo-is-source-of-truth stance it depends on is the same one
asserted in [ADR-0002: Backlog.md integration via JSON only](0002-backlog-integration-json-only.md).

## Context

`lore` keeps documentation repo-resident and treats the repo as the single
source of truth. Many organizations nonetheless need those docs visible in
**Confluence** for non-engineering stakeholders who do not browse the repo. The
v0.2 spec proposed a Confluence sync adapter and left three open questions: the
direction of sync, the Cloud-vs-Server target (which renderer to build), and how
much feature parity to chase.

The constraints that shape the answer:

- **Repo is source of truth.** Any sync that lets Confluence edits flow back into
  the repo would create two authorities and an unwinnable merge problem. That
  contradicts the foundational stance shared across the design.
- **Two incompatible Confluence write surfaces exist.** Cloud uses **ADF**
  (Atlassian Document Format, JSON) over the **v2 REST API**; Server/Data Center
  uses **storage format** (XHTML) over v1 REST. They require different renderers.
  Atlassian Cloud is now the dominant, actively developed target.
- **Confluence is not a competitor to reproduce.** Collaborative editing,
  permissions, WYSIWYG, and bidirectional sync are exactly what Confluence is for
  and are explicit `lore` non-goals — re-implementing them is out of scope.
- **The adapter must not contaminate the core.** Core `lore` (`src/core/`) is
  deterministic and dependency-light; a network- and credential-bound publish
  path must be loadable only when invoked, with no import edge from core.
- **The publish path runs in CI on every merge.** It must be cheap and safe to
  re-run: no redundant API calls, no duplicate pages, no surprise writes.
- **It is not on the critical path.** The high-value core is the OKF bundle plus
  the Backlog.md coupling; Confluence is an isolated downstream channel that can
  lag without blocking anything else.

## Decision

1. **One-way only: repo → Confluence.** Confluence is a publish *target*, never a
   source. Edits made in Confluence are overwritten on the next publish of a
   changed source doc. There is **no bidirectional sync and no Confluence feature
   parity** — a deliberate, permanent non-goal, not a deferred feature. The
   `docs/` OKF bundle remains the sole authority.

2. **Cloud/ADF (v2 REST) is the chosen target.** The renderer to be built emits
   **ADF** against the Confluence **Cloud v2** API. Server/DC **storage format
   (XHTML)** is **deferred, not dropped**: it remains reachable behind a
   `confluence.format` config switch (`"adf"` default vs `"storage"`), so the
   renderer interface is designed for two backends from the start even though
   only the ADF backend ships first.

3. **Isolated adapter, zero core dependency.** All Confluence logic lives in
   `src/adapters/confluence.ts`, loaded only when `lore publish confluence` is
   invoked. There is **no import from `src/core/` into the adapter's concerns and
   no import from the adapter into core** — core has no knowledge that Confluence
   exists. This keeps the network/credential surface, the `fetch`-based REST
   client, and ADF rendering entirely off the deterministic core path.

4. **Idempotent via content-hash in `sync-state.json`.** `.lore/sync-state.json`
   maps each doc path → `{ content_hash, page_id, version, space }`. On publish,
   the adapter hashes the rendered body per doc; if the hash is unchanged it
   **skips with no API call**; otherwise it `PUT`s (version + 1) an existing page
   or `POST`s a new one, then persists the new hash, page id, and version. This
   makes "publish on every merge" cheap and prevents duplicate-page creation.

5. **Provenance banner on every page.** Each published page is prefixed with an
   injected info panel naming the source doc, the repo, and the commit SHA, and
   stating that the repo is the source of truth and edits will be overwritten.
   This makes the one-way contract self-documenting for Confluence readers.

6. **Unresolved links degrade safely.** The link rewriter resolves OKF
   bundle-relative cross-links (the relative, URL-encoded, `.md`-suffixed form
   from [portable-markdown.md](../reference/portable-markdown.md)) against
   `sync-state.json` to Confluence page links. A target that is not yet published
   (or does not exist) renders as **plain text plus a tracked warning** —
   **never** a Confluence broken-link macro. Publishing is incremental, so the
   first publish of a doc whose neighbors are not yet published must not emit
   broken UI.

7. **Implementation deferred to M7/M8.** M7 delivers the publish path
   (create/update, hash cache, banner, ADF rendering); M8 hardens it into a
   production mirror (link rewriting at scale, directory→ancestry hierarchy,
   `--prune`, frontmatter→labels/page-properties). The intended contract is fixed
   now so the adapter can be built later without re-litigating these choices.

## Consequences

### Positive

- **No second source of truth.** One-way publish keeps the repo authoritative
  and sidesteps the merge/conflict complexity that bidirectional sync would force.
- **Core stays clean and deterministic.** With zero core dependency on Confluence,
  the network/credential surface cannot leak into the deterministic core or its
  tests, and the adapter can be swapped (e.g. for the Atlassian MCP) without
  touching core.
- **Cheap, safe re-runs.** Content-hashing in `sync-state.json` means an
  unchanged doc costs zero API calls and re-running publish never duplicates
  pages — safe for CI on every merge and for agent loops.
- **Self-documenting contract.** The provenance banner tells Confluence readers
  exactly where the content comes from and that local edits are transient.
- **No broken UI during incremental rollout.** Degrading unresolved links to
  plain text + warning means partially-published bundles still render cleanly.
- **Deferral without blocking.** Pre-specifying the contract lets M0–M5 ship the
  high-value core while Confluence lands later, or is replaced entirely, with no
  rework of upstream milestones.

### Negative / tradeoffs

- **Confluence edits are lost.** Anyone editing in Confluence will have their
  changes overwritten on the next source change. The provenance banner mitigates
  this by stating it on every page, but it remains a real behavioral constraint.
- **No round-trip workflow.** Teams that want to author in Confluence and pull
  back into the repo are unsupported by design; they must author in the repo.
- **A second renderer awaits Server/DC users.** Choosing ADF/Cloud first means
  Server/Data Center deployments cannot publish until the deferred `storage`
  backend behind `confluence.format` is implemented.
- **Sync-state is a real artifact to maintain.** `sync-state.json` must be
  committed and kept coherent with Confluence; a drifted or hand-edited state
  file can cause skipped updates or orphaned pages until reconciled.
- **No Confluence-side liveness checking until publish runs.** Link resolution is
  resolved against `sync-state.json`, not by querying Confluence, so a page
  deleted in Confluence is only detected on the next publish/`--prune` pass.
- **Deferred value.** The publish channel is not available in the initial
  release; organizations that need Confluence on day one must wait for M7 or use
  an external bridge in the interim.

## Alternatives considered

- **Bidirectional sync (repo ↔ Confluence).** Rejected outright as a permanent
  non-goal. It creates two authorities, demands conflict resolution and
  field-by-field merge, and reproduces the collaborative-editing problem
  Confluence already solves — directly contradicting repo-is-source-of-truth.

- **Server/DC storage format as the first (or only) target.** Rejected as the
  default. Atlassian Cloud is the dominant, actively developed platform; building
  the XHTML storage renderer first would optimize for the shrinking deployment.
  Kept reachable behind the `confluence.format` switch so it is deferred, not
  dropped.

- **Coupling Confluence into core / always loading the adapter.** Rejected.
  Pulling the REST client, credential handling, and ADF renderer into the
  deterministic core would taint its dependency surface and tests for a feature
  most invocations never touch. Lazy-loaded isolation keeps core pure.

- **Always create/update (no content-hash skip).** Rejected. It would issue an
  API write for every doc on every run, risking rate limits, noisy version
  histories, and far slower CI. The `sync-state.json` hash makes unchanged docs
  free.

- **Rendering unresolved links as Confluence broken-link macros (or failing the
  publish).** Rejected. Incremental publishing routinely runs before all
  neighbors exist; a broken-link macro produces alarming UI and failing the run
  blocks the rest of the bundle. Plain text + a tracked warning surfaces the gap
  without breaking the page or the run.

- **Using the Atlassian MCP server instead of direct REST.** Not chosen as the
  default but not foreclosed: because the adapter is fully isolated with zero core
  dependency, an MCP-backed implementation can substitute for the `fetch`-based
  REST client behind the same adapter boundary without affecting core or the CLI
  contract.

- **Letting `lore` re-implement Confluence-like features (permissions, WYSIWYG,
  comments).** Rejected as scope `lore` explicitly does not pursue; those are
  precisely what Confluence is bought for, and competing with them adds no value.

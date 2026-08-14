---
type: Story
title: Build the persistent local graph platform
tags:
  - graph
  - indexing
  - explorer
  - workspace
summary: Deliver the local indexed graph, explorer, workspace, impact, snapshot, and provenance capabilities.
timestamp: 2026-08-03T16:05:06.838Z
status: done
tasks:
  - lcli-283
  - lcli-283.1
  - lcli-283.1.1
  - lcli-283.1.2
  - lcli-283.1.3
  - lcli-283.1.4
  - lcli-283.1.5
  - lcli-283.2
  - lcli-283.2.1
  - lcli-283.2.2
  - lcli-283.2.3
  - lcli-286
  - lcli-283.3
  - lcli-283.3.1
  - lcli-283.3.2
  - lcli-283.3.3
  - lcli-283.3.4
  - lcli-284
  - lcli-285
  - lcli-287
  - lcli-288
  - lcli-301
  - lcli-302
  - lcli-303
  - lcli-317
  - lcli-318
---

# Build the persistent local graph platform

## Goal

Deliver the repository-local persistent graph, indexed retrieval, static
explorer, workspace identity, bounded impact, and snapshot provenance
capabilities while keeping Git-authored Markdown authoritative.

## Acceptance criteria

- LadybugDB remains a rebuildable local projection behind verified lifecycle
  and fallback boundaries.
- Graph, query, context, workspace, impact, and snapshot operations remain
  deterministic and source-preserving.
- The static explorer remains offline, accessible, and artifact-bounded.
- Completed graph-roadmap tasks retain their exact delivery evidence.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-283](../../backlog/tasks/lcli-283%20-%20Build-the-persistent-local-graph-platform.md) | Build the persistent local graph platform | Done |
| [LCLI-283.1](../../backlog/tasks/lcli-283.1%20-%20Adopt-LadybugDB-for-persistent-local-indexing.md) | Adopt LadybugDB for persistent local indexing | Done |
| [LCLI-283.1.1](../../backlog/tasks/lcli-283.1.1%20-%20Freeze-the-LadybugDB-projection-schema-and-lifecycle.md) | Freeze the LadybugDB projection schema and lifecycle | Done |
| [LCLI-283.1.2](../../backlog/tasks/lcli-283.1.2%20-%20Implement-the-deterministic-LadybugDB-projection-lifecycle.md) | Implement the deterministic LadybugDB projection lifecycle | Done |
| [LCLI-283.1.3](../../backlog/tasks/lcli-283.1.3%20-%20Route-graph-query-and-context-through-indexed-retrieval.md) | Route graph query and context through indexed retrieval | Done |
| [LCLI-283.1.4](../../backlog/tasks/lcli-283.1.4%20-%20Establish-LadybugDB-performance-packaging-and-scale-gates.md) | Establish LadybugDB performance packaging and scale gates | Done |
| [LCLI-283.1.5](../../backlog/tasks/lcli-283.1.5%20-%20Audit-and-qualify-the-supported-LadybugDB-dependency-version.md) | Audit and qualify the supported LadybugDB dependency version | Done |
| [LCLI-283.2](../../backlog/tasks/lcli-283.2%20-%20Ship-the-local-graph-explorer.md) | Ship the local graph explorer | Done |
| [LCLI-283.2.1](../../backlog/tasks/lcli-283.2.1%20-%20Freeze-the-graph-explorer-data-and-interaction-contract.md) | Freeze the graph explorer data and interaction contract | Done |
| [LCLI-283.2.2](../../backlog/tasks/lcli-283.2.2%20-%20Build-the-static-graph-explorer-and-CLI-entrypoint.md) | Build the static graph explorer and CLI entrypoint | Done |
| [LCLI-283.2.3](../../backlog/tasks/lcli-283.2.3%20-%20Harden-explorer-accessibility-performance-and-offline-packaging.md) | Harden explorer accessibility performance and offline packaging | Done |
| [LCLI-286](../../backlog/tasks/lcli-286%20-%20Delegate-SSRF-address-parsing-and-CIDR-matching-to-ipaddr.js.md) | Delegate SSRF address parsing and CIDR matching to ipaddr.js | Done |
| [LCLI-283.3](../../backlog/tasks/lcli-283.3%20-%20Add-LadybugDB-enabled-local-graph-capabilities.md) | Add LadybugDB-enabled local graph capabilities | Done |
| [LCLI-283.3.1](../../backlog/tasks/lcli-283.3.1%20-%20Define-explicit-local-workspaces-and-cross-repository-identity.md) | Define explicit local workspaces and cross-repository identity | Done |
| [LCLI-283.3.2](../../backlog/tasks/lcli-283.3.2%20-%20Index-and-retrieve-across-workspace-repositories.md) | Index and retrieve across workspace repositories | Done |
| [LCLI-283.3.3](../../backlog/tasks/lcli-283.3.3%20-%20Add-bounded-path-and-impact-operations.md) | Add bounded path and impact operations | Done |
| [LCLI-283.3.4](../../backlog/tasks/lcli-283.3.4%20-%20Add-snapshot-change-and-provenance-workflows.md) | Add snapshot change and provenance workflows | Done |
| [LCLI-284](../../backlog/tasks/lcli-284%20-%20Migrate-CLI-argument-parsing-and-routing-to-Commander.md) | Migrate CLI argument parsing and routing to Commander | Done |
| [LCLI-285](../../backlog/tasks/lcli-285%20-%20Delegate-terminal-display-width-calculation-to-string-width.md) | Delegate terminal display-width calculation to string-width | Done |
| [LCLI-287](../../backlog/tasks/lcli-287%20-%20Delegate-GitHub-heading-anchor-slugging-to-github-slugger.md) | Delegate GitHub heading-anchor slugging to github-slugger | Done |
| [LCLI-288](../../backlog/tasks/lcli-288%20-%20Consolidate-Lore-config-shape-validation-on-Zod.md) | Consolidate Lore config shape validation on Zod | Done |
| [LCLI-301](../../backlog/tasks/lcli-301%20-%20Remove-Ladybug-install-script-approval-from-global-Lore-installation.md) | Remove Ladybug install-script approval from global Lore installation | Done |
| [LCLI-302](../../backlog/tasks/lcli-302%20-%20Native-LadybugDB-backend-never-activates-in-the-compiled-published-lore-binary-every-graph-family-command-silently-falls-back-to-the-reference-index.md) | Native LadybugDB backend never activates in the compiled/published lore binary -- every graph-family command silently falls back to the reference index | Done |
| [LCLI-303](../../backlog/tasks/lcli-303%20-%20Unknown-workspace-repository-member-id-crashes-uncaught-exit-1-instead-of-a-clean-validation-error-exit-6.md) | Unknown --workspace --repository member id crashes uncaught (exit 1) instead of a clean validation error (exit 6) | Done |
| [LCLI-317](../../backlog/tasks/lcli-317%20-%20LCLI-302s-native-LadybugDB-fix-is-not-reliable-across-fixture-filesystem-shapes-0-3-fresh-fixture-activations-vs-4-4-real-bundle-activations-on-the-identical-installed-binary.md) | LCLI-302's native LadybugDB fix is not reliable across fixture/filesystem shapes -- 0/3 fresh-fixture activations vs 4/4 real-bundle activations on the identical installed binary | Done |
| [LCLI-318](../../backlog/tasks/lcli-318%20-%20LCLI-303s-%60unknown-workspace-member-id-%60-validation-message-does-not-fire-in-single-member-workspaces-masked-by-an-earlier-unrelated-validation-failure.md) | LCLI-303's `unknown workspace member <id>` validation message does not fire in single-member workspaces -- masked by an earlier, unrelated validation failure | Done |
<!-- lore:tasks:end -->

## Notes

The controlling design is
[ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md),
sequenced by the
[Local graph platform roadmap](../specs/local-graph-platform-roadmap.md).

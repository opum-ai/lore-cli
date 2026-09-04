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
| [LCLI-283](../../.quest/tasks/LCLI-283.json) | Build the persistent local graph platform | Done |
| [LCLI-380](../../.quest/tasks/LCLI-380.json) | Adopt LadybugDB for persistent local indexing | Done |
| [LCLI-381](../../.quest/tasks/LCLI-381.json) | Freeze the LadybugDB projection schema and lifecycle | Done |
| [LCLI-382](../../.quest/tasks/LCLI-382.json) | Implement the deterministic LadybugDB projection lifecycle | Done |
| [LCLI-383](../../.quest/tasks/LCLI-383.json) | Route graph query and context through indexed retrieval | Done |
| [LCLI-384](../../.quest/tasks/LCLI-384.json) | Establish LadybugDB performance packaging and scale gates | Done |
| [LCLI-385](../../.quest/tasks/LCLI-385.json) | Audit and qualify the supported LadybugDB dependency version | Done |
| [LCLI-386](../../.quest/tasks/LCLI-386.json) | Ship the local graph explorer | Done |
| [LCLI-387](../../.quest/tasks/LCLI-387.json) | Freeze the graph explorer data and interaction contract | Done |
| [LCLI-388](../../.quest/tasks/LCLI-388.json) | Build the static graph explorer and CLI entrypoint | Done |
| [LCLI-389](../../.quest/tasks/LCLI-389.json) | Harden explorer accessibility performance and offline packaging | Done |
| [LCLI-286](../../.quest/tasks/LCLI-286.json) | Delegate SSRF address parsing and CIDR matching to ipaddr.js | Done |
| [LCLI-390](../../.quest/tasks/LCLI-390.json) | Add LadybugDB-enabled local graph capabilities | Done |
| [LCLI-391](../../.quest/tasks/LCLI-391.json) | Define explicit local workspaces and cross-repository identity | Done |
| [LCLI-392](../../.quest/tasks/LCLI-392.json) | Index and retrieve across workspace repositories | Done |
| [LCLI-393](../../.quest/tasks/LCLI-393.json) | Add bounded path and impact operations | Done |
| [LCLI-394](../../.quest/tasks/LCLI-394.json) | Add snapshot change and provenance workflows | Done |
| [LCLI-284](../../.quest/tasks/LCLI-284.json) | Migrate CLI argument parsing and routing to Commander | Done |
| [LCLI-285](../../.quest/tasks/LCLI-285.json) | Delegate terminal display-width calculation to string-width | Done |
| [LCLI-287](../../.quest/tasks/LCLI-287.json) | Delegate GitHub heading-anchor slugging to github-slugger | Done |
| [LCLI-288](../../.quest/tasks/LCLI-288.json) | Consolidate Lore config shape validation on Zod | Done |
| [LCLI-301](../../.quest/tasks/LCLI-301.json) | Remove Ladybug install-script approval from global Lore installation | Done |
| [LCLI-302](../../.quest/tasks/LCLI-302.json) | Native LadybugDB backend never activates in the compiled/published lore binary -- every graph-family command silently falls back to the reference index | Done |
| [LCLI-303](../../.quest/tasks/LCLI-303.json) | Unknown --workspace --repository member id crashes uncaught (exit 1) instead of a clean validation error (exit 6) | Done |
| [LCLI-317](../../.quest/tasks/LCLI-317.json) | LCLI-302's native LadybugDB fix is not reliable across fixture/filesystem shapes -- 0/3 fresh-fixture activations vs 4/4 real-bundle activations on the identical installed binary | Done |
| [LCLI-318](../../.quest/tasks/LCLI-318.json) | LCLI-303's `unknown workspace member <id>` validation message does not fire in single-member workspaces -- masked by an earlier, unrelated validation failure | Done |
<!-- lore:tasks:end -->

## Notes

The controlling design is
[ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md),
sequenced by the
[Local graph platform roadmap](../specs/local-graph-platform-roadmap.md).

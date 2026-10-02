---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: The Lore pane reads only the session's own repository bundle in v1 (DEC-133)
tags:
  - lore-pane
  - mod
  - lcli-664
  - dec-133
summary: "DEC-133 A: v1 reads only the session's own repository; workspace scope follows once a Lore workspace manifest loads."
timestamp: 2026-10-02T18:35:14.281Z
status: stable
---

# ADR-0027: The Lore pane reads only the session's own repository bundle in v1 (DEC-133)

## Status

**Accepted — 2026-10-02 (DEC-133 A).** The operator selected, verbatim: **"A: this repo first
(Recommended)"**. Relayed by `opum-doc` as `ODOC-OP-2026-10-02-12` (seq 158, 2026-10-02T18:25:27Z;
acked 2026-10-02T18:26:04.519Z) and read here from opum-agent's own tracker at `origin/dev`,
`.quest/planning.json` DEC-133 (`accepted`), rather than taken from the relay.

## Context

The design brief's second open question asked whether the pane reads one repository or a fleet. The
two arms were: **A**, v1 reads only the session's own repository bundle, with workspace scope a
follow-up; **B**, build the read-only workspace scope now against a fixture workspace, appearing when
a real manifest loads. A Lore workspace manifest reads several repositories' bundles together, and the
one named in the question — `opum-family` — currently fails to load: `lore query --workspace
.lore/workspaces/opum-family.json` exits 6 with "workspace member lore-api could not be validated"
(premise checked by `opum-doc` at 2026-10-02T16:46Z; it is that repository's open item, not this
one's).

## Decision

**The pane reads only the session's own repository bundle in v1.** Its root is the session cwd's git
toplevel, and every surface — Browse, Read, Search, New, Edit — addresses that repository. No
workspace scope, no cross-repository reads, and no scope chrome ships in v1.

Workspace scope remains a follow-up, triggered by a Lore workspace manifest that loads. This decision
does not build toward it beyond keeping the module's root resolution in one place; it also does not
claim the opum-family manifest will be fixed, which is `opum-doc`'s.

## Consequences

- Every shipped control works and is testable end to end against one repository: the module's engine
  tests mount the pane against a repository fixture and never depend on a second bundle.
- The reference's "repository-only scope in v1" is now a decided boundary rather than the module's own
  choice, and the workspace question is settled for this release: it is not an open operator question
  any more, and no chrome is built for it.
- A later workspace arm changes the root resolution and the read paths, and would arrive as its own
  decision — not as an option left open in this one.
- The pane's existing refs toggle (`--across-refs`, reading open pull requests of the same repository)
  is unaffected: it reads the repository's own bundle across refs, not other repositories.

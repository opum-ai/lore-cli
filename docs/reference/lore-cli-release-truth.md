---
type: Reference
title: Lore CLI release truth
tags:
  - release
  - truth
  - evidence
  - npm
summary: Record the evidence that distinguishes implemented release mechanics from an immutable public Lore CLI release.
timestamp: 2026-08-03T16:05:16.512Z
---

# Lore CLI release truth

This record distinguishes implemented and qualified release mechanics from an
actual public release. The [Release publishing](../runbooks/release-publishing.md)
runbook is a procedure; check this record and its owner evidence before making
an availability claim.

## Details

### Current state

As verified on 2026-08-03, Lore CLI is **unreleased**:

- the root package and all five platform package manifests still use the
  placeholder version `0.0.0`;
- the local repository and GitHub repository have no release tag;
- GitHub has no Lore release object;
- the npm registry returns `404 Not Found` for `@salient-data/lore`;
- a clean `npx @salient-data/lore@<version> --version` registry install is
  therefore impossible; and
- LCLI-278 remains `To Do` because the required out-of-file publication control
  needs a repository-owner decision.

LCLI-253 is `Done`: Lore now requires the published JSON-capable Backlog.md
release at or past `1.49.0`. That closes the upstream dependency gate but does
not publish Lore itself.

### Evidence required to call Lore released

Treat Lore as released only when all of these observations agree:

1. every package manifest and launcher pin uses the same non-placeholder
   version;
2. an immutable Git tag identifies the exact source commit;
3. release workflow evidence identifies the exact artifacts built from that
   commit;
4. all six expected npm packages exist at that version;
5. a clean registry install executes and reports that exact version; and
6. LCLI-253 remains Done while LCLI-278 has an accepted, completed owner
   disposition for the publication gate.

Planned commands, passing dry runs, package tarballs, an open pull request, or
a release checklist are readiness evidence only. None independently proves
public availability.

### Owner records

- [ADR-0001](../adr/0001-runtime-build-distribution.md) owns the distribution
  architecture.
- [Lore design](../specs/lore-design.md) owns the end-to-end CLI design.
- [Release publishing](../runbooks/release-publishing.md) owns the operating
  procedure.
- LCLI-253 owns the published Backlog.md dependency migration evidence.
- LCLI-278 owns the unresolved repository-administration control.
- The [Lore CLI handover](../runbooks/lore-cli-handover.md) routes a fresh
  session to these live sources without copying a task cursor.

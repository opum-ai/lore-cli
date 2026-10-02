---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: The Lore pane ships as its own mod in opum-lore, one of two mods, each in the plugin it drives (DEC-136)
tags:
  - lore-pane
  - mod
  - lcli-664
  - dec-136
summary: "DEC-136 A: two mods, one per plugin — the lore mod in opum-lore and the Quest board mod in opum-quest, each released and pinned on its own."
timestamp: 2026-10-02T21:58:44.000Z
status: stable
---

# ADR-0028: The Lore pane ships as its own mod in opum-lore, one of two mods, each in the plugin it drives (DEC-136)

## Status

**Accepted — 2026-10-02 (DEC-136 A).** The operator selected, verbatim: **"A: two mods
(Recommended)"**. Relayed by `opum-doc` as `ODOC-OP-2026-10-02-14` (seq 160, 2026-10-02T21:44:03Z;
acked 2026-10-02T21:45:11.853Z) and read here from opum-agent's own tracker at `origin/dev`,
`.quest/planning.json` DEC-136 (`accepted`), rather than taken from the relay.

The same relay carried an operator technical finding on what a mod may import, which is **not** part of
this decision and is recorded where it belongs: in the correction to
[ADR-0026](./0026-the-lore-pane-s-body-editing-ships-a-lightweight-inline-editor-and-a-desktop-editor-action-dec-132.md)'s
premise and in [the module reference](../reference/lore-pane-mod.md). Nothing in this decision depends
on it.

## Context

LCLI-664's third open question was the mod's shape: **A**, two mods, one per plugin — the lore mod in
`opum-lore` and the Quest board mod in `opum-quest`, each released and pinned on its own; or **B**, one
Opum workspace pane hosting both. It was owed to the operator before any release so that a published
shape did not settle it by default, and it was the last thing holding this module's landing.

Both builds were already shaped as A when the question was asked: quest-cli's Quest board mod
(`opum-ai/quest-cli#481`) and this one (`opum-ai/lore-cli#466`), each mirroring the other's staged
mod-test harness. B had no home: a combined pane needs an owning repository and plugin that neither
repository is today, and it overlaps the unratified `opum-cli` direction ("opum-cli as the daemon and a
thin operator mod"), so neither mod would release until that home existed.

## Decision

**Two mods, one per plugin.** The lore mod ships in the `opum-lore` plugin from this repository,
released and pinned on its own; the Quest board mod ships in `opum-quest` from quest-cli's.

## Consequences

- Each pane versions and ships with the CLI it drives. A release of `lore` and a release of the
  `opum-lore` plugin stay in one train, and the same holds on quest-cli's side, so neither pane has to
  tolerate a peer CLI it was not built against.
- An install that has only one of the two plugins still gets a working pane — the mods share no
  runtime dependency, and neither plugin depends on the other.
- There are two panes instead of one, and any shared chrome or test harness is kept in step by hand.
  This repository's half of that is already true and is not new work: `scripts/mod-test.mjs` mirrors
  quest-cli's staged validate/test harness, and the two were built to the same shape deliberately.
- **B is not ruled out.** A combined operator pane remains possible later; it would be its own
  decision, taken under the `opum-cli` direction rather than reopened here.
- Nothing in this module changes as a result. Its home was already `opum-lore` and its release path is
  unchanged; this decision removes a hold rather than redirecting work.

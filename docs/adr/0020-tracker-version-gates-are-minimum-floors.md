---
type: ADR
title: Tracker version gates are minimum floors, not bounded allowlists
tags:
  - adr
  - tracker
  - quest
  - backlog
  - versioning
  - release
summary: A tracker adapter accepts every backend version at or above a minimum floor, because a frozen allowlist couples two independently released packages into a third release.
timestamp: 2026-08-28T23:09:28.183Z
---

# Tracker version gates are minimum floors, not bounded allowlists

## Status

Accepted — 2026-08-28. Reverses the bounded-set choice made in LCLI-353 and
merged in PR #430.

## Context

Lore consumes each tracker backend through a pinned CLI contract, and each
adapter checks the backend's reported version before trusting it.

The two adapters had chosen opposite shapes for that check. `adapters/backlog.ts`
compared against a `MIN_BACKLOG_VERSION` floor. `adapters/quest.ts` matched an
exact-match allowlist, `SUPPORTED_QUEST_VERSIONS = ["0.2.7", "0.2.8"]`, chosen
deliberately in LCLI-353 as a "bounded set, no unbounded range" and defended by
tests asserting that everything else was rejected.

The bounded set had a cost that was not priced in when it was chosen. Lore and
Quest are separate packages with independent release cadences. The set went
stale the moment Quest published 0.2.9: the two current published packages —
`@opum-ai/lore@0.3.4` and `@opum-ai/quest@0.2.9`, which is what a user installing
today actually gets — could not be used together at all. Every tracker-touching
command exited 6 with `` `quest --version` did not return a supported Quest 0.2
version ``. Restoring the pairing required a *third* release: a new Lore, shipped
solely to add a string to a list.

That is the general shape, not a one-off. Under a bounded set, every backend
patch release requires a Lore release before the pair works, and the window
between them is a period where the two current packages are broken together.

## Decision

Every tracker adapter's version gate is a **minimum floor**: accept the reported
version when it is greater than or equal to the oldest version the adapter is
qualified against, with no upper bound. `MIN_QUEST_VERSION` joins the
long-standing `MIN_BACKLOG_VERSION`, and both use one shared
`adapters/semver.ts` rather than a parser per adapter.

**The version is not what enforces compatibility, and never was.** Every Quest
call already validates the response structurally — the envelope's
`schemaVersion`, its exact `kind`, the presence of `data`, and the required
command set through the manifest. A Quest that broke the contract would be
rejected by those checks with a `drift` diagnostic naming what actually changed,
whether or not its version number sat inside some allowlist. The floor's job is
narrower: give a clearly-too-old backend a better message than a mid-call
structural failure would produce. Read that way, the bounded set was buying
protection the structural checks already provide, at the price of the release
coupling above.

**A below-the-floor rejection is fatal at tracker-selection time.** `lore init
--tracker quest` verifies before it writes `[tracker].backend`, so a user is
never committed to a backend that will refuse every later command. This is
narrow on purpose: an installed backend below the floor is a pairing that cannot
work at all, and nothing the operator does inside the repository fixes it — they
must install a different backend. Every other probe failure ("workspace is not
initialized", "not on PATH", "no Backlog.md project") is one setup step away in
the same directory, and stays advisory, which is the decision LCLI-319 already
made and this one does not disturb.

## Consequences

- The two currently published packages work together. `lore orphans` against
  quest 0.2.9 returns its report instead of exiting 6.
- A backend release no longer requires a Lore release to be usable.
- Raising a floor becomes a deliberate act with a stated reason, rather than the
  routine maintenance a bounded set demanded on every upstream patch.
- A backend that ships a genuinely breaking change within the accepted range is
  caught by the structural checks, not the floor — with a `drift` diagnostic
  naming the field or kind that changed. That is a better error than a version
  mismatch, but it arrives at the first call rather than at the gate.
- Pre-release identifiers are ignored: `adapters/semver.ts` compares the numeric
  release triple only, so `0.3.0-rc.1` compares equal to `0.3.0`. This matches
  Backlog's long-standing behavior. Adding real pre-release precedence would be a
  behavior change for that adapter, not a neutral cleanup.

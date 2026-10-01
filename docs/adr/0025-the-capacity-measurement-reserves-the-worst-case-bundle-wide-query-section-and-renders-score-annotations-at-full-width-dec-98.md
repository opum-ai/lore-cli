---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: The capacity measurement reserves the worst-case bundle-wide query section and renders score annotations at full width (DEC-98)
tags:
  - capacity
  - agent-profiles
  - check
  - dec-98
  - lcli-662
summary: "lore check's capacity measurement reserves the worst-case bundle-wide query section and renders score annotations at full width, so a green check means no declared source can drop."
timestamp: 2026-10-01T03:12:40.980Z
status: stable
---

# ADR-0025: The capacity measurement reserves the worst-case bundle-wide query section and renders score annotations at full width (DEC-98)

## Status

**Accepted — 2026-10-01 (DEC-98 B).** The operator decided it first-party in `opum-doc`; the answer is
relayed as `ODOC-OP-2026-10-01-07` (opum-doc seq 109, 2026-10-01T02:55:43Z, acked 02:55:53Z) and was
read here from opum-agent's own tracker at `origin/dev` `211360b8`, `.quest/planning.json` DEC-98,
rather than taken from the relay. The chosen option, verbatim: **"B: reserve query worst case (Rec.)"**.

It resolves LCLI-662, amends the reading of the `max_tokens` bullet in
[the agent-profile context retrieval spec](../specs/agent-profile-context-retrieval.md), and constrains
LCLI-646: per DEC-11 the strengthened boundary ships as a **warning for one release** before the flip
turns it into an error.

## Context

### What LCLI-642 shipped, and the promise it left open

LCLI-642 (DEC-11) added the `agent-profile-capacity` finding: `lore check` reports a profile whose
**complete declared set** cannot fit its `max_tokens`. Its measurement was deliberate about what it
excludes — it renders the declaration "with no task and no query section" — and the budgets it chose
compensate with >=4500-5000 tokens of headroom. That compensation lives in task notes and in the
chosen numbers; it appears nowhere in `docs/`.

The spec bullet this gate was built to promises more than that. As written at 0.12.0:

> That measurement is the size of the set **as a real pack renders it** — the per-item and catalog
> score annotations included — so a budget that satisfies it cannot start dropping declared evidence
> on a task.

A real pack carries a bundle-wide query section (LCLI-575: up to three `lore query` hits the pack does
not already include). It was not part of the measurement, so the second clause was false as written,
and the `[pack-size]` regression case could not see it: that case compiled only through
`compileAgentContextWithoutQueryHits`, and its task matched nothing, so every real score rendered as
the one-character `0` — the same width as the measurement's placeholder.

### The measured gap (LCLI-662)

Measured on LCLI-662's own fixture, on the dev source and the released 0.12.0 binary, identical:

- the declared set measures 2957 tokens; the profile's budget 2982 (declared + 25);
- `lore check` exits 0 — "Agent profiles: 1 read, 0 over capacity", no finding;
- `lore agent context` with a task whose pack carries a full three-hit query section: `truncated:
  true`, and a declared source reads `omitted-by-budget`;
- the same budget with query hits off (the hit-free compiler): every candidate selected.

The difference is the query section alone on that fixture: ~66 tokens, and 201-299 tokens measured
across three sample tasks on this repository's own bundle. opum-doc hit the same shape in the field
(its `review.toml`, `max_tokens` 10000, a declared source dropped at pack size 9151), which is what
surfaced the gap.

### The second under-count, found while implementing this

The F2 review under LCLI-642 required the measurement to pay the per-item and catalog **score
annotations** a real pack renders, and held the placeholder constant at `1` on the reasoning that a
non-zero constant is fixed-width. It is not: `formatScore` strips trailing zeros, so `1` renders as
one character, while a real BM25 score for a matching task renders as seven to ten (`0.142617`,
`12.345678`). Measured 2026-10-01 on this repository's own profiles, hit-free packs at a matching task
run up to **~500 tokens larger** than the measurement (`implementation`: 254 items, delta
+475/+501), nearly all of it this annotation. F2's intent was right; its arithmetic was not delivered.
Same class, same promise, so it is closed here rather than filed separately.

## Decision

`declaredTokens` remains measured by the compiler's own renderer, and now stands for the largest pack
a real task can compile: the complete declared set, plus two reserves.

1. **Score annotations at full width.** Candidates and catalog lines render with a placeholder whose
   `formatScore` output is 11 characters (`1234.567891`) — at least the widest score observed in this
   repository's bundle (10 characters, measured 2026-10-01). This restores F2's fixed-width intent.

2. **The worst-case bundle-wide query section is reserved**, task-independently:

   - **Hit lines**: for every concept in the bundle, the line `renderQueryHit` would produce if a task
     ranked it — id, frontmatter title, snippet (`oneLine(summary ?? title)`, the rule `lore query`
     applies), and the full-width placeholder score. No workspace `[memberId]`: the check measures the
     bare bundle.
   - **Shapes**: the reserve is the maximum, in tokens (the chars/4 estimate over the section's own
     rendered lines), over every shape a real pack can render, largest hit lines first: three hits
     shown with no footer; two shown with the omitted-count footer; one shown; and the two
     empty-corpus lines. A real pack's section is always at or below this bound, whatever the task — taking the
     maximum over shapes matters because a footer is not always smaller than a hit line, and a pack
     whose budget shrank its hit limit renders the footer instead.

3. **The fill uses the same reserve.** The source attribution (`sources[].fits`, and the finding's
   dropped-source list) fills against the budget with the reserve counted, so it is conservative in
   the same direction as the comparison rather than naming sources that a reserve-only shortfall
   never touched.

The reserve is bundle-derived, not task-derived: the finding is still the same on every task, and
task-ranked omission is still normal retention rather than this finding.

## Consequences

- The finding fires earlier — by up to the reserve — which is the point: a green check now stands for
  the real pack. This repository's own four profiles keep their margins (declared 57886-104232 against
  budgets 63000-108000; the reserve is a few hundred tokens against margins of 2155-5114, measured
  2026-10-01).
- **LCLI-646 waits one release** (DEC-11): the strengthened boundary warns first, then the flip turns
  it into an error in a release strictly after this one.
- The spec bullet and the runbook's capacity paragraph are updated to say what the measurement now
  includes, so the promise and the gate agree.
- **Residuals, recorded rather than closed.** Two bounds stay outside the measurement, because no
  finite task-independent measurement can reserve them: the pack header's task line (the measurement
  renders a fixed 22-character task; the `[pack-size]` case's slack has covered real tasks in
  practice), and any score wider than the placeholder's 11 characters. Both are documented here so a
  later reader can decide whether they need closing.

## Alternatives considered

- **(A) Narrow the spec bullet and document the headroom rule in the runbook.** Put to the operator
  and declined (DEC-98): it leaves the compensation a convention nothing enforces, and the gate would
  promise less than DEC-11 meant it to.
- **A fixed constant reserve** in place of the computed worst case. Rejected: a constant is either
  wrong for a small bundle (over-reserving everywhere) or wrong for a large one, and the worst case is
  exactly computable from the bundle at check time.

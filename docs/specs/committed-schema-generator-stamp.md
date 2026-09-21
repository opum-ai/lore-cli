---
# yaml-language-server: $schema=../../.lore/schemas/spec.schema.json
type: Spec
title: Committed-schema generator stamp
tags:
  - schemas
  - provenance
  - drift
  - prune
  - adr-0354
summary: What the stamp in .lore/schemas/*.schema.json holds, and how lore check keys its prune decision on it so that cannot-judge never collapses into a delete.
timestamp: 2026-09-21T04:18:40.486Z
---

# Committed-schema generator stamp

## Summary

`.lore/schemas/*.schema.json` is a committed artifact that `lore check`'s
`schema-drift` rule compares against what the running binary's profile generates
now. Today that comparison has **two** outcomes — matches, or does not — and one
of its findings tells the reader to **delete a file**:

> `no type in the active profile owns this schema — run lore schema export to prune it`

That advice is correct when a type was genuinely removed from the profile, and
**destructive and wrong** when the running binary is simply older than the tree.
`lore check` cannot currently tell those apart, and on 2026-09-20 it did not:
an opum-workflow hook ran a PATH-resolved `lore` 0.8.0 against this repository's
`dev`, which carries an unreleased `Arc` type, and `lore sync` pruned
`.lore/schemas/arc.schema.json` outright (LCLI-546). Nothing shipped only
because that session's commits used explicit paths rather than `git add -A`.

This spec defines the **generator stamp**: a small provenance block each
committed schema carries, and the predicate `lore check` keys its prune decision
on, so that *cannot judge from here* becomes a third outcome rather than
collapsing into the destructive one.

It implements the architectural commitment in **OPAG-354** and does not reopen
it. The mechanism was delegated to this repository because lore-cli holds the
generator and raised the objection; the commitment itself — provenance in
committed schemas, a third drift outcome, prune never on cannot-judge — is
fixed.

## Requirements

1. **The stamp holds a profile digest and no version string.** The digest is the
   decision key. The running binary supplies its own version for the
   human-readable message. Ruling by opum-agent, 2026-09-20, on the measurement
   in [Design](#why-no-version-is-committed).
2. **`lore schema export` writes the stamp** into every file it emits, including
   the byte-identical alias files a renamed type emits (LCLI-553).
3. **`lore check` never suggests a prune for a schema whose stamp the running
   binary does not recognise**, including a schema carrying no stamp at all.
4. **The third outcome is distinguishable in the exit code** from both clean and
   drifted, and in its message from both.
5. **The rewrite case and the delete case stay distinguishable**, in message and
   in exit code. They are not equally dangerous: *"no longer matches what this
   profile generates"* rewrites a file, which git recovers; *"no type owns this
   schema — prune it"* deletes one. OPAG-354 item 5.
6. **An unstamped bundle is not drift.** Every committed schema in the fleet is
   unstamped today, so the absent-stamp case is the common case on the release
   that introduces this, not an edge case.

## Design

### What the stamp holds

One additional top-level key. JSON Schema permits unknown keywords, and the
`x-` convention keeps it inert to the editor language servers that read these
files through the `$schema` modeline `lore new` stamps:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "x-lore-generator": {
    "profileDigest": "sha256:<64 hex>"
  },
  "type": "object",
  "properties": { }
}
```

`profileDigest` is taken over a canonical projection of the **compiled
profile's type definitions** — every declared type, its slugs and aliases, its
fields and their requiredness, in declaration order. It is a digest of *what
this binary would generate*, not of the bytes of any one file.

The committed schemas today carry exactly five top-level keys — `$schema`,
`type`, `properties`, `required`, `additionalProperties` — and no provenance,
across all eight files here and all 71 in the fleet (measured by opum-agent on
OPAG-354). So this is an addition to a uniform shape, not a variation on an
existing one.

### Why no version is committed

The obvious stamp is the generating `lore` version, and it is the one to
refuse. `schemaDriftFindings` compares committed bytes against regenerated
bytes with a plain inequality (`src/core/check.ts:794-829`), so **any** byte
that differs is drift. A committed version field would therefore be rewritten by
every release, in every repository, whether or not the profile changed.

Re-measured here against this repository's own tags, reading the tree SHA of
`.lore/schemas` at each rather than trusting the filing record:

| tag | `.lore/schemas` tree | files |
|---|---|---|
| `v0.6.0` | `4bb5609ac74d76c1e51dac90959de4c1f323a549` | 7 |
| `v0.6.1` | `4bb5609ac74d76c1e51dac90959de4c1f323a549` | 7 |
| `v0.6.2` | `4bb5609ac74d76c1e51dac90959de4c1f323a549` | 7 |
| `v0.7.0` | `4bb5609ac74d76c1e51dac90959de4c1f323a549` | 7 |
| `v0.8.0` | `125934b1dab5ea0fe15a5c154b7f7269724bcbbf` | 7 |
| `dev` | `700f1ed407cde2bce68137ac5362b69dfb2a4a35` | 8 |

Byte-identical across four consecutive releases, and **3 commits have ever
touched the directory**. A per-release version stamp would have rewritten all
seven files at `v0.6.1`, `v0.6.2` and `v0.7.0` — 21 rewrites carrying no
information. A profile digest changes at `v0.8.0` and at the `Arc` addition:
2 of 5, which is signal.

The alternative — commit the version but exclude it from the comparison — trades
the churn for a committed field no gate checks, which can go stale and lie while
every gate stays green. That is the same shape this rule exists to catch. Both
hazards are avoided by not committing it: the message reads *"this schema came
from a profile this lore does not generate; this is lore 0.9.0"*, which is the
sentence a reader needs, and the half that has to be committed is the half that
does not churn.

### The decision table

`regenerated` is what the running binary's profile emits now; `committed` is what
is on disk. The first three rows are unchanged from today.

| Condition | Outcome | Exit | Action advised |
|---|---|---|---|
| committed directory absent | clean | 0 | none — a bundle with no schemas is not drifted |
| bytes match | clean | 0 | none |
| profile declares the type, no file committed | **missing** | 6 | `lore schema export` writes it |
| file committed, bytes differ | **stale** | 6 | `lore schema export` overwrites it — *recoverable from git* |
| **orphan, stamp digest == this binary's** | **orphaned** | 6 | `lore schema export` prunes it — *destructive, and affirmed* |
| **orphan, stamp digest differs** | **unattributable** | new | **never prune.** Read `git log` on the file and on the profile |
| **orphan, no stamp at all** | **unattributable** | new | **never prune.** The file predates this mechanism |

The load-bearing property is in the last two rows: **prune is advised only when
the running binary can affirm the artifact came from a profile it itself
generates.** It never needs to know whether it is older or newer to avoid the
destructive act — only whether the artifact is its own. That is why the fleet's
standing refusal to trust a version comparison for capability detection does not
bite here: direction is needed to *word* the message, not to decide the action.

### Why direction genuinely cannot be recovered, and why that is fine

A tempting refinement is to make the stamp carry the generating profile's full
set of declared type slugs, so set containment gives direction. **It does not.**
Both cases present identically — the stamp declares a slug I do not:

- *type removed:* a newer binary dropped `epic`; the stamp knew it, I do not.
- *binary older:* a newer binary added `Arc`; the stamp knew it, I do not.

Since the type vocabulary comes from the **binary** whenever a repository has no
committed profile — `loadProfile` (`src/core/profile.ts:305-325`) falls through
to the built-in `defaultProfile()`, and this repository has neither
`.lore/profile.toml` nor `.lore/profile.json` — there is nothing in the tree to
break the tie. Set containment buys nothing the digest does not, and costs a
larger committed field.

**A repository that commits a profile is not exposed to this failure at all**,
and the same mechanism covers it without a special case: its digest derives from
a file in the tree, so every binary computes the same value, every artifact is
always attributable, and prune stays decidable. The mechanism needs no field
recording which kind of repository it is in.

### What happens after a legitimate removal

Worth stating, because it looks like a defect and is the design working. Remove
a type in 0.9.0 against a bundle stamped by 0.8.0: every committed file now
carries an unrecognised digest, so the seven surviving files report **stale**
and a re-export re-stamps them, while the removed type's file is orphaned with
an unrecognised stamp and reports **unattributable** — permanently, until a
human deletes it.

That is the intended outcome. The destructive step is the one that keeps
requiring judgement, and a leftover file costing a deliberate `rm` is a much
cheaper failure than the one this spec exists to prevent.

### Preserving the asymmetry

`stale` and `orphaned` must not be allowed to converge on one message or one
exit code as the implementation grows. The rewrite is recoverable from git; the
delete is not recoverable from anything but git, and only if it was committed
first — which is exactly what LCLI-546 came within one `git add -A` of losing.

## Open questions

- **Digest stability across releases is the rollout hazard.** If the canonical
  projection the digest is taken over changes incidentally — a release that adds
  a field to every type — every repository in the fleet goes to *unattributable*
  at once. All 71 committed schemas fleet-wide are unstamped today, so the first
  release carrying this already moves every one of them. **LCLI-545 records what
  that felt like at 0.8.0**, when opum-marketplace's first upgrade failed exit 6
  on all seven of their profile schemas and they asked for a heads-up for other
  integrators. The rollout note is owed with the release, and the projection
  needs a stated stability contract rather than being whatever the serializer
  happens to emit.
- **Which exit code the third outcome takes.** It must differ from `0` and from
  the `6` that `stale`/`missing`/`orphaned` already use, and lore's documented
  set (`0` ok, `2` usage, `3` not_found, `4` denied, `5` conflict, `6`
  validation/drift) has no spare slot with the right meaning. Adding one is a
  CLI-contract change (ADR-0005) and is decided in implementation, not here.
- **Not a substitute for LCLI-545.** That task improves the wording of advice
  that is still undecidable underneath; this makes it decidable. Neither closes
  the other. OPAG-353 remains the operating rule for binaries already on disk
  that will never receive this fix.

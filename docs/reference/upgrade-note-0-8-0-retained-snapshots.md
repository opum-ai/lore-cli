---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: "Upgrade note: retained snapshots written by lore 0.8.0"
tags:
  - upgrade
  - compatibility
  - snapshots
  - 0.8.0
summary: One snapshot file written by lore 0.8.0 makes an entire retained scope unreadable to any older lore, because the ADR-0021 edge qualifiers land in a strict schema.
timestamp: 2026-09-21T04:05:32.519Z
---

# Upgrade note: retained snapshots written by lore 0.8.0

**If you are reading this because `lore` said `retained snapshot is malformed or
unsupported`, you are in the right place.** That message, raised from
`parseRetainedSnapshot` (`src/core/snapshot.ts:271-281`), is what an older `lore`
prints when it meets a snapshot file that `lore` **0.8.0** wrote. Jump to
[The remedy](#the-remedy).

This note exists because the incompatibility is **already published**. It is not
a future cost of work in progress: `npm view @opum-ai/lore dist-tags` returned
`latest: 0.8.0` when this was written (2026-09-20), so the writer described here
is the version `npm install @opum-ai/lore` gives you by default, today.

## Details

### What changed, and in which version

`lore` 0.8.0 is the **first version that writes the ADR-0021 relation qualifiers
into retained snapshot edges**. Three optional keys were added to `edgeValue`:

- `statement`
- `version`
- `relationOrdinal`

They landed in commit **`dd0876dc`**, *"feat(LCLI-540): carry the ADR-0021 relation
qualifiers into retained edges (#170)"*, dated 2026-09-18. Measured by counting
the identifier in the file on both sides of that commit: `dd0876dc^` has **0**
occurrences of `relationOrdinal` in `src/core/snapshot.ts`, `dd0876dc` has **3**,
and `git show v0.8.0:src/core/snapshot.ts` also has 3 — so the keys are in the
shipped tag, not merely on a branch.

The keys are **optional**, which is what makes a *newer* `lore` tolerant of an
*older* file. The schema object they sit in is **`.strict()`**
(`src/core/snapshot.ts:182`), which is what makes an *older* `lore` reject a
*newer* file: a strict Zod object treats a key it does not declare as an error,
not as something to ignore.

### The failure is SCOPE-WIDE, not per-file

This is the part that makes the symptom confusing, and it is worth stating before
the remedy: **one bad file takes out every operation on the whole scope, including
the one you would reach for to clear it.**

`listSnapshotFiles` (`src/core/snapshot-store.ts:202-226`) `readdir`s the scope
directory and calls `parseRetainedSnapshot` on **every** entry it finds. Every
public entry point runs through it:

| Operation | Path | Outcome with one 0.8.0-written file present |
|---|---|---|
| `lore snapshot list` | `listSnapshots` → `listSnapshotFiles` | throws |
| `lore snapshot retain` | `retainSnapshot` → `listSnapshots` (`:55`) | throws |
| load a specific snapshot | `loadSnapshot` → `listSnapshotFiles` (`:128`) | throws |
| `lore snapshot delete` (the drain) | `deleteSnapshots` → `listSnapshots` (`:180`) | throws |

So you cannot list your way to the offending file, and you cannot delete it with
the tool either — the delete path enumerates the scope first and dies on the same
entry. Asking for a *different, known-good* snapshot key does not help, because
the enumeration happens before the selection.

### The configuration that actually exposes you

**Not the one you would guess, and a correction to how this was first framed.**
The obvious worry is a version skew across machines — an older `lore` pinned in
CI while workstations run a newer one. **At 0.8.0 that configuration cannot reach
this failure**, because the retained snapshot store is **machine-local and never
committed**:

```
src/core/snapshot-store.ts:30
  export const SNAPSHOT_CACHE_REL_ROOT = ".lore/cache/snapshots/1"

.gitignore:50
  .lore/cache/

$ git check-ignore -v .lore/cache/snapshots/1/concept/x/abc.json
  .gitignore:50:.lore/cache/   .lore/cache/snapshots/1/concept/x/abc.json
```

A CI job on a fresh checkout has no snapshot store at all, so there is no file
for a newer `lore` to have poisoned. **The good news is the blast radius: this
does not travel through your repository.**

What *does* expose you is a **store that outlives a version downgrade on the same
filesystem** — the version moving backwards over a directory that persists:

1. **A workstation that downgrades.** You ran 0.8.0, it retained snapshots, and
   you then pin or reinstall an older `lore` in that same checkout. The
   `.lore/cache/` directory is still there and still has 0.8.0's files in it.
2. **A CI runner that caches `.lore/`.** If your pipeline restores `.lore/cache/`
   between jobs (a plausible optimisation, since rebuilding a projection is the
   expensive part) and one job's pinned `lore` is older than the job that
   populated the cache, that job sees the same failure. This is the one case
   where it crosses machines, and it crosses through your **cache**, not your
   repository.
3. **A shared or mounted checkout** driven by two different `lore` installs —
   a container and its host, or two toolchains on one developer box.

If none of those describes you, you are not exposed by this today. That will
change when retained citations become committed artifacts (LCLI-548); this note
covers the published 0.8.0 behaviour only.

### The remedy

**Upgrade `lore` to 0.8.0 or later. That is the only complete remedy, and the
reason is structural rather than a matter of priority: the binary that rejects
the file is already on your disk, and no release can reach back and patch a
version someone has already installed.** Everything else below is containment.

```sh
npm install -g @opum-ai/lore@latest     # or bump the pin in your CI job
lore --version                           # confirm the resolved binary, not the package
```

Check `lore --version` from the *resolved* binary rather than trusting
`npm view` — an install can succeed while `PATH` still resolves an older one,
and that is exactly the mismatch that produces this failure in the first place.

If you genuinely cannot upgrade the older `lore` yet, the store is a cache and
is safe to discard. **`lore snapshot delete` will not do it** (see the table
above — the drain path throws on the same entry), so remove the directory
directly:

```sh
rm -rf .lore/cache/snapshots/1          # the whole store
```

Nothing committed is lost: `.lore/cache/` is gitignored, and a retained snapshot
is a cached projection that `lore snapshot retain` rebuilds from the bundle. The
cost of discarding it is recomputation, not data. Scoping the delete more
narrowly than the whole store is possible but rarely worth it, since you cannot
use the tool to find out which entries are the newer ones.

**The containment does not hold.** Any later run of a 0.8.0-or-newer `lore` in
that checkout repopulates the store with files the older binary will reject
again. If both versions keep touching one directory, you will be deleting it
repeatedly until one of them moves.

### This is NOT a symmetric break

A reader who meets this failure reasonably assumes the two versions simply
disagree and that either could be the problem. They do not, and it matters for
where you spend your time: **the forward direction was fixed deliberately, in
the same release.**

A *newer* `lore` reading an *older* file is handled by `isRetainedQualifierBackfill`
(`src/core/snapshot-store.ts:55-68`, ADR-0021 ruling 13). `snapshotKey` derives
from the source projection stream rather than from the retained bytes, so a
`lore` that newly carries the qualifiers re-retains the same key over different
bytes; ruling 13 recognises that case and declines to report it as a corrupt
cache, because the only thing that changed is `lore`'s own serializer. Anything
the predicate does **not** recognise still throws, so it is a narrow allowance
rather than a blanket one.

The reverse direction cannot be fixed the same way for the reason in
[The remedy](#the-remedy): the fix would have to live in a binary that shipped
before the problem existed. The asymmetry is an accepted cost of ODOC-231, not
an oversight, and it is why the remedy is "move forward" rather than "wait for a
patch".

### Related

- **The same release did this once already, to a real consumer.** `opum-marketplace`'s
  first upgrade to 0.8.0 hit `lore check` exiting 6 on all seven of their profile
  schemas at once, and they asked for exactly this kind of heads-up for other
  integrators (LCLI-545). Different surface, same release, same shape: a tool
  that is correct and gives the reader nothing to act on.
- **0.8.0 shipped with no provenance attestation**, as did 0.7.0, 0.6.2 and
  0.6.1 — expected, not tampering. See the CHANGELOG's 0.8.0 entry and LCLI-482.

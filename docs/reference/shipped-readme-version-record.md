---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Shipped-README version assertions in lore-cli
tags:
  - release
  - npm
  - contract
  - published-artifacts
summary: Which clauses of the fleet shipped-README version contract this repository exercises, where each one runs, and the clause nobody else can ever check.
timestamp: 2026-09-15T19:42:41.478Z
---

# Shipped-README version assertions in lore-cli

This is lore-cli's **A5 record**: which clauses of the shipped-README version
contract this repository exercises, and where each one runs. The contract itself
lives in opum-doc at `docs/reference/shipped-readme-version-assertions.md`
(cited at `main@d56ea3f`); it is not restated here, because two copies of one
document maintained separately diverge while neither becomes false.

It is written **clause by clause, each marked exercised or vacuous, and each
vacuous one saying why**, which is the format A5 requires. A repository-level
verdict would satisfy A5's sentence while destroying the property it exists for:
"enforces A3" is a conjunction, and a conjunction hides a clause that passes
because there is nothing for it to check.

## The defect, as measured

On 2026-09-15, `npm view @opum-ai/lore@0.7.0 readme` served a README asserting
`0.6.2` on three lines — lines 33, 39 and 41. The npm landing page for the
current release told a reader the current release was the previous one.
`package.json`'s `files` list ships `README.md`, so the file inside the tarball
is what the registry serves as the package page.

**The cause is ordering, not forgetfulness.** A sentence saying "0.7.0 is
released" cannot honestly be written before 0.7.0 is released, so the README
bump is authored as post-tag bookkeeping and the tag therefore always carries
the prior version's README. Two instructions disagreed and the wrong one won:
the release runbook said to reconcile the README with the version bump, and
`scripts/publish-release.sh`'s closing message told the operator to update it
*after* publishing. Generating the number dissolves the tension rather than
adjudicating it — a generated line states a fact about the artifact, not a claim
about the world, so it can be written at any moment.

A fourth line, `` `0.6.2` was therefore published with
`scripts/publish-release.sh` ``, carries the same string and is **not** a stale
site: it narrates a past release and is still true at 0.7.0, exactly as
`1.3.14` and `>=1.49.0` are. The distinction is not bookkeeping — a predicate
built to the count rather than to the claim each line makes will either miss the
`Status:` line or condemn the historical one.

## What this repository exercises

| Clause | Status | Where it runs |
|---|---|---|
| A1 — subject is the packed artifact | **exercised** | `shipped-readme-version.mjs --tarball`, in `release.yml`'s `package` job and in `publish-release.sh` before any registry write |
| A2 — no hand-asserted own version | **exercised**, *generated* arm | two marked regions in `README.md`, written by `--write` from `package.json` |
| A3.1 — every region present | **exercised**, per region | same script, all three modes |
| A3.2 — region byte-equal to generated | **exercised** — *and this repository is the only side that ever will* | same script, all three modes |
| A3.3 — no name/version pair outside every region | **exercised**, as **block-scoped** adjacency | same script, all three modes |
| A4 — post-publish read-back naming its object | **exercised** | `release.yml`'s `publish` job; step 1a of `publish-release.sh`'s closing checklist for the manual path |
| A5 — this record | **exercised** | this file |
| *(local)* markers must be inline, never line-initial | **exercised** | same script, all three modes — not a contract clause; see below |

Nothing here is vacuous. The one asymmetry worth stating in full is A3.2.

### A3.2 is load-bearing here and vacuous in the other implementation

quest-cli took A2's **absent** arm: its shipped README states no version at all,
so it has zero version tokens and no generator. Byte-equality there is vacuous
**by construction** — there is nothing for the clause to guard — which is a
different fact from a clause someone chose not to implement, and only the first
is safe to leave alone.

The consequence is the reason A5 exists in the form it does. **If this
repository's byte-equality implementation is wrong, nothing anywhere in the
fleet says so.** quest-cli's release going green is not evidence about it either
way, and no third artifact compares the two. Two green implementations of one
written contract read as corroboration; here they are **coverage** — each side
confirms something the other does not, and their conjunction implies a coverage
that does not exist.

That is why this repository's clause-2 evidence is the mutation matrix below
rather than a green CI run.

## The assertion the contract does not have, and why this repository needs it

The first implementation placed each region's begin marker immediately after the
`- ` or `> ` container prefix. Every version assertion passed. GitHub's own
renderer then showed the npm page emitting a literal
`**Status: 0.7.0 released.**` — asterisks, backticks and all.

A CommonMark HTML block (type 2) starts at any line whose **content** begins
with `<!--` and runs to the line containing `-->` *inclusive*, so everything
after a line-initial marker on that same line is emitted as raw text. The
version was correct and the page was broken, and **no version check can see
that combination** — which is why it is checked separately rather than assumed.

The rule: a marker may never be the first content on its line, counting after
any Markdown container prefix, because those are stripped before the HTML-block
rule applies. Each region therefore begins mid-sentence — after
`- Published on npm as`, and after `> **Status:` — which looks arbitrary in a
diff and is not.

**It was found by measurement, against `POST /markdown`, not by reading the
spec.** That is worth recording because the natural place to stop was one step
earlier: the gate was green, the tests were green, and the rendered artifact was
the only thing that disagreed. The test for it is deliberately *version-neutral*
— the marker moves to the start of its own line while the region's bytes stay
identical, so clauses 1, 2 and 3 all still pass and the rendering finding is the
only one raised. Most ways of moving a marker also move the region boundary and
trip byte-equality, which would have let the test pass for the wrong reason.

This is a property of putting generated regions in a **rendered** document. It
is not in the shared contract because quest-cli took A2's absent arm and has no
markers to place.

## The divergences, and why each one was necessary

### Two regions, not one

A3 was phrased in the singular when this was implemented. This README's stale
sites are not contiguous: a bullet in the feature list, and a `Status:` sentence
in a blockquote six lines later. A single region spanning both swallows two
hand-written bullets, and extending it to the end of the blockquote encloses the
`` `0.6.2` was therefore published with `scripts/publish-release.sh` ``
narration — **a generator would have to fabricate honest history to satisfy
byte-equality**, which is a worse outcome than the defect. Clauses 1 and 2
therefore apply per region. opum-doc amended the contract to say regions,
plural, and "outside **every** region".

### Block-scoped adjacency, not line-scoped

Clause 3 as originally stated — the package's own name adjacent to a version —
catches exactly **one** of this README's three stale sites. The `Status:` line
carries no package name at all; its nearest `@opum-ai/lore*` is on the following
line, inside the same blockquote. Any same-line window misses it, and any window
wide enough to reach it is wide enough to mean nothing.

So adjacency is computed over the enclosing **block**: a maximal run of lines
delimited by a blank line, or by a blockquote-internal blank (a line that is `>`
alone, which separates paragraphs inside one blockquote). A block fails when it
holds both this package's own npm name and a version token.

Two alternatives were rejected, and the reasons are worth keeping:

- **quest-cli's rule — no version token anywhere outside a region — is
  unusable here.** It is free for them because their file has zero tokens. This
  README carries nine legitimate non-package tokens (Backlog.md `>=1.49.0`, Bun
  `1.3.14`, historical `0.2.0`/`0.6.x`). The same rule is a clean check there
  and nine false positives here. Neither side is being lax; the rule's cost
  depends entirely on the file it runs against.
- **A closed set of this package's own released values was withdrawn.** It reads
  tighter than block scoping and is wrong: it condemns the historical line
  above, and every other honest citation of a past version. It was withdrawn
  after the stale sites were recounted — the object being counted was "lines
  carrying the old string" when the claim needed "lines asserting a stale
  *current* version".

### Regions are masked byte-wise, not line-wise

"Outside the region" means outside the region's **bytes**, not outside the lines
it touches. Excising whole lines would let a stale `@opum-ai/lore@0.6.2` hide by
sitting on the same line as a region marker — the shape most likely to occur,
because the generated text and the stale text are usually about the same thing.
Region content is overwritten with spaces, preserving line and column positions,
and clause 3 runs over the masked text. Block *structure* is read from the
original text, so masking a whole line cannot silently split a block and let a
pair escape across the seam.

## The proof

`lore` 0.7.0, `quest` 0.7.1, Bun 1.3.14, Node 24.20.0, measured 2026-09-15 —
recorded because two gates with identical exit codes can be measuring different
things, and a proof that names only its exit codes cannot be compared against a
later reader's own machine.

### Acceptance and rejection on a real `npm pack` artifact

Both halves, as two separate measurements, against the tarball rather than the
worktree:

| Measurement | Result |
|---|---|
| `--tarball opum-ai-lore-0.7.0.tgz`, clean tree | **exit 0** — 2 regions byte-equal, no pair outside them |
| `--tarball opum-ai-lore-0.7.1.tgz`, `package.json` bumped and README left as post-tag bookkeeping | **exit 1** — both regions named, packed vs generated printed |

The second is the LCLI-510 defect itself, reproduced at the exact moment a
0.7.1 release would have shipped the 0.7.0 README.

### The clause-3 shapes, and the wrong implementation each one catches

A proof that plants `@opum-ai/lore@0.6.2` somewhere and watches the gate go red
proves the gate **runs**. It does not prove it **catches**, and it would have
shipped a check blind to the worst line in the file while agreeing with the
expectation. So the shapes are chosen to distinguish implementations, not to
count runs:

| Shape | Goes green under |
|---|---|
| **A** name and version on one line | nothing — the floor every implementation clears |
| **B** version on one line, package name on the next, one blockquote | a **line-scoped** matcher |
| **C** stale name and version on two lines immediately following a region | a line-scoped matcher, **and** "a block overlapping a region is exempt" |
| **D** stale text sharing a line with a region marker, outside its bytes | **line-wise** region excision |

Shapes B and C both assert, in the test itself, that no single planted line
carries both — so a line-scoped implementation demonstrably would not have
fired, rather than that being a claim about it.

### One portability finding, because the gate shells out to `tar`

The A1 tests failed on `windows-latest` and nowhere else (run 35016083790):

```
tar (child): Cannot connect to C: resolve failed
```

GNU tar — which is what is on `PATH` on a Windows runner — reads `C:\...` as a
`host:path` remote spec. `--force-local` fixes GNU tar and **does not exist** in
the bsdtar macOS ships, so no single flag is correct on both. Both the script
and the tests now run `tar` from the tarball's own directory with a bare
filename: a relative name has no colon, which is right everywhere and needs no
platform branch.

Worth noting that production never reaches this — the gate runs on
`ubuntu-latest` in the workflow and on macOS in `publish-release.sh`. The
Windows leg is a required context that exercised a path the release never takes,
and it found a real defect in the script anyway.

### Mutation matrix

Each wrong implementation was built and the suite re-run against it. A test that
passes first time may be asserting the wrong thing; this is what says otherwise.

| Mutation | Failing tests |
|---|---|
| clause 3 made line-scoped | 2 — shapes B and C |
| a block overlapping a region made exempt | 2 — shapes C and D |
| region excision made line-wise | 1 — shape D |
| byte-equality disabled | 5 — every A3.2 test, the `--write` round trip, and the tarball gate |
| the inline-marker rendering check removed | 2 — both rendering tests |
| the gate deleted from `publish-release.sh` | 1 — the refusal test written for it |
| *(unmutated)* | **0 of 23** |

The acceptance half is tested as deliberately as the rejection half: the
legitimate non-package tokens stay green, the historical-narration block stays
green, and the **real repository README** is checked on every pull request, so a
gate that had become always-red would be visible rather than reassuring.

## Where the checks live

- `scripts/shipped-readme-version.mjs` — generator and checker. `--write`
  regenerates; `--check` reads the worktree; `--tarball` reads the packed
  artifact.
- `.github/workflows/release.yml`, `package` job — **the gate**, run immediately
  after `npm pack` against the tarball about to be published.
- `.github/workflows/release.yml`, `publish` job — A4 read-back, naming the
  package and version it read.
- `scripts/publish-release.sh` — the same tarball gate before any registry
  write. Not redundant with the workflow's: this script publishes whatever is in
  its artifacts directory, which an operator may populate by hand, and the root
  launcher — the only one of the seven packages that ships a README — is the one
  tarball with no independently recorded qualification digest.
- `.github/workflows/ci.yml` — `bun test` runs `--check` against the real README
  on every pull request. **Early feedback, deliberately not the gate**: a
  worktree check can pass while the packed file is stale.

## What is deliberately not closed

Between `npm pack` and `npm publish`, the packed README says `Status: X
released` of a version that is not yet published. No user reads that tarball —
it is a dry-run artifact until publication — and the alternative is prose that
never states a release at all, which is a separate editorial decision. A2 asks
that the **number** not be hand-maintained, and it is not.

The README's "pair with `quest` 0.7.0" sentence remains hand-maintained and sits
outside both regions. It is out of scope here twice over: it asserts another
package's version rather than this one's, and reconciling the lockstep claim
with the exception is LCLI-511's work.

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
(cited at `main@ba3055d`); it is not restated here, because two copies of one
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
| A4 — post-publish read-back naming its object | **exercised** | `scripts/readme-readback.sh`, called by `release.yml`'s `publish` job, by re-running `--check` over the bytes the registry served; step 1a of `publish-release.sh`'s closing checklist for the manual path |
| A5 — this record | **exercised** | this file |
| *(local)* markers must be inline, never line-initial | **exercised** | same script, all three modes — not a contract clause; see below |
| *(local)* clause 3 has a sanctioned exemption | **exercised** | hand-written allow spans; see below |

Nothing here is vacuous **on this side**. Two of these constraints are vacuous
on quest-cli's side, and — this is the distinction A5's wording change exists to
preserve — **for two different reasons**:

| Constraint | Vacuous for quest-cli because |
|---|---|
| A3.2 byte-equality | there is **no generator** — they took A2's absent arm, so nothing exists for the clause to guard |
| marker placement must be inline | there are **no markers** — an absent-arm README has no regions to place |

Collapsing those into one verdict about "the generated arm" would lose the fact
that they are independent: an implementation could take the generated arm and
have one without the other. Both are stated because "vacuous, no generator" and
"vacuous, no markers" are different facts for whoever audits this next, and
neither is the same as "not enforced".

The asymmetry worth stating in full is A3.2.

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

### Clause 3 needed a sanctioned way past it, and the hatch is proved to ACCEPT

The first implementation had none. Clause 3 refuses this package's own name next
to a version outside a generated region, and some sentence will eventually need
exactly that — ``` `@opum-ai/lore@0.6.0` was the last release carrying a
provenance attestation ``` is honest, is history, and is **not derivable from
`package.json`**, so it can never live in a generated region. With no exemption,
the only way past it is to widen the predicate, and a predicate widened once
measures less forever. The contract warns about this in quest-cli's terms:
whoever meets the first legitimate version should *mark* it rather than loosen
the matcher.

So there is now a hand-written, repeatable allow span, masked for clause 3 only.
It is deliberately **not** byte-checked — there is nothing to generate it from —
and the inline-marker rendering rule still applies to it. An unterminated span
is refused rather than run to end of file, because "exempt this sentence" and
"exempt the rest of the README" differ by one missing marker.

**The acceptance half is the point, and it came from quest-cli.** Their marked
region is what their own docblock tells a future editor to reach for instead of
loosening the matcher, and four pull requests of proving the *reject* path had
never demonstrated that the hatch itself works. Applying "prove it accepts" to
the escape hatch rather than only to the gate is a distinct discipline from
applying it to the gate, and it is what surfaced that this repository had no
hatch at all. The tests here prove, in this order: the sentence is refused
without the hatch, accepted with it, and that the hatch does **not** disable
byte-equality — a blanket exemption is the failure that would turn the hatch
into a hole, and it has its own mutation row.

### The N+1th region is proved too, not just the two that exist

quest-cli had to show that *one* marked region is usable. This implementation
declares its regions in code, so the thing that has to be shown is that **adding**
one works — generation, byte-equality, clause-3 masking, `--write` and the
rendering rule all generalising past the two that happen to exist today.

Every other test in the suite exercises those two, so a machine silently
specialised to `published-bullet` and `status` would pass the entire file. The
N+1 tests patch a **copy of the real script** to declare a third region the way a
maintainer would, then run the real binary against a README carrying three. They
assert it is accepted when it matches, byte-checked and named *by its own id*
when it drifts, reported by its own id when missing, filled by `--write`, and —
the one most likely to be specialised — that its bytes are **masked for clause
3** like the others. That last one matters because the third region's generated
content deliberately carries the package's own name next to a version: if masking
were specialised to the two known ids, the gate would refuse what its own
generator produces.

Mutation: restricting the region machinery to the first two ids fails all five,
and nothing else in the suite notices.

### A4 re-runs the assertions; it does not grep for a sentence

The first version of the read-back searched the served README for the literal
`**Status: 0.7.0 released.**`. That string does **not** appear contiguously in
what the registry serves, because the region markers split it — the source reads
`**Status:<!--lore-version:status:begin--> 0.7.0 released.**`. The step would
have gone red on a **correct** release, seconds after the one irreversible
action in the whole process, which is close to the worst possible false alarm.

It now writes the served bytes to a temp directory beside this release's
`package.json` and runs `--check` over them. That cannot drift from the
generator, because it *is* the generator — and it checks clause 3 and the
rendering rule against the registry's copy too, which the literal never would
have. Proved both ways: the packed 0.7.0 README against 0.7.0's `package.json`
exits 0; the same README against a 0.7.1 `package.json` — the registry serving
the previous release's page, which is the defect A4 exists to observe — exits 1
naming both regions.

**Neither half of this was caught by a test.** It was caught by asking what the
registry actually serves, which is the same question that found the rendering
defect. The A4 step runs only inside a real publish, so a wrong assertion there
is invisible until the moment it matters most.

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
| an allow span made a blanket exemption | 3 — including the hatch's own acceptance test |
| stray-marker detection reverted to first-occurrence | 1 |
| region machinery specialised to the first two ids | 5 — and nothing else in the suite notices |
| the gate deleted from `publish-release.sh` | 1 — the refusal test written for it |
| *(unmutated)* | **0 of 33** |

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
- `scripts/readme-readback.sh` — the A4 read-back, called by `release.yml`'s
  `publish` job, naming the package and version it read. It is a script rather
  than an inline `run:` block so that `test/readme-readback.test.ts` can drive
  every branch of it against a stubbed `npm`; see "A4 shipped two defects" below
  for why that mattered.
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

**Say what the gate does not cover, because its success message sounds wider
than it is.** A green run prints "no name/version pair outside any of them",
and the runbook now takes README.md off the post-publish checklist. A reader
can reasonably draw "the README's version claims are current" from those two
facts together, and that is more than clause 3 guarantees: clause 3 is
*name-adjacency*, so a version claim in a block that never names
`@opum-ai/lore` is invisible to it by design. The lockstep sentence is exactly
such a block — it carries `quest` and a number, and nothing else. Today that
sentence is the only known instance; it is not checked, and it will be false the
day lore and quest diverge, which LCLI-511 exists to resolve.

## What an adversarial review found after the first implementation passed CI

Everything in this section was found **after** a fully green run (`35018902430`
on `930935d9`, all five required contexts including `windows-latest`). None of
it was reachable by the suite as it then stood. It is recorded because the
pattern — not the individual bugs — is the reusable part: *green proves the
tests pass, not that the gate measures what its message claims.*

### Clause 3 was blind to this README's own house style

`VERSION_TOKEN` was anchored `(?<![\w.])...(?![\w.])`, and its docblock asserted
that this made `v0.7.0` match "at the digits". It did not: `v` is a word
character, so the lookbehind rejected it. The trailing class rejected any
version ending a sentence for the same reason. Measured:

| input | old | new |
|---|---|---|
| `v0.7.0` | no match | match |
| `` `v0.6.2` `` | no match | match |
| `the release is 0.6.2.` | no match | match |
| `0.6.2.3` | no match | no match — still not a version |
| `rev0.7.0` | no match | no match — still not a version |

Two sentences naming this package next to a stale version therefore scored
**exit 0** against the real README, with the gate printing its affirmative
"no name/version pair outside any of them". This was not a generic regex nit:
the generated `status` region itself writes ``Tag `v0.7.0` ``, so `v<version>`
is precisely what the next hand-written release sentence reaches for.

**The comment was worse than the bug.** A docblock stating behaviour the code
does not have is what the next reader checks *instead of* the code, so it would
have survived the next review too.

### A4 shipped two defects, in a step no test could reach

A4 ran in exactly one place: inside a real `npm publish`, seconds after the only
irreversible action in the release. Both defects below were found by reading it,
not by running it, and neither was reachable by any test while the logic sat
inline in `release.yml`.

**It named an object it had never read.** The step wrote
`spec="@opum-ai/lore@${version}"` and reported "the README the registry serves
for `${spec}`". npm's `readme` is a **packument-level** field, not a per-version
page. Measured 2026-09-15 against the live registry:

```
npm view @opum-ai/lore@0.7.0 readme  -> 14446 bytes, sha256 25b24c8dd262bb9c...
npm view @opum-ai/lore@0.6.2 readme  -> the SAME 14446 bytes
npm view @opum-ai/lore@0.6.1 readme  -> the SAME 14446 bytes
```

The version qualifier is inert for that field; npm serves whatever the most
recent publish carried. So the step named a version-specific page while reading
a package-level one — the same defect class as the stale README it exists to
catch, inside the fix for it.

**It would have gone red on a correct release.** The step guarded only the case
where the registry serves an *empty* readme, treating that as propagation lag.
But a lagging replica does not serve nothing — it serves **the previous
release's README**, which is byte-for-byte the thing A4 flags. LCLI-460 records
0.5.0 taking ~25 minutes to propagate, and the preceding visibility-wait step is
explicitly allowed to finish with packages still pending. A false alarm seconds
after an irreversible publish is close to the worst possible failure mode, and
it is the *second* time this exact shape appeared in this change: the first
draft of A4 grepped for a literal the markers split.

The fix is to **discriminate the two hypotheses instead of assuming one**. A4
now retries within the registry window, and when the window is exhausted it asks
whether the served README satisfies the *previous* release's assertions. If it
does, that is propagation lag wearing the costume of a defect, and it warns. It
fails only when the page matches **no** release we published — when lag has been
positively ruled out.

### The one documented invariant with no test behind it

`splitBlocks` reads the **original** lines, and its docblock explains why:
structure taken from the masked text would let a fully-masked line read as blank
and tear one paragraph in two, hiding a name/version pair straddling the seam.
The invariant is real — a fixture with the package name before a fully-masked
line and a stale version after it is refused by the real script and **accepted**
by the mutant — and nothing in the suite noticed when it was inverted. It has a
test now.

### Mask offsets counted the wrong unit

`maskRegions` spread with `[...text]`, which iterates **code points**, while
region offsets come from `indexOf`, which counts **UTF-16 code units**. One
astral character before a region — an emoji in a heading, an ordinary README
edit — shifted every mask right by one per astral char. The observable failure
is a **false red on a correct file**, whose error message points at the
generator's own output and tells the author to move a claim that is already
inside a region. The mirror hazard is a mask sliding onto real text and hiding a
genuine pair. `README.md` has zero astral characters today; that is luck, not a
guarantee.

### Two smaller ones, same shape

The manual path's post-publish checklist still printed
`npm view ... | grep -n 'Status: .* released'`, which matches **nothing** against
the README this tool generates — the markers split the literal, so there is no
space after `Status:`. The workflow's copy of that mistake had been fixed; the
operator-facing copy had not, and the operator is the one holding the
irreversible action. It now runs `--check` over the served bytes, like A4.

And `publish-release.sh` reported exit 2 — "the checker could not read its
input" — with the detailed stale-README story, sending an operator to fix a file
that is fine when the real problem is a missing or truncated tarball.

### The mutation matrix for the new tests

Every fix above is held by a test that was checked to fail without it:

| Mutation | Tests that fail |
|---|---|
| `VERSION_TOKEN` reverted | 2 — SHAPE E, SHAPE F |
| `maskRegions` back to code-point spread | 1 — the astral acceptance test |
| `splitBlocks` reads the masked lines | 1 — the straddle test |
| container-prefix pattern reverted | 1 — the `> - ` rendering test |
| A4's lag discrimination removed | 1 — the previous-release warning test |

**One of these is honest about being weaker than it looks.** The second astral
test ("still REFUSES a stale pair when astral characters are present") does
*not* fail under the code-point mutation — the planted pair sits far enough from
any region that the shifted mask never reaches it. It is kept as the acceptance
half of a pair, not claimed as a discriminating test.

The A4 tests were written against a stubbed `npm`, and the lag test **failed on
its first run** — the stub matched the `versions` argument at the wrong position,
so it answered every read with the readme and the lag branch was unreachable.
That is the failure a test is supposed to have before it is believed.

### What the fleet found next, by generalising the question

The three findings above produced a rule — *ask what a gate's success message
claims, versus what it measured* — and three sibling repositories ran it against
their own gates within the hour. Two results came back that change this file.

**The reporting is a separate thing from the assertion, and extracting the
assertion does not put the reporting under test.** opum-marketplace already had
both of their federated checkers in `scripts/` with passing suites, which is the
remedy proposed above — and the defects survived anyway, because the success
message is composed in the `import.meta.url === argv[1]` main block that no test
reaches. One of theirs printed `market.plugins.length` ("3 plugin(s) checked")
while checking only v-prefixed tag pins, silently folding a branch-pinned entry
into an OK count.

This file's own gate had the same shape, in the latent form: the success line
reported `REGION_IDS.length` — the number of regions *declared* — while the loop
that compares them carries a `continue`. The two numbers agree today only
because clause 1 turns any missing region into a failure before the line is
reached. That is a guard, not an identity, and it is one refactor from not
holding. The count is now incremented by the comparison itself. **Stated
honestly: this was never observed to lie here**, unlike opum-marketplace's,
which did.

The operator-facing checklist in `publish-release.sh` was the live instance. It
is reporting, it shipped a command that matched nothing, and `--dry-run` exits
long before it is printed — so no test could reach it, which is not the same as
its being right. It now has `--print-checklist` and six tests, including one
that guards the *reason* the instruction changed rather than its wording: if the
generator ever stops splitting the literal, the test fails and the instruction
could honestly go back to being a `grep`.

**And the question generalises past this contract.** Asked as "does anything
*outside* the step body repeat its claim without its caveat" (opum-cli-e2e's
phrasing), it finds things that are not gates at all — a ruleset name, a check
name, a line of CLAUDE.md. Run over this repository it returned one hit, and not
in this contract: `ci.yml`'s `main-is-fast-forward-of-dev` job asserts that
main's new HEAD is an ancestor of `dev`, which is **containment**, while its name
claims **fast-forwardness**. A rewind of main to an older commit still on dev
passes it. Filed as LCLI-514 with the measurement; it is not this task's to fix.

The two release steps here survive the same question: "Shipped-README version
assertions against the PACKED tarball" does assert against the packed tarball,
and "Read the shipped README back off the registry, naming what was read" claims
to read and to name, not to verify — which, after the lag fix above, is exactly
what it does. Nothing in `CLAUDE.md`, `README.md` or `docs/reference/index.md`
restates either claim.

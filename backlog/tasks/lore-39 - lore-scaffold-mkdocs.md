---
id: LORE-39
title: lore scaffold mkdocs
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:27'
updated_date: '2026-07-12 19:39'
labels:
  - cmd
  - consumers
milestone: m-6
dependencies:
  - LORE-28
documentation:
  - docs/reference/consumer-compatibility.md
priority: medium
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold repo-root mkdocs.yml (Material, navigation.indexes, tags + docs/tags.md, absolute_links relative_to_docs, validation warn). User-owned; never re-overwritten.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mkdocs build succeeds on the bundle
- [x] #2 Config is additive and OKF-harmless
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped: commands/scaffold.ts + core/consumer-scaffold.ts. `lore scaffold mkdocs`
writes mkdocs.yml (repo root) + docs/tags.md (a normal OKF Reference concept
carrying the MkDocs Material `<!-- material/tags -->` marker, serialized against
the structural default profile like init's root index -- not a RESERVED_STEMS
entry, since nothing regenerates it wholesale after scaffolding).

Never-silent-clobber: unlike `lore init`'s silent skip-if-present, scaffold
refuses (exit 5, conflict) naming every colliding path if ANY planned file
already exists, writing nothing, unless --force. Checked all-or-nothing before
any write.

AC#1 (mkdocs build succeeds) verified two ways: (1) manually -- installed
mkdocs+mkdocs-material in a scratch venv and ran a real `mkdocs build` against
a copy of this repo's docs/+backlog/ with the exact scaffolded config and
tags.md content, confirmed exit 0 with only pre-existing advisory warnings
(cross-tree backlog/ links, a couple of stale anchors -- all tolerated by the
shipped `not_found: warn`/`anchors: warn`, matching ADR-0010 Sec4's documented
limitations); (2) automated as a new CI job `scaffold-mkdocs` (mirrors the
existing compile-smoke job's pattern of keeping a heavyweight external
toolchain -- here Python/mkdocs -- out of `bun test`) that runs
`bun src/cli.ts scaffold mkdocs` for real against the live bundle then
`mkdocs build` (no --strict: the shipped config's own leniency is what's
being asserted, not a stricter bar it never promised).

AC#2 (additive, OKF-harmless) verified: mkdocs.yml lands at repo root
(sibling to docs/, never inside it); docs/tags.md validates cleanly via
`lore validate`/`lore check`; a custom profile without a `Reference` type
still scaffolds (no $schema modeline, structural profile used for
validation) -- covered by test/consumer-scaffold.test.ts.

Full ripple closed: cli.ts dispatch (after `schema`, before `graph` --
lockstep order), manifest.ts entry (help.test.ts golden exit-code row:
[0,2,4,5,6]), agent-bridge.ts LORE_COMMANDS entry (agents.test.ts phantom-list
updated -- scaffold is no longer a phantom), `bun src/cli.ts agents --force`
regenerated SKILL.md, cli-contract.md's scaffold.result promoted from
deferred, cli-surface.md marked mkdocs shipped / docusaurus+obsidian pending.
`lore sync` run (regenerated reference/runbooks/specs/adr index.md + root
docs/index.md + docs/log.md -- first time these sub-indexes were generated
in this repo; unrelated to scaffold logic itself, just the sync gate
reconciling bundle-wide navigation that had drifted since LORE-29).

Gates: 1454 tests, biome clean, tsc clean, `lore check` 0 errors/0 warnings.

/code-review high (workflow-backed) disposition: 4 findings, all fixed.
1. [correctness] yamlScalar's unsafe-scalar blocklist missed YAML 1.1 core-schema
   booleans (yes/no/on/off/y/n case-insensitive) -- a repo dir named e.g. "off"
   would be emitted unquoted and coerced to a bool by mkdocs' PyYAML loader.
   FIX: dropped the heuristic entirely, always double-quote site_name (JSON.stringify)
   -- closes the whole class rather than extending an enumeration. Regression test
   parses the generated YAML with js-yaml and asserts site_name stays a string for
   off/Off/no/yes/on/y/n/2026/null/~/true-ish.
2. [correctness] the two-file write loop wasn't atomic -- a mid-loop failure (e.g.
   read-only docs/) could leave mkdocs.yml written with no matching docs/tags.md.
   FIX: writeAllOrRollback captures each file's prior bytes (or absence) before
   writing and restores/removes on any later failure in the same run. Caught a
   real bug in the fix itself during testing (a raw EISDIR from readFileSync on a
   directory escaping uncaught) -- now guarded. Two new regression tests: a
   read-only docs/ (POSIX-only) and an already-overwritten file's rollback under
   --force.
3-4. [cleanup] scaffold.ts now reuses the shared commands/args.ts parseCommandArgs
   + usage() instead of a private tokenizer copy, and imports DOCS_DIR from
   core/scaffold.ts instead of a hardcoded "docs" literal.

Re-verified against a real mkdocs build after the fixes (site_name now quoted,
same clean exit 0 with only the pre-existing advisory warnings). 1456 tests,
biome clean, tsc clean, lore check 0/0.

PR: https://github.com/jeremy-newhouse/lore/pull/new/feat/lore-39-scaffold-mkdocs
(not yet opened as of this note -- opening next)

/code-review high fold, round 2 (7 findings, all fixed):

1. [SEVERE] Rollback deleted a pre-existing-but-unreadable file instead of restoring it.
   writeAllOrRollback's `before === undefined` conflated "never existed" with "existed but
   readFileSync threw" (e.g. EACCES). Fix: the write loop now refuses UP FRONT -- before ever
   writing that file -- when a pre-existing file's bytes can't be read (readExistingOrThrow,
   classified via the shared ioError: EACCES/EPERM -> denied, EISDIR/EEXIST/ENOTDIR -> conflict).
   A file that existed before the run is now provably never written, let alone deleted, in that
   path. Regression test: chmod 0o200 (write-only, unreadable) pre-existing mkdocs.yml + a forced
   later-file failure under --force; asserts the file survives untouched with its original bytes
   (confirmed this test fails -- with an ENOENT proving the delete -- against the pre-fix code).

2. Directory creation (ensureDir(docs/, ...)) ran outside the write-loop's rollback, so a freshly
   created (still-empty) docs/ survived a later write failure. Fix: writeAllOrRollback now takes
   `dirs` alongside `files` and registers a matching undo (rmdirSync -- empty-only, never
   recursive) for any directory IT created, in the same LIFO undo stack as file writes, so
   directory + file creation roll back atomically. Regression test: fresh repo (no docs/), force
   mkdocs.yml's write to fail structurally (a directory occupying the path) under --force, assert
   docs/ does not exist afterward (confirmed fails against pre-fix code).

3. TOCTOU gap in the never-clobber guarantee (single existsSync preflight, no re-check at write
   time). Fix: routed the !force write path through fswrite.ts's existing atomic `wx`-based
   createIfAbsent instead of a plain existsSync+write, closing the race -- a file that appears
   between the command's preflight and the write is now a loud conflict, never a silent clobber.
   No new deterministic test (the race window is sub-millisecond and not constructible without a
   fault-injection seam); the existing --force/non-force test suite covers both code paths this
   routes through.

4. Moved the corrected writeAllOrRollback out of scaffold.ts (private, unexported) into
   fswrite.ts as an exported primitive (dirs + files + {force}), composed entirely from
   fswrite.ts's own existing pieces (ensureDir, createIfAbsent, writeFileOverwriting, ioError,
   conflictError). scaffold.ts now just calls it. rename.ts is untouched (its own "shared
   concern, deferred" note stands) -- left for a future adoption pass per the review's scope.

5. docs/adr/index.md carried a hand-written "## Index" table duplicating the lore:index managed
   block underneath it (16 ADRs listed twice) -- same bug sibling branches LORE-14 and LORE-9 hit
   on the same base file. Removed the hand table, matching their fix exactly; file is now pure
   managed-block. `lore sync` run afterward backfilled docs/log.md with this branch's own commit
   (first time logged) -- unrelated drift reconciliation, not a scaffold-logic change.

6. Extracted the shared "serialize against the structural default profile, with a conditional
   $schema modeline" pattern (duplicated near-verbatim between core/scaffold.ts's
   rootIndexDocument and core/consumer-scaffold.ts's tagsIndexDocument) into one exported helper,
   serializeStructuralConcept(concept, profile), in core/scaffold.ts (consumer-scaffold.ts already
   depended on scaffold.ts for DOCS_DIR, so this is the natural shared home). Both call sites now
   just build their Concept and delegate.

7. Hoisted the byte-for-byte-duplicated `expectError(type, fn)` test helper (found in
   context.test.ts, graph.test.ts, help.test.ts, instructions.test.ts, query.test.ts, and this
   branch's new consumer-scaffold.test.ts -- 6 copies) into test/helpers.ts, exported, and updated
   all six call sites to import it instead of redefining it. Left the differently-shaped
   `expectError(args: string[])` helpers in new/replace/supersede/rename.test.ts alone (out of
   scope -- different signature, different precedent).

Verified: all 7 fixes' regression-worthy tests (#1, #2) confirmed to FAIL against the pre-fix
code (temporarily restored it, re-ran, restored the fix) before finalizing -- not just
confirmed-passing against the fix, but confirmed-failing against the bug.

Gates: 1458 tests (1456 + 2 new), biome clean (4 pre-existing infos in untouched files), tsc
clean, `lore check` 0 errors/0 warnings. Manually smoke-tested `lore scaffold mkdocs` end-to-end
(fresh init, first scaffold, re-run refusal, --force overwrite) in a scratch repo.
<!-- SECTION:NOTES:END -->

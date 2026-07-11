---
id: LORE-39
title: lore scaffold mkdocs
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:27'
updated_date: '2026-07-11 13:56'
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
<!-- SECTION:NOTES:END -->

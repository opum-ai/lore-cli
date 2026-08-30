---
id: LCLI-357
title: >-
  lore scaffold mkdocs generates a docs/tags.md that lore validate --strict then
  rejects
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:30'
updated_date: '2026-08-30 00:06'
labels:
  - scaffold
  - validate
  - e2e
dependencies: []
priority: medium
type: bug
ordinal: 478000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A freshly scaffolded bundle fails lore's own strict gate.

'lore scaffold mkdocs' writes docs/tags.md with frontmatter carrying a legacy 'timestamp:' key. 'lore validate' then warns on that exact file — 'legacy key "timestamp" in docs/tags.md; tolerated under OKF 0.2, but new content should use generated.at' — and under --strict that warning is an error, so 'lore validate --strict' exits 6. Lore generates content that its own validator rejects.

Reproduction (empty git repo, lore 0.3.4):

  backlog init P --agent-instructions none
  lore init --yes --tracker backlog --json
  lore new story "Alpha" --summary S. --json
  lore validate --strict; echo $?        # 0
  lore scaffold mkdocs --json
  lore validate --strict; echo $?        # 6  <-- regressed by scaffold alone
  # warning docs/tags.md [frontmatter]: legacy key "timestamp" ...

Second, smaller point in the same command: 'lore help scaffold' documents the command as 'Generate a downstream docs consumer's config, additively outside docs/'. Both implemented targets write inside docs/ — mkdocs creates docs/tags.md, obsidian creates docs/.obsidian/app.json and docs/.obsidian/.gitignore. Either the help text or the behaviour is wrong; the generated files are legitimate, so the documented contract looks like the thing to correct.

Note 'lore check --strict' still exits 0 on the same tree — only validate --strict catches it — so a repository gating solely on check would ship the warning-bearing file without noticing.

Evidence: opum-cli-e2e baselines/v0.2.9, row 'lore/retrieval :: a freshly scaffolded bundle still passes lore's own strict gate' (FAIL, 1 of 17). Suite: suites/31-lore-retrieval.mjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Generated docs/tags.md frontmatter uses generated.at rather than the legacy timestamp key, so a freshly scaffolded bundle passes lore validate --strict
- [x] #2 A regression test scaffolds each implemented target into a clean bundle and asserts validate --strict and check --strict both exit 0 afterwards
- [x] #3 The scaffold help text and the implementation agree about whether generated files may land inside docs/; whichever is corrected, the other is updated to match
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed and verified 2026-08-29.

AC#1 -- the generated file. docs/tags.md's frontmatter now goes through the shared versionedProvenance(timestamp, profile.okfVersion) -- the same helper the root docs/index.md and every 'lore new' write already used -- instead of a hardcoded 'timestamp:' key. Under OKF 0.2 it emits generated.{by,at}; under 0.1 it still emits 'timestamp', because the helper follows the profile. The hardcoded key was the legacy 0.1 spelling, which is why the validator warned 'legacy key' and --strict turned that into exit 6. Routing through the helper means scaffold's output shape and the validator's expectation are computed from one source and cannot disagree again.

preservedTagsTimestamp (the LORE-263 idempotency seam) was extended into onDiskProvenanceInstant, which reads generated.at and falls back to the legacy 'timestamp'. Be precise about what that buys, because the obvious claim is wrong and I corrected it in the docstring after the test disproved it: it does NOT preserve idempotency across the upgrade. A pre-fix tags.md differs from the new plan by the provenance KEY, so it can never be byte-identical and always reaches the never-silent-clobber conflict regardless of which instant is reused. What it buys is a DETERMINISTIC conflict -- the plan's instant comes off disk, not off the wall clock, so a user re-running sees stable reported bytes. --force is the upgrade path and re-stamps fresh by design.

AC#2 -- regression test, per target not mkdocs-only. New describe block in test/consumer-scaffold.test.ts: lays down init's real plan, asserts the un-scaffolded bundle is strict-clean FIRST (so a later failure is provably the scaffold's), then loops mkdocs/docusaurus/obsidian asserting validate --strict AND check --strict both exit 0 after each. Both gates are asserted because 'lore check --strict' never caught this -- the legacy-key finding is validate-tier -- so a repository gating solely on check shipped the file unnoticed. Plus a frontmatter-shape test and an upgrade test proving a legacy-key file yields a clean conflict (not a crash, not a silent clobber, file left byte-identical) and that --force upgrades it into a strict-clean bundle.

Proven red before green: the two new assertions failed with exit 6 / timestamp present, while docusaurus, obsidian, and the pre-scaffold baseline all passed -- isolating the failure to mkdocs's tags.md.

AC#3 -- the help text was the wrong side, and the false claim had SEVEN sites, not one. Corrected the claim, not the behaviour: the generated files are required by their consumers (Material's tags plugin renders the index from a page inside the docs tree; Obsidian scopes a vault to its root). The real invariant is ADDITIVE -- scaffold only adds files and never moves, renames, restructures, or rewrites authored content. Location was never load-bearing.

An enumerating grep (not a curated list) found every site: src/core/manifest.ts and src/core/agent-bridge.ts (the help summary, now 'Generate a downstream docs consumer''s config additively, rewriting nothing'), src/commands/scaffold.ts and src/core/consumer-scaffold.ts module docstrings, docs/reference/cli-surface.md, docs/reference/consumer-compatibility.md (2 sites), docs/adr/0003-okf-substrate.md, and ADR-0010 -- which was the SOURCE: its section 2 was titled 'Scaffolding is additive and lives outside docs/' and said configs are written 'next to, never inside' the bundle. ADR-0010 carries a dated retraction note rather than a silent rewrite, recording that the location claim was never true of the implemented targets and that the additive decision is what the code has always honoured. It also records the second-order defect: because docs/tags.md was not thought of as bundle content, it was written with a non-OKF-0.2 key -- anything lore adds under docs/ is an OKF concept and must satisfy lore's own gates.

Notably the consumer-scaffold docstring ALREADY named obsidian as 'one intentional exception' while asserting every other target writes outside -- so it was half-corrected once before and still wrong, because mkdocs was missed. Fixing one instance of a shape is not fixing the shape.

.claude/skills/lore/SKILL.md regenerated via 'lore agents --force' (the summary is generated, never hand-edited).

Validation: bun test 2758 pass / 0 fail / 1 skip (69/69 in consumer-scaffold.test.ts). typecheck 0, lint 0, lore check 0, lore validate --strict 0, lore agents --check 0 -- each exit code taken without a pipe. The task's exact repro re-run against this build in a fresh git repo: validate --strict is 0 before scaffold, 0 after (was 6), and check --strict is 0.
<!-- SECTION:NOTES:END -->

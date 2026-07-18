---
id: LORE-41
title: lore scaffold obsidian
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:27'
updated_date: '2026-07-18 21:50'
labels:
  - cmd
  - consumers
milestone: m-6
dependencies:
  - LORE-28
documentation:
  - docs/reference/consumer-compatibility.md
priority: low
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write docs/.obsidian/app.json (relative links, wikilinks OFF); gitignore workspace/cache; print Files and Links guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening docs/ as a vault gives graph + backlinks
- [x] #2 Only app.json is committed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add buildObsidianScaffold to core/consumer-scaffold.ts: dirs=[docs/.obsidian], files=[docs/.obsidian/app.json] with {useMarkdownLinks:true, newLinkFormat:"relative", alwaysUpdateLinks:true} (consumer-compatibility.md §3.2). Plan also carries `notes` guidance lines (Settings -> Files & Links: relative path / wikilinks off / auto-update on; open docs/ itself as the vault) since app.json alone is best-effort per that doc.
2. Extend ConsumerScaffoldPlan/ScaffoldResult with an optional `notes: readonly string[]` (empty for mkdocs/docusaurus), threaded through commands/scaffold.ts's runScaffold and rendered as extra lines after the summary in plain output (and carried verbatim in the JSON envelope).
3. Wire obsidian into commands/scaffold.ts's BUILDERS map (IMPLEMENTED_TARGETS auto-derives from it); update the file's module docstring (obsidian is no longer "not yet wired") and the stale "only mkdocs and docusaurus are implemented today" hint text.
4. Confirm the pre-existing .gitignore entries (docs/.obsidian/workspace*.json, docs/.obsidian/cache) already satisfy AC#2 (only app.json committed) -- no .gitignore change needed, just verify.
5. Tests: core/consumer-scaffold tests for buildObsidianScaffold (deterministic, exact file path/contents, JSON keys/values, trailing newline); commands/scaffold tests (fresh scaffold creates docs/.obsidian/app.json + docs/ dir, never-silent-clobber, --force overwrite, plain-mode rendering incl. guidance notes, JSON envelope carries notes); remove the now-stale "obsidian is not implemented yet" usage-validation test case.
6. Verify docs/reference/consumer-compatibility.md §3.2 still reads correctly once obsidian ships (it already documents this exact app.json shape) -- no edit expected, but check via `lore check`/`lore validate`, never hand-edit.
7. Gates: bun test, bunx tsc --noEmit, bunx biome check, bun run lore check; manually run `lore scaffold obsidian` against a scratch repo to eyeball the guidance output and confirm docs/.obsidian/app.json opens cleanly in a real Obsidian vault if feasible.
8. Feature branch feat/lore-41-scaffold-obsidian -> PR into dev for review (per lore's per-task branch+PR convention).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan. core/consumer-scaffold.ts: added buildObsidianScaffold (pure) emitting
docs/.obsidian/app.json ({useMarkdownLinks:true, newLinkFormat:"relative", alwaysUpdateLinks:true}
per consumer-compatibility.md §3.2), plus an optional `notes` field on ConsumerScaffoldPlan
carrying OBSIDIAN_GUIDANCE_NOTES (Files & Links UI guidance, since app.json is best-effort).
commands/scaffold.ts: wired obsidian into BUILDERS (IMPLEMENTED_TARGETS auto-derives), threaded
plan.notes through ScaffoldResult, rendered as extra lines after the file summary in both plain
and --json output. Updated the module docstring and the stale "not implemented yet" hint text.

Real dogfooding turned up a genuine gap in the pre-existing .gitignore: the user installed
Obsidian (CLI-enabled) mid-session and opened docs/ as a real vault, which created app.json,
appearance.json, core-plugins.json, workspace.json -- only workspace.json matched the old
`docs/.obsidian/workspace*.json` / `docs/.obsidian/cache` patterns; appearance.json and
core-plugins.json were NOT ignored (git status showed them as untracked/committable), violating
AC#2. Fixed by replacing the enumerated patterns with an exclude-all-except-app.json pair
(`docs/.obsidian/*` + `!docs/.obsidian/app.json`), verified against the real vault directory --
now only app.json shows as untracked; workspace.json/appearance.json/core-plugins.json all
correctly ignored. An enumerated list can't keep up with every file Obsidian creates
(hotkeys.json, graph.json, plugins/, snippets/, cache/, ...); exclude-all-except is the robust
form.

AC#1 real verification technique (new for this project -- an actual running Obsidian instance,
driven via its CLI, which the user installed specifically so this could be verified for real
rather than accepted on doc-matching alone): registered vault "docs" -> /Volumes/external/repos/lore/docs
(already open). `obsidian links path=index.md` resolved 33 real outgoing links across
adr/reference/runbooks/specs; `obsidian backlinks path=index.md counts` showed 12 real files
backlinking to it -- confirms the graph/backlinks capability genuinely works when docs/ is
opened as the vault (AC#1's actual claim), driven by lore's own already-correct link generation
(LORE-28). The 5 `obsidian unresolved` entries are all links outside docs/ (../../CHANGELOG,
../../lore-spec, ../../src/core/*.ts) -- the already-documented, accepted cross-tree-link
trade-off (consumer-compatibility.md), not a defect here. The 1 orphan is log.md (machine-
generated, excluded from nav by design) -- also expected.

Ran the real `lore scaffold obsidian --force` against this repo's own docs/ (app.json existed as
`{}` from Obsidian's own vault-open default) and reloaded the live vault (`obsidian reload`);
confirmed via `obsidian eval` reading `app.vault.getConfig(...)` that the running app actually
loaded our exact three settings from the file on disk, not just that the bytes look right.
docs/.obsidian/ is left in the working tree, untracked except app.json (matches the new
.gitignore) -- NOT added to this PR's commit, since lore's own repo does not dogfood the
mkdocs/docusaurus scaffolds either (no committed mkdocs.yml/website/ at the repo root); left for
the user to decide whether to commit docs/.obsidian/app.json separately.

Tests: 9 new (core/consumer-scaffold.test.ts) covering buildObsidianScaffold determinism/content,
fresh scaffold, never-silent-clobber + --force, plain/JSON rendering incl. notes; removed the now-
stale "obsidian not implemented yet" usage-validation test. bun test: 1494 pass (was 1485), 0
fail. tsc --noEmit clean. biome check: 4 pre-existing infos only (same as LORE-53/54), none in
touched files. `lore check`: 37 files, 0 errors/warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented `lore scaffold obsidian` (buildObsidianScaffold in core/consumer-scaffold.ts + wired into commands/scaffold.ts's BUILDERS): writes docs/.obsidian/app.json with the three Files & Links settings, plus Files & Links UI guidance notes printed after the summary (plain and --json). Fixed a real .gitignore gap found via dogfooding (exclude-all-except-app.json, not an enumerated file list). Verified with 9 new tests (1494 total pass), tsc/biome/lore check clean, and live evidence from a real running Obsidian instance: real backlinks/graph resolution against this repo's own docs/ (AC#1), and git status confirming only app.json is trackable (AC#2).
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LCLI-265
title: >-
  ADR-0009 §2 misdescribes how lore orphans finds unowned tasks (stale search
  --json claim + missing parent-chain clause)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - docs-drift
  - adapter-backlog
  - cmd-meta-a
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: low
type: bug
ordinal: 367000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
ADR-0009 §2's description of the `lore orphans` rule should match what `src/commands/orphans.ts` actually does, so the canonical decision record stops misdescribing the implementation it governs.

## Observed
ADR-0009 (`docs/adr/0009-story-task-coupling-reconciliation.md`) §2 states that `lore orphans` "queries \`backlog task list --json\` (and \`backlog search --json\`) for tasks lacking any \`doc:\` label". Two inaccuracies, one pre-existing and one new:

1. **Pre-existing (predates LCLI-261).** `orphans.ts` calls only `probe()` and `listTasks()` — it never calls `searchByLabel`/`searchTasks`. It also already consulted concepts' forward `tasks:` refs, not just the absence of a `doc:` label, so 'lacking any doc: label' was already an incomplete statement of the rule.
2. **New in LCLI-261 (Done).** The rule now also walks the Backlog `parentTaskId` ancestor chain: a task is exempt when any ancestor is itself owned. ADR-0009 §2 does not mention this at all.

## Why it matters
This is a documentation-native project and ADR-0009 is the canonical home for the Story/Task coupling and orphan-detection rules. LCLI-261's review found a source docstring in `orphans.ts` citing ADR-0009 §2 as authority for a claim that section does not actually make (fixed in `cac03fa`) — the underlying cause is that the ADR itself is behind the implementation. Same class as LCLI-60 (ADR-0002 overstating the capability-probe exit code).

## Scope note
LCLI-261 deliberately did NOT fix this: correcting it properly means also fixing drift that predates that task, which was outside its reviewed diff. Filed by the wave-3 orchestrator at the LCLI-261 reviewer's recommendation.

## Refs
docs/adr/0009-story-task-coupling-reconciliation.md (§2, approx. lines 78-119), src/commands/orphans.ts (`hasOwnedAncestor`, `computeOrphans`), docs/reference/cli-surface.md (orphans entry, already accurate).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADR-0009 §2 no longer claims 'lore orphans' uses 'backlog search --json'; the described data source matches what orphans.ts actually calls (probe + listTasks only).
- [x] #2 ADR-0009 §2 describes the full current ownership rule: a task is not an orphan when it carries a 'doc:' label, OR is forward-referenced by a concept's 'tasks:' list, OR has an ancestor in its Backlog parent/subtask chain that is itself owned (LCLI-261).
- [x] #3 Any other prose in docs/ describing the orphans rule is checked for the same drift and corrected or confirmed accurate; 'lore check' stays green.
- [x] #4 No behavior change — this is documentation only; the full suite stays green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/commands/orphans.ts (hasOwnedAncestor/computeOrphans) as ground truth: orphans.ts calls only adapter.probe() + adapter.listTasks() (one unfiltered `backlog task list --json` snapshot) — never searchByLabel/searchTasks (`backlog search --json`), confirmed unused by grep across src/ and confirmed true since orphans' original LCLI-32 commit. Ownership rule = NOT orphan iff hasDocLabel(task) OR referenced (some concept's tasks: forward-ref) OR hasOwnedAncestor (same two tests walked up task.parentTaskId chain, LCLI-261).
2. Rewrite ADR-0009 section 2's second bullet (lines ~91-95: docs/adr/0009-story-task-coupling-reconciliation.md) to: (a) drop the stale "backlog search --json" claim, (b) state the single-snapshot read accurately, (c) describe the full three-part ownership rule (doc: label OR forward tasks: ref OR owned ancestor per LCLI-261), (d) correct the false "Bulk unlink also keys off the label set" claim (unlink takes explicit task ids, never queries the label).
3. Sweep other docs/ prose for the same drift (stale search claim / incomplete rule) per AC#3: cli-surface.md (task says already-accurate, confirm), cli-contract.md, architecture.md, lore-design.md, backlog-json-schema.md, backlog-cli-contract.md, adr/0014, adr/0016. Found two more instances of the same "orphans/unlink rely on backlog search/labels query" drift in backlog-cli-contract.md (§1.1 table row + §2.3 bullet) — correct both. Record per-file conclusion in task notes.
4. No src/ changes (AC#4 no behavior change). Drive all docs/ edits through the lore CLI per the lore skill (lore instructions) so managed blocks/links stay coherent — ADR files are plain prose edits (no managed blocks), so this is a direct edit + `lore check`/`lore sync` verification pass, not a `lore` mutation command.
5. Verify: bun test (expect 2176/0 baseline), bun run lore check (expect 40 files/0 errors/0 warnings), bun run lint, bun run typecheck. Confirm git diff has zero src/ changes.
6. Decide CHANGELOG.md entry: likely no entry warranted (internal ADR/doc accuracy fix, no CLI-surface change) — state reasoning explicitly in the return.
7. Commit in small logical commits (Conventional Commits, Refs: LCLI-265 trailer), including backlog/tasks/ edits, then push feature/LCLI-265.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#3 sweep — grepped docs/ for 'orphan' (case-insensitive, excluding generated docs/log.md) and checked every hit:
- docs/reference/cli-surface.md (orphans entry): confirmed-accurate — already states the full three-part rule (no concept lists it, no doc: label, no owned ancestor per LCLI-261). No edit.
- docs/reference/cli-contract.md (orphans.report row, read-heavy commands list): confirmed-accurate — only describes output shape/capping, makes no claim about the data source or ownership rule. No edit.
- docs/reference/architecture.md (command list, link/unlink section, adapter-isolation section): confirmed-accurate — general architecture-level mentions with no false claims about search or an incomplete rule. No edit.
- docs/specs/lore-design.md (§2.3 adapter capabilities, §10 build-order table): confirmed-accurate — §2.3 describes the adapter's overall JSON-only capability (it does have task-list/task-view/search code paths) without attributing search specifically to orphans; build-order table is just a milestone list. No edit.
- docs/reference/backlog-json-schema.md (labels[] callout): confirmed-accurate — correctly states lore orphans/link read the doc: label from labels[] in the task-list snapshot; matches orphans.ts's hasDocLabel. No edit.
- docs/adr/0014-core-has-no-llm-dependency.md (command list): confirmed-accurate — lists orphans among deterministic commands, no rule claim. No edit.
- docs/adr/0016-confluence-one-way-publish-deferred.md: 'orphaned pages' here refers to Confluence pages, unrelated to `lore orphans`. Not applicable, no edit.
- docs/reference/backlog-cli-contract.md: FOUND the same drift in two more spots and corrected both:
  1. §1.1 table's 'Fuzzy / label search' row claimed 'Used by orphans / unlink to find tasks owning a doc' — false; grepped src/ and confirmed zero production callers of searchByLabel/searchTasks (only test/backlog-adapter.test.ts calls them directly). Corrected to state these are adapter capabilities no lore command currently invokes, and describe what orphans/unlink actually do instead.
  2. §2.3's back-reference bullet claimed 'this is what lore orphans / lore unlink rely on' for the filtered `task list --json --labels` query — same false claim, corrected the same way.
- docs/adr/0009-story-task-coupling-reconciliation.md §2 itself: also corrected the trailing 'Bulk unlink also keys off the label set' claim in the same bullet being fixed for AC#1/AC#2 — verified false: `runUnlink` (src/commands/link.ts) takes explicit taskIds args, never queries by label.

Verification: bun test 2176 pass / 0 fail (baseline match); bun run lore check 40 files, 0 errors, 0 warnings (baseline match); bun run lint clean (biome, 112 files); bun run typecheck clean (tsc --noEmit). `git diff --stat -- src/` is empty — zero src/ changes, confirming AC#4 no-behavior-change.

Fix-pass round (independent reviewer request_changes on AC#3):

The reviewer confirmed AC#1/AC#2/AC#4 and both scope expansions in backlog-cli-contract.md, but found AC#3 incomplete: the original sweep above was keyed on grepping the literal string 'orphan', which cannot reach prose phrased without that word (e.g. "to find a story's tasks"). Correcting the record on what that sweep actually covered:

- The "backlog-json-schema.md (labels[] callout): confirmed-accurate" line above was WRONG. The §3 callout (task-view section, then lines 226-231) claimed 'lore orphans and lore link read it from this array' — but orphans reads a DIFFERENT array (the task-list summary's labels[], §4), never task-view's; and the callout's 'via `task edit --label`' was also stale (should be `--add-label`, per backlog.ts:946 and link.ts:267's addLabels patch). Both corrected.
- A second, previously-unfound instance in the same file: §4's "Filtering." paragraph (then lines 287-291) falsely claimed 'lore passes through the filters it needs (notably --label doc:<conceptId> to find a story's tasks, and a status filter for reconciliation); tasks is the filtered set'. Verified false against source: orphans.ts:166 calls adapter.listTasks() with zero options — the only production listTasks call in the whole repo; `lore tasks --status` filters client-side in resolveRollup (tasks.ts:153-197) over rows fetched one-by-one via `task view` (verifiedViewTask -> adapter.viewTask), never through `task list`'s own --status flag; {status, labels} is exercised only by test/backlog-adapter.test.ts. Also fixed the flag name (--label -> --labels, plural, matching backlog.ts:838's args.push("--labels", ...)). Rewritten paragraph now states this and is consistent with backlog-cli-contract.md:66's "no lore command currently calls either."

Sweep-method fix: re-swept the whole docs/ tree by drift CLASS, not the "orphan" keyword — grepped for --label (excluding --labels/--add-label/--remove-label), --labels, "search --json", searchByLabel/searchTasks, "filtered set", and status-filter language. Findings:
- docs/adr/0002-backlog-integration-json-only.md:159 — "set via `task edit --label`" — same false flag claim. Corrected to --add-label.
- docs/adr/0009-...:89 (§2's first bullet, the one the task already targets) — same --label-vs-add-label claim. Corrected to --add-label, and unlink's removal call named as --remove-label.
- docs/adr/0009-...: Context section (original lines ~39-43, the "A display-only annotation is not an index" bullet, predates §2 and was outside the original sweep's grep) — claimed "lore needs a field it can query through `backlog task list --json` / `backlog search --json`" to do orphan detection or unlink. Same drift class: no production code queries either for this today. Rewritten to keep the true design rationale (a label is exact-matchable, free text isn't) without claiming that capability is exercised today, and cross-references §2 for the real mechanism.
- docs/adr/0011-frontmatter-serialization-stability.md:155 — checked per reviewer's pointer; does NOT name a specific flag ("a `doc:<conceptId>` label via `backlog task edit`" — no --label/--add-label mentioned), so it makes no false claim. Left unchanged.
- docs/reference/backlog-cli-contract.md:183 and :196 — list --labels/--label/--add-label/--remove-label as members of the same flag-multiplicity family, and separately state plain --label on edit is the SET/REPLACE form lore deliberately does NOT use. Both are accurate reference material describing Backlog's flags in general, not misattributing usage to a lore command. Left unchanged.
- Remaining "search --json"/searchByLabel mentions (adr/0002:104, lore-design.md §2.3, architecture.md §3, cli-surface.md's "Coupling to Backlog.md" section, docs/index.md, mcp-tools.md, backlog-json-patch.md's migration history note) all describe the adapter's overall capability surface (what the boundary CAN invoke) rather than attributing search/filtering to a specific command's actual behavior — none claim orphans/link/unlink actually call search or a filtered list today. Confirmed accurate, left unchanged.
- docs/runbooks/docker-e2e-testing-environment.md:86 ("backlog task create --labels bug ...") is an unrelated e2e-repro example, not about the doc: coupling mechanism. Not applicable.

No CHANGELOG entry: this fix-pass found and corrected more doc-accuracy drift but nothing that changes lore's CLI surface or runtime behavior, so the original no-CHANGELOG reasoning (LCLI-67/LCLI-52 precedent: pure doc-accuracy fixes ship without an entry) still holds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR-0009 §2 rewritten to match src/commands/orphans.ts ground truth: dropped the stale 'backlog search --json' claim (orphans.ts calls only adapter.probe()+listTasks(); grep confirms zero production callers of searchByLabel/searchTasks anywhere in src/), and now describes the full current ownership rule — a task is owned (not orphaned) when it carries a doc: label, OR a concept's tasks: forward-references it, OR an ancestor in its Backlog parentTaskId chain satisfies either (LCLI-261). Also corrected an adjacent false claim in the same bullet ('Bulk unlink also keys off the label set' — unlink takes explicit task ids, never queries by label).

AC#3 sweep, corrected characterization: the first pass grepped docs/ for the literal string 'orphan' and checked every hit, finding and fixing two real instances in backlog-cli-contract.md (§1.1 table row + §2.3 bullet). That keyword-grep could not reach prose describing the same lore-queries-backlog behavior without the word 'orphan' — an independent reviewer (request_changes) found exactly that miss in backlog-json-schema.md's §4 'Filtering.' paragraph, which falsely claimed lore passes --label/--status filters to `backlog task list --json`; verified false against orphans.ts:166 (calls listTasks() with zero options — the only production listTasks call in the repo) and tasks.ts's resolveRollup (filters client-side over rows fetched via `task view`, never pushed to `task list`). A fix-pass re-swept the whole docs/ tree by drift CLASS (grepping --label, --labels, "search --json", searchByLabel/searchTasks, "filtered set", status-filter language — not the word "orphan") and found three more real instances, all corrected: the same file's §3 callout (stale --label flag + an imprecise claim that orphans reads task-view's labels[], when it actually reads a different array off the task-list summary); the --label-vs-add-label claim in adr/0002-backlog-integration-json-only.md:159; and a --label/search claim in ADR-0009's own Context section (predates §2, outside the original grep's scope). adr/0011-frontmatter-serialization-stability.md:155 was checked and confirmed NOT the same false claim (it names no specific flag). Full per-file breakdown, including everything the wider sweep confirmed already-accurate, is in Implementation Notes.

Verified (fix-pass round): bun test 2176 pass/0 fail, bun run lore check 40 files/0 errors/0 warnings, bun run lint clean, bun run typecheck clean, git diff --stat dev...feature/LCLI-265 -- src/ empty (AC#4 still holds — doc-only change). No CHANGELOG entry: the fix-pass corrected more doc-accuracy drift but introduced no CLI-surface or behavior change, so the original no-entry reasoning (LCLI-67/LCLI-52 precedent) still applies.
<!-- SECTION:FINAL_SUMMARY:END -->

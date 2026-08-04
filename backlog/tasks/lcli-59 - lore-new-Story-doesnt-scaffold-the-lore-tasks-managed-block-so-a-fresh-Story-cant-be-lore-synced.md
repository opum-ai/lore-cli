---
id: LCLI-59
title: >-
  lore new Story doesn't scaffold the lore:tasks managed block, so a fresh Story
  can't be lore synced
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - bug
  - template
  - managed-block
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies:
  - LCLI-56
references:
  - src/core/template.ts
  - src/core/managed-block.ts
  - docs/runbooks/agent-onboarding.md
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/core/template.ts STORY_TEMPLATE contains no lore:tasks:begin/lore:tasks:end HTML-comment markers (just "# {{title}}" / "## Goal" / "## Acceptance criteria" / "## Notes"). Story is the one type carrying the tasks: coupling (docs/specs/lore-design.md section 6.2 calls the managed block "the sole region lore regenerates inside a Story"), and docs/runbooks/agent-onboarding.md documents the canonical loop as: lore new, then lore link, then lore sync, then lore check, working out of the box on a fresh Story. In reality that loop fails at the sync step on any freshly-created Story:

  lore new Story "Test"; lore link stories/test TASK-1; lore sync
  -> validation error, exit 6: cannot regenerate the lore:tasks block -- the managed
     task region is missing (need one begin-marker and one end-marker at the
     document top level)

Confirmed via a real dry run against a pinned upstream backlog binary (LCLI-56). Neither lore new nor lore link inserts the markers, and lore sync (src/core/managed-block.ts) treats a totally-absent block as a hard validation error rather than something to create on first sync -- so a brand-new Story is not sync-able until a human manually adds the two marker lines by hand, which is nowhere documented as a required manual step; agent-onboarding.md reads as though the block is just always present.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either STORY_TEMPLATE ships the managed-block markers by default, or lore sync creates the block on first sync when totally absent instead of erroring -- pick one and document the choice
- [x] #2 The canonical loop in agent-onboarding.md (new, link, sync, check) succeeds end-to-end on a freshly-created Story with no manual markup step
- [x] #3 A regression test covers a fresh lore new Story followed immediately by lore sync
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Chosen approach: (a) — STORY_TEMPLATE ships the <!-- lore:tasks:begin/end --> markers by default. lore sync/managed-block.ts keep their existing fail-loud (validation, exit 6) behavior for a doc whose block is totally absent.

Rationale: sync.ts's own doc comment and the existing test "lore sync — a concept with tasks: but no managed block / is a fail-loud validation error (exit 6), not a guess" (test/sync.test.ts:248-256) already codify ADR-0008's "sync never guesses or writes a partial block" as a locked contract, exercised against any concept (not just Story) with a tasks: list. Option (b) would have to either weaken that contract or special-case "totally absent" vs "malformed," adding real risk of masking a genuinely corrupted doc (e.g. hand-deleted markers) for marginal benefit, since AC2 only requires a freshly-created Story to work end-to-end. Option (a) fixes that exact case with a one-file, template-only change, needs zero changes to managed-block.ts/sync.ts, leaves the existing validation test and ADR-0008 contract completely untouched, and is trivially reusable by any future template that wants the same scaffold.

1. Code change
   - File: src/core/template.ts, STORY_TEMPLATE (currently lines 354-362).
     Add a "## Tasks" section carrying the empty managed block, between "## Acceptance criteria" and "## Notes":
       const STORY_TEMPLATE = `
       # {{title}}

       ## Goal

       ## Acceptance criteria

       ## Tasks

       <!-- lore:tasks:begin -->
       <!-- lore:tasks:end -->

       ## Notes
       `;
     No other file changes — managed-block.ts's findMarkers/regenerateTaskBlock and sync.ts's call into it are untouched; a Story that still has zero markers (e.g. hand-deleted after creation) keeps failing loud at exit 6 exactly as today.

2. Regression test (AC3)
   - test/sync.test.ts (primary — matches AC3's literal "fresh lore new Story then lore sync"): add a new describe/test immediately after the existing "lore sync — a concept with tasks: but no managed block" block (around line 247-256), as its positive-path sibling:
       import { builtinTemplateFor, renderTemplate } from "../src/core/template";
       ...
       describe("lore sync — a freshly `lore new`-created Story (LCLI-59 regression)", () => {
         test("the built-in Story template already carries the managed block, so first sync succeeds", async () => {
           const body = renderTemplate(builtinTemplateFor("Story"), {
             type: "Story", title: "X", timestamp: TIMESTAMP, summary: "A new story.",
           }).text;
           writeDoc("stories/x.md", `---\ntype: Story\ntitle: X\ntasks:\n  - lore-1\n---\n${body}`);
           const adapter = fakeAdapter([makeTask("LCLI-1")]);

           const { code } = await syncCmd([], adapter);
           expect(code).toBe(EXIT_OK);
           const after = readDoc("stories/x.md");
           expect(after).toContain("<!-- lore:tasks:begin -->");
           expect(after).toContain("Title for LCLI-1"); // the row actually rendered, not just markers present
         });
       });
     This builds the body from the REAL builtinTemplateFor("Story") (not the storyDoc() test helper, which hardcodes markers and would not catch a template regression), then hand-adds tasks: frontmatter the way `lore link` would, and runs the real sync command — so it fails exactly the way LCLI-59 failed if the template markers are ever removed again.
   - test/template.test.ts (secondary, cheap/precise guard — pinpoints template.ts specifically if it regresses): add near the existing Story-related test (~line 127) a direct assertion that builtinTemplateFor("Story") contains both marker sentinels, e.g.:
       test("the Story template ships the lore:tasks managed-block markers (LCLI-59)", () => {
         const body = builtinTemplateFor("Story");
         expect(body).toContain("<!-- lore:tasks:begin -->");
         expect(body).toContain("<!-- lore:tasks:end -->");
       });

3. Doc updates (AC2)
   - docs/runbooks/agent-onboarding.md:
     a. Step 1 canonical-loop section (around line 48-70): after the ASCII diagram, add one sentence clarifying that a brand-new Story slots into the loop too, e.g.: "Starting from scratch instead of an existing Story? `lore new Story \"<title>\"` scaffolds the doc — including an empty `<!-- lore:tasks:begin -->`/`<!-- lore:tasks:end -->` managed block — so it drops straight into step 2 with no hand-authored markup."
     b. Step 5 section (line ~140-146), the sentence "rewrites the `<!-- lore:tasks -->` managed blocks from live Backlog data, and regenerates the index/log." — extend to: "rewrites the `<!-- lore:tasks -->` managed blocks from live Backlog data — including filling in, for the first time, the empty block `lore new Story` scaffolds by default — and regenerates the index/log."
   - docs/specs/lore-design.md:
     a. §3.2 `lore new <type> "<title>"` (around line 202-213): add a line after the "substitute {{placeholders}}" step noting: "The built-in `Story` template also ships an empty `<!-- lore:tasks:begin -->`/`<!-- lore:tasks:end -->` managed block (LCLI-59), so a fresh Story is immediately `lore sync`-able once linked, with no hand-authored markup."
     b. §6.2 (lines 459-464): append a sentence documenting the AC1 choice: "`lore new Story` scaffolds this region empty by default, so the first `lore sync` after linking a task fills it in rather than erroring; a Story that is missing the markers entirely (e.g. hand-deleted after creation) still fails loud at exit 6 (ADR-0008 §2) — lore never guesses where to insert them."

4. docker/e2e/run-e2e.sh and docs/runbooks/docker-e2e-testing-environment.md
   - docker/e2e/run-e2e.sh:
     a. Lines 186-190 (comment above the regression step): reword to describe the now-fixed behavior, e.g. "LCLI-59 (fixed): `lore new Story` now scaffolds the managed block, so `lore sync` renders the Story's linked tasks into it directly."
     b. Line 191-192: flip the expected exit code from 6 to 0 and rename the step, mirroring the LCLI-57 precedent at line 173:
          step_json "lore sync renders the managed block for newly-linked tasks (LCLI-59 fixed)" \
            '.data...' \
            -- lore sync "$STORY_ID" --json
        (or, if sync has no convenient --json predicate already wired here, keep `step` with exit 0 and add a follow-up `check` — see (c) below.)
     c. Delete lines 193-195 entirely (the `printf '\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n' >>"$STORY_PATH"` workaround and its `log` line) — once sync creates content in the block itself, appending markers by hand would duplicate/corrupt it.
     d. Add a `check` assertion (mirroring the grep-based check at lines 176-177) that $STORY_PATH now contains the rendered task content, not just empty markers, e.g.:
          check "lore sync rendered the linked tasks into the managed block" \
            'grep -q "lore:tasks:begin" "$STORY_PATH" && grep -qi "$TASK1" "$STORY_PATH"'
     e. Header comment (lines 12-17): LCLI-59 was the last remaining "deliberately asserts current buggy behavior" step (confirmed by grep — only LCLI-59 and the already-fixed LCLI-57 are referenced this way). Reword to drop the forward-looking "some steps deliberately assert..." framing now that none remain, keeping a short historical note in the same style already used for LCLI-57, e.g.: "Two steps below used to deliberately assert CURRENT (buggy) behavior as a regression baseline before their bugs were fixed (LCLI-57, LCLI-59); both now assert the correct exit code."
   - docs/runbooks/docker-e2e-testing-environment.md (lines 69-79, "Known, already-filed regressions baked into the script"): remove the LCLI-59 bullet (lines 76-78) and its lead sentence "One step in `run-e2e.sh` still deliberately asserts the *current, buggy* exit code..." (lines 69-71), since after this fix zero such steps remain in the script; leave the unrelated LCLI-58/LCLI-60 bullets (lines 80-87) untouched — they are out of scope for LCLI-59.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented option (a) per the recorded plan.

Code: src/core/template.ts — STORY_TEMPLATE now ships a "## Tasks" section carrying the empty <!-- lore:tasks:begin -->/<!-- lore:tasks:end --> managed block between "## Acceptance criteria" and "## Notes". No changes to managed-block.ts or sync.ts; a Story with markers totally absent (e.g. hand-deleted) still fails loud at exit 6 exactly as before.

Tests (AC3):
- test/sync.test.ts — new describe "lore sync — a freshly `lore new`-created Story (LCLI-59 regression)" builds the body from the REAL builtinTemplateFor("Story") (not the storyDoc() helper), hand-adds tasks: frontmatter the way `lore link` would, runs the real sync command, and asserts exit EXIT_OK and that the block contains the rendered row ("Title for LCLI-1"), not just empty markers.
- test/template.test.ts — added a direct assertion that builtinTemplateFor("Story") contains both marker sentinels.

Docs (AC2):
- docs/runbooks/agent-onboarding.md — added a sentence after the Step-1 loop diagram noting `lore new Story "<title>"` scaffolds the empty managed block; extended the Step-5 sentence about `lore sync` rewriting managed blocks to note it also fills in, for the first time, the empty block `lore new Story` scaffolds by default.
- docs/specs/lore-design.md — §3.2 now notes the built-in Story template ships the empty managed block; §6.2 appended a sentence documenting the AC1 choice (scaffolded empty by `lore new`, filled by first `sync`, but a Story missing markers entirely still fails loud at exit 6, ADR-0008 §2).

E2E harness:
- docker/e2e/run-e2e.sh — reworded the file-header comment (now: two steps used to assert buggy behavior as a baseline before their bugs were fixed, LCLI-57/LCLI-59, both now assert the correct exit code); reworded the Phase 4 section header; flipped the LCLI-59 regression step's expected exit from 6 to 0 and renamed it "lore sync renders the managed block for newly-linked tasks (LCLI-59 fixed)"; deleted the manual marker-append workaround; added a `check` assertion that the block now contains the real rendered task table ("| Task | Title | Status |"), not just empty markers.
- docs/runbooks/docker-e2e-testing-environment.md — removed the LCLI-59 bullet and its lead sentence from "Known, already-filed regressions baked into the script" (reworded the intro to "Two findings..." since only LCLI-58/LCLI-60 remain without a dedicated regression step); left the LCLI-58/LCLI-60 bullets and the LCLI-57 (fixed) paragraph untouched.

Verification: bun test — 1500 pass, 0 fail (44 files, 4256 expect() calls). bun run typecheck — clean (tsc --noEmit, no output). bun run lint (biome check .) — exits 0; the only findings are 4 pre-existing "info"-level lint/style/useTemplate suggestions in files this task did not touch (src/core/managed-block.ts, test/managed-block.test.ts, test/supersede.test.ts), unrelated to LCLI-59.

No deviation from the recorded plan.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
STORY_TEMPLATE (src/core/template.ts) now ships the empty <!-- lore:tasks:begin/end --> managed block by default (option (a) from the recorded plan); sync.ts/managed-block.ts are untouched, so a Story with markers totally absent still fails loud at exit 6 per ADR-0008. AC1 (fix + documented choice): code change plus docs/specs/lore-design.md §3.2/§6.2 updates recorded in Implementation Notes. AC2 (canonical loop works end-to-end): verified via the real Docker E2E harness (pinned upstream backlog binary) — full new -> link -> sync -> check loop on a freshly-created Story passed at exit 0, container exit 0, 82 passed/0 failed, with the LCLI-59 step explicitly confirming the managed block is genuinely populated with rendered task content, not just markers. AC3 (regression test): new tests in test/sync.test.ts (builds body from real builtinTemplateFor("Story"), links, syncs, asserts EXIT_OK and rendered row content) and test/template.test.ts (marker-sentinel assertion); full suite bun test 1500 pass / 0 fail (44 files). Also verified bun run typecheck clean and bun run lint (biome) exit 0 (only 4 pre-existing unrelated info-level suggestions). No confirmed review findings.
<!-- SECTION:FINAL_SUMMARY:END -->

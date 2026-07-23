---
id: LORE-199
title: 'Correct check''s cli-surface docs: it does not surface token estimates'
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: docs
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `check` reference documents a `check.report` feature the code does not implement.

**Live context.** `docs/reference/cli-surface.md:171` claims check 'Also surfaces per-doc and bundle **token estimates** (labeled chars/4 heuristic)', and the Output row at `docs/reference/cli-surface.md:177` lists 'token estimates' among `kind: check.report`'s fields. The actual `CheckReport` (`src/core/check.ts:96-130`) carries only `findings`, `errorCount`, `warningCount`, `fileCount`, `complete`, and optional `externalFindings`; `checkBundles` (`src/commands/check.ts:674-690`) computes no token estimate. Token estimates are a `graph.export`/`context.export` concern (`cli-surface.md:320,367`), fitting their agent-budgeting purpose — not the coherence drift gate.

**Resolution scope.** Correct the doc to match `CheckReport`'s real contract. Actually adding token estimates to a drift gate is a separate product decision and is NOT part of this task.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, finding [3]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `check` section of docs/reference/cli-surface.md no longer states that check surfaces per-doc or bundle token estimates.
- [ ] #2 The `check.report` Output row lists only fields CheckReport actually carries (findings, error/warning counts, fileCount, complete, and the optional externalFindings).
- [ ] #3 The docs are updated through the lore CLI (not a hand edit), keeping managed blocks/links coherent.
- [ ] #4 No other command's token-estimate documentation (graph, context) is altered.
<!-- AC:END -->

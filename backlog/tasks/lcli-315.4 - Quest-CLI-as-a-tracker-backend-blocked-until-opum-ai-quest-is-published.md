---
id: LCLI-315.4
title: 'Quest CLI as a tracker backend: blocked until @opum-ai/quest is published'
status: To Do
assignee: []
created_date: '2026-08-04 21:49'
labels: []
dependencies:
  - LCLI-315.1
parent_task_id: LCLI-315
priority: low
type: feature
ordinal: 438000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Records the intent that Quest CLI becomes lore's default tracker backend, and records why nothing toward it can ship yet.

Intent, as stated by the product owner: Quest CLI (`quest-cli`) is the tracker lore should eventually default to, with Backlog.md and JIRA as the alternatives. Quest is still under development.

Hard constraint, from this repo's CLAUDE.md: `@opum-ai/quest` returned a registry 404 on 2026-08-04. Quest must never be presented as published, installable, or available, and the prohibition covers artifacts rather than only wording — no install command, package badge, or version reference; no coming-soon install affordance, disabled or otherwise; and no manifest entry, dependency, lockfile pin, or fixture that would resolve the package. A greyed-out Quest entry in the init wizard's choice list would violate this even though it makes no claim in words.

That is why this task is blocked rather than merely low priority. It is not a matter of effort remaining; the work cannot start without violating a repo rule.

Unblocking condition: `@opum-ai/quest` resolves on the public registry. Verify by reading the registry directly, not by inferring from a repository's existence — a private repo can exist without a published package, and this estate has the reverse case too. Once it resolves, this task becomes an ordinary backend implementation against the LCLI-315.1 seam, plus a separate decision about whether the default tracker changes for new bundles only or for existing ones as well.

Do not begin implementation on the strength of a Quest release announcement, a version number seen elsewhere, or another session's claim. Check the registry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @opum-ai/quest is confirmed published on the public npm registry by direct registry query before any implementation begins
- [ ] #2 A Quest backend implements the tracker adapter interface from LCLI-315.1
- [ ] #3 The default-tracker change is decided explicitly for new bundles and for existing bundles, and is not applied silently to a repo that never opted in
- [ ] #4 Until the registry check passes, no artifact in this repository references, depends on, pins, or offers @opum-ai/quest, including as a disabled wizard choice
<!-- AC:END -->

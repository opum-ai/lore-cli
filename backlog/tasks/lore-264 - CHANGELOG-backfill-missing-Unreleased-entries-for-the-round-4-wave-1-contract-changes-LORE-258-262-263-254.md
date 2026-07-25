---
id: LORE-264
title: >-
  CHANGELOG: backfill missing [Unreleased] entries for the round-4 wave-1
  contract changes (LORE-258/262/263/254)
status: To Do
assignee: []
created_date: '2026-07-25 03:55'
labels:
  - docs
  - release
dependencies: []
priority: low
type: chore
ordinal: 366000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The `[Unreleased]` section of CHANGELOG.md documents the four user-visible changes merged in round-4 wave 1, at the same level of detail the file already applies to comparable contract changes.

## Why it matters
CHANGELOG.md logs user-visible behavior changes in detail (see the LORE-59/LORE-60 entries for the house style: what changed, why, which file/symbol, and how it was verified). Round-4 wave 1 merged four such changes and none of them got an entry — surfaced by the wave-1 integration review's docs sweep, and confirmed by grep. lore has not cut its first release yet, so `[Unreleased]` is what a first release's notes will be generated from: an empty section means the first release under-reports its own behavior changes.

## What is missing (all merged to dev 2026-07-25)
- **LORE-258** — the `no frontmatter mapping` advisory is now suppressed for reserved stems (`index`/`log`) at loadBundle's choke point, so `link`/`unlink`/`sync`/`tasks` stop warning about lore's own generated hubs. Behavior change visible on stderr.
- **LORE-262** — `supersede --rewrite-links` and `rename` now warn on stderr when a retargeted inbound link's display TEXT still names the old id, instead of silently shipping a text/target mismatch. New `RewritePlan.textMismatches`.
- **LORE-263** — `lore scaffold <target>` is idempotent when the on-disk generated config is byte-identical (exit 0 no-op, `files: []`); exit 5 is now reserved for a user-modified config (naming the file, hinting `--force`) or a non-directory entry blocking a planned directory. A **user-visible exit-code contract change**; `docs/reference/cli-surface.md` and `docker/e2e/run-e2e.sh` were updated for it, CHANGELOG.md was not.
- **LORE-254** — new daily upstream-release watch workflow + script; opens a one-time `upstream-watch` issue when MrLesk/Backlog.md tags a release containing commit 22a091b. Repo tooling rather than CLI behavior — include only if the file's existing convention covers tooling.

## Context
CHANGELOG.md `[Unreleased]`; the merged PRs are #243 (LORE-258), #245 (LORE-262), #244 (LORE-263), #246 (LORE-254), and #247 (the cli-surface.md drift fix for LORE-263). Read the existing LORE-59/LORE-60 entries first and match their voice and depth — terse one-liners would not match this file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of LORE-258, LORE-262 and LORE-263 has an [Unreleased] CHANGELOG entry under the correct Keep a Changelog heading (Fixed/Changed/Added), matching the depth and voice of the existing LORE-59/LORE-60 entries.
- [ ] #2 LORE-263's entry explicitly states the exit-code contract change (byte-identical re-run now exits 0 as a no-op; exit 5 reserved for a user-modified config or a directory blocker) — the change most likely to surprise an existing user.
- [ ] #3 LORE-254 is either included or deliberately omitted, with the choice consistent with how CHANGELOG.md already treats repo-tooling-only changes; state which was chosen and why in the task notes.
- [ ] #4 Every factual claim in the new entries is verified against the merged code on dev, not against this task's summary; lore check, the full suite, typecheck and lint stay green.
<!-- AC:END -->

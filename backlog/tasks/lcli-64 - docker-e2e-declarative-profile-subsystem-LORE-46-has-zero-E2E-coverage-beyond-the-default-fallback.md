---
id: LCLI-64
title: >-
  docker/e2e: declarative profile subsystem (LORE-46) has zero E2E coverage
  beyond the default fallback
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - e2e
  - testing
  - profile
dependencies:
  - LCLI-56
  - LCLI-46
references:
  - docker/e2e/run-e2e.sh
  - src/core/profile.ts
priority: high
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found the declarative profile subsystem (LCLI-46) — a whole shipped feature, the ADR-0006-amended type system, and ECK's declared integration seam — is exercised only through its zero-config default fallback. Every populated-profile behavior has zero E2E coverage:

- `lore new <CustomType>` with a custom `.lore/templates/<slug>.md` template (template lookup by slug touches the real filesystem — exactly where E2E adds value over unit tests)
- Profile-declared field kinds/enums/required sections failing validate/check at exit 6 (the generated Zod validators)
- `lore schema export` emitting custom-slug schemas (and dropping built-ins under a replacing profile)
- Case-insensitive type resolution + did-you-mean suggestions
- The no-types fail-loud path (src/core/profile.ts:335-342)
- The `.json` lower-precedence profile form
- A malformed profile turning all loadProfile-bearing commands into validation exit 6

The zero-config fallback IS covered by every invocation after phase 1 — but that is the only profile path that runs.

The audit proposed a dedicated new phase (write a .lore/profile.toml declaring a custom type + template, create/validate/schema-export against it, then a malformed-profile fail-loud case) — re-derive the exact TOML keys from the LCLI-46 profile reference docs at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A populated .lore/profile.toml with a custom type and custom template is exercised E2E: lore new CustomType succeeds and writes from the custom template
- [x] #2 A profile-declared required field, when missing from a doc, fails lore validate at exit 6
- [x] #3 lore schema export emits the custom-slug schema file
- [x] #4 A malformed profile makes loadProfile-bearing commands fail loud at exit 6
- [x] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a new E2E phase (Phase 17b, between Phase 17 schema export and Phase 18
   mkdocs scaffold) to docker/e2e/run-e2e.sh exercising the declarative
   profile subsystem end-to-end. Re-derived the exact grammar from
   src/core/profile.ts, src/core/scaffold.ts's DEFAULT_PROFILE_TOML scaffold
   comment, and test/profile.test.ts directly (not from the filing task's
   description) before writing any fixture.
2. Confirmed via source read: `lore new` can NEVER satisfy a profile-declared
   custom required field (buildNewConcept's frontmatter only ever carries
   type/title/summary/timestamp/tags/resource; --var only fills body
   placeholders). So AC1 (lore new succeeds + custom template) and AC2 (a
   required field fails validate) use ONE reused custom type ("E2E Custom
   Type") whose profile declaration is mutated between steps, mirroring
   Phase 15c/16's established "mutate config, test, restore" pattern:
   - Profile v1 (no owner field) -> `lore new "E2E Custom Type" ...` succeeds;
     assert body came from the custom .lore/templates/e2e-custom-type.md
     (distinctive marker), not the generic fallback.
   - Profile v2 (adds `owner = { required = true }`) -> `lore validate` on the
     existing doc (still missing owner) fails exit 6; sed-add `owner:` then
     `lore validate` passes.
   - Still under v2: `lore schema export --json` emits
     .lore/schemas/e2e-custom-type.schema.json (AC3).
   - Malformed v3 (drop [[types]] entirely, the profile.ts fail-loud case at
     ~line 332-341): `lore new`/`lore validate`/`lore sync "$STORY_ID"` (all
     loadProfile-bearing) fail loud exit 6 error_type=validation; `lore
     check` (confirmed via source: check.ts never imports profile.ts) is
     UNAFFECTED -- assert it still runs clean (AC4 + a genuine, verified
     finding for the campaign conventions).
   - Restore v2 from a backup, confirm `lore schema export --json` succeeds
     again.
3. Critical interaction discovered by re-reading commands/schema.ts: a FULL
   `lore schema export` (no --type) PRUNES every *.schema.json belonging to a
   type the active profile no longer declares. Since a custom profile.toml
   REPLACES the default 6-type vocabulary wholesale (not merges), the two
   custom-profile schema exports above prune the six default schema files
   Phase 17 just wrote. Final cleanup: delete .lore/profile.toml +
   .lore/templates/e2e-custom-type.md (back to zero-config default), then run
   ONE more full `lore schema export --json` to regenerate the six defaults
   AND prune the orphaned custom schema file left behind -- leaving the
   bundle in the exact state Phase 18+ (mkdocs/docusaurus/obsidian/exit-code
   checks) already expect.
4. Iterate against the real docker/e2e harness early and often (`docker
   compose -f docker/e2e/docker-compose.yml up --build`, ~2-3 min/cycle,
   always `down -v` after) rather than writing the whole diff blind -- every
   prior E2E session in this campaign found real bugs this way.
5. Independent adversarial review of the diff before opening the PR.
6. Advance the tracker cursor to LCLI-65 on the branch, append the
   session-log entry, archive the handover, write the next one, push dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added Phase 17b to docker/e2e/run-e2e.sh (between Phase 17 schema export and Phase
18 mkdocs scaffold), exercising the populated-profile path end-to-end via a real
compiled lore binary. Grammar re-derived from src/core/profile.ts +
scaffold.ts's DEFAULT_PROFILE_TOML scaffold comment + test/profile.test.ts's
working fixture, not from this task's own description.

Confirmed via source read (commands/new.ts, core/template.ts): `lore new` can
NEVER populate a profile-declared custom frontmatter field (only
type/title/summary/timestamp/tags(+resource) are ever stamped; --var only
fills body placeholders). So AC1 (lore new + custom template succeed) and AC2
(a required field fails validate) reuse ONE custom type across a MUTATED
profile file (Phase 15c/16's established "mutate config, test, restore"
pattern): profile v1 (no required field) for AC1, profile v2 (adds
`owner = { required = true }`) for AC2/AC3, malformed v3 (zero [[types]], the
exact fail-loud case documented in profile.ts) for AC4, then v2 restored.

Real docker run surfaced a genuine finding: `lore schema export` (full, no
--type) PRUNES any *.schema.json a profile no longer declares -- since a
custom profile REPLACES the six built-in types wholesale, both custom-profile
schema exports in the new phase pruned Phase 17's six default schemas. Fixed
by deleting the custom profile/template at the end and running one more full
export, which regenerates the six defaults and prunes the orphaned custom
one -- verified all six schema files exist again before Phase 18.

A first run also surfaced a REAL, pre-existing, unrelated bug: at this point
in the script, `lore check` already reports 2 broken-link findings in
stories/e2e-renamed-story-f1.md (backlog/tasks/ dash-vs-space filename
mismatch), left over from the Phase 15b rename/F1 sequence and never
re-checked by any later phase -- NOT caused by this task's changes (confirmed:
nothing in the new phase touches that Story or TASK1/TASK2). Filed separately
as LCLI-68 (out of this task's scope; kept unqueued per user confirmation).
Rewrote AC4's "lore check is unaffected" assertion to compare `lore check
--json` output byte-for-byte before vs. after the malformed profile is
introduced (rather than assuming a clean baseline), which robustly proves
check.ts's profile-invariance regardless of the bundle's own state.

Independent adversarial review (separate subagent) of the full diff found no
genuine defects -- confirmed $STORY_ID's validity at the AC4 sync call by
tracing every reassignment through the script, confirmed check.ts's
profile-blindness against source, confirmed AC3's "required" JSON Schema
assertion empirically (compiled a real profile with a required field and
inspected the emitted schema), confirmed full state restoration before Phase
18, and confirmed LCLI-68 is neither masked nor worsened. Found one trivial
dead-variable assignment (CUSTOM_ID, captured but never read); removed.

Verification (final, after the cleanup): two full
`docker compose -f docker/e2e/docker-compose.yml up --build` runs, both
148 passed / 0 failed, exit 0, `down -v` clean both times; `bun test`
1500/1500 (no src/ changes this task).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Phase 17b to docker/e2e/run-e2e.sh exercising the declarative profile
subsystem's populated-profile path end-to-end: a custom type + custom
.lore/templates/ file (AC1), a profile-declared required field failing then
passing lore validate (AC2), lore schema export emitting the custom-slug
schema with the field in its required list (AC3), and a malformed profile
(zero [[types]]) making every loadProfile-bearing command fail loud at exit 6
while lore check stays provably unaffected (AC4). Verified with two full real
docker/e2e harness runs (148/0 failed, exit 0 both times) plus bun test
(1500/1500); independent adversarial review found no defects beyond one
harmless dead-variable assignment, since fixed. Filed LCLI-68 separately for
a genuine, pre-existing, unrelated broken-link bug the real harness run
surfaced (kept unqueued per user confirmation, out of this task's scope).
<!-- SECTION:FINAL_SUMMARY:END -->

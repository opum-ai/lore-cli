---
id: LCLI-89
title: >-
  lore check's own concept scan never forwards a project's custom
  .lore/profile.toml
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:24'
labels:
  - backlog-campaign-followup
  - correctness
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: medium
type: bug
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/check.ts discovers and parses concepts through its own `walkFiles` + `parseConcept` path (`tryConceptsForBundle`, check.ts:264-281), entirely separate from `core/bundle.ts`'s `loadBundle` (which LCLI-84 fixed to thread a project's `.lore/profile.toml` through). check.ts imports nothing from `core/profile.ts` — no `loadProfile`, no `Profile` type anywhere in the file — and its one `parseConcept(file.path, file.raw)` call at check.ts:273 passes no `options.profile`, so `core/concept.ts`'s `options.profile ?? defaultProfile()` fallback (concept.ts:357) always resolves to the built-in default profile, never the project's own.

This parse is not incidental: it is the only frontmatter validation `lore check` performs, and it runs for every `tasks:`-linked concept (the ones `tryConceptsForBundle` fully parses, to build `Concept`s for status/managed-block reconciliation, ADR-0007/LCLI-27). Reproduced live: a scratch bundle with `.lore/profile.toml` redefining the built-in `Story` type to require an additional `owner` field, and a `tasks:`-linked doc declaring `type: Story` that satisfies the *default* Story schema but omits the custom-required `owner`. `lore check` reports "0 errors, 0 warnings" for that file — the concept parses and is accepted with no frontmatter finding — while `lore query` (loadBundle, profile-aware since LCLI-84) and `lore validate` (calls `loadProfile` directly) both correctly reject the identical file with "invalid Story frontmatter... owner: Invalid input: expected string, received undefined" (exit 6).

This three-way disagreement matters because ADR-0007 documents `lore check` as the trustworthy, authoritative CI gate, specifically so `validate`/`check` never silently diverge. A project that defines custom required fields via `.lore/profile.toml` can merge a `tasks:`-linked doc that violates its own schema, because `check`'s reconciliation-eligibility parse silently falls back to the wrong (default) schema — the CI gate goes green on exactly the class of drift it exists to catch. LCLI-84's own adversarial reviewer independently surfaced this exact gap during that task's review and explicitly deferred it as a pre-existing, architecturally distinct gap worth its own follow-up, corroborating this is not something LCLI-84 already covers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore check` against a bundle with a project-defined `.lore/profile.toml` validates every concept it parses (via check.ts's own tryConceptsForBundle scan, not only via loadBundle) against that profile, not the built-in default.
- [x] #2 A `tasks:`-linked concept that violates a custom-profile-required field, while still satisfying the built-in default schema for the same type name, causes `lore check` to report a frontmatter/validation finding and fail the gate (exit 6) — matching what `lore query`, `lore validate`, and `lore sync` already report for the identical file.
- [x] #3 A `tasks:`-linked concept that satisfies the project's custom profile continues to pass `lore check` cleanly, with no regression to bundles that declare no custom profile.
- [x] #4 A test exercises `lore check`'s own command-layer scan (not core/bundle.ts's loadBundle in isolation) with a custom profile that redefines a built-in type name, proving the previously-silent false negative is now caught and that `check` and `validate`/`query` agree on the same file.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing (line numbers matched the
filing task's own citations exactly): src/commands/check.ts's tryConceptsForBundle (check.ts:264-281)
parses tasks:-linked concepts via its own parseConcept(file.path, file.raw) call with NO
options.profile, entirely separate from core/bundle.ts's loadBundle (which LCLI-84 fixed to thread
a project's .lore/profile.toml through). check.ts imported nothing from core/profile.ts at all.
Confirmed Bundle (check.ts's own interface, line 579) has no independent root -- collectBundles
(root, paths, warnings) takes a SINGLE repo root with possibly several bundle DIRECTORIES within it
(--external/multi-path), never several separate repos -- so a single loadProfile({root:
options.root}) call in runCheck, mirroring context.ts's/graph.ts's own LCLI-84 precedent, is
correct and sufficient for every root check.ts can scan. This resolved the one open design
question the prior session's handover flagged.

Fix: import loadProfile/Profile from core/profile; runCheck loads the profile once up front
(before collectBundles, so a malformed profile fails loud before any other work, matching
context.ts's own ordering); tryConceptsForBundle now takes profile as a parameter and forwards it
to parseConcept(file.path, file.raw, { profile }). The existing per-file/per-root error isolation
(LCLI-27 rounds 9/10) is untouched.

AC#1/AC#2/AC#3: two new tests in test/check.test.ts's "runCheck -- status + managed-block drift
(LCLI-27)" describe block -- a tasks:-linked Story missing a custom-profile-required "owner" field
now throws a validation LoreError naming "owner"; the same profile with owner: alice present
passes cleanly (EXIT_OK).

AC#4: the new tests exercise runCheck (check.ts's own command-layer scan), not core/bundle.ts's
loadBundle in isolation, reusing the same custom-Story-redefinition shape LCLI-84's own
bundle.test.ts test uses.

Live-CLI verification: .repro-scratch/lore89-scan-verify.ts drives the real runCheck with a
fakeAdapter (the same legitimate Backlog-IO test seam this test suite already uses) against a real
scratch bundle + real .lore/profile.toml on disk. git stash comparison on check.ts: PRE-FIX, the
identical fixture resolved with exit 6 but ONLY a managed-block-drift finding -- the missing
"owner" field was completely undetected. POST-FIX, the same script throws BEFORE reconciliation
even runs, naming "owner" explicitly. Also confirmed via a separate real-CLI run that `lore
validate` already correctly rejects the identical file with the same message.

Independent review (general-purpose subagent, run after committing the fix+tests): first response
was an incomplete status update ("launched a background wait for a Codex review") rather than
findings -- re-prompted via SendMessage to demand a complete, direct answer in the same turn. Final
response: no blocking findings. Independently verified the Bundle-has-no-independent-root design
claim by reading collectBundles/Bundle directly; confirmed the loadProfile-before-collectBundles
reordering introduces no regression (grepped every other command, confirmed check.ts was the sole
loadProfile holdout, so this brings it in line with the rest of the codebase); empirically reverted
the {profile} argument and reran the new tests to confirm the "violates owner" test genuinely fails
without the fix (not vacuous) then restored and confirmed a clean diff; confirmed the "no
regression" test reaches EXIT_OK via the real reconciliation path, not a short-circuit. Also ran an
independent Codex (gpt-5.6-sol, xhigh) pass with its own live CLI repro, corroborating no issues.
One non-blocking note (untested multi-bundle-root + custom-profile combination) judged low-value
given the implementation trivially guarantees uniform behavior there (one profile value forwarded
to every tryConceptsForBundle call regardless of root count) -- not worth a dedicated test.

Verified: bun test -> 1682 pass/0 fail (up from 1680); bun run typecheck clean; bun run lint clean
on all changed files -- 4 pre-existing infos remain in unrelated files, untouched.
<!-- SECTION:NOTES:END -->

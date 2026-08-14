---
id: LCLI-309
title: >-
  Correct the stale herdr delivery derivation and the fact-shaped instructions
  it exposed
status: Done
assignee:
  - '@claude'
created_date: '2026-08-04 14:39'
updated_date: '2026-08-14 11:00'
labels:
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
documentation:
  - docs/stories/maintain-lore-cli-documentation-authority.md
ordinal: 422000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fleet routing notice this repository derived its CLAUDE.md peer-reachability text from was incomplete, and the owner has since corrected it. Our derived text tells a session to reach a same-host sibling with 'herdr agent prompt' and stops there, so a reader who follows it literally gets a success envelope, never confirms the message was submitted rather than left buffered at the target's prompt, and reports a delivery that did not happen. The same text ignores that one repository can host several panes of different agent kinds, which this worktree demonstrates. Sweeping for that defect surfaced a second, broader class the owner named: sentences that are fact-shaped but function as instructions, which a reader can satisfy literally while still violating the rule the sentence came from. Correct the derivation, fix the instances of the broader class, and record the root cause so derived procedure does not silently go stale again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CLAUDE.md peer-reachability text tells a session that herdr agent prompt pastes but does not always submit, and gives the confirmation step: read the pane, send enter if the message is still buffered, and treat a flip to working as acceptance rather than trusting the success response
- [x] #2 The CLAUDE.md peer-reachability text states both pane rules: address one pane per repository so concurrent agents do not edit the same files, and select the pane by its agent kind because a codex pane will not act on a Claude-shaped notice
- [x] #3 No repository record states the Quest or repository-visibility rules in a form a reader can satisfy literally while still violating them; each carries the imperative that the underlying rule actually requires
- [x] #4 Every user-facing citation of the GitHub repository marks it private, so no record presents a URL that returns 404 to an anonymous visitor as a reachable destination
- [x] #5 CLAUDE.md records the root cause as a durable rule: derived procedure from an owner record goes stale silently, so prefer linking to the owner over restating it, and test a written rule by asking whether a reader can satisfy the sentence literally and still violate it
- [x] #6 lore validate --strict, lore check, and the repository-location test pass
- [x] #7 Every rule this repository states about verifying repository ownership names a redirect-proof query that reads the owner back, because a bare existence call against the former org returns 200 and lets a reader satisfy a verify instruction while remaining wrong
- [x] #8 Estate facts that can change without notice — org membership and live pane composition — are written as dated then-current observations that name the owner record authoritative, not as present-tense current truth
- [x] #9 The stale-owner gate scans every documentation file rather than a hand-maintained list, so adding a new document that names a former-org route fails the gate instead of passing it unexamined
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the CLAUDE.md same-host reachability sentence with the corrected procedure from the owner record: list, prompt, then confirm with read and send-keys enter, treating a flip to working as the only proof of acceptance.
2. Add both pane rules — one pane per repository, and select by agent kind — since this worktree hosts a codex pane alongside the claude session and is the case that produced the correction.
3. Apply the owner's sharper test to every rule this repository states, and fix the two that fail it: the Quest bullet forbids only the word published while permitting an install affordance, and the public-package bullet states an implication without forbidding the citation of a private repository URL as a reachable destination.
4. Mark docs/index.md's bare GitHub link private, so no user-facing record hands an anonymous visitor a URL that 404s.
5. Record the root cause in CLAUDE.md as a durable rule: prefer linking to an owner record over restating its procedure, date any derivation that cannot be avoided, and test a rule by asking whether a reader can satisfy it literally and still violate it.
6. Verify with lore validate --strict, lore check, and the repository-location test, then reply to the opum-doc owner because a stale derivation was in fact found.

7. Widen the sweep past text derived from the notice's wording to everything authored because of it, including the guard test and this repository's own rules, and apply the literal-satisfaction test to each.
8. Name a redirect-proof ownership query wherever a verify instruction appears, since gh api against the former org returns 200 through the redirect.
9. Date-stamp volatile estate facts as then-current observations and defer to the owner record on disagreement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Widened sweep result, reported because the owner asked to be told: the notice's wording caused defects here, and a verbatim grep would not have found the worst of them.

The one true stale derivation was the CLAUDE.md same-host reachability sentence, which named herdr agent list and herdr agent prompt and stopped. A reader following it literally gets a success envelope and reports a delivery that may still be sitting buffered at the target's prompt.

Three more defects were authored because of the notice without copying its wording, which is the class the scope correction named:

1. 'Verify the owner, not the link' named no query. The obvious way to satisfy it is a bare existence call, and gh api repos/salient-data/lore-cli --silent was confirmed here to return success through the redirect. A reader satisfies the instruction and stays wrong. Now names gh api repos/<owner>/<repo> --jq .full_name. The original LCLI-308 verification happened to use that read-back form already, so its conclusions stand; the written rule was the defect, not the check.
2. The Quest rule forbade presenting the package as published. Satisfiable literally while adding a manifest entry, dependency, lockfile pin, or fixture that resolves it — describe nothing, ship the scaffolding. Now prohibits creating the artifact, not just the claim.
3. The repository-visibility rule stated 'a public package does not imply a public repository' as a fact. Satisfiable by never claiming the repository is public while still handing a reader a URL that 404s anonymously. Now forbids the citation and requires the private marker; docs/index.md carried exactly that bare link and was fixed.

The gate itself failed the same test. STALE_OPERATIONAL_SLUGS was checked against a hand-maintained list of nine documents, so a new document naming a former-org route would pass unexamined. Replaced with a scan of every markdown file under docs/ plus root-level markdown for the two org-move slugs, kept separate from jeremy-newhouse/lore because ADR-0001 legitimately records that as decision-time provenance. The scan asserts it read more than twenty files so it cannot pass vacuously, and was validated against a negative control: a temporary document citing salient-data/quest-cli failed the gate and named the offending path, and the file was removed.

Two volatile facts were rewritten as dated then-current observations after the owner's warning that its dev head moved four times in one session: the per-repository org list, and the claim that this worktree hosts a codex pane. The latter was present-tense about something that changes hourly; it now points the reader at herdr agent list.

Verification: repository-location test 7/7 with 101 assertions plus the negative control; lore validate --strict 64 files 0 errors 0 warnings; lore check exit 0; biome clean on the changed test; tsc reports no error in any file changed here. Commit ca4221d on dev, not pushed. The Codex agent's concurrent LCLI-302 edits had cleared from the worktree by commit time, so this commit was path-scoped but no longer contended.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the stale herdr derivation and the broader class of fact-shaped rules it exposed.

CLAUDE.md now warns that herdr agent prompt pastes but does not always submit and returns success either way, gives the confirmation step (read the pane, send-keys enter, and treat only a flip to working as acceptance), and states both pane rules: one pane per repository, selected by agent kind, since a codex pane will not act on a Claude-shaped notice.

Applying the literal-satisfaction test to everything written because of the fleet notice — not merely what copied its wording — found three further defects. The ownership rule named no query, and a bare existence call was confirmed here to return 200 through the former-org redirect, so it now names the read-back form. The Quest rule forbade describing the package while permitting a manifest entry that resolves it, and now prohibits the artifact. The visibility rule stated an implication without forbidding the citation of a URL that 404s anonymously; docs/index.md carried that bare link and now marks the repository private.

The gate had the same defect: a hand-maintained list of nine documents, so a new document naming a former-org route passed unexamined. It now scans every markdown file under docs/ and the repository root, kept distinct from the jeremy-newhouse/lore provenance ADR-0001 legitimately records.

Volatile estate facts are now dated then-current observations deferring to the owner record, and CLAUDE.md carries both root-cause rules: write pointers rather than transcriptions, and never phrase a rule around a current head.

Verified by the repository-location test at 7/7 and 101 assertions, a negative control proving the new scan fails on an introduced violation and names the offending path, lore validate --strict at 64 files with 0 errors, lore check at exit 0, clean biome on the changed test, and no tsc error in any file changed here.
<!-- SECTION:FINAL_SUMMARY:END -->

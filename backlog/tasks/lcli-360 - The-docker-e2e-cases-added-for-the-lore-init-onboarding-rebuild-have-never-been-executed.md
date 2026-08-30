---
id: LCLI-360
title: >-
  The docker e2e cases added for the lore init onboarding rebuild have never
  been executed
status: In Progress
assignee: []
created_date: '2026-08-28 23:59'
updated_date: '2026-08-30 02:36'
labels:
  - e2e
  - init
  - tracker
  - verification
dependencies: []
ordinal: 487000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LCLI-358.1, LCLI-358.2, LCLI-358.3, and LCLI-356 each added assertions to docker/e2e/run-e2e.sh — seven cases in total covering the git preflight refusal and its wrote-nothing guarantee, --allow-no-git, the tracker-aware probe, --tracker none, selection-time verification, the detection shape, and the no-install invariant.

None of them has run in the container. `docker info` exits 1 on the authoring host, so each case was verified only by (a) `bash -n` on the script and (b) running its exact jq filter against the real CLI in a temp directory. That is evidence the assertions are well-formed and true locally; it is not evidence the harness executes them.

This matters more than usual because CLAUDE.md's own gate rules say a gate never observed failing is not known to work. These cases have never been observed either passing or failing inside the harness they were written for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docker/e2e/run-e2e.sh runs to completion in the container with every case added by LCLI-358.1/.2/.3 and LCLI-356 reported in results/report.jsonl
- [ ] #2 Each of those cases is proven by a negative control: a deliberate violation makes it fail and names the offending condition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-29: the premise 'never executed' is now too strong. The docker e2e harness job passed on PRs #445, #446, #447, and #449 — CI runs these cases on every PR. What remains true is that they have never run on this development host (`docker info` exits 1 here), so a local pre-push run cannot exercise them and a failure is only discovered in CI. Scope this task to that gap.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 00:10
---
Approach proposal, 2026-08-29, written after reading docker/e2e/run-e2e.sh rather than from the task text. Not started -- recording it so whoever picks this up does not re-derive it, and so the scope decision is made deliberately.

AC#1 IS ALREADY SATISFIED and the 2026-08-29 note above says so: the docker e2e harness job runs these cases on every PR and passed again today on #453, #454, #455 and the #457 promotion. What is left is AC#2 alone: each case proven by a negative control.

THE HONEST DIFFICULTY. A case here is three things -- a helper (step / step_json / step_fail), an expected value, and a command. A 'negative control per case' read literally means 30-odd deliberately-violated variants, which is a large amount of throwaway assertion code that then has to be maintained. Read too loosely, it becomes 'we eyeballed it', which is the false-clear this task exists to prevent.

PROPOSED SPLIT, strongest-value-first:

1. HELPER DISCRIMINATION (cheap, high value, do this first). Add a self-test mode -- RUN_SELFTEST=1 or a --selftest flag -- that exercises each helper against a deliberately wrong expectation and asserts it reports FAIL, not PASS. Specifically: step with a command whose real exit differs from expected; step_json with a filter that is false against real output AND with a command that exits non-zero while the filter would match; step_fail with each of its three conjuncts violated INDEPENDENTLY -- wrong exit code, non-empty stdout, and a filter that does not match the envelope. That third one matters most: step_fail asserts a conjunction, so a helper bug that silently drops one conjunct would let a whole class of cases pass vacuously, and nothing in the current suite would notice. opum-cli-e2e did exactly this shape for its own harness today (their selftest went 344 -> 357 assertions with a negative control that names both digests) -- copy the pattern, not the code.

2. NON-VACUITY. Assert the run executed the expected number of cases and that results/report.jsonl is non-empty with no case name appearing zero times. A mis-globbed or early-exiting run must FAIL rather than report a clean sheet. CLAUDE.md's gate rules call this out specifically and the harness does not currently do it.

3. PER-CASE CONTROLS for the seven LCLI-358.1/.2/.3 and LCLI-356 cases only -- the ones this task was actually opened about -- rather than all thirty. Each gets one deliberate violation proving the case fails AND that the failure names the offending condition.

WHY 1 AND 2 BEFORE 3: a discriminating helper plus a non-vacuity assertion protects every case in the file, including ones added later by someone who never reads this task. Per-case controls protect exactly the cases they cover and rot as cases change. Do the general guarantee first; then the seven.

HOST CONSTRAINT, unchanged: 'docker info' exits 1 on this development host, so all of this is authored blind and first observed in CI. That is precisely the argument for the selftest mode -- it turns 'I could not run it' into 'CI proves the harness can fail', which is the guarantee that was missing.
---

author: @claude
created: 2026-08-30 00:38
---
PROGRESS 2026-08-29: steps 1 and 2 of the proposed approach are DONE and merged-pending; step 3 is NOT. AC#2 stays OPEN deliberately — read this before checking it.

AC#1 CHECKED. Already true and recorded in the 2026-08-29 note: the docker e2e job runs these cases on every PR. Confirmed again today across #453, #455, #456, #457, #459 and #460.

STEP 1 DONE — the helpers are now PROVEN to discriminate.
Extracted log/record/step/step_json/step_fail/check/tally/critical from run-e2e.sh into docker/e2e/lib/steps.sh (one definition, two consumers — a second copy would be a fork that rots), and added docker/e2e/selftest.sh. It drives each helper with true/false/printf instead of lore and asserts the helper's OWN verdict in BOTH directions. 16 assertions.

The point of the extraction is that the selftest needs NO container, NO lore binary and NO mutating work, so it runs on this development host — the one where 'docker info' exits 1. That converts this task's core complaint, 'authored blind and first observed in CI', into 'proven locally before it is pushed'. The cases still need the container; their helpers no longer do.

step_fail got the most attention because it asserts a CONJUNCTION — expected exit code AND empty stdout AND a jq filter over the stderr envelope. Drop any single conjunct and a whole class of cases passes vacuously while the suite stays green. Each conjunct is violated INDEPENDENTLY, and the documented tolerance (advisory warning lines ahead of the envelope, since only the last stderr line is parsed) is separately pinned so a future 'tightening' cannot silently remove it.

NEGATIVE CONTROLS RUN, because a gate never observed failing is not known to work:
  baseline                                          selftest exit 0
  drop step_fail's empty-stdout conjunct            exit 1, naming 'step_fail REJECTS non-empty stdout (conjunct 2)'
  make step_json ignore its filter                  exit 1, naming TWO assertions
  restored                                          exit 0
Exit codes taken without a pipe.

STEP 2 DONE (partially): the selftest asserts report.jsonl is non-empty and recorded a row per probe, so a run whose helpers execute without recording fails rather than reporting a clean sheet. The equivalent assertion for run-e2e.sh's own full run — an expected case COUNT — is NOT added yet and belongs with step 3.

WIRED INTO CI ahead of the container build, deliberately: seconds rather than minutes, no Docker needed, and a broken assertion helper invalidates every case below it, so it should fail first and fast.

WHAT REMAINS FOR AC#2 — step 3: per-case negative controls for the seven cases LCLI-358.1/.2/.3 and LCLI-356 added, plus the expected-case-count non-vacuity assertion for the full run. Steps 1 and 2 give a general guarantee that protects every case in the file including ones added later; step 3 gives per-case proof for the seven this task was opened about. Do not check AC#2 until step 3 lands — the general guarantee is not the same claim.

Unrelated but found by this same harness today, and worth noting as evidence it earns its keep: it caught a real scoping defect in LCLI-364 that no unit test caught — 'lore init --claude' had begun reporting codex bridge files it was never asked about (case LCLI-298 AC3). Fixed, with a unit test added so the E2E is not the only thing holding it.
---

author: @claude
created: 2026-08-30 00:50
---
VACUITY AUDIT of the seven cases' assertions, 2026-08-29 — a partial step toward AC#2, recorded because a negative finding is still a finding and nobody should redo it.

The specific risk audited: a jq filter that MATCHES ANYTHING makes its case a vacuous pass while looking like a real assertion, and the harness selftest (step 1) cannot catch that — it proves the HELPERS discriminate, not that each case's expectation is specific. This is the per-case risk step 3 exists to cover, and it is cheap to check by reading.

RESULT: none of the seven is vacuous. Each expectation constrains something a wrong implementation could violate:
  LCLI-358.1 refusal      .error_type == "validation" and (.message | test("not a git worktree"))
                          — pins the classification AND the message, so a differently-caused
                            validation error would not satisfy it.
  LCLI-358.1 --allow-no-git  .data.created | index("docs/index.md") != null
                          — asserts a specific path was created, not merely that a list exists.
  LCLI-358.2 --tracker none  .data.trackerCheck == null and .data.backlog == null
                          — a negative assertion, and correctly tolerant of absent-vs-null since
                            jq treats a missing field as null. Note it will still hold after
                            LCLI-359 removes .data.backlog, which is fine for this case's intent.
  LCLI-356 selection-time  .data.trackerCheck.backend == "backlog" and .data.trackerCheck.capable == true
                          — and if trackerCheck were null, jq yields null.backend == "backlog" ->
                            false, so a missing probe fails rather than silently passing.

WHAT THIS DOES AND DOES NOT ESTABLISH. It establishes that no case is vacuous BY CONSTRUCTION of its filter. It does NOT establish AC#2's claim, which is that a deliberate violation makes each case fail and names the offending condition — that still requires running each case's variant in the container. AC#2 stays open.

Remaining for step 3: per-case negative controls for these seven, plus the expected-case-COUNT non-vacuity assertion for run-e2e.sh's own full run (the selftest asserts non-vacuity only for its own probes). The count assertion is the cheaper half and protects every case, so do it first.
---

author: @claude
created: 2026-08-30 01:08
---
STEP 2 COMPLETED 2026-08-29: the non-vacuity floor for the full run now exists and is PROVEN to discriminate. AC#2 still stays open — see the end.

WHAT WAS MISSING. Phase 25 gated on '$FAIL -gt 0 || $REPORT_WRITE_FAILURES -gt 0'. Both are FALSE when nothing ran, so a suite that died early, skipped a phase, or lost its assertions would exit 0 and read as a clean sheet. That is the most dangerous failure this harness has, because it fails GREEN — and it is not hypothetical: when lib/steps.sh was missing from the image, every helper became 'command not found' and nothing was recorded.

WHAT WAS ADDED. assert_non_vacuous <min> in docker/e2e/lib/steps.sh, called from Phase 25 with MIN_EXPECTED_CASES (330, against a current total of 353 — set BELOW the total with headroom so removing one obsolete case does not fail the build, while losing a whole phase still does).

It lives in the LIBRARY, not inline in run-e2e.sh, and that placement is the point: selftest.sh can then drive it with no container. A guard nobody can exercise is a guard nobody has seen work, which is this task's entire complaint.

The constant is documented as RATCHETING: raise it when cases are added; never lower it to make a red run green. A drop in case count is either a deletion someone should justify in review or a truncated run, and both deserve a failure rather than an accommodation.

SIX NEW SELFTEST PROBES, both directions: accepts above the floor, accepts exactly at it, counts FAILures toward the total (a red suite still RAN), rejects one below, rejects a truncated run, and rejects the zero-cases green-failure case specifically. Selftest is now 22 ok / 0 bad.

NEGATIVE CONTROL, exit codes taken without a pipe: replacing the floor's condition with 'if false' makes the selftest exit 1 and name all three rejection probes; restored, exit 0.

A SELF-CORRECTION WORTH RECORDING. Adding these probes broke the selftest's own report-row assertion — it compared rows against total probes, but assert_non_vacuous inspects counters and writes no row, so the premise was wrong. Fixed by ORDERING the report assertion before the floor probes rather than by loosening it. Weakening an assertion to accommodate a new test is how a suite quietly stops asserting; the assertion was right and the arithmetic behind it was wrong.

Also pinned statically in test/docker-e2e-guard.test.ts: the floor is called from Phase 25, defined in the library, and referenced by the selftest — so a future refactor that inlines it (making it untestable again) fails a unit test.

AC#2 REMAINS OPEN. Steps 1 and 2 give a GENERAL guarantee covering every case in the file, including ones added later. Step 3 — per-case negative controls for the seven LCLI-358.1/.2/.3 and LCLI-356 cases — is a different and narrower claim, and AC#2 asks for that one. Do not check it on the strength of this.
---

author: @claude
created: 2026-08-30 01:13
---
CI CONFIRMATION 2026-08-29: the non-vacuity floor is live and ran on the real harness. Merged as dev d91ac8e (PR #463, all 8 checks green).

  harness selftest: 22 ok, 0 bad          <- includes the six new assert_non_vacuous probes
  E2E summary: 353 passed, 0 failed       <- 353 against a floor of 330, so the floor is armed
                                             with 23 cases of headroom and did not fire spuriously

Both halves of the guard are now observed working in the environment they protect, not just on a developer host: the selftest proves the floor DISCRIMINATES (it rejects 329, a truncated run, and zero cases), and the real run proves it does not fire on a healthy suite. A guard that only ever passes is indistinguishable from one that cannot fail; these two observations together rule that out.

Steps 1 and 2 are complete. AC#2 remains open for step 3 — per-case negative controls for the seven LCLI-358.1/.2/.3 and LCLI-356 cases. That is a narrower claim than the general guarantee steps 1-2 provide, and it is the one AC#2 actually asks for.
---

author: @claude
created: 2026-08-30 01:43
---
FALSE-COVERAGE COMMENT FOUND AND CORRECTED, 2026-08-29. This is worth more than the negative controls I went looking for, because it is the failure those controls exist to prevent, already present in the file.

WHAT IT SAID. The LCLI-356 block in docker/e2e/run-e2e.sh claimed: 'a tracker version below the adapter's floor is refused at SELECTION time ... LORE_BACKLOG_BIN points the adapter at a stub that reports an ancient version, and the assertion is that the selection was NOT written.'

WHAT IT DOES. Runs a REAL 'backlog init', asserts trackerCheck.capable == true, and its companion check asserts the selection WAS written to config. The acceptance path, not the refusal — the exact opposite of the comment.

THE MACHINERY DOES NOT EXIST. LORE_BACKLOG_BIN is set nowhere in this repository and read nowhere. src/adapters/backlog.ts hardcodes BACKLOG_BINARY = 'backlog' with no env override, so there is no way to point the adapter at a stub even if a case wanted to.

WHY IT MATTERS MORE THAN A MISSING CONTROL. A missing negative control leaves a gap. A comment describing a control that does not exist CLAIMS the gap is filled. Anyone auditing this harness for LCLI-356 AC#2 coverage would have read that paragraph and concluded the refusal path was exercised. It is not. False coverage reads as proof and is the most confident possible wrong answer — the same shape as everything else found today, one level up: the comment is a claim about the case, and nobody had checked the claim against the case.

WHAT IS ACTUALLY UNCOVERED. The refusal half of LCLI-356 AC#2 — that a below-the-floor backend is rejected at selection time and the selection is NOT persisted — has no e2e coverage. It IS covered by unit tests, so the behaviour is not unverified; the harness simply does not exercise it. Adding a case that does needs an adapter-level way to point at a stub binary, which lore does not offer. That is a real prerequisite, not a small omission, and it should be sized before AC#2 is planned around it.

The comment now says what the cases do, names the missing coverage, and warns against restoring the old text without building what it describes.

BEARING ON AC#2. This changes what 'each of those cases is proven by a negative control' costs. One of the seven cannot get a meaningful control until lore gains a binary override. Whoever picks up step 3 should decide explicitly whether to build that override, scope AC#2 to the six that can, or split it.
---

author: @claude
created: 2026-08-30 02:36
---
TWO CORRECTIONS TO MY OWN ANALYSIS, 2026-08-29, the second of which is a false alarm I stopped before reporting.

CORRECTION 1 — I OVERSTATED A PREREQUISITE. I wrote that an e2e case for the below-the-floor REFUSAL 'needs an adapter-level way to point at a stub binary, which lore does not offer'. Wrong. src/adapters/backlog.ts spawns the binary BY NAME, so ordinary PATH shadowing substitutes it with no lore change. Verified with a stub reporting 0.0.1. And such an override should NOT be added: an env var that changes which binary gets executed is an injection surface on a tool this repository spent LCLI-69..81 hardening.

CORRECTION 2 — A DEFECT I ALMOST REPORTED AND DID NOT, BECAUSE THE REPRO WAS INVALID. With a stub quest reporting 0.1.0 (below the 0.2.7 floor), 'lore init --yes --tracker quest' exited 0 and wrote backend = quest — which LCLI-356 AC#2 forbids, and would have meant the just-tagged 0.3.5 failed its own criterion.

It does not. The repro never reached the version check. The init result shows quest {installed: true, INITIALIZED: FALSE} and NO trackerCheck field at all: the probe never ran, because the workspace is not initialized — a condition LORE-319 deliberately made advisory. My stub answers '--version' and exits 1 for everything else, so it can never present an initialized workspace. The gate was not bypassed; it was not reached. Real coverage is test/init.test.ts:1923, which injects a probe failing with QUEST_VERSION_FLOOR_CODE — the correct seam, testing the discrimination rather than a stub's ability to impersonate a whole CLI.

THE NEAR-MISS IS THE LESSON: an integration observation that contradicts a passing unit test is far more likely to be an invalid repro than a regression, and reporting it would have cast doubt on a correct release. Check what the run actually DID — here, that trackerCheck was absent entirely — before concluding a gate failed to fire.

SIZING FOR STEP 3: a stub that reaches the floor check must fake 'init' and 'manifest --json' convincingly, not just '--version'.
---
<!-- COMMENTS:END -->

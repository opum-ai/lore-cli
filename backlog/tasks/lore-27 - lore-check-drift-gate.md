---
id: LORE-27
title: lore check (drift gate)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-07 07:49'
labels:
  - cmd
  - ci
milestone: m-3
dependencies:
  - LORE-22
  - LORE-23
documentation:
  - docs/adr/0007-validation-and-coherence.md
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read-only drift report (status, managed-block) for CI; exit code 6 on drift.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 check never writes
- [x] #2 Exit 6 on drift, 0 when clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/reconcile-shared.ts (new): extract sync.ts's task-resolution+reconcile-compute
   logic into a shared helper used by both sync and check. resolveAllTasks(adapter, taskIds)
   moved verbatim (not_found exit 3 on any missing id, before any per-concept computation).
   gatherReconciliation(root, concepts, adapterOverride?): filters to tasks:-linked concepts
   excluding RESERVED_STEMS; returns [] with no adapter constructed if none; else reads+validates
   flow/config/profile up front (validateReconcileInputs, fail-fast before any Backlog round-trip,
   mirroring sync's existing ordering), constructs the adapter (defaultAdapter unless overridden),
   resolves every distinct linked task id once, and returns {concept, newStatus, rows}[] per
   scoped concept.
2. Refactor src/commands/sync.ts to call gatherReconciliation instead of its inline duplicate;
   sync keeps its own per-item write logic (apply status, regenerateTaskBlock, byte-diff into
   writes). No behavior change; existing sync.test.ts must stay green.
3. src/core/check.ts: extend CheckRule with "status-drift" | "managed-block-drift". Add pure
   reconcileDriftFindings(input: {path, currentStatus, newStatus, original, rows, docPath}) ->
   CheckFinding[] — status-drift when newStatus !== null && !== currentStatus; managed-block-drift
   when regenerateTaskBlock(original, rows, {docPath}) !== original. Both severity "error" (always
   gate exit 6 per ADR-0007, unlike the warn-only portability lint) — malformed markers still throw
   validation via regenerateTaskBlock's own contract, unchanged.
4. src/commands/check.ts: add `adapter?: BacklogAdapter` to CheckOptions. Per bundle root (same
   loop as the existing link/anchor pass), additionally loadBundle(absRoot) the root, run
   gatherReconciliation, read each concept's original bytes (readSource), call
   reconcileDriftFindings, and merge into the aggregate CheckReport — bundle-label-prefixed in
   multi-root mode exactly like existing findings. A bundle root with no tasks:-linked concepts
   never constructs an adapter (mirrors rename.ts precedent). Exit-code composition unchanged
   (errorCount > 0 already gates; these are errors).
5. docs/reference/cli-surface.md: document the two new passes in check's section (mirroring how
   LORE-26 updated sync's). CHANGELOG.md Unreleased/Added entry.
6. Tests: test/check.test.ts additions (status-drift detected, managed-block-drift detected, clean
   tree = no findings, missing linked task = exit 3, malformed markers = exit 6/validation,
   multi-bundle-root reconciliation, no-adapter-when-no-tasks-linked, --strict doesn't change these
   findings' already-gating behavior); direct unit tests for reconcile-shared.ts; confirm
   sync.test.ts unchanged/green post-refactor.
7. Gates: bun test, biome check, tsc --noEmit -> /code-review max -> fold -> CHANGELOG + backlog
   notes/ACs -> PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore check's remaining two ADR-0007 passes: status reconciliation + managed-block
drift. Both reuse the exact pure engines lore sync writes with (reconcile.ts's reconcileStatus,
managed-block.ts's regenerateTaskBlock) -- diffed against disk, never written.

- src/commands/reconcile-shared.ts (new): extracted sync.ts's inline task-resolution+reconcile
  gather into a shared module (linkedConcepts: pure sync eligibility filter; gatherReconciliation:
  async resolve+compute). sync.ts refactored to call it -- no behavior change, existing
  sync.test.ts stayed green untouched. Avoids the ~40-line duplication a review would have flagged.
- src/core/check.ts: CheckRule extended with "status-drift"/"managed-block-drift" (both severity
  error -- always gate exit 6 per ADR-0007, unlike the warn-only portability lint). New pure
  reconcileDriftFindings(input) judges drift from already-resolved data.
- src/commands/check.ts: per discovered bundle root, additionally loadBundle()s it and runs
  gatherReconciliation, sharing ONE BacklogAdapter instance across roots so its capability probe
  runs at most once regardless of root count. A bundle with no tasks:-linked concept at all
  constructs no adapter and check stays fully synchronous (the existing contract every caller
  relies on, pinned by its own test); otherwise check now returns Promise<number>. A missing
  linked task still fails loud (not_found, exit 3); malformed/missing managed-block markers still
  fail loud (validation, exit 6) -- both via the reused core functions' own contracts, unchanged,
  so check can never disagree with what sync would do.
- Docs: cli-surface.md's check Exit row now states drift's exit 6/3 explicitly (the pass
  descriptions above it were already written forward-looking and needed no change). CHANGELOG
  Unreleased/Added entry.
- Tests: test/check.test.ts new "status + managed-block drift" describe (clean/no-drift,
  status-drift alone, block-drift alone, both together, --strict is a no-op on drift, no-tasks
  concept stays synchronous + constructs no adapter, missing task rejects not_found, malformed
  markers reject validation, reserved-stem concept never reconciled, two-bundle-root reconciliation
  shares one adapter + labels findings by root). test/reconcile-shared.test.ts (new): direct
  coverage of linkedConcepts + gatherReconciliation in isolation. storyDoc test fixture hoisted
  from sync.test.ts into test/helpers.ts (now shared by both suites, same hoisting precedent as
  gitRun/makeTask/fakeAdapter).

Full suite 1241/1241 (18 new/updated this round), typecheck clean, biome clean on every touched
file (3 pre-existing biome infos remain in files this task never touched: managed-block.ts,
managed-block.test.ts, supersede.test.ts). Starting /code-review max.

1st /code-review max pass on the LORE-27 diff (15 agents, ~1.0M subagent tokens, ~18 min).
12 candidates verified, 0 refuted, 8 distinct defects reported after folding duplicate-root-cause
clusters (4 findings all traced to the same defect via different fixtures).

Root cause (most severe, 4-way confirmed): runCheck's new reconciliation-eligibility scan called
loadBundle() directly on each bundle root -- a SEPARATE, real second directory walk that both (a)
FULL-parses+validates every concept's frontmatter, so any schema-invalid frontmatter ANYWHERE in
the bundle (even a file with no tasks: link at all) threw and crashed the entire gate before the
real check.report (e.g. an unrelated broken-link finding) was ever emitted -- turning check from a
tolerant, schema-agnostic reporting gate into a hard crash, violating its own documented contract
("only a usage error or an I/O failure throws"); and (b) duplicated collectBundles's own walk,
producing doubled symlink/unreadable-subdir advisories AND new spurious "no frontmatter mapping"
noise on every clean run (index.md and any other frontmatter-free doc). Fixed: replaced loadBundle()
with a new tryConceptsFor(bundle.files) that reuses the ALREADY-read raw bytes (no second walk, no
second read) and best-effort tryParseConcept()s each one, silently skipping both non-concepts (null
return, matching pre-existing behavior exactly) and malformed concepts (catches the throw) --
a schema problem elsewhere is lore validate's to report, not a reason for check to crash.

Two independent bugs:
- cli.ts's dispatch() never forwarded context.adapter to runCheck (unlike link/unlink/rename/sync),
  making the CheckOptions.adapter reconciliation seam this task added completely unreachable through
  the public run() entry point -- any embedder/test injecting an adapter to avoid a real Backlog
  subprocess would silently hit the real `backlog` binary instead. Fixed: one-line addition.
- advisories.flush() was only called inside driftPromise's FULFILLMENT callback, so a reconciliation
  REJECTION (missing linked task, malformed managed-block markers, bad status-flow config) silently
  dropped every discovery advisory collected earlier in the same run. Fixed: flush once, immediately,
  right after building conceptBundles/deciding sync-vs-async (before any async work that can throw)
  -- matches sync.ts's own existing ordering precedent exactly. WarningCollector.flush is
  non-draining, so this also means the later flush() calls in both async branches had to be removed
  (would have re-emitted the same lines); the one remaining post-flush advisory (external-liveness
  probe fault) now goes through its own fresh, single-use WarningCollector instead.

Two cleanup fixes folded in the same pass: computeDriftFindings no longer re-reads each
reconciliation target's file via readSource (already-read bytes looked up from bundle.files by a
Map instead); and bundle roots are now resolved concurrently via Promise.all instead of a sequential
for-of/await loop (verified safe against the adapter's synchronous capability-probe memoization --
concurrent first-use can't race it since the check-and-assign has no await between them).

7 new regression tests pin every fix: a malformed concept elsewhere no longer crashes the gate (the
broken-link finding still surfaces); a frontmatter-free doc produces zero stderr noise; a symlink
advisory is emitted exactly once (not doubled); cli.ts's run() actually forwards an injected adapter
(proven via a distinctive poisoned-adapter failure message, since the real adapter would fail
differently); discovery advisories survive a reconciliation rejection. Full suite 1245/1245 (7 new
this round), typecheck clean, biome clean on every touched file. Starting a 2nd /code-review max
pass to check for convergence given the 1st found a serious, multi-symptom defect.

2nd /code-review max pass on the LORE-27 diff (16 agents, ~1.11M subagent tokens, ~21 min).
7 candidates verified, 0 refuted, 7 confirmed -- round 1's fix for the loadBundle-crash bug itself
introduced/exposed new issues, so this round caught the fallout plus unrelated real bugs.

Fixed:
- sync.ts: the reconcile-shared.ts refactor had moved loadProfile() to AFTER gatherReconciliation
  (i.e. after the Backlog round-trip), breaking the documented "config validated before spending any
  Backlog subprocess round-trip" fail-fast contract -- a malformed .lore/profile.toml would now only
  surface after every linked task was already resolved, and could be masked entirely by a not_found
  for a missing task instead. Fixed: profile is loaded before gatherReconciliation again, gated on
  linkedConcepts(scoped).length > 0 (mirrors gatherReconciliation's own eligibility check) so a
  bundle with nothing to reconcile still never pays for it -- matches the pre-refactor behavior
  exactly. (No test exercised a malformed profile file specifically, which is why this slipped
  through round 1 -- not adding one now either; the existing malformed-config test already covers
  the same fail-fast PATTERN via backlog/config.yml.)
- core/check.ts's status-drift message used JSON.stringify(currentStatus) directly, but
  JSON.stringify(undefined) returns the VALUE undefined, not a string -- silently coercing to a bare
  unquoted "undefined" word in the template literal when a tasks:-linked concept has no status:
  field yet (schema-optional; the normal state right after `lore link`, before a first `lore sync`).
  Fixed: explicit "(unset)" display for the undefined case.
- check.ts's Bundle interface carried an absRoot field, computed and stored on every bundle, left
  over from round 1's ORIGINAL (buggy) loadBundle(bundle.absRoot) call -- once that was replaced
  with tryConceptsFor(bundle.files) (reusing already-read bytes, no second walk), absRoot became
  fully dead: populated, never read, its own comment describing an abandoned design. Removed.
- New regression test: the one previously-uncovered branch combination (needsReconciliation &&
  parsed.external together) now has explicit coverage.

Deliberately NOT changed (recorded here so a future pass doesn't re-litigate):
- [0, most severe by the review's own ranking] tryConceptsFor silently drops a concept whose
  frontmatter fails schema validation -- INCLUDING one that also links tasks -- so such a concept is
  invisible to check's drift detection even though `lore sync` would refuse to touch it too. This is
  the direct, unavoidable flip side of round 1's fix (making check throw on this exact case IS round
  1's bug). Resolution: this is the ADR-0007 validate/check split working as designed -- "is this
  document well-formed" is `lore validate`'s Tier-2 question, not a second thing `check` should
  re-derive by parsing raw pre-validation YAML to detect a tasks: field on a file it can't otherwise
  trust. Fixed the actual defect instead: my own CHANGELOG entry overclaimed "check can never
  disagree with what a sync run would do" -- corrected to state the real, narrower guarantee, and
  added an explicit code comment on tryConceptsFor documenting this exact tradeoff so it reads as
  intentional, not overlooked, next time.
- [2] advisories.flush() now runs unconditionally before the report is emitted (previously: report
  then advisories). This is the direct, unavoidable consequence of the OTHER fix from round 1
  (advisories must flush before any async work that can reject, or they're lost entirely on a
  rejection -- round 1's finding [7]). The new order also now matches sync.ts's own existing
  precedent (it flushes right after loadBundle, well before its final emit). Kept as the correct
  choice; added a comment explaining the deliberate tradeoff (never-lose-advisories over
  stdout-precedes-stderr, the latter already an unreliable cross-stream assumption).
- [5] multi-root check still re-validates status-flow/config and re-resolves shared task ids once
  per bundle root instead of once overall -- same cleanup-grade finding as round 1's deferred item,
  re-flagged. Still deferred: narrow multi-root edge case, correctness-neutral, would require
  widening gatherReconciliation's contract for marginal benefit.

Full suite 1246/1246 (2 new/updated this round), typecheck clean, biome clean. Starting a 3rd
/code-review max pass to confirm convergence.

3rd /code-review max pass on the LORE-27 diff (16 agents, ~1.19M subagent tokens, ~22 min). 7
candidates verified, 1 refuted, 6 confirmed. The refuted candidate was round 2's own deliberately-
accepted item (tryConceptsFor silently dropping a malformed-AND-linked concept) -- this round's
verifier independently concluded it is "the explicitly documented, intentional behavior... not a gap
unique to" LORE-27, confirming that decision rather than re-opening it.

Most severe (fixed): when reconciliation rejected (a missing linked task, a malformed managed block),
runCheck's ONLY emit() call lived inside driftPromise's fulfillment callback -- so a rejection meant
the already-computed baseReport (broken links/anchors, portability -- entirely unrelated to the
failure) was silently discarded, along with any OTHER bundle root's already-resolved drift findings
under the round-2 Promise.all. Fixed by making computeDriftFindings never reject: it now returns
{findings, error} via Promise.allSettled (collecting every root's findings regardless of another
root's failure, and picking the first error in ARGUMENT order -- not wall-clock settlement order, so
which root's error surfaces is deterministic and reproducible, closing a second confirmed finding
about non-deterministic Promise.all race order in the same motion). runCheck now always emits the
full report first, then re-throws the carried error if any -- matching check's own "always report
what you found" contract instead of sync's all-or-nothing write contract (the two commands have
different atomicity needs: sync must never partially write, check never writes at all so has nothing
to lose by reporting partial information).

Also fixed:
- sync.ts: the reconcile-shared.ts extraction had moved loadProfile() to run BEFORE
  gatherReconciliation's internal config validation, which (on top of round 2's fix, already
  correctly ordering both before the Backlog round-trip) reversed this command's own pre-existing
  precedence between the two LOCAL config sources when BOTH happen to be simultaneously malformed --
  originally backlog/config.yml's error would win over .lore/profile.toml's; now it was the reverse.
  Fixed by extracting resolveReconcileConfig() (reconcile-shared.ts) so sync.ts can call it explicitly
  before loadProfile, restoring the exact original order; gatherReconciliation still re-validates
  internally (a small, local, accepted redundancy -- the same tradeoff core/reconcile.ts's own
  reconcileStatus already documents for its identical situation).
- core/check.ts's drift messages said "run `lore sync` to reconcile/regenerate" unconditionally, but
  sync only ever reconciles the hardcoded docs/ bundle -- for any OTHER named bundle root (LORE-30's
  multi-root check discovery), that advice is flatly wrong (sync has no concept of an alternate
  root). Fixed: the hint is only included when the concept's docPath is actually under docs/.
- --external liveness previously started only AFTER driftPromise settled (a `.then` chain), needlessly
  serializing two fully independent I/O operations (a Backlog subprocess round-trip vs. HTTP fetches
  over already-read bytes). Fixed: both are kicked off concurrently via Promise.all, with liveness's
  own result wrapped in a never-rejecting {ok, findings|err} shape so it composes cleanly alongside
  driftPromise's own never-rejecting {findings, error} shape.

Deliberately NOT fixed again (3rd time this exact item has been flagged, each time correctly
reclassified as cleanup/performance, never correctness): multi-root check still resolves shared task
ids and validates config once per bundle root rather than once overall. Rather than defer a 4th time,
filed LORE-50 as an explicit, scoped follow-up so this stops being re-litigated on every pass.

6 new regression tests: baseReport survives a reconciliation rejection; one bundle root's rejection
doesn't discard another root's already-resolved drift findings; a non-docs bundle root's drift
message never mentions `lore sync`; --external liveness demonstrably starts concurrently with (not
after) a slower drift resolution; sync's config-error precedence when both config.yml and
profile.toml are malformed. Full suite 1251/1251 (5 new this round), typecheck clean, biome clean.
Filed LORE-50 (multi-root reconciliation dedup, deferred/low priority, dep LORE-27). Starting a 4th
/code-review max pass to confirm convergence.

4th /code-review max pass on the LORE-27 diff (11 agents, ~883K subagent tokens, ~22 min). 4
candidates verified, 0 refuted, 3 distinct defects after folding a duplicate cluster.

Most severe -- finally properly fixed rather than re-argued (this exact tension had been raised
and evaluated 4 times now: round 2 confirmed it as intentional, round 3's verifier independently
REFUTED it as "the explicitly documented, intentional behavior," round 4 re-confirmed it as a real,
reproducible false-negative). Given the review process itself kept oscillating on this exact point
across rounds, the right call was to stop re-litigating the scope boundary and actually close the
gap: core/concept.ts gained tryReadFrontmatter(path, raw) -- a new best-effort peek at a file's raw,
UNVALIDATED frontmatter mapping (never throws, unlike tryParseConcept). check.ts's tryConceptsFor now
uses it in its catch block: a malformed concept with NO tasks: field stays silently skipped (still
lore validate's job, ADR-0007), but a malformed concept that DOES declare tasks: now RE-THROWS the
original validation error -- lore sync would refuse to touch that exact file too (its own loadBundle
call has the identical unconditional throw), so silently treating it as un-linked was the one real
case where check could actually disagree with what sync does. This re-throw happens synchronously
(tryConceptsFor runs before any async branching), so runCheck now wraps that whole step in its own
try/catch, emitting the already-computed baseReport before re-throwing -- the same "never silently
lose what was already computed" guarantee round 3 established for the async rejection path, now
extended to this synchronous one too.

Also fixed -- sync.ts's config-precedence, part 2: round 3's fix only handled ordering relative to
the Backlog round-trip, but didn't preserve this command's ORIGINAL precedence for TWO
simultaneously-broken LOCAL config sources when one of them is a SEMANTIC-only problem (a duplicate
status-flow entry, valid YAML, caught only by validateReconcileInputs -- which originally ran LAST,
after profile had already loaded successfully) vs. a malformed .lore/profile.toml. Fixed by splitting
reconcile-shared.ts's config resolution into readReconcileConfig (read-only, no semantic check) and
resolveReconcileConfig (adds validateReconcileInputs); sync.ts now calls read -> loadProfile ->
validateReconcileInputs in that exact original order, restoring both precedence cases (a config.yml
SYNTAX error still wins over a malformed profile; a SEMANTIC-only config.yml problem still loses to
a malformed profile, exactly as before this whole refactor). gatherReconciliation also now accepts
an optional pre-resolved configOverride, so sync's own already-validated config is passed straight
through instead of being read/validated a 2nd time inside gatherReconciliation -- closing the
3rd, cleanup-grade finding (redundant config re-reads) as a side effect of the correctness fix,
rather than leaving it as accepted debt this time.

5 new regression tests: a malformed-AND-linked concept re-throws (validation, not a silent pass);
the already-computed report survives even this synchronous throw; the semantic-vs-syntax config
precedence is now pinned in BOTH directions (config.yml syntax error wins over malformed profile;
profile error wins over a semantic-only config.yml problem, mirroring this command's exact
pre-refactor behavior for each). Full suite 1254/1254 (5 new this round), typecheck clean, biome
clean. Starting a 5th /code-review max pass to confirm convergence -- 4 rounds have each found real,
non-overlapping defects (the two extraction points, reconcile-shared.ts's gather and check.ts's
new concept-detection scan, have been the hardest to get exactly right), so continuing to iterate
rather than assuming convergence early.

5th /code-review max pass on the LORE-27 diff (15 agents, ~1.17M subagent tokens, ~21 min). 6
candidates verified, 1 refuted (a null-vs-error-sentinel concern in computeDriftFindings -- every
throw site in this codebase constructs a real LoreError extends Error, so a literal `null` rejection
reason is unreachable in practice), 5 confirmed.

Most severe -- a genuine gap in round 4's own fix: tryReadFrontmatter's try/catch collapsed TWO
different outcomes into the same `null` -- "no frontmatter present" (safe: tryParseConcept would
also return null, never throw, so this code path is unreachable from tryConceptsFor's catch block
anyway) and "the YAML itself is unparseable" (NOT safe to treat as null -- there is no mapping to
peek a tasks: field from, so innocence can't be assumed). A concept with genuinely broken YAML that
would have declared tasks: was silently dropped instead of re-thrown -- the exact disagreement-with-
sync gap round 4 was built to close, just for a different flavor of malformed frontmatter than round
4's own repro used. Fixed: tryReadFrontmatter no longer catches splitFrontmatter's own throw --
letting it propagate (same as tryParseConcept does) is the correct, conservative default; the
`null` branch is now reachable only for the case that was always safe (a present-but-empty/missing
mapping), never for a parse failure.

Second correctness fix -- per-concept isolation WITHIN one bundle root, extending what rounds 3/4
only isolated ACROSS roots: driftFindingsForBundle's per-target loop discarded every earlier
concept's already-computed drift finding whenever a LATER concept's managed-block markers were
corrupted (regenerateTaskBlock's own throw), because the whole function's promise rejected mid-loop.
Fixed by wrapping each concept's own reconcileDriftFindings call in its own try/catch inside the
loop, carrying the first error (in target order) alongside whatever findings DID complete --
computeDriftFindings now folds both a root-level rejection (gatherReconciliation itself failing,
still root-granularity, unchanged) AND a root's own partial {findings, error} together into one
deterministic first-error selection across the whole run.

Also fixed: CHANGELOG.md's own overclaim (from round 3's fix) that check's frontmatter walk "never
throws" -- corrected to state the actual, narrower contract (only when the malformed concept has no
tasks: link; docs YAML that's unparseable is treated the same as tasks:-linked, per the fix above).
Two duplication cleanups: hoisted a shared prefixFinding() helper in check.ts (was reimplemented 3x
across checkBundles/driftFindingsForBundle/prefixLinks); hoisted test/indexes.test.ts's and
test/reconcile-shared.test.ts's near-identical concept() fixture builder into test/helpers.ts (same
hoisting precedent this diff already applied to storyDoc).

2 new regression tests: unparseable-YAML-plus-tasks: now re-throws (distinct from the
schema-invalid-but-parseable case already covered); a later concept's malformed managed-block
markers no longer discard an earlier concept's already-computed finding in the same bundle root.
Full suite 1256/1256 (2 new this round), typecheck clean, biome clean. Starting a 6th
/code-review max pass -- 5 rounds have now each found real, non-overlapping defects concentrated in
the two new extraction points (reconcile-shared.ts's gather, check.ts's concept-detection scan +
per-concept/per-root error isolation), continuing to iterate rather than assume convergence early.

6th /code-review max pass on the LORE-27 diff (15 agents, ~1.18M subagent tokens, ~27 min). 6
candidates verified, 1 refuted (a CRLF-vs-LF managed-block false-positive concern -- refuted because
every lore read path normalizes to LF via normalizeInput before this comparison ever runs, so the
premise doesn't reproduce), 5 confirmed -- but one of the five confirmed findings turned out to be a
false positive on closer empirical verification (see below), so only 3 were actually fixed.

Fixed:
- core/check.ts's fixable check for the "run `lore sync`" hint used a fragile string-prefix match
  (docPath.startsWith("docs/")) against a COMPOUND path built from the user-typed bundle-root
  argument -- so `lore check ./docs` (or any non-canonical-but-equivalent spelling of the default
  root) silently omitted the hint even though `lore sync` actually can fix that root. Fixed by
  replacing the string-guessing entirely: ReconcileDriftInput now carries an explicit `fixable:
  boolean`, computed once per bundle in commands/check.ts (canonicalizing bundle.label via
  posix.normalize + stripping a trailing slash) -- core no longer reverse-engineers a fact from a
  path string it didn't construct.
- runCheck's ONE synchronous catch branch (a malformed-and-tasks:-linked concept, added in round 4)
  emitted the report BEFORE flushing advisories -- the opposite order from every other path in the
  same function, and for the exact reason round 3 established that ordering in the first place: if
  emit() itself were to throw, a flush placed after it would never run, silently dropping advisories
  again. Fixed: flush first, matching the established convention exactly.

Investigated and NOT fixed (verified empirically, not just argued) -- tryConceptsFor's re-throw
condition doesn't exclude RESERVED_STEMS (index/log) the way linkedConcepts does, so the reviewer
flagged a malformed-AND-tasks:-linked index.md as an inconsistency (reconciliation would never touch
it, yet it can still crash the run). Directly tested: `lore sync` (via loadBundle) ALSO crashes
unconditionally on this exact file, since loadBundle validates every concept's frontmatter BEFORE
the reserved-stem exclusion is ever applied (RESERVED_STEMS filtering only happens later, over an
ALREADY-successfully-loaded graph). So tryConceptsFor's current behavior already matches sync
exactly for this case; adding a reserved-stem exclusion would make check MORE tolerant than sync
here, reintroducing a disagreement in the opposite direction -- against the very principle rounds
2-5 converged on. This is the first round to find a genuine false positive among its own confirmed
findings; recorded here so a future pass doesn't re-flag it without doing the same empirical check.

Deliberately NOT fixed (documented tradeoff, not overlooked) -- the --external combined path's final
Promise.all(...).then(...) has no catch around its own emit() call, unlike the old code's broader
try/catch (which incidentally, not deliberately, also covered emit failures alongside liveness
failures). If emit() itself throws there, the process now surfaces the failure through cli.ts's
already-existing generic uncaught-rejection handler rather than a specific-but-mislabeled "liveness
aborted" advisory. Given that safety net already exists at the CLI layer, and the OLD code's own
fallback emit (inside its catch) was equally unprotected against a genuinely broken stdout, adding
more nested try/catch here trades real complexity for an already-marginal, arguably-improved (no
longer mislabeled) behavior change -- left as-is.

Already tracked, re-flagged for visibility only: multi-root check's redundant per-root config
resolution/task-id dedup (LORE-50, filed after round 3, unchanged).

2 new regression tests: a non-canonical docs-root spelling (./docs) still gets the sync hint;
advisories flush before the report is emitted even on the synchronous malformed-linked-concept
throw path. Full suite 1258/1258 (2 new this round), typecheck clean, biome clean. Starting a 7th
/code-review max pass -- this round's own 1-false-positive-among-5-confirmed result plus the 1
outright refutation are the first real convergence signals after 5 rounds of pure real-defect
discovery, so checking once more before treating this as done.

7th /code-review max pass on the LORE-27 diff (13 agents, ~1.17M subagent tokens, ~25 min). 4
candidates verified, 0 refuted, 4 confirmed -- but 2 of the 4 were RE-FLAGS of decisions already
made (and, for one of them, empirically verified) in earlier rounds, not new defects. Real
convergence signal: no genuinely new finding shape this round, only one real fix plus one accepted
redundancy re-flag.

Re-flagged, NOT re-litigated (both already settled with documented rationale):
- tryConceptsFor's reserved-stem exclusion gap -- the identical concern as round 6's finding [1],
  which was directly, empirically disproven there (verified `lore sync` ALSO crashes unconditionally
  on a malformed index.md/log.md regardless of tasks: linkage, since loadBundle validates before any
  reserved-stem filtering runs). This reviewer's finder re-derived the same theoretical concern
  without re-running that verification. Standing decision reaffirmed, not reopened.
- The stdout-before-stderr -> stderr-before-stdout ordering change -- this is round 3's own
  deliberate fix (flush advisories before anything that could throw, so a later rejection can never
  silently drop them), explicitly documented in runCheck's own code comment at the time. Not a new
  regression; standing decision reaffirmed.

Fixed (real, and the only genuinely new finding this round): reconcileDriftFindings' "(unset)"
placeholder only covered `currentStatus === undefined` (a status: key entirely absent), not the
schema-valid sibling case `currentStatus === null` (status: present with an empty/null value --
Story's status field is `.nullish()`, accepting both). A doc in that null state showed the bare,
unquoted word "null" in its status-drift message -- the exact JS-quirk class the surrounding code
comment already called out for `undefined`, just missing the other nullish value. Fixed: both
undefined and null now normalize to the same "(unset)" placeholder.

Deliberately NOT fixed (same accepted-redundancy shape as round 2's resolveReconcileConfig
re-validation, and round 3's own explicit precedent for it): gatherReconciliation recomputes
linkedConcepts even when both call sites (sync.ts, check.ts) already computed the identical
eligibility list moments earlier just to decide whether to bother calling it. linkedConcepts is a
pure, synchronous, no-IO scan over already-loaded concepts (not a subprocess/network round-trip like
the config-validation redundancy that motivated the configOverride parameter) -- negligible real
cost, consistent with the already-accepted tradeoff.

2 new regression tests: an unset status (no key) and an explicit null status (empty value) both
render as "(unset)", never the bare words "undefined"/"null". Full suite 1260/1260 (2 new this
round), typecheck clean, biome clean. Starting an 8th /code-review max pass -- this round found only
1 genuinely new defect plus 2 settled re-flags and 1 already-accepted-pattern re-flag, a stronger
convergence signal than round 6's; checking once more to confirm before finalizing.

8th /code-review max pass on the LORE-27 diff (11 agents, ~933K subagent tokens, ~19.5 min). Only 2
candidates total across all 6 finders this round (down from 4-7 in prior rounds) -- 1 confirmed, 1
refuted (an unchecked `as string` type assertion on the rawByPath map lookup; refuted since every
concept in `targets` is guaranteed to have come from `bundle.files` in the first place, so the
lookup can never actually miss). Strongest convergence signal yet.

Fixed: isDocsRoot (added round 6, to replace the fragile docPath string-prefix guess) compared the
canonicalized bundle-root label to DOCS_DIR with case-SENSITIVE equality. On macOS/Windows --
case-insensitive filesystems, the default for most local dev -- a differently-cased root like `lore
check Docs` reads the exact same directory `lore sync` operates on, but was judged "unfixable,"
silently omitting the "run `lore sync`" hint. Fixed with a case-insensitive compare; exported
isDocsRoot (previously private) for a direct unit test, specifically to avoid a real filesystem
round-trip through a differently-cased directory argument -- that would only reproduce reliably on
case-insensitive filesystems and silently pass-but-not-test-anything on case-sensitive Linux CI,
exactly the mac/win-vs-ubuntu split this project's own memory notes have been bitten by before.

8 new test cases (test.each over docs/./docs/docs//Docs/DOCS/alt/docs2/adocs) pin isDocsRoot
directly, deterministic across filesystem case-sensitivity. Full suite 1268/1268 (8 new this round),
typecheck clean, biome clean. Starting a 9th /code-review max pass -- 2 total candidates (vs. 4-7 in
every prior round) is the clearest convergence signal so far; one more pass to confirm before
finalizing.

9th /code-review max pass on the LORE-27 diff (16 agents, ~1.18M subagent tokens, ~24.5 min). 7
candidates verified, 0 refuted, 6 distinct (1 pair merged as the same root cause across two call
sites). Not convergence -- back up from round 8's 2 candidates -- but every finding this round was
either genuinely new (not a re-flag) or a legitimately actionable test/doc gap, unlike round 9's
predecessor which included re-flags of already-settled items.

Most severe, and the real structural gap: the SYNCHRONOUS concept-eligibility pre-pass
(bundles.map(bundle => ({bundle, concepts: tryConceptsFor(bundle.files)}))) had NO per-root
isolation -- unlike the ASYNC drift computation right below it, which rounds 3/5 carefully built
Promise.allSettled isolation into. A bare `.map()` aborts entirely on the first throw, so if bundle
root B's concept-scan re-threw (a malformed-AND-linked concept), root A's perfectly good, fully
computable drift was never even ATTEMPTED, let alone reported -- worse than "discarded," since
computeDriftFindings never ran for ANY root. This was the third variant of a bug class already fixed
twice (cross-root in round 3, within-root in round 5) -- the synchronous scan stage simply hadn't
been brought into the same isolation discipline yet.

Fixed by restructuring the scan itself: tryConceptsFor (throwing) replaced by tryConceptsForBundle
(NEVER throws -- returns {bundle, concepts, error} per root). computeDriftFindings now folds a
sync-stage scan failure into the SAME Promise.allSettled as an async reconciliation failure, via a
pre-rejected Promise.reject(error) entry -- so "first error in bundle-argument order" (not
settlement order) uniformly covers both failure kinds, whichever bundle hits either. This also let
round 4's special-cased "wrap tryConceptsFor's mapping in try/catch, emit-then-flush-in-a-particular-
order" branch (itself flagged for a wrong order in round 6) be DELETED entirely: since the scan can
no longer throw, advisories flush unconditionally, once, immediately, for every path uniformly --
removing an entire category of "is this branch's ordering consistent with the others" question that
kept getting re-flagged (rounds 0, 6, and this round's re-flag of the SAME concern for the plain,
no-reconciliation path specifically).

Folded in the same restructuring, since it touched the identical function: the cheap
non-validating tryReadFrontmatter peek now runs FIRST for every file, and only a file that
actually declares tasks: pays for full Zod-validating parseConcept -- the vast majority of any
bundle (ADRs, specs, index/log) never validates frontmatter at all now, closing a real,
previously-flagged efficiency gap in the same motion (LORE-27 never needed the FULL Concept object
for non-task-linked files; only frontmatter.tasks/status/path/id are ever read downstream).

Also fixed: mergeFindings/checkBundles reimplemented the same severity-tally loop core/check.ts's
own summarize() already had -- extracted a shared, exported tallySeverity() in core/check.ts, reused
by all three. CHANGELOG.md's LORE-27 entry didn't mention the stdout-before-stdout ordering change
at all (a real doc gap, even though the behavior itself was already deliberate and tested) --
added an explicit "Behavior change" callout.

Deliberately NOT fixed (2nd time re-flagged, same reasoning as round 7): linkedConcepts is still
recomputed by both call sites (check.ts, sync.ts) AND again inside gatherReconciliation -- pure,
synchronous, no-IO, negligible cost, same accepted-redundancy pattern as reconcileStatus's own
documented tradeoff.

3 new regression tests: a bundle root's SYNCHRONOUS scan failure no longer discards another root's
already-computed drift finding (distinct from round 3's async-rejection version of the same
property); the plain (no reconciliation, no --external) path now has its own stdout/stderr order
pin, closing the "never directly tested" gap the reviewer correctly identified (every OTHER path
already had one). Full suite 1270/1270 (3 new this round), typecheck clean, biome clean. Starting a
10th /code-review max pass.

10th /code-review max pass on the LORE-27 diff (13 agents, ~1.13M subagent tokens, ~23 min). 5
candidates verified, 0 refuted, 4 distinct (2 merged as the same root cause -- stale test
comments/titles at two spots).

Most severe -- and my OWN round-9 fix's fix introduced a NEW instance of the exact bug class it was
supposed to close: tryConceptsForBundle wrapped its entire per-file loop in ONE try/catch, so a
LATER file's scan failure discarded every EARLIER file's already-successfully-scanned concept in the
SAME bundle root -- not just the one file that actually failed. Caught during my own regression-test
authoring for this exact round (the first draft of the new test failed), not just by the reviewer.
Fixed properly this time: isolated PER FILE (matching driftFindingsForBundle's own established
pattern) -- each file's parseConcept call gets its own try/catch, collecting every concept that DOES
parse successfully and carrying only the FIRST error (in file order), continuing the loop rather than
aborting it.

That fix alone wasn't sufficient, though -- computeDriftFindings ALSO needed correcting: it was
still treating "this bundle has a scan error" as "skip driftFindingsForBundle entirely for this whole
bundle," so even a properly-collected earlier concept never got its drift computed at all. Fixed by
ALWAYS calling driftFindingsForBundle with whatever concepts a root's scan DID collect (even zero),
then combining that root's own scan error (if any) with whatever reconciliation found, preferring the
scan error when both exist (it's the logically earlier problem -- other concepts in that root may
never have been examined because of it). This is now the FOURTH time this exact "isolate individual
items within a batch so one failure doesn't discard already-computed work" pattern has needed
applying at a progressively finer grain (cross-root round 3, within-root-per-concept round 5,
within-root-per-file scan rounds 9-10) -- each grain only became visible once the coarser one was
already fixed.

Also fixed: isDocsRoot's canonicalization only recognized `/` as a separator (posix.normalize), so a
Windows trailing-backslash spelling (`docs\`) was never recognized as the same root -- fixed by
converting backslashes to forward slashes before normalizing. CheckReport.errorCount's doc comment
still said "broken links + anchors" only, stale since this same task folded status-drift/
managed-block-drift into the identical counter -- corrized to describe the full contract. Stale test
comments/titles calling the malformed-linked-concept rejection "synchronous" (accurate through round
3, no longer accurate after round 9's restructuring moved it onto the async DriftResult path) --
reworded, and switched those tests from `expect(() => ...).toThrow()` to the more idiomatic `await
expect(...).rejects.toThrow()` used everywhere else in the suite (verified first that Bun's toThrow()
genuinely unwraps a returned rejected promise either way -- not a silent no-op, just a stale-wording
issue, not a test-validity one).

4 new/updated regression tests (1 pinning the previously-undetected within-scan bug -- itself caught
failing on first write, proving the fix was necessary, not cosmetic; 2 for the Windows-backslash
isDocsRoot cases). Full suite 1273/1273, typecheck clean, biome clean. Starting an 11th
/code-review max pass.

11th /code-review max pass on the LORE-27 diff (11 agents, ~904K subagent tokens, ~21 min). Only 2
candidates from all 6 finders (down from round 10's 5), and both are re-flags of already-settled
decisions rather than new defects -- the strongest convergence signal across the whole review.

- The stdout-before-stdout ordering: re-flagged a 4th time (rounds 3, 6, 9, now 11) -- the reviewer's
  own text even notes "this is disclosed in CHANGELOG.md and covered by a regression test, so it is
  very likely intentional." Reaffirmed, unchanged, for the 4th time.
- check's reconciliation-eligibility scan applies to ANY concept type carrying tasks:, not just
  Story/Spec -- verified this is NOT a LORE-27 regression: grepped reconcile-shared.ts and sync.ts,
  confirmed neither ever checked concept.type anywhere. `lore link` (LORE-24) has never restricted
  which type it targets, and tasks: on a Reference/ADR/etc. has always been an OKF-tolerated
  unknown-key warning, never an error -- this predates LORE-27 by two shipped tasks (LORE-24, 26).
  Narrowing check's scan to Story/Spec only would make check MORE restrictive than sync for other
  types (sync's own gatherReconciliation/linkedConcepts call is exactly as type-agnostic), reversing
  the disagreement-with-sync failure mode this review has spent 6+ rounds converging on. NOT fixed;
  added a clarifying comment to linkedConcepts (the actual shared decision point for both sync and
  check) documenting this is deliberate, pre-existing, cross-task-boundary architecture -- not
  something LORE-27 should unilaterally narrow -- to preempt a 12th round re-raising it without this
  context.

No code changes needed for either item -- treating this round as convergence. Full suite 1273/1273
unchanged, typecheck clean, biome clean.

Summary of the full review arc (11 rounds, ~13M total subagent tokens): round 1 found the dominant
defect (loadBundle() making check crash on any unrelated malformed frontmatter); rounds 2-10 each
found and fixed real, progressively finer-grained defects in the two new extraction points
(reconcile-shared.ts's gather, check.ts's concept-scan + per-item/per-root/per-file error isolation)
-- the recurring pattern being "isolate individual items within a batch so one failure doesn't
discard already-computed work," which needed applying at four progressively finer grains (cross-root,
within-root-per-concept, within-root-per-file-scan) before fully converging. Round 11 found nothing
new. Ready to finalize.
<!-- SECTION:NOTES:END -->

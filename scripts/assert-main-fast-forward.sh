#!/usr/bin/env bash
# Asserts that a push to `main` was a fast-forward of a `dev` that already held it (LCLI-514).
#
# TWO ASSERTIONS, NOT ONE, AND THEY CATCH DIFFERENT THINGS. Collapsing them into either single
# check trades a known blind spot for a new one, and the result would look like a fix:
#
#   1. FAST-FORWARD  old main is an ancestor of new main.  Catches a REWIND -- main moved
#                    backwards, losing commits. This is the assertion that was missing.
#   2. CONTAINMENT   new main is an ancestor of origin/dev. Catches a FOREIGN commit -- something
#                    reached main that dev never had, e.g. the GitHub merge button. This is the
#                    assertion that was already here.
#
# WHY THE MISSING ONE WAS INVISIBLE. The job asserted only (2) and was NAMED for (1). Those are
# different properties: (2) says "main's new HEAD is a commit dev already held", (1) says "main
# only moved forward". A rewind of main to an older commit that is still on dev satisfies (2) and
# violates (1), so the guard reported a genuine fast-forward while commits came off main.
# Measured 2026-09-15 in a scratch repo: dev = c1..c4, main rewound c4 -> c2, guard GREEN.
#
# Both halves of "prove it rejects AND prove it accepts" were already satisfied by the old job --
# genuine promotion green, merge button red -- so neither half could find this. The question that
# does is whether the NAME claims more than the ASSERTION measures.
#
# AND THE RULESET DOES NOT BACK THIS UP. Measured across the fleet 2026-09-15/16: every
# repository's ruleset is `required_status_checks` only (opum-fleet excepted, which added
# `non_fast_forward` on 2026-09-16). A status-checks rule CANNOT refuse a rewind, because a rewind
# pushes a commit that already carries green contexts -- the earlier promotion is what put them
# there. Phrased by quest-cli: the ruleset backs up exactly the half of the guard that already
# works, and provides nothing for the half that is broken. In lore-cli `main` carries no ruleset at
# all, so this script is the only automated thing that was ever going to notice.
#
# WHY IT IS A SCRIPT. Inline in a workflow it was untestable by construction and had never had a
# test, which is why the defect survived. test/assert-main-fast-forward.test.ts drives every branch
# against real fixture repositories.
#
# Contract: run inside a checkout with full history. Reads BEFORE, AFTER and DEV_REF from the
# environment. Exit 0 = both assertions hold. Exit 1 = at least one failed, each with its own
# message. Exit 2 = could not evaluate (a ref does not resolve), which is NOT a pass.

set -uo pipefail

: "${BEFORE:?BEFORE (the pre-push main SHA, github.event.before) is required}"
: "${AFTER:?AFTER (the post-push main SHA, github.sha) is required}"
: "${DEV_REF:=origin/dev}"

ZERO="0000000000000000000000000000000000000000"
problems=0

resolve() {
  # A ref that does not resolve is an ERROR, never a silently-skipped assertion. An assertion that
  # cannot be evaluated has verified nothing, and reporting that as success is the failure mode
  # this whole change exists to remove.
  if ! git rev-parse --verify --quiet "$1^{commit}" >/dev/null; then
    echo "::error::cannot resolve '$1', so this guard has verified NOTHING. This is a checkout or fetch problem, not evidence about the push. Ensure fetch-depth: 0 and that '${DEV_REF}' has been fetched."
    exit 2
  fi
}

resolve "$AFTER"
resolve "$DEV_REF"

# ── Assertion 1: fast-forward ──────────────────────────────────────────────────────────────────
if [ "$BEFORE" = "$ZERO" ]; then
  echo "assertion 1 (fast-forward): SKIPPED -- BEFORE is all-zeros, which means main was just
  created. There is no previous tip for the new one to descend from. This is the only case in
  which skipping is correct, and it is reported rather than silently passed."
else
  resolve "$BEFORE"
  if git merge-base --is-ancestor "$BEFORE" "$AFTER"; then
    echo "assertion 1 (fast-forward): OK -- main's previous tip ${BEFORE} is an ancestor of its new tip ${AFTER}, so main only moved forward."
  else
    problems=$((problems + 1))
    echo "::error::assertion 1 (FAST-FORWARD) FAILED: main's previous tip ${BEFORE} is NOT an ancestor of its new tip ${AFTER}. main MOVED BACKWARDS OR SIDEWAYS -- commits that were on main are no longer reachable from it. A fast-forward promotion cannot do this; a force-push can. Nothing in this repository's rulesets refuses it, so this message is the only notice. Find out what was pushed and why BEFORE reconciling, and do not force-push over it."
  fi
fi

# ── Assertion 2: containment ───────────────────────────────────────────────────────────────────
if git merge-base --is-ancestor "$AFTER" "$DEV_REF"; then
  echo "assertion 2 (containment): OK -- main's new tip ${AFTER} is an ancestor of ${DEV_REF}, so everything on main is a commit dev already held."
else
  problems=$((problems + 1))
  echo "::error::assertion 2 (CONTAINMENT) FAILED: main's new tip ${AFTER} is NOT an ancestor of ${DEV_REF}. Something reached main that dev never had -- the usual cause is the GitHub merge button, which staples a merge commit onto main that dev does not carry, after which main can never fast-forward again. Promote with 'git push origin origin/dev:main' instead. Do not force-push over this; find out what landed first."
fi

if [ "$problems" -gt 0 ]; then
  echo "::error::main-fast-forward guard: ${problems} of 2 assertions failed. These are DIFFERENT failures -- assertion 1 is a rewind, assertion 2 is a foreign commit -- and a push can trip either or both. Read which one above rather than the count."
  exit 1
fi

echo "main-fast-forward guard: both assertions hold. main is a fast-forward of ${DEV_REF}, and everything on it was already there."

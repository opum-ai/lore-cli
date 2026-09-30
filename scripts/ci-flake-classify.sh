#!/usr/bin/env bash
#
# Classify a `bun test` log for the known Linux epoll registration race (LCLI-507), so the
# ubuntu CI step can decide whether a failed run is that race or a product-test failure.
#
# WHY THIS EXISTS. The race has a THIRD presentation that the original guard (LCLI-507, which
# fires on `error: EEXIST: file already exists, epoll_ctl` or exit 124) does not cover: it hangs
# a handful of tests, each dies at its own per-test budget, the suite then COMPLETES with those
# as failures, and the exit code is neither 124 nor accompanied by the EEXIST line -- so the
# guard stayed blind and the job failed on its first and only run. Measured on 2026-09-30 across
# five failed attempts on opum-ai/lore-cli#446, whose logs consist SOLELY of
# `(fail) <name> [10000.xxms]` lines with no assertion-duration failure among them.
#
# THE RULE, and it is deliberately about the WHOLE RUN rather than about finding one bad line: a
# run is retryable only when it failed AND every failing test's recorded duration is at or above
# the per-test budget. ONE failure below the budget makes the run fatal, even when other failures
# are hangs, because an assertion failure is a product signal that a retry must not paper over.
#
# Usage: ci-flake-classify.sh <log-path> <per-test-timeout-ms>
# Exit:  0 = retryable (every failure hung at the budget; the hung tests are printed to stdout)
#        1 = fatal     (at least one failure is not a hang, or the log records no failures)
#        2 = usage error
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $(basename "$0") <log-path> <per-test-timeout-ms>" >&2
  exit 2
fi

log="$1"
budget="$2"

if [[ ! -r "$log" ]]; then
  echo "cannot read log: ${log}" >&2
  exit 2
fi

if ! [[ "$budget" =~ ^[0-9]+$ ]]; then
  echo "per-test budget must be an integer number of milliseconds, got: ${budget}" >&2
  exit 2
fi

# Bun reports a failure as:  (fail) <name> [123.45ms]
# A test killed by its own budget is reported at (or a hair above) that budget -- the timeout
# fires first and the duration is measured after. Anything below it finished on its own, which
# means the assertion failed rather than the runtime hanging.
# THE LAST BRACKET, not the first, and that is a correctness requirement rather than a style
# choice: a test's NAME may itself contain a duration-looking bracket, and reading the first one
# would score a genuine assertion failure as a hang -- the wrong direction, since it is exactly
# the failure the rule exists to keep fatal. Anchoring the match to the end of the line is what
# selects the recorded duration, which bun always appends last. The anchor also tolerates a
# trailing CR, so a CRLF log is classified by the same path.
awk -v budget="$budget" '
  /^\(fail\) / {
    failures++
    if (match($0, /\[[0-9]+(\.[0-9]+)?ms\][^[]*$/)) {
      duration = substr($0, RSTART + 1, RLENGTH - 4) + 0
      if (duration >= budget) {
        hung++
        # Bun prints a failure twice -- inline and again in its summary -- so the names are
        # deduplicated for the reader. The COUNTS above stay as-is: the equality the verdict
        # rests on is scale-invariant, which is why a doubled log still classifies correctly.
        if (!seen[$0]++) print $0
      }
    }
  }
  END {
    if (failures == 0) exit 1
    exit (hung == failures) ? 0 : 1
  }
' "$log"

#!/usr/bin/env bash
# A4 of the shipped-README version contract (LCLI-510; opum-doc main@ba3055d).
#
# Reads the README npm actually serves for this package back off the registry and re-runs the
# shipped-README assertions over it, then reports WHAT IT READ -- not just a verdict.
#
# WHERE IT RUNS (LCLI-616). scripts/promote-latest.mjs runs it after the final X launcher is
# published onto `latest` and step 7 has verified that publish, with its cwd set to a private
# directory holding the X tarball's OWN package/package.json and package/README.md, so
# "byte-equal" compares against the bytes that shipped. It used to be the last step of
# release.yml's `publish` job, which now only STAGES: a staged X-rc.N never sets npm's
# package-level readme (OPAG-474), so a read-back there read a field the staging never wrote. That
# job's sparse checkout did not even carry this file, so the step failed every `publish: true`
# run, and promote-latest.mjs refuses a Release run that did not conclude `success`.
#
# THIS IS A CONFIRMATION, NOT THE GATE. The gate is `shipped-readme-version.mjs --tarball`, which
# runs before any registry write. Published pages are immutable, so a read-back can only observe
# the defect, never prevent it; treating it as the gate would repeat exactly the failure the
# contract exists to catch.
#
# WHAT IT ACTUALLY READS, stated precisely because an earlier revision got it wrong in the very way
# the contract is about. npm's `readme` is a PACKAGE-LEVEL field on the packument, NOT a
# per-version page. Measured 2026-09-15 against the live registry:
#
#     npm view @opum-ai/lore@0.7.0 readme  -> 14446 bytes, sha256 25b24c8dd262bb9c...
#     npm view @opum-ai/lore@0.6.2 readme  -> the SAME 14446 bytes
#     npm view @opum-ai/lore@0.6.1 readme  -> the SAME 14446 bytes
#
# The version in the spec is inert for this field: npm serves whatever the most recent publish ONTO
# `latest` carried. An earlier revision wrote `spec="@opum-ai/lore@${version}"` and then reported
# "the README the registry serves for ${spec}", which names a version-specific object it had not
# read. That is the same defect class as the stale README itself.
#
# NOT REDUNDANT with a tarball digest comparison, which is about the tarball's bytes. npm extracts
# the `readme` field at publish time -- a separate copy from the one inside the tarball. This is the
# only thing that compares that copy to what we packed.
#
# IT RE-RUNS THE SAME ASSERTIONS rather than grepping for a sentence. A literal-string check was
# written first and was WRONG: the region markers split the rendered text, so
# `**Status: 0.7.0 released.**` does not appear contiguously in the source the registry serves, and
# it would have gone red on a CORRECT release. Running `--check` over the served bytes cannot drift
# from the generator, because it IS the generator.
#
# WHY IT RETRIES, AND WHAT IT CALLS A FAILURE. The read API lags a publish (LCLI-460: 0.4.5 ~15s,
# 0.4.6 ~35s, 0.5.0 ~25min). A lagging replica serves whatever the packument held BEFORE this
# publish: on an established package that is the PREVIOUS release's README, which is byte-for-byte
# the thing A4 flags, so a served README that satisfies the previous release's assertions is NOT
# CONFIRMED, not a failure. But a lagging replica can also serve an EMPTY readme, when the packument
# had none before -- as @opum-ai/lore's has none today (0 bytes since 0.11.0's dist-tag promotion,
# OPAG-474), so the first fresh publish onto `latest` will lag through an empty field. Empty alone
# therefore proves nothing. So an empty readme after the whole window is settled by ONE packument
# read of both fields (`npm view <name> readme versions --json`): if that packument already lists
# this version and still carries no readme, it is the OPAG-474 defect and FAILED (LCLI-616); if it
# does not list the version yet, lag is not ruled out and it is NOT CONFIRMED. If that read DOES
# carry a readme, it is compared exactly as an in-window one is (LCLI-626 N4).
#
# EVERY EXIT PATH ENDS IN ONE MACHINE-READABLE LINE, the last line it prints on stdout:
#
#     A4 VERDICT: <PASSED|NOT-CONFIRMED|FAILED> <one-line reason>
#
# scripts/promote-latest.mjs reads that line, never "the last line", because the paths above it
# print checker findings and multi-line prose in varying order. An EXIT trap prints a NOT-CONFIRMED
# verdict for any path that stops without reaching one, so the line is always there.
#
# WHY THIS IS A SCRIPT AND NOT AN INLINE `run:` BLOCK. It was inline, and it shipped two defects
# that inspection caught only because someone went looking: it named a version-specific page it had
# never read, and it would have gone RED ON A CORRECT RELEASE during ordinary propagation lag.
# Neither was catchable by any test, because the step only ever executed inside a real publish --
# "invisible until the moment it matters most". As a script it has test/readme-readback.test.ts
# behind it, which drives every branch against a stubbed `npm`.
#
# Contract: run from a directory holding the release's package.json and README.md (promote-latest.mjs
# extracts both from the X tarball). Reads ./package.json and ./README.md, and `npm` from PATH, with
# whatever registry pins the caller's environment carries. Honours REGISTRY_WINDOW_SECONDS
# (default 1800; a whole number of seconds, refused up front otherwise).
#
# Exit 0 = PASSED, or NOT-CONFIRMED (nothing proven either way, and it says why: the previous
# release's README still served, an empty readme on a packument that does not list this version
# yet, or the checker could not read its input). Exit 1 = FAILED: an empty readme on a packument
# that already lists this version (OPAG-474), or a served page that matches no release we
# published, with propagation positively ruled out. Exit 2 = NOT-CONFIRMED, refused before reading:
# REGISTRY_WINDOW_SECONDS is not a whole number of seconds (LCLI-626 N1). The verdict line says which.

: "${REGISTRY_WINDOW_SECONDS:=1800}"

VERDICT_SENT=0
# The one machine-readable line (see the header), then the exit. Every path below ends here.
finish() {
  VERDICT_SENT=1
  printf 'A4 VERDICT: %s %s\n' "$1" "$3"
  exit "$2"
}
# A path that stops without a verdict (a failed node, a signal) still ends in one, and keeps its
# own exit status: an EXIT trap that does not call `exit` leaves the status alone.
# $? is captured FIRST: the `[` test would otherwise replace it with its own 0.
on_exit() {
  local rc=$?
  if [ "$VERDICT_SENT" -eq 0 ]; then
    printf 'A4 VERDICT: NOT-CONFIRMED the read-back stopped (exit %s) before reaching a verdict; nothing was verified\n' "$rc"
  fi
}
trap on_exit EXIT
# bash 3.2 runs the EXIT trap on an untrapped signal but reports its status as 0 there, so a signal
# exits explicitly, with the conventional 128+N, and the trap above reports that.
trap 'exit 130' INT
trap 'exit 143' TERM

# The window must be a whole number of seconds, checked HERE, before anything is read (LCLI-626 N1).
# Unchecked, a non-digit value reaches $(( )) below as a variable NAME, and under bash 3.2 -- macOS's
# /bin/bash, where the release operator runs this -- `set -u` tripping inside $(( )) EXITS 0: the
# trap above then reported "stopped (exit 0)" on a read-back that never read anything. Leading zeros
# are refused too (bash reads 08 as bad octal), and so is anything past nine digits (~31 years),
# which would overflow the deadline instead of meaning a longer wait. Exit 2: a usage refusal, not a
# finding about the registry, and promote-latest.mjs classifies it by the NOT-CONFIRMED line.
window_re='^(0|[1-9][0-9]{0,8})$'
if ! [[ $REGISTRY_WINDOW_SECONDS =~ $window_re ]]; then
  echo "::error::REGISTRY_WINDOW_SECONDS must be a whole number of seconds (0 to 999999999, no leading zero); got '${REGISTRY_WINDOW_SECONDS}'. Nothing was read."
  finish NOT-CONFIRMED 2 "REGISTRY_WINDOW_SECONDS='${REGISTRY_WINDOW_SECONDS}' is not a whole number of seconds; the read-back refused to start and nothing was read"
fi

# Resolve the checker relative to THIS script, not the cwd: the cwd is the release being read back
# (it owns ./package.json and ./README.md), which in a test is a fixture tree that has no scripts/.
CHECKER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/shipped-readme-version.mjs"

set -u
name="$(node -p "require('./package.json').name")"
version="$(node -p "require('./package.json').version")"

echo "A4 subject: package '${name}', this release '${version}'."
echo "A4 reads npm's PACKAGE-LEVEL 'readme' field, which is not per-version; the honest"
echo "claim is 'the package readme for ${name}, which should now be ${version}'s'."

workdir="$(mktemp -d)"
cp package.json "$workdir/package.json"

verdict="lagging"
served=""
check_rc=0
deadline=$(( $(date +%s) + REGISTRY_WINDOW_SECONDS ))
delay=15
attempt=0

while :; do
  attempt=$(( attempt + 1 ))
  served="$(npm view "$name" readme 2>/dev/null || true)"

  if [ -z "$served" ]; then
    echo "attempt ${attempt}: the registry served no readme field yet."
  else
    printf '%s\n' "$served" > "$workdir/README.md"

    # Strongest possible pass: the registry's copy IS the copy we packed.
    if cmp -s "$workdir/README.md" README.md; then
      verdict="byte-equal"
      break
    fi

    # Weaker but still sufficient: it satisfies every assertion against this release.
    node "$CHECKER" --check --dir "$workdir" && check_rc=0 || check_rc=$?
    if [ "$check_rc" -eq 0 ]; then
      verdict="assertions-hold"
      break
    fi
    if [ "$check_rc" -eq 2 ]; then
      echo "attempt ${attempt}: the checker could not READ its input (exit 2)."
    else
      echo "attempt ${attempt}: the served readme does not satisfy ${version}'s assertions yet."
    fi
  fi

  now=$(date +%s)
  if [ "$now" -ge "$deadline" ]; then break; fi
  nap="$delay"
  if [ $(( now + nap )) -gt "$deadline" ]; then nap=$(( deadline - now )); fi
  echo "  re-reading in ${nap}s; $(( deadline - now ))s of the ${REGISTRY_WINDOW_SECONDS}s window left"
  sleep "$nap"
  if [ "$delay" -lt 60 ]; then
    delay=$(( delay * 2 ))
    if [ "$delay" -gt 60 ]; then delay=60; fi
  fi
done

case "$verdict" in
  byte-equal)
    echo "A4 OK: the readme npm serves for '${name}' is BYTE-EQUAL to the README.md this release packed, read $(date -u +%FT%TZ) after ${attempt} attempt(s). Subject recorded: package '${name}', release '${version}'."
    finish PASSED 0 "the package readme for ${name} is byte-equal to ${version}'s packed README.md (${attempt} read(s))"
    ;;
  assertions-hold)
    echo "A4 OK: the readme npm serves for '${name}' is not byte-equal to what we packed, but it satisfies every assertion against ${version}'s own package.json, read $(date -u +%FT%TZ) after ${attempt} attempt(s). Subject recorded: package '${name}', release '${version}'."
    finish PASSED 0 "the package readme for ${name} satisfies every assertion against ${version} (${attempt} read(s); not byte-equal)"
    ;;
esac

# The window is exhausted. Decide WHICH hypothesis the bytes support rather than
# assuming the alarming one.
if [ -z "$served" ]; then
  # Empty alone proves nothing (see the header): settle it with ONE packument read of both fields.
  # npm 12 answers `view <name> readme versions --json` as [{readme, versions}]; older npm, the object.
  # A readme on this read is written to $workdir/README.md BEFORE 'late' is printed, normalised as
  # the in-window read's is: `$(npm view ...)` strips every trailing newline and printf adds one back.
  # A write that fails throws, prints nothing, and lands in the unreadable arm below.
  listing="$(npm view "$name" readme versions --json 2>/dev/null | node -e "
    let s = '';
    process.stdin.on('data', d => s += d).on('end', () => {
      let doc = null;
      try { doc = JSON.parse(s); } catch {}
      if (Array.isArray(doc)) doc = doc.length === 1 ? doc[0] : null;
      if (!doc || typeof doc !== 'object') { console.log('unreadable'); return; }
      const versions = Array.isArray(doc.versions) ? doc.versions : typeof doc.versions === 'string' ? [doc.versions] : null;
      if (!versions) { console.log('unreadable'); return; }
      if (typeof doc.readme === 'string' && doc.readme.length > 0) {
        require('fs').writeFileSync(process.argv[2], doc.readme.replace(/\n+\$/, '') + '\n');
        console.log('late');
        return;
      }
      console.log(versions.includes(process.argv[1]) ? 'listed' : 'unlisted');
    });
  " "$version" "$workdir/README.md" || true)"
  case "$listing" in
    listed)
      echo "::error::A4 FAILED for package '${name}', release '${version}', read $(date -u +%FT%TZ) after ${attempt} attempt(s) over ${REGISTRY_WINDOW_SECONDS}s: the registry served NO readme field at all, and the same packument read already lists ${version} (OPAG-474)."
      echo "A packument that lists ${version} but carries no readme is not a replica catching up on ${version}: it has it, without the"
      echo "readme a release onto latest should have written. This page is IMMUTABLE: the fix is the next release, never an"
      echo "unpublish. Re-read it by hand to confirm: npm view ${name} readme | wc -c"
      finish FAILED 1 "no readme for ${name} after ${REGISTRY_WINDOW_SECONDS}s, and the packument already lists ${version} (OPAG-474)"
      ;;
    unlisted)
      echo "::warning::${name}: the registry served no readme field within ${REGISTRY_WINDOW_SECONDS}s, and the same packument read does not list ${version} yet. Lag is NOT ruled out: a replica that has not caught up on ${version} serves the packument as it was before, and ${name}'s had no readme (OPAG-474). Nothing was verified either way. Re-read it by hand later: npm view ${name} readme | wc -c"
      finish NOT-CONFIRMED 0 "lag not ruled out: ${version} not yet in the packument, which serves no readme for ${name} after ${REGISTRY_WINDOW_SECONDS}s"
      ;;
    late)
      # COMPARED, not waved through (LCLI-626 N4). The packument's `readme` is the very field
      # `npm view <name> readme` prints, read from the same pinned registry, so a copy that first
      # appears on this read is as much evidence as one read inside the window and gets the same
      # tests: byte-equal or every assertion against this release is PASSED; anything else falls
      # through to the same lag-or-defect discrimination below (previous release's README =
      # NOT-CONFIRMED, neither = FAILED). It used to be NOT-CONFIRMED unread, which asked an
      # operator to do by hand exactly the comparison the next ten lines make.
      echo "the registry served no readme field within ${REGISTRY_WINDOW_SECONDS}s, but the packument read made after the window carries one; comparing it."
      if cmp -s "$workdir/README.md" README.md; then
        echo "A4 OK: the readme npm serves for '${name}', first seen on the packument read after the ${REGISTRY_WINDOW_SECONDS}s window, is BYTE-EQUAL to the README.md this release packed, read $(date -u +%FT%TZ). Subject recorded: package '${name}', release '${version}'."
        finish PASSED 0 "the package readme for ${name} is byte-equal to ${version}'s packed README.md (first seen on the packument read after the ${REGISTRY_WINDOW_SECONDS}s window)"
      fi
      node "$CHECKER" --check --dir "$workdir" && check_rc=0 || check_rc=$?
      if [ "$check_rc" -eq 0 ]; then
        echo "A4 OK: the readme npm serves for '${name}', first seen on the packument read after the ${REGISTRY_WINDOW_SECONDS}s window, is not byte-equal to what we packed, but it satisfies every assertion against ${version}'s own package.json, read $(date -u +%FT%TZ). Subject recorded: package '${name}', release '${version}'."
        finish PASSED 0 "the package readme for ${name} satisfies every assertion against ${version} (first seen on the packument read after the ${REGISTRY_WINDOW_SECONDS}s window; not byte-equal)"
      fi
      ;;
    *)
      echo "::warning::${name}: the registry served no readme field within ${REGISTRY_WINDOW_SECONDS}s, and the packument could not be read to tell whether it lists ${version} yet, so lag is NOT ruled out. Nothing was verified either way. Re-read it by hand: npm view ${name} readme | wc -c"
      finish NOT-CONFIRMED 0 "no readme for ${name} after ${REGISTRY_WINDOW_SECONDS}s, and the packument could not be read to rule out lag"
      ;;
  esac
fi

if [ "$check_rc" -eq 2 ]; then
  echo "::warning::${name}: the checker could not read its input (exit 2), so A4 verified NOTHING. This is a tooling failure, not evidence about the published page. Re-run the check by hand against 'npm view ${name} readme'."
  finish NOT-CONFIRMED 0 "the checker could not read its input (exit 2); nothing was verified"
fi

# Is what the registry is serving simply the PREVIOUS release's README? If it satisfies
# that version's assertions, this is propagation lag wearing the costume of a defect.
prev="$(npm view "$name" versions --json 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    let all = [];
    try { all = JSON.parse(s); } catch {}
    if (!Array.isArray(all)) all = [all].filter(Boolean);
    // Plain X.Y.Z releases only (LCLI-616). Since LCLI-621 every release also leaves an X-rc.N on
    // the registry, sorted just below X, and an rc never set the package-level readme; taking it as
    // the previous release would check a lagging README against the wrong assertions.
    const others = all.filter(v => v !== process.argv[1] && /^[0-9]+[.][0-9]+[.][0-9]+\$/.test(v));
    console.log(others.length ? others[others.length - 1] : '');
  });
" "$version" || true)"

if [ -n "$prev" ]; then
  prevdir="$(mktemp -d)"
  cp "$workdir/README.md" "$prevdir/README.md"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = process.argv[1];
    fs.writeFileSync(process.argv[2] + '/package.json', JSON.stringify(pkg, null, 2) + '\n');
  " "$prev" "$prevdir"

  if node "$CHECKER" --check --dir "$prevdir" > /dev/null 2>&1; then
    echo "::warning::${name}: after ${REGISTRY_WINDOW_SECONDS}s the registry is still serving the README of the PREVIOUS release (${prev}), not ${version}'s. It satisfies ${prev}'s assertions exactly, which is what propagation lag looks like on an established package -- npm's readme field is package-level and updates when the publish finishes propagating (LCLI-460: 0.5.0 took ~25min). This is NOT a confirmed defect and NOT a reason to unpublish. Re-read 'npm view ${name} readme' later; if it still shows ${prev} once propagation is plainly done, THAT is the defect, and the fix is the next release."
    finish NOT-CONFIRMED 0 "${name} still serves the previous release ${prev}'s README after ${REGISTRY_WINDOW_SECONDS}s; lag not ruled out"
  fi
fi

echo "::error::A4 FAILED for package '${name}', release '${version}', read $(date -u +%FT%TZ) after ${attempt} attempt(s) over ${REGISTRY_WINDOW_SECONDS}s. The readme npm serves satisfies NEITHER ${version}'s assertions NOR ${prev:-the previous release}'s, so propagation lag has been ruled out -- this is not a replica catching up, it is a page that matches no release we published. The packed tarball passed the gate, so the divergence was introduced at or after publish. This page is IMMUTABLE: the fix is the next release, never an unpublish. Findings against ${version}:"
node "$CHECKER" --check --dir "$workdir" || true
finish FAILED 1 "the package readme for ${name} satisfies neither ${version}'s assertions nor ${prev:-the previous release}'s"

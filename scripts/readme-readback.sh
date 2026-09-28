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
# 0.4.6 ~35s, 0.5.0 ~25min). A lagging replica of an established package does not serve an EMPTY
# readme -- it serves the PREVIOUS release's README, which is byte-for-byte the thing A4 flags. So
# a served README that satisfies the previous release's assertions is a warning, not a failure.
# AN EMPTY README AFTER THE WHOLE WINDOW IS A FAILURE (LCLI-616, OPAG-474 AC3). This runs after a
# fresh publish onto `latest`, and that publish is what makes npm derive the field; still empty
# after the window is the OPAG-474 defect, not lag. It used to be a warning, from a time when this
# ran after a staging publish that could legitimately leave it empty.
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
# (default 1800).
#
# Exit 0 = confirmed, or a served README that is not this release's but is explained without a
# defect (the previous release's, during lag; or the checker could not read its input), and it
# says which. Exit 1 = no readme at all after the window (OPAG-474), or a served page that matches
# no release we published, with propagation positively ruled out.

: "${REGISTRY_WINDOW_SECONDS:=1800}"

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
    exit 0
    ;;
  assertions-hold)
    echo "A4 OK: the readme npm serves for '${name}' is not byte-equal to what we packed, but it satisfies every assertion against ${version}'s own package.json, read $(date -u +%FT%TZ) after ${attempt} attempt(s). Subject recorded: package '${name}', release '${version}'."
    exit 0
    ;;
esac

# The window is exhausted. Decide WHICH hypothesis the bytes support rather than
# assuming the alarming one.
if [ -z "$served" ]; then
  echo "::error::A4 FAILED for package '${name}', release '${version}', read $(date -u +%FT%TZ) after ${attempt} attempt(s) over ${REGISTRY_WINDOW_SECONDS}s: the registry served NO readme field at all (OPAG-474)."
  echo "This runs after a fresh release onto latest, which is what makes the registry derive the package-level readme."
  echo "A lagging replica of an established package serves the PREVIOUS readme, not an empty one, so an empty field"
  echo "after the whole window is the OPAG-474 defect, not propagation lag. This page is IMMUTABLE: the fix is the"
  echo "next release, never an unpublish. Re-read it by hand to confirm: npm view ${name} readme | wc -c"
  exit 1
fi

if [ "$check_rc" -eq 2 ]; then
  echo "::warning::${name}: the checker could not read its input (exit 2), so A4 verified NOTHING. This is a tooling failure, not evidence about the published page. Re-run the check by hand against 'npm view ${name} readme'."
  exit 0
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
    exit 0
  fi
fi

echo "::error::A4 FAILED for package '${name}', release '${version}', read $(date -u +%FT%TZ) after ${attempt} attempt(s) over ${REGISTRY_WINDOW_SECONDS}s. The readme npm serves satisfies NEITHER ${version}'s assertions NOR ${prev:-the previous release}'s, so propagation lag has been ruled out -- this is not a replica catching up, it is a page that matches no release we published. The packed tarball passed the gate, so the divergence was introduced at or after publish. This page is IMMUTABLE: the fix is the next release, never an unpublish. Findings against ${version}:"
node "$CHECKER" --check --dir "$workdir" || true
exit 1

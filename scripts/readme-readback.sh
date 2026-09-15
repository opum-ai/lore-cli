#!/usr/bin/env bash
# A4 of the shipped-README version contract (LCLI-510; opum-doc main@ba3055d).
#
# Reads the README npm actually serves for this package back off the registry and re-runs the
# shipped-README assertions over it, then reports WHAT IT READ -- not just a verdict.
#
# THIS IS A CONFIRMATION, NOT THE GATE. The gate is `shipped-readme-version.mjs --tarball`, which
# runs before any registry write. Published pages are immutable, so a read-back can only observe
# the defect, never prevent it.
#
# WHY THIS IS A SCRIPT AND NOT AN INLINE `run:` BLOCK. It was inline, and it shipped two defects
# that inspection caught only because someone went looking: it named a version-specific page it had
# never read, and it would have gone RED ON A CORRECT RELEASE during ordinary propagation lag.
# Neither was catchable by any test, because the step only ever executed inside a real publish --
# "invisible until the moment it matters most". As a script it has test/readme-readback.test.ts
# behind it, which drives every branch against a stubbed `npm`.
#
# Contract: run from the repository root of the release being published. Reads ./package.json and
# ./README.md, and `npm` from PATH. Honours REGISTRY_WINDOW_SECONDS (default 1800).
#
# Exit 0 = confirmed, or could not be determined (lag) and said so. Exit 1 = the served page
# matches no release we published, with propagation positively ruled out.

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
  echo "::warning::${name}: the registry served no readme field within ${REGISTRY_WINDOW_SECONDS}s. This is NOT proof of a defect -- the read API lags publication (LCLI-460). Nothing was verified either way; re-read ${name}'s readme by hand before treating it as a failure."
  exit 0
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
    const others = all.filter(v => v !== process.argv[1]);
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

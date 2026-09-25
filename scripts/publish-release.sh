#!/usr/bin/env bash
#
# scripts/publish-release.sh — publish a qualified Lore CLI release to npm.
#
# Auth model: a GRANULAR ACCESS TOKEN, WHEN ONE IS ACTUALLY INSTALLED — it bypasses npm's
# 2FA-on-write, so there is no OTP prompt, and that is the whole point. The qualifier is in
# this sentence deliberately, because this is the line that gets quoted and on 0.6.2 it was
# quoted while the publish was in fact falling through to ~/.npmrc and hitting the very OTP
# wall the sentence promises to avoid. `npm login` does NOT achieve this: a web login is
# still subject to "require 2FA for writes", which is exactly the EOTP wall this replaces.
#
# There is no longer an "or classic Automation token" option, though this header offered one
# until 2026-09-14. docs/runbooks/release-publishing.md ("Token types and what still works")
# records that npm disabled
# classic token creation in November 2025 and revoked every existing one on 9 December 2025.
# Granular tokens are 90-day capped and website-created, so this path needs renewing every
# quarter — a known liability rather than a surprise (LCLI-489).
#
# Reads the token from the macOS Keychain by default, so it is never in a file or in shell
# history. Falls back to NPM_TOKEN, then to whatever is already in ~/.npmrc.
#
# CHECK WHICH OF THOSE THREE YOU ARE ACTUALLY ON before trusting the "no OTP prompt" claim
# above. It is not decoration: as measured on 2026-09-14 the Keychain entry did NOT exist and
# NPM_TOKEN was UNSET, so the publish authenticated from ~/.npmrc — and the token there was
# valid (`npm whoami` returned a real identity, so not expired and not revoked) but
# WEB-LOGIN SHAPED, which is subject to require-2FA-on-write. That, and not a dead credential
# and not npm's post-2025 token regime as such, is where the human-at-a-TTY constraint came
# from. The script now reports which of the three paths it is on, so this is observable at
# publish time instead of being reconstructed afterwards (LCLI-488, LCLI-489 AC#5).
#
# The token's SHAPE is checked before any publish is attempted and this is worth more than it
# looks. On 0.6.2, attempts 4 and 5 failed with `PUT 404`, which reads exactly like a
# permissions problem and sent the operator to npmjs.com to change settings that were fine.
# A shape check returned `length=24 prefix=OTHER` and settled it in one second: the Keychain
# held something that was not an npm token at all (granular = npm_ + 36 = 40 chars). Length,
# prefix and a whitespace flag reveal nothing secret.
#
# ONE COMMAND. This script PERFORMS its prerequisites rather than diagnosing them and
# handing you a command to paste back (LCLI-489). It downloads the npm-packages artifact
# when the directory is absent or incomplete, builds the digest manifest, and only then
# publishes. During the 0.6.2 release the
# operator was stopped three separate times by steps this script had already worked out.
#
# Safety properties, in order of how much they matter:
#   - Verifies every tarball's sha256 BEFORE publishing anything, six of them against a
#     digest CI recorded independently. Read "DIGEST PROVENANCE" below for what that does
#     and does not prove -- the distinction is the whole point and it is easy to overstate.
#     Publishing is effectively irreversible; npm unpublish is heavily restricted.
#   - Publishes the six PLATFORM packages first, then GATES the root launcher behind a
#     registry-READ visibility poll over those six plus a fixed propagation cushion, so the
#     launcher is not published until every platform package is CONFIRMED VISIBLE to a read
#     -- not merely published in the sense that its PUT returned. Publish ORDER alone used to
#     be described as the guarantee here and it is FALSE: LCLI-502 measured 0.7.0 publishing
#     platform packages first and the root last, in that order, while the registry's read API
#     resolved the root 121 SECONDS before the last platform package -- because the platform
#     packages are optionalDependencies, an install in that window SUCCEEDED WITH THE BINARY
#     SILENTLY MISSING rather than failing loudly. Ordering the WRITES cannot produce the
#     guarantee; only gating on READS can. See "REGISTRY GATE BEFORE THE ROOT LAUNCHER" below.
#   - HARD-REFUSES without a qualification receipt from opum-cli-e2e that names this version,
#     this run id and every tarball's sha256, with verdict QUALIFIED or a complete override
#     written into the receipt itself (LCLI-578). No flag or env var this script reads bypasses
#     it, and the receipt's host (GH_HOST is overridden), repository and ref are pinned.
#   - Re-hashes each tarball against that receipt IMMEDIATELY before its own `npm publish`
#     (and before a --dry-run's "would npm publish" line), and refuses if the bytes changed
#     after the gate. The root launcher is published up to ~30 minutes after the gate ran,
#     behind the registry wait below (LCLI-586).
#   - Resumable: a version already on the registry is skipped, not re-attempted. This is
#     what made five failed 0.6.2 attempts cost nothing.
#   - --dry-run does everything except the two mutating calls.
#   - Never echoes the token. The one thing it reports about a credential is its SHAPE.
#
# === DIGEST PROVENANCE -- what the check below actually proves ===
#
# The SIX PLATFORM tarballs are verified against `package.platformTarballSha256` in their
# ladybug-package-qualification reports, which release.yml's `package` job ("Assemble the
# exact matching-host-qualified platform tarballs") asserts in CI against the bytes it built.
# Those reports are fetched from the Release run SEPARATELY from the npm-packages artifact
# being verified. That is a genuinely independent check: two artifacts from the same run
# would have to agree for a substitution to pass.
#
# The ROOT LAUNCHER has no digest from lore-cli's own CI: it is `npm pack`'d inside that same
# job ("npm pack every package") and this repository records its sha256 nowhere. What binds it
# instead is the QUALIFICATION RECEIPT (LCLI-578, below). opum-cli-e2e's receipt records a
# sha256 for all seven tarballs, root included, and this script refuses unless every one
# matches the file it will publish. It then re-hashes each tarball IMMEDIATELY before that
# tarball's own `npm publish` and refuses if the bytes changed after the gate (LCLI-586). So the
# root launcher, published up to ~30 minutes after the gate, is re-checked against the receipt
# just before its own publish, leaving only the milliseconds between that re-hash and npm's
# own read of the file unchecked.
# Be exact about what the receipt's root digest is. opum-cli-e2e re-hashes it at write time
# from THIS SAME Release run's npm-packages artifact (its receipts/README.md: "re-hashed at
# write time from the bound artifacts"). So it is recorded by ANOTHER REPOSITORY, from bytes
# that repository qualified, but it is NOT produced by a second, independent build: it binds
# "the root launcher we publish is the one opum-cli-e2e qualified", not "two builds agree".
# The ladybug reports' own `package.rootTarballSha256` is not used here, deliberately: each
# qualification host packs the root itself, and the darwin runners' zlib compresses the same
# tar stream to different bytes, so that field disagrees by host (LCLI-568).
#
# SHA256SUMS.txt is a LOCAL seal. CI does not emit it -- this script generates it from the
# same tarballs it then verifies, so on its own it proves only that the download has not
# changed since sealing. It is kept for that narrow purpose and is NOT the independent check.
# Do not round any of this up to "all seven independently verified": six are checked against
# a separate artifact of the build, and all seven against a receipt whose root digest comes
# from the same build's artifact (LCLI-489 AC#4, option (a)).
#
# Encodes runbook section 3 step 5's sequence so it cannot be misremembered under pressure.
# See docs/runbooks/release-publishing.md.
#
# `usage()` prints ONLY between the markers below. Everything else in this header is
# reference material for whoever is CHANGING this script, and printing all of it as --help
# buries the two lines someone actually needs.
# USAGE-START
#   scripts/publish-release.sh <version> <release-run-id> [--dry-run|--verify-only]
#
#   scripts/publish-release.sh <version> <run-id> --dry-run   # rehearse; touches nothing
#   scripts/publish-release.sh <version> <run-id>             # publish + move latest dist-tags
#   scripts/publish-release.sh <version> <run-id> --verify-only   # registry state only
#
# Refuses to publish without receipts/lore/<version>.json on opum-ai/opum-cli-e2e main (read with
# your gh login) matching this version, run id and all seven tarball sha256s, with verdict
# QUALIFIED or a complete override {by, reason, task, adr} in that file. No flag or env var this
# script reads bypasses it; the host is pinned to github.com even if GH_HOST is set. --dry-run
# reports the receipt verdict, and stops non-zero if it would refuse.
#
# --verify-only reads the REGISTRY and nothing else: no artifacts, no gh, no network beyond
# npm. It is what the propagation-timeout message tells you to run, so it must stay reachable
# when the artifacts are gone or expired.
#
# Env: ARTIFACTS   where the seven .tgz live. Defaults to release-<version>/ beside this
#                  script, resolved ABSOLUTELY so the caller's cwd cannot change what it
#                  means. Populated automatically when missing or short of seven.
#      REPO_SLUG   owner/name, if the origin remote cannot be parsed.
# USAGE-END

set -uo pipefail

# EVERY PATH IS ABSOLUTE FROM HERE ON, and this is a mechanism rather than a convention
# (LCLI-489 AC#2). The script never cd's; where a tool insists on a working directory it gets
# one in a SUBSHELL so the parent's cwd is untouched. The defect this prevents: on 0.6.2 a
# handed-over `cd scripts/release-0.6.2 && ...` left the operator's shell inside the artifacts
# directory, so a follow-up `ls scripts/release-0.6.2/*.tgz` resolved the path INSIDE ITSELF,
# reported 0 tarballs, and looked exactly like a failed download. It cost a full round trip.
# `pwd -P` resolves symlinks so the same directory has one spelling. Covered by a test.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

usage() { awk '/^# USAGE-START/ { on=1; next } /^# USAGE-END/ { exit } on { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; }

VERSION="${1:-}"
RUN_ID="${2:-}"
KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-npm-opum-ai-publish}"
case "$VERSION" in
  ""|-*) usage; exit 2 ;;
esac
[ -n "$RUN_ID" ] || { echo "ERROR: a Release run id is required (it is how a lost artifact directory is recovered)" >&2; exit 2; }
# Tarball names are built from $VERSION, so a tag-shaped argument ("v0.6.2", an easy paste from
# `git tag`) sails through the download and every digest step and only dies much later on a
# missing file. Reject the shape here instead.
case "$VERSION" in
  v[0-9]*) echo "ERROR: pass the VERSION, not the tag: '${VERSION#v}', not '$VERSION'" >&2; exit 2 ;;
  [0-9]*)  ;;
  *)       echo "ERROR: '$VERSION' is not a version number" >&2; exit 2 ;;
esac
case "$RUN_ID" in *[!0-9]*) echo "ERROR: run id must be numeric, got '$RUN_ID'" >&2; exit 2 ;; esac
shift 2

# Resolved absolutely even when the caller passes a relative ARTIFACTS, so that the value
# means the same thing no matter where the script was invoked from. The directory may not
# exist yet -- it is created and populated below -- so this cannot use `cd`.
ARTIFACTS="${ARTIFACTS:-$SCRIPT_DIR/release-${VERSION}}"
case "$ARTIFACTS" in
  /*) ;;
  *)  ARTIFACTS="$PWD/$ARTIFACTS" ;;
esac

# Passed as `-R` to every gh call. gh's own repo inference is deliberately NOT relied on,
# because it reads the CURRENT DIRECTORY and that is the bug this section exists to kill.
REPO_SLUG="${REPO_SLUG:-$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null \
  | sed -e 's#^ssh://git@github.com/##' -e 's#^git@github.com:##' \
        -e 's#^https://github.com/##' -e 's#\.git$##' -e 's#/$##')}"
[ -n "$REPO_SLUG" ] || REPO_SLUG="opum-ai/lore-cli"

# Platform packages FIRST, root LAST. Order is load-bearing, not cosmetic.
PLATFORM_PKGS=(
  "@opum-ai/lore-darwin-arm64:opum-ai-lore-darwin-arm64-${VERSION}.tgz"
  "@opum-ai/lore-darwin-x64:opum-ai-lore-darwin-x64-${VERSION}.tgz"
  "@opum-ai/lore-linux-arm64:opum-ai-lore-linux-arm64-${VERSION}.tgz"
  "@opum-ai/lore-linux-x64:opum-ai-lore-linux-x64-${VERSION}.tgz"
  "@opum-ai/lore-win32-arm64:opum-ai-lore-win32-arm64-${VERSION}.tgz"
  "@opum-ai/lore-win32-x64:opum-ai-lore-win32-x64-${VERSION}.tgz"
)
ROOT_PKG="@opum-ai/lore:opum-ai-lore-${VERSION}.tgz"

DRY_RUN=0
VERIFY_ONLY=0
PRINT_CHECKLIST=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    # Prints the closing checklist and exits, touching nothing. It exists so the checklist is
    # TESTABLE: it is operator-facing instruction handed over seconds before irreversible work,
    # and its step 1a shipped a command that matched nothing precisely because --dry-run exits
    # long before this text is ever produced. An assertion nobody can run is not an assertion.
    --print-checklist) PRINT_CHECKLIST=1 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

print_closing_checklist() {
  hr
  # Deliberately an UNQUOTED heredoc so $VERSION interpolates. The previous version of
  # this block was quoted ('DONE') and therefore hardcoded — it told every release, for
  # months, to cut a GitHub Release for v0.3.5 and to message tmux panes that no longer
  # exist. A closing message that names a fixed version is guaranteed to go stale the
  # moment that version ships (LCLI-483). Keep perishable references OUT of here:
  # no task ids, no session addresses, no version literals.
  cat <<DONE
  PUBLISHED $VERSION. Remaining, in order:

    1. Update the release-truth doc so it states $VERSION is released. REPLACE the
       current-state claim, do not merely add alongside it:
           docs/reference/lore-cli-release-truth.md    (Current state section)

       README.md IS NO LONGER ON THIS LIST, and that is the fix for LCLI-510 rather than
       an omission. Its status block and npm line are GENERATED from package.json before
       the tag, by scripts/shipped-readme-version.mjs, and the release refuses to publish
       a tarball whose README disagrees. Bumping it here is what made every published
       tarball's npm page advertise the PREVIOUS version: a sentence saying "$VERSION is
       released" cannot honestly be written before it is, so the edit always landed after
       the tag, and the tag always carried the older file. Do not restore the step.

    1a. Read the shipped README back off the registry and record WHAT YOU READ:
           d=\$(mktemp -d)
           npm view ${ROOT_PKG%%:*} readme > "\$d/README.md"
           cp package.json "\$d/package.json"
           node scripts/shipped-readme-version.mjs --check --dir "\$d"

        RE-RUN THE ASSERTIONS; DO NOT GREP FOR A SENTENCE. An earlier revision of this
        step printed:
           npm view ... readme | grep -n 'Status: .* released'
        which matches NOTHING against the README this tool generates -- the region markers
        split the literal, so the file reads \`**Status:<!--...--> $VERSION released.**\` and
        there is no space after \`Status:\`. An operator running it verbatim gets empty output
        and exit 1 seconds after the irreversible step, against an instruction telling them
        the output must name the version. A check that re-runs the generator cannot drift
        from it, because it IS the generator.

        WHAT YOU ARE READING is npm's package-level \`readme\` field -- NOT a per-version
        page. Measured 2026-09-15: \`npm view @opum-ai/lore@0.7.0 readme\`,
        \`...@0.6.2 readme\` and \`...@0.6.1 readme\` all return the SAME 14446 bytes. The
        version in the spec is inert for this field; npm serves whatever the most recent
        publish carried. So record "the package-level readme for @opum-ai/lore, read at
        <time>, which should now be $VERSION's" -- naming a version-specific page you did
        not read is exactly the claim shape that produced this whole class of defect.

        This is a confirmation, not a gate -- the page is already immutable -- so a
        disagreement here is a defect to fix in the NEXT release, never a reason to
        unpublish. And because the field is package-level and the read API lags (LCLI-460:
        0.5.0 took ~25 minutes), a disagreement within that window is most likely the
        registry still serving the PREVIOUS release's README. Re-read before concluding.

    2. Cut a non-draft, non-prerelease GitHub Release for v$VERSION, using
       CHANGELOG.md's [$VERSION] section as its body:
           gh release create v$VERSION --title "Lore CLI $VERSION" --notes-file <notes>

    3. Tell the downstream sessions. They deliberately do not describe a version as
       published until told. Resolve each one with ListAgents and match on repository —
       session names change on every restart, so never reuse a previously seen address:
           opum-cli-e2e       re-run the qualification matrix against the published release
           quest-cli          lore $VERSION is live
           opum-marketplace   the resolved skills/ tree SHA for this tag, or its
                              federated-content check goes red:
                                  git ls-tree v$VERSION skills

    4. Record HOW this shipped. If it was published by this script rather than by the
       release workflow's OIDC job, say so in release-truth and state that the version
       carries NO provenance attestation — a manual publish cannot produce one. Do not
       let a reader infer provenance from an earlier version having it.
DONE
}

hr()  { printf '%s\n' "────────────────────────────────────────────────────────────"; }

[ "$PRINT_CHECKLIST" -eq 1 ] && { print_closing_checklist; exit 0; }

# ── Artifacts ───────────────────────────────────────────────────────────────
# This whole section used to be four `die`s that printed the command the operator should run
# next. Each one was deterministic and needed no decision, so each one is now performed.

EXPECTED_TARBALLS=7

tarball_count() { ls -1 "$ARTIFACTS"/*.tgz 2>/dev/null | wc -l | tr -d ' '; }
list_tarballs() { ls -1 "$ARTIFACTS"/*.tgz 2>/dev/null | sed "s#^#    #"; }

need_gh() {
  command -v gh >/dev/null 2>&1 || die "gh is required to fetch release artifacts and is not on PATH.
Install it, or populate $ARTIFACTS by hand with the seven .tgz files from run $RUN_ID."
}

# NOTHING HERE RESOLVES A RUN ATTEMPT ANY MORE (LCLI-487). Artifact names used to embed
# `run_attempt`, so this script had to ask the API which attempt to look for -- and guessing
# wrong found nothing while the artifacts plainly existed. release.yml now names artifacts by
# run_id alone and sets `overwrite: true`, so a run resolves to exactly one consistent set and
# the attempt is not a variable in this at all.

ensure_artifacts() {
  local have
  mkdir -p "$ARTIFACTS" || die "cannot create the artifact directory: $ARTIFACTS"
  have="$(tarball_count)"
  if [ "$have" -eq "$EXPECTED_TARBALLS" ]; then
    say "artifacts already present: $have tarballs in $ARTIFACTS"
    return 0
  fi
  if [ "$have" -gt "$EXPECTED_TARBALLS" ]; then
    # Re-downloading cannot remove anything, so this one is not self-healing: it needs a
    # human to say which tarballs are the release. Most likely two versions in one directory.
    die "$ARTIFACTS holds $have tarballs, MORE than the $EXPECTED_TARBALLS this release has.
Re-downloading would not remove the extras. Inspect and clear it by hand:
$(list_tarballs)"
  fi
  if [ "$have" -eq 0 ]; then
    say "artifact directory is empty -- downloading npm-packages from run $RUN_ID"
  else
    say "artifact directory is INCOMPLETE: $have of $EXPECTED_TARBALLS tarballs. Present:"
    list_tarballs
    say "downloading npm-packages over it rather than publishing a partial family"
  fi
  need_gh
  gh run download -R "$REPO_SLUG" "$RUN_ID" -n npm-packages -D "$ARTIFACTS" \
    || die "failed to download the npm-packages artifact from run $RUN_ID.
Check that the run exists, succeeded, and still has artifacts (they expire)."
  have="$(tarball_count)"
  [ "$have" -eq "$EXPECTED_TARBALLS" ] || die "after downloading npm-packages from run $RUN_ID,
$ARTIFACTS holds $have tarball(s), not $EXPECTED_TARBALLS. Refusing to publish a partial family.
What is actually there:
$(list_tarballs)"
  say "downloaded $have tarballs into $ARTIFACTS"
}

# Six of seven, verified against a digest CI recorded independently of these bytes. See the
# DIGEST PROVENANCE block in the header before changing anything here, and in particular
# before describing the result as covering all seven.
verify_platform_digests() {
  local dir entry pkg name tarball report recorded actual commit ref="" verified=0
  need_gh
  dir="$(mktemp -d)"
  say "fetching the per-platform qualification reports for run $RUN_ID"
  # The trailing `*` matches BOTH artifact-name shapes deliberately. Since LCLI-487 the names
  # are `...-<run_id>`; runs qualified BEFORE that change carry `...-<run_id>-<attempt>`, and
  # a release can legitimately be published from an older run whose artifacts are still inside
  # their 90-day retention. Matching both costs one character and avoids a script that cannot
  # read its own project's recent history.
  # gh's STDERR IS CAPTURED, NOT DISCARDED, and the read is retried ONCE (LCLI-572). On the 0.9.1
  # publish this download failed with its stderr sent to /dev/null, so the die could not say why;
  # the identical command by hand moments later succeeded. A redirected stderr cannot report its
  # own breakage. One bounded retry is safe because this is a READ before any write, and the
  # directory is emptied between attempts so a partial first attempt cannot mix into the second.
  local gh_err attempt downloaded=0
  gh_err="$(mktemp)"
  for attempt in 1 2; do
    if gh run download -R "$REPO_SLUG" "$RUN_ID" -D "$dir" \
          -p "ladybug-package-qualification-*-${RUN_ID}*" >/dev/null 2>"$gh_err"; then
      downloaded=1; break
    fi
    [ "$attempt" -eq 2 ] && break
    say "  qualification-report download failed (attempt 1 of 2). gh said:"
    sed 's#^#      #' "$gh_err"
    say "  retrying once in ${REPORT_RETRY_DELAY_SECONDS:-5}s"
    rm -rf "$dir"; mkdir -p "$dir"
    sleep "${REPORT_RETRY_DELAY_SECONDS:-5}"
  done
  if [ "$downloaded" -ne 1 ]; then
    rm -rf "$dir"
    die "could not download the qualification reports for run $RUN_ID (2 attempts). gh said:
$(sed 's#^#    #' "$gh_err"; rm -f "$gh_err")
These carry the only independently recorded digests for the platform tarballs; without them
the digest check would be a local self-seal only, which is not what this script claims."
  fi
  rm -f "$gh_err"
  for entry in "${PLATFORM_PKGS[@]}"; do
    pkg="${entry%%:*}"; tarball="${entry#*:}"
    name="${pkg#@opum-ai/lore-}"
    # Located by search rather than by constructing the directory name, so this works whether
    # the artifact carries an attempt suffix or not. `find` rather than a bare glob because an
    # unmatched glob under `set -u` expands to itself and would produce a confusing error
    # naming a literal `*`.
    # AMBIGUITY IS REFUSED, NOT RESOLVED. `head -1` here would return whichever match readdir
    # yields first -- not sorted, not attempt-aware, and free to differ between machines. That
    # is reachable on a run qualified BEFORE LCLI-487 that had more than one attempt: the
    # widened `...-${RUN_ID}*` pattern matches every attempt's directory, so two files with
    # this same basename land side by side. The tarballs always come from the NEWEST attempt
    # (npm-packages is run-scoped), so silently picking the older report would compare recorded
    # digests that do not describe these bytes -- a loud failure, but one whose remedy text
    # would send the operator in a circle. Name both and stop instead.
    matches="$(find "$dir" -type f -name "ladybug-package-qualification-${name}.json" 2>/dev/null | sort)"
    match_count="$(printf '%s' "$matches" | grep -c . || true)"
    [ "$match_count" -ge 1 ] || { rm -rf "$dir"; die "qualification report missing for $name.
Looked for ladybug-package-qualification-${name}.json anywhere under the artifacts downloaded
from run $RUN_ID. That run did not produce it, or the artifact is past its 90-day retention."; }
    if [ "$match_count" -gt 1 ]; then
      say "  AMBIGUOUS: $match_count qualification reports for $name:"
      printf '%s\n' "$matches" | sed 's#^#      #'
      rm -rf "$dir"
      die "more than one qualification report for $name in run $RUN_ID.
That happens on a run qualified before 2026-09-14 that had MORE THAN ONE ATTEMPT: artifact
names still embedded the attempt then, so every attempt's report matches. Refusing to guess
which one describes the tarballs being published -- picking wrong would compare digests from
a different build. Publish from a run with a single attempt, or download that run's artifacts
by their exact attempt-suffixed name into \$ARTIFACTS by hand and re-run."
    fi
    report="$matches"
    [ -f "$report" ] || { rm -rf "$dir"; die "resolved report is not a file: $report"; }
    say "  report for $name: $(basename "$(dirname "$report")")"
    recorded="$(node -e 'const r=require(process.argv[1]); process.stdout.write(String((r.package||{}).platformTarballSha256||""))' "$report")"
    commit="$(node -e 'const r=require(process.argv[1]); process.stdout.write(String((r.repository||{}).commit||""))' "$report")"
    [ -n "$recorded" ] || { rm -rf "$dir"; die "report for $name records no package.platformTarballSha256"; }
    # An ABSENT commit must fail, not seed the comparison with "". Empty was doing double duty
    # as both "not seeded yet" and "field missing", so six reports all missing it agreed
    # vacuously and the run printed "all on commit unknown" and carried on.
    [ -n "$commit" ] || { rm -rf "$dir"; die "report for $name records no repository.commit --
refusing to treat an absent field as agreement. release.yml asserts this field in CI, so a
report without it did not come from a Release run."; }
    [ -f "$ARTIFACTS/$tarball" ] || { rm -rf "$dir"; die "tarball missing: $ARTIFACTS/$tarball"; }
    actual="sha256:$(shasum -a 256 "$ARTIFACTS/$tarball" | awk '{print $1}')"
    if [ "$actual" != "$recorded" ]; then
      rm -rf "$dir"
      die "DIGEST MISMATCH for $pkg -- these are NOT the qualified bytes. Refusing to publish.
  recorded by CI : $recorded
  computed here  : $actual
  reports from   : run $RUN_ID

These bytes are not what the report above describes.

For a run qualified on or after 2026-09-14, discard $ARTIFACTS entirely and re-download from
run $RUN_ID: names no longer embed the attempt and a re-running job overwrites its own
artifact, so one run is one consistent set and a genuine byte mismatch is the only cause.

For an OLDER run, check the attempt first -- the report named above may come from a different
attempt than the tarballs, which always come from the newest. Re-downloading will not fix that
and you will loop. Fetch that run's artifacts for the attempt you want by their exact
attempt-suffixed name into \$ARTIFACTS by hand, and re-run."
    fi
    # Every report must name the SAME commit, or the six tarballs did not come from one
    # source tree and "qualified" means nothing across the set.
    if [ -z "$ref" ]; then ref="$commit"; elif [ "$commit" != "$ref" ]; then
      rm -rf "$dir"
      die "qualification reports disagree about the source commit: $ref vs $commit ($name).
These tarballs were not all built from one tree."
    fi
    say "  verified $pkg against the CI-recorded digest"
    verified=$(( verified + 1 ))
  done
  rm -rf "$dir"
  [ "$verified" -eq 6 ] || die "expected 6 platform tarballs verified, got $verified"
  [ -n "$ref" ] || die "no qualification report carried a repository.commit"
  say "6/6 platform tarballs match the digests CI recorded, all on commit $ref"
}

# The root launcher and the manifest. Both are LOCAL SEALS and the wording here says so --
# the header explains why, and the whole point of LCLI-489 AC#4 is that automating this must
# not quietly upgrade the claim.
# A manifest is only worth checking if it covers every tarball present. `shasum -c` checks
# ONLY the lines it is given and says nothing about a file that is absent from the list, so a
# leftover manifest covering 1 of 7 EXITS 0 while verifying almost nothing -- and the one
# tarball most likely to go unchecked that way is the root launcher, which is the only tarball
# the local seal exists for in the first place. The directory is per-version and reused across
# attempts, and ensure_artifacts re-downloads OVER a partial directory without removing a
# manifest sealed against that partial state, so this is reachable with no attacker at all.
manifest_covers_everything() {
  local f listed
  [ -f "$ARTIFACTS/SHA256SUMS.txt" ] || return 1
  listed="$(awk '{ n = $NF; sub(/^\.\//, "", n); print n }' "$ARTIFACTS/SHA256SUMS.txt")"
  for f in "$ARTIFACTS"/*.tgz; do
    printf '%s\n' "$listed" | grep -qxF "$(basename "$f")" || return 1
  done
  return 0
}

seal_locally() {
  local root_tarball="${ROOT_PKG#*:}"
  [ -f "$ARTIFACTS/$root_tarball" ] || die "root launcher tarball missing: $ARTIFACTS/$root_tarball"
  if manifest_covers_everything; then
    say "checking the local manifest (tamper-evidence on this download, NOT provenance)"
  else
    if [ -f "$ARTIFACTS/SHA256SUMS.txt" ]; then
      say "EXISTING SHA256SUMS.txt does not cover every tarball here -- it is stale, and a"
      say "stale manifest verifies only the files it happens to list. Regenerating it."
      say "NOTE: the root launcher therefore has NO cross-run check this run. Its digest is"
      say "printed below; compare it by eye against the last run if that matters to you."
    else
      say "generating SHA256SUMS.txt (a LOCAL seal over this download -- CI does not emit one)"
    fi
    # Subshell: shasum records the names it is given, and bare names are what makes the
    # manifest portable. The parent shell's cwd is deliberately never changed.
    ( cd "$ARTIFACTS" && shasum -a 256 ./*.tgz > SHA256SUMS.txt ) \
      || die "could not write $ARTIFACTS/SHA256SUMS.txt"
  fi
  ( cd "$ARTIFACTS" && shasum -a 256 -c SHA256SUMS.txt ) >/dev/null \
    || die "LOCAL DIGEST MISMATCH against $ARTIFACTS/SHA256SUMS.txt.
The download changed after it was sealed. Discard $ARTIFACTS and re-run."
  manifest_covers_everything || die "SHA256SUMS.txt still does not cover every tarball after
regenerating it -- refusing to report a seal that did not happen."
  say "root launcher digest: $(shasum -a 256 "$ARTIFACTS/$root_tarball" | awk '{print $1}')"
  say "  ^ SELF-SEAL ONLY. CI npm-pack's the launcher and records no digest for it, so this"
  say "    one tarball is not independently verified."
}

# ── Qualification receipt (LCLI-578) ─────────────────────────────────────────
# HARD REFUSAL, per opum-doc ADR harden-fleet-ci-against-a-single-runner-outage-and-unqualified-
# publication, ruling 3 (read at opum-doc 9222079): no publish without a qualification receipt
# from opum-cli-e2e, unless an override is written INTO that receipt. Warning-only was rejected
# because lore 0.9.0 shipped over a recorded NOT QUALIFIED result. The contract is
# receipts/README.md on opum-ai/opum-cli-e2e main; this reader was built against it and against
# receipts/lore/0.9.2.json and 0.9.3.json there (main d49ab79d, 2026-09-25).
#
# The HOST, repository and ref are CONSTANTS, not env vars: pointing the reader at a fork, a
# branch or another GitHub host would be a bypass. `--hostname github.com` is passed explicitly
# because gh otherwise honours GH_HOST, which would let the environment redirect the read. No
# flag or env var THIS SCRIPT READS skips the gate -- a claim about its own inputs, not about
# everything gh or node might consult. The only way past a non-QUALIFIED verdict is an override
# {by, reason, task, adr} landed in the receipt by PR.
#
# Deliberately NOT bound: harness.commit (it is the commit that LANDED the baseline, not the one
# that ran it -- see commitMeaning in the file), and the receipt's own commit and runAttempt,
# which the contract does not ask a reader to bind. The run id plus every tarball sha256 already
# pins the bytes; adding bindings the contract does not name buys false refusals, not safety.
#
# BYTES: the digests compared are of $ARTIFACTS/<name>, the exact paths publish_one hands to
# `npm publish`, with no repack in between. npm 12's publish of a FILE spec streams that file's
# bytes (libnpmpack -> pacote.tarball); only a DIRECTORY spec is packed afresh.
RECEIPT_REPO="opum-ai/opum-cli-e2e"
RECEIPT_PATH="receipts/lore/${VERSION}.json"

receipt_check_js() {
  cat <<'JS'
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [file, version, runId, artifacts, ...publishNames] = process.argv.slice(1);
const show = (v) => JSON.stringify(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
let r;
try { r = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("  - receipt is not parseable JSON: " + e.message); process.exit(1); }
if (!isObj(r)) { console.error("  - receipt is not a JSON object"); process.exit(1); }
const p = [];
if (r.kind !== "opum.qualification-receipt.v1") p.push(`kind is ${show(r.kind)}, not "opum.qualification-receipt.v1" (an unknown kind is refused, never guessed at)`);
if (r.schemaVersion !== 1) p.push(`schemaVersion is ${show(r.schemaVersion)}, not 1`);
if (r.product !== "lore") p.push(`product is ${show(r.product)}, not "lore"`);
if (r.version !== version) p.push(`version is ${show(r.version)}, not "${version}"`);
// Run ids compared as normalised DIGIT STRINGS: a number must be a safe integer (a larger one has
// already lost precision in JSON.parse), a string must be all digits; leading zeros are dropped.
const norm = (s) => s.replace(/^0+(?=\d)/, "");
const rid = r.releaseRunId;
const ridStr = typeof rid === "number" && Number.isSafeInteger(rid) && rid > 0 ? String(rid)
  : typeof rid === "string" && /^[0-9]+$/.test(rid) ? norm(rid) : null;
if (ridStr === null || ridStr !== norm(runId)) p.push(`releaseRunId is ${show(rid)}, not ${runId} (the run these tarballs were downloaded from)`);
// Tarballs: own-property lookup AND set equality, so a receipt omitting a platform, or naming one
// this release does not publish, refuses. Each digest is recomputed here from the exact file.
const expected = [...publishNames].sort();
const onDisk = fs.readdirSync(artifacts).filter((n) => n.endsWith(".tgz")).sort();
if (show(onDisk) !== show(expected)) p.push(`${artifacts} holds ${show(onDisk)}, not exactly the tarballs this script publishes`);
const t = r.tarballs;
if (!isObj(t)) p.push(`tarballs is ${show(t)}, not an object of {filename: sha256}`);
else {
  for (const name of expected) {
    if (!own(t, name)) { p.push(`tarballs has no entry for ${name}`); continue; }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(artifacts, name))).digest("hex");
    if (typeof t[name] !== "string" || t[name].toLowerCase() !== actual) p.push(`sha256 MISMATCH for ${name}: receipt says ${show(t[name])}, the file to be published is ${actual}`);
  }
  for (const key of Object.keys(t)) if (!expected.includes(key)) p.push(`tarballs names ${show(key)}, which this release does not publish`);
}
// Override: waives nothing unless by, reason, task and adr are ALL non-empty strings. A partial
// override is refused outright -- even beside a QUALIFIED verdict, because it is a malformed
// record. `null` is treated as absent (it waives nothing either way).
const F = ["by", "reason", "task", "adr"];
let override = null;
if (own(r, "override") && r.override !== null) {
  const o = r.override;
  if (isObj(o) && F.every((f) => own(o, f) && typeof o[f] === "string" && o[f].trim() !== "")) override = o;
  else p.push(`override is present but INCOMPLETE: ${F.join(", ")} must all be non-empty strings, and a partial override waives nothing. Found: ${show(o)}`);
}
if (r.verdict !== "QUALIFIED" && override === null) p.push(`verdict is ${show(r.verdict)}, not "QUALIFIED", and the receipt carries no complete override`);
if (p.length) { for (const m of p) console.error("  - " + m); process.exit(1); }
if (r.verdict === "QUALIFIED") { console.log("QUALIFIED"); process.exit(0); }
console.log("OVERRIDE " + show(r.verdict));
console.log(JSON.stringify(override, null, 2));
JS
}

# THE RECEIPT THE GATE READ IS KEPT, not deleted after the check (LCLI-586), because
# recheck_against_receipt below compares each tarball with it again immediately before that
# tarball's `npm publish`. It is the receipt's value that is compared, never a digest this
# script computed at gate time: the receipt is the authority, and a digest recomputed here would
# only prove the file agrees with an earlier reading of itself.
#
# ONE cleanup, installed once and re-installed by the npmrc section below. `trap` REPLACES a
# signal's handler rather than adding to it, so two sections each installing their own `rm -f`
# would leave whichever ran first uncleaned.
#
# INT AND TERM MUST EXIT, NOT JUST CLEAN UP. A handler for a signal REPLACES the default action,
# which was to kill the script, so a handler that only cleans up lets bash carry on at the next
# command once the interrupted one returns. That was a live defect: `trap 'rm -f ...' EXIT INT
# TERM` on the token path meant Ctrl-C during the registry wait deleted the private npmrc and
# then PUBLISHED THE ROOT LAUNCHER anyway, falling back to ~/.npmrc (the LCLI-586 review measured
# it under bash 3.2 and 5.2). An operator pressing Ctrl-C there means stop. 130 and 143 are the
# conventional 128+SIGINT and 128+SIGTERM. EXIT also fires on the way out, which runs cleanup a
# second time. That is harmless, because cleanup only removes files.
RECEIPT_FILE=""
TMP_NPMRC=""
cleanup_private_files() {
  if [ -n "$TMP_NPMRC" ]; then rm -f "$TMP_NPMRC"; fi
  if [ -n "$RECEIPT_FILE" ]; then rm -f "$RECEIPT_FILE"; fi
  return 0
}
install_cleanup_traps() {
  trap cleanup_private_files EXIT
  trap 'cleanup_private_files; exit 130' INT
  trap 'cleanup_private_files; exit 143' TERM
}
install_cleanup_traps

# THE CHECK-TO-PUBLISH WINDOW (LCLI-586). verify_qualification_receipt hashes every tarball ONCE,
# before any publish. The root launcher is published LAST, behind the registry-visibility wait
# (REGISTRY_WINDOW_SECONDS, 1800s by default) and the propagation cushion, so up to ~30 minutes
# after the gate. Nothing in this script writes to $ARTIFACTS in that window, so only an outside
# process could swap a file, but one swapped then would otherwise be published unchecked. So each
# tarball is re-hashed with `shasum -a 256` (the tool verify_platform_digests uses; the gate
# itself hashes in node's crypto, and both are plain sha256 of the file's bytes) IMMEDIATELY
# before its own `npm publish` (and before a --dry-run's "would npm publish", so a rehearsal
# exercises it), and compared with the receipt's value for that exact filename. Any mismatch, or
# a value that cannot be read, dies before the publish.
#
# THIS NARROWS THE WINDOW; IT DOES NOT CLOSE IT. shasum reads the path, then npm reads the same
# path again, so a swap in the milliseconds between the two still goes unchecked. Closing it would
# mean publishing from a private copy made at check time, which was deliberately not done here.
receipt_digest_for() {
  # Own-property lookup, as receipt_check_js does: an inherited key such as `constructor` must
  # not resolve to a value. Prints nothing and exits non-zero unless the entry is 64 hex digits.
  node -e '
const fs = require("fs");
const [file, name] = process.argv.slice(1);
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const t = r !== null && typeof r === "object" ? r.tarballs : undefined;
if (t === null || typeof t !== "object" || Array.isArray(t)) { console.error("receipt has no tarballs object"); process.exit(1); }
if (!Object.prototype.hasOwnProperty.call(t, name)) { console.error("receipt tarballs has no entry for " + name); process.exit(1); }
if (typeof t[name] !== "string" || !/^[0-9a-fA-F]{64}$/.test(t[name])) { console.error("receipt entry for " + name + " is " + JSON.stringify(t[name]) + ", not 64 hex digits"); process.exit(1); }
process.stdout.write(t[name].toLowerCase());
' "$1" "$2"
}

recheck_against_receipt() {
  local tarball="$1" name recorded actual rerr why
  name="$(basename "$tarball")"
  if [ -z "$RECEIPT_FILE" ] || [ ! -s "$RECEIPT_FILE" ]; then
    die "cannot re-check $name against the qualification receipt: the receipt the gate read is
not available (${RECEIPT_FILE:-never kept}). Refusing to publish bytes that cannot be re-checked (LCLI-586)."
  fi
  # The reader's stderr is CAPTURED and quoted in the refusal, never discarded: a reader that
  # failed silently would look exactly like one that found nothing.
  rerr="$(mktemp)" || die "mktemp failed; cannot re-check $name against the receipt"
  recorded="$(receipt_digest_for "$RECEIPT_FILE" "$name" 2>"$rerr")" || recorded=""
  why="$(sed 's#^#    #' "$rerr")"; rm -f "$rerr"
  # Checked here as well as in node: an exit-0 reader that printed nothing must still refuse.
  case "$recorded" in
    ""|*[!0-9a-f]*) recorded="" ;;
  esac
  [ "${#recorded}" -eq 64 ] || die "cannot read the qualification receipt's sha256 for $name
from $RECEIPT_FILE. Refusing to publish it without re-checking its bytes (LCLI-586). The reader said:
${why:-    (nothing)}"
  actual="$(shasum -a 256 "$tarball" | awk '{print $1}')"
  if [ "$actual" != "$recorded" ]; then
    die "$name CHANGED AFTER THE QUALIFICATION GATE -- refusing to publish it (LCLI-586).
  receipt sha256        : $recorded
  sha256 before publish : ${actual:-(could not hash $tarball)}
  file                  : $tarball
The gate matched this file against the receipt earlier in this run. The bytes changed after the
gate and before npm publish. Something outside this script wrote to $ARTIFACTS. Find out what
before doing anything else. Then discard $ARTIFACTS and re-run: the script re-downloads the
artifacts and re-runs the gate, and it skips any package that is already published."
  fi
  say "  rehash   $name matches the receipt ($recorded)"
}

verify_qualification_receipt() {
  local err rc out nerr entry names=() mode
  need_gh
  RECEIPT_FILE="$(mktemp)" || die "mktemp failed; cannot keep the receipt for the pre-publish re-check"
  [ -n "$RECEIPT_FILE" ] || die "mktemp returned an empty path for the receipt"
  err="$(mktemp)"
  say "reading the qualification receipt: $RECEIPT_REPO $RECEIPT_PATH @ main on github.com"
  # Raw media type, so the body IS the file. ANY failure is NO RECEIPT and is never retried: the
  # contract says 404 and 403 mean exactly that (the repository is private), and anything else is
  # a receipt this script could not read, which is not a receipt it can honour.
  gh api --hostname github.com -H "Accept: application/vnd.github.raw+json" \
    "repos/$RECEIPT_REPO/contents/$RECEIPT_PATH?ref=main" >"$RECEIPT_FILE" 2>"$err"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    out="$(sed 's#^#    #' "$err")"; rm -f "$err"
    die "NO QUALIFICATION RECEIPT for lore $VERSION -- refusing to publish (LCLI-578).
gh could not read $RECEIPT_PATH from $RECEIPT_REPO@main (exit $rc). gh said:
$out
A 404 or 403 means no receipt this login can see ($RECEIPT_REPO is private). It is not retried.
Wait for opum-cli-e2e to land the receipt on main (it appears minutes after its PR merges), or
land an override in it by PR. No flag or environment variable this script reads bypasses it."
  fi
  for entry in "${PLATFORM_PKGS[@]}" "$ROOT_PKG"; do names+=("${entry#*:}"); done
  # STDOUT AND STDERR ARE KEPT APART. The verdict is read from stdout only; the reasons for a
  # refusal, and anything node itself prints (a deprecation warning, say), go to stderr and are
  # only ever quoted in a die message -- so a stray line can never be read as the verdict.
  out="$(node -e "$(receipt_check_js)" "$RECEIPT_FILE" "$VERSION" "$RUN_ID" "$ARTIFACTS" "${names[@]}" 2>"$err")"
  rc=$?
  nerr="$(cat "$err")"
  # $RECEIPT_FILE is KEPT for recheck_against_receipt; cleanup_private_files removes it on exit.
  rm -f "$err"
  # A refusal STOPS a --dry-run too, rather than rehearsing on past it. The real run would stop
  # here, and a rehearsal that goes on to print credential and publish steps the real run can
  # never reach reads like a green light. It exits non-zero so a scripted rehearsal cannot pass.
  [ "$rc" -eq 0 ] || die "the qualification receipt does NOT qualify these bytes -- refusing to publish (LCLI-578).
Receipt: $RECEIPT_REPO $RECEIPT_PATH @ main. Refused because:
$nerr
The only way past this is a receipt on $RECEIPT_REPO main that matches, or a complete override
(by, reason, task, adr) written into it by PR. No flag or env var this script reads bypasses it."
  # A POSITIVE TOKEN IS REQUIRED TO PROCEED, and the default is refusal. An exit-0 checker that
  # printed nothing -- an empty heredoc makes `node -e ""` exit 0 -- used to leave $mode empty
  # and fall through into the override branch, i.e. publish. Anything but the two tokens dies.
  mode="$(printf '%s\n' "$out" | head -1)"
  case "$mode" in
    QUALIFIED)
      say "receipt: QUALIFIED -- version $VERSION, run $RUN_ID and all ${#names[@]} tarball sha256 match"
      [ "$DRY_RUN" -eq 1 ] && say "receipt: QUALIFIED (would proceed)"
      ;;
    "OVERRIDE "?*)
      hr
      say "!!! receipt verdict is ${mode#OVERRIDE } -- proceeding ONLY on the override written in the receipt:"
      printf '%s\n' "$out" | tail -n +2
      [ "$DRY_RUN" -eq 1 ] && say "!!! receipt: OVERRIDE (would proceed on the override above)"
      hr
      ;;
    *)
      die "unrecognised output from the receipt checker -- refusing to publish (LCLI-578).
It exited 0 but its first stdout line was $(printf '%q' "$mode"), not QUALIFIED or OVERRIDE.
A checker that did not say yes is treated as no. Its stderr:
${nerr:-    (empty)}"
      ;;
  esac
  return 0
}

# SKIPPED ENTIRELY FOR --verify-only, which reads the registry and nothing else. The
# propagation-timeout message tells an operator who has JUST completed the irreversible step
# to "re-check with --verify-only", so that path has to work when the artifact directory has
# been cleaned or the 90-day retention has expired. Requiring gh, the network and a live
# artifact to print registry state would make the recovery command need more working
# infrastructure than the thing it is recovering from.
if [ "$VERIFY_ONLY" -eq 1 ]; then
  say "--verify-only: skipping artifacts and digests; reporting registry state only"
else
  ensure_artifacts
  count="$(tarball_count)"
  [ "$count" -eq "$EXPECTED_TARBALLS" ] || die "expected $EXPECTED_TARBALLS tarballs in $ARTIFACTS, found $count:
$(list_tarballs)"
  verify_platform_digests
  seal_locally
  say "all $count artifacts accounted for: 6 independently verified, 1 locally sealed"
  # After the bytes are verified, BEFORE any credential handling or registry write.
  verify_qualification_receipt
fi


hr
# ── Token ───────────────────────────────────────────────────────────────────
# Never printed. Written to a private temp userconfig that npm is pointed at for this process
# only, so ~/.npmrc is never rewritten. (It used to say "exported as npm_config__auth_token";
# that export was one of the two npm did not recognise, and it is gone -- see below.)
# REPORTS THE SHAPE OF A CREDENTIAL, NEVER ITS VALUE. Length, prefix and a whitespace flag
# only -- nothing secret is derivable from those, and they are decisive. On 0.6.2 this exact
# triple (length=24 prefix=OTHER) identified a Keychain entry holding something that was not
# an npm token at all, after TWO publish attempts had been spent on a permissions theory that
# was simply wrong: an unrecognised credential authenticates as nobody, and npm answers an
# unauthorised PUT with 404 rather than 403 so as not to disclose package existence. That 404
# reads exactly like "your token lacks publish rights" and sends the operator to npmjs.com to
# change settings that were fine (LCLI-489, finding 3).
check_token_shape() {
  local t="$1" src="$2" len prefix ws
  len="${#t}"
  case "$t" in npm_*) prefix="npm_" ;; *) prefix="OTHER" ;; esac
  case "$t" in *[[:space:]]*) ws="yes" ;; *) ws="no" ;; esac
  say "  token shape: length=$len prefix=$prefix internal_whitespace=$ws   (source: $src)"
  [ -n "${SKIP_TOKEN_SHAPE_CHECK:-}" ] && { say "  shape check SKIPPED by SKIP_TOKEN_SHAPE_CHECK"; return 0; }
  [ "$ws" = "no" ] || die "the credential from $src contains whitespace -- almost always a
truncated or line-wrapped paste. Re-add it and re-run; nothing has been published."
  [ "$prefix" = "npm_" ] || die "the credential from $src is NOT shaped like an npm token
(length=$len prefix=$prefix). Every current npm token begins 'npm_'; classic tokens were
revoked on 9 December 2025. Publishing with this would fail as PUT 404, which looks like a
permissions problem and is not. Re-add the correct value and re-run -- the script is
resumable and nothing has been written. Override with SKIP_TOKEN_SHAPE_CHECK=1 only if you
have established that npm has introduced a new token format."
  if [ "$len" -ne 40 ]; then
    say "  NOTE: a granular access token is npm_ + 36 = 40 characters; this one is $len."
    say "  Not fatal -- npm may have other valid lengths -- but it is the first thing to"
    say "  re-check if the publish below returns 404."
  fi
}

# WHICH of the three paths is in use is now reported rather than left to be reconstructed
# afterwards. On 0.6.2 the header claimed a Keychain token bypassing 2FA while the publish was
# in fact authenticating from ~/.npmrc with a web-login-shaped token, and the resulting OTP
# wall was blamed on the token TYPE for two attempts (LCLI-488).
TOKEN=""
# shellcheck disable=SC2088  # a display label, never used as a path; no expansion wanted
AUTH_SOURCE="~/.npmrc"
if _t="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)" && [ -n "$_t" ]; then
  TOKEN="$_t"; AUTH_SOURCE="keychain:$KEYCHAIN_SERVICE"
elif [ -n "${NPM_TOKEN:-}" ]; then
  TOKEN="$NPM_TOKEN"; AUTH_SOURCE="NPM_TOKEN"
fi
unset _t

if [ -n "$TOKEN" ]; then
  say "auth: $AUTH_SOURCE; ~/.npmrc left untouched"
  check_token_shape "$TOKEN" "$AUTH_SOURCE"
  export npm_config_registry="https://registry.npmjs.org/"
  # ONE MECHANISM, NOT THREE. Two sibling exports used to sit here -- NPM_CONFIG__AUTH_TOKEN
  # and npm_config__authToken -- and npm recognised NEITHER. The real 0.6.2 run printed:
  #     npm warn Unknown env config "_auth-token". This will error in a future major version
  #     npm warn Unknown env config "_authtoken".  This will error in a future major version
  # So authentication rode entirely on the temp userconfig below while appearing to have two
  # fallbacks behind it. They are removed rather than left to become hard errors, and so that
  # nobody reading this believes there is redundancy here that does not exist (LCLI-489,
  # finding 1). The userconfig file is the mechanism: npm reads the registry-scoped
  # _authToken from it, and pointing npm at our own file leaves ~/.npmrc alone.
  # `set +x` around the only two lines that touch the token's value, so `bash -x` on this
  # script cannot trace it into a terminal or a CI log.
  _xtrace="$-"; set +x
  printf -v NPMRC_LINE '//registry.npmjs.org/:_authToken=%s' "$TOKEN"
  TMP_NPMRC="$(mktemp)" || die "mktemp failed; refusing to continue without a private npmrc"
  [ -n "$TMP_NPMRC" ] || die "mktemp returned an empty path"
  chmod 600 "$TMP_NPMRC" || die "could not restrict $TMP_NPMRC to mode 600"
  # INT and TERM are named EXPLICITLY alongside EXIT. A review reported that an EXIT trap
  # does not fire on SIGINT on bash 3.2; a direct test here could not reproduce that -- EXIT
  # alone cleaned up under both SIGINT and SIGTERM -- so the claim is NOT recorded as fact.
  # What is true regardless: this file holds the token in plaintext, whether EXIT alone
  # suffices depends on bash version and how the signal is delivered, and the two moments an
  # operator is most likely to press Ctrl-C (the 30-minute propagation wait, the npx smoke)
  # are both after it exists. Naming all three costs nothing and removes the question.
  # The handlers are the shared install_cleanup_traps (cleanup also removes the kept receipt, and
  # INT/TERM EXIT rather than resume: see the comment there, LCLI-586). A second `trap 'rm -f ...'`
  # here would REPLACE those, not add to them. Installed already above; re-installed here so this
  # section does not depend on that line surviving an edit.
  install_cleanup_traps
  printf '%s\n' "$NPMRC_LINE" > "$TMP_NPMRC" \
    || die "could not write the private npmrc; refusing to fall back to ~/.npmrc silently"
  export npm_config_userconfig="$TMP_NPMRC"
  unset TOKEN NPMRC_LINE
  case "$_xtrace" in *x*) set -x ;; esac
  unset _xtrace
else
  say "auth: no keychain/env token found — falling back to ~/.npmrc"
  say "  A ~/.npmrc web-login session is subject to require-2FA-on-write, which is the OTP"
  say "  wall this script's Keychain path exists to avoid. If npm prompts for an OTP below,"
  say "  that is what happened -- it is not a broken token (LCLI-488)."
fi

hr
# AUTHENTICATION CHECK -- and read why it is shaped this way before changing it, because the two
# obvious forms are both wrong and both were tried here on 2026-08-29.
#
#   `npm whoami`   -- TOO STRICT. A granular access token scoped to packages is not entitled to
#                     /-/whoami, which needs user-level read. It returns 401 for a perfectly good
#                     publishing token, so gating on it rejects exactly the credential we ask for.
#   `npm owner ls` -- VACUOUS. Owner data is PUBLIC: it succeeds with no token at all. Verified by
#                     running it against an empty userconfig. A gate that passes unauthenticated
#                     certifies nothing, which is worse than one that is too strict.
#
# There is no cheap read that proves WRITE capability, because write capability is only observable
# by writing. So this does not pretend to: it confirms the registry is reachable and the token
# PARSES, then lets the first `npm publish` be the real authority. The publish loop already fails
# closed and stops before the root launcher, so a permissions failure costs one refused platform
# package and nothing else -- which is exactly what happened on the first real run, and is a
# better outcome than a green auth check that was not measuring permission.
hr
if ! npm ping >/dev/null 2>&1; then
  die "cannot reach registry.npmjs.org -- check the network before blaming credentials"
fi
# NO TOKEN-PRESENCE CHECK. `npm config get //registry.npmjs.org/:_authToken` returns EMPTY even
# when a valid token is configured -- npm redacts auth values rather than printing them. Gating on
# that is a false negative that blocks a correctly configured machine, which is what happened on
# the second real run (2026-08-29). Reading ~/.npmrc directly is no better: npm merges several
# config sources and the token may legitimately live in any of them, or in an env var.
#
# So detection is abandoned rather than approximated. Three failed forms are now on record --
# whoami (too strict), owner ls (vacuous), config get (false negative) -- and the lesson common to
# all three is that this script cannot cheaply observe what it actually needs, which is WRITE
# PERMISSION on seven specific packages. Only writing observes that. The publish loop below fails
# closed and stops before the root launcher, so letting it be the authority costs one refused
# package and leaves nothing behind.
say "registry reachable. Auth is NOT pre-checked: write permission is only observable by writing."
say "A 404 on PUT below means the token lacks publish rights on that package -- not that it is missing."

# ── Registry state ──────────────────────────────────────────────────────────
published() { npm view "$1@$VERSION" version >/dev/null 2>&1; }

report_state() {
  hr; say "registry state for $VERSION:"
  for entry in "${PLATFORM_PKGS[@]}" "$ROOT_PKG"; do
    pkg="${entry%%:*}"
    if published "$pkg"; then
      tag="$(npm view "$pkg" dist-tags.latest 2>/dev/null)"
      printf '  %-34s present   latest=%s\n' "$pkg" "${tag:-?}"
    else
      printf '  %-34s ABSENT\n' "$pkg"
    fi
  done
}

# ── Registry propagation (LCLI-460) ─────────────────────────────────────────
# npm's publish confirmation is authoritative; the registry's READ API is not immediately
# consistent with it. Observed on @opum-ai/lore-linux-arm64 across three consecutive
# releases, and WORSENING rather than jittering: 0.4.5 ~15s, 0.4.6 ~35s, 0.5.0 ~25 MINUTES
# (resolved 2026-09-08T14:49:18Z). Confirmed origin-side via cf-cache-status/age response
# headers, not a stale CDN edge. On 0.5.0 the lag ran long enough that a sibling session
# flagged it as a possible install-breaking defect before it resolved on its own.
#
# ONE SHARED WINDOW, NOT SEVEN. The deadline is wall-clock and starts once; every package
# still missing is re-polled each round against that same deadline. So the total wait is
# bounded at REGISTRY_WINDOW_SECONDS no matter how many packages are outstanding, and each
# package still gets the whole remaining window. Waiting per-package instead would either
# be too short for the slowest or serialise seven waits into hours. If you are reading this
# because a release paused: that is ONE 30-minute window, not seven.
#
# WINDOW is 30 minutes because the worst OBSERVED case was 25 and the trend is upward --
# sized against evidence, not taste. Backoff doubles 5s -> 60s cap, so polls land at
# 5, 15, 35, 75, 135s ... : the first three bracket the 0.4.5 and 0.4.6 lags almost exactly,
# then it settles into minute intervals for the long tail. Do not shorten it without new
# evidence, and record what you saw if you change it.
REGISTRY_WINDOW_SECONDS="${REGISTRY_WINDOW_SECONDS:-1800}"

# CONSUMER-VISIBLE PROPAGATION LAGS "THE PUBLISHER'S OWN READ SAYS VISIBLE" BY 0-20 SECONDS
# (LCLI-502), measured externally by opum-cli-e2e across five packages on 2026-09-15, from
# outside the publishing credential. So "wait_for_all_visible returned true" is EARLY for a
# real installer by up to this margin regardless of where the poll sits in this script. This
# fixed cushion is added AFTER every platform package reads visible and BEFORE the root
# launcher is published, closing the gap a poll alone cannot close. Overridable for tests;
# do not shorten it in production without new evidence, same rule as REGISTRY_WINDOW_SECONDS.
PROPAGATION_CUSHION_SECONDS="${PROPAGATION_CUSHION_SECONDS:-20}"

# Space-separated string rather than an array on purpose: this script runs on macOS, whose
# /bin/bash is 3.2, where "${arr[@]}" on an EMPTY array under `set -u` aborts the script.
# Package names contain no spaces, so word splitting is safe here.
wait_for_all_visible() {
  local pending="$1" deadline now delay=5 nap next pkg started missing
  started="$(date +%s)"
  deadline=$(( started + REGISTRY_WINDOW_SECONDS ))
  while : ; do
    next=""
    missing=0
    for pkg in $pending; do
      if published "$pkg"; then
        say "  visible  $pkg@$VERSION after $(( $(date +%s) - started ))s"
      else
        next="$next $pkg"
        missing=$(( missing + 1 ))
      fi
    done
    pending="${next# }"
    [ -z "$pending" ] && return 0
    now="$(date +%s)"
    [ "$now" -ge "$deadline" ] && break
    nap="$delay"
    [ $(( now + nap )) -gt "$deadline" ] && nap=$(( deadline - now ))
    say "  waiting  ${missing} package(s) not visible yet; $(( deadline - now ))s of the shared window left"
    sleep "$nap"
    if [ "$delay" -lt 60 ]; then
      delay=$(( delay * 2 ))
      if [ "$delay" -gt 60 ]; then delay=60; fi
    fi
  done

  # EXHAUSTION IS NOT PROOF OF FAILURE, and this wording is load-bearing. The operator has
  # just completed the one irreversible step of the release. Telling them at this moment
  # that something is "broken" invites `npm unpublish` -- destructive, available for 72
  # hours, and reached for precisely by someone who has been told their fresh release is
  # broken when it is in fact fine. Say plainly that npm already confirmed the publish.
  hr
  say "TIMEOUT: still not visible on the registry READ API after ${REGISTRY_WINDOW_SECONDS}s:"
  for pkg in $pending; do say "    $pkg@$VERSION"; done
  say ""
  say "  THIS IS NOT PROOF THE PUBLISH FAILED, AND YOU SHOULD NOT UNPUBLISH ANYTHING."
  say "  npm already confirmed these publishes. Only the registry's read API is behind --"
  say "  a known, recurring, worsening lag on this package set (LCLI-460): 0.4.5 ~15s,"
  say "  0.4.6 ~35s, 0.5.0 ~25min. Longer than 30 minutes is new, not necessarily wrong."
  say ""
  say "  IT MAY ALSO NOT BE LAG AT ALL (LCLI-502). npm 12 can park a publish in a non-public"
  say "  STAGED state pending a maintainer's 2FA approval; a staged version occupies the same"
  say "  semver slot as a published one but is invisible to a registry read under ANY token,"
  say "  including the one that staged it. This poll cannot tell the two apart by itself --"
  say "  check independently of this script's own read:"
  say "      npm stage list <package-name>"
  say "          can itself report nothing for a package that IS staged, if the credential"
  say "          running it is a shortlived/trust-relationship token -- npm's own docs say"
  say "          such tokens cannot run 'npm stage' subcommands at all. Empty is not proof."
  say "      https://www.npmjs.com/  (the package's own page, or your pending-approvals)"
  say "          the one place a pending 2FA approval is visible regardless of token type."
  say ""
  say "  Do this, in order: wait and re-check with --verify-only; then confirm the version"
  say "  really is absent from the registry rather than merely slow. Reach for npm unpublish"
  say "  only if you have established the publish itself did not happen -- it is destructive"
  say "  and it is the wrong tool for either a propagation delay or a stalled 2FA approval."
  return 1
}

if [ "$VERIFY_ONLY" -eq 1 ]; then report_state; exit 0; fi
report_state

# ── Shipped-README version assertions (LCLI-510) ─────────────────────────────
# The gate this script needs even though release.yml's `package` job already ran one.
#
# WHY IT IS NOT REDUNDANT. The `package` job gates the tarball IT packed. This script publishes
# whatever is in $ARTIFACTS, and ensure_artifacts accepts a directory an operator populated BY
# HAND -- the usage text says so explicitly. The platform tarballs get verify_platform_digests
# against independently recorded qualification digests; THE ROOT LAUNCHER DOES NOT, and the root
# launcher is the only one of the seven that ships README.md. So the file npm serves as this
# package's landing page is, on this path, the artifact with the weakest identity check of all
# seven, and it is the one the defect lands in.
#
# WHAT IT REFUSES: a root tarball whose packed README disagrees with its own packed package.json.
# Run against the tarball, never the worktree -- a worktree check can pass while the packed file
# is stale, and the packed one is what the registry serves (contract A1, opum-doc main@ba3055d).
hr
say "checking the packed README's version assertions before any registry write"
readme_gate_tarball="$ARTIFACTS/${ROOT_PKG#*:}"
if [ ! -f "$readme_gate_tarball" ]; then
  die "the root launcher tarball is missing: $readme_gate_tarball"
fi
node "$(dirname "${BASH_SOURCE[0]}")/shipped-readme-version.mjs" --tarball "$readme_gate_tarball"
readme_gate_rc=$?
if [ "$readme_gate_rc" -eq 2 ]; then
  # Exit 2 is "could not READ the input" -- a missing tar, an unparseable package.json -- and is a
  # broken tool, not a stale README. Handing the operator the detailed LCLI-510 story for it sends
  # them to fix a file that is fine.
  die "the shipped-README gate could not read its input (exit 2), so it has verified NOTHING.

This is a tooling or artifact failure, not a stale README: the tarball may be missing, truncated,
or carrying an unparseable package.json. The message above says which. Fix that and re-run --
do NOT publish on the strength of a check that did not complete."
fi
if [ "$readme_gate_rc" -ne 0 ]; then
  die "the packed README disagrees with the package.json being published.

This is LCLI-510: the README bump is authored as post-tag bookkeeping, so the tag carries the
PREVIOUS version's README and npm serves it as this release's landing page. Published version
pages are IMMUTABLE -- publishing now cannot be corrected, only superseded.

Fix it at the source and re-cut the artifacts:
    node scripts/shipped-readme-version.mjs --write
    # commit, re-tag, re-run the release workflow, re-download the artifacts
Do NOT hand-edit the tarball."
fi

# ── Publish ─────────────────────────────────────────────────────────────────
hr
[ "$DRY_RUN" -eq 1 ] && say "DRY RUN — no registry writes will be made"
say "publishing platform packages first, root launcher last"

# ── Staged / 2FA detection at publish time (LCLI-502) ────────────────────────────────────
# WHAT THIS IS AND IS NOT, stated plainly because it was investigated rather than guessed.
#
# Read on this machine on 2026-09-16, npm@12.0.2 as installed
# (~/.nvm/versions/node/v24.20.0/lib/node_modules/npm): lib/commands/publish.js,
# lib/commands/stage/{index,publish}.js, node_modules/libnpmpublish/lib/publish.js,
# node_modules/npm-registry-fetch/lib/{check-response,index}.js, lib/utils/auth.js, and
# docs/content/commands/npm-stage.md (npm's own shipped documentation).
#
# WHAT THE SOURCE ESTABLISHES:
#   - `npm publish` and `npm stage publish` are different CLI commands, not two outcomes of
#     one call. Only `stage publish` sets `opts.stage = true`; only that path ever prints the
#     literal text "(staged" (lib/commands/publish.js, the `stagedMsg` branch). An ordinary
#     `npm publish` success line is always exactly "+ <name>@<version>" -- by construction,
#     never that string. This script only ever calls `npm publish`.
#   - `npm publish`'s registry write passes `ignoreBody: true` for a successful (2xx) response
#     (libnpmpublish/lib/publish.js: `ignoreBody: !opts.stage`), so the response BODY is
#     discarded on success -- npm's own success path could not notice a body saying "this was
#     staged, not published" even if the registry sent one. This is why AC2 of LCLI-502 says
#     "distinguish it by something other than the publisher's own read": for a plain
#     `npm publish`, the publisher's own read of ITS OWN CALL cannot see this, by construction.
#   - An OTP/2FA CHALLENGE, unlike staging, IS visible on the calling side: it throws with
#     `err.code === 'EOTP'`, or the response is an HTTP 401 whose body matches the registry's
#     own `/one-time pass/` heuristic (npm-registry-fetch/lib/check-response.js). In a
#     non-interactive shell (stdin/stdout not both a TTY) npm's own `otplease` re-throws that
#     immediately rather than prompting (lib/utils/auth.js) -- so under either credential path
#     this script actually uses (Keychain/NPM_TOKEN granular-access-token-with-bypass, or the
#     ~/.npmrc session-token fallback), an OTP challenge FAILS the `npm publish` call outright;
#     it does not print a quiet success. npm's own docs table ("Token Behavior", npm-stage.md)
#     document staging as reachable only via the separate `npm stage publish` verb, or via a
#     trust-relationship/OIDC token -- neither of which this script uses.
#
# WHAT COULD NOT BE VERIFIED: this machine has no path to trigger a real staged publish or a
# real 2FA challenge against npm's live registry, so nothing above is confirmed end-to-end --
# it is confirmed against the npm CLI's own shipped source and documentation, which is the
# closest available source of truth in this environment. quest-cli measured an actual staged
# outcome in production (a trust-relationship token, which this script does not use), so the
# mechanism is real; it is this script's OWN exposure to it that could not be reproduced.
#
# So this is a PLUGGABLE, defense-in-depth hook, not a claim that it closes a reproduced hole
# in this script's current credential paths: it scans `npm publish`'s own captured
# stdout+stderr for the exact strings/codes npm's source uses for an OTP challenge or a staged
# outcome, in case a future npm release, token type, or package policy changes what this
# script's plain `npm publish` call can produce.
looks_like_2fa_or_staging() {
  # `*'one-time pass'*` alone also matches "...requires a one-time password..." (the longer
  # phrase contains the shorter one as a substring), so that longer pattern is not listed as a
  # separate alternative -- shellcheck (SC2221/SC2222) correctly flags it as dead when it is.
  case "$1" in
    *EOTP*|*'one-time pass'*|*'(staged'*) return 0 ;;
    *) return 1 ;;
  esac
}

publish_one() {
  local pkg="$1" tarball="$ARTIFACTS/$2" out rc
  if published "$pkg"; then
    say "  skip     $pkg@$VERSION (already on the registry)"
    return 0
  fi
  [ -f "$tarball" ] || { say "  MISSING  $tarball"; return 1; }
  # LAST THING BEFORE THE PUBLISH, on both paths (LCLI-586). Dies on drift, so a tarball swapped
  # after the gate is never handed to npm. Nothing may be inserted between this and `npm publish`
  # that waits, or the window it closes reopens.
  recheck_against_receipt "$tarball"
  if [ "$DRY_RUN" -eq 1 ]; then
    say "  would    npm publish $tarball"
    return 0
  fi
  say "  publish  $pkg@$VERSION"
  out="$(npm publish "$tarball" 2>&1)"; rc=$?
  [ -n "$out" ] && printf '%s\n' "$out"
  if looks_like_2fa_or_staging "$out"; then
    die "npm publish for $pkg@$VERSION printed text this script recognises as a 2FA challenge
or a STAGED (non-public) outcome rather than an ordinary publish -- see the comment above
looks_like_2fa_or_staging() for exactly what that recognition is and is not based on
(LCLI-502). npm's own exit code was $rc. Resolve this as a human: check
    npm stage list $pkg
    https://www.npmjs.com/
since a staged version is invisible to this script's own registry reads under any token, then
re-run -- publishing is resumable and nothing further has been written."
  fi
  return "$rc"
}

failed=0
for entry in "${PLATFORM_PKGS[@]}"; do
  publish_one "${entry%%:*}" "${entry#*:}" || { failed=1; break; }
done
[ "$failed" -eq 0 ] || die "a platform package failed to publish. Stopping before the root
launcher, which this script never publishes until every platform package is CONFIRMED VISIBLE
on the registry's read API (not merely publish order -- see the registry gate below).
Fix and re-run; this script is resumable."

# ── Registry gate before the root launcher (LCLI-502) ────────────────────────────────────
# Publish ORDER alone is not the guarantee this script used to claim (see the header and the
# die() above for what changed and why). Measured on 0.7.0: the root launcher became
# resolvable on the registry's READ API at 79s while a platform package (linux-arm64) did not
# resolve until 200s -- 121 seconds where `npm install` SUCCEEDED WITH THE BINARY MISSING,
# because the platform packages are optionalDependencies. Ordering the WRITES cannot produce
# the guarantee; only gating on READS can. Skipped entirely in --dry-run, matching this
# script's documented safety property that dry-run performs no mutating call and nothing that
# only makes sense around one -- a real registry poll here would also make every existing
# --dry-run test wait out the full REGISTRY_WINDOW_SECONDS against a stub that never publishes.
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would    wait for all six platform packages to be registry-visible, then wait"
  say "           ${PROPAGATION_CUSHION_SECONDS}s more, before publishing the root launcher"
else
  say "gating the root launcher on registry visibility of all six platform packages"
  platform_pkg_list=""
  for entry in "${PLATFORM_PKGS[@]}"; do platform_pkg_list="$platform_pkg_list ${entry%%:*}"; done
  if ! wait_for_all_visible "${platform_pkg_list# }"; then
    die "the root launcher was NOT published. One or more platform packages never became
visible on the registry's read API within ${REGISTRY_WINDOW_SECONDS}s of being published (see
the TIMEOUT detail above, which now also covers the STAGED/2FA possibility). Do NOT unpublish
anything on the strength of this alone -- resolve whichever it is, then re-run this script;
publishing is resumable and nothing further has been written."
  fi
  say "propagation cushion: waiting ${PROPAGATION_CUSHION_SECONDS}s more before publishing the"
  say "  root launcher -- consumer-visible reads lag a publisher's own 'visible' read by 0-20s,"
  say "  measured externally across five packages (opum-cli-e2e, 2026-09-15, LCLI-502)"
  sleep "$PROPAGATION_CUSHION_SECONDS"
fi

publish_one "${ROOT_PKG%%:*}" "${ROOT_PKG#*:}" || die "root launcher failed to publish"

# ── dist-tags ───────────────────────────────────────────────────────────────
hr
say "moving 'latest' dist-tags to $VERSION"
for entry in "${PLATFORM_PKGS[@]}" "$ROOT_PKG"; do
  pkg="${entry%%:*}"
  cur="$(npm view "$pkg" dist-tags.latest 2>/dev/null)"
  if [ "$cur" = "$VERSION" ]; then say "  ok       $pkg latest already $VERSION"; continue; fi
  if [ "$DRY_RUN" -eq 1 ]; then say "  would    npm dist-tag add $pkg@$VERSION latest  (currently $cur)"; continue; fi
  say "  tag      $pkg  $cur -> $VERSION"
  npm dist-tag add "$pkg@$VERSION" latest || die "dist-tag move failed for $pkg"
done

# ── Verify ──────────────────────────────────────────────────────────────────
report_state
hr
if [ "$DRY_RUN" -eq 1 ]; then say "DRY RUN complete — nothing was written."; exit 0; fi

# WAIT FOR THE REGISTRY BEFORE SMOKING (LCLI-460). npx resolves the root launcher AND the
# platform package for this machine, so running it while either is still propagating fails
# for a reason that has nothing to do with the release being broken. Before this guard the
# failure below fired on a propagation lag and told the operator, seconds after the one
# irreversible step, that the install path was broken. One shared window, not one per package.
all_pkgs=""
for entry in "${PLATFORM_PKGS[@]}" "$ROOT_PKG"; do all_pkgs="$all_pkgs ${entry%%:*}"; done
say "confirming the registry read API serves $VERSION before smoking the install path"
if wait_for_all_visible "${all_pkgs# }"; then
  say "clean-registry install smoke (a fresh temp dir, nothing from this machine's caches)"
  SMOKE="$(mktemp -d)"
  ( cd "$SMOKE" && npm init -y >/dev/null 2>&1 && npx --yes "@opum-ai/lore@$VERSION" --version )
  rc=$?
  rm -rf "$SMOKE"
  # Reaching HERE means every package was visible, so a failure now is NOT propagation --
  # the registry is serving the version and the install path genuinely does not work.
  [ "$rc" -eq 0 ] || die "npx smoke failed AFTER every package was confirmed visible on the registry.
This is not a propagation lag: the registry is serving $VERSION and the install path is broken.
Investigate before announcing. Do NOT unpublish -- that fixes nothing here and is destructive."
else
  # Propagation, not breakage. wait_for_all_visible has already said so at length. Do not
  # die: dying here would attach a scary exit status to a release that is probably fine.
  say "SKIPPING the install smoke: the registry is not serving every package yet."
  say "Re-run with --verify-only once it settles, then smoke manually:"
  say "    npx --yes @opum-ai/lore@$VERSION --version"
fi

print_closing_checklist

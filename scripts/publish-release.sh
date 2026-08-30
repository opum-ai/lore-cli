#!/usr/bin/env bash
#
# scripts/publish-release.sh — publish a qualified Lore CLI release to npm.
#
# Auth model: a GRANULAR ACCESS TOKEN (or classic Automation token). Both bypass npm's
# 2FA-on-write, so there is no OTP prompt — that is the whole point. `npm login` does NOT
# achieve this: a web login is still subject to "require 2FA for writes", which is exactly
# the EOTP wall this replaces. Set the token up once; this script then runs unattended.
#
# Reads the token from the macOS Keychain by default, so it is never in a file or in
# shell history. Falls back to NPM_TOKEN, then to whatever is already in ~/.npmrc.
#
# Safety properties, in order of how much they matter:
#   - Verifies every tarball's sha256 against SHA256SUMS.txt BEFORE publishing anything.
#     Publishing is effectively irreversible; npm unpublish is heavily restricted.
#   - Publishes the six PLATFORM packages first and the root launcher LAST, so the launcher
#     is never resolvable before the binary it execs exists.
#   - Resumable: a version already on the registry is skipped, not re-attempted.
#   - --dry-run does everything except the two mutating calls.
#   - Never echoes the token.
#
# Encodes runbook section 3 step 5's sequence so it cannot be misremembered under pressure.
# See docs/runbooks/release-publishing.md.
#
# Usage:
#   scripts/publish-release.sh <version> <release-run-id> [--dry-run|--verify-only]
#
#   scripts/publish-release.sh 0.3.5 33282804802 --dry-run   # rehearse; touches nothing
#   scripts/publish-release.sh 0.3.5 33282804802             # publish + move latest dist-tags
#   scripts/publish-release.sh 0.3.5 33282804802 --verify-only
#
# ARTIFACTS defaults to ./release-<version>/ beside this script; override with the env var.
# The directory must contain the seven workflow .tgz files AND a SHA256SUMS.txt covering them.

set -uo pipefail

VERSION="${1:-}"
RUN_ID="${2:-}"
KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-npm-opum-ai-publish}"
case "$VERSION" in
  ""|-*) sed -n '2,34p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
[ -n "$RUN_ID" ] || { echo "ERROR: a Release run id is required (it is how a lost artifact directory is recovered)" >&2; exit 2; }
shift 2
ARTIFACTS="${ARTIFACTS:-$(dirname "${BASH_SOURCE[0]}")/release-${VERSION}}"

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
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    -h|--help)     sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }
hr()  { printf '%s\n' "────────────────────────────────────────────────────────────"; }

# ── Artifacts ───────────────────────────────────────────────────────────────
[ -d "$ARTIFACTS" ] || die "artifact directory not found: $ARTIFACTS
Re-download it:  gh run download $RUN_ID -n npm-packages -D '$ARTIFACTS'"
cd "$ARTIFACTS" || die "cannot enter $ARTIFACTS"
[ -f SHA256SUMS.txt ] || die "SHA256SUMS.txt missing in $ARTIFACTS — refusing to publish unverified bytes"

say "verifying artifact digests in $ARTIFACTS"
shasum -a 256 -c SHA256SUMS.txt || die "DIGEST MISMATCH — these are not the qualified artifacts. Refusing to publish.
If you rebuilt them locally, discard and re-download: gh run download $RUN_ID -n npm-packages -D '$ARTIFACTS'"

count=$(ls -1 ./*.tgz 2>/dev/null | wc -l | tr -d ' ')
[ "$count" -eq 7 ] || die "expected 7 tarballs, found $count — refusing to publish a partial family"
say "all 7 artifacts verified"


hr
# ── Token ───────────────────────────────────────────────────────────────────
# Never printed. Exported as npm_config__auth_token so it applies to this process only
# and does not rewrite ~/.npmrc.
load_token() {
  local t
  t="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)" && [ -n "$t" ] && { printf '%s' "$t"; return 0; }
  [ -n "${NPM_TOKEN:-}" ] && { printf '%s' "$NPM_TOKEN"; return 0; }
  return 1
}

if TOKEN="$(load_token)"; then
  export npm_config_registry="https://registry.npmjs.org/"
  export NPM_CONFIG__AUTH_TOKEN="$TOKEN"
  # npm reads the registry-scoped form; set it via env so ~/.npmrc is left alone.
  export npm_config__authToken="$TOKEN"
  printf -v NPMRC_LINE '//registry.npmjs.org/:_authToken=%s' "$TOKEN"
  TMP_NPMRC="$(mktemp)"; chmod 600 "$TMP_NPMRC"
  printf '%s\n' "$NPMRC_LINE" > "$TMP_NPMRC"
  export npm_config_userconfig="$TMP_NPMRC"
  trap 'rm -f "$TMP_NPMRC"' EXIT
  unset TOKEN NPMRC_LINE
  say "auth: using a token (keychain or NPM_TOKEN); ~/.npmrc left untouched"
else
  say "auth: no keychain/env token found — falling back to ~/.npmrc"
fi

hr
WHO="$(npm whoami 2>&1)"
if [ $? -ne 0 ]; then
  cat >&2 <<'HELP'
ERROR: not authenticated to registry.npmjs.org.

ONE-TIME SETUP (no OTP needed afterwards):

  1. Open https://www.npmjs.com/settings/~/tokens  (avatar → Access Tokens)
  2. "Generate New Token" → "Granular Access Token"
       Name        : lore-cli release
       Expiration  : your choice (90 days is a reasonable default)
       Packages    : "Select packages" → the seven @opum-ai/lore* packages,
                     or choose the @opum-ai scope to cover future ones
       Permissions : Read and write
     (A classic "Automation" token also works and never expires. Granular is
      preferred: scoped to these packages and revocable without affecting anything else.)
  3. Copy the token — it is shown exactly once.
  4. Store it in the macOS Keychain (recommended — no plaintext token on disk):

       security add-generic-password -U -s npm-opum-ai-publish -a "$USER" -w

     ...then paste the token at the prompt and press Return.

     Or, if you prefer an env var:  export NPM_TOKEN=<token>

  5. Re-run this script.

Why not `npm login`? A web login is still subject to "require 2FA for writes", so every
publish and every dist-tag move would prompt for an OTP. Granular/automation tokens bypass
that by design — that is what makes this durable.
HELP
  exit 1
fi
say "authenticated as: $WHO"

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

if [ "$VERIFY_ONLY" -eq 1 ]; then report_state; exit 0; fi
report_state

# ── Publish ─────────────────────────────────────────────────────────────────
hr
[ "$DRY_RUN" -eq 1 ] && say "DRY RUN — no registry writes will be made"
say "publishing platform packages first, root launcher last"

publish_one() {
  local pkg="$1" tarball="$2"
  if published "$pkg"; then
    say "  skip     $pkg@$VERSION (already on the registry)"
    return 0
  fi
  [ -f "$tarball" ] || { say "  MISSING  $tarball"; return 1; }
  if [ "$DRY_RUN" -eq 1 ]; then
    say "  would    npm publish $tarball"
    return 0
  fi
  say "  publish  $pkg@$VERSION"
  npm publish "$tarball" || return 1
}

failed=0
for entry in "${PLATFORM_PKGS[@]}"; do
  publish_one "${entry%%:*}" "${entry#*:}" || { failed=1; break; }
done
[ "$failed" -eq 0 ] || die "a platform package failed to publish — stopping BEFORE the root launcher,
so the launcher never resolves to a binary that is not there. Fix and re-run; this script is resumable."

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

say "clean-registry install smoke (a fresh temp dir, nothing from this machine's caches)"
SMOKE="$(mktemp -d)"
( cd "$SMOKE" && npm init -y >/dev/null 2>&1 && npx --yes "@opum-ai/lore@$VERSION" --version )
rc=$?
rm -rf "$SMOKE"
[ "$rc" -eq 0 ] || die "npx smoke failed — the packages are published but the install path is broken. Investigate before announcing."

hr
cat <<'DONE'
PUBLISHED. Remaining, per LCLI-363:

  AC#5  Replace (do not merely supplement) the "Not yet published" sentence in
        docs/reference/lore-cli-release-truth.md, and cut a non-draft,
        non-prerelease GitHub Release for v0.3.5 using CHANGELOG.md's [0.3.5]
        section as its body:
            gh release create v0.3.5 --title "Lore CLI 0.3.5" --notes-file <notes>

  AC#6  Tell the opum-cli-e2e session (pane wK:pR) to re-run the 407-row matrix
        at rank-1 against the published release, and tell quest-cli (pane wS:pK)
        that lore 0.3.5 is live — they are deliberately not describing it as
        published until told.
DONE

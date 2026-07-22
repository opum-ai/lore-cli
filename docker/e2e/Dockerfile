# docker/e2e/Dockerfile — hermetic E2E environment for lore (LORE-56).
#
# Builds two REAL binaries and runs the full lore command surface against them —
# no mocked Backlog adapter. lore has not shipped a release yet (ADR-0002's
# 2026-07-19 amendment): there is no tagged MrLesk/Backlog.md release containing
# PR #790 (--json), so the only way to test the real toolchain today is the
# pinned-commit build documented in docs/runbooks/backlog-json-patch.md §8.1.
#
# Single stage: this is a disposable local/CI test image, not a shipped
# artifact, so there's nothing multi-stage buys here.
FROM oven/bun:1.2.23@sha256:6ebf306367da43ad75c4d5119563e24de9b66372929ad4fa31546be053a16f74

# git: clone the pinned upstream Backlog.md commit.
# python3/pip: `lore scaffold mkdocs` + a real `mkdocs build` (mirrors
#   .github/workflows/ci.yml's scaffold-mkdocs job; pinned to exact versions
#   here for byte-for-byte reproducibility of this image).
# nodejs/npm (NodeSource, v22 to match ci.yml's actions/setup-node):
#   `lore scaffold docusaurus` + a real `npm install && npm run build`. The
#   setup script is downloaded, verified against a pinned sha256 (not piped
#   straight into a root shell), and only then executed.
# jq: JSON-envelope assertions in run-e2e.sh. curl: fetches the (verified)
#   NodeSource setup script.
ARG NODESOURCE_SETUP_SHA256=575583bbac2fccc0b5edd0dbc03e222d9f9dc8d724da996d22754d6411104fd1
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       git python3 python3-pip curl jq ca-certificates \
    && curl -fsSL -o /tmp/nodesource-setup.sh https://deb.nodesource.com/setup_22.x \
    && echo "${NODESOURCE_SETUP_SHA256}  /tmp/nodesource-setup.sh" | sha256sum -c - \
    && bash /tmp/nodesource-setup.sh \
    && rm -f /tmp/nodesource-setup.sh \
    && apt-get install -y --no-install-recommends nodejs \
    && pip install --no-cache-dir --break-system-packages "mkdocs==1.6.1" "mkdocs-material==9.7.7" \
    && rm -rf /var/lib/apt/lists/*

# ── Build `backlog`: upstream MrLesk/Backlog.md pinned at the --json PR #790 ──
# merge commit. Run upstream's OWN `bun run build` (bun scripts/build.ts) rather
# than a hand-rolled `bun build --compile` line: that script embeds the real
# package.json version via `--define __EMBEDDED_VERSION__`. Skipping that define
# (as a naive compile line would) makes `backlog --version` fall back to reading
# package.json off the invoking process's cwd — which won't exist once this
# binary is invoked from lore's own scratch project — landing on a hardcoded
# "0.0.0" fallback. That's a valid bare semver, so lore's capability probe
# (MIN_BACKLOG_VERSION = "1.47.1" in src/adapters/backlog.ts) would pass the
# shape check but fail the version-floor comparison: a fail-loud exit 6 against
# a binary that is genuinely --json-capable, misreporting a build defect as a
# lore bug. HUSKY=0 skips the `prepare` script's git-hook install (irrelevant in
# a throwaway image); the `postinstall` hook's bun2nix/nix probe is already
# `|| true`-guarded upstream, so its stderr noise is expected, not a failure.
ARG BACKLOG_COMMIT=22a091b570d44c4f302ca47e7fd36fa28ad8bcb0
RUN git clone --quiet https://github.com/MrLesk/Backlog.md.git /opt/backlog-src \
    && cd /opt/backlog-src \
    && git checkout --quiet "$BACKLOG_COMMIT" \
    && HUSKY=0 bun install \
    && HUSKY=0 bun run build \
    && install -m 0755 dist/backlog /usr/local/bin/backlog \
    && VER="$(/usr/local/bin/backlog --version)" \
    && echo "backlog --version => '${VER}'" \
    && if [ -z "$VER" ] || [ "$VER" = "0.0.0" ]; then \
         echo "backlog compiled with a broken/fallback version (got '${VER}')" >&2; exit 1; \
       fi \
    && /usr/local/bin/backlog --help | grep -q "Backlog.md"

# ── Build `lore`: current dev source, compiled the same way ci.yml does ──
WORKDIR /opt/lore
COPY package.json bun.lock bunfig.toml tsconfig.json biome.json .bun-version ./
COPY src ./src
COPY test ./test
RUN bun install --frozen-lockfile --linker=isolated \
    && bun build --compile src/cli.ts --outfile /usr/local/bin/lore \
    && chmod +x /usr/local/bin/lore \
    && VER="$(/usr/local/bin/lore --version)" \
    && EXPECTED="$(bun -e 'console.log(require("./package.json").version)')" \
    && echo "lore --version => '${VER}' (package.json: '${EXPECTED}')" \
    && if [ -z "$VER" ]; then echo "lore --version produced no output (broken binary)" >&2; exit 1; fi \
    && if [ "$VER" != "$EXPECTED" ]; then echo "version mismatch: binary='${VER}' package.json='${EXPECTED}'" >&2; exit 1; fi \
    && /usr/local/bin/lore --help | grep -q "OKF-native documentation CLI"

# ── Non-root user. Required, not cosmetic: the one real filesystem-permission
# `denied` (exit 4) repro (chmod 000 a file lore must read) only fires for a
# non-root process — root ignores Unix permission bits on Linux. The base
# image already ships a `bun` user at uid 1000 with a usable shell; reuse it
# instead of colliding on the uid.
RUN usermod --shell /bin/bash bun \
    && mkdir -p /workspace /results \
    && chown -R bun:bun /workspace /results /opt/lore

COPY --chmod=0755 docker/e2e/run-e2e.sh /usr/local/bin/run-e2e.sh

USER bun
WORKDIR /workspace
ENV RESULTS_DIR=/results
ENV LORE_REPO=/opt/lore

ENTRYPOINT ["/usr/local/bin/run-e2e.sh"]

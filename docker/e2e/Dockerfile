# docker/e2e/Dockerfile — hermetic E2E environment for lore (LORE-56).
#
# Builds/installs two REAL binaries and runs the full lore command surface against
# them — no mocked Backlog adapter. MrLesk/Backlog.md v1.49.0 (published
# 2026-08-02) is the first tagged release containing PR #790 (--json), so this
# image installs the published `backlog.md` package instead of the interim
# pinned-commit build LCLI-253 retired (docs/runbooks/backlog-json-patch.md §8.1).
#
# Single stage: this is a disposable local/CI test image, not a shipped
# artifact, so there's nothing multi-stage buys here.
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4

# git: the E2E scenarios themselves (git init/status/diff-tree assertions in
#   run-e2e.sh exercise lore's real coexistence-with-git behavior).
# python3/pip: `lore scaffold mkdocs` + a real `mkdocs build` (mirrors
#   .github/workflows/ci.yml's scaffold-mkdocs job; pinned to exact versions
#   here for byte-for-byte reproducibility of this image).
# nodejs/npm (NodeSource, v22 to match ci.yml's actions/setup-node):
#   `lore scaffold docusaurus` + a real `npm install && npm run build`, and
#   below, installing the published `backlog.md` package globally. The
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

# ── Install `backlog`: the published npm package (--json-capable since v1.49.0,
# PR #790 / BACK-545) — nodejs/npm were already installed above for the
# docusaurus scaffold step. Pinned to an exact version for byte-for-byte image
# reproducibility, same rationale as the mkdocs pins above; bump deliberately,
# not via a floating range.
ARG BACKLOG_VERSION=1.49.0
RUN npm install -g "backlog.md@${BACKLOG_VERSION}" \
    && VER="$(backlog --version)" \
    && echo "backlog --version => '${VER}'" \
    && if [ "$VER" != "$BACKLOG_VERSION" ]; then \
         echo "backlog installed the wrong version (wanted '${BACKLOG_VERSION}', got '${VER}')" >&2; exit 1; \
       fi \
    && backlog --help | grep -q "Backlog.md"

# ── Build `lore`: current dev source, compiled the same way ci.yml does ──
WORKDIR /opt/lore
COPY package.json bun.lock bunfig.toml tsconfig.json biome.json .bun-version ./
COPY patches ./patches
COPY src ./src
COPY test ./test
RUN bun install --frozen-lockfile --linker=isolated \
    && bun build --compile src/compiled.ts --outfile /usr/local/bin/lore \
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
#
# PUID/PGID (LORE-103 AC2): docker-compose.yml bind-mounts the HOST's
# ./results directory to /results, but writes to it come from this
# container's `bun` user. On a host whose invoking user isn't uid/gid 1000,
# the fixed 1000:1000 `bun` user can't write $RESULTS_DIR/report.jsonl
# (EACCES) even though root's mkdir -p above succeeds. Rebinding `bun` to
# the host's real uid/gid (passed as build args, see docker-compose.yml)
# makes container-side writes land as files the host user already owns.
# Defaults (1000/1000) preserve the prior fixed-uid behavior byte-for-byte.
ARG PUID=1000
ARG PGID=1000
RUN if [ "$PGID" != "1000" ]; then groupmod -o -g "$PGID" bun; fi \
    && if [ "$PUID" != "1000" ]; then usermod -o -u "$PUID" bun; fi \
    && usermod --shell /bin/bash bun \
    && mkdir -p /workspace /results \
    && chown -R bun:bun /home/bun /workspace /results /opt/lore

COPY --chmod=0755 docker/e2e/run-e2e.sh /usr/local/bin/run-e2e.sh

USER bun
WORKDIR /workspace
ENV RESULTS_DIR=/results
ENV LORE_REPO=/opt/lore
# Purpose-built container marker (LORE-269): run-e2e.sh's fail-closed guard checks for this
# BEFORE any mutating phase. It exists only in images built from this Dockerfile -- a host shell
# invoking run-e2e.sh directly would have to deliberately export it to defeat the guard.
ENV LORE_E2E_CONTAINER=1

ENTRYPOINT ["/usr/local/bin/run-e2e.sh"]

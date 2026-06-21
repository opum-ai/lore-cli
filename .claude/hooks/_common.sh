#!/bin/bash
# _common.sh — shared prelude sourced by lore's session-continuity hooks
# (context-recovery, pre-compact, checkpoint-save, error-detect).
# Not a hook itself; not registered in settings.json.
#
# Provides, for every hook that sources it:
#   - a jq presence check (warns on stderr but stays NON-BLOCKING: none of
#     lore's hooks are gates, so a missing jq must never fail a tool call)
#   - a CLAUDE_PROJECT_DIR guard (every hook is a safe no-op without it)

if ! command -v jq >/dev/null 2>&1; then
  echo "lore hook warning: jq not found on PATH — session-continuity hooks are inert." >&2
  echo "Install: 'brew install jq' on macOS, 'winget install jqlang.jq' on Windows, or https://jqlang.github.io/jq/" >&2
  exit 0
fi

# All hooks read/write under the project dir; without it there is nothing safe
# to do, so no-op rather than touching the filesystem root.
if [ -z "$CLAUDE_PROJECT_DIR" ]; then
  exit 0
fi

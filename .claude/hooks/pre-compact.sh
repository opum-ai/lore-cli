#!/bin/bash
# Pre-compact hook: save session state before context compression
# Used by PreCompact hook
# Writes handover file from checkpoint and audit data
# Exit 0 always (non-blocking)

. "$(dirname "$0")/_common.sh"

HANDOVER_DIR="$CLAUDE_PROJECT_DIR/.claude/handovers"
CHECKPOINT_FILE="$CLAUDE_PROJECT_DIR/.checkpoint"
AUDIT_LOG="$CLAUDE_PROJECT_DIR/.claude/audit.log"
ERRORS_FILE="$CLAUDE_PROJECT_DIR/.claude/session-errors.jsonl"

TIMESTAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
HANDOVER_FILE="$HANDOVER_DIR/HANDOVER-${TIMESTAMP}.md"

mkdir -p "$HANDOVER_DIR"

# Start building handover content
{
  echo "# Session Handover - $TIMESTAMP"
  echo ""

  # Include checkpoint (which now contains progress state) if it exists
  if [ -f "$CHECKPOINT_FILE" ]; then
    # Extract progress summary first
    TASK=$(jq -r '.task // empty' "$CHECKPOINT_FILE")
    if [ -n "$TASK" ]; then
      echo "## Progress State"
      echo ""
      PHASE=$(jq -r '.phase // "unknown"' "$CHECKPOINT_FILE")
      echo "- **Task**: $TASK"
      echo "- **Phase**: $PHASE"
      DONE=$(jq -r '.done // [] | .[]' "$CHECKPOINT_FILE" 2>/dev/null)
      NEXT=$(jq -r '.next // [] | .[]' "$CHECKPOINT_FILE" 2>/dev/null)
      if [ -n "$DONE" ]; then
        echo "- **Done**:"
        echo "$DONE" | while read -r item; do echo "  - $item"; done
      fi
      if [ -n "$NEXT" ]; then
        echo "- **Next**:"
        echo "$NEXT" | while read -r item; do echo "  - $item"; done
      fi
      echo ""
    fi

    echo "## Checkpoint"
    echo ""
    echo '```json'
    jq '.' "$CHECKPOINT_FILE"
    echo '```'
    echo ""
  fi

  # Include recent audit log entries (last 20)
  if [ -f "$AUDIT_LOG" ]; then
    echo "## Recent Tool Calls (last 20)"
    echo ""
    echo '```'
    tail -20 "$AUDIT_LOG"
    echo '```'
    echo ""
  fi

  # Include session errors if any
  if [ -f "$ERRORS_FILE" ] && [ -s "$ERRORS_FILE" ]; then
    ERROR_COUNT=$(wc -l < "$ERRORS_FILE" | tr -d ' ')
    echo "## Session Errors ($ERROR_COUNT total)"
    echo ""
    echo '```'
    tail -10 "$ERRORS_FILE"
    echo '```'
    echo ""
  fi
} > "$HANDOVER_FILE"

# Rotate auto-generated handover dumps only (keep last 5).
# Kind-aware (ECK #56 R1): timestamp-named files (HANDOVER-<date>T<time>Z.md)
# are disposable auto-dumps; any other HANDOVER-*.md name is a hand-written
# brief and must never be rotated. This hook is the only rotation site (R2) —
# the retrospective skill no longer rotates.
ls -t "$HANDOVER_DIR"/HANDOVER-????-??-??T??????Z.md 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null

# Output summary so agent sees it post-compaction
echo "CONTEXT COMPACTION: Session state saved to $HANDOVER_FILE"
if [ -f "$ERRORS_FILE" ] && [ -s "$ERRORS_FILE" ]; then
  ERROR_COUNT=$(wc -l < "$ERRORS_FILE" | tr -d ' ')
  echo "Errors captured this session: $ERROR_COUNT"
fi
echo "Review handover file to restore context."

exit 0

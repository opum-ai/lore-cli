#!/bin/bash
# Context recovery on session start
# Reads .checkpoint (includes progress state) and displays current state
# Used by SessionStart hook
# Exit 0 always (informational only)

. "$(dirname "$0")/_common.sh"

CHECKPOINT_FILE="$CLAUDE_PROJECT_DIR/.checkpoint"

if [ -f "$CHECKPOINT_FILE" ]; then
  echo "SESSION RECOVERY: Found .checkpoint"
  echo "---"

  # Display progress fields if present
  TASK=$(jq -r '.task // empty' "$CHECKPOINT_FILE" 2>/dev/null)
  PHASE=$(jq -r '.phase // empty' "$CHECKPOINT_FILE" 2>/dev/null)
  DONE=$(jq -r '.done // [] | if length > 0 then .[] else empty end' "$CHECKPOINT_FILE" 2>/dev/null)
  NEXT=$(jq -r '.next // [] | if length > 0 then .[] else empty end' "$CHECKPOINT_FILE" 2>/dev/null)

  if [ -n "$TASK" ]; then
    echo "Task: $TASK"
    echo "Phase: ${PHASE:-unknown}"
    if [ -n "$DONE" ]; then
      echo "Done:"
      echo "$DONE" | while read -r item; do echo "  - $item"; done
    fi
    if [ -n "$NEXT" ]; then
      echo "Next:"
      echo "$NEXT" | while read -r item; do echo "  - $item"; done
    fi
    echo ""
  fi

  # Display full checkpoint
  jq '.' "$CHECKPOINT_FILE" 2>/dev/null
  echo "---"
  echo "Review the above state and resume where you left off."

  # H2: Reset checkpoint after display (fresh start for new session)
  rm -f "$CHECKPOINT_FILE"
fi

# Check for handover files from prior session
HANDOVER_DIR="$CLAUDE_PROJECT_DIR/.claude/handovers"
if [ -d "$HANDOVER_DIR" ]; then
  # Pending MANUAL handovers (HANDOVER-YYYY-MM-DD-{topic}.md) — written by
  # /handover, consumed via /handover restore (which archives them). Listed,
  # not inlined: there may be several, each owning a different topic.
  MANUAL_HANDOVERS=$(ls -t "$HANDOVER_DIR"/HANDOVER-????-??-??-*.md 2>/dev/null)
  if [ -n "$MANUAL_HANDOVERS" ]; then
    echo ""
    echo "PENDING HANDOVERS ($(echo "$MANUAL_HANDOVERS" | wc -l | tr -d ' ')): run /handover restore to resume"
    echo "$MANUAL_HANDOVERS" | while read -r f; do echo "  - $(basename "$f")"; done
  fi

  # Latest AUTO snapshot (PreCompact) — display inline. Pattern-scoped so a
  # newer auto-dump never shadows the manual list above.
  LATEST_HANDOVER=$(ls -t "$HANDOVER_DIR"/HANDOVER-????-??-??T??????Z.md 2>/dev/null | head -1)
  if [ -n "$LATEST_HANDOVER" ]; then
    echo ""
    echo "HANDOVER RECOVERY: Found $(basename "$LATEST_HANDOVER")"
    echo "---"
    cat "$LATEST_HANDOVER"
    echo "---"
  fi
fi

# Surface unprocessed tool failures from prior session(s). lore has no
# /retrospective skill — point at lore's actual systems of record instead:
# capture any recurring failure as a Backlog note or an auto-memory entry.
ERRORS_FILE="$CLAUDE_PROJECT_DIR/.claude/session-errors.jsonl"
if [ -f "$ERRORS_FILE" ] && [ -s "$ERRORS_FILE" ]; then
  ERROR_COUNT=$(wc -l < "$ERRORS_FILE" | tr -d ' ')
  echo ""
  echo "UNPROCESSED ERRORS: $ERROR_COUNT tool failure(s) from prior session(s)."
  echo "Review .claude/error-history.jsonl; capture any recurring fix as a Backlog note or auto-memory."

  # Archive errors to a rolling history (gitignored) and clear for the new session.
  if [ -d "$CLAUDE_PROJECT_DIR/.claude" ]; then
    cat "$ERRORS_FILE" >> "$CLAUDE_PROJECT_DIR/.claude/error-history.jsonl"
  fi
  : > "$ERRORS_FILE"
fi

# Add session boundary marker to audit log
AUDIT_LOG="$CLAUDE_PROJECT_DIR/.claude/audit.log"
if [ -f "$AUDIT_LOG" ] || [ -d "$(dirname "$AUDIT_LOG")" ]; then
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tool\":\"SESSION_START\",\"target\":\"---\"}" >> "$AUDIT_LOG"
fi

exit 0

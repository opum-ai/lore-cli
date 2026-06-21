#!/bin/bash
# Error detection hook for PostToolUseFailure
# Logs tool failures to session-errors.jsonl
# Exit 0 always (non-blocking, informational)

. "$(dirname "$0")/_common.sh"

INPUT=$(cat)

# Skip if user interrupt (not a real error)
IS_INTERRUPT=$(echo "$INPUT" | jq -r '.is_interrupt // false')
if [ "$IS_INTERRUPT" = "true" ]; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
ERROR=$(echo "$INPUT" | jq -r '.error // "unknown"' | head -c 500)
INPUT_SUMMARY=$(echo "$INPUT" | jq -c '.tool_input // {}' | head -c 300)

ERRORS_FILE="$CLAUDE_PROJECT_DIR/.claude/session-errors.jsonl"
SESSION_ID="${CLAUDE_SESSION_ID:-$(date -u +%Y%m%dT%H%M%S)-$$}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Generate fingerprint: md5 of tool + first line of error (for dedup)
ERROR_FIRST_LINE=$(echo "$ERROR" | head -1)
FINGERPRINT=$(printf '%s|%s' "$TOOL_NAME" "$ERROR_FIRST_LINE" | md5 -q 2>/dev/null || printf '%s|%s' "$TOOL_NAME" "$ERROR_FIRST_LINE" | md5sum | cut -d' ' -f1)

# Append JSONL entry with fingerprint
jq -nc --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" --arg error "$ERROR" \
  --arg input_summary "$INPUT_SUMMARY" --arg session_id "$SESSION_ID" \
  --arg fingerprint "$FINGERPRINT" \
  '{ts: $ts, tool: $tool, error: $error, input_summary: $input_summary, session_id: $session_id, fingerprint: $fingerprint}' >> "$ERRORS_FILE"

exit 0

#!/bin/bash
# Checkpoint save after file modifications
# Used by PostToolUse hook for Edit|Write
# Updates .checkpoint JSON with current state
# Preserves progress fields (task, phase, done, next) across updates
# Exit 0 always (non-blocking)

. "$(dirname "$0")/_common.sh"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

CHECKPOINT_FILE="$CLAUDE_PROJECT_DIR/.checkpoint"

# Get current git info
BRANCH=$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Read existing checkpoint or create new (handle malformed JSON gracefully)
if [ -f "$CHECKPOINT_FILE" ] && jq empty "$CHECKPOINT_FILE" 2>/dev/null; then
  EXISTING=$(cat "$CHECKPOINT_FILE")
  # Append file to modified list if not already there
  FILES_MODIFIED=$(echo "$EXISTING" | jq -r --arg f "$FILE_PATH" '.files_modified + [$f] | unique')
  # Preserve progress fields
  TASK=$(echo "$EXISTING" | jq -r '.task // ""')
  PHASE=$(echo "$EXISTING" | jq -r '.phase // ""')
  DONE=$(echo "$EXISTING" | jq -c '.done // []')
  NEXT=$(echo "$EXISTING" | jq -c '.next // []')
else
  FILES_MODIFIED=$(echo "[]" | jq --arg f "$FILE_PATH" '. + [$f]')
  TASK=""
  PHASE=""
  DONE="[]"
  NEXT="[]"
fi

# Write checkpoint (with progress fields preserved)
jq -n \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg branch "$BRANCH" \
  --arg last_commit "$LAST_COMMIT" \
  --arg tool "$TOOL_NAME" \
  --argjson files_modified "$FILES_MODIFIED" \
  --arg last_file "$FILE_PATH" \
  --arg task "$TASK" \
  --arg phase "$PHASE" \
  --argjson done "$DONE" \
  --argjson next "$NEXT" \
  '{
    timestamp: $ts,
    branch: $branch,
    last_commit: $last_commit,
    tool: $tool,
    files_modified: $files_modified,
    last_file: $last_file,
    task: $task,
    phase: $phase,
    done: $done,
    next: $next
  }' > "$CHECKPOINT_FILE"

exit 0

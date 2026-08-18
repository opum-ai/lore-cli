#!/bin/sh

# Read-only inventory of Git registrations, Treehouse status, and registered paths.
set -u

repo_input=${1:-.}
base_input=${2:-}

repo_root=$(git -C "$repo_input" rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: not inside a Git repository: $repo_input" >&2
  exit 2
}

if [ -n "$base_input" ]; then
  base_ref=$base_input
else
  base_ref=$(git -C "$repo_root" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
  if [ -z "$base_ref" ]; then
    base_ref=HEAD
  fi
fi

audit_tmp=$(mktemp "${TMPDIR:-/tmp}/treehouse-audit.XXXXXX") || exit 2
trap 'rm -f "$audit_tmp"' EXIT HUP INT TERM

echo "repository=$repo_root"
echo "integration_ref=$base_ref"

echo "primary_status_begin"
git -C "$repo_root" status --porcelain=v2 --branch
echo "primary_status_end"

echo "git_worktrees_begin"
git -C "$repo_root" worktree list --porcelain
echo "git_worktrees_end"

git -C "$repo_root" worktree list --porcelain | awk '/^worktree / { sub(/^worktree /, ""); print }' > "$audit_tmp"

echo "treehouse_like_registered_paths_begin"
grep '/\.treehouse/' "$audit_tmp" || true
echo "treehouse_like_registered_paths_end"

while IFS= read -r worktree_path; do
  [ -n "$worktree_path" ] || continue
  echo "worktree_detail_begin"
  echo "path=$worktree_path"

  if [ ! -e "$worktree_path" ]; then
    echo "physical_state=missing"
    echo "worktree_detail_end"
    continue
  fi

  echo "physical_state=present"
  size_kib=$(du -sk "$worktree_path" 2>/dev/null | awk '{print $1}')
  echo "size_kib=${size_kib:-unknown}"

  if ! git -C "$worktree_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git_state=invalid"
    echo "worktree_detail_end"
    continue
  fi

  echo "git_state=valid"
  head_sha=$(git -C "$worktree_path" rev-parse HEAD 2>/dev/null || true)
  echo "head=${head_sha:-unknown}"
  echo "status_begin"
  git -C "$worktree_path" status --porcelain=v2 --branch
  echo "status_end"

  if [ -n "$head_sha" ] && git -C "$repo_root" rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1; then
    if git -C "$repo_root" merge-base --is-ancestor "$head_sha" "$base_ref"; then
      echo "head_ancestor_of_integration=true"
    else
      echo "head_ancestor_of_integration=false"
    fi
  else
    echo "head_ancestor_of_integration=unknown"
  fi
  echo "worktree_detail_end"
done < "$audit_tmp"

if command -v treehouse >/dev/null 2>&1; then
  echo "treehouse_version=$(treehouse --version 2>&1)"
  echo "treehouse_status_begin"
  treehouse_output=$(cd "$repo_root" && treehouse status --json 2>&1)
  treehouse_code=$?
  printf '%s\n' "$treehouse_output"
  echo "treehouse_status_exit=$treehouse_code"
  echo "treehouse_status_end"
else
  echo "treehouse_status=unavailable"
fi

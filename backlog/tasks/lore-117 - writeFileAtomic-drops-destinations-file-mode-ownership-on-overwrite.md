---
id: LORE-117
title: writeFileAtomic drops destination's file mode/ownership on overwrite
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
writeFileAtomic (src/commands/fswrite.ts:187-221), used by `lore sync` to atomically overwrite existing docs, writes its temp file with writeFileSync(tmpPath, contents) using no explicit mode and never stats the destination's existing permissions or ownership before renameSync(tmpPath, absPath) replaces it. As a result, any non-default mode (e.g. a doc made group-writable, or one with restrictive 600 perms) or ownership on the original file is silently replaced by the temp file's default-umask mode after every sync write. This is a regression risk for any docs bundle that relies on file permissions for access control or shared-editing setups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 writeFileAtomic preserves the destination file's existing mode bits (and ownership where the process has privilege to do so) across an overwrite, verified by a test that chmods a target file to a non-default mode (e.g. 0o640), runs writeFileAtomic against it, and asserts the mode is unchanged afterward.
- [ ] #2 The preservation logic correctly handles the first-write case (destination does not yet exist) by falling back to default-umask behavior without erroring when there is no prior mode to preserve.
<!-- AC:END -->

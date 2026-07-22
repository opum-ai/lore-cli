---
id: LORE-182
title: 'schema confineOutDir: retain isAbsolute(rel) guard for win32 cross-drive --out'
status: To Do
assignee: []
created_date: '2026-07-22 17:14'
labels:
  - cmd-meta-a
dependencies: []
priority: low
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-124 replaced confineOutDir's isAbsolute(rel) clause with isAbsolute(out) on the raw --out arg, calling the old clause 'dead code on POSIX'. Verified via path.win32 it was LIVE on Windows (in the CI matrix): for a cross-drive drive-relative --out (e.g. 'C:foo' with the repo on 'D:'), isAbsolute(out) is false and rel is not a '..' climb, but path.relative returns an absolute path — so the old isAbsolute(rel) clause rejected it while the new guard lets it through. Blast radius is contained (pruneOrphans unreachable; writes stay lexically inside repo; NTFS rejects the ':' component -> an io-mapped LoreError), so the net effect is a confusing IO error instead of a clean usage error on an exotic win32-only input — no traversal, no deletion, no data loss. Fix: retain '|| isAbsolute(rel)' belt-and-suspenders so win32 cross-drive drive-relative --out surfaces the clean usage error again. Flagged by the wave-6 LORE-124 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 confineOutDir rejects a win32 cross-drive drive-relative --out (e.g. 'C:foo' with repo root on another drive) with the clean usage LoreError, verified via a path.win32-based unit test matching the codebase's existing win32-path test convention
- [ ] #2 All existing schema-export absolute/relative --out behavior from LORE-124 is preserved on POSIX
- [ ] #3 Typecheck and the full bun test suite are green
<!-- AC:END -->

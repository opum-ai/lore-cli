---
id: LORE-48
title: 'lore check follow-ups: --external liveness, MDX/filename portability rules'
status: To Do
assignee: []
created_date: '2026-06-28 00:35'
labels:
  - cmd
  - ci
dependencies:
  - LORE-30
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-ups deferred from LORE-30 (lore check shipped link/anchor + portability passes).

Scope:
1. --external external-URL liveness — LORE-30 accepts the flag but defers the network check. Implement opt-in, non-deterministic liveness on a separate non-blocking path (excluded from the default deterministic gate, ADR-0007). No Rust/lychee runtime dep.
2. Portability lint additions (warn-only) not yet covered:
   - MDX hazards: raw </{ in non-code prose (Docusaurus MDX build errors).
   - Filename rules (command layer): leading-underscore filenames and .mdx files (portable-markdown.md).
3. Carry-forward non-LORE-30 items parked in LORE-30 notes from PR #19's /code-review max:
   - normalizeLink uses posix.relative → cwd-dependent for an absolute toPath or ..-escaping fromPath; guard when LORE-35/index-gen pass non-relative paths.
   - Reuse/efficiency minors in links.ts (ensureMarkdownSuffix composing idFromPath; drop redundant double posix.normalize; hoist regex literals).

Status-reconciliation and managed-block-drift passes of lore check are NOT here — they are their own tasks gated on the Backlog JSON adapter + lore sync (LORE-26).
<!-- SECTION:DESCRIPTION:END -->

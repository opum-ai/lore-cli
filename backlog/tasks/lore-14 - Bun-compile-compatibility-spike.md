---
id: LORE-14
title: Bun compile compatibility spike
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-07-11 14:13'
labels:
  - spike
milestone: m-1
dependencies: []
priority: low
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirm remark/unified (and the deferred MCP SDK) bundle and run inside bun build --compile; document native-module caveats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A compiled binary runs a remark pipeline
- [x] #2 Caveats recorded in tech-stack.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPORTANT REINTERPRETATION of AC#1: "remark" is not actually a lore dependency
and never has been (package.json has only mdast-util-from-markdown, gray-matter,
js-yaml, zod -- no unified/remark/remark-validate-links/remark-parse/
remark-stringify anywhere). tech-stack.md and several ADRs described an
aspirational remark/unified architecture that was amended during LORE-22 (per
ADR-0008's own body: "not `unified().use(remarkParse)`") but the surrounding
prose in tech-stack.md/ADR-0001 was never updated to match, leaving a real
doc/reality drift. AC#1 is satisfied against the ACTUAL pipeline lore ships
(mdast-util-from-markdown parse + gray-matter frontmatter + zod validation +
hand-rolled link/anchor walk), verified by running the compiled binary's
`check`/`validate` commands against the real docs/ bundle -- not literally
"a remark pipeline", which does not exist in this codebase.

Real finding (the actual spike value): reproduced a previously-undocumented
`bun build --compile` failure mode. Compiling with --outfile on a DIFFERENT
mounted filesystem than the source checkout (e.g. repo on /Volumes/external,
--outfile under /tmp on the internal disk) silently produces a 0-byte binary
at exit 0, no error on stdout or stderr -- `--version`/`--help` against it also
exit 0 with empty output. Root cause: EXDEV on bun's internal
compile-then-rename step, swallowed rather than surfaced. Confirmed the fix:
compiling to an --outfile on the SAME filesystem as the checkout produces a
correct ~60MB working binary every time. This refines/corrects the earlier
"external-volume Bun EXDEV traps" auto-memory note (which attributed it to
"/Volumes/external" specifically) -- the real trigger is CROSS-DEVICE, not
any one named volume. The existing CI `compile smoke` job was already immune
(single-runner filesystem) and already asserts non-empty/working output, not
just exit code -- its comment now explains why, and tech-stack.md §1 records
the full repro + fix for local compiles.

Also confirmed: none of the 4 real v1 dependencies (gray-matter, js-yaml,
mdast-util-from-markdown, zod) ship a native addon (no .node files, no
binding.gyp) -- no native-module caveat beyond the EXDEV one.

Scope note: tech-stack.md and ADR-0001 (one factual list) are corrected here,
matching AC#2's literal scope (tech-stack.md). Six OTHER docs also reference
the stale remark/unified framing (docs/index.md, ADR-0007, ADR-0008, ADR-0010,
ADR-0011, architecture.md, lore-design.md, okf-conformance.md) -- left
untouched deliberately: those are ADRs/specs narrating point-in-time decisions
or a wider architecture story, and reconciling all of them is a bigger,
separate documentation-accuracy audit, not this spike's scope. Filed as a new
follow-up task rather than silently expanding this one.

Gates: 1433 tests, biome clean, tsc clean, lore check 0/0, lore validate 0
errors (fixed a summary-length warning my own edit introduced in tech-stack.md).
<!-- SECTION:NOTES:END -->

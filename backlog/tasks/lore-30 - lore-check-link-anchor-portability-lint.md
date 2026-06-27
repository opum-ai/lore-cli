---
id: LORE-30
title: 'lore check: link/anchor + portability lint'
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-27 22:50'
labels:
  - cmd
  - ci
milestone: m-4
dependencies:
  - LORE-28
documentation:
  - docs/adr/0007-validation-and-coherence.md
  - docs/reference/portable-markdown.md
priority: high
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Whole-bundle internal cross-link + heading-anchor validation (pure-JS remark-validate-links; internal by default; external opt-in via --external) plus portability lint (detection-only). No Rust/lychee runtime dep.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anchor rot is detected across files
- [ ] #2 Wikilinks/embeds/callouts are flagged as warnings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FOLLOW-UP folded from the /code-review max of PR #19 (LORE-28, the links.ts primitive). LORE-30 is where validateLink gets wired into lore check's portability lint, so these CONFIRMED validateLink classifier defects must be fixed as part of (or before) that wiring — they are latent today only because validateLink has no caller yet:

- missing-extension false-NEGATIVE on dotted filenames: posix.extname!='' so [x](orders.v2) for orders.v2.md is not flagged (links.ts:238).
- missing-extension accepts wrong-CASE .MD/.Md as a valid extension; no lowercase-.md check → [x](orders.MD) passes but 404s on GitHub/Linux (violates AC#1) (links.ts:238).
- missing-extension false-POSITIVE on dotfiles/dir links: [x](../config/.gitignore) and [x](../reference/) get 'missing .md' (links.ts:238).
- fragment/query stripped BEFORE the unencoded scan, so raw destination-breaking chars in #frag/?query are never flagged: [x](orders.md#Archival Policy) passes but truncates on CommonMark (links.ts:234).
- over-encoded segment misclassified 'unencoded' (isCanonicallyEncoded strict re-encode equality): a%41b.md flagged though it = aAb.md everywhere (links.ts:285).
- internal double-slash a//b.md flagged by nothing (empty segment 'continue') (links.ts:247).
- classifier runs on still-ENCODED path while the bundle resolver decodeTarget()s first → the two diverge for any %-encoded extension once validateLink is wired (links.ts:234).
- 'unencoded' message is one-size: also fires for MALFORMED %-escapes where the 'encode a space' advice is wrong (refuted as its own finding but worth a distinct message).

ALSO from the same review, NOT LORE-30's code but tracked here so it isn't lost:
- [LORE-28/validate, SHIPPING] resourceFor now escapes ( ) ! ' * via the shared encoder, but the resource-drift check (validate.ts:299, actual===expected, no decode) byte-mismatches every pre-existing stamped resource: URL containing those chars → false 'resource stale' warnings that fail lore validate --strict on upgrade. Fix belongs on PR #19 or a LORE-28 follow-up (decode-tolerant compare or migrate stored values), not LORE-30.
- [links.ts, PLAUSIBLE] normalizeLink uses posix.relative which resolves relative inputs against process.cwd(); an absolute toPath or a ..-escaping fromPath yields cwd-dependent output, contradicting the pure/deterministic contract. Guard when LORE-35/index-gen pass non-relative paths.
- Reuse/efficiency (minor): extract one pathPart() (stripQuery∘stripFragment, 3 sites); ensureMarkdownSuffix should compose idFromPath; drop redundant double posix.normalize; hoist regex literals.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-06-27 22:50
---
Unblocked: LORE-28 delivered via PR #19 (822592a on dev). The folded [LORE-28/validate, SHIPPING] resourceFor resource-drift item is RESOLVED on #19 (decode-tolerant compare). Remaining LORE-30 scope unchanged: validateLink classifier defects (wire-time fixes) + validateLinks(graph)+anchors + body-text Obsidian/MDX scan + reserved index.md/log.md link-gate exclusion.
---
<!-- COMMENTS:END -->

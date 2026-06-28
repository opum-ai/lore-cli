---
id: LORE-30
title: 'lore check: link/anchor + portability lint'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-28 00:33'
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
- [x] #1 Anchor rot is detected across files
- [x] #2 Wikilinks/embeds/callouts are flagged as warnings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix the 8 folded validateLink classifier defects in src/core/links.ts (TDD in test/links.test.ts): wrong-case .md, dotfile/dir false-pos, dotted-filename, fragment/query unencoded scan, over-encoded false-pos, double-slash, encoded-vs-decoded consistency, malformed-escape message. Extract shared pathPart().
2. New pure engine src/core/check.ts (checkBundle(files)->CheckReport): GitHub heading slugger + dedup, extractHeadingSlugs, link/anchor pass (AC#1 anchor rot, exit-6 errors, resolve existence against full bundle membership set incl non-concept index.md/log.md), portability pass (AC#2 wikilinks/embeds/callouts + Obsidian-isms/MDX hazards, warn-only, mdast text-node scan excludes code spans).
3. Export extractBodyTargets from src/core/bundle.ts for reuse.
4. New thin command src/commands/check.ts (model on validate.ts): [paths...], --external (accepted, network deferred), --strict; exit 6 on broken link/anchor; render check.report.
5. Register check in src/cli.ts + USAGE.
6. Tests: test/check.test.ts, test/links.test.ts additions, cli/smoke wiring.
7. CHANGELOG Unreleased/Added.
Scope: ship link/anchor + portability passes only; status-recon + managed-block drift deferred (need LORE-26). --external network liveness deferred to follow-up.
<!-- SECTION:PLAN:END -->

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

Implemented on feat/lore-30-check. Shipped lore check with the link/anchor + portability passes (status-recon + managed-block drift deferred to post-LORE-26). Pure engine core/check.ts (checkBundle: membership-set link resolution incl reserved non-concept index.md/log.md → resolves the LORE-29 link-gate follow-up; GitHub-style heading slugger + dedup for AC#1 anchor rot; mdast text-node Obsidian-ism scan for AC#2). Thin commands/check.ts (--external accepted+deferred, --strict, exit 6 on broken link/anchor). All 8 folded validateLink classifier defects fixed in links.ts (TDD). core/check.ts + core/links.ts at 100% line/func. Dogfooded: lore check on the repo's own docs/ found + fixed 2 real defects (an em-dash anchor-rot in backlog-cli-contract.md, and a multi-line inline-code example in adr/0008 that parsed as a live link) — bundle now 0/0. Deferred (follow-ups): --external network liveness; MDX raw </{ + _-prefix/.mdx filename portability rules; the parked non-LORE-30 review items (normalizeLink cwd-relative guard; reuse/efficiency minors).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-06-27 22:50
---
Unblocked: LORE-28 delivered via PR #19 (822592a on dev). The folded [LORE-28/validate, SHIPPING] resourceFor resource-drift item is RESOLVED on #19 (decode-tolerant compare). Remaining LORE-30 scope unchanged: validateLink classifier defects (wire-time fixes) + validateLinks(graph)+anchors + body-text Obsidian/MDX scan + reserved index.md/log.md link-gate exclusion.
---
<!-- COMMENTS:END -->

---
id: LCLI-355
title: Point platform npm latest dist-tags to 0.3.4 (ODOC-63.5 phase 1)
status: To Do
assignee: []
created_date: '2026-08-28 16:37'
updated_date: '2026-08-28 16:38'
labels:
  - infrastructure
  - release
dependencies: []
ordinal: 476000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Infrastructure housekeeping under direct-user production authority (FMC correlation 798566cff4cd4e91ab1f3a97031db02b, Controller task ODOC-63.5): set latest=0.3.4 on the six @opum-ai/lore platform packages only; root @opum-ai/lore latest stays 0.3.2 this phase. Precondition proven: registry 0.3.4 shasum+integrity byte-match qualified candidate final-lore-9ea1b47 provenance for all six platform tarballs; prior tags latest=0.3.2, release-candidate=0.3.4 on all seven. No tarball/version writes; dist-tag operations only; fail closed on auth errors with exact user commands.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
EXECUTION STATE (2026-08-28): BLOCKED on npm EOTP — fail-closed after exactly one probe attempt (no retry loop, no browser/MFA interaction). Single attempt: npm dist-tag add @opum-ai/lore-darwin-arm64@0.3.4 latest -> EOTP 'This operation requires a one-time password from your authenticator'; post-failure read-only verification: all seven packages unchanged (latest=0.3.2, release-candidate=0.3.4). PRECONDITION PROVEN: all six platform @opum-ai/lore-*-0.3.4 registry artifacts byte-match qualified candidate final-lore-9ea1b47 provenance.json (npm_shasum_sha1_hex + npm_integrity exact for darwin-arm64 951ad26b…, darwin-x64 b97e94f6…, linux-arm64 2b80f014…, linux-x64 b85395da…, win32-arm64 e308225a…, win32-x64 38ea9d7f…). Exact user command set (from any directory; platform-first, root excluded; requires npm login + --otp=<code> from the user's authenticator): npm dist-tag add @opum-ai/lore-darwin-arm64@0.3.4 latest --otp=<code>; npm dist-tag add @opum-ai/lore-darwin-x64@0.3.4 latest --otp=<code>; npm dist-tag add @opum-ai/lore-linux-arm64@0.3.4 latest --otp=<code>; npm dist-tag add @opum-ai/lore-linux-x64@0.3.4 latest --otp=<code>; npm dist-tag add @opum-ai/lore-win32-arm64@0.3.4 latest --otp=<code>; npm dist-tag add @opum-ai/lore-win32-x64@0.3.4 latest --otp=<code>. After the user completes the tag moves, verify: npm view <pkg> dist-tags shows latest=0.3.4 and release-candidate=0.3.4 for each platform package, root @opum-ai/lore latest still 0.3.2. Root-package latest move (0.2.9 quest / 0.3.4 lore promotion) is a SEPARATE later phase with its own authority.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blocked on npm EOTP by design (no OTP capability, no retry loop). All six platform registry artifacts proven byte-identical to qualified candidate final-lore-9ea1b47; exact user command set recorded for the tag moves; root package deliberately untouched.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: LCLI-323
title: >-
  lore check --strict is wall-clock dependent: an elapsed stale_after flips a
  green bundle to exit 6 with no commit
status: To Do
assignee: []
created_date: '2026-08-13 03:46'
updated_date: '2026-08-13 03:46'
labels:
  - bug
  - check
  - determinism
  - okf
dependencies: []
documentation:
  - docs/reference/lore-competitive-feature-matrix.md
  - docs/specs/lore-competitive-adoption-roadmap.md
priority: high
type: bug
ordinal: 446000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `check` gate — the command whose purpose is to make bundle state reproducible — reads the system clock, so its exit code is not a function of the bundle contents alone.

`staleAfterFindings` in `src/core/check.ts` compares an OKF 0.2 concept's `stale_after` frontmatter date against today and emits a warning-tier `stale-after` finding once the date has elapsed. `--strict` promotes warnings to a failing exit code. The result is that an unchanged commit passes today and fails tomorrow.

This contradicts the guarantee stated in `lore instructions` and the CLI contract — that the same inputs against an unchanged bundle always produce the same output and exit code — and it does so inside the gate that guarantee is meant to protect. A consumer pinning a commit in CI can have a previously green build start failing with no change to the repository.

Reproduced empirically on 2026-08-13 with a negative control, running from source against a scratch OKF 0.2 bundle whose only unusual content was `stale_after: 2020-01-01`:

```
warning reference/stale-probe.md [stale-after]: content is stale:
  stale_after 2020-01-01 has elapsed as of 2026-08-13
2 files, 0 errors, 1 warning

lore check          -> exit 0
lore check --strict -> exit 6
```

Exposure timing matters and buys room to fix this properly: the published 0.1.1 binary does NOT reproduce it, because it does not implement OKF 0.2 staleness semantics and `lore init` there still writes an 0.1 bundle. The defect therefore reaches users with the next release rather than being live in the field today.

The rule itself is correct and worth keeping — OKF 0.2 defines `stale_after` as absolute-date lifecycle state and surfacing elapsed freshness is useful. What is wrong is the implicit input. The fix is to make the evaluation date an explicit, pinnable input rather than an ambient read of the clock. Prior art: claude-obsidian gates the same class of finding behind `lint --as-of YYYY-MM-DD` so a freshness-aware linter stays reproducible in CI.

Note this affects any future date-relative rule too, not just `stale_after` — OKF 0.2 `usage_window` and `verified` are the obvious next ones. Fixing the mechanism once is cheaper than fixing each rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every date-relative rule in check/validate resolves its evaluation date from one explicit input, never from an ambient system-clock read at the point of use
- [ ] #2 An --as-of YYYY-MM-DD flag pins that date; an invalid or non-calendar value is a usage error (exit 2), not a silent fallback to today
- [ ] #3 The default behaviour when --as-of is omitted is decided and documented explicitly (commit date, or refuse to evaluate staleness) rather than left as an implicit clock read
- [ ] #4 A regression test proves the negative control: a fixture whose stale_after has elapsed fails under --strict without a pin, and passes with an --as-of date preceding it
- [ ] #5 A second regression test proves the same bundle and the same --as-of value yield an identical exit code and identical finding output across runs
- [ ] #6 cli-surface.md and cli-contract.md record --as-of and state plainly which rules are date-sensitive
- [ ] #7 okf-conformance.md stale_after row is updated to describe the pinned-date evaluation
<!-- AC:END -->

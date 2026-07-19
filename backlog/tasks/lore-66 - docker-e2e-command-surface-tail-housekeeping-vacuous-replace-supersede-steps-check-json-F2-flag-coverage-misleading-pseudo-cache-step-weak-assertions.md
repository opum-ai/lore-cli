---
id: LORE-66
title: >-
  docker/e2e command-surface tail + housekeeping: vacuous replace/supersede
  steps, check --json/F2, flag coverage, misleading pseudo-cache step, weak
  assertions
status: To Do
assignee: []
created_date: '2026-07-19 23:00'
labels:
  - e2e
  - testing
dependencies:
  - LORE-56
  - LORE-61
references:
  - docker/e2e/run-e2e.sh
  - src/commands/check.ts
  - docs/runbooks/docker-e2e-testing-environment.md
priority: medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found a tail of command-surface gaps plus misleading/weak existing steps. Grouped here because each item is a one-to-four-line addition in the script's existing idiom.

**Vacuous steps giving false confidence (report.jsonl-verified):**
- `replace` (L285-290) matched NOTHING: totalMatches:0, filesChanged:0 — no replacement, no managed-region skip ever exercised; the "managed region untouched" check passes trivially. --regex/--in/--dry-run/invalid-regex-usage-2 also untouched.
- `supersede --rewrite-links` (L303-308) reported rewroteLinks:false (no inbound body link existed to rewrite) — the inbound-repoint engine never ran E2E; nothing asserts the field. The conflict-5 re-run path (simply run the same supersede twice) is untested.

**Never exercised:**
- `check --json` — all five check invocations are flagless; the check.report envelope kind, counts, and the F2 dual-stream shape (report envelope on stdout PLUS ErrorEnvelope on stderr with the deferred reconciliation error exit — src/commands/check.ts:156-164) are never asserted. check is the CI gate agents parse.
- sync --dry-run (writes nothing) and --no-index; link --no-back-ref / unlink --allow-missing; init idempotent re-run (documented exit-0-with-skipped-list, cli-surface.md:55-58 — init runs exactly once, L124-138); agents --check (drift gate: exit 6 by return WITH the report on stdout — another stdout-silence exception) / --force / the protected hand-edited path / the entire CLAUDE.md nudge-block half (agent-bridge.ts:241-246); validate --strict; check --external (the offline container is the IDEAL place to prove liveness failures never gate: every URL must fail, exit must stay 0); scaffold re-run conflict-5 / --force / unknown-target usage-2; multi-root check per-root isolation (Promise.allSettled, check.ts:401-427); query truncation contract + zero-hits; long-tail flags (new --var/--template/--summary/--tags/--out, query --tag/--status/--field, tasks --status, orphans --docs-only, graph --depth, instructions topics sync/check/validation + unknown-topic-3, help positional + unknown-command-3, -v/-h, bare lore, unknown command); pre-init not-a-lore-project exit 3.

**Housekeeping (misleading/weak steps):**
- L213-215 "stale-cache" step tests a mechanism that DOES NOT EXIST (no cross-process probe cache anywhere in the code; adapter memoization is per-instance) — it is an exact duplicate of the L209 hidden-binary test under a misleading name, and its hardcoded exit 3 would mask the genuine stale-cache gap the day a cache ships. Rename or delete.
- L120 `lore --version` asserts exit 0 only and the binary actually printed 0.0.0 (report-verified) — a broken version embed ships silently through E2E. Mirror the non-0.0.0 demand L122 already applies to the backlog binary.
- L226 `git log | wc -l > 0` passes on ANY commit (link already committed in phase 4 — attributes nothing to sync); replace with a commit-content check.
- L358 auto-plain step asserts exit 0 only, not that piped output is ANSI-free.

**Explicitly accepted as not-coverable in Docker (document in the runbook header, do not force):** exit-1 uncaught (deliberately unreachable), live Obsidian consumer verification (no headless mode; unit tests already pin exact values, manual obsidian CLI remains the documented path), true TTY pretty rendering (partially closable via script(1) if cheap).

The audit produced a concrete proposed step for every item — re-derive against the current script at execution time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 replace genuinely replaces (totalMatches >= 1, filesChanged >= 1) with the managed-region protection actually triggered by a match inside the block region, and invalid regex exits 2
- [ ] #2 supersede --rewrite-links reports rewroteLinks == true against a real inbound link, and a re-run of the same supersede hits conflict exit 5
- [ ] #3 check runs with --json (kind check.report asserted) and the F2 dual-stream shape is pinned: report envelope on stdout plus ErrorEnvelope on stderr on a deferred reconciliation error
- [ ] #4 Flag/lifecycle coverage added per the description list: sync --dry-run writes nothing; link --no-back-ref and unlink --allow-missing; init idempotent re-run; agents --check/--force and CLAUDE.md nudge-block prose preservation; validate --strict; check --external never gates offline; scaffold re-run/--force/unknown target; multi-root check; query truncation and zero-hits; the long-tail one-liners
- [ ] #5 Housekeeping done: the pseudo cache step is renamed or deleted; lore --version demands non-0.0.0; the git log wc -l step is replaced with a commit-content check; the auto-plain step asserts ANSI-free output; the not-coverable items are documented in the runbook header
- [ ] #6 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->

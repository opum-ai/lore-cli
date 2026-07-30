---
type: Runbook
title: Dependency boundary campaign handover
tags:
  - handover
  - dependencies
  - maintenance
  - campaign
summary: Persistent cross-session cursor for the four-task dependency-boundary maintenance campaign.
timestamp: 2026-07-30T17:06:00Z
---

# Dependency boundary campaign handover

## Purpose

Complete four focused dependency-boundary maintenance tasks in this strict
order:

1. `LCLI-286` — delegate SSRF IP parsing, normalization, and CIDR matching to
   exact-pinned `ipaddr.js`.
2. `LCLI-287` — delegate GitHub heading slugging and duplicate state to
   exact-pinned `github-slugger`.
3. `LCLI-285` — delegate terminal display width to exact-pinned
   `string-width`.
4. `LCLI-288` — consolidate parsed config shape validation on the existing
   exact-pinned Zod dependency.

The campaign is authorized maintenance outside the normal `LCLI-283.1.1`
cursor. It must not implement LadybugDB, Commander, the explorer, local MCP, or
the deferred dependency investigations. Each task ships independently from the
current local campaign baseline and is integrated locally before the cursor
advances.

## Current cursor

- **Current task:** `LCLI-288` — Consolidate Lore config shape validation on
  Zod.
- **Live Backlog status:** `To Do` as of 2026-07-30, unassigned; live Backlog
  state remains authoritative over this handover.
- **Current branch:** `dev`.
- **Initial campaign base:**
  `1e2e6dc4c9f59328cf22b6ca3bb13e49ce111f6b`
  (`1e2e6dc4c9f5`).
- **Current local campaign baseline/integrated HEAD:**
  `49e86bb02940eddf70e17d98a1c6fc95519355ea`
  (`49e86bb`).
- **Next task cursor:** `LCLI-288`; do not clear the maintenance cursor until
  it is finalized, integrated, the complete repository gates pass, and this
  runbook is marked complete.

## Completed work

- `LCLI-286` is Done and integrated into local `dev`.
  - `2a00c49` — activate and assign the task.
  - `d8fc743` — record the researched implementation plan.
  - `6dc2365` — record acceptance evidence, final summary, and Done status.
  - `6ed37e2` — exact-pin `ipaddr.js` 2.4.0, delegate the generic primitive,
    add conformance/security regressions, and update shipping documentation.
- `LCLI-287` is Done and integrated into local `dev`.
  - `fd7d74b` — activate, assign, and record the researched implementation
    plan.
  - `60c953c` — exact-pin `github-slugger` 2.0.0, delegate slug/duplicate
    state, add conformance/isolation fixtures, and update shipping docs.
  - `1745437` — record acceptance evidence, final summary, and Done status.
- `LCLI-285` is Done and integrated into local `dev`.
  - `57dd271` — activate, assign, and record the researched implementation
    plan.
  - `921032f` — exact-pin `string-width` 8.2.2, delegate display width, add
    before/after and exact-row fixtures, and update shipping documentation.
  - `49e86bb` — record acceptance evidence, final summary, and Done status.
- `LCLI-288` has not started.

## Current implementation state

The first three dependency boundaries are shipping on the local campaign
baseline:

- `ipaddr.js` 2.4.0 owns strict address parsing, normalization, CIDR parsing,
  and membership matching. Lore retains the explicit SSRF range policy, DNS,
  redirects, timeouts, body disposal, fail-closed behavior, redaction, and
  DNS-rebinding boundary.
- `github-slugger` 2.0.0 owns GitHub-compatible slug transformation and
  per-document duplicate state. Lore retains mdast heading-text extraction
  (including image-alt exclusion), link policy, findings, and output.
- `string-width` 8.2.2 owns grapheme segmentation, Unicode width data, and
  display-column measurement. Lore retains field coercion, ANSI/control
  sanitization, padding, row composition, output modes, streams, color, exits,
  and ordering. The resolved runtime graph is `get-east-asian-width` 1.6.0,
  `strip-ansi` 7.2.0, and `ansi-regex` 6.2.2.

`LCLI-288` is independent and begins from this integrated state. Zod 4.4.3 is
already exact-pinned; the task must consolidate only generic parsed-TOML shape
validation in `src/config.ts`, leaving secret scanning, environment overlay,
Bun TOML I/O and parse mapping, defaults, reserved override-key policy,
page-id precision, and Lore error semantics explicit.

## Exact next action

Run `backlog instructions task-execution`, re-open the full live `LCLI-288`
record, and inspect `src/config.ts` plus `test/config.test.ts` to capture the
accepted/rejected behavior oracle. Research the already-pinned Zod 4.4.3
release, license, maintenance, engine, dependency, security, and pinned-Bun
posture. Then activate and assign only `LCLI-288`, record the researched plan
through Backlog, commit that activation on `dev`, and create a focused
`feature/lcli-288-zod-config-shape` branch from the resulting baseline.

## Decisions, blockers, and risks

- **Decisions:** campaign order and scope are fixed. `LCLI-288` reuses the
  existing exact Zod pin and must remove obsolete generic validators instead
  of retaining parallel implementations.
- **Blockers:** none.
- **Risks:** Zod must not absorb operational or security policy. Unknown-key
  tolerance, snake_case projection, zero-config defaults, environment overlay,
  credential-safe errors, recursive committed-secret detection, unsafe-key
  rejection, and precise numeric page-id rules must remain compatible. Error
  mapping must stay stable even if Zod supplies the generic shape failure.

## Verification

Campaign/session setup completed:

- `backlog instructions overview`
- `backlog instructions task-execution`
- `lore instructions` plus sync/validation/check guidance
- required repository, docs, git, and live `LCLI-285`–`LCLI-288` inspection
- pinned Bun `1.2.23` (`cf136713`) confirmed

`LCLI-286` and `LCLI-287` verification is recorded in their live Backlog
records and focused commits. Final `LCLI-287` evidence included 2,239 passing
tests, clean audit/frozen install, host and five-target compilation, npm
packaging, and strict Lore gates.

Completed for `LCLI-285`:

- package license, maintenance/release, engines, integrity, resolved
  transitive graph, published-advisory, Bun-feature, and security review
- pre-change `bun test test/output.test.ts`: 80 passed
- post-change focused suite: 84 passed, 179 assertions
- post-change full suite: 2,243 passed, 6,375 assertions across 51 files
- `bun audit`: no vulnerabilities; `bun install --frozen-lockfile`: no changes
- `bun run lint`; `bun run typecheck`
- `bun run src/cli.ts --version`: `0.0.0`
- host `bun run build` and `./dist/lore --version`: pass, `0.0.0`, 222 modules
- all five Bun 1.2.23 targets compiled non-empty:
  - darwin-arm64: 61,352,400 bytes
  - darwin-x64-baseline: 67,433,136 bytes
  - linux-arm64: 98,401,400 bytes
  - linux-x64-baseline: 105,264,759 bytes
  - windows-x64-baseline: 119,888,384 bytes
- host binary: 61,335,888 before → 61,352,400 after (+16,512)
- `npm pack --dry-run --json --cache /private/tmp/lore-cli-npm-cache`: 65
  entries, no bundled dependencies
- `lore sync`; `lore validate --strict` (45 files, 0 errors/warnings);
  `lore check --strict` (45 files, 0 errors/warnings); `git diff --check`

Remaining for `LCLI-288`:

- behavior audit, dependency research, activation, plan, and focused branch
- before/after accepted and rejected config conformance fixtures for every
  acceptance criterion
- reusable Zod shape schemas and removal of superseded generic helpers
- focused config tests, security/credential-safety checks, audit/frozen install
- full test, lint, typecheck, build/version, five-target packaging, npm dry run
- Lore sync/strict validation/strict check and diff hygiene
- individual acceptance evidence, Done status, focused commits, local
  fast-forward integration, and final campaign reconciliation

## Working-tree and remote state

Local `dev` is at `49e86bb`, nineteen commits ahead of `origin/dev`
(`1afd3bba89dd0f43a7a6a13cab90fe916e018c58`) before this cursor-only commit.
The tracked worktree was clean immediately after the LCLI-285 fast-forward;
only this handover update and Lore's generated log entry belong to the cursor
commit. Ignored verification binaries remain under `dist/`. No pull, reset,
rebase, discard, push, or remote merge has been performed.

## Continuation prompt

```text
Continue the Lore CLI dependency-boundary campaign from
/Volumes/external/repos/lore-cli/docs/runbooks/dependency-boundary-campaign-handover.md.
Read AGENTS.md completely, run backlog instructions overview, read the Lore
skill and run lore instructions, then inspect git without cleaning. Treat live
Backlog status as authoritative. Confirm LCLI-286, LCLI-287, and LCLI-285 remain
Done and resume only LCLI-288 from local dev: research the existing exact-pinned
Zod 4.4.3 boundary, capture accepted/rejected config behavior, replace generic
parsed-TOML shape helpers with reusable Zod schemas, and preserve secret
scanning, environment overlay, Bun TOML parsing/error mapping, defaults,
unknown-key tolerance, reserved override-key rejection, precise page-id rules,
credential-safe errors, and all machine contracts. Complete all pinned-Bun,
packaging, security, Lore, and repository gates; finalize and integrate the
focused task; then mark this campaign complete and return the normal cursor to
docs/runbooks/dev-kickoff.md and LCLI-283.1.1 M6. Do not implement LadybugDB,
Commander, the explorer, local MCP, or deferred investigations. Do not push or
merge remotely.
```

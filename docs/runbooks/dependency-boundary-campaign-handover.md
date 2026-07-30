---
type: Runbook
title: Dependency boundary campaign handover
tags:
  - handover
  - dependencies
  - maintenance
  - campaign
summary: Persistent cross-session cursor for the four-task dependency-boundary maintenance campaign.
timestamp: 2026-07-30T16:20:18.295Z
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

- **Current task:** `LCLI-286` — Delegate SSRF address parsing and CIDR matching
  to `ipaddr.js`.
- **Live Backlog status:** `Done` as of 2026-07-30, assigned to
  `@codex`; live Backlog state remains
  authoritative over this handover.
- **Current branch:** `feature/lcli-286-ipaddr-js`.
- **Campaign base:** `1e2e6dc4c9f59328cf22b6ca3bb13e49ce111f6b`
  (`1e2e6dc4c9f5`).
- **Focused-branch base/current HEAD:**
  `d8fc743f7944054d0730849512cad2fba068b030`
  (`d8fc743f7944`); implementation is currently uncommitted.
- **Next task cursor:** `LCLI-286`; do not advance until it is finalized,
  integrated into the local campaign baseline, and this runbook is reconciled.

## Completed work

- `LCLI-286` implementation, verification, acceptance evidence, final summary,
  and Backlog finalization are complete.
- The focused implementation commit and local `dev` integration are still
  pending, so the campaign cursor has not advanced.

## Current implementation state

Initial inspection and package research are complete. `LCLI-286` is active with
a researched Backlog plan. `ipaddr.js` 2.4.0 is exact-pinned in `package.json`
and `bun.lock`; its MIT license, zero runtime/transitive dependency set, Node
10+ engine, built-in types, May 2026 release, registry integrity, upstream
advisory state, and pinned-Bun compatibility were checked.

The hand-written BigInt IPv4/IPv6 parsers and inclusive range arithmetic have
been removed. `ipaddr.js` now owns strict address validation, normalization,
CIDR parsing, and membership matching. Lore still owns the 13-entry explicit
blocked-range policy, rejects ambiguous/legacy IPv4 forms, preserves the
deprecated dotted IPv4-compatible label despite an upstream normalization
quirk, and retains DNS resolution, redirect-hop revalidation, bounded timeouts,
fail-closed behavior, response-body disposal, the documented DNS-rebinding
limitation, and redacted errors/output.

## Exact next action

Run `lore sync` to commit the terminal Backlog state, create the focused
implementation commit, fast-forward local `dev` to the feature branch, then
reconcile this handover with the integrated commits and advance the next-task
cursor to `LCLI-287` without activating that task.

## Decisions, blockers, and risks

- **Decisions:** campaign order and scope are fixed by the campaign prompt.
- **Blockers:** none.
- **Risks:** security-sensitive behavior must remain fail-closed; malformed,
  ambiguous, legacy-form, IPv4-mapped IPv6, and resolver-returned inputs must
  not become newly allowed. Compiled compatibility must be proved using the
  repository-pinned Bun version, not only a newer workstation Bun.

## Verification

Completed:

- `backlog instructions overview`
- `backlog instructions task-execution`
- `lore instructions`
- `lore instructions sync`
- `lore instructions validation`
- `lore instructions check`
- `git status --short --branch`
- `git log -8 --oneline`
- required documentation and live task inspection
- package metadata, license, maintenance, engine, dependency, integrity, and
  upstream advisory research
- pinned Bun `1.2.23` confirmed
- pre-change `bun test test/check.test.ts`: 255 passed, 0 failed
- post-change `bun test test/check.test.ts`: 255 passed, 0 failed
- post-change `bun test`: 2,227 passed, 0 failed
- `bun audit`: no vulnerabilities found
- `bun run lint`
- `bun run typecheck`
- host `bun run build` and `./dist/lore --version` (`0.0.0`)
- all five release targets compiled non-empty under Bun 1.2.23
- `npm pack --dry-run --json`
- compiled host size: 61,302,864 bytes before; 61,335,888 bytes after
  (33,024-byte increase)
- `lore sync`
- `lore validate --strict`
- `lore check --strict`
- `git diff --check`

Remaining for `LCLI-286`:

- focused implementation commit and local `dev` integration
- post-integration clean-tree and cursor reconciliation

## Working-tree and remote state

Before campaign activation, `dev` was clean at the expected baseline and seven
commits ahead of `origin/dev`. Lore created two local Backlog lifecycle commits,
placing the focused branch base at `d8fc743f7944`. The feature branch currently
contains uncommitted source, tests, dependency/lockfile, documentation, and
generated Lore index/log changes. Ignored compile artifacts exist under
`dist/`. No pull, reset, rebase, discard, push, or remote merge has been
performed.

## Continuation prompt

```text
Continue the Lore CLI dependency-boundary campaign from
/Volumes/external/repos/lore-cli/docs/runbooks/dependency-boundary-campaign-handover.md.
Read AGENTS.md completely, run backlog instructions overview, read the Lore
skill and run lore instructions, then inspect git without cleaning. Treat live
Backlog status as authoritative. Resume only the current task, LCLI-286:
delegate generic IP parsing, normalization, and CIDR matching to exact-pinned
ipaddr.js while preserving Lore's explicit blocked-range policy, DNS and
redirect behavior, bounded timeouts, response disposal, fail-closed and
redacted errors, and the documented DNS-rebinding limitation. Do not start
LCLI-287, LCLI-285, LCLI-288, LadybugDB, Commander, the explorer, local MCP, or
deferred investigations. Update this handover before stopping or advancing.
```

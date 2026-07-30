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

- **Current task:** `LCLI-287` — Delegate GitHub heading anchor slugging to
  `github-slugger`.
- **Live Backlog status:** `To Do` as of 2026-07-30, unassigned; live Backlog
  state remains authoritative over this handover.
- **Current branch:** `dev`.
- **Initial campaign base:**
  `1e2e6dc4c9f59328cf22b6ca3bb13e49ce111f6b`
  (`1e2e6dc4c9f5`).
- **Current local campaign baseline/integrated implementation HEAD:**
  `6ed37e2c9ccf260eeaf933ea47aab4a5d1d2272a`
  (`6ed37e2`).
- **Next task cursor:** `LCLI-287`; do not advance until it is finalized,
  integrated into the local campaign baseline, and this runbook is reconciled.

## Completed work

- `LCLI-286` is Done and integrated into local `dev`.
  - `2a00c49` — activate and assign the task.
  - `d8fc743` — record the researched implementation plan.
  - `6dc2365` — record acceptance evidence, final summary, and Done status.
  - `6ed37e2` — exact-pin `ipaddr.js` 2.4.0, delegate the generic primitive,
    add conformance/security regressions, and update shipping documentation.
- `LCLI-287`, `LCLI-285`, and `LCLI-288` are not started.

## Current implementation state

`LCLI-286` is shipping on the local campaign baseline. `ipaddr.js` 2.4.0 is
exact-pinned in `package.json` and `bun.lock`; its MIT license, zero
runtime/transitive dependency set, Node 10+ engine, built-in types, May 2026
release, registry integrity, upstream advisory state, and pinned-Bun
compatibility were checked.

The hand-written BigInt IPv4/IPv6 parsers and inclusive range arithmetic have
been removed. `ipaddr.js` now owns strict address validation, normalization,
CIDR parsing, and membership matching. Lore still owns the 13-entry explicit
blocked-range policy, rejects ambiguous/legacy IPv4 forms, preserves the
deprecated dotted IPv4-compatible label despite an upstream normalization
quirk, and retains DNS resolution, redirect-hop revalidation, bounded timeouts,
fail-closed behavior, response-body disposal, the documented DNS-rebinding
limitation, and redacted errors/output. The next sequential change,
`LCLI-287`, also modifies `src/core/check.ts` and must start from this integrated
baseline so it preserves the completed SSRF boundary.

## Exact next action

In the next session, repeat the required repository and campaign inspection,
run `backlog instructions task-execution`, confirm live `LCLI-287` is still
eligible, then activate and assign only `LCLI-287`. Research the current
`github-slugger` release and the existing slug consumers before recording its
plan or creating its focused feature branch.

## Decisions, blockers, and risks

- **Decisions:** campaign order and scope are fixed by the campaign prompt.
- **Blockers:** none.
- **Risks:** `LCLI-287` must preserve Lore's mdast heading-text extraction,
  especially exclusion of image alt text, while replacing slug and duplicate
  state. It shares `src/core/check.ts` with completed `LCLI-286`, so the next
  branch must retain the integrated IP boundary. Package selection and GitHub
  compatibility still require current research under pinned Bun 1.2.23.

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

Remaining for `LCLI-287`:

- package research, activation, researched Backlog plan, and focused branch
- versioned before/after conformance fixtures for punctuation, whitespace,
  inline code, excluded image text, Unicode forms, non-Latin text, empty and
  repeated headings, per-document duplicate state, and consumer parity
- exact pin, audit, pinned-Bun source/build and five-target packaging evidence
- `bun test`
- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `./dist/lore --version`
- `lore sync`
- `lore validate --strict`
- `lore check --strict`
- `git diff --check`

## Working-tree and remote state

`dev` is at integrated implementation commit `6ed37e2`, eleven commits ahead of
`origin/dev` before the cursor-only commit. The tracked worktree was clean
immediately after the fast-forward; only this handover update and Lore's
generated log entry belong to the cursor commit. Ignored verification artifacts
exist under `dist/`. No pull, reset, rebase, discard, push, or remote merge has
been performed.

## Continuation prompt

```text
Continue the Lore CLI dependency-boundary campaign from
/Volumes/external/repos/lore-cli/docs/runbooks/dependency-boundary-campaign-handover.md.
Read AGENTS.md completely, run backlog instructions overview, read the Lore
skill and run lore instructions, then inspect git without cleaning. Treat live
Backlog status as authoritative. Confirm LCLI-286 remains Done and resume only
the current task, LCLI-287: research and exact-pin github-slugger, delegate
GitHub-compatible slug and duplicate-anchor state, and preserve Lore's mdast
heading-text extraction including image-alt exclusion plus link findings and
machine output. Start from the current local dev baseline so the integrated
LCLI-286 SSRF boundary in src/core/check.ts is retained. Do not start LCLI-285,
LCLI-288, LadybugDB, Commander, the explorer, local MCP, or deferred
investigations. Update this handover before stopping or advancing.
```

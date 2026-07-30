---
type: Runbook
title: Dependency boundary campaign handover
tags:
  - handover
  - dependencies
  - maintenance
  - campaign
summary: Persistent cross-session cursor for the four-task dependency-boundary maintenance campaign.
timestamp: 2026-07-30T16:55:26Z
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

- **Current task:** `LCLI-285` — Delegate terminal display-width calculation
  to `string-width`.
- **Live Backlog status:** `To Do` as of 2026-07-30, unassigned; live Backlog
  state remains authoritative over this handover.
- **Current branch:** `dev`.
- **Initial campaign base:**
  `1e2e6dc4c9f59328cf22b6ca3bb13e49ce111f6b`
  (`1e2e6dc4c9f5`).
- **Current local campaign baseline/integrated implementation HEAD:**
  `17454373a001b8450f11af399fb86fa643b7d520`
  (`1745437`).
- **Next task cursor:** `LCLI-285`; do not advance until it is finalized,
  integrated into the local campaign baseline, and this runbook is reconciled.

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
    state, add before/after and isolation fixtures, and update shipping
    documentation.
  - `1745437` — record acceptance evidence, final summary, modified files, and
    Done status.
- `LCLI-285` and `LCLI-288` are not started.

## Current implementation state

`LCLI-286` and `LCLI-287` are shipping on the local campaign baseline.
`ipaddr.js` 2.4.0 owns strict address parsing, normalization, CIDR parsing, and
membership matching while Lore retains the explicit 13-range SSRF policy, DNS,
redirect, timeout, body-disposal, fail-closed, redaction, and documented
DNS-rebinding boundaries.

`github-slugger` 2.0.0 is now exact-pinned in `package.json` and `bun.lock`.
Its ISC license, zero runtime/transitive dependencies, ESM/built-in types, no
declared engine floor, stable-but-dormant release posture, registry integrity,
published-advisory state, and pinned-Bun compatibility were checked. It owns
GitHub-compatible lowercase/filter/space conversion and per-document duplicate
suffix state. Lore still owns mdast heading-text extraction (`text` and
`inlineCode`, excluding image alt text), internal link resolution, findings,
output, and portability policy. The hand-written Unicode regex, trimming
pipeline, and duplicate Map loop are removed. The next task, `LCLI-285`, is
independent and begins from this integrated baseline.

## Exact next action

In the next session, repeat the required repository and campaign inspection,
run `backlog instructions task-execution`, confirm live `LCLI-285` is still
eligible, then activate and assign only `LCLI-285`. Research the current
`string-width` release, Bun/engine compatibility, and the existing display-width
helper/output consumers before recording its plan or creating its focused
feature branch.

## Decisions, blockers, and risks

- **Decisions:** campaign order and scope are fixed by the campaign prompt.
- **Blockers:** none.
- **Risks:** `LCLI-285` must preserve control-byte sanitization, ANSI policy,
  ASCII/CJK/combining behavior, all machine contracts, and deterministic pretty
  layout while correcting emoji, variation-selector, flag, and ZWJ widths.
  Current `string-width` release/engine compatibility and compiled target cost
  still require research under pinned Bun 1.2.23.

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

Additional completed for `LCLI-287`:

- activation, researched Backlog plan, focused branch, local fast-forward
  integration, and Done evidence
- package ISC/license, maintenance, engine, zero-dependency, integrity,
  adoption, and published-advisory review
- versioned pre/post slug oracle plus inline-code, image-alt exclusion,
  leading/trailing whitespace, Unicode, non-Latin, empty/repeated heading,
  suffix-collision, per-document isolation, repeated-call, bundle-order, and
  internal-anchor fixtures
- pre-change `bun test test/check.test.ts`: 255 passed, 0 failed
- post-change `bun test test/check.test.ts`: 267 passed, 0 failed
- post-change `bun test`: 2,239 passed, 0 failed across 51 files
- `bun audit`: no vulnerabilities found
- `bun install --frozen-lockfile`: no changes
- `bun run src/cli.ts --version`: `0.0.0`
- host `bun run build` and `./dist/lore --version`: pass, `0.0.0`
- all five release targets compiled non-empty under Bun 1.2.23:
  darwin-arm64 61,335,888; darwin-x64-baseline 67,416,752; linux-arm64
  98,391,104; linux-x64-baseline 105,254,454; windows-x64-baseline
  119,878,144 bytes
- host binary unchanged at 61,335,888 bytes; Darwin targets unchanged, Linux
  targets +8,672 bytes each, Windows +8,704 bytes
- `npm pack --dry-run --json --cache /private/tmp/lore-cli-npm-cache`: pass,
  65 entries and no bundled dependencies
- `lore sync`, `lore validate --strict` (45 files, 0 errors/warnings),
  `lore check --strict` (45 files, 0 errors/warnings), and `git diff --check`

Remaining for `LCLI-285`:

- package research, activation, researched Backlog plan, and focused branch
- before/after display-width and pretty-layout fixtures for ASCII, CJK,
  combining marks, emoji, variation sequences, regional-indicator flags, ZWJ
  graphemes, ANSI-free output, and every machine/output contract
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

`dev` is at integrated implementation commit `1745437`, fifteen commits ahead
of `origin/dev` (`1afd3bba89dd0f43a7a6a13cab90fe916e018c58`) before
the cursor-only commit. The tracked worktree was clean immediately after the
fast-forward; only this handover update and Lore's generated log entry belong
to the cursor commit. Ignored verification artifacts exist under `dist/`. No
pull, reset, rebase, discard, push, or remote merge has been performed.

## Continuation prompt

```text
Continue the Lore CLI dependency-boundary campaign from
/Volumes/external/repos/lore-cli/docs/runbooks/dependency-boundary-campaign-handover.md.
Read AGENTS.md completely, run backlog instructions overview, read the Lore
skill and run lore instructions, then inspect git without cleaning. Treat live
Backlog status as authoritative. Confirm LCLI-286 and LCLI-287 remain Done and
resume only the current task, LCLI-285: research and exact-pin string-width,
delegate terminal display-column measurement, add before/after conformance for
ASCII, CJK, combining marks, emoji, variation selectors, flags, and ZWJ
graphemes, and preserve Lore's pretty composition, ANSI/control-byte policy,
machine output, exits, streams, color, and ordering. Start from the current
local dev baseline. Do not start LCLI-288, LadybugDB, Commander, the explorer,
local MCP, or deferred investigations. Update this handover before stopping or
advancing.
```

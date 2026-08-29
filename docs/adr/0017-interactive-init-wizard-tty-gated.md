---
type: ADR
title: "ADR-0017: Interactive `lore init` wizard, TTY-gated"
description: >-
  A bare `lore init` on an interactive terminal runs a guided wizard that folds
  in the rest of onboarding (tracker selection, the Claude Code agent bridge,
  downstream doc-site scaffolds, and a backlog-coupling capability check) into
  one command; it is
  strictly TTY-gated so the non-interactive, scriptable CLI contract
  (ADR-0004/ADR-0005) is preserved without exception off a TTY.
tags: [adr, cli, init, wizard, interactive, tty, onboarding, agents, scaffold, backlog, tracker, jira]
summary: lore init runs an interactive wizard only when stdin and stderr are both TTYs; a non-TTY stdin/stderr, --json, or any flag runs it non-interactively with defaults, one flag per wizard question.
timestamp: 2026-07-25T17:43:50.747Z
---

# ADR-0017: Interactive `lore init` wizard, TTY-gated

## Status

Accepted — 2026-07-24. Amends [ADR-0004: CLI-first; SKILL.md bridge; MCP
deferred](0004-cli-first-skill-bridge-mcp-deferred.md) and [ADR-0005: CLI
contract](0005-cli-contract.md): it carves out one narrow, explicitly-gated
exception to their "no behavior reachable only through a non-CLI surface" /
"deterministic, non-interactive, agent/CI-safe" stance, rather than replacing
either decision.

## Context

Bringing lore into a new repo used to require four separate steps a new user
had no way to discover from `lore init` alone: `lore init` (the OKF bundle) →
`lore agents` (the Claude Code bridge) → an external `lore-setup.sh` script →
manual Obsidian vault configuration. Nothing told a first-time user that the
agent bridge, the downstream doc-site scaffolds (mkdocs/docusaurus/obsidian),
and the backlog `--json`-capability check were separate, optional follow-ups.

The obvious UX fix — "prompt the user for every configurable option" — is in
direct tension with lore's own design: lore is deliberately **CLI-first,
deterministic, and non-interactive** (ADR-0004's "no behavior reachable only
through a non-CLI surface"; ADR-0005's "thin, zero-config, deterministic, and
agent/CI-safe" philosophy). A raw interactive `lore init` that always prompts
would break CI, `lore-setup.sh`, and every existing script or agent loop that
invokes `lore init` unattended — including this repo's own docker e2e harness,
which runs with stdin **not** a TTY and depends on `lore init` never blocking.

This needed a resolution, not a compromise that quietly weakens the
non-interactive contract. The npm ecosystem has already settled this exact
tension for `npm init`: interactive by default at a real terminal, but `-y` or
a non-TTY stdin skips every prompt and uses defaults — a pattern proven at
enormous scale to satisfy both a first-run human and a CI pipeline from the
same command.

## Decision

1. **A bare `lore init` on an interactive terminal runs a guided wizard**
   offering each configurable choice: the tracker backend (`backlog` or
   `jira`), the Claude Code agent bridge
   (SKILL.md + the CLAUDE.md nudge), a downstream docs site
   (mkdocs/docusaurus/none), an Obsidian vault config, and a backlog-coupling
   capability detection step. The wizard applies whichever were chosen in the
   same run that scaffolds the base OKF bundle. An explicit tracker choice is
   persisted as `backend` under `[tracker]` in `.lore/config.toml`; Backlog.md
   remains the zero-config default when that table is absent.

2. **The wizard is TTY-gated, and the gate is the whole of the contract
   change.** It runs *only* when **both stdin and stderr** are interactive
   terminals, none of `lore init`'s own flags was passed, *and* `--json` was
   not requested. Three independent conditions each force the fully
   non-interactive path with no prompt able to block it:
   - stdin **or stderr** is **not** a TTY (CI, a pipe, a subprocess, a test, or
     a caller that redirects only one of the two streams) — the automatic,
     zero-configuration case every existing script already hits. **Both**
     streams matter, not just stdin: every wizard question is written to
     stderr (cli-contract §4 — stdout stays exclusively `init`'s own
     envelope), so a caller that redirects only stderr while leaving stdin a
     readable TTY (the universal shell idiom `cmd >/dev/null 2>&1`, which
     `lore-setup.sh` itself uses) would otherwise block forever on a prompt it
     cannot see. This was found and fixed in review round 2 (2026-07-25,
     BLOCKING-1) after the original implementation gated on stdin alone;
   - `--json` was requested — a machine-readable invocation must never prompt,
     even sitting at a genuinely interactive terminal on both streams, since a
     script piping `--json` output has no way to answer a wizard question
     (also review round 2); or
   - **any** of `lore init`'s own flags is passed (`--yes`/`--non-interactive`,
     `--tracker <backlog|jira>`, `--agents`, `--scaffold <target>`,
     `--obsidian`, `--no-backlog`,
     `--check-backlog`) — explicit intent always wins over an ambient TTY, so
     `lore init --agents` from a real terminal never pops the wizard either.

3. **Every wizard question maps 1:1 to a flag** (the npm-init pattern): the
   tracker choice ↔ `--tracker <backlog|jira>`, the agent-bridge question ↔
   `--agents`, the docs-site choice ↔
   `--scaffold <target>`, the Obsidian question ↔ `--obsidian`, and
   `--no-backlog`/`--check-backlog` cover the backlog-coupling check. A script
   can reach every *option* the wizard offers with zero prompts — there is no
   configuration reachable from the wizard that a flag cannot also reach — but
   **the flag path's own defaults are not identical to the wizard's own
   defaults answered blind** (see the `--yes` clarification below); "the same
   reachable configuration space" and "the same outcome from a bare
   invocation" are two different claims, and only the first one holds.

4. **EOF (Ctrl-D) mid-wizard is a `usage` error (exit `2`), never a silent
   success.** `readline/promises`' `rl.question()` does not settle when its
   input stream reaches EOF, so a naive implementation could leave the
   wizard's promise abandoned forever — the process falling through to exit
   `0` with zero stdout bytes (a broken contract under `--json`: a `| jq`
   consumer expects either a valid envelope or a classified failure, never
   silence) and a half-applied run (the base scaffold already written, nothing
   else). Fixed in review round 2 (BLOCKING-2) by racing every prompt against
   the readline interface's own `close` event and throwing on an early close,
   rather than silently falling back to each question's default — the same
   "never silently do something the user couldn't see coming" principle as
   point 2's stderr fix.

5. **The backlog-coupling check is advisory-only.** A missing or
   non-`--json`-capable `backlog` binary is reported as a stderr warning and a
   `backlog: { capable: false, warning }` field on the result — it never fails
   the `lore init` run, since the base scaffold (and any agent bridge/doc-site
   scaffold already applied) succeeded regardless of whether Backlog.md
   coupling is available yet.

6. **Both paths are idempotent**, reusing the exact same primitives `lore
   agents`/`lore scaffold` ship (`applyAgentsBridge`/`applyScaffold`) rather
   than duplicating their logic: a second run of any combination of flags (or
   wizard answers) is a no-op wherever the first run already finished. A run
   interrupted partway through — a scaffold conflict, or the EOF case in point
   4 — is always **safe to re-run**: the base scaffold and whichever
   consumer(s) it reached before stopping are already on disk and idempotent,
   so re-invoking `lore init` (wizard or flags) picks up exactly where the
   interrupted run left off rather than erroring or duplicating anything. This
   is a deliberate ordering choice, not an oversight: the agent bridge is
   applied before scaffolds are pre-flighted, so a scaffold conflict can leave
   the bridge already written while the run still exits non-zero — reordering
   to make the whole run atomic was considered and rejected as its own,
   separate behavior change (out of scope for this ADR); idempotency is what
   makes the current ordering safe regardless.

7. **The TTY gate and the wizard's I/O are both injectable**, never read from
   `process.stdin` inside the command itself — `cli.ts` resolves the real
   `stdin.isTTY`/`stderr.isTTY` once, at the same boundary it already resolves
   `stdout`'s TTY state, and hands two plain booleans plus an `InitPrompter`
   (`confirm`/`choose`/`close`) into the command. A test drives the wizard
   path by passing `stdinIsTTY: true`/`stderrIsTTY: true` and a scripted
   prompter — never a real terminal, never flaky.

The non-negotiable invariant this ADR exists to record: **a completely
non-interactive path must always exist and must be the automatic, default
behavior whenever either stream is not a TTY.** Nothing in `lore init` — now
or in any future flag added to it — may introduce a prompt that can block
when stdin is not a TTY, **or when stderr (where every prompt is written) is
not a TTY**, since a prompt on a redirected stream is a prompt nobody can
answer.

### Clarification: `--yes` is npm's `-y`, not "answer every question yes"

`--yes` means **"skip the wizard and run the bare non-interactive default"** —
the exact same outcome as a non-TTY stdin with no other flags. It does
**not** mean "answer every wizard question with its default value." These
differ in practice: the tracker question defaults to Backlog.md and writes the
explicit selection during a wizard run, and the agent-bridge question defaults
to **yes** (accepting the wizard defaults installs the detected bridge), but
`lore init --yes` writes **nothing** beyond the base scaffold (`test/init.test.ts`'s
`--yes`-alone-on-a-TTY case asserts exactly this). This is npm's own `-y`
semantics inverted from what the name suggests in isolation — `npm init -y`
also skips prompts entirely rather than accepting each one's default, so
`lore init --yes` is consistent with the ecosystem convention it's modeled on,
even though the name alone invites the opposite reading. Corrected in review
round 2: an earlier draft of this ADR (§3, and the "fully scriptable
equivalent" consequence above) said a script reaches "the *exact* outcome a
human would get answering the wizard" via `--yes`; that was never true and is
now stated precisely. `--non-interactive` is a plain alias for `--yes` with
identical semantics, added so a script name can prefer whichever of AC#2's own
two named examples reads more clearly at the call site.

### Amendment (2026-08-28, LCLI-358.1): `--allow-no-git` is the one flag that does not skip the wizard

`lore init` now requires a git worktree before it writes anything: `lore sync`
shells `git rev-parse HEAD` and fails outright without a repository, and
`quest init` refuses a non-worktree path, so a bundle scaffolded outside one is
broken for everything except `lore check`. On a TTY the wizard asks first and
runs `git init`; off a TTY, or when the prompt is declined, the run fails with
a `validation` error before the first byte is written. `--allow-no-git` waives
the requirement for the docs-only case that `lore check` still serves.

That flag is a deliberate, single exception to this ADR's "any flag runs it
non-interactively" rule. The rule holds because every other init flag *answers a
wizard question*, so passing one means the caller already decided what the
wizard would have asked. `--allow-no-git` answers a **preflight gate** instead:
it waives a requirement rather than choosing a consumer. Folding it into that
set would make `lore init --allow-no-git` scaffold-and-exit, leaving no way to
reach the wizard at all from a non-git directory — the exact situation the flag
exists for. It still suppresses its own prompt, so the 1:1 flag-per-question
mapping this ADR rests on is preserved rather than broken.

The same amendment moves the base scaffold to **after** every prompt. This
ADR's BLOCKING-2 disposition (EOF is a classified `usage` error, never a silent
exit 0) previously still left `docs/` and `.lore/` on disk from a run that then
refused; a declined git prompt, a rejected flag combination, and an EOF now all
leave the directory byte-for-byte unchanged. An accepted git prompt is recorded
rather than executed for the same reason — `git init` is itself a write, so it
runs alongside the scaffold once every question is answered, and a Ctrl-D at a
later prompt leaves no `.git` behind either. A structurally blocked bundle (a
symlink or wrong-shaped entry at a path the bundle needs) is refused before the
first question rather than after the last one.

### Amendment (2026-08-28, LCLI-358.2): the capability check follows the selected tracker

This ADR calls the capability check "backlog-coupling" throughout, and the
implementation matched: it probed the `backlog` binary no matter which backend
the bundle had selected, so choosing Quest reported that Backlog.md was
uninitialized. It now probes the selected backend, and the flags are spelled
`--check-tracker`/`--no-tracker`, with `--check-backlog`/`--no-backlog` kept as
aliases so this ADR's flag-per-question mapping still holds for every script
already written against it. The `--json` result carries the outcome under
`trackerCheck`, which names the backend it probed; the older `backlog` field is
deprecated and populated only for a Backlog bundle.

### Amendment (2026-08-28, LCLI-358.3): the tracker question is asked with the environment in view

The wizard asked which backend to use while knowing nothing about the machine or
the repository, and never checked the answer was usable — a repository could be
pinned to Quest with no `quest` installed and no workspace, and nothing said so
until the first tracker command failed. `init` now detects all three backends
(PATH plus one marker file each) and prints that state before the question.

Choosing a backend whose binary is missing offers to install its package. This
adds a **new class of wizard question**: the others choose what `lore` writes
inside the repository, while this one runs `npm install -g` and changes the
machine. It is therefore never implied — it happens only on an explicit
confirmation or an explicit `--install-tracker`, and `--no-install-tracker` opts
out permanently. Declining offers one switch to a different backend; declining
that exits with the exact install command.

The return to the tracker question is **bounded at two passes**. A loop whose
exit depends only on the operator eventually answering differently is a loop an
automated or confused caller never escapes, so the bound is a property of the
code rather than of the answers.

## Consequences

### Positive

- **One command replaces a four-step, easy-to-forget sequence.** A first-time
  user on a real terminal is walked through every configurable consumer
  without needing to know `lore agents`, `lore scaffold`, or
  `lore-setup.sh` exist.
- **Zero regression to the non-interactive contract for filesystem effects and
  pretty/plain output.** Every existing caller — CI, this repo's own docker
  e2e harness (neither stream is a TTY there), scripts, and every
  pre-existing unit test — hits the exact same `lore init` filesystem effects
  and pretty/plain rendering as before this ADR, because the default
  non-interactive path performs no new work with no flags passed. This is
  **not** "byte-for-byte" in the strongest sense, and two narrower claims were
  corrected in review round 2: the `--json` payload gains two fields that are
  *always* present now (`interactive: false`, `scaffolds: []`) alongside the
  two that are conditionally present (`agents`, `backlog`) — additive per
  ADR-0005's versioning rules, but not byte-identical to the pre-ADR `--json`
  output; and `lore-setup.sh`'s own `cmd >/dev/null 2>&1` idiom used to hang
  indefinitely against a stdin-only TTY gate (BLOCKING-1, point 2 above) — the
  stderr half of the fix is exactly what makes `lore-setup.sh` safe to run
  unattended again.
- **A fully scriptable equivalent EXISTS for every wizard option** — `lore
  init --tracker jira --jira-profile <name> --jira-project <KEY> --agents --obsidian --scaffold mkdocs`
  reaches every configuration the wizard can reach, with zero prompts (the two
  `--jira-*` flags joined this list with LCLI-358.4, which gave the jira branch
  questions of its own) — but **`lore init --yes` is not that
  equivalent** (see the `--yes` clarification below); automation should name
  the flags for the options it actually wants rather than assume `--yes`
  mirrors a blind run through the wizard.
- **Testable without a real terminal.** The injectable TTY gate + prompter
  means the wizard's logic (question order, defaults, idempotency) is unit
  tested the same way every other lore command's seams are, with no pty/expect
  harness needed.

### Negative / tradeoffs

- **A second interactive code path to maintain.** `lore init` now has both a
  synchronous, flag-driven path and an async, prompt-driven wizard path
  (`runInit` returns `number | Promise<number>`, mirroring `lore check
  --external`'s existing sync/async split). This is more surface than a
  flags-only command, mitigated by the wizard sharing the exact same
  `applyAgentsBridge`/`applyScaffold` primitives as the non-interactive path —
  there is no separate "wizard version" of the onboarding logic.
- **A backlog-coupling check most users won't customize.** `--no-backlog`
  and `--check-backlog` add two flags whose value is mostly "make CI quiet" or
  "make a script explicit" — a modest addition to the flag surface for a
  narrow use case.

## Alternatives considered

- **A dedicated `lore setup`/`lore onboard` subcommand** promoting
  `lore-setup.sh` into a first-class command, leaving `lore init` untouched as
  the non-interactive primitive. Rejected for the initial release: it keeps
  the exact discoverability gap this ADR exists to close — a new user still
  would not learn from `lore init --help` that a one-command onboarding flow
  exists elsewhere. (Still a reasonable fallback if the TTY-gated wizard ever
  proves too surprising in practice; nothing here forecloses adding one later.)
- **Opt-in interactivity** (`lore init --interactive`, non-interactive by
  default even on a TTY). Rejected: it solves the CI-safety concern trivially
  but does nothing for the *actual* problem — a first-time human at a terminal
  still would not discover the wizard without already knowing the flag exists.
- **Flags only, no wizard at all.** Rejected as insufficient for the filing
  task's own framing ("prompt me for every configurable option") — a
  flags-only `lore init` is no more discoverable than today's `init` → `agents`
  → `lore-setup.sh` sequence, just consolidated into more flags to read about
  in `--help`.

## Related

- [ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md) — the non-CLI-surface, agent/CI-safe stance this ADR carves one gated exception into.
- [ADR-0005: CLI contract](0005-cli-contract.md) — the output-mode/exit-code/error-envelope contract the non-interactive path continues to honor exactly.
- [CLI surface](../reference/cli-surface.md) — `init`'s full flag reference.
- [Agent onboarding runbook](../runbooks/agent-onboarding.md) — the one-command onboarding flow this ADR enables.
- [ADR log](index.md)

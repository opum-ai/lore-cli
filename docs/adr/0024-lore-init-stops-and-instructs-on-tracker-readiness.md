---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: "Tracker readiness is the operator's step: lore init detects, offers, and instructs — it never installs, initializes, or migrates a tracker for you (DEC-57)"
tags:
  - adr
  - init
  - tracker
  - quest
  - dec-57
  - windows-ci
summary: "lore init detects tracker readiness, offers to stop with exact install/init/migrate instructions, and never installs, initializes, or migrates anything itself."
timestamp: 2026-09-29T20:06:16.586Z
status: stable
---

# ADR-0024: Tracker readiness is the operator's step: `lore init` detects, offers, and instructs — it never installs, initializes, or migrates a tracker for you (DEC-57)

## Status

**Accepted — 2026-09-29 (DEC-62).** The operator decided it first-party in `opum-doc`; the answer is
relayed as opum-doc outbound seq 53, `ODOC-OP-2026-09-29-31` (2026-09-29T23:44:27Z), and it was read
here in that workspace's own records rather than taken from the relay: the operator-workspace relay
ledger records "decision: DEC-62 A" against that seq, id and time, and opum-doc's own session
record carries "lore-cli ADR 0024 approved (DEC-62); #436 lands, then the implementation". The chosen
option, verbatim: **"Approve, Jira offer later (Recommended)"** — which is option (A) of the JIRA
section: the three working offers ship, and the JIRA→Quest offer is added once quest has a runnable
Jira migration command, and not in 0.12.0. It approves this ADR as written at #436 head `56607ac5`,
every point in "Points recorded for the operator's approval or correction" included. The workflow was
approved before implementation, which is the form DEC-57 itself requires (Article 5); implementation
is a separate task, opened under this ADR.

This ADR **amends ADR-0017** (interactive `lore init` wizard, TTY-gated) by removing
its tracker install offer and replacing its in-wizard Backlog migration with a stop-and-instruct
offer, and **narrows LCLI-358.3** (tracker-environment detection and its install offer) to detection
plus instruction. It introduces no new exit codes: every stop below reuses a class that already
exists in ADR-0005's contract, so scripts branching on exit codes see the same classes they see
today.

## Context

### The operator's decision, verbatim (DEC-57)

DEC-57 was decided by the operator on 2026-09-29 and relayed by opum-agent; the relay is
opum-doc's `ODOC-OP-2026-09-29-22` (opum-doc seq 40, 19:53:24Z). The operator's answer, verbatim:

> Stop and instruct. Just need to be clear here -> lore detects if quest is installed and if the
> folder has been init. It needs both for lore to use it. Since lore offeres first class support for
> Quest if it's not installed them let the user know to stop and instruct the intall. Same for if
> it's installed, but no 'quest init'. We want to highly encourage them to use Lore, but it's not
> requred. They can use none or if JIRA or backlog.md are detected they can be used. But do not
> offer to install or init them. I want to a review done by lore-cli and a proper write up for by
> review and approval of the workflow before implementation

The option the operator selected, verbatim (the label was "Stop and instruct"):

> If quest is missing, `lore init` installs nothing. It stops and says: install
> `@opum-ai/quest@<lore's exact version>`, run `quest init`, then rerun `lore init`. The install
> offer is retired. `--install-tracker`/`--no-install-tracker` stay accepted for one release,
> printing the same instructions plus a deprecation note, then are removed. Also fixes the Windows
> CI red. lore-cli records it as an ADR.

The first reading recorded at the time — "We want to highly encourage them to use Lore, but it's not
requred" is read, in context, as **Quest**, lore's first-class tracker, not lore itself; the
consequence is that no tracker is ever required and `none` is always an allowed choice — is
unaffected by the refinement and stands.

### The operator's refinement, verbatim (the offers return)

The operator reviewed the first draft of this ADR and did **not** approve it. Their refinement was
relayed by opum-agent (cross-session, 2026-09-29) from opum-doc seq 45
(`ODOC-OP-2026-09-29-26`, 2026-09-29T21:41:40Z). The operator's answer, verbatim:

> refine that workflow.
> - detect quest is not installed; stop workflow and offer to let user to stop the lore init and
>   install quest. If the user says no then continue detection of other trackers. if they say yes,
>   give them the instructiont to install and init quest, but don't run it for them
> - detect quest is installed, but no repo; stop workflow and offer to let user init quest. If the
>   user says no then continue detection of other trackers. if they say yes then exit the install ,
>   give them the instructions to init quest, but don't run it for them
> - if another tracker has been init in the repo (backlog.md) offer to stop and give them the
>   commands to run the migration first
> - if JIRA is installed (and they have not selected Quest) offer to stop and migrate from JIRA to
>   Quest.
> - validate the logic and options for all these scenarios

opum-doc's accompanying note (**opum-doc's note, not the operator's words**) asks the revision to
answer each of these explicitly so the operator can approve each one:

1. The offers come back (a yes/no at each stop), but lore never runs an install or init. Each "yes"
   exits `lore init` with exact commands. Each "no" continues to the next tracker.
2. No TTY, where no offer can be shown: stop with the instructions, as this ADR does now, or
   continue as if the answer were "no"?
3. Order and precedence when several apply (quest missing AND backlog.md initialized AND jira
   installed): which offer comes first, and does one "no" skip the rest?
4. Jira to Quest migration: does one exist today in quest or lore? Backlog migration does
   (`quest migration backlog`, `lore init --migrate-backlog`). If Jira's does not, say what the
   offer's "yes" instructs, and whether building that migration is in scope.
5. Backlog.md: confirm the migration commands are the existing
   `lore init --tracker quest --migrate-backlog` / `quest migration backlog` path, and name them
   exactly.
6. Do the exit codes (3 for missing, 6 for uninitialized) still fit when a "yes" is a choice rather
   than a failure?
7. Restate points 4 and 5 of the old draft (the tightened `--tracker`, the bare-init default)
   against the new flow.

Sections below carry the answer to each; the composite is "The detected states, and what each one
does", "Precedence when several conditions hold", "No TTY", "Exit codes", and the JIRA and Backlog
sections. The refinement also confirms the second reading the first draft offered for correction —
"do not offer to install or init them" applies to **every** backend lore detects, not only quest:
the refinement offers to *stop* for quest alone, and offers no install or init for backlog or jira.

### What `lore init` does today (the review this decision asked for)

**Detection is already the right shape.** `src/adapters/tracker-environment.ts` (LCLI-358.3)
answers, for each backend, two questions cheaply and locally: is the CLI on `PATH` (`Bun.which`),
and is this repository initialized for it (a single marker file). It never spawns a backend.

| backend | binary | package | repository marker |
|---|---|---|---|
| quest | `quest` | `@opum-ai/quest` | `.quest/workspace.toml` |
| backlog | `backlog` | `backlog.md` | `backlog/config.yml` (a bare `backlog/` directory is deliberately not a project, LCLI-358.5) |
| jira | `jira` | `@salient-ai/jira-cli` | none — readiness is credential-profile state jira-cli owns, so lore reports it as unknown until jira-cli is asked (LCLI-358.4) |

**What is wrong is what `lore init` does with a missing binary.** The wizard's `offerInstall`
(`src/commands/init.ts`, prompted as "`<binary>` is not installed. Run `npm install -g <package>`?",
default yes) is generic — it fires for **every** backend, jira included, despite `configureJira`'s
own stops otherwise suggesting lore never installs jira-cli — and the non-interactive
`--install-tracker` flag reaches `installTrackerPackage`, which shells
`npm install -g <package>` — **unpinned**, so always npm's `latest`. Declining the offer leads to a
second offer ("Choose a different tracker instead of `<backend>`?"), then to the stop that already
exists (`missingTrackerBinary`: exit 3, hint naming the install command and the other backends).
Two further gaps: the wizard checks only `installed`, never `initialized` — an installed-but-not-
`quest init`-ed choice sails through the tracker question and is refused only after every remaining
prompt has been answered (`verifyBackendReadiness` is fatal for that one case, LCLI-376); and the
explicit `--tracker quest` path deliberately keeps "not on PATH" **advisory** (LCLI-356/376 made
only a version-floor rejection and an uninitialized Quest workspace fatal before persisting). Jira is
the closest existing precedent for the shape this ADR generalizes: when no credential profile
exists, `configureJira` stops, naming `jira init` — because that command is interactive and handles
credentials, and lore must never learn them. **Lore never runs `quest init` or `backlog init` today,
and this ADR keeps it that way.**

One interactive behavior this ADR changes beyond install offers: when Quest is chosen and a real
Backlog.md project exists, the wizard today asks migrate/keep/backlog and, on "migrate", **runs the
Backlog-to-Quest migration itself** (via Quest's public receipt lifecycle) before persisting. Under
this ADR that prompt becomes an offer whose "yes" stops the run and hands over the command instead —
consistent with every other stop here, and with DEC-57's stop-and-instruct shape.

`none` has nothing to detect and is always allowed, and `--no-tracker` remains the scripted
opt-out for pinning a backend before its tooling exists.

### The CI measurement that forced the question

`lint · typecheck · test (windows-latest)` is one of the six required contexts of `dev`'s ruleset.
On the 0.12.0 pair bump (opum-ai/lore-cli#433, head `d7b1cae1`, run `36613200270`) it is red on three
LCLI-614 tests, whose failure hint is the pair lock's: `upgrade quest to 0.12.0: npm install -g
@opum-ai/quest@0.12.0` (LCLI-650). The same head's ubuntu leg **skips** those tests.

The mechanism, measured on 2026-09-29, is a side effect of an unrelated test through the real CLI
router:

- `test/link-quest-race.test.ts` skips when no `quest` is on `PATH` (`test.skipIf(Bun.which("quest")
  === null)`), and its header states the intent: "Skipped when no `quest` is on PATH. CI's
  `lint · typecheck · test` job installs none, so this runs on a workstation … never as a CI gate."
- `test/cli.test.ts`'s LORE-260 test drives the **real router** through the wizard with
  `stdinIsTTY`/`stderrIsTTY` true and a prompter that answers every question with its own default.
  The tracker question's default is `quest`; the install offer's default is **yes**.
- `src/cli.ts`'s init handler forwards `adapter`, `prompter`, `agentAvailability` and
  `agentPlugins` from the run context but **no `trackerEnvironment` and no `installTracker`** — so
  the real detection and the real, unpinned `installTrackerPackage` are what run.
- On a runner with no quest, that test therefore executes the real `npm install -g @opum-ai/quest`.
  npm's `latest` is `0.11.0` (0.12.0 is not published yet), and it lands on the runner's global
  prefix, on `PATH`, for every later-loaded test file.

Measurements, all on 2026-09-29 (windows-latest unless noted):

| observation | evidence |
|---|---|
| No quest before the suite; `C:\npm\prefix\quest.cmd` after it | diag run `36609801229` (dev-based tree): `before suite: null` → `after suite: "C:\\npm\\prefix\\quest.cmd"` |
| Same tree, both legs: windows **passes** the three tests (real quest, 2.7–4.7 s), ubuntu **skips** them | PR #435 windows job `109562870923`; ubuntu job `109562870749` |
| When that wizard test fails early (preload-distorted run), quest never appears | run `36609046187`: `after that test file: null`, no quest after the full suite |
| On the bump branch, the acquired quest is refused by the pair lock | run `36613200270`, the three failures and the `0.12.0` hint |

The windows and ubuntu legs differ in file scheduling (windows runs files concurrently,
`--max-concurrency=4`; ubuntu serializes, `--max-concurrency=1`), which is how the same tree yields
run-vs-skip; the measured facts above are the install appearing on windows, and the skips on
ubuntu. The defect's shape: **a required context's colour is decided by the default answers of a
test whose subject is the router, on a binary no workflow step installs.** The tests' own header
already documented the intended behavior — they are not a CI gate — and a product side effect
silently overrode it.

### Why this needs the operator, not just a fix

Two arms were measured in the routing (pin `installTrackerPackage` to lore's own version; or make
the tests skip on version mismatch). The operator chose neither: the machine-mutating behavior
itself — lore installing a package globally on a first run — is the thing to retire, and the
Windows red is a symptom. The operator also asked for the review above plus a written workflow, and
for approval **before** implementation (Article 5). This ADR is that workflow.

## Decision

**Principle: `lore init` detects, offers, and instructs; it never installs, never initializes, and
never migrates a tracker on the operator's behalf.** The two facts that make a backend usable — its
CLI is on `PATH`, and this repository is initialized for it — are the operator's to establish, with
their own package manager and the tracker's own init command. Where a wizard choice lands on a
backend that is not ready, or on a repository holding another tracker's tasks, `lore init` offers to
stop; a "yes" prints the exact commands and exits without writing anything, and a "no" returns to
the tracker choice and detection continues. Nothing a "yes" prints is ever run by lore.

### The flow, in order (interactive wizard)

1. The git preflight is unchanged (LCLI-358.1): a declined repository ends the run.
2. The tracker question is unchanged, and the detected environment is still rendered before it
   (installed / initialized, per backend, LCLI-358.3) — so the state that shapes every offer below
   is visible before the choice. The summary's "not installed" line keeps naming the install
   command, now **pinned to lore's own version** for quest.
3. Offers fire **on selection**, one backend at a time, in the order quest → backlog → jira — the
   order the summary already presents. A wizard choice or an explicit `--tracker <backend>` both
   count as selecting. This reading — rather than an up-front interrogation before the tracker
   question — is recommended because it preserves the existing "describe, then ask" wizard, never
   nags a user who is choosing another backend, and maps "then continue detection of other
   trackers" onto the loop the wizard already has ("Choose a different tracker instead of X?").
4. The Backlog migration offer (offer 3 below) fires when the backend is settled and
   `backlog/config.yml` exists — the position where today's migrate/keep/backlog prompt already
   sits — for a selected backend of **quest or backlog** (see "Precedence").

### The detected states, and what each one does (interactive: every state × answer → output and exit)

"Nothing written" below is a property, not an aspiration: in the wizard every prompt precedes the
first write (LCLI-358.1), so a yes-stop leaves the directory exactly as it was found.

| # | detected state | selection | offer | answer | output | exit |
|---|---|---|---|---|---|---|
| O1 | `quest` not on `PATH` | quest (the question's default) | "Quest is not installed. Stop `lore init` here so you can install it, then rerun?" | **yes** | stop: install `@opum-ai/quest@<lore's exact version>`, run `quest init` (dropped when `.quest/workspace.toml` already exists), then rerun `lore init`. Nothing written | 3 |
| O1b | as O1 | — | — | **no** | return to the tracker question; detection continues; no stop, nothing written | — (flow continues) |
| O2 | `quest` on `PATH`, `.quest/workspace.toml` absent | quest | "Quest is installed but this repository has no Quest workspace. Stop `lore init` here so you can run `quest init`, then rerun?" | **yes** | stop: run `quest init`, then rerun `lore init`. Nothing written | 6 |
| O2b | as O2 | — | — | **no** | return to the tracker question; detection continues | — (flow continues) |
| O3 | quest ready **and** `backlog/config.yml` exists | quest | "This repository has a Backlog.md project. Quest can take its tasks over — stop `lore init` here and run the migration first?" | **yes** | stop with the exact commands in "Backlog.md" below. Nothing written | 6 |
| O3b | as O3 | quest | — | **no** | proceed with quest; `backlog/` left in place (today's "keep"; the scripted equivalent of `--keep-backlog-tasks`) | 0 on success |
| O4 | `backlog` not on `PATH` | backlog | none — no install is offered for backlog | — | stop: install `backlog.md` (floor 1.49.0) with your own package manager, run `backlog init`, then rerun `lore init` | 3 |
| O5 | `backlog` on `PATH`, no `backlog/config.yml` | backlog | none | — | stop: run `backlog init`, then rerun `lore init` | 6 |
| O6 | backlog ready **and** `backlog/config.yml` exists | backlog | same offer text as O3 | **yes** | stop with the same migration commands | 6 |
| O6b | as O6 | backlog | — | **no** | proceed with Backlog as the tracker; the version floor still applies (LCLI-370) | 0 on success |
| O7 | `jira` not on `PATH` | jira | none | — | stop: install `@salient-ai/jira-cli` with your own package manager, run `jira init`, then rerun `lore init --tracker jira` | 3 |
| O8 | `jira` on `PATH`, no credential profile | jira | none | — | stop — today's text, unchanged: jira-cli has no credential profiles; run `jira init` (interactive; it handles credentials — lore never does) | 3 |
| O9 | jira configured | jira | **none — the JIRA→Quest migration offer is not included**; see the JIRA section for why and what it would take | — | proceed as today | 0 on success |
| O10 | — | none | none | — | nothing detected, nothing printed | 0 |
| O11 | any offer pending | — | — | Ctrl-D / EOF | the existing EOF disposition (ADR-0017, BLOCKING-2): usage error, nothing written | 2 |
| O12 | quest not ready and a readiness offer was already **declined once**; user selects quest again (second pass) | quest | no second offer | — | stop with the same instructions as O1/O2's yes | 3 / 6 |

Draft remedy text for O1 (message and hint as the `LoreError` pair), matching the stop DEC-57's own
option text describes:

```
the `quest` CLI is required for the quest tracker and is not on PATH
install @opum-ai/quest@<lore's exact version> (`npm install -g @opum-ai/quest@0.11.0`),
run `quest init`, then rerun `lore init` — or choose another backend with
`lore init --tracker <quest|backlog|jira|none>`
```

with the `quest init` step dropped when `.quest/workspace.toml` already exists (it is one of the two
facts already detected; telling an initialized repository to initialize is noise). The other
backends follow the same pattern with their own binary, package and init command, and the existing
`missingTrackerBinary` / `Quest workspace is not initialized` strings are the starting points rather
than new prose.

**The version in the remedy is lore's own exact version, never "latest".** The pair lock already
prints exactly this instruction when versions diverge, and handing a new user `npm install -g
@opum-ai/quest` (latest) can install a quest that lore then refuses. This makes the onboarding
message and the runtime remedy one sentence.

Proposed defaults, flagged for approval: **yes** on O1/O2 (the user selected quest and it cannot
serve them; stopping is the useful next step, and it matches the retired install offer's default)
and on O3/O6 when quest is the selection (matching today's migrate/keep/backlog default of
"migrate"); **no** on O6 when backlog is the selection (the offer is a nudge, and a deliberate
choice of Backlog should not be interrupted by a bare Enter).

### Precedence when several conditions hold (opum-doc's question 3)

The offers never contend, because at most one is pending at any moment: each is tied to the
selection in front of it rather than to a global scan. The operator's composite case — quest not
installed **and** `backlog/config.yml` present **and** jira installed — plays out as:

1. The environment summary shows all three states before the question (quest missing; backlog
   initialized in this repository; jira installed).
2. The default answer to the tracker question is quest → offer O1. "No" returns to the question.
3. Selecting backlog → the project exists and backlog is installed, so backlog is usable → offer
   O6. "No" proceeds with Backlog.
4. Selecting jira → O7/O8 if it is not ready, otherwise O9 (no migration offer).
5. Selecting none → proceed; nothing is offered.

**Quest is first because it is the default and the migration target of every other offer. Backlog
precedes jira because backlog's readiness (and its tasks) are repository-local, where jira's
readiness is credential state owned by jira-cli and checked only when selected.** A "no" returns to
the choice and **never auto-skips the rest**: each backend's offer is independent, and a later
selection of a different backend brings that backend's own offer (O1b → step 3 above is exactly
this). The one offer that is deliberately one-shot per run is a backend's own readiness offer: a
second selection of the same unready backend stops with the instructions (O12) rather than asking
again. `MAX_TRACKER_ATTEMPTS` (currently 2) still bounds the loop.

### No TTY: stop with the instructions (opum-doc's question 2)

**Recommended: stop with the instructions, never continue as if the answer were "no".** Every offer
above is wizard-only, TTY-gated by ADR-0017; in a non-interactive run no offer can be shown, and
the run stops with the same message its "yes" would print. The reasoning:

- The non-interactive path already expressed its choice in flags. "No" in the wizard means "return
  to the choice and show me the others" — with no one to show, continuing would mean silently
  persisting a different backend than the one asked for (or none at all).
- Today's non-interactive behavior for a missing binary is advisory-then-persist (exit 0 with an
  unusable `backend = "quest"`). That is precisely the LCLI-356 defect this ADR exists to close; it
  must not survive as the "continue as no" arm.
- Stop-with-instructions needs no prompt, writes nothing, and produces the same exit class the
  interactive "yes" does — so scripts see one behavior regardless of TTY.

| # | invocation (non-interactive) | detected state | output | exit |
|---|---|---|---|---|
| N1 | `--tracker quest` | `quest` not on PATH | the O1 remedy (pinned install, `quest init` unless the marker exists, rerun) | 3 (today: advisory, exit 0 — a deliberate tightening) |
| N2 | `--tracker quest` | on PATH, workspace absent | `quest init`, then rerun `lore init` | 6 (today: fatal already, LCLI-376) |
| N3 | `--tracker quest` | ready, `backlog/config.yml` present, no `--migrate-backlog`/`--keep-backlog-tasks` | today's message, unchanged: selecting Quest would leave the Backlog project behind and that must be a deliberate choice — with the exact commands and the actor context named (see "Backlog.md") | 6 (unchanged) |
| N4 | `--tracker quest --migrate-backlog …` | ready, project present | the migration runs — this is the operator's own explicit invocation, not lore acting unasked; unchanged | 0 |
| N5 | `--tracker backlog` | `backlog` not on PATH | install `backlog.md`, `backlog init`, rerun | 3 (today: advisory, exit 0 — tightening) |
| N6 | `--tracker backlog` | on PATH, no project | `backlog init`, then rerun | 6 (today: advisory warning — tightening) |
| N7 | `--tracker jira …` | missing / no profiles / ready | today's configureJira behavior, unchanged | 3 / 3 / 0 |
| N8 | bare `lore init`, no `--tracker` | — | unchanged (LORE-260): a new bundle pins the default backend (`quest`) and probes nothing, because no choice was expressed; the pin reaches the same stop on its first tracker-touching command | 0 |
| N9 | `--install-tracker` / `--no-install-tracker` | any | accepted for one release, **installs nothing**: not-ready selections stop as N1/N2/N5/N6 with the deprecation note attached; ready selections are a no-op with the note; the two together remain a usage error; after the deprecation release both are removed (then: unknown-flag usage errors) | 2 / 0 as today |
| N10 | `--tracker <backend> --no-tracker` | any | unchanged escape hatch: the documented opt-out skips the readiness verification for scripted pinning | 0 |

The parallel to the wizard's backlog offer (O3/O6) in a non-interactive run is N3, which already
exists: it stops with the commands rather than offering anything. No migration offer is added to
any non-interactive path.

### Exit codes: the answer is a choice, the state is not (opum-doc's question 6)

**Yes, 3 (`not_found`) and 6 (`validation`) still fit — the class names the state lore can see at
exit, never the operator's answer.** The reasoning, stated once so it is reviewable:

- A "yes" persists nothing and installs nothing. At exit, the backend is exactly as unusable — or
  the tasks' fate exactly as unresolved — as it was when the offer was shown. The offer changes the
  *message*, not the *state*, and the exit code describes the state.
- Changing a yes-stop to 0 would report a completed `lore init` for a repository with no usable
  tracker selected — the LCLI-356 failure shape (exit 0, `backend = "quest"` persisted, every later
  command refused), which this ADR exists to close.
- The wizard's own abort path (Ctrl-D/EOF) is already a distinct class (2, usage — ADR-0017's
  BLOCKING-2 disposition), so "the operator stopped" is representable where it genuinely differs:
  an *interruption* is usage, whereas a *deliberate stop with instructions* is the same non-zero
  state stop it would have been without the offer.
- Yes and no are indistinguishable in the exit code by design — and should be, because the states
  are indistinguishable to a caller: after either answer the tracker is not set up. A new code for
  "user chose to stop" would tell a script nothing it can act on differently, and ADR-0005 makes
  the code set a contract.

The mapping, by condition: missing CLI → 3; installed-but-uninitialized repository → 6; a choice
still outstanding about existing Backlog tasks → 6 (today's N3 class, reused for O3/O6); no
credential profile → 3 (today's class).

### JIRA → Quest: the offer is not included today, because no runnable migration exists (opum-doc's question 4)

Measured 2026-09-29, both tools:

- **quest, released (npm `latest` = `0.11.0`, read live):** the only migration family exposed is
  `quest migration backlog preview|apply|status|rollback` (local `quest migration --help`).
- **quest-cli source, `origin/dev`:** a Jira importer **does exist and is qualified at the adapter
  level** — `src/adapters/migration/jira/importer.ts`, the fidelity contract
  `docs/reference/quest-cli-jira-migration-fidelity-contract.md`, end-to-end tests
  (`test/e2e/migration/jira-qualification.test.ts`), with QCLI-74 ("Qualify jira-cli and freeze
  Jira migration fidelity mappings") and QCLI-89 ("Implement the Jira Cloud importer through
  jira-cli") both Done. But nothing outside that module references it, and the CLI's own entry
  (`src/cli/main.ts`) contains no jira migration command — so **no user-runnable JIRA→Quest
  migration exists today**, in either tool.
- **lore:** no jira migration of any kind; `lore init --migrate-backlog` is Backlog-specific.

An offer whose "yes" cannot name a runnable command is a dead end, and it would contradict the
shape every other offer here has (a "yes" hands over commands that work). **Recommendation: do not
ship the JIRA→Quest offer until a runnable command exists**, and record the gap here. Options for
the operator, since this is theirs to decide:

- **(A, recommended)** Ship the three working offers now (quest readiness, backlog migration), and
  add the JIRA→Quest offer when quest exposes a migration command. Exposing the existing importer
  is quest-cli work — a separate task in that repository, routed through opum-agent, not part of
  this ADR.
- **(B)** Ship the offer anyway, with a "yes" that prints what actually exists (`install quest`,
  `quest init`) and says plainly that no automated JIRA→Quest migration is exposed yet. This spends
  a stop on an instruction the user cannot complete.
- **(C)** Build and expose the migration first (quest-cli), then ship the offer in the same release
  window.

**Chosen: (A)** — DEC-62, 2026-09-29 ("Approve, Jira offer later"): the offer is added once quest has
a runnable Jira migration command, and not in 0.12.0.

If the operator chooses (B) or (C), the firing condition proposed here is **on a jira selection**
(O9's row) — the moment lore knows JIRA is in play. "JIRA is installed" is read as the detected
`jira` binary being on `PATH` plus the user having selected jira; a machine-wide binary alone is not
evidence of a migration intent, and jira has no repository marker lore could read (LCLI-358.4). This
reading is flagged for correction along with the rest.

### Backlog.md: the exact commands (opum-doc's question 5)

Confirmed: the migration path is the existing one, and both tools name it. The stop texts should
hand over these commands **exactly**:

- Lore's coordinated path (recommended to name first — it is the same lifecycle, driven by lore):
  `lore init --tracker quest --migrate-backlog`, optionally `--preserve-source-ids --source-family
  <PREFIX>` (keep each record's own Backlog id), `--remove-backlog` / `--no-remove-backlog` (what
  happens to `backlog/` after a successful migration), `--keep-backlog-tasks` (select Quest and
  deliberately leave the Backlog project in place), or `lore init --tracker backlog` (keep using
  Backlog). Quest's write requires an actor declaration, so the handed-over command carries it,
  e.g. `LORE_QUEST_ACTOR=<you> LORE_QUEST_ACTOR_KIND=human lore init --tracker quest
  --migrate-backlog` (a `delegated-agent` actor also sets `LORE_QUEST_ACCOUNTABLE_HUMAN`; see
  `lore instructions linking`).
- Quest's own path, if the operator prefers to drive it directly:
  `quest migration backlog preview --source <project> [--backlog-dir <path>]`, then
  `quest migration backlog apply --source <project> --digest <digest> --actor <name> --actor-kind
  human`, with `status` and `rollback` by digest.

Today's O3/N3 message already carries this hint minus the actor context; the revision adds the
actor explicitly, because the handed-over command fails without it.

### The flag deprecation (restated here for approval)

- `--install-tracker` **stays accepted for one release and stops installing.** When the selected
  backend is not ready the run stops with the same stop-and-instruct text above, plus a deprecation
  note; when the backend is ready it is a no-op with the same note. The note reads, in draft: "
  deprecation: lore no longer installs tracker CLIs on your behalf; this flag will be removed in the
  next release."
- `--no-install-tracker` **stays accepted for one release** as a no-op with the same note: it asked
  for what is now the only behavior.
- `--install-tracker` and `--no-install-tracker` together remain a usage error (exit 2) for the
  deprecation release, exactly as today, and then both flags are removed — thereafter they are
  unknown-flag usage errors.
- Nothing else about the flags' grammar changes; `docs/reference/cli-surface.md` is updated at
  implementation, under this ADR.

### What the wizard becomes

The wizard keeps the tracker question and the environment summary — an operator choosing a backend
should still see what exists — and loses the install offer, the second "choose a different tracker?"
offer that existed only to escape it, and the two-pass loop it drove with it (the decline path now
returns to the question directly). The tracker step gains the readiness offers O1/O2 and stops a
re-selected unready backend with the instructions. The Backlog step keeps its position but not its
behavior: the migrate/keep/backlog prompt becomes offer O3/O6 — "yes" stops with the commands (lore
no longer runs the migration from the wizard), "no" is the explicit keep. The wizard's other
questions (bridges, scaffolds) are unchanged.

### Scope: where the stop fires, and where it deliberately does not (opum-doc's question 7)

- **Point 4 of the old draft, restated — the tightened `--tracker` path:** an explicit
  `--tracker <backend>` whose backend is not ready now stops with instructions instead of
  persisting an unusable selection. In the refined flow this is the non-interactive arm of every
  readiness stop (N1, N2, N5, N6); today's behavior is advisory for "not on PATH" (exit 0) and
  for a Backlog project that is not initialized, and fatal only for Quest's workspace and the
  version floors. The reason is unchanged: a persisted `backend = "quest"` in a repository with no
  quest is precisely the "not usable, discovered later" state the stop exists to prevent.
  `--no-tracker` stays the documented opt-out (N10), and `none` stays always allowed.
- **Point 5 of the old draft, restated — the bare-init default and `--no-tracker`, against the new
  flow:** unchanged in both directions. A bare non-TTY `lore init` on a new bundle still pins the
  default backend (`quest`) and probes nothing (LORE-260) — no offer exists there because no offer
  can be shown, and no detection runs because no choice was expressed; and `--no-tracker` still
  skips the verification for an explicit `--tracker`. Neither interacts with the new offers, which
  live only in the TTY wizard.
- **Also deliberate:** a repository where the user selects `none`, or jira, is never stopped over
  an existing Backlog project (the offer fires for quest and backlog selections; see Precedence),
  and nothing is offered for a backend whose state was already detected as ready with no data at
  stake.

### What implementation will touch (not done here)

For the follow-up task, so it is reviewed against this record rather than rediscovered:
`src/commands/init.ts` (`chooseTracker` gains the O1/O2 offer-and-continue arms and O12's one-shot
bound; `offerInstall`/`resolveMissingBinary`/`installSelectedBackendIfRequested` lose their install
arm; `missingTrackerBinary` takes the pinned remedy; the O3/O6 migration offer replaces the
in-wizard migrate/keep/backlog prompt, and `runWizardBacklogMigration` and its interactive collision
retry become dead code and are removed — `runBacklogMigration` stays for the explicit
`--migrate-backlog` flag path; `assertFlagCombinations`'s Backlog hint gains the actor
context); `src/adapters/tracker-environment.ts` (the installer goes; `installCommandFor` survives
as text, pinned for quest); `src/cli.ts` (forward a `trackerEnvironment` seam — and no installer
seam — so the router tests never read the machine or shell npm again); `test/cli.test.ts` (the
LORE-260 test injects a detected environment; it must never depend on, or mutate, the runner);
`test/init.test.ts` (the offer tests become stop-and-instruct tests; the `--install-tracker` tests
become deprecation tests; the migration-prompt tests become offer tests); `docs/reference/cli-surface.md`
(its exit-4 clause for "the wizard's collision retry declined to import one family" retires with the
wizard's migration arm — exit 4 itself remains in use for `--remove-backlog` refusals; **correction,
2026-09-30 (LCLI-656): this sentence named "scaffold collisions" as an exit-4 case, and they are
not. Scaffold collisions are `conflict`, exit 5 — `test/init.test.ts:1928` pins it and the same
`cli-surface.md` row already recorded it — so the aside named the wrong class. The exit-5 row now
also names Quest's id-collision refusal on the `--migrate-backlog` flag path, which was exit 5
already (`src/tracker-migration.ts:244`) and was simply not spelled out there.**); ADR-0017 gets
its amendment pointer at acceptance time.

## Consequences

- **lore stops mutating the machine outside the repository.** A first run never installs a global
  package the operator did not choose, never runs another tool's init, and never migrates tracker
  data on their behalf. The cost is one extra round trip in each not-ready case: `lore init` stops,
  the operator runs the printed commands, and reruns. That cost is the ruling's explicit trade, and
  the failure is a single message with the exact commands.
- **The remedy text is version-correct.** The instruction names lore's exact paired version, so a
  new user is never told to install a quest that lore will then refuse.
- **The Windows red is fixed at the cause, not the symptom.** Retiring the install arm removes the
  repository's only global-install site from every path a test can reach; with nothing installing
  quest mid-suite, `test/link-quest-race.test.ts` skips on windows exactly as it already does on
  ubuntu, and `lint · typecheck · test (windows-latest)` on the bump branch can go green. The
  companion requirement is the `trackerEnvironment` seam in `src/cli.ts` plus the updated LORE-260
  test: without it the test would replace a network install with a test that still depends on the
  machine it runs on, and the next environment-dependent failure would be believed. Two residual
  notes: the LCLI-614 tests remain workstation-only coverage by their own design, and the install of
  quest in CI remains only where it belongs — the workflows' own pinned steps (DEC-55's
  `setup-quest`).
- **What this does to opum-ai/lore-cli#433.** The bump stays held as a draft. The proposed sequence
  is: this decision's implementation lands on `dev` in its own PR once the operator approves; #433
  then merges `origin/dev` (the realign its handoff already owes), re-runs, and the sixth required
  context goes green by the measurement above; its final acceptance criterion ("landed with all six
  green") becomes satisfiable and #433 lands by squash. Nothing here changes DEC-55's landing order
  or the hold on promotion. Landing the change inside #433's branch instead was considered and
  rejected: it would couple an onboarding contract change to a version bump and take both through
  one approval. Until the implementation lands, re-running the windows job on #433 will keep
  failing, and that red should be read as this ADR's open item, not as a new defect.
- **The flag removal is a one-release, announced breaking change** for scripts that passed
  `--install-tracker` expecting an install; during the deprecation release they receive the
  instructions plus the note, after removal a usage error. `--install-tracker`'s only in-repo
  consumers are its own tests and the CLI docs.
- **The interactive migration stops being run by lore.** An operator who used the wizard's
  "migrate" arm now gets the commands instead — one more step for them, and the removal of a second
  machine-mutating site (the migration writes through Quest's receipt lifecycle) from the wizard's
  path. The explicit `lore init --tracker quest --migrate-backlog` path is unchanged and remains
  the one command that runs it.
- **Alternatives considered and rejected.** (a) Pinning `installTrackerPackage` to lore's own
  version — keeps lore installing on the operator's behalf; measured and rejected by the operator.
  (b) Test-only skip-on-version-mismatch — fixes CI while leaving the machine-mutating behavior,
  and would leave the mechanism (a test's default answers) in place for the next version pair.
  (c) Fixing only the test's install seam without changing the product — rejected because the
  measurement exposed a product-surface behavior the operator does not want, not merely a test bug;
  and the seam fix is required *in addition*, not instead. (d) An up-front interrogation (every
  offer before the tracker question) — rejected as the recommendation for the reasons in "The flow,
  in order"; it remains the named alternative if the operator prefers it. (e) Firing the JIRA offer
  on the detected binary alone — rejected as noise (see the JIRA section).

### Points recorded for the operator's approval or correction

Approved as written with DEC-62 (the option label in Status); recorded here as exactly what the
approval covers. Each had a recommendation above, and any of them can be struck without touching the
rest:

1. **Offers fire on selection**, in the wizard, after the tracker question — not as an up-front
   interrogation. (Alternative: fire before the question; see "The flow, in order".)
2. **The migration offer fires for quest and backlog selections**, not for jira or none.
   (Alternative: quest selections only, exactly where today's migrate/keep/backlog prompt sits.)
3. **The JIRA→Quest migration offer is not included**, because no runnable migration command exists
   today (measured); options (A) ship the three working offers now and add it when the command
   exists — recommended, (B) ship it with an honest but incomplete "yes", (C) expose the importer
   in quest-cli first.
4. **The proposed defaults** (yes on O1/O2/O3-with-quest; no on O6-with-backlog).
5. **The two-step remedy carve** — `quest init` is dropped from the message when the workspace
   marker already exists.
6. **The tightened explicit-`--tracker` path**, including Backlog's two new fatal classes (missing
   binary → 3, no project → 6) that are advisory today.
7. **The bare-init default and `--no-tracker` remain unchanged** (LORE-260).
8. **The deprecation reading** — the flags stop installing immediately, are accepted with a note
   for one release, then are removed.
9. **Exit codes are unchanged** (3 for a missing CLI, 6 for an uninitialized repository or an
   outstanding Backlog choice, 2 for the wizard's own EOF): a "yes" is a choice, and the class
   names the state, not the choice.
10. **Non-interactive runs stop with the instructions** rather than continuing as if the answer
    were "no".

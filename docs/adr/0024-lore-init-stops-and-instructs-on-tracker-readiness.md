---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: "Tracker readiness is the operator's step: lore init stops and instructs, and never installs or initializes a tracker (DEC-57)"
tags:
  - adr
  - init
  - tracker
  - quest
  - dec-57
  - windows-ci
summary: "lore init detects whether the selected tracker's CLI is installed and the repository initialized, then stops with exact instructions; it never installs or initializes a tracker."
timestamp: 2026-09-29T20:06:16.586Z
status: draft
---

# ADR-0024: Tracker readiness is the operator's step: `lore init` stops and instructs, and never installs or initializes a tracker (DEC-57)

## Status

**Draft — proposed 2026-09-29, awaiting the operator's review and approval. No part of this
workflow is implemented.** Nothing under `src/` or `test/` changes until the operator approves the
written workflow, which is the form DEC-57 itself requires (Article 5). This record is the artifact
for that approval; the implementation is a separate task, created only after approval.

When accepted, this ADR **amends ADR-0017** (interactive `lore init` wizard, TTY-gated) by removing
its tracker install offer, and **narrows LCLI-358.3** (tracker-environment detection and its install
offer) to detection plus instruction. It introduces no new exit codes: every stop below reuses a
class that already exists in ADR-0005's contract, so scripts branching on exit codes see the same
classes they see today.

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

Two readings are recorded here so the operator can correct them rather than have them silently
assumed. **First**, "We want to highly encourage them to use Lore, but it's not requred" is read, in
context (the surrounding sentences are all about tracker selection), as **Quest** — lore's
first-class tracker — not as lore itself; the consequence is that no tracker is ever required and
`none` is always an allowed choice. **Second**, "do not offer to install or init them" is read as
applying to **every** backend lore detects, not only to quest: the ruling names quest because quest
is lore's first-class tracker and the case in front of it, and the sentence's own "them" is jira and
backlog.md.

### What `lore init` does today (the review this decision asked for)

**Detection is already the right shape.** `src/adapters/tracker-environment.ts` (LCLI-358.3)
answers, for each backend, two questions cheaply and locally: is the CLI on `PATH` (`Bun.which`),
and is this repository initialized for it (a single marker file). It never spawns a backend.

| backend | binary | package | repository marker |
|---|---|---|---|
| quest | `quest` | `@opum-ai/quest` | `.quest/workspace.toml` |
| backlog | `backlog` | `backlog.md` | `backlog/config.yml` (a bare `backlog/` directory is deliberately not a project, LCLI-358.5) |
| jira | `jira` | `@salient-ai/jira-cli` | none — readiness is credential-profile state jira-cli owns, so lore reports it as unknown until jira-cli is asked (LCLI-358.4) |

**What is wrong is what `lore init` does with a missing binary.** Both binaries lore can install
are offered as an install: the wizard's `offerInstall` (`src/commands/init.ts`, prompted as
"`<binary>` is not installed. Run `npm install -g <package>`?", default yes) and the non-interactive
`--install-tracker` flag both reach `installTrackerPackage`, which shells
`npm install -g <package>` — **unpinned**, so always npm's `latest`. Declining the offer leads to a
second offer ("Choose a different tracker instead of `<backend>`?"), then to the stop that already
exists (`missingTrackerBinary`: exit 3, hint naming the install command and the other backends).
Two further gaps: the wizard checks only `installed`, never `initialized` — an installed-but-not-
`quest init`-ed choice sails through the wizard — and the explicit `--tracker quest` path
deliberately keeps "not on PATH" **advisory** (LCLI-356/376 made only a version-floor rejection and
an uninitialized Quest workspace fatal before persisting). Jira is the existing precedent for the
shape this ADR generalizes: lore never installs jira-cli, and when no credential profile exists
`configureJira` stops, naming `jira init` — because that command is interactive and handles
credentials, and lore must never learn them. **Lore never runs `quest init` or `backlog init`
today, and this ADR keeps it that way.**

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
- `src/cli.ts`'s init handler forwards `adapter`, `prompter`, `agentAvailability` and `agentPlugins`
  from the run context but **no `trackerEnvironment` and no `installTracker`** — so the real
  detection and the real, unpinned `installTrackerPackage` are what run.
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

**Principle: `lore init` detects and instructs; it never installs and never initializes a tracker.**
The two facts that make a backend usable — its CLI is on `PATH`, and this repository is initialized
for it — are the operator's to establish, with their own package manager and the tracker's own
init command. lore's part is to check both and to say exactly what is missing.

### The detected states, and what each one does

Detection stays as reviewed above (PATH lookup plus marker file; jira's readiness still asked of
jira-cli only when selected). "Selected" means a wizard choice or an explicit `--tracker <backend>`;
see "Scope" below for the paths that do not select.

| backend | detected state | `lore init` | exit |
|---|---|---|---|
| quest | `quest` not on PATH | stop; install `@opum-ai/quest@<lore's exact version>`, `quest init` (only when the workspace marker is absent), rerun `lore init` | 3 |
| quest | on PATH, `.quest/workspace.toml` absent | stop; run `quest init`, then rerun `lore init` | 6 |
| quest | on PATH and initialized | proceed (the runtime pair lock, LCLI-650, still requires exact version equality) | — |
| backlog | `backlog` not on PATH | stop; install `backlog.md` (floor 1.49.0), `backlog init`, rerun `lore init` | 3 |
| backlog | on PATH, `backlog/config.yml` absent | stop; run `backlog init`, then rerun `lore init` | 6 |
| backlog | on PATH and a project | proceed (the version floor still applies, LCLI-370) | — |
| jira | `jira` not on PATH | stop; install `@salient-ai/jira-cli` with your own package manager, run `jira init` (interactive; it handles credentials — lore never does), rerun `lore init` | 3 |
| jira | on PATH, no credential profile | stop — today's text, unchanged: jira-cli has no credential profiles, run `jira init` | 3 |
| jira | on PATH and a profile | proceed | — |
| none | always | nothing detected, nothing printed | 0 |

Draft message text for the ruling's own case (quest, binary missing; message and hint as the
`LoreError` pair, `message` first):

```
the `quest` CLI is required for the quest tracker and is not on PATH
install @opum-ai/quest@<lore's exact version> (`npm install -g @opum-ai/quest@0.12.0`),
run `quest init`, then rerun `lore init` — or choose another backend with
`lore init --tracker <quest|backlog|jira|none>`
```

with the `quest init` step dropped when `.quest/workspace.toml` already exists (it is one of the two
facts already detected; telling an initialized repository to initialize is noise). The other
backends follow the same pattern with their own binary, package and init command, and the existing
`missingTrackerBinary` / `Quest workspace is not initialized` strings are the starting points rather
than new prose. The exit codes are today's: 3 (`not_found`) for a missing CLI, 6 (`validation`) for
an uninitialized repository — so nothing that branches on exit codes today has to change.

**The version in the remedy is lore's own exact version, never "latest".** The pair lock already
prints exactly this instruction when versions diverge, and handing a new user `npm install -g
@opum-ai/quest` (latest) can install a quest that lore then refuses. This makes the onboarding
message and the runtime remedy one sentence.

### The flag deprecation (restated here for approval)

- `--install-tracker` **stays accepted for one release and stops installing.** When the selected
  backend is not ready it prints the same stop-and-instruct text above, plus a deprecation note;
  when the backend is ready it is a no-op with the same note. The note reads, in draft: "deprecation:
  lore no longer installs tracker CLIs on your behalf; this flag will be removed in the next
  release."
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
offer that existed only to escape it, and the two-pass loop it drove with it. A not-ready choice stops with the message above; the
hint already names the other backends, so the wizard does not need to loop. The summary's "not
installed" line keeps naming the install command, pinned to lore's version, so the information
remains visible before the choice is made.

### Scope: where the stop fires, and where it deliberately does not

- **Fires:** a wizard choice, and an explicit `--tracker <backend>`. The explicit path's pre-persist
  verification (LCLI-356/376) extends to "not on PATH", which is **advisory today** — this is a
  deliberate tightening, and the reason is the ruling's own words: a persisted `backend = "quest"`
  in a repository with no quest is precisely the "not usable, discovered later" state the stop
  exists to prevent.
- **Does not fire, proposed:** a bare non-TTY `lore init` on a repository with no bundle keeps
  today's behavior — it pins the default backend (`quest`) and probes nothing, because no choice was
  expressed (LORE-260: a bare init has never spawned a tracker subprocess). A repository pinned
  this way reaches the same stop on its first tracker-touching command.
- **Unchanged escape hatch, proposed:** `--no-tracker` still skips the verification for an explicit
  `--tracker`, for scripted pinning; `none` stays always allowed.

### What implementation will touch (not done here)

For the follow-up task, so it is reviewed against this record rather than rediscovered:
`src/commands/init.ts` (`chooseTracker`/`offerInstall`/`resolveMissingBinary`/`installSelectedBackendIfRequested`/`missingTrackerBinary`, the flag parse and its deprecation note); `src/adapters/tracker-environment.ts` (the installer goes; `installCommandFor` survives as text, pinned for quest); `src/cli.ts` (forward a `trackerEnvironment` seam — and no installer seam — so the router tests never read the machine or shell npm again); `test/cli.test.ts` (the LORE-260 test injects a detected environment; it must never depend on, or mutate, the runner); `test/init.test.ts` (the offer tests become stop-and-instruct tests; the `--install-tracker` tests become deprecation tests); `docs/reference/cli-surface.md`; ADR-0017 gets its amendment pointer at acceptance time.

## Consequences

- **lore stops mutating the machine outside the repository.** A first run never installs a global
  package the operator did not choose, and never runs another tool's init. The cost is one extra
  round trip in the missing-binary case: `lore init` fails, the operator installs and initializes,
  and reruns. That cost is the ruling's explicit trade, and the failure is a single message with the
  exact commands.
- **The remedy text is version-correct.** The instruction names lore's exact paired version, so a
  new user is never told to install a quest that lore will then refuse.
- **The Windows red is fixed at the cause, not the symptom.** Retiring the offer removes the
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
- **Alternatives considered and rejected.** (a) Pinning `installTrackerPackage` to lore's own
  version — keeps lore installing on the operator's behalf; measured and rejected by the operator.
  (b) Test-only skip-on-version-mismatch — fixes CI while leaving the machine-mutating behavior,
  and would leave the mechanism (a test's default answers) in place for the next version pair.
  (c) Fixing only the test's install seam without changing the product — rejected because the
  measurement exposed a product-surface behavior the operator does not want, not merely a test bug;
  and the seam fix is required *in addition*, not instead.
- **Points recorded for the operator's approval or correction** (each has a recommendation above,
  and any of them can be struck without touching the rest): the two readings in Context (Quest, and
  "them" = all backends); the two-step remedy when the workspace marker already exists; the stop
  rather than a re-ask in the wizard; the tightened explicit-`--tracker` path; the bare-init default
  and `--no-tracker` remaining unchanged; the deprecation reading that the flags stop installing
  immediately rather than after a release.

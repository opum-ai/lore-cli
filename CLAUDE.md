
<!-- QUEST WORKFLOW GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Quest Workflow

This project cut LCLI over from Backlog to Quest as its tracker of record on 2026-09-03
(425 records migrated; digest 1dd84c5eb53d6c76672031e0343dfa4e0f77a5394f8bf0a756bf53c4da3d8640).
`.quest/` is committed and tracked — never gitignore it. `backlog/` no longer exists on disk:
its 297 excluded LORE-family records were all proven non-unique and removed at commit f84f586,
recoverable from git history if ever needed. Do not recreate `backlog/` or write LCLI tasks
there — Quest is the only system of record.

**For every user request in this project, run `quest instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Quest tasks.

Use the detailed guides when needed:
- `quest instructions task-creation` for creating or splitting tasks
- `quest instructions task-execution` for planning and implementation workflow
- `quest instructions task-finalization` for completion and handoff

Use `quest <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit `.quest/tasks/*.json` directly. Use the `quest` CLI so metadata, relationships, and
history stay consistent. Every write needs an explicit actor: `--actor <id> --actor-kind human`
for a human operator, or `--actor-kind delegated-agent --accountable-human <id>` for an agent
session acting on someone's behalf — a missing or wrong `--actor-kind` is rejected, not defaulted.

</CRITICAL_INSTRUCTION>
<!-- QUEST WORKFLOW GUIDELINES END -->

<!-- opum:fleet-operating:begin -->

@~/.claude/opum-fleet-operating.md

<!-- opum:fleet-operating:end -->

## Delegation

**Specialist subagent delegation is authorised in this repository.** Use the `opum-workflow`
agents — `implementer`, `reviewer`, `verifier`, `documenter` — for scoped implementation,
adversarial review, qualification, and documentation work, without asking first. This line exists
because the harness rule naming "the user, a CLAUDE.md file, or a skill" as the authorities means
a peer's relay is never sufficient on its own; recorded here so the question is settled rather
than re-asked every session. User ruling, 2026-09-13.

Two things that are not optional, both learned the hard way on 2026-09-13:

- **Give each agent exclusive file scope, and check it against your own in-flight branches too,
  not just against the other agents.** Concurrent worktrees do not protect you from handing an
  agent a file that an open PR of yours is about to change underneath it.
- **Read the agent's tool list before dispatching.** `documenter` ships with no Bash, so it cannot
  run `lore`, `lore check`, or git — every documentation deliverable in this repo needs all three.
  Route doc work to `implementer` until that is fixed upstream.

**A gate that is wrong fails only during a release**, so anything touching `release.yml` or
`scripts/` gets a `reviewer` pass before it lands. Match ceremony to risk otherwise: a
documentation section does not need three agents.

<!-- lore:agents:begin -->
This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under `docs/`.
Drive docs work through `lore` (not a plain editor or `grep`) so Story <-> Task coupling, managed
blocks, and cross-links stay coherent.

- **Find and read docs:** `lore query "<words>" --limit 5`, then `lore read <id>` for the best hit.
- **Skill:** installed from the `opum-lore` Claude Code plugin, not this repository — how to drive lore.
- **Just-in-time detail:** run `lore instructions` for the canonical agent loop, then
  `lore instructions <topic>` (`retrieval`, `linking`, `sync`, `check`, `validation`, `types`, `workspace`, `agents`).
<!-- lore:agents:end -->

## lore-cli — repository profile

Facts true of this repository only. The operating model above is byte-identical
fleet-wide; this block is where repositories legitimately differ. Keep these four
headings in this order in every repo, and write "None known." rather than deleting
a heading that has no entries yet.

Written 2026-09-15, and it is a RESTORATION rather than a first draft. This
section did not survive the fresh-history cutover for the public repository
(`e3d75867`): no CLAUDE.md in the rebuilt history has ever carried one. What made
that invisible is that three things went on describing a profile that was not
here -- the shared operating block twice sends per-repository facts "to each
repository's own profile block below", `ci.yml` cited its Ownership section by
name, and `docs/reference/lore-cli-repository-notes.md` says the repo profile is
one of the things that *stayed* in CLAUDE.md when reference material moved out
(OPAG-37). All three were true before the cutover and false after it, and nothing
compares prose to prose. Two of ten repositories were in this state; opum-agent
owns the fleet-level half. Everything below was measured when written, not
recovered from the old file.

### Role

Builds the `lore` CLI — an OKF-native documentation tool — and publishes it to npm
as `@opum-ai/lore` with per-platform native binaries. Also the source of the
`opum-lore` Claude Code plugin's skill content, cut from the same release tag as
the CLI. It owns the tool; it does not own what any consuming repository decides
to document with it.

### Retirement machinery carried here

None known. Checked rather than assumed: no suite, script, or CI job in this
repository detects or sweeps leftover Treehouse, Codex, or OpenCode state. The
only hits are product surface and stay — `src/core/codex-bridge.ts`,
`src/core/antigravity-bridge.ts` and the `init` wizard's AGENTS.md option, which
names OpenCode among the tools that read that file. That is a published flag set
external users invoke, which the retirement-scope rule explicitly protects.

### What other repositories read from here

**`opum-marketplace` federates this repository's `skills/` directory by TAG.** Its
`.claude-plugin/marketplace.json` pins `opum-ai/lore-cli` at a tag name, and
`scripts/check-federated-content.mjs` re-resolves the whole chain — tag ref, tag
object, commit, root tree, `skills/` subtree — against a recorded baseline in
`scripts/federated-pin-baselines.json`. Read by ref 2026-09-15: pinned at `v0.7.0`,
`skills/` baseline `2998f74d077845f8ad73f83aa296e37e034378a4`.

Two things follow, and the second is the one that gets misstated. Anything landing
under `skills/` changes what the next tag ships to plugin users, so it is not an
internal-only edit. And **their check does not go red when this repository tags**
— it re-resolves whatever ref is currently pinned, which is immutable, so an
unrelated new tag never puts them at risk. The handshake (tracked as LCLI-469) is
so their eventual pin bump is bookkeeping rather than archaeology: at tag-cut time
send the tag name, tag object SHA, the commit it peels to, and the resolved
`skills/` tree SHA, then send a second message when npm actually publishes, because
they deliberately hold the pin until `dist-tags.latest` moves. Send the numbers to
be re-resolved, not trusted; re-resolving them is the whole point of their file.

No sibling repository references a `lore-cli/` file path by ref — checked across
opum-agent, opum-doc, opum-cli-e2e and opum-marketplace on their own `dev`, 2026-09-15.
The coupling above is the published artifact, not a path into this checkout.

### Constraints and couplings to respect

**The SHA that lands on `main` carries TWO runs of `ci.yml`, and they disagree on
purpose: the `pull_request` one is red by design, the `push` one is your green.**
Ask for them by SHA and read the event column, because `gh run list` shows you the
newest and it reads like the only one:

```sh
gh api "repos/opum-ai/lore-cli/actions/runs?head_sha=<sha>" \
  -q '.workflow_runs[] | "\(.id) \(.name) \(.event) \(.status)/\(.conclusion)"'
```

That query is repository-wide, not `ci.yml`-scoped, so filter on the name before
counting: `upstream-backlog-watch.yml` fires on a schedule against whatever SHA
`dev` happens to hold, and a promotion makes `dev`'s tip and `main`'s tip the same
commit — so a third, unrelated, green `schedule` run routinely appears alongside
the two. Run verbatim against `ccda1dd7` on 2026-09-16 it returns exactly that:
`35155792741` CI push success, `35155304664` CI pull_request failure, and
`35090664272` Upstream Backlog.md --json tag watch schedule success. Since
LCLI-605 a landing SHA also carries a `Main fast-forward guard` push run, the
guard's own workflow, which a docs-only promotion no longer skips.

Main's landing commit is the one commit here that gets both, because `ci.yml`'s
`push:` trigger is `branches: [main]` — LCLI-251 dropped `dev`, so a `dev` squash
commit still gets no run of its own. The `pull_request` run necessarily contains
`promotion is manual` failing **by design**: it exists to put an unmissable red X
on any PR targeting `main`, so nobody lands a promotion with the merge button. The
`push` run is the one that fires from the promotion itself. Until LCLI-605 it
was also where `main is fast-forward of dev` executed; that job now runs as its
own `Main fast-forward guard` push run on the same SHA, and has no PR run at all.

Measured across two promotions. 2026-09-16, landing `ccda1dd7`: `35155304664`
(pull_request) failure whose ONLY red job is `promotion is manual`, and
`35155792741` (push) `success` across all fifteen jobs. 2026-09-15, landing
`e4b384b9`: `34996985802` (pull_request) failure, and `34997754121` (push) with
every substantive job green including `main is fast-forward of dev`, carrying the
aggregate `cancelled` only because `lint · typecheck · test (macos-latest)` — not
a required context — was cancelled. The promotion before it repeats the shape
exactly: `34999719292` on `41ac5a65`, same one cancelled macos job, rest green.

An earlier revision of this paragraph said the landing SHA's "only run" was a
failure and warned that an auditor would find a red one. It had enumerated the
`pull_request` runs and stated a conclusion about the runs on the SHA — the two
objects differ by precisely the `push` run. That is the failure mode the fleet
operating block's **"Name the object you measured and the object your claim is
about"** paragraph (under its Tools heading, imported at the top of this file)
exists to name, committed here in the profile that imports it. Reading the
warning is evidently not the same as applying it, which is the argument for
writing the query above rather than the conclusion.
Correcting it does not make a green push run a *gate*:
`rules/branches/main` still returns `[]` (re-read 2026-09-16), so it is evidence,
not enforcement. Two caveats keep the new claim honest. A docs-only promotion
produces no `ci.yml` push run, because that trigger carries `paths-ignore` for
Markdown below the root (`*/**/*.md`), the root `.md` files it lists by name,
`docs/**`, `backlog/**` and `.claude/**`. `CLAUDE.md` and `README.md` are
deliberately not ignored (LCLI-602): three required jobs read `CLAUDE.md`, and
compile smoke runs `README.md`'s quickstart. The fast-forward guard is NOT
behind that filter: it lives in `main-fast-forward-guard.yml`, which carries no
path filter (LCLI-605), so even a docs-only promotion runs it. And the gating evidence is
still the run on the PR head that merged into `dev`, a third SHA again —
`35030927529` on `02deee37` for the 2026-09-16 promotion, `34996243105` on
`9d1d631d` for the one before. Cite the `dev`-side run, and say which one.

The 2026-09-15 `pull_request` run also carried a SECOND failure that was not
designed — an npm E404 fetching `@types/node` in `docusaurus scaffold smoke`,
upstream and unrelated. Re-running the failed jobs cleared it. Two reds wearing
the same colour is the normal case here, not the exception, so read which jobs
failed rather than the run's conclusion — and note that the same rule is what
makes the `cancelled` push runs above readable as green-but-for-one-cancelled-job
rather than as failures.

**`dev` is gated; `main` is not.** Ruleset `require-ci-on-dev` (id `22838594`)
requires five contexts as of 2026-09-15: `docker e2e harness (real lore + backlog
binaries)`, `lint · typecheck · test (windows-latest)`, `lint · typecheck · test
(ubuntu-latest)`, `Tracker integrity`, and `lore check (docs gate)` (LCLI-504).
Two of those carry U+00B7, not an ASCII period — a required context is matched by
RENDERED job name, and one that does not match is ABSENT rather than red, which
blocks `dev` silently until an admin notices. Verify a new context by codepoint
against a real run before writing it into the ruleset.
`gh api repos/opum-ai/lore-cli/rules/branches/main` returns `[]`, so the honest
phrasing for a promotion is "no checks are configured on `main`; they ran and
passed on `dev`" — never "checks passed".

The two promotion guards (`promotion is manual`, `main is fast-forward of dev`) are
deliberately NOT required contexts, for two different reasons that an earlier
revision of this paragraph collapsed into one. `promotion is manual` runs only on
PRs into `main`, so requiring it would leave the direct push with no run to
satisfy. `main is fast-forward of dev` runs only on the PUSH to `main` (its
workflow has no `pull_request` trigger, so it does not appear in a promotion-PR
rollup at all, and a green rollup says nothing about it), and
fires from the very push it would gate, so it can only go red after the fact.
It asserts both that the new tip already sits on `dev` and that the old tip is an
ancestor of the new one (LCLI-514: before that it measured containment alone, and
a rewind of `main` to an older `dev` commit stayed green). It runs on every push
to `main`, docs-only included -- except a head commit carrying a `[skip ci]`-style
token, and a push whose tip predates LCLI-605, which runs that older tree's
workflows instead: it lives in its own workflow,
`main-fast-forward-guard.yml`, with no path filter (LCLI-605). Until then it sat in
`ci.yml`, whose `push` path filter applies to the whole file, so a
Markdown-only push (a rewind included) skipped the one guard `main` has.
`test/ci-workflow.test.ts` pins that the guard workflow stays unfiltered.

**Promotion shape, which `ci.yml` cites as procedure:** open a PR from `dev` into
`main`, confirm the newest run per context on that exact SHA, then
`git push origin origin/dev:main` — the remote-tracking ref, never local `dev`,
which can be stale in a recycled session and will silently fast-forward `main` to
the wrong SHA. GitHub auto-marks the PR MERGED and no merge commit is created.
Do not use the merge button: it staples a commit onto `main` that `dev` never has,
and `main` can then never fast-forward again.

**`release.yml` is `workflow_dispatch` only, with `publish` defaulting false.**
Nothing on `main` publishes to a registry on a push, which is why promotion here is
ordinary delivery rather than registry publication. If that trigger ever changes,
promotion becomes an irreversible action and goes to this session's own user
instead of the orchestrator.

<!-- quest:agent-instructions:begin -->
# Quest agent instructions

This project uses Quest CLI 0.10.0 for tracker operations. Run `quest manifest --json` to discover the supported command contract.

Read the matching guide before tracker work: `quest instructions overview` for the command set and machine contract, `quest instructions task-creation` before creating or splitting tasks, `quest instructions task-execution` before claiming, planning, or recording progress, `quest instructions task-finalization` before checking acceptance criteria or closing a task, and `quest instructions workspace` for initialization, managed instructions, and Backlog.md migration. `quest instructions --list` lists every guide. Search for an existing record with `quest search "<query>" --json` before creating one, and run `quest help <command>` for a command's options and examples.

Quest writes require an explicit actor declaration: `--actor <id> --actor-kind human` for a person, or `--actor <id> --actor-kind delegated-agent --accountable-human <id>` for an agent acting on a person's behalf. Do not edit Quest-authored records directly. CI should run `quest agents --check --require-installed --target claude`: current instructions, and a version-only difference (only the pinned Quest CLI version number is stale) both exit 0; missing, drifted, or malformed managed instructions exit 6. Quest does not retry write conflicts automatically; callers should read the latest task state and perform their own bounded retry when a command returns conflict/exit 5.
<!-- quest:agent-instructions:end -->

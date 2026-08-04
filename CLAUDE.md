
<!-- BACKLOG.MD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Use the detailed guides when needed:
- `backlog instructions task-creation` for creating or splitting tasks
- `backlog instructions task-execution` for planning and implementation workflow
- `backlog instructions task-finalization` for completion and handoff

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

<!-- lore:agents:begin -->
This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under `docs/`.
When working on documentation, drive it through `lore` (not a plain editor) so Story <-> Task
coupling, managed blocks, and cross-links stay coherent.

- **Skill:** `.claude/skills/lore/SKILL.md` — how to drive lore.
- **Just-in-time detail:** run `lore instructions` for the canonical agent loop, then
  `lore instructions <topic>` (`linking`, `sync`, `check`, `validation`).
<!-- lore:agents:end -->

## Fleet routing and cross-repository authority

This repository is `opum-ai/lore-cli`. It is authoritative for what Lore actually
ships — command surface, MCP tool schemas, adapters, tests, and release evidence.
It is not authoritative for anything else in the estate.

**Before answering any cross-repository, ownership, package-status, or
infrastructure question, read the owner record rather than inferring from local
context:** `salient-data/opum-doc`, branch `dev`,
`docs/reference/fleet-peer-routing-and-session-invocation.md`. It maps every peer
to the concerns it owns and records how a session reaches one. **Every repository
in this estate is private**, so every `github.com` link to one is access-gated
rather than a destination — confirm access before relying on it
(`gh api repos/salient-data/opum-doc`), and never put such a link on a public
surface, where it is broken by construction.
For any infrastructure, DNS, hosting, deployment-target, environment, or
secrets-layout question, the authority is that repository's
`docs/adr/make-saws-the-single-owner-of-infrastructure-and-dns.md` — route to
`saws`, never to the `*-web` peer that serves a hostname. Routing the question is
not the whole rule: **no repository other than `saws` creates, modifies, or
deletes a DNS record, in any zone, for any provider — preview and ephemeral
hostnames included.** That prohibition binds this repository too. Record only the
hostnames, environment variables, and deployment targets Lore CLI consumes, and
link to `saws` for the authoritative state; an infrastructure change is not real
until `saws` reflects it.

Five traps that local context will not warn you about:

- **GitHub owners are not uniform, and an existence check cannot tell you so.**
  As observed on 2026-08-04: `lore-cli` and `quest-cli` are `opum-ai`;
  `lore-doc`, `lore-api`, `lore-mcp`, `lore-graph`, `lore-web`, `quest-doc`,
  `quest-web`, and `opum-doc` are `salient-data`; `saws` is `jeremy-newhouse`.
  Treat that list as a then-current observation — the owner record above wins if
  it disagrees. Both CLIs' former `salient-data` URLs still redirect, and
  `gh api repos/<old-org>/<repo>` returns **200** through that redirect, so
  "I checked, it exists" is not a check and will confirm a stale citation.
  Read the owner back and compare it to what you were about to write:
  `gh api repos/<owner>/<repo> --jq .full_name`.
- **A public package does not imply a public repository.** `@opum-ai/lore` is
  published, public, and MIT-licensed, while `opum-ai/lore-cli` is private — the
  product owner deliberately waived the release gate that required otherwise.
  So never hand the repository URL to a reader as somewhere they can go: it
  returns 404 to anyone outside the org. Mark it private at every citation, and
  point users at the npm package instead. See
  [Lore CLI release truth](docs/reference/lore-cli-release-truth.md).
- **Quest is not installable.** `@opum-ai/quest` returned a registry 404 on
  2026-08-04. Never present it as published, installable, or available, and
  never build the thing that implies it — the prohibition covers artifacts, not
  just wording: no install command, package badge, or version reference; no
  coming-soon install affordance, disabled or otherwise; and no manifest entry,
  dependency, lockfile pin, or fixture that would resolve the package. The
  unscoped `lore` and `quest` npm names are unrelated third-party packages;
  always use the `@opum-ai/` scope.
- **Peers are ephemeral live sessions, not per-repository services.** There is no
  `mcp__<repo>__*` server. MCP peer servers are per *machine*
  (`claude-peer-jetson`, `-mbpm2`, `-rpi5`, `-spark`) and reach only *other*
  machines, so they never list this host's siblings; a remote peer is addressed
  `machine.repo.name`, found via `who()` and reached with
  `send_prompt(recipient_session=...)` then `wait_for_completion(message_id)`.
  An unreachable peer means no live session, not a missing repository.
- **Same-host siblings go through `herdr`, and a success response is not
  delivery.** `herdr agent list` returns every live agent on this host with its
  `pane_id`, `cwd`, `agent` kind, and `agent_status`;
  `herdr agent prompt <pane_id> "<text>"` sends to one. **`prompt` reliably
  pastes but does not always submit** — the text can sit unsent at the target's
  input prompt while it stays `idle`, and the call returns success either way.
  Confirm with `herdr agent read <pane_id>`; a buffered message shows as
  `[Pasted text #1 +N lines]`, and `herdr agent send-keys <pane_id> enter`
  submits it. Only a target that flips to `working` has accepted the message.
  Two separate pane rules apply, because one repository can host several panes:
  address **one pane per repository**, or concurrent agents edit the same files;
  and choose that pane **by its `agent` kind**, because a `codex` pane will not
  act on a Claude-shaped notice the way a `claude` session does. On 2026-08-04
  this worktree was exactly that case — a live `codex` pane alongside its
  `claude` session — but pane composition changes by the hour, so read
  `herdr agent list` rather than trusting that sentence. Derived from the owner
  record's "Reaching a peer" on 2026-08-04; re-read it there before relying on
  these steps.

When this repository and a `*-doc` owner disagree, that is drift and drift is a
defect. This repository is authoritative for *what currently ships*; the `*-doc`
owner remains the normative owner of *what the contract is*. **Do not promote
either side — not quietly, and not with an announcement.** Report the divergence
to both owners and leave the conflict standing until an owner resolves it;
declaring a winner is not yours to do, and "code wins over prose" is not the
model. See
[Lore CLI documentation ownership](docs/reference/lore-cli-documentation-ownership.md)
for the concern-to-owner map this repository consumes.

### Writing a rule down here

Every failure mode below has already bitten this file. All are cheap to avoid.

**Write pointers, not transcriptions.** Steps copied out of an owner record keep
reading as correct long after the owner corrects them, because nothing here
changes when the source does. Cite the owner by repository, branch, and path and
let the reader resolve it — a pointer cannot go stale the way copied prose does.
When a cache is unavoidable, date it, name the owner authoritative, and say the
cache is the defect on disagreement. The `herdr` confirmation step above exists
because the first version of this section faithfully derived an incomplete
procedure and would have had a session report a delivery that never happened.

**Say "then-current", never "current".** An owner record's head can move several
times within one session, so any sentence phrased around a current head, org
layout, or live session list is wrong before it is read. A dated observation
stays true permanently; write what was observed and when.

**A fact-shaped sentence is not a rule.** Before writing a rule, ask: *can a
reader satisfy this sentence literally and still violate the rule it came from?*
"Makes no installability claim" is a fact, is satisfiable, and still permits a
greyed-out install button. If the answer is yes, write the imperative instead —
name the actions that are forbidden, not just the belief that is wrong.

**That test is the rule. The list below is not.** These are shapes already found
in this file — a record, not a checklist. It was written naming four shapes and
two more arrived the same day, which is the point: *finding none of them is not a
clear*. Run the test against the sentence in front of you; use the list only to
recognize a shape faster.

- **An adverb carrying the prohibition.** "Report it rather than *silently*
  promoting either" forbids the concealment, not the promotion, and is satisfied
  by promoting one loudly. Forbid the act.
- **Ownership stated without the act forbidden.** "`saws` owns DNS; route
  provisioning there" is satisfied by creating a preview record locally — every
  sentence honoured, the rule broken. Pair the owner with the hard negative.
- **A description forbidden while the artifact stays permitted.** "Never describe
  Quest as installable" permits adding the manifest entry, dependency, or
  lockfile pin that resolves it. Describe nothing, ship the scaffolding. Forbid
  building the thing.
- **A gate that enumerates by hand.** A curated file list is satisfiable while
  the rule it enforces is violated, and a green gate reads as proof — the most
  confident possible false clear. A directory-scoped scan is the same shape in
  disguise: `docs/`-only is a hand-scoped list wearing an enumeration costume.
- **A gate reporting the wrong exit code.** `tool | tail -2; echo $?` reports
  `tail`'s status, so a failing tool reads as a pass and looks identical to a
  real one. Take the code without a pipe — `tool >/dev/null 2>&1; echo $?` — and
  do not cite an exit code obtained any other way.
- **Treating the fix as exempt.** Closing a loophole is an authoring event, so
  the sentence written to close one is subject to this same test — the shape
  tends to reappear inside its own remediation. Two further consequences: a
  full-set replacement **re-authors every element**, including the ones the edit
  was not about, so re-read what you carried across verbatim; and fixing one
  instance of a shape is not fixing the shape — find its siblings.

**Apply the test to gates before prose.** A defective sentence misleads a reader;
a defective gate issues a certificate. A gate here must **enumerate** rather than
list — scan everything matching the pattern, never a curated set, and say so when
its scope is narrower than the repository so nobody reads it as the whole
guarantee; **assert non-vacuity**, so an empty or mis-globbed run fails instead of
passing; **justify each exemption individually and pin the exemption set**, so
widening it is a visible failure rather than a silent one; **report a real exit
code**, taken without a pipe; and **be proven by a negative control** — a
deliberate violation that makes the gate fail *and* name the offending path. A
gate never observed failing is not known to work. That last step costs about a
minute: `lore check` was proven here by adding a Reference with a dangling link,
confirming exit 6 naming both files, and removing it.

**Do not sweep with grep alone.** These shapes are semantic, so a verbatim search
misses them by construction — and it also misses literal matches that wrap across
two lines. Read the record.

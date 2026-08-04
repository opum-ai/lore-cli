
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
to the concerns it owns and records how a session reaches one. `opum-doc` is
private; confirm read access when you pull it (`gh api repos/salient-data/opum-doc`).
For any infrastructure, DNS, hosting, deployment-target, environment, or
secrets-layout question, the authority is that repository's
`docs/adr/make-saws-the-single-owner-of-infrastructure-and-dns.md` — route to
`saws`, never to the `*-web` peer that serves a hostname. An infrastructure change
is not real until it is reflected in `saws`.

Four traps that local context will not warn you about:

- **GitHub owners are not uniform.** `lore-cli` and `quest-cli` are `opum-ai`;
  `lore-doc`, `lore-api`, `lore-mcp`, `lore-graph`, `lore-web`, `quest-doc`,
  `quest-web`, and `opum-doc` are `salient-data`; `saws` is `jeremy-newhouse`.
  Both CLIs' former `salient-data` URLs still redirect, so a link that resolves
  is not proof the citation names the current owner. Verify the owner, not the
  link.
- **A public package does not imply a public repository.** `@opum-ai/lore` is
  published, public, and MIT-licensed, while `opum-ai/lore-cli` is private — the
  product owner deliberately waived the release gate that required otherwise.
  See [Lore CLI release truth](docs/reference/lore-cli-release-truth.md).
- **Quest is not installable.** `@opum-ai/quest` returns a registry 404. Never
  describe it as published. The unscoped `lore` and `quest` npm names are
  unrelated third-party packages; always use the `@opum-ai/` scope.
- **Peers are ephemeral live sessions, not per-repository services.** There is no
  `mcp__<repo>__*` server. MCP peer servers are per *machine*
  (`claude-peer-jetson`, `-mbpm2`, `-rpi5`, `-spark`); a peer is addressed
  `machine.repo.name`, found via `who()` and reached with
  `send_prompt(recipient_session=...)` then `wait_for_completion(message_id)`.
  Same-host siblings are reachable through `herdr agent list` and
  `herdr agent prompt <pane_id> "<text>"`. An unreachable peer means no live
  session, not a missing repository.

When this repository and a `*-doc` owner disagree, that is drift and drift is a
defect. This repository is authoritative for *what currently ships*; the `*-doc`
owner remains the normative owner of *what the contract is*. Report the
divergence to both owners instead of silently promoting either — "code wins over
prose" is not the model. See
[Lore CLI documentation ownership](docs/reference/lore-cli-documentation-ownership.md)
for the concern-to-owner map this repository consumes.

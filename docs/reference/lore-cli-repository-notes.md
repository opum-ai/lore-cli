---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Lore CLI repository notes
summary: CLAUDE.md authoring standards, cross-session release lessons, and the project-level skill inventory -- reference material, not every-session reading.
timestamp: 2026-09-05T12:19:13.871Z
---

# Lore CLI repository notes

Reference material moved out of `CLAUDE.md` (OPAG-37 criterion 1, 2026-09-05): each of the three
sections below is real and current, but none is something an ordinary task session needs before
acting, unlike the repo profile and routing traps that stayed. Read whichever section your task
actually touches — editing this file's own prose, coordinating with `quest-cli`/`opum-cli-e2e`, or
adding a project-level skill.

## Details

### Writing a rule down here

Write pointers, not transcriptions — cite the owner by repository, branch, and
path rather than copying its steps, since a pointer cannot go stale the way
copied prose does; when a cache is unavoidable, date it and name the owner
authoritative. Say "then-current", never "current" — an owner record's head
moves, a dated observation does not.

Before writing a rule, ask: *can a reader satisfy this sentence literally and
still violate the rule it came from?* If yes, write the imperative — name the
forbidden action, not the belief that is wrong. Shapes that pass this test
while looking fact-shaped: an adverb carrying the prohibition ("report it
rather than *silently* promoting" bans the concealment, not the act, and is
satisfied by promoting loudly); an owner named without the negative ("`saws`
owns DNS" is satisfied by provisioning locally anyway); a description
forbidden while the artifact stays buildable ("never describe Quest as
installable" permits shipping the manifest entry that makes it so); a gate
that enumerates a curated list instead of scanning everything matching the
pattern; a gate whose exit code passed through a pipe (`tool | tail -2; echo
$?` reports `tail`'s status, not the tool's); a gate that validates one
document against another instead of re-deriving from content — three
instances surfaced 2026-08-29 across `opum-cli-e2e` and `quest-cli`, all
removed by the same rule: bind on content, re-derive at check time, never read
the value out of the document being validated; and treating a fix as exempt
from this same test, since the shape tends to reappear inside its own
remediation, and a full-set replacement re-authors every element including the
ones the edit was not about.

A gate must additionally assert non-vacuity (an empty or mis-globbed run
fails, not passes), justify and pin its exemption set, and be proven by a
negative control — a deliberate violation that makes it fail and names the
offending path. `lore check` was proven this way: a dangling-link Reference
forced exit 6 naming both files, then was removed. These shapes are semantic;
grep alone misses them.

### What actually worked, and is worth repeating

Everything below was earned the expensive way on 2026-08-29/30, coordinating the lore/quest release
pairing across `lore-cli`, `quest-cli`, and `opum-cli-e2e` (see CLAUDE.md's "The three sessions that
ship this pair" for the live roster). It is not process for its own sake.

- **Verify a peer's claim instead of accepting it — especially a retraction.** When lore-cli
  retracted a wrong finding, opum-cli-e2e re-read `release.yml` and confirmed it with line
  numbers rather than taking the correction on trust. Three separate wrong claims were caught
  this way, each by the session that did *not* make it. Nobody catches their own.
- **Recompute, never compare two descriptions.** Three defects in one day were "two things
  assumed to describe the same artifact": a receipt against a bundle, a tag against a qualified
  commit, a packed candidate against a published tarball. Every one was resolved by recomputing
  a digest from bytes, and not one was caught by reading.
- **State a falsifier before a run, not after.** Handing over a candidate with "if row X does not
  flip, the release is pulled" turns a confirmation into a test. It flipped; had it not, the
  prediction was already on the record.
- **Say what a number does NOT cover.** "Six targets attested → one target executed plus six
  artifacts digest-bound; stronger for darwin-arm64, silent for the other five" survived three
  reports unchanged because it was written down before the run.
- **Report the run you are not citing.** opum-cli-e2e disclosed a green 402-row run they refused
  to use, because its bundle was misattributed. A green number from the wrong artifact is the
  most confident possible false clear.
- **A wrong premise costs more than a wrong answer, because peers act on it.** A finding filed
  here was propagated to both other sessions before being caught; one had already planned around
  it. Say plainly when something is unverified.

### Project-level skills: what is here on purpose

This repository carries exactly one project-level skill right now (down from two: LCLI-362's count
of three, then the `handover` skill's and `.codex/`'s 2026-09-05 retirement, then LCLI-444's
2026-09-05 dogfood of LCLI-443's own `skill_source = "plugin"` opt-in removed
`.claude/skills/lore/SKILL.md` itself — none deleted by hand, each by its own generator, CLI, or the
`lore agents --force` path LCLI-443 built). **Nothing else belongs under `.claude/skills/` or
`.codex/skills/`.**

- **`.claude/skills/quest/SKILL.md`, added by the Backlog-to-Quest cutover.** `quest` is this
  repo's tracker CLI, the same reason `lore` earns a skill: it is the tool every session is
  expected to drive rather than hand-edit around. Installed and kept current via
  `quest agents --update-instructions --target claude` (`quest agents --check --require-installed
  --target claude` must exit 0), never by hand. Its managed block lives in CLAUDE.md itself (the
  `quest:agent-instructions` block), not a separate AGENTS.md — quest 0.3.3 added
  `--target claude` for exactly this, once AGENTS.md was gone.
- **No project-level `.claude/skills/lore/SKILL.md`, on purpose.** `.lore/config.toml`'s
  `[agents].skill_source = "plugin"` (LCLI-443) opts this repository into treating the `opum-lore`
  marketplace plugin (LCLI-441 — the same repository and tag, so its skill content can never drift
  from the CLI version installed) as the source of the `lore` skill instead of a per-repo generated
  copy. `lore agents --check` enforces this: a leftover `SKILL.md` is `orphaned` drift, not silence,
  and `lore agents --force` removes it only when its bytes exactly match `src/core/agent-bridge.ts`'s
  own generated content. `CLAUDE.md`'s `lore:agents` managed block reflects this too — its "Skill:"
  line names the plugin, not a path, whenever `skill_source` is `"plugin"` (`buildNudgeBody`).
- **No project-level copy of a shared skill.** `opum-sdlc` and `opum-handoff` resolve to the
  `opum-workflow` plugin at user scope. A project-level copy is a silent fork: nothing announces
  the substitution, and a partial copy — one carrying `SKILL.md` without the `scripts/` and
  `references/` the procedure invokes — fails only once a session is already relying on it. Empty
  leftover directories count: git does not track them, so they survive every diff-based review and
  are visible only in a filesystem listing.

# Fleet-share prompt — backlog-handover workflow

Paste this to any teammate/agent adopting the workflow in another repo.

---

Adopt the "backlog-handover" workflow: a multi-session, DAG-parallel
backlog-burndown campaign driver for any repo using the Backlog.md CLI.

REQUIREMENTS
- Always: git, the `backlog` CLI with `backlog init` already run, optionally a
  remote named `origin`.
- For full wave-parallel execution: the acting session must be an Opus
  orchestrator with Workflow-tool access and per-call model dispatch to
  "sonnet" and "fable" (i.e. this harness's ultracode mode). Without that, the
  skill degrades gracefully to the old one-issue-at-a-time behavior — same
  algorithm, wave size forced to 1, session budget defaulted to one wave, no
  worker/reviewer dispatch, the orchestrator implements and self-reviews
  directly.

SETUP (once per repo)
1. Install the skill: copy the backlog-handover skill folder into
   .claude/skills/ (or install backlog-handover.skill).
2. Run `/backlog-handover init`. It inventories open issues, proposes a
   queue of the agent-resolvable ones (needs-human issues are parked in a
   "Not queued" section with reasons), asks you to confirm the order ONCE,
   then creates a "Backlog campaign tracker" doc (queue with live per-row
   status + a "Frontier" note, no fixed cursor) inside Backlog.md itself,
   gitignores .claude/handovers/, creates tracked archive/handovers/, and
   writes the first handover.

DRIVE (repeat until the queue is empty)
   /clear
   /backlog-handover restore

Each restore session drains as many ready, non-conflicting issues as it
safely can, wave by wave, until the queue is empty or a real blocker needs a
human:
  drift-check the handover against live git/worktree/backlog state (several
  branches can legitimately be mid-flight at once) → per wave: compute the
  ready set from live task dependencies + a file-overlap conflict graph
  (never assume two differently-labeled issues are automatically
  conflict-free — verify by file citation, since same-label is sufficient but
  not necessary for a real conflict) → mark the wave "Dispatched" in the
  tracker once, cheaply, before any work starts (so a crash mid-wave leaves
  something real to recover from) → the orchestrator itself creates one git
  worktree per ready issue (pinned to the same base commit, placed carefully
  to avoid a known cross-device build trap) and dispatches a Sonnet-tier
  worker into each one (branch already made for it — plan, implement with
  objective AC evidence, commit including its own status edits, push) → every
  pushed branch goes through a mandatory Fable-tier reviewer, working directly
  in that same worktree (AC-by-AC verification, correctness, scope,
  conventions, tests, sibling file-overlap risk) that returns approve /
  request-changes (looped back to a fresh fix pass in the same worktree,
  capped) / escalate (a decide-it-or-defer-to-a-human judgment call captured
  by the orchestrator, never a bare flag and never something the reviewer
  writes to disk itself) → the orchestrator, never a subagent, serially
  rebases each approved branch in its own worktree, mandatorily re-verifies,
  re-pushes the rebased bytes, and only then opens/merges the PR — so the
  bytes that get reviewed are the exact bytes that merge → worktrees are
  removed before their branches are deleted (git refuses the reverse order)
  → a wave-level integration review over the whole wave's merged diff catches
  cross-task conflicts no single-task review could see → the tracker gets one
  more, final write for the wave — never on a per-task branch, which would
  make the tracker file itself the one guaranteed merge-conflict source →
  loop to the next wave, or stop between waves on an empty queue, a real
  escalation (which stops the *session* from starting another wave, though it
  never blocks the wave-mates or queue items already in flight), an optional
  user-set budget, or a self-assessed context checkpoint → archive the
  consumed handover, write one fresh handover covering the whole session's
  waves (skipped entirely if the queue emptied out), push.

No branch/worktree litter, linear history per branch, every merge is a small
reviewed unit, and escalations always route to a human instead of being
silently guessed past.

If a session must stop mid-wave: /backlog-handover write records every
in-flight branch/worktree and the exact stage each reached; nothing is ever
advanced in the tracker for unfinished work, and no "next wave" plan is ever
persisted — the next restore always recomputes the ready set live.
/backlog-handover status is the read-only overview (and, under this model,
several simultaneous feature branches/worktrees/PRs are the expected steady
state, not a red flag — an item with no matching tracker row is the actual
anomaly to flag).

Why it works: durable state lives in the system of record (Backlog tasks +
tracker doc), so handovers stay thin disposable pointers; quality doesn't
degrade as the campaign grows because no implementation work ever touches the
orchestrator's own context — only isolated, disposable subagents do the
straining work, dispatched and merged by an orchestrator that only ever
coordinates.

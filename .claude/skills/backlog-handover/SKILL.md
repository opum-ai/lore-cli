---
name: backlog-handover
description: "Drive a multi-session backlog-burndown campaign against a Backlog.md project: a tracker doc holds a queue + live DAG state, each restore session drains as many ready, non-conflicting issues as it safely can — dispatched in parallel waves to isolated Sonnet-5 worker subagents, gated by a mandatory Fable-5 reviewer, merged one at a time by the Opus orchestrator itself — then writes a grounded handover so the next session continues with just '/clear' + '/backlog-handover restore'. Use whenever the user wants to work through backlog issues, says 'backlog handover', 'restore the campaign', 'continue the backlog', 'take the next backlog issue', 'burn down the backlog', asks to set up a backlog tracker/queue/cursor, or ends a campaign session with work unfinished. Do not use for ad-hoc handovers unrelated to a Backlog.md campaign — that is the plain 'handover' skill."
compatibility: "Requires git and the Backlog.md CLI (`backlog`) in a repo where `backlog init` has been run. Optional: a remote named `origin` (push/prune steps are skipped without one) and the GitHub CLI (`gh`, authenticated) for the PR-based merge step — falls back to a local `git merge --ff-only` into the default branch when `gh` is unavailable or unauthenticated. Full wave-parallel execution additionally requires the acting session to be an Opus orchestrator with Workflow-tool access and 'sonnet'/'fable' model dispatch (i.e. running in this harness's ultracode mode) — see 'Execution model' below for the graceful degradation when that's not available."
---

# Backlog Handover — DAG-parallel campaign driver

Run down a Backlog.md backlog across many small sessions, each session draining
as much of the queue as it safely can. The orchestrator (Opus, ultracode mode)
never implements or reviews anything itself — it only computes what's safe to
run in parallel, manages worktrees, dispatches subagents, and serializes the
shared-state steps (merge, tracker update, Backlog task-ID minting) that can't
be parallelized. The user drives the whole campaign with only:

```
/clear  →  /backlog-handover restore  →  (repeat until the queue is empty)
```

## Execution model

Three tiers, fixed roles — do not blur them:

| Tier | Model | Does | Never does |
| --- | --- | --- | --- |
| Orchestrator | Opus (this session, ultracode mode, Workflow tool) | Computes the ready/conflict graph; creates and manages every task's git worktree (placement, base SHA, cleanup); dispatches workers/reviewers; runs the serialized merge queue and every tracker/Backlog-ID-minting write itself; writes handovers and talks to the user | Implements application code, writes a review verdict, edits a task's code inside its worktree — its only hands-on interaction with a task's branch is worktree lifecycle (create/rebase/push/remove) and the final merge |
| Worker | Sonnet 5, dispatched per task as a plain `agent(model:'sonnet')` call with the worktree path given as an explicit cwd instruction (the orchestrator pre-created that worktree — see R4d) | One task: plan, implement, self-test, commit (including its own `backlog/tasks/` status edits), push | Create or remove its own worktree, merge into the default branch, edit the tracker doc, mint a new Backlog task ID |
| Reviewer / escalation judge | Fable 5, dispatched via `agent(model:'fable', ...)` operating directly in the worker's existing worktree (no second worktree of its own — the branch is already checked out there) | The **mandatory** review gate for every task (replaces any "self or adversarial subagent, whichever" language below) and the judgment call for every escalation trigger; returns a structured verdict | Resolve conflicts or write fixes itself — it decides disposition and hands fixes back to a fresh Sonnet worker; create a second worktree for a branch that already has one; write to Backlog or git itself — its verdict is captured and recorded by the orchestrator |

**No Workflow tool / not an Opus-ultracode session?** Degrade gracefully rather
than refusing to run: wave size = 1, no worktree management beyond a single
plain feature-branch checkout (only one issue is ever in flight, so there's no
conflict to isolate against), perform the implementation and the Fable review
step yourself (the review step still happens — as an explicit adversarial
self-review pass, not skipped). **Also default the session budget to one wave
(= one issue) unless the user explicitly asks for more**: in degraded mode the
implementation transcript accumulates in *this session's own context* (the
isolation that makes unbounded draining safe in full mode doesn't exist here),
so the old one-issue-per-session bound applies again for the same reason it
originally existed. Every other rule below (merge serialization, tracker-update
centralization, escalation criteria, wave-log format) still applies unchanged;
this is the same algorithm at both ends, not two separate procedures.

Why waves instead of "one issue per session": the original one-issue-per-session
rule existed to stop a *single acting model's own context* from degrading
across a long session. Under this architecture the orchestrator never does the
straining work — every implementation and review happens in a fresh subagent
whose context never touches the orchestrator's. So the unit that must stay
small isn't "one issue," it's "one wave" (a bounded, conflict-disjoint batch of
issues dispatched together). Why a tracker doc instead of a fat handover:
durable facts live in the system of record (Backlog tasks + tracker doc); the
handover stays a thin, disposable pointer that can be regenerated from the
tracker.

---

## Usage

```bash
/backlog-handover init      # one-time: build the tracker doc + queue from open issues, write the first handover
/backlog-handover restore   # THE DRIVER: verify ground truth, drain wave after wave until done/blocked, re-arm
/backlog-handover write     # bailout: session is ending with work unfinished — write a grounded handover
/backlog-handover status    # read-only: tracker, queue partition, active handover, branch/worktree state
```

Mode detection: an explicit `/backlog-handover <mode>` uses that mode
directly. Otherwise infer intent from the request: continue/resume/burn-down/
take-the-next-issue language → `restore`; set-up-a-campaign/tracker/queue
language → `init`; session-ending-with-work-unfinished language → `write`.
Genuinely bare or ambiguous invocation (no explicit mode, no inferable intent)
→ `status` — the only safe default when intent truly can't be determined,
never a way to silently ignore a clear natural-language request to act.

---

## Conventions

| Thing | Convention |
| --- | --- |
| Tracker | Backlog doc titled `Backlog campaign tracker` (or a disambiguated title if a prior round's tracker is still around — see the project's own campaign history for precedent) — find via `backlog doc list --plain`, read via `backlog doc view <id> --plain` |
| Active handover | `.claude/handovers/HANDOVER-{YYYY-MM-DD}-{topic}.md` (gitignored — verify, see init) |
| Consumed handover | moved to `archive/handovers/` (tracked, committed). Always `ls` the destination first; on a name collision suffix `-2`, `-3`, … |
| Topic slug | `backlog-campaign` — but if `.claude/handovers/`/`archive/handovers/` already use an established campaign topic, keep that one (continuity beats naming purity) |
| Wave | The atomic dispatch unit: a conflict-disjoint subset of the ready set, implemented and reviewed in parallel, merged serially. Replaces "one issue" as the thing a session accounts for. |
| Wave size cap | Default 6 concurrent workers, independent of how large the theoretical conflict-free ready set is — bounds worktree/disk cost, Fable-reviewer throughput, and how many sequential rebase-merges one drift-check has to account for if a session dies mid-wave. A wave naturally shrinks to 1 when everything remaining in the ready set conflicts pairwise — that's the algorithm correctly degrading to the old sequential behavior, not a bug. |
| Worktree lifecycle | **Orchestrator-managed, explicitly** — do not rely on a dispatch tool's own automatic worktree option for this skill; precise control over placement and base SHA is load-bearing here. At wave start: `git worktree add --detach <path> "$WAVE_BASE"` then `git -C <path> switch -c feature/<KEY>`, for every wave member, before dispatching anything. Root `<path>` at a sibling of `git rev-parse --show-toplevel` (the real, symlink-resolved repo path) — e.g. `$(dirname "$TOPLEVEL")/$(basename "$TOPLEVEL").worktrees/<KEY>`. Never place a worktree under `$TMPDIR`/`os.tmpdir()` or any path on a different filesystem/device than the repo — this project has an established cross-device trap (compile/build steps silently produce a 0-byte output at exit 0 when the target crosses a filesystem boundary from the checkout). Each worktree needs its own `bun install` (or equivalent) — node_modules is per-directory, never shared/symlinked. Remove the worktree (`git worktree remove <path>`) only after that branch is merged or abandoned — **never** before review, since the branch stays checked out there until then and a second `worktree add` of the same branch will fail. |
| Feature branch | `feature/<ISSUE-KEY>`, created by the orchestrator as part of worktree setup above (the worker is dispatched *into* an already-branched worktree, it does not run `git checkout -b` itself) |
| Default branch | `git symbolic-ref --short refs/remotes/origin/HEAD` stripped of `origin/`; if that command fails (no remote, or `origin/HEAD` unset — common on a fresh clone) → `main` if it exists, else `master`. This is the campaign's integration branch — issues merge here, not necessarily into `main` |
| PR merge | Run **only** by the orchestrator, **only** inside the serialized merge queue (R4g), via `git -C <task-worktree>` — never dispatched as a subagent, never touching application code or task notes itself. `gh pr merge feature/<KEY> --rebase --delete-branch` into the default branch after the branch has been rebased, re-verified, and re-pushed inside its own worktree (R4g) — the bytes that get reviewed are the bytes that merge, never a stale pre-rebase copy. No `gh`/no remote → local `git merge --ff-only` fallback |
| PR review gate | The mandatory Fable review (see Execution model) is the gate — every branch needs an `approve` verdict before it's eligible for the merge queue. This replaces any "self or adversarial subagent, whichever" phrasing anywhere below; wherever you see it, read it as "the dedicated Fable reviewer, always." The PR itself is still an audit trail, not a second manual-approval wait, unless the user asks otherwise. |
| Backlog CLI concurrency | `backlog task create` / `promote` / `demote` (anything that mints a new ID) — **strictly sequential, run only by the orchestrator, only in its own primary checkout, only between waves** (R4c/R4i) — never by a worker or reviewer, and never from inside any worktree (a worktree has its own independent `backlog/` checkout — a second, separate collision vector on top of Backlog.md's create-lock being scoped per working directory, which gives zero protection across worktrees anyway). `backlog task edit` on an already-existing, *different* task ID per worker — safe to run in parallel (distinct files, no ID-minting involved) — this is how each worker records its own status transitions. `backlog doc update` (tracker writes) — **orchestrator-only, serialized**, at most twice per wave (a cheap dispatch-time marking at R4c, a full settlement update at R4i) — never per-task. |
| Commits | the project's own conventions; absent any, Conventional Commits with a `Refs: <ISSUE-KEY>` trailer |
| One active handover per topic | writing a new one archives the old one first |

Backlog data is only ever *written* through the `backlog` CLI (task edit, doc
update) — never by editing its markdown files directly; the CLI keeps
metadata, IDs, and relationships consistent. **Reading** `backlog/tasks/*.md`
directly (never editing it) is fine and is in fact the preferred way to build
the dependency/conflict graph in bulk — see R4a. Read
`backlog instructions task-execution` before working an issue and
`backlog instructions task-finalization` before checking acceptance criteria —
the campaign inherits those rules, it does not replace them; the Fable
reviewer is what *enforces* them now instead of trusting self-report.

### Tracker doc structure

Create with this skeleton; every section earns its keep across sessions. This
replaces the old single "Cursor: next issue" model — under wave-parallel
execution, several issues can legitimately be in flight (dispatched,
implementing, in review, merge-pending) at once, and a single pointer can't
represent that. `Status: Dispatched` is written for real, at wave start
(R4c) — it isn't just aspirational vocabulary; it's what makes crash recovery
(R2/R3) able to tell what stage a leftover branch actually reached.

```markdown
# Backlog campaign tracker

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched
→ dispatch (parallel Sonnet implement + Fable review) → serialize the merge →
update this tracker once more at settlement → loop until the queue is empty or
blocked → write handover.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` +
this table at the start of every restore/wave — never trust a persisted "next
wave" plan from a prior handover; it can go stale the moment a dependency or
conflict changes. This section is an informational hint only: as of
<date/wave N>, roughly <count> items are ready, <count> blocked.

## Queue (confirmed order)
| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|

Status is one of: To Do / Dispatched / In Review / Merge-pending / Done /
Blocked. Wave is filled in once a row is actually dispatched (e.g. `3`).

## Resolved
| # | Issue | Status/date/wave | Evidence summary |

## Not queued — needs a human / blocked
- <KEY>: <why an agent alone cannot finish it, or why Fable escalated it>

## Wave log
- <date> — wave N (issues: <KEYs>, workers: sonnet, reviewer: fable): <what
  happened per issue, any request_changes/escalate verdicts (Fable's stated
  reasoning) and how they resolved, merged SHAs, any wave-level
  integration-review finding>
```

Queue order is a **human-confirmed priority**, not a scheduling promise — the
wave builder respects it as a tie-break (earlier items get priority for wave
inclusion when multiple are ready) but does not guarantee any specific item
lands in any specific wave, since that depends on live dependency/conflict
state.

---

## Init mode

### I1: Inventory

`backlog task list --plain` for every non-terminal issue, then
`backlog task view <KEY> --plain` on each candidate. Classify honestly:
**agent-resolvable now** (goes in the queue) vs **needs a human physically
present / a product decision / blocked by another issue** (goes in "Not
queued" with the reason). An issue whose acceptance criteria cannot be
objectively verified by an agent alone does not belong in the queue — putting
it there just manufactures a stuck wave later. This a-priori triage is
distinct from (and cheaper than) the mid-flight escalation path in Restore
mode — I1 catches what's obviously not agent-resolvable before any work
starts; escalation catches what only reveals itself once work is underway.

### I2: Confirm the queue with the user

Propose an order (lowest-risk/highest-information first is a good default:
doc-only → small code → spikes) and get explicit confirmation. Record the
confirmation verbatim in the tracker. Future sessions rely on it as the
wave-builder's tie-break, not as a strict execution order — say so explicitly
so nobody expects issue #7 to literally run in the 7th slot.

### I3: Create the tracker + directories

1. `backlog doc create "Backlog campaign tracker" -t other`, then
   `backlog doc update <id> --content "<skeleton above, filled in>"`. If a
   formal Backlog dependency relationship is known between any two queued
   issues, set it now via `backlog task edit <KEY> --dep <comma-separated list
   of ALL of that task's dependencies>` — `--dep` **replaces** the whole
   dependency list, it does not append, so always pass the full set.
2. Ensure `.claude/handovers/` is in `.gitignore` (append it if missing) and
   `mkdir -p archive/handovers`. Handovers may mention machine/env names, so
   the active ones stay untracked; only consumed ones get committed.
3. Commit the tracker + gitignore change on the default branch.

### I4: Write the first handover

Run Write mode (below), then tell the user the driver loop:
`/clear` → `/backlog-handover restore`.

---

## Restore mode — the driver

### R1: Locate

Newest `.claude/handovers/HANDOVER-*-{topic}.md`. If no handover exists but the
tracker doc does, say so and proceed from the tracker alone — the handover is an
accelerator, the tracker is the record. Neither exists → suggest
`/backlog-handover init`; STOP.

### R2: Verify ground truth (drift check)

The handover reflects when it was written, and — because a session can now
have several issues in flight at once — a crashed prior session may have left
several branches/worktrees at *different* lifecycle stages simultaneously, not
just one. Re-verify everything before acting:

1. `git fetch` — has the default branch moved past the grounding SHA? Working
   tree clean? Unpushed commits?
2. `git worktree list --porcelain` **and** `git branch --list 'feature/*'`
   (local + remote) — enumerate every leftover, not just the one the last
   handover mentioned. `git worktree add ... feature/<KEY>` hard-fails if that
   branch name is already checked out anywhere, including a stale worktree
   from a crashed session — sweep this before trying to launch a new wave.
3. `gh pr list --state all` for every leftover branch found above — an open,
   unmerged PR means a prior session got as far as opening it but died before
   the merge queue processed it.
4. Cross-check every leftover branch/worktree/PR against the tracker's Queue
   table Status/Wave columns — classify each as: matches tracker (resume it at
   its recorded stage — Dispatched with no PR yet means implementation may
   still be mid-flight or done-but-unreviewed; check the worktree's own git
   log/task-file state to disambiguate), or orphaned relative to the tracker
   (report it, reconcile in R3, don't silently delete it).

Produce a short drift table (`claim → tracker/handover said → now`). If drift
invalidates the plan (an issue already resolved, a branch further along than
recorded), adapt and say so — never execute stale instructions.

### R3: Reconcile

Completed-but-unrecorded work found in R2 goes into the owning records (task
notes, tracker Resolved table/Wave log) before any new wave starts. A
leftover branch/worktree that matches a tracker row mid-wave resumes from
that row's recorded stage rather than restarting from scratch.

### R4: The wave loop — drain until done or blocked

Repeat until a stop condition fires (below). This replaces "resolve exactly
one issue" — under this architecture the orchestrator's own context grows only
by a roughly constant per-wave increment (dispatch prompts, each subagent's
terse structured return, Fable verdicts, merge SHAs, one tracker delta), not by
the implementation transcript itself, which lives entirely inside isolated
subagents and never enters the orchestrator's context. That's what makes
draining many waves in one session safe where draining many *issues* in one
old-style session wasn't — this property does **not** hold in degraded mode
(see Execution model), which is why degraded mode's default budget is one
wave, not unbounded.

**a. Compute the graph.** Read every non-terminal task's file in full —
frontmatter **and** body (description and acceptance-criteria text live in the
body, not frontmatter, and R4b needs that text) — with a real YAML parse of
the frontmatter block (`dependencies` is a multi-line YAML list; a grep-based
read reports false negatives, a known trap in this project). Do **not** shell
out to `backlog task view` once per task, and do not assume a `--json` flag
exists on whatever `backlog` binary happens to be on `PATH` (verify with
`backlog task list --help` / `backlog task view --help` if unsure). Pull `id`,
`status`, `dependencies`, `labels`, `ordinal` from frontmatter and the
description/AC text from the body. Topologically sort by formal
`dependencies`. **If a cycle is found among non-terminal tasks, HALT
scheduling entirely** — move every cycle member to the tracker's "Not queued"
section naming the cycle, surface it in the R6 report, and continue the wave
loop only over the acyclic remainder.

**b. Compute the conflict graph.** Two tasks conflict if they might touch the
same file. Do **not** rely on a task's cluster/topic label alone as proof of
safety — same cluster is a reasonable (and cheap) *sufficient* condition to
treat two tasks as conflicting, but different cluster is **not** sufficient
proof they're safe: real, verified counter-example in this project's own
history — two tasks in different clusters turned out to be the same bug in the
same file. The authoritative signal is a file-citation read: for each ready
task, read its title/description/AC text and extract the real repo file
path(s) it's expected to touch, resolving any bare filename against
`git ls-files` (this is orchestrator-side reading comprehension, not
implementation — legitimate for Opus to do directly, not a subagent dispatch).
If a filename match is ambiguous (matches more than one real path), keep every
candidate — over-approximating conflicts only costs parallelism, it never
causes a real collision. If extraction finds no resolvable file at all for a
task, fall back to "conflicts with every other task in its own cluster" so the
algorithm degrades safely instead of silently assuming safety.
`conflicts(A,B) := same cluster OR file-sets intersect (after the fallback
above)`.

**c. Build the wave, then mark it.** `ready = tasks with status To Do, all
formal deps Done, and no conflict with anything already in-flight from an
incomplete prior wave`. Stable-sort `ready` by the tracker's confirmed queue
order (the `ordinal` frontmatter field tracks this and is cheaper to read than
re-parsing the tracker table). Greedily walk that order, adding a task to the
wave iff it doesn't conflict with anything already added this wave, stopping
at the wave-size cap. A wave of size 1 (everything remaining conflicts
pairwise) is a correct, expected degradation. **Before dispatching anything**,
run one cheap, serialized `backlog doc update` marking every wave member
Status→Dispatched, Wave→N in the tracker — this is what lets a crashed
session's R2/R3 tell what actually got underway instead of guessing from a
table that still says "To Do" for everything.

**d. Set up worktrees, then implement — parallel, isolated.** For every wave
member, in the orchestrator's own turn: `git worktree add --detach <path>
"$WAVE_BASE"` (pin `WAVE_BASE=$(git rev-parse <default>)` once at wave start,
so every member forks from an identical commit regardless of setup order),
then `git -C <path> switch -c feature/<KEY>` (see Conventions "Worktree
lifecycle" for placement rules). Then dispatch, for every member, a plain
`agent(model:'sonnet')` call whose prompt gives it that exact path as its
working directory and instructs it to: plan (`backlog instructions
task-execution`, mark In Progress, record the plan in the task) → implement +
verify (`backlog instructions task-finalization`'s objective-evidence rule,
mark the task Done with a final summary — this status edit is a normal `task
edit` on that task's own file, safe in parallel, and it commits with the rest
of the worker's changes) → commit (small logical commits, `Refs: <KEY>`
trailer, including its own `backlog/tasks/` edits — this branch's merge is the
**only** way that Done-state reaches `<default>`) → push
(`git push -u origin feature/<KEY>` from within the worktree — the worker's
final action; no remote → skip, the merge queue will do a local
`--ff-only` merge instead). **Do not** have the worker touch the tracker doc —
that's centralized at R4c/R4i. The worker's structured return: outcome
(`implemented` or self-reported `blocked`) plus a one-line summary — it
doesn't need to report its own worktree path or branch, the orchestrator
already knows both since it created them.

**e. Review stage — pipelined per completed implementer, not wave-wide
barriered.** As soon as a wave member's implement stage finishes (don't wait
for the whole wave), dispatch `agent(model:'fable')` **into that same
worktree** (no second worktree — the branch is already checked out there;
creating another one for the same branch name fails). Give it: the full
`backlog task view <KEY> --plain` output (it reads this itself, not a
paraphrase), `git diff <default>...feature/<KEY>` (three-dot, merge-base
diff), instruction to independently re-run `backlog instructions
task-finalization`'s checklist and the task's own verification commands rather
than trust the implementer's claims, and a short manifest (ID + cluster +
one-line note) of sibling tasks still in-flight this wave for
file-overlap-risk context. Checklist, in order: AC-by-AC (independently
confirmed, not trusted); correctness (this queue is itself a
security/robustness review's own follow-up backlog — hold a high bar, a sloppy
fix reintroducing a same-class bug is the worst outcome here); scope (diff
stays within the task's stated files, flag drive-by changes); conventions;
tests (right ones exist and were actually run); task hygiene (DoD, final
summary accuracy); file-overlap risk against the sibling manifest. Return a
structured verdict — `approve` / `request_changes` / `escalate` — plus per-AC
verification detail and findings (severity-tagged). The reviewer does **not**
write anything to Backlog or git itself; its structured verdict is captured by
the orchestrator, which records it in the PR body when it opens one (R4g) and
in the wave-log entry (R4i) — durable without needing the reviewer to make its
own commits on someone else's branch.

`request_changes` → dispatch a fresh `agent(model:'sonnet')` fix pass **into
the same worktree**, prompted with Fable's findings verbatim (not "look at it
again") → back through the same Fable review. Cap this at 2 retries (3 total
Fable passes); on exhaustion, auto-flip to `escalate` with reason "fix-cycle
budget exhausted" rather than looping forever.

**f. Escalation disposition.** See the dedicated Escalation policy section
below.

**g. Merge stage — strictly serial, orchestrator only, from its own turn.**
Once the wave's implement→review pipelines have settled (every member reached
approve/merge-blocked/escalated), the orchestrator walks the `approve`-verdict
branches in the tracker's confirmed queue order. For each (its worktree still
exists — nothing has been pruned yet):

1. `git -C <worktree> fetch origin`
2. `git -C <worktree> rebase origin/<default>` — expected to be needed for
   every item after the first in a wave, since the base moves under it; treat
   this as the **normal** case, not a rare edge case.
   - Clean (or nothing to rebase) → **mandatorily** re-run the task's
     verification *inside that worktree* — never skip this because the rebase
     "looked clean," a clean rebase can still change behavior.
   - A real content conflict (not just "base moved") → one Fable escalation
     call with both diffs (the just-merged predecessor's and this branch's).
     Disposition only, never resolution: `fable_decided` → a fresh Sonnet fix
     dispatched into this same worktree with Fable's guidance, re-enters the
     review pipeline, held for a later pass through this same merge-queue
     walk; `human_needed` → leave pushed & unmerged, record it, move on to the
     next branch. Never let one stuck branch stall the rest of the queue.
3. `git -C <worktree> push --force-with-lease origin feature/<KEY>` — publish
   the rebased, re-verified bytes. This is what makes them the exact bytes
   that merge next, not a stale pre-rebase copy.
4. Open the PR if one isn't already open (title/body including the task's
   final summary + the Fable verdict captured in step e), then
   `gh pr merge feature/<KEY> --rebase --delete-branch` (local `--ff-only`
   fallback per Conventions).
5. `git checkout <default> && git pull --ff-only origin <default>` — sync the
   orchestrator's own checkout.
6. `git worktree remove <worktree>` — **before** branch cleanup; `git branch
   -d` refuses while any worktree still holds the branch.
7. `git branch -d feature/<KEY>` (local ref; `--delete-branch` on the `gh pr
   merge` already handled the remote copy — no-`gh` fallback path deletes it
   manually).

**h. Wave-level integration review.** After every approved branch in the wave
has actually merged, run one more `agent(model:'fable')` over the *cumulative*
wave diff (`$WAVE_BASE...<default>`) — explicitly prompted to hunt for
cross-task conflicts a single-task review structurally cannot see (a rename in
one branch vs. a new caller of the old name added by an untouched-file sibling
branch; duplicate/contradictory implementations; a contract mismatch between a
change and a sibling's new use of it). A finding here is handled the same way
as any other Fable disposition: fixed via a small direct follow-up (Sonnet fix
+ re-review, in a fresh worktree off current `<default>`) if narrow, or filed
as a new task (by the orchestrator, sequentially, per the Backlog CLI
concurrency rule) and noted in the wave log if it needs real work.

**i. Tracker settlement — the second and final write of the wave, orchestrator
only, on `<default>` directly.** Not on a per-task branch (that trick only
worked for exactly one branch in flight at a time; under wave dispatch every
worker touching the same tracker file would conflict with every other worker
on that one file regardless of how disjoint their actual code changes were).
Move every this-wave-resolved issue from Queue to Resolved with its
SHA/evidence and captured Fable verdict; move any escalated-to-human issue to
"Not queued" with the stated reason; append one Wave-log entry summarizing the
whole wave; refresh the Frontier note; commit, push. This is crash-safe and
cheap precisely because the task files themselves (not the tracker) are the
real system of record — if the orchestrator dies mid-wave after 3 of 5
merges, nothing is lost: the merged code is already on `<default>` and those 3
tasks are already Done in their own files; only the tracker's narrative
catch-up is deferred to the next restore's R3, and R4c's dispatch-time marking
already gave that restore something real to reconcile from.

**j. Loop or stop.** Recompute the ready set (newly-unblocked deps, freed
conflicts from this wave's merges) and start the next wave, unless a stop
condition fires. Check stop conditions **between** waves only, never mid-wave:

- Queue empty → campaign complete (see R6).
- A wave produced a `human_needed` escalation, or two consecutive waves failed
  the same way → **stop by default**, hand over. (This is the one limit on
  "an escalation never blocks the rest of the queue" from the Escalation
  policy section: within a wave, and within one merge-queue walk, an
  escalated item never blocks its wave-mates — they keep implementing,
  reviewing, and merging normally. Whether the *session* goes on to dispatch a
  further wave after a `human_needed` escalation is exactly this check, and it
  defaults to stopping so the user sees the escalation promptly rather than
  it scrolling past under several more waves of routine merges.)
- An explicit, optional user-supplied budget (max waves / max issues) passed
  when the user invoked restore — default is unbounded (drain until
  done/blocked) in full mode, one wave in degraded mode.
- A self-assessed context-pressure checkpoint: after each wave, honestly
  assess whether *this session's own* accumulated context (not just wave
  summaries — everything the orchestrator has seen and done this turn) is
  getting long, and prefer a clean between-wave stop over pushing further.
  Don't hand-roll a token counter for this; if this environment has an
  automatic compaction/checkpoint mechanism, treat it strictly as a backstop
  for a crash, not the primary stopping signal — a clean `write`-mode stop
  between waves produces a far richer, campaign-specific handover than any
  generic auto-snapshot would.

### R5: Re-arm (once per session, when the loop terminates)

1. Archive the consumed handover: check the destination for a name collision
   (`ls archive/handovers/`), `mv` with a `-2`/`-3` suffix if needed, commit on
   the default branch (`docs(<KEY>): archive consumed backlog-campaign handover`).
2. Write one fresh handover reflecting the session's *cumulative* state across
   however many waves ran (Write mode stages) — **unless the queue is now
   empty**, in which case R6's campaign-complete handling applies instead
   (archive only, no new handover).
3. Push the default branch: `git push origin <default>`. Unconditional — the
   wave loop's own merges already updated `<default>` and R5 step 1's archive
   commit (plus any housekeeping made after) is new and still needs to go up
   (no remote `origin` → skip).

### R6: Report

Summarize every issue resolved this session, grouped by wave, with evidence
and merged SHAs. **Put any `escalate`/`human_needed` items first and visually
distinct** from the routine merge summary — those are the only things actually
needing the user's attention now; everything else already completed
autonomously. State current queue-state (resolved / in-flight / blocked /
ready-now counts) and end with the literal next command:
`/clear` then `/backlog-handover restore`.

**Queue empty instead?** Campaign complete: summarize the Resolved table
across every wave, archive the final handover (no new one — see R5 step 2),
and suggest `init` for a fresh queue.

---

## Escalation policy

Every situation below routes through the **same** Fable reviewer role used for
ordinary review — escalation is not a separate mechanism, it's one of that
role's three possible verdicts, with a concrete decision procedure instead of
a bare "escalate" flag. An escalation never blocks its own wave-mates or the
rest of that merge-queue walk; the one thing it *does* gate is whether the
session dispatches a further wave afterward — see R4j.

| Trigger | What Fable is handed | Fable's decision procedure |
| --- | --- | --- |
| Worker self-reports `blocked` mid-implementation | The worker's own blocker report + the partial diff | `request_changes` (worker gave up prematurely — Fable specifies what's actually missing, a fresh Sonnet attempt is dispatched into the same worktree) vs. `escalate` (genuinely not agent-finishable — a hardware/product decision) |
| A material product/architecture/workflow call got baked into an ambiguous AC without explicit sign-off | The task-finalization checklist applied to the diff | If baked in: apply the decide-vs-defer test below. Workers never block waiting for interactive approval (nothing can literally wait in a fan-out); they document their interpretation in the task notes and proceed — Fable is the checkpoint that catches an unauthorized call after the fact |
| Review-found blocking defect | Same as ordinary review | `request_changes` through the capped fix→re-review loop (R4e); only exhausting that budget, or Fable independently judging the defect structural/unfixable by a fresh attempt, produces `escalate` |
| Merge-time conflict (real content conflict, not just a moved base) | Both diffs — the just-merged predecessor's and this branch's | Disposition only, never resolution: `fable_decided` (superficial/mechanical — dispatch a fresh Sonnet fix into the same worktree, re-enters review) vs. `human_needed` (both branches substantively changed overlapping logic — leave unmerged, record it, move on) |
| Wave-level integration-review finding | The cumulative wave diff | Small/narrow → direct Sonnet follow-up + re-review, in a fresh worktree off current `<default>`. Needs real work → the orchestrator files it as a new task (sequentially, between waves) and notes it in the wave log |
| Issue turns out not agent-finishable at all (discovered mid-flight, not caught by I1's a-priori triage) | Whatever's been learned so far | Record exactly what remains in the task; `escalate` with `human_needed`; the orchestrator moves the row to "Not queued" at R4i |

**Decide-vs-defer test** (used wherever the table above says "apply the
decide-vs-defer test"): Fable makes the call itself, documents the assumption
(captured by the orchestrator into the task/PR/wave-log record, same as any
other verdict), and the orchestrator treats it as approved/fixed with the
assumption recorded — **only** when the issue is narrow, reversible, and
low-blast-radius (an ambiguous AC wording with one obviously reasonable
reading; a trivial mechanical rebase-style conflict). Anything genuinely
product-level, irreversible, or requiring information Fable doesn't have gets
`recommended_disposition: human_needed` — never guessed past.

---

## Per-task stages (what actually runs for one wave member)

Read together with R4 above, which owns the parallel/serial framing; this
section is the per-task mechanics, in order:

0. **Setup** (orchestrator, before dispatch, not the worker's job): create the
   worktree and branch from the pinned wave-base SHA (Conventions "Worktree
   lifecycle"); mark the tracker row Dispatched (R4c).
1. **Dispatch**: a plain `agent(model:'sonnet')` call, given the worktree path
   as an explicit cwd instruction.
2. **Plan**: read `backlog instructions task-execution`; view the task; mark
   it In Progress + assign; record the implementation plan in the task.
3. **Implement + verify**: `backlog instructions task-finalization`'s
   objective-evidence rule — never code-presence or intent. Mark Done with a
   final summary naming the verification.
4. *(deleted — tracker updates are centralized at R4c/R4i, never per-task)*
5. **Commit** — small logical commits, project conventions, `Refs: <KEY>`
   trailer, including the worker's own `backlog/tasks/` status edits.
6. **Publish**: `git push -u origin feature/<KEY>` from within the worktree —
   the worker's last action (no remote → skip; the merge queue does a local
   `--ff-only` merge instead).
7. **Review**: the mandatory Fable pass (R4e), operating directly in the same
   worktree — not "self or adversarial, whichever." Fix findings through the
   capped retry loop.

Opening/merging the PR, syncing local `<default>`, and pruning the worktree +
branch are **not** part of this per-task sequence — they're owned by the
centralized, strictly serial merge queue (R4g), because merging is a
shared-state mutation that cannot run once per task in parallel. Don't
reintroduce them here.

---

## Write mode (bailout / init's W-stages)

### W1: Ground truth

Verify with commands, never memory: current branch (orchestrator's own, not a
worktree's) + HEAD SHA, `git status --porcelain`, unpushed commits, **every**
branch/worktree/PR touched this session (not just one), tracker state.

### W2: Flush durable facts first

Implementation decisions/evidence → the task (notes, AC checks). Fable's
verdicts → already captured in PR bodies + the tracker's wave-log (R4e/R4i),
nothing extra to flush there. Campaign state → the tracker (Queue/Resolved/
Wave log). Reusable cross-project lessons → auto-memory if available. The
handover holds pointers, not the facts.

### W3: Write the handover

Path: `.claude/handovers/HANDOVER-{YYYY-MM-DD}-{topic}.md` (UTC date). Existing
active handover for the topic → archive it first (collision rule applies).

```markdown
# Handover — {one-line goal} (waves: {N}, issues: {issue keys})

**Date**: {YYYY-MM-DD} | **Grounded against**: {orchestrator's branch @ SHA, clean/dirty, ahead/behind origin} | **Tracker**: {doc id}

## Paste-ready prompt for the next session

​```
Run /backlog-handover restore in {repo path}. Tracker: {doc id}. {N} waves
completed this session, {M} issues resolved (see tracker Resolved table).
Queue order confirmed by user on {date}; do not re-ask. The ready set is
recomputed live at restore — do NOT hardcode a "next wave" membership list
here. {Locked decisions, traps, exactly which stage each still-in-flight
item reached if the session stopped mid-wave — worktree path + branch name +
last completed per-task stage number.}
​```

## State
| Item | Status |

## This session's in-flight wave (if stopped mid-wave — omit if clean)
| Issue | Worktree path | Branch | Stage reached | Note |

## Next steps
1. {ordered, concrete, with file:line / issue references}

## Critical context / traps
- {non-obvious constraints; per in-flight item: worktree path + branch +
  last completed stage}

## Do not repeat
- {failed approaches: "tried X, failed because Y"}
```

Rules: no invented content — every SHA/status verified in W1, gaps stated as
gaps. Failed approaches are mandatory when anything failed. **Never persist a
"next wave" plan** — the next restore recomputes the ready set live; a stale
plan is worse than no plan. No secrets; machine/env names only because the
file is gitignored — never copy them into anything committed.

### W4: Confirm

Output the path, topic, waves/issues resolved this session, and the
driver-loop reminder.

---

## Status mode

Read-only report: tracker doc id + full queue partition (Resolved count,
In-flight-this-wave with per-branch/worktree stage, Blocked/needs-human,
Ready-now count), active handover file(s), every `feature/*` branch **and**
`git worktree list`, any open PRs (`gh pr list --state open`), default branch
ahead/behind origin, dirty files.

Under wave-parallel execution, **several simultaneous `feature/*` branches,
worktrees, and open PRs mid-wave are the expected steady state**, not a
convention violation — don't flag "more than one" as suspicious the way the
old single-issue model would have. The actual anomaly signal is a
branch/worktree/PR that has **no corresponding row** in the tracker's Queue
table at all (orphaned relative to the tracker) — flag that, with the
canonical fix (reconcile per R3, or clean up if it's truly abandoned).

---

## Error handling

| Condition | Behavior |
| --- | --- |
| `backlog` CLI missing / no Backlog project | STOP; point at Backlog.md's `backlog init` |
| Dirty working tree at preflight (orchestrator's own checkout) | STOP; show `git status`; let the user decide |
| No Workflow tool / not an Opus-ultracode session | Degrade to wave size 1, a single plain feature branch (no worktree management needed), self-perform implementation and Fable's review as an explicit adversarial self-review pass, and default the session budget to one wave — see "Execution model" |
| A formal-dependency cycle is found among non-terminal tasks | HALT scheduling for the cycle members only; move them to "Not queued" naming the cycle; keep draining the acyclic remainder |
| Two ready tasks conflict but weren't caught by the conflict graph (discovered only at merge time) | One Fable escalation call with both diffs — disposition, not resolution (see Escalation policy) |
| PR merge fails because `<default>` moved under it (expected, normal under wave dispatch) | Rebase + **mandatory** re-verify + re-push + retry (R4g) — never skip the re-verify because the rebase "looked clean," and never merge without re-pushing the rebased bytes first |
| PR merge fails because of a real content conflict | Fable escalation call → `fable_decided` (fresh Sonnet fix in the same worktree, re-review) or `human_needed` (leave unmerged, record, move on — doesn't block the rest of the queue) |
| `gh` CLI missing or unauthenticated | Fall back to a local `git merge --ff-only` into `<default>`; note it in the handover |
| Fable review returns `request_changes` | Fresh Sonnet fix pass into the same worktree, prompted with Fable's findings; cap 2 retries, then auto-`escalate` |
| Fable review returns `escalate` | Apply the decide-vs-defer test (Escalation policy); `human_needed` → branch stays pushed & unmerged, task notes + tracker "Not queued" row record why, rest of the queue keeps moving, but the *session* stops before its next wave by default (R4j) |
| Worker self-reports `blocked` | Route through Fable exactly like a review (Escalation policy table) — never trust the worker's own self-assessment of "unfinishable" uncorroborated |
| Any Queue row already Done when re-checked (drift) | Reconcile at R3, keep draining the ready set, no special handling needed |
| Archive move name collision | Suffix `-2`, `-3`, …; note it |
| Ground-truth command fails | Record the gap explicitly in the handover — never substitute memory |
| No remote `origin` | Skip push/PR/remote-prune halves; note in the handover |

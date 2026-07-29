# Handover — v1 release-readiness & e2e follow-ups campaign (waves: 0 — init only, issues: none resolved yet)

**Date**: 2026-07-24 | **Grounded against**: `dev` @ `be730be`, clean (only untracked dev-tools: `lore-setup.sh`, `lore-e2e-test.sh`, `dist-npm/`, `.repro-scratch/`, `docs/.obsidian/`), up to date with origin | **Tracker**: doc-5

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-5
("Backlog campaign tracker — v1 release readiness & e2e follow-ups (round 4)").
This is a freshly INIT'd campaign — 0 waves run, 0 issues resolved yet. Queue
order confirmed by the user on 2026-07-24 (lowest-risk-first: LCLI-258, 259,
263, 261, 262, 256, 254, 255, 260); do NOT re-ask. The ready set is recomputed
live at restore — do NOT hardcode a "next wave" membership list here.

Locked decisions / traps:
- 9 queued tasks, all ZERO formal deps; wave membership gated purely by the live
  file-conflict graph + the 6-worker cap. Known conflicts to expect the wave
  builder to serialize: 258<->259 (both link.ts/tasks.ts), 256<->263 (both
  fswrite.ts), 254<->255 (both .github/workflows/), 263<->260 (both scaffold.ts).
- NOT queued — do NOT dispatch: LCLI-253 (blocked on the upstream --json tag,
  external event), LCLI-257 (needs-human repo-admin ruleset toggle, like
  LCLI-196), LCLI-42/43/44/45 (deferred-v2). See tracker "Not queued".
- LCLI-260 is a LARGE feature (interactive-wizard onboarding); its design is
  locked (interactive-by-default, TTY-gated, flags for prompt-free/CI — see the
  task's Decision note). Expect it to need the full fix->review cycle.
- LCLI-256 and LCLI-260 touch Windows/CI-verified paths: the windows-latest CI
  leg must be green on their PRs. dev REQUIRES the docker-e2e check (repository
  ruleset id 19698059, owner-bypass) — merges gate on it; windows-latest is
  green but NOT yet a required check (that's LCLI-257, human-only).
- The `backlog` on PATH is a locally-BUILT patched --json binary (~/.bun/bin/
  backlog; reports v1.48.0 but supports --json). A plain stock backlog.md@1.48.0
  has NO --json and lore rejects it. Don't assume --json works on a fresh clone.
- Cross-device compile trap: keep worktrees + any bun --compile on the SAME
  filesystem as the checkout (never under $TMPDIR) or you get a 0-byte binary.
- Mode: ultracode was OFF when this was written, but the Workflow tool is
  available and the backlog-handover skill authorizes Workflow-dispatched waves.
  If restore runs WITHOUT Workflow/ultracode, degrade to wave size 1 + a
  one-wave session budget (per the skill's Execution model).
```

## State
| Item | Status |
| --- | --- |
| Tracker | doc-5 created + committed (`be730be`) |
| Queue | 9 To Do, lowest-risk-first (user-confirmed 2026-07-24) |
| Not queued | 6 — LCLI-253 (blocked-upstream), LCLI-257 (needs-human), LCLI-42/43/44/45 (deferred-v2) |
| Waves run this session | 0 (init only) |
| Default branch | `dev` @ `be730be`, clean, == origin |
| Active worktrees / `feature/*` branches / open PRs | none |

## This session's in-flight wave (if stopped mid-wave)
None — this was `init` only; nothing dispatched.

## Next steps
1. `/clear`, then `/backlog-handover restore` in `/Volumes/external/repos/lore`.
2. Restore recomputes the ready/conflict graph live from doc-5 + `backlog/tasks/*.md`, builds wave 1 (lowest-risk-first tie-break, honoring the known conflicts above + the 6-worker cap), marks it Dispatched, and drains.

## Critical context / traps
- The locked decisions/traps in the paste-ready prompt above are the load-bearing ones (not-queued set, patched backlog binary, cross-device compile trap, windows-CI/ruleset facts, LCLI-260 size).

## Do not repeat
- Nothing failed — this was init only.

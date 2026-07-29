# Handover — third backlog campaign, cursor at LCLI-71 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ fa3a4eb`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-71 — `lore check --external` is vulnerable to SSRF via
unrestricted fetch() (security-labeled, fourth security task this campaign).
Queue order confirmed by user on 2026-07-21 (independent fixes first, the
LCLI-78/79/80 rename-traversal cluster last); do not re-ask. Merge gate is
self-merge (skill default, user-confirmed 2026-07-19) — no PR-approval wait.
10-issue queue remaining, all from a full-codebase Codex review (see
backlog/docs/reviews/doc-2 for full context/repro detail on every issue, and
doc-1's Cursor/Queue/Campaign-conventions sections for the rest).

CRITICAL: read doc-1's three newest campaign conventions (added LCLI-69/72,
2026-07-21) before implementing — cross-platform/exec-boundary validation
gaps, and how to decide whether an adversarial review's out-of-scope finding
belongs in-task vs. a documented follow-up.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-71, Queue = 10 items, LCLI-72 moved to Resolved with its review findings documented, three new campaign conventions recorded, two new Not-queued follow-up entries) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 10 tasks remaining (LCLI-71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-72` fully merged (PR #73, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune`) |
| Not queued | LCLI-42/43/44/45 (deferred) plus five unfiled follow-up candidates: two from LCLI-84 (rewriteInbound's profile gap; lore check's separate validation path), one from LCLI-69 (commitBacklogFiles's guard is POSIX-only via `posix.normalize`), two from LCLI-72 (a symlink-read gap in `lore new --template`, read-path counterpart to the still-open LCLI-76/77; a profile-declared-template traversal, deliberately excluded scope) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-71** (`lore check --external` SSRF,
   security-labeled): branch `feature/LCLI-71` off `dev`, read the task's AC,
   implement, verify, review, PR, self-merge, prune. Grounded code pointers
   (verified this session, not just the filing task's own prose):
   - `src/commands/check.ts:59` — `export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>` — the injectable network seam (tests already inject a fake; production uses the real global `fetch`).
   - `src/commands/check.ts:693` — `const defaultFetch: FetchLike = (url, init) => fetch(url, init)` — the REAL network probe. No destination validation of any kind before this call.
   - `src/commands/check.ts:730-740` — `probeOne(url, fetchFn)` — the actual per-URL fetch call site (`fetchFn(url, { signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS) })`). This is almost certainly where a destination check needs to be inserted, BEFORE the fetch call.
   - `src/commands/check.ts:708-727` — `probeLiveness` — dedupes URLs before probing each once (relevant: a validation gate probably belongs per-unique-URL here or inside `probeOne`, not per-link).
   - Confirmed: native `fetch()` follows redirects by default (`redirect: "follow"`, the implicit default — no `redirect` option is passed here), which is exactly AC2's concern: a redirect to a disallowed destination is currently followed silently with no re-validation of the final resolved address.
2. **AC1** needs a real IP-range classifier (loopback `127.0.0.0/8`/`::1`,
   link-local `169.254.0.0/16`/`fe80::/10` — this is the literal cloud-
   metadata range `169.254.169.254` the task names — and RFC1918 private
   ranges `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, plus IPv6
   equivalents `fc00::/7` unique-local). Check whether `node:net` or Bun has
   a built-in helper before hand-rolling one (`node:net`'s `isIP`, or `Bun`'s
   own utilities) — verify what's actually available rather than assuming.
   The URL's hostname must be RESOLVED to an IP before classification (a
   hostname alone doesn't reveal whether it points at a private range) —
   consider DNS-rebinding implications: a hostname that resolves to a public
   IP at validation time but a private one at actual-fetch time is a classic
   SSRF bypass; the safest shape is likely resolving once and fetching
   against the resolved IP (or re-validating on every redirect hop, per AC2)
   rather than trusting a hostname-level allowlist alone.
3. **AC2** needs manual redirect handling (`redirect: "manual"` on the fetch
   call, then inspecting the `Location` header and re-validating THAT
   destination before following it manually, looping until a final non-
   redirect response or a redirect-depth cap) — the current code's implicit
   `redirect: "follow"` default is exactly the gap.
4. **AC3**: add a test using the existing injectable `FetchLike` fake to
   prove a blocked-destination URL never reaches the (fake) fetch call at
   all — assert the fake's call count/args, not just the resulting finding,
   per this campaign's own established discipline of proving a guard runs
   BEFORE the dangerous operation, not just that the operation eventually
   fails.
5. Apply the freshly-recorded campaign convention from LCLI-69/72's sessions:
   after implementing, explicitly ask (and verify, don't just reason
   abstractly) whether this SSRF guard has the same class of "validate one
   value, use a different value downstream" gap LCLI-69 found (e.g.
   validating the ORIGINAL url string's hostname/IP but then fetching a
   DIFFERENT string/URL object that could resolve differently) and whether a
   NUL-byte-style boundary-truncation trick applies anywhere in this chain.
6. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-76** (item #2 of the remaining queue).
7. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-76. Note: today's date (`2026-07-21`) already has NINE prior archived
   handovers (base, `-2` through `-9`) — this session's own archival will
   need suffix `-10`.

## Critical context / traps

- **This is the FOURTH security-labeled task this campaign** (after LCLI-85,
  LCLI-69, LCLI-72). Both prior sessions' independent adversarial reviews
  found REAL issues: LCLI-69's review found a live bypass of the first fix
  attempt (fixed before merge); LCLI-72's review found no bypass of the
  fix's own scope, but surfaced two genuine out-of-scope findings (a
  symlink-read gap, now a documented follow-up candidate; a profile-config
  traversal, deliberately excluded). Do not treat the lifecycle's step-6
  review as a formality for LCLI-71 or any remaining security task
  (LCLI-76/77 symlink escapes, LCLI-75 destructive deletion) — explicitly
  ask the reviewer to try to construct a bypass, and expect it might find
  one or surface an adjacent gap worth documenting.
- **When an out-of-scope finding surfaces during review**: this campaign's
  now-established decision rule (doc-1's Campaign conventions, LCLI-72
  session) is — same code this task already touches + well-precedented fix
  → fix in-task (LCLI-69's `porcelainPaths` defense-in-depth did this);
  genuinely separate vector needing its own scoped fix+tests+review → flag
  in the tracker's Not-queued section as a follow-up candidate, do NOT
  silently expand scope or silently ignore it (LCLI-72's symlink gap did
  this). Also: before assuming a finding overlaps an already-queued item,
  actually read that item's own AC wording, not just its title — LCLI-72's
  symlink finding looked like it might overlap LCLI-76/77 but turned out to
  be a genuinely different (read-path vs. write-path) code path.
- **`.repro-scratch/` keeps accumulating scratch files from every security
  review** (LCLI-85, LCLI-69, LCLI-72 all left files there) — all harmless,
  untracked, outside any diff. Per this campaign's standing rule, do NOT
  delete `.repro-scratch/` contents without being asked again.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 17 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature
  branch** when it's the currently-checked-out one — `git checkout dev` /
  `git branch -d feature/<KEY>` may report "already on"/"not found" as a
  result; not an error, verify with `git branch -a` + `git fetch --prune`.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't assume a fix that passes self-review and its own tests is done on a
  security-labeled task — budget for the independent review to actually find
  something (a full bypass, or an adjacent out-of-scope gap worth
  documenting) and require a follow-up round before the PR opens.
- Don't silently expand a security task's scope to fix every adjacent gap an
  adversarial review surfaces, and don't silently ignore those findings
  either — apply the decision rule above (in-task if same code + precedented
  fix, else a documented Not-queued follow-up).
- Don't assume a found gap overlaps an already-queued item just because the
  titles sound similar — read the other item's actual AC before concluding
  either way.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches to the base branch automatically.

# Handover — third backlog campaign, cursor at LORE-85 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 01b09e0`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-85 — Frontmatter YAML anchors can be crafted to exhaust memory
on serialize (anchor bomb, security-labeled). Queue order confirmed by user
on 2026-07-21 (independent fixes first, the LORE-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 13-issue queue remaining,
all from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for
full context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-85, Queue = 13 items, LORE-82 moved to Resolved, two new campaign conventions recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 13 tasks remaining (LORE-85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LORE-82` fully merged (PR #70, rebase-merged) and pruned (local + remote). **Note on this session's own merge**: `gh pr merge` succeeded remotely on the first attempt, but the immediately-following local checkout step failed because an uncommitted `backlog task edit --append-notes` change was still on disk — the note commit ended up pushed to the feature branch AFTER GitHub had already merged the PR, orphaning it. Recovered by cherry-picking that one commit directly onto `dev` and pushing. Lesson: commit and push EVERY backlog CLI mutation before calling `gh pr merge`, not just before the review pass — a `backlog task edit` call issued between review and merge is easy to leave uncommitted. |
| Not queued | LORE-42/43/44/45 (deferred) plus two unfiled follow-up candidates from LORE-84 (rewriteInbound's profile gap; lore check's separate validation path) |

## Next steps

1. Run the per-issue lifecycle on **LORE-85** (`Frontmatter YAML anchors can
   be crafted to exhaust memory on serialize`, security-labeled): branch
   `feature/LORE-85` off `dev`, read the task's AC, implement, verify,
   review, PR, self-merge, prune. Root area: `src/core/concept.ts` —
   `YAML_LOAD_OPTIONS` (line ~124, `yaml.load(input, YAML_LOAD_OPTIONS)`)
   and `YAML_DUMP_OPTIONS` (line ~138, sets `noRefs: true` — meaning
   `yaml.dump` always fully EXPANDS aliases back into repeated inline
   content rather than re-emitting `&anchor`/`*alias` references, which is
   exactly what makes a compact anchor chain balloon into a huge string on
   serialize). The task's own repro: an 18-level doubling-anchor chain
   (~417 bytes) expands to 64MB in ~600ms via `yaml.dump`; a few more
   levels reaches OOM or an uncaught `RangeError`.
2. **Research before implementing**: js-yaml is pinned at 4.1.0 (confirmed
   this session via `node_modules/js-yaml/package.json`). Verify whether
   js-yaml 4.x's `load()` supports any alias-count/depth limit option
   (`maxAliasCount` is a real option on the OTHER major YAML library,
   `eemeli/yaml` — do NOT assume it exists on js-yaml without checking the
   actual installed version's types/docs, since these two libraries are
   easy to confuse). If js-yaml has no such option, the bound likely needs
   to be enforced by lore itself — e.g. a post-load size/depth check on
   the parsed frontmatter object before it's used, or bounding the DUMP
   step (since dump-time expansion via `noRefs: true` is what the repro
   specifically demonstrates). AC1 explicitly requires a clean `LoreError`,
   not an uncaught `RangeError` or unbounded memory growth — think about
   WHERE the bound needs to fire so a malicious file is rejected before
   the expensive expansion happens, not after.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LORE-69** (item #2 of the remaining queue).
4. Archive this handover to `archive/handovers/` and write the next one for
   LORE-69. Note: today's date (`2026-07-21`) already has SIX prior
   archived handovers (base, `-2` through `-6`) — this session's own
   archival will need suffix `-7`.

## Critical context / traps

- **This is a security-labeled task** (labels: `codex-review`, `security` —
  the first `security`-labeled task in this campaign so far). The fix
  needs to genuinely close the DoS vector, not just make the repro
  slightly slower — think about an attacker who controls a single
  committed `.md` file's frontmatter (e.g. a malicious PR) being able to
  crash `lore` for anyone who runs a command touching that file.
- **`serializeConcept` (the dump path) is reached broadly** per the task's
  own description: `bundle.ts`, `sync.ts`, `rewrite.ts`, `indexes.ts`,
  `template.ts`, `scaffold.ts`, `commands/link.ts`, `commands/supersede.ts`
  — a fix scoped only to ONE call site would leave the others exploitable.
  Prefer fixing at the shared root (`concept.ts`'s parse/serialize
  boundary) over patching every caller individually, unless research shows
  that's not where the bound actually needs to live.
- **A gotcha this campaign learned the hard way (LORE-83, LORE-84)**: when
  a fix needs to change a shared low-level primitive (here, YAML
  load/dump options or a new validation step in `concept.ts`), check EVERY
  caller/consumer for a pre-existing assumption the change might violate
  before mechanically applying it everywhere — LORE-84's `sync.ts` had a
  documented precedence contract; LORE-82's `WarningCollector` change had
  to preserve every existing `.add()` call site's behavior. Do the same
  discipline here.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 14 prior sessions ran clean despite it.
  `.repro-scratch/` is disposable scratch from an earlier session's
  Codex-review verification work — the user explicitly declined to have it
  auto-deleted, so leave it as-is.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign. Deliberate, explicit exception to this repo's
  general "don't self-merge" convention — applies ONLY inside this
  campaign's one-issue-per-session lifecycle.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. Every
  review this campaign has found something worth fixing or done genuinely
  independent verification — keep using it as a real second pass. For a
  security-labeled fix, ask the reviewer to specifically try to construct
  a variant repro that bypasses whatever bound gets implemented (e.g. a
  wider/shallower anchor tree instead of a doubling chain), not just
  re-verify the exact given repro.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, earlier in this campaign.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — see
  `test/cli-exit-flush.test.ts` (LORE-70) for the correct pattern.
- Don't assume every merged bugfix needs a CHANGELOG.md entry — check actual
  recent precedent first (none of this campaign's LORE-68/70/82/83/84/86/87
  added one; the tracker doc is this campaign's record of truth).
- **New this session**: don't call `gh pr merge` while ANY backlog CLI
  mutation (`backlog task edit`, `backlog doc update`) from the review
  pass is still uncommitted on disk — commit and push it first, even if it
  feels like "just tracker bookkeeping." If a merge is attempted anyway and
  the local checkout step fails afterward with "local changes would be
  overwritten," check whether the PR nonetheless merged successfully on
  GitHub first (`gh pr view <N> --json state,mergedAt`) before assuming
  anything went wrong — it likely did merge, and the fix is to commit the
  stray change and cherry-pick it onto `dev` directly, not to re-run the
  merge or force anything.

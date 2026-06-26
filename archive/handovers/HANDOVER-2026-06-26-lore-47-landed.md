# Handover — LORE-47 PR #18 open + `/code-review max` produced 13 findings awaiting Jeremy's disposition

**Date**: 2026-06-26 | **Grounded against**: branch `feat/lore-47-gitadapter-resource`=`a9177cc` (==origin, clean tree, nothing unpushed); `dev`=`987e0df` (==origin/dev, unmoved) | **Backlog**: LORE-47 **In Progress** (Done on merge)

## Paste-ready prompt for the next session

```
LORE-47 (GitAdapter seam + git-history log.md + resource stamping) is delivered as OPEN PR #18
into dev (https://github.com/jeremy-newhouse/lore/pull/18), branch feat/lore-47-gitadapter-resource
= a9177cc, fully pushed, clean tree, MERGEABLE, 4/4 CI green, NO review from Jeremy yet. dev is
UNCHANGED at 987e0df. LORE-47 is In Progress (Jeremy reviews+merges himself; don't self-merge unless
he says "admin-merge"/"merge").

THIS SESSION ran `/code-review max` on PR #18: 13 verified findings (8 correctness, 5 cleanup),
FULLY RECORDED in LORE-47 task notes (`backlog task view LORE-47 --plain`). NONE were applied —
I asked Jeremy how to dispose (fix-on-branch / inline PR comments / defer log.ts ones to the
follow-up task) and he ran /handover instead of answering. So DISPOSITION IS STILL OPEN — that
is the first thing to resolve.

Per CLAUDE.md, FIRST run `backlog instructions overview`.

PRIMARY next action — ask Jeremy how to dispose of the 13 review findings (read them from LORE-47
notes; summary below). The two worst are real blockers; the log.ts ones are latent until `lore
sync` is wired:
  • Worst two (BOTH in stampResource, template.ts:214/218): the `canonicalKeyOrder.includes("resource")`
    guard tests the profile-GLOBAL field list, not the concept's OWN type. (218) declaring a typed
    `resource` on any ONE type suppresses auto-stamping for EVERY type. (214) a `resource={required=true}`
    field makes `lore new <type>` fail exit 6 forever (defers→missing-required; no --resource flag).
    Fix both by testing the concept's own type's declared fields instead of the global order.
  • Other correctness: template.ts:60 (whitespace resource_base → embedded-space URL); schema.ts:55
    (hand-authored `resource:` on index.md no longer warned); template.ts:222 (stamped resource never
    drift-checked → stale URL ships green).
  • log.ts (LATENT — no production caller until sync is wired; fold into the deferred follow-up task):
    :174 dup singleLine drops U+2028/U+2029 (fix: import from ../errors); :114 un-normalized
    trailing-slash root → silently empty log; :191 missing subject tiebreak; :186 Date.parse local-TZ.
  • Cleanups: log.ts:185 dead NaN/lexical fallback; log.ts:186 redundant re-parse (cache instant on
    LogEntry@127); test/template.test.ts:273 dup profile fixture.

If Jeremy says FIX ON BRANCH: edit on feat/lore-47-gitadapter-resource, gates (bun test +
`bunx biome check src/ test/` + `bunx tsc --noEmit` + coverage), push via the gh-token route
(SSH IS DOWN — see traps), keep PR #18 open. Add tests for the stampResource own-type guard and a
required-`resource` profile. If POST COMMENTS: `gh pr comment`/inline review via gh api. If DEFER:
ensure the log.ts findings land in the deferred `lore sync` follow-up task when it's created.

If instead Jeremy has by now MERGED PR #18: (a) `backlog task edit LORE-47 -s Done`; (b) ff local
dev via the gh-token route; (c) write a fresh handover (this one supersedes); (d) CREATE the deferred
`lore sync` follow-up task AND carry the log.ts findings (:174/:114/:191/:186/:185) into it; (e) pick
next with Jeremy.

Gates for any new work: bun test + biome + tsc + coverage → `/code-review max` → PR into dev. All
commits end with `Co-Authored-By: Claude Opus 4.8 (1M context)`.
```

## State

| Item | Status |
| --- | --- |
| PR #18 | **OPEN** into `dev`, MERGEABLE, 4/4 CI green, **no review from Jeremy yet** (0 comments) |
| branch `feat/lore-47-gitadapter-resource` | `a9177cc` == origin; clean tree; nothing unpushed |
| `dev` | `987e0df` == origin/dev — **unmoved** |
| LORE-47 | **In Progress**; ACs #1–#5 checked; **13 `/code-review max` findings appended to notes this session** |
| `/code-review max` findings disposition | **OPEN** — not applied; Jeremy hasn't chosen fix/comment/defer |
| deferred `lore sync` wiring | **not yet a task** — create on merge; carry log.ts findings into it |
| LORE-20 | **To Do** (m-2) — `lore schema export` |

## Next steps

1. `backlog instructions overview`, then ask Jeremy how to dispose of the 13 findings (in LORE-47 notes). Default recommendation: fix the two stampResource blockers (template.ts:214/218) on the branch now; defer the latent log.ts ones to the sync follow-up.
2. On a fix-on-branch decision: edit → gates → push via gh-token → keep #18 open; add own-type-guard + required-`resource` tests.
3. On merge (if Jeremy merged first): LORE-47 → Done; ff dev (gh-token); fresh handover; create the deferred `lore sync` follow-up AND move the log.ts findings into it; pick next.

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route git writes via the gh
  token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`
  then `git update-ref refs/remotes/origin/<branch> <sha>`. `gh`/`gh pr`/`gh api` work regardless.
  ff dev after merge: gh-token `fetch …/lore.git dev`, `git checkout dev`, `git merge --ff-only FETCH_HEAD`,
  `git update-ref refs/remotes/origin/dev <sha>`. [[lore-git-workflow]].
- **The two stampResource findings (template.ts:214/218) are the real blockers** and share one root cause:
  the defer guard tests `profile.canonicalKeyOrder` (the GLOBAL union of every type's fields) instead of
  the concept's own type's declared fields. Fix once, at the type level; covers both the cross-type
  suppression (218) and the required-field exit-6 (214). There is currently NO `--resource` flag.
- **The log.ts findings (:174/:114/:191/:186/:185) are LATENT** — `buildLog`/`generateLog` has no
  production caller yet (sync not wired; verified — only test/log.ts imports it). They bite the moment
  `lore sync` is wired, so they belong with the deferred follow-up, not necessarily PR #18.
- **core/ stays PURE** (lore-design §2.1): the real git-shelling GitAdapter is command-layer wiring, not
  core/log.ts. **log.md is git-history-derived → changes every commit** → sync-materialized, EXCLUDED
  from `lore check`'s drift gate. **resource stamping is opt-in + byte-safe** (only when resourceBase set,
  not index.md, profile doesn't own `resource`). **ubuntu CI is case-SENSITIVE**.
  [[external-volume-bun-exdev-traps]].
- **This handover was REFRESHED IN PLACE** (same path/topic/day) rather than archived, to avoid adding a
  docs commit to PR #18 mid-review. The pre-review version is in git history of this gitignored file's
  prior state only if it was ever committed (it was not).

## Do not repeat

- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the start.
- **Don't self-merge** PR #18 unless Jeremy explicitly says "admin-merge"/"merge" ([[lore-git-workflow]]).
- **Don't apply the 13 findings without Jeremy's disposition** — he was asked and hasn't chosen; some
  (e.g. the docs/ double-prefix, encodeURIComponent) are by-design/refuted-adjacent, not all are fixes.
- **Don't re-run `/code-review max` on #18** — it's done; results are in LORE-47 notes (workflow wf_dbed19c0-3ff).
- **Don't fix the stampResource guard by patching the global key list** — fix at the concept's own type.

## System of record updated (this session)

- **LORE-47** notes → full `/code-review max` disposition appended: 13 findings (file:line, verdict,
  fix sketch) + the 6 refuted, marked NOT-applied / disposition-pending. This is the durable record;
  the handover only points at it.
- No code changed, no commits, no Backlog status change. PR #18 untouched (still a9177cc).

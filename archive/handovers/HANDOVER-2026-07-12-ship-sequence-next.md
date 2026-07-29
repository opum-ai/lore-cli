# Handover — Ship sequence: 4 PRs awaiting review; release workflow's first real run is next

**Date**: 2026-07-12 | **Grounded against**: `feat/lore-9-release-pipeline` @ `a95a1c4` (pushed, clean) | **Backlog**: LCLI-39, LCLI-51, LCLI-14, LCLI-9 (PRs open), LCLI-52 (filed, not started)

## Paste-ready prompt for the next session

```
Continuing the "finish the backlog and ship" sequence.

FIRST run `backlog instructions overview`.

Four PRs are open, all previously CI-green, awaiting user review — do not
touch them, just be aware (re-check CI status since some time may have
passed):
  #45 LCLI-39 (lore scaffold mkdocs)
  #46 LCLI-51 (dedup task-summary row renderer)
  #47 LCLI-14 (Bun compile-compatibility spike + tech-stack corrections)
  #48 LCLI-9 (release pipeline mechanics — compiled binaries + npm publish)

1. Check whether any of the 4 PRs have merged since this handover was
   written (`gh pr list --state merged --limit 10`, `gh pr view <n>`).
2. CRITICAL, the single biggest remaining unknown for LCLI-9: once PR #48
   (or whichever PR carries `.github/workflows/release.yml`) merges to
   `dev`, the workflow has STILL never run in real GitHub Actions —
   `workflow_dispatch` requires the file to exist on the default branch to
   be triggerable (`gh workflow run release.yml --ref <branch>` 404s
   otherwise; this is a hard GitHub constraint, not a bug). Once it's on
   `dev`: `gh workflow run release.yml --ref dev` (or the Actions UI,
   default inputs) and watch it closely — `gh run watch <id>`. Every
   verification so far (4 full `/code-review high` rounds, `actionlint`,
   direct local reproduction of every constituent command) is real but not
   the same as a real runner executing the real YAML. If it fails, the
   failure is genuinely new information, not a review gap — investigate
   from scratch rather than assuming it's another subtle YAML bug like the
   prior 4 rounds found (though it might be — this branch's track record
   with release/packaging YAML has been consistently humbling).
3. Once LCLI-9 merges: LCLI-40 (docusaurus scaffold) was blocked because it
   extends files that only exist on the (still unmerged) LCLI-39 branch —
   check whether LCLI-39 (#45) has merged by then and branch LCLI-40 off
   `dev` once it has.
4. LCLI-5 (upstream Backlog.md --json PR) is gated on an actual release
   (needs a working `npm publish` step, which does not exist yet — LCLI-9
   deliberately stopped at "build mechanics only, before publish" per an
   earlier explicit scope decision) — likely still blocked even after
   LCLI-9 merges. See docs/runbooks/release-publishing.md for what's left
   (npm Trusted Publisher / OIDC setup on npmjs.com for all 6 packages).
5. LCLI-52 (reconcile stale remark/unified doc references — recreated this
   session, LOW, fully independent) can slot in anytime with no blockers.
   Its exact original scope ("8 ADRs/specs") from an earlier session was
   lost before being filed properly — the task as filed asks for a fresh
   `grep -r "remark\|unified" docs/` sweep to (re-)classify each hit as
   accurate vs. stale, since a broad grep turned up 15 files, not 8, and
   guessing which 8 were meant would be fabrication.
```

## State

| Item | Status |
| --- | --- |
| PR #45 (LCLI-39) | Open, awaiting user review |
| PR #46 (LCLI-51) | Open, awaiting user review |
| PR #47 (LCLI-14) | Open, awaiting user review |
| PR #48 (LCLI-9) | **Newly opened this session**, awaiting user review |
| LCLI-9 gates | Reconfirmed clean: 1439 tests pass, biome clean, tsc clean, `lore check` 0/0, `lore validate` 0 errors, actionlint clean |
| LCLI-9's `release.yml` | actionlint-clean, 4 full `/code-review high` rounds folded, every constituent command manually reproduced locally; **still never executed in real GitHub Actions** (hard `workflow_dispatch`-on-default-branch constraint) |
| LCLI-52 | Recreated this session (LOW), not started, fully independent |
| LCLI-40, LCLI-5 | Still blocked (see next steps) |

## Next steps

1. Watch for PR review/merge activity on #45/#46/#47/#48 (user-driven — not something to push on unprompted).
2. Once any PR carrying `release.yml` merges to `dev`: trigger the workflow's first real GitHub Actions run and watch it closely. This is the single biggest remaining unknown in all of LCLI-9.
3. After that: LCLI-40 (once LCLI-39/#45 merges), then LCLI-5 (gated on real publish wiring + npm Trusted Publisher setup), with LCLI-52 available anytime.

## Critical context / traps

- **`workflow_dispatch` requires the workflow file on the default branch to be triggerable** — don't waste time working around this pre-merge; it's a hard GitHub constraint.
- **`bun build --compile`'s EXDEV trap** (LCLI-14, cross-referenced in `DEVELOPMENT.md` + `docs/reference/tech-stack.md` §1): `--outfile` must be on the same filesystem as the checkout — crossing a device boundary silently produces a 0-byte binary at exit `0`.
- **`package.json`'s `bin.lore` is deliberately still `src/cli.ts`, not `bin/lore.cjs`.** Flipping it early breaks every pre-publish install path. Do not "helpfully" flip this before a real publish is wired (documented in `docs/runbooks/release-publishing.md`).
- **A stale/broken `node_modules/@types/bun` symlink** caused a spurious `tsc` failure this session (`Cannot find type definition file for 'bun'`) — unrelated to any code change, fixed by a plain `bun install`. If `tsc` fails mentioning a missing `bun`/`js-yaml`/`mdast` type package, check for a broken symlink under `node_modules/@types/` before assuming a real regression.
- **LCLI-9 has now been through 4 full `/code-review high` rounds**, each catching real, previously-undetected issues — most recently a `setup`-job refactor (round 3's own change) that silently dropped `verify-versions` from `build`'s dependency chain, defeating its "fail loud before any compile" guarantee. This branch's track record is a standing signal: don't skip the review loop on any future CI/CD-touching change here, and don't trust `actionlint` alone (it only checks syntax, not runtime/dependency-graph logic).
- **`bun -e` combined with `require('js-yaml')` silently crashes with no output/error** in this environment — use Python/PyYAML or `actionlint` for workflow-YAML validation instead.

## Do not repeat

- **Branching discipline**: always `git checkout -b feat/lore-N-... dev` before making any edits when starting a new backlog task (a prior session accidentally started work on the wrong branch).
- **Claiming novelty without grepping broadly first**: grep the whole repo, not just the file about to be touched, before asserting something is undocumented/new.
- **Testing a Node-only file via `process.execPath` under `bun test`**: that *is* the Bun binary, not Node — spawn the literal `"node"` string when a test needs to exercise Node behavior specifically.
- **An ambiguous shell glob for tarball filenames** caused an EBADPLATFORM failure; construct exact filenames from the known version instead of globbing when multiple packages share a name prefix.
- **A handover claimed a Backlog task ("LCLI-52") was filed when it never actually was** — the task didn't exist when this session checked. Ground-truth-verify every claim in a restored handover before trusting it, especially "I already did X" claims about external systems (Backlog, git, PRs) — don't just trust the prose.

## System of record updated

- **LCLI-9 Backlog task notes** → now carry all 4 `/code-review high` rounds' full disposition (round 3 was already present from the prior session; round 4 — the setup-job `needs:` regression + 2 cleanup findings — appended this session).
- **LCLI-52** → recreated this session (the prior session's claim that it was "filed" did not hold up under ground-truth verification); LOW priority, doc-drift reconciliation, not started.
- **CHANGELOG.md** → round-3 addendum written this session (was the one confirmed-missing piece from the restored handover's drift check).
- **`.github/workflows/release.yml`** → `build`'s `needs:` fixed to `[setup, verify-versions]`; the duplicated platform-list-to-space-separated-string transform in the `package` job consolidated into a new `setup` job output (`namesSpace`).
- **`docs/runbooks/release-publishing.md`** → corrected to name `verify-versions` (not `build`) as the job that asserts version/metadata consistency, and to list everything it now checks (was stale after round-3's field additions).
- **PR #48** → opened this session (`gh pr create`), full summary + review history + "still unverified" caveat in the PR body.

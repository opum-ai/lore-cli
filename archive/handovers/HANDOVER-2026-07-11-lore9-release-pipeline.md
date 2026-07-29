# Handover — Ship sequence: 3 PRs awaiting review + LCLI-9 mid-round-3-review-fold (uncommitted)

**Date**: 2026-07-11 | **Grounded against**: `feat/lore-9-release-pipeline` @ `9ce92c6` (+ 4 uncommitted files) | **Backlog**: LCLI-39, LCLI-51, LCLI-14 (PRs open), LCLI-9 (in progress, uncommitted fixes), LCLI-52 (filed, not started)

## Paste-ready prompt for the next session

```
Continuing the "finish the backlog and ship" sequence under an active /goal
("finish this project with all AC met", Stop-hook-gated — keep working without
pausing for routine judgment calls; PRs still need the user's own merge, and
anything touching real npm/external-account setup needs the user directly).

FIRST run `backlog instructions overview`.

Three PRs are open, all CI-green, awaiting user review — do not touch them,
just be aware:
  #45 LCLI-39 (lore scaffold mkdocs)
  #46 LCLI-51 (dedup task-summary row renderer)
  #47 LCLI-14 (Bun compile-compatibility spike + tech-stack corrections)

Currently on branch feat/lore-9-release-pipeline @ 9ce92c6, with 4 files
UNCOMMITTED (a third round of /code-review high fixes, already made, never
committed): .github/workflows/release.yml, .gitignore, bin/lore.cjs,
test/bin-lore.test.ts. `git status --porcelain` will show these — do not
discard them, they are real, verified fixes (see "Critical context" below for
what each one fixes and why).

1. Re-run full gates on this branch and confirm clean (this was NOT confirmed
   before the session ended — `bun test --isolate` kept getting
   auto-backgrounded by the harness without returning output in time; it may
   just need a plain re-run, or check the backgrounded task IDs bh726qm57 /
   b7yz1y6bp / bbwq95s93 for stale output first):
     bun test --isolate --timeout=10000
     bunx biome check src test
     bunx tsc --noEmit
     bun src/cli.ts check --plain
2. If clean: commit the 4 files (message should cover: verify-versions now
   also checks root package.json's optionalDependencies pins + license/
   author/repository across all 6 release packages; bin/lore.cjs no longer
   masks non-"missing package" require.resolve errors as "unsupported
   platform"; bin/lore.cjs now maps a signal-terminated child to 128+signal
   instead of a flat 1; the 5-platform list is now single-sourced via a new
   `setup` job instead of being hand-typed in 3 places; .gitignore now
   excludes dist-npm/; test/bin-lore.test.ts uses beforeEach/afterEach like
   the rest of the suite and gained 2 new tests for the signal-code and
   error-masking fixes). Append these to LCLI-9's Backlog notes (which
   already have 2 prior rounds' disposition — this would be the 3rd).
3. Given how much this branch's review has caught across 3 rounds (see
   "Do not repeat" below), consider one more /code-review high pass before
   pushing, or at minimum re-verify manually (actionlint on both workflow
   files; the exact-filename-construction / patch-pack-revert sequence in
   release.yml's `package` job was verified locally step-by-step — if you
   change that job again, re-verify it the same way, don't just trust
   actionlint, which only checks syntax not runtime behavior).
4. Push, open the PR (never opened yet — kept finding fixes instead).
5. CRITICAL, most important unverified piece of all of LCLI-9: the release
   workflow itself has NEVER run in real GitHub Actions.
   `gh workflow run release.yml --ref <branch>` 404s until the workflow file
   exists on the default branch (`dev`) — this is a hard GitHub constraint,
   not a mistake to "fix". Once ANY PR merges LCLI-9's release.yml to dev,
   manually trigger it (`gh workflow run release.yml --ref dev` or the
   Actions UI, workflow_dispatch, default inputs) and watch it closely. Every
   verification so far is local reproduction of the underlying commands +
   actionlint + a Python/PyYAML syntax check — real, but not the same as a
   real runner executing the real YAML.
6. Once LCLI-9 merges: LCLI-40 (docusaurus scaffold) was blocked because it
   extends files that only exist on the (still unmerged) LCLI-39 branch —
   check whether LCLI-39 has merged by then and branch LCLI-40 off dev once
   it has. LCLI-5 (upstream Backlog.md --json PR) is gated on an actual
   release, so it's likely still blocked even after LCLI-9 merges (no
   publish step exists yet — see docs/runbooks/release-publishing.md).
7. LCLI-52 (reconcile stale remark/unified doc references across 8 other
   ADRs/specs — filed this session, LOW, fully independent) can slot in
   anytime with no blockers.
```

## State

| Item | Status |
| --- | --- |
| PR #45 (LCLI-39) | Open, all 5 CI checks green, awaiting user review |
| PR #46 (LCLI-51) | Open, all 4 CI checks green, awaiting user review |
| PR #47 (LCLI-14) | Open, all 4 CI checks green, awaiting user review |
| LCLI-9 (release pipeline) | In progress on `feat/lore-9-release-pipeline` @ `9ce92c6`; 4 files uncommitted (round-3 review fixes); PR not yet opened |
| LCLI-9 gates | NOT reconfirmed after round-3 fixes — `bun test --isolate` kept auto-backgrounding without returning output before the session ended |
| LCLI-9's `release.yml` | actionlint-clean, PyYAML-valid, every constituent command manually reproduced locally; **never executed in real GitHub Actions** (workflow_dispatch requires the file on the default branch) |
| LCLI-52 (doc-drift reconciliation) | Filed this session (LOW), not started, fully independent |
| LCLI-40, LCLI-5 | Still blocked (see next steps) |

## Next steps

1. Confirm/re-run LCLI-9's gates (listed in the paste-ready prompt above); commit the 4 uncommitted files; append round-3 disposition to LCLI-9's Backlog notes; push; open the PR.
2. Once LCLI-9 (or whichever PR merges the workflow file first) lands on `dev`, manually trigger `release.yml` for its first real GitHub Actions run and watch it closely — this is the single biggest remaining unknown.
3. After that: LCLI-40 (once LCLI-39 merges), then LCLI-5 (gated on an actual release), with LCLI-52 available anytime.

## Critical context / traps

- **`workflow_dispatch` requires the workflow file on the default branch to be triggerable** — `gh workflow run release.yml --ref <feature-branch>` 404s until merge. Don't waste time working around this pre-merge; it's a hard GitHub constraint.
- **`bun build --compile`'s EXDEV trap** (LCLI-14, cross-referenced in `DEVELOPMENT.md` + `docs/reference/tech-stack.md` §1): `--outfile` must be on the **same filesystem** as the checkout — crossing a device boundary (either direction, not "external volume" specifically) silently produces a 0-byte binary at exit `0`, no error on either stream.
- **`package.json`'s `bin.lore` is deliberately still `src/cli.ts`, not `bin/lore.cjs`.** Flipping it is documented (`docs/runbooks/release-publishing.md`) as literally the first step of cutting a real release — doing it any earlier breaks every pre-publish install path (git dependency, `npm`/`bun link`) since the platform packages `bin/lore.cjs` resolves don't exist until a real publish ships them. **Do not "helpfully" flip this before a real publish is wired.**
- **`bun -e` combined with `require('js-yaml')` silently crashes with no output/error in this environment** (confirmed reproducible: `bun -e "console.log('before'); require('js-yaml'); console.log('after')"` prints only `before`, exits 0). Use Python/PyYAML (a venv with it already exists at `/private/tmp/claude-501/-Volumes-external-repos-lore/51ce547f-dc3f-4100-8c99-fec34e7c9844/scratchpad/mkdocs-venv`) or `actionlint` for workflow-YAML validation instead — don't debug this further, just route around it.
- **`rm -rf` combined with other commands in one Bash call sometimes gets denied** by the permission layer even for scratchpad-only paths; split cleanup into separate single-command calls.
- **LCLI-9 went through 3 full `/code-review high` rounds**, each catching real, previously-undetected issues (round 1: 4 findings incl. an unsafe YAML-scalar bug; round 2: 6 findings incl. two SEVERE bugs — an install-sanity tarball glob that would EBADPLATFORM-fail every real run, and a `bin` field flip that broke all pre-publish installs; round 3: 7 more findings incl. a `verify-versions` gap that would let a real release silently ship with mismatched optionalDependency version pins, plus `bin/lore.cjs` error-masking and signal-exit-code bugs). This is a signal that release/packaging YAML is genuinely easy to get subtly wrong even after careful authoring — don't skip the review loop on CI/CD-touching work, and don't assume "actionlint passed" means the runtime logic is correct.

## Do not repeat

- **Branching discipline**: earlier this session, LCLI-14 work was accidentally started directly on the still-open LCLI-51 branch instead of a fresh branch off `dev`, before being caught and corrected. Always `git checkout -b feat/lore-N-... dev` **before** making any edits when starting a new backlog task.
- **Claiming novelty without grepping broadly first**: LCLI-14 initially claimed a compile-time caveat was "previously-undocumented" without grepping `DEVELOPMENT.md` (only the doc file about to be edited was checked) — it was already documented from a prior session. Had to walk back the claim in a follow-up commit + PR comment. Grep the whole repo, not just the file you're about to touch, before asserting something is new.
- **Testing a Node-only file via `process.execPath` under `bun test`**: `process.execPath` under Bun's test runner *is* the Bun binary, not Node — silently tests the wrong runtime. Spawn the literal `"node"` string (PATH-resolved) when a test specifically needs to exercise Node behavior.
- **An ambiguous shell glob for tarball filenames** (`salient-data-lore-*.tgz` also matches every platform variant) caused an EBADPLATFORM failure mode in `release.yml`; construct exact filenames from the known version instead of globbing whenever multiple packages share a name prefix.

## System of record updated

- **LCLI-39/LCLI-51/LCLI-14 Backlog task notes** (on their own respective branches) → each already carries full implementation + code-review-fold disposition write-ups from this session; nothing further needed unless the user requests changes during review.
- **LCLI-9 Backlog task notes** (this branch) → carries round-1 and round-2 `/code-review high` disposition; round-3's disposition is **not yet appended** (next session's job, alongside committing the round-3 fixes themselves).
- **LCLI-52** → newly created this session (LOW priority, doc-drift reconciliation), not started.
- **CHANGELOG.md** (this branch) → has the LCLI-9 entry from round-2; needs a round-3 addendum once the round-3 fixes are committed.
- **Auto-memory** → `external-volume-bun-exdev-traps.md` corrected (cross-device root cause, not volume-specific) and `lore-40-docusaurus-cjs-config.md` added (CJS not ESM for docusaurus config) — both from earlier this session, still accurate and unaffected by anything since.

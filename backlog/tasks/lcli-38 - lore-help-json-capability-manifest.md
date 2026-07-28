---
id: LCLI-38
title: lore help --json capability manifest
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - cmd
  - agent-api
milestone: m-5
dependencies: []
documentation:
  - docs/reference/cli-contract.md
priority: medium
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Machine-readable manifest: command tree, flags, per-command --json availability, exit codes, examples, so an agent learns lore in one read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Manifest enumerates every command + exit codes
- [x] #2 Stable, additive-only contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/manifest.ts (NEW): ManifestFlag/ManifestCommand/Manifest interfaces; curated LORE_MANIFEST for the SHIPPED commands only (16 dispatched + help) — each with name, summary, args signature, flags[], json:bool, kind|null, exitCodes[], examples[]; global exitCodes taxonomy (usage:2/not_found:3/denied:4/conflict:5/validation:6/drift:6) + globalFlags; buildManifest() -> Manifest; findManifestCommand(name). Mirrors the static-registry shape of core/instructions.ts (no bundle load, no root).
2. src/commands/help.ts (NEW): thin command mirroring commands/instructions.ts. runHelp({output,args,stdout}): parse optional <command> positional via parseCommandArgs; --json emits full manifest (kind: help.manifest) or the single command entry when a positional is given; pretty/plain renders top-level help (command list from manifest) or per-command detail; unknown <command> -> LoreError('not_found') = exit 3; bad flag -> usage exit 2.
3. src/cli.ts: import runHelp + add case 'help' to dispatch. Retire the USAGE literal: render the top-level --help / no-command text FROM the manifest via a shared renderer so --help (kind:help) and 'lore help' share one source. Keep the emitMeta seam and kind:'help' for the --help flag path; 'lore help --json' uses kind:'help.manifest'.
4. Tests: test/help.test.ts — JSON envelope kind+shape; BIDIRECTIONAL lock-step guard (every manifest command dispatches via real router AND every dispatched command appears in the manifest); additive-only required-keys pin (removing a field fails CI); per-command --json; unknown command exit 3; pretty/plain string asserts. Update test/cli.test.ts router-wiring (lore help exit 0, lists commands; --help still kind:help).
5. docs/reference/cli-contract.md: add help.manifest to the §2.1 kind registry and correct the stale kinds (init.result/new.result/sync.summary -> init/new/sync.result; drop phantom tasks.rollup/orphans.report/scaffold.result).
6. Verify: bun lint/typecheck/test green; lore check clean; then PR into dev.
Scope: Tier 2 (per user) — manifest + retire USAGE; agent-bridge LORE_COMMANDS left as a follow-up (Tier 3 deferred).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented (Tier 2). New src/core/manifest.ts: curated LORE_MANIFEST for the 17 shipped commands (16 dispatched + help), each with name/summary/args/flags/json/kind/exitCodes/examples; global exit taxonomy built from errors.ts (EXIT_OK/EXIT_UNCAUGHT/EXIT_CODES) so it can't drift; buildManifest()/findManifestCommand()/manifestCommandNames(). New src/commands/help.ts: thin command mirroring instructions.ts; lore help [<command>] renders pretty/plain from the manifest, --json emits kind:help.manifest (full manifest, or the same Manifest shape scoped to one command for 'lore help <cmd> --json'); unknown command = not_found (exit 3). cli.ts: added case 'help'; retired the hand-kept USAGE literal — top-level --help/no-command now renders via renderTopLevelHelp(manifest), so 'lore --help' and 'lore help' are byte-identical (one source). Flags/kinds/exitCodes transcribed from LIVE command source, not the drifting docs: fixed that init takes no flags live (dispatch rejectCommandArgs), new's flags are var/template/summary/tags/out (not the doc's epic/story/resource), replace exits [0,2] (dropped the doc's phantom 6). Per-command exitCodes are curated to distinctive codes (mirroring cli-surface Exit rows) + universal 2, not exhaustive over generic EACCES denied(4). test/help.test.ts (24 tests): bidirectional lockstep guard — forward (every manifest command dispatches through the real router, no 'unknown command') + reverse (every case in cli.ts source is in the manifest) + cross-registry (manifest == LORE_COMMANDS + help); additive-only required-keys pins; router wiring incl. help/--help byte-identical. cli-contract.md §2.1 kind registry: added help.manifest, fixed stale shipped kinds (init.result->init, new.result->new, sync.summary->sync.result), added missing shipped kinds (schema.result/agents.result/instructions.text), marked tasks/orphans/scaffold kinds deferred, pointed at 'lore help --json' as authoritative. Gates: typecheck 0, biome lint 0, bun test 1357 pass, lore check 0 errors. Code-review pass running.

Code-review round (high, workflow-backed: 4 finders + 10 verifiers): 9 findings, all addressed. Dominant class = per-command exitCodes UNDER-reported not_found(3)/denied(4) thrown via SHARED helpers my per-file grep missed (expandTarget/loadBundle/resolveTemplate/readSource/fswrite), and were internally inconsistent (3 on check but not sibling validate; 4 on link but not unlink). Fix: adopted a uniform, documented exit-code policy — not_found(3) on any command resolving a named target/bundle; denied(4) on any command that WRITES to disk; incidental EACCES-on-read treated like uncaught(1) (not enumerated for read-only cmds). Corrected 10 entries; siblings now consistent (validate==check==[0,2,3,6], link==unlink==[0,2,3,4,5,6], graph==query==context==[0,2,3]). Finding #8 (manifest re-transcribed LORE_COMMANDS name+summary, already drifted on agents): manifest now DERIVES name+summary from LORE_COMMANDS (COMMAND_DETAILS keyed by name, spread onto each LORE_COMMANDS entry + help) — drift impossible by construction, stays Tier 2 (no agent-bridge change). Test updated: reverse lockstep guard now scopes the cli.ts regex to the switch(parsed.command) block + non-empty sanity assert (was file-wide, fragile); added a summary-derivation guard. Finding #7 (top-level --help dropped per-command invocation hints): added a footer 'Run lore help <command> for a command's arguments, flags, output, and exit codes' so the concise catalog is intentional/discoverable. Re-verified: typecheck 0, lint 0, bun test 1357 pass, lore check 0.

Re-review round 2 (high, on the committed diff — the fixes themselves had not been reviewed): 8 findings. Revealed the per-command exitCodes were SYSTEMATICALLY wrong (both under- and over-reporting) because codes bubble up from shared seams my per-file grep never traced: readers omitted denied(4); bundle-readers omitted validation(6); writers omitted conflict(5). Also my round-1 fix (derive manifest name+summary from LORE_COMMANDS via a throwing detailFor) was a REGRESSION — it evaluated at module load in cli.ts's import chain, so a partial edit would crash EVERY lore command, not just the SKILL generator. Rework (commit c9be51c), grounded in an authoritative trace of each command's runX call chain vs the shared seams: exitCodes are now DERIVED via exitCodesFor(seams,extra) over a single SEAM_CODES map (loadBundle→3,4,6; readSource→3,4; loadProfile→6; fswrite→4,5; Backlog adapter→3,6; git→6) — correct-by-construction so siblings can't disagree. Verified per-command results (e.g. replace=[0,2,3,4,5] with NO 6 since it rewrites raw bytes; schema/agents have no 3; instructions/help touch no FS). A golden exitCodes test transcribed independently from the trace pins each command's set, so a mis-declared seam fails CI. Manifest is self-contained again (no LORE_COMMANDS import → no module-load coupling/crash); summary drift caught by a test instead. Also: restored inline invocation signatures in top-level --help; broadened reverse-lockstep regex to any dispatch token; cli-contract §2.1 notes version/help meta-flag kinds are not commands. Gates: typecheck 0, lint 0, bun test 1358 pass, lore check 0. Round-3 review running to confirm.

Re-review round 3 (high): only 2 findings, both robustness (not bugs) — a strong convergence signal (9→8→2 across rounds). (a) CONFIRMED test-gap: manifest is now hand-ordered but the reverse-lockstep test compared only Sets, so a reorder could drift lore help from cli.ts dispatch order uncaught → test now compares ordered arrays. (b) PLAUSIBLE honesty: validate/check/new's principal exit 6 (their validation/drift gate) was only coincidentally covered by a profile/adapter seam → modeled explicitly as extra:[6] (as agents already does); exit-code sets unchanged (golden test still holds), rationale now refactor-robust. Committed e593ca5. Gates: typecheck 0, lint 0, bun test 1358, lore check 0. Exit codes are now grounded in an authoritative call-chain trace, derived by construction, and pinned by BOTH a golden set test and an order test.
<!-- SECTION:NOTES:END -->

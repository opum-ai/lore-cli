---
# yaml-language-server: $schema=../../.lore/schemas/Runbook.schema.json
type: Runbook
title: "Backlog.md --json patch runbook (fork, patch, build, upstream)"
description: Step-by-step procedure to add a --json flag to Backlog.md v1.47.1 by forking MrLesk/Backlog.md to jeremy-newhouse/Backlog.md, adding a shared task-json serializer and json-before-plain branches to task list/view/search, building a local compiled binary for lore's git dependency, and opening a minimal upstream PR — the BJP milestone that unblocks lore.
tags: [backlog, json, fork, patch, runbook, upstream, bjp]
summary: How to fork and patch Backlog.md to add the --json flag lore depends on, build it locally as lore's git dependency, and upstream a minimal PR.
timestamp: 2026-06-21T00:00:00Z
---

# Backlog.md `--json` patch runbook

This runbook is the **BJP milestone** — the first thing built in the
[lore build order](../specs/lore-design.md). Everything else (M0–M5) is blocked
on it, because `lore` reads Backlog.md **JSON-only** and stock Backlog.md
**v1.47.1 has no `--json` flag**. We add one.

The output of this runbook is twofold:

1. A **forked, `--json`-capable Backlog.md** (`jeremy-newhouse/Backlog.md`)
   that `lore` consumes as a locally-compiled **git dependency** during the
   interim.
2. A **minimal upstream PR** to `MrLesk/Backlog.md` so the flag eventually ships
   in a stock release, after which `lore` migrates to the published package and
   bumps its minimum-version probe.

> **Superseded (2026-07-17, LCLI-5).** Outcome 2 above didn't happen the way
> planned: MrLesk's team shipped their **own** independent `--json`
> implementation ([PR #790](https://github.com/MrLesk/Backlog.md/pull/790),
> BACK-545) before we opened one. `lore` is **adopting that implementation
> directly** instead of upstreaming this fork's patch. Sections 1–7 below are
> kept as a historical record of what was actually built and shipped in
> `src/adapters/backlog.ts` (LCLI-2/4/21) — they are **not** the path forward.
> Skip to [§8](#8-migrate-to-upstream-on-release-and-bump-the-floor) for the
> current adoption plan.

The shape of the JSON this patch must emit is **not** invented here — it is
specified, field by field, in
[the Backlog.md `--json` schema](../reference/backlog-json-schema.md). The
operational rules `lore` enforces against that output (capability probe,
min-version, fail-loud) live in the
[Backlog.md CLI contract](../reference/backlog-cli-contract.md). This runbook is
the **producer side**: how to make Backlog.md emit that contract.

> **Scope discipline.** The patch is intentionally tiny: `--json` on **three
> read commands** (`task list`, `task view` (+ the bare `task <id>` shortcut),
> and `search`), fed by **one shared serializer**, ordered **json-before-plain**.
> No `board`, no `overview` (those have no plain path and would be net-new
> logic). No MCP `structuredContent` (deferred to a follow-up PR). No `--plain`
> changes. Keeping the diff small is what makes the upstream PR mergeable.

---

## 0. Why this design (the one-paragraph rationale)

Backlog.md's CLI already has the structured object in hand one line before it
prints. At every `--plain` site the action calls
`console.log(formatTaskPlainText(task))` (or an inline summary builder), and the
icon/blessed transforms live **inside** the formatter — so `task.status` is the
clean, icon-free value *before* formatting. Adding `--json` is therefore a
**serialize-before-format injection**, not a deeper change: declare a per-command
`--json` option, and add an early `if (json) { emit(serialize(obj)); return; }`
branch **before** the plain branch. This is the exact pattern `--plain` already
established (detection chokepoint at `cli.ts:425-429`), which is why the change
is low-risk and the PR is reviewable. Line numbers below are spot-verified
against `MrLesk/Backlog.md` at **v1.47.1**; treat them as anchors, not promises —
re-grep after rebasing.

---

## 1. Fork and open the tracking task

Backlog.md's own contribution process **requires** a backlog task behind every
PR (enforced socially via the PR template, not CI), with acceptance criteria, a
plan, and a Testing section. We honor it.

```bash
# 1a. Fork on GitHub (web UI or gh), then clone the fork.
gh repo fork MrLesk/Backlog.md --clone --remote
#   → adds 'origin' = jeremy-newhouse/Backlog.md, 'upstream' = MrLesk/Backlog.md

cd Backlog.md
git checkout -b tasks/back-XXX-json-output   # rename once you have the real ID

# 1b. Pin a known-good toolchain. DEVELOPMENT.md pins Bun 1.2.23; CI runs 1.3.11.
#     Build with a Bun version compatible across both to avoid compile surprises.
bun --version
bun install

# 1c. Create the tracking task IN THE BACKLOG.MD REPO (it dogfoods itself).
backlog task create "Add --json output to read commands" \
  --ac "task list/view/search accept --json and print one {schemaVersion,kind,data} envelope" \
  --ac "json wins over auto-plain in non-TTY pipes" \
  --ac "shared serializer omits/normalizes lastModified and omits rawContent by default"
#   → capture the printed 'Created task back-XXX' ID; use it in the branch name,
#     commit titles ('BACK-XXX - …'), and the PR title.
```

There is **no CLA, no DCO, no conventional-commits requirement** — just lint +
tests green and a referenced task.

---

## 2. Add the shared serializer (`src/formatters/task-json.ts`)

Create **one** new module that both `task list`/`view`/`search` (and, later, the
MCP layer) feed through. It is a **curated subset**, not `JSON.stringify(task)`,
because the raw `Task` carries serialization hazards and internal leaks. Place it
beside the existing `src/formatters/task-plain-text.ts`.

Mandatory fixups (verified against `src/types/index.ts`):

| Hazard | Source field | Fixup in the serializer |
|---|---|---|
| `Date` breaks date-format consistency | `Task.lastModified?: Date` (types/index.ts:72) | **Omit by default**, or normalize to the `"YYYY-MM-DD"` string form used elsewhere. Never emit a bare ISO `T…Z` next to `"YYYY-MM-DD"` dates. |
| Internal-content leak / payload bloat | `rawContent` | **Omit by default**; opt-in behind `--json-raw` only if asked. It duplicates the parsed sections and can desync. |
| Field-name mismatch | the in-memory field is `task.assignee` (singular, `string[]`, types/index.ts:43) | Read `task.assignee`; emit it as `assignees` in the output shape. |
| AC/DoD source names | `acceptanceCriteriaItems` / `definitionOfDoneItems` (types/index.ts:60,62) | Map to output keys `acceptanceCriteria` / `definitionOfDone`; each item is `{index, text, checked}`. |
| Non-durable AC/DoD identity | `index` is **positional** and renumbers on add/remove (structured-sections.ts:962-968) | Keep the field but **document it as non-durable**. (The schema reference says the same; `lore` must not anchor to it.) |
| ID-vs-filename casing | display `TASK-123` vs file `task-123.md` | Expose **both** `id` and `filePath` — never let consumers reconstruct the filename. |
| `filePath` may be absent / absolute | `undefined` on freshly-created tasks; absolute on disk-loaded ones | Tolerate `filePath: undefined`; prefer also emitting a project-relative `filePathRelative`. |
| Enrichment parity | `parentTaskTitle` / `subtaskSummaries` only set on the `view` (`getTaskWithSubtasks`) path | Mark them **optional**; on the list path emit `null`/omit rather than running `attachSubtaskSummaries` per row. |

Two serializers are needed, not one:

- `serializeTask(task)` — the **full** view shape (`kind: "task"`).
- `serializeTaskSummary(task)` — the **list/search** subset (`id`, `title`,
  `status`, `priority`, `ordinal`, `assignees`, `labels`, `milestone`,
  `parentTaskId`, `filePath`). `task list` and `search` build summary strings
  **inline** (cli.ts:2167-2205 / 1912-1944) and do **not** call
  `formatTaskPlainText`, so a single full serializer will not cover them.

`search` additionally needs a small wrapper over **three** item shapes
(`task` | `document` | `decision`) with a `score`, dropping Fuse's `matches`
(typed `unknown`, an unstable internal). See the
[searchResult shape](../reference/backlog-json-schema.md) for the exact keys.

All three commands wrap their payload in the canonical envelope
`{ "schemaVersion": "1", "kind": …, "data": … }` — defined once and reused.

---

## 3. Wire `--json` into the CLI (json-before-plain)

Backlog.md uses **default-strict Commander** with **no global option** and never
calls `program.opts()` — so `--json` must be declared **per command**, kept in
sync with its branch, or it is a hard parse error on that command. Mirror the
existing `--plain` machinery exactly.

### 3a. Detection chokepoint (`src/cli.ts:425-429`)

Add a `--json` sibling to the existing `plainFlagInArgv` / `isPlainRequested`:

```ts
const jsonFlagInArgv = process.argv.includes("--json");
function isJsonRequested(options?: { json?: boolean }) {
  return Boolean(options?.json || jsonFlagInArgv);
}
function emitJson(data: unknown) {
  console.log(JSON.stringify(data));   // one object, stdout only
}
```

`--json` must also force **non-interactive + no color**, the same way the
`--plain` argv flag does, so TTY auto-detection never launches the blessed UI
instead of printing JSON.

### 3b. Per-command option + branch (verified injection points)

For each command: add `.option("--json", "output as JSON")` at the builder, and
put the JSON early-return **before** the `usePlainOutput = isPlainRequested(...)
|| shouldAutoPlain` block. **This ordering is the single most important
correctness detail** — placed after, a piped `--json` (non-TTY) would still emit
plain text because `shouldAutoPlain` is true.

| Command | `.option` site | JSON branch goes **before** | Envelope `kind` | Serializer |
|---|---|---|---|---|
| `task list` | cli.ts:2049 | branch at ~2109 (before the 2167-2205 summary loop) | `taskList` | `serializeTaskSummary[]` |
| `task view` | cli.ts:2751 | branch at ~2767 | `task` | `serializeTask` |
| `task <id>` (bare shortcut) | cli.ts:2903 | branch at ~2934 | `task` | `serializeTask` |
| `search` | cli.ts:1743 | branch at ~1807 (before `printSearchResults`) | `searchResult` | search wrapper |

Note the auto-plain interaction applies specifically to the auto-plain commands
(list / view / `task <id>` / search). The full set of `isPlainRequested(options)
|| shouldAutoPlain` sites to respect ordering at: cli.ts 1807, 2109, 2767, 2934.

### 3c. What you do **not** touch

- **Shell completions: zero edits.** Completion scripts are dynamic — they shell
  to `backlog completion __complete`, which reads Commander's live options via
  `getOptionFlags` (completions/helper.ts:150-170). A boolean flag needs no
  value-completion. This is a real win.
- **`--plain` paths: unchanged.** `--json` is purely additive; existing plain
  output and its tests must stay byte-identical.
- **`board` / `overview`: out of scope.** No plain path; `overview.ts:37` prints
  a perf line that would corrupt JSON. Net-new logic, not a mirror — excluded.
- **MCP `structuredContent`: deferred** to a follow-up PR (keeps the diff small
  and avoids `build.test.ts` / MCP-integration churn).

---

## 4. Tests (`src/test/cli-json-output.test.ts`)

Mirror the existing subprocess+substring style of `cli-plain-output.test.ts`
(no snapshots): spawn the CLI, capture stdout, `JSON.parse`, assert on fields.

Minimum coverage:

```bash
# Representative cases the test file must cover:
bun src/cli.ts task list --json     # → JSON.parse → kind === "taskList", data is array
bun src/cli.ts task view back-1 --json   # → kind === "task", status has NO icon
bun src/cli.ts search "foo" --json  # → kind === "searchResult", items typed
```

Assertions to make explicit:

- `JSON.parse(stdout)` succeeds and yields `{ schemaVersion, kind, data }`.
- `data.status` (or each row's) is the **raw** status — no icon glyph.
- `rawContent` is **absent** by default; no bare-ISO `lastModified` leaks in.
- **The non-TTY / pipe case (mandatory):** run `--json` with stdout **not** a
  TTY and assert the output is still parseable JSON — i.e. `--json` **beats**
  `shouldAutoPlain`. This is the regression guard for the §3b ordering bug.

Existing `--plain` tests must remain green (additive change). Run the full suite:

```bash
bun run lint   # Biome: tabs, double quotes, 120 width; husky auto-fixes on commit
bun test       # all green, including the new file
```

---

## 5. Docs inside the fork (help-schema + CLI-INSTRUCTIONS)

So the flag is discoverable and the maintainer's tooling stays consistent:

- Add `--json` to each touched command's `addHelpSchema` block (the
  `optional` / `output` / `examples` text near each command, e.g. cli.ts:2743+).
- Update `CLI-INSTRUCTIONS.md` to mention `--json` alongside `--plain` for the
  three read commands, including the one-envelope-per-command contract.

These are part of the diff, not afterthoughts — Backlog.md's PR culture expects
help text and instructions to track the flag.

---

## 6. Build the local binary (lore's interim git dependency)

`lore` itself ships via `bun build --compile`, and its adapter shells out to a
`backlog` binary — so consuming the fork as a **git dependency that lore compiles
locally** is near-zero marginal cost and the single source of truth during the
interim. (Rejected alternatives: a 6-target per-platform npm publish is too heavy
pre-merge; a vendored prebuilt binary goes stale and is platform-locked.)

```bash
# In the fork checkout, on the tasks/back-XXX-json-output branch:
bun run build          # or the repo's compile script; produces the CLI binary
bun build --compile ./src/cli.ts --outfile dist/backlog   # if compiling directly

# Smoke-test the patched flag and the json-beats-pipe behavior:
./dist/backlog --version
./dist/backlog task list --json | head -c 400        # must be one JSON object
./dist/backlog task view back-1 --json | grep -c '"status"'   # icon-free status
```

On the `lore` side, pin the fork branch and compile it during `lore` setup:

```jsonc
// lore package.json (interim)
"dependencies": {
  "backlog.md": "github:jeremy-newhouse/Backlog.md#tasks/back-XXX-json-output"
}
```

`lore`'s **capability probe** then gates the JSON path: it runs
`backlog --version` plus a dry `backlog task list --json`, asserts the version is
at-or-above its floor and that one parseable envelope comes back, and **fails
loud** otherwise. There is **no `--plain` text-parser fallback** in `lore` — that
is a deliberate rejection recorded in
[ADR-0002](../adr/0002-backlog-integration-json-only.md). The probe either finds
a `--json`-capable binary or stops; it never silently mis-parses. Probe and
min-version mechanics are specified in the
[Backlog.md CLI contract](../reference/backlog-cli-contract.md).

---

## 7. Open the minimal upstream PR

```bash
git push -u origin tasks/back-XXX-json-output
gh pr create \
  --repo MrLesk/Backlog.md \
  --base main \
  --title "BACK-XXX - Add --json output to read commands" \
  --body-file -   # fill the PR template: task link, AC, plan, Testing section
```

PR contents (and nothing more):

- The shared `src/formatters/task-json.ts` serializer(s) + the envelope wrapper.
- `--json` option + json-before-plain branch on `task list`, `task view`,
  `task <id>`, and `search`.
- `src/test/cli-json-output.test.ts` **including the non-TTY pipe case**.
- `addHelpSchema` + `CLI-INSTRUCTIONS.md` updates.
- The referenced backlog task (AC + plan + Testing) — the template requires it.

PR etiquette: open the **task first**, reference it in the PR, and explicitly
offer the **MCP `structuredContent` follow-up** as stated roadmap (same
serializer, separate diff) so reviewers see the small scope is deliberate.

---

## 8. Migrate to upstream on release (and bump the floor)

> **Correction (2026-07-17, LCLI-5).** Step 3 below assumed upstream would
> converge on *this* schema. That assumption is **falsified**: MrLesk's team
> shipped their own independent implementation —
> [PR #790](https://github.com/MrLesk/Backlog.md/pull/790), "BACK-545 - Add
> stable JSON output to read commands" — merged 2026-07-16, closing
> [issue #784](https://github.com/MrLesk/Backlog.md/issues/784) before our
> fork's prior-art reply even posted. It was not built from our or lenucksi's
> fork. The shipped contract differs from
> [backlog-json-schema.md](../reference/backlog-json-schema.md) in every
> dimension that matters for the adapter:
>
> | | This fork / `src/adapters/backlog.ts` | Upstream PR #790 (pre-tag contract) |
> |---|---|---|
> | Envelope | uniform `{schemaVersion: "1", kind, data}` for all three commands | per-command envelope: `{schemaVersion: 1, kind: "task-list", tasks: [...]}` / `{kind: "task-view", task: {...}}` / `{kind: "search", results: [...]}` |
> | `schemaVersion` type | string `"1"` | number `1` |
> | `kind` spelling | `taskList` / `task` / `searchResult` | `task-list` / `task-view` / `search` |
> | Payload key | always `data` | `tasks` / `task` / `results` per command |
> | Task fields | includes `source`, `branch`, `onStatusChange`, `filePath` (absolute) + `filePathRelative` | excludes branch/internal fields by design (`path`, project-relative only); adds `type`, `reporter` at summary level |
> | Search hit shape | `{type, score, item}` | `{type, data}` — **no `score`** (explicitly out of v1) |
> | `task view`/`<id>` not-found | fork: exit 0, empty stdout, stderr message (adapter treats this as the clean "missing" signal) | exit 1 unconditionally (any output mode), matching `task archive`'s convention — closes the exact gap our LCLI-5 prior-art reply flagged |
>
> Net effect: **`src/adapters/backlog.ts` as written would fail its own
> capability probe against upstream's real output** (wrong `kind` strings, no
> `data` key to read). Migrating to a real upstream release is an **adapter
> rewrite against the new contract**, not a version-floor bump.
> Full comparison and provenance: LCLI-5 implementation notes.
>
> **Update (2026-08-02, LCLI-253).** `v1.49.0` — published 2026-08-02 — is the
> first tagged `MrLesk/Backlog.md` release containing the PR #790 commit; §8.1
> step 4 below is now complete. See that section for what actually shipped.
>
> The steps below describe the *original* plan (this schema shipping
> verbatim upstream) and are kept for history; do not follow step 3 as
> written once a real release exists — re-derive the adapter from PR #790's
> `src/formatters/json-output.ts` and `CLI-INSTRUCTIONS.md` instead.

~~Once `--json` ships in a stock Backlog.md release:~~ Superseded by the plan
below — adopted **now**, ahead of a tagged release, per the correction above.

1. ~~Flip `lore`'s dependency from the fork git-dep to the published package
   (`"backlog.md": "^<first-version-with-json>"`).~~
2. ~~Bump the capability probe's minimum version to that release, so the floor
   now points at a stock binary rather than the fork branch.~~
3. ~~Keep the canonical schema reference
   ([backlog-json-schema.md](../reference/backlog-json-schema.md)) as the
   contract of record; the upstream output must match it (the patch was designed
   to produce exactly that shape).~~
4. ~~Until then, rebase the fork branch on upstream periodically.~~

### 8.1 The adoption plan (current)

`lore` adopts upstream's implementation **now**, ahead of a tagged release,
rather than waiting — same rationale as [ADR-0002's alternative
5](../adr/0002-backlog-integration-json-only.md#alternatives-considered)
(don't block the whole coupling feature on an external roadmap):

1. **Retire this fork as the plan of record.** `jeremy-newhouse/Backlog.md`
   (`tasks/back-510-json-output` @ `a80b7a1`) is no longer rebased or extended.
   It remains as a historical reference for what LCLI-2/4/21 originally shipped
   against.
2. **Build a `backlog` binary from upstream, not the fork, pinned to a commit
   at or past the PR #790 merge** (`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` on
   `MrLesk/Backlog.md#main`) — same manual clone/build/PATH convention as §6
   above, repointed at upstream's checkout instead of the fork's. **Deliberately
   no `package.json` dependency yet** (decided on LCLI-53): `lore` has not
   shipped, so this is dev/test-time-only wiring; a real dependency entry is
   deferred to step 4 below, once a tagged release exists to depend on normally.
3. **Rewrite `src/adapters/backlog.ts`'s envelope parsing, Zod schemas, and
   capability probe** against upstream's real contract, documented in
   [backlog-json-schema.md §8](../reference/backlog-json-schema.md#8-migration-history-complete)
   — different envelope shape, `schemaVersion` type, `kind` spelling, task
   fields, search hit shape, and not-found exit code than this fork emitted.
   This was a contract migration, not a floor bump. **Split across two tasks,
   both done:** the capability probe (`probeBacklog`, `EXPECTED_SCHEMA_VERSION`,
   `TASK_LIST_KIND`) — LCLI-53; the full read adapter (`EnvelopeSchema`,
   `parseEnvelope`, `listTasks`/`viewTask`/`searchTasks`, golden fixtures) —
   LCLI-54, which also merged the probe's formerly-separate
   `PROBE_SCHEMA_VERSION` constant back into the single `EXPECTED_SCHEMA_VERSION`
   now that both sides target the same contract.
4. **Done (2026-08-02, LCLI-253).** `v1.49.0` — published 2026-08-02 — is the
   first tagged `MrLesk/Backlog.md` release containing the PR #790 commit.
   `src/adapters/backlog.ts`'s `MIN_BACKLOG_VERSION` moved from the `1.47.1`
   fork floor to `1.49.0`, and `RUNBOOK_HINT` now points at installing the
   published package instead of building the pinned commit. `docker/e2e/Dockerfile`
   and `.github/actions/strict-check/action.yml` (the interim per-run pinned-commit
   build in each) were both retired in favor of `npm install -g backlog.md@<version>`.
   The dev-tooling equivalent of step 2 above — `test/support/record-backlog-goldens.ts`'s
   commit-pin guard — became a version-pin guard against the Dockerfile's now
   version-pinned `backlog` install.
   **Deliberately still no `package.json` dependency** — the *original* plan's
   assumption in step 4 (that a real dependency entry would be added once a tag
   existed) did not hold: `lore` invokes the PATH-resolved `backlog` binary the
   same way it did during the interim, and that remains the LCLI-53 decision,
   not something this release changed.

---

## Appendix — quick reference

**Files changed in the fork (lore-scope only):**

- `src/formatters/task-json.ts` — **new**, shared serializer(s) + envelope.
- `src/cli.ts` — `jsonFlagInArgv` / `isJsonRequested` / `emitJson` at 425-429;
  `.option("--json")` + json-before-plain branch on the four sites in §3b;
  `addHelpSchema` text.
- `src/test/cli-json-output.test.ts` — **new**, with the mandatory pipe case.
- `CLI-INSTRUCTIONS.md` — `--json` documentation.

**Effort (honest):** Phase A (this PR — serializer + `task list`/`view`/`<id>` +
`search`, tests incl. pipe case) is ~**4-5 h**. The deferred MCP
`structuredContent` follow-up is a further ~4-8 h marginal off the same
serializer.

**Related contracts:**

- Data shape: [Backlog.md `--json` schema](../reference/backlog-json-schema.md)
- Operational rules: [Backlog.md CLI contract](../reference/backlog-cli-contract.md)
- Decision: [ADR-0002 — Backlog.md integration, JSON-only](../adr/0002-backlog-integration-json-only.md)
- Where this sits in the plan: [lore design spec](../specs/lore-design.md)
- Agent setup after BJP: [agent onboarding runbook](agent-onboarding.md)

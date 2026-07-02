# Test fixtures (LORE-13)

Two committed fixture sets used by the golden-fixture suites.

## `okf-bundle/` — sample OKF bundle (AC#1)

A real, walkable OKF bundle exercised by `test/okf-fixture.test.ts`:

- One **clean** concept per known type in the built-in profile
  (`Epic`, `Story`, `Spec`, `ADR`, `Runbook`, `Reference`) — the coverage assertion fails if a
  type is added without a fixture.
- A `broken/` wing of deliberately malformed concepts, each tripping one representative finding of
  the real `lore validate` / `lore check` engines: missing `type`, a mistyped known field, a missing
  required section (validate **errors**); a missing `summary`, an unknown `type` (non-fatal
  **warnings**); a dangling internal link (check **error**); Obsidian-isms (check **portability
  warnings**).

These files live under `test/`, not the `docs/` bundle root, so `lore validate` / `lore check` on
the repo never scan them.

## `backlog-json/` — Backlog.md `--json` goldens (AC#2)

Real `{schemaVersion, kind, data}` envelopes captured from the forked, `--json`-capable Backlog.md
(`jeremy-newhouse/Backlog.md@tasks/back-510-json-output`) — one per kind (`task`, `taskList`,
`searchResult`). `test/backlog-json-golden.test.ts` locks them to the schema of record
([`docs/reference/backlog-json-schema.md`](../../docs/reference/backlog-json-schema.md)) and asserts
they stay in canonical form.

**Do not hand-edit.** Regenerate with the recorder (which needs the fork CLI, not a compiled
binary — `bun <fork>/src/cli.ts` works even on the external volume):

```sh
LORE_BACKLOG_FORK_CLI=~/repos/Backlog.md/src/cli.ts bun test/support/record-backlog-goldens.ts
```

The recorder redacts the host-specific absolute `filePath` to `{REPO}` and canonicalizes to 2-space
JSON, so regeneration against the same backlog state is byte-identical.

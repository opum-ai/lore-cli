# Test fixtures (LORE-13)

Committed fixture sets used by the golden-fixture suites.

## `snapshot/` — retained projection history

`v1.json` contains the canonical before/after retained facts shared by snapshot comparison,
provenance, CLI, and offline explorer conformance tests.

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

Real `{schemaVersion, kind, data}` envelopes captured from upstream, `--json`-capable Backlog.md
(`MrLesk/Backlog.md`, PR #790, published in the `backlog.md` version recorded in
`docker/e2e/Dockerfile`'s `BACKLOG_VERSION`) — one per kind (`task-view`, `task-list`, `search`).
`test/backlog-json-golden.test.ts` locks them to the schema of record
([`docs/reference/backlog-json-schema.md`](../../docs/reference/backlog-json-schema.md)) and asserts
they stay in canonical form.

**Do not hand-edit.** Regenerate with the recorder (needs a `backlog` binary on PATH at or past the
version pinned in `docker/e2e/Dockerfile`, e.g. `npm install -g backlog.md@1.49.1`):

```sh
bun test/support/record-backlog-goldens.ts
```

No redaction step is needed: unlike the retired fork's shape, upstream's envelope carries no
absolute, host-specific field — `task view`'s `path` is already project-relative. The recorder
canonicalizes to 2-space JSON, so regeneration against the same backlog state is byte-identical.

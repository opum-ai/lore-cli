# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `.lore/config.toml` loader (LORE-10): `src/config.ts` — `loadConfig({ root?, env? })`
  parses the committed config with **Bun-native TOML** (no added dependency) into a
  typed, validated `LoreConfig` (`reconcile`, `validate`, `confluence`). Zero-config
  (a missing file yields the documented defaults), deterministic via injectable
  `root`/`env` seams, and snake_case TOML keys map to camelCase fields. The Confluence
  token is read **only** from `$LORE_CONFLUENCE_TOKEN` and is never persisted; a token
  committed under `[confluence]` fails loud. Malformed TOML or an out-of-contract value
  throws a `validation` `LoreError` (exit `6`); unknown keys/sections are tolerated for
  forward-compatibility. lore's own `.lore/config.toml` is committed; `.lore/cache/`
  stays gitignored (ADR-0013).
- Shared error model (LORE-11): `src/errors.ts` — the `LoreError` taxonomy and
  centralized semantic exit-code mapping (`0` ok, `2` usage, `3` not-found,
  `4` denied, `5` conflict, `6` validation/drift; `1` reserved for uncaught
  bugs), the `--json` `{error_type,message,hint,input}` error envelope rendered
  on stderr, and a warnings-not-errors `WarningCollector` (advisory warnings go
  to stderr and never change the exit code by themselves). Mode/color are caller
  inputs — the module resolves no TTY/`NO_COLOR` and never writes stdout
  (cli-contract §4–§5 / ADR-0005). The CLI wires this in at M1. The error path is
  crash-safe: the `--json` envelope serializes through a `safeStringify` fallback
  that tolerates a circular, `BigInt`-bearing, or throwing-`toJSON`/getter
  `LoreError.input` (true cycles → `[Circular]`, `BigInt` → decimal string, shared
  acyclic refs preserved, an individual unserializable field → `[Unserializable]`)
  while `error_type`/`message`/`hint` always survive; the safe path honors a
  custom `toJSON` (a `Date` → its ISO string), so it agrees with the fast path
  and respects a `toJSON` written to hide fields. The uncaught branch guards
  message derivation against a hostile `toString`/`Symbol.toPrimitive` and
  surfaces a thrown non-Error object's detail (its `message`, else a JSON
  projection, with an empty `message` honored as-is rather than dumping the
  object's other fields) instead of `"[object Object]"`. The envelope coerces
  `message`/`hint` to single-line strings, omits an empty `hint`, and echoes only
  a non-null, non-array object `input` (cli-contract §5.2).
  `WarningCollector.flush` is documented as non-draining, and `EXIT_CODES` is
  frozen.
- CI (LORE-8): GitHub Actions workflow running `lint`, `typecheck`, and
  `bun test --isolate` across Ubuntu/macOS/Windows (Windows tuned with
  `--max-concurrency=4` for stability), plus a Linux compile smoke. The Bun
  version is sourced from `.bun-version` (single source of truth). A
  `.gitattributes` pins text files to LF so the lint gate is stable on Windows.
- Dev tooling (LORE-7): Biome for lint + format (honoring `.editorconfig`) and the
  `bun test` harness with coverage (`bunfig.toml`, text + lcov reporters). Scripts:
  `format`, `lint`, `lint:fix`, `test`, `test:coverage`. (Biome was chosen over the
  task's original ESLint+Prettier to satisfy the *thin* and *match Backlog.md* rules.)
- Bun + TypeScript toolchain scaffold (LORE-6): `package.json` (`@salient-data/lore`,
  bin `lore`), strict `tsconfig.json`, Bun pinned to `1.2.23` (`.bun-version` +
  `packageManager`/`engines`) with rationale and bump procedure in `DEVELOPMENT.md`,
  and a stub `lore` CLI (`src/cli.ts`).
- Project bootstrap: repository, MIT license, `.gitignore`/`.editorconfig`, community files.
- Product specification (`lore-spec.md`) and the OKF documentation bundle under `docs/`
  (architecture, tech stack, design, ADRs, runbooks, references).
- Build plan tracked as Backlog.md milestones and tasks.

[Unreleased]: https://github.com/jeremy-newhouse/lore/commits/dev

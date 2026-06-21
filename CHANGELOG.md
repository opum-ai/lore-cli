# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

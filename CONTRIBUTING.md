# Contributing to lore

Thanks for your interest in `lore` — a thin, OKF-native documentation tool that couples
repo-resident docs to [Backlog.md](https://github.com/MrLesk/Backlog.md) and serves them to
agents and humans through a CLI.

## Ground rules

- **lore is deliberately thin.** It does not reimplement Backlog.md or Confluence, and it
  stays zero-config and repo-is-source-of-truth. New features should preserve that.
- **The CLI is the primary interface** for both humans and agents. Every command must be
  non-interactive by default, support `--plain` and `--json`, exit non-zero on error, and be
  idempotent (a no-op run produces byte-identical output).
- **The `docs/` bundle is a valid [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
  bundle.** Keep it consumable, unmodified, by GitHub, Obsidian, MkDocs, and Docusaurus —
  see [`docs/reference/consumer-compatibility.md`](docs/reference/consumer-compatibility.md).

## Development setup

lore targets **[Bun](https://bun.sh)** (pinned version — see `package.json` / `.bun-version`).

```sh
bun install
bun test
bun run lint
bun run typecheck
bun run build      # bun build --compile
```

Tasks are tracked with Backlog.md. Run `backlog instructions overview` and browse the
`backlog/` directory (or `backlog board`) before starting.

## Branching & commits

- Branch from and open pull requests against **`dev`** (the default branch). `main` is the
  release branch.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `chore:`, `refactor:`, `test:` …).
- Keep PRs focused. Include tests and update the relevant `docs/` concept (and an ADR if you
  change an architectural decision).

## Before you open a PR

- [ ] `bun test`, `bun run lint`, and `bun run typecheck` pass.
- [ ] `lore check` passes on the `docs/` bundle (link/MDX lint + drift).
- [ ] New behavior is covered by tests and documented.
- [ ] Commits follow Conventional Commits and target `dev`.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).

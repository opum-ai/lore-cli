# Development

## Runtime requirement: Bun 1.2.23 (pinned)

lore pins **Bun `1.2.23`** as a single source of truth, declared on every surface
that selects a toolchain:

- [`.bun-version`](.bun-version) — read by `oven-sh/setup-bun` in CI and by `bun`
  itself.
- [`package.json`](package.json) — `packageManager: "bun@1.2.23"` and
  `engines.bun: ">=1.2.23"`.

CI asserts this value before any build (see M0 / LORE-8). The pin is enforced so
lore behaves identically across every developer, CI runner, and shipped artifact —
an unpinned runtime is an undeclared dependency (see
[ADR-0001](docs/adr/0001-runtime-build-distribution.md) and
[tech-stack §1](docs/reference/tech-stack.md)).

### Why `1.2.23` specifically

Our integration target, Backlog.md, ships an **internally inconsistent** Bun pin:
its CI pins `1.3.11`, while its Nix flake and `DEVELOPMENT.md` pin `1.2.23` —
the latter explicitly, to avoid a Bun 1.3.x websocket CPU regression
([oven-sh/bun#23536](https://github.com/oven-sh/bun/issues/23536)) that affects
`backlog browser`. ADR-0001 flags that split as drift "we must not propagate."

lore pins **`1.2.23`** because:

1. It is the value Backlog.md's maintainers *bless* as the runtime requirement
   (the flake + `DEVELOPMENT.md`, the surfaces that carry the reasoning), so it
   keeps lore aligned with the integration target rather than inheriting its CI
   drift.
2. The regression that forced that pin is in the websocket/browser path, which
   **lore never uses** — lore only shells out to the compiled `backlog` binary
   for task JSON. So there is no functional downside to matching upstream's
   conservative, known-good runtime.

### Bumping the pin

Per ADR-0001 the pin is a *floor + tested ceiling*, not a cage — contributors may
run a newer Bun locally. To move the blessed value:

1. Change it in **both** places in one commit: `.bun-version` and `package.json`
   (`packageManager` **and** `engines.bun`).
2. Run `bun install`, `bun run typecheck`, and `bun test`.
3. Update this note with the new value and the reason for the bump.

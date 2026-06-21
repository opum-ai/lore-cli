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

## Local environment: working copies on an external volume

If your clone lives on an **external/secondary volume** (e.g. macOS `/Volumes/...`),
two Bun operations break **silently** across the device boundary — they produce a
broken artifact instead of an error. CI runs on a single filesystem, so neither
reproduces there.

- **`bun install --linker=isolated`** fails locally with a cross-device
  `clonefile`/`EXDEV` error (the isolated linker clones from the global cache). Use a
  plain **`bun install`** on an external volume; CI uses `--linker=isolated` and passes.
- **`bun build --compile`** emits a **0-byte binary** (even when `--outfile` targets
  internal disk) — no error is surfaced, but the cause is the same external volume
  (very likely the same cross-device clone path). The empty file runs as a no-op:
  exit `0`, no output — so `./dist/lore --version` *looks* like a broken CLI but is
  purely the volume. The CI compile-smoke (LORE-8) asserts the binary's actual
  output, so a genuinely broken compile is caught there.

**Rule of thumb:** before chasing any "compiled binary prints nothing / misbehaves"
bug, recompile the *same source* on internal disk (copy `src/` + `package.json` to
`/tmp/...` and `bun build --compile` there). If it works on `/tmp` but not on the
external volume, it's the filesystem, not the code.

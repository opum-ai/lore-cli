# Development

## Runtime requirement: Bun 1.3.14 (pinned)

lore pins **Bun `1.3.14`** as a single source of truth, declared on every surface
that selects a toolchain:

- [`.bun-version`](.bun-version) — read by `oven-sh/setup-bun` in CI and by `bun`
  itself.
- [`package.json`](package.json) — `packageManager: "bun@1.3.14"` and
  `engines.bun: ">=1.3.14"`.

CI asserts this value before any build (see M0 / LCLI-8). The pin is enforced so
lore behaves identically across every developer, CI runner, and shipped artifact —
an unpinned runtime is an undeclared dependency (see
[ADR-0001](docs/adr/0001-runtime-build-distribution.md) and
[tech-stack §1](docs/reference/tech-stack.md)).

### Why `1.3.14` specifically

lore pins **`1.3.14`** because Windows ARM64 support requires both a native Bun
runtime and the `bun-windows-arm64` compile target. Bun `1.2.23` published no
Windows ARM64 runtime; the platform assets begin in the 1.3 line. `1.3.14` is
the exact release used to cross-compile and qualify the new target. Lore does
not use Backlog.md's browser/websocket path, so the older upstream pin made for
that path does not constrain Lore's CLI runtime.

### Bumping the pin

Per ADR-0001 the pin is a *floor + tested ceiling*, not a cage — contributors may
run a newer Bun locally. To move the blessed value:

1. Update `.bun-version`, `package.json` (`packageManager`, `engines.bun`, and
   `@types/bun`), the digest-pinned Docker E2E base, and any qualification
   constants or strict-action pins found by searching for the old version.
2. Run `bun install`, `bun run typecheck`, and `bun test`, then execute the
   matching-host release qualification matrix.
3. Update this note with the new value and the reason for the bump.

## Native-addon packaging and install boundary

Release builds apply the committed `@ladybugdb/core@0.19.0` patch under
`patches/`. Its literal `require("./lbugjs.node")` is load-bearing: Bun embeds
the matching addon into macOS/Linux standalone executables instead of retaining
the build checkout's absolute `node_modules` path. Do not replace it with a
computed `process.dlopen` path. Windows builds pass
`--external=@ladybugdb/core` because Windows selects the reference backend
before that unreachable module can load.

The packages under `dependencies` would be installed for every global npm
consumer and may trigger npm's lifecycle-script approval policy. Lore's source
libraries therefore remain in `devDependencies`; the published launcher's only
runtime edges are its script-free platform `optionalDependencies`. The
matching-host package qualifier enforces that boundary with a real isolated
global npm install.

## Local environment: working copies on an external volume

If your clone lives on an **external/secondary volume** (e.g. macOS `/Volumes/...`),
two Bun operations break **silently** across a filesystem/device boundary — they
produce a broken artifact instead of an error. CI runs on a single filesystem, so
neither reproduces there.

- **`bun install --linker=isolated`** fails locally with a cross-device
  `clonefile`/`EXDEV` error (the isolated linker clones from the global cache). Use a
  plain **`bun install`** on an external volume; CI uses `--linker=isolated` and passes.
- **`bun build --compile`** emits a **0-byte binary at exit `0`, no error on either
  stream**, whenever `--outfile` lands on a **different mounted filesystem** than the
  source checkout — the same underlying `EXDEV` cross-device rename, silently
  swallowed. This is **not specific to the external volume as such**: confirmed
  (LCLI-14) by compiling this exact checkout with `--outfile` on the *same* volume
  as the checkout (works, correct multi-MB binary every time) versus a *different*
  mounted volume (0-byte, every time) — the checkout being on `/Volumes/...` only
  matters because it's *a* filesystem boundary, and crossing it in *either* direction
  triggers the same failure. The empty file runs as a no-op — `./dist/lore --version`
  *looks* like a broken CLI but is purely the cross-device write. The CI compile-smoke
  (LCLI-8) asserts the binary's actual output, so a genuinely broken compile is
  caught there. Full repro + the native-module angle:
  [tech-stack §1](docs/reference/tech-stack.md).

**Rule of thumb:** always give `--outfile` a path on the **same filesystem as the
checkout** (a subdirectory of the repo is simplest) — never a separately-mounted
volume or a `/tmp` that resolves to a different device. Before chasing any "compiled
binary prints nothing / misbehaves" bug, recompile with `--outfile` inside the repo
and assert the binary is both non-empty **and** runs (`--version` prints something),
not just that the compile command exited `0`.

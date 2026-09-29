# Development

## Runtime requirement: Bun 1.4.2 (pinned)

lore pins **Bun `1.4.2`** as a single source of truth, declared on every surface
that selects a toolchain:

- [`.bun-version`](.bun-version) — read by `oven-sh/setup-bun` in CI and by `bun`
  itself.
- [`package.json`](package.json) — `packageManager: "bun@1.4.2"` and
  `engines.bun: ">=1.4.2"`.

CI asserts this value before any build (see M0 / LCLI-8). The pin is enforced so
lore behaves identically across every developer, CI runner, and shipped artifact —
an unpinned runtime is an undeclared dependency (see
[ADR-0001](docs/adr/0001-runtime-build-distribution.md) and
[tech-stack §1](docs/reference/tech-stack.md)).

### Why `1.4.2` specifically

lore pins **`1.4.2`** to stay on the same runtime as `quest-cli`, which moved
for a parser correction (LCLI-648, 2026-09-29; OPAG-734, quest-cli QCLI-411).
On `1.3.14` a TS contextual keyword — `declare`, `type`, `abstract`, `namespace`,
`module`, `global`, `interface` — starting a larger expression desynchronises the
parser's scope tracking and can **panic the runtime** (oven-sh/bun#31239, fixed
in the 1.4 line):

```sh
# 1.3.14: exits 133 with a panic; 1.4.2: exits 0
bun -e 'new Bun.Transpiler({ loader: "ts" })
  .transformSync("declare = (...t) => R;e((a) => {(u=> uge);\r\n})")'
```

`test/bun-declare-binding.test.ts` pins that on the pinned runtime, so the floor
carries its own reason. Lore has no such binding in its source — this is runtime
alignment and currency, not a repaired defect here.

The previous pin, `1.3.14`, was chosen for Windows ARM64: that target needs both
a native Bun runtime and the `bun-windows-arm64` compile target, Bun `1.2.23`
published no Windows ARM64 runtime, and the platform assets begin in the 1.3
line. That requirement is unchanged by this bump, and `1.3.14` remains the
release the first Windows ARM64 cross-compile was qualified on.

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

#!/usr/bin/env bun
/**
 * lore — thin, OKF-native documentation CLI.
 *
 * This is the M0 scaffolding stub: it proves the pinned Bun toolchain runs the
 * package end to end (`bunx .`). The real Commander entrypoint, the deterministic
 * `core/` library, and the full command surface (init, new, validate, sync,
 * check, …) arrive in M1. See lore-spec.md and docs/index.md.
 */
import { VERSION } from "./meta";

const USAGE = `lore ${VERSION} — OKF-native documentation CLI

This is an M0 scaffolding stub. The full command surface lands in M1 on top of
the deterministic core/ library.

Usage:
  lore [--version] [--help]

Docs: lore-spec.md, docs/index.md`;

function run(argv: readonly string[]): number {
  const args = argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  // --help, no args, or anything else: the stub is tolerant and prints usage.
  process.stdout.write(`${USAGE}\n`);
  return 0;
}

process.exit(run(process.argv));

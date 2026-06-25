import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunContext, run } from "../src/cli";
import { EXIT_CODES } from "../src/errors";
import { VERSION } from "../src/meta";
import { capture } from "./helpers";

/** Build an argv (`["bun", "lore", ...args]`) the way `run` slices it. */
function argv(...args: string[]): string[] {
  return ["bun", "lore", ...args];
}

/** A {@link RunContext} wired to capturing streams, non-TTY, empty env. */
function ctx(over: Partial<RunContext> = {}): RunContext & {
  stdout: ReturnType<typeof capture>;
  stderr: ReturnType<typeof capture>;
} {
  // Captures come last so they always win over `over` and the return type's
  // `stdout`/`stderr` are exactly the capturing sinks (callers only override cwd/flags).
  return { env: {}, isTTY: false, ...over, stdout: capture(), stderr: capture() };
}

describe("cli — version and help short-circuits", () => {
  test("--version prints the version and exits 0", () => {
    const c = ctx();
    expect(run(argv("--version"), c)).toBe(0);
    expect(c.stdout.text()).toBe(`${VERSION}\n`);
  });

  test("--version --json emits a parseable version envelope", () => {
    const c = ctx();
    expect(run(argv("--version", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { version: string } };
    expect(envelope.kind).toBe("version");
    expect(envelope.data.version).toBe(VERSION);
  });

  test("no command prints usage and exits 0", () => {
    const c = ctx();
    expect(run(argv(), c)).toBe(0);
    expect(c.stdout.text()).toContain("Usage:");
  });

  test("--help prints usage and exits 0", () => {
    const c = ctx();
    expect(run(argv("--help"), c)).toBe(0);
    expect(c.stdout.text()).toContain("init");
  });
});

describe("cli — usage errors (exit 2)", () => {
  test("an unknown command is a usage error", () => {
    const c = ctx();
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
  });

  test("an unknown option on a real command is a usage error", () => {
    // rejectUnknownFlags throws before runInit, so no scaffold touches the filesystem.
    const c = ctx();
    expect(run(argv("init", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("an unknown global flag is rejected even with no command (not swallowed)", () => {
    const c = ctx();
    expect(run(argv("--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("an unknown flag alongside --version is rejected, not swallowed", () => {
    const c = ctx();
    expect(run(argv("--version", "--bogus"), c)).toBe(EXIT_CODES.usage);
  });

  test("an extra positional on init is a usage error", () => {
    const c = ctx();
    expect(run(argv("init", "extra"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("takes no arguments");
  });

  test("a usage error in --json mode is a one-line error envelope on stderr", () => {
    const c = ctx();
    expect(run(argv("frobnicate", "--json"), c)).toBe(EXIT_CODES.usage);
    const envelope = JSON.parse(c.stderr.text()) as { error_type: string };
    expect(envelope.error_type).toBe("usage");
    expect(c.stdout.text()).toBe(""); // stdout stays silent on error
  });
});

describe("cli — init dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-init-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("`lore init --json` scaffolds the bundle and emits the init envelope", () => {
    const c = ctx({ cwd });
    expect(run(argv("init", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { created: string[] } };
    expect(envelope.kind).toBe("init");
    expect(envelope.data.created).toContain("docs/index.md");
    expect(existsSync(join(cwd, ".lore/schemas/reference.schema.json"))).toBe(true);
  });

  test("`lore init --` honors the POSIX end-of-options terminator and still scaffolds", () => {
    const c = ctx({ cwd });
    expect(run(argv("init", "--"), c)).toBe(0);
    expect(existsSync(join(cwd, "docs/index.md"))).toBe(true);
  });
});

describe("cli — option terminator and bare dash", () => {
  test("`--` ends options: a following flag-looking token is a positional, not parsed as a flag", () => {
    const c = ctx();
    // After `--`, `--version` is a positional (the command), so it is an unknown
    // command — not the version short-circuit.
    expect(run(argv("--", "--version"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
    expect(c.stdout.text()).toBe(""); // not the version line
  });

  test("a bare `-` is treated as a positional (unknown command), not an unknown option", () => {
    const c = ctx();
    expect(run(argv("-"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
  });
});

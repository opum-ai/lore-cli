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
  return { stdout: capture(), stderr: capture(), env: {}, isTTY: false, ...over };
}

describe("cli — version and help short-circuits", () => {
  test("--version prints the version and exits 0", () => {
    const c = ctx();
    expect(run(argv("--version"), c)).toBe(0);
    expect(c.stdout.text()).toBe(`${VERSION}\n`);
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
    const c = ctx({ cwd: mkdtempSync(join(tmpdir(), "lore-cli-")) });
    expect(run(argv("init", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
    rmSync(c.cwd as string, { recursive: true, force: true });
  });

  test("an extra positional on init is a usage error", () => {
    const c = ctx({ cwd: mkdtempSync(join(tmpdir(), "lore-cli-")) });
    expect(run(argv("init", "extra"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("takes no arguments");
    rmSync(c.cwd as string, { recursive: true, force: true });
  });

  test("a usage error in --json mode is a one-line error envelope on stderr", () => {
    const c = ctx({ json: undefined });
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
});

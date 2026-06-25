import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  test("an unknown flag AFTER the command is not swallowed by --version", () => {
    // Regression guard: a post-command typo'd flag must still be rejected, not slip through
    // the --version short-circuit to a silent exit 0.
    const c = ctx();
    expect(run(argv("init", "--bogus", "--version"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
    expect(c.stdout.text()).toBe("");
  });

  test("an unknown flag after the command is not swallowed by --help either", () => {
    const c = ctx();
    expect(run(argv("init", "--bogus", "--help"), c)).toBe(EXIT_CODES.usage);
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

describe("cli — new dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-new-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test('`lore new <type> "<title>"` scaffolds and emits the new envelope', () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr", "Use soft deletes", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { path: string } };
    expect(envelope.kind).toBe("new");
    expect(envelope.data.path).toBe("docs/adr/use-soft-deletes.md");
    expect(existsSync(join(cwd, "docs/adr/use-soft-deletes.md"))).toBe(true);
  });

  test("the router passes command flags (`--var`, `--summary`) through to the command", () => {
    // The global parser collects `--var owner=payments` as command args and `new` parses
    // it — a value-taking command flag the global parser does not itself understand.
    const c = ctx({ cwd });
    const tmplDir = join(cwd, ".lore/templates");
    mkdirSync(tmplDir, { recursive: true });
    writeFileSync(join(tmplDir, "reference.md"), "\n# {{title}}\n\nOwner: {{owner}}\n");
    expect(run(argv("new", "reference", "Orders", "--var", "owner=payments", "--json"), c)).toBe(0);
    expect(readFileSync(join(cwd, "docs/reference/orders.md"), "utf8")).toContain("Owner: payments");
  });

  test("an unknown flag on `new` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr", "Title", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("a missing title on `new` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr"), c)).toBe(EXIT_CODES.usage);
  });

  test("the `--` terminator is forwarded so a dash-leading title is accepted", () => {
    const c = ctx({ cwd });
    // `--json` must precede `--`; anything after the terminator is a positional (the title).
    expect(run(argv("new", "adr", "--json", "--", "-5 minute timeout"), c)).toBe(0);
    expect(existsSync(join(cwd, "docs/adr/5-minute-timeout.md"))).toBe(true);
  });
});

describe("cli — validate dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-validate-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("`lore validate` emits the validate.report envelope and exits 0 on a clean bundle", () => {
    const c = ctx({ cwd });
    expect(run(argv("init"), c)).toBe(0);
    const v = ctx({ cwd });
    expect(run(argv("validate", "--json"), v)).toBe(0);
    const envelope = JSON.parse(v.stdout.text()) as { kind: string; data: { errorCount: number } };
    expect(envelope.kind).toBe("validate.report");
    expect(envelope.data.errorCount).toBe(0);
  });

  test("`lore validate` returns exit 6 (not a thrown error) when a file has an error", () => {
    const c = ctx({ cwd });
    mkdirSync(join(cwd, "docs/adr"), { recursive: true });
    writeFileSync(join(cwd, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    // The report (payload) still lands on stdout; the exit code is the gate signal.
    expect(run(argv("validate", "--json"), c)).toBe(EXIT_CODES.validation);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { errorCount: number } };
    expect(envelope.kind).toBe("validate.report");
    expect(envelope.data.errorCount).toBeGreaterThan(0);
  });

  test("the router forwards `validate`'s paths and flags to the command", () => {
    const c = ctx({ cwd });
    expect(run(argv("init"), c)).toBe(0);
    const v = ctx({ cwd });
    // `--type` is a value-taking command flag the global parser forwards verbatim.
    expect(run(argv("validate", "--type", "ADR", "--json"), v)).toBe(0);
    const envelope = JSON.parse(v.stdout.text()) as { kind: string; data: { files: { type?: string }[] } };
    expect(envelope.data.files.every((f) => f.type === "ADR")).toBe(true);
  });

  test("an unknown flag on `validate` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("validate", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("`lore --help` lists the validate command", () => {
    const c = ctx();
    expect(run(argv("--help"), c)).toBe(0);
    expect(c.stdout.text()).toContain("validate");
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

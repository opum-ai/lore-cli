import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type InitResult, runInit } from "../src/commands/init";
import { parseConcept } from "../src/core/concept";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-init-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run `init` in JSON mode and return the parsed `data` payload plus the exit code. */
function init(extra: { clock?: () => Date } = {}): { code: number; result: InitResult } {
  const stdout = capture();
  const code = runInit({ root, output: JSON_CTX, stdout, clock: extra.clock ?? FIXED_CLOCK });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: InitResult };
  expect(envelope.kind).toBe("init");
  return { code, result: envelope.data };
}

describe("lore init — fresh bundle (AC#1)", () => {
  test("creates the full scaffold and exits 0", () => {
    const { code, result } = init();
    expect(code).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.created).toEqual([
      ".lore/config.toml",
      ".lore/.gitignore",
      ".lore/schemas/epic.schema.json",
      ".lore/schemas/story.schema.json",
      ".lore/schemas/spec.schema.json",
      ".lore/schemas/adr.schema.json",
      ".lore/schemas/runbook.schema.json",
      ".lore/schemas/reference.schema.json",
      ".lore/templates/.gitkeep",
      "docs/index.md",
    ]);
    for (const path of result.created) {
      expect(existsSync(join(root, path))).toBe(true);
    }
  });

  test("produces a conformant bundle: index.md parses and is the sole okf_version carrier", () => {
    init();
    const indexRaw = readFileSync(join(root, "docs/index.md"), "utf8");
    const concept = parseConcept("docs/index.md", indexRaw);
    expect(concept.type).toBe("Reference");
    expect(concept.frontmatter.okf_version).toBe("0.1");
    // No other emitted doc carries okf_version (reserved-root discipline).
    for (const path of [".lore/schemas/reference.schema.json", ".lore/config.toml"]) {
      expect(readFileSync(join(root, path), "utf8")).not.toContain("okf_version");
    }
  });

  test("stamps the index timestamp from the injected clock", () => {
    init({ clock: () => new Date("2026-01-02T03:04:05Z") });
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toContain("timestamp: 2026-01-02T03:04:05.000Z");
  });

  test("creates the gitignored cache directory", () => {
    init();
    expect(existsSync(join(root, ".lore/cache"))).toBe(true);
  });
});

describe("lore init — idempotent re-run (AC#2)", () => {
  test("a second run creates nothing, skips everything, and exits 0", () => {
    init();
    const before = readFileSync(join(root, "docs/index.md"), "utf8");

    // Re-run with a *different* clock: a write-if-absent re-run must not restamp.
    const { code, result } = init({ clock: () => new Date("2030-12-31T23:59:59Z") });
    expect(code).toBe(0);
    expect(result.created).toEqual([]);
    expect(result.skipped.length).toBe(10);
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(before);
  });

  test("never clobbers a user's existing index.md", () => {
    mkdirSync(join(root, "docs"), { recursive: true });
    const custom = '---\ntype: Reference\ntitle: Mine\nokf_version: "0.1"\n---\n\n# Mine\n';
    writeFileSync(join(root, "docs/index.md"), custom);

    const { result } = init();
    expect(result.skipped).toContain("docs/index.md");
    expect(result.created).not.toContain("docs/index.md");
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(custom);
  });

  test("fills in only the missing pieces after a partial delete", () => {
    init();
    rmSync(join(root, ".lore/schemas/adr.schema.json"));

    const { code, result } = init();
    expect(code).toBe(0);
    expect(result.created).toEqual([".lore/schemas/adr.schema.json"]);
    expect(result.skipped).toContain("docs/index.md");
    expect(existsSync(join(root, ".lore/schemas/adr.schema.json"))).toBe(true);
  });
});

describe("lore init — output rendering", () => {
  test("plain mode lists created paths, one per line", () => {
    const stdout = capture();
    runInit({ root, output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    const lines = stdout.lines();
    expect(lines).toContain("created docs/index.md");
    expect(lines).toContain("created .lore/schemas/adr.schema.json");
  });

  test("plain mode marks already-present paths as exists on re-run", () => {
    runInit({ root, output: { mode: "plain", color: false }, stdout: capture(), clock: FIXED_CLOCK });
    const stdout = capture();
    runInit({ root, output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    expect(stdout.lines()).toContain("exists docs/index.md");
  });

  test("pretty mode summarizes the run and, on re-run, says nothing to create", () => {
    const first = capture();
    runInit({ root, output: { mode: "pretty", color: false }, stdout: first, clock: FIXED_CLOCK });
    expect(first.text()).toContain("Initialized lore bundle at");
    expect(first.text()).toContain("+ docs/index.md");

    const second = capture();
    runInit({ root, output: { mode: "pretty", color: false }, stdout: second, clock: FIXED_CLOCK });
    expect(second.text()).toContain("already initialized");
  });

  test("pretty mode emits ANSI only when color is enabled", () => {
    const colored = capture();
    runInit({ root, output: { mode: "pretty", color: true }, stdout: colored, clock: FIXED_CLOCK });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting an ANSI escape is present.
    expect(colored.text()).toMatch(/\x1b\[/);
  });
});

describe("lore init — filesystem failures", () => {
  test("surfaces a non-permission IO error instead of silently swallowing it", () => {
    // A regular file sitting where the `.lore` directory must go makes `mkdir -p`
    // fail with EEXIST — not a permission error, so it propagates (exit 1 territory)
    // rather than being mistaken for a created/skipped entry.
    writeFileSync(join(root, ".lore"), "not a directory");
    expect(() => runInit({ root, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK })).toThrow();
  });
});

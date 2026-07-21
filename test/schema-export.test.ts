import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/commands/init";
import { runSchema, type SchemaExportResult } from "../src/commands/schema";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-schema-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run `schema export` in JSON mode and return the parsed `data` payload plus the exit code. */
function exportSchemas(args: string[]): { code: number; result: SchemaExportResult } {
  const stdout = capture();
  const code = runSchema({ root, output: JSON_CTX, stdout, args });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: SchemaExportResult };
  expect(envelope.kind).toBe("schema.result");
  return { code, result: envelope.data };
}

/** Assert `fn` throws a `usage` {@link LoreError}, returning it for further assertions. */
function expectUsage(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("usage");
    return err as LoreError;
  }
  throw new Error("expected runSchema to throw a usage LoreError, but it returned");
}

/** A minimal, valid custom `.lore/profile.toml` declaring a `Glossary` type (for the AC#2 path). */
const CUSTOM_PROFILE = `[profile]
name = "custom"
okf_version = "0.1"

[base.fields]
type = { required = true }
title = {}
summary = {}

[[types]]
name = "Glossary"
sections = []
fields = { term = { required = true } }
`;

describe("lore schema export — default (story-convention) profile", () => {
  test("exports one Draft-7 schema per type to .lore/schemas/ and exits 0", () => {
    const { code, result } = exportSchemas(["export"]);
    expect(code).toBe(0);
    expect(result.out).toBe(".lore/schemas");
    expect(result.count).toBe(6);
    expect(result.files.map((f) => f.path)).toEqual([
      ".lore/schemas/epic.schema.json",
      ".lore/schemas/story.schema.json",
      ".lore/schemas/spec.schema.json",
      ".lore/schemas/adr.schema.json",
      ".lore/schemas/runbook.schema.json",
      ".lore/schemas/reference.schema.json",
    ]);
    for (const file of result.files) {
      expect(existsSync(join(root, file.path))).toBe(true);
    }
  });

  test("each emitted file is a valid Draft-7 schema that drives `type` autocomplete (AC#1)", () => {
    exportSchemas(["export"]);
    const raw = readFileSync(join(root, ".lore/schemas/story.schema.json"), "utf8");
    const schema = JSON.parse(raw) as Record<string, unknown>;
    expect(String(schema.$schema)).toContain("draft-07");
    expect((schema.properties as Record<string, unknown>).type).toBeDefined();
    expect(schema.required).toEqual(["type"]);
  });

  test("the byte contract is two-space pretty JSON with a single trailing newline", () => {
    exportSchemas(["export"]);
    const raw = readFileSync(join(root, ".lore/schemas/reference.schema.json"), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
    // Round-trips to itself under the committed formatting.
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });

  test("exported bytes are identical to what `lore init` scaffolds (shared emitter)", () => {
    exportSchemas(["export"]);
    const exported = readFileSync(join(root, ".lore/schemas/adr.schema.json"), "utf8");

    const initRoot = mkdtempSync(join(tmpdir(), "lore-schema-init-"));
    try {
      runInit({ root: initRoot, output: JSON_CTX, stdout: capture(), clock: () => new Date("2026-06-28T00:00:00Z") });
      const scaffolded = readFileSync(join(initRoot, ".lore/schemas/adr.schema.json"), "utf8");
      expect(exported).toBe(scaffolded);
    } finally {
      rmSync(initRoot, { recursive: true, force: true });
    }
  });

  test("re-exporting overwrites a stale schema file (regenerates after a profile change)", () => {
    const path = join(root, ".lore/schemas/spec.schema.json");
    exportSchemas(["export"]);
    writeFileSync(path, "STALE");
    exportSchemas(["export"]);
    expect(readFileSync(path, "utf8")).not.toBe("STALE");
    expect(JSON.parse(readFileSync(path, "utf8"))).toBeDefined();
  });
});

describe("lore schema export — --type", () => {
  test("exports exactly the named type", () => {
    const { result } = exportSchemas(["export", "--type", "Story"]);
    expect(result.count).toBe(1);
    expect(result.files.map((f) => f.path)).toEqual([".lore/schemas/story.schema.json"]);
    expect(existsSync(join(root, ".lore/schemas/epic.schema.json"))).toBe(false);
  });

  test("resolves the type case-insensitively", () => {
    const { result } = exportSchemas(["export", "--type", "story"]);
    expect(result.files.map((f) => f.path)).toEqual([".lore/schemas/story.schema.json"]);
  });

  test("an unknown --type is a usage error listing the available types, and writes nothing", () => {
    const err = expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--type", "Bogus"] }),
    );
    expect(err.message).toContain("Bogus");
    expect(err.hint).toContain("Story");
    expect(existsSync(join(root, ".lore/schemas"))).toBe(false);
  });
});

describe("lore schema export — --out", () => {
  test("writes to a custom relative directory (space form)", () => {
    const { result } = exportSchemas(["export", "--out", "schemas-out"]);
    expect(result.out).toBe("schemas-out");
    expect(result.files[0]?.path).toBe("schemas-out/epic.schema.json");
    expect(existsSync(join(root, "schemas-out/epic.schema.json"))).toBe(true);
  });

  test("accepts the --out=value inline form", () => {
    const { result } = exportSchemas(["export", "--out=nested/dir"]);
    expect(result.files[0]?.path).toBe("nested/dir/epic.schema.json");
    expect(existsSync(join(root, "nested/dir/reference.schema.json"))).toBe(true);
  });

  test("a trailing `--` end-of-options marker is a no-op", () => {
    const { code, result } = exportSchemas(["export", "--"]);
    expect(code).toBe(0);
    expect(result.count).toBe(6);
  });
});

describe("lore schema export — custom profile (AC#2)", () => {
  beforeEach(() => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore/profile.toml"), CUSTOM_PROFILE);
  });

  test("exports the project's custom types too", () => {
    const { result } = exportSchemas(["export"]);
    expect(result.files.map((f) => f.path)).toEqual([".lore/schemas/glossary.schema.json"]);
    const schema = JSON.parse(readFileSync(join(root, ".lore/schemas/glossary.schema.json"), "utf8")) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.term).toBeDefined();
  });

  test("--type selects a custom type", () => {
    const { result } = exportSchemas(["export", "--type", "Glossary"]);
    expect(result.count).toBe(1);
  });
});

describe("lore schema export — pruning stale schemas (full export)", () => {
  test("a full export removes an orphaned <slug>.schema.json no profile type owns", () => {
    exportSchemas(["export"]);
    const ghost = join(root, ".lore/schemas/ghost.schema.json");
    writeFileSync(ghost, "{}\n");
    const { result } = exportSchemas(["export"]);
    expect(result.removed.map((f) => f.path)).toEqual([".lore/schemas/ghost.schema.json"]);
    expect(existsSync(ghost)).toBe(false);
    // The real schemas survive.
    expect(existsSync(join(root, ".lore/schemas/story.schema.json"))).toBe(true);
  });

  test("a full export leaves non-schema files in the directory untouched", () => {
    exportSchemas(["export"]);
    const note = join(root, ".lore/schemas/README.md");
    writeFileSync(note, "keep me");
    const { result } = exportSchemas(["export"]);
    expect(result.removed).toEqual([]);
    expect(existsSync(note)).toBe(true);
  });

  test("a single --type export never prunes its siblings", () => {
    exportSchemas(["export"]);
    const { result } = exportSchemas(["export", "--type", "Story"]);
    expect(result.removed).toEqual([]);
    expect(existsSync(join(root, ".lore/schemas/epic.schema.json"))).toBe(true);
  });

  test("a full export to a non-default --out never prunes a pre-existing unrelated schema file (AC#1/AC#2)", () => {
    const unrelated = join(root, "schemas-out/unrelated.schema.json");
    mkdirSync(join(root, "schemas-out"), { recursive: true });
    writeFileSync(unrelated, "{}\n");
    const { result } = exportSchemas(["export", "--out", "schemas-out"]);
    expect(result.removed).toEqual([]);
    expect(existsSync(unrelated)).toBe(true);
  });

  test("a full export to --out . (the repo root) never prunes a pre-existing unrelated schema file", () => {
    const unrelated = join(root, "root.schema.json");
    writeFileSync(unrelated, "{}\n");
    const { result } = exportSchemas(["export", "--out", "."]);
    expect(result.removed).toEqual([]);
    expect(existsSync(unrelated)).toBe(true);
  });

  test.each([
    [".lore/schemas-extra"],
    [".lore/schema"],
    [".lore/schemas/sub"],
  ])("a full export to %s — a lexical near-miss of the managed directory — never prunes a pre-existing unrelated schema file (AC#1)", (out) => {
    const unrelated = join(root, out, "unrelated.schema.json");
    mkdirSync(join(root, out), { recursive: true });
    writeFileSync(unrelated, "{}\n");
    const { result } = exportSchemas(["export", "--out", out]);
    expect(result.removed).toEqual([]);
    expect(existsSync(unrelated)).toBe(true);
  });

  // POSIX-only, matching this codebase's existing symlink tests' own skip guard (e.g. init.test.ts).
  // LORE-93 supersedes the narrower LORE-94 behavior these two tests originally pinned ("skip
  // pruning but still write through the symlink"): ensureDir itself now refuses to write into ANY
  // symlinked ancestor at all, so a symlinked .lore/schemas now refuses the whole export outright
  // — never pruning AND never writing through it — rather than silently proceeding partway.
  test.skipIf(process.platform === "win32")(
    "a full export refuses when the default directory is a symlinked .lore/schemas, never pruning or writing through it (LORE-93)",
    () => {
      const outside = mkdtempSync(join(tmpdir(), "lore-schema-outside-"));
      try {
        const unrelated = join(outside, "unrelated.schema.json");
        writeFileSync(unrelated, "{}\n");
        mkdirSync(join(root, ".lore"), { recursive: true });
        symlinkSync(outside, join(root, ".lore/schemas"));
        let thrown: unknown;
        try {
          runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export"] });
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(LoreError);
        expect((thrown as LoreError).type).toBe("conflict");
        expect(existsSync(unrelated)).toBe(true); // the symlink and its target are untouched
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "a full export refuses when .lore itself is a symlink, never pruning or writing through the nested schemas dir (LORE-93)",
    () => {
      const outside = mkdtempSync(join(tmpdir(), "lore-schema-outside-"));
      try {
        symlinkSync(outside, join(root, ".lore"));
        mkdirSync(join(outside, "schemas"), { recursive: true });
        const unrelated = join(outside, "schemas", "unrelated.schema.json");
        writeFileSync(unrelated, "{}\n");
        let thrown: unknown;
        try {
          runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export"] });
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(LoreError);
        expect((thrown as LoreError).type).toBe("conflict");
        expect(existsSync(unrelated)).toBe(true);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );
});

describe("lore schema export — slug-collision guard (load-time)", () => {
  test("a profile whose two type names share a schema slug fails loudly", () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      `[profile]
name = "collide"
okf_version = "0.1"

[base.fields]
type = { required = true }

[[types]]
name = "QA Plan"
sections = []

[[types]]
name = "QA-Plan"
sections = []
`,
    );
    let thrown: unknown;
    try {
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export"] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("validation");
    expect((thrown as LoreError).message).toContain("slug");
    // Nothing was written for the ambiguous profile.
    expect(existsSync(join(root, ".lore/schemas"))).toBe(false);
  });
});

describe("lore schema export — argument errors", () => {
  test("a missing subcommand is a usage error", () => {
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: [] }));
  });

  test("an unknown subcommand is a usage error", () => {
    const err = expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["dump"] }));
    expect(err.message).toContain("dump");
  });

  test("a stray extra positional is rejected", () => {
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "extra"] }));
  });

  test("an unknown flag is rejected", () => {
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--bogus"] }));
  });

  test("an unknown short flag is rejected", () => {
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "-x"] }));
  });

  test("a value flag with no value is rejected", () => {
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out"] }));
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--type="] }));
  });

  test("a value flag does not swallow a following option or the -- marker", () => {
    // `--out --type=Story` (forgot --out's value) must fail loudly, not consume `--type=Story` as the dir.
    expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out", "--type=Story"] }),
    );
    expectUsage(() => runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out", "--"] }));
  });

  test("a repeated flag is rejected (no silent last-wins)", () => {
    expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--type", "Story", "--type", "ADR"] }),
    );
    expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out", "a", "--out", "b"] }),
    );
  });

  test("an --out that escapes the repo is rejected (no clobbering outside the bundle)", () => {
    const escaped = expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out", "../escaped"] }),
    );
    expect(escaped.message).toContain("inside the repo");
    expectUsage(() =>
      runSchema({ root, output: JSON_CTX, stdout: capture(), args: ["export", "--out", "/tmp/lore-abs"] }),
    );
  });
});

describe("lore schema export — plain rendering", () => {
  test("plain mode lists each written file then a summary line", () => {
    const stdout = capture();
    const code = runSchema({ root, output: PLAIN_CTX, stdout, args: ["export", "--type", "ADR"] });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain("wrote .lore/schemas/adr.schema.json");
    expect(text).toContain("1 schema exported to .lore/schemas");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runTypes } from "../src/commands/types";
import type { TypeVocabularyReport } from "../src/core/type-vocabulary";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-types-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run `lore types` in JSON mode and return the parsed `data` payload plus the exit code. */
function types(args: string[]): { code: number; report: TypeVocabularyReport } {
  const stdout = capture();
  const code = runTypes({ root, output: JSON_CTX, stdout, args });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: TypeVocabularyReport };
  expect(envelope.kind).toBe("types.report");
  return { code, report: envelope.data };
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
  throw new Error("expected runTypes to throw a usage LoreError, but it returned");
}

/** A minimal, valid custom `.lore/profile.toml` declaring one extra type (mirrors schema-export.test.ts). */
const CUSTOM_PROFILE = `[profile]
name = "custom"
okf_version = "0.1"

[base.fields]
type = { required = true }
title = {}

[[types]]
name = "Glossary"
sections = []
fields = { term = { required = true } }
`;

describe("lore types — default (story-convention) profile", () => {
  test("reports every declared type with no --type given, and exits 0", () => {
    const { code, report } = types([]);
    expect(code).toBe(0);
    expect(report.types.map((t) => t.name)).toEqual([
      "Epic",
      "Arc",
      "Spec",
      "ADR",
      "Runbook",
      "Reference",
      "Attested Computation",
    ]);
    expect(report.profile).toEqual({ name: "story-convention", okfVersion: "0.2", case: "Title" });
  });

  test("--type <T> scopes the report to exactly one type, resolved case-insensitively", () => {
    const { code, report } = types(["--type", "arc"]);
    expect(code).toBe(0);
    expect(report.types.map((t) => t.name)).toEqual(["Arc"]);
    expect(report.types[0]?.requiredSections).toEqual(["Acceptance criteria"]);
  });

  test("--type resolves a DEPRECATED ALIAS to its canonical type (LCLI-554)", () => {
    // The published surface this guards: `lore types --type Story` is a documented example, so
    // the rename must not turn it into a usage error for an existing caller. Both spellings of
    // the alias resolve, and both report the CANONICAL name.
    for (const spelling of ["Story", "story"]) {
      const { code, report } = types(["--type", spelling]);
      expect(code).toBe(0);
      expect(report.types.map((t) => t.name)).toEqual(["Arc"]);
    }
  });

  test("an unknown --type is a usage error naming the valid set (mirrors `schema export --type`)", () => {
    const err = expectUsage(() => runTypes({ root, output: JSON_CTX, args: ["--type", "Nope"] }));
    expect(err.message).toContain('no type "Nope"');
    expect(err.hint).toContain("Arc");
  });

  test("a value-less --type is a usage error", () => {
    expectUsage(() => runTypes({ root, output: JSON_CTX, args: ["--type"] }));
  });

  test("a stray positional is a usage error", () => {
    expectUsage(() => runTypes({ root, output: JSON_CTX, args: ["bogus"] }));
  });

  test("an unknown flag is a usage error", () => {
    expectUsage(() => runTypes({ root, output: JSON_CTX, args: ["--bogus"] }));
  });
});

describe("lore types — a custom .lore/profile.toml", () => {
  beforeEach(() => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore/profile.toml"), CUSTOM_PROFILE);
  });

  test("reports the custom type's own required field, distinct from the base", () => {
    const { report } = types([]);
    expect(report.types.map((t) => t.name)).toEqual(["Glossary"]);
    const term = report.types[0]?.fields.find((f) => f.name === "term");
    expect(term).toMatchObject({ required: true, common: true, kind: "string" });
  });
});

describe("runTypes — text rendering", () => {
  test("--plain lists every type name, its slug, and an aligned field table with no ANSI", () => {
    const stdout = capture();
    const code = runTypes({ root, output: PLAIN_CTX, args: [], stdout });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("Arc (slug: arc)");
    expect(text).toContain("required sections: Acceptance criteria");
    expect(text).toContain("fields:");
    expect(text).toContain("tasks");
  });

  test("--type <T> --plain renders only that type's block", () => {
    const stdout = capture();
    runTypes({ root, output: PLAIN_CTX, args: ["--type", "Arc"], stdout });
    const text = stdout.text();
    expect(text).toContain("Arc (slug: arc)");
    expect(text).not.toContain("Epic (slug: epic)");
  });
});

describe("cli — types wiring", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore types` runs through the router and exits 0", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("types"), { stdout, stderr, cwd: root, isTTY: false, env: {} });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("Arc");
  });

  test("`lore types --json` emits the types.report envelope through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("types", "--json"), { stdout, stderr, cwd: root, isTTY: false, env: {} });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string };
    expect(envelope.kind).toBe("types.report");
  });

  test("`lore --help` lists the types command", () => {
    const stdout = capture();
    run(argv("--help"), { stdout, stderr: capture(), isTTY: false, env: {} });
    expect(stdout.text()).toContain("types");
  });

  test("`lore help types` and `lore types --help` render the same detailed help", () => {
    const viaHelp = capture();
    run(argv("help", "types"), { stdout: viaHelp, stderr: capture(), isTTY: false, env: {} });
    const viaFlag = capture();
    run(argv("types", "--help"), { stdout: viaFlag, stderr: capture(), isTTY: false, env: {} });
    expect(viaHelp.text()).toBe(viaFlag.text());
    expect(viaFlag.text()).toContain("lore types");
  });
});

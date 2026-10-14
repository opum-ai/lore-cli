/**
 * LCLI-730 / DEC-192 (8) (opum-ai/opum-doc#1023), surface ratified by DEC-192 (10)
 * (opum-ai/opum-doc#1053) — the `task-status-enum-inherited` load-time WARNING.
 *
 * A 0.1 task-coupled type whose merged `status` enum is DECLARED and closed, yet omits the three
 * rollup values (`todo`/`in-progress`/`done`), has closed its own rollup key: on 0.1 `status` IS
 * that key (`taskRollupFieldFor("0.1")`), so a written `status: done` is refused by the generated
 * TYPE SCHEMA. The warning names the type, the enum and the remedy and NEVER changes what loads.
 *
 * The both-ways proof has one control that matters above all: the BUILT-IN profile must stay SILENT.
 * That control is taken on the **0.1** built-in (`profileForBundle(defaultProfile(), V01)`), not the
 * 0.2 one — because the fallback mistake the warning is most likely to make (`effectiveLifecycleStatusEnum`
 * returning the `[draft, stable, deprecated]` fallback when NO enum is declared) only shows up once
 * the 0.2 version gate is passed. The 0.2 built-in would be silenced by the version gate and would
 * prove nothing about the fallback.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { taskStatusEnumInheritedFindings } from "../src/core/check";
import type { BundleState } from "../src/core/okf-version";
import { compileProfile, defaultProfile, type Profile, parseProfile, profileForBundle } from "../src/core/profile";
import { validateFrontmatter } from "../src/core/schema";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const V01: BundleState = { okfVersion: "0.1", source: "legacy-missing" };

/** The base fields every fixture shares: a required `type` and a CLOSED `status` enum with no rollup value. */
const CLOSED_BASE = { type: { required: true }, status: { enum: ["draft", "approved"] } };

/** Compile a fixture profile from the same `{ profile, base, types }` document shape the loader takes. */
function build(doc: Record<string, unknown>): Profile {
  return compileProfile(parseProfile(doc, "test-profile"));
}

/** A 0.1 task-coupled `Story` inheriting the closed base enum — the shape the warning exists for. */
const OFFENDING = build({
  profile: { name: "demo", okf_version: "0.1" },
  base: { fields: CLOSED_BASE },
  types: [{ name: "Story", fields: { tasks: { kind: "list" } } }],
});

/** Remedy arm 1: `status` declared OPEN on the type, so nothing is closed and the fallback reads. */
const REMEDY_OPEN = build({
  profile: { name: "demo", okf_version: "0.1" },
  base: { fields: CLOSED_BASE },
  types: [{ name: "Story", fields: { status: {}, tasks: { kind: "list" } } }],
});

/** Remedy arm 2: `status` declared with its OWN enum that INCLUDES the rollup values. */
const REMEDY_ROLLUP = build({
  profile: { name: "demo", okf_version: "0.1" },
  base: { fields: CLOSED_BASE },
  types: [{ name: "Story", fields: { status: { enum: ["todo", "in-progress", "done"] }, tasks: { kind: "list" } } }],
});

/** The trigger is 0.1-only: the SAME closed-enum, task-coupled shape on a 0.2 profile must NOT warn. */
const V02_OFFENDING = build({
  profile: { name: "demo", okf_version: "0.2" },
  base: { fields: CLOSED_BASE },
  types: [{ name: "Story", fields: { tasks: { kind: "list" } } }],
});

/** The trigger requires task coupling: the same closed enum on a NON-coupled type must NOT warn. */
const NON_COUPLED = build({
  profile: { name: "demo", okf_version: "0.1" },
  base: { fields: CLOSED_BASE },
  types: [{ name: "Story", fields: {} }],
});

/** The 0.1 built-in profile — its task-coupled `Arc` inherits an OPEN `status`, so it must stay silent. */
const BUILTIN_01 = profileForBundle(defaultProfile(), V01);

describe("task-status-enum-inherited (LCLI-730, DEC-192 (8), (10))", () => {
  // One test on purpose: the both-ways proof — the offender warns, the built-in and BOTH remedies
  // stay silent — is the WARNING test, and the mutation control must redden exactly it (AC3).
  test("warns on a 0.1 task-coupled type with a closed declared enum, and stays silent for the built-in profile and both remedies", () => {
    // (a) the offender warns, NAMING the type, the inherited enum and the remedy (assert on content).
    const findings = taskStatusEnumInheritedFindings(OFFENDING, ".lore/profile.toml");
    expect(findings).toHaveLength(1);
    const finding = findings[0] as { rule: string; severity: string; file: string; message: string };
    expect(finding.rule).toBe("task-status-enum-inherited");
    expect(finding.severity).toBe("warning");
    expect(finding.file).toBe(".lore/profile.toml");
    expect(finding.message).toContain('"Story"'); // the type
    expect(finding.message).toContain('"draft"'); // the inherited enum, value by value
    expect(finding.message).toContain('"approved"');
    expect(finding.message).toContain("todo"); // the rollup values it lacks
    expect(finding.message).toContain("in-progress");
    expect(finding.message).toContain("done");
    expect(finding.message).toContain("declare `status`"); // the remedy
    expect(finding.message).not.toContain("\n"); // Finding.message is single-line

    // (b) the built-in profile SILENT — the control that catches keying on the fallback triple.
    expect(taskStatusEnumInheritedFindings(BUILTIN_01, ".lore/profile.toml")).toEqual([]);

    // (c) remedy arm 1: `status` declared OPEN on the type.
    expect(taskStatusEnumInheritedFindings(REMEDY_OPEN, ".lore/profile.toml")).toEqual([]);

    // (d) remedy arm 2: `status` declared with an enum that INCLUDES the rollup values.
    expect(taskStatusEnumInheritedFindings(REMEDY_ROLLUP, ".lore/profile.toml")).toEqual([]);
  });

  test("a 0.2 profile never warns — the rollup key there is `lore_task_status`, so `status` is the lifecycle key", () => {
    // `taskRollupFieldFor("0.2")` is `lore_task_status` (src/core/okf-version.ts:45): 0.2 reserves
    // `status` for the lifecycle enum, so closing it collides with no rollup and the trigger is 0.1-only.
    expect(taskStatusEnumInheritedFindings(V02_OFFENDING, ".lore/profile.toml")).toEqual([]);
  });

  test("a non-task-coupled 0.1 type with the same closed enum never warns", () => {
    expect(taskStatusEnumInheritedFindings(NON_COUPLED, ".lore/profile.toml")).toEqual([]);
  });

  test("the warning is not an acceptance: a document the closed enum refuses is STILL refused (AC2)", () => {
    // The warning NAMES the collision; it does not resolve it, and it changes no load/validate
    // outcome. `status: done` on the closed-enum profile is refused by the generated type schema
    // exactly as before LCLI-730 — the schema's refusal is deliberately left as it is (DEC-192 (8)).
    expect(() =>
      validateFrontmatter(
        { type: "Story", status: "done" },
        { profile: OFFENDING, bundleState: V01, path: "docs/stories/x.md" },
      ),
    ).toThrow();
    // ...and it is the SAME enum the warning names that refuses it.
    expect(() =>
      validateFrontmatter(
        { type: "Story", status: "done" },
        { profile: OFFENDING, bundleState: V01, path: "docs/stories/x.md" },
      ),
    ).toThrow(/draft/);
    // A value IN the closed enum still loads, so the schema accepted nothing new.
    expect(() =>
      validateFrontmatter(
        { type: "Story", status: "approved" },
        { profile: OFFENDING, bundleState: V01, path: "docs/stories/x.md" },
      ),
    ).not.toThrow();
  });
});

describe("task-status-enum-inherited — the gate (LCLI-730 exit-code proofs, DEC-192 (10))", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-730-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function opts(args: string[], output: OutputContext = JSON_CTX) {
    return { root, output, args, stdout: capture(), stderr: capture() };
  }

  /** Write the offending 0.1 profile (closed base `status`, task-coupled `Story`) to `.lore/profile.toml`. */
  function writeOffendingProfile(): void {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore", "profile.toml"),
      [
        "[profile]",
        'name = "demo"',
        'okf_version = "0.1"',
        "",
        "[base.fields]",
        "type = { required = true }",
        'status = { enum = ["draft", "approved"] }',
        "",
        "[[types]]",
        'name = "Story"',
        'fields = { tasks = { kind = "list" } }',
        "",
      ].join("\n"),
    );
  }

  test("WITHOUT --strict: the offending profile WARNS and `lore check` still exits 0", () => {
    writeOffendingProfile();
    const options = opts([]);
    expect(runCheck(options)).toBe(EXIT_OK);
    const report = JSON.parse((options.stdout as ReturnType<typeof capture>).text());
    expect(report.data.errorCount).toBe(0);
    expect(report.data.warningCount).toBeGreaterThanOrEqual(1);
    expect(report.data.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "task-status-enum-inherited",
        file: ".lore/profile.toml",
        message: expect.stringContaining('"Story"'),
      }),
    );
  });

  test("WITH --strict: the SAME offending profile FAILS the gate", () => {
    writeOffendingProfile();
    const options = opts(["--strict"]);
    expect(runCheck(options)).toBe(EXIT_CODES.validation);
    const report = JSON.parse((options.stdout as ReturnType<typeof capture>).text());
    expect(report.data.findings).toContainEqual(
      expect.objectContaining({ rule: "task-status-enum-inherited", file: ".lore/profile.toml" }),
    );
  });

  test("WITH --strict: the BUILT-IN profile (no `.lore/profile.toml`) PASSES", () => {
    // No profile file: the built-in story-convention profile loads, whose task-coupled `Arc`
    // inherits an OPEN `status`. Its own repo producer version is 0.2, so nothing here warns.
    expect(runCheck(opts(["--strict"]))).toBe(EXIT_OK);
  });
});

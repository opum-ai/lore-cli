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
 *
 * The version gate is the **BUNDLE's**, not the producer profile's own `okf_version` (LCLI-730
 * review). The schema that refuses a rollup `status` is built per bundle by `profileForBundle`, and
 * DEC-192 (8) is scoped to "a 0.1 BUNDLE's task-coupled type". Gating on the producer version failed
 * BOTH ways and each direction has its own test below: a `okf_version = "0.2"` profile over a legacy
 * 0.1 bundle warned NOTHING where the collision is real, and a `okf_version = "0.1"` profile over a
 * 0.2 bundle warned where it is not. Every unit call therefore passes bundle STATES, and the mixed
 * cases pin that N 0.1 bundles still yield exactly ONE finding per type.
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
const V02: BundleState = { okfVersion: "0.2", source: "declared" };

/** Every unit call takes the scanned bundle STATES — the gate is the bundle's version, not the producer profile's. */
const PROFILE_FILE = ".lore/profile.toml";
function findingsFor(
  profile: Profile,
  states: readonly BundleState[],
): ReturnType<typeof taskStatusEnumInheritedFindings> {
  return taskStatusEnumInheritedFindings(profile, states, PROFILE_FILE);
}

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

/**
 * The DISCRIMINATING fixture: a base enum DECLARED and byte-equal to the built-in lifecycle triple.
 * It lacks every rollup value, so it inherits a closed base `status` enum and the rule must fire —
 * but its EFFECTIVE enum is indistinguishable from the compiler fallback, which is what an open
 * `status` and the built-in profile also read. A detector that keys on the effective enum being the
 * triple rather than on the enum being DECLARED skips exactly this case and nothing else, so this
 * fixture is the only one that pins the distinction.
 */
const DECLARED_BUILTIN_TRIPLE = build({
  profile: { name: "demo", okf_version: "0.1" },
  base: { fields: { type: { required: true }, status: { enum: ["draft", "stable", "deprecated"] } } },
  types: [{ name: "Story", fields: { tasks: { kind: "list" } } }],
});

/** The 0.1 built-in profile — its task-coupled `Arc` inherits an OPEN `status`, so it must stay silent. */
const BUILTIN_01 = profileForBundle(defaultProfile(), V01);

describe("task-status-enum-inherited (LCLI-730, DEC-192 (8), (10))", () => {
  // One test on purpose: the both-ways proof — the offender warns, the built-in and BOTH remedies
  // stay silent — is the WARNING test, and the mutation control must redden exactly it (AC3).
  test("warns on a 0.1 task-coupled type with a closed declared enum, and stays silent for the built-in profile and both remedies", () => {
    // (a) the offender warns, NAMING the type, the inherited enum and the remedy (assert on content).
    const findings = findingsFor(OFFENDING, [V01]);
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

    // (b) the built-in profile SILENT — its `Arc` inherits an OPEN `status`, so no enum is declared.
    expect(findingsFor(BUILTIN_01, [V01])).toEqual([]);

    // (c) remedy arm 1: `status` declared OPEN on the type.
    expect(findingsFor(REMEDY_OPEN, [V01])).toEqual([]);

    // (d) remedy arm 2: `status` declared with an enum that INCLUDES the rollup values.
    expect(findingsFor(REMEDY_ROLLUP, [V01])).toEqual([]);
  });

  test("a 0.2 BUNDLE never warns — the rollup key there is `lore_task_status`, so `status` is the lifecycle key", () => {
    // `taskRollupFieldFor("0.2")` is `lore_task_status` (src/core/okf-version.ts:45): 0.2 reserves
    // `status` for the lifecycle enum, so closing it collides with no rollup and the trigger is
    // 0.1-only. The gate is the BUNDLE's version, so a 0.1 PRODUCER profile over a 0.2 bundle is
    // silent too — that is the false positive the producer-version gate produced (LCLI-730 review).
    expect(findingsFor(OFFENDING, [V02])).toEqual([]);
    expect(findingsFor(V02_OFFENDING, [V02])).toEqual([]);
  });

  test("the gate is the BUNDLE's version, not the producer profile's — a 0.2 profile over a 0.1 bundle WARNS", () => {
    // The measured false negative (LCLI-730 review): a `okf_version = "0.2"` profile ran over a bundle
    // whose root index omits `okf_version`, which resolves to legacy 0.1, so `status` IS the rollup
    // key there and the closed enum collides — but the producer-version gate read "0.2" and said
    // nothing. The schema still refused the document; only the warning was missing.
    expect(findingsFor(V02_OFFENDING, [V01])).toHaveLength(1);
    expect(findingsFor(V02_OFFENDING, [V01])[0]?.message).toContain('"Story"');
    // and the SAME producer profile over a 0.2 bundle stays silent — one input, two bundle states,
    // two different (correct) answers, which is only expressible with the bundle in the gate.
    expect(findingsFor(V02_OFFENDING, [V02])).toEqual([]);
  });

  test("mixed and repeated bundles: any 0.1 bundle warns, and N 0.1 bundles still warn EXACTLY ONCE", () => {
    // One finding per offending TYPE, whatever the bundle count — the finding is profile-scoped and
    // carries no bundle, so a second 0.1 bundle must not duplicate it (DEC-192 (10)).
    expect(findingsFor(OFFENDING, [V01, V02])).toHaveLength(1);
    expect(findingsFor(OFFENDING, [V01, V01])).toHaveLength(1);
    expect(findingsFor(OFFENDING, [V02, V01])).toHaveLength(1);
    // no 0.1 bundle anywhere: silent, however many bundles are scanned.
    expect(findingsFor(OFFENDING, [V02, V02])).toEqual([]);
  });

  test("a non-task-coupled 0.1 type with the same closed enum never warns", () => {
    expect(findingsFor(NON_COUPLED, [V01])).toEqual([]);
  });

  // Pins the DECLARED-vs-FALLBACK distinction, and is the only test that does. Measured: reverting
  // the guard to a comparison against the built-in triple (`isBuiltinLifecycleStatus`) leaves every
  // other test in this file green and reddens this one alone, because the two shapes below read the
  // SAME `lifecycleStatusEnum` while only one of them declares anything.
  test("a DECLARED enum byte-equal to the built-in triple still warns, though the built-in profile reads the same values", () => {
    const findings = findingsFor(DECLARED_BUILTIN_TRIPLE, [V01]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('"draft"');
    expect(findings[0]?.message).toContain('"stable"');
    expect(findings[0]?.message).toContain('"deprecated"');
    // the same three values, reached WITHOUT a declared enum, stay silent — see BUILTIN_01 above.
    expect(findingsFor(BUILTIN_01, [V01])).toEqual([]);
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

  /**
   * Write the offending profile (closed base `status`, task-coupled `Story`) to `.lore/profile.toml`.
   * `okfVersion` is the PRODUCER target in the profile file, and is deliberately independent of the
   * bundle's own version — the pairs below vary it against the bundle on purpose, because the gate
   * must read the bundle. `Reference` is declared so a frontmattered `docs/index.md` (which is how a
   * bundle DECLARES 0.2) is a known type and does not add an `unknown-type` warning of its own.
   */
  function writeOffendingProfile(okfVersion = "0.1"): void {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore", "profile.toml"),
      [
        "[profile]",
        'name = "demo"',
        `okf_version = "${okfVersion}"`,
        "",
        "[base.fields]",
        "type = { required = true }",
        'status = { enum = ["draft", "approved"] }',
        "",
        "[[types]]",
        'name = "Story"',
        'fields = { tasks = { kind = "list" } }',
        "",
        "[[types]]",
        'name = "Reference"',
        "",
      ].join("\n"),
    );
  }

  /**
   * Rewrite `docs/index.md` so the BUNDLE resolves to `okfVersion`. Omit it for a root index with no
   * `okf_version` at all, which is the `legacy-missing` case that resolves to 0.1.
   */
  function writeIndex(okfVersion?: string): void {
    writeFileSync(
      join(root, "docs", "index.md"),
      okfVersion === undefined
        ? "# Docs\n\nRoot.\n"
        : // `summary` is present so the built-in index `missing summary` WARNING does not turn a
          // `--strict` run red for a reason that has nothing to do with this rule.
          [
            "---",
            "type: Reference",
            "title: Docs",
            `okf_version: "${okfVersion}"`,
            "summary: Docs root.",
            "---",
            "# Docs",
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
    // NOTE: with no profile file the detector is never reached at all (`activeProfilePath` yields
    // `undefined`), so this case alone proves nothing about the warning; the two below carry that.
    expect(runCheck(opts(["--strict"]))).toBe(EXIT_OK);
  });

  test("WITH --strict: a 0.1 BUNDLE on the BUILT-IN profile PASSES (the bundle is declared 0.1, the profile is not ours)", () => {
    // The bundle DECLARES 0.1 rather than inheriting it, so this exercises the resolved-version path
    // instead of the legacy-missing default. The built-in profile declares no `status` enum at all,
    // so there is no closed vocabulary to collide with — on 0.1 or on 0.2.
    writeIndex("0.1");
    expect(runCheck(opts(["--strict"]))).toBe(EXIT_OK);
  });

  test("WITH --strict: a POPULATED 0.2 profile over a 0.2 bundle PASSES — the gate reads the bundle", () => {
    writeOffendingProfile("0.2");
    writeIndex("0.2");
    const options = opts(["--strict"]);
    expect(runCheck(options)).toBe(EXIT_OK);
    expect(JSON.parse((options.stdout as ReturnType<typeof capture>).text()).data.warningCount).toBe(0);
  });

  // The measured false negative, end to end on the real command path rather than only in the unit:
  // a 0.2 PRODUCER profile over a bundle with no declared version, which resolves to legacy 0.1.
  test("a 0.2 producer profile over a legacy-0.1 bundle WARNS — the case the producer-version gate missed", () => {
    writeOffendingProfile("0.2");
    const options = opts([]);
    expect(runCheck(options)).toBe(EXIT_OK);
    expect(JSON.parse((options.stdout as ReturnType<typeof capture>).text()).data.findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: "task-status-enum-inherited", file: ".lore/profile.toml" }),
    );
  });

  // ...and its mirror: the same 0.1 PRODUCER profile the old gate keyed on stays silent over a 0.2
  // bundle, which the producer-version gate wrongly warned about.
  test("a 0.1 producer profile over a 0.2 bundle is SILENT end to end", () => {
    writeOffendingProfile("0.1");
    writeIndex("0.2");
    const options = opts(["--strict"]);
    expect(runCheck(options)).toBe(EXIT_OK);
    expect(JSON.parse((options.stdout as ReturnType<typeof capture>).text()).data.warningCount).toBe(0);
  });
});

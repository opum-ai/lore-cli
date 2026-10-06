/**
 * check-lockfile-pins.test.ts — exercises `scripts/check-lockfile-pins.mjs` (LCLI-544).
 *
 * THE FAILURE THIS GUARDS AGAINST IS ARMED, NOT IMMEDIATE, so the tests are written as the two
 * halves of a gate proof rather than as a demonstration that the script runs. At the 0.8.0 bump
 * `bun.lock` still resolved the platform packages at 0.7.0 while `package.json` had moved on. The
 * bump PR and the promotion were genuinely green: the new versions did not exist on the registry
 * yet, so bun resolved nothing, left the lockfile alone, and `--frozen-lockfile` compared two
 * things that still agreed. Publishing made them resolvable, and the SAME UNCHANGED LOCKFILE became
 * stale the instant the registry could answer — every CI job then failed in `setup-bun`, on `dev`
 * and on every open pull request at once, with no source change between the green run and the red.
 * The remedy has been prose in the release runbook since 0.3.5 (LCLI-369); this is the machine
 * check that makes forgetting it fail where it is cheap.
 *
 * REJECTION is one test per failure shape, each red for ITS OWN reason and each asserting on the
 * message rather than the exit code alone — two different failures wear the same red, and a gate
 * that is always red agrees with every expectation you bring to it:
 *
 *   - a lockfile pin that LAGS the manifest (the incident)  — names the package and both versions,
 *                                                              and the remedy line names the pinned Bun;
 *   - a declared platform the lockfile omits                — names it and the manifest's version;
 *   - a platform the lockfile records and nothing declares  — names the orphan;
 *   - a workspace block with an empty pin set, or none      — says nothing was compared;
 *   - a `bun.lock` that is absent, or does not parse        — each named, neither a pass;
 *   - a manifest with no `@opum-ai/lore-*` pin at all       — an empty comparison is not a clean one;
 *   - a resolved entry under `packages` at the wrong version, or in a shape this check cannot read;
 *   - a tree the script cannot evaluate at all               — non-zero, never a pass.
 *
 * ACCEPTANCE is tested as deliberately as rejection: a clean fixture is green with the trailing
 * commas bun actually writes, and so is the REAL repository — with the success line asserted to
 * name how many pins it compared and at which version, so a vacuously-passing comparison cannot be
 * mistaken for a clean one.
 *
 * WIRING is asserted last because a correct script nobody invokes gates nothing, and because the
 * lockfile must be read in exactly ONE place: ci.yml must run it on every pull request,
 * release.yml must call the same file at dispatch, and neither workflow may carry its own inline
 * comparison that could drift from this one.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-lockfile-pins.mjs");
const CI_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "ci.yml");
const RELEASE_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release.yml");

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];
const MANIFEST_VERSION = "0.12.0";
const LOCKED_VERSION = "0.11.0";
const PINNED_BUN = "1.3.14";

interface FixtureOptions {
  /** Platforms to declare in root optionalDependencies. */
  declared?: string[];
  /** Manifest version. */
  version?: string;
  /** Platforms to record in the lockfile's root workspace block, and the version to record. */
  lockedPlatforms?: string[];
  lockedVersion?: string;
  /** Per-package overrides of the version recorded in the lockfile. */
  lockedPins?: Record<string, string>;
  /** Replace the lockfile TEXT wholesale. */
  lockText?: string;
  /** Omit bun.lock entirely. */
  omitLock?: boolean;
  /** Platform names to also add under the lockfile's `packages` map, and their version. */
  resolvedPlatforms?: string[];
  resolvedVersion?: string;
  /** Replace the `packages` map wholesale. */
  packagesText?: string;
  /** Replace the root package.json text wholesale. */
  rootText?: string;
}

function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "lore-check-lockfile-pins-"));
  const declared = options.declared ?? PLATFORMS;
  const resolved = options.resolvedPlatforms ?? [];
  writeFileSync(
    join(root, "package.json"),
    `${options.rootText ?? JSON.stringify({ name: "@opum-ai/lore", version: options.version ?? MANIFEST_VERSION, optionalDependencies: Object.fromEntries(declared.map((p) => [`@opum-ai/lore-${p}`, options.version ?? MANIFEST_VERSION])) }, null, 2)}\n`,
  );
  writeFileSync(join(root, ".bun-version"), `${PINNED_BUN}\n`);
  if (options.omitLock !== true) {
    const lockedPlatforms = options.lockedPlatforms ?? declared;
    const lockedVersion = options.lockedVersion ?? MANIFEST_VERSION;
    const pinned = options.lockedPins ?? {};
    // Trailing commas everywhere, because that is what bun writes: the script's reader must accept
    // the JSONC it will actually meet, not a tidied version of it.
    const lockText =
      options.lockText ??
      `{
  "lockfileVersion": 1,
  "configVersion": 0,
  "workspaces": {
    "": {
      "name": "@opum-ai/lore",
      "optionalDependencies": {
${lockedPlatforms.map((p) => `        "@opum-ai/lore-${p}": "${pinned[p] ?? lockedVersion}",`).join("\n")}
      },
    },
  },
  "packages": {
${options.packagesText ?? resolved.map((p) => `    "@opum-ai/lore-${p}": ["@opum-ai/lore-${p}@${options.resolvedVersion ?? MANIFEST_VERSION}", "", {}, "sha512-AAAA=="],`).join("\n")}
  },
}
`;
    writeFileSync(join(root, "bun.lock"), lockText);
  }
  return root;
}

function run(root: string, ...args: string[]) {
  // `node`, not `process.execPath`: ci.yml and release.yml both invoke the script under node, and a
  // test that ran it under bun would be measuring a runtime neither call site uses.
  return spawnSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
}

describe("check-lockfile-pins.mjs accepts", () => {
  test("a fixture whose lockfile pins match package.json, trailing commas included", () => {
    const root = fixture();
    const result = run(root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`6 platform pin(s) compared, all at ${MANIFEST_VERSION}`);
    rmSync(root, { recursive: true, force: true });
  });

  test("a lockfile that also carries resolved platform entries at the same version", () => {
    const root = fixture({ resolvedPlatforms: ["darwin-arm64", "linux-x64"] });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 resolved @opum-ai/lore-* entr(ies) under packages");
    rmSync(root, { recursive: true, force: true });
  });

  test("a lockfile with no packages map at all — the success line says so rather than counting zero", () => {
    // "none found" and "nothing was read" are different facts; the success line must not print the
    // first for the second.
    const pins = PLATFORMS.map((p) => `        "@opum-ai/lore-${p}": "${MANIFEST_VERSION}",`).join("\n");
    const root = fixture({
      lockText: `{\n  "lockfileVersion": 1,\n  "workspaces": {\n    "": {\n      "optionalDependencies": {\n${pins}\n      },\n    },\n  },\n}\n`,
    });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no packages map recorded, so no resolved entry was read");
    rmSync(root, { recursive: true, force: true });
  });

  test("the real repository tree, naming what it compared rather than passing vacuously", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
      optionalDependencies: Record<string, string>;
    };
    const pins = Object.keys(manifest.optionalDependencies).filter((name) => name.startsWith("@opum-ai/lore-"));
    const result = run(REPO_ROOT);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    // Asserted against the tree's own numbers, not against today's version: a bump must not turn
    // the proof into a red test, and a count of zero pins must not read as a clean comparison.
    expect(pins.length).toBeGreaterThan(0);
    expect(result.stdout).toContain(`${pins.length} platform pin(s) compared`);
    expect(result.stdout).toContain(`all at ${manifest.version}`);
  });
});

describe("check-lockfile-pins.mjs rejects, each for its own reason", () => {
  test("a lockfile pin that lags the manifest — the 0.8.0 incident", () => {
    const root = fixture({ lockedPins: { "darwin-arm64": LOCKED_VERSION } });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `pins @opum-ai/lore-darwin-arm64 at ${LOCKED_VERSION}, but ${join(root, "package.json")} pins it at ${MANIFEST_VERSION}`,
    );
    // The remedy has to be at the point of failure, with the version that actually regenerates the
    // lockfile — a reader hitting this red is mid-bump and has one Bun that writes the right shape.
    expect(result.stderr).toContain(".bun-version");
    expect(result.stderr).toContain(PINNED_BUN);
    expect(result.stderr).toContain("bun install");
    rmSync(root, { recursive: true, force: true });
  });

  test("a platform the manifest declares and the lockfile omits", () => {
    const root = fixture({ lockedPlatforms: PLATFORMS.filter((p) => p !== "linux-arm64") });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("records no optionalDependencies pin for @opum-ai/lore-linux-arm64");
    rmSync(root, { recursive: true, force: true });
  });

  test("a platform the lockfile records and the manifest does not declare", () => {
    const root = fixture({ lockedPlatforms: [...PLATFORMS, "freebsd-x64"] });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pins @opum-ai/lore-freebsd-x64, which");
    expect(result.stderr).toContain("optionalDependencies does not declare");
    rmSync(root, { recursive: true, force: true });
  });

  test("a workspace block whose pin set is empty — every declared platform is reported missing", () => {
    const root = fixture({ lockedPlatforms: [] });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("records no optionalDependencies pin for @opum-ai/lore-darwin-arm64");
    // All six, not just the first: an empty block is six findings, and a script that printed one
    // would still exit 1 while hiding five.
    expect(result.stderr).toContain(`${PLATFORMS.length} lockfile pin problem(s)`);
  });

  test("a lockfile parsing to null — a shape the sentinel would swallow", () => {
    // Found in review (2026-09-29): `let lock = null` doubled as "missing or unparseable" and as
    // the parsed JSON literal, so this file fell through every read and exited 0 while the success
    // line claimed six pins compared.
    const root = fixture({ lockText: "null" });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("parses to null, not an object");
    expect(result.stderr).toContain("not a lockfile it cleared");
    expect(result.stdout).not.toContain("agrees with package.json");
    rmSync(root, { recursive: true, force: true });
  });

  test("a lockfile whose packages map is not a map — and whose pins are otherwise perfect", () => {
    // The pins are all correct here, so the malformed map is the ONLY finding: a test that also
    // tripped the pin comparison would not show which branch refused it.
    const pins = PLATFORMS.map((p) => `        "@opum-ai/lore-${p}": "${MANIFEST_VERSION}",`).join("\n");
    const root = fixture({
      lockText: `{\n  "lockfileVersion": 1,\n  "workspaces": {\n    "": {\n      "optionalDependencies": {\n${pins}\n      },\n    },\n  },\n  "packages": "nope",\n}\n`,
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"packages" is "nope", which this check cannot read as a map');
    expect(result.stderr).toContain("1 lockfile pin problem(s)");
    rmSync(root, { recursive: true, force: true });
  });

  test("a lockfile with no root workspace entry at all", () => {
    const root = fixture({ lockText: '{ "lockfileVersion": 1, "packages": {} }\n' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('workspaces[""].optionalDependencies is undefined');
    expect(result.stderr).toContain("nothing was compared against");
    rmSync(root, { recursive: true, force: true });
  });

  test("a missing bun.lock", () => {
    const root = fixture({ omitLock: true });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${join(root, "bun.lock")} does not exist`);
    expect(result.stderr).toContain("nothing about its platform pins was compared");
    rmSync(root, { recursive: true, force: true });
  });

  test("a bun.lock that does not parse even after trailing-comma stripping", () => {
    const root = fixture({ lockText: '{ "lockfileVersion": 1, "workspaces": { "": ' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not parse as JSON after trailing-comma stripping");
    expect(result.stderr).toContain("not a lockfile it cleared");
    rmSync(root, { recursive: true, force: true });
  });

  test("a manifest with no @opum-ai/lore-* pin, so nothing could be compared", () => {
    const root = fixture({ declared: [] });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("holds no @opum-ai/lore-* pin, so no platform package was compared");
    expect(result.stderr).toContain("an empty comparison is not a clean one");
    rmSync(root, { recursive: true, force: true });
  });

  test("a manifest whose optionalDependencies is not an object", () => {
    const root = fixture({
      rootText: '{ "name": "@opum-ai/lore", "version": "0.12.0", "optionalDependencies": [] }\n',
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("optionalDependencies is []");
    expect(result.stderr).toContain("compared against nothing");
    rmSync(root, { recursive: true, force: true });
  });

  test("a resolved entry under packages at a version the manifest does not pin", () => {
    const root = fixture({ resolvedPlatforms: ["darwin-arm64"], resolvedVersion: LOCKED_VERSION });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `resolves @opum-ai/lore-darwin-arm64 at ${LOCKED_VERSION}, but ${join(root, "package.json")} pins it at ${MANIFEST_VERSION}`,
    );
    rmSync(root, { recursive: true, force: true });
  });

  test("a resolved entry whose tuple this check cannot read", () => {
    const root = fixture({ packagesText: '    "@opum-ai/lore-darwin-arm64": ["", ""],' });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is not a `name@version` tuple this check can read");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("check-lockfile-pins.mjs never passes a tree it could not evaluate", () => {
  test("a root that does not exist", () => {
    const result = run(join(tmpdir(), "lore-check-lockfile-pins-does-not-exist"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("nothing was checked, and this is not a pass");
  });

  test("a root with no package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-check-lockfile-pins-no-manifest-"));
    writeFileSync(join(root, "bun.lock"), "{}\n");
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not read");
    expect(result.stderr).toContain("nothing was checked, and this is not a pass");
    rmSync(root, { recursive: true, force: true });
  });

  test("an unknown argument", () => {
    const result = run(REPO_ROOT, "--platforms", "darwin-arm64");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument: --platforms");
    expect(result.stderr).toContain("usage: node scripts/check-lockfile-pins.mjs [--root <dir>]");
  });
});

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
  if?: unknown;
}
interface WorkflowJob {
  needs?: unknown;
  steps?: WorkflowStep[];
  "continue-on-error"?: unknown;
}
interface WorkflowDoc {
  on?: Record<string, unknown>;
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(path: string): WorkflowDoc {
  return yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

/** The standard ways of leaving a gate present but unable to stop anything (see release-workflow.test.ts). */
const NEUTERING_RUN_PATTERNS = [/\|\|\s*true/, /\|\|\s*:/, /;\s*true\s*$/m, /set\s+\+e/];

describe("the lockfile assertion is ONE script invoked from two call sites", () => {
  test("package.json's check:lockfile-pins runs the script", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["check:lockfile-pins"]).toBe("node scripts/check-lockfile-pins.mjs");
  });

  test("ci.yml runs it on every pull request, ungated by any other job", () => {
    const doc = loadWorkflow(CI_WORKFLOW);
    expect(Object.keys(doc.on ?? {})).toContain("pull_request");
    const job = doc.jobs["package-set"];
    expect(job).toBeDefined();
    // No `needs:` — an upstream failure would make this context absent rather than red — and no
    // continue-on-error, which would let the workflow succeed past a red lockfile.
    expect(job?.needs).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    const step = job?.steps?.find((s) => s.run?.includes("check:lockfile-pins"));
    expect(step?.run?.trim()).toBe("bun run check:lockfile-pins");
    // A step-level `if:` disarms the gate with the whole suite still green (found in review,
    // 2026-09-29: `if: false` on this exact step left 21 tests passing). Reading `run` alone does
    // not prove the step is ungated.
    expect(step?.if).toBeUndefined();
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(step?.run ?? "").not.toMatch(pattern);
  });

  test("release.yml's verify-versions job calls the same script at dispatch", () => {
    const job = loadWorkflow(RELEASE_WORKFLOW).jobs["verify-versions"];
    const step = job?.steps?.find((s) => s.run?.includes("scripts/check-lockfile-pins.mjs"));
    expect(step?.run?.trim()).toBe("node scripts/check-lockfile-pins.mjs");
    expect(step?.if).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(step?.run ?? "").not.toMatch(pattern);
  });

  test("neither workflow carries an inline copy of the lockfile comparison", () => {
    // The lockfile is read in exactly one file. A second, inline comparison in a workflow is the
    // shape that drifts: the two agree until one of them is edited. Collected rather than asserted
    // one by one, so the failure names the step instead of quoting its whole `run` block.
    const inline: string[] = [];
    for (const path of [CI_WORKFLOW, RELEASE_WORKFLOW]) {
      const file = path.split("/").pop() ?? path;
      for (const [id, job] of Object.entries(loadWorkflow(path).jobs)) {
        for (const step of job.steps ?? []) {
          if (step.run?.includes("check-lockfile-pins") === true) continue;
          if (step.run?.includes("bun.lock") === true) inline.push(`${file}: ${id}: ${step.name ?? step.run}`);
        }
      }
    }
    expect(inline).toEqual([]);
  });
});

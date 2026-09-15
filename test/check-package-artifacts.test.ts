/**
 * check-package-artifacts.test.ts — exercises `scripts/check-package-artifacts.mjs` (LCLI-513).
 *
 * THE FAILURE THIS GUARDS AGAINST IS SILENT, so the tests are written as the two halves of a
 * gate proof rather than as a demonstration that the script runs. A bare `git add -A` stages a
 * deletion for any tracked file merely absent from the working tree, and afterwards the index
 * matches the tree: `git status` says clean, `git diff HEAD -- npm/` is empty, and the commit that
 * just deleted a platform package says "tracker-only". quest-cli lost `npm/quest-darwin-arm64/`
 * exactly this way on 2026-09-15. Nothing here would have refused it: release.yml compared the set,
 * and release.yml is `workflow_dispatch` only.
 *
 * REJECTION is one test per failure shape, each red for ITS OWN reason and each asserting on the
 * message rather than the exit code alone — two different failures wear the same red, and a gate
 * that is always red agrees with every expectation you bring to it:
 *
 *   - a declared package with no directory (the incident) — names the lost package;
 *   - a directory nothing declares                        — names the orphan;
 *   - a manifest that does not parse                      — names the file;
 *   - a manifest whose name disagrees with its directory  — names both;
 *   - a manifest with no explicit `files` list            — names the discovered-set risk;
 *   - the release matrix disagreeing with package.json    — uses release.yml's own sentence;
 *   - a tree the script cannot evaluate at all            — non-zero, never a pass.
 *
 * ACCEPTANCE is tested as deliberately as rejection: a clean fixture is green, and so is the real
 * repository, with and without the matrix argument release.yml passes.
 *
 * WIRING is asserted last because a correct script nobody invokes gates nothing: ci.yml must run
 * it on every pull request through `check:packages`, release.yml must call the same file, and the
 * inline copy release.yml used to carry must stay gone — one assertion, two call sites.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-package-artifacts.mjs");
const CI_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "ci.yml");
const RELEASE_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release.yml");

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];

interface FixtureOptions {
  /** Platforms to declare in root optionalDependencies. */
  declared?: string[];
  /** Platforms to create directories for under npm/. */
  onDisk?: string[];
  /** Per-platform overrides of the manifest text written to npm/<p>/package.json. */
  manifestText?: Record<string, string>;
  /** Per-platform overrides of the parsed manifest, applied before serialisation. */
  manifest?: Record<string, (manifest: Record<string, unknown>) => Record<string, unknown>>;
  /** Replace the root package.json text wholesale. */
  rootText?: string;
}

function platformManifest(platform: string): Record<string, unknown> {
  return {
    name: `@opum-ai/lore-${platform}`,
    version: "0.7.0",
    os: [platform.split("-")[0]],
    cpu: [platform.split("-")[1]],
    files: [platform.startsWith("win32-") ? "bin/lore.exe" : "bin/lore"],
  };
}

function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "lore-check-package-artifacts-"));
  const declared = options.declared ?? PLATFORMS;
  const onDisk = options.onDisk ?? PLATFORMS;
  const rootText =
    options.rootText ??
    JSON.stringify(
      {
        name: "@opum-ai/lore",
        version: "0.7.0",
        optionalDependencies: Object.fromEntries(declared.map((p) => [`@opum-ai/lore-${p}`, "0.7.0"])),
      },
      null,
      2,
    );
  writeFileSync(join(root, "package.json"), `${rootText}\n`);
  mkdirSync(join(root, "npm"), { recursive: true });
  for (const platform of onDisk) {
    mkdirSync(join(root, "npm", platform), { recursive: true });
    const text =
      options.manifestText?.[platform] ??
      JSON.stringify((options.manifest?.[platform] ?? ((m) => m))(platformManifest(platform)), null, 2);
    writeFileSync(join(root, "npm", platform, "package.json"), `${text}\n`);
  }
  return root;
}

function run(root: string, ...args: string[]) {
  // `node`, not `process.execPath`: ci.yml and release.yml both invoke the script under node, and
  // a test that ran it under bun would be measuring a runtime neither call site uses.
  return spawnSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
}

describe("check-package-artifacts.mjs accepts", () => {
  test("a fixture whose npm/ directories match optionalDependencies exactly", () => {
    const root = fixture();
    const result = run(root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("holds exactly the 6 platform packages");
  });

  test("the same fixture when the release matrix names the same set", () => {
    const result = run(fixture(), "--platforms", PLATFORMS.join(" "));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("the real repository, which is what ci.yml gates", () => {
    const result = run(REPO_ROOT);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("the real repository against release.yml's matrix names, which is what release.yml gates", () => {
    // Read the names out of release.yml's setup job rather than restating them here, so this test
    // fails when the matrix and package.json drift — which is the release-side half of the gate.
    const setupRun = releaseWorkflow().jobs.setup?.steps?.find((s) => s.run?.includes("matrix="))?.run ?? "";
    const literal = /matrix='(\[.*\])'/.exec(setupRun)?.[1];
    expect(literal).toBeDefined();
    const names = (JSON.parse(literal as string) as Array<{ name: string }>).map((p) => p.name);
    const result = run(REPO_ROOT, "--platforms", names.join(" "));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("check-package-artifacts.mjs rejects, each for its own reason", () => {
  test("a declared platform whose npm/ directory is missing — the git add -A incident", () => {
    const root = fixture({ onDisk: PLATFORMS.filter((p) => p !== "win32-arm64") });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error::platform set mismatch");
    expect(result.stderr).toContain("@opum-ai/lore-win32-arm64");
    expect(result.stderr).toContain("npm/win32-arm64/ is missing");
    expect(result.stderr).toContain("git add -A");
  });

  test("a directory under npm/ that optionalDependencies does not declare", () => {
    const root = fixture({ onDisk: [...PLATFORMS, "freebsd-x64"] });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("npm/freebsd-x64/ exists, but root package.json optionalDependencies declares no");
  });

  test("every problem, not just the first — a missing AND an extra directory in one run", () => {
    const root = fixture({ onDisk: [...PLATFORMS.filter((p) => p !== "linux-x64"), "freebsd-x64"] });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("npm/linux-x64/ is missing");
    expect(result.stderr).toContain("npm/freebsd-x64/ exists");
    expect(result.stderr).toContain("2 platform package problem(s)");
  });

  test("a platform package.json that does not parse", () => {
    const root = fixture({ manifestText: { "linux-arm64": '{ "name": "@opum-ai/lore-linux-arm64", ' } });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${join("npm", "linux-arm64", "package.json")} does not parse`);
  });

  test("a platform directory with no package.json in it", () => {
    const root = fixture();
    rmSync(join(root, "npm", "darwin-x64", "package.json"));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${join("npm", "darwin-x64", "package.json")} is missing`);
  });

  test("a platform package whose name disagrees with its directory", () => {
    const root = fixture({ manifest: { "darwin-arm64": (m) => ({ ...m, name: "@opum-ai/lore-darwin-x64" }) } });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('name is "@opum-ai/lore-darwin-x64", expected "@opum-ai/lore-darwin-arm64"');
  });

  test("a platform package with no explicit files list", () => {
    const root = fixture({
      manifest: {
        "win32-x64": (m) => {
          const { files: _files, ...rest } = m;
          return rest;
        },
      },
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${join("npm", "win32-x64", "package.json")}: has no explicit "files" list`);
  });

  test("a platform package whose files list is empty", () => {
    const root = fixture({ manifest: { "linux-x64": (m) => ({ ...m, files: [] }) } });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"files" must be a non-empty list of non-empty strings, found []');
  });

  test("a release matrix that disagrees with optionalDependencies, in release.yml's own words", () => {
    const result = run(fixture(), "--platforms", "darwin-arm64 linux-x64");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "platform set mismatch: setup job declares [@opum-ai/lore-darwin-arm64, @opum-ai/lore-linux-x64], but root package.json optionalDependencies has [",
    );
  });

  test("a root package.json with no optionalDependencies at all", () => {
    const root = fixture({ rootText: JSON.stringify({ name: "@opum-ai/lore", version: "0.7.0" }) });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("optionalDependencies is undefined, so no platform package set is declared at all");
  });
});

describe("check-package-artifacts.mjs never passes a tree it could not evaluate", () => {
  test("npm/ missing entirely is a finding about the tree, exit 1, naming every declared package", () => {
    const root = fixture();
    rmSync(join(root, "npm"), { recursive: true });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not exist, so EVERY declared platform package is missing");
    expect(result.stderr).toContain("@opum-ai/lore-win32-arm64");
  });

  test("a root that is not a directory is exit 2 with an explicit not-a-pass message", () => {
    const result = run(join(tmpdir(), "lore-check-package-artifacts-does-not-exist"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not be evaluated");
    expect(result.stderr).toContain("not a pass");
  });

  test("a root package.json that does not parse is exit 2", () => {
    const root = fixture({ rootText: "{ not json" });
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not read");
  });

  test("an unknown argument is a usage error, exit 2", () => {
    const result = run(fixture(), "--bogus");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument: --bogus");
    expect(result.stderr).toContain("usage:");
  });
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}
interface WorkflowJob {
  if?: string;
  needs?: string[] | string;
  steps?: WorkflowStep[];
  "continue-on-error"?: boolean;
}
interface WorkflowDoc {
  on: Record<string, unknown>;
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(path: string): WorkflowDoc {
  return yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}
function releaseWorkflow(): WorkflowDoc {
  return loadWorkflow(RELEASE_WORKFLOW);
}

/** The standard ways of leaving a gate present but unable to stop anything (see release-workflow.test.ts). */
const NEUTERING_RUN_PATTERNS = [/\|\|\s*true/, /\|\|\s*:/, /;\s*true\s*$/m, /set\s+\+e/];

describe("the set assertion is ONE script invoked from two call sites", () => {
  test("package.json's check:packages runs the script", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["check:packages"]).toBe("node scripts/check-package-artifacts.mjs");
  });

  test("ci.yml runs check:packages on every pull request, ungated by any other job", () => {
    const doc = loadWorkflow(CI_WORKFLOW);
    expect(Object.keys(doc.on)).toContain("pull_request");
    const job = doc.jobs["package-set"];
    expect(job).toBeDefined();
    // No `needs:` — an upstream failure would make this context absent rather than red — and
    // no continue-on-error, which would let the workflow succeed past a red set.
    expect(job?.needs).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    const step = job?.steps?.find((s) => s.run?.includes("check:packages"));
    expect(step?.run?.trim()).toBe("bun run check:packages");
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(step?.run ?? "").not.toMatch(pattern);
  });

  test("release.yml's verify-versions job calls the same script with the matrix names", () => {
    const job = releaseWorkflow().jobs["verify-versions"];
    const step = job?.steps?.find((s) => s.run?.includes("scripts/check-package-artifacts.mjs"));
    expect(step).toBeDefined();
    expect(step?.run).toContain('--platforms "$PLATFORM_NAMES_SPACE"');
    expect(step?.env?.PLATFORM_NAMES_SPACE).toBe("${{ needs.setup.outputs.namesSpace }}");
    expect(job?.["continue-on-error"]).toBeUndefined();
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(step?.run ?? "").not.toMatch(pattern);
  });

  test("release.yml no longer carries its own inline copy of the set comparison", () => {
    // Two comparisons of the same set can disagree; the release-side one was the only one that
    // existed and it ran only on a manual dispatch. It moved into the script — so its inline
    // remnants must stay gone, or this reverts to two assertions that drift.
    const text = readFileSync(RELEASE_WORKFLOW, "utf8");
    expect(text).not.toContain("declaredPkgNames");
    expect(text).not.toContain("optionalDepNames");
  });
});

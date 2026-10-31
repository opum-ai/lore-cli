import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { packageBuildConfig, windowsReferenceOnlyLadybugPlugin } from "../benchmark/ladybug/package-build";
import {
  assertNoInheritedScriptApproval,
  assertNoInstallSecrets,
  assertNpmMajor,
  assertPackageQualificationReport,
  assertScriptApprovalConfigEmpty,
  boundedNativeProbeOutput,
  classifyWindowsProbeOutcome,
  flaglessGlobalInstall,
  INSTALL_SECRET_ENV_NAMES,
  isKnownNativeCrash,
  isProvenAbruptWindowsImportCrash,
  LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
  NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT,
  nativeIndexingProbeRefusalMessage,
  optionalPlatformEvidence,
  POSITIVE_CONTROL_ALLOW_SCRIPTS,
  packageCompileCommand,
  parsePackageQualificationArgs,
  proveUnapprovedScriptsBlocked,
  QUALIFICATION_DISTRIBUTIONS,
  readBackScriptApprovalPositiveControl,
  removeQualificationScratch,
  resolveInstalledOptionalPackageJson,
  resolveQualificationNpm,
  WINDOWS_ADDON_LOAD_FAILURE_MESSAGE,
  windowsAddonLoadFailurePolicyHolds,
  withoutInheritedScriptApproval,
  withoutInstallSecrets,
} from "../benchmark/ladybug/package-qualification";
import { LADYBUG_QUALIFICATION_PLATFORMS } from "../benchmark/ladybug/qualification-evidence";

const RELEASE_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");
const CI_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");
const SETUP_BUN_PATH = join(import.meta.dir, "..", ".github", "actions", "setup-bun", "action.yml");
const PACKAGE_BUILD_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "package-build.ts");
const PACKAGE_RUNNER_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "package-qualification.ts");
const NATIVE_PROBE_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "native-probe.ts");
const BACKLOG_SHIM_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "backlog-shim.ts");
const FIXTURE_CONTRACT_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "fixture-contract.ts");
const COMPILED_ENTRYPOINT_PATH = join(import.meta.dir, "..", "src", "compiled.ts");
const DOCKER_E2E_PATH = join(import.meta.dir, "..", "docker", "e2e", "Dockerfile");
const RELEASE_VERSION = (
  JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    version: string;
  }
).version;

interface WorkflowStep {
  id?: string;
  if?: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}

interface WorkflowJob {
  needs?: string | string[];
  "runs-on"?: string;
  "timeout-minutes"?: number;
  strategy?: { "fail-fast"?: boolean; matrix?: { include?: unknown } };
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  jobs: Record<string, WorkflowJob>;
}

interface MatrixEntry {
  name: string;
  target: string;
  binary: string;
  runner: string;
  os: string;
  cpu: string;
  ladybugPackage: string | null;
  ladybugIntegrity: string | null;
}

function loadWorkflow(): WorkflowDoc {
  return yaml.load(readFileSync(RELEASE_PATH, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

function releaseMatrix(doc: WorkflowDoc): MatrixEntry[] {
  const script = doc.jobs.setup?.steps?.find((step) => step.id === "matrix")?.run ?? "";
  const match = /matrix='([^']+)'/.exec(script);
  if (match?.[1] === undefined) throw new Error("release setup job is missing its matrix literal");
  return JSON.parse(match[1]) as MatrixEntry[];
}

function needs(job: WorkflowJob): string[] {
  return typeof job.needs === "string" ? [job.needs] : (job.needs ?? []);
}

describe("matching-host Ladybug package qualification", () => {
  test.skipIf(process.platform !== "win32")(
    "the published launcher reports the real compiled Lore version through synchronous redirected output",
    async () => {
      // The prefix is `lore-ladybug-package-` because `removeQualificationScratch`
      // refuses any path outside that convention — the guard is the reason it is
      // safe to hand a recursive delete a path computed at runtime.
      const root = mkdtempSync(join(tmpdir(), "lore-ladybug-package-windows-launcher-"));
      try {
        const node = Bun.which("node");
        if (node === null) throw new Error("test requires Node on PATH");
        const packageRoot = join(root, "node_modules", "@opum-ai", "lore");
        const platformRoot = join(root, "node_modules", "@opum-ai", `lore-win32-${process.arch}`);
        const launcher = join(packageRoot, "bin", "lore.cjs");
        const binary = join(platformRoot, "bin", "lore.exe");
        mkdirSync(join(packageRoot, "bin"), { recursive: true });
        mkdirSync(join(platformRoot, "bin"), { recursive: true });
        cpSync(join(import.meta.dir, "..", "bin", "lore.cjs"), launcher);
        writeFileSync(
          join(platformRoot, "package.json"),
          `${JSON.stringify({ name: `@opum-ai/lore-win32-${process.arch}`, version: RELEASE_VERSION })}\n`,
        );
        const target = process.arch === "arm64" ? "bun-windows-arm64" : "bun-windows-x64-baseline";
        const compileCommand = packageCompileCommand(join(import.meta.dir, ".."), root, target, binary);
        const compile = Bun.spawnSync([compileCommand.executable, ...compileCommand.args], {
          cwd: compileCommand.cwd,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 120_000,
        });
        expect(compile.exitCode, compile.stderr.toString()).toBe(0);

        const result = Bun.spawnSync([node, launcher, "--version"], {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 120_000,
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toBe(`${RELEASE_VERSION}\n`);
        expect(result.stderr.toString()).toBe("");
      } finally {
        // LCLI-564: a bare `rmSync` here threw `EBUSY: resource busy or locked` on
        // windows-latest while every assertion above had already passed, failing a
        // required context on a tree that was never at fault. Windows retains a
        // handle on the scratch tree briefly after the compiled launcher exits, so
        // the remove is what races, not the test. `removeQualificationScratch` is
        // the bounded linear-backoff remover this file already unit-tests directly
        // below, and it treats EBUSY as retryable; it also makes the tree writable
        // first, which a bare `rmSync` does not.
        await removeQualificationScratch(root);
      }
    },
  );

  test("retries temporary Windows-style scratch locks with bounded linear backoff", async () => {
    const root = mkdtempSync(join(tmpdir(), "lore-ladybug-package-retry-"));
    const delays: number[] = [];
    let attempts = 0;
    await removeQualificationScratch(root, {
      remove: (path) => {
        attempts++;
        if (attempts <= 2) {
          const error = new Error("locked") as NodeJS.ErrnoException;
          error.code = "EBUSY";
          throw error;
        }
        rmSync(path, { recursive: true, force: true });
      },
      delay: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 500]);
    expect(existsSync(root)).toBe(false);
  });

  test("the windows launcher scratch prefix is one removeQualificationScratch will accept", async () => {
    // LCLI-564's fix has a silent failure mode: `removeQualificationScratch` refuses
    // any path outside the `lore-ladybug-package-` convention, so renaming the
    // launcher test's scratch prefix back would turn its cleanup into an
    // unconditional throw rather than a retrying remove. Assert the two halves
    // together — the prefix in use is accepted, and a prefix outside the
    // convention is refused — so the pair fails loudly instead of drifting apart.
    const accepted = mkdtempSync(join(tmpdir(), "lore-ladybug-package-windows-launcher-"));
    await removeQualificationScratch(accepted);
    expect(existsSync(accepted)).toBe(false);

    const refused = mkdtempSync(join(tmpdir(), "lore-windows-launcher-test-"));
    try {
      await expect(removeQualificationScratch(refused)).rejects.toThrow(
        /refusing to remove an unexpected package-qualification scratch path/u,
      );
      expect(existsSync(refused)).toBe(true);
    } finally {
      rmSync(refused, { recursive: true, force: true });
    }
  });

  test("builds from same-drive scratch with an absolute repository entrypoint", () => {
    expect(
      packageCompileCommand("D:\\repo", "C:\\scratch", "bun-windows-x64-baseline", "C:\\scratch\\lore.exe"),
    ).toEqual({
      executable: "bun",
      args: [
        join("D:\\repo", "benchmark", "ladybug", "package-build.ts"),
        "--target=bun-windows-x64-baseline",
        "--outfile=C:\\scratch\\lore.exe",
        `--entrypoint=${join("D:\\repo", "src", "compiled.ts")}`,
      ],
      cwd: "C:\\scratch",
    });
    expect(packageCompileCommand("/repo", "/scratch", "bun-linux-arm64", "/scratch/lore").args).toEqual([
      join("/repo", "benchmark", "ladybug", "package-build.ts"),
      "--target=bun-linux-arm64",
      "--outfile=/scratch/lore",
      `--entrypoint=${join("/repo", "src", "compiled.ts")}`,
    ]);
    const windowsConfig = packageBuildConfig("src/compiled.ts", "bun-windows-x64-baseline", "dist/lore.exe");
    const nativeConfig = packageBuildConfig("src/compiled.ts", "bun-linux-arm64", "dist/lore");
    expect(windowsConfig.plugins).toEqual([windowsReferenceOnlyLadybugPlugin]);
    expect(nativeConfig.plugins).toEqual([]);
    expect(readFileSync(PACKAGE_BUILD_PATH, "utf8")).toContain("Ladybug native indexing is unavailable");
  });

  test("every compiled distribution uses the unconditional compiled entrypoint", () => {
    const rootPackage = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
      scripts?: { build?: string };
    };
    expect(rootPackage.scripts?.build).toContain("src/compiled.ts");
    expect(readFileSync(CI_PATH, "utf8")).toContain("bun build --compile src/compiled.ts --outfile dist/lore");
    expect(readFileSync(DOCKER_E2E_PATH, "utf8")).toContain(
      "bun build --compile src/compiled.ts --outfile /usr/local/bin/lore",
    );
    expect(readFileSync(COMPILED_ENTRYPOINT_PATH, "utf8")).toContain('import { main } from "./cli";');
    expect(readFileSync(COMPILED_ENTRYPOINT_PATH, "utf8")).toContain("await main();");
  });

  test("Windows ARM64 skips only unsupported dependency scripts during frozen setup", () => {
    const job = loadWorkflow().jobs["package-qualification"];
    const setup = job?.steps?.find((step) => step.uses === "./.github/actions/setup-bun");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
    expect(setup?.with?.["ignore-scripts"]).toBe("${{ matrix.name == 'win32-arm64' }}");

    const action = yaml.load(readFileSync(SETUP_BUN_PATH, "utf8"), { schema: yaml.JSON_SCHEMA }) as {
      inputs?: Record<string, { default?: string }>;
      runs?: { steps?: WorkflowStep[] };
    };
    expect(action.inputs?.["ignore-scripts"]?.default).toBe("false");
    const installSteps = action.runs?.steps?.filter((step) => step.run?.startsWith("bun install")) ?? [];
    expect(installSteps).toHaveLength(2);
    expect(installSteps.map((step) => step.if)).toEqual([
      "inputs.ignore-scripts != 'true'",
      "inputs.ignore-scripts == 'true'",
    ]);
    expect(installSteps[1]?.run).toEndWith("--ignore-scripts");
  });

  test("resolves an optional package from Bun's isolated store when no hoisted link exists", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-isolated-package-"));
    try {
      const coreRoot = join(root, "node_modules", "@ladybugdb", "core");
      const platformPackage = join(
        root,
        "node_modules",
        ".bun",
        "@ladybugdb+core-linux-x64@0.19.0",
        "node_modules",
        "@ladybugdb",
        "core-linux-x64",
        "package.json",
      );
      mkdirSync(coreRoot, { recursive: true });
      mkdirSync(join(platformPackage, ".."), { recursive: true });
      writeFileSync(join(coreRoot, "package.json"), "{}\n");
      writeFileSync(platformPackage, "{}\n");

      expect(resolveInstalledOptionalPackageJson(root, coreRoot, "@ladybugdb/core-linux-x64", "0.19.0")).toBe(
        platformPackage,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("all supported distributions map to their approved matching hosts", () => {
    const matrix = releaseMatrix(loadWorkflow());
    expect(matrix.map(({ name, runner, os, cpu }) => ({ name, runner, os, cpu }))).toEqual([
      { name: "darwin-arm64", runner: "macos-15", os: "darwin", cpu: "arm64" },
      { name: "darwin-x64", runner: "macos-15-intel", os: "darwin", cpu: "x64" },
      { name: "linux-arm64", runner: "ubuntu-24.04-arm", os: "linux", cpu: "arm64" },
      { name: "linux-x64", runner: "ubuntu-24.04", os: "linux", cpu: "x64" },
      { name: "win32-arm64", runner: "windows-11-arm", os: "win32", cpu: "arm64" },
      { name: "win32-x64", runner: "windows-latest", os: "win32", cpu: "x64" },
    ]);
    expect(matrix.map((entry) => entry.target)).toEqual([
      "bun-darwin-arm64",
      "bun-darwin-x64-baseline",
      "bun-linux-arm64",
      "bun-linux-x64-baseline",
      "bun-windows-arm64",
      "bun-windows-x64-baseline",
    ]);
    expect(matrix.map((entry) => entry.binary)).toEqual(["lore", "lore", "lore", "lore", "lore.exe", "lore.exe"]);
  });

  test("every host records the exact Ladybug addon, or its explicit Windows ARM64 absence", () => {
    const matrix = releaseMatrix(loadWorkflow());
    for (const entry of matrix) {
      if (entry.name === "win32-arm64") {
        expect(entry.ladybugPackage).toBeNull();
        expect(entry.ladybugIntegrity).toBeNull();
        continue;
      }
      expect(entry.ladybugPackage).toBe(`@ladybugdb/core-${entry.os}-${entry.cpu}`);
      expect(entry.ladybugIntegrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
      const lock = readFileSync(join(import.meta.dir, "..", "bun.lock"), "utf8");
      const line = lock.split("\n").find((candidate) => candidate.trimStart().startsWith(`"${entry.ladybugPackage}":`));
      expect(line).toContain(`${entry.ladybugPackage}@0.19.0`);
      expect(line).toContain(entry.ladybugIntegrity as string);
    }
  });

  test("one matching-host matrix job runs the shared frozen install and complete runner contract", () => {
    const job = loadWorkflow().jobs["package-qualification"];
    expect(job).toBeDefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
    expect(job?.["runs-on"]).toBe("${{ matrix.runner }}");
    expect(job?.["timeout-minutes"]).toBe(60);
    expect(job?.strategy?.["fail-fast"]).toBe(false);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
    expect(job?.strategy?.matrix?.include).toBe("${{ fromJson(needs.setup.outputs.matrix) }}");
    expect(needs(job as WorkflowJob)).toEqual([
      "setup",
      "verify-versions",
      "ladybug-qualification",
      "ladybug-concurrency-qualification",
    ]);
    expect(job?.steps?.some((step) => step.uses === "./.github/actions/setup-bun")).toBe(true);

    const command = job?.steps?.find((step) => step.run?.includes("package-qualification.ts"))?.run ?? "";
    for (const flag of [
      "--name",
      "--target",
      "--binary",
      "--os",
      "--cpu",
      "--ladybug-package",
      "--ladybug-integrity",
      "--output",
    ]) {
      expect(command).toContain(flag);
    }
    expect(command).not.toContain("--runtime-mode");
    const verdict = job?.steps?.find((step) => step.run?.includes("approved native support policy"));
    expect(verdict?.env).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
      REPORT_PATH: "artifacts/ladybug-package-qualification-${{ matrix.name }}.json",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
      EXPECTED_OS: "${{ matrix.os }}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
      EXPECTED_CPU: "${{ matrix.cpu }}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
      EXPECTED_COMMIT: "${{ github.sha }}",
    });
    expect(verdict?.run).toContain('report.mode !== "qualification"');
    expect(verdict?.run).toContain('report.native.supportClaim !== "reference-fallback-only"');
    expect(verdict?.run).toContain('report.native.supportClaim !== "native-index"');
    expect(verdict?.run).toContain("report.native.referenceFallbackDatabaseAbsent !== true");
    expect(verdict?.run).toContain("report.repository.commit !== process.env.EXPECTED_COMMIT");
    const upload = job?.steps?.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.if).toBe("always()");
    expect(upload?.with?.path).toBe("artifacts/");
    expect(upload?.with?.["retention-days"]).toBe(90);
  });

  test("the canonical package and publish chain cannot bypass matching-host qualification", () => {
    const jobs = loadWorkflow().jobs;
    expect(jobs.build).toBeUndefined();
    expect(needs(jobs.package as WorkflowJob)).toContain("package-qualification");
    expect(needs(jobs.package as WorkflowJob)).toContain("ladybug-qualification-evidence");
    expect(needs(jobs.publish as WorkflowJob)).toContain("package");

    const download = jobs.package?.steps?.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    // The pattern carries run_id and NOT run_attempt (LCLI-487). An attempt-suffixed name
    // cannot be resolved by a consumer running on a later attempt, which made
    // `gh run rerun --failed` structurally unusable on this workflow.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
    const qualificationPattern = "ladybug-package-qualification-*-${{ github.run_id }}";
    expect(download?.with?.pattern).toBe(qualificationPattern);
    expect(download?.with?.pattern).not.toContain("run_attempt");
    const assembly = jobs.package?.steps?.find((step) => step.name?.includes("matching-host-qualified"))?.run ?? "";
    expect(assembly).toContain('const digest = `sha256:${createHash("sha256")');
    expect(assembly).toContain("report.package?.platformTarballSha256 !== digest");
    expect(assembly).toContain("report.repository?.commit !== process.env.EXPECTED_COMMIT");
    expect(assembly).toContain('cp "$tarball" dist-npm/');
    expect(assembly).not.toContain("npm-artifacts/lore-");
  });

  test("no artifact name embeds run_attempt, and every upload sets overwrite (LCLI-487)", () => {
    // BOTH workflows, not just release.yml. ci.yml carried two instances of exactly these
    // bugs — an attempt-suffixed benchmark-smoke name, and a docker-e2e-report upload with no
    // overwrite from an `if: always()` step in a job that is one of the four REQUIRED contexts
    // on dev. A partial re-run of that job would have failed on
    // upload-artifact's duplicate-name error at its last step, turning a required check red
    // even when the harness passed. An invariant that only reads release.yml cannot see that.
    // These two invariants are a pair and neither is safe alone. Dropping the attempt from
    // the names is what lets a consumer on attempt 2 resolve a producer that succeeded on
    // attempt 1; `overwrite: true` is what stops a RE-running producer colliding with the
    // copy that survived, since artifacts are scoped to the run rather than the attempt and
    // upload-artifact v4 fails on a duplicate name. Reintroduce the suffix to "fix" such a
    // collision and the evidence job silently goes back to being unresolvable on any partial
    // re-run — which is exactly how this was written in the first place.
    for (const path of [RELEASE_PATH, CI_PATH]) {
      const workflow = yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
      const uploads: { name: unknown; overwrite: unknown }[] = [];
      for (const [, job] of Object.entries(workflow.jobs ?? {})) {
        for (const step of (job as WorkflowJob)?.steps ?? []) {
          if (!step.uses?.startsWith("actions/upload-artifact@")) continue;
          uploads.push({ name: step.with?.name, overwrite: step.with?.overwrite });
        }
      }
      expect(uploads.length).toBeGreaterThan(0);
      for (const upload of uploads) {
        expect(`${upload.name}`).not.toContain("run_attempt");
        // `overwrite` is the invariant, NOT a run id in the name: artifacts are scoped to the
        // run, so a fixed name cannot collide across runs. `npm-packages` and
        // `docker-e2e-report` are both deliberately fixed and are correct as they are.
        expect(upload.overwrite).toBe(true);
      }

      for (const [, job] of Object.entries(workflow.jobs ?? {})) {
        for (const step of (job as WorkflowJob)?.steps ?? []) {
          if (!step.uses?.startsWith("actions/download-artifact@")) continue;
          expect(`${step.with?.name ?? ""}${step.with?.pattern ?? ""}`).not.toContain("run_attempt");
        }
      }
    }
  });

  test("the runner argument contract is strict and integrity-bearing", () => {
    const parsed = parsePackageQualificationArgs([
      "--name",
      "linux-x64",
      "--target",
      "bun-linux-x64-baseline",
      "--binary",
      "lore",
      "--os",
      "linux",
      "--cpu",
      "x64",
      "--ladybug-package",
      "@ladybugdb/core-linux-x64",
      "--ladybug-integrity",
      "sha512-YWJjZA==",
      "--output",
      "artifacts/report.json",
    ]);
    expect(parsed.name).toBe("linux-x64");
    expect(parsed.mode).toBe("qualification");
    expect(parsed.output).toEndWith(join("artifacts", "report.json"));
    expect(
      parsePackageQualificationArgs([
        "--name",
        "win32-arm64",
        "--target",
        "bun-windows-arm64",
        "--binary",
        "lore.exe",
        "--os",
        "win32",
        "--cpu",
        "arm64",
        "--ladybug-package",
        "",
        "--ladybug-integrity",
        "",
        "--output",
        "artifacts/report.json",
      ]).ladybugPackage,
    ).toBeNull();
    expect(() => parsePackageQualificationArgs(["--name", "linux-x64", "--unknown", "value"])).toThrow(
      "unknown package qualification argument",
    );
    expect(() =>
      parsePackageQualificationArgs([
        "--name",
        "linux-x64",
        "--target",
        "target",
        "--binary",
        "lore",
        "--os",
        "linux",
        "--cpu",
        "x64",
        "--ladybug-package",
        "package",
        "--ladybug-integrity",
        "sha256:nope",
        "--output",
        "report.json",
      ]),
    ).toThrow("sha512 SRI");
  });

  /** DEC-240 (a5) item 4: the report's evidence for an install on one host: five packuments, no tarball. */
  const platformEvidence = (distribution: string) => ({
    installed: ["lore", `lore-${distribution}`],
    registryReads: QUALIFICATION_DISTRIBUTIONS.filter((name) => name !== distribution).map((name) => ({
      status: 200,
      kind: "packument" as const,
      url: `https://registry.npmjs.org/@opum-ai%2flore-${name}`,
    })),
  });
  const scriptApprovalConfig = {
    allowScripts: "undefined",
    dangerouslyAllowAllScripts: "false",
    positiveControl: POSITIVE_CONTROL_ALLOW_SCRIPTS,
  };

  test("only a report with every cleanup and preservation assertion passes", () => {
    const report = {
      schema: LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
      mode: "qualification",
      platform: { bun: "1.3.14", os: "linux", cpu: "x64", distribution: "linux-x64", npm: "12.2.1" },
      repository: { commit: "a".repeat(40) },
      ladybug: {
        core: "0.19.0",
        optionalPackage: "@ladybugdb/core-linux-x64",
        lockIntegrity: "sha512-YWJjZA==",
        addonSha256: `sha256:${"b".repeat(64)}`,
        installedCoreAbsent: true,
        embeddedNativeIndexVerified: true,
      },
      package: {
        globalInstallScriptPolicyClean: true,
        globalLauncherSmoke: true,
        scriptBlockingProof: { npm: "12.2.1", fixtureScriptRan: false, reported: true },
        scriptApprovalConfig,
        optionalPlatformPackages: platformEvidence("linux-x64"),
      },
      smoke: { outputsStable: true },
      native: {
        supportClaim: "native-index",
        probeOutcome: "pass",
        addonLoadFailureMessage: null,
        databaseCreated: true,
        executableEvidence: true,
        commandOutputsStable: true,
        referenceFallbackDatabaseAbsent: null,
      },
      cleanup: {
        launcherRemoved: true,
        packagesRemoved: true,
        addonRemoved: true,
        installScratchRemoved: true,
        isolatedGlobalClean: true,
        repositoryCachePreservedByUninstall: true,
        explicitCacheDisposalSucceeded: true,
        repositorySourcesPreserved: true,
      },
    };
    expect(() => assertPackageQualificationReport(report)).not.toThrow();
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        cleanup: { ...report.cleanup, repositoryCachePreservedByUninstall: false },
      }),
    ).toThrow("not a conclusive cleanup pass");
    // DEC-240 (a5): the npm on the record must be exactly major 12, and the proof must agree with it.
    expect(() =>
      assertPackageQualificationReport({ ...report, platform: { ...report.platform, npm: "11.19.0" } }),
    ).toThrow("is not major 12");
    expect(() =>
      assertPackageQualificationReport({ ...report, platform: { ...report.platform, npm: undefined } }),
    ).toThrow("not a version");
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          scriptBlockingProof: { ...report.package.scriptBlockingProof, fixtureScriptRan: true },
        },
      }),
    ).toThrow("blocked and reported");
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: { ...report.package, scriptBlockingProof: { ...report.package.scriptBlockingProof, npm: "12.0.0" } },
      }),
    ).toThrow("blocked and reported");
    expect(() =>
      assertPackageQualificationReport({ ...report, package: { ...report.package, scriptBlockingProof: undefined } }),
    ).toThrow("blocked and reported");
    // DEC-240 (a5) item 2 is npm-12, not "12 or later": a later major is a new ruling, so the record refuses it.
    expect(() =>
      assertPackageQualificationReport({ ...report, platform: { ...report.platform, npm: "13.0.0" } }),
    ).toThrow("is not major 12");
    // DEC-240 (a5) item 3: the readback is only meaningful with a live positive control.
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          scriptApprovalConfig: { ...scriptApprovalConfig, positiveControl: "undefined" },
        },
      }),
    ).toThrow("positive control came back");
    expect(() =>
      assertPackageQualificationReport({ ...report, package: { ...report.package, scriptApprovalConfig: undefined } }),
    ).toThrow("script-approval config readback");
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          scriptApprovalConfig: { ...scriptApprovalConfig, allowScripts: '["esbuild"]' },
        },
      }),
    ).toThrow("allow-scripts");
    // DEC-240 (a5) item 4: the global scope, the tarballs, and the five packuments, each scored on the record.
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          optionalPlatformPackages: { ...platformEvidence("linux-x64"), installed: ["lore", "lore-linux-arm64"] },
        },
      }),
    ).toThrow("expected exactly");
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          optionalPlatformPackages: {
            ...platformEvidence("linux-x64"),
            registryReads: [
              ...platformEvidence("linux-x64").registryReads,
              {
                status: 200,
                kind: "tarball" as const,
                url: "https://registry.npmjs.org/@opum-ai/lore-darwin-x64/-/x.tgz",
              },
            ],
          },
        },
      }),
    ).toThrow("fetched @opum-ai tarballs");
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        package: {
          ...report.package,
          optionalPlatformPackages: {
            ...platformEvidence("linux-x64"),
            registryReads: platformEvidence("linux-x64").registryReads.filter(
              (read) => !read.url.includes("lore-darwin-x64"),
            ),
          },
        },
      }),
    ).toThrow("read no packument for darwin-x64");
    expect(() =>
      assertPackageQualificationReport({ ...report, platform: { ...report.platform, distribution: undefined } }),
    ).toThrow("not one of the six host distributions");

    const windowsFallback = {
      ...report,
      platform: { bun: "1.3.14", os: "win32", cpu: "x64", distribution: "win32-x64", npm: "12.2.1" },
      package: { ...report.package, optionalPlatformPackages: platformEvidence("win32-x64") },
      ladybug: { ...report.ladybug, embeddedNativeIndexVerified: false },
      native: {
        ...report.native,
        supportClaim: "reference-fallback-only",
        probeOutcome: "crash",
        databaseCreated: false,
        executableEvidence: false,
        referenceFallbackDatabaseAbsent: true,
      },
    };
    expect(() => assertPackageQualificationReport(windowsFallback)).not.toThrow();
    const windowsArmFallback = {
      ...windowsFallback,
      platform: { bun: "1.3.14", os: "win32", cpu: "arm64", distribution: "win32-arm64", npm: "12.2.1" },
      package: {
        ...windowsFallback.package,
        optionalPlatformPackages: platformEvidence("win32-arm64"),
      },
      ladybug: {
        core: "0.19.0",
        optionalPackage: null,
        lockIntegrity: null,
        addonSha256: null,
        installedCoreAbsent: true,
        embeddedNativeIndexVerified: false,
      },
      native: {
        ...windowsFallback.native,
        probeMode: "unavailable",
        probeOutcome: "unavailable",
        exitCode: null,
      },
    };
    expect(() => assertPackageQualificationReport(windowsArmFallback)).not.toThrow();
    expect(() =>
      assertPackageQualificationReport({
        ...windowsFallback,
        native: { ...windowsFallback.native, supportClaim: "native-index" },
      }),
    ).toThrow("approved native platform verdict");

    // LCLI-657 / DEC-80, through the VALIDATOR rather than the predicate: the recorded win32-x64
    // load failure is a report the suite accepts, and each of the ruling's refused shapes is one
    // it rejects. This is the wiring check the predicate's own unit test cannot make.
    const windowsLoadFailure = {
      ...windowsFallback,
      native: {
        ...windowsFallback.native,
        probeOutcome: "unavailable",
        addonLoadFailureMessage: WINDOWS_ADDON_LOAD_FAILURE_MESSAGE,
      },
    };
    expect(() => assertPackageQualificationReport(windowsLoadFailure)).not.toThrow();
    const refused = (native: Record<string, unknown>) =>
      expect(() => assertPackageQualificationReport({ ...windowsLoadFailure, native: { ...native } })).toThrow(
        "approved native platform verdict",
      );
    refused({ ...windowsLoadFailure.native, addonLoadFailureMessage: null }); // nothing recorded
    refused({ ...windowsLoadFailure.native, addonLoadFailureMessage: "LoadLibrary failed: other" });
    refused({ ...windowsLoadFailure.native, probeOutcome: "crash" }); // failure recorded beside a crash
    expect(() =>
      assertPackageQualificationReport({
        ...windowsLoadFailure,
        platform: { bun: "1.3.14", os: "win32", cpu: "arm64", distribution: "win32-arm64", npm: "12.2.1" },
        package: { ...windowsLoadFailure.package, optionalPlatformPackages: platformEvidence("win32-arm64") },
      }),
    ).toThrow("approved native platform verdict"); // the same shape on another platform

    // And the policy is consulted for EVERY platform, not only inside the win32 arm. This report
    // is the base linux fixture -- otherwise valid, native-index, probeOutcome pass -- carrying
    // only the recorded message. With the policy consulted inside the win32 arm alone, nothing
    // would catch it; a peer review measured exactly that gap.
    expect(() =>
      assertPackageQualificationReport({
        ...report,
        native: { ...report.native, addonLoadFailureMessage: WINDOWS_ADDON_LOAD_FAILURE_MESSAGE },
      }),
    ).toThrow("approved native platform verdict");
  });

  test("native indexing and Windows fallback evidence stay process-isolated and explicit", () => {
    const runner = readFileSync(PACKAGE_RUNNER_PATH, "utf8");
    const probe = readFileSync(NATIVE_PROBE_PATH, "utf8");
    const backlogShim = readFileSync(BACKLOG_SHIM_PATH, "utf8");
    const fixtureContract = readFileSync(FIXTURE_CONTRACT_PATH, "utf8");
    expect(runner).toContain('input.os === "win32" ? "import" : "indexed"');
    expect(runner).toContain("child.signalCode");
    expect(runner).toContain("isKnownNativeCrash");
    expect(runner).toContain("referenceFallbackDatabaseAbsent");
    expect(runner).toContain("commandOutputsStable");
    expect(runner).toContain("createFixtureBacklogEnvironment");
    expect(runner).toContain("flaglessGlobalInstall(npm, npmEnvironment, scratch, [");
    expect(runner).toContain("installedRootTarball");
    expect(runner).toContain("assertTarballUnderRoot(root, tarball)");
    expect(runner).toContain("assertNoInstallScriptApproval");
    expect(runner).toContain("embeddedNativeIndexVerified");
    expect(runner).toContain("initializeFixtureGitRepository");
    expect(runner).toContain("backlog-shim.ts");
    expect(backlogShim).toContain('process.stdout.write("1.49.0\\n")');
    expect(backlogShim).toContain('args[0] === "task"');
    expect(backlogShim).toContain('kind: "task-list"');
    expect(backlogShim).toContain('from "./fixture-contract"');
    expect(backlogShim).not.toContain('from "./fixture"');
    expect(fixtureContract).not.toMatch(/^import /m);
    expect(probe).toContain("loadLadybugNativeDriver");
    expect(probe).toContain("NATIVE_IMPORT_STARTED_FILENAME");
    expect(probe).toContain("NATIVE_IMPORT_COMPLETED_FILENAME");
    expect(probe).toContain("NATIVE_IMPORT_FAILED_FILENAME");
    expect(probe).not.toContain('from "@ladybugdb/core"');
    expect(probe).toContain('if (mode === "import")');
    expect(probe).toContain("buildLadybugDatabase");
    expect(probe).toContain("verifyLadybugDatabase");
    expect(probe).toContain("readLadybugBundleGraph");
    expect(isKnownNativeCrash(139, null)).toBe(true);
    expect(isKnownNativeCrash(-1_073_741_819, null)).toBe(true);
    expect(isKnownNativeCrash(3_221_225_477, null)).toBe(true);
    expect(isKnownNativeCrash(0, "SIGSEGV")).toBe(true);
    expect(isKnownNativeCrash(1, null)).toBe(false);
    expect(
      isProvenAbruptWindowsImportCrash({
        exitCode: 1,
        signal: null,
        importStarted: true,
        importCompleted: false,
        importFailed: false,
      }),
    ).toBe(true);
    expect(
      isProvenAbruptWindowsImportCrash({
        exitCode: 1,
        signal: null,
        importStarted: true,
        importCompleted: false,
        importFailed: true,
      }),
    ).toBe(false);
    expect(
      isProvenAbruptWindowsImportCrash({
        exitCode: 1,
        signal: null,
        importStarted: true,
        importCompleted: true,
        importFailed: false,
      }),
    ).toBe(false);
    expect(
      isProvenAbruptWindowsImportCrash({
        exitCode: 0,
        signal: "SIGSEGV",
        importStarted: true,
        importCompleted: false,
        importFailed: false,
      }),
    ).toBe(true);
  });

  test("the Windows refusal decision refuses a deliberate rejection and names what it measured (LCLI-657)", () => {
    // Drives the DECISION, not the source: a peer review showed the first revision asserted these
    // fragments in the runner's text, which stayed green while the refusal lost the property (the
    // marker fragment parked in the sibling refusal; the excerpt parked in a comment). The same
    // review then showed the follow-up wiring regex pinned only the callee's NAME -- a shadowed
    // binding or a decoy in a comment satisfied it. So the transition itself is a value now.
    const win32x64 = { os: "win32" as const, cpu: "x64" };
    // A rejection that is NOT the one documented load failure. The real captured stderr is now
    // the ACCEPTED shape on win32-x64 (DEC-80), so it lives in its own test below; using it here
    // would test the carve-out while claiming to test the refusal.
    const refusal = classifyWindowsProbeOutcome(
      {
        exitCode: 1,
        signal: null,
        importStarted: true,
        importCompleted: false,
        importFailed: true,
        stdoutSha256: `sha256:${"e3b0".repeat(16)}`,
        stderrSha256: `sha256:${"da81".repeat(16)}`,
        stderr: "Error: the fixture could not be opened\n    at probe (native-probe.ts:40)",
      },
      win32x64,
    );
    expect(refusal.kind).toBe("refused");
    if (refusal.kind !== "refused") throw new Error("unreachable");
    expect(refusal.message).toContain("exit=1, signal=none");
    expect(refusal.message).toContain("markers={started:true, completed:false, failed:true}");
    expect(refusal.message).toContain(`stdout=sha256:${"e3b0".repeat(16)}`);
    expect(refusal.message).toContain(`stderr=sha256:${"da81".repeat(16)}`);
    expect(refusal.message).toContain("the fixture could not be opened");
    expect(refusal.message).toContain("at probe (native-probe.ts:40)");
    // The excerpt is JSON-quoted and therefore still ONE log line: a raw multi-line excerpt would
    // scatter the refusal across the log and break every consumer of a single-line message.
    expect(refusal.message).toContain('stderrExcerpt="');
    expect(refusal.message).not.toContain("\n");

    // The classifier is TOTAL over the policy's outcomes: a clean import and a proven abrupt
    // stop must come back as themselves and not as refusals, or the refusal text above would
    // never be reached in practice. An earlier form of it handled only the two non-clean arms,
    // so a clean import classified as a REFUSAL -- this assertion is what caught that.
    const kindOf = (evidence: Parameters<typeof classifyWindowsProbeOutcome>[0]) =>
      classifyWindowsProbeOutcome(evidence, win32x64).kind;
    expect(
      kindOf({
        exitCode: 0,
        signal: null,
        importStarted: true,
        importCompleted: true,
        importFailed: false,
        stdoutSha256: "sha256:clean",
        stderrSha256: "sha256:empty",
        stderr: "",
      }),
    ).toBe("clean-import");
    expect(
      kindOf({
        exitCode: 1,
        signal: null,
        importStarted: true,
        importCompleted: false,
        importFailed: false,
        stdoutSha256: "sha256:empty",
        stderrSha256: "sha256:empty",
        stderr: "",
      }),
    ).toBe("proven-abrupt-stop");
    // A ZERO exit with an incomplete marker set stays `clean-import` -- the classifier answers
    // "which arm", and that arm's own marker check is what rejects it ("Windows native import
    // markers are incomplete"). Pinned because the earlier two-arm form got this wrong in the
    // other direction, and because the refusal is only for an outcome the policy has no arm for.
    expect(
      kindOf({
        exitCode: 0,
        signal: null,
        importStarted: true,
        importCompleted: false,
        importFailed: true,
        stdoutSha256: "sha256:empty",
        stderrSha256: "sha256:failed",
        stderr: "import failed",
      }),
    ).toBe("clean-import");
  });

  test("the win32-x64 add-on load failure is accepted in exactly one shape and refused in every other (DEC-80)", () => {
    // The operator's ruling, as the acceptance it names: on win32-x64 ONLY, accept the verdict
    // when stderr carries the exact add-on load-failure message; record that message in the
    // report; refuse every other shape. Each refusal below is one the ruling names explicitly.
    const win32x64 = { os: "win32" as const, cpu: "x64" };
    // Transcribed from the captured run, NOT read from the constant, so that a drifted constant
    // reddens these tests instead of riding along with them. This literal is the second,
    // independent declaration of the accepted bytes.
    const documentedMessage = "LoadLibrary failed: A dynamic link library (DLL) initialization routine failed.";
    expect(WINDOWS_ADDON_LOAD_FAILURE_MESSAGE).toBe(documentedMessage);
    const loadFailure = `Error: ${documentedMessage}\n    at dlopen (unknown)\n    at lbug_native.js:12:8`;
    const rejected = (stderr: string) => ({
      exitCode: 1,
      signal: null,
      importStarted: true,
      importCompleted: false,
      importFailed: true,
      stdoutSha256: "sha256:empty",
      stderrSha256: "sha256:failed",
      stderr,
    });

    const accepted = classifyWindowsProbeOutcome(rejected(loadFailure), win32x64);
    expect(accepted.kind).toBe("addon-load-unavailable");
    if (accepted.kind !== "addon-load-unavailable") throw new Error("unreachable");
    expect(accepted.message).toBe(documentedMessage);

    // A DIFFERENT message, refused -- including one that merely CONTAINS the documented text.
    // The match is the child's own first line, which is what makes the carve-out narrow enough
    // to be worth having: a substring match would accept an unrelated failure that named LoadLibrary.
    expect(classifyWindowsProbeOutcome(rejected("Error: something else went wrong"), win32x64).kind).toBe("refused");
    expect(
      classifyWindowsProbeOutcome(rejected(`Error: wrapper\n${WINDOWS_ADDON_LOAD_FAILURE_MESSAGE}`), win32x64).kind,
    ).toBe("refused");

    // A DIFFERENT platform, refused: the same bytes on win32-arm64 and on linux.
    expect(classifyWindowsProbeOutcome(rejected(loadFailure), { os: "win32", cpu: "arm64" }).kind).toBe("refused");
    expect(classifyWindowsProbeOutcome(rejected(loadFailure), { os: "linux", cpu: "x64" }).kind).toBe("refused");

    // SUCCESS where unavailable is expected can never be reported as a load failure: a clean
    // import is classified before the carve-out is ever consulted.
    expect(
      classifyWindowsProbeOutcome(
        { ...rejected(loadFailure), exitCode: 0, importCompleted: true, importFailed: false },
        win32x64,
      ).kind,
    ).toBe("clean-import");

    // A first line that CONTAINS the message with a suffix is NOT the message. The match is an
    // equality against the child's own line, so a future loosening to a first-line `includes` --
    // which would accept "Error: <message> (error 1114)" -- reddens here. A peer review measured
    // that loosening surviving the suite before this case existed.
    expect(classifyWindowsProbeOutcome(rejected(`Error: ${documentedMessage} (error 1114)`), win32x64).kind).toBe(
      "refused",
    );

    // CRLF IS tolerated, deliberately: the child may run on a host that translates line endings.
    // Pinned so the tolerance is a decision rather than an accident -- a peer review listed it as
    // accepted-but-untested, which is the state that lets a later edit remove it unnoticed.
    expect(classifyWindowsProbeOutcome(rejected(`Error: ${documentedMessage}\r\n    at dlopen`), win32x64).kind).toBe(
      "addon-load-unavailable",
    );

    // The MARKER SET is part of "exactly one shape". Each case below carries the documented
    // message and is neither clean nor a proven crash; none may reach the carve-out. The
    // observed shape is the catch handler's signature -- started, not completed, failed --
    // and before this was pinned, `importCompleted: true` (an import that SUCCEEDED) classified
    // as a load failure. A peer review measured that whole family.
    const markerKind = (over: Partial<Parameters<typeof classifyWindowsProbeOutcome>[0]>) =>
      classifyWindowsProbeOutcome({ ...rejected(loadFailure), ...over }, win32x64).kind;
    expect(markerKind({ importCompleted: true })).toBe("refused");
    expect(markerKind({ importStarted: false })).toBe("refused");
    // Without the failed marker the CRASH arm matches instead, which is a legitimate outcome --
    // the assertion that matters is that it is not the carve-out.
    expect(markerKind({ importFailed: false })).toBe("proven-abrupt-stop");
    // The EXIT CODE and SIGNAL are not part of the boundary, and the test says so rather than
    // leaving it to be re-derived: DEC-80 keys the acceptance on the message, and the markers
    // prove the catch handler ran. A peer review flagged this family as "accepted beyond the
    // documented shape"; it is accepted ON PURPOSE, and this pins the decision either way.
    expect(markerKind({ exitCode: 139 })).toBe("addon-load-unavailable");
    expect(markerKind({ exitCode: -1_073_741_819 })).toBe("addon-load-unavailable");
    expect(markerKind({ exitCode: 0, signal: "SIGSEGV" })).toBe("addon-load-unavailable");

    // The REPORT-side policy, total in both directions.
    const policy = (
      probeOutcome: string,
      addonLoadFailureMessage: string | null,
      platform: { os: NodeJS.Platform; cpu: string } = win32x64,
    ) => windowsAddonLoadFailurePolicyHolds({ ...platform, probeOutcome, addonLoadFailureMessage });
    expect(policy("unavailable", WINDOWS_ADDON_LOAD_FAILURE_MESSAGE)).toBe(true);
    expect(policy("unavailable", null)).toBe(false); // claims the carve-out with nothing recorded
    expect(policy("pass", WINDOWS_ADDON_LOAD_FAILURE_MESSAGE)).toBe(false); // success carrying a failure
    expect(policy("crash", WINDOWS_ADDON_LOAD_FAILURE_MESSAGE)).toBe(false);
    expect(policy("unavailable", "LoadLibrary failed: something else")).toBe(false); // different message
    expect(policy("unavailable", WINDOWS_ADDON_LOAD_FAILURE_MESSAGE, { os: "win32", cpu: "arm64" })).toBe(false); // different platform
    expect(policy("unavailable", WINDOWS_ADDON_LOAD_FAILURE_MESSAGE, { os: "linux", cpu: "x64" })).toBe(false);
    // And the shapes that carry no message stay valid, so the carve-out does not narrow them.
    expect(policy("unavailable", null, { os: "win32", cpu: "arm64" })).toBe(true); // the ARM64 absence
    expect(policy("crash", null)).toBe(true);
    expect(policy("pass", null)).toBe(true);
  });

  test("the sibling non-Windows refusal names what its child said too (LCLI-657)", () => {
    // This branch lost its only coverage when the Windows assertions were scoped to the Windows
    // builder -- a peer review measured that deleting its excerpt reddened nothing.
    const message = nativeIndexingProbeRefusalMessage({
      exitCode: 3,
      signal: null,
      stdoutSha256: `sha256:${"11".repeat(32)}`,
      stderrSha256: `sha256:${"22".repeat(32)}`,
      // The sample carries a NEWLINE on purpose: an excerpt rendered without JSON.stringify is
      // still "found" by a substring assertion, so a single-line sample cannot tell the escaping
      // from its absence -- a peer review measured exactly that hole on this branch.
      stderr: "native probe could not open its fixture\n    at runNativeProbe (native-probe.ts:88)",
    });
    expect(message).toContain("exit=3, signal=none");
    expect(message).toContain(`stdout=sha256:${"11".repeat(32)}`);
    expect(message).toContain(`stderr=sha256:${"22".repeat(32)}`);
    expect(message).toContain("native probe could not open its fixture");
    expect(message).toContain("at runNativeProbe (native-probe.ts:88)");
    expect(message).toContain('stderrExcerpt="');
    expect(message).not.toContain("\n");
  });

  test("the bounded excerpt keeps both ends and claims only the elision it did (LCLI-657)", () => {
    const long = `${"H".repeat(2_500)}${"T".repeat(2_500)}`;
    const excerpt = boundedNativeProbeOutput(long);
    expect(excerpt.startsWith("H".repeat(NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT / 2))).toBe(true);
    expect(excerpt.endsWith("T".repeat(NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT / 2))).toBe(true);
    expect(excerpt).toContain("[1000 UTF-16 code units elided]");

    // Under the limit nothing is dropped and nothing is claimed.
    expect(boundedNativeProbeOutput("short")).toBe("short");
    expect(boundedNativeProbeOutput("x".repeat(NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT))).toBe(
      "x".repeat(NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT),
    );

    // An ODD limit must not understate what was dropped, and a limit below 2 must not return the
    // whole string while claiming to have elided (`slice(-0)` is `slice(0)`) -- both measured
    // defects in the first revision, and both reachable because the parameter is exported.
    expect(boundedNativeProbeOutput("abcdefghij", 5)).toBe("ab...[6 UTF-16 code units elided]...ij");
    expect(boundedNativeProbeOutput("abcdefghij", 1)).toBe("a...[9 UTF-16 code units elided]");
    expect(boundedNativeProbeOutput("abcdefghij", 0)).toBe("...[10 UTF-16 code units elided]");
    expect(boundedNativeProbeOutput("abcdefghij", -5)).toBe("...[10 UTF-16 code units elided]");

    // A fractional or NaN limit must not slip past normalisation into the slicing: a peer review
    // measured `slice(-NaN)` degenerating to `slice(0)`, returning the whole value while the
    // message claimed to have elided. Fractions floor; a non-finite limit falls back to the
    // default, which is still bounded.
    expect(boundedNativeProbeOutput("abcdefghij", 0.5)).toBe("...[10 UTF-16 code units elided]");
    expect(boundedNativeProbeOutput("abcdefghij", 1.5)).toBe("a...[9 UTF-16 code units elided]");
    expect(boundedNativeProbeOutput("abcdefghij", Number.NaN)).toBe("abcdefghij");
    expect(boundedNativeProbeOutput(long, Number.NaN)).toHaveLength(
      NATIVE_PROBE_OUTPUT_EXCERPT_LIMIT + "...[1000 UTF-16 code units elided]...".length,
    );
  });
});

describe("DEC-240 (a4) condition 2: the flagless global install env carries no token", () => {
  test("each of the four token names present fails the assertion, and an env without them passes", () => {
    expect([...INSTALL_SECRET_ENV_NAMES]).toEqual(["GITHUB_TOKEN", "GH_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN"]);
    for (const name of INSTALL_SECRET_ENV_NAMES) {
      expect(() => assertNoInstallSecrets({ PATH: "/bin", [name]: "x" })).toThrow(name);
      // Presence, not truthiness: an empty value is still a token variable in that env.
      expect(() => assertNoInstallSecrets({ [name]: "" })).toThrow(name);
    }
    expect(() => assertNoInstallSecrets({ PATH: "/bin", npm_config_audit: "false" })).not.toThrow();
  });

  test("withoutInstallSecrets removes all four and keeps everything else", () => {
    const scrubbed = withoutInstallSecrets({
      PATH: "/bin",
      GITHUB_TOKEN: "a",
      GH_TOKEN: "b",
      NODE_AUTH_TOKEN: "c",
      NPM_TOKEN: "d",
    });
    expect(scrubbed).toEqual({ PATH: "/bin" });
    expect(() => assertNoInstallSecrets(scrubbed)).not.toThrow();
  });

  test("the env is built through both scrubbers, and the install helper asserts both before the one install call", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "benchmark", "ladybug", "package-qualification.ts"),
      "utf8",
    );
    expect(source).toContain("...withoutInheritedScriptApproval(withoutInstallSecrets(process.env))");
    expect(source).toContain("npm_config_userconfig: emptyUserConfig");
    expect(source).toContain("resolveQualificationNpm(process.env)");
    const releaseYml = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "release.yml"), "utf8");
    // Windows: the upgrade goes into Node's own directory, and the probe runs under an isolated prefix.
    expect(releaseYml).toContain('npm install -g --ignore-scripts --prefix "$node_dir" npm@12.2.1');
    expect(releaseYml).toContain('npm_config_prefix="$probe_prefix" "$npm_path" --version');
    // The recorded path is run before it is exported, so a wrong shim fails in the step that made it.
    const ranAt = releaseYml.indexOf('recorded_version="$(npm_config_prefix=');
    const exportedAt = releaseYml.indexOf('echo "LORE_QUALIFICATION_NPM=$npm_path" >> "$GITHUB_ENV"');
    expect(ranAt).toBeGreaterThan(0);
    expect(exportedAt).toBeGreaterThan(ranAt);
    expect(source).toContain("npm_config_globalconfig: emptyGlobalConfig");
    const secretsAt = source.indexOf("assertNoInstallSecrets(installEnv);");
    const approvalAt = source.indexOf("assertNoInheritedScriptApproval(installEnv);");
    const installAt = source.indexOf('run(npm, ["install", "--global", ...installTarballs]');
    expect(secretsAt).toBeGreaterThan(0);
    expect(approvalAt).toBeGreaterThan(secretsAt);
    expect(installAt).toBeGreaterThan(approvalAt);
    // (a5) item 2: the major gate runs before the proof, and the proof before the real install.
    const gateAt = source.indexOf("assertNpmMajor(npmVersion);");
    const proofAt = source.indexOf("await proveUnapprovedScriptsBlocked(");
    const realAt = source.indexOf("const globalInstall = await flaglessGlobalInstall(npm, npmEnvironment, scratch, [");
    expect(gateAt).toBeGreaterThan(0);
    expect(proofAt).toBeGreaterThan(gateAt);
    // (a5) item 3: the effective config is read back between the major gate and the proof, and its positive
    // control runs beside it, so an "undefined" readback is only accepted from an npm shown to read the key.
    const readbackAt = source.indexOf(
      "assertScriptApprovalConfigEmpty(allowScriptsReadback, dangerouslyAllowAllReadback)",
    );
    const controlAt = source.indexOf("readBackScriptApprovalPositiveControl(npm, npmEnvironment, scratch)");
    expect(readbackAt).toBeGreaterThan(gateAt);
    expect(controlAt).toBeGreaterThan(readbackAt);
    expect(proofAt).toBeGreaterThan(controlAt);
    expect(realAt).toBeGreaterThan(proofAt);
  });

  test("resolveQualificationNpm: CI never falls back to the PATH walk; local runs may", () => {
    const real = join(tmpdir(), `lcli768-npm-${process.pid}`);
    writeFileSync(real, "");
    try {
      expect(resolveQualificationNpm({ LORE_QUALIFICATION_NPM: real, CI: "true" })).toBe(real);
      expect(resolveQualificationNpm({ LORE_QUALIFICATION_NPM: real })).toBe(real);
      // The CI branch refuses: unset, empty, and a path that does not exist.
      expect(() => resolveQualificationNpm({ CI: "true" })).toThrow("LORE_QUALIFICATION_NPM is unset in CI");
      expect(() => resolveQualificationNpm({ CI: "true", LORE_QUALIFICATION_NPM: "" })).toThrow("unset in CI");
      expect(() => resolveQualificationNpm({ CI: "true", LORE_QUALIFICATION_NPM: `${real}.missing` })).toThrow(
        "does not exist",
      );
      expect(() => resolveQualificationNpm({ LORE_QUALIFICATION_NPM: `${real}.missing` })).toThrow("does not exist");
      // Local, unset: the PATH walk (this host has an npm, or the walk names its absence).
      expect(typeof resolveQualificationNpm({})).toBe("string");
    } finally {
      rmSync(real, { force: true });
    }
  });

  describe.skipIf(process.platform === "win32")("the flagless install helper holds the line itself", () => {
    /** A stub npm: it answers the two config reads from env, and echoes any install's argv instead of installing. */
    function stub(dir: string): string {
      const path = join(dir, "npm");
      writeFileSync(
        path,
        [
          "#!/bin/sh",
          'case "$*" in',
          '  "config get allow-scripts") printf "%s\\n" "$STUB_ALLOW_SCRIPTS" ;;',
          '  "config get dangerously-allow-all-scripts") printf "%s\\n" "false" ;;',
          '  *) printf "INSTALL:%s\\n" "$*" ;;',
          "esac",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      return path;
    }
    const env = (allowScripts: string): Record<string, string | undefined> => ({
      PATH: process.env.PATH,
      STUB_ALLOW_SCRIPTS: allowScripts,
    });
    const tarballUnder = (root: string, name = "lore-linux-x64-0.14.1.tgz"): string => {
      const path = join(root, name);
      writeFileSync(path, "tarball-bytes");
      return path;
    };

    test("accepts a local .tgz under the root with the two allowed extras, and installs exactly that path", async () => {
      const root = mkdtempSync(join(tmpdir(), "lcli768-helper-"));
      try {
        const tarball = tarballUnder(root);
        const prefix = join(root, "prefix");
        const result = await flaglessGlobalInstall(stub(root), env("undefined"), root, [tarball], {
          npm_config_prefix: prefix,
        });
        expect(result.stdout.trim()).toBe(`INSTALL:install --global ${tarball}`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 30_000);

    test("refuses a registry spec, a relative path, a path outside the root, a non-.tgz, an empty file and a directory", async () => {
      const root = mkdtempSync(join(tmpdir(), "lcli768-helper-"));
      const outside = mkdtempSync(join(tmpdir(), "lcli768-outside-"));
      try {
        const npm = stub(root);
        const cases: [string, string][] = [
          ["@opum-ai/lore-linux-x64@0.14.1", "registry spec or a relative path"],
          ["./lore-linux-x64-0.14.1.tgz", "registry spec or a relative path"],
          [tarballUnder(outside), "is outside it"],
          [join(root, "notes.txt"), "is not one"],
          [join(root, "empty.tgz"), "non-empty regular file"],
          [join(root, "a-directory.tgz"), "non-empty regular file"],
        ];
        writeFileSync(join(root, "notes.txt"), "x");
        writeFileSync(join(root, "empty.tgz"), "");
        mkdirSync(join(root, "a-directory.tgz"));
        for (const [spec, message] of cases) {
          await expect(flaglessGlobalInstall(npm, env("undefined"), root, [spec])).rejects.toThrow(message);
        }
        // A symlink inside the root that RESOLVES outside it is refused too: the guard compares real paths, so a
        // link cannot walk out of the root the way a string prefix check would let it.
        const link = join(root, "link.tgz");
        spawnSync("ln", ["-s", tarballUnder(outside, "target.tgz"), link]);
        await expect(flaglessGlobalInstall(npm, env("undefined"), root, [link])).rejects.toThrow("is outside it");
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    }, 30_000);

    test("refuses any extra env key but the proof's sentinel and npm's prefix, and refuses a config that approves scripts", async () => {
      const root = mkdtempSync(join(tmpdir(), "lcli768-helper-"));
      try {
        const npm = stub(root);
        const tarball = tarballUnder(root);
        // The userconfig override was the measured gap: it is not a token and not a script-approval spelling, so
        // the scrubbers passed it through, and it could point the install at a config that approves scripts.
        await expect(
          flaglessGlobalInstall(npm, env("undefined"), root, [tarball], {
            npm_config_userconfig: "/tmp/approve.npmrc",
          }),
        ).rejects.toThrow("may be handed only lore_script_proof_sentinel and npm_config_prefix");
        // The sentinel is allowed even in another case: npm reads these keys case-insensitively.
        const allowed = await flaglessGlobalInstall(npm, env("undefined"), root, [tarball], {
          LORE_SCRIPT_PROOF_SENTINEL: join(root, "sentinel"),
        });
        expect(allowed.stdout).toContain("INSTALL:install --global");
        // And the merged env is read back before the install: a config that DOES approve a script never installs.
        await expect(flaglessGlobalInstall(npm, env("x"), root, [tarball])).rejects.toThrow("allow-scripts");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 30_000);
  });

  test("assertNpmMajor accepts npm 12 exactly, and fails by name on every other major and on a non-version", () => {
    expect(() => assertNpmMajor("10.9.9")).toThrow("npm 10.9.9 is not major 12");
    expect(() => assertNpmMajor("11.19.0\n")).toThrow("is not major 12");
    // A later major is a new ruling (DEC-240 a5 qualified npm 12), not an acceptable upgrade.
    expect(() => assertNpmMajor("13.0.0")).toThrow("is not major 12");
    expect(() => assertNpmMajor("12.0.0-next.1")).toThrow("not a version");
    expect(() => assertNpmMajor("12.2.1 --foreground-scripts")).toThrow("not a version");
    expect(() => assertNpmMajor("")).toThrow("not a version");
    for (const version of ["12.0.0", "12.2.0", "12.2.1\n"]) {
      expect(() => assertNpmMajor(version)).not.toThrow();
    }
  });

  test("script-approval env: every spelling is caught and scrubbed, anything else is kept", () => {
    const env = {
      PATH: "/bin",
      npm_config_allow_scripts: "a",
      "npm_config_allow-scripts": "b",
      NPM_CONFIG_ALLOW_SCRIPTS: "c",
      npm_config_dangerously_allow_all_scripts: "true",
      npm_config_audit: "false",
    };
    expect(() => assertNoInheritedScriptApproval(env)).toThrow("npm_config_allow_scripts");
    expect(() => assertNoInheritedScriptApproval({ NPM_CONFIG_ALLOW_SCRIPTS: "" })).toThrow("NPM_CONFIG_ALLOW_SCRIPTS");
    const clean = withoutInheritedScriptApproval(env);
    expect(clean).toEqual({ PATH: "/bin", npm_config_audit: "false" });
    expect(() => assertNoInheritedScriptApproval(clean)).not.toThrow();
  });

  test("the effective config must hold no allow-scripts entry and the allow-all switch off", () => {
    for (const empty of ["", "\n", "null", "undefined", "[]", '[""]']) {
      expect(() => assertScriptApprovalConfigEmpty(empty, "false\n")).not.toThrow();
    }
    expect(() => assertScriptApprovalConfigEmpty('["esbuild,protobufjs"]', "false")).toThrow("allow-scripts");
    expect(() => assertScriptApprovalConfigEmpty("", "true")).toThrow("dangerously-allow-all-scripts");
  });

  test.skipIf(process.platform === "win32")(
    "the readback's positive control requires the value it set, so an unread key cannot pass as an unset one",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "lcli768-control-"));
      try {
        const npm = join(root, "npm");
        writeFileSync(npm, '#!/bin/sh\nprintf "%s\\n" "$STUB_READBACK"\n', { mode: 0o755 });
        const readBack = (value: string) =>
          readBackScriptApprovalPositiveControl(npm, { PATH: process.env.PATH, STUB_READBACK: value }, root);
        await expect(readBack(POSITIVE_CONTROL_ALLOW_SCRIPTS)).resolves.toBe(POSITIVE_CONTROL_ALLOW_SCRIPTS);
        await expect(readBack("undefined")).rejects.toThrow("cannot tell an unset key from an unread one");
        // The control writes its OWN config: the file it sets the key in is not the empty user config.
        expect(readFileSync(join(root, "npm-allow-scripts-control.npmrc"), "utf8")).toBe(
          `allow-scripts=${POSITIVE_CONTROL_ALLOW_SCRIPTS}\n`,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );

  test("optionalPlatformEvidence: only the root and own platform installed, packument reads recorded, a registry tarball refused", () => {
    const root = mkdtempSync(join(tmpdir(), "lcli768-optional-"));
    try {
      const scope = join(root, "@opum-ai");
      mkdirSync(join(scope, "lore"), { recursive: true });
      mkdirSync(join(scope, "lore-linux-x64"), { recursive: true });
      const reads = [
        "npm http fetch GET 404 https://registry.npmjs.org/@opum-ai%2flore-darwin-arm64 40ms (cache skip)",
        "npm http fetch GET 200 https://registry.npmjs.org/lodash 9ms",
      ].join("\n");
      const evidence = optionalPlatformEvidence(root, "@opum-ai/lore-linux-x64", { stdout: "", stderr: reads });
      expect(evidence.installed).toEqual(["lore", "lore-linux-x64"]);
      expect(evidence.registryReads).toEqual([
        { status: 404, kind: "packument", url: "https://registry.npmjs.org/@opum-ai%2flore-darwin-arm64" },
      ]);
      const tarball =
        "npm http fetch GET 200 https://registry.npmjs.org/@opum-ai/lore-darwin-arm64/-/lore-darwin-arm64-0.14.1.tgz 5ms";
      expect(() => optionalPlatformEvidence(root, "@opum-ai/lore-linux-x64", { stdout: "", stderr: tarball })).toThrow(
        "fetched @opum-ai tarballs",
      );
      // A log with no fetch line at all means the parser saw nothing: that install's evidence is unmeasured, and
      // every statement it could support would be vacuous. It is a failure, not a clean install.
      expect(() => optionalPlatformEvidence(root, "@opum-ai/lore-linux-x64", { stdout: "", stderr: "" })).toThrow(
        "no fetch line",
      );
      mkdirSync(join(scope, "lore-darwin-arm64"));
      expect(() => optionalPlatformEvidence(root, "@opum-ai/lore-linux-x64", { stdout: "", stderr: reads })).toThrow(
        "expected exactly",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * DEC-240 (a5) item 4: ONE list of the six host distributions with two owners. package-qualification.ts defines
 * QUALIFICATION_DISTRIBUTIONS so the report validator can require the other five without importing
 * qualification-evidence.ts (which imports it), and that module holds LADYBUG_QUALIFICATION_PLATFORMS for the
 * evidence manifest. Two hand-kept lists that must agree is exactly the shape that drifts, so they are compared as
 * data here rather than trusted by a comment (the comment claimed this test existed before it did, rv330).
 */
test("the validator's distribution list IS the evidence manifest's platform list", () => {
  const fromEvidence = LADYBUG_QUALIFICATION_PLATFORMS.map((platform) => platform.distribution).sort();
  // Positive control: six names were read from the evidence module.
  expect(fromEvidence).toHaveLength(6);
  expect([...QUALIFICATION_DISTRIBUTIONS].sort()).toEqual(fromEvidence);
});

/**
 * The npm on PATH and its major, so the real-install proofs run only where npm can block scripts at all.
 *
 * On a host that can run them, a version that cannot be read is a FAILURE, never a skip: `skipIf(!(major >= 12))`
 * is TRUE for NaN, so an npm whose `--version` did not come back used to look exactly like an npm that is merely
 * too old, and the suite went green with the proof silently unrun. Windows is the ONE named exception, decided by
 * `process.platform` rather than by whatever the read produced (LCLI-768 r3): a win32 host skips the rehearsals
 * with a printed reason, because these proofs are POSIX-side by construction and the release run's own report is
 * the Windows evidence.
 *
 * The spawn is the reason that distinction had to be written down at all. With `shell: true` Node CONCATENATES the
 * command and its arguments without quoting or escaping, so an absolute path holding a space -- `C:\Program
 * Files\nodejs\npm.cmd` on a windows-latest runner -- is split by the shell and the read comes back empty with a
 * non-zero status (measured on a stub at a path with a space: status 127, empty stdout; the same spawn with the
 * command quoted: status 0). The command is therefore QUOTED before it is handed to the shell. Only major 12 runs
 * the rehearsals: a later major is a new ruling (DEC-240 a5).
 */
function hostNpm(): { path: string; version: string; major: number } {
  const path = Bun.which("npm") ?? "npm";
  const win32 = process.platform === "win32";
  const result = spawnSync(win32 ? `"${path}"` : path, ["--version"], { encoding: "utf8", shell: win32 });
  const version = (result.stdout ?? "").trim();
  const readable = result.error === undefined && result.status === 0 && /^\d+\.\d+\.\d+$/.test(version);
  if (!readable) {
    if (win32) return { path, version: `unreadable (${result.error?.message ?? `exit ${result.status}`})`, major: 0 };
    throw new Error(
      `\`${path} --version\` printed ${JSON.stringify(version)} with ${result.error?.message ?? `exit ${result.status}`}, which is not a version, so the rehearsal's skip condition would be a silent one`,
    );
  }
  return { path, version, major: Number(version.split(".")[0]) };
}
const HOST_NPM = hostNpm();

/** Why the real-npm rehearsals do not run here, or null when they do. Named, so a skip is never a silent one. */
const HOST_NPM_SKIP: string | null =
  process.platform === "win32"
    ? "POSIX hosts only: npm.cmd cannot be spawned from this harness on Windows"
    : HOST_NPM.major !== 12
      ? `host npm ${HOST_NPM.version} is not major 12`
      : null;

describe.skipIf(HOST_NPM_SKIP !== null)(
  `DEC-240 (a5) item 4: a real flagless install blocks and reports an unapproved fixture script (rehearsal on the host npm)${HOST_NPM_SKIP === null ? "" : ` -- SKIPPED: ${HOST_NPM_SKIP}`}`,
  () => {
    function proofEnv(scratch: string, userConfigText: string): Record<string, string | undefined> {
      writeFileSync(join(scratch, "user.npmrc"), userConfigText);
      writeFileSync(join(scratch, "global.npmrc"), "");
      return {
        ...withoutInheritedScriptApproval(process.env),
        npm_config_userconfig: join(scratch, "user.npmrc"),
        npm_config_globalconfig: join(scratch, "global.npmrc"),
        npm_config_cache: join(scratch, "cache"),
        npm_config_prefix: join(scratch, "prefix"),
        npm_config_audit: "false",
        npm_config_fund: "false",
      };
    }

    test("with empty configs the postinstall does not run, npm reports it, and the proof records the npm version", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "lcli768-proof-"));
      try {
        const proof = await proveUnapprovedScriptsBlocked(
          HOST_NPM.path,
          proofEnv(scratch, ""),
          scratch,
          HOST_NPM.version,
        );
        expect(proof).toEqual({ npm: HOST_NPM.version, fixtureScriptRan: false, reported: true });
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }, 120_000);

    test("an inherited approval never reaches npm: the helper's own readback refuses it before anything installs", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "lcli768-proof-"));
      try {
        // The hazard (a5) item 3 names: the same fixture, but the USER config approves it. Measured on npm 12.2.x:
        // a bare or pinned allow-scripts entry did NOT approve a global tarball install, the allow-all switch does.
        // That is why the install helper reads the effective config back through its MERGED env: a config a caller
        // supplies is refused there, before npm runs, so the fixture script cannot execute at all. (The companion
        // control -- that the same approval really does run such a script, so the refusal is load-bearing -- is the
        // real-install test in test/ci-hardening.test.ts, which runs on npm 10/11/12 rather than only npm 12.)
        const env = proofEnv(scratch, "dangerously-allow-all-scripts=true\n");
        await expect(proveUnapprovedScriptsBlocked(HOST_NPM.path, env, scratch, HOST_NPM.version)).rejects.toThrow(
          'dangerously-allow-all-scripts is "true", not false',
        );
        // And a variable-borne approval never reaches npm either: the scrubber refuses it first.
        const viaEnv = { ...proofEnv(scratch, ""), npm_config_dangerously_allow_all_scripts: "true" };
        await expect(proveUnapprovedScriptsBlocked(HOST_NPM.path, viaEnv, scratch, HOST_NPM.version)).rejects.toThrow(
          "no script approval",
        );
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }, 120_000);
  },
);

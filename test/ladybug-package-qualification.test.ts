import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { packageBuildConfig, windowsReferenceOnlyLadybugPlugin } from "../benchmark/ladybug/package-build";
import {
  assertPackageQualificationReport,
  isKnownNativeCrash,
  isProvenAbruptWindowsImportCrash,
  LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
  packageCompileCommand,
  parsePackageQualificationArgs,
  removeQualificationScratch,
  resolveInstalledOptionalPackageJson,
} from "../benchmark/ladybug/package-qualification";

const RELEASE_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");
const SETUP_BUN_PATH = join(import.meta.dir, "..", ".github", "actions", "setup-bun", "action.yml");
const PACKAGE_BUILD_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "package-build.ts");
const PACKAGE_RUNNER_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "package-qualification.ts");
const NATIVE_PROBE_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "native-probe.ts");
const BACKLOG_SHIM_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "backlog-shim.ts");

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
    () => {
      const root = mkdtempSync(join(tmpdir(), "lore-windows-launcher-test-"));
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
          `${JSON.stringify({ name: `@opum-ai/lore-win32-${process.arch}`, version: "0.1.1" })}\n`,
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
        expect(result.stdout.toString()).toBe("0.1.1\n");
        expect(result.stderr.toString()).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
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

  test("builds from same-drive scratch with an absolute repository entrypoint", () => {
    expect(
      packageCompileCommand("D:\\repo", "C:\\scratch", "bun-windows-x64-baseline", "C:\\scratch\\lore.exe"),
    ).toEqual({
      executable: "bun",
      args: [
        join("D:\\repo", "benchmark", "ladybug", "package-build.ts"),
        "--target=bun-windows-x64-baseline",
        "--outfile=C:\\scratch\\lore.exe",
        `--entrypoint=${join("D:\\repo", "src", "cli.ts")}`,
      ],
      cwd: "C:\\scratch",
    });
    expect(packageCompileCommand("/repo", "/scratch", "bun-linux-arm64", "/scratch/lore").args).toEqual([
      join("/repo", "benchmark", "ladybug", "package-build.ts"),
      "--target=bun-linux-arm64",
      "--outfile=/scratch/lore",
      `--entrypoint=${join("/repo", "src", "cli.ts")}`,
    ]);
    const windowsConfig = packageBuildConfig("src/cli.ts", "bun-windows-x64-baseline", "dist/lore.exe");
    const nativeConfig = packageBuildConfig("src/cli.ts", "bun-linux-arm64", "dist/lore");
    expect(windowsConfig.plugins).toEqual([windowsReferenceOnlyLadybugPlugin]);
    expect(nativeConfig.plugins).toEqual([]);
    expect(readFileSync(PACKAGE_BUILD_PATH, "utf8")).toContain("Ladybug native indexing is unavailable");
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
      { name: "darwin-arm64", runner: "macos-latest", os: "darwin", cpu: "arm64" },
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
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax.
    const qualificationPattern = "ladybug-package-qualification-*-${{ github.run_id }}-${{ github.run_attempt }}";
    expect(download?.with?.pattern).toBe(qualificationPattern);
    const assembly = jobs.package?.steps?.find((step) => step.name?.includes("matching-host-qualified"))?.run ?? "";
    expect(assembly).toContain('const digest = `sha256:${createHash("sha256")');
    expect(assembly).toContain("report.package?.platformTarballSha256 !== digest");
    expect(assembly).toContain("report.repository?.commit !== process.env.EXPECTED_COMMIT");
    expect(assembly).toContain('cp "$tarball" dist-npm/');
    expect(assembly).not.toContain("npm-artifacts/lore-");
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

  test("only a report with every cleanup and preservation assertion passes", () => {
    const report = {
      schema: LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
      mode: "qualification",
      platform: { bun: "1.3.14", os: "linux", cpu: "x64" },
      repository: { commit: "a".repeat(40) },
      ladybug: {
        core: "0.19.0",
        optionalPackage: "@ladybugdb/core-linux-x64",
        lockIntegrity: "sha512-YWJjZA==",
        addonSha256: `sha256:${"b".repeat(64)}`,
        installedCoreAbsent: true,
        embeddedNativeIndexVerified: true,
      },
      package: { globalInstallScriptPolicyClean: true, globalLauncherSmoke: true },
      smoke: { outputsStable: true },
      native: {
        supportClaim: "native-index",
        probeOutcome: "pass",
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

    const windowsFallback = {
      ...report,
      platform: { bun: "1.3.14", os: "win32", cpu: "x64" },
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
      platform: { bun: "1.3.14", os: "win32", cpu: "arm64" },
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
  });

  test("native indexing and Windows fallback evidence stay process-isolated and explicit", () => {
    const runner = readFileSync(PACKAGE_RUNNER_PATH, "utf8");
    const probe = readFileSync(NATIVE_PROBE_PATH, "utf8");
    const backlogShim = readFileSync(BACKLOG_SHIM_PATH, "utf8");
    expect(runner).toContain('input.os === "win32" ? "import" : "indexed"');
    expect(runner).toContain("child.signalCode");
    expect(runner).toContain("isKnownNativeCrash");
    expect(runner).toContain("referenceFallbackDatabaseAbsent");
    expect(runner).toContain("commandOutputsStable");
    expect(runner).toContain("createFixtureBacklogEnvironment");
    expect(runner).toContain('["install", "--global", rootTarball, platformTarball]');
    expect(runner).toContain("assertNoInstallScriptApproval");
    expect(runner).toContain("embeddedNativeIndexVerified");
    expect(runner).toContain("initializeFixtureGitRepository");
    expect(runner).toContain("backlog-shim.ts");
    expect(backlogShim).toContain('process.stdout.write("1.49.0\\n")');
    expect(backlogShim).toContain('args[0] === "task"');
    expect(backlogShim).toContain('kind: "task-list"');
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
});

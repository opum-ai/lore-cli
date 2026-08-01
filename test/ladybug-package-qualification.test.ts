import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";
import {
  assertPackageQualificationReport,
  isKnownNativeCrash,
  LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
  packageCompileCommand,
  parsePackageQualificationArgs,
  removeQualificationScratch,
  resolveInstalledOptionalPackageJson,
} from "../benchmark/ladybug/package-qualification";

const RELEASE_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");
const PACKAGE_RUNNER_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "package-qualification.ts");
const NATIVE_PROBE_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "native-probe.ts");
const BACKLOG_SHIM_PATH = join(import.meta.dir, "..", "benchmark", "ladybug", "backlog-shim.ts");

interface WorkflowStep {
  id?: string;
  if?: string;
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
  ladybugPackage: string;
  ladybugIntegrity: string;
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
        "build",
        "--compile",
        "--target=bun-windows-x64-baseline",
        "--outfile=C:\\scratch\\lore.exe",
        join("D:\\repo", "src", "cli.ts"),
      ],
      cwd: "C:\\scratch",
    });
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

  test("the existing five distributions map to the five approved matching hosts", () => {
    const matrix = releaseMatrix(loadWorkflow());
    expect(matrix.map(({ name, runner, os, cpu }) => ({ name, runner, os, cpu }))).toEqual([
      { name: "darwin-arm64", runner: "macos-latest", os: "darwin", cpu: "arm64" },
      { name: "darwin-x64", runner: "macos-15-intel", os: "darwin", cpu: "x64" },
      { name: "linux-arm64", runner: "ubuntu-24.04-arm", os: "linux", cpu: "arm64" },
      { name: "linux-x64", runner: "ubuntu-24.04", os: "linux", cpu: "x64" },
      { name: "win32-x64", runner: "windows-latest", os: "win32", cpu: "x64" },
    ]);
    expect(matrix.map((entry) => entry.target)).toEqual([
      "bun-darwin-arm64",
      "bun-darwin-x64-baseline",
      "bun-linux-arm64",
      "bun-linux-x64-baseline",
      "bun-windows-x64-baseline",
    ]);
    expect(matrix.map((entry) => entry.binary)).toEqual(["lore", "lore", "lore", "lore", "lore.exe"]);
  });

  test("every host pins the exact Ladybug optional package and frozen-lock integrity", () => {
    const matrix = releaseMatrix(loadWorkflow());
    for (const entry of matrix) {
      expect(entry.ladybugPackage).toBe(`@ladybugdb/core-${entry.os}-${entry.cpu}`);
      expect(entry.ladybugIntegrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
      const lock = readFileSync(join(import.meta.dir, "..", "bun.lock"), "utf8");
      const line = lock.split("\n").find((candidate) => candidate.trimStart().startsWith(`"${entry.ladybugPackage}":`));
      expect(line).toContain(`${entry.ladybugPackage}@0.19.0`);
      expect(line).toContain(entry.ladybugIntegrity);
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
    expect(needs(jobs.package as WorkflowJob)).toContain("build");
    expect(needs(jobs.package as WorkflowJob)).toContain("package-qualification");
    expect(needs(jobs.package as WorkflowJob)).toContain("ladybug-qualification-evidence");
    expect(needs(jobs.publish as WorkflowJob)).toContain("package");
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
      platform: { bun: "1.2.23", os: "linux" },
      repository: { commit: "a".repeat(40) },
      ladybug: { core: "0.19.0", copiedAddonMatches: true },
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
      platform: { bun: "1.2.23", os: "win32" },
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
    expect(runner).toContain("backlog-shim.ts");
    expect(backlogShim).toContain('args[0] === "--version"');
    expect(backlogShim).toContain('args[0] === "task"');
    expect(backlogShim).toContain('kind: "task-list"');
    expect(probe).toContain("loadLadybugNativeDriver");
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
  });
});

/** Matching-host package, launcher, smoke, and uninstall qualification. */

import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { disposeLadybugProjection } from "../../src/core/ladybug-lifecycle";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../../src/core/ladybug-native";
import { canonicalJson, digest, LADYBUG_CACHE_REL_ROOT, readSourceInventory } from "../../src/core/ladybug-source";
import { generateLadybugBenchmarkFixture, loadLadybugBenchmarkFixtureSpec } from "./fixture";
import { LADYBUG_NATIVE_PROBE_SCHEMA } from "./native-probe";

export const LADYBUG_PACKAGE_QUALIFICATION_SCHEMA = "lore.ladybug-package-qualification/1";
const LADYBUG_VERSION = EXPECTED_LADYBUG_VERSION;
const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..");

export interface PackageQualificationInput {
  readonly mode: "qualification" | "smoke";
  readonly name: string;
  readonly target: string;
  readonly binary: string;
  readonly os: NodeJS.Platform;
  readonly cpu: string;
  readonly ladybugPackage: string;
  readonly ladybugIntegrity: string;
  readonly output: string;
}

export interface PackageCompileCommand {
  readonly executable: "bun";
  readonly args: readonly string[];
  readonly cwd: string;
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface SmokeCommandEvidence {
  readonly name: string;
  readonly stdoutSha256: string;
}

interface SmokeEvidence {
  readonly launcher: readonly SmokeCommandEvidence[];
  readonly standalone: readonly SmokeCommandEvidence[];
  readonly outputsStable: boolean;
}

interface NativeEvidence {
  readonly supportClaim: "native-index" | "reference-fallback-only";
  readonly probeMode: "indexed" | "import";
  readonly probeOutcome: "pass" | "crash";
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly databaseCreated: boolean;
  readonly executableEvidence: boolean;
  readonly commandOutputsStable: boolean;
  readonly referenceFallbackDatabaseAbsent: boolean | null;
}

type NativeProbeProcessEvidence = Omit<NativeEvidence, "commandOutputsStable" | "referenceFallbackDatabaseAbsent">;

interface NativeProbeChildReport {
  readonly schema: typeof LADYBUG_NATIVE_PROBE_SCHEMA;
  readonly mode: "indexed" | "import";
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly bun: string;
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly databaseCreated: boolean;
  readonly conceptCount: number | null;
  readonly taskCount: number | null;
  readonly authoredEdgeCount: number | null;
  readonly graphDigest: string | null;
}

export interface PackageQualificationReport {
  readonly schema: typeof LADYBUG_PACKAGE_QUALIFICATION_SCHEMA;
  readonly mode: "qualification" | "smoke";
  readonly platform: {
    readonly distribution: string;
    readonly os: NodeJS.Platform;
    readonly cpu: string;
    readonly bun: string;
    readonly node: string;
  };
  readonly repository: { readonly commit: string | null };
  readonly ladybug: {
    readonly core: string;
    readonly optionalPackage: string;
    readonly lockIntegrity: string;
    readonly addonSha256: string;
    readonly copiedAddonMatches: boolean;
  };
  readonly package: {
    readonly root: string;
    readonly platform: string;
    readonly rootTarballSha256: string;
    readonly platformTarballSha256: string;
    readonly standaloneBinarySha256: string;
  };
  readonly smoke: SmokeEvidence;
  readonly native: NativeEvidence;
  readonly cleanup: {
    readonly launcherRemoved: boolean;
    readonly packagesRemoved: boolean;
    readonly addonRemoved: boolean;
    readonly installScratchRemoved: boolean;
    readonly isolatedGlobalClean: boolean;
    readonly repositoryCachePreservedByUninstall: boolean;
    readonly explicitCacheDisposalSucceeded: boolean;
    readonly repositorySourcesPreserved: boolean;
  };
}

export function parsePackageQualificationArgs(args: readonly string[]): PackageQualificationInput {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("package qualification arguments must be --name value pairs");
    }
    if (values.has(key)) throw new Error(`duplicate package qualification argument: ${key}`);
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`missing package qualification argument: ${key}`);
    return value;
  };
  const known = new Set([
    "--name",
    "--target",
    "--binary",
    "--os",
    "--cpu",
    "--ladybug-package",
    "--ladybug-integrity",
    "--output",
    "--runtime-mode",
  ]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`unknown package qualification argument: ${key}`);
  }
  const os = required("--os");
  if (!isNodePlatform(os)) throw new Error(`unsupported package qualification OS: ${os}`);
  const ladybugIntegrity = required("--ladybug-integrity");
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(ladybugIntegrity)) {
    throw new Error("Ladybug package integrity must be a sha512 SRI value");
  }
  return {
    mode: parseRuntimeMode(values.get("--runtime-mode")),
    name: required("--name"),
    target: required("--target"),
    binary: required("--binary"),
    os,
    cpu: required("--cpu"),
    ladybugPackage: required("--ladybug-package"),
    ladybugIntegrity,
    output: resolve(required("--output")),
  };
}

export function assertPackageQualificationReport(value: unknown): asserts value is PackageQualificationReport {
  if (typeof value !== "object" || value === null) throw new Error("package qualification report must be an object");
  const report = value as Partial<PackageQualificationReport>;
  if (report.schema !== LADYBUG_PACKAGE_QUALIFICATION_SCHEMA) {
    throw new Error("package qualification report schema is unsupported");
  }
  if (report.mode !== "qualification" && report.mode !== "smoke") {
    throw new Error("package qualification report runtime mode is unsupported");
  }
  if (report.mode === "qualification" && report.platform?.bun !== "1.2.23") {
    throw new Error("package qualification report does not use the pinned Bun runtime");
  }
  if (!/^[0-9a-f]{40}$/.test(report.repository?.commit ?? "")) {
    throw new Error("package qualification report has no repository commit provenance");
  }
  if (
    report.smoke?.outputsStable !== true ||
    report.native?.commandOutputsStable !== true ||
    (report.platform?.os === "win32"
      ? report.native.supportClaim !== "reference-fallback-only" ||
        report.native.referenceFallbackDatabaseAbsent !== true ||
        report.native.databaseCreated
      : report.native.supportClaim !== "native-index" ||
        report.native.probeOutcome !== "pass" ||
        !report.native.databaseCreated ||
        !report.native.executableEvidence)
  ) {
    throw new Error("package qualification report does not carry the approved native platform verdict");
  }
  if (
    report.cleanup === undefined ||
    Object.values(report.cleanup).some((passed) => passed !== true) ||
    report.ladybug?.core !== LADYBUG_VERSION ||
    report.ladybug.copiedAddonMatches !== true
  ) {
    throw new Error("package qualification report is not a conclusive cleanup pass");
  }
}

async function qualify(input: PackageQualificationInput): Promise<PackageQualificationReport> {
  assertHost(input);
  const ladybug = assertFrozenLadybugInstall(input);
  const scratch = mkdtempSync(join(tmpdir(), `lore-ladybug-package-${input.name}-`));
  const artifactRoot = dirname(input.output);
  mkdirSync(artifactRoot, { recursive: true });
  const npmEnvironment = {
    ...process.env,
    npm_config_audit: "false",
    npm_config_cache: join(scratch, "npm-cache"),
    npm_config_fund: "false",
    npm_config_prefix: join(scratch, "npm-global"),
  };
  const npm = requireExecutable("npm");
  const node = requireExecutable("node");
  const rootPackage = readJson(join(REPOSITORY_ROOT, "package.json"));
  const expectedVersion = stringField(rootPackage, "version", "root package");
  const platformPackageName = `@salient-data/lore-${input.name}`;
  const installRoot = join(scratch, "install");
  const fixtureRoot = join(scratch, "fixture");
  const rootStage = join(scratch, "root-package");
  const platformStage = join(scratch, "platform-package");
  const standaloneRoot = join(scratch, "standalone");
  let report: PackageQualificationReport | undefined;

  try {
    progress("asserting isolated global prefix and staging packages");
    assertIsolatedGlobalClean(join(scratch, "npm-global"));
    stageRootPackage(rootStage, rootPackage);
    stagePlatformPackage(platformStage, input.name);
    const compiledPath = join(platformStage, "bin", input.binary);
    const compile = packageCompileCommand(REPOSITORY_ROOT, scratch, input.target, compiledPath);
    await run(compile.executable, compile.args, { cwd: compile.cwd });
    if (!existsSync(compiledPath) || statSync(compiledPath).size < 1_000_000) {
      throw new Error(`compiled ${input.name} binary is missing or suspiciously small`);
    }

    progress("packing root launcher and matching platform package");
    await run(npm, ["pack", "--pack-destination", artifactRoot, "."], { cwd: rootStage, env: npmEnvironment });
    await run(npm, ["pack", "--pack-destination", artifactRoot, "."], { cwd: platformStage, env: npmEnvironment });
    const rootTarball = join(artifactRoot, `salient-data-lore-${expectedVersion}.tgz`);
    const platformTarball = join(artifactRoot, `salient-data-lore-${input.name}-${expectedVersion}.tgz`);
    assertRegularFile(rootTarball, "root launcher tarball");
    assertRegularFile(platformTarball, "platform tarball");

    mkdirSync(standaloneRoot, { recursive: true });
    const standaloneBinary = join(standaloneRoot, input.binary);
    renameSync(compiledPath, standaloneBinary);
    assertRegularFile(standaloneBinary, "relocated standalone binary");

    mkdirSync(installRoot, { recursive: true });
    progress("installing both tarballs into an isolated Node project");
    await run(npm, ["init", "-y"], { cwd: installRoot, env: npmEnvironment });
    await run(npm, ["install", rootTarball, platformTarball], {
      cwd: installRoot,
      env: npmEnvironment,
      timeoutMs: 600_000,
    });
    const installedRoot = join(installRoot, "node_modules", "@salient-data", "lore");
    const installedPlatform = join(installRoot, "node_modules", "@salient-data", `lore-${input.name}`);
    const launcher = join(installedRoot, "bin", "lore.cjs");
    assertRegularFile(launcher, "installed Node launcher");
    assertRegularFile(join(installedPlatform, "bin", input.binary), "installed platform binary");
    const installedAddon = join(installRoot, "node_modules", "@ladybugdb", "core", "lbugjs.node");
    assertRegularFile(installedAddon, "installed Ladybug addon");
    if (sha256File(installedAddon) !== ladybug.addonSha256) {
      throw new Error(
        "the isolated Node install copied a different Ladybug addon than the frozen matching-host install",
      );
    }

    const spec = loadLadybugBenchmarkFixtureSpec(
      join(REPOSITORY_ROOT, "benchmark", "ladybug", "fixtures", "v1", "small.json"),
    );
    generateLadybugBenchmarkFixture(spec, fixtureRoot);
    const smokeEnvironment = await createFixtureBacklogEnvironment(input, scratch);
    const sourceDigestBefore = sourceInventoryDigest(fixtureRoot);
    progress("probing the exact native boundary in a sacrificial child");
    const nativeProbe = await runNativeProbe(input, scratch);
    progress("smoking the installed Node launcher");
    const launcherSmoke = await smoke([node, launcher], fixtureRoot, expectedVersion, smokeEnvironment);
    progress("smoking the relocated standalone Bun executable");
    const standaloneSmoke = await smoke([standaloneBinary], fixtureRoot, expectedVersion, smokeEnvironment);

    const cacheRoot = join(fixtureRoot, LADYBUG_CACHE_REL_ROOT);
    const commandOutputsStable = canonicalJson(launcherSmoke) === canonicalJson(standaloneSmoke);
    const referenceFallbackDatabaseAbsent = input.os === "win32" ? !existsSync(cacheRoot) : null;
    if (!commandOutputsStable) throw new Error("Node-launcher and standalone command outputs are not stable");
    if (input.os === "win32" && referenceFallbackDatabaseAbsent !== true) {
      throw new Error("Windows reference fallback unexpectedly created a Ladybug cache database");
    }
    mkdirSync(cacheRoot, { recursive: true });
    const cacheMarker = join(cacheRoot, "user-cache-marker");
    writeFileSync(cacheMarker, "repository-local user cache survives package uninstall\n");

    progress("uninstalling packages and auditing launcher, addon, cache, source, and global cleanup");
    await run(npm, ["uninstall", "@salient-data/lore", platformPackageName], {
      cwd: installRoot,
      env: npmEnvironment,
      timeoutMs: 300_000,
    });
    const launcherRemoved = launcherPaths(installRoot).every((path) => !existsSync(path));
    const packagesRemoved = !existsSync(installedRoot) && !existsSync(installedPlatform);
    const addonRemoved = findFiles(join(installRoot, "node_modules"), "lbugjs.node").length === 0;
    const repositoryCachePreservedByUninstall = existsSync(cacheMarker);
    const sourceDigestAfterUninstall = sourceInventoryDigest(fixtureRoot);
    const repositorySourcesPreserved = sourceDigestAfterUninstall === sourceDigestBefore;
    const explicitCacheDisposalSucceeded = disposeLadybugProjection(fixtureRoot) && readdirSync(cacheRoot).length === 0;
    if (!launcherRemoved || !packagesRemoved || !addonRemoved || !repositoryCachePreservedByUninstall) {
      throw new Error("package uninstall left launcher, package, addon, or cache-policy residue");
    }
    if (!explicitCacheDisposalSucceeded || !repositorySourcesPreserved) {
      throw new Error("explicit cache disposal or source-preservation assertion failed");
    }

    rmSync(installRoot, { recursive: true, force: true });
    const installScratchRemoved = !existsSync(installRoot);
    const isolatedGlobalClean = assertIsolatedGlobalClean(join(scratch, "npm-global"));
    report = {
      schema: LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
      mode: input.mode,
      platform: {
        distribution: input.name,
        os: process.platform,
        cpu: process.arch,
        bun: Bun.version,
        node: (await run(node, ["--version"], { cwd: scratch })).stdout.trim(),
      },
      repository: { commit: repositoryCommit() },
      ladybug: {
        core: LADYBUG_VERSION,
        optionalPackage: input.ladybugPackage,
        lockIntegrity: input.ladybugIntegrity,
        addonSha256: ladybug.addonSha256,
        copiedAddonMatches: true,
      },
      package: {
        root: "@salient-data/lore",
        platform: platformPackageName,
        rootTarballSha256: sha256File(rootTarball),
        platformTarballSha256: sha256File(platformTarball),
        standaloneBinarySha256: sha256File(standaloneBinary),
      },
      smoke: { launcher: launcherSmoke, standalone: standaloneSmoke, outputsStable: commandOutputsStable },
      native: {
        ...nativeProbe,
        commandOutputsStable,
        referenceFallbackDatabaseAbsent,
      },
      cleanup: {
        launcherRemoved,
        packagesRemoved,
        addonRemoved,
        installScratchRemoved,
        isolatedGlobalClean,
        repositoryCachePreservedByUninstall,
        explicitCacheDisposalSucceeded,
        repositorySourcesPreserved,
      },
    };
    assertPackageQualificationReport(report);
    writeFileSync(input.output, `${canonicalJson(report)}\n`);
    return report;
  } finally {
    removeQualificationScratch(scratch);
    if (report === undefined && existsSync(input.output)) rmSync(input.output, { force: true });
  }
}

function repositoryCommit(): string | null {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "ignore",
  });
  return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
}

function assertHost(input: PackageQualificationInput): void {
  if (process.platform !== input.os || process.arch !== input.cpu) {
    throw new Error(
      `matching-host qualification expected ${input.os}-${input.cpu}, observed ${process.platform}-${process.arch}`,
    );
  }
  if (input.mode === "qualification" && Bun.version !== "1.2.23") {
    throw new Error(`matching-host qualification requires Bun 1.2.23, observed ${Bun.version}`);
  }
  if (input.name !== `${input.os}-${input.cpu}`) {
    throw new Error(`distribution ${input.name} does not match host ${input.os}-${input.cpu}`);
  }
  if (input.binary !== (input.os === "win32" ? "lore.exe" : "lore")) {
    throw new Error(`distribution ${input.name} declares the wrong binary filename`);
  }
  const expectedLadybugPackage = `@ladybugdb/core-${input.os}-${input.cpu}`;
  if (input.ladybugPackage !== expectedLadybugPackage) {
    throw new Error(`expected Ladybug optional package ${expectedLadybugPackage}, received ${input.ladybugPackage}`);
  }
}

function assertFrozenLadybugInstall(input: PackageQualificationInput): { addonSha256: string } {
  const coreRoot = join(REPOSITORY_ROOT, "node_modules", "@ladybugdb", "core");
  const platformPackagePath = resolveInstalledOptionalPackageJson(
    REPOSITORY_ROOT,
    coreRoot,
    input.ladybugPackage,
    LADYBUG_VERSION,
  );
  const platformRoot = dirname(platformPackagePath);
  const corePackage = readJson(join(coreRoot, "package.json"));
  const platformPackage = readJson(platformPackagePath);
  if (stringField(corePackage, "version", "Ladybug core") !== LADYBUG_VERSION) {
    throw new Error(`@ladybugdb/core must be exactly ${LADYBUG_VERSION}`);
  }
  if (stringField(platformPackage, "name", "Ladybug platform package") !== input.ladybugPackage) {
    throw new Error("the installed Ladybug optional package does not match the host matrix");
  }
  if (stringField(platformPackage, "version", "Ladybug platform package") !== LADYBUG_VERSION) {
    throw new Error(`Ladybug optional package must be exactly ${LADYBUG_VERSION}`);
  }
  assertStringArray(platformPackage.os, [input.os], "Ladybug package os metadata");
  assertStringArray(platformPackage.cpu, [input.cpu], "Ladybug package cpu metadata");
  const coreOptional = corePackage.optionalDependencies;
  if (
    typeof coreOptional !== "object" ||
    coreOptional === null ||
    (coreOptional as Record<string, unknown>)[input.ladybugPackage] !== LADYBUG_VERSION
  ) {
    throw new Error("Ladybug core does not pin the matching optional package exactly");
  }
  const lockLine = readFileSync(join(REPOSITORY_ROOT, "bun.lock"), "utf8")
    .split("\n")
    .find((line) => line.trimStart().startsWith(`"${input.ladybugPackage}":`));
  if (
    lockLine === undefined ||
    !lockLine.includes(`${input.ladybugPackage}@${LADYBUG_VERSION}`) ||
    !lockLine.includes(input.ladybugIntegrity)
  ) {
    throw new Error("the frozen lockfile does not carry the approved Ladybug optional-package integrity");
  }
  const coreAddon = join(coreRoot, "lbugjs.node");
  const platformAddon = join(platformRoot, "lbugjs.node");
  assertRegularFile(coreAddon, "Ladybug core copied addon");
  assertRegularFile(platformAddon, "Ladybug platform addon");
  const coreHash = sha256File(coreAddon);
  if (coreHash !== sha256File(platformAddon)) {
    throw new Error("Ladybug core lbugjs.node is not the byte-identical matching-host addon copy");
  }
  return { addonSha256: coreHash };
}

/** Resolve either a hoisted optional package or Bun's isolated package-store layout. */
export function resolveInstalledOptionalPackageJson(
  repositoryRoot: string,
  coreRoot: string,
  packageName: string,
  version: string,
): string {
  try {
    return createRequire(join(coreRoot, "package.json")).resolve(`${packageName}/package.json`);
  } catch {
    // Bun 1.2's isolated linker can install the optional package in .bun without
    // exposing it through Node resolution from the parent package.
  }
  const packageSegments = packageName.split("/");
  const candidates = [
    join(repositoryRoot, "node_modules", ...packageSegments, "package.json"),
    join(
      repositoryRoot,
      "node_modules",
      ".bun",
      `${packageName.replace("/", "+")}@${version}`,
      "node_modules",
      ...packageSegments,
      "package.json",
    ),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot locate installed optional package ${packageName}@${version}`);
}

/** Build from same-drive scratch while resolving imports from the absolute source entrypoint. */
export function packageCompileCommand(
  repositoryRoot: string,
  scratchRoot: string,
  target: string,
  output: string,
): PackageCompileCommand {
  return {
    executable: "bun",
    args: ["build", "--compile", `--target=${target}`, `--outfile=${output}`, join(repositoryRoot, "src", "cli.ts")],
    // Bun 1.2 extracts a downloaded target runtime relative to cwd before moving
    // it into the user cache. GitHub's Windows checkout and cache use different
    // drives, so keep extraction beside this same-drive temporary output.
    cwd: scratchRoot,
  };
}

function stageRootPackage(root: string, sourcePackage: Record<string, unknown>): void {
  mkdirSync(root, { recursive: true });
  cpSync(join(REPOSITORY_ROOT, "src"), join(root, "src"), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, "bin"), join(root, "bin"), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, "README.md"), join(root, "README.md"));
  cpSync(join(REPOSITORY_ROOT, "LICENSE"), join(root, "LICENSE"));
  const packageCopy = structuredClone(sourcePackage);
  packageCopy.bin = { lore: "bin/lore.cjs" };
  writeFileSync(join(root, "package.json"), `${JSON.stringify(packageCopy, null, 2)}\n`);
}

function stagePlatformPackage(root: string, name: string): void {
  mkdirSync(join(root, "bin"), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, "npm", name, "package.json"), join(root, "package.json"));
}

async function runNativeProbe(input: PackageQualificationInput, scratch: string): Promise<NativeProbeProcessEvidence> {
  const probeMode = input.os === "win32" ? "import" : "indexed";
  const probeRoot = join(scratch, "native-probe");
  const databasePath = join(probeRoot, "native-probe.lbdb");
  // Keep any host crash dump inside the already-contained disposable tree,
  // never in the checkout that launched the sacrificial process.
  mkdirSync(probeRoot, { recursive: true });
  const child = Bun.spawn(
    [
      process.execPath,
      join(REPOSITORY_ROOT, "benchmark", "ladybug", "native-probe.ts"),
      "--mode",
      probeMode,
      "--root",
      probeRoot,
    ],
    { cwd: probeRoot, stdout: "pipe", stderr: "pipe" },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 180_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  const signal = child.signalCode;
  const stdoutSha256 = digest(stdout);
  const stderrSha256 = digest(stderr);
  if (timedOut) throw new Error("sacrificial Ladybug native probe timed out after 180000ms");

  if (input.os === "win32") {
    if (existsSync(databasePath)) throw new Error("Windows import-only native probe created a database");
    if (exitCode === 0 && signal === null) {
      const report = parseNativeProbeReport(stdout);
      assertNativeProbeReport(report, input, "import");
      if (report.databaseCreated) throw new Error("Windows import-only native probe reported database creation");
      return {
        supportClaim: "reference-fallback-only",
        probeMode,
        probeOutcome: "pass",
        exitCode,
        signal,
        stdoutSha256,
        stderrSha256,
        databaseCreated: false,
        executableEvidence: false,
      };
    }
    if (!isKnownNativeCrash(exitCode, signal)) {
      throw new Error(
        `Windows native probe failed without the approved crash signature (exit=${exitCode}, signal=${signal ?? "none"}, stdout=${stdoutSha256}, stderr=${stderrSha256})`,
      );
    }
    return {
      supportClaim: "reference-fallback-only",
      probeMode,
      probeOutcome: "crash",
      exitCode,
      signal,
      stdoutSha256,
      stderrSha256,
      databaseCreated: false,
      executableEvidence: false,
    };
  }

  if (exitCode !== 0 || signal !== null) {
    throw new Error(
      `native indexing probe failed (exit=${exitCode}, signal=${signal ?? "none"}, stdout=${stdoutSha256}, stderr=${stderrSha256})`,
    );
  }
  const report = parseNativeProbeReport(stdout);
  assertNativeProbeReport(report, input, "indexed");
  if (!report.databaseCreated || !existsSync(databasePath)) {
    throw new Error("native indexing probe did not create its isolated database");
  }
  if (
    report.conceptCount !== 64 ||
    report.taskCount !== 128 ||
    report.authoredEdgeCount !== 512 ||
    report.graphDigest === null
  ) {
    throw new Error("native indexing probe did not verify the complete small fixture");
  }
  return {
    supportClaim: "native-index",
    probeMode,
    probeOutcome: "pass",
    exitCode,
    signal,
    stdoutSha256,
    stderrSha256,
    databaseCreated: true,
    executableEvidence: true,
  };
}

function parseNativeProbeReport(stdout: string): NativeProbeChildReport {
  const value: unknown = JSON.parse(stdout);
  if (typeof value !== "object" || value === null) throw new Error("native probe stdout is not a JSON object");
  return value as NativeProbeChildReport;
}

function assertNativeProbeReport(
  report: NativeProbeChildReport,
  input: PackageQualificationInput,
  mode: "indexed" | "import",
): void {
  if (
    report.schema !== LADYBUG_NATIVE_PROBE_SCHEMA ||
    report.mode !== mode ||
    report.platform !== input.os ||
    report.arch !== input.cpu ||
    report.bun !== Bun.version ||
    report.ladybugVersion !== LADYBUG_VERSION ||
    report.ladybugStorageVersion !== EXPECTED_LADYBUG_STORAGE_VERSION
  ) {
    throw new Error("native probe report does not match the active host and Ladybug contract");
  }
}

export function isKnownNativeCrash(exitCode: number, signal: NodeJS.Signals | null): boolean {
  if (signal === "SIGSEGV" || signal === "SIGABRT") return true;
  return [11, 134, 139, -1_073_741_819, 3_221_225_477].includes(exitCode);
}

async function smoke(
  command: readonly string[],
  fixtureRoot: string,
  expectedVersion: string,
  environment: Record<string, string | undefined>,
): Promise<SmokeCommandEvidence[]> {
  const evidence: SmokeCommandEvidence[] = [];
  const versionResult = await run(command[0] as string, [...command.slice(1), "--version"], {
    cwd: fixtureRoot,
    env: environment,
  });
  const version = versionResult.stdout.trim();
  if (version !== expectedVersion)
    throw new Error(`packaged Lore version ${version} does not match ${expectedVersion}`);
  evidence.push({ name: "version", stdoutSha256: digest(versionResult.stdout) });
  const helpResult = await run(command[0] as string, [...command.slice(1), "--help"], {
    cwd: fixtureRoot,
    env: environment,
  });
  const help = helpResult.stdout;
  if (!help.includes("graph") || !help.includes("query") || !help.includes("context")) {
    throw new Error("packaged Lore help is missing retrieval commands");
  }
  evidence.push({ name: "help", stdoutSha256: digest(helpResult.stdout) });
  const commands = [
    { name: "graph", args: ["--json", "graph", "index", "--depth", "1"], kind: "graph.export" },
    { name: "query", args: ["--json", "query", "constellation-common", "--limit", "2"], kind: "query.results" },
    {
      name: "context",
      args: ["--json", "context", "index", "--max-tokens", "512", "--depth", "1"],
      kind: "context.export",
    },
  ];
  for (const item of commands) {
    const result = await run(command[0] as string, [...command.slice(1), ...item.args], {
      cwd: fixtureRoot,
      env: environment,
    });
    const value: unknown = JSON.parse(result.stdout);
    if (
      typeof value !== "object" ||
      value === null ||
      (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
      (value as { kind?: unknown }).kind !== item.kind
    ) {
      throw new Error(`packaged Lore ${item.name} did not emit the expected JSON contract`);
    }
    evidence.push({ name: item.name, stdoutSha256: digest(result.stdout) });
  }
  return evidence;
}

async function createFixtureBacklogEnvironment(
  input: PackageQualificationInput,
  scratch: string,
): Promise<Record<string, string | undefined>> {
  const binRoot = join(scratch, "fixture-bin");
  mkdirSync(binRoot, { recursive: true });
  const executable = join(binRoot, input.os === "win32" ? "backlog.exe" : "backlog");
  await run(
    "bun",
    ["build", "--compile", `--outfile=${executable}`, join(REPOSITORY_ROOT, "benchmark", "ladybug", "backlog-shim.ts")],
    { cwd: REPOSITORY_ROOT },
  );
  if (!existsSync(executable) || statSync(executable).size < 1_000_000) {
    throw new Error("fixture Backlog shim is missing or suspiciously small");
  }
  return {
    ...process.env,
    PATH: [binRoot, process.env.PATH].filter((value): value is string => value !== undefined).join(delimiter),
  };
}

async function run(
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: Record<string, string | undefined>;
    readonly timeoutMs?: number;
  },
): Promise<CommandResult> {
  const child = Bun.spawn([executable, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeoutMs = options.timeoutMs ?? 120_000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  if (exitCode !== 0) {
    throw new Error(
      `${basename(executable)} ${args.join(" ")} ${timedOut ? `timed out after ${timeoutMs}ms` : `failed with exit ${exitCode}`}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  return { stdout, stderr };
}

function requireExecutable(name: string): string {
  const path = Bun.which(name);
  if (path === null) throw new Error(`matching-host qualification requires ${name} on PATH`);
  return path;
}

function progress(message: string): void {
  process.stderr.write(`[ladybug-package] ${message}\n`);
}

function sourceInventoryDigest(root: string): string {
  return digest(canonicalJson(readSourceInventory(root)));
}

function launcherPaths(installRoot: string): string[] {
  const bin = join(installRoot, "node_modules", ".bin");
  return [join(bin, "lore"), join(bin, "lore.cmd"), join(bin, "lore.ps1")];
}

function findFiles(root: string, filename: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(path, filename));
    if (entry.isFile() && entry.name === filename) found.push(path);
  }
  return found;
}

function removeQualificationScratch(root: string): void {
  const expectedPrefix = "lore-ladybug-package-";
  if (dirname(root) !== tmpdir() || !basename(root).startsWith(expectedPrefix)) {
    throw new Error(`refusing to remove an unexpected package-qualification scratch path: ${root}`);
  }
  makeTreeWritable(root);
  // Windows can retain a crashed native probe's file handles briefly. Node's
  // recursive rm contract retries EBUSY/EPERM with bounded linear backoff.
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function makeTreeWritable(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    chmodSync(path, 0o700);
    for (const entry of readdirSync(path)) makeTreeWritable(join(path, entry));
    return;
  }
  chmodSync(path, 0o600);
}

function assertIsolatedGlobalClean(root: string): true {
  if (existsSync(root) && findFiles(root, "lbugjs.node").length > 0) {
    throw new Error("isolated npm global prefix contains a Ladybug addon");
  }
  for (const fragment of ["@salient-data/lore", "@ladybugdb/core"]) {
    if (existsSync(join(root, "lib", "node_modules", ...fragment.split("/")))) {
      throw new Error(`isolated npm global prefix contains ${fragment}`);
    }
  }
  for (const path of [join(root, "bin", "lore"), join(root, "lore.cmd"), join(root, "lore.ps1")]) {
    if (existsSync(path)) throw new Error(`isolated npm global prefix contains a Lore launcher: ${path}`);
  }
  return true;
}

function assertRegularFile(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

function sha256File(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`expected JSON object: ${path}`);
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, field: string, label: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0) throw new Error(`${label} ${field} must be a string`);
  return fieldValue;
}

function assertStringArray(value: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(value) || canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error(`${label} must be ${canonicalJson(expected)}`);
  }
}

function isNodePlatform(value: string): value is NodeJS.Platform {
  return ["darwin", "linux", "win32"].includes(value);
}

function parseRuntimeMode(value: string | undefined): "qualification" | "smoke" {
  if (value === undefined || value === "qualification") return "qualification";
  if (value === "smoke") return "smoke";
  throw new Error(`unsupported package qualification runtime mode: ${value}`);
}

async function main(): Promise<void> {
  const input = parsePackageQualificationArgs(process.argv.slice(2));
  const report = await qualify(input);
  process.stdout.write(
    `qualified ${report.package.root} + ${report.package.platform} on ${report.platform.os}-${report.platform.cpu}\n`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}

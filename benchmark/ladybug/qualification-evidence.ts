#!/usr/bin/env bun
/** Strict task-level acceptance-evidence manifest for LCLI-283.1.4. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import { LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA, parseLadybugConcurrencyEvidenceReport } from "./concurrency-evidence";
import { LADYBUG_BENCHMARK_FIXTURE_SCHEMA, loadLadybugBenchmarkFixtureSpec } from "./fixture";
import {
  LADYBUG_BENCHMARK_GATE_DIGEST,
  LADYBUG_BENCHMARK_GATE_SCHEMA,
  LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT,
} from "./gates";
import { ladybugQualificationScenarios } from "./orchestrator";
import {
  assertPackageQualificationReport,
  LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
  type PackageQualificationReport,
} from "./package-qualification";
import { LADYBUG_BENCHMARK_REPORT_SCHEMA, type LadybugBenchmarkReport, parseLadybugBenchmarkReport } from "./report";
import { LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION, qualificationRunConfiguration } from "./run";

export const LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA = "lore.ladybug-qualification-evidence/1";

export const LADYBUG_QUALIFICATION_PLATFORMS = [
  { distribution: "darwin-arm64", os: "darwin", cpu: "arm64", supportClaim: "native-index" },
  { distribution: "darwin-x64", os: "darwin", cpu: "x64", supportClaim: "native-index" },
  { distribution: "linux-arm64", os: "linux", cpu: "arm64", supportClaim: "native-index" },
  { distribution: "linux-x64", os: "linux", cpu: "x64", supportClaim: "native-index" },
  { distribution: "win32-x64", os: "win32", cpu: "x64", supportClaim: "reference-fallback-only" },
] as const;

export interface QualificationEvidenceArtifact<T> {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly value: T;
}

interface ArtifactReference {
  readonly name: string;
  readonly schema: string;
  readonly digest: string;
}

export interface LadybugQualificationEvidenceManifest {
  readonly schema: typeof LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA;
  readonly generatedAt: string;
  readonly repository: { readonly commit: string };
  readonly artifacts: {
    readonly linuxBenchmark: ArtifactReference;
    readonly gates: ArtifactReference;
    readonly packages: readonly ArtifactReference[];
    readonly concurrency: ArtifactReference;
  };
  readonly platformVerdicts: readonly {
    readonly distribution: string;
    readonly supportClaim: "native-index" | "reference-fallback-only";
    readonly executableEvidence: boolean;
    readonly databaseCreated: boolean;
    readonly cleanupPassed: true;
  }[];
  readonly acceptanceCriteria: readonly {
    readonly number: 1 | 2 | 3 | 4;
    readonly status: "pass";
    readonly evidence: readonly string[];
  }[];
  readonly status: "pass";
}

export interface LadybugQualificationEvidenceInputs {
  readonly linuxBenchmark: QualificationEvidenceArtifact<unknown>;
  readonly gates: QualificationEvidenceArtifact<unknown>;
  readonly packages: readonly QualificationEvidenceArtifact<unknown>[];
  readonly concurrency: QualificationEvidenceArtifact<unknown>;
}

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ArtifactReferenceSchema = z.strictObject({
  name: z.string().min(1),
  schema: z.string().min(1),
  digest: Sha256Schema,
});

export const LadybugQualificationEvidenceManifestSchema = z.strictObject({
  schema: z.literal(LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA),
  generatedAt: z.iso.datetime({ offset: true }),
  repository: z.strictObject({ commit: z.string().regex(/^[0-9a-f]{40}$/) }),
  artifacts: z.strictObject({
    linuxBenchmark: ArtifactReferenceSchema,
    gates: ArtifactReferenceSchema,
    packages: z.array(ArtifactReferenceSchema).length(5),
    concurrency: ArtifactReferenceSchema,
  }),
  platformVerdicts: z
    .array(
      z.strictObject({
        distribution: z.string().min(1),
        supportClaim: z.enum(["native-index", "reference-fallback-only"]),
        executableEvidence: z.boolean(),
        databaseCreated: z.boolean(),
        cleanupPassed: z.literal(true),
      }),
    )
    .length(5),
  acceptanceCriteria: z.array(
    z.strictObject({
      number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      status: z.literal("pass"),
      evidence: z.array(z.string().min(1)).min(1),
    }),
  ),
  status: z.literal("pass"),
});

export function buildLadybugQualificationEvidenceManifest(
  inputs: LadybugQualificationEvidenceInputs,
): LadybugQualificationEvidenceManifest {
  assertArtifactNamesUnique([inputs.linuxBenchmark, inputs.gates, ...inputs.packages, inputs.concurrency]);
  const gateDigest = artifactDigest(inputs.gates.bytes);
  if (gateDigest !== LADYBUG_BENCHMARK_GATE_DIGEST) {
    throw new Error(`qualification gate artifact digest is not the approved ${LADYBUG_BENCHMARK_GATE_DIGEST}`);
  }
  const gateValue = objectValue(inputs.gates.value, "qualification gate artifact");
  if (gateValue.schema !== LADYBUG_BENCHMARK_GATE_SCHEMA) {
    throw new Error("qualification gate artifact schema is unsupported");
  }

  const linux = parseLadybugBenchmarkReport(inputs.linuxBenchmark.value);
  assertFullBenchmark(linux, "linux", "x64", true);

  const concurrency = parseLadybugConcurrencyEvidenceReport(inputs.concurrency.value);
  if (
    concurrency.toolchain.bun !== LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION ||
    concurrency.repository.commit === null ||
    concurrency.repository.dirty
  ) {
    throw new Error("concurrency evidence must come from a clean pinned-Bun qualification checkout");
  }

  if (inputs.packages.length !== LADYBUG_QUALIFICATION_PLATFORMS.length) {
    throw new Error("qualification evidence requires exactly five matching-host package reports");
  }
  const packages = inputs.packages.map((artifact) => {
    assertPackageQualificationReport(artifact.value);
    return { artifact, report: artifact.value as PackageQualificationReport };
  });
  packages.sort((left, right) => left.report.platform.distribution.localeCompare(right.report.platform.distribution));
  const verdicts = LADYBUG_QUALIFICATION_PLATFORMS.map((expected) => {
    const matches = packages.filter(({ report }) => report.platform.distribution === expected.distribution);
    if (matches.length !== 1) throw new Error(`qualification evidence requires one ${expected.distribution} report`);
    const report = matches[0]?.report as PackageQualificationReport;
    assertPackageEvidence(report, expected);
    return {
      distribution: expected.distribution,
      supportClaim: expected.supportClaim,
      executableEvidence: report.native.executableEvidence,
      databaseCreated: report.native.databaseCreated,
      cleanupPassed: true as const,
    };
  });

  const commit = linux.repository.commit;
  if (commit === null || linux.repository.dirty) {
    throw new Error("benchmark evidence must come from a clean repository commit");
  }
  const observedCommits = [concurrency.repository.commit, ...packages.map(({ report }) => report.repository.commit)];
  if (observedCommits.some((candidate) => candidate !== commit)) {
    throw new Error("qualification artifacts do not share one repository commit");
  }

  const packageReferences = packages.map(({ artifact }) => reference(artifact, LADYBUG_PACKAGE_QUALIFICATION_SCHEMA));
  const linuxReference = reference(inputs.linuxBenchmark, LADYBUG_BENCHMARK_REPORT_SCHEMA);
  const gateReference = reference(inputs.gates, LADYBUG_BENCHMARK_GATE_SCHEMA);
  const concurrencyReference = reference(inputs.concurrency, LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA);
  const manifest: LadybugQualificationEvidenceManifest = {
    schema: LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    repository: { commit },
    artifacts: {
      linuxBenchmark: linuxReference,
      gates: gateReference,
      packages: packageReferences,
      concurrency: concurrencyReference,
    },
    platformVerdicts: verdicts,
    acceptanceCriteria: [
      { number: 1, status: "pass", evidence: [linuxReference.digest] },
      { number: 2, status: "pass", evidence: [gateReference.digest, linuxReference.digest] },
      { number: 3, status: "pass", evidence: packageReferences.map((artifact) => artifact.digest) },
      { number: 4, status: "pass", evidence: [concurrencyReference.digest] },
    ],
    status: "pass",
  };
  return parseLadybugQualificationEvidenceManifest(manifest);
}

export function parseLadybugQualificationEvidenceManifest(value: unknown): LadybugQualificationEvidenceManifest {
  const parsed = LadybugQualificationEvidenceManifestSchema.parse(value) as LadybugQualificationEvidenceManifest;
  if (parsed.acceptanceCriteria.map((criterion) => criterion.number).join(",") !== "1,2,3,4") {
    throw new Error("qualification evidence manifest must map acceptance criteria 1 through 4 exactly once");
  }
  return parsed;
}

function assertFullBenchmark(
  report: LadybugBenchmarkReport,
  platform: NodeJS.Platform,
  arch: string | undefined,
  requireConclusivePass: boolean,
): void {
  if (
    report.mode !== "qualification" ||
    report.toolchain.bunVersion !== LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION ||
    report.host.platform !== platform ||
    (arch !== undefined && report.host.arch !== arch) ||
    JSON.stringify(report.configuration) !== JSON.stringify(qualificationRunConfiguration("qualification"))
  ) {
    throw new Error(
      `benchmark evidence is not a pinned full ${platform}${arch === undefined ? "" : `-${arch}`} qualification`,
    );
  }
  if (report.calibration.status !== "pass") throw new Error(`${platform} benchmark calibration is inconclusive`);
  if (requireConclusivePass && report.gates.evaluation.status !== "pass") {
    throw new Error("Linux-x64 benchmark evidence is not a conclusive gate pass");
  }
  if (
    report.gates.source.digest !== LADYBUG_BENCHMARK_GATE_DIGEST ||
    report.gates.definitions.length !== LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT ||
    report.gates.results.length !== LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT ||
    (requireConclusivePass && report.gates.results.some((result) => result.status !== "pass"))
  ) {
    throw new Error("benchmark evidence does not carry all approved gate results");
  }
  if (report.fixtures.map((fixture) => fixture.name).join(",") !== "large") {
    throw new Error("benchmark evidence requires the bounded 100 MiB large fixture");
  }
  for (const fixture of report.fixtures) {
    const expected = loadLadybugBenchmarkFixtureSpec(
      resolve(import.meta.dir, "fixtures", "v1", `${fixture.name}.json`),
    );
    if (
      fixture.fixtureSchema !== LADYBUG_BENCHMARK_FIXTURE_SCHEMA ||
      JSON.stringify(fixture.digests) !== JSON.stringify(expected.expected) ||
      JSON.stringify(fixture.counts) !== JSON.stringify(expected.counts)
    ) {
      throw new Error(`${fixture.name} benchmark fixture does not match the frozen digest contract`);
    }
    const expectedScenarioIds = ladybugQualificationScenarios(expected).map((scenario) => scenario.id);
    if (
      fixture.scenarios.map((scenario) => scenario.id).join(",") !== expectedScenarioIds.join(",") ||
      fixture.summaries.warm.map((summary) => summary.scenarioId).join(",") !== expectedScenarioIds.join(",")
    ) {
      throw new Error(`${fixture.name} benchmark evidence does not cover every frozen scenario`);
    }
    assertFullSampleInventory(
      fixture.samples,
      fixture.scenarios.map((scenario) => scenario.id),
    );
  }
}

function assertFullSampleInventory(
  samples: LadybugBenchmarkReport["fixtures"][number]["samples"],
  scenarioIds: readonly string[],
): void {
  if (samples.some((sample) => sample.phase === "cold-setup")) {
    throw new Error("bounded benchmark evidence must not contain a discarded cold setup");
  }
  if (samples.filter((sample) => sample.phase === "cold-measurement").length !== 1) {
    throw new Error("bounded benchmark evidence requires exactly one cold build");
  }
  for (const scenarioId of scenarioIds) {
    const scenario = samples.filter((sample) => sample.scenarioId === scenarioId);
    if (
      scenario.some((sample) => sample.phase === "parity" || sample.phase === "warmup") ||
      scenario.filter((sample) => sample.phase === "measurement").length !== 10
    ) {
      throw new Error(`full benchmark evidence has incomplete ${scenarioId} samples`);
    }
  }
}

function assertPackageEvidence(
  report: PackageQualificationReport,
  expected: (typeof LADYBUG_QUALIFICATION_PLATFORMS)[number],
): void {
  if (
    report.mode !== "qualification" ||
    report.platform.bun !== LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION ||
    report.platform.os !== expected.os ||
    report.platform.cpu !== expected.cpu ||
    report.native.supportClaim !== expected.supportClaim ||
    report.ladybug.optionalPackage !== `@ladybugdb/core-${expected.os}-${expected.cpu}` ||
    report.package.platform !== `@salient-data/lore-${expected.distribution}`
  ) {
    throw new Error(`${expected.distribution} artifact is not matching-host executable qualification evidence`);
  }
  const commandNames = ["version", "help", "graph", "query", "context"];
  if (
    report.smoke.launcher.map((command) => command.name).join(",") !== commandNames.join(",") ||
    report.smoke.standalone.map((command) => command.name).join(",") !== commandNames.join(",") ||
    report.smoke.launcher.some(
      (command, index) => command.stdoutSha256 !== report.smoke.standalone[index]?.stdoutSha256,
    )
  ) {
    throw new Error(`${expected.distribution} artifact lacks stable Node-launcher and Bun-binary command evidence`);
  }
  const hashes = [
    report.package.rootTarballSha256,
    report.package.platformTarballSha256,
    report.package.standaloneBinarySha256,
    report.ladybug.addonSha256,
  ];
  if (hashes.some((hash) => !/^sha256:[0-9a-f]{64}$/.test(hash))) {
    throw new Error(`${expected.distribution} artifact lacks package and native-addon hashes`);
  }
  if (expected.supportClaim === "native-index") {
    if (!report.native.executableEvidence || !report.native.databaseCreated || report.native.probeOutcome !== "pass") {
      throw new Error(`${expected.distribution} artifact lacks executable native-index evidence`);
    }
  } else if (
    report.native.executableEvidence ||
    report.native.databaseCreated ||
    report.native.referenceFallbackDatabaseAbsent !== true
  ) {
    throw new Error("Windows artifact does not prove reference-fallback-only behavior without a database");
  }
}

function reference(artifact: QualificationEvidenceArtifact<unknown>, schema: string): ArtifactReference {
  return { name: safeArtifactName(artifact.name), schema, digest: artifactDigest(artifact.bytes) };
}

function artifactDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeArtifactName(name: string): string {
  if (name !== basename(name) || name.length === 0) throw new Error("qualification artifact names must be path-free");
  return name;
}

function assertArtifactNamesUnique(artifacts: readonly QualificationEvidenceArtifact<unknown>[]): void {
  const names = artifacts.map((artifact) => safeArtifactName(artifact.name));
  if (new Set(names).size !== names.length) throw new Error("qualification artifact names must be unique");
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

interface CliOptions {
  readonly linuxBenchmark: string;
  readonly gates: string;
  readonly packages: readonly string[];
  readonly concurrency: string;
  readonly output: string;
}

export function parseLadybugQualificationEvidenceArgs(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  const packages: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("qualification evidence arguments must be --name value pairs");
    }
    if (key === "--package-report") {
      packages.push(resolve(value));
      continue;
    }
    if (values.has(key)) throw new Error(`duplicate qualification evidence argument: ${key}`);
    values.set(key, value);
  }
  const known = new Set(["--linux-benchmark", "--gates", "--concurrency", "--output"]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`unknown qualification evidence argument: ${key}`);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`missing qualification evidence argument: ${key}`);
    return resolve(value);
  };
  if (packages.length !== 5) throw new Error("qualification evidence requires five --package-report arguments");
  return {
    linuxBenchmark: required("--linux-benchmark"),
    gates: required("--gates"),
    packages,
    concurrency: required("--concurrency"),
    output: required("--output"),
  };
}

function readArtifact(path: string): QualificationEvidenceArtifact<unknown> {
  const bytes = readFileSync(path);
  return { name: basename(path), bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
}

async function main(): Promise<void> {
  const options = parseLadybugQualificationEvidenceArgs(process.argv.slice(2));
  const manifest = buildLadybugQualificationEvidenceManifest({
    linuxBenchmark: readArtifact(options.linuxBenchmark),
    gates: readArtifact(options.gates),
    packages: options.packages.map(readArtifact),
    concurrency: readArtifact(options.concurrency),
  });
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`mapped LCLI-283.1.4 acceptance evidence for commit ${manifest.repository.commit}\n`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}

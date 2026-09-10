/** Sacrificial matching-host probe for the exact Ladybug native boundary. */

import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadLadybugNativeDriver } from "../../src/core/ladybug-native";
import { canonicalJson, digest } from "../../src/core/ladybug-source";
import { generateLadybugBenchmarkFixture, loadLadybugBenchmarkFixtureSpec } from "./fixture";

export const LADYBUG_NATIVE_PROBE_SCHEMA = "lore.ladybug-native-probe/1";
export const NATIVE_IMPORT_STARTED_FILENAME = "native-import-started";
export const NATIVE_IMPORT_COMPLETED_FILENAME = "native-import-completed";
export const NATIVE_IMPORT_FAILED_FILENAME = "native-import-failed";

type ProbeMode = "import" | "indexed";

interface NativeProbeReport {
  readonly schema: typeof LADYBUG_NATIVE_PROBE_SCHEMA;
  readonly mode: ProbeMode;
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

async function probe(mode: ProbeMode, root: string): Promise<NativeProbeReport> {
  writeFileSync(join(root, NATIVE_IMPORT_STARTED_FILENAME), "");
  const driver = await loadLadybugNativeDriver();
  writeFileSync(join(root, NATIVE_IMPORT_COMPLETED_FILENAME), "");
  if (mode === "import") {
    return {
      schema: LADYBUG_NATIVE_PROBE_SCHEMA,
      mode,
      platform: process.platform,
      arch: process.arch,
      bun: Bun.version,
      ladybugVersion: driver.LADYBUG_VERSION,
      ladybugStorageVersion: driver.LADYBUG_STORAGE_VERSION,
      databaseCreated: false,
      conceptCount: null,
      taskCount: null,
      authoredEdgeCount: null,
      graphDigest: null,
    };
  }

  const fixtureRoot = join(root, "fixture");
  const databasePath = join(root, "native-probe.lbdb");
  const spec = loadLadybugBenchmarkFixtureSpec(resolve(import.meta.dir, "fixtures", "v1", "small.json"));
  const generated = generateLadybugBenchmarkFixture(spec, fixtureRoot);
  await driver.buildLadybugDatabase(databasePath, generated.source);
  const verification = await driver.verifyLadybugDatabase(databasePath, generated.source);
  const graph = await driver.readLadybugBundleGraph(databasePath, generated.source);
  const expectedGraphEdges = generated.source.authoredEdges.filter((edge) => edge.kind !== "task").length;
  if (
    verification.conceptCount !== generated.source.counts.concepts ||
    verification.taskCount !== generated.source.counts.tasks ||
    verification.authoredEdgeCount !== generated.source.counts.authoredEdges ||
    graph.concepts.size !== generated.source.counts.concepts ||
    graph.edges.length !== expectedGraphEdges
  ) {
    throw new Error("native probe verification or graph counts differ from the generated source");
  }
  return {
    schema: LADYBUG_NATIVE_PROBE_SCHEMA,
    mode,
    platform: process.platform,
    arch: process.arch,
    bun: Bun.version,
    ladybugVersion: driver.LADYBUG_VERSION,
    ladybugStorageVersion: driver.LADYBUG_STORAGE_VERSION,
    databaseCreated: existsSync(databasePath),
    conceptCount: verification.conceptCount,
    taskCount: verification.taskCount,
    authoredEdgeCount: verification.authoredEdgeCount,
    graphDigest: digest(
      canonicalJson({
        concepts: [...graph.concepts.keys()],
        edges: graph.edges,
      }),
    ),
  };
}

function parseArgs(args: readonly string[]): { mode: ProbeMode; root: string } {
  if (args.length !== 4 || args[0] !== "--mode" || args[2] !== "--root") {
    throw new Error("native probe requires --mode <import|indexed> --root <scratch-path>");
  }
  const mode = args[1];
  const root = args[3];
  if (mode !== "import" && mode !== "indexed") throw new Error(`unsupported native probe mode: ${mode}`);
  if (root === undefined || root.length === 0) throw new Error("native probe root must be non-empty");
  return { mode, root: resolve(root) };
}

if (import.meta.main) {
  const { mode, root } = parseArgs(process.argv.slice(2));
  probe(mode, root)
    .then((report) => process.stdout.write(`${canonicalJson(report)}\n`))
    .catch((error: unknown) => {
      // A normal JavaScript rejection reaches this handler; a native process
      // crash does not. The parent can therefore distinguish the two without
      // relying on platform-specific exit-code normalization or error text.
      writeFileSync(join(root, NATIVE_IMPORT_FAILED_FILENAME), "");
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      process.exitCode = 1;
    });
}

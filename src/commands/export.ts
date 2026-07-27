/** `lore export --schema-version 1.0` — deterministic JSONL OKF projection. */

import { join } from "node:path";
import { type BacklogAdapter, bunBacklogSpawn, createBacklogAdapter } from "../adapters/backlog";
import { resolveHeadSha } from "../adapters/git";
import { loadBundle } from "../core/bundle";
import { loadProfile } from "../core/profile";
import { buildProjection, PROJECTION_SCHEMA_VERSION } from "../core/projection";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { VERSION } from "../meta";
import { emit, type OutputContext, type Renderable } from "../output";

export interface ExportOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly resolveGitCommit?: (root: string) => string | null;
  readonly generatedAt?: string | null;
}

export async function runExport(options: ExportOptions): Promise<number> {
  const schemaVersion = parseExportArgs(options.args, options.output);
  // Everything below this line may touch bundle, Backlog, or Git state. Keeping
  // version parsing above it makes unsupported breaking versions fail first.
  const profile = loadProfile({ root: options.root });
  const warnings = new WarningCollector();
  const graph = loadBundle(join(options.root, DOCS_DIR), { warnings, profile });
  warnings.flush({ color: options.output.color, stderr: options.stderr });
  const adapter = options.adapter ?? createBacklogAdapter(bunBacklogSpawn(undefined, options.root));
  const tasks = await adapter.listTasks();
  const gitCommit = (options.resolveGitCommit ?? resolveHeadSha)(options.root);
  const projection = buildProjection({
    graph,
    tasks,
    docsRoot: DOCS_DIR,
    okfVersion: profile.okfVersion,
    exporterVersion: VERSION,
    gitCommit,
    generatedAt:
      options.generatedAt !== undefined ? options.generatedAt : sourceDateEpoch(process.env.SOURCE_DATE_EPOCH),
  });
  if (options.output.mode === "json") {
    const data = { projectionSchemaVersion: schemaVersion, records: projection.records };
    const renderable: Renderable<typeof data> = {
      kind: "projection.export",
      data,
      pretty: () => projection.jsonl,
      plain: () => projection.jsonl,
    };
    emit(renderable, options.output, options.stdout);
  } else {
    (options.stdout ?? process.stdout).write(projection.jsonl);
  }
  return EXIT_OK;
}

function parseExportArgs(args: readonly string[], output: OutputContext): string {
  void output;
  let version = PROJECTION_SCHEMA_VERSION;
  let seen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--schema-version") {
      if (seen) throw usage("--schema-version given more than once", "pass it at most once");
      const value = args[++i];
      if (value === undefined || value.startsWith("-")) {
        throw usage("--schema-version needs a value", `pass --schema-version ${PROJECTION_SCHEMA_VERSION}`);
      }
      version = value;
      seen = true;
    } else if (arg.startsWith("--schema-version=")) {
      if (seen) throw usage("--schema-version given more than once", "pass it at most once");
      version = arg.slice("--schema-version=".length);
      seen = true;
    } else if (arg.startsWith("-")) {
      throw usage(`unknown option "${arg}"`, "run `lore export --help` to list options");
    } else {
      throw usage(`unexpected argument "${arg}"`, "run `lore export --help` to list options");
    }
  }
  if (version !== PROJECTION_SCHEMA_VERSION) {
    throw usage(
      `unsupported projection schema version "${version}"`,
      `this lore supports ${PROJECTION_SCHEMA_VERSION}`,
    );
  }
  return version;
}

function sourceDateEpoch(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw usage("SOURCE_DATE_EPOCH must be a non-negative number", "unset it or provide Unix epoch seconds");
  }
  return new Date(seconds * 1000).toISOString();
}

function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}

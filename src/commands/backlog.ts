/** Backlog knowledge-adoption public command family. */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, posix } from "node:path";
import { idFromPath, serializeConcept } from "../core/concept";
import { typeDirectory } from "../core/schema";
import { slugify } from "../core/template";
import { EXIT_CODES, EXIT_OK, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, singleOptionValue, usage } from "./args";
import { assertNoSymlinkInAnyPath, createIfAbsent, ensureDir, writeFileAtomic } from "./fswrite";

const SOURCE_SCHEMA = "lore-backlog-adoption-source/1";
const PLAN_SCHEMA = "lore-backlog-adoption-plan/1";
const LEDGER_ROOT = ".lore/adoptions/1";
type SourceType = "decision" | "specification" | "guide" | "runbook" | "other" | "readme";
interface SourceRecord {
  id: string;
  type: string;
  path: string;
  digest: string;
  title?: string;
  content: string;
}
interface SourceManifest {
  schema: string;
  repository: { id: string; revision: string };
  records: SourceRecord[];
  migration?: string;
}
interface Planned {
  source: SourceRecord;
  type: string | null;
  id: string | null;
  path: string | null;
  content: string | null;
  contentDigest: string | null;
}
interface Artifact {
  id: string;
  path: string;
  contentDigest: string;
  provenance: {
    repository: string;
    revision: string;
    sourcePath: string;
    sourceRecordId: string;
    sourceRecordType: string;
  };
  removed: boolean;
}
interface Ledger {
  schema: "lore-backlog-adoption-ledger/1";
  migration: string;
  approvalDigest: string;
  manifestDigest: string;
  source: SourceManifest["repository"];
  state: "previewed" | "applied" | "rolled-back" | "blocked-incomplete";
  created: Artifact[];
}
export interface BacklogOptions {
  root: string;
  output: OutputContext;
  args: readonly string[];
  stdout?: Writer;
  stderr?: Writer;
}

export function runBacklog(options: BacklogOptions): number {
  const parsed = parseCommandArgs(options.args, "backlog");
  if (parsed.positionals[0] !== "adopt")
    throw usage("backlog needs the adopt command family", "run `lore backlog adopt <preview|apply|status|rollback>`");
  const operation = parsed.positionals[1];
  if (!["preview", "apply", "status", "rollback"].includes(operation ?? "") || parsed.positionals.length !== 2)
    throw usage(
      "backlog adopt needs preview, apply, status, or rollback",
      "run `lore backlog adopt preview --manifest <file>`",
    );
  const manifestPath = singleOptionValue(parsed, "manifest");
  const approvalDigest = singleOptionValue(parsed, "approval-digest");
  const migrationFlag = singleOptionValue(parsed, "migration");
  if (operation === "preview") return preview(options, requiredManifest(manifestPath), migrationFlag);
  if (operation === "apply")
    return apply(options, requiredManifest(manifestPath), required(approvalDigest, "--approval-digest"), migrationFlag);
  if (manifestPath !== undefined || approvalDigest !== undefined)
    throw usage(
      `${operation} accepts only --migration`,
      `run \`lore backlog adopt ${operation} --migration <identity>\``,
    );
  return operation === "status"
    ? status(options, required(migrationFlag, "--migration"))
    : rollback(options, required(migrationFlag, "--migration"));
}
function preview(options: BacklogOptions, manifestPath: string, requestedMigration?: string): number {
  const manifest = readManifest(options.root, manifestPath);
  const plan = planFor(manifest, requestedMigration);
  const data = receipt(plan, options.root);
  emit(render("backlog.adoption.preview", data), options.output, options.stdout);
  return EXIT_OK;
}
function apply(options: BacklogOptions, manifestPath: string, expected: string, requestedMigration?: string): number {
  const manifest = readManifest(options.root, manifestPath);
  const plan = planFor(manifest, requestedMigration);
  const file = ledgerPath(options.root, plan.migration);
  let ledger = readLedger(file);
  const approval = receipt(
    plan,
    options.root,
    new Set(ledger?.created.filter((artifact) => !artifact.removed).map((artifact) => artifact.path)),
  );
  if (expected !== approval.approval.digest)
    throw new LoreError(
      "conflict",
      "approval digest does not match the current normalized preview",
      "run preview again and pass its exact approval digest",
      { expected, actual: approval.approval.digest },
    );
  if (ledger && ledger.approvalDigest !== expected)
    throw new LoreError(
      "conflict",
      "migration identity belongs to a different approval receipt",
      "choose a new migration identity",
      { migration: plan.migration },
    );
  if (ledger?.state === "applied") {
    emit(render("backlog.adoption.apply", ledger), options.output, options.stdout);
    return EXIT_OK;
  }
  if (approval.records.some((record) => record.collision !== null))
    throw new LoreError(
      "conflict",
      "preview contains destination collisions",
      "resolve every collision and run preview again",
      { collisions: approval.records.filter((record) => record.collision !== null).map((record) => record.collision) },
    );
  const writable = plan.records.filter(
    (r): r is Planned & { path: string; id: string; content: string; contentDigest: string } =>
      r.path !== null && r.id !== null && r.content !== null && r.contentDigest !== null,
  );
  if (plan.records.some((r) => r.path === null))
    throw new LoreError(
      "validation",
      "preview contains fidelity gaps; apply cannot create an implicit conversion",
      "remove unsupported source records or supply a supported source type",
      { fidelityGaps: plan.records.filter((r) => r.path === null).map((r) => r.source.id) },
    );
  assertNoSymlinkInAnyPath(options.root, [...writable.map((r) => r.path), ledgerRel(plan.migration)]);
  for (const r of writable)
    if (existsSync(join(options.root, r.path)))
      throw new LoreError("conflict", `${r.path} already exists`, "resolve the collision and run preview again", {
        path: r.path,
      });
  ledger = {
    schema: "lore-backlog-adoption-ledger/1",
    migration: plan.migration,
    approvalDigest: expected,
    manifestDigest: plan.manifestDigest,
    source: manifest.repository,
    state: "previewed",
    created: [],
  };
  saveLedger(options.root, ledger);
  try {
    for (const r of writable) {
      ensureDir(options.root, posix.dirname(r.path));
      if (!createIfAbsent(join(options.root, r.path), r.content, r.path))
        throw new LoreError("conflict", `${r.path} already exists`);
      ledger.created.push({
        id: r.id,
        path: r.path,
        contentDigest: r.contentDigest,
        provenance: {
          repository: manifest.repository.id,
          revision: manifest.repository.revision,
          sourcePath: r.source.path,
          sourceRecordId: r.source.id,
          sourceRecordType: r.source.type,
        },
        removed: false,
      });
      saveLedger(options.root, ledger);
    }
  } catch (error) {
    const blocked = compensate(options.root, ledger);
    ledger.state = blocked ? "blocked-incomplete" : "previewed";
    saveLedger(options.root, ledger);
    if (blocked) {
      emit(render("backlog.adoption.apply", ledger), options.output, options.stdout);
      return EXIT_CODES.validation;
    }
    throw error;
  }
  ledger.state = "applied";
  saveLedger(options.root, ledger);
  emit(render("backlog.adoption.apply", ledger), options.output, options.stdout);
  return EXIT_OK;
}
function status(options: BacklogOptions, migration: string): number {
  const ledger = mustLedger(options.root, migration);
  emit(render("backlog.adoption.status", ledger), options.output, options.stdout);
  return EXIT_OK;
}
function rollback(options: BacklogOptions, migration: string): number {
  const ledger = mustLedger(options.root, migration);
  if (ledger.state === "rolled-back") {
    emit(render("backlog.adoption.rollback", ledger), options.output, options.stdout);
    return EXIT_OK;
  }
  const blocked = compensate(options.root, ledger);
  ledger.state = blocked ? "blocked-incomplete" : "rolled-back";
  saveLedger(options.root, ledger);
  emit(render("backlog.adoption.rollback", ledger), options.output, options.stdout);
  return blocked ? EXIT_CODES.validation : EXIT_OK;
}
function compensate(root: string, ledger: Ledger): boolean {
  let blocked = false;
  for (const created of [...ledger.created].reverse()) {
    if (created.removed) continue;
    const abs = join(root, created.path);
    try {
      if (
        !existsSync(abs) ||
        hash(readFileSync(abs, "utf8")) !== created.contentDigest ||
        !readFileSync(abs, "utf8").includes(`migration: ${ledger.migration}`)
      ) {
        blocked = true;
        break;
      }
      unlinkSync(abs);
      created.removed = true;
      saveLedger(root, ledger);
    } catch {
      blocked = true;
      break;
    }
  }
  return blocked;
}
function readManifest(root: string, path: string): SourceManifest {
  if (path.startsWith("/") || path.split(/[\\/]/).includes(".."))
    throw usage("--manifest must be a repository-relative path", "pass a confined JSON source manifest");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch {
    throw new LoreError("not_found", `cannot read source manifest ${path}`, "pass a readable JSON manifest", { path });
  }
  const m = raw as SourceManifest;
  if (m?.schema !== SOURCE_SCHEMA || !m.repository?.id || !m.repository.revision || !Array.isArray(m.records))
    throw new LoreError(
      "validation",
      `invalid ${SOURCE_SCHEMA} manifest`,
      "provide repository id/revision and an ordered records array",
      { path },
    );
  const ids = new Set<string>();
  const sourcePaths = new Set<string>();
  for (const r of m.records) {
    if (!r?.id || !r.type || !r.path || !r.digest || typeof r.content !== "string")
      throw new LoreError("validation", "each source record needs id, type, path, content, and digest", undefined, {
        record: r,
      });
    if (r.path.startsWith("/") || r.path.split(/[\\/]/).includes(".."))
      throw new LoreError("validation", "source record paths must be repository-relative", undefined, { path: r.path });
    if (ids.has(r.id) || sourcePaths.has(r.path))
      throw new LoreError("validation", "source record IDs and paths must be unique", undefined, {
        id: r.id,
        path: r.path,
      });
    if (hash(r.content) !== r.digest)
      throw new LoreError(
        "validation",
        "source record content does not match its declared digest",
        "supply the exact source bytes and their sha256 digest",
        { id: r.id, path: r.path, expected: r.digest, actual: hash(r.content) },
      );
    ids.add(r.id);
    sourcePaths.add(r.path);
  }
  return m;
}
function planFor(manifest: SourceManifest, requested?: string) {
  const manifestDigest = hash(canonical(manifest));
  const migration = requested ?? manifest.migration ?? hash(`lore-backlog-adoption-migration/1\0${manifestDigest}`);
  const records = manifest.records.map((source) => buildPlanned(manifest, source, migration));
  return { migration, manifestDigest, source: manifest.repository, records };
}
function buildPlanned(manifest: SourceManifest, source: SourceRecord, migration: string): Planned {
  const map: Record<SourceType, string> = {
    decision: "ADR",
    specification: "Spec",
    guide: "Runbook",
    runbook: "Runbook",
    other: "Reference",
    readme: "Reference",
  };
  const type = map[source.type as SourceType];
  if (!type) return { source, type: null, id: null, path: null, content: null, contentDigest: null };
  const slug = slugify(source.title ?? source.id);
  const path = `docs/${typeDirectory(type)}/${slug}.md`;
  const id = idFromPath(path.slice(5));
  const frontmatter = {
    type,
    title: source.title ?? source.id,
    summary: `Adopted Backlog ${source.type} record ${source.id}.`,
    lore_adoption: {
      migration,
      source_repository: manifest.repository.id,
      source_revision: manifest.repository.revision,
      source_path: source.path,
      source_record_id: source.id,
      source_record_type: source.type,
      source_digest: source.digest,
    },
  };
  const content = serializeConcept({
    id,
    path: path.slice(5),
    type,
    frontmatter,
    body: `# ${source.title ?? source.id}\n\n${source.content ?? ""}\n`,
  });
  return { source, type, id, path, content, contentDigest: hash(content) };
}
function receipt(plan: ReturnType<typeof planFor>, root: string, ownedPaths: ReadonlySet<string> = new Set()) {
  const destinationCounts = new Map<string, number>();
  for (const record of plan.records)
    if (record.path !== null) destinationCounts.set(record.path, (destinationCounts.get(record.path) ?? 0) + 1);
  const proposed = plan.records.map((r) => ({
    source: { id: r.source.id, path: r.source.path, type: r.source.type, digest: r.source.digest },
    type: r.type,
    id: r.id,
    path: r.path,
    contentDigest: r.contentDigest,
    collision:
      r.path !== null && destinationCounts.get(r.path) !== 1
        ? { path: r.path, reason: "duplicate-destination" }
        : r.path !== null && existsSync(join(root, r.path)) && !ownedPaths.has(r.path)
          ? { path: r.path, reason: "destination-exists" }
          : null,
    fidelityGap:
      r.path === null ? { recordId: r.source.id, sourceType: r.source.type, reason: "unsupported-source-type" } : null,
  }));
  const proposedArtifactDigest = hash(canonical(proposed));
  const digest = hash(
    `lore-backlog-adoption-approval/1\0${plan.manifestDigest}\0${proposedArtifactDigest}\0${plan.migration}`,
  );
  return {
    migration: plan.migration,
    source: plan.source,
    records: proposed,
    approval: {
      schema: PLAN_SCHEMA,
      migration: plan.migration,
      manifestDigest: plan.manifestDigest,
      proposedArtifactDigest,
      digest,
    },
  };
}
function ledgerRel(migration: string) {
  return `${LEDGER_ROOT}/${hash(migration).slice(7)}.json`;
}
function ledgerPath(root: string, migration: string) {
  return join(root, ledgerRel(migration));
}
function readLedger(file: string): Ledger | undefined {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Ledger) : undefined;
}
function mustLedger(root: string, migration: string) {
  const l = readLedger(ledgerPath(root, migration));
  if (!l)
    throw new LoreError("not_found", `no adoption migration ${migration}`, "run preview then apply first", {
      migration,
    });
  return l;
}
function saveLedger(root: string, l: Ledger) {
  ensureDir(root, LEDGER_ROOT);
  writeFileAtomic(ledgerPath(root, l.migration), `${canonical(l)}\n`, ledgerRel(l.migration));
}
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, (x as Record<string, unknown>)[k]]),
        )
      : x,
  );
}
function hash(s: string) {
  return `sha256:${createHash("sha256").update(s).digest("hex")}`;
}
function required(v: string | undefined, name: string) {
  if (!v) throw usage(`${name} is required`, `pass ${name} <value>`);
  return v;
}
function requiredManifest(v: string | undefined) {
  return required(v, "--manifest");
}
function render(kind: string, data: unknown): Renderable<unknown> {
  return { kind, data, pretty: () => JSON.stringify(data, null, 2), plain: () => JSON.stringify(data, null, 2) };
}

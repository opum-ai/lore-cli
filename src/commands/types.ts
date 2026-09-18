/**
 * commands/types.ts — `lore types [--type <T>]` (cli-surface §types; LCLI-537).
 *
 * The thin, read-only layer over {@link buildTypeVocabulary} (`core/type-vocabulary.ts`): it parses
 * the one optional `--type` flag, loads the active profile, resolves a given `--type` to its
 * canonical spelling, and emits the assembled `types.report`. Never touches the bundle, the tracker,
 * or the filesystem beyond the profile read — a caller asking "what types does this bundle support"
 * gets an answer without writing anything or already knowing a type name, closing the gap
 * `lore schema export` (a file-materialization command, not a discovery one) leaves open.
 */

import { type CompiledType, loadProfile } from "../core/profile";
import { canonicalType } from "../core/schema";
import { buildTypeVocabulary, type TypeVocabularyEntry, type TypeVocabularyReport } from "../core/type-vocabulary";
import { EXIT_OK, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, singleOptionValue, usage } from "./args";

/** Options for {@link runTypes}; `root` and the stream are injectable for tests. */
export interface TypesOptions {
  /** The repo root whose `.lore/profile.toml` resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
}

/** The parsed form of `lore types`'s arguments. */
interface TypesArgs {
  /** The single type to scope the report to (`--type`), raw as the user spelled it; `undefined` means every type. */
  type?: string;
}

/**
 * Run `lore types`: parse `--type`, load the active profile, resolve `--type` (if given) to its
 * canonical spelling, assemble the vocabulary report, emit it, and return `0`. An unknown `--type`
 * throws a `usage` {@link LoreError} (exit `2`) naming the valid set, mirroring `lore schema
 * export --type`'s own diagnostic.
 */
export function runTypes(options: TypesOptions): number {
  const parsed = parseTypesArgs(options.args);
  const profile = loadProfile({ root: options.root });

  let only: CompiledType | undefined;
  if (parsed.type !== undefined) {
    const canonical = canonicalType(parsed.type, profile);
    only = profile.types.get(canonical);
    if (only === undefined) {
      throw new LoreError(
        "usage",
        `no type "${parsed.type}" in the active profile`,
        `available types: ${[...profile.types.keys()].join(", ")}`,
        { type: parsed.type },
      );
    }
  }

  const report = buildTypeVocabulary(profile, only === undefined ? {} : { only: only.name });
  emit(typesRenderable(report), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `types`'s tokens via the shared parser: the one value flag `--type <T>` (also the
 * `--flag=value` form). Commander has already resolved Lore's global flags, so a `--`-prefixed token
 * here is a command flag: an unrecognized one, a repeated or value-less `--type`, or a stray
 * positional is a `usage` error.
 */
function parseTypesArgs(args: readonly string[]): TypesArgs {
  const parsed = parseCommandArgs(args, "types");
  const type = singleOptionValue(parsed, "type");
  if (type === "") {
    throw usage("--type needs a value", "pass a value, e.g. `--type <Type>`");
  }
  if (parsed.positionals.length > 0) {
    throw usage(`unexpected argument "${parsed.positionals[0]}"`, "run `lore types [--type <T>]`");
  }
  return { type };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The `types.report` {@link Renderable} (no color: this is a report, not severities). */
function typesRenderable(data: TypeVocabularyReport): Renderable<TypeVocabularyReport> {
  return { kind: "types.report", data, pretty: render, plain: render };
}

/** `profile: <name> (OKF <version>, <case> case)`, then one block per type: slug, required sections, and an aligned field table. */
function render(data: TypeVocabularyReport): string {
  const lines: string[] = [`profile: ${data.profile.name} (OKF ${data.profile.okfVersion}, ${data.profile.case} case)`];
  for (const type of data.types) {
    lines.push("", renderType(type));
  }
  return lines.join("\n");
}

/** One type's block: header, required sections (when any), and an aligned `name  flags  kind` field table. */
function renderType(type: TypeVocabularyEntry): string {
  const lines: string[] = [`${type.name} (slug: ${type.slug})`];
  if (type.requiredSections.length > 0) {
    lines.push(`  required sections: ${type.requiredSections.join(", ")}`);
  }
  if (type.template !== undefined) {
    lines.push(`  template: ${type.template}`);
  }
  lines.push("  fields:");
  const nameWidth = Math.max(...type.fields.map((field) => field.name.length));
  for (const field of type.fields) {
    const flags = [field.required ? "required" : "", field.common ? "common" : ""].filter(Boolean).join(" ");
    const kind = field.itemKind !== undefined ? `${field.kind}<${field.itemKind}>` : field.kind;
    const enumSuffix = field.enum !== undefined ? ` = ${field.enum.join(" | ")}` : "";
    lines.push(`    ${field.name.padEnd(nameWidth)}  ${kind.padEnd(16)}${flags.padEnd(10)}${enumSuffix}`.trimEnd());
  }
  return lines.join("\n");
}

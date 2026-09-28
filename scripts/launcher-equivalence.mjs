#!/usr/bin/env node
// scripts/launcher-equivalence.mjs — the launcher equivalence gate (LCLI-621, constitution
// Article 3 clause 5 as amended by ODOC-302).
//
// THE RULE, as ratified (opum-doc f322cfff, docs/reference/opum-project-constitution.md): the
// root launcher @opum-ai/lore stages as prerelease X-rc.N under `release-candidate`, is
// qualified by opum-cli-e2e, and reaches `latest` by a FRESH publish of X. "The qualified
// X-rc.N and the published X must be identical once X-rc.N is substituted for X throughout,
// checked mechanically in CI: the version string is the only permitted difference, including
// inside any managed block the launcher's own README carries."
//
// HOW "IDENTICAL" IS MEASURED, as settled with quest-cli (QCLI-399, recorded on LCLI-621):
// ENTRY BY ENTRY over the unpacked tarballs, never as whole tar or gzip bytes. Whole-archive
// bytes carry the compressor's output and the tar headers' own fields, neither of which is
// part of what npm installs, and a version string changes the size field of every entry it
// appears in, so no whole-archive comparison could ever pass. Per entry:
//
//   - the two archives hold the SAME SET of paths: none missing, none extra, none twice;
//   - every entry is a regular file or a directory, never a link or device (a link's target is not
//     content, so it could differ unseen);
//   - each entry has the same type and the same permission bits (mode & 0o7777);
//   - each entry's content is byte-identical once every X-rc.N in the rc entry is replaced
//     with X. Paths are compared as they stand, with no substitution, which is stricter.
//
// Two things the substitution alone cannot see are checked explicitly. The rc tarball's own
// package.json must name X-rc.N and the final's must name X, or "substituting" would be
// comparing two unrelated files. And the rc tarball's optionalDependencies must pin every
// platform package at exactly X: a pin written as X-rc.N would substitute to X and compare
// equal, while installing platform packages that are never published.
//
// WHY THE README NEEDS NO SPECIAL CASE: the rc launcher's README renders its lore-version
// managed blocks for the launcher's OWN version, X-rc.N, with scripts/shipped-readme-version.mjs
// (the same generator the final uses), so substitution carries every generated line to X. That
// choice, rather than rendering X into the rc, is what lets LCLI-510's --tarball assertion hold
// unmodified for both launchers: it checks each README against its own package.json.
//
// Pure: compareLauncherTarballs() takes bytes and returns { ok, problems }. The CLI below reads
// two files and prints. No network, no registry, no child process.
//
// EXIT CODES (CLI)
//   0  equivalent
//   1  not equivalent; every problem is printed, not just the first
//   2  usage error, a malformed version pair, or a tarball that could not be read

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/** A final release version: plain MAJOR.MINOR.PATCH, never itself a prerelease. */
const FINAL_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The problem with a (X, X-rc.N) pair, or null when it is well formed. X-rc.N must match
 * ^X-rc\.[1-9][0-9]*$ exactly: N starts at 1 and carries no leading zero, per the paired design
 * (P1: a re-stage takes N+1).
 */
export function versionPairProblem(version, rcVersion) {
  if (typeof version !== "string" || !FINAL_VERSION.test(version))
    return `version ${JSON.stringify(version)} is not a final MAJOR.MINOR.PATCH version`;
  if (typeof rcVersion !== "string" || !new RegExp(`^${escapeRegExp(version)}-rc\\.[1-9][0-9]*$`).test(rcVersion))
    return `rc version ${JSON.stringify(rcVersion)} does not match ^${version}-rc\\.[1-9][0-9]*$ (N is a positive integer with no leading zero)`;
  return null;
}

/**
 * Every occurrence of rcVersion replaced with version. A match must not be followed by a digit,
 * so substituting X-rc.1 never rewrites the prefix of an X-rc.10.
 */
export function substituteVersion(bytes, rcVersion, version) {
  const pattern = new RegExp(`${escapeRegExp(rcVersion)}(?![0-9])`, "g");
  // latin1 maps every byte to one code unit and back, so non-UTF-8 content round-trips exactly.
  return Buffer.from(Buffer.from(bytes).toString("latin1").replace(pattern, version), "latin1");
}

const TYPES = { 0: "file", "\0": "file", 5: "directory", 1: "hardlink", 2: "symlink" };

function field(block, offset, length) {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString("utf8");
}

function octal(block, offset, length) {
  const text = field(block, offset, length).trim();
  if (!/^[0-7]*$/.test(text)) throw new Error(`malformed octal header field ${JSON.stringify(text)}`);
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function parsePax(data) {
  const out = {};
  let rest = data.toString("utf8");
  while (rest.length > 0) {
    const space = rest.indexOf(" ");
    const length = Number.parseInt(rest.slice(0, space), 10);
    if (!(length > 0)) throw new Error("malformed pax extended header");
    const record = rest.slice(space + 1, length - 1);
    const eq = record.indexOf("=");
    out[record.slice(0, eq)] = record.slice(eq + 1);
    rest = rest.slice(length);
  }
  return out;
}

/**
 * The entries of a gzipped ustar archive (what `npm pack` writes), as
 * [{ path, type, mode, content }]. Header checksums are verified; pax (`x`) and GNU long-name
 * (`L`) headers are honoured for the entry that follows them; global pax headers are skipped.
 * Throws on anything it cannot read, rather than returning a partial list.
 *
 * THE END OF THE ARCHIVE IS WHERE THE BYTES END, NOT THE FIRST ZERO BLOCK (LCLI-621 review). The
 * end marker is two zero blocks, and node-tar -- what npm installs with -- reads straight past a
 * LONE zero block to any header after it. Stopping at the first zero block would let an entry
 * placed after one be installed without ever being compared. So from the first zero block on,
 * every remaining byte must be zero (the end marker and the record padding after it); anything
 * else, a header after a lone zero block included, refuses. A trailing partial block refuses too
 * unless it is all zero.
 */
export function readTarEntries(gzipped) {
  const tar = gunzipSync(gzipped);
  const entries = [];
  let offset = 0;
  let pending = {};
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      const trailing = tar.subarray(offset).findIndex((byte) => byte !== 0);
      if (trailing !== -1)
        throw new Error(
          `non-zero data at offset ${offset + trailing}, after a zero block at offset ${offset}: a tar reader such as node-tar reads past a lone zero block, so anything there would be installed without being compared`,
        );
      break;
    }
    if (header.length < 512)
      throw new Error(`${header.length} trailing bytes at offset ${offset} are not a whole tar block`);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : (header[i] ?? 0);
    if (sum !== octal(header, 148, 8)) throw new Error(`tar header checksum mismatch at offset ${offset}`);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const size = octal(header, 124, 12);
    const start = offset + 512;
    if (start + size > tar.length) throw new Error(`tar entry at offset ${offset} runs past the end of the archive`);
    const data = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;

    if (typeflag === "x") {
      pending = { ...pending, ...parsePax(data) };
      continue;
    }
    if (typeflag === "L") {
      pending = { ...pending, path: field(data, 0, data.length) };
      continue;
    }
    if (typeflag === "g") continue;

    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = pending.path ?? (prefix ? `${prefix}/${name}` : name);
    const type = TYPES[typeflag] ?? `type ${JSON.stringify(typeflag)}`;
    entries.push({ path, type, mode: octal(header, 100, 8) & 0o7777, content: Buffer.from(data) });
    pending = {};
  }
  return entries;
}

function manifestOf(entries, label, problems) {
  const entry = entries.find((e) => e.path === "package/package.json");
  if (!entry) {
    problems.push(`the ${label} tarball has no package/package.json`);
    return null;
  }
  try {
    return JSON.parse(entry.content.toString("utf8"));
  } catch (error) {
    problems.push(
      `the ${label} tarball's package/package.json is not JSON (${error instanceof Error ? error.message : error})`,
    );
    return null;
  }
}

const show = (bytes) => JSON.stringify(bytes.toString("utf8"));

/** Where two buffers first differ, with a short window of each, for a readable refusal. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 20);
  return `first difference at byte ${i}: rc (after substitution) ${show(a.subarray(from, i + 40))} vs final ${show(b.subarray(from, i + 40))}`;
}

/**
 * The gate. rcTarball and finalTarball are gzipped tarball BYTES; version is X and rcVersion is
 * X-rc.N. Returns { ok, problems }, listing every problem rather than stopping at the first.
 * Throws only on a malformed version pair or an unreadable archive, which are not findings about
 * equivalence but inputs it could not measure.
 */
export function compareLauncherTarballs(rcTarball, finalTarball, { version, rcVersion }) {
  const pairProblem = versionPairProblem(version, rcVersion);
  if (pairProblem) throw new Error(pairProblem);
  const rc = readTarEntries(rcTarball);
  const final = readTarEntries(finalTarball);
  const problems = [];

  const rcManifest = manifestOf(rc, "rc", problems);
  if (rcManifest && rcManifest.version !== rcVersion)
    problems.push(`the rc tarball's package.json version is ${JSON.stringify(rcManifest.version)}, not "${rcVersion}"`);
  const finalManifest = manifestOf(final, "final", problems);
  if (finalManifest && finalManifest.version !== version)
    problems.push(
      `the final tarball's package.json version is ${JSON.stringify(finalManifest.version)}, not "${version}"`,
    );
  if (rcManifest) {
    const pins = Object.entries(rcManifest.optionalDependencies ?? {});
    if (pins.length === 0) problems.push("the rc tarball's package.json pins no optionalDependencies");
    for (const [name, pin] of pins)
      if (pin !== version)
        problems.push(
          `the rc tarball pins ${name} at ${JSON.stringify(pin)}, not exactly "${version}" (platform packages stage as X)`,
        );
  }

  const index = (entries, label) => {
    const map = new Map();
    for (const entry of entries) {
      if (map.has(entry.path)) problems.push(`the ${label} tarball carries ${entry.path} more than once`);
      map.set(entry.path, entry);
    }
    return map;
  };
  const rcByPath = index(rc, "rc");
  const finalByPath = index(final, "final");

  // ONLY REGULAR FILES AND DIRECTORIES (LCLI-621 review). A link's target is a header field
  // (linkname) that the content comparison never reads, so two symlinks aimed at different files
  // would compare equal. npm pack never emits one -- measured on npm 12.1.0, npm-packlist drops a
  // symlink even when `files` names it -- so refusing every other entry type costs nothing and
  // leaves nothing the comparison below cannot see.
  const refuseLinks = (entries, label) => {
    for (const entry of entries)
      if (entry.type !== "file" && entry.type !== "directory")
        problems.push(
          `${entry.path}: a ${entry.type} entry in the ${label} tarball; a launcher may carry only regular files and directories`,
        );
  };
  refuseLinks(rc, "rc");
  refuseLinks(final, "final");

  for (const path of [...rcByPath.keys()].sort())
    if (!finalByPath.has(path)) problems.push(`${path} is in the rc tarball and missing from the final`);
  for (const path of [...finalByPath.keys()].sort())
    if (!rcByPath.has(path)) problems.push(`${path} is in the final tarball and missing from the rc`);

  for (const path of [...rcByPath.keys()].sort()) {
    const a = rcByPath.get(path);
    const b = finalByPath.get(path);
    if (!b) continue;
    if (a.type !== b.type) problems.push(`${path}: type ${a.type} in the rc, ${b.type} in the final`);
    if (a.mode !== b.mode)
      problems.push(
        `${path}: mode ${a.mode.toString(8).padStart(4, "0")} in the rc, ${b.mode.toString(8).padStart(4, "0")} in the final`,
      );
    const substituted = substituteVersion(a.content, rcVersion, version);
    if (!substituted.equals(b.content))
      problems.push(
        `${path}: content differs beyond ${rcVersion} -> ${version}; ${firstDifference(substituted, b.content)}`,
      );
  }

  return { ok: problems.length === 0, problems, entries: rcByPath.size };
}

const USAGE =
  "usage: launcher-equivalence.mjs --rc <X-rc.N launcher .tgz> --final <X launcher .tgz> --version <X> --rc-version <X-rc.N>";

/** Each flag exactly once, each with a value, nothing else; null otherwise. */
function parseArgs(argv) {
  const seen = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!["--rc", "--final", "--version", "--rc-version"].includes(flag) || argv[i + 1] === undefined || seen.has(flag))
      return null;
    seen.set(flag, argv[i + 1]);
  }
  if (seen.size !== 4) return null;
  return {
    rc: seen.get("--rc"),
    final: seen.get("--final"),
    version: seen.get("--version"),
    rcVersion: seen.get("--rc-version"),
  };
}

export function main(argv, { out = console.log, err = console.error } = {}) {
  const args = parseArgs(argv);
  if (!args) {
    err(USAGE);
    return 2;
  }
  let result;
  try {
    result = compareLauncherTarballs(readFileSync(args.rc), readFileSync(args.final), args);
  } catch (error) {
    err(`::error::launcher equivalence could not be measured: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  if (!result.ok) {
    err(
      `::error::the ${args.rcVersion} launcher and the ${args.version} launcher differ by more than the version string:`,
    );
    for (const problem of result.problems) err(`  - ${problem}`);
    return 1;
  }
  out(
    `launcher equivalence: ${args.rc} and ${args.final} hold the same ${result.entries} entries, same modes, byte-identical once ${args.rcVersion} -> ${args.version}`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

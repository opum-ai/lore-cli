/**
 * LCLI-596 (OPAG-425 R1, R2, R5-R7, R9): the built-in Constants type — its entry shape (R5), anchor
 * citation (R6), the comparison of each value against its JSON/TOML/YAML `source_of_truth` (R7), the
 * read counts `lore check` prints beside its findings and the zero-entries positive control, the
 * one-per-bundle rule (R2), and the document `lore new constants` writes (R9). Every failure mode
 * AC#1 names has its own test, each starting from {@link VALID} and breaking exactly one thing, so
 * a test that goes red names one rule.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runInit } from "../src/commands/init";
import { type NewResult, runNew } from "../src/commands/new";
import { runValidate } from "../src/commands/validate";
import { defaultProfile, profileForBundle } from "../src/core/profile";
import { renderSourceScalar } from "../src/core/type-rules";
import { validateConceptText } from "../src/core/validate";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, gitRun } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");
const DOC = "constants/project.md";

/**
 * A Constants document that satisfies every rule: the base every failure-mode test breaks once. It
 * holds one entry of each source kind — JSON, TOML and YAML (compared), `this-doc`, a Dockerfile
 * (not comparable), and a retired entry whose source is gone (not compared) — plus a deprecated
 * entry replaced by an active one.
 */
const VALID = `---
type: Constants
title: Project constants
summary: Named concrete values for the project.
version: 2.1.0
last_reviewed: "2026-09-01"
owner: platform team
---

# Project constants

Intro prose above the first group is allowed.

## Service

Prose inside a group, before its first entry, is allowed too.

### service.http-port

- value: \`8080\`
- meaning: The port the HTTP server listens on.
- source_of_truth: config/app.json#server.port
- status: active
- kind: port
- avoid: 80, which needs privileges

### service.legacy-port

- value: 8000
- meaning: The port the HTTP server used before 2.0.
- source_of_truth: this-doc
- status: deprecated
- replaced_by: service.http-port

## Build

### build.node-version

<!-- An HTML comment inside an entry is ignored. -->

- **value**: 22.4.0
- meaning: The Node.js version CI builds with.
- source_of_truth: config/tools.toml#node.version
- status: active
- owner: build team
- used_by: ci.yml, release.yml

### build.debug-enabled

- value: false
- meaning: Whether the build emits debug symbols.
- source_of_truth: config/flags.yaml#debug.enabled
- status: active
- hot: true

### build.image-port

- value: 8080
- meaning: The port the container image exposes.
- source_of_truth: Dockerfile#EXPOSE
- status: active

### build.old-flag

- value: on
- meaning: A flag the build no longer reads.
- source_of_truth: config/gone.yaml#old.flag
- status: retired
`;

/**
 * The source files {@link VALID}'s path entries name, each agreeing with its entry. The Dockerfile is
 * not comparable, but every path source is opened, so it must exist and be tracked too.
 */
const SOURCES: Readonly<Record<string, string>> = {
  "config/app.json": '{ "server": { "port": 8080, "hosts": ["a.example", "b.example"] } }\n',
  "config/tools.toml": '[node]\nversion = "22.4.0"\n',
  "config/flags.yaml": "debug:\n  enabled: false\n",
  Dockerfile: "FROM scratch\nEXPOSE 8080\n",
};

/** A marker standing in for a secret: it must never appear in any finding or report (review S2). */
const SECRET = "hunter2-SECRET";

/** A Reference that cites VALID twice: one entry anchor, and the document as a whole. */
const CITING = `---
type: Reference
title: Ports
summary: Which port to use.
---

# Ports

Use [the HTTP port](../constants/project.md#servicehttp-port); see [all constants](../constants/project.md).
`;

/** {@link VALID} (or `source`) with `from` replaced by `to`, failing loud if `from` is absent. */
function mutate(from: string | RegExp, to: string, source: string = VALID): string {
  const next = source.replace(from, to);
  if (next === source) {
    throw new Error(`fixture mutation did not apply: ${String(from)}`);
  }
  return next;
}

interface CheckFindingJson {
  readonly severity: "error" | "warning";
  readonly rule: string;
  readonly file: string;
  readonly message: string;
}

interface CheckJson {
  readonly code: number;
  readonly findings: CheckFindingJson[];
  readonly readCounts?: Record<string, Record<string, number>>;
  /** The raw `--json` stdout, for asserting what the report does NOT contain. */
  readonly stdout: string;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-constants-"));
  runInit({ root, args: ["--allow-no-git"], output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
  // A source_of_truth is read only when git tracks it (review S2b), so each test is a repository.
  gitRun(root, ["init", "-q"]);
});

/** Write a repository file at `rel` and `git add` it, so it is tracked. */
function trackRepoFile(rel: string, contents: string): void {
  writeRepoFile(rel, contents);
  gitRun(root, ["add", "--", rel]);
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a repository file at `rel` (relative to the repository root). */
function writeRepoFile(rel: string, contents: string): void {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

/** Write a bundle document at `docs/<rel>`. */
function writeDoc(rel: string, contents: string): void {
  writeRepoFile(join("docs", rel), contents);
}

/** Write and track every file in {@link SOURCES}. */
function writeSources(): void {
  for (const [rel, contents] of Object.entries(SOURCES)) {
    trackRepoFile(rel, contents);
  }
}

/** Run `lore check --json` and return its exit code, findings and read counts. */
function check(args: string[] = []): CheckJson {
  const stdout = capture();
  const code = runCheck({
    root,
    output: JSON_CTX,
    args,
    stdout,
    stderr: capture(),
    headCommitDate: () => "2026-09-26",
  }) as number;
  const report = JSON.parse(stdout.text()) as {
    data: { findings: CheckFindingJson[]; readCounts?: Record<string, Record<string, number>> };
  };
  return { code, findings: report.data.findings, readCounts: report.data.readCounts, stdout: stdout.text() };
}

/**
 * `lore check` on a bundle holding `contents` as its Constants document (sources written): must exit
 * 6 with an error matching `message` under `rule`, attributed to the document.
 */
function expectCheckError(contents: string, message: RegExp, rule = "type-shape"): CheckJson {
  writeSources();
  writeDoc(DOC, contents);
  const result = check();
  expect(result.code).toBe(EXIT_CODES.validation);
  expect(result.findings.filter((finding) => finding.severity === "error")).toContainEqual(
    expect.objectContaining({ rule, file: DOC, message: expect.stringMatching(message) }),
  );
  return result;
}

describe("Constants — a valid document", () => {
  test("passes lore check with no finding at all, even under --strict", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING);
    const { code, findings } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("passes lore validate with no error", () => {
    const report = validateConceptText(`docs/${DOC}`, VALID);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  test("is a built-in type on OKF 0.1 bundles too, and its rules run there (OPAG-425 R1)", () => {
    const legacy = profileForBundle(defaultProfile(), { okfVersion: "0.1", source: "declared" });
    expect(legacy.types.has("Constants")).toBe(true);
    writeFileSync(join(root, "docs", "index.md"), '---\ntype: Reference\nokf_version: "0.1"\n---\n# Docs\n');
    expectCheckError(mutate("### service.http-port", "### Service_Port"), /is not a valid id/);
  });
});

describe("Constants — R5 entry shape: lore check fails (AC#1)", () => {
  test("a bad id", () => {
    expectCheckError(
      mutate("### build.node-version", "### NodeVersion"),
      /entry heading "NodeVersion" is not a valid id/,
    );
  });

  test("a single-segment id (at least one dot is required)", () => {
    expectCheckError(mutate("### build.node-version", "### node"), /entry heading "node" is not a valid id/);
  });

  test("a duplicate id", () => {
    expectCheckError(
      mutate("### build.image-port", "### build.node-version"),
      /"build\.node-version" is declared twice/,
    );
  });

  test.each(["value", "meaning", "source_of_truth", "status"])("a missing required field %p", (field) => {
    // Removed from service.http-port only; every other entry still carries it.
    const line = new RegExp(`(### service\\.http-port\\n\\n(?:- .*\\n)*?)- ${field}: .*\\n`);
    expectCheckError(
      mutate(line, "$1"),
      new RegExp(`entry "service\\.http-port" is missing required field "${field}"`),
    );
  });

  test("an empty required field", () => {
    expectCheckError(mutate("- meaning: The port the HTTP server listens on.", "- meaning:"), /has an empty "meaning"/);
  });

  test("a deprecated entry without replaced_by", () => {
    expectCheckError(
      mutate("- replaced_by: service.http-port\n", ""),
      /"service\.legacy-port" is deprecated but names no replaced_by/,
    );
  });

  test("a deprecated entry whose replaced_by is not active", () => {
    expectCheckError(
      mutate("- replaced_by: service.http-port", "- replaced_by: build.old-flag"),
      /"service\.legacy-port" is deprecated and its replaced_by "build\.old-flag" is retired, not active/,
    );
  });

  test("a replaced_by naming no entry in the document", () => {
    expectCheckError(
      mutate("- replaced_by: service.http-port", "- replaced_by: service.https-port"),
      /replaced_by "service\.https-port", which is not an entry in this document/,
    );
  });

  test("an unknown field", () => {
    expectCheckError(mutate("- kind: port", "- notes: port"), /has unknown field "notes"/);
  });

  test("a field set twice", () => {
    expectCheckError(mutate("- kind: port", "- kind: port\n- kind: number"), /sets field "kind" twice/);
  });

  test("a status outside active, deprecated, retired", () => {
    expectCheckError(mutate("- status: retired", "- status: gone"), /has status "gone", not one of active/);
  });

  test("a hot that is not true or false", () => {
    expectCheckError(mutate("- hot: true", "- hot: yes"), /has hot "yes", not true or false/);
  });

  test("a source_of_truth that is neither this-doc nor path#key", () => {
    expectCheckError(mutate("- source_of_truth: this-doc", "- source_of_truth: the code"), /is neither "this-doc"/);
  });

  test("a source_of_truth path that leaves the repository", () => {
    expectCheckError(
      mutate("config/tools.toml#node.version", "../tools.toml#node.version"),
      /not a repository-relative path/,
    );
  });

  test("an entry that is not under a ## group", () => {
    expectCheckError(
      mutate("## Service\n\nProse inside a group, before its first entry, is allowed too.\n\n", ""),
      /entry "service\.http-port" is not under a "##" group heading/,
    );
  });

  test("an entry holding content besides its field list", () => {
    expectCheckError(
      mutate("- hot: true\n", "- hot: true\n\nA paragraph after the list.\n"),
      /"build\.debug-enabled" has a paragraph after its field list/,
    );
  });

  test.each([
    ["a blockquote", "> ### build.quoted\n>\n> - value: 1\n"],
    ["a list item", "- ### build.listed\n\n  - value: 1\n"],
  ])("a ### entry nested inside %s is an error, not a silently unread entry (review S1)", (_where, nested) => {
    const doc = mutate("## Build\n", `## Nested\n\n${nested}\n## Build\n`);
    const result = expectCheckError(
      doc,
      /has a "###" heading "build\.(quoted|listed)" nested inside a blockquote or list/,
    );
    // The same rule runs per file in lore validate.
    expect(
      validateConceptText(`docs/${DOC}`, doc).findings.some((finding) => finding.message.includes("nested inside")),
    ).toBe(true);
    // And --strict can no longer exit 0 on the partial read.
    expect(result.code).toBe(EXIT_CODES.validation);
  });

  test("an entry whose anchor an earlier heading already took (it would not be citable by its own anchor)", () => {
    // `### servicehttp.port` slugs to #servicehttpport; `servicehttpport` is not a valid id, so use a
    // group heading that slugs to the same anchor as an entry id.
    expectCheckError(mutate("## Build", "## build.image-port\n\n## Build"), /has anchor "#buildimage-port-1"/);
  });

  test("a version that is not SemVer, and a last_reviewed that is not a calendar date", () => {
    const result = expectCheckError(mutate("version: 2.1.0", "version: v2"), /version "v2" is not a SemVer version/);
    expect(result.findings.length).toBe(1);
    expectCheckError(mutate('last_reviewed: "2026-09-01"', 'last_reviewed: "2026-02-30"'), /not an ISO calendar date/);
  });

  test.each([
    "version",
    "last_reviewed",
    "owner",
  ])("a missing frontmatter field %p (validate's own rule name)", (field) => {
    expectCheckError(mutate(new RegExp(`^${field}: .*\\n`, "m"), ""), new RegExp(field), "frontmatter");
  });

  test("lore validate runs the same R5 rules per file", () => {
    const report = validateConceptText(`docs/${DOC}`, mutate("### build.node-version", "### NodeVersion"));
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        rule: "type-shape",
        message: expect.stringContaining('"NodeVersion" is not a valid id'),
      }),
    );
  });
});

describe("Constants — R7 value comparison against source_of_truth: lore check fails (AC#1)", () => {
  test("a value that differs from its JSON source_of_truth", () => {
    expectCheckError(
      mutate("- value: `8080`", "- value: `8081`"),
      /"service\.http-port" has value "8081", which differs from what its source_of_truth config\/app\.json#server\.port holds/,
      "source-of-truth",
    );
  });

  test("a value that differs from its TOML source_of_truth", () => {
    expectCheckError(
      mutate("- **value**: 22.4.0", "- **value**: 20.0.0"),
      /"build\.node-version" has value "20\.0\.0", which differs from what its source_of_truth config\/tools\.toml#node\.version holds/,
      "source-of-truth",
    );
  });

  test("a value that differs from its YAML source_of_truth", () => {
    expectCheckError(
      mutate("- value: false", "- value: true"),
      /"build\.debug-enabled" has value "true", which differs from what its source_of_truth config\/flags\.yaml#debug\.enabled holds/,
      "source-of-truth",
    );
  });

  test("a DEPRECATED entry is still compared (opum-doc f51e8b0, ODOC-292: only retired is skipped)", () => {
    expectCheckError(
      mutate(
        "- value: 8000\n- meaning: The port the HTTP server used before 2.0.\n- source_of_truth: this-doc",
        "- value: 8000\n- meaning: The port the HTTP server used before 2.0.\n- source_of_truth: config/app.json#server.port",
      ),
      /"service\.legacy-port" has value "8000", which differs from what its source_of_truth config\/app\.json#server\.port holds/,
      "source-of-truth",
    );
  });

  test("an unreadable source: the file does not exist", () => {
    expectCheckError(
      mutate("config/app.json#server.port", "config/missing.json#server.port"),
      /source_of_truth config\/missing\.json cannot be read \(no such file\)/,
      "source-of-truth",
    );
  });

  test("an unreadable source: the file does not parse", () => {
    trackRepoFile("config/broken.yaml", "debug: [unterminated\n");
    expectCheckError(
      mutate("config/flags.yaml#debug.enabled", "config/broken.yaml#debug.enabled"),
      /source_of_truth config\/broken\.yaml cannot be parsed as YAML \(YAMLException at line \d+\)/,
      "source-of-truth",
    );
  });

  test("an unreadable source: the key is absent", () => {
    expectCheckError(
      mutate("config/app.json#server.port", "config/app.json#server.bind"),
      /config\/app\.json#server\.bind names a key that config\/app\.json does not have/,
      "source-of-truth",
    );
  });

  test("a key that names a table rather than a single value", () => {
    expectCheckError(
      mutate("config/app.json#server.port", "config/app.json#server"),
      /is a table or list, not a single value/,
      "source-of-truth",
    );
  });

  test("an all-digit key segment indexes an array", () => {
    writeSources();
    writeDoc(DOC, mutate("- value: `8080`", "- value: a.example").replace("#server.port", "#server.hosts.0"));
    const { code, findings } = check();
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("a retired entry is not compared, and a non-comparable extension is counted, not failed", () => {
    // VALID's retired entry names config/gone.yaml, which does not exist, and build.image-port names
    // a Dockerfile: the clean run in "a valid document" already proves neither fails. The counts
    // prove what was compared: 3 (json, toml, yaml), not 4, and 1 not comparable.
    writeSources();
    writeDoc(DOC, VALID);
    const { readCounts } = check();
    expect(readCounts?.Constants?.comparableSources).toBe(3);
    expect(readCounts?.Constants?.notComparableSources).toBe(1);
  });

  test("scalar rendering: strings as-is, numbers by String(), booleans and null as words, tables not at all", () => {
    expect([
      renderSourceScalar("0080"),
      renderSourceScalar(8080),
      renderSourceScalar(1.5),
      renderSourceScalar(true),
      renderSourceScalar(null),
      renderSourceScalar({ a: 1 }),
      renderSourceScalar([1]),
    ]).toEqual(["0080", "8080", "1.5", "true", "null", undefined, undefined]);
  });
});

describe("Constants — R7 never prints what a source holds, and reads only tracked files (review S2)", () => {
  /** VALID with service.http-port pointed at `source` and given `value`. */
  function pointedAt(source: string, value = "not-the-value"): string {
    return mutate("- value: `8080`", `- value: \`${value}\``).replace("config/app.json#server.port", source);
  }

  test("a mismatch against a secret: the finding and the whole --json report omit the source's value", () => {
    writeSources();
    trackRepoFile("config/db.json", JSON.stringify({ db: { password: SECRET } }));
    writeDoc(DOC, pointedAt("config/db.json#db.password"));
    const result = check();
    expect(result.code).toBe(EXIT_CODES.validation);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        rule: "source-of-truth",
        message: expect.stringContaining(
          'has value "not-the-value", which differs from what its source_of_truth config/db.json#db.password holds',
        ),
      }),
    );
    expect(result.stdout).not.toContain("hunter2");
  });

  test("the plain report omits it too", () => {
    writeSources();
    trackRepoFile("config/db.json", JSON.stringify({ db: { password: SECRET } }));
    writeDoc(DOC, pointedAt("config/db.json#db.password"));
    const stdout = capture();
    runCheck({ root, output: PLAIN_CTX, args: [], stdout, stderr: capture(), headCommitDate: () => "2026-09-26" });
    expect(stdout.text()).toContain("[source-of-truth]");
    expect(stdout.text()).not.toContain("hunter2");
  });

  test.each([
    ["JSON", "config/db.json", `{ "db": ${SECRET} }`, /cannot be parsed as JSON \(SyntaxError\)/],
    ["YAML", "config/db.yaml", `db: [${SECRET}\n`, /cannot be parsed as YAML \(YAMLException at line \d+\)/],
  ])("a %s parse failure names the error class (and YAML line), never a snippet of the file", (_format, path, contents, message) => {
    writeSources();
    trackRepoFile(path, contents);
    writeDoc(DOC, pointedAt(`${path}#db`));
    const result = check();
    expect(result.code).toBe(EXIT_CODES.validation);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: "source-of-truth", message: expect.stringMatching(message) }),
    );
    expect(result.stdout).not.toContain("hunter2");
  });

  test("an UNTRACKED source fails with its own message and is never read, even when it would match", () => {
    writeSources();
    writeRepoFile(".secrets.json", JSON.stringify({ db: { password: SECRET } })); // written, never added
    writeDoc(DOC, pointedAt(".secrets.json#db.password", SECRET));
    const result = check();
    expect(result.code).toBe(EXIT_CODES.validation);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        rule: "source-of-truth",
        message: expect.stringContaining("source_of_truth .secrets.json cannot be read (not tracked by git"),
      }),
    );
    expect(result.readCounts?.Constants?.comparableSources).toBe(2); // toml and yaml; not the secret
  });

  test("an IGNORED source is untracked too", () => {
    writeSources();
    trackRepoFile(".gitignore", ".secrets.json\n");
    writeRepoFile(".secrets.json", JSON.stringify({ db: { password: SECRET } }));
    writeDoc(DOC, pointedAt(".secrets.json#db.password", SECRET));
    expect(check().findings).toContainEqual(
      expect.objectContaining({ rule: "source-of-truth", message: expect.stringContaining("not tracked by git") }),
    );
  });

  test("outside any git repository, a path source fails rather than being read", () => {
    writeSources();
    rmSync(join(root, ".git"), { recursive: true, force: true });
    writeDoc(DOC, VALID);
    expect(check().findings).toContainEqual(
      expect.objectContaining({
        rule: "source-of-truth",
        message: expect.stringContaining("no git repository here to confirm it is tracked"),
      }),
    );
  });

  test("a source that is a directory is refused as not a regular file", () => {
    writeSources();
    mkdirSync(join(root, "config", "nested.json"), { recursive: true });
    writeDoc(DOC, pointedAt("config/nested.json#a"));
    expect(check().findings).toContainEqual(
      expect.objectContaining({
        rule: "source-of-truth",
        message: expect.stringContaining("config/nested.json cannot be read (not a regular file)"),
      }),
    );
  });

  test.skipIf(process.platform === "win32")(
    "a TRACKED symlink that resolves outside the repository is refused, not followed",
    () => {
      writeSources();
      const outside = mkdtempSync(join(tmpdir(), "lore-constants-outside-"));
      try {
        writeFileSync(join(outside, "leak.json"), JSON.stringify({ db: { password: SECRET } }));
        symlinkSync(join(outside, "leak.json"), join(root, "config", "link.json"));
        gitRun(root, ["add", "--", "config/link.json"]);
        writeDoc(DOC, pointedAt("config/link.json#db.password", SECRET));
        const result = check();
        expect(result.findings).toContainEqual(
          expect.objectContaining({
            rule: "source-of-truth",
            message: expect.stringContaining("config/link.json cannot be read (resolves outside the repository)"),
          }),
        );
        expect(result.stdout).not.toContain("hunter2");
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );
});

describe("Constants — every path source is opened, whatever its extension (review S3)", () => {
  test.each(["does/not/exist.ini#x", "noext#x"])("a missing non-comparable source %p fails", (source) => {
    expectCheckError(
      mutate("Dockerfile#EXPOSE", source),
      new RegExp(`source_of_truth ${source.split("#")[0]?.replace(/\./g, "\\.")} cannot be read \\(no such file\\)`),
      "source-of-truth",
    );
  });

  test("an existing, tracked non-comparable source passes and is counted as not comparable", () => {
    writeSources();
    writeDoc(DOC, VALID);
    const { code, findings, readCounts } = check();
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
    expect(readCounts?.Constants?.notComparableSources).toBe(1);
  });

  test("an untracked non-comparable source fails", () => {
    writeSources();
    gitRun(root, ["rm", "-q", "--cached", "--", "Dockerfile"]);
    writeDoc(DOC, VALID);
    expect(check().findings).toContainEqual(
      expect.objectContaining({
        rule: "source-of-truth",
        message: expect.stringContaining("source_of_truth Dockerfile cannot be read (not tracked by git"),
      }),
    );
  });
});

describe("Constants — the positive control: zero entries read fails (AC#1)", () => {
  test("a Constants document with groups but no ### entry fails lore check", () => {
    const empty = VALID.slice(0, VALID.indexOf("### service.http-port"));
    writeDoc(DOC, empty);
    const { code, findings, readCounts } = check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "zero-entries-read", file: DOC }),
    );
    expect(readCounts?.Constants?.entries).toBe(0);
  });

  test("control: the same bundle with one entry does not draw it", () => {
    writeSources();
    writeDoc(DOC, VALID);
    expect(check().findings.some((finding) => finding.rule === "zero-entries-read")).toBe(false);
  });
});

describe("Constants — R6 citation by anchor (AC#1)", () => {
  test("a link to a deprecated entry WARNS on the citing file, and fails only under --strict", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING.replace("#servicehttp-port", "#servicelegacy-port"));
    const loose = check();
    expect(loose.code).toBe(EXIT_OK);
    expect(loose.findings).toEqual([
      expect.objectContaining({
        severity: "warning",
        rule: "deprecated-reference",
        file: "reference/ports.md",
        message: expect.stringMatching(
          /"service\.legacy-port", which is deprecated -- cite "service\.http-port" instead/,
        ),
      }),
    ]);
    expect(check(["--strict"]).code).toBe(EXIT_CODES.validation);
  });

  test("a link to a RETIRED entry also warns, saying retired (opum-agent ruling 2026-09-26)", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING.replace("#servicehttp-port", "#buildold-flag"));
    const loose = check();
    expect(loose.code).toBe(EXIT_OK);
    expect(loose.findings).toEqual([
      expect.objectContaining({
        severity: "warning",
        rule: "deprecated-reference",
        file: "reference/ports.md",
        message: expect.stringMatching(/cites Constants entry "build\.old-flag", which is retired$/),
      }),
    ]);
    expect(check(["--strict"]).code).toBe(EXIT_CODES.validation);
  });

  test("control: a link to an ACTIVE entry draws no citation warning", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING);
    expect(check(["--strict"]).findings).toEqual([]);
  });

  test("a link to an entry anchor that does not exist is a broken-anchor error", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING.replace("#servicehttp-port", "#servicehttps-port"));
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings).toContainEqual(
      expect.objectContaining({ severity: "error", rule: "broken-anchor", file: "reference/ports.md" }),
    );
  });
});

describe("Constants — lore check prints what it read (AC#2)", () => {
  test("--json carries readCounts: entries, comparable and not-comparable sources, references", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/ports.md", CITING);
    expect(check().readCounts).toEqual({
      Constants: { entries: 6, comparableSources: 3, notComparableSources: 1, references: 2 },
    });
  });

  test("the human report prints the same counts beside its findings", () => {
    writeSources();
    writeDoc(DOC, mutate("- value: `8080`", "- value: `8081`"));
    writeDoc("reference/ports.md", CITING);
    const stdout = capture();
    runCheck({ root, output: PLAIN_CTX, args: [], stdout, stderr: capture(), headCommitDate: () => "2026-09-26" });
    const lines = stdout.text().trimEnd().split("\n");
    expect(lines.some((line) => line.includes("[source-of-truth]"))).toBe(true);
    expect(lines.at(-2)).toBe(
      "Constants read: entries 6, comparable sources 3, not comparable sources 1, references 2",
    );
  });

  test("a bundle with no Constants document carries no readCounts and no extra line", () => {
    writeDoc("reference/ports.md", CITING.replace(/\[[^\]]*\]\([^)]*\)/g, "x"));
    expect(check().readCounts).toBeUndefined();
  });
});

describe("Constants — at most one per bundle (R2, AC#1)", () => {
  test("a second Constants document fails lore check, naming the first", () => {
    writeSources();
    writeDoc(DOC, VALID);
    writeDoc("reference/more-constants.md", VALID);
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: "singleton-type",
        file: "reference/more-constants.md",
        message: expect.stringContaining(DOC),
      }),
    );
  });
});

describe("Constants — rules attach only to lore's BUILT-IN declaration (ruling A)", () => {
  test("a custom profile that declares its own Constants gets none of these rules", () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      '[profile]\nname = "custom"\nokf_version = "0.2"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Constants"\n',
    );
    rmSync(join(root, ".lore", "schemas"), { recursive: true, force: true });
    // No entries, no sources, and a second document: every built-in rule would fire.
    writeDoc(DOC, "---\ntype: Constants\n---\n\n# Ours\n");
    writeDoc("reference/two.md", "---\ntype: Constants\n---\n\n# Also ours\n");
    const { code, findings, readCounts } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(readCounts).toBeUndefined();
    expect(code).toBe(EXIT_OK);
  });
});

describe("lore new constants (R9, AC#3)", () => {
  function newConstants(): { result: NewResult; contents: string } {
    const stdout = capture();
    const code = runNew({
      root,
      output: JSON_CTX,
      args: ["constants", "Project constants"],
      clock: FIXED_CLOCK,
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    const result = (JSON.parse(stdout.text()) as { data: NewResult }).data;
    return { result, contents: readFileSync(join(root, result.path), "utf8") };
  }

  test("writes a document lore check passes with no finding even under --strict, and reads its entry", () => {
    const { result } = newConstants();
    expect(result.type).toBe("Constants");
    const { code, findings, readCounts } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(readCounts).toEqual({
      Constants: { entries: 1, comparableSources: 0, notComparableSources: 0, references: 0 },
    });
    expect(code).toBe(EXIT_OK);
  });

  test("and that lore validate --strict passes with ZERO findings", () => {
    const { result } = newConstants();
    const stdout = capture();
    const code = runValidate({ root, output: JSON_CTX, args: ["--strict", result.path], stdout, stderr: capture() });
    const report = JSON.parse(stdout.text()) as {
      data: { errorCount: number; warningCount: number; files: { findings: unknown[] }[] };
    };
    expect(report.data.files[0]?.findings).toEqual([]);
    expect([report.data.errorCount, report.data.warningCount]).toEqual([0, 0]);
    expect(code).toBe(EXIT_OK);
  });

  test("carries the R9 components: frontmatter, one group, one this-doc entry, the CODEOWNERS comment", () => {
    const { contents } = newConstants();
    expect(contents).toContain("version: 1.0.0");
    expect(contents).toContain('last_reviewed: "2026-06-25"');
    expect(contents).toMatch(/^owner: \S/m);
    expect(contents.match(/^## /gm)).toHaveLength(1);
    expect(contents.match(/^### /gm)).toHaveLength(1);
    expect(contents).toContain("- source_of_truth: this-doc");
    expect(contents).toMatch(/CODEOWNERS[\s\S]*cannot enforce who edits it/);
    expect(contents).toMatch(/never secrets/);
  });

  test("a second lore new constants is caught by check's singleton rule", () => {
    newConstants();
    runNew({
      root,
      output: JSON_CTX,
      args: ["constants", "More constants"],
      clock: FIXED_CLOCK,
      stdout: capture(),
      stderr: capture(),
    });
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings.filter((finding) => finding.rule === "singleton-type")).toHaveLength(1);
  });
});

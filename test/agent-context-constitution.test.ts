/**
 * LCLI-609 — `lore agent context` auto-pins the bundle's built-in Constitution into every pack
 * (opum-doc ADR "Add Constitution and Constants document types to lore", R8 as clarified by
 * Amendment 4: "`lore agent context` auto-pins the bundle's Constitution into every profile's pack
 * when one exists, and pins nothing when none does").
 *
 * Maps to the task's acceptance criteria:
 *   AC1 — every profile's pack carries it as its FIRST pinned source, with catalog reason
 *         `constitution`; the degraded unknown-profile pack, the workflow projection and the
 *         `--contract` binding seam too (a `--workspace` pack is deliberately untouched). With no
 *         Constitution every pack is byte-identical to the compiler at the measurement commit, pinned
 *         as LITERAL digests measured at 29a0b0d5, never derived from the code under test. Its output
 *         for this fixture differs from the pre-LCLI-609 compiler (origin/dev e67b07af) only by
 *         LCLI-680's per-kind `agent.context.export` schemaVersion 2 -> 3 bump, which moved the four
 *         JSON stdouts alone. The positive control is the same fixture WITH a Constitution, which
 *         moves every digest.
 *   AC2 — R12: a profile-declared `Constitution` is not auto-pinned (positive control: the same
 *         document without the declaration is). Dedupe: a profile that references the Constitution
 *         itself — whole pin, heading pin, or ranked source — gets its own reference and no
 *         auto-pin beside it.
 * Plus the budget: the auto-pin is a pin, so a Constitution too large for `--max-tokens` fails exit 6
 * exactly as an over-budget profile pin does, and a profile can take control by narrowing it.
 *
 * Mutation map (which cases each deliberate break should redden, readable from this file alone;
 * 15 cases). Written before the mutations were run.
 *   - the R12 exclusion dropped (`typeRuleFor` stops requiring lore's own built-in declaration) ->
 *     exactly "R12: a profile-declared Constitution is not auto-pinned". Its positive-control half
 *     would still pass; every other fixture here uses the built-in type, which the mutant treats
 *     identically.
 *   - the dedupe dropped (`constitutionAutoPin` ignores the profile's own references) -> exactly the
 *     three "dedupe:" cases and "budget: narrowing the Constitution to a heading in the profile lets
 *     the same budget compile" — the only fixtures whose profile references the Constitution.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import { EXIT_CODES, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const PLAIN_OUTPUT: OutputContext = { mode: "plain", color: false };
const TASK = "checkout validation";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-constitution-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

function reference(rel: string, title: string, body: string): void {
  write(`docs/${rel}`, `---\ntype: Reference\ntitle: ${title}\nsummary: Summary for ${title}.\n---\n${body}`);
}

const CONSTITUTION = `---
type: Constitution
title: Project constitution
summary: The principles this project holds.
version: 1.0.0
ratified: "2026-01-01"
last_amended: "2026-01-01"
amendment_authority: project maintainers
---

# Project constitution

## Principles

### P1. Deterministic output

Lore MUST produce identical output for identical input.

## Governance

Amendments go through review.

## Amendment log

| Version | Date | Change | ADR |
|---|---|---|---|
| 1.0.0 | 2026-01-01 | Ratified. | |
`;

/** The Constitution's body as the pack quotes it: everything after the frontmatter fence. */
const CONSTITUTION_BODY = CONSTITUTION.slice(CONSTITUTION.indexOf("\n---\n", 4) + 5);

function profile(name: string, lines: readonly string[]): void {
  write(`.lore/agents/${name}.toml`, `schema_version = 1\nname = "${name}"\n${lines.join("\n")}\n`);
}

/**
 * The bundle and profiles every case starts from, WITHOUT a Constitution — kept byte-identical to the
 * generator the pre-change digests below were measured with, so any drift here fails the
 * byte-identity case rather than hiding. Three profiles, one of each shape: a specialist with pins
 * and sources, a sources-only specialist, and an orchestrator with no evidence of its own.
 */
function fixture(): void {
  reference("reference/rules.md", "Checkout validation rules", "# Rules\n\nCheckout validation checkout validation.\n");
  reference("specs/ui.md", "Checkout validation UI", "# Checkout form\n\nCheckout validation in the form.\n");
  reference("guides/alpha.md", "Alpha guide", "# Alpha\n\nCheckout validation and more.\n");
  reference("guides/unrelated.md", "Unrelated guide", "# Unrelated\n\nStorage engines and caching.\n");
  profile("alpha", [
    'description = "Pins and sources."',
    'kind = "specialist"',
    "max_tokens = 4000",
    'pinned = ["reference/rules"]',
    'sources = ["specs/ui"]',
  ]);
  profile("beta", [
    'description = "Sources only."',
    'kind = "specialist"',
    "max_tokens = 4000",
    'sources = ["specs/ui", "guides/alpha"]',
  ]);
  profile("lead", ['description = "Routes work."', 'kind = "orchestrator"', 'delegates = ["alpha", "beta"]']);
}

const PROFILES = ["alpha", "beta", "lead"] as const;

/**
 * Run `lore agent`. A command failure is a thrown {@link LoreError} that the CLI's top level renders,
 * so it is caught here and returned with the exit code that rendering would give it.
 */
async function run(args: readonly string[], output: OutputContext = JSON_OUTPUT) {
  const stdout = capture();
  const stderr = capture();
  try {
    const code = await runAgent({ root, output, args, stdout, stderr });
    return { code, stdout: stdout.text(), stderr: stderr.text(), error: undefined };
  } catch (cause) {
    if (!(cause instanceof LoreError)) throw cause;
    return { code: EXIT_CODES[cause.type], stdout: stdout.text(), stderr: stderr.text(), error: cause };
  }
}

interface PackItem {
  readonly reference: string;
  readonly conceptId: string;
  readonly sourcePath: string;
  readonly body: string;
}
interface PackData {
  readonly pinned: readonly PackItem[];
  readonly sections: readonly PackItem[];
  readonly catalog: readonly { reference: string; conceptId: string; sourcePath: string; reason: string }[];
  readonly queryHits: readonly { id: string }[];
  readonly profileMissing?: true;
}

async function pack(name: string, extra: readonly string[] = []): Promise<PackData> {
  const result = await run(["context", name, "--task", TASK, ...extra]);
  expect(result.error?.message).toBeUndefined();
  expect(result.code).toBe(0);
  return (JSON.parse(result.stdout) as { data: PackData }).data;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Every pack the fixture compiles, keyed by what produced it: plain and `--json` for each profile and
 * for an unknown one, plus the workflow projection, each digested over its exact stdout and stderr.
 */
async function allOutputs(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of [...PROFILES, "no-such-profile"]) {
    for (const [mode, output] of [
      ["plain", PLAIN_OUTPUT],
      ["json", JSON_OUTPUT],
    ] as const) {
      const result = await run(["context", name, "--task", TASK], output);
      out[`${name} ${mode} exit`] = String(result.code);
      out[`${name} ${mode} stdout`] = sha256(result.stdout);
      out[`${name} ${mode} stderr`] = sha256(result.stderr);
    }
  }
  write("request.json", `${JSON.stringify({ task: { id: "LCLI-609", text: TASK } })}\n`);
  const projection = await run(["project", "alpha", "--request", "request.json"]);
  out["project exit"] = String(projection.code);
  // `mtimeMs` is freshness metadata the projection documents as outside every determinism claim.
  const envelope = JSON.parse(projection.stdout);
  for (const revision of [envelope.data.profileRevision, ...envelope.data.inputRevisions]) delete revision.mtimeMs;
  out["project stdout"] = sha256(JSON.stringify(envelope));
  return out;
}

/**
 * {@link allOutputs} for {@link fixture}, MEASURED at lore-cli 29a0b0d5 (its `src/` run against this
 * same fixture), the tree that carries LCLI-680's per-kind `agent.context.export` schemaVersion 2 -> 3
 * bump. Its output differs from the pre-LCLI-609 compiler (origin/dev e67b07af) only by that bump,
 * which moved the four JSON stdouts alone. Literals, so a change that moved a byte of a
 * Constitution-free pack cannot also move the expectation.
 */
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MISSING_PROFILE_WARNING = "45636b0bf0d0db5ab34cf781c2779386b26975c55ccf01859d55ca8d94e0d34e";
const PRE_LCLI_609_OUTPUTS: Record<string, string> = {
  "alpha plain exit": "0",
  "alpha plain stdout": "f8cc843fa78b10f8173620c2ff8ae99cba99639d23d96f25f0db821b98670a97",
  "alpha plain stderr": EMPTY,
  "alpha json exit": "0",
  "alpha json stdout": "d7681f891deba061b334e3629164e8607b4c74daaa5fb5c52e4243d73529e939",
  "alpha json stderr": EMPTY,
  "beta plain exit": "0",
  "beta plain stdout": "1690df8403428845cdd747de34d7836cd74f8597325de4fbe58f5f76024ee500",
  "beta plain stderr": EMPTY,
  "beta json exit": "0",
  "beta json stdout": "3c1c4bb6a0cf2e8e6d8747c9cf444ce78fca39c378a90057ae431301fa6dfd64",
  "beta json stderr": EMPTY,
  "lead plain exit": "0",
  "lead plain stdout": "f1e03cfb5ac4155bdca1cc1da9b2f63c04c8e84f380507bd1ef3ef649409c3ed",
  "lead plain stderr": EMPTY,
  "lead json exit": "0",
  "lead json stdout": "9e9cf650b9c0cc1a76c39b8e3e837389fade1bc87c37f3180e9b864fe8193da9",
  "lead json stderr": EMPTY,
  "no-such-profile plain exit": "0",
  "no-such-profile plain stdout": "0bde2fba63ff97248719098aec1766df3f5b0945eae15d68ad8f97066bb1710a",
  "no-such-profile plain stderr": MISSING_PROFILE_WARNING,
  "no-such-profile json exit": "0",
  "no-such-profile json stdout": "edca1571d689ff63ff37a344dead8f41be2782af73529bb280deb133983f22b0",
  "no-such-profile json stderr": MISSING_PROFILE_WARNING,
  "project exit": "0",
  "project stdout": "2277f852f6dcf88a652592b0e3fbfeffc8320c19189533c1274744a2f5ca73b2",
};

describe("AC1 — every profile's pack carries the built-in Constitution as a pinned source", () => {
  test("each profile's pack pins it first, whole, with catalog reason `constitution`", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    let checked = 0;
    for (const name of PROFILES) {
      const data = await pack(name);
      const first = data.pinned[0] as PackItem;
      expect(first).toMatchObject({ reference: "constitution", conceptId: "constitution" });
      expect(first.sourcePath).toBe("docs/constitution.md");
      expect(first.body).toBe(CONSTITUTION_BODY);
      expect(data.pinned.filter((item) => item.conceptId === "constitution")).toHaveLength(1);
      expect(data.catalog[0]).toMatchObject({ reference: "constitution", reason: "constitution" });
      // An auto-pin is not re-advertised as a bundle-wide hit, and never ranked beside itself.
      expect(data.queryHits.map((hit) => hit.id)).not.toContain("constitution");
      expect(data.sections.map((item) => item.conceptId)).not.toContain("constitution");
      checked++;
    }
    expect(checked).toBe(PROFILES.length);
  });

  test("the profile's own pins follow it, in authored order, still with reason `pinned`", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    const data = await pack("alpha");
    expect(data.pinned.map((item) => item.reference)).toEqual(["constitution", "reference/rules"]);
    expect(data.catalog.slice(0, 2).map((entry) => [entry.reference, entry.reason])).toEqual([
      ["constitution", "constitution"],
      ["reference/rules", "pinned"],
    ]);
  });

  test("plain: it renders under Pinned evidence ahead of the profile's pin, and in the catalog", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    const { code, stdout } = await run(["context", "alpha", "--task", TASK], PLAIN_OUTPUT);
    expect(code).toBe(0);
    const pinned = stdout.slice(stdout.indexOf("## Pinned evidence"), stdout.indexOf("## Task-ranked evidence"));
    expect(pinned).toContain("### constitution\nSource: docs/constitution.md; digest: sha256:");
    expect(pinned.indexOf("### constitution")).toBeLessThan(pinned.indexOf("### reference/rules"));
    expect(stdout).toContain(
      "- constitution (docs/constitution.md — Project constitution; 1/1 selected; constitution)",
    );
  });

  test("an unknown profile's degraded pack carries it too, and its warning says so", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    const result = await run(["context", "no-such-profile", "--task", TASK]);
    expect(result.code).toBe(0);
    const data = (JSON.parse(result.stdout) as { data: PackData }).data;
    expect(data.profileMissing).toBe(true);
    expect(data.pinned.map((item) => item.reference)).toEqual(["constitution"]);
    expect(data.catalog.map((entry) => entry.reason)).toEqual(["constitution"]);
    const said = "this pack carries only the bundle-wide query hits and the auto-pinned Constitution";
    expect(result.stderr).toContain(said);
    const plain = await run(["context", "no-such-profile", "--task", TASK], PLAIN_OUTPUT);
    expect(plain.stdout).toContain(`> Warning: agent profile "no-such-profile" was not found`);
    expect(plain.stdout).toContain(said);
    expect(plain.stdout).toContain("Profile: no agent profile named");
    expect(plain.stdout).toContain("bundle-wide query hits and the auto-pinned Constitution only");
  });

  test("the workflow projection pins it too, and names its file in inputRevisions and sources", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    write("request.json", `${JSON.stringify({ task: { id: "LCLI-609", text: TASK } })}\n`);
    const { code, stdout } = await run(["project", "alpha", "--request", "request.json"]);
    expect(code).toBe(0);
    const data = JSON.parse(stdout).data as {
      sources: string[];
      inputRevisions: { path: string }[];
      context: PackData;
    };
    expect(data.sources[0]).toBe("constitution");
    expect(data.inputRevisions.map((revision) => revision.path)).toContain("docs/constitution.md");
    expect(data.context.pinned[0]?.reference).toBe("constitution");
  });

  test("the --contract binding seam's sourceIds lead with it; without one they do not name it", async () => {
    fixture();
    const binding = {
      contract: "opum-agent-workflow",
      supportedVersions: [1],
      requestId: "0123456789abcdef0123456789abcdef",
      taskId: "LCLI-609",
      profileId: "alpha",
    };
    write("binding.json", `${JSON.stringify(binding)}\n`);
    const args = ["context", "alpha", "--contract", "opum-agent-workflow/v1", "--request", "binding.json"];
    const sourceIds = async () => {
      const { code, stdout, stderr } = await run(args);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      return (JSON.parse(stdout) as { sourceIds: string[] }).sourceIds;
    };
    // Positive control first: the same binding with no Constitution names only the profile's sources.
    expect(await sourceIds()).toEqual(["reference/rules", "specs/ui"]);
    write("docs/constitution.md", CONSTITUTION);
    expect(await sourceIds()).toEqual(["constitution", "reference/rules", "specs/ui"]);
  });
});

describe("AC1 — with no Constitution, every pack is byte-identical to the measurement compiler (29a0b0d5)", () => {
  test("byte-identical: every output matches the digests measured at 29a0b0d5", async () => {
    fixture();
    const outputs = await allOutputs();
    expect(Object.keys(outputs)).toHaveLength(Object.keys(PRE_LCLI_609_OUTPUTS).length);
    expect(outputs).toEqual(PRE_LCLI_609_OUTPUTS);
  });

  test("positive control: the same fixture with a Constitution moves every pack's digest", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    const outputs = await allOutputs();
    let moved = 0;
    for (const [key, digest] of Object.entries(outputs)) {
      if (!key.endsWith("stdout")) continue;
      expect(digest).not.toBe(PRE_LCLI_609_OUTPUTS[key] as string);
      moved++;
    }
    // Four compiles in two modes, plus the projection.
    expect(moved).toBe(9);
  });
});

describe("AC2 — only lore's own built-in Constitution is auto-pinned, and never twice", () => {
  test("R12: a profile-declared Constitution is not auto-pinned", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    // Positive control first: the built-in type IS pinned, so the absence below is R12's doing.
    expect((await pack("alpha")).pinned[0]?.reference).toBe("constitution");
    write(
      ".lore/profile.toml",
      [
        "[profile]",
        'name = "custom"',
        'okf_version = "0.2"',
        "",
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "summary = {}",
        "",
        "[[types]]",
        'name = "Reference"',
        "",
        "[[types]]",
        'name = "Constitution"',
        "",
      ].join("\n"),
    );
    const data = await pack("alpha");
    expect(data.pinned.map((item) => item.reference)).toEqual(["reference/rules"]);
    expect(data.catalog.map((entry) => entry.reason)).not.toContain("constitution");
  });

  test("dedupe: an explicit whole-document pin is not duplicated, and keeps its authored place", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    profile("explicit", [
      'description = "Pins the constitution itself."',
      'kind = "specialist"',
      'pinned = ["reference/rules", "constitution"]',
    ]);
    const data = await pack("explicit");
    expect(data.pinned.map((item) => item.reference)).toEqual(["reference/rules", "constitution"]);
    expect(data.catalog.map((entry) => [entry.reference, entry.reason])).toEqual([
      ["reference/rules", "pinned"],
      ["constitution", "pinned"],
    ]);
  });

  test("dedupe: a heading pin of the Constitution is the profile's choice, with no whole pin beside it", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    profile("heading", [
      'description = "Pins one section of the constitution."',
      'kind = "specialist"',
      'pinned = ["constitution#principles"]',
    ]);
    const data = await pack("heading");
    expect(data.pinned.map((item) => item.reference)).toEqual(["constitution#principles"]);
    expect(data.catalog.map((entry) => entry.reason)).toEqual(["pinned"]);
  });

  test("dedupe: a Constitution in the profile's ranked sources is not also auto-pinned", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    profile("ranked", [
      'description = "Ranks the constitution with everything else."',
      'kind = "specialist"',
      'sources = ["constitution", "specs/ui"]',
    ]);
    const data = await pack("ranked");
    expect(data.pinned).toEqual([]);
    expect(data.catalog.map((entry) => [entry.reference, entry.reason])).toEqual([
      ["constitution", "included"],
      ["specs/ui", "included"],
    ]);
  });
});

describe("the auto-pin respects the token budget exactly as a profile pin does", () => {
  /** The smallest `--max-tokens` at which `name` compiles, scanning up from 1. */
  async function floor(name: string): Promise<number> {
    for (let budget = 1; budget < 4000; budget++) {
      const result = await run(["context", name, "--task", TASK, "--max-tokens", String(budget)]);
      if (result.code === 0) return budget;
    }
    throw new Error("no budget below 4000 compiled");
  }

  test("budget: a Constitution the budget cannot hold fails exit 6, and the hint names it", async () => {
    fixture();
    const without = await floor("alpha");
    write("docs/constitution.md", CONSTITUTION);
    const withIt = await floor("alpha");
    // The auto-pin is mandatory evidence: it raises the floor, and is never truncated to fit.
    expect(withIt).toBeGreaterThan(without);
    const below = await run(["context", "alpha", "--task", TASK, "--max-tokens", String(withIt - 1)]);
    expect(below.code).toBe(6);
    expect(below.error?.type).toBe("validation");
    expect(below.error?.message).toContain("mandatory evidence needs");
    expect(below.error?.hint).toContain(
      "the bundle's Constitution docs/constitution.md is auto-pinned into every pack",
    );
    expect(below.error?.input).toMatchObject({ constitution: "docs/constitution.md" });
    // Positive control: at its floor the same pack compiles and carries the whole document.
    const at = await pack("alpha", ["--max-tokens", String(withIt)]);
    expect(at.pinned[0]?.body).toBe(CONSTITUTION_BODY);
  });

  test("budget: narrowing the Constitution to a heading in the profile lets the same budget compile", async () => {
    fixture();
    write("docs/constitution.md", CONSTITUTION);
    const whole = await floor("alpha");
    profile("alpha", [
      'description = "Pins and sources."',
      'kind = "specialist"',
      "max_tokens = 4000",
      'pinned = ["constitution#principles", "reference/rules"]',
      'sources = ["specs/ui"]',
    ]);
    const narrowed = await run(["context", "alpha", "--task", TASK, "--max-tokens", String(whole - 1)]);
    expect(narrowed.code).toBe(0);
    const data = JSON.parse(narrowed.stdout).data as PackData;
    expect(data.pinned.map((item) => item.reference)).toEqual(["constitution#principles", "reference/rules"]);
  });

  test("a budget failure with no Constitution keeps the pre-LCLI-609 hint, word for word", async () => {
    fixture();
    const below = await run(["context", "alpha", "--task", TASK, "--max-tokens", "1"]);
    expect(below.code).toBe(6);
    expect(below.error?.hint).toBe(
      "raise --max-tokens, narrow a pin to a heading, split the source, or move it to ranked context",
    );
    expect(below.error?.input).not.toHaveProperty("constitution");
  });
});

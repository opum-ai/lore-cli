/**
 * test/schema-drift.test.ts — LCLI-539's committed-schema drift gate.
 *
 * Two layers, deliberately. The pure {@link schemaDriftFindings} unit tests name one assertion each,
 * so a mutation to the check reddens a PREDICTABLE SUBSET rather than everything — the fleet's
 * third gate measurement, which a suite pinned to the implementation's identity cannot provide. The
 * `runCheck` integration tests then prove the gate actually turns those findings into exit 6, which
 * no amount of unit-testing the comparison can show.
 *
 * The distinction this file exists to enforce is one `test/schema-export.test.ts` cannot: that suite
 * has ~30 assertions on the EMITTER, including two that read as though they would catch drift
 * ("exported bytes are identical to what `lore init` scaffolds" and "re-exporting overwrites a stale
 * schema file") and do not, because both run entirely inside `mkdtemp` fixtures and neither ever
 * reads a repository's own committed `.lore/schemas/`. The object those tests measure is the
 * generator; the conclusion a reader draws from them is about the committed artifact. This file
 * measures the committed artifact.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { escalateToIndeterminate, runCheck } from "../src/commands/check";
import { runInit } from "../src/commands/init";
import { schemaDriftFindings } from "../src/core/check";
import { defaultProfile } from "../src/core/profile";
import { profileDigest, readGeneratorStamp } from "../src/core/schema";
import { EXIT_CODES, EXIT_OK, exitCodeFor, LoreError, toErrorEnvelope } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const SCHEMAS = ".lore/schemas";

const DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}`;
const stamped = (digest: string): string => `${JSON.stringify({ "x-lore-generator": { profileDigest: digest } })}\n`;

describe("schemaDriftFindings — the pure comparison (LCLI-539, LCLI-565)", () => {
  const regenerated = new Map([
    [`${SCHEMAS}/story.schema.json`, '{"a":1}\n'],
    [`${SCHEMAS}/spec.schema.json`, '{"b":2}\n'],
  ]);
  const findingsFor = (committed: Map<string, string> | null) =>
    schemaDriftFindings({ committed, regenerated, profileDigest: DIGEST, loreVersion: "9.9.9-test" });

  test("an exactly-matching committed set is not drift", () => {
    expect(findingsFor(new Map(regenerated))).toEqual([]);
  });

  test("an absent .lore/schemas/ is not drift — absence and disagreement are different facts", () => {
    // A bundle that never exported its schemas has none to be stale. Failing here would turn the
    // gate into a demand that every repository adopt an optional feature.
    expect(findingsFor(null)).toEqual([]);
  });

  test("a committed schema whose bytes differ from the generator's is STALE, naming that file", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/story.schema.json`, '{"a":999}\n');
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.rule).toBe("schema-drift");
    expect(findings[0]?.schemaClass).toBe("stale");
    expect(findings[0]?.file).toBe(`${SCHEMAS}/story.schema.json`);
    expect(findings[0]?.message).toMatch(/no longer matches/);
  });

  test("a profile type with no committed schema at all is MISSING", () => {
    const committed = new Map(regenerated);
    committed.delete(`${SCHEMAS}/spec.schema.json`);
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.schemaClass).toBe("missing");
    expect(findings[0]?.file).toBe(`${SCHEMAS}/spec.schema.json`);
    expect(findings[0]?.message).toMatch(/no schema is committed/);
  });

  test("an orphan whose stamp EQUALS this binary's digest is ORPHANED — drift, prune advised", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/removed-type.schema.json`, stamped(DIGEST));
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("schema-drift");
    expect(findings[0]?.schemaClass).toBe("orphaned");
    expect(findings[0]?.file).toBe(`${SCHEMAS}/removed-type.schema.json`);
    expect(findings[0]?.message).toMatch(/no type in the active profile owns.*to prune it/);
  });

  test("an orphan whose stamp DIFFERS is UNATTRIBUTABLE — indeterminate, never a prune", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/newer-type.schema.json`, stamped(OTHER_DIGEST));
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("schema-unattributable");
    expect(findings[0]?.schemaClass).toBe("unattributable");
    expect(findings[0]?.message).not.toMatch(/to prune it|run `lore schema export`/);
    expect(findings[0]?.message).toMatch(/do NOT prune/);
    expect(findings[0]?.message).toMatch(/`git log`/);
    expect(findings[0]?.message).toMatch(/lore 9\.9\.9-test/);
    expect(findings[0]?.message).toMatch(/from a profile this lore does not generate/);
  });

  test("an orphan with NO stamp at all is UNATTRIBUTABLE — the common case on the introducing release", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/removed-type.schema.json`, "{}\n");
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("schema-unattributable");
    expect(findings[0]?.schemaClass).toBe("unattributable");
    expect(findings[0]?.message).not.toMatch(/to prune it|run `lore schema export`/);
    expect(findings[0]?.message).toMatch(/carries no generator stamp/);
  });

  test("stale (rewrite) and orphaned (delete) never share a message (OPAG-354 item 5)", () => {
    const committed = new Map([
      [`${SCHEMAS}/story.schema.json`, '{"a":999}\n'],
      [`${SCHEMAS}/spec.schema.json`, '{"b":2}\n'],
      [`${SCHEMAS}/gone.schema.json`, stamped(DIGEST)],
    ]);
    const [stale, orphaned] = findingsFor(committed);
    expect(stale?.schemaClass).toBe("stale");
    expect(orphaned?.schemaClass).toBe("orphaned");
    expect(stale?.message).not.toBe(orphaned?.message);
  });

  describe("a case variant of an owned schema whose exact name is absent (LCLI-565 re-review)", () => {
    // The owned file's regenerated bytes carry this binary's stamp, as real emitted files do.
    const owned = `${SCHEMAS}/story.schema.json`;
    const ownedBytes = `${JSON.stringify({ "x-lore-generator": { profileDigest: DIGEST }, k: 1 })}\n`;
    const stampedRegenerated = new Map([
      [owned, ownedBytes],
      [`${SCHEMAS}/spec.schema.json`, '{"b":2}\n'],
    ]);
    const findingsWithVariant = (bytes: string) =>
      schemaDriftFindings({
        committed: new Map([
          [`${SCHEMAS}/STORY.schema.json`, bytes],
          [`${SCHEMAS}/spec.schema.json`, '{"b":2}\n'],
        ]),
        regenerated: stampedRegenerated,
        profileDigest: DIGEST,
        loreVersion: "9.9.9-test",
      });

    test("UNSTAMPED: it does not stand in — it is unattributable under its OWN path, and the owned file is missing", () => {
      // A hand-written `STORY.schema.json` on a case-sensitive filesystem is a separate, unowned,
      // unstamped file. Comparing its bytes as the owned schema reported `stale` naming a file that
      // does not exist and advised an export.
      const findings = findingsWithVariant('{"type":"object"}\n');
      expect(findings.map((f) => [f.file, f.rule, f.schemaClass]).sort()).toEqual([
        [`${SCHEMAS}/STORY.schema.json`, "schema-unattributable", "unattributable"],
        [owned, "schema-drift", "missing"],
      ]);
    });

    test("FOREIGN stamp: it does not stand in either — unattributable, never stale", () => {
      const findings = findingsWithVariant(stamped(OTHER_DIGEST));
      expect(findings.map((f) => [f.file, f.schemaClass]).sort()).toEqual([
        [`${SCHEMAS}/STORY.schema.json`, "unattributable"],
        [owned, "missing"],
      ]);
    });

    test("MATCHING stamp (the APFS state after an export): it stands in — clean when the bytes match", () => {
      expect(findingsWithVariant(ownedBytes)).toEqual([]);
    });

    test("MATCHING stamp with other bytes: it stands in, and is stale under the owned name", () => {
      const findings = findingsWithVariant(
        `${JSON.stringify({ "x-lore-generator": { profileDigest: DIGEST }, k: 2 })}\n`,
      );
      expect(findings.map((f) => [f.file, f.schemaClass])).toEqual([[owned, "stale"]]);
    });
  });

  test("a case variant BESIDE its owned schema is unattributable and never advised for pruning", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/Story.schema.json`, stamped(DIGEST)); // matching stamp: still never a prune
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: `${SCHEMAS}/Story.schema.json`, rule: "schema-unattributable" });
    expect(findings[0]?.message).toMatch(/differs only in letter case from \.lore\/schemas\/story\.schema\.json/);
    expect(findings[0]?.message).not.toMatch(/to prune it|run `lore schema export`/);
  });

  test("the four conditions are reported independently rather than collapsing into one finding", () => {
    const committed = new Map([
      [`${SCHEMAS}/story.schema.json`, '{"a":999}\n'], // stale
      [`${SCHEMAS}/removed-type.schema.json`, stamped(DIGEST)], // orphaned
      [`${SCHEMAS}/unknown-type.schema.json`, "{}\n"], // unattributable
      // spec.schema.json absent                        // missing
    ]);
    const findings = findingsFor(committed);
    expect(findings).toHaveLength(4);
    expect(Object.fromEntries(findings.map((f) => [f.file, f.schemaClass]))).toEqual({
      [`${SCHEMAS}/story.schema.json`]: "stale",
      [`${SCHEMAS}/spec.schema.json`]: "missing",
      [`${SCHEMAS}/removed-type.schema.json`]: "orphaned",
      [`${SCHEMAS}/unknown-type.schema.json`]: "unattributable",
    });
  });
});

describe("runCheck — committed-schema drift gates the bundle (LCLI-539)", () => {
  let root: string;
  const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

  type SchemaFinding = { rule: string; file: string; message: string; schemaClass?: string };
  const check = async (): Promise<{
    code: number;
    findings: SchemaFinding[];
  }> => {
    const stdout = capture();
    const code = await runCheck({
      root,
      output: JSON_CTX,
      args: [],
      stdout,
      stderr: capture(),
      headCommitDate: () => "2026-06-25",
    });
    const envelope = JSON.parse(stdout.text()) as { data: { findings: SchemaFinding[] } };
    return { code, findings: envelope.data.findings.filter((f) => f.schemaClass !== undefined) };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-cli-schema-drift-"));
    runInit({ root, args: ["--allow-no-git"], output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("a freshly scaffolded bundle's committed schemas are clean and the gate exits 0", async () => {
    // The ACCEPT half of the proof, and it is not inferable from the reject half: a gate that is
    // always red satisfies every rejection test while being useless, and agrees with expectations
    // for longer than a broken gate usually does.
    const { code, findings } = await check();
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
    // ...and it is a STAMPED bundle: the clean result is not an artifact of there being no stamps.
    for (const file of readdirSync(join(root, SCHEMAS))) {
      expect(readGeneratorStamp(readFileSync(join(root, SCHEMAS, file), "utf8"))).toBe(profileDigest(defaultProfile()));
    }
  });

  test("LCLI-539's regression case: a profile-visible field missing from a committed schema fails the gate", async () => {
    // The exact shape that survived green CI from LCLI-477 (PR #76) until LCLI-539 found it by
    // accident: the generator gained ADR-0021's `relations`/`claim_*` properties and
    // `.lore/schemas/story.schema.json` was never re-exported. Reproduced by REMOVING a generated
    // property from the committed file rather than by adding one to the profile, so the fixture
    // stays a pure statement about committed-versus-generated bytes.
    const storyPath = join(root, SCHEMAS, "story.schema.json");
    const schema = JSON.parse(readFileSync(storyPath, "utf8")) as { properties: Record<string, unknown> };
    const dropped = Object.keys(schema.properties).find((k) => k.startsWith("claim_") || k === "relations");
    expect(dropped).toBeDefined();
    delete schema.properties[dropped as string];
    writeFileSync(storyPath, `${JSON.stringify(schema, null, 2)}\n`);

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe(`${SCHEMAS}/story.schema.json`);
    expect(findings[0]?.message).toMatch(/no longer matches what this profile generates/);
  });

  test("deleting a committed schema fails the gate rather than passing for want of something to compare", async () => {
    const victim = readdirSync(join(root, SCHEMAS)).find((f) => f.endsWith(".schema.json"));
    expect(victim).toBeDefined();
    unlinkSync(join(root, SCHEMAS, victim as string));

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings.some((f) => f.file === `${SCHEMAS}/${victim}` && /no schema is committed/.test(f.message))).toBe(
      true,
    );
  });

  test("an orphan carrying THIS binary's stamp is orphaned: exit 6, prune advised", async () => {
    // A copy of a file this binary wrote, under a name no type owns: the binary can affirm it.
    writeFileSync(
      join(root, SCHEMAS, "retired-type.schema.json"),
      readFileSync(join(root, SCHEMAS, "epic.schema.json")),
    );

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "schema-drift", schemaClass: "orphaned" });
    expect(findings[0]?.message).toMatch(/run `lore schema export` to prune it/);
  });

  test("an orphan with NO stamp is unattributable: exit 7, and no prune is advised", async () => {
    // Every committed schema in the fleet is in this state on the release that introduces stamping.
    writeFileSync(join(root, SCHEMAS, "retired-type.schema.json"), "{}\n");

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.indeterminate);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "schema-unattributable", schemaClass: "unattributable" });
    expect(findings[0]?.message).not.toMatch(/to prune it|run `lore schema export`/);
  });

  test("an orphan whose stamp is from ANOTHER profile is unattributable: exit 7, and no prune is advised", async () => {
    // LCLI-546's shape: a newer type's schema, read by a binary that has never heard of it.
    const foreign = JSON.parse(readFileSync(join(root, SCHEMAS, "epic.schema.json"), "utf8")) as Record<
      string,
      unknown
    >;
    foreign["x-lore-generator"] = { profileDigest: `sha256:${"f".repeat(64)}` };
    writeFileSync(join(root, SCHEMAS, "arc-v2.schema.json"), `${JSON.stringify(foreign, null, 2)}\n`);

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.indeterminate);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "schema-unattributable", schemaClass: "unattributable" });
    expect(findings[0]?.message).not.toMatch(/to prune it|run `lore schema export`/);
  });

  test("a run with BOTH a stale and an unattributable schema exits 7 and still reports each with its own class (OPAG-373)", async () => {
    // 7 outranks 6 in the exit code only; the 6-class finding must stay visible in the report.
    const storyPath = join(root, SCHEMAS, "story.schema.json");
    writeFileSync(storyPath, readFileSync(storyPath, "utf8").replace('"type": "object"', '"type": "object", "x": 1'));
    writeFileSync(join(root, SCHEMAS, "retired-type.schema.json"), "{}\n");

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.indeterminate);
    expect(findings.map((f) => [f.file, f.rule, f.schemaClass]).sort()).toEqual([
      [`${SCHEMAS}/retired-type.schema.json`, "schema-unattributable", "unattributable"],
      [`${SCHEMAS}/story.schema.json`, "schema-drift", "stale"],
    ]);
  });

  test("a non-schema file parked in .lore/schemas/ is neither compared nor reported", async () => {
    // Mirrors exactly what `lore schema export`'s prune pass walks, so the gate never develops an
    // opinion about a file the team put there and lore does not own.
    writeFileSync(join(root, SCHEMAS, "NOTES.md"), "team notes\n");
    const { code, findings } = await check();
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("a bundle with no .lore/schemas/ directory at all passes — it is unexported, not drifted", async () => {
    rmSync(join(root, SCHEMAS), { recursive: true, force: true });
    const { code, findings } = await check();
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });
});

describe("runCheck — a thrown 6-class failure cannot hide an unattributable schema (LCLI-565 review, OPAG-373)", () => {
  let root: string;
  const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");
  const poison = new Proxy(
    {},
    {
      get: (): never => {
        throw new Error("unreachable");
      },
    },
  ) as BacklogAdapter;
  const opts = () => ({
    root,
    output: JSON_CTX,
    args: [],
    stdout: capture(),
    stderr: capture(),
    adapter: poison,
    headCommitDate: () => "2026-06-25",
  });
  /** The thrown value of a runCheck that must fail, sync throw or async rejection alike. */
  const thrownBy = async (): Promise<unknown> => {
    try {
      await runCheck(opts());
    } catch (err) {
      return err;
    }
    throw new Error("expected runCheck to throw");
  };
  const ORPHAN = `${SCHEMAS}/retired-type.schema.json`;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-cli-schema-escalate-"));
    runInit({ root, args: ["--allow-no-git"], output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Assert the escalated envelope: exit 7, `indeterminate`, both failures named, hint preserved. */
  const expectEscalated = (err: unknown, original: RegExp, hint: RegExp, input?: unknown): void => {
    expect(exitCodeFor(err)).toBe(EXIT_CODES.indeterminate);
    const envelope = toErrorEnvelope(err as LoreError);
    expect(envelope.error_type).toBe("indeterminate");
    expect(envelope.message).toMatch(original);
    expect(envelope.message).toContain(ORPHAN);
    expect(envelope.hint).toMatch(hint);
    // The original `input` is preserved EXACTLY — no wrapping, no added keys.
    if (input !== undefined) {
      expect(envelope.input).toEqual(input);
    }
  };

  test("malformed frontmatter + an unstamped orphan exits 7, naming both", async () => {
    writeFileSync(join(root, ORPHAN), "{}\n");
    writeFileSync(join(root, "docs/bad.md"), "---\ntype: [unclosed\n---\n# x\n");
    expectEscalated(await thrownBy(), /not valid YAML/, /fix the YAML syntax/, { path: "bad.md" });
  });

  test("a broken .lore/agents/*.toml reference + an unstamped orphan exits 7, naming both", async () => {
    writeFileSync(join(root, ORPHAN), "{}\n");
    mkdirSync(join(root, ".lore/agents"), { recursive: true });
    writeFileSync(
      join(root, ".lore/agents/x.toml"),
      'schema_version = 1\nname = "x"\ndescription = "d"\nkind = "specialist"\nmax_tokens = 1000\npinned = ["nope/missing"]\nsources = []\n',
    );
    expectEscalated(await thrownBy(), /references missing concept "nope\/missing"/, /fix the profile reference/, {
      path: ".lore/agents/x.toml",
      reference: "nope/missing",
    });
  });

  test("a reconciliation failure rejected AFTER the report is emitted is escalated too", async () => {
    // The async path: a schema-invalid `tasks:`-linked concept rejects out of reconciliation.
    writeFileSync(join(root, ORPHAN), "{}\n");
    mkdirSync(join(root, "docs/stories"), { recursive: true });
    writeFileSync(
      join(root, "docs/stories/bad.md"),
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const result = runCheck(opts());
    expect(result).toBeInstanceOf(Promise);
    const err = await (result as Promise<number>).then(
      () => undefined,
      (e: unknown) => e,
    );
    expectEscalated(err, /invalid OKF lifecycle status in stories\/bad.md/, /./);
  });

  test("without an unattributable schema the same failure still exits 6 — the escalation is conditional", async () => {
    writeFileSync(join(root, "docs/bad.md"), "---\ntype: [unclosed\n---\n# x\n");
    const err = await thrownBy();
    expect(exitCodeFor(err)).toBe(EXIT_CODES.validation);
    expect((err as LoreError).type).toBe("validation");
  });

  test("the escalated error carries the original input object itself, and the original hint", () => {
    const input = { key: 1, nested: { k: "v" } };
    const escalated = escalateToIndeterminate(new LoreError("drift", "m", "h", input), [ORPHAN]) as LoreError;
    expect(escalated.type).toBe("indeterminate");
    expect(escalated.input).toBe(input);
    expect(escalated.hint).toBe("h");
  });

  test("non-6 throws pass through unchanged even with an unattributable schema", () => {
    const paths = [ORPHAN];
    for (const type of ["usage", "not_found", "denied", "conflict"] as const) {
      const original = new LoreError(type, "m", "h");
      expect(escalateToIndeterminate(original, paths)).toBe(original);
    }
    const crash = new Error("boom");
    expect(escalateToIndeterminate(crash, paths)).toBe(crash);
  });
});

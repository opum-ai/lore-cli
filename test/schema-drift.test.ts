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
import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runInit } from "../src/commands/init";
import { schemaDriftFindings } from "../src/core/check";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const SCHEMAS = ".lore/schemas";

describe("schemaDriftFindings — the pure comparison (LCLI-539)", () => {
  const regenerated = new Map([
    [`${SCHEMAS}/story.schema.json`, '{"a":1}\n'],
    [`${SCHEMAS}/spec.schema.json`, '{"b":2}\n'],
  ]);

  test("an exactly-matching committed set is not drift", () => {
    expect(schemaDriftFindings({ committed: new Map(regenerated), regenerated })).toEqual([]);
  });

  test("an absent .lore/schemas/ is not drift — absence and disagreement are different facts", () => {
    // A bundle that never exported its schemas has none to be stale. Failing here would turn the
    // gate into a demand that every repository adopt an optional feature.
    expect(schemaDriftFindings({ committed: null, regenerated })).toEqual([]);
  });

  test("a committed schema whose bytes differ from the generator's is an error naming that file", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/story.schema.json`, '{"a":999}\n');
    const findings = schemaDriftFindings({ committed, regenerated });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.rule).toBe("schema-drift");
    expect(findings[0]?.file).toBe(`${SCHEMAS}/story.schema.json`);
    expect(findings[0]?.message).toMatch(/no longer matches/);
  });

  test("a profile type with no committed schema at all is an error", () => {
    const committed = new Map(regenerated);
    committed.delete(`${SCHEMAS}/spec.schema.json`);
    const findings = schemaDriftFindings({ committed, regenerated });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe(`${SCHEMAS}/spec.schema.json`);
    expect(findings[0]?.message).toMatch(/no schema is committed/);
  });

  test("a committed schema no profile type owns is an error — the case `schema export` prunes", () => {
    const committed = new Map(regenerated);
    committed.set(`${SCHEMAS}/removed-type.schema.json`, "{}\n");
    const findings = schemaDriftFindings({ committed, regenerated });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe(`${SCHEMAS}/removed-type.schema.json`);
    expect(findings[0]?.message).toMatch(/no type in the active profile owns/);
  });

  test("the three conditions are reported independently rather than collapsing into one finding", () => {
    const committed = new Map([
      [`${SCHEMAS}/story.schema.json`, '{"a":999}\n'], // stale
      [`${SCHEMAS}/removed-type.schema.json`, "{}\n"], // orphaned
      // spec.schema.json absent                        // missing
    ]);
    const findings = schemaDriftFindings({ committed, regenerated });
    expect(findings).toHaveLength(3);
    expect(new Set(findings.map((f) => f.file))).toEqual(
      new Set([`${SCHEMAS}/story.schema.json`, `${SCHEMAS}/spec.schema.json`, `${SCHEMAS}/removed-type.schema.json`]),
    );
  });
});

describe("runCheck — committed-schema drift gates the bundle (LCLI-539)", () => {
  let root: string;
  const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

  const check = async (): Promise<{
    code: number;
    findings: Array<{ rule: string; file: string; message: string }>;
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
    const envelope = JSON.parse(stdout.text()) as {
      data: { findings: Array<{ rule: string; file: string; message: string }> };
    };
    return { code, findings: envelope.data.findings.filter((f) => f.rule === "schema-drift") };
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

  test("an orphaned schema file no profile type owns fails the gate", async () => {
    writeFileSync(join(root, SCHEMAS, "retired-type.schema.json"), "{}\n");

    const { code, findings } = await check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings.some((f) => f.file === `${SCHEMAS}/retired-type.schema.json`)).toBe(true);
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

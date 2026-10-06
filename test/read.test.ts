import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunContext, run } from "../src/cli";
import { runContext } from "../src/commands/context";
import { runRead } from "../src/commands/read";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

/** A body long enough that a small budget must drop it — the case the two operations diverge on. */
const LONG_BODY = `${"A paragraph of evidence that a budget cannot hold. ".repeat(40)}\n`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-read-"));
  mkdirSync(join(root, "docs/claims"), { recursive: true });
  writeFileSync(
    join(root, "docs/index.md"),
    '---\ntype: Reference\ntitle: Root\nsummary: s\nokf_version: "0.2"\n---\nRoot.\n',
  );
  writeFileSync(
    join(root, "docs/claims/evidence.md"),
    [
      "---",
      "type: Reference",
      "title: Evidence",
      "summary: The proof evidence",
      "claim_outcome: supported",
      'claim_version: "4"',
      "producer_extension:",
      "  nested: preserved",
      "---",
      LONG_BODY,
    ].join("\n"),
  );
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function read(args: readonly string[], output: OutputContext = JSON_CTX): string {
  const stdout = capture();
  const code = runRead({ root, output, stdout, stderr: capture(), args });
  expect(code).toBe(0);
  return stdout.text();
}

describe("lore read — the exact, unbudgeted read (AC#3)", () => {
  test("returns the concept's body verbatim, with its frontmatter mapping intact", () => {
    const data = JSON.parse(read(["claims/evidence"])).data as {
      id: string;
      path: string;
      type: string;
      frontmatter: Record<string, unknown>;
      body: string;
      tokenEstimate: number;
    };
    expect(data.id).toBe("claims/evidence");
    expect(data.path).toBe("claims/evidence.md");
    expect(data.type).toBe("Reference");
    expect(data.body).toBe(LONG_BODY);
    // Exactly as parsed, including a producer extension lore does not validate — an exact read that
    // filtered frontmatter would be an assembled read with a different name.
    expect(data.frontmatter.claim_version).toBe("4");
    expect(data.frontmatter.producer_extension).toEqual({ nested: "preserved" });
    expect(data.tokenEstimate).toBeGreaterThan(0);
  });

  test("returns in full exactly what a budgeted context drops — the two operations, same concept", () => {
    // The whole reason `lore read` exists rather than a flag on `lore context`. One caller needs a
    // ceiling; the other needs the text. Asserted together so a future change that quietly reunites
    // them fails here.
    const packed = JSON.parse(
      (() => {
        const stdout = capture();
        runContext({
          root,
          output: JSON_CTX,
          stdout,
          stderr: capture(),
          args: ["claims/evidence", "--max-tokens", "40"],
        });
        return stdout.text();
      })(),
    ).data as { target: { body?: string }; omitted: { fields: string[] }; tokenEstimate: number; maxTokens: number };

    expect(packed.target.body).toBeUndefined();
    expect(packed.omitted.fields).toEqual(["target.body"]);
    expect(packed.tokenEstimate).toBeLessThanOrEqual(packed.maxTokens);

    const exact = JSON.parse(read(["claims/evidence"])).data as { body: string };
    expect(exact.body).toBe(LONG_BODY);
  });

  test("has no budget flag at all, so there is no configuration under which it returns less", () => {
    // Not merely "the flag is ignored": passing it is a usage error, because a flag that is accepted
    // and does nothing is a promise the command does not keep.
    expectError("usage", () =>
      runRead({
        root,
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        args: ["claims/evidence", "--max-tokens", "40"],
      }),
    );
  });

  test("accepts the same id forms every other id-taking command does", () => {
    for (const form of ["claims/evidence", "claims/evidence.md", "./claims/evidence.md"]) {
      expect((JSON.parse(read([form])).data as { id: string }).id).toBe("claims/evidence");
    }
  });

  test("plain output is one header line then the body, so the body survives `tail -n +3`", () => {
    const text = read(["claims/evidence"], PLAIN_CTX);
    const lines = text.split("\n");
    expect(lines[0]).toContain("read: claims/evidence");
    expect(lines[0]).toContain("[Reference]");
    expect(lines[1]).toBe("");
    expect(lines.slice(2).join("\n")).toBe(LONG_BODY);
  });

  test("an unknown id is the shared not_found, not a bespoke one", () => {
    const error = expectError("not_found", () =>
      runRead({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["claims/absent"] }),
    );
    expect(error.message).toContain('concept "claims/absent" is not in the bundle');
  });

  test.each([
    [[], "read needs exactly one <id>"],
    [["a", "b"], "read needs exactly one <id>"],
  ])("rejects %p with a usage error", (args, message) => {
    const error = expectError("usage", () =>
      runRead({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args }),
    );
    expect(error.message).toContain(message);
  });
});

/**
 * LCLI-681 AC2 (DEC-163 (5c)): `lore read <id>#<slug>` returns exactly the named section, reusing
 * the `lore agent context` anchor resolution and section slicer, and leaves the whole-concept read
 * untouched.
 */
describe("lore read — one section, addressed by anchor (LCLI-681 AC2)", () => {
  /** A sectioned body: the first section is closed by the next heading, the second runs to the end. */
  const SECTIONED_BODY = [
    "# Evidence",
    "",
    "Intro paragraph.",
    "",
    "## First section",
    "",
    "First section body.",
    "",
    "## Second section",
    "",
    "Second section body.",
    "",
  ].join("\n");

  /** A body whose second-level heading sits INSIDE a blockquote — the LCLI-647 nested-anchor case. */
  const NESTED_BODY = [
    "# Nested",
    "",
    "Intro.",
    "",
    "> ## Quoted section",
    ">",
    "> Quoted body text.",
    "",
    "## Plain section",
    "",
    "Plain body.",
    "",
  ].join("\n");

  beforeEach(() => {
    mkdirSync(join(root, "docs/specs"), { recursive: true });
    writeFileSync(
      join(root, "docs/specs/sectioned.md"),
      `---\ntype: Reference\ntitle: Sectioned\nsummary: sections to address\n---\n${SECTIONED_BODY}`,
    );
    writeFileSync(
      join(root, "docs/specs/nested.md"),
      `---\ntype: Reference\ntitle: Nested\nsummary: a heading inside a blockquote\n---\n${NESTED_BODY}`,
    );
    mkdirSync(join(root, ".lore/agents"), { recursive: true });
  });

  test("returns exactly the named section, under the conceptId#anchor id the pack links emit", () => {
    const data = JSON.parse(read(["specs/sectioned#first-section"])).data as {
      id: string;
      path: string;
      type: string;
      frontmatter: Record<string, unknown>;
      body: string;
      tokenEstimate: number;
    };
    expect(data.id).toBe("specs/sectioned#first-section");
    expect(data.path).toBe("specs/sectioned.md");
    expect(data.type).toBe("Reference");
    expect(data.frontmatter.title).toBe("Sectioned");
    // The section — its heading through the next heading that closes it — and nothing past it.
    expect(data.body).toBe("## First section\n\nFirst section body.\n\n");
    expect(data.body).not.toContain("Second section");
    expect(data.tokenEstimate).toBeGreaterThan(0);
  });

  test("the last section runs to the end of the document", () => {
    const data = JSON.parse(read(["specs/sectioned#second-section"])).data as { body: string };
    expect(data.body).toBe("## Second section\n\nSecond section body.\n");
  });

  test("the whole-concept read is unchanged when no anchor is given", () => {
    const data = JSON.parse(read(["specs/sectioned"])).data as { id: string; body: string };
    expect(data.id).toBe("specs/sectioned");
    expect(data.body).toBe(SECTIONED_BODY);
  });

  test("normalizes the id the same way with an anchor as without (path/`.md`/`./`)", () => {
    // The `#` must be split off BEFORE id normalization, and the id part must still normalize, or
    // `lore read ./x.md#slug` silently misses (read.ts's own comment warns of exactly this).
    const data = JSON.parse(read(["./specs/sectioned.md#first-section"])).data as { id: string; body: string };
    expect(data.id).toBe("specs/sectioned#first-section");
    expect(data.body).toBe("## First section\n\nFirst section body.\n\n");
  });

  test("resolves a heading nested in a blockquote through the shared slicer", () => {
    // The reason read reuses `regionForReference` (LCLI-647): a heading inside a container resolves,
    // is scoped to that container, and does not run past it into the sibling `## Plain section`.
    const data = JSON.parse(read(["specs/nested#quoted-section"])).data as { id: string; body: string };
    expect(data.id).toBe("specs/nested#quoted-section");
    expect(data.body).toContain("Quoted body text.");
    expect(data.body).not.toContain("Plain body.");
  });

  test("a `lore agent context` pack link passes straight through — pack and read return the same bytes", async () => {
    // The ruling's actual claim: the `<id>#<slug>` spelling is the one the pack's link already emits,
    // so a pack link passes straight through. Build a real pack, take a pinned item's `reference`,
    // feed that exact string to read, and require the two to return the SAME section body.
    writeFileSync(
      join(root, ".lore/agents", "roundtrip.toml"),
      [
        "schema_version = 1",
        'name = "roundtrip"',
        'description = "Round-trip a pack section link into a read."',
        'kind = "specialist"',
        "max_tokens = 3000",
        'pinned = ["specs/sectioned#first-section"]',
        "sources = []",
        "",
      ].join("\n"),
    );
    const stdout = capture();
    const code = await run(["bun", "lore", "agent", "context", "roundtrip", "--task", "first section body", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
      isTTY: false,
    });
    expect(code).toBe(0);
    const pack = JSON.parse(stdout.text()) as {
      data: { pinned: { reference: string; body: string }[] };
    };
    const pin = pack.data.pinned[0];
    if (pin === undefined) throw new Error("the pack carried no pinned item");
    expect(pin.reference).toBe("specs/sectioned#first-section");
    const data = JSON.parse(read([pin.reference])).data as { id: string; body: string };
    expect(data.id).toBe("specs/sectioned#first-section");
    expect(data.body).toBe(pin.body);
  });

  test("a slug naming no heading is a validation error that names the repair", () => {
    const error = expectError("validation", () =>
      runRead({
        root,
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        args: ["specs/sectioned#no-such-section"],
      }),
    );
    expect(error.message).toContain("no-such-section");
    expect(error.hint).toContain("drop the #no-such-section");
  });

  test("a bare trailing # names no section and is reported, not silently read whole", () => {
    expectError("validation", () =>
      runRead({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["specs/sectioned#"] }),
    );
  });
});

/**
 * LCLI-615: pretty renders the markdown; plain (flag or non-TTY) and --json stay byte-for-byte.
 *
 * Driven through `run()` with an injected `isTTY`, so the mode is chosen by the real resolver
 * (`output.ts`, cli-contract §1.1) rather than a hand-built context, and nothing depends on the test
 * runner itself having a terminal.
 */
describe("lore read — pretty renders, plain and --json stay verbatim (LCLI-615)", () => {
  /** Every construct AC1 names, plus a control-sequence payload AC2 names, in one body. */
  const RICH_BODY = [
    "# Rich heading",
    "",
    "Some *emphasis*, **strong** text and a [link](https://example.com).",
    "",
    "- bullet one",
    "- [x] task done",
    "",
    "1. first",
    "2. second",
    "",
    "> a quoted line",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "| Col A | Col B |",
    "|-------|------:|",
    "| a     | 1     |",
    "",
    "Hostile: \x1b[2J\x1b[31mred\x1b[0m \x1b]0;title\x07 \x9b1A and &#x202E;bidi.",
    "",
  ].join("\n");

  beforeEach(() => {
    mkdirSync(join(root, "docs/guides"), { recursive: true });
    writeFileSync(
      join(root, "docs/guides/rich.md"),
      `---\ntype: Reference\ntitle: Rich\nsummary: every construct\nsecret_field: frontmatter-only\n---\n${RICH_BODY}`,
    );
  });

  async function lore(argv: readonly string[], over: Partial<RunContext> = {}): Promise<string> {
    const stdout = capture();
    const code = await run(["bun", "lore", ...argv], { cwd: root, stdout, stderr: capture(), ...over });
    expect(code).toBe(0);
    return stdout.text();
  }

  /** Everything after the header line and its blank line — the body as a pipe would see it. */
  const bodyOf = (text: string): string => text.split("\n").slice(2).join("\n");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the renderer's own SGR sequences.
  const SGR = /\x1b\[[0-9;]*m/g;

  test("plain via the flag, even on a TTY, is the header then the body byte-for-byte", async () => {
    const text = await lore(["read", "guides/rich", "--plain"], { isTTY: true });
    expect(bodyOf(text)).toBe(RICH_BODY);
  });

  test("a non-TTY stdout (a pipe) with no flag is plain: the body survives `tail -n +3` byte-for-byte", async () => {
    const text = await lore(["read", "guides/rich"], { isTTY: false });
    expect(bodyOf(text)).toBe(RICH_BODY);
  });

  test("--json on a TTY carries the body byte-for-byte", async () => {
    const data = JSON.parse(await lore(["read", "guides/rich", "--json"], { isTTY: true })).data as { body: string };
    expect(data.body).toBe(RICH_BODY);
  });

  test("pretty renders headings, emphasis, lists, quotes, code, links and tables", async () => {
    const text = await lore(["read", "guides/rich"], { isTTY: true, env: {} });
    const lines = text.split("\n");
    expect(lines[0]).toContain("read: guides/rich");
    expect(lines[0]).toContain("[Reference]");
    expect(lines[1]).toBe("");
    const shown = bodyOf(text).replace(SGR, "");
    expect(shown).not.toBe(RICH_BODY);
    expect(shown).toContain("# Rich heading");
    expect(shown).toContain("Some emphasis, strong text and a link (https://example.com).");
    expect(shown).toContain("• bullet one\n• [x] task done");
    expect(shown).toContain("1. first\n2. second");
    expect(shown).toContain("│ a quoted line");
    expect(shown).toContain("    const x = 1;");
    expect(shown).not.toContain("```");
    expect(shown).toContain("Col A │ Col B\n──────┼──────\na     │     1");
    // Styled, because color is on: the emphasis is italic, not asterisks.
    expect(text).toContain("\x1b[3memphasis\x1b[0m");
  });

  test("pretty wraps at the width the stdout stream itself reports, and at 80 when it reports none", async () => {
    // Through run(), which hands the handler `context.stdout ?? process.stdout`: the width must come
    // from that stream. An earlier draft read process.stdout.columns only when the handler's sink was
    // absent, which it never is on the real path, so a real terminal always rendered at 80.
    const prose = "word ".repeat(60).trim();
    writeFileSync(join(root, "docs/guides/prose.md"), `---\ntype: Reference\ntitle: P\nsummary: s\n---\n${prose}\n`);
    const narrow = capture();
    const sized = Object.assign(narrow, { columns: 40 });
    expect(
      await run(["bun", "lore", "read", "guides/prose"], {
        cwd: root,
        stdout: sized,
        stderr: capture(),
        isTTY: true,
        env: {},
      }),
    ).toBe(0);
    const narrowBody = bodyOf(narrow.text()).trimEnd().split("\n");
    expect(Math.max(...narrowBody.map((line) => line.length))).toBeLessThanOrEqual(40);
    expect(Math.max(...narrowBody.map((line) => line.length))).toBeGreaterThan(30);

    const unsized = bodyOf(await lore(["read", "guides/prose"], { isTTY: true, env: {} }))
      .trimEnd()
      .split("\n");
    expect(Math.max(...unsized.map((line) => line.length))).toBeLessThanOrEqual(80);
    expect(Math.max(...unsized.map((line) => line.length))).toBeGreaterThan(70);
  });

  test("pretty never renders the frontmatter", async () => {
    const text = await lore(["read", "guides/rich"], { isTTY: true, env: {} });
    expect(text).not.toContain("secret_field");
    expect(text).not.toContain("frontmatter-only");
  });

  test("pretty neutralises the body's escape and control sequences; plain still carries them verbatim", async () => {
    const pretty = await lore(["read", "guides/rich"], { isTTY: true, env: {} });
    const shown = pretty.replace(SGR, "");
    expect(shown).not.toContain("\x1b");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting none survive.
    expect(/[\x00-\x09\x0b-\x1f\x7f-\x9f‮]/.test(shown)).toBe(false);
    expect(shown).toContain("Hostile: red");
    // The exact-read contract is unchanged in plain: the bytes are the author's, escapes included.
    const plain = await lore(["read", "guides/rich", "--plain"], { isTTY: true });
    expect(plain).toContain("\x1b[2J");
  });

  test("NO_COLOR (even empty) removes every ANSI sequence and keeps the layout", async () => {
    const colored = await lore(["read", "guides/rich"], { isTTY: true, env: {} });
    const noColor = await lore(["read", "guides/rich"], { isTTY: true, env: { NO_COLOR: "" } });
    expect(noColor).not.toContain("\x1b");
    // Layout survives: the same heading marker, bullets, quote bar, code indent and table rule.
    for (const layout of ["# Rich heading", "• bullet one", "│ a quoted line", "    const x = 1;", "──────┼──────"]) {
      expect(noColor).toContain(layout);
    }
    // And it is the rendered view, not the verbatim body.
    expect(bodyOf(noColor)).not.toBe(RICH_BODY);
    expect(colored).toContain("\x1b[");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

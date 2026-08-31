import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { capture } from "./helpers";

// sha256 of the empty string — the exact content digest a regression that drops
// section bodies would emit. The e2e harness (docker/e2e/run-e2e.sh, Phase 22b)
// asserts the same invariant against the real compiled binary; this file guards
// the CLI-router seam in the unit suite.
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

interface PackItem {
  readonly reference: string;
  readonly conceptId: string;
  readonly body: string;
  readonly contentDigest: string;
}

interface ContextExportData {
  readonly profile: { readonly name: string };
  readonly task: string;
  readonly tokenEstimate: number;
  readonly packDigest: string;
  readonly pinned: readonly PackItem[];
  readonly sections: readonly PackItem[];
  readonly truncated: boolean;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-pack-surface-"));
  mkdirSync(join(root, "docs/reference"), { recursive: true });
  writeFileSync(
    join(root, "docs/reference/alpha.md"),
    [
      "---",
      "type: Reference",
      "title: Alpha",
      "summary: Alpha concept.",
      "tags: [evidence]",
      "---",
      "# Alpha concept",
      "",
      "Pinned rule body text.",
      "",
      "## Must Follow",
      "",
      "Never expose credentials in the pack body.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs/reference/beta.md"),
    [
      "---",
      "type: Reference",
      "title: Beta",
      "summary: Beta concept.",
      "tags: [evidence]",
      "---",
      "# Beta concept",
      "",
      "Ranked notes on checkout form validation errors.",
      "",
    ].join("\n"),
  );
  mkdirSync(join(root, ".lore/agents"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeProfile(name: string, toml: string): void {
  writeFileSync(join(root, ".lore/agents", `${name}.toml`), toml);
}

/** Drive the real CLI router (the seam `bin/lore.cjs` and the compiled binary wrap). */
async function runCli(
  args: readonly string[],
): Promise<{ code: number; out: string; err: string }> {
  const stdout = capture();
  const stderr = capture();
  const code = await run(["bun", "lore", ...args], { cwd: root, stdout, stderr, isTTY: false });
  return { code, out: stdout.text(), err: stderr.text() };
}

describe("agent context pack via the CLI router (consumer-surface regression)", () => {
  test("whole-doc and heading references compile to non-empty bodies with real digests", async () => {
    writeProfile(
      "repro-pack",
      [
        "schema_version = 1",
        'name = "repro-pack"',
        'description = "Pack-surface regression profile."',
        'kind = "specialist"',
        "max_tokens = 3000",
        'pinned = ["reference/alpha#must-follow"]',
        'sources = ["reference/beta"]',
        "",
      ].join("\n"),
    );
    const { code, out } = await runCli([
      "agent",
      "context",
      "repro-pack",
      "--task",
      "checkout form validation errors",
      "--json",
    ]);
    expect(code).toBe(0);
    const envelope = JSON.parse(out) as { kind: string; data: ContextExportData };
    expect(envelope.kind).toBe("agent.context.export");
    expect(envelope.data.pinned.length).toBe(1);
    const pin = envelope.data.pinned[0] as PackItem;
    expect(pin.reference).toBe("reference/alpha#must-follow");
    // The whole regression this exists for: a packed binary that dropped section
    // bodies produced empty strings whose sha256 is the empty input's digest.
    expect(pin.body.length).toBeGreaterThan(0);
    expect(pin.body).toContain("Never expose credentials");
    expect(pin.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(pin.contentDigest).not.toBe(`sha256:${EMPTY_SHA256}`);
    expect(envelope.data.sections.length).toBeGreaterThan(0);
    expect((envelope.data.sections[0] as PackItem).conceptId).toBe("reference/beta");
    expect(envelope.data.packDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(envelope.data.packDigest).not.toBe(`sha256:${EMPTY_SHA256}`);
    expect(envelope.data.tokenEstimate).toBeGreaterThan(0);
  });

  test("rejects the obsolete default_max_tokens key from pre-fix runbook examples", async () => {
    // The pre-fix runbook example used `default_max_tokens`, a key the strict
    // profile schema never accepted. This locks the documented example to the
    // real schema (schema_version = 1, max_tokens) so the docs cannot drift back.
    writeProfile(
      "repro-pack",
      [
        'name = "repro-pack"',
        'description = "ok"',
        'kind = "specialist"',
        "default_max_tokens = 4000",
        'pinned = ["reference/alpha"]',
        "",
      ].join("\n"),
    );
    const { code, err } = await runCli(["agent", "list", "--json"]);
    expect(code).toBe(6);
    expect(err).toContain("validation");
    expect(err).toContain("agent profile schema");
  });
});

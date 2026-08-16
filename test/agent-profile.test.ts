import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runAgent } from "../src/commands/agent";
import { runCheck } from "../src/commands/check";
import { buildSkillDoc } from "../src/core/agent-bridge";
import { compileAgentContext, renderAgentContextMarkdown } from "../src/core/agent-context";
import { loadAgentProfiles, validateAgentProfileReferences } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";
import { buildCodexSkillDoc } from "../src/core/codex-bridge";
import type { RetrievalGraphLoader } from "../src/core/retrieval";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const PLAIN_OUTPUT: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-profile-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function doc(rel: string, body: string, title = rel): void {
  const path = join(root, "docs", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `---\ntype: Reference\ntitle: ${title}\nsummary: Summary for ${title}.\ntags: [evidence]\n---\n${body}`,
  );
}

function profile(name: string, toml: string): void {
  const path = join(root, ".lore/agents", `${name}.toml`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, toml);
}

function specialist(name = "frontend-dev", extra = ""): void {
  profile(
    name,
    `schema_version = 1\nname = "${name}"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 1200\npinned = ["reference/rules#must-follow"]\nsources = ["specs/ui"]\n${extra}`,
  );
}

function fixture(): void {
  doc("reference/rules.md", "# Must follow\n\nNever expose credentials.\n\n# Other\n\nUnrelated.\n", "Rules");
  doc(
    "specs/ui.md",
    "# Checkout form\n\nUse accessible labels and checkout validation.\n\n## Errors\n\nKeep error focus deterministic.\n\n# Backend\n\nUnrelated storage text.\n",
    "UI design",
  );
}

describe("agent profiles — strict snapshot validation", () => {
  test("a missing profile directory is a valid empty snapshot", () => {
    expect(loadAgentProfiles(root).profiles.size).toBe(0);
  });

  test("loads a valid specialist and validates concept/anchor references", () => {
    fixture();
    specialist();
    const snapshot = loadAgentProfiles(root);
    expect(snapshot.profiles.get("frontend-dev")).toMatchObject({
      kind: "specialist",
      maxTokens: 1200,
      delegates: [],
    });
    expect(() => validateAgentProfileReferences(snapshot, loadBundle(join(root, "docs")))).not.toThrow();
  });

  test("rejects unknown keys, filename/name mismatch, and an invalid description", () => {
    profile(
      "frontend-dev",
      'schema_version = 1\nname = "frontend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["specs/ui"]\nmodel = "x"\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "does not match agent profile schema");

    rmSync(join(root, ".lore/agents/frontend-dev.toml"));
    profile(
      "frontend-dev",
      'schema_version = 1\nname = "backend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["specs/ui"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "filename stem");

    rmSync(join(root, ".lore/agents/frontend-dev.toml"));
    profile(
      "frontend-dev",
      'schema_version = 1\nname = "frontend-dev"\ndescription = "bad\\nline"\nkind = "specialist"\nsources = ["specs/ui"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "description must be one");
  });

  test("rejects a profile symlink and an uppercase filename/name mismatch", () => {
    const dir = join(root, ".lore/agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, "outside.toml"), "x = 1\n");
    symlinkSync(join(root, "outside.toml"), join(dir, "frontend-dev.toml"));
    expectSyncError(() => loadAgentProfiles(root), "validation", "regular file");

    rmSync(join(dir, "frontend-dev.toml"));
    profile(
      "Frontend-Dev",
      'schema_version = 1\nname = "frontend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["specs/ui"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "filename stem");
  });

  test("rejects overlapping references, missing delegates, self edges, and cycles", () => {
    profile(
      "bad",
      'schema_version = 1\nname = "bad"\ndescription = "bad"\nkind = "specialist"\npinned = ["specs/ui"]\nsources = ["specs/ui#errors"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "overlapping");

    rmSync(join(root, ".lore/agents"), { recursive: true });
    profile(
      "lead",
      'schema_version = 1\nname = "lead"\ndescription = "lead"\nkind = "orchestrator"\ndelegates = ["missing"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "missing profile");

    rmSync(join(root, ".lore/agents"), { recursive: true });
    profile(
      "lead",
      'schema_version = 1\nname = "lead"\ndescription = "lead"\nkind = "orchestrator"\ndelegates = ["lead"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "delegates to itself");

    rmSync(join(root, ".lore/agents"), { recursive: true });
    profile(
      "one",
      'schema_version = 1\nname = "one"\ndescription = "one"\nkind = "orchestrator"\ndelegates = ["two"]\n',
    );
    profile(
      "two",
      'schema_version = 1\nname = "two"\ndescription = "two"\nkind = "orchestrator"\ndelegates = ["one"]\n',
    );
    expectSyncError(() => loadAgentProfiles(root), "validation", "delegate cycle");
  });

  test("rejects missing concepts and missing GitHub heading anchors", () => {
    fixture();
    specialist();
    const graph = loadBundle(join(root, "docs"));
    const dir = join(root, ".lore/agents");
    expect(() => validateAgentProfileReferences(loadAgentProfiles(root), graph)).not.toThrow();
    writeFileSync(
      join(dir, "frontend-dev.toml"),
      'schema_version = 1\nname = "frontend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["missing/x"]\n',
    );
    expectSyncError(
      () => validateAgentProfileReferences(loadAgentProfiles(root), graph),
      "validation",
      "missing concept",
    );
    writeFileSync(
      join(dir, "frontend-dev.toml"),
      'schema_version = 1\nname = "frontend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["specs/ui#missing"]\n',
    );
    expectSyncError(
      () => validateAgentProfileReferences(loadAgentProfiles(root), graph),
      "validation",
      "missing heading",
    );
  });
});

describe("agent context compiler", () => {
  test("preserves pins, ranks only allowed sections, reports provenance, and is byte deterministic", () => {
    fixture();
    specialist();
    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"));
    const first = compileAgentContext(snapshot, graph, "frontend-dev", "implement checkout form errors", 900);
    const second = compileAgentContext(snapshot, graph, "frontend-dev", "implement checkout form errors", 900);
    expect(first).toEqual(second);
    expect(first.pinned.map((item) => item.reference)).toEqual(["reference/rules#must-follow"]);
    expect(first.pinned[0]?.body).toContain("Never expose credentials");
    expect(first.sections.length).toBeGreaterThan(0);
    expect(first.sections.every((item) => item.conceptId === "specs/ui")).toBe(true);
    expect(first.sections[0]?.body).toContain("Checkout");
    const selected = first.sections[0] as NonNullable<(typeof first.sections)[number]>;
    const breadcrumb = selected.breadcrumb === undefined ? "" : `; section: ${selected.breadcrumb}`;
    const score = selected.score?.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    const selectedBytes = [
      `### ${selected.reference}`,
      `Source: ${selected.sourcePath}${breadcrumb}; score: ${score}; digest: ${selected.contentDigest}`,
      "",
      selected.body.replace(/\n+$/, ""),
    ].join("\n");
    expect(selected.tokenEstimate).toBe(Math.ceil(selectedBytes.length / 4));
    expect(first.tokenEstimate).toBeLessThanOrEqual(900);
    expect(first.packDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(renderAgentContextMarkdown(first)).toContain("Evidence only");
    expect(renderAgentContextMarkdown(first)).not.toContain(root);
  });

  test("fails when fixed metadata plus mandatory pins cannot fit", () => {
    fixture();
    specialist();
    expectSyncError(
      () => compileAgentContext(loadAgentProfiles(root), loadBundle(join(root, "docs")), "frontend-dev", "x", 20),
      "validation",
      "mandatory evidence",
    );
  });

  test("an orchestrator includes only its own evidence and direct delegate roster", () => {
    fixture();
    specialist("frontend-dev");
    profile(
      "lead",
      'schema_version = 1\nname = "lead"\ndescription = "Route implementation work."\nkind = "orchestrator"\nmax_tokens = 1200\npinned = ["reference/rules#must-follow"]\ndelegates = ["frontend-dev"]\n',
    );
    const data = compileAgentContext(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "lead",
      "route checkout",
      1000,
    );
    expect(data.delegates).toEqual([
      { name: "frontend-dev", kind: "specialist", description: "Frontend implementation context." },
    ]);
    expect(data.catalog.map((entry) => entry.conceptId)).toEqual(["reference/rules"]);
    expect(renderAgentContextMarkdown(data)).not.toContain("accessible labels");
  });

  test("splits oversized regions only between complete Markdown blocks", () => {
    fixture();
    const items = Array.from(
      { length: 220 },
      (_, index) => `- block item ${index}${index === 219 ? " needle-item" : ""}`,
    ).join("\n");
    doc(
      "specs/ui.md",
      `# Long evidence\n\n${items}\n\n\`\`\`ts\nconst sentinel = "complete-code-block";\n\`\`\`\n`,
      "UI design",
    );
    specialist();
    const data = compileAgentContext(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "frontend-dev",
      "needle-item",
      2500,
    );
    const list = data.sections.find((item) => item.body.includes("needle-item"));
    expect(list?.body).toStartWith("- block item 0");
    expect(list?.body).toContain("- block item 219 needle-item");
    expect(list?.body).not.toContain("```ts");
  });
});

describe("lore agent command", () => {
  test("lore check rejects invalid agent profile references before reporting", () => {
    fixture();
    profile(
      "frontend-dev",
      'schema_version = 1\nname = "frontend-dev"\ndescription = "ok"\nkind = "specialist"\nsources = ["missing/x"]\n',
    );
    expectSyncError(() => runCheck({ root, output: JSON_OUTPUT, args: [] }), "validation", "missing concept");
  });

  test("generated Claude and Codex guidance carries the stable opt-in without native-agent generation", () => {
    for (const guidance of [buildSkillDoc(), buildCodexSkillDoc()]) {
      expect(guidance).toContain("Lore profile:");
      expect(guidance).toContain("lore agent context <name> --task");
      expect(guidance).toContain("does not create or patch native agents");
      expect(guidance).toContain("## Commit-side-effect preflight");
      expect(guidance).toContain("explicit commit authority");
      expect(guidance).toContain("workspace");
      expect(guidance).toContain("provenance");
    }
  });

  test("list and show expose stable JSON contracts", async () => {
    fixture();
    specialist();
    const stdout = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args: ["list"], stdout })).toBe(0);
    let envelope = JSON.parse(stdout.text()) as { kind: string; data: { profiles: unknown[] } };
    expect(envelope.kind).toBe("agent.profiles");
    expect(envelope.data.profiles).toHaveLength(1);

    const shown = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args: ["show", "frontend-dev"], stdout: shown })).toBe(0);
    envelope = JSON.parse(shown.text()) as typeof envelope;
    expect(envelope.kind).toBe("agent.profile");
  });

  test("context supports plain/JSON output and indexed/reference byte parity", async () => {
    fixture();
    specialist();
    const graph = loadBundle(join(root, "docs"));
    const reference: RetrievalGraphLoader = async () => ({ graph, backend: "reference" });
    const indexed: RetrievalGraphLoader = async () => ({ graph, backend: "indexed" });
    const args = ["context", "frontend-dev", "--task", "checkout errors", "--max-tokens", "900"];
    const one = capture();
    const two = capture();
    expect(await runAgent({ root, output: PLAIN_OUTPUT, args, stdout: one, retrieval: reference })).toBe(0);
    expect(await runAgent({ root, output: PLAIN_OUTPUT, args, stdout: two, retrieval: indexed })).toBe(0);
    expect(one.text()).toBe(two.text());

    const json = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args, stdout: json, retrieval: reference })).toBe(0);
    expect(JSON.parse(json.text()).kind).toBe("agent.context.export");
  });

  test("router dispatches the singular family and preserves the plural command", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const stderr = capture();
    expect(await run(["bun", "lore", "agent", "list", "--json"], { cwd: root, stdout, stderr, isTTY: false })).toBe(0);
    expect(JSON.parse(stdout.text()).kind).toBe("agent.profiles");
    const help = capture();
    expect(
      await run(["bun", "lore", "help", "agent", "--json"], { cwd: root, stdout: help, stderr, isTTY: false }),
    ).toBe(0);
    expect(JSON.parse(help.text()).data.commands[0].name).toBe("agent");
  });

  test("validates action arity, task exclusivity, force, budget, and unknown profile", async () => {
    fixture();
    specialist();
    await expectErrorAsync(() => runAgent({ root, output: JSON_OUTPUT, args: [] }), "usage", "needs an action");
    await expectErrorAsync(
      () =>
        runAgent({ root, output: JSON_OUTPUT, args: ["context", "frontend-dev", "--task", "x", "--task-file", "x"] }),
      "usage",
      "exactly one",
    );
    await expectErrorAsync(
      () => runAgent({ root, output: JSON_OUTPUT, args: ["context", "frontend-dev", "--task", "x", "--force"] }),
      "usage",
      "requires --out",
    );
    await expectErrorAsync(
      () =>
        runAgent({ root, output: JSON_OUTPUT, args: ["context", "frontend-dev", "--task", "x", "--max-tokens", "0"] }),
      "usage",
      "invalid --max-tokens",
    );
    await expectErrorAsync(
      () => runAgent({ root, output: JSON_OUTPUT, args: ["show", "missing"] }),
      "not_found",
      "not found",
    );
  });

  test("writes atomically, refuses silent overwrite/path escape/symlinks, and supports --force", async () => {
    fixture();
    specialist();
    const base = [
      "context",
      "frontend-dev",
      "--task",
      "checkout",
      "--max-tokens",
      "900",
      "--out",
      ".lore/cache/contexts/x.md",
    ];
    const created = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args: base, stdout: created })).toBe(0);
    const path = join(root, ".lore/cache/contexts/x.md");
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path, "utf8");
    expect(JSON.parse(created.text()).data.write.action).toBe("created");

    const unchanged = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args: base, stdout: unchanged })).toBe(0);
    expect(JSON.parse(unchanged.text()).data.write.action).toBe("unchanged");
    expect(readFileSync(path, "utf8")).toBe(bytes);

    writeFileSync(path, "different\n");
    await expectErrorAsync(() => runAgent({ root, output: JSON_OUTPUT, args: base }), "conflict", "cannot overwrite");
    const updated = capture();
    expect(await runAgent({ root, output: JSON_OUTPUT, args: [...base, "--force"], stdout: updated })).toBe(0);
    expect(JSON.parse(updated.text()).data.write.action).toBe("updated");

    await expectErrorAsync(
      () =>
        runAgent({ root, output: JSON_OUTPUT, args: ["context", "frontend-dev", "--task", "x", "--out", "../x.md"] }),
      "usage",
      "inside the repo",
    );

    const outside = mkdtempSync(join(tmpdir(), "lore-agent-out-"));
    try {
      rmSync(join(root, ".lore/cache"), { recursive: true, force: true });
      mkdirSync(join(root, ".lore"), { recursive: true });
      symlinkSync(outside, join(root, ".lore/cache"));
      await expectErrorAsync(() => runAgent({ root, output: JSON_OUTPUT, args: base }), "conflict", "symlink");
      expect(existsSync(join(outside, "contexts/x.md"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("reads a confined non-symlink task file or the injected task-file seam", async () => {
    fixture();
    specialist();
    writeFileSync(join(root, "task.txt"), "checkout labels");
    const real = capture();
    expect(
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task-file", "task.txt", "--max-tokens", "900"],
        stdout: real,
      }),
    ).toBe(0);
    expect(JSON.parse(real.text()).data.task).toBe("checkout labels");

    const stdout = capture();
    expect(
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task-file", "task.txt", "--max-tokens", "900"],
        stdout,
        readTaskFile: (path) => (path === "task.txt" ? "checkout labels" : ""),
      }),
    ).toBe(0);
    expect(JSON.parse(stdout.text()).data.task).toBe("checkout labels");

    await expectErrorAsync(
      () =>
        runAgent({
          root,
          output: JSON_OUTPUT,
          args: ["context", "frontend-dev", "--task-file", "../task.txt", "--max-tokens", "900"],
        }),
      "usage",
      "inside the repo",
    );
    symlinkSync(join(root, "task.txt"), join(root, "task-link.txt"));
    await expectErrorAsync(
      () =>
        runAgent({
          root,
          output: JSON_OUTPUT,
          args: ["context", "frontend-dev", "--task-file", "task-link.txt", "--max-tokens", "900"],
        }),
      "conflict",
      "symlink",
    );
  });
});

async function expectErrorAsync(
  runError: () => Promise<unknown>,
  type: LoreError["type"],
  message: string,
): Promise<void> {
  try {
    await runError();
    throw new Error("expected LoreError");
  } catch (error) {
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe(type);
    expect(String((error as Error).message)).toContain(message);
  }
}

function expectSyncError(runError: () => unknown, type: LoreError["type"], message: string): void {
  const error = expectError(type, runError);
  expect(error.message).toContain(message);
}

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExplorerArtifactResult, runExplorer } from "../src/commands/explorer";
import { type ExplorerSnapshot, parseExplorerSnapshot } from "../src/core/explorer-contract";
import { parseRetainedSnapshot, type RetainedSnapshot } from "../src/core/snapshot";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const fixture = parseExplorerSnapshot(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/explorer/v1.json"), "utf8")),
);
const retainedFixtureValue = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/snapshot/v1.json"), "utf8")) as {
  readonly from: unknown;
  readonly to: unknown;
};
const retainedFixtures = [
  parseRetainedSnapshot(retainedFixtureValue.from),
  parseRetainedSnapshot(retainedFixtureValue.to),
];
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("lore explorer command", () => {
  test("creates, deterministically reuses, and refreshes the default Lore-owned artifact", async () => {
    const root = tempRoot();
    const created = await invoke(root, []);
    expect(created.action).toBe("created");
    expect(created.path).toBe(".lore/explorer/index.html");
    const html = readFileSync(join(root, created.path), "utf8");
    expect(html).toContain("Lore graph explorer");
    const unchanged = await invoke(root, []);
    expect(unchanged).toMatchObject({ action: "unchanged", digest: created.digest, byteLength: created.byteLength });
    writeFileSync(join(root, created.path), "stale");
    const updated = await invoke(root, []);
    expect(updated).toMatchObject({ action: "updated", digest: created.digest });
  });

  test("protects differing custom output unless --force is explicit", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "custom.html"), "mine");
    await expectLoreError(() => invoke(root, ["--out", "custom.html"]), "conflict", "cannot overwrite");
    const updated = await invoke(root, ["--out", "custom.html", "--force"]);
    expect(updated).toMatchObject({ action: "updated", path: "custom.html" });
  });

  test("rejects repository escapes, source-tree targets, non-HTML files, bad flags, and symlinks", async () => {
    const root = tempRoot();
    for (const args of [
      ["--out", "../escape.html"],
      ["--out", "docs/explorer.html"],
      ["--out", "backlog/explorer.html"],
      ["--out", ".git/explorer.html"],
      ["--out", "artifact.json"],
      ["unexpected"],
      ["--out"],
    ]) {
      await expectLoreError(() => invoke(root, args), "usage");
    }
    symlinkSync(tmpdir(), join(root, "linked"));
    await expectLoreError(() => invoke(root, ["--out", "linked/explorer.html"]), "conflict", "symlink");
  });

  test("emits the stable explorer.artifact JSON contract", async () => {
    const root = tempRoot();
    const result = await invoke(root, ["--out=dist/explorer.html"]);
    expect(result).toEqual({
      artifactVersion: "lore-explorer-artifact/1",
      snapshotSchemaVersion: "lore-explorer-snapshot/1",
      snapshotKey: fixture.source.snapshotKey,
      path: "dist/explorer.html",
      action: "created",
      byteLength: expect.any(Number),
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      counts: fixture.health.counts,
    });
  });

  test("builds explicit retained snapshot and from/to comparison artifacts", async () => {
    const root = tempRoot();
    const single = await invoke(root, [
      "--snapshot",
      retainedFixtures[1]?.snapshotKey as string,
      "--out",
      "single.html",
    ]);
    expect(single).toMatchObject({
      snapshotSchemaVersion: "lore-explorer-change-snapshot/1",
      snapshotKey: retainedFixtures[1]?.snapshotKey,
      counts: { repositories: 2, concepts: 1, tasks: 1, authoredEdges: 2, duplicateEdges: 1 },
    });
    expect(readFileSync(join(root, "single.html"), "utf8")).toContain("Lore retained snapshot explorer");

    const comparison = await invoke(root, [
      "--from",
      retainedFixtures[0]?.snapshotKey as string,
      "--to",
      retainedFixtures[1]?.snapshotKey as string,
      "--out",
      "comparison.html",
    ]);
    expect(comparison.snapshotSchemaVersion).toBe("lore-explorer-change-snapshot/1");
    expect(readFileSync(join(root, "comparison.html"), "utf8")).toContain("Paired evidence");

    await expectLoreError(
      () => invoke(root, ["--from", retainedFixtures[0]?.snapshotKey as string]),
      "usage",
      "supplied together",
    );
    await expectLoreError(
      () =>
        invoke(root, [
          "--snapshot",
          retainedFixtures[0]?.snapshotKey as string,
          "--from",
          retainedFixtures[0]?.snapshotKey as string,
          "--to",
          retainedFixtures[1]?.snapshotKey as string,
        ]),
      "usage",
      "mutually exclusive",
    );
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-explorer-command-"));
  roots.push(root);
  return root;
}

async function invoke(root: string, args: string[]): Promise<ExplorerArtifactResult> {
  const stdout = capture();
  const code = await runExplorer({
    root,
    output: JSON_OUTPUT,
    args,
    stdout,
    loadSnapshot: async (): Promise<ExplorerSnapshot> => fixture,
    loadRetainedSnapshot: async (selector: string): Promise<RetainedSnapshot> => {
      const found = retainedFixtures.find(
        (snapshot) =>
          snapshot.snapshotKey === selector ||
          snapshot.repositories.some((repository) => repository.gitCommit === selector),
      );
      if (found === undefined) throw new LoreError("not_found", `fixture snapshot ${selector} missing`);
      return found;
    },
  });
  expect(code).toBe(0);
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: ExplorerArtifactResult };
  expect(envelope.kind).toBe("explorer.artifact");
  return envelope.data;
}

async function expectLoreError(fn: () => Promise<unknown>, type: LoreError["type"], message?: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe(type);
    if (message !== undefined) expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error(`expected ${type} LoreError`);
}

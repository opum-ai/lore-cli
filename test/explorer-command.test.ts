import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExplorerArtifactResult, runExplorer } from "../src/commands/explorer";
import { type ExplorerSnapshot, parseExplorerSnapshot } from "../src/core/explorer-contract";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const fixture = parseExplorerSnapshot(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/explorer/v1.json"), "utf8")),
);
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

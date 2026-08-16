import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBacklog } from "../src/commands/backlog";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
let root: string;

interface AdoptionData {
  approval: { digest: string };
  state?: string;
  created?: Array<{ id?: string; path?: string; removed?: boolean }>;
  records?: Array<{ collision?: { reason: string } | null }>;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-backlog-adoption-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeManifest(): void {
  const content = "Decision body.";
  writeFileSync(
    join(root, "adoption.json"),
    JSON.stringify({
      schema: "lore-backlog-adoption-source/1",
      repository: { id: "backlog-fixture", revision: "abc123" },
      migration: "fixture-migration",
      records: [
        {
          id: "DEC-1",
          type: "decision",
          path: "backlog/decisions/one.md",
          digest: digest(content),
          title: "One decision",
          content,
        },
      ],
    }),
  );
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function invoke(args: string[]): { code: number; kind: string; data: AdoptionData; bytes: string } {
  const stdout = capture();
  const code = runBacklog({ root, output: JSON_CTX, args, stdout });
  const bytes = stdout.text();
  const envelope = JSON.parse(bytes) as { kind: string; data: AdoptionData };
  return { code, kind: envelope.kind, data: envelope.data, bytes };
}

describe("lore backlog adopt", () => {
  test("has a byte-stable preview receipt and a digest-guarded, idempotent lifecycle", () => {
    writeManifest();
    const first = invoke(["adopt", "preview", "--manifest", "adoption.json"]);
    const second = invoke(["adopt", "preview", "--manifest", "adoption.json"]);
    expect(first.code).toBe(0);
    expect(first.kind).toBe("backlog.adoption.preview");
    expect(second.bytes).toBe(first.bytes);
    const digest = first.data.approval.digest as string;
    const applied = invoke(["adopt", "apply", "--manifest", "adoption.json", "--approval-digest", digest]);
    expect(applied.kind).toBe("backlog.adoption.apply");
    expect(applied.data.state).toBe("applied");
    expect(readFileSync(join(root, "docs/adr/one-decision.md"), "utf8")).toContain(
      "source_repository: backlog-fixture",
    );
    const again = invoke(["adopt", "apply", "--manifest", "adoption.json", "--approval-digest", digest]);
    expect(again.data.state).toBe("applied");
    expect(() =>
      invoke(["adopt", "apply", "--manifest", "adoption.json", "--approval-digest", "sha256:wrong"]),
    ).toThrow("approval digest does not match");
    const rolled = invoke(["adopt", "rollback", "--migration", "fixture-migration"]);
    expect(rolled.kind).toBe("backlog.adoption.rollback");
    expect(rolled.data.state).toBe("rolled-back");
    expect(rolled.data.created).toEqual([
      expect.objectContaining({ id: "adr/one-decision", path: "docs/adr/one-decision.md", removed: true }),
    ]);
    const status = invoke(["adopt", "status", "--migration", "fixture-migration"]);
    expect(status.data.state).toBe("rolled-back");
  });

  test("reports a blocked rollback as validation failure without deleting a changed concept", () => {
    writeManifest();
    const preview = invoke(["adopt", "preview", "--manifest", "adoption.json"]);
    invoke(["adopt", "apply", "--manifest", "adoption.json", "--approval-digest", preview.data.approval.digest]);
    const concept = join(root, "docs/adr/one-decision.md");
    writeFileSync(concept, `${readFileSync(concept, "utf8")}\nHuman change.\n`);
    const rollback = invoke(["adopt", "rollback", "--migration", "fixture-migration"]);
    expect(rollback.code).toBe(6);
    expect(rollback.data.state).toBe("blocked-incomplete");
    expect(readFileSync(concept, "utf8")).toContain("Human change.");
  });

  test("rejects unverified source content and duplicate destination handles before apply", () => {
    writeManifest();
    const manifest = JSON.parse(readFileSync(join(root, "adoption.json"), "utf8"));
    manifest.records[0].content = "tampered";
    writeFileSync(join(root, "adoption.json"), JSON.stringify(manifest));
    expect(() => invoke(["adopt", "preview", "--manifest", "adoption.json"])).toThrow("content does not match");

    manifest.records[0].content = "Decision body.";
    manifest.records[0].digest = digest(manifest.records[0].content);
    manifest.records.push({ ...manifest.records[0], id: "DEC-2", path: "backlog/decisions/two.md" });
    writeFileSync(join(root, "adoption.json"), JSON.stringify(manifest));
    const preview = invoke(["adopt", "preview", "--manifest", "adoption.json"]);
    expect(preview.data.records?.every((record) => record.collision?.reason === "duplicate-destination")).toBe(true);
    expect(() =>
      invoke(["adopt", "apply", "--manifest", "adoption.json", "--approval-digest", preview.data.approval.digest]),
    ).toThrow("destination collisions");
  });
});

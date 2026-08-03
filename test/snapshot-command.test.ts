import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChanged } from "../src/commands/changed";
import { runProvenance } from "../src/commands/provenance";
import { runSnapshot } from "../src/commands/snapshot";
import {
  type ChangedResult,
  type ProvenanceResult,
  parseRetainedSnapshot,
  type RetainedSnapshot,
} from "../src/core/snapshot";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const output: OutputContext = { mode: "json", color: false };
const fixtureValue = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/snapshot/v1.json"), "utf8")) as {
  readonly from: unknown;
  readonly to: unknown;
};
const fixtures = [parseRetainedSnapshot(fixtureValue.from), parseRetainedSnapshot(fixtureValue.to)] as const;
const scope = { kind: fixtures[0].scopeKind, scopeKey: fixtures[0].scopeKey };
const roots: string[] = [];

interface SnapshotTestEnvelope {
  readonly kind: string;
  readonly data: { readonly action: string; readonly [key: string]: unknown };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("snapshot, changed, and provenance commands", () => {
  test("shares retained bytes across lifecycle, comparison, and provenance CLI envelopes", async () => {
    const root = tempRoot();
    for (const current of fixtures) {
      const retained = await invokeSnapshot(root, ["retain"], current);
      expect(retained.kind).toBe("snapshot.result");
      expect(retained.data).toMatchObject({ action: "retained", snapshot: { snapshotKey: current.snapshotKey } });
    }
    const listed = await invokeSnapshot(root, ["list"], fixtures[1]);
    expect(listed.data).toMatchObject({ action: "listed", retained: 2, maximum: 16 });

    const changed = await invokeChanged(root, [fixtures[0].snapshotKey, fixtures[1].snapshotKey]);
    expect(changed).toMatchObject({
      schemaVersion: "lore-changed-result/1",
      shown: 4,
      totalChanges: 4,
      truncated: false,
      complete: true,
    });
    expect(changed.changes.map((change) => [change.change, change.recordKind])).toEqual([
      ["changed", "concept"],
      ["added", "edge"],
      ["added", "edge"],
      ["added", "task"],
    ]);

    const provenance = await invokeProvenance(root, [
      "specs/history",
      "--kind",
      "concept",
      "--snapshot",
      fixtures[1].snapshotKey,
    ]);
    expect(provenance).toMatchObject({
      schemaVersion: "lore-provenance-result/1",
      fact: { id: "specs/history", provenance: { sourcePath: "docs/specs/retained-history.md" } },
    });

    const deleted = await invokeSnapshot(root, ["delete", fixtures[0].snapshotKey], fixtures[1]);
    expect(deleted.data).toEqual({ action: "deleted", deleted: [fixtures[0].snapshotKey] });
  });

  test("fails loud on invalid bounds, missing selectors, and absent evidence", async () => {
    const root = tempRoot();
    await invokeSnapshot(root, ["retain"], fixtures[0]);
    await expectLoreError(
      () => invokeChanged(root, [fixtures[0].snapshotKey, fixtures[0].snapshotKey, "--limit", "0"]),
      "usage",
    );
    await expectLoreError(() => invokeProvenance(root, ["specs/history", "--kind", "concept"]), "usage");
    await expectLoreError(
      () => invokeProvenance(root, ["missing", "--kind", "concept", "--snapshot", fixtures[0].snapshotKey]),
      "not_found",
    );
    await expectLoreError(() => invokeSnapshot(root, ["delete"], fixtures[0]), "usage");
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-snapshot-command-"));
  roots.push(root);
  return root;
}

async function invokeSnapshot(root: string, args: string[], current: RetainedSnapshot): Promise<SnapshotTestEnvelope> {
  const stdout = capture();
  expect(
    await runSnapshot({ root, output, args, stdout, loadCurrentSnapshot: () => current, resolveScope: () => scope }),
  ).toBe(0);
  return JSON.parse(stdout.text()) as SnapshotTestEnvelope;
}

async function invokeChanged(root: string, args: string[]): Promise<ChangedResult> {
  const stdout = capture();
  expect(await runChanged({ root, output, args, stdout, resolveScope: () => scope })).toBe(0);
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: ChangedResult };
  expect(envelope.kind).toBe("changed.result");
  return envelope.data;
}

async function invokeProvenance(root: string, args: string[]): Promise<ProvenanceResult> {
  const stdout = capture();
  expect(await runProvenance({ root, output, args, stdout, resolveScope: () => scope })).toBe(0);
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: ProvenanceResult };
  expect(envelope.kind).toBe("provenance.result");
  return envelope.data;
}

async function expectLoreError(fn: () => Promise<unknown>, type: LoreError["type"]): Promise<void> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe(type);
    return;
  }
  throw new Error(`expected ${type} LoreError`);
}

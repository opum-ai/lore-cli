/**
 * reconcile-shared.test.ts — direct unit coverage for `commands/reconcile-shared.ts`'s gather,
 * shared by `lore sync` (sync.test.ts) and `lore check` (check.test.ts). Those two suites already
 * exercise it end to end through their own command; this file pins the shared engine's own
 * contract in isolation: eligibility filtering, task-id dedup, and fail-fast config validation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogTaskDetail } from "../src/adapters/backlog";
import { gatherReconciliation, linkedConcepts } from "../src/commands/reconcile-shared";
import { LoreError } from "../src/errors";
import { concept, fakeAdapter, makeTask } from "./helpers";

describe("linkedConcepts", () => {
  test("excludes a concept with no tasks:", () => {
    expect(linkedConcepts([concept("stories/x.md")])).toEqual([]);
  });

  test("excludes a reserved-stem concept (index/log) even with tasks:", () => {
    const withTasks = concept("index.md", { tasks: ["lore-1"] });
    expect(linkedConcepts([withTasks])).toEqual([]);
  });

  test("includes a concept linking at least one task, deduped case-insensitively", () => {
    const doc = concept("stories/x.md", { tasks: ["lore-1", "LORE-1", "lore-2"] });
    const [result] = linkedConcepts([doc]);
    expect(result?.concept).toBe(doc);
    expect(result?.linked).toEqual(["lore-1", "lore-2"]);
  });
});

describe("gatherReconciliation", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-reconcile-shared-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("returns [] and touches no adapter when nothing is eligible", async () => {
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] });
    const result = await gatherReconciliation(root, [concept("stories/x.md")], poison);
    expect(result).toEqual([]);
    expect(poison.calls).toEqual([]);
  });

  test("resolves each linked task once and computes the rolled-up status + rows", async () => {
    const doc = concept("stories/x.md", { tasks: ["lore-1"], status: "todo" });
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);

    const [target] = await gatherReconciliation(root, [doc], adapter);
    expect(target?.concept).toBe(doc);
    expect(target?.newStatus).toBe("done");
    expect(target?.rows).toEqual([
      { id: "LORE-1", title: "Ship it", status: "Done", file: "backlog/tasks/lore-1 - title.md" },
    ]);
  });

  test("dedupes a task id shared by two concepts to one resolution call", async () => {
    let calls = 0;
    const base = makeTask("LORE-1", { status: "Done" });
    const adapter = fakeAdapter([base]);
    const counting = {
      ...adapter,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        calls++;
        return adapter.viewTask(id);
      },
    };
    const a = concept("stories/a.md", { tasks: ["lore-1"] });
    const b = concept("stories/b.md", { tasks: ["LORE-1"] });

    await gatherReconciliation(root, [a, b], counting);
    expect(calls).toBe(1);
  });

  test("throws not_found for a linked task that no longer exists", async () => {
    const doc = concept("stories/x.md", { tasks: ["lore-99"] });
    const adapter = fakeAdapter([]);
    await expect(gatherReconciliation(root, [doc], adapter)).rejects.toThrow(/lore-99/);
  });

  test("validates the status flow before any Backlog subprocess round-trip", async () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    const doc = concept("stories/x.md", { tasks: ["lore-99"] }); // would 404 if ever asked
    const poison = fakeAdapter([], { poisonViews: ["lore-99"] });

    const err = await gatherReconciliation(root, [doc], poison).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("validation");
    expect((err as LoreError).message).toContain("backlog/config.yml");
  });
});

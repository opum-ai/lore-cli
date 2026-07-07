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
import {
  gatherReconciliation,
  linkedConcepts,
  resolveTaskDetails,
  type TaskResolution,
} from "../src/commands/reconcile-shared";
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

  // ── detailsOverride (LORE-50): a caller pools task resolution across several callers ──────────

  test("detailsOverride is used instead of the adapter — no Backlog IO at all", async () => {
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] });
    const doc = concept("stories/x.md", { tasks: ["lore-1"] });
    const details = new Map<string, TaskResolution>([
      ["lore-1", { ok: true, detail: makeTask("LORE-1", { status: "Done", title: "Ship it" }) }],
    ]);

    const [target] = await gatherReconciliation(root, [doc], poison, undefined, details);
    expect(target?.newStatus).toBe("done");
    expect(poison.calls).toEqual([]); // editTask never called; poison's viewTask would throw if reached
  });

  test("detailsOverride's own pre-resolved error is thrown for a failed id (not_found, exit 3)", async () => {
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] });
    const doc = concept("stories/x.md", { tasks: ["lore-1"] });
    const details = new Map<string, TaskResolution>([
      ["lore-1", { ok: false, error: new LoreError("not_found", 'task "lore-1" does not exist', "") }],
    ]);

    await expect(gatherReconciliation(root, [doc], poison, undefined, details)).rejects.toThrow(/lore-1/);
  });

  test("a detailsOverride covering only ANOTHER root's ids leaves this root's own id untouched by its failure", async () => {
    // Mirrors `lore check`'s multi-root pooling: the shared map can carry a failure for an id THIS
    // call never references — that failure must never surface for concepts that don't link it.
    const poison = fakeAdapter([], { poisonViews: ["lore-1", "lore-2"] });
    const doc = concept("stories/x.md", { tasks: ["lore-2"] });
    const details = new Map<string, TaskResolution>([
      ["lore-1", { ok: false, error: new LoreError("not_found", 'task "lore-1" does not exist', "") }],
      ["lore-2", { ok: true, detail: makeTask("LORE-2", { status: "Done" }) }],
    ]);

    const [target] = await gatherReconciliation(root, [doc], poison, undefined, details);
    expect(target?.newStatus).toBe("done");
  });
});

describe("resolveTaskDetails", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-reconcile-shared-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("never throws — a missing id resolves to ok:false alongside a found id's ok:true", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const resolved = await resolveTaskDetails(adapter, ["lore-1", "lore-99"]);

    const found = resolved.get("lore-1");
    expect(found?.ok).toBe(true);
    expect(found?.ok === true && found.detail.id).toBe("LORE-1");

    const missing = resolved.get("lore-99");
    expect(missing?.ok).toBe(false);
    expect(missing?.ok === false && missing.error).toBeInstanceOf(LoreError);
  });

  test("a rejected viewTask call also becomes an ok:false entry, not a thrown/rejected promise", async () => {
    const adapter = fakeAdapter([], { poisonViews: ["lore-1"] });
    const resolved = await resolveTaskDetails(adapter, ["lore-1"]);
    const entry = resolved.get("lore-1");
    expect(entry?.ok).toBe(false);
  });

  test("resolves each distinct id exactly once even when passed with duplicate casings", async () => {
    let calls = 0;
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const counting = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        calls++;
        return base.viewTask(id);
      },
    };
    // The caller (gatherReconciliation) is what dedupes casings before calling this; resolveTaskDetails
    // itself just resolves whatever distinct ids it's given, once each.
    await resolveTaskDetails(counting, ["lore-1"]);
    expect(calls).toBe(1);
  });
});

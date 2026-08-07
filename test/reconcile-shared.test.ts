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
  readReconcileConfig,
  resolveTaskDetails,
  TASK_DETAILS_CONCURRENCY,
  type TaskResolution,
  taskBlockConcepts,
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

describe("taskBlockConcepts", () => {
  test("includes an explicit empty tasks: field but excludes an absent field", () => {
    const empty = concept("stories/empty.md", { tasks: [] });
    expect(taskBlockConcepts([concept("stories/absent.md"), empty])).toEqual([{ concept: empty, linked: [] }]);
  });

  test("still excludes reserved-stem concepts with an explicit tasks: field", () => {
    expect(taskBlockConcepts([concept("index.md", { tasks: [] })])).toEqual([]);
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

  test("reads the selected adapter's statusFlow instead of reaching into Backlog config directly", () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    const adapter = {
      ...fakeAdapter([]),
      statusFlow: () => ["Queued", "Building", "Shipped"],
    };

    expect(readReconcileConfig(root, adapter)).toEqual({
      flow: ["Queued", "Building", "Shipped"],
      overrides: {},
    });
  });

  test("returns a zero-row target and touches no config or adapter for an explicit empty tasks: field", async () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    const doc = concept("stories/x.md", { tasks: [], status: "done" });
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] });

    const result = await gatherReconciliation(root, [doc], poison);

    expect(result).toEqual([{ concept: doc, newTaskStatus: null, rows: [] }]);
    expect(poison.calls).toEqual([]);
  });

  test("resolves each linked task once and computes the rolled-up status + rows", async () => {
    const doc = concept("stories/x.md", { tasks: ["lore-1"], status: "todo" });
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);

    const [target] = await gatherReconciliation(root, [doc], adapter);
    expect(target?.concept).toBe(doc);
    expect(target?.newTaskStatus).toBe("done");
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

  test("LORE-122: an adapter returning a mismatched-id detail surfaces as an error, never a silently wrong row", async () => {
    // A stub adapter whose viewTask always answers with SOME OTHER task's detail, regardless of
    // what id was requested — the exact failure mode this task guards against: without the
    // identity check, this concept's managed tasks: block would silently render "Wrong task
    // entirely" / "Done" under lore-1's own id.
    const base = fakeAdapter([]);
    const mismatched = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", { status: "Done", title: "Wrong task entirely" });
      },
    };
    const doc = concept("stories/x.md", { tasks: ["lore-1"], status: "todo" });

    const err = await gatherReconciliation(root, [doc], mismatched).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).message).toContain("lore-1");
    expect((err as LoreError).message).toContain("LORE-999");
  });

  test("configOverride bypasses disk entirely — a broken on-disk config never surfaces", async () => {
    // The mechanism `lore check`'s multi-root pooling (LORE-50) depends on: a caller that already
    // resolved-and-validated its own config never pays for (or is exposed to) a second, independent
    // read/validation of the SAME files.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n"); // would fail validation if read
    const doc = concept("stories/x.md", { tasks: ["lore-1"], status: "todo" });
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const [target] = await gatherReconciliation(root, [doc], adapter, { flow: ["Todo", "Done"], overrides: {} });
    expect(target?.newTaskStatus).toBe("done");
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
    expect(target?.newTaskStatus).toBe("done");
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
    expect(target?.newTaskStatus).toBe("done");
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

  // ── LORE-122: viewTask's returned id must match the requested id ──────────────────────────────

  test("a detail whose id does not match the requested taskId becomes ok:false, not ok:true", async () => {
    // A stub adapter that always answers with a DIFFERENT task's detail than whatever was asked
    // for — the exact shape `viewTask` must never be trusted blindly against.
    const base = fakeAdapter([]);
    const mismatched: typeof base = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", { status: "Done", title: "Wrong task entirely" });
      },
    };

    const resolved = await resolveTaskDetails(mismatched, ["lore-1"]);
    const entry = resolved.get("lore-1");

    expect(entry?.ok).toBe(false);
    expect(entry?.ok === false && entry.error).toBeInstanceOf(LoreError);
    const err = entry?.ok === false ? (entry.error as LoreError) : undefined;
    expect(err?.type).toBe("not_found");
    expect(err?.message).toContain("lore-1");
    expect(err?.message).toContain("LORE-999");
  });

  test("an id that matches only case-insensitively is still accepted as ok:true", async () => {
    // The requested id and the resolved detail's id may legitimately differ in case (Backlog
    // normalizes casing on write) — only a genuine identity mismatch is a failure.
    const base = fakeAdapter([]);
    const differentCase: typeof base = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-1", { status: "Done" });
      },
    };

    const resolved = await resolveTaskDetails(differentCase, ["lore-1"]);
    const entry = resolved.get("lore-1");
    expect(entry?.ok).toBe(true);
  });

  test("calls the adapter exactly once for a single id", async () => {
    let calls = 0;
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const counting = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        calls++;
        return base.viewTask(id);
      },
    };
    await resolveTaskDetails(counting, ["lore-1"]);
    expect(calls).toBe(1);
  });

  test("does NOT dedupe duplicate casings of the same id itself -- that's the caller's job", async () => {
    // gatherReconciliation dedupes (via dedupeTaskIds) BEFORE calling this; resolveTaskDetails just
    // resolves whatever ids it's handed, once each, so a caller that skips dedup pays for it here.
    let calls = 0;
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const counting = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        calls++;
        return base.viewTask(id);
      },
    };
    await resolveTaskDetails(counting, ["lore-1", "LORE-1"]);
    expect(calls).toBe(2);
  });

  // ── LORE-111: bounded concurrency ──────────────────────────────────────────────────────────

  test("never runs more than TASK_DETAILS_CONCURRENCY viewTask calls in flight at once", async () => {
    // Comfortably more distinct ids than the cap, so the pool must refill at least twice — a
    // single un-bounded burst (the pre-fix Promise.allSettled(...map(...)) behavior) would let
    // `active` climb past the cap immediately.
    const total = TASK_DETAILS_CONCURRENCY * 3 + 2;
    const ids = Array.from({ length: total }, (_, i) => `lore-${i}`);
    let active = 0;
    let peak = 0;
    const base = fakeAdapter([]);
    const instrumented = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return makeTask(id.toUpperCase());
      },
    };

    const resolved = await resolveTaskDetails(instrumented, ids);

    expect(peak).toBeLessThanOrEqual(TASK_DETAILS_CONCURRENCY);
    expect(peak).toBe(TASK_DETAILS_CONCURRENCY); // the pool saturates — this isn't just trivially bounded
    expect(active).toBe(0); // every worker settled
    expect(resolved.size).toBe(total);
    for (const id of ids) {
      expect(resolved.get(id)?.ok).toBe(true);
    }
  });

  test("preserves no-throw / per-id ok:false-on-rejection under the concurrency cap", async () => {
    // A mix of rejected, not-found (null), and successful viewTask calls, at a volume larger than
    // the cap — resolveTaskDetails must still never throw/reject, and every id must land in the
    // returned map with the right ok:true/false outcome, regardless of pool scheduling.
    const total = TASK_DETAILS_CONCURRENCY * 2 + 3;
    const ids = Array.from({ length: total }, (_, i) => `lore-${i}`);
    const base = fakeAdapter([]);
    const instrumented = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        const i = Number(id.split("-")[1]);
        if (i % 3 === 0) {
          throw new Error(`boom for ${id}`); // rejected promise
        }
        if (i % 3 === 1) {
          return null; // not-found
        }
        return makeTask(id.toUpperCase());
      },
    };

    const resolved = await resolveTaskDetails(instrumented, ids);

    expect(resolved.size).toBe(total);
    for (const id of ids) {
      const i = Number(id.split("-")[1]);
      const entry = resolved.get(id);
      expect(entry?.ok).toBe(i % 3 === 2);
    }
  });
});

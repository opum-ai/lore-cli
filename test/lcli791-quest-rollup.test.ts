/**
 * LCLI-791 (DEC-282 item 1): `lore check` and `lore sync` read the task rollup with ONE
 * `quest task list --json` per run, cached by the `.quest` tree hash, instead of one
 * `quest task view <id> --json` per linked task.
 *
 * The quest binary is a counting fake, so every assertion is about SPAWNS (the cost that made
 * four concurrent checks a load of 128) and never about wall time.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQuestAdapter, type QuestSpawn, type QuestSpawnResult, questListCacheKey } from "../src/adapters/quest";
import { gatherReconciliation, resolveRollupDetails, resolveTaskDetails } from "../src/commands/reconcile-shared";
import type { LoreError } from "../src/errors";
import { VERSION } from "../src/meta";
import { concept } from "./helpers";

function ok(kind: string, data: unknown): QuestSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, kind, data }), stderr: "" };
}
const MANIFEST = {
  commands: [
    ["manifest", "manifest.registry", false],
    ["version", null, false],
    ["init", "workspace.initialized", true],
    ["migration backlog preview", "migration.backlog-preview", false],
    ["migration backlog apply", "migration.backlog-applied", true],
    ["migration backlog status", "migration.backlog-status", false],
    ["migration backlog rollback", "migration.backlog-rolled-back", true],
    ["task status-flow", "task.status-flow", false],
    ["task list", "task.list", false],
    ["task view", "task.view", false],
    ["search", "task.search", false],
    ["task create", "task.created", true],
    ["task edit", "task.updated", true],
  ].map(([name, kind, mutates]) => ({ name, schemaVersion: 1, kind, mutates })),
};
const FLOW = { statuses: ["To Do", "In Progress", "Done"], terminalStatuses: ["Done"] };

interface Counts {
  list: number;
  view: number;
  total: number;
}

interface FakeOptions {
  /** Rows `task list` returns only when `--include-archived` is passed; `task view` always resolves them. */
  archived?: boolean;
  /** An UNLINKED record whose title is empty, which `rollupRow` rejects. */
  malformed?: boolean;
  /** Runs inside the list call, after the tree was hashed: a quest write landing mid-read. */
  onList?: () => void;
  /** `alias`: an archived record shares T-2's alias; `id`: a completed record carries T-1's id as an alias. */
  collide?: "alias" | "id";
  /** T-3's `aliases` is not an array of strings, which the per-task path rejects as drift. */
  badAliases?: boolean;
  /** Replace the generated T-1..T-n rows with EXACTLY these records (the list path uses no view). */
  records?: readonly Record<string, unknown>[];
  /** Make the list itself fail. */
  failList?: "exit" | "text" | "object";
}

const row = (i: number) => ({
  id: `T-${i}`,
  title: `Task ${i}`,
  status: i % 2 === 0 ? "Done" : "To Do",
  path: `.quest/tasks/T-${i}.json`,
  aliases: i === 2 ? ["OLD-2.1"] : [],
});
const ARCHIVED = {
  id: "A-1",
  title: "Archived task",
  status: "Done",
  path: ".quest/archive/tasks/A-1.json",
  aliases: ["OLD-A"],
};

/** A quest fake holding `n` tasks T-1..T-n. */
function fakeQuest(n: number, counts: Counts, options: FakeOptions = {}): QuestSpawn {
  return async (args) => {
    counts.total++;
    const cmd = args.join(" ");
    if (args[0] === "--version") return { exitCode: 0, stdout: `${VERSION}\n`, stderr: "" };
    if (cmd === "manifest --json") return ok("manifest.registry", MANIFEST);
    if (cmd === "task status-flow --json") return ok("task.status-flow", FLOW);
    if (args[0] === "task" && args[1] === "list") {
      counts.list++;
      options.onList?.();
      if (options.failList === "exit") return { exitCode: 1, stdout: "", stderr: "quest exploded" };
      if (options.failList === "text") return { exitCode: 0, stdout: "not json", stderr: "" };
      if (options.failList === "object") return ok("task.list", { not: "an array" });
      if (options.records !== undefined) return ok("task.list", options.records);
      const rows: Record<string, unknown>[] = Array.from({ length: n }, (_, k) => row(k + 1));
      if (options.badAliases) rows[2] = { ...rows[2], aliases: 5 };
      if (options.collide === "alias")
        rows.push({
          id: "Z-9",
          title: "Z",
          status: "Done",
          path: ".quest/archive/tasks/Z-9.json",
          aliases: ["OLD-2.1"],
        });
      if (options.collide === "id")
        rows.push({ id: "Z-8", title: "Z", status: "Done", path: ".quest/completed/Z-8.json", aliases: ["T-1"] });
      if (options.malformed) rows.push({ id: "BAD-1", title: "", status: "To Do", path: ".quest/tasks/BAD-1.json" });
      if (options.archived && args.includes("--include-archived")) rows.push(ARCHIVED);
      return ok("task.list", rows);
    }
    if (args[0] === "task" && args[1] === "view") {
      counts.view++;
      const id = String(args[2]);
      if (options.archived && (id === "A-1" || id === "OLD-A")) return ok("task.view", { ...ARCHIVED, file: null });
      const match = /^T-(\d+)$/.exec(id);
      if (match === null || Number(match[1]) > n)
        return {
          exitCode: 3,
          stdout: "",
          stderr: JSON.stringify({ error_type: "not_found", message: `task ${id} not found`, principal: null }),
        };
      return ok("task.view", { ...row(Number(match[1])), file: null });
    }
    throw new Error(`unexpected quest call: ${cmd}`);
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-791-"));
  mkdirSync(join(root, ".quest", "tasks"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function adapterFor(n: number, counts: Counts, options: FakeOptions = {}) {
  return createQuestAdapter(root, { spawn: fakeQuest(n, counts, options), workspaceInitialized: () => true });
}
const ids = (n: number) => Array.from({ length: n }, (_, k) => `T-${k + 1}`);

describe("the rollup read is one task list, not a view per task", () => {
  test("control: the per-task path costs one view per task", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    await resolveTaskDetails(adapterFor(30, counts), ids(30));
    expect(counts.view).toBe(30);
  });

  test("spawn count is constant in the number of tasks, with zero views", async () => {
    const totals: number[] = [];
    for (const n of [3, 30, 300]) {
      rmSync(join(root, ".lore"), { recursive: true, force: true }); // each size starts with a cold cache
      const counts: Counts = { list: 0, view: 0, total: 0 };
      const resolved = await resolveRollupDetails(adapterFor(n, counts), ids(n));
      expect(counts.view).toBe(0);
      expect(counts.list).toBe(1);
      expect(resolved.size).toBe(n);
      totals.push(counts.total);
    }
    expect(new Set(totals).size).toBe(1);
  });

  test("gatherReconciliation (the sync and check path) builds the same rows from the list", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const doc = concept("stories/x.md", { tasks: ["T-1", "T-2"], status: "todo" });
    const [target] = await gatherReconciliation(root, [doc], adapterFor(5, counts));
    expect(target?.rows).toEqual([
      { id: "T-1", title: "Task 1", status: "To Do", file: ".quest/tasks/T-1.json" },
      { id: "T-2", title: "Task 2", status: "Done", file: ".quest/tasks/T-2.json" },
    ]);
    expect(counts.view).toBe(0);
    expect(counts.list).toBe(1);
  });

  test("a linked ALIAS resolves to its canonical task, as the per-task view does (the docs gate hit this)", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(3, counts), ["OLD-2.1"]);
    const hit = resolved.get("old-2.1");
    expect(hit?.ok).toBe(true);
    expect((hit as { detail: { id: string } }).detail.id).toBe("T-2");
    expect(counts.view).toBe(0);
  });

  test("a linked id absent from the list raises exactly the error the per-task path raises", async () => {
    const viewCounts: Counts = { list: 0, view: 0, total: 0 };
    const viaView = await resolveTaskDetails(adapterFor(2, viewCounts), ["T-9"]);
    const listCounts: Counts = { list: 0, view: 0, total: 0 };
    const viaList = await resolveRollupDetails(adapterFor(2, listCounts), ["T-1", "T-9"]);
    expect(viaList.get("t-1")?.ok).toBe(true);
    const fromView = viaView.get("t-9") as { ok: false; error: LoreError };
    const fromList = viaList.get("t-9") as { ok: false; error: LoreError };
    expect(fromList.ok).toBe(false);
    expect(fromList.error.type).toBe("not_found");
    expect({ type: fromList.error.type, message: fromList.error.message, hint: fromList.error.hint }).toEqual({
      type: fromView.error.type,
      message: fromView.error.message,
      hint: fromView.error.hint,
    });
    expect(fromList.error.input).toEqual(fromView.error.input);
  });

  test("a malformed id raises the same validation error the per-task path raises, not a not_found", async () => {
    const viaView = await resolveTaskDetails(adapterFor(2, { list: 0, view: 0, total: 0 }), ["-x"]);
    const viaList = await resolveRollupDetails(adapterFor(2, { list: 0, view: 0, total: 0 }), ["-x"]);
    const fromView = viaView.get("-x") as { ok: false; error: LoreError };
    const fromList = viaList.get("-x") as { ok: false; error: LoreError };
    expect(fromView.error.type).toBe("validation");
    expect(fromList.error.type).toBe("validation");
    expect(fromList.error.message).toBe(fromView.error.message);
  });

  test("a linked ARCHIVED task resolves by id and by alias, as the per-task view does (the list needs --include-archived)", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(2, counts, { archived: true }), ["A-1", "OLD-A"]);
    for (const id of ["a-1", "old-a"]) {
      const hit = resolved.get(id);
      expect(hit?.ok).toBe(true);
      expect((hit as { detail: { id: string; file: string | null } }).detail).toMatchObject({
        id: "A-1",
        file: ".quest/archive/tasks/A-1.json",
      });
    }
    expect(counts.view).toBe(0);
  });

  test("one malformed UNLINKED record does not fail the rollup of the linked ones", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(3, counts, { malformed: true }), ["T-1", "T-3"]);
    expect(resolved.get("t-1")?.ok).toBe(true);
    expect(resolved.get("t-3")?.ok).toBe(true);
  });

  test("a linked MALFORMED record fails only its own id", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(3, counts, { malformed: true }), ["T-1", "BAD-1"]);
    expect(resolved.get("t-1")?.ok).toBe(true);
    expect(resolved.get("bad-1")?.ok).toBe(false);
  });
});

describe("the rollup index keeps the per-task path's loud failures (review F1, F2)", () => {
  test("a linked record with malformed aliases raises drift, as the per-task path does", async () => {
    const resolved = await resolveRollupDetails(adapterFor(4, { list: 0, view: 0, total: 0 }, { badAliases: true }), [
      "T-1",
      "T-3",
    ]);
    expect(resolved.get("t-1")?.ok).toBe(true);
    const bad = resolved.get("t-3") as { ok: false; error: LoreError };
    expect(bad.ok).toBe(false);
    expect(bad.error.type).toBe("drift");
  });

  for (const collide of ["alias", "id"] as const) {
    test(`a reference matching more than one record (${collide} collision, across tasks/, completed/ and archive/) is ambiguous, not resolved`, async () => {
      const resolved = await resolveRollupDetails(
        adapterFor(3, { list: 0, view: 0, total: 0 }, { collide }),
        collide === "alias" ? ["OLD-2.1", "T-3"] : ["T-1", "T-3"],
      );
      const ambiguous = resolved.get(collide === "alias" ? "old-2.1" : "t-1") as { ok: false; error: LoreError };
      expect(ambiguous.ok).toBe(false);
      expect(ambiguous.error.type).toBe("conflict");
      expect(ambiguous.error.message).toContain("task_reference_ambiguous");
      expect(resolved.get("t-3")?.ok).toBe(true); // an unrelated linked id is unaffected
    });
  }
});

describe("the cache key names both versions (review F4)", () => {
  const base = { loreVersion: "1.0.0", questVersion: "1.0.0", treeDigest: "abc" };
  test("a changed lore version, quest version or tree is a different key; the same inputs are the same key", () => {
    const key = questListCacheKey(base);
    expect(questListCacheKey({ ...base })).toBe(key);
    expect(questListCacheKey({ ...base, loreVersion: "1.0.1" })).not.toBe(key);
    expect(questListCacheKey({ ...base, questVersion: "1.0.1" })).not.toBe(key);
    expect(questListCacheKey({ ...base, treeDigest: "abd" })).not.toBe(key);
  });
});

describe("a failing list is never read as clean", () => {
  for (const failList of ["exit", "text", "object"] as const) {
    test(`a list that fails as "${failList}" is an error for every requested id`, async () => {
      const resolved = await resolveRollupDetails(adapterFor(3, { list: 0, view: 0, total: 0 }, { failList }), [
        "T-1",
        "T-2",
      ]);
      expect(resolved.size).toBe(2);
      for (const resolution of resolved.values()) {
        expect(resolution.ok).toBe(false);
        // Swallowing the list error into an empty index would answer not_found for every id.
        expect((resolution as { error: LoreError }).error.type).not.toBe("not_found");
      }
    });
  }
});

describe("the list is cached by the .quest tree hash", () => {
  function writeTask(name: string, body: string, dir = "tasks") {
    mkdirSync(join(root, ".quest", dir), { recursive: true });
    writeFileSync(join(root, ".quest", dir, `${name}.json`), body);
  }
  /** Run once cold, then once with a FRESH adapter after `change`, returning the second run's list calls. */
  async function listCallsAfter(change: () => void): Promise<number> {
    writeTask("T-1", '{"id":"T-1"}');
    writeTask("T-2", '{"id":"T-2"}');
    await resolveRollupDetails(adapterFor(2, { list: 0, view: 0, total: 0 }), ids(2));
    change();
    const second: Counts = { list: 0, view: 0, total: 0 };
    await resolveRollupDetails(adapterFor(2, second), ids(2));
    return second.list;
  }

  test("a second run over an unchanged tree reads nothing new and returns the same resolutions", async () => {
    writeTask("T-1", '{"id":"T-1"}');
    writeTask("T-2", '{"id":"T-2"}');
    const first: Counts = { list: 0, view: 0, total: 0 };
    const a = await resolveRollupDetails(adapterFor(2, first), ids(2));
    expect(first.list).toBe(1);
    const second: Counts = { list: 0, view: 0, total: 0 };
    const b = await resolveRollupDetails(adapterFor(2, second), ids(2)); // a fresh adapter: a second RUN
    expect(second.list).toBe(0);
    expect(second.view).toBe(0);
    expect([...b.entries()]).toEqual([...a.entries()]);
  });

  test("an edit invalidates", async () => {
    expect(await listCallsAfter(() => writeTask("T-2", '{"id":"T-2","status":"Done"}'))).toBe(1);
  });
  test("an added record invalidates", async () => {
    expect(await listCallsAfter(() => writeTask("T-3", '{"id":"T-3"}'))).toBe(1);
  });
  test("a record moved from tasks/ to completed/ invalidates", async () => {
    expect(
      await listCallsAfter(() => {
        rmSync(join(root, ".quest", "tasks", "T-2.json"));
        writeTask("T-2", '{"id":"T-2"}', "completed");
      }),
    ).toBe(1);
  });
  test("a removed record invalidates", async () => {
    expect(await listCallsAfter(() => rmSync(join(root, ".quest", "tasks", "T-2.json")))).toBe(1);
  });

  test("an unreadable or corrupt cache file is a miss, never an error", async () => {
    writeTask("T-1", '{"id":"T-1"}');
    const warm: Counts = { list: 0, view: 0, total: 0 };
    await resolveRollupDetails(adapterFor(1, warm), ["T-1"]);
    const cacheDir = join(root, ".lore", "cache", "quest");
    for (const f of new Bun.Glob("*").scanSync(cacheDir)) writeFileSync(join(cacheDir, f), "{not json");
    const again: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(1, again), ["T-1"]);
    expect(again.list).toBe(1);
    expect(resolved.get("t-1")?.ok).toBe(true);
  });

  // B2: a quest write that lands AFTER the tree was hashed but BEFORE the list returns must not leave
  // post-write rows under the pre-write key. The write is then undone (a git restore of .quest), so
  // the tree is byte-for-byte what the key names, and a stale slot would be served as current.
  test("a write landing during the list is never cached under the pre-write key", async () => {
    writeTask("T-1", '{"id":"T-1"}');
    const raceFile = join(root, ".quest", "tasks", "RACE.json");
    const racing: Counts = { list: 0, view: 0, total: 0 };
    await resolveRollupDetails(adapterFor(1, racing, { onList: () => writeFileSync(raceFile, '{"id":"RACE"}') }), [
      "T-1",
    ]);
    rmSync(raceFile); // .quest is back to the tree the first run keyed on
    const after: Counts = { list: 0, view: 0, total: 0 };
    await resolveRollupDetails(adapterFor(1, after), ["T-1"]);
    expect(after.list).toBe(1);
  });
});

describe("the CALL SITE uses the full cache key, not a bare or constant-keyed digest (review F1)", () => {
  // treeKey hashes every FILE under .quest (path + bytes). `beforeEach` leaves .quest with only the
  // empty tasks/ DIRECTORY, so no file contributes and the tree digest is sha256(""). The expected
  // key is therefore computable WITHOUT calling the implementation's own treeKey.
  const emptyTreeDigest = () => createHash("sha256").digest("hex");
  const fullKey = () =>
    questListCacheKey({ loreVersion: VERSION, questVersion: VERSION, treeDigest: emptyTreeDigest() });
  const cacheFile = () => join(root, ".lore", "cache", "quest", "task-list.json");
  const cachedItems = (n: number) =>
    ids(n).map((id, k) => ({
      id,
      title: `Task ${k + 1}`,
      status: "To Do",
      file: `.quest/tasks/${id}.json`,
      aliases: [],
    }));

  // A HIT here is the witness that the READ side keys on lore + quest + the tree digest: BOTH mutants
  // (treeKey returning the bare tree digest, and treeKey passing constant versions) key on something
  // else, so this seeded entry is a MISS for them and the list runs (counts.list === 1).
  test("a cache entry keyed by the full key is served with NO list read", async () => {
    mkdirSync(join(root, ".lore", "cache", "quest"), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify({ key: fullKey(), items: cachedItems(2) }));
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(2, counts), ["T-1"]);
    expect(resolved.get("t-1")?.ok).toBe(true);
    expect(counts.list).toBe(0);
  });

  // The WRITE side, same witness: the entry the call site persists must be keyed by the full key.
  test("a cold read WRITES the entry under the full key", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    await resolveRollupDetails(adapterFor(2, counts), ids(2));
    const written = JSON.parse(readFileSync(cacheFile(), "utf8")) as { key: string };
    expect(written.key).toBe(fullKey());
    expect(written.key).not.toBe(emptyTreeDigest()); // a bare-digest key is NOT the full key
  });
});

describe("the reference key folds exactly as Quest's findTask does (review F2, F5, F7)", () => {
  const task = (id: string, aliases: unknown): Record<string, unknown> => ({
    id,
    title: `Task ${id}`,
    status: "To Do",
    path: `.quest/tasks/${id}.json`,
    aliases,
  });

  test("F2: a record whose alias repeats its own id is ONE match, as findTask counts it", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(1, counts, { records: [task("T-1", ["T-1"])] }), ["T-1"]);
    const hit = resolved.get("t-1");
    expect(hit?.ok).toBe(true);
    expect((hit as { detail: { id: string } }).detail.id).toBe("T-1");
    expect(counts.view).toBe(0);
  });

  test("F5: ASCII references still fold case-insensitively (behaviour unchanged)", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(1, counts, { records: [task("T-1", ["Mixed-Case"])] }), [
      "mixed-case",
    ]);
    expect(resolved.get("mixed-case")?.ok).toBe(true);
  });

  test("F5: a reference and an alias differing only by NFC/NFD form match", async () => {
    const nfc = "café"; // e + U+0301 composed
    const nfd = "café"; // e + combining acute, decomposed
    expect(nfc).not.toBe(nfd);
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(1, counts, { records: [task("T-1", [nfc])] }), [nfd]);
    const hit = resolved.get(nfd.toLowerCase());
    expect(hit?.ok).toBe(true);
    expect((hit as { detail: { id: string } }).detail.id).toBe("T-1");
  });

  test("F5: 'STRASSE' matches 'straße' exactly as Quest's fold does (ß folds to ss)", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(adapterFor(1, counts, { records: [task("T-1", ["straße"])] }), [
      "STRASSE",
    ]);
    const hit = resolved.get("strasse");
    expect(hit?.ok).toBe(true);
    expect((hit as { detail: { id: string } }).detail.id).toBe("T-1");
  });

  test("F5: Greek final sigma folds to sigma exactly as Quest's fold does (ς -> σ)", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    // The alias ends in FINAL sigma (ς); the reference ends in ordinary sigma (σ). Quest's fold
    // maps BOTH to σ; a plain `.toLowerCase()` leaves ς alone and the two differ.
    const resolved = await resolveRollupDetails(adapterFor(1, counts, { records: [task("T-1", ["λόγος"])] }), [
      "λόγοσ",
    ]);
    const hit = resolved.get("λόγοσ".toLowerCase());
    expect(hit?.ok).toBe(true);
    expect((hit as { detail: { id: string } }).detail.id).toBe("T-1");
  });

  test("F5: two ids that are fold-equal (ß/ss) are ambiguous, as findTask refuses them", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(
      adapterFor(2, counts, { records: [task("straße", []), task("STRASSE", [])] }),
      ["strasse"],
    );
    const ambiguous = resolved.get("strasse") as { ok: false; error: LoreError };
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.error.type).toBe("conflict");
    expect(ambiguous.error.message).toContain("task_reference_ambiguous");
  });

  test("F7: a record whose aliases is not a list of strings turns an unindexed alias lookup into drift, not not_found", async () => {
    const counts: Counts = { list: 0, view: 0, total: 0 };
    const resolved = await resolveRollupDetails(
      adapterFor(2, counts, { records: [task("T-1", []), task("T-3", "OLD")] }),
      ["T-1", "OLD"],
    );
    expect(resolved.get("t-1")?.ok).toBe(true);
    const bad = resolved.get("old") as { ok: false; error: LoreError };
    expect(bad.ok).toBe(false);
    expect(bad.error.type).toBe("drift");
    expect(bad.error.message).toContain("T-3"); // names the offending record
    expect(counts.view).toBe(0); // DEC-282 item 1: the list path never spawns a per-task view
  });
});

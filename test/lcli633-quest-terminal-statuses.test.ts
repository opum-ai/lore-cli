/**
 * lcli633-quest-terminal-statuses.test.ts — quest-cli QCLI-331's second terminal status.
 *
 * Quest gains `closedStatus` ("Closed") as a second terminal status beside the `Done` already in
 * `terminalStatuses`, for tasks closed as duplicate/superseded/wont-do (shape B: `closedStatus`
 * reported, `terminalStatuses` stays `["Done"]`; QCLI-406's later shape A moves "Closed" into
 * `terminalStatuses`). Lore must stop treating "Done" as the only terminal status — by the time a
 * completion decision is made, the flow's positional last-entry terminality had silently assumed it.
 *
 * Three layers are pinned here, matching the fix's shape:
 * - the Quest ADAPTER accepts both shapes and classifies `closedStatus` as terminal, detecting it by
 *   key presence (never a version comparison), and a genuinely foreign terminal status is drift whose
 *   message names a lore/quest version MISMATCH rather than "Quest 0.2.7 or newer is required";
 * - the reconcile ENGINE classifies against the explicit terminal set, which is authoritative over
 *   positional terminality, while backends without a set keep the positional contract unchanged;
 * - END TO END, `lore check` reads the set through the adapter (via `reconcile-shared.ts`) and
 *   treats a task in Closed as complete while a task in a non-terminal status is not.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQuestAdapter, type QuestSpawn, type QuestSpawnResult } from "../src/adapters/quest";
import { type ResolveHost, runCheck } from "../src/commands/check";
import { gatherReconciliation, readReconcileConfig } from "../src/commands/reconcile-shared";
import { type ManagedTaskRow, regenerateTaskBlock } from "../src/core/managed-block";
import { QUEST_STATUS_FLOW_HINTS, reconcileStatus } from "../src/core/reconcile";
import { EXIT_CODES, EXIT_OK, type LoreError } from "../src/errors";
import { VERSION } from "../src/meta";
import type { OutputContext } from "../src/output";
import { capture, concept, fakeAdapter, makeTask, storyDoc } from "./helpers";

// ── Quest adapter: closedStatus tolerance ─────────────────────────────────────

function ok(kind: string, data: unknown): QuestSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, kind, data }), stderr: "" };
}
function manifest(): Record<string, unknown> {
  return {
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
}
/** An adapter whose fake Quest reports the given `task status-flow --json` data and passes every probe call otherwise. */
function adapterFor(flowData: Record<string, unknown>): ReturnType<typeof createQuestAdapter> {
  const spawn: QuestSpawn = async (readonlyArgs) => {
    const args = [...readonlyArgs];
    if (args[0] === "--version") return { exitCode: 0, stdout: `${VERSION}\n`, stderr: "" };
    if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
    if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flowData);
    throw new Error(`unexpected Quest call: ${args.join(" ")}`);
  };
  return createQuestAdapter("/repo", { spawn, workspaceInitialized: () => true });
}
/** Await `probe()`, returning its rejection or throwing if it resolved. */
async function probeRejection(adapter: ReturnType<typeof createQuestAdapter>): Promise<LoreError> {
  try {
    await adapter.probe();
  } catch (error) {
    return error as LoreError;
  }
  throw new Error("probe() resolved; expected a rejection");
}

describe("quest adapter: second terminal status (LCLI-633)", () => {
  test("shape B (closedStatus present, terminalStatuses [Done]): probe passes and Closed is terminal", async () => {
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done"],
      terminalStatuses: ["Done"],
      closedStatus: "Closed",
    });
    await expect(adapter.probe()).resolves.toMatchObject({ version: VERSION });
    // statusFlow keeps returning the ladder; the terminal set rides its own adapter method.
    expect(await adapter.statusFlow()).toEqual(["To Do", "In Progress", "Done"]);
    expect(await adapter.terminalStatuses?.()).toEqual(["Done", "Closed"]);
  });

  test("shape A (terminalStatuses [Done, Closed], closedStatus retained, Closed outside the ladder): both terminal", async () => {
    // QCLI-406's step A moves Closed into terminalStatuses while the closedStatus marker stays:
    // terminalStatuses is then a subset of statuses PLUS closedStatus, which is exactly the
    // tolerance this criterion pins. Closed remains outside the ladder (it carries the resolution).
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done"],
      terminalStatuses: ["Done", "Closed"],
      closedStatus: "Closed",
    });
    await expect(adapter.probe()).resolves.toMatchObject({ version: VERSION });
    expect(await adapter.terminalStatuses?.()).toEqual(["Done", "Closed"]);
  });

  test("shape A with Closed also in the ladder: both terminal, no closedStatus needed", async () => {
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done", "Closed"],
      terminalStatuses: ["Done", "Closed"],
    });
    await expect(adapter.probe()).resolves.toMatchObject({ version: VERSION });
    expect(await adapter.terminalStatuses?.()).toEqual(["Done", "Closed"]);
  });

  test("Closed in the ladder, the marker, and terminalStatuses dedupes rather than reporting twice", async () => {
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done", "Closed"],
      terminalStatuses: ["Done", "Closed"],
      closedStatus: "Closed",
    });
    await expect(adapter.probe()).resolves.toMatchObject({ version: VERSION });
    expect(await adapter.terminalStatuses?.()).toEqual(["Done", "Closed"]);
  });

  test("a Quest predating closedStatus (key absent) falls back to terminalStatuses alone", async () => {
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done"],
      terminalStatuses: ["Done"],
    });
    expect(await adapter.terminalStatuses?.()).toEqual(["Done"]);
  });

  test("a genuinely foreign terminal status is drift naming a lore/quest version mismatch", async () => {
    // "Closed" is terminal but appears in NEITHER statuses NOR a closedStatus field: a Quest
    // reporting a status-flow shape this lore adapter is not qualified against.
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done"],
      terminalStatuses: ["Done", "Closed"],
    });
    const error = await probeRejection(adapter);
    expect(error.type).toBe("drift");
    expect(error.message).toMatch(/mismatch/);
    // The old hint told the operator to install a NEWER Quest — the opposite of the fix.
    expect(error.message).not.toMatch(/0\.2\.7 or newer is required/);
    expect(error.hint).not.toMatch(/newer is required/);
  });

  test("a present-but-malformed closedStatus is drift naming a version mismatch, not a hint to upgrade Quest", async () => {
    const adapter = adapterFor({
      statuses: ["To Do", "In Progress", "Done"],
      terminalStatuses: ["Done"],
      closedStatus: null,
    });
    const error = await probeRejection(adapter);
    expect(error.type).toBe("drift");
    expect(error.message).toMatch(/mismatch/);
    expect(error.hint).not.toMatch(/newer is required/);
  });
});

// ── Reconcile engine: explicit terminal set ───────────────────────────────────

const FLOW = ["To Do", "In Progress", "Done"];
const TERMINALS = ["Done", "Closed"];

describe("reconcileStatus with an explicit terminal set (LCLI-633)", () => {
  test("a task in Closed (outside the flow) is complete when the backend reports it", () => {
    expect(reconcileStatus(["Closed"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, TERMINALS)).toBe("done");
  });

  test("the terminal set is authoritative: the flow's last entry outside the set is not terminal", () => {
    // "Done" is positionally last, but a backend declaring only ["Closed"] terminal says otherwise.
    expect(reconcileStatus(["Done"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, ["Closed"])).toBe("in-progress");
  });

  test("non-terminal statuses roll up exactly as before", () => {
    expect(reconcileStatus(["In Progress"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, TERMINALS)).toBe(
      "in-progress",
    );
    expect(reconcileStatus(["To Do"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, TERMINALS)).toBe("todo");
    // Elimination order survives the terminal set: no active task, not all terminal -> todo.
    expect(reconcileStatus(["Done", "To Do"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, TERMINALS)).toBe("todo");
  });

  test("backends without an explicit terminal set keep positional last-entry terminality", () => {
    expect(reconcileStatus(["Done"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS)).toBe("done");
  });

  test("an empty terminal set is rejected loudly instead of silently never rolling done", () => {
    expect(() => reconcileStatus(["Done"], FLOW, {}, undefined, QUEST_STATUS_FLOW_HINTS, [])).toThrow(
      /empty terminal status set/,
    );
  });
});

// ── reconcile-shared: threading the terminal set into both commands ───────────

describe("reconcile-shared threading (LCLI-633)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-lcli633-shared-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("readReconcileConfig carries the adapter's terminalStatuses", async () => {
    const adapter = {
      ...fakeAdapter([]),
      statusFlow: async () => ["To Do", "In Progress", "Done"],
      terminalStatuses: async () => ["Done", "Closed"],
    };
    const config = await readReconcileConfig(root, adapter);
    expect(config.terminalStatuses).toEqual(["Done", "Closed"]);
  });

  test("an adapter with no terminalStatuses method (Backlog, Jira) resolves without one", async () => {
    const adapter = { ...fakeAdapter([]) };
    expect(adapter.terminalStatuses).toBeUndefined();
    const config = await readReconcileConfig(root, adapter);
    expect(config.terminalStatuses).toBeUndefined();
  });

  test("gatherReconciliation rolls a Closed task up to done through the threaded terminal set", async () => {
    const doc = concept("stories/x.md", { tasks: ["lore-1"], status: "todo" });
    const adapter = {
      ...fakeAdapter([makeTask("LORE-1", { status: "Closed" })]),
      terminalStatuses: async () => ["Done", "Closed"],
    };
    const [target] = await gatherReconciliation(root, [doc], adapter);
    expect(target?.newTaskStatus).toBe("done");
    expect(target?.rows).toEqual([
      { id: "LORE-1", title: "Title for LORE-1", status: "Closed", file: "backlog/tasks/lore-1 - title.md" },
    ]);
  });
});

// ── lore check end to end ─────────────────────────────────────────────────────

describe("lore check with a quest second terminal status (LCLI-633)", () => {
  let root: string;
  const JSON_CTX: OutputContext = { mode: "json", color: false };
  const ALLOW_ALL_HOSTS: ResolveHost = async () => ["93.184.216.34"];
  const closedRow: ManagedTaskRow = {
    id: "LORE-1",
    title: "Title for LORE-1",
    status: "Closed",
    file: "backlog/tasks/lore-1 - title.md",
  };
  const inProgressRow: ManagedTaskRow = { ...closedRow, status: "In Progress" };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-lcli633-check-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeDoc(rel: string, contents: string): void {
    const abs = join(root, "docs", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }

  function opts(adapter: ReturnType<typeof fakeAdapter> & { terminalStatuses(): Promise<readonly string[]> }) {
    return {
      root,
      output: JSON_CTX,
      args: [],
      adapter,
      stdout: capture(),
      stderr: capture(),
      resolveHost: ALLOW_ALL_HOSTS,
    };
  }

  test("a task in Closed is complete: status done passes with no findings (exit 0)", async () => {
    writeDoc(
      "stories/x.md",
      regenerateTaskBlock(storyDoc("X", ["lore-1"], "done"), [closedRow], { docPath: "docs/stories/x.md" }),
    );
    const adapter = {
      ...fakeAdapter([makeTask("LORE-1", { status: "Closed" })]),
      terminalStatuses: async () => ["Done", "Closed"],
    };
    expect(await runCheck(opts(adapter))).toBe(EXIT_OK);
  });

  test("a task in a non-terminal status is not complete: status-drift (exit 6)", async () => {
    writeDoc(
      "stories/x.md",
      regenerateTaskBlock(storyDoc("X", ["lore-1"], "done"), [inProgressRow], { docPath: "docs/stories/x.md" }),
    );
    const adapter = {
      ...fakeAdapter([makeTask("LORE-1", { status: "In Progress" })]),
      terminalStatuses: async () => ["Done", "Closed"],
    };
    const o = opts(adapter);
    expect(await runCheck(o)).toBe(EXIT_CODES.validation);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    const drift = parsed.data.findings.find((finding: { rule: string }) => finding.rule === "status-drift");
    expect(drift.message).toContain("in-progress");
  });
});

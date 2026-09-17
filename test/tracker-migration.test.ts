import { describe, expect, test } from "bun:test";
import type { QuestBacklogMigration, QuestMigrationPreview, QuestMigrationReceipt } from "../src/adapters/quest";
import { LoreError } from "../src/errors";
import {
  classifyMigrationCollision,
  hasPendingQuestMigration,
  migrateBacklogTasksToQuest,
  type PendingMigrationStore,
} from "../src/tracker-migration";

const preview: QuestMigrationPreview = {
  sourceFingerprint: "sha256:source",
  digest: "sha256:reviewed",
  requiresApproval: true,
  mappings: [{ sourceIdentifier: "LCLI-1", sourceFolder: "tasks", targetIdentifier: "T-1", aliases: ["LCLI-1"] }],
};
const receipt: QuestMigrationReceipt = {
  schemaVersion: 1,
  kind: "migration.backlog.receipt",
  ...preview,
  survivors: [],
  taskFingerprints: { "T-1": "sha256:task" },
  state: "applied",
};

function migration(overrides: Partial<QuestBacklogMigration> = {}): QuestBacklogMigration {
  return {
    preview: async () => preview,
    apply: async () => receipt,
    status: async () => receipt,
    rollback: async () => ({ ...receipt, state: "rolled-back" }),
    ...overrides,
  };
}

function memoryStore(): PendingMigrationStore {
  let pending: QuestMigrationPreview | undefined;
  return {
    read: () => pending,
    write: (_root, value) => {
      pending = value;
    },
    clear: () => {
      pending = undefined;
    },
  };
}

describe("migrateBacklogTasksToQuest", () => {
  test("uses Quest preview then applies exactly its reviewed digest and consumes its receipt", async () => {
    const calls: string[][] = [];
    const result = await migrateBacklogTasksToQuest(
      migration({
        preview: async (source) => {
          calls.push(["preview", source]);
          return preview;
        },
        apply: async (source, digest) => {
          calls.push(["apply", source, digest]);
          return receipt;
        },
      }),
      "/source",
      memoryStore(),
    );
    expect(calls).toEqual([
      ["preview", "/source"],
      ["apply", "/source", "sha256:reviewed"],
    ]);
    expect(result).toEqual({
      digest: "sha256:reviewed",
      sourceFingerprint: "sha256:source",
      mappings: preview.mappings,
      survivors: [],
      excluded: [],
      taskFingerprints: { "T-1": "sha256:task" },
      state: "applied",
    });
  });

  /**
   * LCLI-521. `excluded` is preview-only (Quest's own contract — a default-mode preview never sets
   * it), so this is what a preservation-mode result carries through. Verified against a real
   * two-family repro (backlog 1.50.1, quest 0.7.1) before this test was written — see the task's
   * implementation notes for the exact commands.
   */
  test("threads a preservation-mode preview's excluded records into the result (LCLI-521)", async () => {
    const excludingPreview: QuestMigrationPreview = {
      ...preview,
      excluded: [
        { sourceIdentifier: "LORE-1", family: "LORE" },
        { sourceIdentifier: "LORE-2", family: "LORE" },
      ],
    };
    const result = await migrateBacklogTasksToQuest(
      migration({
        preview: async () => excludingPreview,
        apply: async () => receipt,
      }),
      "/source",
      memoryStore(),
      { preserveSourceIds: true, sourceFamily: "LCLI" },
    );
    expect(result.excluded).toEqual([
      { sourceIdentifier: "LORE-1", family: "LORE" },
      { sourceIdentifier: "LORE-2", family: "LORE" },
    ]);
  });

  test("a resumed migration's excluded records come back from the recorded pending preview, not re-fetched", async () => {
    const excludingPreview: QuestMigrationPreview = {
      ...preview,
      excluded: [{ sourceIdentifier: "LORE-1", family: "LORE" }],
    };
    const store = memoryStore();
    store.write("/source", excludingPreview);
    let previewCalls = 0;
    const result = await migrateBacklogTasksToQuest(
      migration({
        preview: async () => {
          previewCalls += 1;
          throw new Error("must not re-preview on resume");
        },
        status: async () => receipt,
      }),
      "/source",
      store,
    );
    expect(previewCalls).toBe(0);
    expect(result.excluded).toEqual([{ sourceIdentifier: "LORE-1", family: "LORE" }]);
  });

  test("threads preserveSourceIds/sourceFamily to both preview and apply (LCLI-465)", async () => {
    const calls: unknown[] = [];
    await migrateBacklogTasksToQuest(
      migration({
        preview: async (source, options) => {
          calls.push({ call: "preview", source, options });
          return preview;
        },
        apply: async (source, digest, options) => {
          calls.push({ call: "apply", source, digest, options });
          return receipt;
        },
      }),
      "/source",
      memoryStore(),
      { preserveSourceIds: true, sourceFamily: "LCLI" },
    );
    expect(calls).toEqual([
      { call: "preview", source: "/source", options: { preserveSourceIds: true, sourceFamily: "LCLI" } },
      {
        call: "apply",
        source: "/source",
        digest: "sha256:reviewed",
        options: { preserveSourceIds: true, sourceFamily: "LCLI" },
      },
    ]);
  });

  test("omitted migration options thread as undefined, unchanged from before this option existed", async () => {
    const calls: unknown[] = [];
    await migrateBacklogTasksToQuest(
      migration({
        preview: async (_source, options) => {
          calls.push({ call: "preview", options });
          return preview;
        },
        apply: async (_source, _digest, options) => {
          calls.push({ call: "apply", options });
          return receipt;
        },
      }),
      "/source",
      memoryStore(),
    );
    expect(calls).toEqual([
      { call: "preview", options: undefined },
      { call: "apply", options: undefined },
    ]);
  });

  test("a resumed run re-supplies the current invocation's migration options to apply, not anything persisted from the crashed run", async () => {
    // Mirrors Quest's own contract: options are a request parameter, not part of the persisted
    // preview response, so a resumed `lore init` supplies them fresh from its own CLI flags.
    const store = memoryStore();
    store.write("/source", preview); // simulates a crash after preview, before apply
    const calls: unknown[] = [];
    await migrateBacklogTasksToQuest(
      migration({
        status: async () => {
          throw new LoreError("not_found", "no receipt yet");
        },
        apply: async (_source, digest, options) => {
          calls.push({ digest, options });
          return receipt;
        },
      }),
      "/source",
      store,
      { preserveSourceIds: true, sourceFamily: "LCLI" },
    );
    expect(calls).toEqual([{ digest: "sha256:reviewed", options: { preserveSourceIds: true, sourceFamily: "LCLI" } }]);
  });

  test("never treats a non-applied or mismatched receipt as permission to switch backends", async () => {
    const result = await migrateBacklogTasksToQuest(
      migration({ apply: async () => ({ ...receipt, state: "failed" }) }),
      "/source",
      memoryStore(),
    ).catch((error) => error);
    expect(result).toBeInstanceOf(LoreError);
    expect((result as LoreError).type).toBe("conflict");
    const stale = await migrateBacklogTasksToQuest(
      migration({ apply: async () => ({ ...receipt, digest: "sha256:other" }) }),
      "/source",
      memoryStore(),
    ).catch((error) => error);
    expect(stale).toBeInstanceOf(LoreError);
    expect((stale as LoreError).type).toBe("drift");
  });

  test("records the preview before apply and resumes through status after an interruption", async () => {
    const events: string[] = [];
    let pending: QuestMigrationPreview | undefined;
    const store: PendingMigrationStore = {
      read: () => pending,
      write: (_root, value) => {
        events.push("write");
        pending = value;
      },
      clear: () => {
        pending = undefined;
      },
    };
    await expect(
      migrateBacklogTasksToQuest(
        migration({ apply: async () => Promise.reject(new Error("simulated crash")) }),
        "/source",
        store,
      ),
    ).rejects.toThrow("simulated crash");
    expect(events).toEqual(["write"]);
    const resumed = await migrateBacklogTasksToQuest(
      migration({
        preview: async () => {
          throw new Error("must resume by digest, never allocate a new preview");
        },
        status: async (digest) => {
          expect(digest).toBe("sha256:reviewed");
          return receipt;
        },
      }),
      "/source",
      store,
    );
    expect(resumed).toMatchObject({ digest: "sha256:reviewed", state: "applied" });
  });

  test("reapplies the stored digest when interruption happened before Quest created a receipt", async () => {
    const store = memoryStore();
    store.write("/source", preview);
    const calls: string[][] = [];
    const resumed = await migrateBacklogTasksToQuest(
      migration({
        status: async (digest) => {
          calls.push(["status", digest]);
          throw new LoreError("not_found", "migration receipt not found");
        },
        apply: async (source, digest) => {
          calls.push(["apply", source, digest]);
          return receipt;
        },
      }),
      "/source",
      store,
    );
    expect(calls).toEqual([
      ["status", "sha256:reviewed"],
      ["apply", "/source", "sha256:reviewed"],
    ]);
    expect(resumed).toMatchObject({ digest: "sha256:reviewed", state: "applied" });
  });
});

/**
 * The two refusal messages below are copied VERBATIM from quest 0.7.1 on this machine, produced by
 * two real repros built with the real `backlog` and `quest` binaries (LCLI-466): a dotted subtask
 * whose positional renumbering shifted a later allocation, and a destination workspace already
 * holding TASK-1/TASK-2 before the migration ran. Both came back `conflict` (exit 5).
 */
const ALIAS_COLLISION =
  'Alias collision: "TASK-2" conflicts with "TASK-2". If this is from positional renumbering ' +
  "(for example a dotted subtask flattening and shifting a later allocation), --preserve-source-ids " +
  "--source-family <PREFIX> avoids it by keeping each record's own source id instead. If instead " +
  "this exact id is already a live, unrelated claim in the destination workspace, " +
  "--preserve-source-ids will not resolve it -- rename or remove the conflicting record in the " +
  "destination, or rename the id in the source, before retrying.";
const PRESERVATION_REFUSED =
  "Backlog id preservation refused: 2 id collision(s). See the itemized report for detail. No " +
  "further flag resolves a remaining id collision here: rename or remove the conflicting record in " +
  "the destination workspace, or rename the id in the source, then retry.";

describe("classifyMigrationCollision (LCLI-466)", () => {
  test("Quest's default-mode refusal is classified as an alias collision, not as a cause", () => {
    const collision = classifyMigrationCollision(new LoreError("conflict", ALIAS_COLLISION));
    expect(collision?.kind).toBe("alias-collision");
    // The classification carries Quest's message and a family SUGGESTION — and deliberately no
    // claim about which of the two causes the message names, because the message names both.
    expect(collision).toEqual({
      kind: "alias-collision",
      message: ALIAS_COLLISION,
      sourceFamilyHint: "TASK",
    });
  });

  test("the same message is returned for BOTH real collision causes, so the cause is not readable from it", () => {
    // The second repro's message, differing from the first only in the id it quotes: a destination
    // workspace already holding TASK-1. Nothing in either sentence says which case occurred.
    const dualClaim = ALIAS_COLLISION.replaceAll("TASK-2", "TASK-1");
    expect(classifyMigrationCollision(new LoreError("conflict", dualClaim))?.kind).toBe("alias-collision");
  });

  test("preservation-mode refusal is classified distinctly, by its message", () => {
    const collision = classifyMigrationCollision(new LoreError("conflict", PRESERVATION_REFUSED));
    expect(collision?.kind).toBe("preservation-refused");
  });

  test("preservation-mode refusal is classified from its structured report even without the prose", () => {
    const input = { collisions: [{ candidate: "TASK-1", conflictsWith: "TASK-1" }], unpreservable: [] };
    const collision = classifyMigrationCollision(new LoreError("conflict", "id collisions", undefined, input));
    expect(collision).toEqual({ kind: "preservation-refused", message: "id collisions", input });
  });

  test("an unpreservable-only report (no id collision) is still a refusal no flag resolves", () => {
    const input = { collisions: [], unpreservable: [{ sourceIdentifier: "TASK-9.1", reason: "parent_unresolvable" }] };
    expect(classifyMigrationCollision(new LoreError("conflict", "refused", undefined, input))?.kind).toBe(
      "preservation-refused",
    );
  });

  test("a family suggestion is omitted rather than guessed when the message quotes no id", () => {
    const collision = classifyMigrationCollision(new LoreError("conflict", "Alias collision: two records clash"));
    expect(collision).toEqual({ kind: "alias-collision", message: "Alias collision: two records clash" });
  });

  test("anything that is not one of Quest's id-collision refusals is not classified", () => {
    expect(classifyMigrationCollision(new LoreError("conflict", "migration digest does not match"))).toBeUndefined();
    // Type matters as much as wording: a non-conflict failure is never a collision to retry.
    expect(classifyMigrationCollision(new LoreError("validation", ALIAS_COLLISION))).toBeUndefined();
    expect(classifyMigrationCollision(new Error(ALIAS_COLLISION))).toBeUndefined();
    expect(classifyMigrationCollision(undefined)).toBeUndefined();
  });
});

describe("hasPendingQuestMigration (LCLI-466)", () => {
  test("reports whether a reviewed digest has already been recorded for the root", () => {
    const store = memoryStore();
    expect(hasPendingQuestMigration("/source", store)).toBe(false);
    store.write("/source", preview);
    expect(hasPendingQuestMigration("/source", store)).toBe(true);
  });
});

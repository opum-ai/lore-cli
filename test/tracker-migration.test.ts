import { describe, expect, test } from "bun:test";
import type { QuestBacklogMigration, QuestMigrationPreview, QuestMigrationReceipt } from "../src/adapters/quest";
import { LoreError } from "../src/errors";
import { migrateBacklogTasksToQuest, type PendingMigrationStore } from "../src/tracker-migration";

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
      taskFingerprints: { "T-1": "sha256:task" },
      state: "applied",
    });
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

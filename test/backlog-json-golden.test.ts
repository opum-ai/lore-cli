/**
 * backlog-json-golden.test.ts — LORE-13 AC#2: a golden JSON-contract test that runs against the
 * fork's real `--json` output and locks it to the schema of record
 * ([backlog-json-schema.md](../docs/reference/backlog-json-schema.md)).
 *
 * The fixtures under `test/fixtures/backlog-json/` are **real** envelopes captured from the forked,
 * `--json`-capable Backlog.md (`jeremy-newhouse/Backlog.md@tasks/back-510-json-output`) by
 * `test/support/record-backlog-goldens.ts`, with the host-specific absolute `filePath` redacted to
 * `{REPO}`. This suite never spawns the fork (CI has no fork binary); it consumes the committed
 * goldens and asserts two things:
 *
 * - **Contract lock** — each golden validates against the {@link EnvelopeSchema} Zod mirror of §1–§5,
 *   and the load-bearing §2/§6 caveats hold on the real bytes (camelCase `kind`, string
 *   `schemaVersion`, `rawContent`/`lastModified` omitted, list fields are arrays, `filePathRelative`
 *   is repo-relative while the absolute `filePath` was the only host-specific field).
 * - **Idempotency** — each golden is already in canonical form: re-canonicalizing it is byte-identical
 *   (AC#2 "re-generate == byte-identical"), so a hand-edit that skips the recorder fails the suite.
 *
 * Together these guarantee that if either the fork's serializer or the documented contract drifts, a
 * regenerated golden fails validation here — the coupling can never silently read the wrong shape.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type EnvelopeKind,
  EnvelopeSchema,
  REPO_PLACEHOLDER,
  recanonicalize,
  SearchHitSchema,
  TaskSchema,
  TaskSummarySchema,
} from "./support/backlog-golden";

/** Where the committed golden envelopes live. */
const FIXTURES = join(import.meta.dir, "fixtures", "backlog-json");

/** The three golden files, one per envelope `kind`. */
const GOLDEN_FILES: Record<EnvelopeKind, string> = {
  task: "task.json",
  taskList: "task-list.json",
  searchResult: "search-result.json",
};

/** The `(kind, file)` pairs, with `kind` kept as its literal {@link EnvelopeKind} type. */
const GOLDEN_ENTRIES = Object.entries(GOLDEN_FILES) as Array<[EnvelopeKind, string]>;

/** Read a golden file's raw bytes. */
function readGolden(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

/** Parse a golden file to its envelope object. */
function parseGolden(name: string): Record<string, unknown> {
  return JSON.parse(readGolden(name)) as Record<string, unknown>;
}

// ── Idempotency: goldens are canonical (AC#2 "re-generate == byte-identical") ────────

describe("golden idempotency — committed goldens are in canonical form", () => {
  for (const [kind, file] of GOLDEN_ENTRIES) {
    test(`${kind}: re-canonicalizing ${file} is byte-identical`, () => {
      const text = readGolden(file);
      // The recorder writes canonicalize(...) exactly; parsing and re-canonicalizing must round-trip
      // to the same bytes. A hand-edit (reindent, trailing whitespace, reordered keys) breaks this.
      expect(recanonicalize(text)).toBe(text);
    });

    test(`${file} ends with exactly one trailing newline`, () => {
      const text = readGolden(file);
      expect(text.endsWith("}\n")).toBe(true);
      expect(text.endsWith("}\n\n")).toBe(false);
    });
  }
});

// ── Contract lock: every golden validates against the schema of record ───────────────

describe("golden contract — each envelope matches the §1–§5 schema mirror", () => {
  for (const [kind, file] of GOLDEN_ENTRIES) {
    test(`${file} validates against EnvelopeSchema and carries kind "${kind}"`, () => {
      const parsed = EnvelopeSchema.safeParse(parseGolden(file));
      if (!parsed.success) {
        throw new Error(`${file} violates the contract: ${JSON.stringify(parsed.error.issues, null, 2)}`);
      }
      expect(parsed.data.kind).toBe(kind);
      // §1: schemaVersion is the STRING "1", never a number.
      expect(parsed.data.schemaVersion).toBe("1");
    });
  }
});

// ── §2/§6 field-convention caveats on the real bytes ─────────────────────────────────

describe("golden `task` — the full task shape (§3)", () => {
  const data = parseGolden(GOLDEN_FILES.task).data as Record<string, unknown>;

  test("validates against the standalone TaskSchema", () => {
    expect(TaskSchema.safeParse(data).success).toBe(true);
  });

  test("carries every required §3.2 field", () => {
    // The documented required keys — a missing one is a contract regression, not a tolerated absence.
    const required = [
      "id",
      "title",
      "status",
      "priority",
      "ordinal",
      "filePath",
      "filePathRelative",
      "assignees",
      "reporter",
      "createdDate",
      "updatedDate",
      "labels",
      "milestone",
      "dependencies",
      "references",
      "documentation",
      "modifiedFiles",
      "parentTaskId",
      "acceptanceCriteria",
      "definitionOfDone",
      "description",
      "implementationPlan",
      "implementationNotes",
      "finalSummary",
      "comments",
      "source",
      "branch",
      "onStatusChange",
    ];
    for (const key of required) {
      expect(data).toHaveProperty(key);
    }
  });

  test("§6: rawContent is omitted (opt-in only) and lastModified is omitted/normalized", () => {
    expect("rawContent" in data).toBe(false);
    expect("lastModified" in data).toBe(false);
  });

  test("§2: list fields are always arrays, never null", () => {
    for (const key of [
      "assignees",
      "labels",
      "dependencies",
      "references",
      "documentation",
      "modifiedFiles",
      "acceptanceCriteria",
      "definitionOfDone",
      "comments",
      "subtasks",
    ]) {
      expect(Array.isArray(data[key])).toBe(true);
    }
  });

  test("§6: filePath was the only host-specific field (redacted); filePathRelative is repo-relative", () => {
    // The recorder redacts the absolute filePath to {REPO}; filePathRelative is portable as-is.
    expect(data.filePath as string).toStartWith(REPO_PLACEHOLDER);
    const rel = data.filePathRelative as string;
    expect(rel.startsWith("/")).toBe(false);
    expect(rel.startsWith(REPO_PLACEHOLDER)).toBe(false);
    expect(rel).toStartWith("backlog/");
  });

  test("nullable scalars round-trip as JSON null (finalSummary/source/branch on this specimen)", () => {
    // The LORE-33 specimen leaves these unset; the contract models them as null, not absent.
    expect(data.finalSummary).toBeNull();
    expect(data.source).toBeNull();
    expect(data.branch).toBeNull();
  });

  test("acceptanceCriteria items carry {index, text, checked}; index is positional (§6 non-durable)", () => {
    const acs = data.acceptanceCriteria as Array<Record<string, unknown>>;
    expect(acs.length).toBeGreaterThan(0);
    for (const ac of acs) {
      expect(ac).toMatchObject({ index: expect.any(Number), text: expect.any(String), checked: expect.any(Boolean) });
    }
  });
});

describe("golden `taskList` — the summary subset (§4)", () => {
  const data = parseGolden(GOLDEN_FILES.taskList).data as Array<Record<string, unknown>>;

  test("is a non-empty array of valid summaries", () => {
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) {
      expect(TaskSummarySchema.safeParse(entry).success).toBe(true);
    }
  });

  test("omits the heavy body fields a full task carries (§4)", () => {
    for (const entry of data) {
      for (const heavy of ["acceptanceCriteria", "description", "comments", "implementationPlan"]) {
        expect(heavy in entry).toBe(false);
      }
    }
  });
});

describe("golden `searchResult` — scored hits (§5)", () => {
  const data = parseGolden(GOLDEN_FILES.searchResult).data as Array<Record<string, unknown>>;

  test("is a non-empty array of {type, score, item} hits", () => {
    expect(data.length).toBeGreaterThan(0);
    for (const hit of data) {
      expect(SearchHitSchema.safeParse(hit).success).toBe(true);
      expect(["task", "document", "decision"]).toContain(hit.type as string);
      // score is a number or null (Fuse.js relevance; lower is closer).
      expect(hit.score === null || typeof hit.score === "number").toBe(true);
    }
  });

  test("task hits carry a summary-shaped item (§5)", () => {
    for (const hit of data) {
      if (hit.type === "task") {
        expect(TaskSummarySchema.safeParse(hit.item).success).toBe(true);
      }
    }
  });
});

// ── The mirror itself discriminates: guarding the doc-slip and additive tolerance ────

describe("EnvelopeSchema discrimination — locks the exact contract", () => {
  test('rejects the CLI-contract doc-slip kind "task-list" (schema of record is camelCase "taskList")', () => {
    expect(EnvelopeSchema.safeParse({ schemaVersion: "1", kind: "task-list", data: [] }).success).toBe(false);
  });

  test('rejects a numeric schemaVersion (it is the string "1", §1)', () => {
    expect(EnvelopeSchema.safeParse({ schemaVersion: 1, kind: "taskList", data: [] }).success).toBe(false);
  });

  test("rejects an unrecognized schemaVersion bump (fail-loud, never mis-read)", () => {
    expect(EnvelopeSchema.safeParse({ schemaVersion: "2", kind: "taskList", data: [] }).success).toBe(false);
  });

  test("§2: tolerates unknown additive keys on the envelope and payload", () => {
    const withExtras = { schemaVersion: "1", kind: "taskList", data: [], generatedAt: "whenever" };
    expect(EnvelopeSchema.safeParse(withExtras).success).toBe(true);
  });

  test("rejects a taskList summary missing a required key (id)", () => {
    const missingId = {
      title: "x",
      status: "To Do",
      priority: null,
      ordinal: null,
      assignees: [],
      labels: [],
      milestone: null,
      parentTaskId: null,
      filePath: null,
      filePathRelative: null,
    };
    expect(EnvelopeSchema.safeParse({ schemaVersion: "1", kind: "taskList", data: [missingId] }).success).toBe(false);
  });
});

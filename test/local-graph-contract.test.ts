import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const adr = readFileSync(join(root, "docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md"), "utf8");
const roadmap = readFileSync(join(root, "docs/specs/local-graph-platform-roadmap.md"), "utf8");
const handover = readFileSync(join(root, "docs/runbooks/lore-cli-handover.md"), "utf8");
const adrText = adr.replace(/\s+/g, " ");
const roadmapText = roadmap.replace(/\s+/g, " ");
const handoverText = handover.replace(/\s+/g, " ");

describe("frozen local graph contract", () => {
  test("pins the lossless export-to-property-graph schema", () => {
    for (const term of [
      "ladybug-projection/1",
      "RepositoryProjection",
      "ProjectionSnapshot",
      "SourceCommit",
      "ConceptRecord",
      "TaskRecord",
      "AuthoredEdgeRecord",
      "LexicalTerm",
      "sourceRecordJson",
      "EDGE_CONCEPT_TARGET",
      "EDGE_TASK_TARGET",
      "HAS_TERM",
    ]) {
      expect(adr).toContain(term);
    }
    expect(adrText).toContain("An authored edge is never collapsed into a direct database relationship");
    expect(adrText).toContain("No task-parent, backlink, semantic, similarity, or inferred edge is added by M6");
  });

  test("pins deterministic state classification and immutable publication", () => {
    for (const state of ["`locked`", "`unsupported`", "`corrupt`", "`rebuildable`", "`reusable`"]) {
      expect(adr).toContain(state);
    }
    expect(adrText).toContain("M6 migrations are rebuild-only");
    expect(adrText).toContain("Atomically rename the complete staging directory");
    expect(adrText).toContain("there is no mutable `CURRENT` pointer");
    expect(adrText).toContain("never trusts mtimes");
  });

  test("keeps repository sources and excluded retrieval surfaces outside the lifecycle", () => {
    expect(adrText).toContain("write no source file");
    expect(roadmapText).toContain("read-only with respect to repository sources");
    for (const excluded of ["embedding", "vector index", "raw Cypher", "hidden", "AuraDB", "local MCP"]) {
      expect(roadmapText).toContain(excluded);
    }
  });

  test("keeps the current handover context-free and grounded in live evidence", () => {
    for (const heading of ["## Purpose", "## Fresh-session route", "## Authority boundaries", "## Recovery"]) {
      expect(handover).toContain(heading);
    }
    expect(handoverText).toContain("Start a Lore CLI session from live owner evidence");
    expect(handoverText).toContain("This handover grants none of them");
    expect(handover).not.toContain("## Queue");
    expect(handover).not.toContain("## Paste-ready continuation prompt");
  });
});

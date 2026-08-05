import { describe, expect, test } from "bun:test";
import { compileProfile, defaultProfile, parseProfile } from "../src/core/profile";
import { isKnownType, validateFrontmatter } from "../src/core/schema";
import { EXIT_CODES, LoreError, WarningCollector } from "../src/errors";

/** Assert `fn` throws a `validation` {@link LoreError}, returning it for further assertions. */
function expectValidation(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("validation");
    return err as LoreError;
  }
  throw new Error("expected validateFrontmatter to throw a validation LoreError, but it returned");
}

describe("schema — the default (story-convention) profile", () => {
  test("the built-in profile includes the additive OKF 0.2 computation type", () => {
    expect([...defaultProfile().types.keys()]).toEqual([
      "Epic",
      "Story",
      "Spec",
      "ADR",
      "Runbook",
      "Reference",
      "Attested Computation",
    ]);
  });

  test("isKnownType narrows known vs unknown types against the default profile", () => {
    expect(isKnownType("Story")).toBe(true);
    expect(isKnownType("Glossary")).toBe(false);
  });

  test("each known type carries a generated validator", () => {
    for (const type of defaultProfile().types.values()) {
      expect(type.schema).toBeDefined();
    }
    expect(defaultProfile().types.get("Glossary")).toBeUndefined();
  });

  test("the canonical key order covers every declared field across all types (drift guard)", () => {
    // A field a type declares but the canonical order omits would serialize into the unknown-key
    // tail in arbitrary order. Pin that the canonical order is a superset of every declared field.
    const profile = defaultProfile();
    const ordered = new Set<string>(profile.canonicalKeyOrder);
    for (const type of profile.types.values()) {
      for (const field of type.declaredFields) {
        expect(ordered.has(field)).toBe(true);
      }
    }
  });
});

describe("schema — the error tier (throws, exit 6)", () => {
  test("validation maps to exit 6", () => {
    expect(EXIT_CODES.validation).toBe(6);
  });

  test("a missing `type` is the OKF 0.2 §11 / 0.1 §9 floor error", () => {
    const err = expectValidation(() => validateFrontmatter({ title: "no type" }));
    expect(err.message).toContain("missing a `type`");
  });

  test("the error envelope's input.path is the clean path, not the ` in <path>` display string", () => {
    const err = expectValidation(() => validateFrontmatter({ title: "no type" }, { path: "stories/foo.md" }));
    // Regression: input.path must be the real path an agent can open, not "in stories/foo.md".
    expect(err.input).toEqual({ path: "stories/foo.md" });
    expect(err.message).toContain("in stories/foo.md"); // ...while the human message still reads naturally
  });

  test("an empty or whitespace-only `type` is rejected", () => {
    for (const type of ["", "   "]) {
      expectValidation(() => validateFrontmatter({ type }));
    }
  });

  test("a present-but-non-string `type` is rejected as invalid, not reported as missing", () => {
    // A YAML `type: 2026` resolves to a number; the diagnostic must say "invalid"
    // (and hint to quote it), not "missing" — the field is present.
    const err = expectValidation(() => validateFrontmatter({ type: 2026 }));
    expect(err.message).toContain("invalid `type`");
    expect(err.message).not.toContain("missing");
  });

  test("a known type with a mistyped field throws, naming the field", () => {
    const err = expectValidation(() => validateFrontmatter({ type: "Story", tags: "orders" }));
    expect(err.message).toContain("Story");
    expect(err.message).toContain("tags");
    // The structured `input` echoes the offending field so a consumer needn't re-derive it.
    expect(err.input).toMatchObject({ type: "Story", issues: [{ path: "tags" }] });
  });

  test("a known type with a non-ISO timestamp throws (dates are strict ISO datetimes)", () => {
    const err = expectValidation(() => validateFrontmatter({ type: "ADR", timestamp: "last tuesday" }));
    expect(err.message).toContain("timestamp");
  });

  test("a date-only timestamp is rejected — lore emits full datetimes", () => {
    expectValidation(() => validateFrontmatter({ type: "ADR", timestamp: "2026-06-21" }));
  });

  test("Attested Computation requires runtime under OKF 0.2", () => {
    const err = expectValidation(() =>
      validateFrontmatter(
        { type: "Attested Computation", summary: "A sanctioned computation." },
        { path: "docs/attested-computation/revenue.md" },
      ),
    );
    expect(err.message).toContain("Attested Computation contract");
    expect(err.message).toContain("runtime");
    expect(err.input).toMatchObject({ path: "docs/attested-computation/revenue.md", key: "runtime" });
  });

  test("Attested Computation validates the complete section-10 contract", () => {
    expect(() =>
      validateFrontmatter({
        type: "Attested Computation",
        summary: "A sanctioned computation.",
        runtime: "bigquery",
        parameters: [{ name: "year", type: "integer", required: true }],
        computation: "references/revenue.sql",
        executor: { resource: "references/run.md", receipt: ["job_id", "executed_sql"] },
        attester: { resource: "references/attest.py" },
      }),
    ).not.toThrow();
  });

  test("Attested Computation rejects malformed nested fields", () => {
    const err = expectValidation(() =>
      validateFrontmatter({
        type: "Attested Computation",
        runtime: "bigquery",
        parameters: [{ name: "year", type: "integer", required: "yes" }],
        executor: { receipt: ["job_id"] },
        attester: { resource: "" },
      }),
    );
    expect(err.message).toContain("parameters.0.required");
    expect(err.message).toContain("executor.resource");
    expect(err.message).toContain("attester.resource");
  });

  test("OKF 0.1 tolerates Attested Computation as an unknown type without promoting its fields", () => {
    const warnings = new WarningCollector();
    expect(() =>
      validateFrontmatter(
        { type: "Attested Computation", parameters: "preserved legacy extension" },
        {
          warnings,
          path: "docs/computations/legacy.md",
          bundleState: { okfVersion: "0.1", source: "declared" },
        },
      ),
    ).not.toThrow();
    expect(warnings.list()).toEqual([
      'unknown type "Attested Computation" in docs/computations/legacy.md; validated on `type` only',
    ]);
  });

  test("malformed OKF 0.2 sources fail with the offending path and key", () => {
    const err = expectValidation(() =>
      validateFrontmatter(
        {
          type: "Reference",
          sources: [{ title: "Missing resource", usage_count: -1, last_modified: "yesterday" }],
        },
        { path: "docs/reference/orders.md", bundleState: { okfVersion: "0.2", source: "declared" } },
      ),
    );
    expect(err.message).toContain("invalid sources provenance in docs/reference/orders.md");
    expect(err.message).toContain("0.resource");
    expect(err.input).toMatchObject({ path: "docs/reference/orders.md", key: "sources" });
  });

  test("a malformed shared usage_window fails as sources metadata", () => {
    const err = expectValidation(() =>
      validateFrontmatter(
        { type: "Reference", sources: [], usage_window: { from: "2026-01-01", to: "soon" } },
        { path: "docs/reference/orders.md" },
      ),
    );
    expect(err.message).toContain("usage_window");
    expect(err.input).toMatchObject({ path: "docs/reference/orders.md", key: "usage_window" });
  });

  test("OKF 0.2 keeps lifecycle and task-progress vocabularies disjoint", () => {
    const lifecycle = expectValidation(() =>
      validateFrontmatter(
        { type: "Story", status: "done" },
        { path: "docs/stories/x.md", bundleState: { okfVersion: "0.2", source: "declared" } },
      ),
    );
    expect(lifecycle.message).toContain("lifecycle status");
    expect(lifecycle.hint).toContain("lore_task_status");

    const rollup = expectValidation(() =>
      validateFrontmatter(
        { type: "Story", lore_task_status: "stable" },
        { path: "docs/stories/x.md", bundleState: { okfVersion: "0.2", source: "declared" } },
      ),
    );
    expect(rollup.message).toContain("task rollup");
    expect(rollup.hint).toContain("status");
  });

  test("OKF 0.2 rejects malformed actors in every actor-valued family", () => {
    const cases = [
      { generated: { by: "team:data", at: "2026-06-21T00:00:00Z" } },
      { sources: [{ resource: "https://example.com", author: "team:data" }] },
      { verified: { by: "alice", at: "2026-06-21T00:00:00Z" } },
    ];
    for (const fields of cases) {
      const err = expectValidation(() =>
        validateFrontmatter(
          { type: "Reference", ...fields },
          { path: "docs/reference/x.md", bundleState: { okfVersion: "0.2", source: "declared" } },
        ),
      );
      expect(err.message).toContain("must use producer/version, human:<id>, or process:<id>");
    }
  });

  test("OKF 0.2 rejects malformed verification timestamps and stale_after dates", () => {
    const verified = expectValidation(() =>
      validateFrontmatter(
        { type: "Reference", verified: { by: "human:alice", at: "yesterday" } },
        { path: "docs/reference/x.md", bundleState: { okfVersion: "0.2", source: "declared" } },
      ),
    );
    expect(verified.message).toContain("verification evidence");

    const stale = expectValidation(() =>
      validateFrontmatter(
        { type: "Reference", stale_after: "soon" },
        { path: "docs/reference/x.md", bundleState: { okfVersion: "0.2", source: "declared" } },
      ),
    );
    expect(stale.message).toContain("stale_after");
  });
});

describe("schema — the warning tier (never throws)", () => {
  test("an empty (null) known field is tolerated, not a hard error", () => {
    // YAML `status:` / `tags:` with no value parse to null; an empty recommended field
    // is OKF-tolerated and must NOT be promoted to a fatal validation error (exit 6).
    expect(() =>
      validateFrontmatter(
        { type: "Story", title: null, tags: null, status: null, timestamp: null },
        { bundleState: { okfVersion: "0.1", source: "declared" } },
      ),
    ).not.toThrow();
  });

  test("a whitespace-padded known type classifies on its trimmed value and fails loudly (not silent-unknown)", () => {
    // `type: " Story "` must not be silently demoted to an unvalidated unknown type:
    // it classifies as Story and then fails the literal check, surfacing the error.
    const err = expectValidation(() => validateFrontmatter({ type: " Story " }));
    expect(err.message).toContain("Story");
  });

  test("a differently-cased known type classifies on its canonical value, not as unknown (LORE-167)", () => {
    // `type: story` must resolve to Story's real schema (case-insensitive classification),
    // not fall into the unknown-type branch and skip validation entirely.
    const warnings = new WarningCollector();
    const err = expectValidation(() => validateFrontmatter({ type: "story", tags: "orders" }, { warnings }));
    // It classified as Story (not "unknown type") and ran Story's schema, surfacing the
    // real field mismatch (`tags` must be a list) rather than silently letting it through.
    expect(err.message).toContain("Story");
    expect(err.message).toContain("tags");
    expect(warnings.list().some((w) => w.includes("unknown type"))).toBe(false);
  });

  test("validateFrontmatter returns the resolved, trimmed type", () => {
    expect(validateFrontmatter({ type: "Reference", summary: "s" })).toBe("Reference");
    expect(validateFrontmatter({ type: " Glossary " })).toBe("Glossary");
  });

  test("a fully-valid known concept produces no warnings", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      {
        type: "Story",
        title: "T",
        summary: "One line.",
        generated: { by: "lore/0.1.1", at: "2026-06-21T00:00:00Z" },
        tasks: ["LORE-1"],
      },
      { warnings },
    );
    expect(warnings.isEmpty).toBe(true);
  });

  test("OKF 0.2 recognizes the complete sources credibility family", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      {
        type: "Reference",
        summary: "Source-backed reference.",
        sources: [
          {
            id: "orders",
            resource: "../reference/orders.md",
            title: "Orders",
            author: "process:data-platform",
            usage_count: 5000,
            last_modified: "2026-05-30",
            usage_window: { from: "2026-05-01", to: "2026-05-31" },
          },
        ],
        usage_window: { from: "2026-06-01", to: "2026-06-30" },
      },
      { warnings, path: "docs/reference/source-backed.md" },
    );
    expect(warnings.isEmpty).toBe(true);
  });

  test("OKF 0.2 recognizes lifecycle, task progress, and single-or-list verification events", () => {
    for (const verified of [
      { by: "human:alice", at: "2026-06-21T00:00:00Z" },
      [
        { by: "lore/0.1.1", at: "2026-06-21T00:00:00Z" },
        { by: "process:nightly", at: "2026-06-22T00:00:00Z" },
      ],
    ]) {
      const warnings = new WarningCollector();
      validateFrontmatter(
        {
          type: "Reference",
          summary: "Lifecycle-aware reference.",
          status: "stable",
          lore_task_status: "in-progress",
          stale_after: "2026-12-31",
          verified,
        },
        {
          warnings,
          path: "docs/reference/lifecycle.md",
          bundleState: { okfVersion: "0.2", source: "declared" },
        },
      );
      expect(warnings.isEmpty).toBe(true);
    }
  });

  test("every OKF 0.2 field family has an explicit tier under a minimal custom profile", () => {
    const profile = compileProfile(
      parseProfile(
        Bun.TOML.parse(`
[profile]
name = "minimal-0.2"
okf_version = "0.2"

[base.fields]
type = { required = true }
summary = {}

[[types]]
name = "Reference"

[[types]]
name = "Attested Computation"
`) as Record<string, unknown>,
        "inline-minimal-0.2",
      ),
    );
    const sharedWarnings = new WarningCollector();
    validateFrontmatter(
      {
        type: "Reference",
        summary: "All shared OKF 0.2 families.",
        generated: { by: "lore/0.1.1", at: "2026-06-21T00:00:00Z" },
        sources: [
          {
            id: "orders",
            resource: "../reference/orders.md",
            title: "Orders",
            author: "process:data-platform",
            usage_count: 1,
            last_modified: "2026-06-20",
            usage_window: { from: "2026-06-01", to: "2026-06-30" },
          },
        ],
        usage_window: { from: "2026-06-01", to: "2026-06-30" },
        verified: { by: "human:alice", at: "2026-06-21T00:00:00Z" },
        status: "stable",
        stale_after: "2026-12-31",
        lore_task_status: "in-progress",
      },
      { profile, warnings: sharedWarnings, path: "docs/reference/audit.md" },
    );
    expect(sharedWarnings.list().filter((warning) => warning.includes("unknown key"))).toEqual([]);

    const computationWarnings = new WarningCollector();
    validateFrontmatter(
      {
        type: "Attested Computation",
        summary: "All computation fields.",
        runtime: "bigquery",
        parameters: [{ name: "year", type: "integer", required: true }],
        computation: "../references/revenue.sql",
        executor: { resource: "../references/run.md", receipt: ["job_id"] },
        attester: { resource: "../references/attest.py" },
      },
      { profile, warnings: computationWarnings, path: "docs/attested-computation/audit.md" },
    );
    expect(computationWarnings.list().filter((warning) => warning.includes("unknown key"))).toEqual([]);
  });

  test("OKF 0.1 leaves sources untouched as an unknown extension instead of applying 0.2 validation", () => {
    const warnings = new WarningCollector();
    expect(() =>
      validateFrontmatter(
        { type: "Reference", summary: "Legacy.", sources: "legacy producer value" },
        {
          warnings,
          path: "docs/reference/legacy.md",
          bundleState: { okfVersion: "0.1", source: "declared" },
        },
      ),
    ).not.toThrow();
    expect(warnings.list().some((warning) => warning.includes('unknown key "sources"'))).toBe(true);
  });

  test("OKF 0.1 preserves legacy status behavior and does not validate 0.2 trust/lifecycle extensions", () => {
    const warnings = new WarningCollector();
    expect(() =>
      validateFrontmatter(
        {
          type: "Story",
          status: "done",
          lore_task_status: { producer: "legacy" },
          stale_after: "whenever",
          verified: "legacy producer shape",
        },
        {
          warnings,
          path: "docs/stories/legacy.md",
          bundleState: { okfVersion: "0.1", source: "declared" },
        },
      ),
    ).not.toThrow();
    expect(warnings.list()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown key "lore_task_status"'),
        expect.stringContaining('unknown key "stale_after"'),
        expect.stringContaining('unknown key "verified"'),
      ]),
    );
  });

  test("an unknown type warns and validates on `type` only (never throws)", () => {
    const warnings = new WarningCollector();
    // Arbitrary extra keys on an unknown type must NOT throw (OKF tolerance, AC#2).
    expect(() =>
      validateFrontmatter({ type: "Glossary", anything: { nested: true }, count: 3 }, { warnings }),
    ).not.toThrow();
    expect(warnings.list().some((w) => w.includes('unknown type "Glossary"'))).toBe(true);
  });

  test("an extra key on a known type warns but does not throw", () => {
    const warnings = new WarningCollector();
    expect(() =>
      validateFrontmatter({ type: "Reference", title: "T", custom_key: "kept" }, { warnings }),
    ).not.toThrow();
    expect(warnings.list().some((w) => w.includes('unknown key "custom_key"'))).toBe(true);
  });

  test("okf_version is exempt on the root index (repo-relative `docs/index.md` path form, LORE-168 AC#2)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/index.md" },
    );
    expect(warnings.list().some((w) => w.includes("okf_version"))).toBe(false);
  });

  test("okf_version is exempt on the root index (bundle-root-relative `index.md` path form, LORE-168 AC#2)", () => {
    // `loadBundle`-backed commands (sync/query/graph/...) reach validateFrontmatter with the root
    // index's path as bare "index.md" (no `docs/` prefix) — both spellings must recognize the root.
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "index.md" },
    );
    expect(warnings.list().some((w) => w.includes("okf_version"))).toBe(false);
  });

  test("okf_version on a non-root concept surfaces the extra-key conformance warning (LORE-168 AC#1)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/reference/r.md" },
    );
    expect(
      warnings.list().some((w) => w.includes('unknown key "okf_version"') && w.includes("docs/reference/r.md")),
    ).toBe(true);
  });

  test("okf_version on a sub-index (e.g. docs/adr/index.md) also surfaces the warning, not just an ordinary concept (LORE-168 AC#1)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/adr/index.md" },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "okf_version"'))).toBe(true);
  });

  test("okf_version is flagged when no path is given (cannot be proven root, so no longer unconditionally exempt)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "okf_version"'))).toBe(true);
  });

  test("`resource` is OKF-reserved on an ordinary concept (the stamped canonical link)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", resource: "https://x.dev/docs/reference/r.md" },
      { warnings, path: "docs/reference/r.md" },
    );
    expect(warnings.list().some((w) => w.includes("resource"))).toBe(false);
  });

  test("`resource` is NOT reserved on an index file — a hand-authored one is warned (it carries none)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", resource: "https://x.dev/docs/index.md" },
      { warnings, path: "docs/index.md" },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "resource"'))).toBe(true);
  });

  test("a missing summary warns", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", title: "T" }, { warnings });
    expect(warnings.list().some((w) => w.includes("missing `summary`"))).toBe(true);
  });

  test("a cleared (null) summary also warns — .nullish() must not let it pass silently", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: null }, { warnings });
    expect(warnings.list().some((w) => w.includes("missing `summary`"))).toBe(true);
  });

  test("an over-long summary warns with its length", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "x".repeat(250) }, { warnings });
    expect(warnings.list().some((w) => w.includes("250 chars"))).toBe(true);
  });

  test("a summary of 150 non-BMP emoji (300 UTF-16 code units, 150 code points) does not warn", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "😀".repeat(150) }, { warnings });
    expect(warnings.list().some((w) => w.includes("chars"))).toBe(false);
  });

  test("a summary of 250 non-BMP emoji (250 code points) warns and reports 250 chars, not 500", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "😀".repeat(250) }, { warnings });
    expect(warnings.list().some((w) => w.includes("250 chars"))).toBe(true);
  });

  test("warnings are dropped silently when no collector is passed (core stays pure)", () => {
    expect(() => validateFrontmatter({ type: "Glossary", extra: 1 })).not.toThrow();
  });

  test("the path is woven into diagnostics when provided", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Glossary" }, { warnings, path: "notes/x.md" });
    expect(warnings.list().some((w) => w.includes("in notes/x.md"))).toBe(true);
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoreConfig, loadConfig } from "../src/config";
import { LoreError } from "../src/errors";

// The zero-config defaults `loadConfig` returns when nothing overrides them.
const DEFAULTS: LoreConfig = {
  reconcile: { mode: "task-rollup", overrides: {} },
  validate: { externalLinks: false, promotePortability: false },
  confluence: { format: "storage" },
};

const createdRoots: string[] = [];

/**
 * Create a fresh temp repo root. When `toml` is provided, write it to
 * `<root>/.lore/config.toml`; otherwise leave `.lore/` absent (the missing-file
 * case). Returns the root so it can be injected as `loadConfig({ root })`.
 */
function repoRoot(toml?: string): string {
  const root = mkdtempSync(join(tmpdir(), "lore-config-"));
  createdRoots.push(root);
  if (toml !== undefined) {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "config.toml"), toml, "utf8");
  }
  return root;
}

afterAll(() => {
  for (const root of createdRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Assert `fn` throws a `LoreError` of type `"validation"`, returning it for further assertions. */
function expectValidationError(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("validation");
    return err as LoreError;
  }
  throw new Error("expected loadConfig to throw a validation LoreError, but it returned");
}

describe("loadConfig — zero-config defaults", () => {
  test("a missing config.toml yields the documented defaults", () => {
    expect(loadConfig({ root: repoRoot(), env: {} })).toEqual(DEFAULTS);
  });

  test("an empty config.toml yields the documented defaults", () => {
    expect(loadConfig({ root: repoRoot(""), env: {} })).toEqual(DEFAULTS);
  });

  test("a partial config overrides only the keys it sets", () => {
    const config = loadConfig({ root: repoRoot("[validate]\nexternal_links = true\n"), env: {} });
    expect(config.validate).toEqual({ externalLinks: true, promotePortability: false });
    expect(config.reconcile).toEqual({ mode: "task-rollup", overrides: {} });
    expect(config.confluence).toEqual({ format: "storage" });
  });
});

describe("loadConfig — full parse and snake_case → camelCase mapping", () => {
  const full = `
[reconcile]
mode = "task-rollup"

[reconcile.overrides]
"In Review" = "in-progress"
"Won't Do" = "done"

[validate]
external_links = true
promote_portability = true

[confluence]
base_url = "https://acme.atlassian.net/wiki"
space = "ENG"
parent_page_id = "98765"
format = "adf"
`;

  test("every documented key maps to its camelCase config field", () => {
    expect(loadConfig({ root: repoRoot(full), env: {} })).toEqual({
      reconcile: { mode: "task-rollup", overrides: { "In Review": "in-progress", "Won't Do": "done" } },
      validate: { externalLinks: true, promotePortability: true },
      confluence: {
        baseUrl: "https://acme.atlassian.net/wiki",
        space: "ENG",
        parentPageId: "98765",
        format: "adf",
      },
    });
  });
});

describe("loadConfig — environment overlay for the Confluence token", () => {
  test("the token is overlaid from $LORE_CONFLUENCE_TOKEN, not the file", () => {
    const config = loadConfig({
      root: repoRoot('[confluence]\nspace = "ENG"\n'),
      env: { LORE_CONFLUENCE_TOKEN: "secret-123" },
    });
    expect(config.confluence.token).toBe("secret-123");
    expect(config.confluence.space).toBe("ENG");
  });

  test("an unset token leaves confluence.token absent", () => {
    const config = loadConfig({ root: repoRoot(), env: {} });
    expect("token" in config.confluence).toBe(false);
  });

  test("a blank token is treated as absent (no empty credential)", () => {
    const config = loadConfig({ root: repoRoot(), env: { LORE_CONFLUENCE_TOKEN: "" } });
    expect(config.confluence.token).toBeUndefined();
  });

  test("env is an injected seam — the real process.env is never read", () => {
    // No LORE_CONFLUENCE_TOKEN in the injected env, even if one exists in the
    // ambient process, so the result is deterministic.
    const config = loadConfig({ root: repoRoot(), env: { PATH: "/irrelevant" } });
    expect(config.confluence.token).toBeUndefined();
  });
});

describe("loadConfig — a committed token is rejected (ADR-0013)", () => {
  test("a token under [confluence] fails loud with a pointer to the env var", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[confluence]\ntoken = "leaked"\n'), env: {} }),
    );
    expect(err.hint).toContain("LORE_CONFLUENCE_TOKEN");
  });

  test("a committed token is rejected even when the env token is also set", () => {
    expectValidationError(() =>
      loadConfig({
        root: repoRoot('[confluence]\ntoken = "leaked"\n'),
        env: { LORE_CONFLUENCE_TOKEN: "from-env" },
      }),
    );
  });
});

describe("loadConfig — malformed input and out-of-contract values", () => {
  test("malformed TOML is a validation error", () => {
    expectValidationError(() => loadConfig({ root: repoRoot("this is = = not ["), env: {} }));
  });

  test("an unknown confluence.format is a validation error listing the allowed values", () => {
    const err = expectValidationError(() => loadConfig({ root: repoRoot('[confluence]\nformat = "xml"\n'), env: {} }));
    expect(err.message).toContain("confluence.format");
    expect(err.hint).toContain("storage");
  });

  test("an unknown reconcile.mode is a validation error", () => {
    const err = expectValidationError(() => loadConfig({ root: repoRoot('[reconcile]\nmode = "bogus"\n'), env: {} }));
    expect(err.message).toContain("reconcile.mode");
  });

  test("a non-boolean validate flag is a validation error", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[validate]\nexternal_links = "yes"\n'), env: {} }),
    );
    expect(err.message).toContain("external_links");
  });

  test("a scalar where a table is expected is a validation error", () => {
    expectValidationError(() => loadConfig({ root: repoRoot('reconcile = "nope"\n'), env: {} }));
  });

  test("a non-string override value is a validation error", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[reconcile.overrides]\n"In Review" = 7\n'), env: {} }),
    );
    expect(err.message).toContain("reconcile.overrides");
  });
});

describe("loadConfig — OKF-style tolerance and the committed file", () => {
  test("unknown sections and keys are tolerated for forward-compat", () => {
    const toml = `
[reconcile]
mode = "task-rollup"
future_key = "ignored"

[brand_new_section]
anything = true
`;
    const config = loadConfig({ root: repoRoot(toml), env: {} });
    expect(config.reconcile.mode).toBe("task-rollup");
    expect(config).not.toHaveProperty("brand_new_section");
    expect(config.reconcile).not.toHaveProperty("future_key");
  });

  test("lore's own committed .lore/config.toml is valid and loads as defaults (AC#1)", () => {
    // Resolve the repo root from this test file's location, not cwd, so the check
    // is robust to where `bun test` is invoked.
    const config = loadConfig({ root: join(import.meta.dir, ".."), env: {} });
    expect(config).toEqual(DEFAULTS);
  });
});

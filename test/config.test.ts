import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../src/config";
import { LoreError } from "../src/errors";

// The zero-config defaults `loadConfig` returns when nothing overrides them —
// the production source of truth, not a hand-copied literal, so these tests keep
// pinning the real defaults if they ever change.
const DEFAULTS = defaultConfig();

// A leading UTF-8 BOM, built ASCII-safely so there is no literal U+FEFF in source.
const BOM = String.fromCharCode(0xfeff);

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

describe("loadConfig — reconcile.overrides rejects reserved object keys", () => {
  test("an override keyed __proto__/constructor/prototype is rejected, not dropped or shadowing", () => {
    for (const reserved of ["__proto__", "constructor", "prototype"]) {
      const err = expectValidationError(() =>
        loadConfig({ root: repoRoot(`[reconcile.overrides]\n"${reserved}" = "done"\n`), env: {} }),
      );
      expect(err.message).toContain("reserved object key");
    }
  });

  test("a normal override is stored on a plain, fully-typed map", () => {
    const { reconcile } = loadConfig({ root: repoRoot('[reconcile.overrides]\n"In Review" = "done"\n'), env: {} });
    expect(reconcile.overrides["In Review"]).toBe("done");
    // The map keeps a normal Object prototype, so a consumer (reconcile.ts/LORE-23)
    // can call inherited methods on the typed Record.
    expect(Object.getPrototypeOf(reconcile.overrides)).toBe(Object.prototype);
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

  test("a whitespace-only token is treated as absent (no blank credential)", () => {
    const config = loadConfig({ root: repoRoot(), env: { LORE_CONFLUENCE_TOKEN: "   " } });
    expect(config.confluence.token).toBeUndefined();
  });

  test("surrounding whitespace is trimmed off the token", () => {
    const config = loadConfig({ root: repoRoot(), env: { LORE_CONFLUENCE_TOKEN: "  tok-123\n" } });
    expect(config.confluence.token).toBe("tok-123");
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

  test("a token in a nested [confluence.*] subtable is also rejected", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[confluence.auth]\ntoken = "leaked"\n'), env: {} }),
    );
    expect(err.hint).toContain("LORE_CONFLUENCE_TOKEN");
  });

  test("a token under a [[confluence]] array-of-tables typo still fails loud with the env-var pointer", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[[confluence]]\ntoken = "leaked"\n'), env: {} }),
    );
    expect(err.message).toContain("must not be committed");
    expect(err.hint).toContain("LORE_CONFLUENCE_TOKEN");
  });
});

describe("loadConfig — malformed input and out-of-contract values", () => {
  test("malformed TOML surfaces the parser's reason without leaking its class name", () => {
    const err = expectValidationError(() => loadConfig({ root: repoRoot("a = = 1"), env: {} }));
    expect(err.message).toContain("not valid TOML");
    expect(err.message).toContain("Unexpected"); // the parser's own message, surfaced
    expect(err.message).not.toContain("BuildMessage"); // ...without Bun's internal class-name prefix
  });

  test("a multi-error TOML file flattens the parser's sub-messages (aggregate path)", () => {
    const err = expectValidationError(() => loadConfig({ root: repoRoot("this is = = not ["), env: {} }));
    expect(err.message).toContain("not valid TOML:");
    expect(err.message).toContain("Unexpected"); // a sub-message from Bun's AggregateError
  });

  test("a UTF-8 BOM does not defeat the committed-token guard", () => {
    // Regression guard: a leading BOM must not make the file parse as empty {},
    // which would silently bypass the committed-token check (ADR-0013).
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot(`${BOM}[confluence]\ntoken = "leaked"\n`), env: {} }),
    );
    expect(err.hint).toContain("LORE_CONFLUENCE_TOKEN");
  });

  test("a UTF-8 BOM-prefixed config still applies its settings", () => {
    const config = loadConfig({ root: repoRoot(`${BOM}[validate]\nexternal_links = true\n`), env: {} });
    expect(config.validate.externalLinks).toBe(true);
  });

  test("a directory at the config path is reported with its OS reason, not as a permissions problem", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-config-"));
    createdRoots.push(root);
    // Make `.lore/config.toml` itself a directory so the read fails with EISDIR.
    mkdirSync(join(root, ".lore", "config.toml"), { recursive: true });
    const err = expectValidationError(() => loadConfig({ root, env: {} }));
    expect(err.message).toContain("could not be read");
    expect(err.message).toMatch(/EISDIR|directory/i);
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

describe("loadConfig — confluence.parent_page_id accepts integers", () => {
  test("an unquoted integer id is coerced to a string", () => {
    const config = loadConfig({ root: repoRoot("[confluence]\nparent_page_id = 98765\n"), env: {} });
    expect(config.confluence.parentPageId).toBe("98765");
  });

  test("a quoted string id is preserved verbatim", () => {
    const config = loadConfig({ root: repoRoot('[confluence]\nparent_page_id = "98765"\n'), env: {} });
    expect(config.confluence.parentPageId).toBe("98765");
  });

  test("an id beyond MAX_SAFE_INTEGER is rejected with a quote-it hint", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot("[confluence]\nparent_page_id = 9007199254740993\n"), env: {} }),
    );
    expect(err.hint).toContain("quote");
  });

  test("a zero/negative/non-integer number id is rejected as not a positive page id", () => {
    for (const id of ["0", "-5", "1.5"]) {
      const err = expectValidationError(() =>
        loadConfig({ root: repoRoot(`[confluence]\nparent_page_id = ${id}\n`), env: {} }),
      );
      expect(err.message).toContain("positive integer page id");
    }
  });

  test("a quoted 0/negative/non-numeric/empty/leading-zero id is rejected like the unquoted form", () => {
    for (const id of ['"0"', '"-5"', '"not-a-number"', '""', '"007"']) {
      const err = expectValidationError(() =>
        loadConfig({ root: repoRoot(`[confluence]\nparent_page_id = ${id}\n`), env: {} }),
      );
      expect(err.message).toContain("positive integer page id");
    }
  });

  test("a quoted huge id is accepted verbatim, preserving precision", () => {
    const config = loadConfig({
      root: repoRoot('[confluence]\nparent_page_id = "9007199254740993"\n'),
      env: {},
    });
    expect(config.confluence.parentPageId).toBe("9007199254740993");
  });

  test("a negative non-safe integer reports the sign, not the magnitude", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot("[confluence]\nparent_page_id = -9007199254740993\n"), env: {} }),
    );
    expect(err.message).toContain("positive integer page id");
    expect(err.message).not.toContain("too large");
  });
});

describe("loadConfig — OKF-style tolerance and the committed file", () => {
  test("unknown sections and keys are tolerated and never leak into the output", () => {
    const toml = `
[reconcile]
mode = "task-rollup"
future_key = "ignored"

[brand_new_section]
anything = true
`;
    // Tolerance: the unknown top-level section and the unknown key under
    // [reconcile] neither throw nor appear anywhere in the resolved config —
    // asserting full-output equality (not just absence) makes this non-vacuous.
    expect(loadConfig({ root: repoRoot(toml), env: {} })).toEqual(DEFAULTS);
  });

  test("lore's own committed .lore/config.toml mirrors the built-in defaults (AC#1)", () => {
    // The committed sample documents itself as a no-op over the defaults, so pin it
    // to defaultConfig(): an edit that sets a genuinely non-default value must also
    // update the sample's header, and this makes that drift loud rather than letting
    // the shipped "documents the defaults" sample silently diverge. Resolved from
    // this file's location (not cwd) so it is invocation-robust.
    const config = loadConfig({ root: join(import.meta.dir, ".."), env: {} });
    expect(config).toEqual(DEFAULTS);
  });
});

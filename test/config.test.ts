import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_REL_PATH, defaultConfig, type LoreConfig, loadConfig } from "../src/config";
import { EXIT_CODES, exitCodeFor, LoreError } from "../src/errors";

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

const ACCEPTED_CONFIG_CONFORMANCE_V1: ReadonlyArray<{
  name: string;
  toml?: string;
  env: Record<string, string | undefined>;
  expected: LoreConfig;
}> = [
  { name: "missing file defaults", env: {}, expected: DEFAULTS },
  { name: "empty file defaults", toml: "", env: {}, expected: DEFAULTS },
  {
    name: "partial file merges defaults and projects snake_case",
    toml: "[validate]\nexternal_links = true\n",
    env: {},
    expected: {
      reconcile: { mode: "task-rollup", overrides: {} },
      validate: { externalLinks: true, promotePortability: false },
      confluence: { format: "storage" },
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    },
  },
  {
    name: "full file projects every documented field",
    toml: [
      '[reconcile]\nmode = "task-rollup"',
      '[reconcile.overrides]\n"In Review" = "in-progress"',
      "[validate]\nexternal_links = true\npromote_portability = true",
      '[confluence]\nbase_url = "https://acme.example/wiki"\nspace = "ENG"\nparent_page_id = "98765"\nformat = "adf"',
    ].join("\n\n"),
    env: {},
    expected: {
      reconcile: { mode: "task-rollup", overrides: { "In Review": "in-progress" } },
      validate: { externalLinks: true, promotePortability: true },
      confluence: {
        baseUrl: "https://acme.example/wiki",
        space: "ENG",
        parentPageId: "98765",
        format: "adf",
      },
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    },
  },
  {
    name: "unknown sections and nested keys are tolerated but not projected",
    toml: '[reconcile]\nfuture_key = "ignored"\n[future]\nenabled = true\n',
    env: {},
    expected: DEFAULTS,
  },
  {
    name: "numeric page id is projected losslessly to a string",
    toml: "[confluence]\nparent_page_id = 98765\n",
    env: {},
    expected: {
      reconcile: { mode: "task-rollup", overrides: {} },
      validate: { externalLinks: false, promotePortability: false },
      confluence: { format: "storage", parentPageId: "98765" },
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    },
  },
  {
    name: "huge quoted page id preserves precision",
    toml: '[confluence]\nparent_page_id = "9007199254740993"\n',
    env: {},
    expected: {
      reconcile: { mode: "task-rollup", overrides: {} },
      validate: { externalLinks: false, promotePortability: false },
      confluence: { format: "storage", parentPageId: "9007199254740993" },
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    },
  },
  {
    name: "environment token is trimmed and overlaid after file parsing",
    toml: '[confluence]\nspace = "ENG"\n',
    env: { LORE_CONFLUENCE_TOKEN: "  env-secret\n" },
    expected: {
      reconcile: { mode: "task-rollup", overrides: {} },
      validate: { externalLinks: false, promotePortability: false },
      confluence: { format: "storage", space: "ENG", token: "env-secret" },
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    },
  },
];

const REJECTED_CONFIG_CONFORMANCE_V1: ReadonlyArray<{
  name: string;
  toml: string;
  expected: {
    message: string;
    hint: string;
    input: Record<string, unknown>;
  };
  forbiddenDiagnosticText?: string;
}> = [
  {
    name: "reconcile must be a table",
    toml: 'reconcile = "nope"\n',
    expected: {
      message: ".lore/config.toml: reconcile must be a table",
      hint: "make reconcile a TOML table ([reconcile] with key = value lines)",
      input: { key: "reconcile" },
    },
  },
  {
    name: "reconcile shape failure precedes a committed-token policy failure",
    toml: 'reconcile = "nope"\n[confluence]\ntoken = "leaked-secret"\n',
    expected: {
      message: ".lore/config.toml: reconcile must be a table",
      hint: "make reconcile a TOML table ([reconcile] with key = value lines)",
      input: { key: "reconcile" },
    },
    forbiddenDiagnosticText: "leaked-secret",
  },
  {
    name: "validate must be a table",
    toml: 'validate = "nope"\n',
    expected: {
      message: ".lore/config.toml: validate must be a table",
      hint: "make validate a TOML table ([validate] with key = value lines)",
      input: { key: "validate" },
    },
  },
  {
    name: "confluence must be a table",
    toml: 'confluence = "nope"\n',
    expected: {
      message: ".lore/config.toml: confluence must be a table",
      hint: "make confluence a TOML table ([confluence] with key = value lines)",
      input: { key: "confluence" },
    },
  },
  {
    name: "external_links must be boolean",
    toml: '[validate]\nexternal_links = "yes"\n',
    expected: {
      message: ".lore/config.toml: validate.external_links must be a boolean",
      hint: "set validate.external_links to true or false",
      input: { key: "validate.external_links", value: "yes" },
    },
  },
  {
    name: "validate shape failure precedes a committed-token policy failure",
    toml: '[validate]\nexternal_links = "yes"\n[confluence]\ntoken = "leaked-secret"\n',
    expected: {
      message: ".lore/config.toml: validate.external_links must be a boolean",
      hint: "set validate.external_links to true or false",
      input: { key: "validate.external_links", value: "yes" },
    },
    forbiddenDiagnosticText: "leaked-secret",
  },
  {
    name: "promote_portability must be boolean",
    toml: '[validate]\npromote_portability = "yes"\n',
    expected: {
      message: ".lore/config.toml: validate.promote_portability must be a boolean",
      hint: "set validate.promote_portability to true or false",
      input: { key: "validate.promote_portability", value: "yes" },
    },
  },
  {
    name: "reconcile mode stays a closed enum",
    toml: '[reconcile]\nmode = "bogus"\n',
    expected: {
      message: '.lore/config.toml: reconcile.mode must be one of "task-rollup"',
      hint: "set reconcile.mode to one of: task-rollup",
      input: { key: "reconcile.mode", value: "bogus" },
    },
  },
  {
    name: "confluence format stays a closed enum",
    toml: '[confluence]\nformat = "xml"\n',
    expected: {
      message: '.lore/config.toml: confluence.format must be one of "storage", "adf"',
      hint: "set confluence.format to one of: storage, adf",
      input: { key: "confluence.format", value: "xml" },
    },
  },
  {
    name: "confluence format retains precedence over a later string field",
    toml: '[confluence]\nformat = "xml"\nbase_url = 7\n',
    expected: {
      message: '.lore/config.toml: confluence.format must be one of "storage", "adf"',
      hint: "set confluence.format to one of: storage, adf",
      input: { key: "confluence.format", value: "xml" },
    },
  },
  {
    name: "confluence string field retains its exact type diagnostic",
    toml: "[confluence]\nbase_url = 7\n",
    expected: {
      message: ".lore/config.toml: confluence.base_url must be a string",
      hint: "quote confluence.base_url as a string",
      input: { key: "confluence.base_url", value: 7 },
    },
  },
  {
    name: "override map must be a table",
    toml: '[reconcile]\noverrides = "nope"\n',
    expected: {
      message: ".lore/config.toml: reconcile.overrides must be a table",
      hint: "make reconcile.overrides a TOML table ([reconcile.overrides] with key = value lines)",
      input: { key: "reconcile.overrides" },
    },
  },
  {
    name: "override value must be a string",
    toml: "[reconcile.overrides]\nX = 7\n",
    expected: {
      message: ".lore/config.toml: reconcile.overrides.X must be a string",
      hint: "quote reconcile.overrides.X as a string",
      input: { key: "reconcile.overrides.X", value: 7 },
    },
  },
  {
    name: "reserved override key remains rejected",
    toml: '[reconcile.overrides]\n"__proto__" = "done"\n',
    expected: {
      message: ".lore/config.toml: reconcile.overrides.__proto__ uses a reserved object key",
      hint: 'rename the "__proto__" entry under [reconcile.overrides] to a real status name',
      input: { key: "reconcile.overrides.__proto__", value: "done" },
    },
  },
  {
    name: "reserved override policy precedes validate shape",
    toml: '[reconcile.overrides]\n"__proto__" = "done"\n[validate]\nexternal_links = "yes"\n',
    expected: {
      message: ".lore/config.toml: reconcile.overrides.__proto__ uses a reserved object key",
      hint: 'rename the "__proto__" entry under [reconcile.overrides] to a real status name',
      input: { key: "reconcile.overrides.__proto__", value: "done" },
    },
  },
  {
    name: "an earlier reserved override key precedes a later bad value",
    toml: '[reconcile.overrides]\n"__proto__" = "done"\nZ = 7\n',
    expected: {
      message: ".lore/config.toml: reconcile.overrides.__proto__ uses a reserved object key",
      hint: 'rename the "__proto__" entry under [reconcile.overrides] to a real status name',
      input: { key: "reconcile.overrides.__proto__", value: "done" },
    },
  },
  {
    name: "an earlier bad override value precedes a later reserved key",
    toml: '[reconcile.overrides]\nA = 7\n"__proto__" = "done"\n',
    expected: {
      message: ".lore/config.toml: reconcile.overrides.A must be a string",
      hint: "quote reconcile.overrides.A as a string",
      input: { key: "reconcile.overrides.A", value: 7 },
    },
  },
  {
    name: "committed token uses the credential-safe policy error",
    toml: '[confluence]\ntoken = "leaked-secret"\n',
    expected: {
      message: ".lore/config.toml: a Confluence token must not be committed",
      hint: "remove `token` from [confluence] and set $LORE_CONFLUENCE_TOKEN instead",
      input: { key: "confluence.token" },
    },
    forbiddenDiagnosticText: "leaked-secret",
  },
  {
    name: "committed-token policy precedes confluence generic shape errors",
    toml: '[confluence]\ntoken = "leaked-secret"\nformat = "xml"\n',
    expected: {
      message: ".lore/config.toml: a Confluence token must not be committed",
      hint: "remove `token` from [confluence] and set $LORE_CONFLUENCE_TOKEN instead",
      input: { key: "confluence.token" },
    },
    forbiddenDiagnosticText: "leaked-secret",
  },
  {
    name: "zero page id remains invalid",
    toml: "[confluence]\nparent_page_id = 0\n",
    expected: {
      message: ".lore/config.toml: confluence.parent_page_id must be a positive integer page id",
      hint: "set confluence.parent_page_id to a positive integer page id",
      input: { key: "confluence.parent_page_id", value: 0 },
    },
  },
  {
    name: "non-string/non-number page id remains invalid",
    toml: "[confluence]\nparent_page_id = true\n",
    expected: {
      message: ".lore/config.toml: confluence.parent_page_id must be a positive integer page id",
      hint: "set confluence.parent_page_id to a positive integer page id (a quoted string or an unquoted integer)",
      input: { key: "confluence.parent_page_id", value: true },
    },
  },
  {
    name: "imprecise numeric page id retains the quote-it diagnostic",
    toml: "[confluence]\nparent_page_id = 9007199254740993\n",
    expected: {
      message: ".lore/config.toml: confluence.parent_page_id is too large to represent exactly as a number",
      hint: "quote confluence.parent_page_id as a string to preserve its precision",
      input: { key: "confluence.parent_page_id", value: 9007199254740992 },
    },
  },
];

describe("loadConfig — versioned pre/post conformance boundary (LCLI-288)", () => {
  test("keeps every accepted V1 shape and projection byte-compatible", () => {
    for (const fixture of ACCEPTED_CONFIG_CONFORMANCE_V1) {
      expect(loadConfig({ root: repoRoot(fixture.toml), env: fixture.env }), fixture.name).toEqual(fixture.expected);
    }
  });

  test("keeps every rejected V1 Lore error contract and credential boundary stable", () => {
    for (const fixture of REJECTED_CONFIG_CONFORMANCE_V1) {
      const err = expectValidationError(() => loadConfig({ root: repoRoot(fixture.toml), env: {} }));
      const diagnostic = { message: err.message, hint: err.hint, input: err.input };
      expect(diagnostic, fixture.name).toEqual(fixture.expected);
      if (fixture.forbiddenDiagnosticText !== undefined) {
        expect(JSON.stringify(diagnostic), fixture.name).not.toContain(fixture.forbiddenDiagnosticText);
      }
    }
  });
});

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
      tracker: { backend: "backlog" },
      agents: { skillSource: "repo" },
    });
  });
});

describe("loadConfig — jira-cli tracker settings", () => {
  test("accepts an explicit no-tracker backend without credentials", () => {
    const config = loadConfig({ root: repoRoot('[tracker]\nbackend = "none"\n'), env: {} });
    expect(config.tracker).toEqual({ backend: "none" });
  });

  test("rejects Jira settings when tracker coupling is explicitly disabled", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[tracker]\nbackend = "none"\n[tracker.jira]\nproject = "JT"\n'), env: {} }),
    );
    expect(err.message).toContain('tracker.jira cannot be configured when tracker.backend is "none"');
  });
  test("defaults an omitted tracker backend to backlog", () => {
    expect(loadConfig({ root: repoRoot(""), env: {} }).tracker).toEqual({ backend: "backlog" });
  });

  test("projects a Jira backend while tolerating future tracker keys", () => {
    const config = loadConfig({
      root: repoRoot('[tracker]\nbackend = "jira"\nfuture_key = true\n'),
      env: {},
    });
    expect(config.tracker).toEqual({ backend: "jira" });
  });

  test("rejects an unavailable backend and lists the accepted values", () => {
    const err = expectValidationError(() => loadConfig({ root: repoRoot('[tracker]\nbackend = "linear"\n'), env: {} }));
    expect(err.message).toContain('tracker.backend must be one of "quest", "backlog", "jira"');
    expect(err.hint).toContain("quest, backlog, jira");
    expect(err.input).toEqual({ key: "tracker.backend", value: "linear" });
  });

  test("projects non-secret [tracker.jira] settings without a credential field", () => {
    const config = loadConfig({
      root: repoRoot(`
[tracker.jira]
profile = "work"
project = "JT"
board = "42"
issue_type = "Task"
default_labels = ["lore", "docs"]
status_flow = ["To Do", "In Progress", "Done"]
`),
      env: {},
    });

    expect(config.tracker.backend).toBe("backlog");
    expect(config.tracker.jira).toEqual({
      profile: "work",
      project: "JT",
      board: "42",
      issueType: "Task",
      defaultLabels: ["lore", "docs"],
      statusFlow: ["To Do", "In Progress", "Done"],
    });
  });

  test("rejects Jira credentials at any depth and points to jira init", () => {
    for (const key of ["token", "api_token", "jira_api_token", "email", "jira_email"]) {
      const err = expectValidationError(() =>
        loadConfig({ root: repoRoot(`[tracker.jira]\n${key} = "must-not-be-read"\n`), env: {} }),
      );
      expect(err.message).toContain("Jira credentials");
      expect(err.hint).toContain("jira init");
      expect(JSON.stringify(err.input)).not.toContain("must-not-be-read");
    }
  });

  test("validates Jira arrays instead of silently dropping bad settings", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[tracker.jira]\nstatus_flow = ["To Do", 7]\n'), env: {} }),
    );
    expect(err.message).toContain("tracker.jira.status_flow must be an array of strings");
  });
});

describe("loadConfig — agents.skill_source (LCLI-442)", () => {
  test("defaults an omitted skill_source to repo", () => {
    expect(loadConfig({ root: repoRoot(""), env: {} }).agents).toEqual({ skillSource: "repo" });
  });

  test("parses an explicit skill_source = plugin while tolerating future agents keys", () => {
    const config = loadConfig({
      root: repoRoot('[agents]\nskill_source = "plugin"\nfuture_key = true\n'),
      env: {},
    });
    expect(config.agents).toEqual({ skillSource: "plugin" });
  });

  test("rejects an unsupported skill_source and lists the accepted values", () => {
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot('[agents]\nskill_source = "marketplace"\n'), env: {} }),
    );
    expect(err.message).toContain('agents.skill_source must be one of "repo", "plugin"');
    expect(err.hint).toContain("repo, plugin");
    expect(err.input).toEqual({ key: "agents.skill_source", value: "marketplace" });
  });
});

describe("loadConfig — reconcile.overrides rejects reserved object keys", () => {
  test("an override keyed by any Object.prototype member (or prototype) is rejected", () => {
    for (const reserved of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]) {
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

  test("multiple leading BOMs are all stripped (regression pin for the double-BOM bypass)", () => {
    // A single-slice strip would leave a residual BOM, re-parsing the file as {}
    // and letting the committed token slip past the guard — so pin >1 BOM here.
    const err = expectValidationError(() =>
      loadConfig({ root: repoRoot(`${BOM}${BOM}[confluence]\ntoken = "leaked"\n`), env: {} }),
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

  test("an unreadable (permission-denied) config.toml is a denied error, not validation (LORE-108)", () => {
    if (process.getuid?.() === 0) {
      return; // root bypasses read-permission checks, so this repro can't be set up
    }
    const root = repoRoot("[validate]\nexternal_links = true\n");
    const path = join(root, ".lore", "config.toml");
    chmodSync(path, 0o000);
    let unreadable = false;
    try {
      readFileSync(path, "utf8");
    } catch {
      unreadable = true;
    }
    if (!unreadable) {
      chmodSync(path, 0o644); // environment ignores the mode (e.g. permissive FS, or root) — skip
      return;
    }
    try {
      let thrown: unknown;
      try {
        loadConfig({ root, env: {} });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LoreError);
      expect((thrown as LoreError).type).toBe("denied");
      expect(exitCodeFor(thrown)).toBe(EXIT_CODES.denied);
      // LORE-175: the denied error's structured input must carry the errno
      // `code`, matching the shape errors.ts's ioError/readFileIfPresent emit
      // for every other denied-read site.
      const input = (thrown as LoreError).input as { path?: string; code?: string };
      expect(input.path).toBe(CONFIG_REL_PATH);
      expect(input.code === "EACCES" || input.code === "EPERM").toBe(true);
    } finally {
      chmodSync(path, 0o644); // restore so afterAll's rmSync can clean up
    }
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

  test("lore's own committed .lore/config.toml matches its documented cutover to Quest and skill_source (AC#1)", () => {
    // Pinned to defaultConfig() plus exactly the two overrides this repo's committed
    // header documents (the 2026-09-03 Backlog-to-Quest cutover, and the 2026-09-05
    // LCLI-444 dogfood of skill_source = "plugin"): an edit that sets any further
    // non-default value must also update the sample's header, and this makes that
    // drift loud rather than letting the shipped "documents its overrides" sample
    // silently diverge. Resolved from this file's location (not cwd) so it is
    // invocation-robust.
    const config = loadConfig({ root: join(import.meta.dir, ".."), env: {} });
    expect(config).toEqual({
      ...DEFAULTS,
      tracker: { ...DEFAULTS.tracker, backend: "quest" },
      agents: { ...DEFAULTS.agents, skillSource: "plugin" },
    });
  });
});

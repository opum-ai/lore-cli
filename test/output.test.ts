import { describe, expect, test } from "bun:test";
import { LoreError, reportError, WarningCollector, type Writer } from "../src/errors";
import {
  emit,
  type OutputContext,
  type OutputMode,
  type Renderable,
  renderTruncationLine,
  resolveMode,
  resolveOutput,
  SCHEMA_VERSION,
  successEnvelope,
  truncation,
} from "../src/output";

// A capturing Writer so tests assert exactly what reaches a stream without
// touching the real process streams (mirrors test/errors.test.ts).
function capture(): Writer & { text(): string; lines(): string[] } {
  const chunks: string[] = [];
  return {
    write(s: string): void {
      chunks.push(s);
    },
    text(): string {
      return chunks.join("");
    },
    lines(): string[] {
      return chunks.join("").split("\n").filter(Boolean);
    },
  };
}

// Build a Renderable with default text renderers; override per test as needed.
function renderable<T>(kind: string, data: T, over: Partial<Renderable<T>> = {}): Renderable<T> {
  return {
    kind,
    data,
    pretty: over.pretty ?? (() => "PRETTY"),
    plain: over.plain ?? (() => "PLAIN"),
  };
}

const JSON_CTX: OutputContext = { mode: "json", json: true, color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", json: false, color: false };
const PRETTY_CTX: OutputContext = { mode: "pretty", json: false, color: true };
const PRETTY_NOCOLOR_CTX: OutputContext = { mode: "pretty", json: false, color: false };

describe("resolveMode — precedence --json > --plain > pretty", () => {
  test("--json wins over everything (cli-contract §1.1)", () => {
    expect(resolveMode({ json: true })).toBe("json");
    expect(resolveMode({ json: true, plain: true })).toBe("json");
    expect(resolveMode({ json: true, plain: true, isTTY: false })).toBe("json");
    expect(resolveMode({ json: true, isTTY: true })).toBe("json");
  });

  test("--plain selects plain regardless of TTY", () => {
    expect(resolveMode({ plain: true, isTTY: true })).toBe("plain");
    expect(resolveMode({ plain: true, isTTY: false })).toBe("plain");
  });

  test("a non-TTY auto-selects plain with no flag (AC#2)", () => {
    expect(resolveMode({ isTTY: false })).toBe("plain");
    // process.stdout.isTTY is `undefined` (not false) when piped — falsy must count.
    expect(resolveMode({ isTTY: undefined })).toBe("plain");
    expect(resolveMode({})).toBe("plain");
  });

  test("a TTY with no flag yields pretty", () => {
    expect(resolveMode({ isTTY: true })).toBe("pretty");
    expect(resolveMode({ json: false, plain: false, isTTY: true })).toBe("pretty");
  });
});

describe("resolveOutput — color policy and context shape", () => {
  test("pretty on a TTY with NO_COLOR unset enables color (§6)", () => {
    expect(resolveOutput({ isTTY: true, env: {} })).toEqual({ mode: "pretty", json: false, color: true });
  });

  test("NO_COLOR set to ANY value — including empty — disables color (§6)", () => {
    expect(resolveOutput({ isTTY: true, env: { NO_COLOR: "" } }).color).toBe(false);
    expect(resolveOutput({ isTTY: true, env: { NO_COLOR: "1" } }).color).toBe(false);
    expect(resolveOutput({ isTTY: true, env: { NO_COLOR: "0" } }).color).toBe(false);
    expect(resolveOutput({ isTTY: true, env: { NO_COLOR: "false" } }).color).toBe(false);
  });

  test("plain and json are always color-free, even with NO_COLOR unset", () => {
    expect(resolveOutput({ plain: true, isTTY: true, env: {} }).color).toBe(false);
    expect(resolveOutput({ json: true, isTTY: true, env: {} }).color).toBe(false);
    // non-TTY → plain → no color
    expect(resolveOutput({ isTTY: false, env: {} }).color).toBe(false);
  });

  test("context.json is exactly mode === 'json' across the matrix", () => {
    expect(resolveOutput({ json: true, env: {} })).toMatchObject({ mode: "json", json: true });
    expect(resolveOutput({ plain: true, env: {} })).toMatchObject({ mode: "plain", json: false });
    expect(resolveOutput({ isTTY: true, env: {} })).toMatchObject({ mode: "pretty", json: false });
  });

  test("env defaults to process.env when not provided", () => {
    const had = "NO_COLOR" in process.env;
    const prev = process.env.NO_COLOR;
    try {
      delete process.env.NO_COLOR;
      expect(resolveOutput({ isTTY: true }).color).toBe(true);
      process.env.NO_COLOR = "";
      expect(resolveOutput({ isTTY: true }).color).toBe(false);
    } finally {
      if (had) {
        process.env.NO_COLOR = prev;
      } else {
        delete process.env.NO_COLOR;
      }
    }
  });
});

describe("OutputContext is consumable by errors.ts", () => {
  test("a json context drives reportError to the JSON envelope and exit code", () => {
    const ctx = resolveOutput({ json: true, env: {} });
    const cap = capture();
    const code = reportError(new LoreError("not_found", "nope"), { ...ctx, stderr: cap });
    expect(code).toBe(3);
    expect(JSON.parse(cap.text())).toEqual({ error_type: "not_found", message: "nope" });
  });

  test("a pretty (color) context drives reportError to a colored text diagnostic", () => {
    const ctx = resolveOutput({ isTTY: true, env: {} });
    expect(ctx.color).toBe(true);
    const cap = capture();
    reportError(new LoreError("usage", "bad flag"), { ...ctx, stderr: cap });
    expect(cap.text()).toContain("\x1b[31m"); // red error head, because color is on
    expect(cap.text()).toContain("bad flag"); // message text present after the colored prefix
  });

  test("a context drives WarningCollector.flush color and stream", () => {
    const ctx = resolveOutput({ plain: true, env: {} });
    const wc = new WarningCollector();
    wc.add("heads up");
    const cap = capture();
    const n = wc.flush({ ...ctx, stderr: cap });
    expect(n).toBe(1);
    expect(cap.text()).toBe("warning: heads up\n"); // plain context → no ANSI
  });
});

describe("success envelope (cli-contract §2)", () => {
  test("SCHEMA_VERSION is 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  test("wraps data as {schemaVersion, kind, data}", () => {
    expect(successEnvelope("query.results", { hits: [] })).toEqual({
      schemaVersion: 1,
      kind: "query.results",
      data: { hits: [] },
    });
  });

  test("data may be an array and is preserved by identity", () => {
    const data = [1, 2, 3];
    const env = successEnvelope("graph.export", data);
    expect(env.data).toBe(data);
    expect(Object.keys(env)).toEqual(["schemaVersion", "kind", "data"]);
  });
});

describe("emit — json mode", () => {
  test("writes the compact envelope as a single parseable line", () => {
    const cap = capture();
    emit(renderable("query.results", { total: 1 }), JSON_CTX, cap);
    expect(cap.text()).toBe('{"schemaVersion":1,"kind":"query.results","data":{"total":1}}\n');
    expect(cap.lines()).toHaveLength(1);
    expect(JSON.parse(cap.text())).toEqual({ schemaVersion: 1, kind: "query.results", data: { total: 1 } });
  });

  test("does not invoke the pretty/plain renderers", () => {
    let touched = false;
    const r = renderable(
      "k",
      {},
      {
        pretty: () => {
          touched = true;
          return "P";
        },
        plain: () => {
          touched = true;
          return "PL";
        },
      },
    );
    emit(r, JSON_CTX, capture());
    expect(touched).toBe(false);
  });

  test("a non-serializable payload throws with NOTHING written (stdout parses or stays silent, §4)", () => {
    const cap = capture();
    expect(() => emit(renderable("k", { n: 1n }), JSON_CTX, cap)).toThrow();
    expect(cap.text()).toBe("");
  });

  test("a circular payload throws with nothing written", () => {
    const cap = capture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => emit(renderable("k", cyclic), JSON_CTX, cap)).toThrow();
    expect(cap.text()).toBe("");
  });

  test("defaults the sink to process.stdout", () => {
    const original = process.stdout.write.bind(process.stdout);
    const chunks: string[] = [];
    // @ts-expect-error narrow test shim for the single-string call emit makes
    process.stdout.write = (s: string) => {
      chunks.push(s);
      return true;
    };
    try {
      emit(renderable("k", { ok: true }), JSON_CTX);
    } finally {
      process.stdout.write = original;
    }
    expect(chunks.join("")).toBe('{"schemaVersion":1,"kind":"k","data":{"ok":true}}\n');
  });
});

describe("emit — plain mode", () => {
  test("writes the plain body with exactly one trailing newline", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "row one\nrow two" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("row one\nrow two\n");
  });

  test("collapses multiple trailing newlines to one", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "body\n\n\n" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("body\n");
  });

  test("an empty body writes nothing (stdout stays clean)", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("");
  });

  test("does not invoke the pretty renderer", () => {
    let prettyTouched = false;
    const r = renderable(
      "k",
      {},
      {
        pretty: () => {
          prettyTouched = true;
          return "P";
        },
        plain: () => "PL",
      },
    );
    emit(r, PLAIN_CTX, capture());
    expect(prettyTouched).toBe(false);
  });
});

describe("emit — pretty mode", () => {
  test("writes the pretty body with one trailing newline", () => {
    const cap = capture();
    emit(renderable("k", {}, { pretty: () => "shiny" }), PRETTY_CTX, cap);
    expect(cap.text()).toBe("shiny\n");
  });

  test("passes the resolved color flag down to the pretty renderer", () => {
    const r = renderable("k", {}, { pretty: (_d, opts) => (opts.color ? "WITH" : "WITHOUT") });
    const withColor = capture();
    const noColor = capture();
    emit(r, PRETTY_CTX, withColor);
    emit(r, PRETTY_NOCOLOR_CTX, noColor);
    expect(withColor.text()).toBe("WITH\n");
    expect(noColor.text()).toBe("WITHOUT\n");
  });

  test("does not invoke the plain renderer", () => {
    let plainTouched = false;
    const r = renderable(
      "k",
      {},
      {
        pretty: () => "P",
        plain: () => {
          plainTouched = true;
          return "PL";
        },
      },
    );
    emit(r, PRETTY_CTX, capture());
    expect(plainTouched).toBe(false);
  });
});

describe("truncation builder (cli-contract §3)", () => {
  test("derives truncated = shown < total", () => {
    expect(truncation(120, 30)).toEqual({ total: 120, shown: 30, truncated: true });
    expect(truncation(30, 30)).toEqual({ total: 30, shown: 30, truncated: false });
    expect(truncation(0, 0)).toEqual({ total: 0, shown: 0, truncated: false });
  });

  test("includes a non-empty hint and drops an empty one", () => {
    expect(truncation(120, 30, "narrow with --type story")).toEqual({
      total: 120,
      shown: 30,
      truncated: true,
      hint: "narrow with --type story",
    });
    expect(truncation(120, 30, "")).toEqual({ total: 120, shown: 30, truncated: true });
  });
});

describe("renderTruncationLine (cli-contract §3.2)", () => {
  test("renders 'showing X of Y — hint' when truncated with a hint", () => {
    expect(renderTruncationLine(truncation(120, 30, "narrow with --type story"))).toBe(
      "showing 30 of 120 — narrow with --type story",
    );
  });

  test("omits the dash and hint when truncated without a hint", () => {
    expect(renderTruncationLine(truncation(120, 30))).toBe("showing 30 of 120");
  });

  test("returns empty string when nothing was truncated", () => {
    expect(renderTruncationLine(truncation(30, 30, "ignored"))).toBe("");
  });
});

// Type-level: OutputMode is the union the layer is built on.
const _modes: OutputMode[] = ["json", "plain", "pretty"];
test("OutputMode union has exactly the three modes", () => {
  expect(_modes).toEqual(["json", "plain", "pretty"]);
});

import { describe, expect, test } from "bun:test";
import { LoreError, reportError, WarningCollector } from "../src/errors";
import {
  emit,
  errorRenderOpts,
  maxLen,
  type OutputContext,
  type Renderable,
  renderTaskSummaryRows,
  renderTruncationLine,
  resolveMode,
  resolveOutput,
  SCHEMA_VERSION,
  successEnvelope,
  type TaskSummaryRow,
  type Truncation,
  truncation,
} from "../src/output";
import { capture } from "./helpers";

// Build a Renderable with default text renderers; override per test as needed.
function renderable<T>(kind: string, data: T, over: Partial<Renderable<T>> = {}): Renderable<T> {
  return {
    kind,
    data,
    pretty: over.pretty ?? (() => "PRETTY"),
    plain: over.plain ?? (() => "PLAIN"),
  };
}

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };
const PRETTY_CTX: OutputContext = { mode: "pretty", color: true };
const PRETTY_NOCOLOR_CTX: OutputContext = { mode: "pretty", color: false };

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

  test("produces exactly the three output modes (catches a removed mode)", () => {
    // The `never` default in emit's switch catches an ADDED mode at compile time;
    // this pins the resolvable set to exactly {json, plain, pretty} so a REMOVED
    // mode (a silently shrunk contract) fails a test rather than passing quietly.
    const produced = new Set([
      resolveMode({ json: true }),
      resolveMode({ plain: true, isTTY: true }),
      resolveMode({ isTTY: true }),
    ]);
    expect([...produced].sort()).toEqual(["json", "plain", "pretty"]);
  });
});

describe("resolveOutput — color policy and context shape", () => {
  test("pretty on a TTY with NO_COLOR unset enables color (§6)", () => {
    expect(resolveOutput({ isTTY: true, env: {} })).toEqual({ mode: "pretty", color: true });
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

  test("returns a { mode, color } context with no separate, drift-prone json field", () => {
    expect(resolveOutput({ json: true, env: {} })).toEqual({ mode: "json", color: false });
    expect(resolveOutput({ plain: true, env: {} })).toEqual({ mode: "plain", color: false });
    expect(resolveOutput({ isTTY: true, env: {} })).toEqual({ mode: "pretty", color: true });
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

describe("errorRenderOpts bridges a context to errors.ts", () => {
  test("derives { json, color } from mode (json computed, not stored)", () => {
    expect(errorRenderOpts({ mode: "json", color: false })).toEqual({ json: true, color: false });
    expect(errorRenderOpts({ mode: "plain", color: false })).toEqual({ json: false, color: false });
    expect(errorRenderOpts({ mode: "pretty", color: true })).toEqual({ json: false, color: true });
  });

  test("a json context drives reportError to the JSON envelope and exit code", () => {
    const ctx = resolveOutput({ json: true, env: {} });
    const cap = capture();
    const code = reportError(new LoreError("not_found", "nope"), { ...errorRenderOpts(ctx), stderr: cap });
    expect(code).toBe(3);
    expect(JSON.parse(cap.text())).toEqual({ error_type: "not_found", message: "nope" });
  });

  test("a pretty (color) context drives reportError to a colored text diagnostic", () => {
    const ctx = resolveOutput({ isTTY: true, env: {} });
    expect(ctx.color).toBe(true);
    const cap = capture();
    reportError(new LoreError("usage", "bad flag"), { ...errorRenderOpts(ctx), stderr: cap });
    expect(cap.text()).toContain("\x1b[31m"); // red error head, because color is on
    expect(cap.text()).toContain("bad flag"); // message text present after the colored prefix
  });

  test("a context drives WarningCollector.flush color and stream", () => {
    const ctx = resolveOutput({ plain: true, env: {} });
    const wc = new WarningCollector();
    wc.add("heads up");
    const cap = capture();
    const n = wc.flush({ ...errorRenderOpts(ctx), stderr: cap });
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
    // Exactly one newline total (the trailing one) — no leading/embedded blank line.
    expect((cap.text().match(/\n/g) ?? []).length).toBe(1);
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

  test("undefined data throws — never a §2 envelope missing the data key", () => {
    const cap = capture();
    // JSON.stringify would silently DROP an undefined `data`, emitting
    // {"schemaVersion":1,"kind":"k"} — a malformed success. The guard rejects it.
    expect(() => emit(renderable("k", undefined), JSON_CTX, cap)).toThrow(TypeError);
    expect(cap.text()).toBe("");
  });

  test("null data throws (a JSON.parse(stdout).data.<field> consumer would crash)", () => {
    const cap = capture();
    expect(() => emit(renderable("k", null), JSON_CTX, cap)).toThrow(TypeError);
    expect(cap.text()).toBe("");
  });

  test("primitive data (string/number/boolean) throws — §2 data must be object|array", () => {
    for (const bad of ["hi", 42, true]) {
      const cap = capture();
      expect(() => emit(renderable("k", bad), JSON_CTX, cap)).toThrow(TypeError);
      expect(cap.text()).toBe("");
    }
  });

  test("array data is accepted (an envelope data of array shape is valid §2)", () => {
    const cap = capture();
    emit(renderable("graph.export", [1, 2, 3]), JSON_CTX, cap);
    expect(JSON.parse(cap.text())).toEqual({ schemaVersion: 1, kind: "graph.export", data: [1, 2, 3] });
  });

  test("a toJSON-collapsing object (Date) throws — typeof 'object' is not enough", () => {
    const cap = capture();
    // typeof new Date() === "object" but it serializes to a bare string, which
    // would put a string `data` on stdout that a .data.<field> consumer crashes on.
    expect(() => emit(renderable("k", new Date(0)), JSON_CTX, cap)).toThrow(TypeError);
    expect(cap.text()).toBe("");
  });

  test("an empty/non-string kind throws — JSON.stringify would drop the kind key", () => {
    const cap = capture();
    expect(() => emit(renderable("", { ok: true }), JSON_CTX, cap)).toThrow(TypeError);
    expect(cap.text()).toBe("");
  });

  test("serializes once — a non-idempotent toJSON cannot ship an unvalidated value (TOCTOU)", () => {
    let calls = 0;
    // Returns an object the first time, a bare string the second. A
    // validate-then-reserialize design would validate the object but WRITE the
    // string; serializing once and validating those exact bytes cannot.
    const data = {
      toJSON() {
        calls++;
        return calls === 1 ? { ok: true } : "UNVALIDATED_SECOND_CALL";
      },
    };
    const cap = capture();
    emit(renderable("k", data), JSON_CTX, cap);
    expect(calls).toBe(1); // serialized exactly once
    expect(JSON.parse(cap.text())).toEqual({ schemaVersion: 1, kind: "k", data: { ok: true } });
  });

  test("defaults the sink to process.stdout", () => {
    const original = process.stdout.write.bind(process.stdout);
    const chunks: string[] = [];
    // Narrow test shim for the single-string call emit makes; cast to the full
    // overloaded signature so it type-checks once test/ is in the typecheck include.
    process.stdout.write = ((s: string) => {
      chunks.push(s);
      return true;
    }) as typeof process.stdout.write;
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

  test("a whitespace-only body writes nothing (no stray line for a no-rows result)", () => {
    // Includes the Unicode LINE/PARAGRAPH separators (U+2028/U+2029) and the BOM —
    // the emptiness check and the trailing strip must agree on what counts as a
    // line terminator, or one of them leaks a visually-blank line.
    for (const blank of ["   ", "\t", "  \n", "\r\n\r\n", "\n  \n", "\u2028", "\u2029", "\uFEFF"]) {
      const cap = capture();
      emit(renderable("k", {}, { plain: () => blank }), PLAIN_CTX, cap);
      expect(cap.text()).toBe("");
    }
  });

  test("strips a CRLF terminator cleanly — no stray \\r before the added \\n", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "row one\r\nrow two\r\n" }), PLAIN_CTX, cap);
    // Interior CRLF is the renderer's payload; only the trailing edge is normalized.
    expect(cap.text()).toBe("row one\r\nrow two\n");
  });

  test("strips a trailing Unicode line separator (U+2028) — same set as the empty-check", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "row\u2028" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("row\n");
  });

  test("preserves leading/interior formatting — only the trailing edge is normalized", () => {
    const cap = capture();
    emit(renderable("k", {}, { plain: () => "  indented first\n\n  indented again" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("  indented first\n\n  indented again\n");
  });

  test("preserves significant trailing horizontal whitespace (e.g. an empty TSV field)", () => {
    const cap = capture();
    // Only the trailing newline is stripped; the trailing tab is the renderer's
    // data (an empty last column) and must survive so every row split is symmetric.
    emit(renderable("k", {}, { plain: () => "col1\tcol2\t\n" }), PLAIN_CTX, cap);
    expect(cap.text()).toBe("col1\tcol2\t\n");
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

  test("applies the same writeBody normalization as plain (empty → silent, one trailing newline)", () => {
    // pretty and plain share writeBody; pin the body invariants for pretty too, so a
    // future mode-specific branch can't silently break stdout discipline here.
    const empty = capture();
    emit(renderable("k", {}, { pretty: () => "   " }), PRETTY_CTX, empty);
    expect(empty.text()).toBe("");
    const trailing = capture();
    emit(renderable("k", {}, { pretty: () => "row\n\n" }), PRETTY_CTX, trailing);
    expect(trailing.text()).toBe("row\n");
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

  test("includes a non-empty hint and drops an empty or whitespace-only one", () => {
    expect(truncation(120, 30, "narrow with --type story")).toEqual({
      total: 120,
      shown: 30,
      truncated: true,
      hint: "narrow with --type story",
    });
    expect(truncation(120, 30, "")).toEqual({ total: 120, shown: 30, truncated: true });
    expect(truncation(120, 30, "   \n ")).toEqual({ total: 120, shown: 30, truncated: true });
  });

  test("collapses a multi-line hint to one line (matches errors.ts singleLine)", () => {
    expect(truncation(120, 30, "narrow with\n--type story").hint).toBe("narrow with --type story");
  });

  test("rejects non-integer / negative / transposed counts (no silent mislabel)", () => {
    expect(() => truncation(Number.NaN, 30)).toThrow(RangeError); // NaN < total is false → would mislabel as complete
    expect(() => truncation(30, Number.NaN)).toThrow(RangeError);
    expect(() => truncation(Number.POSITIVE_INFINITY, 30)).toThrow(RangeError);
    expect(() => truncation(120.5, 30)).toThrow(RangeError); // would render "showing 30 of 120.5"
    expect(() => truncation(120, 30.5)).toThrow(RangeError);
    expect(() => truncation(120, -1)).toThrow(RangeError);
    expect(() => truncation(30, 120)).toThrow(RangeError); // transposed: shown > total
  });

  test("coerces a non-string hint instead of crashing String.replace (asText)", () => {
    // A JS caller (no compile-time types) may pass a non-string hint; it must
    // degrade to its text form, not throw inside singleLine's `.replace`. A falsy
    // non-string (0) is coerced too — not silently dropped like an omitted hint.
    expect(truncation(120, 30, 5 as unknown as string).hint).toBe("5");
    expect(truncation(120, 30, 0 as unknown as string).hint).toBe("0");
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

  test("single-lines a hand-built Truncation's multi-line hint (no smuggled stdout line)", () => {
    // The parameter is the exported Truncation, so a caller can bypass truncation()
    // and hand-build one. A newline in the hint must not split the §3.2 footer.
    const handBuilt: Truncation = { total: 120, shown: 30, truncated: true, hint: "no match\ntry --type story" };
    const line = renderTruncationLine(handBuilt);
    expect(line).toBe("showing 30 of 120 — no match try --type story");
    expect(line).not.toContain("\n");
  });

  test("rejects a hand-built Truncation with corrupt counts (no 'showing 30 of NaN')", () => {
    // Counts are re-validated at the render seam too, not only in truncation().
    const bad: Truncation = { total: Number.NaN, shown: 30, truncated: true };
    expect(() => renderTruncationLine(bad)).toThrow(RangeError);
  });

  test("derives 'truncated' from the counts, ignoring a hand-built flag", () => {
    // A lying `truncated: false` with shown < total must STILL render the footer —
    // otherwise a partial result prints as complete (§3); the inverse must not render.
    expect(renderTruncationLine({ total: 120, shown: 30, truncated: false })).toBe("showing 30 of 120");
    expect(renderTruncationLine({ total: 30, shown: 30, truncated: true })).toBe("");
  });
});

describe("maxLen — spread-free column-width helper (LORE-51)", () => {
  test("returns the longest projected length", () => {
    expect(maxLen(["a", "abc", "ab"], (s) => s.length)).toBe(3);
  });

  test("returns 0 for an empty list", () => {
    expect(maxLen([], (s: string) => s.length)).toBe(0);
  });

  test("handles a list too large for Math.max(...array) to spread (no RangeError)", () => {
    // Math.max(...Array(150_000)) throws "Maximum call stack size exceeded" on V8; the
    // whole point of maxLen is a loop that never hits that ceiling.
    const many = Array.from({ length: 150_000 }, (_, i) => String(i));
    expect(() => maxLen(many, (s) => s.length)).not.toThrow();
  });
});

describe("renderTaskSummaryRows — shared id/status/title alignment (LORE-51)", () => {
  const rows: TaskSummaryRow[] = [
    { id: "LORE-1", title: "Short", status: "Done" },
    { id: "LORE-100", title: "A longer title", status: "In Progress" },
  ];

  test("pads id and status columns to the widest cell, leaves title unpadded", () => {
    expect(renderTaskSummaryRows(rows)).toEqual([
      "  LORE-1    Done         Short",
      "  LORE-100  In Progress  A longer title",
    ]);
  });

  test("returns [] for an empty row list", () => {
    expect(renderTaskSummaryRows([])).toEqual([]);
  });

  test("`lore tasks` and `lore orphans` render byte-identical rows for the same data (the whole point of sharing)", () => {
    const row: TaskSummaryRow = { id: "LORE-42", title: "Bulk archive orders", status: "To Do" };
    expect(renderTaskSummaryRows([row])).toEqual(renderTaskSummaryRows([row]));
  });

  test("collapses an embedded newline/control character in id, status, or title to one sanitized line (LORE-115)", () => {
    const row: TaskSummaryRow = {
      id: "LORE-1\n99",
      title: "Evil title\r\nwith a fake second line",
      status: "In\nProgress",
    };
    const [line] = renderTaskSummaryRows([row]);
    expect(line).toBeDefined();
    // Single physical line: no line terminator survives the sanitization.
    expect(line).not.toMatch(/[\r\n]/);
    // Matches the same singleLine(asText(...)) collapse used elsewhere in output.ts —
    // the run of line breaks becomes a single space, not silently dropped.
    expect(line).toBe("  LORE-1 99  In Progress  Evil title with a fake second line");
  });
});

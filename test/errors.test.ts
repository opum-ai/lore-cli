import { describe, expect, test } from "bun:test";
import {
  type ErrorType,
  EXIT_CODES,
  EXIT_OK,
  EXIT_UNCAUGHT,
  exitCodeFor,
  formatErrorText,
  LoreError,
  reportError,
  toErrorEnvelope,
  WarningCollector,
  type Writer,
} from "../src/errors";

// A capturing Writer so tests assert exactly what reaches stderr without
// touching the real process streams.
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

const ALL_TYPES: ErrorType[] = ["usage", "not_found", "denied", "conflict", "validation", "drift"];

describe("exit codes", () => {
  test("success and uncaught codes are 0 and 1", () => {
    expect(EXIT_OK).toBe(0);
    expect(EXIT_UNCAUGHT).toBe(1);
  });

  test("the semantic exit-code contract is exactly 2/3/4/5/6/6", () => {
    expect(EXIT_CODES).toEqual({
      usage: 2,
      not_found: 3,
      denied: 4,
      conflict: 5,
      validation: 6,
      drift: 6,
    });
  });

  test("no classifiable code reuses 0 or 1", () => {
    for (const type of ALL_TYPES) {
      expect(EXIT_CODES[type]).toBeGreaterThanOrEqual(2);
    }
  });

  test("exitCodeFor maps every LoreError type to its contract code", () => {
    for (const type of ALL_TYPES) {
      expect(exitCodeFor(new LoreError(type, "x"))).toBe(EXIT_CODES[type]);
    }
  });

  test("exitCodeFor maps non-LoreError values to the uncaught code", () => {
    expect(exitCodeFor(new Error("boom"))).toBe(EXIT_UNCAUGHT);
    expect(exitCodeFor("just a string")).toBe(EXIT_UNCAUGHT);
    expect(exitCodeFor(undefined)).toBe(EXIT_UNCAUGHT);
  });
});

describe("LoreError", () => {
  test("carries type/message/hint/input and is an Error", () => {
    const err = new LoreError("not_found", "concept 'stories/ghost' not found", "run `lore query ghost`", {
      id: "stories/ghost",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LoreError);
    expect(err.type).toBe("not_found");
    expect(err.message).toBe("concept 'stories/ghost' not found");
    expect(err.hint).toBe("run `lore query ghost`");
    expect(err.input).toEqual({ id: "stories/ghost" });
    expect(err.name).toBe("LoreError");
  });

  test("hint and input are optional", () => {
    const err = new LoreError("usage", "unknown flag --frob");
    expect(err.hint).toBeUndefined();
    expect(err.input).toBeUndefined();
  });
});

describe("toErrorEnvelope", () => {
  test("includes hint and input when present, with contract field order", () => {
    const err = new LoreError("not_found", "missing", "do x", { id: "a" });
    const envelope = toErrorEnvelope(err);
    expect(envelope).toEqual({ error_type: "not_found", message: "missing", hint: "do x", input: { id: "a" } });
    expect(Object.keys(envelope)).toEqual(["error_type", "message", "hint", "input"]);
  });

  test("omits hint and input when absent", () => {
    const envelope = toErrorEnvelope(new LoreError("usage", "bad flag"));
    expect(envelope).toEqual({ error_type: "usage", message: "bad flag" });
    expect("hint" in envelope).toBe(false);
    expect("input" in envelope).toBe(false);
  });
});

describe("formatErrorText", () => {
  test("renders message and hint as separate lines, no color by default", () => {
    const text = formatErrorText(new LoreError("denied", "refused", "confirm with --force"));
    expect(text).toBe("error: refused\nhint: confirm with --force");
    expect(text).not.toContain("\x1b[");
  });

  test("omits the hint line when there is no hint", () => {
    expect(formatErrorText(new LoreError("conflict", "exists"))).toBe("error: exists");
  });

  test("emits ANSI sequences only when color is requested", () => {
    const plain = formatErrorText(new LoreError("validation", "nope"), { color: false });
    const colored = formatErrorText(new LoreError("validation", "nope"), { color: true });
    expect(plain).not.toContain("\x1b[");
    expect(colored).toContain("\x1b[31m");
    expect(colored).toContain("nope");
  });
});

describe("reportError", () => {
  test("--json writes the error envelope to stderr and returns the code", () => {
    const stderr = capture();
    const code = reportError(new LoreError("not_found", "missing", "do x", { id: "a" }), { json: true, stderr });
    expect(code).toBe(3);
    expect(JSON.parse(stderr.text())).toEqual({
      error_type: "not_found",
      message: "missing",
      hint: "do x",
      input: { id: "a" },
    });
    expect(stderr.text().endsWith("\n")).toBe(true);
  });

  test("--json output is a single parseable line with no prose", () => {
    const stderr = capture();
    reportError(new LoreError("validation", "bad frontmatter"), { json: true, stderr });
    expect(stderr.lines()).toHaveLength(1);
    expect(() => JSON.parse(stderr.text())).not.toThrow();
  });

  test("text mode writes the human diagnostic and returns the code", () => {
    const stderr = capture();
    const code = reportError(new LoreError("usage", "unknown flag", "see --help"), { json: false, stderr });
    expect(code).toBe(2);
    expect(stderr.text()).toBe("error: unknown flag\nhint: see --help\n");
  });

  test("a non-LoreError is reported as uncaught with exit 1 (json)", () => {
    const stderr = capture();
    const code = reportError(new Error("kaboom"), { json: true, stderr });
    expect(code).toBe(EXIT_UNCAUGHT);
    expect(JSON.parse(stderr.text())).toEqual({ error_type: "uncaught", message: "kaboom" });
  });

  test("a non-LoreError is reported as uncaught with exit 1 (text)", () => {
    const stderr = capture();
    const code = reportError("plain string failure", { json: false, stderr });
    expect(code).toBe(EXIT_UNCAUGHT);
    expect(stderr.text()).toBe("error: plain string failure\n");
  });

  test("every classifiable type round-trips through its documented exit code", () => {
    for (const type of ALL_TYPES) {
      const stderr = capture();
      expect(reportError(new LoreError(type, "x"), { json: true, stderr })).toBe(EXIT_CODES[type]);
    }
  });
});

describe("WarningCollector", () => {
  test("starts empty", () => {
    const warnings = new WarningCollector();
    expect(warnings.isEmpty).toBe(true);
    expect(warnings.count).toBe(0);
    expect(warnings.list()).toEqual([]);
  });

  test("accumulates in insertion order and reports a snapshot copy", () => {
    const warnings = new WarningCollector();
    warnings.add("unknown type 'Widget'");
    warnings.add("missing summary");
    expect(warnings.isEmpty).toBe(false);
    expect(warnings.count).toBe(2);
    const snapshot = warnings.list();
    expect(snapshot).toEqual(["unknown type 'Widget'", "missing summary"]);
    // list() is a copy: mutating it must not affect the collector.
    (snapshot as string[]).push("tampered");
    expect(warnings.count).toBe(2);
  });

  test("flush writes each warning to stderr and returns the count", () => {
    const warnings = new WarningCollector();
    warnings.add("first");
    warnings.add("second");
    const stderr = capture();
    expect(warnings.flush({ stderr })).toBe(2);
    expect(stderr.lines()).toEqual(["warning: first", "warning: second"]);
  });

  test("flush colors only when requested", () => {
    const warnings = new WarningCollector();
    warnings.add("watch out");
    const plain = capture();
    warnings.flush({ stderr: plain, color: false });
    expect(plain.text()).toBe("warning: watch out\n");
    const colored = capture();
    warnings.flush({ stderr: colored, color: true });
    expect(colored.text()).toContain("\x1b[33m");
  });

  test("flushing an empty collector writes nothing and returns 0", () => {
    const stderr = capture();
    expect(new WarningCollector().flush({ stderr })).toBe(0);
    expect(stderr.text()).toBe("");
  });
});

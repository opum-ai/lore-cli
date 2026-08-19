import { describe, expect, test } from "bun:test";
import {
  asText,
  type ErrorType,
  EXIT_CODES,
  EXIT_OK,
  EXIT_UNCAUGHT,
  exitCodeFor,
  formatErrorText,
  ioError,
  LoreError,
  reportError,
  stderrHint,
  toErrorEnvelope,
  WarningCollector,
} from "../src/errors";
import { capture } from "./helpers";

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

describe("asText", () => {
  // LORE-171: JSON.stringify returns runtime `undefined` (not a thrown error)
  // for a bare Symbol or bare function, so the safeStringify fast path used to
  // pass that undefined straight through — asText silently broke its own
  // `string`-returning contract for exactly these input types.
  test("a Symbol input returns an actual string, never runtime undefined", () => {
    const result = asText(Symbol("x"));
    expect(typeof result).toBe("string");
    expect(result).not.toBeUndefined();
  });

  test("a bare function input returns an actual string, never runtime undefined", () => {
    const result = asText(() => {});
    expect(typeof result).toBe("string");
    expect(result).not.toBeUndefined();
  });

  test("still passes through ordinary strings and coerces nullish to empty", () => {
    expect(asText("already a string")).toBe("already a string");
    expect(asText(undefined)).toBe("");
    expect(asText(null)).toBe("");
  });

  test("still stringifies ordinary JSON-safe values (numbers, objects)", () => {
    expect(asText(42)).toBe("42");
    expect(asText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("toErrorEnvelope", () => {
  test("includes hint, input, and the reserved principal slot last", () => {
    const err = new LoreError("not_found", "missing", "do x", { id: "a" });
    const envelope = toErrorEnvelope(err);
    expect(envelope).toEqual({
      error_type: "not_found",
      message: "missing",
      hint: "do x",
      input: { id: "a" },
      principal: null,
    });
    expect(Object.keys(envelope)).toEqual(["error_type", "message", "hint", "input", "principal"]);
  });

  test("omits hint and input when absent", () => {
    const envelope = toErrorEnvelope(new LoreError("usage", "bad flag"));
    expect(envelope).toEqual({ error_type: "usage", message: "bad flag", principal: null });
    expect("hint" in envelope).toBe(false);
    expect("input" in envelope).toBe(false);
  });

  test("omits an empty-string hint", () => {
    const envelope = toErrorEnvelope(new LoreError("usage", "bad flag", ""));
    expect("hint" in envelope).toBe(false);
  });

  test("omits a null or primitive input (§5.2 types input as an object)", () => {
    expect("input" in toErrorEnvelope(new LoreError("not_found", "missing", undefined, null))).toBe(false);
    expect("input" in toErrorEnvelope(new LoreError("not_found", "missing", undefined, "raw-id"))).toBe(false);
    expect("input" in toErrorEnvelope(new LoreError("not_found", "missing", undefined, 0))).toBe(false);
  });

  test("omits an array input (§5.2 types input as an object, not an array)", () => {
    const envelope = toErrorEnvelope(new LoreError("conflict", "dupes", undefined, ["a", "b"]));
    expect("input" in envelope).toBe(false);
  });

  test("coerces a non-string hint to a string (§5.2 types hint as a string)", () => {
    const err = new LoreError("validation", "bad");
    // hint is `readonly string?`, but a JS caller can store a non-string; cast past it.
    (err as { hint?: unknown }).hint = { structured: true };
    const envelope = toErrorEnvelope(err);
    expect(typeof envelope.hint).toBe("string");
    expect(envelope.hint).toContain("structured");
  });

  test("coerces a non-string message to a string (§5.2 types message as a string)", () => {
    const err = new LoreError("validation", "ok");
    // Error.message is typed string but can be reassigned to anything at runtime.
    (err as { message: unknown }).message = { code: 7 };
    const envelope = toErrorEnvelope(err);
    expect(typeof envelope.message).toBe("string");
    expect(envelope.message).toContain("7");
  });

  test("collapses newlines in message and hint to keep them single-line (§5.2)", () => {
    const envelope = toErrorEnvelope(new LoreError("validation", "line1\nline2", "do a\nthen b"));
    expect(envelope.message).toBe("line1 line2");
    expect(envelope.hint).toBe("do a then b");
  });

  test("collapses Unicode line/paragraph separators too (U+2028/U+2029), not only CR/LF", () => {
    const envelope = toErrorEnvelope(new LoreError("validation", "line1\u2028line2", "do a\u2029then b"));
    expect(envelope.message).toBe("line1 line2");
    expect(envelope.hint).toBe("do a then b");
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
      principal: null,
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
    const envelope = JSON.parse(stderr.text());
    expect(envelope).toEqual({ error_type: "uncaught", message: "kaboom", principal: null });
    expect(Object.keys(envelope)).toEqual(["error_type", "message", "principal"]);
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

  test("--json survives a circular input: never throws, one parseable line, cycle broken", () => {
    const circular: Record<string, unknown> = { id: "a" };
    circular.self = circular;
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(new LoreError("validation", "bad frontmatter", "fix it", circular), { json: true, stderr });
    }).not.toThrow();
    expect(code).toBe(6);
    expect(stderr.lines()).toHaveLength(1);
    const parsed = JSON.parse(stderr.text());
    // The classifiable fields always survive; only the cycle is broken.
    expect(parsed.error_type).toBe("validation");
    expect(parsed.message).toBe("bad frontmatter");
    expect(parsed.hint).toBe("fix it");
    expect(parsed.input.id).toBe("a");
    expect(parsed.input.self).toBe("[Circular]");
  });

  test("--json survives a BigInt in input: never throws, BigInt coerced to string", () => {
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(new LoreError("usage", "too big", undefined, { n: 42n }), { json: true, stderr });
    }).not.toThrow();
    expect(code).toBe(2);
    expect(stderr.lines()).toHaveLength(1);
    expect(JSON.parse(stderr.text())).toEqual({
      error_type: "usage",
      message: "too big",
      input: { n: "42" },
      principal: null,
    });
  });

  test("--json survives a throwing toJSON on input: classifiable fields still survive", () => {
    const hostile = {
      toJSON(): never {
        throw new Error("toJSON boom");
      },
    };
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(new LoreError("validation", "bad frontmatter", "fix it", hostile), { json: true, stderr });
    }).not.toThrow();
    expect(code).toBe(6);
    expect(stderr.lines()).toHaveLength(1);
    const parsed = JSON.parse(stderr.text());
    // The whole point: error_type/message/hint must NOT be lost on the error path.
    expect(parsed.error_type).toBe("validation");
    expect(parsed.message).toBe("bad frontmatter");
    expect(parsed.hint).toBe("fix it");
  });

  test("--json isolates a throwing getter to its own field as [Unserializable]", () => {
    const input = {
      ok: "value",
      get bad(): string {
        throw new Error("getter boom");
      },
    };
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(new LoreError("not_found", "missing", undefined, input), { json: true, stderr });
    }).not.toThrow();
    expect(code).toBe(3);
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("not_found");
    expect(parsed.input.ok).toBe("value");
    expect(parsed.input.bad).toBe("[Unserializable]");
  });

  test("--json preserves shared acyclic (diamond) references instead of mislabeling [Circular]", () => {
    const shared = { x: 1 };
    // The BigInt forces the safe-serialization path; `shared` is referenced twice
    // but is NOT a cycle — both copies must survive in full.
    const input: Record<string, unknown> = { left: shared, right: shared, n: 7n };
    const stderr = capture();
    reportError(new LoreError("usage", "dup", undefined, input), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.left).toEqual({ x: 1 });
    expect(parsed.input.right).toEqual({ x: 1 });
    expect(parsed.input.n).toBe("7");
  });

  test("--json breaks only true cycles while keeping shared siblings", () => {
    const leaf = { id: "leaf" };
    const input: Record<string, unknown> = { a: leaf, b: leaf };
    input.self = input; // a genuine back-edge
    const stderr = capture();
    reportError(new LoreError("validation", "cyc", undefined, input), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.a).toEqual({ id: "leaf" });
    expect(parsed.input.b).toEqual({ id: "leaf" });
    expect(parsed.input.self).toBe("[Circular]");
  });

  test("--json combines circular and BigInt in one input", () => {
    const input: Record<string, unknown> = { n: 5n };
    input.self = input;
    const stderr = capture();
    reportError(new LoreError("validation", "both", undefined, input), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.n).toBe("5");
    expect(parsed.input.self).toBe("[Circular]");
  });

  test("--json keeps one line: message newlines collapse (§5.2), input newlines are preserved", () => {
    const stderr = capture();
    reportError(new LoreError("usage", "line1\nline2", undefined, { note: "a\nb" }), { json: true, stderr });
    expect(stderr.lines()).toHaveLength(1);
    const parsed = JSON.parse(stderr.text());
    // message is single-line per §5.2 (newlines collapsed to a space)...
    expect(parsed.message).toBe("line1 line2");
    // ...but input is echoed structured data, so its newlines survive (escaped).
    expect(parsed.input.note).toBe("a\nb");
  });

  test("text mode collapses a multi-line message to a single stderr line (§5.4)", () => {
    const stderr = capture();
    const code = reportError(new LoreError("validation", "first\nsecond", "fix a\nfix b"), { json: false, stderr });
    expect(code).toBe(6);
    // One logical error → one `error:` line and one `hint:` line; no orphan lines.
    expect(stderr.text()).toBe("error: first second\nhint: fix a fix b\n");
  });

  test("a non-LoreError with a hostile toString is reported as uncaught without throwing (json)", () => {
    const hostile = {
      toString(): never {
        throw new Error("toString boom");
      },
    };
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(hostile, { json: true, stderr });
    }).not.toThrow();
    expect(code).toBe(EXIT_UNCAUGHT);
    expect(stderr.lines()).toHaveLength(1);
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("uncaught");
    expect(typeof parsed.message).toBe("string");
  });

  test("a non-LoreError with a hostile Symbol.toPrimitive is reported as uncaught without throwing (text)", () => {
    const hostile = {
      [Symbol.toPrimitive](): never {
        throw new Error("toPrimitive boom");
      },
    };
    const stderr = capture();
    let code = -1;
    expect(() => {
      code = reportError(hostile, { json: false, stderr });
    }).not.toThrow();
    expect(code).toBe(EXIT_UNCAUGHT);
    expect(stderr.text()).toContain("error:");
  });

  test("an uncaught Error with a non-string message is coerced to a string in the envelope", () => {
    const weird = new Error("x");
    // Error.message is typed string but can be anything at runtime.
    (weird as { message: unknown }).message = { structured: true };
    const stderr = capture();
    reportError(weird, { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("uncaught");
    expect(typeof parsed.message).toBe("string");
  });

  test("a thrown non-Error object surfaces its detail, not [object Object]", () => {
    const stderr = capture();
    reportError({ code: "ENOENT", path: "/x", message: "file missing" }, { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("uncaught");
    // Prefers the object's own message field over String() => "[object Object]".
    expect(parsed.message).toBe("file missing");
  });

  test("a thrown non-Error object without a message is JSON-projected, not [object Object]", () => {
    const stderr = capture();
    reportError({ code: "EACCES", path: "/x" }, { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("uncaught");
    expect(parsed.message).not.toBe("[object Object]");
    expect(parsed.message).toContain("EACCES");
  });

  test("a thrown object with an empty-string message does not leak its other fields", () => {
    const stderr = capture();
    reportError({ message: "", token: "s3cret", cwd: "/home/u" }, { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.error_type).toBe("uncaught");
    // An empty own `message` is honored as-is; we must NOT fall back to dumping the
    // whole object, which would leak `token`/`cwd` the thrower kept out of `message`.
    expect(parsed.message).toBe("");
    expect(stderr.text()).not.toContain("s3cret");
    expect(stderr.text()).not.toContain("/home/u");
  });

  test("--json safe path honors a custom toJSON on input (fast/safe paths agree)", () => {
    // A BigInt sibling forces the safe-serialization path; the value with a
    // custom toJSON must still serialize via its toJSON, not its raw fields.
    const widget = { secret: "raw-internal", toJSON: () => ({ shown: "ok" }) };
    const stderr = capture();
    reportError(new LoreError("validation", "bad", undefined, { widget, n: 9n }), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.widget).toEqual({ shown: "ok" });
    expect(parsed.input.n).toBe("9");
  });

  test("--json safe path honors Date.toJSON (ISO string, not {})", () => {
    const when = new Date("2026-06-22T00:00:00.000Z");
    const stderr = capture();
    reportError(new LoreError("conflict", "stamp", undefined, { when, n: 1n }), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.when).toBe("2026-06-22T00:00:00.000Z");
  });

  test("--json safe path passes the property key to a custom toJSON (matches JSON.stringify)", () => {
    // toJSON echoes the key it receives; native JSON.stringify passes the property
    // name. A BigInt sibling forces the safe path, which must agree with the fast one.
    const keyed = {
      toJSON(key?: string): string {
        return `k=${String(key)}`;
      },
    };
    const stderr = capture();
    reportError(new LoreError("validation", "keyed", undefined, { field: keyed, n: 1n }), { json: true, stderr });
    const parsed = JSON.parse(stderr.text());
    expect(parsed.input.field).toBe("k=field");
    expect(parsed.input.n).toBe("1");
  });

  test("--json safe path preserves a '__proto__' data field in input (not swallowed by the setter)", () => {
    // Build via defineProperty: an object literal `{ __proto__: ... }` would set the
    // prototype, not create a data key. The BigInt sibling forces the safe path.
    const input: Record<string, unknown> = { keep: 2, n: 4n };
    Object.defineProperty(input, "__proto__", {
      value: { evil: 1 },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const stderr = capture();
    reportError(new LoreError("validation", "proto", undefined, input), { json: true, stderr });
    expect(stderr.lines()).toHaveLength(1);
    // The __proto__-named field must appear in the serialized envelope, matching the
    // fast JSON.stringify path instead of being silently dropped by the assignment.
    expect(stderr.text()).toContain('"__proto__":{"evil":1}');
    expect(JSON.parse(stderr.text()).input.keep).toBe(2);
  });
});

describe("ioError — the shared fs-errno policy (LORE-48)", () => {
  const spec = {
    denied: { message: "denied msg", hint: "denied hint" },
    notFound: { message: "missing msg", hint: "missing hint" },
    input: { path: "p" },
  };

  test("maps EACCES/EPERM to a denied LoreError (exit 4)", () => {
    for (const code of ["EACCES", "EPERM"]) {
      try {
        ioError({ code }, spec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(LoreError);
        expect((err as LoreError).type).toBe("denied");
        expect((err as LoreError).message).toBe("denied msg");
      }
    }
  });

  test("attaches the errno code to the LoreError input (LORE-48 review regression)", () => {
    try {
      ioError({ code: "EACCES" }, spec);
    } catch (err) {
      expect((err as LoreError).input).toEqual({ path: "p", code: "EACCES" });
    }
  });

  test("maps ENOENT to a not_found LoreError (exit 3)", () => {
    expect(() => ioError({ code: "ENOENT" }, spec)).toThrow(/missing msg/);
    try {
      ioError({ code: "ENOENT" }, spec);
    } catch (err) {
      expect((err as LoreError).type).toBe("not_found");
    }
  });

  test("maps an unknown errno to not_found by default (read-failure policy)", () => {
    try {
      ioError({ code: "EIO" }, spec);
    } catch (err) {
      expect((err as LoreError).type).toBe("not_found");
    }
  });

  test("re-throws an unknown errno unchanged when rethrowUnknown is set (stat-on-named-path policy)", () => {
    const cause = { code: "EIO", marker: true };
    try {
      ioError(cause, { ...spec, rethrowUnknown: true });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBe(cause); // the original cause, not a LoreError
    }
    // ENOENT still maps to not_found even under rethrowUnknown.
    try {
      ioError({ code: "ENOENT" }, { ...spec, rethrowUnknown: true });
    } catch (err) {
      expect((err as LoreError).type).toBe("not_found");
    }
  });
});

describe("stderrHint — ANSI/control-byte stripping and length cap (LORE-249)", () => {
  test("returns undefined for empty stderr", () => {
    expect(stderrHint("")).toBeUndefined();
  });

  test("returns undefined for whitespace-only stderr, including newlines/tabs (existing contract preserved)", () => {
    expect(stderrHint("   ")).toBeUndefined();
    expect(stderrHint("\n\t \r\n")).toBeUndefined();
  });

  test("trims and collapses internal whitespace runs to a single space", () => {
    expect(stderrHint("  fatal:   not a git   repository  \n")).toBe("fatal: not a git repository");
  });

  test("collapses a line break into a single space, not a glued word (whitespace collapses before the control-byte strip)", () => {
    expect(stderrHint("first line\nsecond line")).toBe("first line second line");
  });

  test("strips ANSI CSI/SGR sequences and a bare BEL, leaving no control byte behind (AC#1/AC#4)", () => {
    const stderr = "fatal: \x1b[31mrejected\x1b[0m\x07 push";
    const hint = stderrHint(stderr);
    expect(hint).toBeDefined();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ABSENCE of control bytes.
    expect(/[\x00-\x1f\x7f-\x9f]/.test(hint as string)).toBe(false);
    expect(hint).not.toContain("\x1b");
    expect(hint).toBe("fatal: rejected push");
  });

  test("strips an OSC hyperlink sequence terminated by BEL", () => {
    const hint = stderrHint("see \x1b]8;;http://evil\x07link\x07 for detail");
    expect(hint).toBeDefined();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ABSENCE of control bytes.
    expect(/[\x00-\x1f\x7f-\x9f]/.test(hint as string)).toBe(false);
  });

  test("returns undefined when the stderr is control bytes/ANSI only (nothing survives the strip)", () => {
    expect(stderrHint("\x1b[31m\x1b[0m")).toBeUndefined();
    expect(stderrHint("\x07")).toBeUndefined();
  });

  test("caps an over-length stderr to the bounded max, with a truncation indicator (AC#2/AC#5)", () => {
    const huge = "x".repeat(5000);
    const hint = stderrHint(huge) as string;
    expect(hint).toBeDefined();
    expect(hint.length).toBeLessThanOrEqual(501); // cap + 1-char truncation indicator
    expect(hint.length).toBeLessThan(huge.length);
    expect(hint.endsWith("…")).toBe(true);
  });

  test("does not add a truncation indicator when stderr is within the cap", () => {
    const short = "fatal: something went wrong";
    expect(stderrHint(short)).toBe(short);
    expect((stderrHint(short) as string).endsWith("…")).toBe(false);
  });
});

describe("WarningCollector", () => {
  test("starts empty", () => {
    const warnings = new WarningCollector();
    expect(warnings.isEmpty).toBe(true);
    expect(warnings.count).toBe(0);
    expect(warnings.list()).toEqual([]);
  });

  test("accumulates and merges in insertion order while reporting a snapshot copy", () => {
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

    const more = new WarningCollector();
    more.add("unreadable directory", "unreadable-directory");
    warnings.merge(more);
    more.add("late mutation", "late");
    expect(warnings.list()).toEqual(["unknown type 'Widget'", "missing summary", "unreadable directory"]);
    expect(warnings.has("unreadable-directory")).toBe(true);
    expect(warnings.has("late")).toBe(false);
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

  test("flush is non-draining: a second flush re-emits and count/list are unchanged", () => {
    const warnings = new WarningCollector();
    warnings.add("first");
    warnings.add("second");
    const a = capture();
    expect(warnings.flush({ stderr: a })).toBe(2);
    expect(a.lines()).toEqual(["warning: first", "warning: second"]);
    const b = capture();
    expect(warnings.flush({ stderr: b })).toBe(2);
    expect(b.lines()).toEqual(["warning: first", "warning: second"]);
    expect(warnings.count).toBe(2);
    expect(warnings.list()).toEqual(["first", "second"]);
  });

  test("flush collapses a message with embedded newlines to one stderr line (LORE-172)", () => {
    const warnings = new WarningCollector();
    warnings.add("first line\nsecond line");
    const stderr = capture();
    expect(warnings.flush({ stderr })).toBe(1);
    // Same single-line normalization formatErrorText/toErrorEnvelope apply to a
    // LoreError's message/hint (§5.2/§5.4): one warning → exactly one stderr line.
    expect(stderr.lines()).toEqual(["warning: first line second line"]);
  });

  test("flush strips embedded ANSI/OSC/control bytes from the message body (LORE-236)", () => {
    const warnings = new WarningCollector();
    // A CSI "erase screen" sequence, an OSC hyperlink sequence (BEL-terminated), and a bare
    // BEL — none of these are line terminators, so singleLine alone would let them through;
    // flush must also route the body through the shared stripAnsiAndControls (errors.ts:168).
    warnings.add("before\x1b[2Jmid\x1b]8;;http://evil\x07link\x07after");
    const stderr = capture();
    expect(warnings.flush({ stderr })).toBe(1);
    expect(stderr.lines()).toEqual(["warning: beforemidlinkafter"]);
    // No raw escape/control byte survived into the emitted line — exclude the trailing `\n`
    // line terminator `write` itself appends, which is expected and not part of the message body.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ABSENCE of control bytes.
    expect(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(stderr.text())).toBe(false);
  });

  test("flush sanitizes the message body but leaves the painted warning: prefix and its color intact (LORE-236, AC#2)", () => {
    const warnings = new WarningCollector();
    warnings.add("danger\x1b[2Jzone");
    const colored = capture();
    expect(warnings.flush({ stderr: colored, color: true })).toBe(1);
    // The prefix keeps its yellow SGR sequence and reset — sanitization never touches it,
    // only the message body that follows it.
    expect(colored.text()).toBe("\x1b[33mwarning:\x1b[0m dangerzone\n");
  });
});

describe("stdout discipline", () => {
  test("reportError and flush never write to process.stdout", () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // biome-ignore lint/suspicious/noExplicitAny: spying on the stream signature
    process.stdout.write = ((chunk: any) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const stderr = capture();
      reportError(new LoreError("not_found", "missing", "do x", { id: "a" }), { json: true, stderr });
      reportError(new Error("boom"), { json: true, stderr });
      reportError("plain", { json: false, stderr });
      const warnings = new WarningCollector();
      warnings.add("w");
      warnings.flush({ stderr });
    } finally {
      process.stdout.write = original;
    }
    expect(writes).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { run } from "../src/cli";
import { type InstructionsOptions, runInstructions } from "../src/commands/instructions";
import { INSTRUCTION_TOPICS } from "../src/core/instructions";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

interface InstructionsData {
  topic: string;
  title: string;
  body: string;
  topics: ReadonlyArray<{ key: string; title: string }>;
}

/** Run `instructions` in JSON mode and return the parsed `data` payload plus the exit code. */
function instructions(
  args: string[],
  options?: Partial<InstructionsOptions>,
): { code: number; data: InstructionsData } {
  const stdout = capture();
  const code = runInstructions({ output: JSON_CTX, args, stdout, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: InstructionsData };
  expect(envelope.kind).toBe("instructions.text");
  return { code, data: envelope.data };
}

describe("core/instructions — topic registry", () => {
  test("overview is first and every key is unique", () => {
    expect(INSTRUCTION_TOPICS[0]?.key).toBe("overview");
    const keys = INSTRUCTION_TOPICS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the overview body lists every detail topic's key", () => {
    const overview = INSTRUCTION_TOPICS.find((t) => t.key === "overview");
    for (const topic of INSTRUCTION_TOPICS.filter((t) => t.key !== "overview")) {
      expect(overview?.body).toContain(topic.key);
    }
  });
});

describe("runInstructions — topic resolution", () => {
  test("no args defaults to the overview topic", () => {
    const { code, data } = instructions([]);
    expect(code).toBe(0);
    expect(data.topic).toBe("overview");
    expect(data.body).toContain("canonical");
  });

  test("`overview` explicitly is the same as no args", () => {
    const { data } = instructions(["overview"]);
    expect(data.topic).toBe("overview");
  });

  test("each detail topic resolves to its own body", () => {
    for (const key of ["linking", "sync", "check", "validation"]) {
      const { code, data } = instructions([key]);
      expect(code).toBe(0);
      expect(data.topic).toBe(key);
      expect(data.body.length).toBeGreaterThan(0);
    }
  });

  test("the data payload always carries the full topic index", () => {
    const { data } = instructions(["check"]);
    expect(data.topics.map((t) => t.key)).toEqual(INSTRUCTION_TOPICS.map((t) => t.key));
  });

  test("an unknown topic is a not_found error whose hint lists the valid keys", () => {
    const err = expectError("not_found", () => runInstructions({ output: JSON_CTX, args: ["bogus"] }));
    expect(err.message).toContain("bogus");
    expect(err.hint).toContain("overview");
    expect(err.hint).toContain("linking");
  });
});

describe("runInstructions — argument parsing (usage errors)", () => {
  test("an unknown flag is a usage error", () => {
    expectError("usage", () => runInstructions({ output: JSON_CTX, args: ["--bogus"] }));
  });

  test("a second positional is a usage error", () => {
    expectError("usage", () => runInstructions({ output: JSON_CTX, args: ["sync", "extra"] }));
  });
});

describe("runInstructions — output modes", () => {
  test("--plain renders ANSI-free text with the title and body", () => {
    const stdout = capture();
    const code = runInstructions({ output: PLAIN_CTX, args: ["check"], stdout });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("lore check");
  });
});

describe("cli — instructions wiring", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore instructions` runs through the router and exits 0", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("instructions"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(0);
    expect(stdout.text().length).toBeGreaterThan(0);
  });

  test("`lore instructions <bogus>` exits 3 through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("instructions", "bogus"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(3);
  });

  test("`lore --help` lists the instructions command", () => {
    const stdout = capture();
    const stderr = capture();
    run(argv("--help"), { stdout, stderr, isTTY: false, env: {} });
    expect(stdout.text()).toContain("instructions");
  });
});

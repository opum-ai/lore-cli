import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RENDER_WIDTH,
  neutraliseControls,
  renderMarkdownForTerminal,
  renderWidth,
} from "../src/core/markdown-render";

/** Every SGR sequence the renderer itself emits — the only escapes a rendering may contain. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the renderer's own SGR sequences.
const SGR_PATTERN = /\x1b\[[0-9;]*m/g;

const color = (source: string, width = 80): string => renderMarkdownForTerminal(source, { color: true, width });
const mono = (source: string, width = 80): string => renderMarkdownForTerminal(source, { color: false, width });
const visible = (text: string): string => text.replace(SGR_PATTERN, "");

/**
 * Anything left that could drive a terminal once the renderer's own SGR is removed: C0 except LF,
 * DEL and C1, and the bidi/invisible format characters `stripAnsiAndControls` removes.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the assertion is precisely that none remain.
const DANGEROUS = /[\x00-\x09\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩​⁠﻿]/;

describe("renderMarkdownForTerminal — structure (LCLI-615 AC1)", () => {
  test("headings keep their level marker and lose none of their text", () => {
    const out = mono("# Top\n\n## Second\n\n### Third");
    expect(out).toBe("# Top\n\n## Second\n\n### Third");
    expect(color("# Top")).toContain("\x1b[1m\x1b[4mTop");
  });

  test("emphasis, strong, strikethrough and inline code are styled with color and marked without", () => {
    const source = "a *em* b **strong** c ~~gone~~ d `code`";
    expect(mono(source)).toBe("a _em_ b **strong** c ~~gone~~ d `code`");
    const out = color(source);
    expect(out).toContain("\x1b[3mem\x1b[0m");
    expect(out).toContain("\x1b[1mstrong\x1b[0m");
    expect(out).toContain("\x1b[9mgone\x1b[0m");
    expect(out).toContain("\x1b[36mcode\x1b[0m");
    expect(visible(out)).toBe("a em b strong c gone d code");
  });

  test("bullet, ordered, nested and task lists render with their markers aligned", () => {
    const out = mono("- one\n- two\n  - nested\n- [x] done\n- [ ] todo\n\n9. nine\n10. ten");
    expect(out).toBe(
      ["• one", "• two", "  • nested", "• [x] done", "• [ ] todo", "", "9.  nine", "10. ten"].join("\n"),
    );
  });

  test("a continuation line of a wrapped list item hangs under its text", () => {
    const out = mono("- alpha beta gamma delta", 14);
    expect(out).toBe("• alpha beta\n  gamma delta");
  });

  test("block quotes carry a bar on every line, including between paragraphs", () => {
    expect(mono("> first\n>\n> second")).toBe("│ first\n│\n│ second");
  });

  test("fenced code is indented, never reflowed, and an over-wide line is cut with an ellipsis", () => {
    const long = `x = "${"y".repeat(60)}"`;
    const out = mono(`\`\`\`py\nshort one\n\tindented\n${long}\n\`\`\``, 30);
    const lines = out.split("\n");
    expect(lines[0]).toBe("    short one");
    expect(lines[1]).toBe("        indented");
    expect(lines[2]).toHaveLength(30);
    expect(lines[2]?.endsWith("…")).toBe(true);
    expect(lines[2]?.startsWith('    x = "yyy')).toBe(true);
    // Not wrapped onto a second line: the three code lines are the whole output.
    expect(lines).toHaveLength(3);
  });

  test("links render as `text (url)`, an autolink as the bare URL, and never as an OSC 8 hyperlink", () => {
    const out = color("See [the site](https://example.com) and <https://auto.example>.");
    expect(visible(out)).toBe("See the site (https://example.com) and https://auto.example.");
    expect(out).not.toContain("\x1b]8");
    expect(mono("[ref text][r]\n\n[r]: https://ref.example")).toBe(
      "ref text (https://ref.example)\n\n[r]: https://ref.example",
    );
  });

  test("GFM tables render as aligned columns with a rule under the header", () => {
    const out = mono("| Name | Qty |\n|:-----|----:|\n| a | 1 |\n| bb | 22 |");
    expect(out).toBe(["Name │ Qty", "─────┼────", "a    │   1", "bb   │  22"].join("\n"));
    expect(color("| H |\n|---|\n| v |").split("\n")[0]).toBe("\x1b[1mH\x1b[0m");
  });

  test("a table wider than the terminal shrinks its widest column and cuts the cell", () => {
    const out = mono(`| k | v |\n|---|---|\n| a | ${"w".repeat(50)} |`, 20);
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
    expect(out).toContain("…");
  });

  test("prose is word-wrapped to the width, and a style never runs across a line break", () => {
    const out = color("**bold words that run on and on past the edge**", 20);
    for (const line of out.split("\n")) {
      expect(visible(line).length).toBeLessThanOrEqual(20);
      // Every line that opens a style closes it before its end.
      expect(line.endsWith("\x1b[0m")).toBe(true);
    }
  });

  test("a thematic break is a rule, and inline HTML and footnotes survive as text", () => {
    expect(mono("a\n\n---\n\nb")).toBe(`a\n\n${"─".repeat(80)}\n\nb`);
    expect(mono("a\n\n---\n\nb", 30)).toBe(`a\n\n${"─".repeat(30)}\n\nb`);
    expect(mono("x<br>y")).toBe("x<br>y");
    expect(mono("Claim[^1].\n\n[^1]: Source.")).toBe("Claim[^1].\n\n[^1]: Source.");
  });
});

describe("renderMarkdownForTerminal — control sequences are neutralised (LCLI-615 AC2)", () => {
  const HOSTILE = [
    "# Title \x1b[2J\x1b[H",
    "",
    "Text with \x1b[31mred\x1b[0m, a bell\x07, a C1 CSI \x9b2J, an OSC \x1b]0;pwned\x07 title,",
    "a hyperlink \x1b]8;;https://evil.example\x1b\\click\x1b]8;;\x1b\\ and a backspace\x08.",
    "",
    "```",
    "code \x1b[1Aup",
    "```",
    "",
    "| a\x1b[5m | b |",
    "|---|---|",
    "| \x1b[7mx | y |",
  ].join("\n");

  test("no ESC, C0 (other than line feed) or C1 byte from the body reaches the output, in either color mode", () => {
    for (const out of [color(HOSTILE), mono(HOSTILE)]) {
      expect(DANGEROUS.test(visible(out))).toBe(false);
      // The only escapes left are the renderer's own SGR, and with color off there are none.
      expect(visible(out)).not.toContain("\x1b");
    }
    expect(mono(HOSTILE)).not.toContain("\x1b");
  });

  test("the text around a stripped sequence survives", () => {
    const out = mono(HOSTILE);
    expect(out).toContain("Text with red, a bell, a C1 CSI 2J");
    expect(out).toContain("click");
    expect(out).toContain("code up");
  });

  test("character references that DECODE to a control or a bidi override are neutralised too", () => {
    // micromark keeps code points 9, 10, 12 and 13 and every format character, so a strip of the
    // source alone would let these through: they are not control bytes until the parser decodes them.
    const out = mono("a&#13;b &#12;c &#x202E;d &#x2066;e [x](https://a.example/&#13;)");
    expect(DANGEROUS.test(out)).toBe(false);
    expect(out).toBe("ab c d e x (https://a.example/)");
  });

  test("neutraliseControls keeps line feeds and tabs and removes everything stripAnsiAndControls does", () => {
    expect(neutraliseControls("a\tb\nc\x1b[31md\re‮f")).toBe("a\tb\ncdef");
  });
});

describe("renderMarkdownForTerminal — NO_COLOR keeps layout (LCLI-615 AC3)", () => {
  const DOC = "# H\n\n- item **b**\n\n> q\n\n```\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |";

  test("color off emits no escape at all", () => {
    expect(mono(DOC)).not.toContain("\x1b");
  });

  test("color off is the color-on layout with the styling removed, apart from the textual markers", () => {
    const expected = ["# H", "", "• item **b**", "", "│ q", "", "    code", "", "a │ b", "──┼──", "1 │ 2"].join("\n");
    expect(mono(DOC)).toBe(expected);
    // Same lines, same order, same layout glyphs with color on.
    expect(visible(color(DOC))).toBe(expected.replace("**b**", "b"));
  });
});

describe("renderWidth", () => {
  test.each([
    [120, 120],
    [20, 20],
    [undefined, DEFAULT_RENDER_WIDTH],
    [0, DEFAULT_RENDER_WIDTH],
    [5, DEFAULT_RENDER_WIDTH],
    [Number.NaN, DEFAULT_RENDER_WIDTH],
    [80.5, DEFAULT_RENDER_WIDTH],
  ])("columns %p renders at %p", (columns, expected) => {
    expect(renderWidth(columns)).toBe(expected);
  });
});

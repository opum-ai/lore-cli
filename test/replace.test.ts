import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
// A namespace import alongside the named one above: `spyOn` (LORE-116's commit-phase-atomicity test)
// needs the module object itself to patch `writeFileSync` in place, not the already-bound named export.
import * as fs from "node:fs";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { run } from "../src/cli";
import {
  assertNoSymlinkInPath,
  writeAllBytes,
  writeFileAtomic,
  writeFileNoFollow,
  writeFileOverwriting,
} from "../src/commands/fswrite";
import { type ReplaceReport, runReplace } from "../src/commands/replace";
import { INDEX_BLOCK_BEGIN, INDEX_BLOCK_END } from "../src/core/indexes";
import { TASK_BLOCK_BEGIN, TASK_BLOCK_END } from "../src/core/managed-block";
import type { TextRange } from "../src/core/replace";
import {
  compileReplacer,
  locatorThrowsOnDuplicate,
  MANAGED_REGION_LOCATORS,
  managedRanges,
  mergeRanges,
  replaceInText,
} from "../src/core/replace";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

/** A well-formed index managed block with the given listing line. */
function indexBlock(line: string): string {
  return `${INDEX_BLOCK_BEGIN}\n${line}\n${INDEX_BLOCK_END}`;
}

/** A well-formed tasks managed block with the given table line. */
function tasksBlock(line: string): string {
  return `${TASK_BLOCK_BEGIN}\n${line}\n${TASK_BLOCK_END}`;
}

// ── core: replaceInText (the pure engine) ────────────────────────────────────────

describe("replaceInText — literal mode", () => {
  test("replaces every occurrence and counts them", () => {
    const out = replaceInText("soft delete the soft delete", "soft delete", "soft-delete");
    expect(out).toEqual({ text: "soft-delete the soft-delete", count: 2 });
  });

  test("a no-match pass returns the input bytes unchanged (count 0)", () => {
    const text = "nothing to do here";
    expect(replaceInText(text, "absent", "x")).toEqual({ text, count: 0 });
  });

  test("treats regex metacharacters in the find as literal text", () => {
    expect(replaceInText("axb a.b", "a.b", "Z")).toEqual({ text: "axb Z", count: 1 });
  });

  test("inserts a literal `$` in the replacement verbatim (no $1 substitution)", () => {
    expect(replaceInText("price", "price", "$5").text).toBe("$5");
  });

  test("an empty find is a usage error", () => {
    expect(() => replaceInText("abc", "", "x")).toThrow(LoreError);
  });
});

describe("replaceInText — regex mode matches String.replace semantics", () => {
  // With no managed regions, the engine must equal a plain global String.replace — this pins the
  // explicit $-expansion (used so the single managed-aware pass keeps native substitution).
  const cases: Array<{ text: string; find: string; replace: string }> = [
    { text: "a@b and c@d", find: "(\\w+)@(\\w+)", replace: "$2.$1" }, // numbered groups
    { text: "alice bob", find: "(?<who>\\w+)", replace: "[$<who>]" }, // named group
    { text: "wrap me", find: "wrap", replace: "$$$&$$" }, // $$ literal + $& whole match
    { text: "abcXdef", find: "X", replace: "<$`|$'>" }, // prefix/suffix tokens
    { text: "v1", find: "v(\\d)", replace: "$10" }, // $1 then literal 0 (one group only)
    { text: "ab", find: "(a)", replace: "$9" }, // out-of-range group number stays literal
    { text: "drop the the dup", find: "the the", replace: "the" }, // overlap-free literal-ish
  ];
  for (const { text, find, replace } of cases) {
    test(`/${find}/g → "${replace}"`, () => {
      const expected = text.replace(new RegExp(find, "g"), replace);
      expect(replaceInText(text, find, replace, { regex: true })).toEqual({
        text: expected,
        count: (text.match(new RegExp(find, "g")) ?? []).length,
      });
    });
  }

  test("an invalid regex is a usage error", () => {
    try {
      replaceInText("abc", "(", "x", { regex: true });
      throw new Error("expected a LoreError");
    } catch (err) {
      expect((err as LoreError).type).toBe("usage");
    }
  });

  test.each(["x*", "a?", ".*", "\\b", "(?:)", "^"])("rejects the empty-matching pattern /%s/", (pattern) => {
    expect(() => compileReplacer(pattern, "Y", { regex: true })).toThrow(LoreError);
  });

  test("a zero-width match that slips past the compile probe is refused at apply time", () => {
    // `(?<=Q)` matches the empty string after a Q. The compile-time probe has no Q, so it passes
    // compilation; applying it to text containing Q hits the defensive apply-time guard.
    const replacer = compileReplacer("(?<=Q)", "X", { regex: true });
    expect(() => replacer("QQ")).toThrow(LoreError);
  });

  test("anchors bind to the whole document, not to the gaps around a managed block (review #4)", () => {
    const text = `foo\n\n${indexBlock("- [foo](foo.md)")}\n\nfoo`;
    // `foo$` (no /m) matches only the document-final foo — not the foo that merely precedes the block.
    const out = replaceInText(text, "foo$", "BAR", { regex: true });
    expect(out.count).toBe(1);
    expect(out.text.startsWith("foo\n")).toBe(true); // leading foo untouched
    expect(out.text.endsWith("\nBAR")).toBe(true); // trailing foo replaced
  });

  // LORE-163: `$<name>` must stay a literal token when it can't be resolved, never silently vanish.
  describe("`$<name>` with no matching named group is left literal, not deleted (LORE-163)", () => {
    test("AC#1 — the regex has no named groups at all", () => {
      // Native `String.prototype.replace` leaves an unresolvable $<name> as a literal substring when
      // the regex declares zero named groups; this must not silently delete it from the output.
      const out = replaceInText("abc", "b", "[$<name>]", { regex: true });
      expect(out).toEqual({ text: "a[$<name>]c", count: 1 });
      expect(out.text).toBe("abc".replace(/b/g, "[$<name>]")); // pins it to native semantics
    });

    test("AC#2 — a template referencing a named group that IS present still substitutes the capture", () => {
      const out = replaceInText("abc", "(?<name>b)", "[$<name>]", { regex: true });
      expect(out).toEqual({ text: "a[b]c", count: 1 });
    });

    test("AC#3 — the regex has named groups, but not this one, still falls back to the literal token", () => {
      // Native String.replace substitutes "" here (it only special-cases zero named groups); this
      // engine deliberately leaves $<name> literal in both cases so an unresolvable token is never
      // silently deleted from the document.
      const out = replaceInText("abc", "(?<x>b)", "[$<name>]", { regex: true });
      expect(out).toEqual({ text: "a[$<name>]c", count: 1 });
    });

    test("AC#3 — a declared-but-non-participating named group substitutes empty, not the literal token", () => {
      // The name IS declared on the pattern (so `in match.groups` is true) — it just didn't match this
      // time. That is a resolved reference to an empty capture, distinct from an unresolvable name.
      const out = replaceInText("bc", "(?<name>a)?(?<mid>b)", "[$<name>]", { regex: true });
      expect(out).toEqual({ text: "[]c", count: 1 });
    });
  });
});

describe("replaceInText — managed regions are never touched (AC#1)", () => {
  test("a match inside an index block is neither replaced nor counted", () => {
    const text = `intro foo\n\n${indexBlock("- [foo](foo.md)")}\n\noutro foo`;
    const out = replaceInText(text, "foo", "BAR");
    expect(out.count).toBe(2); // only the two prose occurrences
    expect(out.text).toContain(indexBlock("- [foo](foo.md)")); // block byte-identical
    expect(out.text.startsWith("intro BAR")).toBe(true);
    expect(out.text.endsWith("outro BAR")).toBe(true);
  });

  test("a match that exists ONLY inside the managed region is a no-op", () => {
    const text = `prose\n\n${indexBlock("- [foo](foo.md)")}\n\nprose`;
    expect(replaceInText(text, "foo.md", "x.md")).toEqual({ text, count: 0 });
  });

  test("two blocks in one file (a duplicated marker pair) is a validation error, not a silent collapse (LORE-86)", () => {
    const text = `before tok\n${indexBlock("- a")}\nMIDDLE tok\n${indexBlock("- b")}\nafter tok`;
    // Previously the MIDDLE prose between the two blocks was silently swallowed into a single
    // collapsed managed span (first-begin→last-end); LORE-86 makes this a fail-loud error instead,
    // since replace could never know whether "MIDDLE tok" was meant to be edited or protected.
    expect(() => replaceInText(text, "tok", "X")).toThrow(LoreError);
  });

  test("a match inside a lore:tasks block is neither replaced nor counted (LORE-73)", () => {
    const text = `intro foo\n\n${tasksBlock("| [foo](foo.md) | Foo | Done |")}\n\noutro foo`;
    const out = replaceInText(text, "foo", "BAR");
    expect(out.count).toBe(2); // only the two prose occurrences
    expect(out.text).toContain(tasksBlock("| [foo](foo.md) | Foo | Done |")); // block byte-identical
    expect(out.text.startsWith("intro BAR")).toBe(true);
    expect(out.text.endsWith("outro BAR")).toBe(true);
  });

  test("a match that exists ONLY inside a lore:tasks block is a no-op (LORE-73)", () => {
    const text = `prose\n\n${tasksBlock("| [foo](foo.md) | Foo | Done |")}\n\nprose`;
    expect(replaceInText(text, "foo.md", "x.md")).toEqual({ text, count: 0 });
  });

  test("an index block and a tasks block in the same doc both protect their own matches (LORE-73)", () => {
    const text = `${indexBlock("- [tok](tok.md)")}\nprose tok\n${tasksBlock("| [tok](tok.md) | Tok | Done |")}`;
    const out = replaceInText(text, "tok", "X");
    expect(out.count).toBe(1); // only the prose occurrence
    expect(out.text).toContain(indexBlock("- [tok](tok.md)"));
    expect(out.text).toContain(tasksBlock("| [tok](tok.md) | Tok | Done |"));
    expect(out.text).toContain("prose X");
  });
});

describe("replaceInText — an expansion that would inject a managed marker is rejected (LORE-162)", () => {
  // applyReplacement's overlapsManaged guard only screens the ORIGINAL matched span, before `expand`
  // runs. In regex mode, `` $` ``/`$'` copy the document's own prefix/suffix verbatim into the
  // replacement, so a match sitting entirely outside a managed region can still expand into a splice
  // that carries an existing managed-block marker along with it — duplicating the marker with no
  // post-expansion check. These pin that the duplicate is rejected rather than silently written out.

  test("$` copying a preceding index block duplicates its marker and is rejected, not silently written (LORE-162)", () => {
    const text = `${indexBlock("- [x](x.md)")}\nTOKEN`;
    // `$\`` expands to everything before the match — the entire index block — which would splice a
    // second copy of INDEX_BLOCK_BEGIN/END in at TOKEN's position, right next to the untouched original.
    let thrown: unknown;
    try {
      replaceInText(text, "TOKEN", "$`", { regex: true });
      throw new Error("expected a LoreError");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("usage");
    expect((thrown as LoreError).message).toContain(INDEX_BLOCK_BEGIN);
  });

  test("$' copying a following tasks block duplicates its marker and is rejected, not silently written (LORE-162)", () => {
    const text = `TOKEN\n${tasksBlock("| [x](x.md) | X | Done |")}`;
    // `$'` expands to everything after the match — the entire tasks block — which would splice a
    // second copy of TASK_BLOCK_BEGIN/END in at TOKEN's position, right before the untouched original.
    let thrown: unknown;
    try {
      replaceInText(text, "TOKEN", "$'", { regex: true });
      throw new Error("expected a LoreError");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("usage");
    expect((thrown as LoreError).message).toContain("lore:tasks");
    expect((thrown as LoreError).message).toContain("duplicated");
  });

  test("a $` expansion that stays clear of any managed marker still replaces normally (no false positive)", () => {
    const text = `prefix TOKEN\n\n${indexBlock("- [x](x.md)")}`;
    const out = replaceInText(text, "TOKEN", "$`", { regex: true });
    expect(out.count).toBe(1);
    expect(out.text).toContain(indexBlock("- [x](x.md)")); // block untouched, single copy
  });
});

describe("managedRanges", () => {
  test("locates a well-formed index block including its markers", () => {
    const text = `a\n${indexBlock("x")}\nb`;
    const ranges = managedRanges(text);
    expect(ranges).toHaveLength(1);
    const r = ranges[0];
    if (r === undefined) {
      throw new Error("expected one range");
    }
    expect(text.slice(r.start, r.end)).toBe(indexBlock("x"));
  });

  test("a begin with no matching end is a validation error (LORE-86), not a guessed truncated-to-EOF span", () => {
    const text = `a\n${INDEX_BLOCK_BEGIN}\nx\nno end marker`;
    expect(() => managedRanges(text)).toThrow(LoreError);
  });

  test("two blocks (a duplicated marker pair) is a validation error, not a collapsed first-begin→last-end span (LORE-86)", () => {
    const text = `${indexBlock("a")}\nmid\n${indexBlock("b")}`;
    expect(() => managedRanges(text)).toThrow(LoreError);
  });

  test("no markers means no protected ranges", () => {
    expect(managedRanges("plain prose, no markers")).toEqual([]);
  });

  test("locates a well-formed tasks block including its markers (LORE-73)", () => {
    const text = `a\n${tasksBlock("| [x](x.md) | X | Done |")}\nb`;
    const ranges = managedRanges(text);
    expect(ranges).toHaveLength(1);
    const r = ranges[0];
    if (r === undefined) {
      throw new Error("expected one range");
    }
    expect(text.slice(r.start, r.end)).toBe(tasksBlock("| [x](x.md) | X | Done |"));
  });

  test("an index block and a tasks block both register as separate protected ranges (LORE-73)", () => {
    const text = `${indexBlock("- a")}\nmid\n${tasksBlock("| [b](b.md) | B | Done |")}`;
    const ranges = managedRanges(text);
    expect(ranges).toHaveLength(2);
  });

  test("a doc merely citing the lore:tasks marker syntax in prose has nothing protected (LORE-73)", () => {
    // The exact shape this project's own ADRs use to document the format — a literal indexOf scan
    // would misfire here (false "duplicated"/"unmatched" error, or silently protect the sentence);
    // the structural locateTaskBlock must see zero real managed regions.
    const text = `Re-render every \`${TASK_BLOCK_BEGIN}\` … \`${TASK_BLOCK_END}\` region foo on sync.`;
    expect(managedRanges(text)).toEqual([]);
    const out = replaceInText(text, "foo", "BAR");
    expect(out.count).toBe(1);
    expect(out.text).toContain("BAR");
  });

  test("three prose/fenced citations of lore:tasks markers (no real block) does not throw (LORE-73)", () => {
    // Reproduces the exact live regression this fix closed: docs/adr/0008-managed-block-remark-ast.md
    // cites the marker syntax three times (a fenced example plus inline citations), with no real
    // top-level block. A literal indexOf scan sees 3 begins/3 ends and throws "duplicated" — this
    // must not throw, and a foo/BAR match outside the citations must still be replaced.
    const text =
      "```markdown\n" +
      tasksBlock("example") +
      "\n```\n\n" +
      `Also written as \`${TASK_BLOCK_BEGIN}\` … \`${TASK_BLOCK_END}\`.\n\nfoo here.`;
    expect(managedRanges(text)).toEqual([]);
    const out = replaceInText(text, "foo", "BAR");
    expect(out.count).toBe(1);
    expect(out.text).toContain("BAR here");
  });
});

describe("MANAGED_REGION_LOCATORS — throw-on-duplicate contract (LORE-194)", () => {
  // assertNoInjectedMarker's LORE-162 guarantee (a `$`/$'` expansion that copies an existing marker
  // into the rewritten result is rejected) holds only because every registered locator THROWS when
  // its marker occurs more than once, even when both copies are individually well-formed blocks — a
  // locator that instead returned the first span would let re-validation pass silently, reopening
  // LORE-162 for that marker kind with no existing test failing. These pin that requirement
  // explicitly rather than leaving it an incidental property of the two locators that happen to
  // exist today.

  test("every currently-registered locator throws (not first-span) on its own well-formed duplicated marker", () => {
    expect(MANAGED_REGION_LOCATORS.length).toBeGreaterThan(0); // guard against an accidentally-emptied registry
    for (const { locate, duplicateProbe } of MANAGED_REGION_LOCATORS) {
      expect(locatorThrowsOnDuplicate(locate, duplicateProbe)).toBe(true);
    }
  });

  test("the guard itself flags a locator that returns the first span on a well-formed duplicate — the exact regression this pins", () => {
    // A synthetic locator mimicking the bug this task guards against: given a well-formed duplicated
    // marker, it returns the FIRST span instead of throwing. If a future locator were registered with
    // this shape, the test above would fail — this test proves the detection logic itself works,
    // rather than only exercising it indirectly through the two locators that already pass.
    const firstSpanOnDuplicate = (text: string): TextRange | null => {
      const start = text.indexOf(INDEX_BLOCK_BEGIN);
      if (start === -1) {
        return null;
      }
      const endAt = text.indexOf(INDEX_BLOCK_END, start);
      return endAt === -1 ? null : { start, end: endAt + INDEX_BLOCK_END.length };
    };
    const duplicateProbe = `${indexBlock("a")}\n${indexBlock("b")}`;
    // Sanity: the synthetic locator really is well-formed enough to find a span (not vacuously null).
    expect(firstSpanOnDuplicate(duplicateProbe)).not.toBeNull();
    expect(locatorThrowsOnDuplicate(firstSpanOnDuplicate, duplicateProbe)).toBe(false);
  });
});

describe("mergeRanges", () => {
  test("empty and single inputs pass through unchanged", () => {
    expect(mergeRanges([])).toEqual([]);
    expect(mergeRanges([{ start: 2, end: 5 }])).toEqual([{ start: 2, end: 5 }]);
  });

  test("sorts and joins overlapping/touching ranges, absorbing nested ones", () => {
    const merged = mergeRanges([
      { start: 10, end: 14 },
      { start: 0, end: 4 },
      { start: 3, end: 6 },
      { start: 4, end: 10 },
      { start: 1, end: 2 },
    ]);
    expect(merged).toEqual([{ start: 0, end: 14 }]);
  });

  test("keeps genuinely disjoint ranges separate", () => {
    expect(
      mergeRanges([
        { start: 0, end: 3 },
        { start: 5, end: 8 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ]);
  });
});

// ── command: runReplace ──────────────────────────────────────────────────────────

describe("lore replace — command-level suites (root fixture)", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-replace-"));
    mkdirSync(join(root, "docs/stories"), { recursive: true });
  });
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** Write a repo-relative file under the temp root. */
  function writeDoc(rel: string, contents: string): void {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }

  /** Run `replace` in JSON mode and return the parsed `data` payload plus the exit code. */
  function replaceCmd(args: string[]): { code: number; report: ReplaceReport } {
    const stdout = capture();
    const code = runReplace({ root, output: JSON_CTX, args, stdout, stderr: capture() });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: ReplaceReport };
    expect(envelope.kind).toBe("replace.result");
    return { code, report: envelope.data };
  }

  /** Run `replace` expecting a thrown {@link LoreError}, returned for assertions. */
  function expectError(args: string[]): LoreError {
    try {
      runReplace({ root, output: JSON_CTX, args, stdout: capture(), stderr: capture() });
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      return err as LoreError;
    }
    throw new Error("expected a LoreError, but runReplace returned");
  }

  describe("lore replace — whole-bundle default", () => {
    test("rewrites every docs/ markdown file and reports per-file counts", () => {
      writeDoc("docs/a.md", "alpha alpha");
      writeDoc("docs/stories/b.md", "alpha beta");
      const { code, report } = replaceCmd(["alpha", "ALPHA"]);
      expect(code).toBe(EXIT_OK);
      expect(report.totalMatches).toBe(3);
      expect(report.filesChanged).toBe(2);
      expect(report.filesScanned).toBe(2);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("ALPHA ALPHA");
      expect(report.files.map((f) => f.path)).toEqual(["docs/a.md", "docs/stories/b.md"]);
    });

    test("--dry-run reports changes but writes nothing", () => {
      writeDoc("docs/a.md", "keep me");
      const { report } = replaceCmd(["keep", "drop", "--dry-run"]);
      expect(report.dryRun).toBe(true);
      expect(report.totalMatches).toBe(1);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("keep me");
    });

    test("an index.md managed block is never edited (AC#1)", () => {
      const block = indexBlock("- [foo](foo.md)");
      writeDoc("docs/index.md", `# index\n\nfoo here\n\n${block}\n`);
      const { report } = replaceCmd(["foo", "BAR"]);
      expect(report.totalMatches).toBe(1);
      const after = readFileSync(join(root, "docs/index.md"), "utf8");
      expect(after).toContain(block);
      expect(after).toContain("BAR here");
    });

    test("a no-op replacement (find === replace) changes and reports nothing (review #5)", () => {
      writeDoc("docs/a.md", "foo foo");
      const { report } = replaceCmd(["foo", "foo"]);
      expect(report).toMatchObject({ filesChanged: 0, totalMatches: 0 });
      expect(report.files).toEqual([]);
    });

    test("the generated log.md is excluded from the default walk (review #8)", () => {
      writeDoc("docs/a.md", "token");
      writeDoc("docs/log.md", "token");
      const { report } = replaceCmd(["token", "X"]);
      expect(report.files.map((f) => f.path)).toEqual(["docs/a.md"]);
      expect(readFileSync(join(root, "docs/log.md"), "utf8")).toBe("token"); // untouched
    });
  });

  describe("lore replace — scoping, dedup, and safety", () => {
    test("--in scopes to the matched glob only", () => {
      writeDoc("docs/a.md", "x");
      writeDoc("docs/stories/b.md", "x");
      const { report } = replaceCmd(["x", "y", "--in", "docs/stories/**"]);
      expect(report.files.map((f) => f.path)).toEqual(["docs/stories/b.md"]);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("x");
    });

    test("--in skips non-markdown matches", () => {
      writeDoc("docs/a.md", "x");
      writeDoc("mkdocs.yml", "x");
      replaceCmd(["x", "y", "--in", "**/*"]);
      expect(readFileSync(join(root, "mkdocs.yml"), "utf8")).toBe("x");
    });

    test("an absolute --in glob resolves correctly (review #11)", () => {
      writeDoc("docs/a.md", "x");
      const { report } = replaceCmd(["x", "y", "--in", join(root, "docs", "**")]);
      expect(report.filesChanged).toBe(1);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("y");
    });

    test("the same file named by two globs is rewritten once (review #6)", () => {
      writeDoc("docs/a.md", "a");
      const { report } = replaceCmd(["a", "aa", "--in", "docs/a.md", "--in", "docs/a.md"]);
      expect(report.filesScanned).toBe(1);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("aa"); // applied once, not "aaaa"
    });

    test("a symlinked .md is skipped, so a write can't escape and isn't double-applied (review #1/#6)", () => {
      writeDoc("docs/a.md", "a");
      symlinkSync(join(root, "docs/a.md"), join(root, "docs/link.md"));
      const { report } = replaceCmd(["a", "aa", "--in", "docs/**"]);
      expect(report.files.map((f) => f.path)).toEqual(["docs/a.md"]); // link.md skipped
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("aa"); // once
    });

    test("a read error aborts before any file is written (review #7)", () => {
      if (process.getuid?.() === 0) {
        return; // a 000-mode file is still readable as root, so this atomicity probe can't be set up
      }
      writeDoc("docs/a.md", "x");
      writeDoc("docs/zz.md", "x"); // sorts after a.md, so a.md is read+planned before zz.md fails
      chmodSync(join(root, "docs/zz.md"), 0o000);
      let unreadable = false;
      try {
        readFileSync(join(root, "docs/zz.md"), "utf8");
      } catch {
        unreadable = true;
      }
      if (!unreadable) {
        chmodSync(join(root, "docs/zz.md"), 0o644);
        return; // environment ignores the mode (e.g. permissive FS) — skip
      }
      expect(() =>
        runReplace({ root, output: JSON_CTX, args: ["x", "y"], stdout: capture(), stderr: capture() }),
      ).toThrow(LoreError);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("x"); // a.md not written — atomic abort
      chmodSync(join(root, "docs/zz.md"), 0o644); // restore for cleanup
    });
  });

  describe("lore replace — commit-phase write atomicity (LORE-116)", () => {
    test("a write failure partway through the commit loop leaves the earlier file intact, the failing file untruncated, later files untouched, and the error surfaces", () => {
      writeDoc("docs/a.md", "x");
      writeDoc("docs/b.md", "x");
      writeDoc("docs/c.md", "x"); // sorted after b.md — must never be reached once b.md's write throws

      // Stub the low-level write call the commit phase's writeFileAtomic ultimately makes, so it
      // throws on the SECOND file's (b.md's) byte-write — after a.md has already committed, before
      // c.md is ever attempted — the exact "partway through" shape AC#2 asks for. writeFileAtomic
      // now creates its temp file with an EXCLUSIVE `writeFileSync(tmpPath, "", { flag: "wx" })` and
      // then writes the bytes with a separate `writeFileSync(tmpPath, bytes, { flag: "w" })`
      // (LORE-231 two-phase split; LORE-252 switched off numeric-flag `openSync`, which Bun/Windows
      // spuriously ENOENTs on). Both are the same `fs.writeFileSync`, so the spy distinguishes them
      // by flag: the `wx` exclusive create records which temp path each write belongs to (and always
      // forwards to the real call, so the temp file genuinely exists and tmpFileExists flips), while
      // the byte-write is where the simulated failure is injected — on the second one. Non-failing
      // calls forward to the real syscall, so a.md's write still actually happens.
      const realWriteFileSync = fs.writeFileSync.bind(fs);
      const openedPaths: string[] = [];
      let byteWrites = 0;
      // biome-ignore lint/suspicious/noExplicitAny: writeFileSync's overload set collapses to `any[]` under mockImplementation's contravariant param check
      const writeSpy = spyOn(fs, "writeFileSync").mockImplementation((...args: any[]) => {
        const opts = args[2];
        const flag = typeof opts === "object" && opts !== null ? opts.flag : opts;
        if (flag === "wx") {
          openedPaths.push(String(args[0])); // the exclusive create of the temp file — record its path
        } else {
          byteWrites++;
          if (byteWrites === 2) {
            throw new Error("simulated ENOSPC");
          }
        }
        // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real writeFileSync overload set
        return (realWriteFileSync as any)(...args);
      });
      try {
        expect(() =>
          runReplace({ root, output: JSON_CTX, args: ["x", "y"], stdout: capture(), stderr: capture() }),
        ).toThrow(); // the failure surfaces rather than being silently swallowed
      } finally {
        writeSpy.mockRestore();
      }

      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("y"); // committed before the failure
      expect(readFileSync(join(root, "docs/b.md"), "utf8")).toBe("x"); // temp write failed — original bytes intact, not truncated
      expect(readFileSync(join(root, "docs/c.md"), "utf8")).toBe("x"); // loop aborted before this file was ever attempted
      expect(readdirSync(join(root, "docs")).filter((f) => f.startsWith(".lore-sync-tmp"))).toEqual([]); // no stray temp file left behind (LORE-231: the mid-write failure still cleans up)

      // Discriminating assertions (LORE-116 review): the commit phase must go through writeFileAtomic's
      // temp-file+rename discipline, not a plain writeFileSync straight at the destination. Without these,
      // the four assertions above pass identically against the pre-fix writeFileOverwriting code path too.
      expect(openedPaths).toHaveLength(2); // a.md's temp create, then b.md's temp create — c.md never attempted
      const failingCallPath = openedPaths[1] as string;
      expect(basename(failingCallPath).startsWith(".lore-sync-tmp-")).toBe(true); // b.md's write went through a temp file, proving the atomic (not plain) discipline
      expect(openedPaths).not.toContain(join(root, "docs/b.md")); // the destination path itself is never a direct create target
    });
  });

  describe("lore replace — rendering and arg parsing", () => {
    test("plain mode renders a per-file line and a summary", () => {
      writeDoc("docs/a.md", "x x");
      const stdout = capture();
      runReplace({ root, output: { mode: "plain", color: false }, args: ["x", "y"], stdout, stderr: capture() });
      expect(stdout.text()).toContain("replaced 2 in docs/a.md");
      expect(stdout.text()).toContain("2 matches in 1 of 1 file");
    });

    test("dry-run summary is marked and uses singular nouns at count 1", () => {
      writeDoc("docs/a.md", "x");
      const stdout = capture();
      runReplace({
        root,
        output: { mode: "plain", color: false },
        args: ["x", "y", "--dry-run"],
        stdout,
        stderr: capture(),
      });
      expect(stdout.text()).toContain("would replace 1 in docs/a.md");
      expect(stdout.text()).toContain("1 match in 1 of 1 file (dry-run)");
    });

    test("bare --regex still enables regex mode (LORE-228)", () => {
      writeDoc("docs/a.md", "cat bat rat");
      const { report } = replaceCmd([".at", "X", "--regex"]);
      expect(report.totalMatches).toBe(3);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("X X X");
    });

    test("accepts the --in=value inline form and a -- options terminator", () => {
      writeDoc("docs/a.md", "-lead");
      const { report } = replaceCmd(["--in=docs/**", "--", "-lead", "head"]);
      expect(report.files.map((f) => f.path)).toEqual(["docs/a.md"]);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("head");
    });

    test("a glob matching nothing scans zero files", () => {
      const { report } = replaceCmd(["x", "y", "--in", "nope/**"]);
      expect(report).toMatchObject({ filesScanned: 0, filesChanged: 0, totalMatches: 0 });
    });

    // Windows forbids control characters (newline, ESC) in filenames, so this fixture cannot be created
    // there — `writeFileSync` ENOENTs at setup (LORE-252). The sanitization behavior is platform-
    // independent and stays fully covered on POSIX; skip only the impossible fixture on win32 (matching
    // this file's own symlink-test skipIf pattern below).
    test.skipIf(process.platform === "win32")(
      "plain/pretty mode sanitizes a discovered path carrying a newline and an ANSI escape (LORE-229)",
      () => {
        // A discovered display path is derived from a real filesystem name — on POSIX that name may
        // itself carry a newline or ESC byte. Both text renderers must neutralize it before
        // interpolating, mirroring query.ts's sanitizeField (LORE-118).
        const evilName = "evil\n\x1b[31mline.md";
        writeFileSync(join(root, "docs", evilName), "x");
        for (const mode of ["plain", "pretty"] as const) {
          const stdout = capture();
          runReplace({
            root,
            output: { mode, color: false },
            args: ["x", "y", "--dry-run"],
            stdout,
            stderr: capture(),
          });
          const text = stdout.text();
          expect(text).not.toContain("\x1b"); // no raw ESC byte reaches the rendered report
          // The exact rendered text: one sanitized per-file line + one trailing summary line — the
          // embedded newline in the filename must not have smuggled an extra line break into the
          // report, and the ANSI escape must be gone entirely (not merely defanged).
          expect(text).toBe("would replace 1 in docs/evil line.md\n1 match in 1 of 1 file (dry-run)\n");
        }
      },
    );

    // Same Windows-illegal fixture (newline + ESC in the filename) as the sibling test above — cannot
    // be created on win32, so skip there (LORE-252); the JSON raw-path behavior stays covered on POSIX.
    test.skipIf(process.platform === "win32")(
      "the --json envelope carries the raw, unsanitized path unchanged (LORE-229)",
      () => {
        // JSON string serialization already escapes control characters, so the raw discovered path
        // (newline and ESC intact) is the correct, unsanitized payload here — only the text
        // renderers sanitize.
        const evilName = "evil\n\x1b[31mline.md";
        writeFileSync(join(root, "docs", evilName), "x");
        const { report } = replaceCmd(["x", "y", "--dry-run"]);
        expect(report.files).toEqual([{ path: `docs/${evilName}`, count: 1 }]);
      },
    );
  });

  describe("lore replace — usage errors", () => {
    test("a missing replacement argument is a usage error", () => {
      expect(expectError(["onlyfind"]).type).toBe("usage");
    });

    test("an unknown flag is a usage error", () => {
      expect(expectError(["a", "b", "--bogus"]).type).toBe("usage");
    });

    test("an invalid regex is a usage error (exit 2)", () => {
      writeDoc("docs/a.md", "x");
      expect(expectError(["(", "x", "--regex"]).type).toBe("usage");
    });

    test("the pattern is validated even when discovery finds zero files (review #9)", () => {
      // Empty docs/ → zero targets; an invalid regex must still fail loud, not exit 0.
      expect(expectError(["(", "x", "--regex"]).type).toBe("usage");
      expect(expectError(["x*", "y", "--regex"]).type).toBe("usage"); // empty-matching too
    });

    test("--in with no value is a usage error", () => {
      expect(expectError(["a", "b", "--in"]).type).toBe("usage");
    });

    test("a single-dash unknown flag is a usage error", () => {
      expect(expectError(["a", "b", "-x"]).type).toBe("usage");
    });

    test("a third positional is a usage error", () => {
      expect(expectError(["a", "b", "c"]).type).toBe("usage");
    });

    test("--regex=<value> (an inline value on a boolean flag) is a usage error (LORE-228)", () => {
      const err = expectError(["a", "b", "--regex=false"]);
      expect(err.type).toBe("usage");
      expect(err.message).toContain("--regex takes no value");
    });

    test("--dry-run=<value> (an inline value on a boolean flag) is a usage error (LORE-228)", () => {
      const err = expectError(["a", "b", "--dry-run=false"]);
      expect(err.type).toBe("usage");
      expect(err.message).toContain("--dry-run takes no value");
    });
  });

  describe("lore replace — router integration", () => {
    test("`lore replace` is dispatched and writes through the router", () => {
      writeDoc("docs/a.md", "old");
      const code = run(["bun", "lore", "replace", "old", "new", "--json"], {
        cwd: root,
        stdout: capture(),
        stderr: capture(),
      });
      expect(code).toBe(EXIT_OK);
      expect(readFileSync(join(root, "docs/a.md"), "utf8")).toBe("new");
    });

    test("a bad regex surfaces the usage exit code through the router", () => {
      writeDoc("docs/a.md", "x");
      const code = run(["bun", "lore", "replace", "(", "x", "--regex"], {
        cwd: root,
        stdout: capture(),
        stderr: capture(),
      });
      expect(code).toBe(EXIT_CODES.usage);
    });
  });
});

// ── fswrite: writeFileOverwriting EISDIR mapping (review #10) ─────────────────────

describe("writeFileOverwriting", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("overwrites an existing file", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    writeFileOverwriting(path, "new", "f.md");
    expect(readFileSync(path, "utf8")).toBe("new");
  });

  test("a directory at the write path is a conflict (exit 5), not an uncaught error", () => {
    const path = join(dir, "adir");
    mkdirSync(path);
    try {
      writeFileOverwriting(path, "x", "adir");
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
    }
  });
});

// ── fswrite: writeFileAtomic (LORE-26) ────────────────────────────────────────────

describe("writeFileAtomic", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-atomic-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates a new file", () => {
    const path = join(dir, "f.md");
    writeFileAtomic(path, "hello", "f.md");
    expect(readFileSync(path, "utf8")).toBe("hello");
  });

  test("overwrites an existing file, leaving no temp file behind", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    writeFileAtomic(path, "new", "f.md");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["f.md"]); // no stray `.lore-sync-tmp-*` sibling
  });

  test("a directory at the write path fails loud (never silently corrupts), and the temp file is cleaned up", () => {
    const path = join(dir, "adir");
    mkdirSync(path);
    try {
      writeFileAtomic(path, "x", "adir");
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      // POSIX's renameSync-onto-an-existing-directory raises EISDIR (-> "conflict"); Windows raises
      // EPERM for the identical operation (-> "denied") -- a real, platform-specific errno
      // difference for this exact case, not a lore inconsistency, so both are accepted here.
      expect(["conflict", "denied"]).toContain((err as LoreError).type);
    }
    // The failed rename's temp file is removed, not left as litter -- `adir` (the pre-existing
    // directory that caused the conflict) is the only entry left in `dir`.
    expect(readdirSync(dir)).toEqual(["adir"]);
  });

  test("regression: a write failure BEFORE any temp file exists never claims one 'may remain'", () => {
    // A permission-denied directory makes writeFileSync(tmpPath, ...) itself fail -- no temp file is
    // ever created, so the cleanup unlink's inevitable ENOENT must not be misreported as a failed
    // cleanup (which would falsely tell the user a stray temp file needs manual removal).
    if (process.getuid?.() === 0) {
      return; // a 0o555 directory is still writable as root -- this probe can't be set up
    }
    chmodSync(dir, 0o555);
    let writable = true;
    try {
      writeFileSync(join(dir, "probe.md"), "x");
    } catch {
      writable = false;
    }
    if (writable) {
      chmodSync(dir, 0o755);
      return; // environment ignores the mode (e.g. permissive FS) -- skip
    }
    try {
      writeFileAtomic(join(dir, "f.md"), "x", "f.md");
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("denied");
      expect((err as LoreError).hint ?? "").not.toContain("temp file");
    } finally {
      chmodSync(dir, 0o755); // restore so afterEach's rmSync can clean up
    }
  });

  test("LORE-231: a mid-write failure AFTER the temp file was created leaves no `.lore-sync-tmp-*` litter", () => {
    // Unlike the regression test above (a write failure BEFORE any temp file exists), this simulates
    // the disk-full/EIO shape: the temp file's exclusive `wx` create succeeds (the directory entry is
    // genuinely allocated and tmpFileExists flips), and the failure happens on the separate byte-write
    // that follows (ENOSPC/EDQUOT/EIO) -- which the pre-fix code left as a stray `.lore-sync-tmp-*`
    // file because its cleanup guard was only set after the whole write returned. writeFileAtomic now
    // does both phases via `fs.writeFileSync` (LORE-252, Windows-safe), so the spy lets the `wx` create
    // through and throws only on the `flag: "w"` byte-write. Mirrors test/fswrite.test.ts's identical
    // `writeFileNoFollow` mid-write probe.
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    // biome-ignore lint/suspicious/noExplicitAny: writeFileSync's overload set collapses to `any[]` under mockImplementation's contravariant param check
    const spy = spyOn(fs, "writeFileSync").mockImplementation((...args: any[]) => {
      const opts = args[2];
      const flag = typeof opts === "object" && opts !== null ? opts.flag : opts;
      if (flag === "wx") {
        // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real writeFileSync overload set
        return (realWriteFileSync as any)(...args); // let the exclusive create succeed so tmpFileExists flips
      }
      throw new Error("simulated mid-write ENOSPC"); // fail the byte-write that follows
    });
    try {
      expect(() => writeFileAtomic(join(dir, "f.md"), "hello", "f.md")).toThrow(); // the failure surfaces rather than being silently swallowed
    } finally {
      spy.mockRestore();
    }
    // The temp file the (real) `wx` create made is cleaned up -- the directory is left exactly as
    // it was before the call, no `.lore-sync-tmp-*` litter survives the failure.
    expect(readdirSync(dir).filter((f) => f.startsWith(".lore-sync-tmp"))).toEqual([]);
  });
});

// ── fswrite: writeAllBytes short-write loop (LORE-92) ──────────────────────────────

describe("writeAllBytes", () => {
  test("writes the whole buffer in one call when the writer accepts it all at once", () => {
    const buf = Buffer.from("hello world");
    const calls: Array<{ offset: number; length: number }> = [];
    writeAllBytes((_b, offset, length) => {
      calls.push({ offset, length });
      return length;
    }, buf);
    expect(calls).toEqual([{ offset: 0, length: 11 }]);
  });

  test("loops when the writer returns a short write, until every byte is accounted for", () => {
    const buf = Buffer.from("hello world"); // 11 bytes
    const written: Buffer[] = [];
    writeAllBytes((b, offset, length) => {
      const n = Math.min(3, length); // simulate a short write, at most 3 bytes per call
      written.push(Buffer.from(b.subarray(offset, offset + n)));
      return n;
    }, buf);
    expect(Buffer.concat(written).toString()).toBe("hello world");
  });

  test("a zero-length buffer never calls the writer", () => {
    let calls = 0;
    writeAllBytes(() => {
      calls++;
      return 0;
    }, Buffer.alloc(0));
    expect(calls).toBe(0);
  });
});

// ── fswrite: writeFileNoFollow TOCTOU-safe overwrite (LORE-92) ────────────────────

describe("writeFileNoFollow", () => {
  let dir: string;
  let outside: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-nofollow-"));
    outside = mkdtempSync(join(tmpdir(), "lore-fswrite-nofollow-outside-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test("overwrites a genuine existing file", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    writeFileNoFollow(path, "new", "f.md");
    expect(readFileSync(path, "utf8")).toBe("new");
  });

  test("creates a fresh file when none exists yet (writeAllOrRollback's force-create branch)", () => {
    const path = join(dir, "f.md");
    writeFileNoFollow(path, "hello", "f.md");
    expect(readFileSync(path, "utf8")).toBe("hello");
  });

  // POSIX-only, matching this codebase's existing symlink tests' own skip guard (e.g. init.test.ts).
  test.skipIf(process.platform === "win32")(
    "refuses a symlink swapped in AFTER assertNoSymlinkInPath already passed — the write-time TOCTOU window (AC#1/AC#2)",
    () => {
      const path = join(dir, "f.md");
      const outsideFile = join(outside, "secret.md");
      writeFileSync(path, "old"); // a real file when writeAllOrRollback's own guard would run
      writeFileSync(outsideFile, "ORIGINAL");

      assertNoSymlinkInPath(dir, "f.md"); // passes — the target is still a real file at this point

      // Simulate a concurrent process winning the race in the window between that check and the
      // write below: the target is swapped for a symlink pointing outside the repo, mirroring the
      // filing task's own repro methodology (drive the real primitives in writeAllOrRollback's
      // order, swap the target mid-sequence, rather than needing a genuine concurrent process).
      rmSync(path);
      symlinkSync(outsideFile, path);

      let thrown: unknown;
      try {
        writeFileNoFollow(path, "HACKED", "f.md");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LoreError);
      expect((thrown as LoreError).type).toBe("conflict");
      // The write never followed the symlink through to the real file on the other end.
      expect(readFileSync(outsideFile, "utf8")).toBe("ORIGINAL");
    },
  );

  // POSIX-only, matching this codebase's existing symlink tests' own skip guard.
  test.skipIf(process.platform === "win32")(
    "refuses a symlink at a target that never existed as a regular file (the force-create branch's own race)",
    () => {
      const path = join(dir, "f.md");
      const outsideFile = join(outside, "secret.md");
      writeFileSync(outsideFile, "ORIGINAL");
      symlinkSync(outsideFile, path); // planted before any write is attempted at all

      let thrown: unknown;
      try {
        writeFileNoFollow(path, "HACKED", "f.md");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LoreError);
      expect((thrown as LoreError).type).toBe("conflict");
      expect(readFileSync(outsideFile, "utf8")).toBe("ORIGINAL");
    },
  );
});

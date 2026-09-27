/**
 * launcher-equivalence.test.ts — the X-rc.N / X launcher gate (LCLI-621, constitution Article 3
 * clause 5 as amended by ODOC-302).
 *
 * One pair that differs only by the version string is GREEN. Each mutant below breaks exactly one
 * property the gate names (content beyond the version, an extra entry, a missing entry, a mode, the
 * rc's own version, the rc's platform pins) and must turn red NAMING that property, so a gate that
 * stopped checking one of them fails exactly that case rather than all of them.
 *
 * The tarballs are written here by a minimal ustar writer rather than by `tar` or `npm pack`, so the
 * modes and paths are exactly what each case says on every platform this suite runs on, Windows
 * included (chmod is a no-op there). The real `npm pack` output was measured separately; see the
 * LCLI-621 record.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  compareLauncherTarballs,
  main,
  readTarEntries,
  substituteVersion,
  versionPairProblem,
} from "../scripts/launcher-equivalence.mjs";

const X = "3.4.5";
const RC = "3.4.5-rc.2";
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];

interface Entry {
  path: string;
  content: string | Buffer;
  mode?: number;
  type?: "0" | "5";
}

/** A gzipped ustar archive holding exactly these entries, in this order. */
function tarball(entries: Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const header = Buffer.alloc(512);
    const put = (text: string, offset: number, length: number) => header.write(text, offset, length, "utf8");
    const num = (n: number, offset: number, length: number) =>
      put(`${n.toString(8).padStart(length - 1, "0")}\0`, offset, length);
    put(entry.path, 0, 100);
    num(entry.mode ?? 0o644, 100, 8);
    num(0, 108, 8);
    num(0, 116, 8);
    num(content.length, 124, 12);
    num(499162500, 136, 12);
    header.fill(32, 148, 156);
    put(entry.type ?? "0", 156, 1);
    put("ustar\0", 257, 6);
    put("00", 263, 2);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function manifest(version: string, pin: string = X): string {
  return `${JSON.stringify(
    {
      name: "@opum-ai/lore",
      version,
      optionalDependencies: Object.fromEntries(PLATFORMS.map((p) => [`@opum-ai/lore-${p}`, pin])),
      bin: { lore: "bin/lore.cjs" },
    },
    null,
    2,
  )}\n`;
}

// The README carries the version inside its generated regions, rendered for the launcher's OWN
// version, exactly as scripts/shipped-readme-version.mjs renders it (tag line included).
const readme = (version: string) =>
  `# lore\n\n- Published on npm as **\`@opum-ai/lore@${version}\`** (bin \`lore\`)\n\n> **Status: ${version} released.** Tag \`v${version}\`\n`;

function launcher(version: string, overrides: { drop?: string; add?: Entry; change?: Partial<Entry> } = {}) {
  let entries: Entry[] = [
    { path: "package/LICENSE", content: "MIT\n" },
    { path: "package/bin/lore.cjs", content: "#!/usr/bin/env node\nrequire('./x');\n", mode: 0o755 },
    { path: "package/package.json", content: manifest(version) },
    { path: "package/README.md", content: readme(version) },
  ];
  if (overrides.drop) entries = entries.filter((e) => e.path !== overrides.drop);
  if (overrides.change)
    entries = entries.map((e) => (e.path === overrides.change?.path ? { ...e, ...overrides.change } : e));
  if (overrides.add) entries.push(overrides.add);
  return tarball(entries);
}

const compare = (rc: Buffer, final: Buffer = launcher(X)) =>
  compareLauncherTarballs(rc, final, { version: X, rcVersion: RC });

describe("launcher equivalence (LCLI-621)", () => {
  test("GREEN: a pair differing only by the version string, README regions and tag line included", () => {
    const result = compare(launcher(RC));
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(4);
  });

  test("RED: a content difference beyond the version string", () => {
    const rc = launcher(RC, { change: { path: "package/README.md", content: `${readme(RC)}An rc-only line.\n` } });
    const result = compare(rc);
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(`package/README.md: content differs beyond ${RC} -> ${X}`);
  });

  test("RED: an entry in the rc that the final does not carry", () => {
    const rc = launcher(RC, { add: { path: "package/NOTICE", content: "extra\n" } });
    const result = compare(rc);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["package/NOTICE is in the rc tarball and missing from the final"]);
  });

  test("RED: an entry the final carries and the rc does not", () => {
    const result = compare(launcher(RC, { drop: "package/LICENSE" }));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["package/LICENSE is in the final tarball and missing from the rc"]);
  });

  test("RED: a mode difference with identical bytes", () => {
    const rc = launcher(RC, { change: { path: "package/bin/lore.cjs", mode: 0o644 } });
    const result = compare(rc);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["package/bin/lore.cjs: mode 0644 in the rc, 0755 in the final"]);
  });

  test("RED: an rc tarball whose package.json version is not X-rc.N", () => {
    // Packed at X: substitution is then a no-op and every byte matches the final, so only the
    // explicit version check can see it. This is the case that would stage the final under the
    // rc's name.
    const result = compare(launcher(X));
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(`the rc tarball's package.json version is "${X}", not "${RC}"`);
  });

  test("RED: an rc tarball pinning its platform packages at X-rc.N rather than exactly X", () => {
    // Substitution maps every such pin to X, so the content comparison is blind to it; the pin
    // check is not.
    const rc = launcher(RC, { change: { path: "package/package.json", content: manifest(RC, RC) } });
    const result = compare(rc);
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(PLATFORMS.length);
    expect(result.problems[0]).toContain(`not exactly "${X}"`);
  });

  test("RED: a final tarball not at X, and a duplicated entry", () => {
    expect(compare(launcher(RC), launcher("3.4.6")).problems).toContain(
      `the final tarball's package.json version is "3.4.6", not "${X}"`,
    );
    const dup = launcher(RC, { add: { path: "package/LICENSE", content: "MIT\n" } });
    expect(compare(dup).problems).toContain("the rc tarball carries package/LICENSE more than once");
  });

  test("refuses a malformed version pair before reading anything", () => {
    for (const bad of ["3.4.5-rc.0", "3.4.5-rc.01", "3.4.5-rc.", "3.4.5-rc.1a", "3.4.5-beta.1", "3.4.6-rc.1", "3.4.5"])
      expect(versionPairProblem(X, bad)).toContain("does not match ^3.4.5-rc\\.[1-9][0-9]*$");
    expect(versionPairProblem("3.4.5-rc.1", "3.4.5-rc.1-rc.1")).toContain("not a final MAJOR.MINOR.PATCH");
    expect(versionPairProblem(X, "3.4.5-rc.10")).toBeNull();
    expect(() =>
      compareLauncherTarballs(Buffer.alloc(0), Buffer.alloc(0), { version: X, rcVersion: "3.4.5-rc.0" }),
    ).toThrow("does not match");
  });

  test("substitution rewrites X-rc.N and never the prefix of a longer rc number", () => {
    expect(substituteVersion(Buffer.from("a 3.4.5-rc.1 b 3.4.5-rc.10 c"), "3.4.5-rc.1", X).toString()).toBe(
      "a 3.4.5 b 3.4.5-rc.10 c",
    );
  });

  test("reads path, type and mode from the archive it is given, and refuses a truncated one", () => {
    const entries = readTarEntries(launcher(RC));
    expect(entries.map((e) => [e.path, e.type, e.mode])).toEqual([
      ["package/LICENSE", "file", 0o644],
      ["package/bin/lore.cjs", "file", 0o755],
      ["package/package.json", "file", 0o644],
      ["package/README.md", "file", 0o644],
    ]);
    const corrupt = launcher(RC);
    expect(() => readTarEntries(corrupt.subarray(0, 20))).toThrow();
  });

  test("the CLI exits 0 on an equivalent pair, 1 naming every problem, 2 on a bad version pair", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "launcher-equivalence-"));
    try {
      const rcFile = resolve(dir, "rc.tgz");
      const finalFile = resolve(dir, "final.tgz");
      const badFile = resolve(dir, "bad.tgz");
      writeFileSync(rcFile, launcher(RC));
      writeFileSync(finalFile, launcher(X));
      writeFileSync(badFile, launcher(RC, { drop: "package/LICENSE" }));
      const run = (args: string[]) => {
        const lines: string[] = [];
        const code = main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
        return { code, text: lines.join("\n") };
      };
      const args = (rc: string, rcVersion = RC) => [
        "--rc",
        rc,
        "--final",
        finalFile,
        "--version",
        X,
        "--rc-version",
        rcVersion,
      ];
      expect(run(args(rcFile)).code).toBe(0);
      const red = run(args(badFile));
      expect(red.code).toBe(1);
      expect(red.text).toContain("package/LICENSE is in the final tarball and missing from the rc");
      expect(run(args(rcFile, "3.4.5-rc.0")).code).toBe(2);
      expect(run(["--rc", rcFile]).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

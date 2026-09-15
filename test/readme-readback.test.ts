import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";

// Covers scripts/readme-readback.sh -- A4 of the shipped-README version contract.
//
// WHY THIS SUITE EXISTS AT ALL. A4 runs in exactly one place: inside a real `npm publish`, seconds
// after the only irreversible action in the release. Two defects lived in it undetected because of
// that -- it named a version-specific page it had never read, and it would have gone RED ON A
// CORRECT RELEASE during ordinary propagation lag. Neither was reachable by any test while the
// logic sat inline in release.yml. Stubbing `npm` is what makes the branches observable.
//
// Nothing here touches the network. REGISTRY_WINDOW_SECONDS=0 collapses the retry loop to a single
// attempt, so no test sleeps.

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "readme-readback.sh");
const CHECKER = resolve(import.meta.dir, "..", "scripts", "shipped-readme-version.mjs");
const REPO_README = resolve(import.meta.dir, "..", "README.md");
const REPO_PKG = resolve(import.meta.dir, "..", "package.json");

// Git Bash has no `mktemp -d` behaviour this script relies on, and the script only ever runs on
// the ubuntu publish runner. Skipping is honest; stubbing the platform away would not be.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

type Served = { readme?: string; versions?: string[]; fail?: boolean };

/**
 * A release workspace: the README/package.json pair being "published", plus an `npm` stub that
 * answers the two reads the script makes (`view <name> readme`, `view <name> versions --json`).
 */
function makeWorkspace(options: { version: string; readme: string; served: Served }) {
  const root = mkdtempSync(resolve(tmpdir(), "lore-a4-test-"));
  const bin = resolve(root, "bin");
  const scripts = resolve(root, "scripts");
  mkdirSync(bin, { recursive: true });
  mkdirSync(scripts, { recursive: true });

  // The script resolves the checker relative to itself, so both must travel together.
  copyFileSync(SCRIPT, resolve(scripts, "readme-readback.sh"));
  copyFileSync(CHECKER, resolve(scripts, "shipped-readme-version.mjs"));

  const pkg = JSON.parse(readFileSync(REPO_PKG, "utf8"));
  pkg.version = options.version;
  writeFileSync(resolve(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(resolve(root, "README.md"), options.readme);

  const { readme = "", versions = [], fail = false } = options.served;
  writeFileSync(resolve(root, "served-readme.txt"), readme);
  writeFileSync(resolve(root, "served-versions.json"), JSON.stringify(versions));
  writeFileSync(
    resolve(bin, "npm"),
    [
      "#!/usr/bin/env bash",
      fail ? "exit 1" : "",
      // `npm view <name> versions --json` puts the field at $3, not $2 -- matching on the wrong
      // position made the stub answer every read with the readme and the lag branch unreachable.
      'for a in "$@"; do if [ "$a" = "versions" ]; then cat "$(dirname "$0")/../served-versions.json"; exit 0; fi; done',
      'printf "%s" "$(cat "$(dirname "$0")/../served-readme.txt")"',
    ].join("\n"),
  );
  chmodSync(resolve(bin, "npm"), 0o755);
  return { root, bin };
}

function run(ws: { root: string; bin: string }) {
  try {
    const out = execFileSync("bash", [resolve(ws.root, "scripts", "readme-readback.sh")], {
      cwd: ws.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${ws.bin}${delimiter}${process.env.PATH ?? ""}`,
        REGISTRY_WINDOW_SECONDS: "0",
      },
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** The real README, with its generated regions rewritten for `version`. */
function readmeFor(version: string) {
  const dir = mkdtempSync(resolve(tmpdir(), "lore-a4-gen-"));
  const pkg = JSON.parse(readFileSync(REPO_PKG, "utf8"));
  pkg.version = version;
  writeFileSync(resolve(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  copyFileSync(REPO_README, resolve(dir, "README.md"));
  execFileSync("node", [CHECKER, "--write", "--dir", dir], { stdio: "ignore" });
  return readFileSync(resolve(dir, "README.md"), "utf8");
}

describeOnPosix("A4 registry read-back", () => {
  test("byte-equal served README is the strongest pass, and it NAMES what it read", () => {
    const readme = readmeFor("9.9.9");
    const r = run(makeWorkspace({ version: "9.9.9", readme, served: { readme, versions: ["9.9.8", "9.9.9"] } }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("BYTE-EQUAL");
    // The whole defect class is a claim that does not name its object.
    expect(r.out).toContain("@opum-ai/lore");
    expect(r.out).toContain("9.9.9");
  });

  test("a served README that is not byte-equal but satisfies the assertions still passes", () => {
    const readme = readmeFor("9.9.9");
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme,
        // Trailing prose npm did not round-trip: different bytes, same assertions.
        served: { readme: `${readme}\nAn extra line the packed copy does not have.\n`, versions: ["9.9.9"] },
      }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("satisfies every assertion");
  });

  // THE REGRESSION THIS SCRIPT EXISTS FOR. A lagging replica does not serve an empty readme --
  // it serves the PREVIOUS release's, which is byte-for-byte the thing A4 flags. The inline
  // version guarded only the empty case and went red here, on a CORRECT release.
  test("the previous release's README during propagation lag is a WARNING, not a failure", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: readmeFor("9.9.8"), versions: ["9.9.8", "9.9.9"] },
      }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(r.out).toContain("PREVIOUS release (9.9.8)");
    expect(r.out).not.toContain("::error::");
  });

  test("a README matching NO published release is a hard failure naming both ruled-out versions", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: "# lore\n\nPublished on npm as **`@opum-ai/lore@1.2.3`**.\n", versions: ["9.9.8", "9.9.9"] },
      }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::A4 FAILED");
    expect(r.out).toContain("propagation lag has been ruled out");
  });

  test("an empty readme field is 'nothing was verified', never a pass claim", () => {
    const r = run(
      makeWorkspace({ version: "9.9.9", readme: readmeFor("9.9.9"), served: { readme: "", versions: ["9.9.9"] } }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(r.out).toContain("Nothing was verified");
    expect(r.out).not.toContain("A4 OK");
  });

  test("the package name is DERIVED, not hardcoded — a rename must not silently warn-and-pass", () => {
    const readme = readmeFor("9.9.9");
    const ws = makeWorkspace({ version: "9.9.9", readme, served: { readme, versions: ["9.9.9"] } });
    const pkgPath = resolve(ws.root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.name = "@opum-ai/lore-renamed";
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    const r = run(ws);
    expect(r.out).toContain("@opum-ai/lore-renamed");
  });
});

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
// Since LCLI-616 it runs in scripts/promote-latest.mjs, after the final X launcher's fresh
// publish onto `latest`, against the X tarball's own package.json and README.md; an empty served
// readme after the window is now a FAILURE there (OPAG-474), not a warning.
//
// Nothing here touches the network. REGISTRY_WINDOW_SECONDS=0 collapses the retry loop to a single
// attempt, so no test sleeps -- except the one case that proves a readme appearing INSIDE the window
// passes, which needs a window with room for one re-read.

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "readme-readback.sh");
const CHECKER = resolve(import.meta.dir, "..", "scripts", "shipped-readme-version.mjs");
const REPO_README = resolve(import.meta.dir, "..", "README.md");
const REPO_PKG = resolve(import.meta.dir, "..", "package.json");

// Git Bash has no `mktemp -d` behaviour this script relies on, and the script only ever runs on
// the ubuntu publish runner. Skipping is honest; stubbing the platform away would not be.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

/**
 * `readmes` serves one answer per `npm view <name> readme` call, in order, repeating the last: a
 * registry whose field is empty and then appears, as a publish propagating does.
 */
type Served = { readme?: string; readmes?: string[]; versions?: string[]; fail?: boolean };

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
  const readmes = options.served.readmes ?? [readme];
  for (const [i, text] of readmes.entries()) writeFileSync(resolve(root, `served-readme-${i}.txt`), text);
  writeFileSync(resolve(root, "served-readme-count"), String(readmes.length));
  writeFileSync(resolve(root, "served-versions.json"), JSON.stringify(versions));
  writeFileSync(
    resolve(bin, "npm"),
    [
      "#!/usr/bin/env bash",
      fail ? "exit 1" : "",
      // `npm view <name> versions --json` puts the field at $3, not $2 -- matching on the wrong
      // position made the stub answer every read with the readme and the lag branch unreachable.
      'for a in "$@"; do if [ "$a" = "versions" ]; then cat "$(dirname "$0")/../served-versions.json"; exit 0; fi; done',
      'd="$(dirname "$0")/.."; n=0; [ -f "$d/reads" ] && n="$(cat "$d/reads")"; echo $((n + 1)) > "$d/reads"',
      'last=$(( $(cat "$d/served-readme-count") - 1 )); [ "$n" -gt "$last" ] && n="$last"',
      'printf "%s" "$(cat "$d/served-readme-$n.txt")"',
    ].join("\n"),
  );
  chmodSync(resolve(bin, "npm"), 0o755);
  return { root, bin };
}

function run(ws: { root: string; bin: string }, windowSeconds = "0") {
  try {
    const out = execFileSync("bash", [resolve(ws.root, "scripts", "readme-readback.sh")], {
      cwd: ws.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${ws.bin}${delimiter}${process.env.PATH ?? ""}`,
        REGISTRY_WINDOW_SECONDS: windowSeconds,
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

  // LCLI-616, OPAG-474 AC3. The read-back runs after a fresh publish onto `latest`, which is what
  // makes npm derive the package-level readme; lag on an established package serves the PREVIOUS
  // readme, not an empty one. So empty after the whole window is the defect, and exits 1.
  test("an empty readme field across the whole window is a FAILURE naming OPAG-474, never a pass claim", () => {
    const r = run(
      makeWorkspace({ version: "9.9.9", readme: readmeFor("9.9.9"), served: { readme: "", versions: ["9.9.9"] } }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::A4 FAILED for package '@opum-ai/lore', release '9.9.9'");
    expect(r.out).toContain("NO readme field at all (OPAG-474)");
    expect(r.out).toContain("not propagation lag");
    expect(r.out).toContain("npm view @opum-ai/lore readme | wc -c");
    expect(r.out).not.toContain("A4 OK");
    expect(r.out).not.toContain("::warning::");
  });

  // The other half of the same change: the window still does its job. Empty on the first read and
  // the release's README on the second is propagation finishing, and it passes. A 2s window leaves
  // room for exactly one re-read (the first backoff is capped by the deadline).
  test("a readme that appears WITHIN the window passes: empty first, then the release's README", () => {
    const readme = readmeFor("9.9.9");
    const ws = makeWorkspace({ version: "9.9.9", readme, served: { readmes: ["", readme], versions: ["9.9.9"] } });
    const r = run(ws, "2");
    expect(r.code).toBe(0);
    expect(r.out).toContain("attempt 1: the registry served no readme field yet.");
    expect(r.out).toContain("A4 OK");
    expect(r.out).toContain("BYTE-EQUAL");
    expect(r.out).toContain("after 2 attempt(s)");
    // Positive control on the stub: it really was read twice.
    expect(readFileSync(resolve(ws.root, "reads"), "utf8").trim()).toBe("2");
  });

  // Since LCLI-621 every release leaves an X-rc.N on the registry, sorted just below X. It never set
  // the package-level readme, so it is not "the previous release" whose README a lagging replica
  // serves; taking it as one checks the lagging README against the wrong assertions and fails.
  test("an X-rc.N in the version list is not taken as the previous release", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: readmeFor("9.9.8"), versions: ["9.9.8", "9.9.9-rc.1", "9.9.9"] },
      }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("PREVIOUS release (9.9.8)");
    expect(r.out).not.toContain("9.9.9-rc.1");
    expect(r.out).not.toContain("::error::");
  });

  // Moved here from the staging checklist's tests (LCLI-618), which no longer carries a read-back
  // step: this guards the premise behind re-running the generator rather than grepping. If the
  // generator ever stops splitting the literal, this fails and a grep could honestly come back.
  test("THE REASON it re-runs the assertions: a grep for the status sentence matches nothing in the real README", () => {
    const readme = readFileSync(REPO_README, "utf8");
    expect(readme).not.toMatch(/Status: .* released/);
    expect(readme).toMatch(/Status:<!--lore-version:status:begin--> \d+\.\d+\.\d+ released/);
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

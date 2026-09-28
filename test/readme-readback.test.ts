import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
type Served = {
  readme?: string;
  readmes?: string[];
  versions?: string[];
  fail?: boolean;
  /**
   * The raw answer to `npm view <name> readme versions --json`, the one packument read the empty
   * branch makes. Default: npm 12's real shape, `[{readme, versions}]`, carrying the LAST readme
   * served and `versions` (measured against the registry, 2026-09-28).
   */
  packument?: string;
};

/**
 * A release workspace: the README/package.json pair being "published", plus an `npm` stub that
 * answers the two reads the script makes (`view <name> readme`, `view <name> versions --json`).
 */
function makeWorkspace(options: { version: string; readme: string; served: Served; checker?: string }) {
  const root = mkdtempSync(resolve(tmpdir(), "lore-a4-test-"));
  const bin = resolve(root, "bin");
  const scripts = resolve(root, "scripts");
  mkdirSync(bin, { recursive: true });
  mkdirSync(scripts, { recursive: true });

  // The script resolves the checker relative to itself, so both must travel together.
  copyFileSync(SCRIPT, resolve(scripts, "readme-readback.sh"));
  copyFileSync(CHECKER, resolve(scripts, "shipped-readme-version.mjs"));
  // A substitute checker reaches the paths the real one only takes on a broken input.
  if (options.checker) writeFileSync(resolve(scripts, "shipped-readme-version.mjs"), options.checker);

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
    resolve(root, "served-packument.json"),
    options.served.packument ?? JSON.stringify([{ readme: readmes.at(-1) ?? "", versions }]),
  );
  writeFileSync(
    resolve(bin, "npm"),
    [
      "#!/usr/bin/env bash",
      fail ? "exit 1" : "",
      // `npm view <name> versions --json` puts the field at $3, not $2 -- matching on the wrong
      // position made the stub answer every read with the readme and the lag branch unreachable.
      // The empty branch's one packument read asks for BOTH fields: `view <name> readme versions --json`.
      'case " $* " in *" readme versions "*) cat "$(dirname "$0")/../served-packument.json"; exit 0 ;; esac',
      'for a in "$@"; do if [ "$a" = "versions" ]; then cat "$(dirname "$0")/../served-versions.json"; exit 0; fi; done',
      'd="$(dirname "$0")/.."; n=0; [ -f "$d/reads" ] && n="$(cat "$d/reads")"; echo $((n + 1)) > "$d/reads"',
      'last=$(( $(cat "$d/served-readme-count") - 1 )); [ "$n" -gt "$last" ] && n="$last"',
      'printf "%s" "$(cat "$d/served-readme-$n.txt")"',
    ].join("\n"),
  );
  chmodSync(resolve(bin, "npm"), 0o755);
  return { root, bin };
}

function run(ws: { root: string; bin: string }, windowSeconds = "0", shell = "bash") {
  try {
    const out = execFileSync(shell, [resolve(ws.root, "scripts", "readme-readback.sh")], {
      cwd: ws.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${ws.bin}${delimiter}${process.env.PATH ?? ""}`,
        REGISTRY_WINDOW_SECONDS: windowSeconds,
      },
    });
    return { code: 0, out, stdout: out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}`, stdout: e.stdout ?? "" };
  }
}

/**
 * The machine-readable verdict, asserted to be the LAST line of stdout and the only verdict line:
 * scripts/promote-latest.mjs reads it, so it must exist on every path and be unambiguous.
 */
function verdictOf(r: { stdout: string }) {
  const lines = r.stdout.split("\n").filter(Boolean);
  const verdicts = lines.filter((line) => line.startsWith("A4 VERDICT: "));
  expect(verdicts).toHaveLength(1);
  expect(lines.at(-1)).toBe(verdicts[0]);
  return verdicts[0] as string;
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
    expect(verdictOf(r)).toMatch(
      /^A4 VERDICT: PASSED the package readme for @opum-ai\/lore is byte-equal to 9\.9\.9's/,
    );
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
    expect(verdictOf(r)).toMatch(/^A4 VERDICT: PASSED .* satisfies every assertion against 9\.9\.9/);
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
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: NOT-CONFIRMED @opum-ai/lore still serves the previous release 9.9.8's README after 0s; lag not ruled out",
    );
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
    // The checker's findings print AFTER the ::error:: line; the verdict still comes last (LCLI-616 F1).
    expect(r.out).toContain("shipped-README version assertion(s) failed");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: FAILED the package readme for @opum-ai/lore satisfies neither 9.9.9's assertions nor 9.9.8's",
    );
  });

  // LCLI-616, OPAG-474 AC3. Empty alone proves nothing: a replica lagging on X serves the
  // packument as it was before, and @opum-ai/lore's had no readme (0 bytes since 0.11.0). So the
  // empty branch settles it with ONE packument read of readme AND versions. Four outcomes.
  test("empty across the window, on a packument that already LISTS the version: FAILED, naming OPAG-474", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: "", versions: ["9.9.8", "9.9.9"] },
      }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::A4 FAILED for package '@opum-ai/lore', release '9.9.9'");
    expect(r.out).toContain("the same packument read already lists 9.9.9 (OPAG-474)");
    expect(r.out).toContain("npm view @opum-ai/lore readme | wc -c");
    expect(r.out).not.toContain("A4 OK");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: FAILED no readme for @opum-ai/lore after 0s, and the packument already lists 9.9.9 (OPAG-474)",
    );
  });

  test("empty across the window, on a packument that does NOT list the version yet: NOT-CONFIRMED, lag not ruled out", () => {
    const r = run(
      makeWorkspace({ version: "9.9.9", readme: readmeFor("9.9.9"), served: { readme: "", versions: ["9.9.8"] } }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("does not list 9.9.9 yet. Lag is NOT ruled out");
    expect(r.out).not.toContain("::error::");
    expect(r.out).not.toContain("A4 OK");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: NOT-CONFIRMED lag not ruled out: 9.9.9 not yet in the packument, which serves no readme for @opum-ai/lore after 0s",
    );
  });

  // LCLI-626 N4: a readme that first appears on the post-window packument read is COMPARED, with the
  // same tests an in-window read gets. Three outcomes, one per arm it can reach.
  const late = (readme: string, versions: string[]) =>
    run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: "", versions, packument: JSON.stringify([{ readme, versions }]) },
      }),
    );

  test("empty across the window, then the release's README on the packument read: compared, and PASSED", () => {
    // Trailing newlines the packument carries are normalised as `$(npm view ...)` normalises them.
    const r = late(`${readmeFor("9.9.9")}\n\n`, ["9.9.8", "9.9.9"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("comparing it.");
    expect(r.out).toContain("BYTE-EQUAL");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: PASSED the package readme for @opum-ai/lore is byte-equal to 9.9.9's packed README.md (first seen on the packument read after the 0s window)",
    );
  });

  test("empty across the window, then the PREVIOUS release's README on the packument read: NOT-CONFIRMED, lag", () => {
    const r = late(readmeFor("9.9.8"), ["9.9.8", "9.9.9"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("PREVIOUS release (9.9.8)");
    expect(r.out).not.toContain("::error::");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: NOT-CONFIRMED @opum-ai/lore still serves the previous release 9.9.8's README after 0s; lag not ruled out",
    );
  });

  test("empty across the window, then a readme matching NO release on the packument read: FAILED, not waved through", () => {
    const r = late("# late\n", ["9.9.8", "9.9.9"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::A4 FAILED");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: FAILED the package readme for @opum-ai/lore satisfies neither 9.9.9's assertions nor 9.9.8's",
    );
  });

  // LCLI-626 N1. Under bash 3.2 -- macOS's /bin/bash, where the release operator runs this -- a
  // non-digit window reached $(( )) as a variable name, `set -u` tripped inside it, and the script
  // EXITED 0 with "stopped (exit 0)". So this drives /bin/bash, and on darwin proves that IS 3.2.
  test("a REGISTRY_WINDOW_SECONDS that is not a whole number is refused before anything is read, under /bin/bash", () => {
    if (process.platform === "darwin") {
      expect(execFileSync("/bin/bash", ["-c", "echo $BASH_VERSION"], { encoding: "utf8" })).toMatch(/^3\.2\./);
    }
    for (const windowSeconds of ["abc", "1e3", "-5", "08", "30s", " 30", "1234567890"]) {
      const readme = readmeFor("9.9.9");
      const ws = makeWorkspace({ version: "9.9.9", readme, served: { readme, versions: ["9.9.9"] } });
      const r = run(ws, windowSeconds, "/bin/bash");
      expect({ windowSeconds, code: r.code }).toEqual({ windowSeconds, code: 2 });
      expect(r.out).toContain("::error::REGISTRY_WINDOW_SECONDS must be a whole number of seconds");
      expect(verdictOf(r)).toBe(
        `A4 VERDICT: NOT-CONFIRMED REGISTRY_WINDOW_SECONDS='${windowSeconds}' is not a whole number of seconds; the read-back refused to start and nothing was read`,
      );
      // Refused BEFORE the loop: the registry stub was never asked for anything.
      expect(existsSync(resolve(ws.root, "reads"))).toBe(false);
    }
    // Positive control: the same stub, a valid window, and it reads and passes.
    const readme = readmeFor("9.9.9");
    const ok = makeWorkspace({ version: "9.9.9", readme, served: { readme, versions: ["9.9.9"] } });
    const r = run(ok, "0", "/bin/bash");
    expect(r.code).toBe(0);
    expect(verdictOf(r)).toMatch(/^A4 VERDICT: PASSED /);
    expect(readFileSync(resolve(ok.root, "reads"), "utf8").trim()).toBe("1");
  });

  test("empty across the window, and the packument unreadable: NOT-CONFIRMED, never a FAILED claim", () => {
    for (const packument of ["", "not json", "[]", JSON.stringify([{ readme: "" }])]) {
      const r = run(
        makeWorkspace({
          version: "9.9.9",
          readme: readmeFor("9.9.9"),
          served: { readme: "", versions: ["9.9.9"], packument },
        }),
      );
      expect({ packument, code: r.code }).toEqual({ packument, code: 0 });
      expect(verdictOf(r)).toMatch(
        /^A4 VERDICT: NOT-CONFIRMED no readme for @opum-ai\/lore after 0s, and the packument could not be read/,
      );
    }
  });

  test("the checker unable to read its input: NOT-CONFIRMED, 'nothing was verified'", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: "# lore, different\n", versions: ["9.9.9"] },
        checker: "process.exit(2);\n",
      }),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("A4 verified NOTHING");
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: NOT-CONFIRMED the checker could not read its input (exit 2); nothing was verified",
    );
  });

  test("a read-back stopped before any verdict still ends in one, NOT-CONFIRMED, and keeps its exit status", () => {
    const r = run(
      makeWorkspace({
        version: "9.9.9",
        readme: readmeFor("9.9.9"),
        served: { readme: "# lore, different\n", versions: ["9.9.9"] },
        // Stops the script from inside, as an operator's Ctrl-C or a runner's cancel would.
        checker: "process.kill(process.ppid, 'SIGTERM'); process.exit(1);\n",
      }),
    );
    expect(r.code).toBe(143);
    expect(verdictOf(r)).toBe(
      "A4 VERDICT: NOT-CONFIRMED the read-back stopped (exit 143) before reaching a verdict; nothing was verified",
    );
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
    expect(verdictOf(r)).toMatch(/^A4 VERDICT: PASSED .*\(2 read\(s\)\)$/);
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
    expect(verdictOf(r)).toMatch(/^A4 VERDICT: NOT-CONFIRMED .* previous release 9\.9\.8's README/);
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

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CANONICAL_SLUG = "opum-ai/lore-cli";
const CANONICAL_REPOSITORY_URL = `git+https://github.com/${CANONICAL_SLUG}.git`;
const STALE_OPERATIONAL_SLUGS = ["jeremy-newhouse/lore", "salient-data/lore-cli", "salient-data/quest-cli"];

/**
 * Slugs left behind by the 2026-08 move of both CLI repositories to `opum-ai`.
 * The former routes still redirect and answer 200, so a stale citation looks
 * healthy to any existence check; only a literal scan catches it. These carry no
 * decision-time provenance value — unlike `jeremy-newhouse/lore`, which ADR-0001
 * legitimately records — so they must appear in no documentation file at all.
 */
const ORG_MOVE_STALE_SLUGS = ["salient-data/lore-cli", "salient-data/quest-cli"];
const CANONICAL_NPM_PACKAGE = "@opum-ai/lore";
const STALE_NPM_PACKAGE = "@salient-data/lore";
const CANONICAL_NPM_TARBALL_PREFIX = "opum-ai-lore";
const STALE_NPM_TARBALL_PREFIX = "salient-data-lore";

const PLATFORM_PACKAGES = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];
const OPERATIONAL_DOCUMENTS = [
  "CLAUDE.md",
  "README.md",
  "CHANGELOG.md",
  "docs/index.md",
  "docs/reference/lore-cli-documentation-ownership.md",
  "docs/reference/lore-cli-release-truth.md",
  "docs/reference/tech-stack.md",
  "docs/runbooks/lore-cli-handover.md",
  "docs/runbooks/release-publishing.md",
];
const PACKAGE_OPERATIONAL_FILES = [
  "package.json",
  "bun.lock",
  "bin/lore.cjs",
  ".github/workflows/release.yml",
  "benchmark/ladybug/package-qualification.ts",
  "benchmark/ladybug/qualification-evidence.ts",
  "test/bin-lore.test.ts",
  "test/ladybug-qualification-evidence.test.ts",
  "README.md",
  "ECK-ALIGNMENT.md",
  "docs/index.md",
  "docs/adr/0001-runtime-build-distribution.md",
  "docs/adr/0007-validation-and-coherence.md",
  "docs/adr/0015-lightweight-retrieval-no-vectors.md",
  "docs/reference/lore-cli-release-truth.md",
  "docs/reference/tech-stack.md",
  "docs/runbooks/release-publishing.md",
];

function text(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/**
 * Files allowed to carry a superseded identity, each for a stated reason. A
 * curated *allowlist* is safe where a curated *scan list* is not: adding an entry
 * here is a visible widening that `the exemption set is exactly what is expected`
 * fails on, whereas a file omitted from a scan list is simply never examined.
 */
const PROVENANCE_EXEMPT = new Map([
  ["CHANGELOG.md", "records the superseded @salient-data/lore package family as release history"],
  ["docs/adr/0001-runtime-build-distribution.md", "records jeremy-newhouse/lore as its decision-time repository"],
  ["test/repository-location.test.ts", "defines the superseded identifiers this gate searches for"],
]);

/**
 * Every file Git tracks, excluding `backlog/`, whose task and campaign records are
 * immutable provenance of past decisions rather than operational instructions.
 *
 * Tracked, not on-disk: a brand-new file is invisible here until it is staged,
 * which is the right boundary for a gate about what this repository *records* and
 * is exact in CI, where the tree is always committed. `everyDocument` scans the
 * filesystem instead, so unstaged markdown is still covered.
 */
function everyTrackedFile(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "" && !path.startsWith("backlog/"));
}

/** Every tracked markdown document: the whole `docs/` bundle plus root-level markdown. */
function everyDocument(): string[] {
  const roots = [join(ROOT, "docs")];
  const found = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  for (const dir of roots) {
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      found.push(relative(ROOT, join(entry.parentPath, entry.name)));
    }
  }

  return found.sort();
}

describe("canonical repository location", () => {
  test("every release manifest uses the exact canonical GitHub repository URL", () => {
    const paths = ["package.json", ...PLATFORM_PACKAGES.map((name) => `npm/${name}/package.json`)];

    for (const path of paths) {
      const manifest = JSON.parse(text(path)) as { repository?: { url?: string } };
      expect(manifest.repository?.url).toBe(CANONICAL_REPOSITORY_URL);
    }
  });

  test("active operational documentation uses the canonical slug without a stale self-repository route", () => {
    for (const path of OPERATIONAL_DOCUMENTS) {
      const body = text(path);
      expect(body).toContain(CANONICAL_SLUG);
      for (const stale of STALE_OPERATIONAL_SLUGS) expect(body).not.toContain(stale);
    }
  });

  test("no documentation file anywhere cites a former-org CLI route", () => {
    const documents = everyDocument();
    // Guard the guard: a scan that silently found nothing to read would pass vacuously.
    expect(documents.length).toBeGreaterThan(20);
    expect(documents).toContain("CLAUDE.md");

    const offenders = documents.filter((path) => {
      const body = text(path);
      return ORG_MOVE_STALE_SLUGS.some((stale) => body.includes(stale));
    });

    expect(offenders).toEqual([]);
  });

  test("ADR-0001 classifies its decision-time repository as historical provenance", () => {
    const body = text("docs/adr/0001-runtime-build-distribution.md");
    expect(body).toContain("github.com/jeremy-newhouse/lore");
    expect(body).toContain("historical provenance");
    expect(body).toContain(`github.com/${CANONICAL_SLUG}`);
  });
});

describe("canonical npm package family", () => {
  test("the launcher and all platform manifests use the exact @opum-ai names", () => {
    const root = JSON.parse(text("package.json")) as {
      name?: string;
      optionalDependencies?: Record<string, string>;
      version?: string;
    };
    const expectedPlatformNames = PLATFORM_PACKAGES.map((name) => `${CANONICAL_NPM_PACKAGE}-${name}`).sort();

    expect(root.name).toBe(CANONICAL_NPM_PACKAGE);
    expect(Object.keys(root.optionalDependencies ?? {}).sort()).toEqual(expectedPlatformNames);

    for (const platform of PLATFORM_PACKAGES) {
      const manifest = JSON.parse(text(`npm/${platform}/package.json`)) as { name?: string; version?: string };
      expect(manifest.name).toBe(`${CANONICAL_NPM_PACKAGE}-${platform}`);
      expect(manifest.version).toBe(root.version);
    }
  });

  test("active package routing contains no legacy @salient-data package identity", () => {
    for (const path of PACKAGE_OPERATIONAL_FILES) {
      const body = text(path);
      expect(body).toContain(CANONICAL_NPM_PACKAGE);
      expect(body).not.toContain(STALE_NPM_PACKAGE);
    }
  });

  test("no tracked file anywhere carries a superseded package or repository identity", () => {
    const tracked = everyTrackedFile();
    // Guard the guard: a scan that found nothing to read would pass vacuously.
    expect(tracked.length).toBeGreaterThan(100);
    expect(tracked).toContain("package.json");

    // A silently widened exemption set would hide real offenders, so pin it exactly.
    expect([...PROVENANCE_EXEMPT.keys()].sort()).toEqual([
      "CHANGELOG.md",
      "docs/adr/0001-runtime-build-distribution.md",
      "test/repository-location.test.ts",
    ]);

    const superseded = [STALE_NPM_PACKAGE, ...STALE_OPERATIONAL_SLUGS];
    const offenders = tracked
      .filter((path) => !PROVENANCE_EXEMPT.has(path))
      .flatMap((path) => {
        const body = text(path);
        return superseded.filter((stale) => body.includes(stale)).map((stale) => `${path}: ${stale}`);
      });

    expect(offenders).toEqual([]);
  });

  test("release and qualification code derive tarball names from the @opum-ai scope", () => {
    for (const path of [".github/workflows/release.yml", "benchmark/ladybug/package-qualification.ts"]) {
      const body = text(path);
      expect(body).toContain(CANONICAL_NPM_TARBALL_PREFIX);
      expect(body).not.toContain(STALE_NPM_TARBALL_PREFIX);
    }
  });
});

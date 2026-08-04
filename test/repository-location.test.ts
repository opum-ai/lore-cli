import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CANONICAL_SLUG = "opum-ai/lore-cli";
const CANONICAL_REPOSITORY_URL = `git+https://github.com/${CANONICAL_SLUG}.git`;
const STALE_OPERATIONAL_SLUGS = ["jeremy-newhouse/lore", "salient-data/lore-cli"];
const CANONICAL_NPM_PACKAGE = "@opum-ai/lore";
const STALE_NPM_PACKAGE = "@salient-data/lore";
const CANONICAL_NPM_TARBALL_PREFIX = "opum-ai-lore";
const STALE_NPM_TARBALL_PREFIX = "salient-data-lore";

const PLATFORM_PACKAGES = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];
const OPERATIONAL_DOCUMENTS = [
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

  test("release and qualification code derive tarball names from the @opum-ai scope", () => {
    for (const path of [".github/workflows/release.yml", "benchmark/ladybug/package-qualification.ts"]) {
      const body = text(path);
      expect(body).toContain(CANONICAL_NPM_TARBALL_PREFIX);
      expect(body).not.toContain(STALE_NPM_TARBALL_PREFIX);
    }
  });
});

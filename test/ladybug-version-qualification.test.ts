import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPECTED_LADYBUG_STORAGE_VERSION,
  EXPECTED_LADYBUG_VERSION,
  supportsLadybugNative,
} from "../src/core/ladybug-native";

const root = join(import.meta.dir, "..");
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies: Record<string, string>;
  trustedDependencies: string[];
  patchedDependencies: Record<string, string>;
  files: string[];
  module?: string;
};
const installedManifest = JSON.parse(
  readFileSync(join(root, "node_modules", "@ladybugdb", "core", "package.json"), "utf8"),
) as {
  version: string;
  license: string;
  optionalDependencies: Record<string, string>;
};
const lock = readFileSync(join(root, "bun.lock"), "utf8");
const lockLines = lock.split("\n");

const VERSION = "0.19.0";
const STORAGE_VERSION = "43";
const packages = [
  {
    name: "@ladybugdb/core",
    integrity: "sha512-vlE2D2b6Ej/OiwtBCRtye34j8uRH9aV/ziJM+ZnXow77VkVr8zeVjSrAEj/eisj+uPPQ/pmuOXzJjJra0m0Bbg==",
  },
  {
    name: "@ladybugdb/core-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    integrity: "sha512-3Ut3XL9kowzBoHw0wrN3QnW4xy5wYoPBypeuMtH92j59fol2w9e3lQJ6DM29YJ4F6mAVfW2cYGBXH2l9aXGmmw==",
  },
  {
    name: "@ladybugdb/core-darwin-x64",
    os: "darwin",
    cpu: "x64",
    integrity: "sha512-KHuCBx+jkyxdfFEmmbsfUS1f108P4rS+VNkwCrMLvzJmJOZTZgNKeRmT0vO7qRum5KEoHSIPJLj2Le//rCYigQ==",
  },
  {
    name: "@ladybugdb/core-linux-arm64",
    os: "linux",
    cpu: "arm64",
    integrity: "sha512-z4Z67LZlgj6H7YnKMB1PornbdmeszVxfENusfDQ2MFyOyrze1X6c/3MkhVPyunuaTtriN9SBnEdyK39mB7NdyQ==",
  },
  {
    name: "@ladybugdb/core-linux-x64",
    os: "linux",
    cpu: "x64",
    integrity: "sha512-aJOh7+XbTzCLNloK+KlDXuRmHgr7nLqyQwR/BR8fP/XsWVnxCKGpVVL8s+Lms7JNQAh6vEsvExttGgUq9hAu1Q==",
  },
  {
    name: "@ladybugdb/core-win32-x64",
    os: "win32",
    cpu: "x64",
    integrity: "sha512-y2/IOMKmydo4ZfQPDZuZhiFC104VJQ9lwc0w1KVdvb4Z2RIUUL8/tn5QD4Uq8DUrJGxQhoEESPnlkk69cKaaDQ==",
  },
] as const;

describe("LadybugDB dependency qualification", () => {
  test("pins the selected core package and its five exact optional platform packages", () => {
    expect(rootManifest.dependencies).toBeUndefined();
    expect(rootManifest.module).toBeUndefined();
    expect(rootManifest.files).not.toContain("src");
    expect(rootManifest.devDependencies["@ladybugdb/core"]).toBe(VERSION);
    expect(rootManifest.trustedDependencies).toContain("@ladybugdb/core");
    expect(installedManifest.version).toBe(VERSION);
    expect(installedManifest.license).toBe("MIT");
    expect(installedManifest.optionalDependencies).toEqual(
      Object.fromEntries(packages.slice(1).map(({ name }) => [name, VERSION])),
    );
  });

  test("keeps Ladybug build-only and patches its loader for standalone addon embedding", () => {
    expect(rootManifest.dependencies).toBeUndefined();
    const patchPath = rootManifest.patchedDependencies["@ladybugdb/core@0.19.0"] ?? "";
    expect(patchPath).toBe("patches/@ladybugdb%2Fcore@0.19.0.patch");
    const patch = readFileSync(join(root, patchPath), "utf8");
    expect(patch).toContain('module.exports = require("./lbugjs.node")');
    expect(patch).not.toContain('+const modulePath = join(__dirname, "lbugjs.node")');
  });

  test("locks every selected package to the audited registry integrity and platform gate", () => {
    for (const pkg of packages) {
      const line = lockLines.find((candidate) => candidate.includes(`"${pkg.name}": ["${pkg.name}@${VERSION}"`));
      expect(line).toBeDefined();
      expect(line).toContain(`"${pkg.integrity}"`);
      if ("os" in pkg && "cpu" in pkg) {
        expect(line).toContain(`"os": "${pkg.os}"`);
        expect(line).toContain(`"cpu": "${pkg.cpu}"`);
      }
    }
  });

  test("keeps the selected runtime and storage facts in the import-safe compatibility boundary", () => {
    expect(EXPECTED_LADYBUG_VERSION).toBe(VERSION);
    expect(EXPECTED_LADYBUG_STORAGE_VERSION).toBe(STORAGE_VERSION);
    expect(supportsLadybugNative("win32")).toBe(false);
  });
});

const nativeTest = process.platform === "win32" ? test.skip : test;

nativeTest("the installed addon reports the selected runtime and storage version", async () => {
  const driver = await import("../src/core/ladybug-driver");
  expect(driver.LADYBUG_VERSION).toBe(VERSION);
  expect(driver.LADYBUG_STORAGE_VERSION).toBe(STORAGE_VERSION);
});

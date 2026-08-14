import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "lore-handover-lifecycle-"));
const script = join(dirname(fileURLToPath(import.meta.url)), "audit-handover-lifecycle.mjs");
const active = "**Lifecycle**: executable-current\n\n## Paste-ready prompt\n\nContinue this backlog campaign.\n";
const historical = "**Lifecycle**: historical-non-executable\n\nCampaign settled.\n";

function run(name, files, code, text) {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const [file, body] of Object.entries(files)) writeFileSync(join(directory, file), body);
  const result = spawnSync(process.execPath, [script, directory], { encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== code || !output.includes(text)) throw new Error(`${name}: ${output}`);
}

try {
  run("valid", { "active.md": active, "history.md": historical }, 0, "sole executable cursor");
  run("archive", { "active.md": active, "history.md": `${historical}$backlog-handover restore mode\n` }, 1, "runnable signal");
  run("lines", { "active.md": `${active}${"x\n".repeat(121)}` }, 1, "exceeds 120 lines");
  run("bytes", { "active.md": `${active}${"x".repeat(16 * 1024)}` }, 1, "exceeds 16384 bytes");
  process.stdout.write("handover lifecycle fixtures passed: 4 cases\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}

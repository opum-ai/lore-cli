/** Fixture-only Backlog JSON contract shim for packaged qualification smokes. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH, LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA } from "./fixture-contract";

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("1.49.0\n");
} else if (args.length === 3 && args[0] === "task" && args[1] === "list" && args[2] === "--json") {
  const value: unknown = JSON.parse(
    readFileSync(join(process.cwd(), LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH), "utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as { schema?: unknown }).schema !== LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA ||
    !Array.isArray((value as { tasks?: unknown }).tasks)
  ) {
    throw new Error("fixture task snapshot does not match the benchmark contract");
  }
  const tasks = (value as { tasks: Record<string, unknown>[] }).tasks.map((task) => ({
    ...task,
    type: "task",
    reporter: null,
    createdAt: null,
    updatedAt: null,
  }));
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "task-list", tasks })}\n`);
} else {
  process.stderr.write("fixture Backlog shim supports only --version and task list --json\n");
  process.exitCode = 2;
}

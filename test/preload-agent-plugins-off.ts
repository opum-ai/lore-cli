// LCLI-592 (opum-doc ADR ruling 23): see bunfig.toml. Keeps every in-process `lore init` and
// `lore agents --check` in this suite away from the machine's real `claude` and `codex` CLIs.
//
// This reaches in-process runs only. Measured on Bun 1.3.14: a child started with Bun.spawn,
// Bun.spawnSync or node:child_process WITHOUT an explicit `env` does not see this assignment, so a
// test that spawns a real `lore` process must pass `LORE_AGENT_PLUGINS: "off"` in that child's env
// itself, as test/agent-plugins.test.ts's subprocess cases do.
process.env.LORE_AGENT_PLUGINS = "off";

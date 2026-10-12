import type { On, UiOpenResult } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

// LCLI-705 (opum-doc DEC-172 (4bg) item 2): the Lore pane must not auto-start in a
// teammate (CLAUDECODE=1), headless/SDK/workflow (isInteractive false) process, its clock
// is registered once per process and cancelled at session.end, and no tick spawns more than
// three children. These tests are the mod-kit proof for that; a `lore` pane that polls in a
// process nobody is looking at is exactly the 2026-10-12 host-load incident.

/** A `process.run` result the pane parses. */
const ok = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

/**
 * The children a started pane runs, recorded: every `process.run` argv. The payloads are
 * parseable but empty -- these tests COUNT children, they do not read the catalogue.
 */
function respond(on: On, seen: string[][]): void {
  on("fs.read", async () => ({ value: "" }));
  on("process.run", async (_$, e) => {
    seen.push([...e.argv]);
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    const sub = e.argv[1] ?? "";

    return ok(
      sub === "types"
        ? JSON.stringify({ kind: "types.report", data: { types: [] } })
        : JSON.stringify({ kind: "query.results", data: { hits: [] } }),
    );
  });
}

/**
 * The engine answers a started session needs: the open, the listing, the tool registration,
 * and the two session events. `ui.panes` reports the pane SHOWN, so a tick that runs finds it
 * drawn (the pane's own work is skipped while it is not).
 */
function engine(on: On, opens: Record<string, unknown>[]): void {
  on("ui.open", async (_$, e) => {
    opens.push({ ...e });

    return { value: { isPlaced: true } as UiOpenResult };
  });
  on("ui.panes", async () => ({
    value: [{ id: "lore-pane", title: "Lore", isShown: true, isFocused: false, isPlaced: true }],
  }));
  on("tool.register", async (_$, e) => ({ value: { tool: `mcp__opum-lore__${e.name}` } }));
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
  on("session.end", async (_$, e) => ({ sessionId: e.sessionId }));
}

// A module-level clock guard (LCLI-705 AC2) is one per PROCESS, and the engine runs the whole
// suite in one process: a test that starts a session can find a clock a PREVIOUS test left
// running. `session.end` cancels it, so every test here begins by ending any standing session
// (the inline `$.session.end` below) and then starts its own -- what a real process does across
// a `/clear` too.

test("a non-interactive session opens no pane and starts no clock: no child over five minutes (LCLI-705 AC1/AC4)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: null, isInteractive: false });

  // No pane, and not one `git`/`lore` child: the initial read-back is gated too, not only the
  // clock, so a headless `-p` run spawns nothing for a view nothing draws.
  expect(opens).toEqual([]);
  expect(seen).toEqual([]);

  // Five minutes of a clock that was never registered: a registered one would have ticked ten
  // times by now, and every tick would run 2 `lore` reads plus a `git status`.
  await clock.advance(5 * 60_000);
  expect(seen).toEqual([]);
});

test("a CLAUDECODE=1 session is gated the same way: no pane, no clock, no child over five minutes (LCLI-705 AC1/AC4)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  // The teammate signal of DEC-172 (4bg): CLAUDECODE=1 on every worker, absent on the leader
  // and opum-doc. `HERDR_AGENT` is NOT the gate (the operator's pane, the leader and every
  // teammate alike carry it).
  mock.env(on, { CLAUDECODE: "1" });
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });

  expect(opens).toEqual([]);
  expect(seen).toEqual([]);

  await clock.advance(5 * 60_000);
  expect(seen).toEqual([]);
});

test("an interactive session opens the pane, and one tick stays within three children (LCLI-705 AC1/AC3)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {}); // a person's own process: not a teammate, not headless
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  expect(opens.length).toBeGreaterThan(0);
  const atStart = seen.length;

  // One 30-second period: the WHOLE callback runs once -- cache read (2 `lore`) plus a
  // `git status` for the landing strip -- and never more, which is the bound AC3 fixes.
  await clock.advance(31_000);
  expect(seen.length - atStart).toBe(3);
});

test("session.end cancels the clock, so no child runs after it (LCLI-705 AC2)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  await clock.advance(31_000);
  const afterTick = seen.length;
  expect(afterTick).toBeGreaterThan(0);

  await $.session.end({ reason: "clear", sessionId: "lcli705-cur", resume: { id: "lcli705-cur" } });
  // A period that WOULD have ticked: cancelled, it runs nothing.
  await clock.advance(31_000);
  expect(seen.length).toBe(afterTick);
});

test("a ten-minute soak of an interactive session: three children a period, no stacking (LCLI-705 AC3/AC4)", async ($, on) => {
  // Ten minutes is twenty 30-second periods. The per-process bound is three children a period
  // (refresh's 2 `lore` reads plus countUncommitted's `git status`), and the WHOLE-callback
  // in-flight guard means a period whose work is slow SKIPS its tick rather than stacking a
  // second -- so the count cannot grow past the bound x periods however long the session runs.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  const atStart = seen.length;

  await clock.advance(10 * 60_000);
  const grown = seen.length - atStart;
  // Twenty periods, three children each; the counts are the proof, so they are asserted whole.
  expect(grown).toBe(20 * 3);
});

test("eight interactive sessions in one process still run ONE clock (LCLI-705 AC2/AC4)", async ($, on) => {
  // "No growth across eight processes" in the one process the kit gives: eight session.starts
  // register ONE clock (the module guard), so the per-period child count is three, not
  // twenty-four, and it does not grow with the number of sessions.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  respond(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  for (let i = 0; i < 8; i += 1) {
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  }
  await clock.settle();
  const atStart = seen.length;

  await clock.advance(31_000);
  expect(seen.length - atStart).toBe(3);
});


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

// The in-flight guards themselves (LCLI-705 AC2). The fast `respond` above cannot exercise
// them -- a run that resolves instantly is never still running -- so these HOLD a read-back and
// assert a second period or a second refresh is dropped rather than stacked. Delete
// `tickInFlight` or `refreshInFlight` and these go red.
const loreBody = (sub: string) =>
  ok(
    sub === "types"
      ? JSON.stringify({ kind: "types.report", data: { types: [] } })
      : JSON.stringify({ kind: "query.results", data: { hits: [] } }),
  );

/** A process.run handler that can be put on hold: held `lore` runs block until `release`. */
function holdable(on: On, seen: string[][]): { hold: () => void; release: () => void } {
  let holding = false;
  let release: (() => void) | null = null;
  let gate: Promise<void> = Promise.resolve();
  on("fs.read", async () => ({ value: "" }));
  on("process.run", async (_$, e) => {
    seen.push([...e.argv]);
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    if (holding) {
      await gate;
    }

    return loreBody(e.argv[1] ?? "");
  });

  return {
    hold() {
      holding = true;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release() {
      holding = false;
      release?.();
      release = null;
    },
  };
}

test("a tick that finds the previous one still running is skipped (LCLI-705 AC2)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  const held = holdable(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli705-prior", resume: { id: "lcli705-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  const atStart = seen.length;

  held.hold();
  await clock.advance(31_000); // period 1: its read-back blocks on the hold and stays in flight
  const afterTick1 = seen.length;
  await clock.advance(31_000); // period 2: the first is still running, so this tick is SKIPPED
  const afterTick2 = seen.length;
  held.release();
  await clock.settle(); // let the released run drain before the environment goes, so nothing rejects after the test

  expect(afterTick1).toBeGreaterThan(atStart);
  expect(afterTick2).toBe(afterTick1);
});

test("a refresh during an in-flight refresh is COALESCED: exactly one more runs (LCLI-707 (a))", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  const held = holdable(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli707-prior", resume: { id: "lcli707-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  held.hold();
  const first = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // refresh #1, held in flight
  await clock.settle();
  const mid = seen.length;
  const second = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // in flight -> coalesced, not dropped
  await clock.settle();
  // #2 does not START while #1 runs (still one refresh at a time).
  expect(seen.length).toBe(mid);

  held.release();
  await clock.settle(); // the queued refresh runs AFTER #1 finishes
  await first;
  await second;
  await clock.settle();
  // EXACTLY one more refresh ran — its two `lore` reads, and no third. With the guard reverted to a
  // plain skip this is 0, so the case reddens.
  expect(seen.length - mid).toBe(2);
});

test("session.end clears the refresh guard, so a later refresh is not blocked (LCLI-707 (b))", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  const held = holdable(on, seen);
  engine(on, opens);

  await $.session.end({ reason: "clear", sessionId: "lcli707-prior", resume: { id: "lcli707-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  held.hold();
  const first = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // refresh #1, held in flight
  await clock.settle();
  // The session ends while #1 is STILL running, so its guard is the only thing that could clear it.
  await $.session.end({ reason: "clear", sessionId: "lcli707-cur", resume: { id: "lcli707-cur" } });

  const before = seen.length;
  const second = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // runs only if the guard was reset
  await clock.settle();
  // Without the reset, `refreshInFlight` is still set (from #1) and this refresh is swallowed -> 0, red.
  expect(seen.length).toBeGreaterThan(before);

  held.release();
  await first;
  await second;
  await clock.settle();
});

test("a refresh that outlives session.end cannot clear the successor session's guard (LCLI-709)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  engine(on, opens);
  // Two independent gates: the first holds refresh #1's reads, the second holds everything after, so
  // #1 can unwind while #2 is STILL in flight. Two gates are what makes the cross-session leak
  // observable — with one, releasing it would let both refreshes finish and hide the clobber. The
  // release calls live in a returned method so TypeScript does not narrow them to `null`.
  let r1: (() => void) | null = null;
  let r2: (() => void) | null = null;
  const gate1 = new Promise<void>((resolve) => {
    r1 = resolve;
  });
  const gate2 = new Promise<void>((resolve) => {
    r2 = resolve;
  });
  const gates = {
    held: (which: 1 | 2) => (which === 1 ? gate1 : gate2),
    open: (which: 1 | 2) => {
      (which === 1 ? r1 : r2)?.();
    },
  };
  let armed: 1 | 2 = 1;
  on("fs.read", async () => ({ value: "" }));
  on("process.run", async (_$, e) => {
    seen.push([...e.argv]);
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    await gates.held(armed);

    return loreBody(e.argv[1] ?? "");
  });

  await $.session.end({ reason: "clear", sessionId: "lcli709-prior", resume: { id: "lcli709-prior" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  const first = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // #1 (old generation), held on gate1
  await clock.settle();
  await $.session.end({ reason: "clear", sessionId: "lcli709-cur", resume: { id: "lcli709-cur" } });
  armed = 2;
  const second = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // #2 (new generation), held on gate2
  await clock.settle();
  const mid = seen.length;

  gates.open(1); // #1 unwinds while #2 is still in flight — its `finally` must NOT clear #2's guard
  await clock.settle();
  await first;

  const third = $.tool.call({ tool: "mcp__opum-lore__dashboard" }); // must COALESCE onto #2's guard
  await clock.settle();
  // With the generation token nothing new starts. Without it, #1's unwind left `refreshInFlight`
  // false and this third request starts a SECOND concurrent refresh -> seen grows -> red.
  expect(seen.length).toBe(mid);

  gates.open(2);
  await clock.settle();
  await second;
  await third;
  await clock.settle();
});

test("a tick that outlives session.end cannot clear the successor session's tickInFlight (LCLI-710)", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.env(on, {});
  mock.store(on);
  const seen: string[][] = [];
  const opens: Record<string, unknown>[] = [];
  engine(on, opens);
  // Two gates so tick #1 (old generation) can unwind while tick #2 (new generation) is still running.
  let r1: (() => void) | null = null;
  let r2: (() => void) | null = null;
  const gate1 = new Promise<void>((resolve) => {
    r1 = resolve;
  });
  const gate2 = new Promise<void>((resolve) => {
    r2 = resolve;
  });
  const gates = {
    held: (which: 1 | 2) => (which === 1 ? gate1 : gate2),
    open: (which: 1 | 2) => {
      (which === 1 ? r1 : r2)?.();
    },
  };
  let armed: 0 | 1 | 2 = 0;
  on("fs.read", async () => ({ value: "" }));
  on("process.run", async (_$, e) => {
    seen.push([...e.argv]);
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    if (armed !== 0) {
      await gates.held(armed);
    }

    return loreBody(e.argv[1] ?? "");
  });

  await $.session.end({ reason: "clear", sessionId: "lcli710-a", resume: { id: "lcli710-a" } });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  // Tick #1 in the FIRST session: held mid-body, so it is still running when that session ends.
  armed = 1;
  await clock.advance(31_000);

  await $.session.end({ reason: "clear", sessionId: "lcli710-b", resume: { id: "lcli710-b" } });
  // A SECOND session registers a fresh clock; its tick must be able to run.
  armed = 0;
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  // Tick #2 in the SECOND session, held mid-body too.
  armed = 2;
  await clock.advance(31_000);
  const mid = seen.length;

  gates.open(1); // tick #1 unwinds while tick #2 is still in flight
  await clock.settle();
  const afterUnwind = seen.length;

  // A further tick must be SKIPPED (tick #2 still owns the guard). Without the token, tick #1's
  // unwind cleared `tickInFlight`, so this third tick starts a SECOND concurrent tick -> seen grows.
  await clock.advance(31_000);
  expect(seen.length).toBe(afterUnwind);
  // Control: tick #1's unwind really did land its `countUncommitted` (a git read) above, so a green
  // here is not a test in which no tick ever ran.
  expect(afterUnwind).toBeGreaterThan(mid);

  gates.open(2); // release tick #2 so nothing dangles past the test
  await clock.settle();
});


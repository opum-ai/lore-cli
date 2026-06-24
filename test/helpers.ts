import type { Writer } from "../src/errors";

/**
 * A capturing {@link Writer} for tests: it records every `write` so a test can
 * assert the exact bytes a stream received without touching the real process
 * streams. Shared by the errors and output suites (and future command suites) so
 * there is one fake to evolve, not a copy per file.
 *
 * - `text()` — the joined output verbatim; use it whenever blank-line position or
 *   exact whitespace matters.
 * - `lines()` — split on `\n` with blanks dropped; a convenience for "which
 *   non-empty lines were written", not a substitute for an exact `text()` check.
 */
export function capture(): Writer & { text(): string; lines(): string[] } {
  const chunks: string[] = [];
  return {
    write(s: string): void {
      chunks.push(s);
    },
    text(): string {
      return chunks.join("");
    },
    lines(): string[] {
      return chunks.join("").split("\n").filter(Boolean);
    },
  };
}

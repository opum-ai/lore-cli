// LCLI-664. The Lore pane: a Claude Code pane over the repository's
// documentation bundle, driven entirely by the lore CLI (stdout only;
// warnings on stderr are read solely to explain a failure). Browse, Read
// (rendered and raw), Search and New mirror the design brief in opum-doc,
// `docs/reference/lore-mod-design-brief.md`; the repository is the session's
// own, resolved as the git toplevel, and a fleet/workspace view is
// deliberately out of v1 (operator question Q2). Body editing ships whichever
// arm the operator selects (Q1); until that is relayed the pane hands the
// person Claude-assisted revision and the fields form.
//
// Every `$.noun.method(...)` call lives in this file: the engine's validator
// refuses a noun of `$` passed across an import, so ./lore receives plain
// values (an argv to run, a run's result) and answers with parsed shapes.

import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Catalog, DocState, Edits, View } from "../types";
import type { Outcome, Run } from "./lore";
import {
  BODY_CAP,
  actionArgv,
  actionVerb,
  bundleIdFor,
  cap,
  failure,
  groupByType,
  hasSection,
  internalHrefs,
  isCapped,
  newArgv,
  parseBrowse,
  parseCreated,
  parsePorcelain,
  parseRead,
  parseSearch,
  parseTypes,
  parseValidate,
  patchFrontmatter,
  queryArgv,
  requiredSectionsFor,
  searchArgv,
} from "./lore";

const PANE = "lore-pane";
const COMMAND = "lore-pane";
const REFRESH_MS = 30_000;
const TIMEOUT_MS = 30_000;
const ROW_CAP = 120;

const view = atom({ plugin: "opum-lore", key: "view" } as const, {
  tab: "browse",
  root: null,
  query: "",
  typeFilter: "",
  tagFilter: "",
  acrossRefs: false,
  selectedId: null,
  history: [],
  isRaw: false,
  action: null,
  actionValue: "",
  isLoading: false,
  error: null,
  notice: null,
} satisfies View);

const catalog = atom({ plugin: "opum-lore", key: "catalog" } as const, {
  concepts: [],
  types: [],
  hits: [],
} satisfies Catalog);

const doc = atom({ plugin: "opum-lore", key: "doc" } as const, { concept: null } satisfies DocState);

const edits = atom({ plugin: "opum-lore", key: "edits" } as const, {
  isWriting: false,
  draft: { type: "", title: "", summary: "", tags: "" },
  fields: null,
  uncommitted: [],
} satisfies Edits);

// ── The call sites ────────────────────────────────────────────────────────────

/** Runs `lore <argv>` in the repository root; a command that cannot start resolves code -1. */
async function runLore($: EngineInterface, root: string | null, argv: readonly string[]): Promise<Run> {
  try {
    const result = await $.process.run(["lore", ...argv], {
      ...(root ? { cwd: root } : {}),
      timeoutMs: TIMEOUT_MS,
    });

    return {
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.isStdoutTruncated || result.isStderrTruncated,
    };
  } catch (error) {
    return {
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The git toplevel of the session's cwd, or null outside a repository. */
async function resolveRoot($: EngineInterface): Promise<string | null> {
  try {
    const result = await $.process.run(["git", "rev-parse", "--show-toplevel"], {
      timeoutMs: TIMEOUT_MS,
    });

    return result.exitCode === 0 ? result.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

/** The view's root, resolved on first need (session.start may not have run). */
async function ensureRoot($: EngineInterface): Promise<string | null> {
  const current = (await read($, view)).root;
  if (current) {
    return current;
  }
  const root = await resolveRoot($);
  if (root) {
    await setView($, { root });
  }

  return root;
}

/** The file exactly as on disk, for the Raw view; null when it cannot be read. */
async function readFileText($: EngineInterface, root: string | null, docPath: string): Promise<string | null> {
  if (!root || !docPath) {
    return null;
  }
  try {
    return await $.fs.read(`${root}/${docPath}`);
  } catch {
    return null;
  }
}

async function writeFileText($: EngineInterface, root: string | null, docPath: string, text: string): Promise<Outcome> {
  if (!root || !docPath) {
    return { ok: false, error: "No repository root to write into." };
  }
  try {
    await $.fs.write(`${root}/${docPath}`, text);

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Uncommitted Markdown paths in the repository, for the landing strip. */
async function uncommittedPaths($: EngineInterface, root: string | null): Promise<string[]> {
  if (!root) {
    return [];
  }
  try {
    const result = await $.process.run(["git", "status", "--porcelain"], {
      cwd: root,
      timeoutMs: TIMEOUT_MS,
    });

    return result.exitCode === 0 ? parsePorcelain(result.stdout) : [];
  } catch {
    return [];
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function setView($: EngineInterface, patch: Partial<View>): Promise<void> {
  await update($, view, (current) => ({ ...current, ...patch }));
}

/**
 * The New tab's type picker draws its first option as the chosen one before
 * anything has been chosen, so a draft left at "" blanks the type's
 * required-sections hint and makes Create refuse a form that visibly names a
 * type -- "A type and a title are required." with no `lore new` sent at all
 * (LCLI-664 review F1). The vocabulary read is the first moment the default is
 * knowable, so it is written into the draft here; a draft the person has
 * already chosen in is left alone.
 */
async function seedDraftType($: EngineInterface, types: readonly { name: string }[]): Promise<void> {
  const first = types[0]?.name ?? "";
  if (!first) {
    return;
  }
  await update($, edits, (e) => (e.draft.type ? e : { ...e, draft: { ...e.draft, type: first } }));
}

async function refresh($: EngineInterface): Promise<void> {
  const root = await ensureRoot($);
  const current = await read($, view);
  await setView($, { isLoading: true });
  if (current.tab === "search") {
    const [foundRun, typesRun] = await Promise.all([
      runLore($, root, searchArgv(current)),
      runLore($, root, ["types", "--json"]),
    ]);
    const found = parseSearch(foundRun);
    const types = parseTypes(typesRun);
    if (found.ok) {
      await update($, catalog, (c) => ({ ...c, hits: found.hits, types: types ?? c.types }));
      await seedDraftType($, types ?? []);
      await setView($, { isLoading: false, error: null });
    } else {
      await setView($, { isLoading: false, error: found.error });
    }

    return;
  }
  const [query, types] = await Promise.all([
    runLore($, root, queryArgv(current)),
    runLore($, root, ["types", "--json"]),
  ]);
  const browse = parseBrowse(query, types);
  if (browse.ok) {
    await update($, catalog, (c) => ({
      ...c,
      concepts: browse.concepts,
      types: browse.types,
    }));
    await seedDraftType($, browse.types);
    await setView($, { isLoading: false, error: null });
  } else {
    await setView($, { isLoading: false, error: browse.error });
  }
}

async function loadConcept($: EngineInterface, id: string, patch: Partial<View> = {}): Promise<void> {
  const root = await ensureRoot($);
  await setView($, { isLoading: true });
  const [readRun, tasksRun] = await Promise.all([
    runLore($, root, ["read", id, "--json"]),
    runLore($, root, ["tasks", id, "--json"]),
  ]);
  const result = parseRead(readRun, tasksRun, id);
  if (!result.ok) {
    await setView($, { isLoading: false, error: result.error });
    return;
  }
  const raw = await readFileText($, root, result.doc.repoPath);
  await update($, doc, () => ({ concept: { ...result.doc, raw } }));
  await setView($, {
    isLoading: false,
    error: null,
    selectedId: id,
    isRaw: false,
    action: null,
    actionValue: "",
    ...patch,
  });
}

async function openConcept($: EngineInterface, id: string): Promise<void> {
  const current = await read($, view);
  const history =
    current.selectedId && current.selectedId !== id
      ? [...current.history, current.selectedId].slice(-50)
      : current.history;
  await loadConcept($, id, { tab: "read", history });
}

async function goBack($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const previous = current.history[current.history.length - 1];
  if (!previous) {
    return;
  }
  await loadConcept($, previous, { tab: "read", history: current.history.slice(0, -1) });
}

async function showTab($: EngineInterface, tab: View["tab"]): Promise<void> {
  await setView($, { tab, error: null, notice: null });
  if (tab === "browse" || tab === "search" || tab === "new") {
    await refresh($);
  }
}

/** A submit that changes the view before it reads it, so the read is never stale. */
async function submitWith($: EngineInterface, patch: Partial<View>): Promise<void> {
  await setView($, patch);
  await refresh($);
}

async function toggleAcross($: EngineInterface): Promise<void> {
  const current = await read($, view);
  await setView($, { acrossRefs: !current.acrossRefs });
  await refresh($);
}

async function pickFilter($: EngineInterface, key: "typeFilter", value: string): Promise<void> {
  await setView($, { [key]: value });
  await refresh($);
}

async function countUncommitted($: EngineInterface): Promise<void> {
  const root = await ensureRoot($);
  const uncommitted = await uncommittedPaths($, root);
  await update($, edits, (e) => ({ ...e, uncommitted }));
}

async function openFields($: EngineInterface): Promise<void> {
  const { concept } = await read($, doc);
  if (!concept) {
    return;
  }
  await update($, edits, (e) => ({
    ...e,
    fields: {
      type: concept.type,
      title: concept.title,
      summary: concept.summary ?? "",
      tags: concept.tags.join(", "),
      status: concept.status ?? "",
    },
  }));
}

async function saveFields($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { concept } = await read($, doc);
  const { fields } = await read($, edits);
  if (!concept || !fields || !current.root) {
    return;
  }
  if (!concept.raw) {
    await setView($, { error: "The file has not been read yet." });

    return;
  }
  const tags = fields.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const next = patchFrontmatter(concept.raw, {
    title: fields.title,
    summary: fields.summary.trim() ? fields.summary.trim() : null,
    tags,
    status: fields.status.trim() ? fields.status.trim() : null,
  });
  if (next === null) {
    await setView($, { error: "The file carries no frontmatter to edit." });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const wrote = await writeFileText($, current.root, concept.repoPath, next);
  if (!wrote.ok) {
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, { error: `Could not write ${concept.repoPath}: ${wrote.error}` });

    return;
  }
  const checked = parseValidate(await runLore($, current.root, ["validate", concept.repoPath, "--json"]));
  if (!checked.ok) {
    // A failed validation keeps the previous file: the bytes read before the
    // edit go back, and lore's own message is what the person sees.
    const restored = await writeFileText($, current.root, concept.repoPath, concept.raw);
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, {
      error: restored.ok
        ? checked.error
        : `${checked.error} (and restoring the previous file failed: ${restored.error})`,
    });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: false, fields: null }));
  await setView($, { notice: "Saved and validated.", error: null });
  await loadConcept($, concept.id);
  await countUncommitted($);
}

async function createNew($: EngineInterface): Promise<void> {
  const current = await read($, view);
  const { draft } = await read($, edits);
  if (!draft.type.trim() || !draft.title.trim()) {
    await setView($, { error: "A type and a title are required." });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const result = parseCreated(await runLore($, current.root, newArgv(draft)));
  await update($, edits, (e) => ({ ...e, isWriting: false }));
  if (!result.ok) {
    await setView($, { error: result.error });

    return;
  }
  await setView($, { notice: `Created ${result.id ?? draft.title}.`, error: null });
  await update($, edits, (e) => ({
    ...e,
    draft: { type: draft.type, title: "", summary: "", tags: "" },
  }));
  if (result.id) {
    await openConcept($, result.id);
  }
  await refresh($);
  await countUncommitted($);
}

async function submitActionWith($: EngineInterface, value: string): Promise<void> {
  await setView($, { actionValue: value });
  await submitAction($);
}

async function submitAction($: EngineInterface): Promise<void> {
  const current = await read($, view);
  if (!current.selectedId || !current.action) {
    return;
  }
  const built = actionArgv(current.action, current.selectedId, current.actionValue);
  if ("error" in built) {
    await setView($, { error: built.error });

    return;
  }
  await update($, edits, (e) => ({ ...e, isWriting: true }));
  const verb = actionVerb(current.action);
  const run = await runLore($, current.root, built.argv);
  if (run.code !== 0) {
    await update($, edits, (e) => ({ ...e, isWriting: false }));
    await setView($, { error: failure(run, verb) });

    return;
  }
  const sync = await runLore($, current.root, ["sync", "--json"]);
  await update($, edits, (e) => ({ ...e, isWriting: false }));
  if (sync.code !== 0) {
    await setView($, { error: `${verb}, but ${failure(sync, "lore sync")}` });

    return;
  }
  const nextId =
    current.action === "rename"
      ? (current.actionValue.trim().split(/\s+/)[0] ?? current.selectedId)
      : current.selectedId;
  await setView($, { action: null, actionValue: "", notice: `${verb}; lore sync ran.`, error: null });
  await openConcept($, nextId);
  await refresh($);
  await countUncommitted($);
}

// ── The module ────────────────────────────────────────────────────────────────

export const register: Register = (on, _options) => {
  on("session.start", async ($, e, next) => {
    await setView($, { root: await resolveRoot($) });
    await $.command.register({
      name: COMMAND,
      description:
        "Open the Lore pane: browse, read (rendered or raw), search, create and edit this repository’s docs through the lore CLI.",
    });
    void refresh($);
    void countUncommitted($);
    void $.ui.open({ id: PANE, title: "Lore" });
    $.clock.every(REFRESH_MS, () => {
      void (async () => {
        const panes = await $.ui.panes();
        if (panes.some((pane) => pane.id === PANE && pane.isShown)) {
          await refresh($);
          await countUncommitted($);
        }
      })();
    });

    return next(e);
  });

  on("command.run", { command: COMMAND }, async ($) => {
    await $.ui.open({ id: PANE, title: "Lore", focus: true });
    void refresh($);

    return { text: "Lore pane opened." };
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    if (e.surface === "mobile") {
      const { Box, Text } = $.ui.resolve(e);

      return (
        <Box flexDirection="column">
          <Text>The Lore pane needs the terminal or desktop: open it there to browse and edit.</Text>
        </Box>
      );
    }

    const { Box, Button, Code, Input, Markdown, Select, Text } = $.ui.resolve(e);
    const current = await read($, view);
    const { concepts, types, hits } = await read($, catalog);
    const { concept } = await read($, doc);
    const { isWriting, draft, fields, uncommitted } = await read($, edits);

    const tabs = (
      <Box>
        <Button
          key="tab-browse"
          label="Browse"
          hotkey="1"
          variant={current.tab === "browse" ? "primary" : undefined}
          onPress={() => void showTab($, "browse")}
        />
        <Text> </Text>
        <Button
          key="tab-read"
          label="Read"
          hotkey="2"
          variant={current.tab === "read" ? "primary" : undefined}
          onPress={() => void showTab($, "read")}
        />
        <Text> </Text>
        <Button
          key="tab-search"
          label="Search"
          hotkey="3"
          variant={current.tab === "search" ? "primary" : undefined}
          onPress={() => void showTab($, "search")}
        />
        <Text> </Text>
        <Button
          key="tab-new"
          label="New"
          hotkey="4"
          variant={current.tab === "new" ? "primary" : undefined}
          onPress={() => void showTab($, "new")}
        />
        <Text> </Text>
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refresh($)} />
        <Text> </Text>
        <Button
          key="across"
          label={current.acrossRefs ? "Refs: on" : "Refs: off"}
          hotkey="a"
          onPress={() => void toggleAcross($)}
        />
      </Box>
    );

    const statusLine = current.error ? (
      <Text color="red" wrap="truncate">
        {current.error}
      </Text>
    ) : current.notice ? (
      <Text dimColor wrap="truncate">
        {current.notice}
      </Text>
    ) : current.isLoading ? (
      <Text dimColor>Reading the bundle…</Text>
    ) : null;

    const strip =
      uncommitted.length > 0 && current.root ? (
        <Box>
          <Text color="yellow" wrap="truncate">
            {uncommitted.length} documentation {uncommitted.length === 1 ? "change" : "changes"} not committed yet.{" "}
          </Text>
          <Button
            key="land"
            label="Ask Claude to land them"
            onPress={() =>
              void $.prompt.fill({
                text: "Land the uncommitted documentation changes in this repository through a branch and pull request, following the opum-sdlc skill. Run `lore check` as the definition of done.",
                mode: "replace",
              })
            }
          />
        </Box>
      ) : null;

    if (current.tab === "browse") {
      const room = Math.max(6, e.props.scroll.bodyRows - 10);
      type BrowseRow =
        | { kind: "group"; key: string; type: string; count: number }
        | { kind: "row"; key: string; id: string; title: string };
      const flat: BrowseRow[] = [];
      for (const group of groupByType(concepts)) {
        if (flat.length >= room || flat.length >= ROW_CAP) {
          break;
        }
        flat.push({
          kind: "group",
          key: `group-${group.type}`,
          type: group.type,
          count: group.rows.length,
        });
        for (const row of group.rows) {
          if (flat.length >= room || flat.length >= ROW_CAP) {
            break;
          }
          flat.push({ kind: "row", key: `open-${row.id}`, id: row.id, title: row.title });
        }
      }

      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          {strip}
          <Text dimColor wrap="truncate">
            {concepts.length} {concepts.length === 1 ? "concept" : "concepts"}
            {current.typeFilter ? ` of type ${current.typeFilter}` : ""}
            {current.tagFilter ? ` tagged ${current.tagFilter}` : ""}
            {current.acrossRefs ? ", across refs" : ""}.
          </Text>
          {flat.map((entry) =>
            entry.kind === "group" ? (
              <Text key={entry.key} bold>
                {entry.type} ({entry.count})
              </Text>
            ) : (
              <Button
                key={entry.key}
                label={entry.title}
                plain
                dimColor
                onPress={() => void openConcept($, entry.id)}
              />
            ),
          )}
        </Box>
      );
    }

    if (current.tab === "search") {
      const room = Math.max(5, e.props.scroll.bodyRows - 12);
      const typeOptions = [
        { value: "", label: "all types" },
        ...types.map((one) => ({ value: one.name, label: one.name })),
      ];

      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          <Input
            key="search-text"
            placeholder="Search the bundle"
            value={current.query}
            submitLabel="Search"
            onInput={(value: string) => void setView($, { query: value })}
            onSubmit={(value: string) => void submitWith($, { query: value })}
          />
          <Box>
            <Select
              key="search-type"
              label="type:"
              options={typeOptions}
              value={current.typeFilter}
              onSelect={(value: string) => void pickFilter($, "typeFilter", value)}
            />
            <Text> </Text>
            <Input
              key="search-tag"
              label="tag:"
              placeholder="any"
              value={current.tagFilter}
              submitLabel="Filter"
              onInput={(value: string) => void setView($, { tagFilter: value })}
              onSubmit={(value: string) => void submitWith($, { tagFilter: value })}
            />
          </Box>
          <Text dimColor wrap="truncate">
            {hits.length} {hits.length === 1 ? "result" : "results"}
            {current.acrossRefs ? ", across refs" : ""}.
          </Text>
          {hits.slice(0, room).map((hit) => (
            <Box key={`hit-${hit.id}`} flexDirection="column">
              <Button
                key={`open-${hit.id}`}
                label={hit.title}
                plain
                dimColor
                onPress={() => void openConcept($, hit.id)}
              />
              <Text dimColor wrap="truncate">
                {hit.type} · {hit.id}
              </Text>
              {hit.snippet ? <Text wrap="truncate">{hit.snippet}</Text> : null}
            </Box>
          ))}
        </Box>
      );
    }

    if (current.tab === "new") {
      const typeOptions = types.map((one) => ({ value: one.name, label: one.name }));
      const required = types.find((one) => one.name === draft.type)?.requiredSections ?? [];

      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          {typeOptions.length === 0 ? (
            <Text dimColor>No type vocabulary read yet — press Refresh.</Text>
          ) : (
            <Select
              key="new-type"
              label="type:"
              options={typeOptions}
              value={draft.type || (typeOptions[0]?.value ?? "")}
              onSelect={(value: string) =>
                void update($, edits, (state) => ({
                  ...state,
                  draft: { ...state.draft, type: value },
                }))
              }
            />
          )}
          <Input
            key="new-title"
            label="title:"
            placeholder="A title for the new document"
            value={draft.title}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, title: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, title: value },
              }))
            }
          />
          <Input
            key="new-summary"
            label="summary:"
            placeholder="One sentence"
            value={draft.summary}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, summary: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, summary: value },
              }))
            }
          />
          <Input
            key="new-tags"
            label="tags:"
            placeholder="comma-separated"
            value={draft.tags}
            submitLabel="Set"
            onInput={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, tags: value },
              }))
            }
            onSubmit={(value: string) =>
              void update($, edits, (state) => ({
                ...state,
                draft: { ...state.draft, tags: value },
              }))
            }
          />
          {required.length > 0 ? (
            <Text dimColor wrap="truncate">
              Afterwards the type wants: {required.join(", ")}.
            </Text>
          ) : null}
          <Box>
            <Button
              key="create"
              label={isWriting ? "Creating…" : "Create"}
              variant="primary"
              onPress={() => void createNew($)}
            />
          </Box>
          <Text dimColor wrap="truncate">
            Runs `lore new` in this repository; the result opens in Read.
          </Text>
        </Box>
      );
    }

    // Read tab.
    if (!concept) {
      return (
        <Box flexDirection="column">
          {tabs}
          {statusLine}
          <Text dimColor>Pick a document from Browse or Search.</Text>
        </Box>
      );
    }
    const required = requiredSectionsFor(types, concept.type);
    const missing = required.filter((name) => !hasSection(concept.body, name));

    const fieldsForm = fields ? (
      <Box flexDirection="column">
        <Input
          key="f-title"
          label="title:"
          value={fields.title}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, title: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, title: value } } : state,
            )
          }
        />
        <Input
          key="f-summary"
          label="summary:"
          value={fields.summary}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, summary: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, summary: value } } : state,
            )
          }
        />
        <Input
          key="f-tags"
          label="tags:"
          value={fields.tags}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, tags: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, tags: value } } : state,
            )
          }
        />
        <Input
          key="f-status"
          label="status:"
          value={fields.status}
          submitLabel="Set"
          onInput={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, status: value } } : state,
            )
          }
          onSubmit={(value: string) =>
            void update($, edits, (state) =>
              state.fields ? { ...state, fields: { ...state.fields, status: value } } : state,
            )
          }
        />
        <Box>
          <Button
            key="f-save"
            label={isWriting ? "Saving…" : "Save"}
            variant="primary"
            onPress={() => void saveFields($)}
          />
          <Text> </Text>
          <Button
            key="f-cancel"
            label="Cancel"
            onPress={() => void update($, edits, (state) => ({ ...state, fields: null }))}
          />
        </Box>
      </Box>
    ) : null;

    const actionForm = current.action ? (
      <Box>
        <Input
          key="action-value"
          label={`${current.action}:`}
          placeholder={
            current.action === "rename"
              ? "new/id"
              : current.action === "supersede"
                ? "replacement/id"
                : "LCLI-123 LCLI-124"
          }
          value={current.actionValue}
          submitLabel="Run"
          autoFocus
          onInput={(value: string) => void setView($, { actionValue: value })}
          onSubmit={(value: string) => void submitActionWith($, value)}
        />
        <Text> </Text>
        <Button key="action-cancel" label="Cancel" onPress={() => void setView($, { action: null, actionValue: "" })} />
      </Box>
    ) : null;

    return (
      <Box flexDirection="column">
        {tabs}
        {statusLine}
        {strip}
        <Box>
          <Text bold wrap="truncate">
            {concept.title}
          </Text>
        </Box>
        <Text dimColor wrap="truncate">
          {concept.id} · {concept.type}
          {concept.status ? ` · ${concept.status}` : ""}
          {concept.tags.length > 0 ? ` · ${concept.tags.join(", ")}` : ""}
          {concept.tasks.length > 0
            ? ` · ${concept.tasks.length} linked ${concept.tasks.length === 1 ? "task" : "tasks"}`
            : ""}
        </Text>
        {concept.tasks.length > 0 ? (
          <Text dimColor wrap="truncate">
            {concept.tasks.map((task) => `${task.id} ${task.status}`).join("  ")}
          </Text>
        ) : null}
        <Box>
          <Button
            key="view-rendered"
            label="Rendered"
            variant={current.isRaw ? undefined : "primary"}
            onPress={() => void setView($, { isRaw: false })}
          />
          <Text> </Text>
          <Button
            key="view-raw"
            label="Raw"
            variant={current.isRaw ? "primary" : undefined}
            onPress={() => void setView($, { isRaw: true })}
          />
          <Text> </Text>
          <Button key="back" label="Back" hotkey="b" onPress={() => void goBack($)} />
          <Text> </Text>
          <Button key="edit-fields" label="Edit fields" hotkey="e" onPress={() => void openFields($)} />
          <Text> </Text>
          <Button
            key="ask"
            label="Ask Claude…"
            onPress={() =>
              void $.prompt.fill({
                text: `Revise the document ${concept.id} in this repository: `,
                mode: "replace",
              })
            }
          />
        </Box>
        <Box>
          <Button
            key="act-rename"
            label="Rename…"
            onPress={() => void setView($, { action: "rename", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-supersede"
            label="Supersede…"
            onPress={() => void setView($, { action: "supersede", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-link"
            label="Link task…"
            onPress={() => void setView($, { action: "link", actionValue: "" })}
          />
          <Text> </Text>
          <Button
            key="act-unlink"
            label="Unlink task…"
            onPress={() => void setView($, { action: "unlink", actionValue: "" })}
          />
        </Box>
        {actionForm}
        {fieldsForm}
        {required.length > 0 ? (
          <Text dimColor wrap="truncate">
            Required sections:{" "}
            {required.map((name) => `${hasSection(concept.body, name) ? "✓" : "•"} ${name}`).join("  ")}
            {missing.length === 0 ? " (all present)" : ""}
          </Text>
        ) : null}
        <Box marginTop={1}>
          {current.isRaw ? (
            <Code source={cap(concept.raw ?? concept.body)} path={concept.path} startLine={1} />
          ) : (
            <Markdown
              key="body"
              text={cap(concept.body)}
              pressableLinks={internalHrefs(concept.body)}
              onLinkPress={(link) => {
                const id = bundleIdFor(link.href, concept.id);
                if (id) {
                  void openConcept($, id);
                }
              }}
            />
          )}
        </Box>
        {isCapped(concept.raw ?? concept.body) && !current.isRaw ? (
          <Text dimColor wrap="truncate">
            Truncated at {BODY_CAP} characters; switch to Raw or open the file for the rest.
          </Text>
        ) : null}
        {isCapped(concept.raw ?? concept.body) && current.isRaw ? (
          <Text dimColor wrap="truncate">
            Truncated at {BODY_CAP} characters; open {concept.repoPath} for the rest.
          </Text>
        ) : null}
      </Box>
    );
  });
};

// VENDORED, DO NOT EDIT: `regionForReference` (with its `breadcrumbAt`/`nodeText` helpers) as it
// stood BEFORE LCLI-647.
//
// Provenance: `git show 7a899e71235a9ecea9bc7ee5cdf7c70e1a2cb746:src/core/agent-context.ts`
// (origin/dev's tip when LCLI-647 branched), plus `src/core/bundle.ts`'s `walkMdast`/`nodeText`
// from the same ref, inlined so this control is self-contained. Everything below the header is
// those bytes, verbatim, with only the TS->JS type syntax and the import surface adapted.
//
// Why it exists: the LCLI-647 regression must prove the fixture it uses reproduces the defect it
// is about. The pre-fix renderer scanned TOP-LEVEL headings only and threw a PLAIN `Error` when
// the search missed, so a profile anchored on a heading nested in a blockquote or list item — which
// the validator (`headingSlugs`) accepts, because its walk sees every mdast node — crashed
// `lore agent context` with an uncaught exit 1 and zero bytes of stdout (LCLI-642 review F1).
// test/lcli647-nested-heading-anchors.test.ts runs the same body and anchor through this module and
// through the current build in the same test, and asserts they disagree; if a future change made
// this control resolve nested anchors, the case that asserts it still throws goes red, which is the
// signal that the control has stopped being a control.
import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";

/** `src/core/bundle.ts`'s walkMdast at the ref above, inlined. */
function walkMdast(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    visit(node);
    if ("children" in node) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child !== undefined) stack.push(child);
      }
    }
  }
}

/** `src/core/bundle.ts`'s nodeText at the ref above, inlined. */
function nodeText(node) {
  let text = "";
  walkMdast(node, (current) => {
    if (current.type === "text" || current.type === "inlineCode") {
      text += current.value;
    }
  });
  return text;
}

function offsetStart(node) {
  return node.position?.start.offset ?? 0;
}

/** `src/core/agent-context.ts`'s oneLine at the ref above, inlined. */
function oneLine(value) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The pre-fix `breadcrumbAt`, which read top-level children only. */
function breadcrumbAt(children, target, prefix) {
  const stack = [];
  for (const child of children) {
    if (child.type !== "heading") continue;
    while ((stack.at(-1)?.depth ?? 0) >= child.depth) stack.pop();
    stack.push(child);
    if (child === target) break;
  }
  const own = stack.map((heading) => oneLine(nodeText(heading))).join(" > ");
  return [prefix, own].filter((part) => part !== undefined && part !== "").join(" > ");
}

/**
 * The pre-fix region resolver: top-level headings only, and a plain `Error` — not a `LoreError` —
 * when the anchor matches nothing it can see. Returns `{ body, breadcrumb }`.
 */
export function regionForReference(body, anchor) {
  if (anchor === undefined) return { body };
  const tree = fromMarkdown(body);
  const slugger = new GithubSlugger();
  const headings = tree.children.filter((child) => child.type === "heading");
  for (const heading of headings) {
    if (slugger.slug(nodeText(heading)) !== anchor) continue;
    const start = offsetStart(heading);
    let end = body.length;
    for (const later of headings) {
      if (offsetStart(later) > start && later.depth <= heading.depth) {
        end = offsetStart(later);
        break;
      }
    }
    return { body: body.slice(start, end), breadcrumb: breadcrumbAt(tree.children, heading) };
  }
  throw new Error(`validated heading disappeared: ${anchor}`);
}

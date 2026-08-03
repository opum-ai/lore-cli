/** Pure snapshot, view-model, and self-contained artifact logic for the local graph explorer. */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  EXPLORER_CHANGE_SNAPSHOT_SCHEMA_VERSION,
  EXPLORER_RENDER_LIMITS,
  EXPLORER_SNAPSHOT_SCHEMA_VERSION,
  type ExplorerChangeSnapshot,
  type ExplorerSnapshot,
  parseExplorerChangeSnapshot,
  parseExplorerSnapshot,
  serializeExplorerChangeSnapshot,
  serializeExplorerSnapshot,
} from "./explorer-contract";
import type { LadybugProjectionSource, ProjectionConceptRecord, ProjectionEdgeRecord } from "./ladybug-source";
import { compareCodeUnits } from "./order";
import { CHANGED_MAX_LIMIT, compareRetainedSnapshots, type RetainedSnapshot } from "./snapshot";

export const EXPLORER_ARTIFACT_VERSION = "lore-explorer-artifact/1" as const;

export type ExplorerNodeKind = "repository" | "concept" | "task";

export interface ExplorerViewState {
  readonly search?: string;
  readonly kinds?: readonly ExplorerNodeKind[];
  readonly types?: readonly string[];
  readonly statuses?: readonly string[];
  readonly focusRecordKey?: string | null;
  readonly selectedRecordKey?: string | null;
  readonly depth?: number;
  readonly limit?: number;
}

export interface ExplorerViewNode {
  readonly recordKey: string;
  readonly kind: ExplorerNodeKind;
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly summary: string | null;
  readonly status: string | null;
  readonly tags: readonly string[];
  readonly sourcePath: string | null;
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly bundleId: string;
  readonly gitCommit: string | null;
  readonly exportDigest: string;
}

export interface ExplorerViewEdge {
  readonly recordKey: string;
  readonly edgeKind: string;
  readonly fromRecordKey: string;
  readonly toRecordKey: string | null;
  readonly target: string;
  readonly dangling: boolean;
  readonly relation: "inbound" | "outbound" | "both" | "none";
}

export interface ExplorerView {
  readonly nodes: readonly ExplorerViewNode[];
  readonly edges: readonly ExplorerViewEdge[];
  readonly selected: ExplorerViewNode | null;
  readonly supersessionChain: readonly string[];
  readonly totalMatchingNodes: number;
  readonly truncated: boolean;
}

/** Build the separate historical explorer contract without changing ordinary explorer bytes. */
export function buildExplorerChangeSnapshot(
  from: RetainedSnapshot,
  to: RetainedSnapshot,
  options: {
    readonly mode: "snapshot" | "comparison";
    readonly repositories?: readonly string[];
  },
): ExplorerChangeSnapshot {
  return parseExplorerChangeSnapshot({
    schemaVersion: EXPLORER_CHANGE_SNAPSHOT_SCHEMA_VERSION,
    mode: options.mode,
    from,
    to,
    comparison: compareRetainedSnapshots(from, to, {
      limit: CHANGED_MAX_LIMIT,
      repositories: options.repositories ?? [],
    }),
  });
}

/** Map the validated projection source used by the persistent index into the frozen browser contract. */
export function buildExplorerSnapshot(source: LadybugProjectionSource): ExplorerSnapshot {
  const common = {
    repositoryScopeKey: source.repositoryScopeKey,
    snapshotKey: source.snapshotKey,
    bundleId: source.manifest.bundle.id,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
  };
  const concepts = source.concepts
    .map((record) => conceptFact(record, common))
    .sort((a, b) => compareCodeUnits(a.recordKey, b.recordKey));
  const tasks = source.tasks
    .map((record) => ({
      ...common,
      recordKey: record.key,
      sourcePath: null,
      kind: "task" as const,
      taskId: record.id,
      title: bounded(record.title, 1_024) ?? record.id,
      summary: null,
      status: bounded(record.status, 256) ?? "Unknown",
      labels: boundedList(record.labels, 256, 256),
      priority: bounded(record.priority, 256),
      assignees: boundedList(record.assignees, 256, 256),
      milestone: bounded(record.milestone, 256),
      parentTaskId: bounded(record.parentTaskId, 256),
    }))
    .sort((a, b) => compareCodeUnits(a.recordKey, b.recordKey));
  const conceptPaths = new Map(concepts.map((concept) => [concept.recordKey, concept.sourcePath]));
  const authoredEdges = source.authoredEdges
    .map((record) => edgeFact(record, common, conceptPaths.get(record.from) ?? null))
    .sort(compareExplorerEdges);
  const hasFacts = concepts.length + tasks.length + authoredEdges.length > 0;
  const repositories = hasFacts
    ? [
        {
          ...common,
          kind: "repository" as const,
          docsRoot: source.manifest.bundle.docsRoot,
          displayName: repositoryDisplayName(source),
        },
      ]
    : [];
  const edgeFingerprints = new Set<string>();
  let duplicateEdges = 0;
  let danglingEdges = 0;
  for (const edge of authoredEdges) {
    if (edge.dangling) danglingEdges += 1;
    const fingerprint = [edge.fromRecordKey, edge.edgeKind, edge.target].join("\0");
    if (edgeFingerprints.has(fingerprint)) duplicateEdges += 1;
    edgeFingerprints.add(fingerprint);
  }
  const warnings = [...new Set(source.warnings.map((warning) => bounded(warning, 1_024)).filter(isString))]
    .sort(compareCodeUnits)
    .slice(0, 64);
  return parseExplorerSnapshot({
    schemaVersion: EXPLORER_SNAPSHOT_SCHEMA_VERSION,
    source: {
      ...common,
      docsRoot: source.manifest.bundle.docsRoot,
      sourceFingerprint: source.sourceFingerprint,
      generatedAt: null,
    },
    facts: { repositories, concepts, tasks, authoredEdges },
    health: {
      state: hasFacts ? "ready" : "empty",
      messageCode: null,
      counts: {
        repositories: repositories.length,
        concepts: concepts.length,
        tasks: tasks.length,
        authoredEdges: authoredEdges.length,
        danglingEdges,
        duplicateEdges,
      },
      warnings,
    },
  });
}

/** Derive the bounded list/relationship model shared by tests and the browser runtime contract. */
export function deriveExplorerView(snapshotValue: unknown, state: ExplorerViewState = {}): ExplorerView {
  const snapshot = parseExplorerSnapshot(snapshotValue);
  const allNodes = explorerNodes(snapshot);
  const byKey = new Map(allNodes.map((node) => [node.recordKey, node]));
  const search = (state.search ?? "").trim().toLowerCase();
  const kinds = new Set(state.kinds ?? []);
  const types = new Set((state.types ?? []).map((type) => type.toLowerCase()));
  const statuses = new Set((state.statuses ?? []).map((status) => status.toLowerCase()));
  const focus = state.focusRecordKey ?? null;
  const depth = Math.max(0, Math.min(state.depth ?? 1, EXPLORER_RENDER_LIMITS.maximumFocusDepth));
  const neighborhood = focus === null ? null : focusNeighborhood(snapshot, focus, depth);
  const matching = allNodes.filter((node) => {
    if (kinds.size > 0 && !kinds.has(node.kind)) return false;
    if (types.size > 0 && !types.has(node.type.toLowerCase())) return false;
    if (statuses.size > 0 && !statuses.has((node.status ?? "").toLowerCase())) return false;
    if (neighborhood !== null && !neighborhood.has(node.recordKey)) return false;
    if (search === "") return true;
    return [node.id, node.type, node.title, node.summary ?? "", node.status ?? "", node.sourcePath ?? "", ...node.tags]
      .join("\n")
      .toLowerCase()
      .includes(search);
  });
  const requestedLimit = state.limit ?? EXPLORER_RENDER_LIMITS.initialNodeLimit;
  const limit = Math.max(0, Math.min(requestedLimit, EXPLORER_RENDER_LIMITS.maximumVisibleNodes));
  const nodes = matching.slice(0, limit);
  const visible = new Set(nodes.map((node) => node.recordKey));
  const selectedKey = state.selectedRecordKey ?? focus;
  const edgeLimit =
    focus === null ? EXPLORER_RENDER_LIMITS.initialEdgeLimit : EXPLORER_RENDER_LIMITS.maximumVisibleEdges;
  const edges = snapshot.facts.authoredEdges
    .filter((edge) => visible.has(edge.fromRecordKey) && (edge.toRecordKey === null || visible.has(edge.toRecordKey)))
    .slice(0, edgeLimit)
    .map((edge) => ({
      recordKey: edge.recordKey,
      edgeKind: edge.edgeKind,
      fromRecordKey: edge.fromRecordKey,
      toRecordKey: edge.toRecordKey,
      target: edge.target,
      dangling: edge.dangling,
      relation: edgeRelation(edge, selectedKey),
    }));
  const selected = selectedKey === null || selectedKey === undefined ? null : (byKey.get(selectedKey) ?? null);
  return {
    nodes,
    edges,
    selected,
    supersessionChain: selected === null ? [] : supersessionChain(snapshot, selected.recordKey),
    totalMatchingNodes: matching.length,
    truncated: nodes.length < matching.length,
  };
}

/** Render one deterministic, self-contained HTML file. Snapshot bytes are base64-embedded and never fetched. */
export function renderExplorerArtifact(snapshotValue: unknown): string {
  const snapshot = parseExplorerSnapshot(snapshotValue);
  const snapshotBytes = serializeExplorerSnapshot(snapshot);
  const encoded = Buffer.from(snapshotBytes, "utf8").toString("base64");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="generator" content="${EXPLORER_ARTIFACT_VERSION}">
<title>Lore graph explorer</title>
<style>
:root{color-scheme:light dark;font:16px/1.45 ui-sans-serif,system-ui,sans-serif;--bg:#f6f3ec;--panel:#fffdf7;--ink:#20231f;--muted:#555b53;--line:#888b83;--accent:#075e55;--in:#674092;--out:#964300;--warn:#8f2815}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--ink)}header{padding:1rem 1.25rem;border-bottom:1px solid var(--line);background:var(--panel)}h1,h2,h3,p{margin:.25rem 0 .75rem}.skip-link{position:absolute;left:.5rem;top:-5rem;padding:.7rem;background:var(--panel);color:var(--ink);z-index:10}.skip-link:focus{top:.5rem}.layout{display:grid;grid-template-columns:minmax(14rem,25rem) minmax(18rem,1fr) minmax(16rem,28rem);gap:1rem;padding:1rem}.panel{background:var(--panel);border:1px solid var(--line);border-radius:.65rem;padding:1rem;min-width:0}.controls{display:grid;gap:.7rem}.controls label{display:grid;gap:.2rem;font-weight:600}.checks{display:flex;flex-wrap:wrap;gap:.5rem}.checks label{display:flex;align-items:center;gap:.25rem;font-weight:400}.checks input[type=checkbox]{width:auto;min-width:1rem;height:1rem}input,select,button{font:inherit;min-width:0}input,select{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.35rem;background:var(--panel);color:var(--ink)}button{width:100%;text-align:left;padding:.65rem;border:1px solid var(--line);border-radius:.4rem;background:transparent;color:inherit;cursor:pointer}button:disabled,input:disabled,select:disabled{cursor:not-allowed;opacity:.65}:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.node-list,.relation-list{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}.node button[aria-selected=true]{outline:3px solid var(--accent)}.node.inbound button{border-left:6px double var(--in)}.node.outbound button{border-left:6px dashed var(--out)}.node.both button{border-left:6px solid var(--accent)}.badge,.relation-cue,.flag{display:inline-block;margin:.1rem .35rem .1rem 0;padding:.05rem .4rem;border:1px solid currentColor;border-radius:999px;font-size:.78rem}.relation-cue{font-weight:700}.muted{color:var(--muted)}.warning{color:var(--warn);font-weight:600}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.35rem .75rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.relation-list button{padding:.35rem}.sr-status{min-height:1.5em}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.legend{display:flex;gap:.75rem;flex-wrap:wrap}.legend span{border:1px solid currentColor;padding:.15rem .35rem}.legend .in{border-style:double}.legend .out{border-style:dashed}@media(max-width:950px){.layout{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.details{grid-column:1/-1}}@media(max-width:640px){.layout{grid-template-columns:minmax(0,1fr);padding:.5rem}.details{grid-column:auto}dl{grid-template-columns:minmax(0,1fr)}dt{margin-top:.4rem}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}@media(forced-colors:active){:root{--bg:Canvas;--panel:Canvas;--ink:CanvasText;--muted:CanvasText;--line:CanvasText;--accent:Highlight;--in:LinkText;--out:CanvasText;--warn:MarkText}.node button[aria-selected=true]{outline-color:Highlight}.badge,.relation-cue,.flag,.legend span{forced-color-adjust:auto}}@media(prefers-color-scheme:dark){:root{--bg:#171a18;--panel:#202521;--ink:#f2f0e8;--muted:#c7ccc3;--line:#8b918a;--accent:#70d9cc;--in:#cbb0ee;--out:#ffad69;--warn:#ffad9a}}
</style>
</head>
<body>
<a class="skip-link" href="#records">Skip to records</a>
<header><h1>Lore graph explorer</h1><h2 id="status-heading" tabindex="-1">Snapshot status</h2><p id="provenance" class="muted"></p><p id="health" class="sr-status" role="status" aria-live="polite"></p><p id="announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p></header>
<main class="layout">
<section class="panel controls" aria-labelledby="controls-title"><h2 id="controls-title">Find evidence</h2><label for="search">Search</label><input id="search" type="search" autocomplete="off" aria-controls="nodes"><fieldset><legend>Record kind</legend><div class="checks" id="kind-filters"></div></fieldset><label for="type-filter">Type</label><select id="type-filter" aria-controls="nodes"><option value="">All types</option></select><label for="status">Status</label><select id="status" aria-controls="nodes"><option value="">All statuses</option></select><label for="depth">Focus depth</label><select id="depth" aria-controls="nodes"><option>0</option><option selected>1</option><option>2</option><option>3</option><option>4</option></select><button id="clear-focus" type="button">Clear focus</button><div class="legend" aria-label="Relationship legend"><span class="in">Inbound: double line</span><span class="out">Outbound: dashed line</span></div></section>
<section id="records" class="panel" tabindex="-1" aria-labelledby="records-title"><h2 id="records-title">Records</h2><p id="counts" class="muted"></p><ul id="nodes" class="node-list" role="listbox" aria-label="Graph records" aria-describedby="counts"></ul></section>
<aside class="panel details" aria-labelledby="details-title"><h2 id="details-title">Details</h2><div id="details"><p class="muted">Select a record to inspect provenance and relationships.</p></div></aside>
</main>
<script>
"use strict";
const SNAPSHOT=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${encoded}"),c=>c.charCodeAt(0))));
const LIMITS=${JSON.stringify(EXPLORER_RENDER_LIMITS)};
const byKey=new Map(),nodes=[],recordButtons=new Map(),kindInputs=[];
for(const r of SNAPSHOT.facts.repositories){const n={...r,recordKey:r.repositoryScopeKey,id:r.displayName,type:"Repository",title:r.displayName,summary:r.docsRoot,status:null,tags:[]};nodes.push(n);byKey.set(n.recordKey,n)}
for(const r of SNAPSHOT.facts.concepts){const n={...r,id:r.conceptId,type:r.conceptType};nodes.push(n);byKey.set(n.recordKey,n)}
for(const r of SNAPSHOT.facts.tasks){const n={...r,id:r.taskId,type:"Task",tags:r.labels};nodes.push(n);byKey.set(n.recordKey,n)}
nodes.sort((a,b)=>a.recordKey<b.recordKey?-1:a.recordKey>b.recordKey?1:0);
const navigationEnabled=SNAPSHOT.health.state==="ready"||SNAPSHOT.health.state==="stale";
const state={search:"",kinds:new Set(),type:"",status:"",selected:null,focus:null,depth:1};
const $=id=>document.getElementById(id);const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
for(const kind of ["repository","concept","task"]){const label=make("label");const input=document.createElement("input");input.type="checkbox";input.value=kind;kindInputs.push(input);input.addEventListener("change",()=>{input.checked?state.kinds.add(kind):state.kinds.delete(kind);render()});label.append(input,document.createTextNode(kind));$("kind-filters").append(label)}
for(const type of [...new Set(nodes.map(n=>n.type))].sort()){const option=make("option",type);option.value=type;$("type-filter").append(option)}for(const status of [...new Set(nodes.map(n=>n.status).filter(Boolean))].sort()){const option=make("option",status);option.value=status;$("status").append(option)}
$("search").addEventListener("input",e=>{state.search=e.target.value.toLowerCase();render()});$("type-filter").addEventListener("change",e=>{state.type=e.target.value;render()});$("status").addEventListener("change",e=>{state.status=e.target.value;render()});$("depth").addEventListener("change",e=>{state.depth=Number(e.target.value);render()});$("clear-focus").addEventListener("click",()=>{state.focus=null;render();focusRecord(state.selected)});
function neighbors(root,depth){const seen=new Set([root]),queue=[[root,0]];while(queue.length){const [key,d]=queue.shift();if(d>=depth)continue;for(const edge of SNAPSHOT.facts.authoredEdges){let next=null;if(edge.fromRecordKey===key)next=edge.toRecordKey;else if(edge.toRecordKey===key)next=edge.fromRecordKey;if(next&&!seen.has(next)){seen.add(next);queue.push([next,d+1])}}}return seen}
function matches(n,scope){if(state.kinds.size&&!state.kinds.has(n.kind))return false;if(state.type&&n.type!==state.type)return false;if(state.status&&n.status!==state.status)return false;if(scope&&!scope.has(n.recordKey))return false;if(!state.search)return true;return [n.id,n.type,n.title,n.summary||"",n.status||"",n.sourcePath||"",...(n.tags||[])].join("\\n").toLowerCase().includes(state.search)}
function flagsFor(key){const flags=[];const seen=new Set();for(const edge of SNAPSHOT.facts.authoredEdges){if(edge.fromRecordKey!==key&&edge.toRecordKey!==key)continue;if(edge.dangling)flags.push("dangling");if(edge.edgeKind==="supersedes"||edge.edgeKind==="superseded_by")flags.push("supersession");const fingerprint=[edge.fromRecordKey,edge.edgeKind,edge.target].join("|");if(seen.has(fingerprint))flags.push("duplicate edge");seen.add(fingerprint)}return [...new Set(flags)]}
function relationFor(key){if(!state.selected||key===state.selected)return"none";let inbound=false,outbound=false;for(const edge of SNAPSHOT.facts.authoredEdges){if(edge.fromRecordKey===key&&edge.toRecordKey===state.selected)inbound=true;if(edge.fromRecordKey===state.selected&&edge.toRecordKey===key)outbound=true}return inbound&&outbound?"both":inbound?"inbound":outbound?"outbound":"none"}
function selectRecord(key,returnFocus){state.selected=key;render();if(returnFocus)focusRecord(key)}
function focusRecord(key){const button=key?recordButtons.get(key):null;if(button&&button.focus)button.focus()}
function closeDetails(key){state.selected=null;render();focusRecord(key)}
function handleRecordKey(event,index,key,visible){if(["ArrowDown","ArrowRight","ArrowUp","ArrowLeft","Home","End","Enter","Escape"].includes(event.key)&&event.preventDefault)event.preventDefault();let next=index;if(event.key==="ArrowDown"||event.key==="ArrowRight")next=Math.min(visible.length-1,index+1);else if(event.key==="ArrowUp"||event.key==="ArrowLeft")next=Math.max(0,index-1);else if(event.key==="Home")next=0;else if(event.key==="End")next=visible.length-1;else if(event.key==="Enter"){selectRecord(key,true);return}else if(event.key==="Escape"){closeDetails(key);return}else return;focusRecord(visible[next].recordKey)}
function render(){const list=$("nodes");list.replaceChildren();recordButtons.clear();if(!navigationEnabled){list.hidden=true;for(const id of ["search","type-filter","status","depth","clear-focus"])$(id).disabled=true;for(const input of kindInputs)input.disabled=true;$("counts").textContent=SNAPSHOT.health.state==="empty"?"No records. Run lore sync, then rebuild the explorer from source.":"Navigation disabled. Rebuild this artifact from validated source. Code: "+SNAPSHOT.health.messageCode;$("details").replaceChildren(make("p","No trusted graph navigation is available.","warning"));$("status-heading").textContent=SNAPSHOT.health.state==="empty"?"Empty snapshot":"Corrupt snapshot";if($("status-heading").focus)$("status-heading").focus();return}
list.hidden=false;const scope=state.focus?neighbors(state.focus,state.depth):null;const matched=nodes.filter(n=>matches(n,scope));const nodeLimit=state.focus?LIMITS.maximumVisibleNodes:LIMITS.initialNodeLimit;const visible=matched.slice(0,nodeLimit);if(state.selected&&!visible.some(node=>node.recordKey===state.selected))state.selected=null;for(const [index,node] of visible.entries()){const relation=relationFor(node.recordKey);const li=make("li",undefined,"node "+relation);const button=make("button");button.type="button";button.setAttribute("role","option");button.setAttribute("aria-selected",String(node.recordKey===state.selected));button.setAttribute("data-record-key",node.recordKey);button.tabIndex=node.recordKey===state.selected||(!state.selected&&index===0)?0:-1;button.append(make("span",node.kind,"badge"));if(node.status)button.append(make("span","status: "+node.status,"badge"));if(relation!=="none")button.append(make("span",relation+" neighbor","relation-cue"));for(const flag of flagsFor(node.recordKey))button.append(make("span",flag,"flag"));button.append(document.createTextNode(node.title||node.id));button.addEventListener("click",()=>selectRecord(node.recordKey,false));button.addEventListener("dblclick",()=>{state.focus=node.recordKey;selectRecord(node.recordKey,true)});button.addEventListener("keydown",event=>handleRecordKey(event,index,node.recordKey,visible));recordButtons.set(node.recordKey,button);li.append(button);list.append(li)}
$("counts").textContent=visible.length+" of "+matched.length+" matching records"+(visible.length<matched.length?"; bounded initial view, filter or focus to expand":"");renderDetails(visible,matched.length)}
function row(dl,key,value){const dt=make("dt",key),dd=make("dd",value??"—");dl.append(dt,dd)}
function renderDetails(visible,total){const root=$("details");root.replaceChildren();const node=byKey.get(state.selected);if(!node){root.append(make("p","Select a record to inspect provenance and relationships.","muted"));return}root.append(make("h3",node.title||node.id));const close=make("button","Close details and return to record");close.type="button";close.addEventListener("click",()=>closeDetails(node.recordKey));close.addEventListener("keydown",event=>{if(event.key==="Escape"){if(event.preventDefault)event.preventDefault();closeDetails(node.recordKey)}});root.append(close);const dl=make("dl");row(dl,"ID",node.id);row(dl,"Kind",node.kind);row(dl,"Type",node.type);row(dl,"Status",node.status);row(dl,"Source",node.sourcePath);row(dl,"Commit",node.gitCommit);row(dl,"Export",node.exportDigest);root.append(dl);const focus=make("button","Focus this record to depth "+state.depth);focus.type="button";focus.addEventListener("click",()=>{state.focus=node.recordKey;render();focusRecord(node.recordKey)});root.append(focus);
const relationshipLimit=state.focus?LIMITS.maximumVisibleEdges:LIMITS.initialEdgeLimit;const allRelated=SNAPSHOT.facts.authoredEdges.filter(e=>e.fromRecordKey===node.recordKey||e.toRecordKey===node.recordKey);const related=allRelated.slice(0,relationshipLimit);const inbound=allRelated.filter(e=>e.toRecordKey===node.recordKey).length,outbound=allRelated.filter(e=>e.fromRecordKey===node.recordKey).length;root.append(make("h3","Relationships"));const ul=make("ul",undefined,"relation-list");for(const edge of related){const isOutbound=edge.fromRecordKey===node.recordKey;const other=isOutbound?edge.toRecordKey:edge.fromRecordKey;const target=other?byKey.get(other):null;const li=make("li");const label=(isOutbound?"outbound ":"inbound ")+edge.edgeKind+" → "+(target?.title||edge.target)+(edge.dangling?" (dangling)":"");if(target){const button=make("button",label);button.type="button";button.addEventListener("click",()=>selectRecord(target.recordKey,false));button.addEventListener("keydown",event=>{if(event.key==="Escape"){if(event.preventDefault)event.preventDefault();focusRecord(node.recordKey)}});li.append(button)}else li.append(make("span",label,"warning"));ul.append(li)}if(!related.length)ul.append(make("li","No authored relationships.","muted"));if(related.length<allRelated.length)ul.append(make("li",related.length+" of "+allRelated.length+" relationships shown","muted"));root.append(ul);
const supersession=new Set([node.recordKey]),queue=[node.recordKey];while(queue.length){const key=queue.shift();for(const edge of SNAPSHOT.facts.authoredEdges){if(!["supersedes","superseded_by"].includes(edge.edgeKind)||!edge.toRecordKey)continue;let next=null;if(edge.fromRecordKey===key)next=edge.toRecordKey;else if(edge.toRecordKey===key)next=edge.fromRecordKey;if(next&&!supersession.has(next)){supersession.add(next);queue.push(next)}}}if(supersession.size>1){root.append(make("h3","Supersession chain"));const chain=make("ul");for(const key of [...supersession].sort()){const item=byKey.get(key);chain.append(make("li",item?.title||key))}root.append(chain)}const position=visible.findIndex(item=>item.recordKey===node.recordKey)+1;const flags=flagsFor(node.recordKey);$("announcement").textContent=node.kind+" "+(node.title||node.id)+"; "+inbound+" inbound, "+outbound+" outbound; "+(flags.length?flags.join(", "):"no graph-health flags")+"; position "+position+" of "+total}
$("status-heading").textContent=SNAPSHOT.health.state==="stale"?"Stale snapshot":"Ready snapshot";$("health").textContent=SNAPSHOT.health.state+": "+SNAPSHOT.health.counts.concepts+" concepts, "+SNAPSHOT.health.counts.tasks+" tasks, "+SNAPSHOT.health.counts.authoredEdges+" edges, "+SNAPSHOT.health.counts.danglingEdges+" dangling edges"+(SNAPSHOT.health.messageCode?" · code "+SNAPSHOT.health.messageCode:"");$("provenance").textContent="Snapshot "+SNAPSHOT.source.snapshotKey+" · commit "+(SNAPSHOT.source.gitCommit||"uncommitted")+" · export "+SNAPSHOT.source.exportDigest+" · schema "+SNAPSHOT.schemaVersion;window.__LORE_EXPLORER__={snapshot:SNAPSHOT,state,render};render();
</script>
</body>
</html>
`;
}

/** Render a deterministic offline retained-snapshot/change explorer with paired provenance. */
export function renderExplorerChangeArtifact(snapshotValue: unknown): string {
  const snapshot = parseExplorerChangeSnapshot(snapshotValue);
  const encoded = Buffer.from(serializeExplorerChangeSnapshot(snapshot), "utf8").toString("base64");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="generator" content="${EXPLORER_ARTIFACT_VERSION}">
<title>Lore retained snapshot explorer</title>
<style>
:root{color-scheme:light dark;font:16px/1.45 ui-sans-serif,system-ui,sans-serif;--bg:#f5f3ed;--panel:#fffdf8;--ink:#20231f;--muted:#565b54;--line:#858a82;--accent:#075e55;--add:#176b36;--remove:#9a2d22;--change:#7c4d00}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--ink)}header{padding:1rem 1.25rem;border-bottom:1px solid var(--line);background:var(--panel)}h1,h2,h3,p{margin:.25rem 0 .75rem}.skip{position:absolute;top:-5rem;left:.5rem;background:var(--panel);padding:.7rem}.skip:focus{top:.5rem}.layout{display:grid;grid-template-columns:minmax(14rem,22rem) minmax(18rem,1fr) minmax(18rem,30rem);gap:1rem;padding:1rem}.panel{min-width:0;padding:1rem;border:1px solid var(--line);border-radius:.6rem;background:var(--panel)}.controls{display:grid;gap:.65rem}.controls label{font-weight:650}.checks{display:flex;flex-wrap:wrap;gap:.55rem}.checks label{font-weight:400}input,select,button{font:inherit;color:inherit}input,select{width:100%;padding:.5rem;background:var(--panel);border:1px solid var(--line);border-radius:.35rem}button{width:100%;padding:.6rem;text-align:left;background:transparent;border:1px solid var(--line);border-radius:.35rem;cursor:pointer}:focus-visible{outline:3px solid var(--accent);outline-offset:2px}ul{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}.badge{display:inline-block;margin-right:.4rem;padding:.05rem .4rem;border:1px solid currentColor;border-radius:999px;font-size:.8rem}.added{border-left:6px solid var(--add)}.removed{border-left:6px double var(--remove)}.changed{border-left:6px dashed var(--change)}.snapshot{border-left:6px solid var(--accent)}.muted{color:var(--muted)}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.35rem .75rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}pre{overflow:auto;max-height:18rem;padding:.65rem;border:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:950px){.layout{grid-template-columns:1fr 1fr}.details{grid-column:1/-1}}@media(max-width:640px){.layout{grid-template-columns:1fr;padding:.5rem}.details{grid-column:auto}dl{grid-template-columns:1fr}}@media(forced-colors:active){:root{--bg:Canvas;--panel:Canvas;--ink:CanvasText;--muted:CanvasText;--line:CanvasText;--accent:Highlight;--add:LinkText;--remove:MarkText;--change:CanvasText}}@media(prefers-color-scheme:dark){:root{--bg:#171a18;--panel:#202521;--ink:#f2f0e8;--muted:#c7ccc3;--line:#8b918a;--accent:#70d9cc;--add:#86d69c;--remove:#ffaaa0;--change:#f0c277}}
</style>
</head>
<body>
<a class="skip" href="#records">Skip to retained records</a>
<header><h1>Lore retained snapshot explorer</h1><p id="scope" class="muted"></p><p id="status" role="status" aria-live="polite"></p><p id="announcement" class="sr-only" role="status" aria-live="polite"></p></header>
<main class="layout">
<section class="panel controls" aria-labelledby="filters-title"><h2 id="filters-title">Filter evidence</h2><label for="search">Search</label><input id="search" type="search" autocomplete="off" aria-controls="items"><label for="kind">Fact kind</label><select id="kind"><option value="">All kinds</option><option>concept</option><option>task</option><option>edge</option></select><fieldset><legend>Change classification</legend><div id="change-filters" class="checks"></div></fieldset></section>
<section id="records" class="panel" tabindex="-1" aria-labelledby="records-title"><h2 id="records-title">Retained records</h2><p id="counts" class="muted"></p><ul id="items" role="listbox" aria-label="Retained snapshot records" aria-describedby="counts"></ul></section>
<aside class="panel details" aria-labelledby="details-title"><h2 id="details-title">Paired evidence</h2><div id="details"><p class="muted">Select a record to inspect exact source provenance.</p></div></aside>
</main>
<script>
"use strict";
const SNAPSHOT=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${encoded}"),c=>c.charCodeAt(0))));
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
const selectedRepositories=new Set(SNAPSHOT.comparison.filters.repositories);const rows=SNAPSHOT.mode==="snapshot"?SNAPSHOT.to.facts.filter(f=>!selectedRepositories.size||(f.provenance.memberId!==null&&selectedRepositories.has(f.provenance.memberId))).map(f=>({change:"snapshot",recordKind:f.kind,id:f.id,recordKey:f.recordKey,fieldsChanged:[],from:f,to:f})):SNAPSHOT.comparison.changes;
const state={search:"",kind:"",changes:new Set(),selected:null},buttons=new Map();
for(const change of ["added","removed","changed",...(SNAPSHOT.mode==="snapshot"?["snapshot"]:[])]){const label=make("label"),input=document.createElement("input");input.type="checkbox";input.value=change;input.addEventListener("change",()=>{input.checked?state.changes.add(change):state.changes.delete(change);render()});label.append(input,document.createTextNode(change));$("change-filters").append(label)}
$("search").addEventListener("input",e=>{state.search=e.target.value.toLowerCase();render()});$("kind").addEventListener("change",e=>{state.kind=e.target.value;render()});
function fact(row){return row.to||row.from}function matches(row){const f=fact(row);if(state.kind&&row.recordKind!==state.kind)return false;if(state.changes.size&&!state.changes.has(row.change))return false;if(!state.search)return true;return [row.id,row.recordKey,row.recordKind,row.change,f.provenance.sourcePath||"",f.provenance.memberId||"",JSON.stringify(f.value)].join("\\n").toLowerCase().includes(state.search)}
function select(key){state.selected=key;render();const button=buttons.get(key);if(button)button.focus()}
function row(dl,key,value){dl.append(make("dt",key),make("dd",value??"—"))}
function renderDetails(selected){const root=$("details");root.replaceChildren();if(!selected){root.append(make("p","Select a record to inspect exact source provenance.","muted"));return}const f=fact(selected),p=f.provenance;root.append(make("h3",selected.change+" "+selected.recordKind+" "+selected.id));const dl=make("dl");row(dl,"Record key",selected.recordKey);row(dl,"Member",p.memberId);row(dl,"Source path",p.sourcePath);row(dl,"Source key",p.sourceKey);row(dl,"Source record",p.sourceRecordKey);row(dl,"Repository",p.repositoryScopeKey);row(dl,"Commit",p.gitCommit);row(dl,"Export",p.exportDigest);root.append(dl);if(selected.fieldsChanged.length)root.append(make("p","Fields changed: "+selected.fieldsChanged.join(", ")));for(const side of ["from","to"]){if(!selected[side])continue;root.append(make("h3",side+" authored value"));root.append(make("pre",JSON.stringify(selected[side].value,null,2)))}$("announcement").textContent=selected.change+" "+selected.recordKind+" "+selected.id+", source "+(p.sourcePath||"none")}
function render(){const visible=rows.filter(matches),list=$("items");list.replaceChildren();buttons.clear();visible.forEach((entry,index)=>{const li=make("li",undefined,entry.change),button=make("button");button.type="button";button.setAttribute("role","option");button.setAttribute("aria-selected",String(state.selected===entry.recordKey));button.tabIndex=state.selected===entry.recordKey||(!state.selected&&index===0)?0:-1;button.append(make("span",entry.change,"badge"),make("span",entry.recordKind,"badge"),document.createTextNode(entry.id));button.addEventListener("click",()=>select(entry.recordKey));button.addEventListener("keydown",event=>{let next=index;if(event.key==="ArrowDown"||event.key==="ArrowRight")next=Math.min(visible.length-1,index+1);else if(event.key==="ArrowUp"||event.key==="ArrowLeft")next=Math.max(0,index-1);else if(event.key==="Home")next=0;else if(event.key==="End")next=visible.length-1;else if(event.key==="Enter"){select(entry.recordKey);return}else return;event.preventDefault();const target=buttons.get(visible[next].recordKey);if(target)target.focus()});buttons.set(entry.recordKey,button);li.append(button);list.append(li)});$("counts").textContent=visible.length+" of "+rows.length+" retained records"+(SNAPSHOT.comparison.truncated?"; comparison truncated at its explicit bound":"");renderDetails(rows.find(entry=>entry.recordKey===state.selected)||null)}
$("scope").textContent=SNAPSHOT.mode+" · "+SNAPSHOT.from.snapshotKey+(SNAPSHOT.mode==="comparison"?" → "+SNAPSHOT.to.snapshotKey:"")+" · schema "+SNAPSHOT.schemaVersion;$("status").textContent=SNAPSHOT.mode==="snapshot"?rows.length+" retained facts":SNAPSHOT.comparison.totalChanges+" changes, "+SNAPSHOT.comparison.shown+" available offline";window.__LORE_EXPLORER_CHANGE__={snapshot:SNAPSHOT,state,render};render();
</script>
</body>
</html>
`;
}

export function explorerArtifactDigest(html: string): string {
  return `sha256:${createHash("sha256").update(html).digest("hex")}`;
}

function conceptFact(
  record: ProjectionConceptRecord,
  common: {
    readonly repositoryScopeKey: string;
    readonly snapshotKey: string;
    readonly bundleId: string;
    readonly gitCommit: string | null;
    readonly exportDigest: string;
  },
) {
  return {
    ...common,
    recordKey: record.key,
    sourcePath: record.path,
    kind: "concept" as const,
    conceptId: record.id,
    conceptType: bounded(record.type, 256) ?? "Concept",
    title: bounded(scalar(record.frontmatter.title), 1_024),
    summary: bounded(scalar(record.frontmatter.summary) ?? scalar(record.frontmatter.description), 4_096),
    status: bounded(scalar(record.frontmatter.status), 256),
    tags: boundedList(record.frontmatter.tags, 256, 256),
    contentHash: record.contentHash,
    tokenEstimate: record.tokenEstimate,
  };
}

function edgeFact(
  record: ProjectionEdgeRecord,
  common: {
    readonly repositoryScopeKey: string;
    readonly snapshotKey: string;
    readonly bundleId: string;
    readonly gitCommit: string | null;
    readonly exportDigest: string;
  },
  sourcePath: string | null,
) {
  return {
    ...common,
    recordKey: record.key,
    sourcePath,
    kind: "authored-edge" as const,
    edgeKind: bounded(record.kind, 256) ?? "link",
    fromRecordKey: record.from,
    toRecordKey: record.to,
    target: record.target,
    ordinal: record.ordinal,
    dangling: record.dangling,
  };
}

function repositoryDisplayName(source: LadybugProjectionSource): string {
  const root = source.concepts.find((concept) => concept.id === "index");
  return bounded(scalar(root?.frontmatter.title), 256) ?? source.manifest.bundle.docsRoot;
}

function explorerNodes(snapshot: ExplorerSnapshot): ExplorerViewNode[] {
  const repositories = snapshot.facts.repositories.map((record) => ({
    recordKey: record.repositoryScopeKey,
    kind: "repository" as const,
    id: record.displayName,
    type: "Repository",
    title: record.displayName,
    summary: record.docsRoot,
    status: null,
    tags: [] as readonly string[],
    sourcePath: record.docsRoot,
    repositoryScopeKey: record.repositoryScopeKey,
    snapshotKey: record.snapshotKey,
    bundleId: record.bundleId,
    gitCommit: record.gitCommit,
    exportDigest: record.exportDigest,
  }));
  const concepts = snapshot.facts.concepts.map((record) => ({
    recordKey: record.recordKey,
    kind: "concept" as const,
    id: record.conceptId,
    type: record.conceptType,
    title: record.title ?? record.conceptId,
    summary: record.summary,
    status: record.status,
    tags: record.tags,
    sourcePath: record.sourcePath,
    repositoryScopeKey: record.repositoryScopeKey,
    snapshotKey: record.snapshotKey,
    bundleId: record.bundleId,
    gitCommit: record.gitCommit,
    exportDigest: record.exportDigest,
  }));
  const tasks = snapshot.facts.tasks.map((record) => ({
    recordKey: record.recordKey,
    kind: "task" as const,
    id: record.taskId,
    type: "Task",
    title: record.title,
    summary: record.summary,
    status: record.status,
    tags: record.labels,
    sourcePath: record.sourcePath,
    repositoryScopeKey: record.repositoryScopeKey,
    snapshotKey: record.snapshotKey,
    bundleId: record.bundleId,
    gitCommit: record.gitCommit,
    exportDigest: record.exportDigest,
  }));
  return [...repositories, ...concepts, ...tasks].sort((a, b) => compareCodeUnits(a.recordKey, b.recordKey));
}

function focusNeighborhood(snapshot: ExplorerSnapshot, root: string, depth: number): Set<string> {
  const seen = new Set([root]);
  const queue: Array<readonly [string, number]> = [[root, 0]];
  for (let index = 0; index < queue.length; index++) {
    const [key, distance] = queue[index] as readonly [string, number];
    if (distance >= depth) continue;
    for (const edge of snapshot.facts.authoredEdges) {
      const next = edge.fromRecordKey === key ? edge.toRecordKey : edge.toRecordKey === key ? edge.fromRecordKey : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }
  return seen;
}

function supersessionChain(snapshot: ExplorerSnapshot, root: string): string[] {
  const seen = new Set([root]);
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    const key = queue[index] as string;
    for (const edge of snapshot.facts.authoredEdges) {
      if (edge.edgeKind !== "supersedes" && edge.edgeKind !== "superseded_by") continue;
      const next = edge.fromRecordKey === key ? edge.toRecordKey : edge.toRecordKey === key ? edge.fromRecordKey : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].sort(compareCodeUnits);
}

function edgeRelation(
  edge: ExplorerSnapshot["facts"]["authoredEdges"][number],
  selected: string | null | undefined,
): ExplorerViewEdge["relation"] {
  if (selected === null || selected === undefined) return "none";
  const inbound = edge.toRecordKey === selected;
  const outbound = edge.fromRecordKey === selected;
  return inbound && outbound ? "both" : inbound ? "inbound" : outbound ? "outbound" : "none";
}

function compareExplorerEdges(
  a: ExplorerSnapshot["facts"]["authoredEdges"][number],
  b: ExplorerSnapshot["facts"]["authoredEdges"][number],
): number {
  const key = (edge: typeof a) =>
    [edge.fromRecordKey, edge.edgeKind, edge.target, String(edge.ordinal).padStart(16, "0"), edge.recordKey].join("\0");
  return compareCodeUnits(key(a), key(b));
}

function scalar(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function bounded(value: string | null | undefined, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  const clean = value.trim();
  if (clean === "") return null;
  return clean.slice(0, maximum);
}

function boundedList(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.slice(0, maximumLength))
    .slice(0, maximumItems);
}

function isString(value: string | null): value is string {
  return value !== null;
}

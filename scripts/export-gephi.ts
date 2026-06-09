import { Database } from "bun:sqlite";
import { writeFileSync } from "fs";

const DB_PATH =
  "/Users/brante/Library/Application Support/com.focusiswhatyouneed/persistence.sqlite3";

const OUT_PATH = "./export-gephi.gexf";

const db = new Database(DB_PATH, { readonly: true });

function loadTable<T>(tbl: string): T[] {
  const rows = db
    .query<{ id: string; json: string }, [string]>(
      "SELECT id, json FROM records WHERE tbl = ?"
    )
    .all(tbl);
  return rows.map((r) => ({ id: r.id, ...JSON.parse(r.json) })) as T[];
}

interface Project {
  id: string;
  name: string;
  type: string;
}

interface Screen {
  id: string;
  projectId: string;
  title: string;
}

interface Component {
  id: string;
  projectId: string;
  screenId: string;
  parentVariantId: string | null;
  name: string;
  kind: string;
}

interface Variant {
  id: string;
  componentId: string;
  name: string;
}

const projects = loadTable<Project>("projects");
const screens = loadTable<Screen>("screens");
const components = loadTable<Component>("components");
const variants = loadTable<Variant>("variants");

// variant id → component id
const variantToComponent: Record<string, string> = {};
for (const v of variants) {
  variantToComponent[v.id] = v.componentId;
}

// --- build graph ----------------------------------------------------------

interface GNode {
  key: string;
  label: string;
  nodeType: string;
}

interface GEdge {
  source: string;
  target: string;
  label: string;
}

const nodeMap = new Map<string, GNode>();
const edges: GEdge[] = [];

function addNode(key: string, label: string, nodeType: string) {
  if (!nodeMap.has(key)) nodeMap.set(key, { key, label, nodeType });
}

function addEdge(source: string, target: string, label: string) {
  if (nodeMap.has(source) && nodeMap.has(target)) {
    edges.push({ source, target, label });
  }
}

for (const p of projects) {
  addNode(`project:${p.id}`, p.name ?? p.id, "project");
}

for (const s of screens) {
  addNode(`screen:${s.id}`, s.title ?? s.id, "screen");
  if (s.projectId) addEdge(`project:${s.projectId}`, `screen:${s.id}`, "has_screen");
}

for (const c of components) {
  addNode(`component:${c.id}`, c.name ?? c.id, c.kind ?? "component");

  if (!c.parentVariantId && c.screenId) {
    // top-level component — direct child of a screen
    addEdge(`screen:${c.screenId}`, `component:${c.id}`, "contains");
  } else if (c.parentVariantId) {
    // nested component — child of another component
    const parentCompId = variantToComponent[c.parentVariantId];
    if (parentCompId) {
      addEdge(`component:${parentCompId}`, `component:${c.id}`, "contains");
    }
  }
}

// --- build GEXF -----------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// assign sequential integer ids for GEXF (Gephi prefers integers)
const keyToId = new Map<string, number>();
let nodeId = 0;
for (const k of nodeMap.keys()) keyToId.set(k, nodeId++);

const nodeLines = [...nodeMap.values()]
  .map(
    (n) =>
      `      <node id="${keyToId.get(n.key)}" label="${escapeXml(n.label)}">
        <attvalues>
          <attvalue for="0" value="${n.nodeType}"/>
        </attvalues>
      </node>`
  )
  .join("\n");

const edgeLines = edges
  .map((e, i) => {
    const src = keyToId.get(e.source);
    const tgt = keyToId.get(e.target);
    return `      <edge id="${i}" source="${src}" target="${tgt}" label="${e.label}"/>`;
  })
  .join("\n");

const gexf = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3" version="1.3">
  <meta>
    <creator>focus-is-what-you-need</creator>
    <description>Component hierarchy: projects → screens → components</description>
  </meta>
  <graph defaultedgetype="directed">
    <attributes class="node">
      <attribute id="0" title="type" type="string"/>
    </attributes>
    <nodes>
${nodeLines}
    </nodes>
    <edges>
${edgeLines}
    </edges>
  </graph>
</gexf>`;

writeFileSync(OUT_PATH, gexf, "utf8");

console.log(`\nExported to ${OUT_PATH}`);
console.log(`  Nodes : ${nodeMap.size}  (${projects.length} projects, ${screens.length} screens, ${components.length} components)`);
console.log(`  Edges : ${edges.length}`);

#!/usr/bin/env bun
// Code facts for an architecture map: LOC per module, value-import edges between modules,
// and coverage of the architecture model's capability nodes.
//
// Usage (run from the target repo root, or pass --root):
//   bun measure.ts (--map <archimap.html> | --modules <modules.json>) --model <dir> [--include-tests] [--root <repo>]
//
// --model is required: the map is a projection of an adopted architecture model, never of a
// package or directory layout. --model names the model node directory (.archcontext/model/nodes).
// The capability document of each node comes from docs/architecture/.projection-manifest.json.
// A missing model option or manifest is a usage error (exit 2): no guessed path, no layout fallback.
//
// Module definitions come from the JSON block `<script type="application/json" id="archimap-meta">`
// in the map HTML, or from a JSON file. Shape:
//   { "modules": [ { "id", "label"?, "include": [glob], "exclude"?: [glob], "nodes"?: [nodeId] } ] }
// Model nodes may point to behavior specs through `extensions.behaviorSpecs` ([{ id, path }]). Each module
// lists the specs of the nodes it covers (`modules[].behaviorSpecs`). Exit 2 with
// `behavior_spec_invalid:<node id>`, `behavior_spec_missing:<path>` or `behavior_spec_uncovered:<node id>`.
// Output: JSON on stdout (`unparsed` lists files the transpiler rejected; their edges are missing). Exit 0 ok (coverage gaps are data), 2 usage/shape error, 1 unexpected failure.
// Workspace specifiers (`@scope/pkg`, `@scope/pkg/sub`) resolve to a concrete tracked file, and the edge goes to the module owning that file. The bare name uses the package entry (exports/module/main/src/index); a subpath uses an exact or single-star `exports` key (deterministic conditions: import/default/bun/types), and a present `exports` field gates subpaths — undeclared, null, or indeterminable subpaths stay unresolved. A specifier that resolves to no tracked file is counted under `unresolved`; no ownership guess produces an edge.
// Limits: tsconfig path aliases are not resolved; nested condition objects resolve only through their fixed condition order; only tracked files (git ls-files) are scanned.

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface ModuleDef {
  id: string;
  include: string[];
  exclude: string[];
  nodes: string[];
}

class UsageError extends Error {}

const SCRIPT_EXT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const LOADERS: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
  ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx",
};
// TS ESM style: `./x.js` names the file `./x.ts`.
const TS_FOR_JS: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
const OTHER_CODE_EXT = [".py", ".go", ".rs", ".java", ".kt", ".swift", ".rb", ".php", ".cs", ".c", ".cc", ".cpp", ".h", ".hpp", ".sh"];
const TEST_GLOBS = ["**/*.test.*", "**/*.spec.*", "tests/**", "test/**", "**/__tests__/**", "**/fixtures/**"].map((p) => new Bun.Glob(p));
const LIST_LIMIT = 20;
const EXAMPLE_LIMIT = 10;
// The projection manifest is the only authority for a capability's document path.
const MANIFEST_PATH = "docs/architecture/.projection-manifest.json";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
}

function stringList(value: unknown, where: string, required: boolean): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v === "")) {
    throw new UsageError(`${where} must be an array of non-empty strings`);
  }
  if (required && value.length === 0) throw new UsageError(`${where} must not be empty`);
  return value;
}

function parseModules(raw: string, source: string): ModuleDef[] {
  let meta: unknown;
  try {
    meta = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${source}: module JSON does not parse: ${(error as Error).message}`);
  }
  const list = (meta as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(list) || list.length === 0) throw new UsageError(`${source}: "modules" must be a non-empty array`);
  const seen = new Set<string>();
  return list.map((entry, i) => {
    const where = `${source}: modules[${i}]`;
    const m = entry as Record<string, unknown> | null;
    if (typeof m !== "object" || m === null) throw new UsageError(`${where} must be an object`);
    if (typeof m.id !== "string" || m.id === "") throw new UsageError(`${where}.id must be a non-empty string`);
    if (seen.has(m.id)) throw new UsageError(`${where}.id "${m.id}" is duplicated`);
    seen.add(m.id);
    return {
      id: m.id,
      include: stringList(m.include, `${where}.include`, true),
      exclude: stringList(m.exclude, `${where}.exclude`, false),
      nodes: stringList(m.nodes, `${where}.nodes`, false),
    };
  });
}

function loadModules(mapPath: string | undefined, modulesPath: string | undefined): ModuleDef[] {
  if (Boolean(mapPath) === Boolean(modulesPath)) throw new UsageError("pass exactly one of --map or --modules");
  const file = (mapPath ?? modulesPath) as string;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read ${file}: ${(error as Error).message}`);
  }
  if (modulesPath) return parseModules(text, file);
  for (const tag of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bid\s*=\s*["']archimap-meta["']/.test(tag[1] ?? "")) return parseModules(tag[2] ?? "", `${file} #archimap-meta`);
  }
  throw new UsageError(`${file}: no <script type="application/json" id="archimap-meta"> block`);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

interface BehaviorSpec {
  id: string;
  path: string;
  node: string;
}

interface ModelNode {
  id: string;
  kind: string;
  parent: string | undefined;
  behaviorSpecs: BehaviorSpec[];
}

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRepositoryRelative(value: string): boolean {
  return value !== "" && !path.posix.isAbsolute(value) && !value.includes("\\")
    && path.posix.normalize(value) === value && value !== "." && !value.split("/").includes("..");
}

// `extensions.behaviorSpecs` is a list of `{ id, path }`: a kebab-case id and a repository-relative
// spec file. A malformed entry or a missing file fails the whole measurement; it is not skipped.
function behaviorSpecsOf(nodeId: string, value: unknown, root: string): BehaviorSpec[] {
  if (value === undefined) return [];
  const entries = Array.isArray(value) ? value.map(record) : null;
  if (entries === null || entries.some((e) => e === null || Object.keys(e).length !== 2
    || typeof e.id !== "string" || !KEBAB_ID.test(e.id) || typeof e.path !== "string" || !isRepositoryRelative(e.path))) {
    throw new UsageError(`behavior_spec_invalid:${nodeId}`);
  }
  return (entries as { id: string; path: string }[]).map(({ id, path: specPath }) => {
    if (!isFile(path.join(root, specPath))) throw new UsageError(`behavior_spec_missing:${specPath}`);
    return { id, path: specPath, node: nodeId };
  });
}

function loadModel(dir: string, root: string): ModelNode[] {
  if (typeof Bun.YAML?.parse !== "function") throw new UsageError("--model needs Bun.YAML; upgrade Bun");
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
  } catch (error) {
    throw new UsageError(`cannot read model dir ${dir}: ${(error as Error).message}`);
  }
  return names.map((name) => {
    const doc = record(Bun.YAML.parse(readFileSync(path.join(dir, name), "utf8")));
    if (typeof doc?.id !== "string") throw new UsageError(`${path.join(dir, name)}: missing string "id"`);
    return {
      id: doc.id,
      kind: typeof doc.kind === "string" ? doc.kind : "",
      parent: typeof doc.parent === "string" ? doc.parent : undefined,
      behaviorSpecs: behaviorSpecsOf(doc.id, record(doc.extensions)?.behaviorSpecs, root),
    };
  });
}

// A map module covers a node when it lists the node or the nearest ancestor on the model `parent`
// chain. A node with behavior specs and no covering module fails closed.
function behaviorSpecsByModule(modules: ModuleDef[], modelNodes: ModelNode[]): BehaviorSpec[][] {
  const byId = new Map(modelNodes.map((n) => [n.id, n]));
  const out = modules.map((): BehaviorSpec[] => []);
  for (const node of modelNodes) {
    if (node.behaviorSpecs.length === 0) continue;
    const seen = new Set<string>();
    let covering: number[] = [];
    for (let id: string | undefined = node.id; id !== undefined && !seen.has(id); id = byId.get(id)?.parent) {
      seen.add(id);
      covering = modules.flatMap((m, i) => (m.nodes.includes(id as string) ? [i] : []));
      if (covering.length > 0) break;
    }
    if (covering.length === 0) throw new UsageError(`behavior_spec_uncovered:${node.id}`);
    for (const i of covering) out[i]!.push(...node.behaviorSpecs);
  }
  return out;
}

interface CapabilityDocs {
  /** Node id -> document path, from the entity-summary targets of the manifest. */
  byNode: Map<string, string>;
  /** Capability ids that an entity-summary target documents. */
  capabilities: Set<string>;
}

// The capability-to-document map comes from the committed projection manifest. A target row that
// does not carry the fields this script needs fails closed: a guessed path would link the wrong
// document.
function loadManifest(root: string): CapabilityDocs {
  const file = path.join(root, MANIFEST_PATH);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`${MANIFEST_PATH} is missing under ${root}; publish the architecture projection before you measure`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${MANIFEST_PATH} does not parse: ${(error as Error).message}`);
  }
  const targets = record(parsed)?.targets;
  if (targets === undefined || targets === null || record(targets) === null) {
    throw new UsageError(`${MANIFEST_PATH}: "targets" must be an object keyed by targetId`);
  }
  const byNode = new Map<string, string>();
  const capabilities = new Set<string>();
  for (const [targetId, row] of Object.entries(targets as Record<string, unknown>)) {
    const target = record(row);
    const where = `${MANIFEST_PATH}: targets[${JSON.stringify(targetId)}]`;
    if (target === null) throw new UsageError(`${where} must be an object`);
    if (target.type !== "entity-summary") continue;
    const scope = record(target.scope);
    if (scope?.kind !== "entity" || scope.entityKind !== "capability") continue;
    const capabilityId = scope.id;
    if (typeof capabilityId !== "string" || capabilityId === "") throw new UsageError(`${where}.scope.id must be a capability id`);
    const docPath = target.path;
    if (typeof docPath !== "string" || docPath === "") throw new UsageError(`${where}.path must be a document path`);
    if (capabilities.has(capabilityId) && byNode.get(capabilityId) !== docPath) {
      throw new UsageError(`${MANIFEST_PATH}: capability ${capabilityId} is documented by more than one target`);
    }
    capabilities.add(capabilityId);
    const stamps = record(target.sourceStamps) ?? {};
    for (const nodeId of [capabilityId, ...Object.keys(stamps)]) {
      const existing = byNode.get(nodeId);
      if (existing !== undefined && existing !== docPath) {
        throw new UsageError(`${MANIFEST_PATH}: node ${nodeId} is documented by both ${existing} and ${docPath}`);
      }
      byNode.set(nodeId, docPath);
    }
  }
  return { byNode, capabilities };
}

function isFile(abs: string): boolean {
  try {
    return lstatSync(abs).isFile();
  } catch {
    return false;
  }
}

// Returns non-blank line count, or null for binary-looking content.
function countLoc(buf: Buffer): number | null {
  if (buf.subarray(0, 8000).includes(0)) return null;
  let loc = 0;
  for (const line of buf.toString("utf8").split("\n")) if (line.trim() !== "") loc++;
  return loc;
}

function resolveBase(base: string, tracked: Set<string>): string | null {
  const ext = path.posix.extname(base);
  const candidates = [
    base,
    ...SCRIPT_EXT.map((e) => base + e),
    ...SCRIPT_EXT.map((e) => path.posix.join(base, `index${e}`)),
    ...(TS_FOR_JS[ext] ?? []).map((e) => base.slice(0, -ext.length) + e),
  ];
  return candidates.find((c) => tracked.has(c)) ?? null;
}

function resolveRelative(from: string, spec: string, tracked: Set<string>): string | null {
  return resolveBase(path.posix.join(path.posix.dirname(from), spec), tracked);
}

// First determinable string target of an exports value: the value itself, or the
// deterministic condition order shared with the "." entry (a fixed heuristic:
// conditional exports match in declaration order at runtime). Custom-only
// conditions have no determinable target.
function conditionValue(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "object" && value !== null) {
    const conditions = value as Record<string, unknown>;
    for (const key of ["import", "default", "bun", "types"]) {
      const target = conditions[key];
      if (typeof target === "string" && target !== "") return target;
    }
  }
  return undefined;
}

// Entry-point candidates of a workspace package, in resolution order. Only string-valued fields count.
function entryCandidates(pkg: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && v !== "") out.push(v);
  };
  const exp = pkg.exports;
  if (typeof exp === "string") add(exp);
  else if (typeof exp === "object" && exp !== null) {
    add(conditionValue((exp as Record<string, unknown>)["."]));
  }
  add(pkg.module);
  add(pkg.main);
  return out;
}

// `exports` gates subpaths the way Node resolves them: when the field is
// present, only declared subpaths resolve — an exact `./key`, or a single-star
// key with the captured segment substituted into the target. A null value, a
// nested-only condition object, or an undeclared subpath stays unresolved;
// no direct-path fallback runs behind an `exports` field. Without the field,
// the direct tracked path is used.
interface WorkspaceSubpaths {
  exact: ReadonlyMap<string, string>;
  patterns: ReadonlyArray<{ readonly prefix: string; readonly suffix: string; readonly target: string }>;
  gated: boolean;
}

function exportSubpaths(pkg: Record<string, unknown>): WorkspaceSubpaths {
  const exact = new Map<string, string>();
  const patterns: { prefix: string; suffix: string; target: string }[] = [];
  const exp = pkg.exports;
  if (exp === undefined) return { exact, patterns, gated: false };
  if (typeof exp !== "object" || exp === null || Array.isArray(exp)) return { exact, patterns, gated: true };
  for (const [key, value] of Object.entries(exp as Record<string, unknown>)) {
    if (!key.startsWith("./")) continue;
    const target = conditionValue(value);
    if (target === undefined) continue;
    const star = key.indexOf("*");
    if (star >= 0) {
      if (target.includes("*")) patterns.push({ prefix: key.slice(2, star), suffix: key.slice(star + 1), target });
      continue;
    }
    exact.set(key.slice(2), target);
  }
  return { exact, patterns, gated: true };
}

function resolveWorkspaceSubpath(pkg: WorkspacePackage, sub: string, tracked: Set<string>): string | null {
  const declared = pkg.subpaths.exact.get(sub);
  if (declared !== undefined) return resolveBase(path.posix.join(pkg.dir, declared), tracked);
  for (const pattern of pkg.subpaths.patterns) {
    if (sub.startsWith(pattern.prefix) && sub.endsWith(pattern.suffix)
      && sub.length >= pattern.prefix.length + pattern.suffix.length) {
      const captured = sub.slice(pattern.prefix.length, sub.length - pattern.suffix.length);
      return resolveBase(path.posix.join(pkg.dir, pattern.target.replace("*", captured)), tracked);
    }
  }
  if (pkg.subpaths.gated) return null;
  return resolveBase(path.posix.join(pkg.dir, sub), tracked);
}

interface WorkspacePackage {
  dir: string;
  entries: string[];
  subpaths: WorkspaceSubpaths;
}

function workspacePackages(root: string, files: string[]): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>();
  for (const file of files) {
    if (path.posix.basename(file) !== "package.json" || file.split("/").includes("node_modules")) continue;
    const dir = path.posix.dirname(file);
    // The root package has no directory prefix to attribute files by.
    if (dir === ".") continue;
    try {
      const pkg = JSON.parse(readFileSync(path.join(root, file), "utf8"));
      if (typeof pkg.name === "string" && pkg.name !== "") packages.set(pkg.name, { dir, entries: entryCandidates(pkg), subpaths: exportSubpaths(pkg) });
    } catch {
      // A tracked package.json that does not parse cannot name a workspace package.
    }
  }
  return packages;
}

// Board geometry: the map is hand-placed HTML, so the check reads inline px values from the text.
// A board that holds a `.node` is checked; every other board is listed as unchecked.
interface Box { left: number; top: number; right: number; bottom: number }
interface Point { x: number; y: number }
interface Segment { a: Point; b: Point }
interface GeometryFinding { board: string; kind: string; x: number; y: number; detail: string }

const END_TOLERANCE = 8;
const LABEL_CHAR_WIDTH = 7;
const LABEL_HEIGHT = 16;

function inlinePx(style: string, prop: string): number | null {
  const match = new RegExp(`(?<![\\w-])${prop}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(style);
  return match ? Number(match[1]) : null;
}

function pathPoints(d: string, board: string): Point[][] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const subpaths: Point[][] = [];
  let current: Point = { x: 0, y: 0 };
  let command = "";
  for (let i = 0; i < tokens.length;) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) {
      command = tokens[i++]!;
      if (!"MHVL".includes(command)) throw new UsageError(`geometry_path_unsupported:${board}`);
    } else if (command === "") {
      throw new UsageError(`geometry_path_unsupported:${board}`);
    }
    const arity = command === "H" || command === "V" ? 1 : 2;
    const args = tokens.slice(i, i + arity).map(Number);
    if (args.length < arity || args.some(Number.isNaN)) throw new UsageError(`geometry_path_unsupported:${board}`);
    i += arity;
    if (command === "H") current = { x: args[0]!, y: current.y };
    else if (command === "V") current = { x: current.x, y: args[0]! };
    else current = { x: args[0]!, y: args[1]! };
    if (command === "M") {
      subpaths.push([current]);
      command = "L";
    } else if (subpaths.length === 0) {
      throw new UsageError(`geometry_path_unsupported:${board}`);
    } else {
      subpaths[subpaths.length - 1]!.push(current);
    }
  }
  return subpaths;
}

function borderDistance(p: Point, b: Box): number {
  const dx = Math.max(b.left - p.x, 0, p.x - b.right);
  const dy = Math.max(b.top - p.y, 0, p.y - b.bottom);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(p.x - b.left, b.right - p.x, p.y - b.top, b.bottom - p.y);
}

function overlapArea(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

// The part of a segment inside a closed box (Liang-Barsky), or null when it misses the box.
function clipSegment(s: Segment, b: Box): [Point, Point] | null {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [[-dx, s.a.x - b.left], [dx, b.right - s.a.x], [-dy, s.a.y - b.top], [dy, b.bottom - s.a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [{ x: s.a.x + t0 * dx, y: s.a.y + t0 * dy }, { x: s.a.x + t1 * dx, y: s.a.y + t1 * dy }];
}

function boardBoxes(html: string, caption: string, classes: string[]): { box: Box; text: string }[] {
  const found: { box: Box; text: string }[] = [];
  for (const tag of html.matchAll(/<(?:a|div)\b([^>]*)>/g)) {
    const attrs = tag[1] ?? "";
    const tokens = (/\bclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/);
    const cls = classes.find((c) => tokens.includes(c));
    if (cls === undefined) continue;
    const style = /\bstyle\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "";
    const [left, top, width, height] = ["left", "top", "width", "height"].map((p) => inlinePx(style, p));
    const labelBox = cls === "elabel";
    if (left == null || top == null || (!labelBox && (width == null || height == null))) {
      throw new UsageError(`geometry_box_unplaced:${caption}`);
    }
    const end = (tag.index ?? 0) + tag[0].length;
    const text = labelBox
      ? html.slice(end, html.indexOf("</div>", end)).replace(/<[^>]*>/g, "").replace(/&#?\w+;/g, "x").trim()
      : "";
    found.push({
      text,
      box: { left, top, right: left + (width ?? 0), bottom: top + (height ?? 0) },
    });
  }
  return found;
}

function boardFindings(caption: string, html: string): GeometryFinding[] {
  const nodes = boardBoxes(html, caption, ["node"]).map((n) => n.box);
  const panels = boardBoxes(html, caption, ["panel"]).map((n) => n.box);
  const labels = boardBoxes(html, caption, ["elabel"]).map((l) => ({
    left: l.box.left, top: l.box.top, right: l.box.left + LABEL_CHAR_WIDTH * [...l.text].length, bottom: l.box.top + LABEL_HEIGHT,
  }));
  const findings: GeometryFinding[] = [];
  const add = (kind: string, x: number, y: number, detail: string) =>
    findings.push({ board: caption, kind, x: Math.round(x), y: Math.round(y), detail });
  const at = (b: Box) => `(${b.left},${b.top})-(${b.right},${b.bottom})`;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const hit = overlapArea(nodes[i]!, nodes[j]!);
      if (hit) add("box_overlap", hit.left, hit.top, `node ${at(nodes[i]!)} overlaps node ${at(nodes[j]!)}`);
    }
  }

  const lines: Point[][][] = [];
  for (const tag of html.matchAll(/<path\b([^>]*)>/g)) {
    const d = /\bd\s*=\s*"([^"]*)"/.exec(tag[1] ?? "")?.[1];
    if (d !== undefined) lines.push(pathPoints(d, caption));
  }
  const borders = [...nodes, ...panels];
  const segmentsOf = (subpaths: Point[][]): Segment[] =>
    subpaths.flatMap((pts) => pts.slice(1).map((b, i) => ({ a: pts[i]!, b })));
  const allSegments = lines.flatMap(segmentsOf);

  for (const subpath of lines.flat()) {
    if (subpath.length < 2) continue;
    const first = subpath[0]!;
    const last = subpath[subpath.length - 1]!;
    for (const p of [first, last]) {
      if (!borders.some((b) => borderDistance(p, b) <= END_TOLERANCE)) {
        add("line_end_open", p.x, p.y, `path end (${p.x},${p.y}) is more than ${END_TOLERANCE} px from every node and panel border`);
      }
    }
  }

  for (const label of labels) {
    const segment = allSegments.find((s) => clipSegment(s, label) !== null);
    if (segment) add("label_on_line", label.left, label.top, `label ${at(label)} meets path segment (${segment.a.x},${segment.a.y})-(${segment.b.x},${segment.b.y})`);
    const node = nodes.find((n) => overlapArea(label, n) !== null);
    if (node) add("label_on_box", label.left, label.top, `label ${at(label)} overlaps node ${at(node)}`);
  }
  return findings;
}

// The content of the first `.board` element after a caption, or null when the next caption comes first.
function boardContent(html: string, caption: string, from: number, captions: RegExpMatchArray[]): string | null {
  const open = /<div\b[^>]*\bclass\s*=\s*"(?:[^"]*\s)?board(?:\s[^"]*)?"[^>]*>/g;
  open.lastIndex = from;
  const start = open.exec(html);
  const limit = captions.find((c) => (c.index ?? 0) >= from)?.index ?? html.length;
  if (start === null || start.index >= limit) return null;
  const tags = /<(\/?)div\b[^>]*>/g;
  tags.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let tag = tags.exec(html); tag !== null; tag = tags.exec(html)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return html.slice(start.index + start[0].length, tag.index);
  }
  throw new UsageError(`geometry_board_unclosed:${caption}`);
}

function geometryOf(mapPath: string): { checked: string[]; unchecked: string[]; findings: GeometryFinding[] } {
  const html = readFileSync(mapPath, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, "");
  const captions = [...html.matchAll(/<h2\b[^>]*\bclass\s*=\s*"[^"]*\bcaption\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/g)];
  const result = { checked: [] as string[], unchecked: [] as string[], findings: [] as GeometryFinding[] };
  for (const match of captions) {
    const caption = (match[1] ?? "").replace(/<[^>]*>/g, "").trim();
    const body = boardContent(html, caption, (match.index ?? 0) + match[0].length, captions);
    if (body === null || !/<(?:a|div)\b[^>]*\bclass\s*=\s*"(?:[^"]*\s)?node(?:\s[^"]*)?"/.test(body)) {
      result.unchecked.push(caption);
      continue;
    }
    result.checked.push(caption);
    result.findings.push(...boardFindings(caption, body));
  }
  return result;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      map: { type: "string" }, modules: { type: "string" }, model: { type: "string" },
      "include-tests": { type: "boolean", default: false }, root: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const root = path.resolve(values.root ?? process.cwd());
  // The model option has no default: the map does not fall back to package or directory layout.
  if (values.model === undefined || values.model === "") {
    throw new UsageError("--model is required: pass the architecture model directory (.archcontext/model/nodes)");
  }
  const modules = loadModules(values.map, values.modules);
  const modelNodes = loadModel(path.resolve(root, values.model), root);
  const capabilityDocs = loadManifest(root);
  const docsOf = (m: ModuleDef): string[] =>
    [...new Set(m.nodes.map((id) => capabilityDocs.byNode.get(id)).filter((p): p is string => p !== undefined))].sort();
  const includeTests = values["include-tests"] === true;

  let listed: string[];
  try {
    listed = git(root, "ls-files", "-z").split("\0").filter(Boolean);
  } catch (error) {
    throw new UsageError(`${root} is not a readable git repository: ${(error as Error).message}`);
  }
  const files = listed.filter((f) => isFile(path.join(root, f)));
  const universe = includeTests ? files : files.filter((f) => !TEST_GLOBS.some((g) => g.match(f)));
  const tracked = new Set(files);

  const compiled = modules.map((m) => ({
    include: m.include.map((p) => new Bun.Glob(p)),
    exclude: m.exclude.map((p) => new Bun.Glob(p)),
  }));
  const owner = new Map<string, number>();
  const overlaps: { path: string; modules: string[] }[] = [];
  for (const file of universe) {
    const hits = compiled.flatMap((c, i) =>
      c.include.some((g) => g.match(file)) && !c.exclude.some((g) => g.match(file)) ? [i] : [],
    );
    owner.set(file, hits[0] ?? -1);
    if (hits.length > 1) overlaps.push({ path: file, modules: hits.map((i) => modules[i]!.id) });
  }

  const specs = behaviorSpecsByModule(modules, modelNodes);
  const rows = modules.map((m, i) => ({ id: m.id, files: 0, loc: 0, self: 0, docs: docsOf(m), behaviorSpecs: specs[i]! }));
  const edges = new Map<string, number>();
  const unresolved: string[] = [];
  const unparsed: string[] = [];
  const packages = workspacePackages(root, files);
  const packageNames = [...packages.keys()].sort((a, b) => b.length - a.length);
  const unassigned: { path: string; loc: number }[] = [];
  const entryFile = new Map<string, string | null>();
  const resolveEntry = (name: string, pkg: WorkspacePackage): string | null => {
    if (entryFile.has(name)) return entryFile.get(name)!;
    const bases = [
      ...pkg.entries.map((e) => path.posix.join(pkg.dir, e)),
      ...["src/index", "index"].map((e) => path.posix.join(pkg.dir, e)),
    ];
    let found: string | null = null;
    for (const b of bases) {
      found = resolveBase(b, tracked);
      if (found !== null) break;
    }
    entryFile.set(name, found);
    return found;
  };

  for (const file of universe) {
    const idx = owner.get(file) ?? -1;
    const ext = path.posix.extname(file);
    const isScript = ext in LOADERS;
    if (idx < 0 && !isScript && !OTHER_CODE_EXT.includes(ext)) continue;
    const buf = readFileSync(path.join(root, file));
    const loc = countLoc(buf);
    if (loc === null) continue;
    if (idx < 0) {
      unassigned.push({ path: file, loc });
      continue;
    }
    rows[idx]!.files++;
    rows[idx]!.loc += loc;
    if (!isScript) continue;

    // Bun.Transpiler rejects a hashbang line, so scan the source without it.
    const code = buf.toString("utf8").replace(/^#!.*/, "");
    let imports: { path: string }[];
    try {
      imports = new Bun.Transpiler({ loader: LOADERS[ext]! }).scanImports(code);
    } catch (error) {
      // Reported, not guessed: the file's edges are missing from the output.
      unparsed.push(`${file}: ${(error as Error).message.split("\n")[0]}`);
      continue;
    }
    const seen = new Set<string>();
    for (const { path: spec } of imports) {
      if (seen.has(spec)) continue;
      seen.add(spec);
      let targetOwner: number | undefined;
      if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
        const target = resolveRelative(file, spec, tracked);
        if (target === null) {
          unresolved.push(`${file} -> ${spec}`);
          continue;
        }
        targetOwner = owner.get(target);
      } else {
        const name = packageNames.find((n) => spec === n || spec.startsWith(`${n}/`));
        if (name !== undefined) {
          const pkg = packages.get(name)!;
          const sub = spec.slice(name.length + 1);
          const target = spec === name ? resolveEntry(name, pkg) : resolveWorkspaceSubpath(pkg, sub, tracked);
          // Reported, not guessed: no edge is invented from the package directory's file counts.
          if (target !== null) targetOwner = owner.get(target);
          else {
            unresolved.push(`${file} -> ${spec}`);
            continue;
          }
        }
      }
      if (targetOwner === undefined || targetOwner < 0) continue;
      if (targetOwner === idx) rows[idx]!.self++;
      else {
        const key = `${modules[idx]!.id}\0${modules[targetOwner]!.id}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }

  const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const moduleOrder = new Map(modules.map((m, i) => [m.id, i]));
  const output: Record<string, unknown> = {
    schema: "archimap-measure/v1",
    root,
    head: git(root, "rev-parse", "HEAD").trim(),
    testsIncluded: includeTests,
    modules: rows,
    edges: [...edges]
      .map(([key, value]) => ({ from: key.split("\0")[0]!, to: key.split("\0")[1]!, value }))
      .sort((a, b) => moduleOrder.get(a.from)! - moduleOrder.get(b.from)! || moduleOrder.get(a.to)! - moduleOrder.get(b.to)!),
    unresolved: { count: unresolved.length, examples: unresolved.slice(0, EXAMPLE_LIMIT) },
    unparsed: { count: unparsed.length, examples: unparsed.slice(0, EXAMPLE_LIMIT) },
    overlaps: { total: overlaps.length, examples: overlaps.sort(byPath).slice(0, LIST_LIMIT) },
    unassigned: {
      count: unassigned.length,
      loc: unassigned.reduce((sum, f) => sum + f.loc, 0),
      largest: [...unassigned].sort((a, b) => b.loc - a.loc || byPath(a, b)).slice(0, LIST_LIMIT),
    },
  };

  const listedBy = new Map<string, number>();
  for (const m of modules) for (const id of new Set(m.nodes)) listedBy.set(id, (listedBy.get(id) ?? 0) + 1);
  const known = new Set(modelNodes.map((n) => n.id));
  output.model = {
    uncoveredNodes: modelNodes.filter((n) => n.kind === "capability" && !listedBy.has(n.id)).map((n) => n.id).sort(),
    unknownNodes: [...listedBy.keys()].filter((id) => !known.has(id)).sort(),
    duplicateNodes: [...listedBy].filter(([, count]) => count > 1).map(([id]) => id).sort(),
    // A capability node with no entity-summary target has no document to link to. Report it; do
    // not build a path from its id.
    undocumentedNodes: modelNodes.filter((n) => n.kind === "capability" && !capabilityDocs.capabilities.has(n.id)).map((n) => n.id).sort(),
  };
  if (values.map) output.geometry = geometryOf(values.map);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof UsageError || (error as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    console.error(`measure: ${message}`);
    process.exit(2);
  }
  console.error(`measure: unexpected failure: ${message}`);
  process.exit(1);
}

#!/usr/bin/env bun
// Code facts for an architecture map: LOC per module, value-import edges between modules,
// and coverage of the architecture model's capability nodes.
//
// Usage (run from the target repo root, or pass --root):
//   bun measure.ts (--map <archimap.html> | --modules <modules.json>) [--model <dir>] [--include-tests] [--root <repo>]
//
// Module definitions come from the JSON block `<script type="application/json" id="archimap-meta">`
// in the map HTML, or from a JSON file. Shape:
//   { "modules": [ { "id", "label"?, "include": [glob], "exclude"?: [glob], "nodes"?: [nodeId] } ] }
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

function loadModel(dir: string): { id: string; kind: string }[] {
  if (typeof Bun.YAML?.parse !== "function") throw new UsageError("--model needs Bun.YAML; upgrade Bun");
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
  } catch (error) {
    throw new UsageError(`cannot read model dir ${dir}: ${(error as Error).message}`);
  }
  return names.map((name) => {
    const doc = Bun.YAML.parse(readFileSync(path.join(dir, name), "utf8")) as { id?: unknown; kind?: unknown } | null;
    if (typeof doc?.id !== "string") throw new UsageError(`${path.join(dir, name)}: missing string "id"`);
    return { id: doc.id, kind: typeof doc.kind === "string" ? doc.kind : "" };
  });
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
  const modules = loadModules(values.map, values.modules);
  const modelNodes = values.model ? loadModel(path.resolve(root, values.model)) : null;
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

  const rows = modules.map((m) => ({ id: m.id, files: 0, loc: 0, self: 0 }));
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

  if (modelNodes) {
    const listedBy = new Map<string, number>();
    for (const m of modules) for (const id of new Set(m.nodes)) listedBy.set(id, (listedBy.get(id) ?? 0) + 1);
    const known = new Set(modelNodes.map((n) => n.id));
    output.model = {
      uncoveredNodes: modelNodes.filter((n) => n.kind === "capability" && !listedBy.has(n.id)).map((n) => n.id).sort(),
      unknownNodes: [...listedBy.keys()].filter((id) => !known.has(id)).sort(),
      duplicateNodes: [...listedBy].filter(([, count]) => count > 1).map(([id]) => id).sort(),
    };
  }
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

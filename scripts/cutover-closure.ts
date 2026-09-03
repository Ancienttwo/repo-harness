#!/usr/bin/env bun
import { createHash } from "crypto";
import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { isAbsolute, relative, resolve } from "path";
import { spawnSync } from "child_process";

export const CUTOVER_CLOSURE_PROTOCOL = 1 as const;
export const CUTOVER_CLOSURE_KIND = "repo-harness-cutover-closure" as const;
export const CUTOVER_CLOSURE_CATEGORIES = ["old_implementation", "callers", "fallback", "tests", "docs_and_projections", "compatibility_expiry"] as const;
export const CUTOVER_CLOSURE_DISPOSITIONS = ["removed", "migrated", "retained_with_reason", "not_applicable"] as const;
export const REFACTOR_KILL_LIST_KINDS = ["path", "relation", "symbol"] as const;
export const CUTOVER_CLOSURE_ERROR_CODES = ["refactor_closure_residue", "refactor_closure_incomplete", "refactor_closure_missing"] as const;

type Category = typeof CUTOVER_CLOSURE_CATEGORIES[number];
type Disposition = typeof CUTOVER_CLOSURE_DISPOSITIONS[number];
type SelectorKind = typeof REFACTOR_KILL_LIST_KINDS[number];
type Selector = { kind: SelectorKind; value: string };
type KillListEntry = { kind: SelectorKind; selectorId: string; required: boolean };
export type CutoverClosureEntryV1 = { category: Category; disposition: Disposition; selectors: Selector[]; reason: string | null; expiry: string | null };
export type CutoverClosureV1 = {
  protocol: 1; kind: typeof CUTOVER_CLOSURE_KIND; contractPath: string; contractSha256: string; headSha: string;
  entries: CutoverClosureEntryV1[]; residues: { selector: string; foundAt: string[] }[];
  status: "closed" | "residue" | "incomplete" | "not_applicable"; closureSha256: string;
  errorCode?: typeof CUTOVER_CLOSURE_ERROR_CODES[number];
};

function fail(code: typeof CUTOVER_CLOSURE_ERROR_CODES[number], message: string): never {
  throw new Error(`${code}: ${message}`);
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const selectorKey = (selector: Selector) => `${selector.kind}:${selector.value}`;
const bareSha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function jsonSection(markdown: string, heading: string, source: string, required: boolean): unknown | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...markdown.matchAll(new RegExp(`^## ${escaped}\\s*\\n+\\x60\\x60\\x60json\\s*\\n([\\s\\S]*?)\\n\\x60\\x60\\x60\\s*$`, "gm"))];
  if (matches.length === 0) {
    if (required) fail(heading === "Refactor Kill List" ? "refactor_closure_missing" : "refactor_closure_incomplete", `${source}: missing ${heading}`);
    return undefined;
  }
  if (matches.length !== 1) fail("refactor_closure_incomplete", `${source}: ${heading} must occur exactly once`);
  try { return JSON.parse(matches[0][1]!); }
  catch { fail("refactor_closure_incomplete", `${source}: ${heading} JSON is malformed`); }
}

export function parseCutoverContract(path: string) { return parseCutoverContractText(readFileSync(path, "utf8"), path); }

export function parseCutoverContractText(markdown: string, source: string) {
  const rawKillList = jsonSection(markdown, "Refactor Kill List", source, true);
  const rawClosure = jsonSection(markdown, "Cutover Closure", source, true);
  if (!Array.isArray(rawKillList)) fail("refactor_closure_incomplete", `${source}: kill list must be an array`);
  const killList: KillListEntry[] = rawKillList.map((value, index) => {
    if (!record(value) || !exactKeys(value, ["kind", "selectorId", "required"]) || !REFACTOR_KILL_LIST_KINDS.includes(value.kind as SelectorKind) || typeof value.selectorId !== "string" || !value.selectorId || typeof value.required !== "boolean") fail("refactor_closure_incomplete", `${source}: invalid kill-list entry ${index}`);
    return value as KillListEntry;
  });
  if (!record(rawClosure) || !exactKeys(rawClosure, ["protocol", "entries"]) || rawClosure.protocol !== 1 || !Array.isArray(rawClosure.entries)) fail("refactor_closure_incomplete", `${source}: invalid closure envelope`);
  const seenCategories = new Set<string>();
  const seenSelectors = new Set<string>();
  const entries = rawClosure.entries.map((value, index): CutoverClosureEntryV1 => {
    if (!record(value) || !exactKeys(value, ["category", "disposition", "selectors", "reason", "expiry"]) || !CUTOVER_CLOSURE_CATEGORIES.includes(value.category as Category) || !CUTOVER_CLOSURE_DISPOSITIONS.includes(value.disposition as Disposition) || !Array.isArray(value.selectors) || !(value.reason === null || typeof value.reason === "string") || !(value.expiry === null || typeof value.expiry === "string")) fail("refactor_closure_incomplete", `${source}: invalid closure entry ${index}`);
    if (seenCategories.has(value.category as string)) fail("refactor_closure_incomplete", `${source}: duplicate category ${value.category}`);
    seenCategories.add(value.category as string);
    const selectors = value.selectors.map((selector, selectorIndex): Selector => {
      if (!record(selector) || !exactKeys(selector, ["kind", "value"]) || !REFACTOR_KILL_LIST_KINDS.includes(selector.kind as SelectorKind) || typeof selector.value !== "string" || !selector.value) fail("refactor_closure_incomplete", `${source}: invalid selector ${index}.${selectorIndex}`);
      const result = selector as Selector;
      const key = selectorKey(result);
      if (seenSelectors.has(key)) fail("refactor_closure_incomplete", `${source}: duplicate selector ${key}`);
      seenSelectors.add(key);
      return result;
    });
    const disposition = value.disposition as Disposition;
    if (disposition === "retained_with_reason") {
      if (typeof value.reason !== "string" || !value.reason.trim() || typeof value.expiry !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expiry) || Number.isNaN(Date.parse(value.expiry))) fail("refactor_closure_incomplete", `${source}: retained selector requires reason and RFC3339 expiry`);
    } else if (value.reason !== null || value.expiry !== null) fail("refactor_closure_incomplete", `${source}: reason and expiry are reserved for retained_with_reason`);
    return { category: value.category as Category, disposition, selectors, reason: value.reason as string | null, expiry: value.expiry as string | null };
  });
  if (seenCategories.size !== CUTOVER_CLOSURE_CATEGORIES.length || CUTOVER_CLOSURE_CATEGORIES.some((category) => !seenCategories.has(category))) fail("refactor_closure_incomplete", `${source}: all six categories are required exactly once`);
  const killKeys = killList.map((entry) => `${entry.kind}:${entry.selectorId}`);
  if (new Set(killKeys).size !== killKeys.length || killKeys.length !== seenSelectors.size || killKeys.some((key) => !seenSelectors.has(key))) fail("refactor_closure_incomplete", `${source}: closure selectors must cover the kill list exactly once`);
  return { killList, closure: { protocol: 1 as const, entries } };
}

function git(repo: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) fail("refactor_closure_incomplete", result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout;
}
function safeRelative(value: string): boolean { return Boolean(value) && !isAbsolute(value) && !value.includes("\\") && !value.split("/").includes(".."); }
function requireRepoFile(repo: string, path: string, label: string): void {
  let resolved: string;
  try { resolved = realpathSync(path); }
  catch { fail("refactor_closure_incomplete", `${label} is unreadable`); }
  const relativePath = relative(realpathSync(repo), resolved!);
  if (!safeRelative(relativePath) || !lstatSync(resolved!).isFile()) fail("refactor_closure_incomplete", `${label} must be a regular file inside the repository`);
}
function requireSafeOutput(repo: string, locator: string): void {
  let current = realpathSync(repo);
  const parts = locator.split("/");
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]!);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail("refactor_closure_incomplete", "output locator crosses an unsafe filesystem entry");
  }
}
function writeOutput(repo: string, locator: string, content: string): void {
  if (!locator.startsWith(".ai/harness/checks/") || locator === ".ai/harness/checks/") fail("refactor_closure_incomplete", "output locator must be inside .ai/harness/checks");
  requireSafeOutput(repo, locator);
  const descriptor = openSync(resolve(repo, locator), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(descriptor, content, "utf8"); }
  finally { closeSync(descriptor); }
}
function locations(repo: string, head: string, selector: Selector, paths: string[]): string[] {
  if (selector.kind === "path") return paths.includes(selector.value) ? [selector.value] : [];
  const args = ["-c", "core.quotePath=false", "grep", "-n", "-I", "-F", ...(selector.kind === "symbol" ? ["-w"] : []), "-e", selector.value, head, "--"];
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 1) return [];
  if (result.status !== 0) fail("refactor_closure_incomplete", result.stderr.trim() || "git grep failed");
  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const match = line.match(/^[^:]+:(.+?):(\d+):/);
    if (!match) fail("refactor_closure_incomplete", "git grep returned an unreadable location");
    return `${match[1]}:${match[2]}`;
  }).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

export function evaluateCutoverClosure(input: { repo: string; contract: string; head: string; locator: string }): CutoverClosureV1 {
  const repo = resolve(input.repo);
  const contract = resolve(input.contract);
  const contractPath = relative(repo, contract).replaceAll("\\", "/");
  if (!safeRelative(contractPath) || !safeRelative(input.locator)) fail("refactor_closure_incomplete", "unsafe contract or output locator");
  requireRepoFile(repo, contract, "contract");
  requireSafeOutput(repo, input.locator);
  const headSha = git(repo, ["rev-parse", "--verify", `${input.head}^{commit}`]).trim();
  if (!/^[0-9a-f]{40}$/.test(headSha)) fail("refactor_closure_incomplete", "head must resolve to an exact commit");
  const parsed = parseCutoverContract(contract);
  const timestamp = Number(git(repo, ["show", "-s", "--format=%ct", headSha]).trim()) * 1000;
  for (const entry of parsed.closure.entries) if (entry.disposition === "retained_with_reason" && Date.parse(entry.expiry!) <= timestamp) fail("refactor_closure_incomplete", "retained selector expiry must follow the candidate commit timestamp");
  const paths = git(repo, ["-c", "core.quotePath=false", "ls-tree", "-r", "--name-only", headSha]).split("\n").filter(Boolean).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const removed = parsed.closure.entries.flatMap((entry) => entry.disposition === "removed" ? entry.selectors : []);
  const residues = removed.map((selector) => ({ selector: selectorKey(selector), foundAt: locations(repo, headSha, selector, paths) })).filter((item) => item.foundAt.length > 0).sort((a, b) => Buffer.compare(Buffer.from(a.selector), Buffer.from(b.selector)));
  const basis = { protocol: 1 as const, kind: CUTOVER_CLOSURE_KIND, contractPath, contractSha256: bareSha(readFileSync(contract)), headSha, entries: parsed.closure.entries, residues, status: residues.length ? "residue" as const : "closed" as const };
  return { ...basis, closureSha256: bareSha(canonicalJson(basis)), ...(residues.length ? { errorCode: "refactor_closure_residue" as const } : {}) };
}

function args(argv: string[]) {
  if (argv[0] !== "verify") fail("refactor_closure_incomplete", "expected verify command");
  const result: Record<string, string | boolean> = {};
  for (let index = 1; index < argv.length; index++) {
    const key = argv[index]!;
    if (key === "--require-cutover-closure") { result.require = true; continue; }
    if (!["--repo", "--contract", "--head", "--output"].includes(key) || !argv[index + 1]) fail("refactor_closure_incomplete", `unknown or incomplete argument ${key}`);
    result[key.slice(2)] = argv[++index]!;
  }
  return result;
}

function main() {
  try {
    const options = args(process.argv.slice(2));
    const repo = resolve(String(options.repo ?? "."));
    const contractArg = String(options.contract ?? "");
    if (!safeRelative(contractArg)) fail("refactor_closure_incomplete", "contract must be a safe repo-relative path");
    const contract = resolve(repo, contractArg);
    requireRepoFile(repo, contract, "contract");
    const markdown = readFileSync(contract, "utf8");
    const rawKillList = jsonSection(markdown, "Refactor Kill List", contractArg, false);
    if (rawKillList === undefined) {
      const output = { protocol: 1, kind: CUTOVER_CLOSURE_KIND, contractPath: contractArg, contractSha256: bareSha(markdown), headSha: git(repo, ["rev-parse", "--verify", `${String(options.head ?? "HEAD")}^{commit}`]).trim(), entries: [], residues: [], status: "not_applicable" as const };
      const basis = options.require ? { ...output, status: "incomplete" as const } : output;
      const report = { ...basis, closureSha256: bareSha(canonicalJson(basis)), ...(options.require ? { errorCode: "refactor_closure_missing" as const } : {}) };
      process.stdout.write(`${JSON.stringify(report)}\n`);
      if (options.require) { process.stderr.write("refactor_closure_missing\n"); process.exitCode = 1; }
      return;
    }
    const locator = String(options.output ?? ".ai/harness/checks/cutover-closure.v1.json");
    requireSafeOutput(repo, locator);
    const report = evaluateCutoverClosure({ repo, contract, head: String(options.head ?? "HEAD"), locator });
    if (options.output) writeOutput(repo, locator, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== "closed") { process.stderr.write(`${report.errorCode}\n`); process.exitCode = 1; }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();

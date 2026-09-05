#!/usr/bin/env bun
/**
 * Gate for `.ai/context/context-map.json#discoverable_contexts`.
 *
 * The map is an append-only projection with no runtime reader, so drift is
 * invisible until an agent loads the wrong local contract. This check derives
 * every fact from an existing authority -- archcontext capability nodes for
 * ids, prefixes, and declared contract files; the harness policy for the map
 * path; disk for contract existence; the hook projection manifest for the
 * generated-projection exemption -- and never re-derives them locally.
 *
 * `--write` performs the one-shot repair of the `capability-contract` subset
 * from the same authorities and fails closed rather than guessing.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename, join, relative, resolve } from "path";
import { readRegistry, type Capability, type CapabilityRegistry } from "./capability-resolver";

const HARNESS_POLICY = ".ai/harness/policy.json";
const HOOK_PROJECTION_MANIFEST = "assets/hooks/projection.json";
const CONTRACT_MARKER = "BEGIN ARCHITECTURE CONTRACT";
const CONTRACT_FILE_NAMES = ["CLAUDE.md", "AGENTS.md"] as const;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", ".codegraph", "_ref", "_ops"]);
const CONTRACT_PURPOSE = "capability-contract";
const DEFAULT_VERIFICATION_HINT = "record local commands here before implementation";
const LOG_PREFIX = "check-context-map:";

type UnknownRecord = Record<string, unknown>;

interface Args {
  readonly repo: string;
  readonly write: boolean;
}

/** Configuration/authority failures exit 2; map content failures exit 1. */
class FailClosedError extends Error {}

function usage(): never {
  process.stderr.write("Usage: bun scripts/check-context-map.ts [--repo <repo>] [--write]\n");
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  let repo = process.cwd();
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--repo") {
      const value = argv[++index];
      if (!value) usage();
      repo = resolve(value);
      continue;
    }
    usage();
  }
  return { repo, write };
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(absolutePath: string, label: string): unknown {
  let source: string;
  try {
    source = readFileSync(absolutePath, "utf-8");
  } catch (error) {
    throw new FailClosedError(`cannot read ${label}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new FailClosedError(`cannot parse ${label}: ${(error as Error).message}`);
  }
}

function contextMapPath(repo: string): string {
  const policyPath = resolve(repo, HARNESS_POLICY);
  if (!existsSync(policyPath)) {
    throw new FailClosedError(`missing harness policy: ${HARNESS_POLICY}`);
  }
  const policy = readJson(policyPath, HARNESS_POLICY);
  const mapFile = isRecord(policy) && isRecord(policy.context) ? policy.context.map_file : undefined;
  if (typeof mapFile !== "string" || mapFile.trim() === "") {
    throw new FailClosedError(`${HARNESS_POLICY}#context.map_file must name the context map`);
  }
  return mapFile.trim();
}

/**
 * Declared generated-projection targets. Contract files under a target are
 * copies of their canonical source and are owned by the projection, not by the
 * map.
 */
function projectionTargets(repo: string): string[] {
  const manifestPath = resolve(repo, HOOK_PROJECTION_MANIFEST);
  if (!existsSync(manifestPath)) return [];
  const manifest = readJson(manifestPath, HOOK_PROJECTION_MANIFEST);
  const target = isRecord(manifest) ? manifest.projection_target : undefined;
  if (typeof target !== "string" || target.trim() === "") {
    throw new FailClosedError(`${HOOK_PROJECTION_MANIFEST}#projection_target must be a path`);
  }
  return [target.trim().replace(/\/+$/, "")];
}

function underAnyTarget(path: string, targets: readonly string[]): boolean {
  return targets.some((target) => path === target || path.startsWith(`${target}/`));
}

/** Non-root contract files on disk, in stable path order. */
function diskContractFiles(repo: string, rootContextFiles: ReadonlySet<string>, targets: readonly string[]): string[] {
  const found: string[] = [];
  const stack = [repo];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      throw new FailClosedError(`cannot scan ${relative(repo, current) || "."}: ${(error as Error).message}`);
    }
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) stack.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(CONTRACT_FILE_NAMES as readonly string[]).includes(entry.name)) continue;
      const relativePath = relative(repo, absolute).replaceAll("\\", "/");
      if (rootContextFiles.has(relativePath)) continue;
      if (underAnyTarget(relativePath, targets)) continue;
      if (!readFileSync(absolute, "utf-8").includes(CONTRACT_MARKER)) continue;
      found.push(relativePath);
    }
  }
  return found.sort();
}

function capabilityContractFile(capability: Capability, fileName: string): string {
  return fileName === "CLAUDE.md" ? capability.contract_files.claude : capability.contract_files.agents;
}

function capabilityOwning(registry: CapabilityRegistry, contractPath: string): Capability[] {
  const fileName = basename(contractPath);
  return registry.capabilities.filter(
    (capability) => capabilityContractFile(capability, fileName) === contractPath,
  );
}

function buildEntry(capability: Capability, contractPath: string, retained: UnknownRecord | undefined): UnknownRecord {
  const fileName = basename(contractPath);
  const prefix = capability.prefixes[0];
  return {
    path: contractPath,
    priority: retained?.priority ?? "high",
    char_budget: retained?.char_budget ?? 1000,
    purpose: CONTRACT_PURPOSE,
    capability_id: capability.id,
    functional_block: prefix,
    matched_prefix: prefix,
    architecture_domain: capability.domain,
    architecture_capability: capability.name,
    target_agent: fileName === "CLAUDE.md" ? "claude" : "codex",
    lsp_profile: capability.lsp_profile,
    doc_scope: CONTRACT_PURPOSE,
    verification_hint:
      retained?.verification_hint ?? capability.verification_hints[0] ?? DEFAULT_VERIFICATION_HINT,
  };
}

function checkFindings(
  entries: readonly UnknownRecord[],
  registry: CapabilityRegistry,
  repo: string,
  rootContextFiles: ReadonlySet<string>,
  diskContracts: readonly string[],
): string[] {
  const findings: string[] = [];
  const seenPaths = new Set<string>();
  const mappedPaths = new Set<string>();

  for (const entry of entries) {
    const entryPath = typeof entry.path === "string" ? entry.path : "";
    if (entryPath === "") {
      findings.push("invalid_entry (entry has no path)");
      continue;
    }
    if (seenPaths.has(entryPath)) findings.push(`duplicate_path ${entryPath}`);
    seenPaths.add(entryPath);
    if (entry.purpose !== CONTRACT_PURPOSE) continue;
    mappedPaths.add(entryPath);

    if (rootContextFiles.has(entryPath)) {
      findings.push(`root_path ${entryPath}`);
      continue;
    }
    if (!existsSync(resolve(repo, entryPath))) findings.push(`missing_file ${entryPath}`);

    const capabilityId = typeof entry.capability_id === "string" ? entry.capability_id : "";
    const capability = registry.capabilities.find((candidate) => candidate.id === capabilityId);
    if (!capability) {
      findings.push(`unknown_capability ${entryPath} ${capabilityId || "(missing)"}`);
      continue;
    }

    const matchedPrefix = typeof entry.matched_prefix === "string" ? entry.matched_prefix : "";
    if (!capability.prefixes.includes(matchedPrefix)) {
      findings.push(`prefix_not_owned ${entryPath} ${matchedPrefix || "(missing)"}`);
    }
    if (entry.architecture_domain !== capability.domain) {
      findings.push(`capability_facts_mismatch ${entryPath} architecture_domain`);
    }
    if (entry.architecture_capability !== capability.name) {
      findings.push(`capability_facts_mismatch ${entryPath} architecture_capability`);
    }
    const declared = capabilityContractFile(capability, basename(entryPath));
    if (declared !== entryPath) {
      findings.push(`contract_path_mismatch ${entryPath} ${declared}`);
    }
  }

  for (const contractPath of diskContracts) {
    if (!mappedPaths.has(contractPath)) findings.push(`unmapped_contract ${contractPath}`);
  }
  return findings;
}

/**
 * Rebuilds only the `capability-contract` subset from the disk contract set and
 * node facts. Every other entry keeps its content and its position, so the
 * repair diff is exactly the contract entries the invariants reject.
 */
function repair(
  entries: readonly UnknownRecord[],
  registry: CapabilityRegistry,
  diskContracts: readonly string[],
): { entries: UnknownRecord[]; removed: string[] } {
  const retainedByPath = new Map<string, UnknownRecord>();
  for (const entry of entries) {
    if (entry.purpose !== CONTRACT_PURPOSE) continue;
    const entryPath = typeof entry.path === "string" ? entry.path : "";
    if (entryPath !== "" && !retainedByPath.has(entryPath)) retainedByPath.set(entryPath, entry);
  }

  const rebuilt = new Map<string, UnknownRecord>();
  for (const contractPath of diskContracts) {
    const owners = capabilityOwning(registry, contractPath);
    if (owners.length !== 1) {
      throw new FailClosedError(
        `cannot resolve ${contractPath} to exactly one capability node (${owners.length} matches); ` +
          "declare it in extensions.contractFiles or remove the contract file",
      );
    }
    rebuilt.set(contractPath, buildEntry(owners[0], contractPath, retainedByPath.get(contractPath)));
  }

  const next: UnknownRecord[] = [];
  const emitted = new Set<string>();
  const removed: string[] = [];
  for (const entry of entries) {
    if (entry.purpose !== CONTRACT_PURPOSE) {
      next.push(entry);
      continue;
    }
    const entryPath = typeof entry.path === "string" ? entry.path : "";
    const replacement = rebuilt.get(entryPath);
    if (!replacement || emitted.has(entryPath)) {
      removed.push(`${entryPath || "(no path)"} (${String(entry.capability_id ?? "unknown")})`);
      continue;
    }
    emitted.add(entryPath);
    next.push(replacement);
  }
  for (const [contractPath, entry] of rebuilt) {
    if (!emitted.has(contractPath)) next.push(entry);
  }
  return { entries: next, removed };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo;

  const mapFile = contextMapPath(repo);
  const mapPath = resolve(repo, mapFile);
  if (!existsSync(mapPath)) throw new FailClosedError(`missing context map: ${mapFile}`);
  const map = readJson(mapPath, mapFile);
  if (!isRecord(map)) throw new FailClosedError(`${mapFile} must be a JSON object`);
  if (!Array.isArray(map.discoverable_contexts)) {
    throw new FailClosedError(`${mapFile}#discoverable_contexts must be an array`);
  }
  if (
    !Array.isArray(map.root_context_files)
    || map.root_context_files.length === 0
    || map.root_context_files.some((value) => typeof value !== "string")
  ) {
    throw new FailClosedError(`${mapFile}#root_context_files must be a non-empty array of paths`);
  }
  const entries = map.discoverable_contexts.filter(isRecord);
  if (entries.length !== map.discoverable_contexts.length) {
    throw new FailClosedError(`${mapFile}#discoverable_contexts entries must be objects`);
  }
  const rootContextFiles = new Set(map.root_context_files as string[]);

  let registry: CapabilityRegistry;
  try {
    registry = readRegistry(repo);
  } catch (error) {
    throw new FailClosedError(`capability authority is unavailable: ${(error as Error).message}`);
  }

  const targets = projectionTargets(repo);
  const diskContracts = diskContractFiles(repo, rootContextFiles, targets);

  if (args.write) {
    const beforeContracts = entries.filter((entry) => entry.purpose === CONTRACT_PURPOSE).length;
    const { entries: nextEntries, removed } = repair(entries, registry, diskContracts);
    const afterContracts = nextEntries.filter((entry) => entry.purpose === CONTRACT_PURPOSE).length;
    map.discoverable_contexts = nextEntries;
    writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
    for (const item of removed) console.log(`${LOG_PREFIX} removed ${item}`);
    console.log(
      `${LOG_PREFIX} rewrote ${mapFile} before ${entries.length} entries / ${beforeContracts} capability-contract,`
        + ` after ${nextEntries.length} entries / ${afterContracts} capability-contract`,
    );
    return;
  }

  const findings = checkFindings(entries, registry, repo, rootContextFiles, diskContracts);
  if (findings.length > 0) {
    for (const finding of findings) console.error(`${LOG_PREFIX} ${finding}`);
    console.error(
      `${LOG_PREFIX} ${findings.length} finding(s) in ${mapFile};`
        + " repair with bun scripts/check-context-map.ts --write",
    );
    process.exit(1);
  }
  const contractCount = entries.filter((entry) => entry.purpose === CONTRACT_PURPOSE).length;
  console.log(
    `${LOG_PREFIX} OK ${mapFile} (${contractCount} capability-contract entries, ${entries.length} total)`,
  );
}

try {
  main();
} catch (error) {
  if (error instanceof FailClosedError) {
    console.error(`${LOG_PREFIX} ${error.message}`);
    process.exit(2);
  }
  console.error(`${LOG_PREFIX} ${(error as Error).message}`);
  process.exit(2);
}

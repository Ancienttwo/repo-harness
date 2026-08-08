#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { relative, resolve } from "path";
import { spawnSync } from "child_process";
import {
  CAPABILITY_SOURCE_MODES,
  capabilityRegistryFromArchcontextNodes,
  matchCapabilityPath,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  type ArchcontextNodeFile,
  type Capability,
  type CapabilityRegistry,
  type CapabilityRegistryDiagnostic,
  type CapabilityRegistryResolution,
  type CapabilitySourceMode,
} from "../src/core/capabilities/registry";

export type { Capability, CapabilityRegistry, ContractFiles } from "../src/core/capabilities/registry";

// Explicit one-shot registry -> ArchContext node/v2 migration projection. The
// exporter carries only facts already present in the registry; it does not
// become a second runtime authority and is never read by capability resolution.
export type ArchContextNodeV2 = {
  schemaVersion: "archcontext.node/v2";
  id: string;
  kind: "capability";
  name: string;
  status: "active";
  summary: string;
  responsibilities: string[];
  source: {
    include: string[];
  };
  extensions: {
    contractFiles: {
      agents: string;
      claude: string;
    };
    lspProfile: string;
    verification: string[];
  };
};

type Format = "json" | "text" | "prefixes" | "archcontext-nodes-v2";

type Args = {
  command: string;
  repo: string;
  path: string;
  pathsFrom: string;
  format: Format;
};

const DEFAULT_REGISTRY = ".ai/context/capabilities.json";
const HARNESS_POLICY = ".ai/harness/policy.json";
const CAPABILITY_SOURCE_KEY = `${HARNESS_POLICY}#context.capability_source`;
const ARCHCONTEXT_NODES_DIR = ".archcontext/model/nodes";
const ARCHCONTEXT_NODE_FILE = /\.ya?ml$/;

/**
 * Capability source selection failures. These are configuration/authority
 * failures rather than registry content failures, so they exit 2 and never
 * degrade to the other source.
 */
export class CapabilitySourceError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "CapabilitySourceError";
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Structural accessor for Bun's native YAML parser. Keeping the lookup
 * structural avoids an npm YAML dependency in a helper that must run inside a
 * repo with no node_modules, and doubles as the fail-closed guard for Bun
 * runtimes older than 1.3.
 */
export function bunYamlParser(host: unknown): (source: string) => unknown {
  const runtime = plainRecord(host)?.Bun;
  const yaml = plainRecord(runtime)?.YAML;
  const parse = plainRecord(yaml)?.parse;
  if (typeof parse !== "function") {
    throw new CapabilitySourceError(
      `Bun.YAML is unavailable; ${CAPABILITY_SOURCE_KEY}="archcontext" requires Bun >= 1.3 ` +
        "(upgrade Bun, or set the capability source back to \"registry\")"
    );
  }
  return (source: string) => (parse as (input: string) => unknown).call(yaml, source);
}

export function capabilitySourceMode(repo: string): CapabilitySourceMode {
  const policyPath = resolve(repo, HARNESS_POLICY);
  if (!existsSync(policyPath)) return "registry";
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(policyPath, "utf-8"));
  } catch (error) {
    throw new CapabilitySourceError(
      `malformed harness policy: ${HARNESS_POLICY}: ${(error as Error).message}`
    );
  }
  const value = plainRecord(plainRecord(policy)?.context)?.capability_source;
  if (value === undefined) return "registry";
  if (typeof value === "string" && (CAPABILITY_SOURCE_MODES as readonly string[]).includes(value)) {
    return value as CapabilitySourceMode;
  }
  throw new CapabilitySourceError(
    `unknown capability source: ${JSON.stringify(value)}; ${CAPABILITY_SOURCE_KEY} must be one of ` +
      CAPABILITY_SOURCE_MODES.join(", ")
  );
}

export function readArchcontextNodeFiles(repo: string): ArchcontextNodeFile[] {
  const nodesDir = resolve(repo, ARCHCONTEXT_NODES_DIR);
  if (!existsSync(nodesDir)) {
    throw new CapabilitySourceError(
      `missing archcontext model directory: ${ARCHCONTEXT_NODES_DIR}; ` +
        `${CAPABILITY_SOURCE_KEY}="archcontext" reads capabilities from that directory only`
    );
  }
  const parseYaml = bunYamlParser(globalThis);
  const entries = readdirSync(nodesDir, { withFileTypes: true })
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const files: ArchcontextNodeFile[] = [];
  for (const entry of entries) {
    const relPath = `${ARCHCONTEXT_NODES_DIR}/${entry.name}`;
    if (!entry.isFile() || !ARCHCONTEXT_NODE_FILE.test(entry.name)) {
      throw new CapabilitySourceError(
        `unexpected entry in archcontext model directory: ${relPath}; expected only *.yaml or *.yml node files`
      );
    }
    let value: unknown;
    try {
      value = parseYaml(readFileSync(resolve(nodesDir, entry.name), "utf-8"));
    } catch (error) {
      throw new CapabilitySourceError(
        `invalid archcontext node YAML: ${relPath}: ${(error as Error).message}`
      );
    }
    files.push({ path: relPath, value });
  }
  return files;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  scripts/capability-resolver.ts list [--repo <repo>] [--format json|text|prefixes]",
      "  scripts/capability-resolver.ts match --path <repo-relative-path> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts match --paths-from <file|-> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts validate [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts export --format archcontext-nodes-v2 [--repo <repo>]",
    ].join("\n")
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] || "",
    repo: ".",
    path: "",
    pathsFrom: "",
    format: "text",
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--repo":
        args.repo = argv[++index] || usage();
        break;
      case "--path":
        args.path = argv[++index] || usage();
        break;
      case "--paths-from":
        args.pathsFrom = argv[++index] || usage();
        break;
      case "--format": {
        const value = argv[++index] as Format;
        if (!["json", "text", "prefixes", "archcontext-nodes-v2"].includes(value)) usage();
        args.format = value;
        break;
      }
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }

  if (!["list", "match", "validate", "export"].includes(args.command)) usage();
  if (args.command === "match" && !args.path && !args.pathsFrom) usage();
  if (args.command === "match" && args.path && args.pathsFrom) usage();
  if (args.command === "match" && args.format === "prefixes") usage();
  if (args.command === "export" && args.format !== "archcontext-nodes-v2") usage();
  if (args.command !== "export" && args.format === "archcontext-nodes-v2") usage();
  return args;
}

function repoRoot(input: string): string {
  const cwd = resolve(input);
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf-8",
  });
  if (result.status === 0 && result.stdout.trim()) {
    return resolve(result.stdout.trim());
  }
  return cwd;
}

function missingRegistryError(): Error {
  return new Error(
    `missing capability registry: ${DEFAULT_REGISTRY}; create it with ` +
      "repo-harness run capability-config add --prefix <existing-path>"
  );
}

function capabilityAuthorityPath(mode: CapabilitySourceMode): string {
  return mode === "archcontext" ? ARCHCONTEXT_NODES_DIR : DEFAULT_REGISTRY;
}

// One authority per mode: archcontext never falls back to the JSON registry and
// the JSON registry never falls back to archcontext nodes.
function loadRegistry(repo: string, mode: CapabilitySourceMode): CapabilityRegistryResolution {
  if (mode === "archcontext") {
    return capabilityRegistryFromArchcontextNodes(readArchcontextNodeFiles(repo), {
      repoRoot: repo,
      isExistingDirectory: (path) => {
        try {
          return statSync(resolve(repo, path)).isDirectory();
        } catch {
          return false;
        }
      },
    });
  }
  const registryPath = resolve(repo, DEFAULT_REGISTRY);
  if (!existsSync(registryPath)) {
    return parseCapabilityRegistry(null, { declared: false, repoRoot: repo });
  }
  return parseCapabilityRegistry(readFileSync(registryPath, "utf-8"), { declared: true, repoRoot: repo });
}

function malformedRegistryError(
  diagnostics: readonly CapabilityRegistryDiagnostic[],
  authority: string,
): Error {
  return new Error(
    `malformed capability registry: ${authority}: ${diagnostics.map((item) => item.message).join("; ")}`
  );
}

export function readRegistry(repo: string): CapabilityRegistry {
  const mode = capabilitySourceMode(repo);
  const resolution = loadRegistry(repo, mode);
  if (resolution.status === "absent") throw missingRegistryError();
  if (resolution.status === "invalid") {
    throw malformedRegistryError(resolution.diagnostics, capabilityAuthorityPath(mode));
  }
  return resolution.registry;
}

function validateRegistryEffects(registry: CapabilityRegistry, repo: string): string[] {
  const errors: string[] = [];
  const architectureModules = new Set<string>();
  const workstreamDirs = new Set<string>();

  for (const capability of registry.capabilities) {
    for (const prefix of capability.prefixes) {
      const normalized = normalizeCapabilityPath(prefix, repo);
      if (!existsSync(resolve(repo, normalized))) {
        errors.push(`${capability.id}: prefix does not exist: ${normalized}`);
      }
    }
    architectureModules.add(normalizeCapabilityPath(capability.architecture_module, repo));
    workstreamDirs.add(normalizeCapabilityPath(capability.workstream_dir, repo));
  }

  const modulesRoot = resolve(repo, "docs/architecture/modules");
  if (existsSync(modulesRoot)) {
    const stack = [modulesRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const relPath = relative(repo, absPath).replaceAll("\\", "/");
          if (!architectureModules.has(relPath)) {
            errors.push(`orphan architecture module: ${relPath}`);
          }
        }
      }
    }
  }

  const workstreamsRoot = resolve(repo, "tasks/workstreams");
  if (existsSync(workstreamsRoot)) {
    const stack = [workstreamsRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const relPath = relative(repo, absPath).replaceAll("\\", "/");
          const owned = [...workstreamDirs].some((dir) => relPath === dir || relPath.startsWith(`${dir}/`));
          if (!owned) {
            errors.push(`orphan workstream: ${relPath}`);
          }
        }
      }
    }
  }

  return errors;
}

export function findMatch(registry: CapabilityRegistry, repo: string, inputPath: string) {
  const result = matchCapabilityPath(registry, inputPath, { repoRoot: repo });
  if (result.status === "invalid") {
    throw new Error(result.diagnostics.map((item) => item.message).join("; "));
  }
  if (result.status === "unmapped") {
    return {
      matched: false,
      file_path: result.filePath,
      functional_block: "root",
      matched_prefix: "root",
      capability_id: "root",
      architecture_domain: "root",
      architecture_capability: "_root",
      architecture_module: "docs/architecture/index.md",
      workstream_dir: "tasks/workstreams/root/_root",
    };
  }
  const winner = result.match;
  return {
    matched: true,
    file_path: winner.filePath,
    functional_block: winner.prefix,
    matched_prefix: winner.prefix,
    capability_id: winner.capability.id,
    architecture_domain: winner.capability.domain,
    architecture_capability: winner.capability.name,
    architecture_module: winner.capability.architecture_module,
    workstream_dir: winner.capability.workstream_dir,
    contract_agents: winner.capability.contract_files.agents,
    contract_claude: winner.capability.contract_files.claude,
    lsp_profile: winner.capability.lsp_profile,
    verification_hints: winner.capability.verification_hints,
  };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function toArchContextNodeV2(capability: Capability, isExistingDirectory: (path: string) => boolean): ArchContextNodeV2 {
  const displayName = capability.name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const includes = capability.prefixes.map((prefix) => {
    try {
      return isExistingDirectory(prefix) ? `${prefix}/**` : prefix;
    } catch {
      return prefix;
    }
  });
  return {
    schemaVersion: "archcontext.node/v2",
    id: `capability.${capability.domain}.${capability.name}`,
    kind: "capability",
    name: displayName,
    status: "active",
    summary: `Capability boundary for ${capability.domain}/${capability.name}.`,
    responsibilities: [`Own the source paths declared by the ${capability.id} capability boundary.`],
    source: {
      include: includes,
    },
    extensions: {
      contractFiles: {
        agents: capability.contract_files.agents,
        claude: capability.contract_files.claude,
      },
      lspProfile: capability.lsp_profile,
      verification: [...capability.verification_hints],
    },
  };
}

export function buildArchContextNodesV2(
  registry: CapabilityRegistry,
  options: { repoRoot?: string; isExistingDirectory?: (path: string) => boolean } = {},
): ArchContextNodeV2[] {
  const repoRoot = options.repoRoot ?? process.cwd();
  const isExistingDirectory = options.isExistingDirectory ?? ((path: string) => {
    try { return statSync(resolve(repoRoot, path)).isDirectory(); } catch { return false; }
  });
  return registry.capabilities
    .map((capability) => toArchContextNodeV2(capability, isExistingDirectory))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

async function readPathLines(input: string): Promise<string[]> {
  const text = input === "-" ? await Bun.stdin.text() : readFileSync(input, "utf-8");
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repo = repoRoot(args.repo);
  const mode = capabilitySourceMode(repo);
  const authority = capabilityAuthorityPath(mode);
  const resolution = loadRegistry(repo, mode);
  if (resolution.status === "absent") throw missingRegistryError();

  if (args.command === "validate") {
    if (resolution.status === "invalid") {
      const structuralCodes = new Set([
        "INVALID_JSON",
        "REGISTRY_NOT_OBJECT",
        "UNSUPPORTED_VERSION",
        "CAPABILITIES_NOT_ARRAY",
        "CAPABILITY_NOT_OBJECT",
        "ARCHCONTEXT_NODE_NOT_OBJECT",
        "ARCHCONTEXT_SCHEMA_VERSION_UNSUPPORTED",
        "ARCHCONTEXT_NODE_ID_INVALID",
        "ARCHCONTEXT_NODE_KIND_INVALID",
        "ARCHCONTEXT_NODE_STATUS_INVALID",
        "ARCHCONTEXT_NODE_NAME_INVALID",
        "ARCHCONTEXT_NODE_SUMMARY_INVALID",
        "ARCHCONTEXT_NODE_RESPONSIBILITIES_INVALID",
        "ARCHCONTEXT_INCLUDE_REQUIRED",
        "ARCHCONTEXT_EXCLUDE_UNSUPPORTED",
        "ARCHCONTEXT_INCLUDE_SHAPE_UNSUPPORTED",
        "ARCHCONTEXT_INCLUDE_SHAPE_AMBIGUOUS",
        "ARCHCONTEXT_EXTENSIONS_REQUIRED",
        "ARCHCONTEXT_LSP_PROFILE_REQUIRED",
        "ARCHCONTEXT_VERIFICATION_REQUIRED",
        "ARCHCONTEXT_CONTRACT_FILES_REQUIRED",
      ]);
      if (resolution.diagnostics.some((item) => structuralCodes.has(item.code))) {
        throw malformedRegistryError(resolution.diagnostics, authority);
      }
    }
    const errors = resolution.status === "invalid"
      ? resolution.diagnostics.map((item) => item.message)
      : validateRegistryEffects(resolution.registry, repo);
    if (args.format === "json") {
      printJson({ ok: errors.length === 0, errors });
    } else if (errors.length === 0) {
      console.log("[CapabilityResolver] OK");
    } else {
      for (const error of errors) console.log(`[CapabilityResolver] ${error}`);
    }
    process.exit(errors.length === 0 ? 0 : 1);
  }

  if (resolution.status === "invalid") throw malformedRegistryError(resolution.diagnostics, authority);
  const registry = resolution.registry;

  if (args.command === "list") {
    if (args.format === "json") {
      printJson(registry.capabilities);
    } else if (args.format === "prefixes") {
      for (const capability of registry.capabilities) {
        for (const prefix of capability.prefixes) {
          console.log(normalizeCapabilityPath(prefix, repo));
        }
      }
    } else {
      for (const capability of registry.capabilities) {
        console.log(`${capability.id}\t${capability.prefixes.join(",")}`);
      }
    }
    return;
  }

  if (args.command === "export") {
    const exportErrors = validateRegistryEffects(registry, repo);
    if (exportErrors.length > 0) {
      throw new Error(`capability registry is invalid:\n${exportErrors.join("\n")}`);
    }
    printJson(buildArchContextNodesV2(registry, { repoRoot: repo }));
    return;
  }

  const errors = validateRegistryEffects(registry, repo);
  if (errors.length > 0) {
    throw new Error(`capability registry is invalid:\n${errors.join("\n")}`);
  }
  if (args.pathsFrom) {
    const paths = await readPathLines(args.pathsFrom);
    const seen = new Set<string>();
    const matches = [];
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      matches.push(findMatch(registry, repo, path));
    }
    if (args.format === "json") {
      printJson(matches);
    } else {
      for (const match of matches) {
        console.log(`${match.file_path}: ${match.capability_id} (${match.matched_prefix})`);
      }
    }
    return;
  }

  const match = findMatch(registry, repo, args.path);
  if (args.format === "json") {
    printJson(match);
  } else {
    for (const [key, value] of Object.entries(match)) {
      if (Array.isArray(value)) {
        console.log(`${key}: ${value.join(", ")}`);
      } else {
        console.log(`${key}: ${value}`);
      }
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`[CapabilityResolver] ${(error as Error).message}`);
    process.exit((error as { exitCode?: number }).exitCode ?? 1);
  }
}

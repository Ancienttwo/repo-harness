#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { spawnSync } from "child_process";
import {
  matchCapabilityPath,
  normalizeCapabilityPath,
  parseCapabilityRegistry,
  type Capability,
  type CapabilityRegistry,
  type CapabilityRegistryDiagnostic,
} from "../src/core/capabilities/registry";

export type { Capability, CapabilityRegistry, ContractFiles } from "../src/core/capabilities/registry";

// archcontext-boundaries-v1 is a deliberately narrow, read-only export of the
// capability registry shaped as a subset of ArchitectureNode (archcontext.node/v1).
// Tests derive the bridge subset from archctx-contracts' authoritative schema;
// docs/researches/20260705-archcontext-capability-filing-handover.md explains
// why this stays a read-only bridge with no archctx CLI/daemon runtime dependency.
export type ArchContextBoundaryNode = {
  schemaVersion: "archcontext.node/v1";
  id: string;
  kind: "capability";
  source: {
    include: string[];
  };
  extensions: {
    lspProfile: string;
    verification: string[];
  };
};

type Format = "json" | "text" | "prefixes" | "archcontext-boundaries-v1";

type Args = {
  command: string;
  repo: string;
  path: string;
  pathsFrom: string;
  format: Format;
};

const DEFAULT_REGISTRY = ".ai/context/capabilities.json";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  scripts/capability-resolver.ts list [--repo <repo>] [--format json|text|prefixes]",
      "  scripts/capability-resolver.ts match --path <repo-relative-path> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts match --paths-from <file|-> [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts validate [--repo <repo>] [--format json|text]",
      "  scripts/capability-resolver.ts export --format archcontext-boundaries-v1 [--repo <repo>]",
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
        if (!["json", "text", "prefixes", "archcontext-boundaries-v1"].includes(value)) usage();
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
  if (args.command === "export" && args.format !== "archcontext-boundaries-v1") usage();
  if (args.command !== "export" && args.format === "archcontext-boundaries-v1") usage();
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

function loadRegistry(repo: string): ReturnType<typeof parseCapabilityRegistry> {
  const registryPath = resolve(repo, DEFAULT_REGISTRY);
  if (!existsSync(registryPath)) {
    return parseCapabilityRegistry(null, { declared: false, repoRoot: repo });
  }
  return parseCapabilityRegistry(readFileSync(registryPath, "utf-8"), { declared: true, repoRoot: repo });
}

function malformedRegistryError(diagnostics: readonly CapabilityRegistryDiagnostic[]): Error {
  return new Error(
    `malformed capability registry: ${DEFAULT_REGISTRY}: ${diagnostics.map((item) => item.message).join("; ")}`
  );
}

export function readRegistry(repo: string): CapabilityRegistry {
  const resolution = loadRegistry(repo);
  if (resolution.status === "absent") throw missingRegistryError();
  if (resolution.status === "invalid") throw malformedRegistryError(resolution.diagnostics);
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

function toArchContextBoundaryNode(capability: Capability): ArchContextBoundaryNode {
  return {
    schemaVersion: "archcontext.node/v1",
    id: `capability.${capability.domain}.${capability.name}`,
    kind: "capability",
    source: {
      include: [...capability.prefixes],
    },
    extensions: {
      lspProfile: capability.lsp_profile,
      verification: [...capability.verification_hints],
    },
  };
}

export function buildArchContextBoundariesV1(registry: CapabilityRegistry): ArchContextBoundaryNode[] {
  return registry.capabilities
    .map(toArchContextBoundaryNode)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

async function readPathLines(input: string): Promise<string[]> {
  const text = input === "-" ? await Bun.stdin.text() : readFileSync(input, "utf-8");
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repo = repoRoot(args.repo);
  const resolution = loadRegistry(repo);
  if (resolution.status === "absent") throw missingRegistryError();

  if (args.command === "validate") {
    if (resolution.status === "invalid") {
      const structuralCodes = new Set([
        "INVALID_JSON",
        "REGISTRY_NOT_OBJECT",
        "UNSUPPORTED_VERSION",
        "CAPABILITIES_NOT_ARRAY",
        "CAPABILITY_NOT_OBJECT",
      ]);
      if (resolution.diagnostics.some((item) => structuralCodes.has(item.code))) {
        throw malformedRegistryError(resolution.diagnostics);
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

  if (resolution.status === "invalid") throw malformedRegistryError(resolution.diagnostics);
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
    printJson(buildArchContextBoundariesV1(registry));
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
    process.exit(1);
  }
}

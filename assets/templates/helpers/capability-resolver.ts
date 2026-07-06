#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { spawnSync } from "child_process";

export type ContractFiles = {
  agents: string;
  claude: string;
};

export type Capability = {
  id: string;
  domain: string;
  name: string;
  prefixes: string[];
  contract_files: ContractFiles;
  architecture_module: string;
  workstream_dir: string;
  lsp_profile: string;
  verification_hints: string[];
};

export type CapabilityRegistry = {
  version: number;
  capabilities: Capability[];
};

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

function normalizeRepoPath(value: string, repo: string): string {
  let next = value.trim().replace(/^file:\/\//, "").replaceAll("\\", "/");
  const normalizedRepo = repo.replaceAll("\\", "/");

  if (next.startsWith(`${normalizedRepo}/`)) {
    next = next.slice(normalizedRepo.length + 1);
  } else if (next.startsWith("/")) {
    throw new Error(`absolute path is outside repo: ${value}`);
  }

  next = next.replace(/^\.\//, "").replace(/\/+$/, "");
  const parts = next.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("path must not be empty");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`path must not contain traversal: ${value}`);
  }
  return parts.join("/");
}

function safeToken(value: string, fallback = "capability"): string {
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return token || fallback;
}

function defaultCapabilityForPrefix(prefix: string): Capability {
  const parts = prefix.split("/");
  const domain =
    parts.length >= 2 ? safeToken(`${parts[0]}-${parts[1]}`, safeToken(prefix)) : safeToken(prefix);
  const name = parts.length > 2 ? safeToken(parts[parts.length - 1]) : safeToken(parts[parts.length - 1] || domain);
  const id = parts.length > 2 ? `${domain}-${name}` : domain;

  return {
    id,
    domain,
    name,
    prefixes: [prefix],
    contract_files: {
      agents: `${prefix}/AGENTS.md`,
      claude: `${prefix}/CLAUDE.md`,
    },
    architecture_module: `docs/architecture/modules/${domain}/${name}.md`,
    workstream_dir: `tasks/workstreams/${domain}/${name}`,
    lsp_profile: "typescript-lsp",
    verification_hints: ["record local commands here before implementation"],
  };
}

function legacyBlocks(repo: string): string[] {
  const configFile = resolve(repo, ".ai/context/agent-context-blocks.txt");
  const envBlocks =
    process.env.REPO_HARNESS_CONTEXT_BLOCKS || "";
  const rawBlocks = envBlocks
    ? envBlocks.split(/[,:]/)
    : existsSync(configFile)
      ? readFileSync(configFile, "utf-8").split(/\r?\n/)
      : [];

  const blocks = rawBlocks
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((line) => normalizeRepoPath(line, repo))
    .filter((line) => existsSync(resolve(repo, line)));

  if (blocks.length > 0) {
    return [...new Set(blocks)].sort();
  }

  const discovered: string[] = [];
  const ignored = new Set([".git", "node_modules", ".ai", ".claude", ".worktrees", "_ref"]);
  function walk(absDir: string) {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absPath = resolve(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (entry.isFile() && (entry.name === "AGENTS.md" || entry.name === "CLAUDE.md")) {
        const dir = relative(repo, absDir).replaceAll("\\", "/");
        if (dir && dir !== ".") discovered.push(normalizeRepoPath(dir, repo));
      }
    }
  }
  walk(repo);
  return [...new Set(discovered)].sort();
}

export function readRegistry(repo: string): CapabilityRegistry {
  const registryPath = resolve(repo, DEFAULT_REGISTRY);
  if (!existsSync(registryPath)) {
    return {
      version: 1,
      capabilities: legacyBlocks(repo).map(defaultCapabilityForPrefix),
    };
  }

  const parsed = JSON.parse(readFileSync(registryPath, "utf-8")) as CapabilityRegistry;
  return {
    version: parsed.version ?? 1,
    capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities : [],
  };
}

function validateCapability(capability: Capability, repo: string): string[] {
  const errors: string[] = [];
  const requiredStrings: Array<[keyof Capability, string]> = [
    ["id", capability.id],
    ["domain", capability.domain],
    ["name", capability.name],
    ["architecture_module", capability.architecture_module],
    ["workstream_dir", capability.workstream_dir],
    ["lsp_profile", capability.lsp_profile],
  ];

  for (const [field, value] of requiredStrings) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${capability.id || "(unknown)"}: ${String(field)} is required`);
    }
  }

  if (!Array.isArray(capability.prefixes) || capability.prefixes.length === 0) {
    errors.push(`${capability.id || "(unknown)"}: prefixes must contain at least one path`);
  } else {
    for (const prefix of capability.prefixes) {
      try {
        normalizeRepoPath(prefix, repo);
      } catch (error) {
        errors.push(`${capability.id}: invalid prefix ${prefix}: ${(error as Error).message}`);
      }
    }
  }

  const contractFiles = capability.contract_files;
  if (!contractFiles || typeof contractFiles !== "object") {
    errors.push(`${capability.id}: contract_files.agents and contract_files.claude are required`);
  } else {
    for (const field of ["agents", "claude"] as const) {
      const value = contractFiles[field];
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${capability.id}: contract_files.${field} is required`);
        continue;
      }
      try {
        normalizeRepoPath(value, repo);
      } catch (error) {
        errors.push(`${capability.id}: invalid contract_files.${field}: ${(error as Error).message}`);
      }
    }
  }

  for (const [field, value] of [
    ["architecture_module", capability.architecture_module],
    ["workstream_dir", capability.workstream_dir],
  ] as const) {
    try {
      normalizeRepoPath(value, repo);
    } catch (error) {
      errors.push(`${capability.id}: invalid ${field}: ${(error as Error).message}`);
    }
  }

  if (!Array.isArray(capability.verification_hints)) {
    errors.push(`${capability.id}: verification_hints must be an array`);
  }

  return errors;
}

function validateRegistry(registry: CapabilityRegistry, repo: string): string[] {
  const errors: string[] = [];
  const ids = new Map<string, string>();
  const prefixes = new Map<string, string>();
  const architectureModules = new Set<string>();
  const workstreamDirs = new Set<string>();

  if (!Number.isInteger(registry.version)) {
    errors.push("version must be an integer");
  }

  for (const capability of registry.capabilities) {
    errors.push(...validateCapability(capability, repo));
    if (ids.has(capability.id)) {
      errors.push(`duplicate capability id: ${capability.id}`);
    }
    ids.set(capability.id, capability.id);

    for (const prefix of capability.prefixes || []) {
      let normalized = "";
      try {
        normalized = normalizeRepoPath(prefix, repo);
      } catch {
        continue;
      }
      const owner = prefixes.get(normalized);
      if (owner && owner !== capability.id) {
        errors.push(`duplicate capability prefix: ${normalized} (${owner}, ${capability.id})`);
      }
      prefixes.set(normalized, capability.id);
    }

    try {
      architectureModules.add(normalizeRepoPath(capability.architecture_module, repo));
      workstreamDirs.add(normalizeRepoPath(capability.workstream_dir, repo));
    } catch {
      // Field-specific validation already recorded the concrete error.
    }
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
  const relPath = normalizeRepoPath(inputPath, repo);
  const matches: Array<{ capability: Capability; prefix: string }> = [];

  for (const capability of registry.capabilities) {
    for (const rawPrefix of capability.prefixes || []) {
      const prefix = normalizeRepoPath(rawPrefix, repo);
      if (relPath === prefix || relPath.startsWith(`${prefix}/`)) {
        matches.push({ capability, prefix });
      }
    }
  }

  if (matches.length === 0) {
    return {
      matched: false,
      file_path: relPath,
      functional_block: "root",
      matched_prefix: "root",
      capability_id: "root",
      architecture_domain: "root",
      architecture_capability: "_root",
      architecture_module: "docs/architecture/index.md",
      workstream_dir: "tasks/workstreams/root/_root",
    };
  }

  matches.sort((left, right) => right.prefix.length - left.prefix.length);
  const longest = matches[0].prefix.length;
  const winners = matches.filter((match) => match.prefix.length === longest);
  const winnerKeys = new Set(winners.map((match) => `${match.capability.id}:${match.prefix}`));
  if (winnerKeys.size > 1) {
    throw new Error(
      `ambiguous capability match for ${relPath}: ${winners
        .map((match) => `${match.capability.id} (${match.prefix})`)
        .join(", ")}`
    );
  }

  const winner = winners[0];
  return {
    matched: true,
    file_path: relPath,
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
  const registry = readRegistry(repo);

  if (args.command === "validate") {
    const errors = validateRegistry(registry, repo);
    if (args.format === "json") {
      printJson({ ok: errors.length === 0, errors });
    } else if (errors.length === 0) {
      console.log("[CapabilityResolver] OK");
    } else {
      for (const error of errors) console.log(`[CapabilityResolver] ${error}`);
    }
    process.exit(errors.length === 0 ? 0 : 1);
  }

  if (args.command === "list") {
    if (args.format === "json") {
      printJson(registry.capabilities);
    } else if (args.format === "prefixes") {
      for (const capability of registry.capabilities) {
        for (const prefix of capability.prefixes || []) {
          console.log(normalizeRepoPath(prefix, repo));
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
    const exportErrors = validateRegistry(registry, repo);
    if (exportErrors.length > 0) {
      throw new Error(`capability registry is invalid:\n${exportErrors.join("\n")}`);
    }
    printJson(buildArchContextBoundariesV1(registry));
    return;
  }

  const errors = validateRegistry(registry, repo);
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

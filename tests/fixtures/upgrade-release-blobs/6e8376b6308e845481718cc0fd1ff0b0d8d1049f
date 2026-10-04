#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { readRegistry as readCapabilityRegistry, type Capability, type CapabilityRegistry } from "./capability-resolver";

type Registry = CapabilityRegistry;

type Format = "text" | "json";

type Args = {
  command: "add" | "";
  repo: string;
  prefix: string;
  id: string;
  domain: string;
  name: string;
  agents: string;
  claude: string;
  architectureModule: string;
  workstreamDir: string;
  lspProfile: string;
  verificationHints: string[];
  createPrefix: boolean;
  createArchitectureModule: boolean;
  createWorkstream: boolean;
  syncContracts: boolean;
  dryRun: boolean;
  format: Format;
};

const REGISTRY_PATH = ".ai/context/capabilities.json";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HELPER_DIR = process.env.REPO_HARNESS_HELPER_SOURCE_PATH
  ? dirname(process.env.REPO_HARNESS_HELPER_SOURCE_PATH)
  : SCRIPT_DIR;

function usage(): never {
  console.error(
    [
      "Usage:",
      "  scripts/capability-config.ts add --prefix <path> [options]",
      "",
      "Options:",
      "  --repo <path>                    Target repo (default: .)",
      "  --id <id>                        Capability ID (default derived from prefix)",
      "  --domain <domain>                Architecture domain (default derived from prefix)",
      "  --name <name>                    Capability name (default derived from prefix)",
      "  --agents <path>                  AGENTS.md path (default: <prefix>/AGENTS.md)",
      "  --claude <path>                  CLAUDE.md path (default: <prefix>/CLAUDE.md)",
      "  --architecture-module <path>     Architecture module path",
      "  --workstream-dir <path>          Workstream directory path",
      "  --lsp-profile <profile>          LSP/tooling profile (default: typescript-lsp)",
      "  --verification-hint <command>    Repeatable local verification hint",
      "  --create-prefix                  Create the prefix directory when missing",
      "  --create-architecture-module     Create a minimal architecture module when missing",
      "  --create-workstream              Create a durable workstream ledger",
      "  --no-sync-contracts              Only update the registry",
      "  --dry-run                        Print planned changes without writing",
      "  --format text|json               Output format (default: text)",
    ].join("\n")
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: (argv[0] as Args["command"]) || "",
    repo: ".",
    prefix: "",
    id: "",
    domain: "",
    name: "",
    agents: "",
    claude: "",
    architectureModule: "",
    workstreamDir: "",
    lspProfile: "typescript-lsp",
    verificationHints: [],
    createPrefix: false,
    createArchitectureModule: false,
    createWorkstream: false,
    syncContracts: true,
    dryRun: false,
    format: "text",
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--repo":
        args.repo = argv[++index] || usage();
        break;
      case "--prefix":
        args.prefix = argv[++index] || usage();
        break;
      case "--id":
        args.id = argv[++index] || usage();
        break;
      case "--domain":
        args.domain = argv[++index] || usage();
        break;
      case "--name":
        args.name = argv[++index] || usage();
        break;
      case "--agents":
        args.agents = argv[++index] || usage();
        break;
      case "--claude":
        args.claude = argv[++index] || usage();
        break;
      case "--architecture-module":
        args.architectureModule = argv[++index] || usage();
        break;
      case "--workstream-dir":
        args.workstreamDir = argv[++index] || usage();
        break;
      case "--lsp-profile":
        args.lspProfile = argv[++index] || usage();
        break;
      case "--verification-hint":
        args.verificationHints.push(argv[++index] || usage());
        break;
      case "--create-prefix":
        args.createPrefix = true;
        break;
      case "--create-architecture-module":
        args.createArchitectureModule = true;
        break;
      case "--create-workstream":
        args.createWorkstream = true;
        break;
      case "--no-sync-contracts":
        args.syncContracts = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--format": {
        const format = argv[++index] as Format;
        if (!["text", "json"].includes(format)) usage();
        args.format = format;
        break;
      }
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`capability-config: unknown argument: ${arg}`);
        usage();
    }
  }

  if (args.command !== "add" || !args.prefix) usage();
  return args;
}

function repoRoot(input: string): string {
  const cwd = resolve(input);
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf-8",
  });
  if (result.status === 0 && result.stdout.trim()) return resolve(result.stdout.trim());
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

function defaultParts(prefix: string) {
  const parts = prefix.split("/");
  const domain =
    parts.length >= 2 ? safeToken(`${parts[0]}-${parts[1]}`, safeToken(prefix)) : safeToken(prefix);
  const name = parts.length > 2 ? safeToken(parts[parts.length - 1]) : safeToken(parts[parts.length - 1] || domain);
  const id = parts.length > 2 ? `${domain}-${name}` : domain;
  return { id, domain, name };
}

function buildCapability(args: Args, repo: string): Capability {
  const prefix = normalizeRepoPath(args.prefix, repo);
  const defaults = defaultParts(prefix);
  const domain = safeToken(args.domain || defaults.domain);
  const name = safeToken(args.name || defaults.name);
  const id = safeToken(args.id || defaults.id);

  return {
    id,
    domain,
    name,
    prefixes: [prefix],
    contract_files: {
      agents: normalizeRepoPath(args.agents || `${prefix}/AGENTS.md`, repo),
      claude: normalizeRepoPath(args.claude || `${prefix}/CLAUDE.md`, repo),
    },
    architecture_module: normalizeRepoPath(
      args.architectureModule || `docs/architecture/modules/${domain}/${name}.md`,
      repo
    ),
    workstream_dir: normalizeRepoPath(args.workstreamDir || `tasks/workstreams/${domain}/${name}`, repo),
    lsp_profile: args.lspProfile,
    verification_hints:
      args.verificationHints.length > 0 ? args.verificationHints : ["record local commands here before implementation"],
  };
}

function readRegistry(repo: string): Registry {
  if (!existsSync(resolve(repo, REGISTRY_PATH))) {
    // This explicit add command is the sole creation path for a missing registry.
    return { version: 1, capabilities: [] };
  }
  return readCapabilityRegistry(repo);
}

function writeRegistry(repo: string, registry: Registry): void {
  const registryPath = resolve(repo, REGISTRY_PATH);
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

function upsertCapability(registry: Registry, capability: Capability): { status: "added" | "existing"; capability: Capability } {
  const prefix = capability.prefixes[0];
  const existingById = registry.capabilities.find((entry) => entry.id === capability.id);
  const existingByPrefix = registry.capabilities.find((entry) => (entry.prefixes || []).includes(prefix));

  if (existingById && existingById !== existingByPrefix) {
    throw new Error(`capability id already exists with different prefix: ${capability.id}`);
  }
  if (existingByPrefix && existingByPrefix.id !== capability.id) {
    throw new Error(`capability prefix already belongs to ${existingByPrefix.id}: ${prefix}`);
  }
  if (existingById) return { status: "existing", capability: existingById };

  registry.capabilities.push(capability);
  return { status: "added", capability };
}

function runChecked(repo: string, command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error([`${command} ${args.join(" ")} failed`, result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function helperPath(fileName: string): string {
  return resolve(HELPER_DIR, fileName);
}

function validateRegistry(repo: string): void {
  runChecked(repo, process.execPath, [helperPath("capability-resolver.ts"), "validate", "--repo", repo, "--format", "text"]);
}

function syncContracts(repo: string, capability: Capability): void {
  const event = {
    ts: new Date().toISOString(),
    file_path: capability.prefixes[0],
    severity: "medium",
    functional_block: capability.prefixes[0],
    capability_id: capability.id,
    matched_prefix: capability.prefixes[0],
    architecture_domain: capability.domain,
    architecture_capability: capability.name,
    architecture_module: capability.architecture_module,
    workstream_dir: capability.workstream_dir,
    contract_agents: capability.contract_files.agents,
    contract_claude: capability.contract_files.claude,
    lsp_profile: capability.lsp_profile,
    change_type: "capability-config",
    request_file: "none",
    spawn_recommended: false,
    contract_sync_required: true,
  };

  runChecked(repo, "bash", [helperPath("context-contract-sync.sh"), "sync-event", "--json", JSON.stringify(event)]);
}

function createArchitectureModule(repo: string, capability: Capability): void {
  const path = resolve(repo, capability.architecture_module);
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      `# Architecture Module: ${capability.domain}/${capability.name}`,
      "",
      `> **Capability ID**: \`${capability.id}\``,
      `> **Source**: \`${REGISTRY_PATH}\``,
      "",
      "## Responsibility",
      "",
      `Record stable boundaries, entrypoints, runtime paths, dependency rules, and verification hints for \`${capability.id}\`.`,
      "",
      "## Entrypoints",
      "",
      `- \`${capability.prefixes[0]}\``,
      "",
    ].join("\n")
  );
}

function createWorkstream(repo: string, capability: Capability): void {
  runChecked(repo, "bash", [helperPath("workstream-sync.sh"), "ensure", "--block", capability.prefixes[0]]);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repo = repoRoot(args.repo);
  const requestedCapability = buildCapability(args, repo);
  const prefixPath = resolve(repo, requestedCapability.prefixes[0]);
  const registry = readRegistry(repo);
  const actions: string[] = [];

  if (!existsSync(prefixPath)) {
    if (!args.createPrefix) {
      throw new Error(`capability prefix does not exist: ${requestedCapability.prefixes[0]} (use --create-prefix to create it)`);
    }
    actions.push(`create-prefix:${requestedCapability.prefixes[0]}`);
    if (!args.dryRun) mkdirSync(prefixPath, { recursive: true });
  }

  const { status, capability } = upsertCapability(registry, requestedCapability);
  actions.push(`${status}:${capability.id}`);

  if (args.syncContracts) actions.push(`sync-contracts:${capability.contract_files.agents},${capability.contract_files.claude}`);
  if (args.createArchitectureModule) actions.push(`create-architecture-module:${capability.architecture_module}`);
  if (args.createWorkstream) actions.push(`create-workstream:${capability.workstream_dir}`);
  actions.push("validate:capability-registry");

  if (!args.dryRun) {
    if (status === "added") writeRegistry(repo, registry);
    if (args.syncContracts) syncContracts(repo, capability);
    if (args.createArchitectureModule) createArchitectureModule(repo, capability);
    if (args.createWorkstream) createWorkstream(repo, capability);
    validateRegistry(repo);
  }

  if (args.format === "json") {
    console.log(JSON.stringify({ repo, status, capability, actions, dry_run: args.dryRun }, null, 2));
    return;
  }

  console.log(`[CapabilityConfig] ${status === "added" ? "Added" : "Found existing"} ${capability.id} -> ${capability.prefixes[0]}`);
  for (const action of actions) console.log(`[CapabilityConfig] ${args.dryRun ? "Would " : ""}${action}`);
}

try {
  main();
} catch (error) {
  console.error(`capability-config: ${(error as Error).message}`);
  process.exit(1);
}

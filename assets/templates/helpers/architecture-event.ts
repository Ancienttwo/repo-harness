#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

type Args = {
  command: string;
  options: Record<string, string>;
  flags: Set<string>;
};

function usage(): never {
  console.error(
    [
      "Usage:",
      "  scripts/architecture-event.ts json-get --key <key> [--json <json>]",
      "  scripts/architecture-event.ts safe-token --value <value>",
      "  scripts/architecture-event.ts derive-scope --block <functional-block> [--format lines|json]",
      "  scripts/architecture-event.ts repo-path --repo <repo> --path <path>",
      "  scripts/architecture-event.ts event-json --ts <ts> --file-path <path> ... [--pretty]",
      "  scripts/architecture-event.ts sync-context-map --context-map <path> --block <path> ...",
      "  scripts/architecture-event.ts sync-contract-files --functional-block <path> --contract-agents <path> --contract-claude <path> ...",
    ].join("\n")
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] || "",
    options: {},
    flags: new Set(),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage();
    if (!arg.startsWith("--")) {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
    if (key === "pretty") {
      args.flags.add(key);
      continue;
    }

    const value = argv[++index];
    if (value === undefined) {
      console.error(`Missing value for ${arg}`);
      usage();
    }
    args.options[key] = value;
  }

  if (
    ![
      "json-get",
      "safe-token",
      "derive-scope",
      "repo-path",
      "event-json",
      "sync-context-map",
      "sync-contract-files",
    ].includes(args.command)
  ) {
    usage();
  }

  return args;
}

function requireOption(args: Args, key: string): string {
  const value = args.options[key];
  if (value === undefined || value === "") usage();
  return value;
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function print(value: string): never {
  process.stdout.write(value);
  process.exit(0);
}

function fail(message?: string): never {
  if (message) console.error(message);
  process.exit(1);
}

function safeToken(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-");
  return token || "root";
}

function jsonGet(raw: string, key: string): string {
  if (!raw) fail();
  try {
    const value = JSON.parse(raw)[key];
    if (value === undefined || value === null) fail();
    const output = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (output.length === 0) fail();
    return output;
  } catch {
    fail();
  }
}

function normalizeRepoPath(value: string, repoInput: string): string {
  let next = value.trim().replace(/^file:\/\//, "").replaceAll("\\", "/");
  const repo = resolve(repoInput).replaceAll("\\", "/");

  if (next.startsWith(`${repo}/`)) {
    next = next.slice(repo.length + 1);
  } else if (next.startsWith("/")) {
    throw new Error(`absolute path is outside repo: ${value}`);
  }

  next = next.replace(/^\.\//, "");
  if (
    next === "" ||
    next === "." ||
    next === ".." ||
    next.startsWith("../") ||
    next.includes("/../") ||
    next.includes("\n") ||
    next.includes("\r")
  ) {
    throw new Error(`unsafe repo path: ${value}`);
  }
  return next;
}

function deriveScope(block: string) {
  const blockSlug = safeToken(block);
  const parts = block.split("/").filter(Boolean);
  let domainSlug = blockSlug;
  let capabilitySlug = "_domain";

  if (parts.length >= 2) {
    domainSlug = safeToken(`${parts[0]}-${parts[1]}`);
  }
  if (parts.length > 2) {
    capabilitySlug = safeToken(parts[parts.length - 1]);
  }

  return {
    architecture_domain: domainSlug,
    architecture_capability: capabilitySlug,
    architecture_module: `docs/architecture/modules/${domainSlug}/${capabilitySlug}.md`,
    workstream_dir: `tasks/workstreams/${domainSlug}/${capabilitySlug}`,
  };
}

function parseBoolean(value: string): boolean {
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new Error(`expected boolean value, got: ${value}`);
}

function eventJson(args: Args): string {
  const event = {
    ts: requireOption(args, "ts"),
    file_path: requireOption(args, "filePath"),
    severity: requireOption(args, "severity"),
    functional_block: requireOption(args, "functionalBlock"),
    capability_id: requireOption(args, "capabilityId"),
    matched_prefix: requireOption(args, "matchedPrefix"),
    architecture_domain: requireOption(args, "architectureDomain"),
    architecture_capability: requireOption(args, "architectureCapability"),
    architecture_module: requireOption(args, "architectureModule"),
    workstream_dir: requireOption(args, "workstreamDir"),
    contract_agents: args.options.contractAgents ?? "",
    contract_claude: args.options.contractClaude ?? "",
    change_type: requireOption(args, "changeType"),
    request_file: requireOption(args, "requestFile"),
    spawn_recommended: parseBoolean(requireOption(args, "spawnRecommended")),
    contract_sync_required: parseBoolean(requireOption(args, "contractSyncRequired")),
  };
  return JSON.stringify(event, null, args.flags.has("pretty") ? 2 : 0);
}

function defaultContextMap() {
  return {
    version: 1,
    profile: "stable-root-progressive-subdir",
    functional_block_selector: {
      script: "scripts/select-agent-context-blocks.sh",
      config_file: ".ai/context/agent-context-blocks.txt",
      env: "REPO_HARNESS_CONTEXT_BLOCKS",
      legacy_env: "PROJECT_INITIALIZER_CONTEXT_BLOCKS",
      rule: "compatibility selector; capability registry is the source of truth",
    },
    root_context_files: ["CLAUDE.md", "AGENTS.md"],
    discoverable_contexts: [],
  };
}

function syncContextMap(args: Args): void {
  const contextMap = requireOption(args, "contextMap");
  const block = requireOption(args, "block");
  const capabilityId = requireOption(args, "capabilityId");
  const contractAgents = requireOption(args, "contractAgents");
  const contractClaude = requireOption(args, "contractClaude");
  const domain = requireOption(args, "architectureDomain");
  const capability = requireOption(args, "architectureCapability");
  const lspProfile = args.options.lspProfile || "typescript-lsp";

  mkdirSync(dirname(contextMap), { recursive: true });
  if (!existsSync(contextMap)) {
    writeFileSync(contextMap, `${JSON.stringify(defaultContextMap(), null, 2)}\n`);
  }

  let data: any;
  try {
    data = JSON.parse(readFileSync(contextMap, "utf-8"));
  } catch {
    data = defaultContextMap();
  }

  if (!Array.isArray(data.discoverable_contexts)) data.discoverable_contexts = [];

  for (const [fileName, entryPath] of [
    ["CLAUDE.md", contractClaude],
    ["AGENTS.md", contractAgents],
  ]) {
    const targetAgent = fileName === "CLAUDE.md" ? "claude" : "codex";
    if (!data.discoverable_contexts.some((entry: any) => entry && entry.path === entryPath)) {
      data.discoverable_contexts.push({
        path: entryPath,
        priority: "high",
        char_budget: 1000,
        purpose: "capability-contract",
        capability_id: capabilityId,
        functional_block: block,
        matched_prefix: block,
        architecture_domain: domain,
        architecture_capability: capability,
        target_agent: targetAgent,
        lsp_profile: lspProfile,
        doc_scope: "capability-contract",
        verification_hint: "record local commands here before implementation",
      });
    }
  }

  writeFileSync(contextMap, `${JSON.stringify(data, null, 2)}\n`);
}

function metadataValue(file: string, label: string): string {
  if (!existsSync(file)) return "";
  const prefix = `> **${label}**:`;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return "";
}

function activeWorkstreams(workstreamDir: string): string {
  if (!existsSync(workstreamDir)) return "- (none yet)";
  const files = readdirMarkdown(workstreamDir).slice(0, 5);
  if (files.length === 0) return "- (none yet)";

  return files
    .flatMap((file) => {
      const status = metadataValue(file, "Status") || "unknown";
      const currentSlice = metadataValue(file, "Current Slice") || "unknown";
      const sourcePlan = metadataValue(file, "Source Plan") || "unknown";
      return [
        `- \`${file}\``,
        `  - status: ${status}`,
        `  - current_slice: ${currentSlice}`,
        `  - source_plan: ${sourcePlan}`,
      ];
    })
    .join("\n");
}

function readdirMarkdown(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `${dir.replace(/\/+$/, "")}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

function findLatestMatchingFile(dir: string, token: string, extension: string): string {
  const files = collectFiles(dir)
    .filter((file) => file.includes(token) && file.endsWith(extension))
    .sort();
  return files.at(-1) || "(none yet)";
}

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir.replace(/\/+$/, "")}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...collectFiles(path));
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  } catch {
    return [];
  }
  return files;
}

function renderContractBlock(args: Args): string {
  const functionalBlock = requireOption(args, "functionalBlock");
  const capabilityId = requireOption(args, "capabilityId");
  const matchedPrefix = requireOption(args, "matchedPrefix");
  const architectureDomain = requireOption(args, "architectureDomain");
  const architectureCapability = requireOption(args, "architectureCapability");
  const architectureModule = requireOption(args, "architectureModule");
  const workstreamDir = requireOption(args, "workstreamDir");
  const blockSlug = safeToken(functionalBlock);
  const latestSnapshot = findLatestMatchingFile("docs/architecture/snapshots", blockSlug, ".md");
  const latestHumanDiagram = findLatestMatchingFile("docs/architecture/diagrams", blockSlug, ".html");
  const semanticDiagramSource = latestSnapshot === "(none yet)" ? architectureModule : latestSnapshot;
  const eventTs = args.options.eventTs || "unknown";
  const filePath = args.options.filePath || "unknown";
  const severity = args.options.severity || "unknown";
  const changeType = args.options.changeType || "unknown";
  const lspProfile = args.options.lspProfile || "typescript-lsp";
  const requestFile = args.options.requestFile || "unknown";

  return [
    "<!-- BEGIN ARCHITECTURE CONTRACT -->",
    "## Architecture Contract",
    "",
    `- Functional block: \`${functionalBlock}\``,
    `- Capability ID: \`${capabilityId}\``,
    `- Matched prefix: \`${matchedPrefix}\``,
    `- Architecture domain: \`${architectureDomain}\``,
    `- Architecture capability: \`${architectureCapability}\``,
    `- Architecture module: \`${architectureModule}\``,
    `- Last architecture event: ${eventTs}`,
    `- Last changed path: \`${filePath}\``,
    `- Severity: ${severity}`,
    `- Change type: ${changeType}`,
    "- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.",
    `- Entrypoints: \`${functionalBlock}\``,
    "- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.",
    "- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.",
    `- Runtime path: \`${functionalBlock}\``,
    `- LSP/tooling profile: \`${lspProfile}\``,
    "- Verification: Use root required checks plus local commands recorded in this capability contract.",
    `- Latest snapshot: \`${latestSnapshot}\``,
    `- Semantic diagram source: \`${semanticDiagramSource}\``,
    `- Latest human diagram: \`${latestHumanDiagram}\``,
    `- Pending architecture request: \`${requestFile}\``,
    "",
    "## Active Workstreams",
    "",
    activeWorkstreams(workstreamDir),
    "",
    "## Current Session Projection",
    "",
    `- Durable progress lives under \`${workstreamDir}\`.`,
    "- `tasks/current.md` is the tracked derived status snapshot; it is not a live lock or task source.",
    "- `tasks/todo.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.",
    "<!-- END ARCHITECTURE CONTRACT -->",
    "",
  ].join("\n");
}

function replaceContractBlock(source: string, block: string): string {
  // Refuse to rewrite when markers are unbalanced: a lazy regex over a file
  // with a missing END or duplicate BEGIN would silently duplicate the block
  // or pair the wrong markers. Mirrors the guard in context-contract-sync.sh.
  const begins = source.match(/^<!-- BEGIN ARCHITECTURE CONTRACT -->[ \t]*$/gm)?.length ?? 0;
  const ends = source.match(/^<!-- END ARCHITECTURE CONTRACT -->[ \t]*$/gm)?.length ?? 0;
  const balanced =
    (begins === 0 && ends === 0) ||
    (begins === 1 &&
      ends === 1 &&
      source.search(/^<!-- BEGIN ARCHITECTURE CONTRACT -->[ \t]*$/m) <
        source.search(/^<!-- END ARCHITECTURE CONTRACT -->[ \t]*$/m));
  if (!balanced) {
    throw new Error(
      `unbalanced ARCHITECTURE CONTRACT markers (begin=${begins} end=${ends}); refusing to rewrite. Repair the markers manually, then re-run sync.`,
    );
  }

  const pattern = /^<!-- BEGIN ARCHITECTURE CONTRACT -->[ \t]*\n[\s\S]*?^<!-- END ARCHITECTURE CONTRACT -->[ \t]*\n?/m;
  if (pattern.test(source)) return source.replace(pattern, () => block);
  if (!source) return block;
  return `${source.endsWith("\n") ? source : `${source}\n`}\n${block}`;
}

function defaultContractContext(): string {
  return [
    "# Functional Block Agent Context",
    "",
    "Keep this file focused on the local contract for this primary functional block.",
    "",
  ].join("\n");
}

function syncContractFiles(args: Args): void {
  const contractAgents = requireOption(args, "contractAgents");
  const contractClaude = requireOption(args, "contractClaude");
  const block = renderContractBlock(args);
  const basePath = existsSync(contractAgents) ? contractAgents : existsSync(contractClaude) ? contractClaude : "";
  const source = basePath ? readFileSync(basePath, "utf-8") : defaultContractContext();
  const updated = replaceContractBlock(source, block);

  mkdirSync(dirname(contractAgents), { recursive: true });
  mkdirSync(dirname(contractClaude), { recursive: true });
  writeFileSync(contractAgents, updated);
  writeFileSync(contractClaude, updated);
}

const args = parseArgs(process.argv.slice(2));

try {
  switch (args.command) {
    case "json-get":
      print(jsonGet(args.options.json ?? readStdin(), requireOption(args, "key")));
      break;
    case "safe-token":
      print(safeToken(requireOption(args, "value")));
      break;
    case "derive-scope": {
      const scope = deriveScope(requireOption(args, "block"));
      if ((args.options.format || "lines") === "json") print(JSON.stringify(scope));
      print(
        [
          scope.architecture_domain,
          scope.architecture_capability,
          scope.architecture_module,
          scope.workstream_dir,
        ].join("\n")
      );
      break;
    }
    case "repo-path":
      print(normalizeRepoPath(requireOption(args, "path"), requireOption(args, "repo")));
      break;
    case "event-json":
      print(eventJson(args));
      break;
    case "sync-context-map":
      syncContextMap(args);
      process.exit(0);
    case "sync-contract-files":
      syncContractFiles(args);
      process.exit(0);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

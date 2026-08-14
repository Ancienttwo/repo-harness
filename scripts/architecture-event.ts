#!/usr/bin/env bun
import { createHash, randomUUID } from "crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "fs";
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
      "  scripts/architecture-event.ts upsert-request --request-file <path> --event-json <json>",
      "  scripts/architecture-event.ts record-event --request-file <path> --event-file <path> --index-file <path> --requests-dir <dir> --event-json <json>",
      "  scripts/architecture-event.ts upsert-from-request --source-request <path> --request-file <path>",
      "  scripts/architecture-event.ts reindex-requests --index-file <path> --requests-dir <dir> [--check]",
      "  scripts/architecture-event.ts validate-requests --requests-dir <dir>",
      "  scripts/architecture-event.ts request-info --request-file <path>",
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
    if (key === "pretty" || key === "check") {
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
      "upsert-request",
      "record-event",
      "upsert-from-request",
      "reindex-requests",
      "validate-requests",
      "request-info",
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

function writeAllSync(fd: number, value: string): void {
  const buffer = Buffer.from(value);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const remaining = buffer.byteLength - offset;
    const written = writeSync(fd, buffer, offset, remaining);
    if (!Number.isInteger(written) || written <= 0 || written > remaining) {
      throw new Error(`invalid synchronous write progress ${written} at byte ${offset}`);
    }
    offset += written;
  }
}

function print(value: string): never {
  writeAllSync(1, value);
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

type ArchitectureEvent = {
  event_key?: string;
  ts?: string;
  file_path?: string;
  severity?: string;
  functional_block?: string;
  capability_id?: string;
  matched_prefix?: string;
  architecture_domain?: string;
  architecture_capability?: string;
  architecture_module?: string;
  workstream_dir?: string;
  contract_agents?: string;
  contract_claude?: string;
  change_type?: string;
  request_file?: string;
  spawn_recommended?: boolean;
  contract_sync_required?: boolean;
};

function stripCode(value: string): string {
  return value.trim().replace(/^`/, "").replace(/`$/, "");
}

function readMetadata(file: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (!existsSync(file)) return metadata;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^> \*\*(.+?)\*\*:\s*(.*)$/);
    if (!match) continue;
    metadata[match[1]] = stripCode(match[2]);
  }
  return metadata;
}

const EVENT_STRING_FIELDS = [
  "ts",
  "file_path",
  "severity",
  "functional_block",
  "capability_id",
  "matched_prefix",
  "architecture_domain",
  "architecture_capability",
  "architecture_module",
  "workstream_dir",
  "contract_agents",
  "contract_claude",
  "change_type",
  "request_file",
] as const;

function validateEvent(value: unknown, requestFile: string, requireKey = false): ArchitectureEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("architecture event must be a JSON object");
  }
  const event = value as Record<string, unknown>;
  for (const field of EVENT_STRING_FIELDS) {
    if (typeof event[field] !== "string") throw new Error(`architecture event field ${field} must be a string`);
  }
  for (const field of ["ts", "file_path", "severity", "functional_block", "capability_id", "matched_prefix", "architecture_domain", "architecture_capability", "architecture_module", "workstream_dir", "change_type"] as const) {
    if (!(event[field] as string).trim()) throw new Error(`architecture event field ${field} must not be empty`);
  }
  if (!["low", "medium", "high", "critical"].includes(event.severity as string)) {
    throw new Error(`unsupported architecture event severity: ${event.severity}`);
  }
  for (const field of ["spawn_recommended", "contract_sync_required"] as const) {
    if (typeof event[field] !== "boolean") throw new Error(`architecture event field ${field} must be a boolean`);
  }
  const normalizedPath = normalizeRepoPath(event.file_path as string, process.cwd());
  if (normalizedPath !== event.file_path) throw new Error(`architecture event file_path must be repo-relative: ${event.file_path}`);
  if (event.request_file !== requestFile) throw new Error(`architecture event request_file does not match ${requestFile}`);

  const normalized = event as ArchitectureEvent;
  const expectedKey = semanticEventKey({ ...normalized, event_key: undefined });
  if (requireKey && event.event_key !== expectedKey) throw new Error("architecture event_key does not match canonical fields");
  if (event.event_key !== undefined && event.event_key !== expectedKey) throw new Error("architecture event_key does not match canonical fields");
  return { ...normalized, event_key: expectedKey };
}

function extractEventFields(file: string, enforceRequestFile = true, allowLegacyKey = false): ArchitectureEvent {
  if (!existsSync(file)) return {};
  const source = readFileSync(file, "utf-8");
  const match = source.match(/## Event Fields\s*```json\s*([\s\S]*?)\s*```/);
  if (match) {
    const parsed = JSON.parse(match[1]) as ArchitectureEvent;
    return validateEvent(parsed, enforceRequestFile ? file : String(parsed.request_file || ""), enforceRequestFile && !allowLegacyKey);
  }
  throw new Error(`architecture request is missing canonical Event Fields: ${file}`);
}

function severityRank(severity: string): number {
  switch (severity.toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function maxSeverity(values: string[]): string {
  return values.sort((a, b) => severityRank(b) - severityRank(a))[0] || "unknown";
}

function requestStatus(file: string): string {
  return readMetadata(file).Status || "";
}

function isPendingRequest(file: string): boolean {
  return requestStatus(file).toLowerCase() === "pending";
}

function requestEventsFromSource(file: string): ArchitectureEvent[] {
  if (!existsSync(file)) return [];
  const source = readFileSync(file, "utf-8");
  const recordsMatch = source.match(/## Event Records\s*```json\s*([\s\S]*?)\s*```/);
  if (recordsMatch) {
    const parsed = JSON.parse(recordsMatch[1]);
    if (!Array.isArray(parsed)) throw new Error(`architecture Event Records must be an array: ${file}`);
    const records = dedupeEvents(parsed.map((entry) => validateEvent(entry, file, true)));
    const latest = extractEventFields(file);
    const canonicalLatest = records.find((entry) => entry.event_key === latest.event_key);
    if (!canonicalLatest || JSON.stringify(canonicalLatest) !== JSON.stringify(latest)) {
      throw new Error(`architecture Event Fields do not match canonical Event Records: ${file}`);
    }
    validateCardMetadata(file, records, latest);
    return records;
  }
  // Explicit one-shot migration for the exact stable card shape emitted before
  // Event Records became canonical. Modern malformed cards still fail closed.
  const rawLegacyFields = source.match(/## Event Fields\s*```json\s*([\s\S]*?)\s*```/);
  if (!rawLegacyFields) throw new Error(`architecture request is missing canonical Event Fields: ${file}`);
  const legacyShape = JSON.parse(rawLegacyFields[1]);
  if (Object.prototype.hasOwnProperty.call(legacyShape, "event_key")) {
    throw new Error(`modern architecture request is missing Event Records: ${file}`);
  }
  const latest = extractEventFields(file, true, true);
  validateCardMetadata(file, [latest], latest);
  return [latest];
}

function validateCardMetadata(file: string, events: ArchitectureEvent[], latest: ArchitectureEvent): void {
  const metadata = readMetadata(file);
  if (!metadata.Status) throw new Error(`architecture request is missing Status metadata: ${file}`);
  const expected: Record<string, string> = {
    Severity: maxSeverity(events.map((entry) => entry.severity || "unknown")),
    "Change Type": latest.change_type || "",
    File: latest.file_path || "",
    "Functional Block": latest.functional_block || "",
    "Capability ID": latest.capability_id || "",
    "Matched Prefix": latest.matched_prefix || "",
    "Architecture Domain": latest.architecture_domain || "",
    "Architecture Capability": latest.architecture_capability || "",
    "Architecture Module": latest.architecture_module || "",
    "Workstream Directory": latest.workstream_dir || "",
    Updated: latest.ts || "",
    "Contract Files": `${latest.contract_agents || "none"}\`, \`${latest.contract_claude || "none"}`,
    "Contract Sync Required": String(Boolean(latest.contract_sync_required)),
    "Spawn Recommended": String(events.some((entry) => Boolean(entry.spawn_recommended))),
    "Open Edits": String(events.length),
  };
  for (const [label, value] of Object.entries(expected)) {
    if (metadata[label] !== value) throw new Error(`architecture request metadata ${label} does not match canonical records: ${file}`);
  }
  const earliest = events.map((entry) => entry.ts || "").filter(Boolean).sort()[0] || "";
  if (!metadata.Detected || metadata.Detected > earliest) {
    throw new Error(`architecture request metadata Detected is not a valid first observation: ${file}`);
  }
}

function validateLegacyCard(file: string, events: ArchitectureEvent[]): void {
  if (events.length === 0) throw new Error(`legacy architecture card has no reconstructable audit events: ${file}`);
  const source = readFileSync(file, "utf8");
  const fieldsMatch = source.match(/## Event Fields\s*```json\s*([\s\S]*?)\s*```/);
  if (!fieldsMatch) throw new Error(`legacy architecture card is missing Event Fields: ${file}`);
  const raw = JSON.parse(fieldsMatch[1]);
  if (Object.prototype.hasOwnProperty.call(raw, "event_key")) {
    throw new Error(`modern architecture request is missing Event Records: ${file}`);
  }
  const latest = dedupeEvents(events)[0];
  const expectedLegacy = { ...latest, severity: maxSeverity(events.map((entry) => entry.severity || "unknown")), event_key: undefined };
  const normalizedLegacy = validateEvent(raw, file, false);
  for (const field of EVENT_STRING_FIELDS) {
    if (normalizedLegacy[field] !== expectedLegacy[field]) {
      throw new Error(`legacy architecture Event Fields ${field} do not match the audit log: ${file}`);
    }
  }
  if (normalizedLegacy.severity !== expectedLegacy.severity) throw new Error(`legacy architecture severity does not match the audit log: ${file}`);
  if (normalizedLegacy.spawn_recommended !== expectedLegacy.spawn_recommended
    || normalizedLegacy.contract_sync_required !== expectedLegacy.contract_sync_required) {
    throw new Error(`legacy architecture booleans do not match the audit log: ${file}`);
  }
  validateCardMetadata(file, events, expectedLegacy);
}

function markdownCodeCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("`", "\\`");
}

function atomicWriteFile(file: string, value: string): void {
  assertSafeWriteTarget(file);
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeAllSync(fd, value);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function assertSafeWriteTarget(file: string): void {
  const repo = realpathSync(process.cwd());
  const absolute = resolve(file);
  const relativeParts = absolute.slice(repo.length + 1).split("/").filter(Boolean);
  let cursor = repo;
  for (const part of relativeParts.slice(0, -1)) {
    cursor = `${cursor}/${part}`;
    if (!existsSync(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`write target parent must not be a symlink: ${file}`);
  }
  let existingAncestor = dirname(resolve(file));
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error(`write target has no existing ancestor: ${file}`);
    existingAncestor = parent;
  }
  const resolvedAncestor = realpathSync(existingAncestor);
  if (resolvedAncestor !== repo && !resolvedAncestor.startsWith(`${repo}/`)) {
    throw new Error(`write target ancestor resolves outside repository: ${file}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error(`write target must not be a symlink: ${file}`);
  const parent = realpathSync(dirname(resolve(file)));
  if (parent !== repo && !parent.startsWith(`${repo}/`)) throw new Error(`write target resolves outside repository: ${file}`);
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withQueueLock<T>(requestsDir: string, operation: () => T): T {
  assertSafeWriteTarget(`${requestsDir}/.write-probe`);
  const lockDir = `${requestsDir}/.architecture-queue.lock`;
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      mkdirSync(lockDir);
      writeFileSync(`${lockDir}/owner.json`, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
      const holdMs = Number(process.env.REPO_HARNESS_ARCHITECTURE_HOLD_AFTER_LOCK_MS || "0");
      if (Number.isFinite(holdMs) && holdMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs);
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const owner = JSON.parse(readFileSync(`${lockDir}/owner.json`, "utf8"));
        if (!processIsAlive(Number(owner.pid))) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // A creator may be between mkdir and owner publication; retry briefly.
      }
      if (Date.now() >= deadline) throw new Error(`architecture queue lock unavailable: ${lockDir}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return operation();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function withEventLogLock<T>(eventFile: string, operation: () => T): T {
  const lockRoot = `${dirname(dirname(eventFile))}/.locks`;
  const lockDir = `${lockRoot}/evt-${eventFile.split("/").pop()}.lock`;
  assertSafeWriteTarget(`${lockRoot}/.write-probe`);
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const ageMs = Date.now() - statSync(lockDir).mtimeMs;
      if (ageMs >= 60_000) {
        try {
          rmdirSync(lockDir);
          continue;
        } catch {
          // An active owner still controls the lock.
        }
      }
      if (Date.now() >= deadline) throw new Error(`architecture event log lock unavailable: ${lockDir}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return operation();
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {
      // The lock may already have been reclaimed after an owner crash.
    }
  }
}

function dedupeEvents(events: ArchitectureEvent[]): ArchitectureEvent[] {
  const byFile = new Map<string, ArchitectureEvent>();
  for (const event of events) {
    const key = event.file_path || "(unknown)";
    const previous = byFile.get(key);
    if (!previous || String(previous.ts || "") <= String(event.ts || "")) {
      byFile.set(key, event);
    }
  }
  return Array.from(byFile.values()).sort((a, b) => {
    const byTs = String(b.ts || "").localeCompare(String(a.ts || ""));
    if (byTs !== 0) return byTs;
    return String(a.file_path || "").localeCompare(String(b.file_path || ""));
  });
}

function semanticEventKey(event: ArchitectureEvent): string {
  const semanticFields = {
    file_path: event.file_path,
    severity: event.severity,
    functional_block: event.functional_block,
    capability_id: event.capability_id,
    matched_prefix: event.matched_prefix,
    architecture_domain: event.architecture_domain,
    architecture_capability: event.architecture_capability,
    architecture_module: event.architecture_module,
    workstream_dir: event.workstream_dir,
    contract_agents: event.contract_agents,
    contract_claude: event.contract_claude,
    change_type: event.change_type,
    spawn_recommended: Boolean(event.spawn_recommended),
    contract_sync_required: Boolean(event.contract_sync_required),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(semanticFields)).digest("hex")}`;
}

function normalizeEvent(event: ArchitectureEvent, requestFile: string): ArchitectureEvent {
  const normalized: ArchitectureEvent = {
    ts: event.ts || new Date().toISOString(),
    file_path: event.file_path || "unknown",
    severity: event.severity || "medium",
    functional_block: event.functional_block || "root",
    capability_id: event.capability_id || "root",
    matched_prefix: event.matched_prefix || event.functional_block || "root",
    architecture_domain: event.architecture_domain || "root",
    architecture_capability: event.architecture_capability || "_root",
    architecture_module: event.architecture_module || "docs/architecture/index.md",
    workstream_dir: event.workstream_dir || "tasks/workstreams/root/_root",
    contract_agents: event.contract_agents || "",
    contract_claude: event.contract_claude || "",
    change_type: event.change_type || "unknown",
    request_file: requestFile,
    spawn_recommended: Boolean(event.spawn_recommended),
    contract_sync_required: Boolean(event.contract_sync_required),
  };
  return { ...normalized, event_key: event.event_key || semanticEventKey(normalized) };
}

function renderRequiredFollowUp(event: ArchitectureEvent): string {
  const functionalBlock = event.functional_block || "root";
  const requestFile = event.request_file || "docs/architecture/requests/unknown.md";
  return [
    "## Required Follow-up",
    "",
    "- Read root `AGENTS.md` / `CLAUDE.md`.",
    "- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.",
    "- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.",
    "- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.",
    "- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.",
    "- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.",
    `- If this starts or advances durable execution, run \`repo-harness run workstream-sync ensure --block "${functionalBlock}" --request "${requestFile}"\`.`,
    "- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.",
  ].join("\n");
}

function renderRequestCard(event: ArchitectureEvent, events: ArchitectureEvent[], existingMetadata: Record<string, string>): string {
  const firstDetected =
    existingMetadata.Detected ||
    events
      .map((entry) => entry.ts || "")
      .filter(Boolean)
      .sort()[0] ||
    event.ts ||
    "unknown";
  const latest = event;
  const severity = maxSeverity(events.map((entry) => entry.severity || "unknown"));
  const titleToken = event.capability_id || event.functional_block || "root";
  const touchedRows = events
    .map((entry) => {
      return `| ${entry.ts || "unknown"} | ${entry.severity || "unknown"} | ${entry.change_type || "unknown"} | \`${markdownCodeCell(entry.file_path || "unknown")}\` | \`${entry.event_key || "legacy"}\` |`;
    })
    .join("\n");

  const latestEvent = normalizeEvent(latest, event.request_file || "");

  return [
    `# Architecture Queue Card: ${titleToken}`,
    "",
    "> **Status**: Pending",
    `> **Detected**: ${firstDetected}`,
    `> **Updated**: ${latestEvent.ts}`,
    `> **Severity**: ${severity}`,
    `> **Change Type**: ${latestEvent.change_type}`,
    `> **File**: \`${latestEvent.file_path}\``,
    `> **Functional Block**: \`${event.functional_block}\``,
    `> **Capability ID**: \`${event.capability_id}\``,
    `> **Matched Prefix**: \`${event.matched_prefix}\``,
    `> **Architecture Domain**: \`${event.architecture_domain}\``,
    `> **Architecture Capability**: \`${event.architecture_capability}\``,
    `> **Architecture Module**: \`${event.architecture_module}\``,
    `> **Workstream Directory**: \`${event.workstream_dir}\``,
    `> **Contract Files**: \`${event.contract_agents || "none"}\`, \`${event.contract_claude || "none"}\``,
    `> **Contract Sync Required**: ${Boolean(event.contract_sync_required)}`,
    `> **Spawn Recommended**: ${events.some((entry) => Boolean(entry.spawn_recommended))}`,
    `> **Open Edits**: ${events.length}`,
    "",
    renderRequiredFollowUp(event),
    "",
    "## Touched Files",
    "",
    "| Last Event | Severity | Change Type | File | Event Key |",
    "| --- | --- | --- | --- | --- |",
    touchedRows || "| unknown | unknown | unknown | `unknown` | `legacy` |",
    "",
    "## Event Fields",
    "",
    "```json",
    JSON.stringify(latestEvent, null, 2),
    "```",
    "",
    "## Event Records",
    "",
    "```json",
    JSON.stringify(events, null, 2),
    "```",
    "",
  ].join("\n");
}

function samePendingFileEvent(
  previous: ArchitectureEvent,
  next: ArchitectureEvent,
): boolean {
  return previous.file_path === next.file_path
    && typeof previous.event_key === "string"
    && previous.event_key === next.event_key;
}

function upsertRequest(args: Args): "changed" | "unchanged" {
  const requestFile = requireOption(args, "requestFile");
  const rawEvent = args.options.eventJson ?? readStdin();
  const parsed = JSON.parse(rawEvent) as ArchitectureEvent;
  const event = validateEvent(normalizeEvent({ ...parsed, event_key: undefined }, requestFile), requestFile, true);
  const existingMetadata = readMetadata(requestFile);
  const migrationEvents = args.options.migrationEventsJson
    ? (JSON.parse(args.options.migrationEventsJson) as unknown[]).map((entry) => validateEvent(entry, requestFile, true))
    : null;
  const existingEvents = migrationEvents || requestEventsFromSource(requestFile);
  const isLegacyMigration = migrationEvents !== null;
  const previous = existingEvents.find((entry) => entry.file_path === event.file_path);
  if (!isLegacyMigration && isPendingRequest(requestFile) && previous && samePendingFileEvent(previous, event)) return "unchanged";
  const events = dedupeEvents([...existingEvents, event]);
  atomicWriteFile(requestFile, renderRequestCard(event, events, existingMetadata));
  return "changed";
}

function legacyEventsFromLog(eventFile: string, requestFile: string, excludeTransactionId = ""): ArchitectureEvent[] {
  if (!existsSync(eventFile)) return [];
  const events: ArchitectureEvent[] = [];
  for (const line of readFileSync(eventFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as ArchitectureEvent & { transaction_id?: string };
    if (excludeTransactionId && parsed.transaction_id === excludeTransactionId) continue;
    if (parsed.request_file !== requestFile) continue;
    events.push(validateEvent(parsed, requestFile, false));
  }
  return dedupeEvents(events);
}

function eventLogContainsTransaction(file: string, transactionId: string): boolean {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line);
    if (parsed?.transaction_id === transactionId) return true;
  }
  return false;
}

function recordEvent(args: Args): "changed" | "unchanged" {
  const requestFile = requireOption(args, "requestFile");
  const eventFile = requireOption(args, "eventFile");
  const indexFile = requireOption(args, "indexFile");
  const requestsDir = requireOption(args, "requestsDir");
  const parsed = JSON.parse(args.options.eventJson ?? readStdin()) as ArchitectureEvent;
  const event = validateEvent(normalizeEvent({ ...parsed, event_key: undefined }, requestFile), requestFile, true);

  return withQueueLock(requestsDir, () => {
    const transactionFile = `${requestsDir}/.architecture-queue-transaction.json`;
    for (const target of [requestFile, eventFile, indexFile, transactionFile]) assertSafeWriteTarget(target);
    let legacyPreflightEvents: ArchitectureEvent[] | null = null;
    if (existsSync(requestFile)) {
      const source = readFileSync(requestFile, "utf8");
      if (!/## Event Records\s*```json/.test(source)) {
        let recoveryTransactionId = "";
        if (existsSync(transactionFile)) {
          const recovery = JSON.parse(readFileSync(transactionFile, "utf8"));
          recoveryTransactionId = typeof recovery.transaction_id === "string" ? recovery.transaction_id : "";
        }
        legacyPreflightEvents = legacyEventsFromLog(eventFile, requestFile, recoveryTransactionId);
        validateLegacyCard(requestFile, legacyPreflightEvents);
      }
    }
    if (!existsSync(transactionFile) && existsSync(requestFile)) {
      const source = readFileSync(requestFile, "utf8");
      if (/## Event Records\s*```json/.test(source)) {
        const previous = requestEventsFromSource(requestFile).find((entry) => entry.file_path === event.file_path);
        if (isPendingRequest(requestFile) && previous && samePendingFileEvent(previous, event)) {
          reindexRequests({ command: "reindex-requests", options: { indexFile, requestsDir }, flags: new Set() });
          return "unchanged";
        }
      }
    }
    let transaction: { transaction_id: string; request_file: string; event: ArchitectureEvent };
    if (existsSync(transactionFile)) {
      transaction = JSON.parse(readFileSync(transactionFile, "utf8"));
      if (
        typeof transaction.transaction_id !== "string"
        || transaction.request_file !== requestFile
        || transaction.event?.event_key !== event.event_key
      ) {
        throw new Error(`unfinished architecture transaction does not match incoming event: ${transactionFile}`);
      }
      transaction.event = validateEvent(transaction.event, requestFile, true);
    } else {
      transaction = { transaction_id: randomUUID(), request_file: requestFile, event };
      atomicWriteFile(transactionFile, `${JSON.stringify(transaction, null, 2)}\n`);
    }
    const activeEvent = transaction.event;
    withEventLogLock(eventFile, () => {
      if (!eventLogContainsTransaction(eventFile, transaction.transaction_id)) {
        const currentLog = existsSync(eventFile) ? readFileSync(eventFile, "utf8") : "";
        const prefix = currentLog && !currentLog.endsWith("\n") ? `${currentLog}\n` : currentLog;
        atomicWriteFile(eventFile, `${prefix}${JSON.stringify({ ...activeEvent, transaction_id: transaction.transaction_id })}\n`);
      }
    });
    if (process.env.REPO_HARNESS_ARCHITECTURE_FAIL_AFTER_EVENT === "1") {
      throw new Error("injected architecture failure after event persistence");
    }
    const migrationEventsJson = legacyPreflightEvents
      ? JSON.stringify(dedupeEvents([...legacyPreflightEvents, activeEvent]))
      : undefined;
    const result = upsertRequest({
      ...args,
      options: {
        ...args.options,
        eventJson: JSON.stringify(activeEvent),
        ...(migrationEventsJson ? { migrationEventsJson } : {}),
      },
    });
    reindexRequests({
      command: "reindex-requests",
      options: { indexFile, requestsDir },
      flags: new Set(),
    });
    rmSync(transactionFile);
    return result;
  });
}

function upsertFromRequest(args: Args): void {
  const sourceRequest = requireOption(args, "sourceRequest");
  const requestFile = requireOption(args, "requestFile");
  const parsed = normalizeEvent({ ...extractEventFields(sourceRequest, false), event_key: undefined }, requestFile);
  parsed.request_file = requestFile;
  const existingMetadata = readMetadata(requestFile);
  const events = dedupeEvents([...requestEventsFromSource(requestFile), parsed]);
  atomicWriteFile(requestFile, renderRequestCard(parsed, events, existingMetadata));
}

function requestInfo(args: Args): string {
  const requestFile = requireOption(args, "requestFile");
  const metadata = readMetadata(requestFile);
  const event = extractEventFields(requestFile);
  return JSON.stringify({ metadata, event }, null, 2);
}

function pendingRequestFiles(requestsDir: string): string[] {
  const files = readdirMarkdown(requestsDir).filter((file) => !file.includes("/archive/"));
  for (const file of files) {
    const name = file.split("/").pop() || "";
    if (!/^20\d{6}-\d{6}-/.test(name)) requestEventsFromSource(file);
  }
  return files.filter((file) => isPendingRequest(file));
}

function validateRequests(args: Args): void {
  pendingRequestFiles(requireOption(args, "requestsDir"));
}

function renderPendingBlock(requestsDir: string): string {
  const files = pendingRequestFiles(requestsDir);
  if (files.length === 0) return "- (none)";
  return files
    .map((file) => {
      const metadata = readMetadata(file);
      const ts = metadata.Updated || metadata.Detected || "unknown";
      const severity = metadata.Severity || "unknown";
      const changedFile = metadata.File || "unknown";
      const name = file.split("/").pop() || file;
      const slug = name.replace(/\.md$/, "");
      return `- [ ] ${ts} [${severity}] \`${changedFile}\` -> [${slug}](requests/${name})`;
    })
    .sort()
    .join("\n");
}

function removeLoosePendingRequestLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^- \[ \] .*\]\(requests\/[^)]+\.md\)$/.test(line.trim()))
    .join("\n");
}

function replacePendingRequestsBlock(source: string, block: string): string {
  const begin = "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->";
  const end = "<!-- END ARCHITECTURE PENDING REQUESTS -->";
  const controlled = `${begin}\n${block}\n${end}`;
  const cleaned = removeLoosePendingRequestLines(source);
  const markerPattern = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (markerPattern.test(cleaned)) {
    return `${cleaned.replace(markerPattern, controlled).replace(/\s+$/, "")}\n`;
  }
  const headingPattern = /(^## Pending Requests\s*\n)([\s\S]*?)(?=^## |\s*$)/m;
  if (headingPattern.test(cleaned)) {
    return `${cleaned
      .replace(headingPattern, (_match, heading: string) => `${heading}\n${controlled}\n\n`)
      .replace(/\s+$/, "")}\n`;
  }
  return `${cleaned.replace(/\s+$/, "")}\n\n## Pending Requests\n\n${controlled}\n`;
}

function reindexRequests(args: Args): void {
  const indexFile = requireOption(args, "indexFile");
  const requestsDir = requireOption(args, "requestsDir");
  const current = existsSync(indexFile)
    ? readFileSync(indexFile, "utf-8")
    : [
        "# Architecture Index",
        "",
        "> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.",
        "",
        "## Pending Requests",
        "",
      ].join("\n");
  const next = replacePendingRequestsBlock(current, renderPendingBlock(requestsDir));
  if (args.flags.has("check")) {
    if (current !== next) {
      console.error("architecture-event: pending request index is stale");
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(indexFile), { recursive: true });
  if (current !== next) atomicWriteFile(indexFile, next);
}

function defaultContextMap() {
  return {
    version: 1,
    profile: "stable-root-progressive-subdir",
    functional_block_selector: {
      script: "repo-harness run select-agent-context-blocks",
      config_file: ".ai/context/agent-context-blocks.txt",
      env: "REPO_HARNESS_CONTEXT_BLOCKS",
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

function activePendingRequestFile(file: string): string {
  if (!file || file === "unknown") return "(none)";
  if (file.includes("/archive/")) return "(none)";
  if (!existsSync(file)) return "(none)";
  return isPendingRequest(file) ? file : "(none)";
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
  const semanticDiagramSource = latestSnapshot === "(none yet)" ? architectureModule : latestSnapshot;
  const eventTs = args.options.eventTs || "unknown";
  const filePath = args.options.filePath || "unknown";
  const severity = args.options.severity || "unknown";
  const changeType = args.options.changeType || "unknown";
  const lspProfile = args.options.lspProfile || "typescript-lsp";
  const requestFile = activePendingRequestFile(args.options.requestFile || "");

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
    "- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.",
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
    case "upsert-request":
      print(upsertRequest(args));
      break;
    case "record-event":
      print(recordEvent(args));
      break;
    case "upsert-from-request":
      upsertFromRequest(args);
      process.exit(0);
    case "reindex-requests":
      reindexRequests(args);
      process.exit(0);
    case "validate-requests":
      validateRequests(args);
      process.exit(0);
    case "request-info":
      print(requestInfo(args));
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

#!/usr/bin/env bun

import { createHash } from "crypto";
import { spawnSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "fs";
import { dirname, isAbsolute, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..");
export const DEFAULT_MANIFEST_PATH = "evals/bdd2/evaluation-manifest.json";

export type ExperimentId = "S" | "A";
export type PartitionId = "development" | "held_out";
export type ConditionId = "baseline" | "treatment";
export type FreezeState = "foundation" | "sealed";

interface PromptReference {
  prompt: string;
  sha256: string;
}

interface ExperimentDefinition {
  kind: "shape" | "audit";
  repetitions: number;
  held_out_task_count: number;
  conditions: Record<ConditionId, PromptReference>;
}

interface PartitionDefinition {
  tasks: string;
  tasks_sha256: string;
  truth: string;
  truth_sha256: string;
}

export interface AgentProfile {
  command: string;
  args: string[];
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  response_source: "stdout" | "file";
}

export interface EvaluationManifest {
  schema: "repo-harness-bdd2-evaluation.v1";
  freeze: {
    id: string;
    state: FreezeState;
    sealed_at: string | null;
  };
  output_root: string;
  experiments: Record<ExperimentId, ExperimentDefinition>;
  partitions: Record<PartitionId, PartitionDefinition>;
  adjudication: {
    rubric: string;
    rubric_sha256: string;
    score_schema: string;
    score_schema_sha256: string;
  };
  agents: Record<string, AgentProfile>;
}

export interface EvaluationTask {
  id: string;
  experiment: ExperimentId;
  title: string;
  agent_input: string;
}

interface TaskSet {
  schema: "repo-harness-bdd2-task-set.v1";
  partition: PartitionId;
  tasks: EvaluationTask[];
}

interface TruthIssue {
  id: string;
  severity: "P0" | "P1" | "P2" | "P3";
  taxonomy: string;
  summary: string;
}

interface TruthSet {
  schema: "repo-harness-bdd2-truth-set.v1";
  partition: PartitionId;
  audit_tasks: Record<string, { clean: boolean; issues: TruthIssue[] }>;
}

export interface ValidatedEvaluation {
  repoRoot: string;
  manifestPath: string;
  manifest: EvaluationManifest;
  tasks: Record<PartitionId, EvaluationTask[]>;
}

export interface PlanOptions {
  experiment: ExperimentId;
  partition: PartitionId;
  taskIds?: string[];
  conditions?: ConditionId[];
  repetitions?: number;
}

export interface RunCoordinate {
  packetId: string;
  experiment: ExperimentId;
  partition: PartitionId;
  taskId: string;
  condition: ConditionId;
  repetition: number;
  promptPath: string;
}

export interface RunOptions extends PlanOptions {
  agent: string;
  outputPath?: string;
  now?: Date;
}

export interface RunReport {
  schema: "repo-harness-bdd2-run.v1";
  freeze_id: string;
  source_commit: string;
  manifest_sha256: string;
  agent: string;
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  experiment: ExperimentId;
  partition: PartitionId;
  output_path: string;
  packets: Array<{ packet_id: string; task_id: string; status: "success" }>;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join("\n") !== expected.join("\n")) {
    fail(`${label} keys must be exactly [${expected.join(", ")}], got [${actual.join(", ")}]`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function authorityPath(repoRoot: string, relativePath: string, label: string): string {
  assertString(relativePath, label);
  if (isAbsolute(relativePath)) fail(`${label} must be repository-relative`);
  const resolved = resolve(repoRoot, relativePath);
  const rootPrefix = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(rootPrefix)) {
    fail(`${label} escapes repository root: ${relativePath}`);
  }
  if (!existsSync(resolved)) fail(`${label} does not exist: ${relativePath}`);
  if (lstatSync(resolved).isSymbolicLink()) fail(`${label} must not be a symbolic link: ${relativePath}`);
  const realRoot = realpathSync(repoRoot);
  const realResolved = realpathSync(resolved);
  const realRootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (realResolved !== realRoot && !realResolved.startsWith(realRootPrefix)) {
    fail(`${label} resolves outside repository root: ${relativePath}`);
  }
  return resolved;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyHash(repoRoot: string, relativePath: string, expected: string, label: string): string {
  if (!/^[a-f0-9]{64}$/.test(expected)) fail(`${label} sha256 is not frozen`);
  const path = authorityPath(repoRoot, relativePath, label);
  const actual = sha256File(path);
  if (actual !== expected) fail(`${label} sha256 drift: expected ${expected}, got ${actual}`);
  return path;
}

function validatePromptReference(
  repoRoot: string,
  value: unknown,
  label: string
): asserts value is PromptReference {
  assertRecord(value, label);
  assertExactKeys(value, ["prompt", "sha256"], label);
  assertString(value.prompt, `${label}.prompt`);
  assertString(value.sha256, `${label}.sha256`);
  verifyHash(repoRoot, value.prompt, value.sha256, label);
}

function validateTaskSet(raw: unknown, partition: PartitionId): TaskSet {
  assertRecord(raw, `${partition} task set`);
  assertExactKeys(raw, ["schema", "partition", "tasks"], `${partition} task set`);
  if (raw.schema !== "repo-harness-bdd2-task-set.v1") fail(`${partition} task schema mismatch`);
  if (raw.partition !== partition) fail(`${partition} task partition mismatch`);
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) fail(`${partition} tasks must be non-empty`);

  const ids = new Set<string>();
  const tasks = raw.tasks.map((candidate, index): EvaluationTask => {
    const label = `${partition}.tasks[${index}]`;
    assertRecord(candidate, label);
    assertExactKeys(candidate, ["id", "experiment", "title", "agent_input"], label);
    assertString(candidate.id, `${label}.id`);
    assertString(candidate.title, `${label}.title`);
    assertString(candidate.agent_input, `${label}.agent_input`);
    if (candidate.experiment !== "S" && candidate.experiment !== "A") {
      fail(`${label}.experiment must be S or A`);
    }
    if (ids.has(candidate.id)) fail(`Duplicate task id in ${partition}: ${candidate.id}`);
    ids.add(candidate.id);
    return candidate as unknown as EvaluationTask;
  });

  return { schema: "repo-harness-bdd2-task-set.v1", partition, tasks };
}

function validateTruthSet(raw: unknown, partition: PartitionId, tasks: EvaluationTask[]): void {
  assertRecord(raw, `${partition} truth set`);
  assertExactKeys(raw, ["schema", "partition", "audit_tasks"], `${partition} truth set`);
  if (raw.schema !== "repo-harness-bdd2-truth-set.v1") fail(`${partition} truth schema mismatch`);
  if (raw.partition !== partition) fail(`${partition} truth partition mismatch`);
  assertRecord(raw.audit_tasks, `${partition}.audit_tasks`);

  const auditTaskIds = new Set(tasks.filter((task) => task.experiment === "A").map((task) => task.id));
  const truthIds = new Set(Object.keys(raw.audit_tasks));
  if ([...auditTaskIds].sort().join("\n") !== [...truthIds].sort().join("\n")) {
    fail(`${partition} truth keys must match audit task ids exactly`);
  }

  for (const [taskId, candidate] of Object.entries(raw.audit_tasks)) {
    assertRecord(candidate, `${partition}.audit_tasks.${taskId}`);
    assertExactKeys(candidate, ["clean", "issues"], `${partition}.audit_tasks.${taskId}`);
    if (typeof candidate.clean !== "boolean" || !Array.isArray(candidate.issues)) {
      fail(`${partition}.audit_tasks.${taskId} has invalid clean/issues`);
    }
    if (candidate.clean !== (candidate.issues.length === 0)) {
      fail(`${partition}.audit_tasks.${taskId} clean flag disagrees with issues`);
    }
    for (const [index, issue] of candidate.issues.entries()) {
      assertRecord(issue, `${taskId}.issues[${index}]`);
      assertExactKeys(issue, ["id", "severity", "taxonomy", "summary"], `${taskId}.issues[${index}]`);
      assertString(issue.id, `${taskId}.issues[${index}].id`);
      assertString(issue.taxonomy, `${taskId}.issues[${index}].taxonomy`);
      assertString(issue.summary, `${taskId}.issues[${index}].summary`);
      if (!["P0", "P1", "P2", "P3"].includes(String(issue.severity))) {
        fail(`${taskId}.issues[${index}].severity is invalid`);
      }
    }
  }
}

function validateAgentProfiles(manifest: EvaluationManifest): void {
  for (const [agent, raw] of Object.entries(manifest.agents)) {
    assertRecord(raw, `agents.${agent}`);
    assertExactKeys(raw, ["command", "args", "model", "sampling", "response_source"], `agents.${agent}`);
    assertString(raw.command, `agents.${agent}.command`);
    assertString(raw.model, `agents.${agent}.model`);
    if (!Array.isArray(raw.args) || raw.args.some((entry) => typeof entry !== "string")) {
      fail(`agents.${agent}.args must be an array of strings`);
    }
    if (raw.response_source !== "stdout" && raw.response_source !== "file") {
      fail(`agents.${agent}.response_source must be stdout or file`);
    }
    assertRecord(raw.sampling, `agents.${agent}.sampling`);
    for (const [key, value] of Object.entries(raw.sampling)) {
      if (!["string", "number", "boolean"].includes(typeof value) && value !== null) {
        fail(`agents.${agent}.sampling.${key} must be a scalar or null`);
      }
    }
    const templates = (raw.args as string[]).join("\n");
    for (const required of ["{prompt_path}", "{model}"]) {
      if (!templates.includes(required)) fail(`agents.${agent}.args must apply ${required}`);
    }
    if (raw.response_source === "file" && !templates.includes("{response_path}")) {
      fail(`agents.${agent}.args must apply {response_path} for file responses`);
    }
    for (const key of Object.keys(raw.sampling)) {
      if (!templates.includes(`{sampling.${key}}`)) {
        fail(`agents.${agent}.args must apply {sampling.${key}}`);
      }
    }
    for (const placeholder of templates.matchAll(/\{([^}]+)\}/g)) {
      const name = placeholder[1];
      const knownSampling = name.startsWith("sampling.") && Object.hasOwn(raw.sampling, name.slice("sampling.".length));
      if (!["prompt_path", "response_path", "workspace", "model"].includes(name) && !knownSampling) {
        fail(`agents.${agent}.args contains unknown placeholder {${name}}`);
      }
    }
  }
}

export function validateEvaluation(
  repoRoot: string = REPO_ROOT,
  manifestRelativePath: string = DEFAULT_MANIFEST_PATH
): ValidatedEvaluation {
  const absoluteRoot = resolve(repoRoot);
  const manifestPath = authorityPath(absoluteRoot, manifestRelativePath, "manifest");
  const raw = readJson(manifestPath);
  assertRecord(raw, "manifest");
  assertExactKeys(raw, ["schema", "freeze", "output_root", "experiments", "partitions", "adjudication", "agents"], "manifest");
  if (raw.schema !== "repo-harness-bdd2-evaluation.v1") fail("Unsupported evaluation manifest schema");

  assertRecord(raw.freeze, "freeze");
  assertExactKeys(raw.freeze, ["id", "state", "sealed_at"], "freeze");
  assertString(raw.freeze.id, "freeze.id");
  if (raw.freeze.state !== "foundation" && raw.freeze.state !== "sealed") fail("freeze.state must be foundation or sealed");
  assertString(raw.output_root, "output_root");
  assertRecord(raw.experiments, "experiments");
  assertExactKeys(raw.experiments, ["S", "A"], "experiments");
  for (const experimentId of ["S", "A"] as const) {
    const experiment = raw.experiments[experimentId];
    assertRecord(experiment, `experiments.${experimentId}`);
    assertExactKeys(experiment, ["kind", "repetitions", "held_out_task_count", "conditions"], `experiments.${experimentId}`);
    if (experiment.kind !== (experimentId === "S" ? "shape" : "audit")) fail(`experiments.${experimentId}.kind mismatch`);
    if (!Number.isInteger(experiment.repetitions) || Number(experiment.repetitions) < 1) fail(`experiments.${experimentId}.repetitions must be positive`);
    if (!Number.isInteger(experiment.held_out_task_count) || Number(experiment.held_out_task_count) < 1) fail(`experiments.${experimentId}.held_out_task_count must be positive`);
    assertRecord(experiment.conditions, `experiments.${experimentId}.conditions`);
    assertExactKeys(experiment.conditions, ["baseline", "treatment"], `experiments.${experimentId}.conditions`);
    validatePromptReference(absoluteRoot, experiment.conditions.baseline, `experiments.${experimentId}.conditions.baseline`);
    validatePromptReference(absoluteRoot, experiment.conditions.treatment, `experiments.${experimentId}.conditions.treatment`);
  }

  assertRecord(raw.partitions, "partitions");
  assertExactKeys(raw.partitions, ["development", "held_out"], "partitions");
  const tasks = {} as Record<PartitionId, EvaluationTask[]>;
  for (const partitionId of ["development", "held_out"] as const) {
    const partition = raw.partitions[partitionId];
    assertRecord(partition, `partitions.${partitionId}`);
    assertExactKeys(partition, ["tasks", "tasks_sha256", "truth", "truth_sha256"], `partitions.${partitionId}`);
    assertString(partition.tasks, `partitions.${partitionId}.tasks`);
    assertString(partition.tasks_sha256, `partitions.${partitionId}.tasks_sha256`);
    assertString(partition.truth, `partitions.${partitionId}.truth`);
    assertString(partition.truth_sha256, `partitions.${partitionId}.truth_sha256`);
    const taskPath = verifyHash(absoluteRoot, partition.tasks, partition.tasks_sha256, `${partitionId} tasks`);
    const truthPath = verifyHash(absoluteRoot, partition.truth, partition.truth_sha256, `${partitionId} truth`);
    const taskSet = validateTaskSet(readJson(taskPath), partitionId);
    validateTruthSet(readJson(truthPath), partitionId, taskSet.tasks);
    tasks[partitionId] = taskSet.tasks;
  }

  const allIds = [...tasks.development, ...tasks.held_out].map((task) => task.id);
  if (new Set(allIds).size !== allIds.length) fail("Task ids must be unique across partitions");

  assertRecord(raw.adjudication, "adjudication");
  assertExactKeys(raw.adjudication, ["rubric", "rubric_sha256", "score_schema", "score_schema_sha256"], "adjudication");
  for (const key of ["rubric", "rubric_sha256", "score_schema", "score_schema_sha256"] as const) {
    assertString(raw.adjudication[key], `adjudication.${key}`);
  }
  const rubric = raw.adjudication.rubric as string;
  const rubricSha256 = raw.adjudication.rubric_sha256 as string;
  const scoreSchema = raw.adjudication.score_schema as string;
  const scoreSchemaSha256 = raw.adjudication.score_schema_sha256 as string;
  verifyHash(absoluteRoot, rubric, rubricSha256, "adjudication rubric");
  verifyHash(absoluteRoot, scoreSchema, scoreSchemaSha256, "adjudication score schema");

  assertRecord(raw.agents, "agents");
  const manifest = raw as unknown as EvaluationManifest;
  if (manifest.freeze.state === "foundation") {
    if (manifest.freeze.sealed_at !== null || Object.keys(manifest.agents).length !== 0) {
      fail("Foundation freeze cannot contain seal time or agents");
    }
  } else {
    assertString(manifest.freeze.sealed_at, "freeze.sealed_at");
    if (Object.keys(manifest.agents).length === 0) fail("Sealed freeze requires at least one agent profile");
    validateAgentProfiles(manifest);
    for (const experimentId of ["S", "A"] as const) {
      const actual = tasks.held_out.filter((task) => task.experiment === experimentId).length;
      const expected = manifest.experiments[experimentId].held_out_task_count;
      if (actual !== expected) fail(`Sealed experiment ${experimentId} requires exactly ${expected} held-out tasks, got ${actual}`);
    }
  }

  return { repoRoot: absoluteRoot, manifestPath, manifest, tasks };
}

function opaquePacketId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

export function buildRunPlan(evaluation: ValidatedEvaluation, options: PlanOptions): RunCoordinate[] {
  const experiment = evaluation.manifest.experiments[options.experiment];
  const candidates = evaluation.tasks[options.partition].filter((task) => task.experiment === options.experiment);
  const wanted = new Set(options.taskIds ?? []);
  const selected = wanted.size === 0 ? candidates : candidates.filter((task) => wanted.has(task.id));
  if (selected.length === 0) fail("No tasks selected");
  if (wanted.size > 0 && selected.length !== wanted.size) {
    const selectedIds = new Set(selected.map((task) => task.id));
    fail(`Unknown or mismatched task ids: ${[...wanted].filter((id) => !selectedIds.has(id)).join(", ")}`);
  }

  const conditions = options.conditions ?? (["baseline", "treatment"] as const);
  if (conditions.length === 0 || conditions.some((condition) => condition !== "baseline" && condition !== "treatment")) fail("conditions must contain baseline and/or treatment");
  if (new Set(conditions).size !== conditions.length) fail("conditions must not contain duplicates");
  const repetitions = options.repetitions ?? experiment.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > experiment.repetitions) {
    fail(`repetitions must be between 1 and frozen maximum ${experiment.repetitions}`);
  }

  const coordinates: RunCoordinate[] = [];
  for (const task of selected.sort((a, b) => a.id.localeCompare(b.id))) {
    for (const condition of conditions) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        coordinates.push({
          packetId: opaquePacketId([evaluation.manifest.freeze.id, options.experiment, options.partition, task.id, condition, String(repetition)]),
          experiment: options.experiment,
          partition: options.partition,
          taskId: task.id,
          condition,
          repetition,
          promptPath: experiment.conditions[condition].prompt,
        });
      }
    }
  }
  return coordinates;
}

export function buildAgentPacket(evaluation: ValidatedEvaluation, coordinate: RunCoordinate): string {
  const task = evaluation.tasks[coordinate.partition].find((candidate) => candidate.id === coordinate.taskId);
  if (!task) fail(`Task missing for coordinate: ${coordinate.taskId}`);
  const prompt = readFileSync(authorityPath(evaluation.repoRoot, coordinate.promptPath, "condition prompt"), "utf-8").trim();
  return `${prompt}\n\n## Task\n\nTask ID: ${task.id}\n\n${task.agent_input.trim()}\n`;
}

function expandArg(template: string, values: Record<string, string>): string {
  return template.replace(/\{(prompt_path|response_path|workspace|model|sampling\.[^}]+)\}/g, (_, key: string) => values[key]);
}

function ensureNewDirectory(path: string): void {
  if (existsSync(path)) fail(`Output path already exists: ${path}`);
  mkdirSync(path, { recursive: true });
}

function assertWritePath(repoRoot: string, targetPath: string): void {
  const realRoot = realpathSync(repoRoot);
  let ancestor = dirname(targetPath);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) fail(`Cannot resolve output ancestor: ${targetPath}`);
    ancestor = parent;
  }
  const realAncestor = realpathSync(ancestor);
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (realAncestor !== realRoot && !realAncestor.startsWith(rootPrefix)) {
    fail(`Output path resolves outside repository root: ${targetPath}`);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function cleanHeadCommit(repoRoot: string): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf-8" });
  if (head.status !== 0) fail(`Cannot resolve evaluation source commit: ${(head.stderr ?? "").trim()}`);
  const commit = (head.stdout ?? "").trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("Evaluation source commit is not a full Git commit id");
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf-8" });
  if (status.status !== 0) fail(`Cannot inspect evaluation source worktree: ${(status.stderr ?? "").trim()}`);
  if ((status.stdout ?? "").trim().length > 0) fail("Sealed evaluation requires a clean Git HEAD");
  return commit;
}

export function runEvaluation(evaluation: ValidatedEvaluation, options: RunOptions): RunReport {
  if (evaluation.manifest.freeze.state !== "sealed") fail("Evaluation manifest is foundation-only; seal commit, model, and agent profiles before execution");
  const profile = evaluation.manifest.agents[options.agent];
  if (!profile) fail(`Unknown frozen agent profile: ${options.agent}`);
  const sourceCommit = cleanHeadCommit(evaluation.repoRoot);
  const plan = buildRunPlan(evaluation, options);
  const outputPath = options.outputPath
    ? resolve(evaluation.repoRoot, options.outputPath)
    : resolve(evaluation.repoRoot, evaluation.manifest.output_root, evaluation.manifest.freeze.id, timestamp(options.now ?? new Date()));
  const rel = relative(evaluation.repoRoot, outputPath);
  if (rel.startsWith("..") || isAbsolute(rel)) fail("Output path must remain inside repository root");
  assertWritePath(evaluation.repoRoot, outputPath);
  ensureNewDirectory(outputPath);

  const report: RunReport = {
    schema: "repo-harness-bdd2-run.v1",
    freeze_id: evaluation.manifest.freeze.id,
    source_commit: sourceCommit,
    manifest_sha256: sha256File(evaluation.manifestPath),
    agent: options.agent,
    model: profile.model,
    sampling: profile.sampling,
    experiment: options.experiment,
    partition: options.partition,
    output_path: relative(evaluation.repoRoot, outputPath),
    packets: [],
  };

  for (const coordinate of plan) {
    const packetRoot = resolve(outputPath, "packets", coordinate.packetId);
    const promptPath = resolve(packetRoot, "agent-prompt.md");
    const responsePath = resolve(packetRoot, "response.md");
    const stderrPath = resolve(packetRoot, "stderr.txt");
    mkdirSync(packetRoot, { recursive: true });
    writeFileSync(promptPath, buildAgentPacket(evaluation, coordinate), "utf-8");

    const values = {
      prompt_path: promptPath,
      response_path: responsePath,
      workspace: evaluation.repoRoot,
      model: profile.model,
      ...Object.fromEntries(
        Object.entries(profile.sampling).map(([key, value]) => [`sampling.${key}`, String(value)])
      ),
    };
    const args = profile.args.map((arg) => expandArg(arg, values));
    writeJson(resolve(packetRoot, "command.json"), { command: profile.command, args, cwd: evaluation.repoRoot });
    const result = spawnSync(profile.command, args, { cwd: evaluation.repoRoot, encoding: "utf-8", env: process.env });
    writeFileSync(stderrPath, result.stderr ?? "", "utf-8");
    if (result.error) fail(`Agent command failed to start for ${coordinate.packetId}: ${result.error.message}`);
    if (result.status !== 0) fail(`Agent command failed for ${coordinate.packetId} with exit ${result.status}`);

    if (profile.response_source === "stdout") {
      writeFileSync(responsePath, result.stdout ?? "", "utf-8");
    } else if (!existsSync(responsePath)) {
      fail(`Agent response file missing for ${coordinate.packetId}`);
    }
    const response = readFileSync(responsePath, "utf-8");
    writeJson(resolve(outputPath, "blind", `${coordinate.packetId}.json`), {
      schema: "repo-harness-bdd2-blind-packet.v1",
      packet_id: coordinate.packetId,
      task_id: coordinate.taskId,
      experiment: coordinate.experiment,
      response,
    });
    writeJson(resolve(outputPath, "private", `${coordinate.packetId}.json`), {
      schema: "repo-harness-bdd2-private-coordinate.v1",
      packet_id: coordinate.packetId,
      task_id: coordinate.taskId,
      condition: coordinate.condition,
      repetition: coordinate.repetition,
      prompt_sha256: sha256File(authorityPath(evaluation.repoRoot, coordinate.promptPath, "condition prompt")),
      agent: options.agent,
      model: profile.model,
      sampling: profile.sampling,
      exit_code: result.status,
    });
    report.packets.push({ packet_id: coordinate.packetId, task_id: coordinate.taskId, status: "success" });
  }

  writeJson(resolve(outputPath, "run.json"), report);
  return report;
}

interface CliOptions {
  command: "validate" | "plan" | "run";
  manifest: string;
  experiment?: ExperimentId;
  partition?: PartitionId;
  tasks: string[];
  conditions: ConditionId[];
  repetitions?: number;
  agent?: string;
  output?: string;
}

export function parseCliArgs(args: string[]): CliOptions {
  const command = args[0];
  if (command !== "validate" && command !== "plan" && command !== "run") {
    fail("Usage: run-bdd2-evals.ts <validate|plan|run> [--manifest path] [--experiment S|A] [--partition development|held_out] [--task id] [--condition baseline|treatment] [--repetitions n] [--agent name] [--output path] [--dry-run]");
  }
  const options: CliOptions = { command, manifest: DEFAULT_MANIFEST_PATH, tasks: [], conditions: [] };
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const next = (): string => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail(`Missing value for ${flag}`);
      index += 1;
      return value;
    };
    switch (flag) {
      case "--manifest": options.manifest = next(); break;
      case "--experiment": options.experiment = next() as ExperimentId; break;
      case "--partition": options.partition = next() as PartitionId; break;
      case "--task": options.tasks.push(next()); break;
      case "--condition": options.conditions.push(next() as ConditionId); break;
      case "--repetitions": options.repetitions = Number(next()); break;
      case "--agent": options.agent = next(); break;
      case "--output": options.output = next(); break;
      case "--dry-run": break;
      default: fail(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

function requiredPlanOptions(options: CliOptions): PlanOptions {
  if (options.experiment !== "S" && options.experiment !== "A") fail("--experiment must be S or A");
  if (options.partition !== "development" && options.partition !== "held_out") fail("--partition must be development or held_out");
  return {
    experiment: options.experiment,
    partition: options.partition,
    taskIds: options.tasks.length > 0 ? options.tasks : undefined,
    conditions: options.conditions.length > 0 ? options.conditions : undefined,
    repetitions: options.repetitions,
  };
}

export function main(args: string[] = process.argv.slice(2)): void {
  const options = parseCliArgs(args);
  const evaluation = validateEvaluation(REPO_ROOT, options.manifest);
  if (options.command === "validate") {
    console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, freeze: evaluation.manifest.freeze, task_counts: { development: evaluation.tasks.development.length, held_out: evaluation.tasks.held_out.length } }, null, 2));
    return;
  }
  const planOptions = requiredPlanOptions(options);
  if (options.command === "plan") {
    console.log(JSON.stringify({ freeze_id: evaluation.manifest.freeze.id, freeze_state: evaluation.manifest.freeze.state, coordinates: buildRunPlan(evaluation, planOptions) }, null, 2));
    return;
  }
  if (!options.agent) fail("run requires --agent");
  console.log(JSON.stringify(runEvaluation(evaluation, { ...planOptions, agent: options.agent, outputPath: options.output }), null, 2));
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

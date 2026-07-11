#!/usr/bin/env bun

import { createHash, randomBytes } from "crypto";
import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
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

interface FileReference {
  path: string;
  sha256: string;
}

interface ExperimentDefinition {
  kind: "shape" | "audit";
  freeze: {
    id: string;
    state: FreezeState;
    sealed_at: string | null;
  };
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
  version_args: string[];
  expected_version: string;
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  input_source: "stdin";
  response_source: "stdout";
  workspace_mode: "isolated";
  credential_mode: "none" | "codex-auth-copy";
}

export interface EvaluationManifest {
  schema: "repo-harness-bdd2-evaluation.v2";
  runner: FileReference;
  output_root: string;
  experiments: Record<ExperimentId, ExperimentDefinition>;
  partitions: Record<PartitionId, PartitionDefinition>;
  adjudication: {
    rubric: string;
    rubric_sha256: string;
    score_schema: string;
    score_schema_sha256: string;
    shape_metrics: string;
    shape_metrics_sha256: string;
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
  schema: "repo-harness-bdd2-truth-set.v2";
  partition: PartitionId;
  shape_tasks: Record<string, {
    required_behaviors: string[];
    likely_unsupported_expansions: string[];
    protected_concerns: Array<{
      concern: string;
      severity: "P0" | "P1" | "P2" | "P3";
      summary: string;
    }>;
    expected_authority: "inline" | "brief" | "prd";
    escalation_required: boolean;
  }>;
  audit_tasks: Record<string, { clean: boolean; issues: TruthIssue[] }>;
}

export interface ValidatedEvaluation {
  repoRoot: string;
  manifestPath: string;
  authorityPaths: string[];
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
  coordinateId: string;
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
  schema: "repo-harness-bdd2-run.v2";
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

export interface ProtectedConcernOmission {
  concern: string;
  severity: "P0" | "P1" | "P2" | "P3";
  summary: string;
}

export interface ShapeScore {
  kind: "shape";
  unsupported_expansion: number;
  required_behavior_omission: number;
  protected_concern_omissions: ProtectedConcernOmission[];
  authority_fit: "inline" | "brief" | "prd" | "incorrect";
  escalation_correct: boolean;
  unnecessary_tracked_artifact_count: number;
  correction_minutes: number;
  notes: string;
}

export interface LockedScore {
  schema: "repo-harness-bdd2-score.v2";
  packet_id: string;
  task_id: string;
  experiment: "S";
  reviewer_id: string;
  locked_at: string;
  score: ShapeScore;
}

export interface ShapeSummary {
  schema: "repo-harness-bdd2-shape-summary.v1";
  source_commit: string;
  run_manifest_sha256: string;
  packet_count: number;
  score_count: number;
  metrics: {
    unsupported_expansion: {
      baseline_total: number;
      treatment_total: number;
      relative_reduction: number | null;
      wins: number;
      ties: number;
      losses: number;
    };
    required_behavior_omission: {
      baseline_total: number;
      treatment_total: number;
      stable_new_task_ids: string[];
    };
    protected_concern: { new_treatment_p0_p1_pairs: number };
    correction_minutes: {
      baseline_median: number;
      treatment_median: number;
      relative_increase: number | null;
    };
    artifact_burden: { treatment_unnecessary_tracked_artifacts: number };
    authority_fit: { baseline_incorrect: number; treatment_incorrect: number };
    escalation: { baseline_incorrect: number; treatment_incorrect: number };
  };
  gates: Record<string, boolean>;
  decision: "Pass" | "Reshape" | "Kill";
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
): string {
  assertRecord(value, label);
  assertExactKeys(value, ["prompt", "sha256"], label);
  assertString(value.prompt, `${label}.prompt`);
  assertString(value.sha256, `${label}.sha256`);
  return verifyHash(repoRoot, value.prompt, value.sha256, label);
}

function validateFileReference(repoRoot: string, value: unknown, label: string): string {
  assertRecord(value, label);
  assertExactKeys(value, ["path", "sha256"], label);
  assertString(value.path, `${label}.path`);
  assertString(value.sha256, `${label}.sha256`);
  return verifyHash(repoRoot, value.path, value.sha256, label);
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
  assertExactKeys(raw, ["schema", "partition", "shape_tasks", "audit_tasks"], `${partition} truth set`);
  if (raw.schema !== "repo-harness-bdd2-truth-set.v2") fail(`${partition} truth schema mismatch`);
  if (raw.partition !== partition) fail(`${partition} truth partition mismatch`);
  assertRecord(raw.shape_tasks, `${partition}.shape_tasks`);
  assertRecord(raw.audit_tasks, `${partition}.audit_tasks`);

  const shapeTaskIds = new Set(tasks.filter((task) => task.experiment === "S").map((task) => task.id));
  const shapeTruthIds = new Set(Object.keys(raw.shape_tasks));
  if ([...shapeTaskIds].sort().join("\n") !== [...shapeTruthIds].sort().join("\n")) {
    fail(`${partition} truth keys must match shape task ids exactly`);
  }
  for (const [taskId, candidate] of Object.entries(raw.shape_tasks)) {
    assertRecord(candidate, `${partition}.shape_tasks.${taskId}`);
    assertExactKeys(
      candidate,
      ["required_behaviors", "likely_unsupported_expansions", "protected_concerns", "expected_authority", "escalation_required"],
      `${partition}.shape_tasks.${taskId}`
    );
    for (const key of ["required_behaviors", "likely_unsupported_expansions"] as const) {
      if (!Array.isArray(candidate[key]) || candidate[key].length === 0 || candidate[key].some((value) => typeof value !== "string" || value.length === 0)) {
        fail(`${partition}.shape_tasks.${taskId}.${key} must be a non-empty string array`);
      }
    }
    if (!Array.isArray(candidate.protected_concerns)) {
      fail(`${partition}.shape_tasks.${taskId}.protected_concerns must be an array`);
    }
    for (const [index, concern] of candidate.protected_concerns.entries()) {
      assertRecord(concern, `${taskId}.protected_concerns[${index}]`);
      assertExactKeys(concern, ["concern", "severity", "summary"], `${taskId}.protected_concerns[${index}]`);
      assertString(concern.concern, `${taskId}.protected_concerns[${index}].concern`);
      assertString(concern.summary, `${taskId}.protected_concerns[${index}].summary`);
      if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) {
        fail(`${taskId}.protected_concerns[${index}].severity is invalid`);
      }
    }
    if (!["inline", "brief", "prd"].includes(String(candidate.expected_authority))) {
      fail(`${partition}.shape_tasks.${taskId}.expected_authority is invalid`);
    }
    if (typeof candidate.escalation_required !== "boolean") {
      fail(`${partition}.shape_tasks.${taskId}.escalation_required must be boolean`);
    }
    if ((candidate.expected_authority === "prd") !== candidate.escalation_required) {
      fail(`${partition}.shape_tasks.${taskId} PRD authority must match escalation_required`);
    }
  }

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
    assertExactKeys(
      raw,
      ["command", "args", "version_args", "expected_version", "model", "sampling", "input_source", "response_source", "workspace_mode", "credential_mode"],
      `agents.${agent}`
    );
    assertString(raw.command, `agents.${agent}.command`);
    assertString(raw.expected_version, `agents.${agent}.expected_version`);
    assertString(raw.model, `agents.${agent}.model`);
    if (!Array.isArray(raw.args) || raw.args.some((entry) => typeof entry !== "string")) {
      fail(`agents.${agent}.args must be an array of strings`);
    }
    if (!Array.isArray(raw.version_args) || raw.version_args.some((entry) => typeof entry !== "string")) {
      fail(`agents.${agent}.version_args must be an array of strings`);
    }
    if (raw.input_source !== "stdin" || raw.response_source !== "stdout" || raw.workspace_mode !== "isolated") {
      fail(`agents.${agent} must use stdin, stdout, and isolated workspace mode`);
    }
    if (raw.credential_mode !== "none" && raw.credential_mode !== "codex-auth-copy") {
      fail(`agents.${agent}.credential_mode is invalid`);
    }
    if (raw.credential_mode === "codex-auth-copy" && raw.command !== "codex") {
      fail(`agents.${agent}.credential_mode codex-auth-copy requires command codex`);
    }
    assertRecord(raw.sampling, `agents.${agent}.sampling`);
    for (const [key, value] of Object.entries(raw.sampling)) {
      if (!["string", "number", "boolean"].includes(typeof value) && value !== null) {
        fail(`agents.${agent}.sampling.${key} must be a scalar or null`);
      }
    }
    const templates = (raw.args as string[]).join("\n");
    for (const required of ["{model}"]) {
      if (!templates.includes(required)) fail(`agents.${agent}.args must apply ${required}`);
    }
    for (const key of Object.keys(raw.sampling)) {
      if (!templates.includes(`{sampling.${key}}`)) {
        fail(`agents.${agent}.args must apply {sampling.${key}}`);
      }
    }
    for (const placeholder of templates.matchAll(/\{([^}]+)\}/g)) {
      const name = placeholder[1];
      const knownSampling = name.startsWith("sampling.") && Object.hasOwn(raw.sampling, name.slice("sampling.".length));
      if (name !== "model" && !knownSampling) {
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
  assertExactKeys(raw, ["schema", "runner", "output_root", "experiments", "partitions", "adjudication", "agents"], "manifest");
  if (raw.schema !== "repo-harness-bdd2-evaluation.v2") fail("Unsupported evaluation manifest schema");

  const authorityPaths = [manifestPath, validateFileReference(absoluteRoot, raw.runner, "runner")];
  assertString(raw.output_root, "output_root");
  assertRecord(raw.experiments, "experiments");
  assertExactKeys(raw.experiments, ["S", "A"], "experiments");
  for (const experimentId of ["S", "A"] as const) {
    const experiment = raw.experiments[experimentId];
    assertRecord(experiment, `experiments.${experimentId}`);
    assertExactKeys(experiment, ["kind", "freeze", "repetitions", "held_out_task_count", "conditions"], `experiments.${experimentId}`);
    if (experiment.kind !== (experimentId === "S" ? "shape" : "audit")) fail(`experiments.${experimentId}.kind mismatch`);
    assertRecord(experiment.freeze, `experiments.${experimentId}.freeze`);
    assertExactKeys(experiment.freeze, ["id", "state", "sealed_at"], `experiments.${experimentId}.freeze`);
    assertString(experiment.freeze.id, `experiments.${experimentId}.freeze.id`);
    if (experiment.freeze.state !== "foundation" && experiment.freeze.state !== "sealed") {
      fail(`experiments.${experimentId}.freeze.state must be foundation or sealed`);
    }
    if (experiment.freeze.state === "foundation" && experiment.freeze.sealed_at !== null) {
      fail(`Foundation experiment ${experimentId} cannot contain seal time`);
    }
    if (experiment.freeze.state === "sealed") {
      assertString(experiment.freeze.sealed_at, `experiments.${experimentId}.freeze.sealed_at`);
    }
    if (!Number.isInteger(experiment.repetitions) || Number(experiment.repetitions) < 1) fail(`experiments.${experimentId}.repetitions must be positive`);
    if (!Number.isInteger(experiment.held_out_task_count) || Number(experiment.held_out_task_count) < 1) fail(`experiments.${experimentId}.held_out_task_count must be positive`);
    assertRecord(experiment.conditions, `experiments.${experimentId}.conditions`);
    assertExactKeys(experiment.conditions, ["baseline", "treatment"], `experiments.${experimentId}.conditions`);
    authorityPaths.push(
      validatePromptReference(absoluteRoot, experiment.conditions.baseline, `experiments.${experimentId}.conditions.baseline`),
      validatePromptReference(absoluteRoot, experiment.conditions.treatment, `experiments.${experimentId}.conditions.treatment`)
    );
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
    authorityPaths.push(taskPath, truthPath);
    const taskSet = validateTaskSet(readJson(taskPath), partitionId);
    validateTruthSet(readJson(truthPath), partitionId, taskSet.tasks);
    tasks[partitionId] = taskSet.tasks;
  }

  const allIds = [...tasks.development, ...tasks.held_out].map((task) => task.id);
  if (new Set(allIds).size !== allIds.length) fail("Task ids must be unique across partitions");

  assertRecord(raw.adjudication, "adjudication");
  assertExactKeys(raw.adjudication, ["rubric", "rubric_sha256", "score_schema", "score_schema_sha256", "shape_metrics", "shape_metrics_sha256"], "adjudication");
  for (const key of ["rubric", "rubric_sha256", "score_schema", "score_schema_sha256", "shape_metrics", "shape_metrics_sha256"] as const) {
    assertString(raw.adjudication[key], `adjudication.${key}`);
  }
  const rubric = raw.adjudication.rubric as string;
  const rubricSha256 = raw.adjudication.rubric_sha256 as string;
  const scoreSchema = raw.adjudication.score_schema as string;
  const scoreSchemaSha256 = raw.adjudication.score_schema_sha256 as string;
  const shapeMetrics = raw.adjudication.shape_metrics as string;
  const shapeMetricsSha256 = raw.adjudication.shape_metrics_sha256 as string;
  authorityPaths.push(
    verifyHash(absoluteRoot, rubric, rubricSha256, "adjudication rubric"),
    verifyHash(absoluteRoot, scoreSchema, scoreSchemaSha256, "adjudication score schema"),
    verifyHash(absoluteRoot, shapeMetrics, shapeMetricsSha256, "shape metric specification")
  );

  assertRecord(raw.agents, "agents");
  const manifest = raw as unknown as EvaluationManifest;
  const sealedExperiments = (["S", "A"] as const).filter((experimentId) => manifest.experiments[experimentId].freeze.state === "sealed");
  if (sealedExperiments.length === 0) {
    if (Object.keys(manifest.agents).length !== 0) fail("Foundation-only manifest cannot contain agent profiles");
  } else {
    if (Object.keys(manifest.agents).length === 0) fail("A sealed experiment requires at least one agent profile");
    validateAgentProfiles(manifest);
    for (const experimentId of sealedExperiments) {
      const actual = tasks.held_out.filter((task) => task.experiment === experimentId).length;
      const expected = manifest.experiments[experimentId].held_out_task_count;
      if (actual !== expected) fail(`Sealed experiment ${experimentId} requires exactly ${expected} held-out tasks, got ${actual}`);
    }
  }

  return { repoRoot: absoluteRoot, manifestPath, authorityPaths: [...new Set(authorityPaths)], manifest, tasks };
}

function privateCoordinateId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

function randomBlindPacketId(used: Set<string>): string {
  let packetId = "";
  do {
    packetId = randomBytes(16).toString("hex");
  } while (used.has(packetId));
  used.add(packetId);
  return packetId;
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
          coordinateId: privateCoordinateId([experiment.freeze.id, options.experiment, options.partition, task.id, condition, String(repetition)]),
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

function assertAuthorityTrackedAtHead(repoRoot: string, authorityPaths: string[]): void {
  for (const path of authorityPaths) {
    const relativePath = relative(repoRoot, path).replace(/\\/g, "/");
    if (relativePath.startsWith("../") || isAbsolute(relativePath)) {
      fail(`Evaluation authority escapes repository root: ${path}`);
    }
    const atHead = spawnSync(
      "git",
      ["ls-tree", "-r", "--name-only", "-z", "HEAD", "--", relativePath],
      { cwd: repoRoot, encoding: "utf-8" }
    );
    const headPaths = (atHead.stdout ?? "").split("\0").filter(Boolean);
    if (atHead.status !== 0 || !headPaths.includes(relativePath)) {
      fail(`Sealed evaluation authority must be tracked at HEAD: ${relativePath}`);
    }
  }
}

export function runEvaluation(evaluation: ValidatedEvaluation, options: RunOptions): RunReport {
  const experiment = evaluation.manifest.experiments[options.experiment];
  if (experiment.freeze.state !== "sealed") fail(`Experiment ${options.experiment} is foundation-only; seal it before execution`);
  const profile = evaluation.manifest.agents[options.agent];
  if (!profile) fail(`Unknown frozen agent profile: ${options.agent}`);
  const version = spawnSync(profile.command, profile.version_args, { encoding: "utf-8", env: process.env });
  if (version.error) fail(`Cannot inspect agent command version: ${version.error.message}`);
  if (version.status !== 0) fail(`Agent version command failed with exit ${version.status}`);
  const actualVersion = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim();
  if (actualVersion !== profile.expected_version) {
    fail(`Agent command version drift: expected ${profile.expected_version}, got ${actualVersion}`);
  }
  const sourceCommit = cleanHeadCommit(evaluation.repoRoot);
  assertAuthorityTrackedAtHead(evaluation.repoRoot, evaluation.authorityPaths);
  const plan = buildRunPlan(evaluation, options);
  const outputPath = options.outputPath
    ? resolve(evaluation.repoRoot, options.outputPath)
    : resolve(evaluation.repoRoot, evaluation.manifest.output_root, experiment.freeze.id, timestamp(options.now ?? new Date()));
  const rel = relative(evaluation.repoRoot, outputPath);
  if (rel.startsWith("..") || isAbsolute(rel)) fail("Output path must remain inside repository root");
  assertWritePath(evaluation.repoRoot, outputPath);
  ensureNewDirectory(outputPath);

  const report: RunReport = {
    schema: "repo-harness-bdd2-run.v2",
    freeze_id: experiment.freeze.id,
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

  const blindPacketIds = new Set<string>();
  for (const coordinate of plan) {
    const packetRoot = resolve(outputPath, "packets", coordinate.coordinateId);
    const promptPath = resolve(packetRoot, "agent-prompt.md");
    const stderrPath = resolve(packetRoot, "stderr.txt");
    mkdirSync(packetRoot, { recursive: true });
    const agentPacket = buildAgentPacket(evaluation, coordinate);
    writeFileSync(promptPath, agentPacket, "utf-8");

    const values = {
      model: profile.model,
      ...Object.fromEntries(
        Object.entries(profile.sampling).map(([key, value]) => [`sampling.${key}`, String(value)])
      ),
    };
    const args = profile.args.map((arg) => expandArg(arg, values));
    writeJson(resolve(packetRoot, "command.json"), {
      command: profile.command,
      args,
      cwd: "isolated-temporary-directory",
      home: "isolated-temporary-directory",
      input_source: "stdin",
      credential_mode: profile.credential_mode,
    });
    const isolatedWorkspace = mkdtempSync(join(tmpdir(), "repo-harness-bdd2-agent-"));
    const isolatedHome = mkdtempSync(join(tmpdir(), "repo-harness-bdd2-home-"));
    let result;
    try {
      if (profile.credential_mode === "codex-auth-copy") {
        const sourceHome = process.env.CODEX_HOME || (process.env.HOME ? join(process.env.HOME, ".codex") : "");
        if (!sourceHome) fail("Cannot resolve Codex auth source home");
        const authSource = resolve(sourceHome, "auth.json");
        if (!existsSync(authSource) || lstatSync(authSource).isSymbolicLink()) fail("Codex auth source must be a regular auth.json file");
        const authTarget = resolve(isolatedHome, "auth.json");
        copyFileSync(authSource, authTarget);
        chmodSync(authTarget, 0o600);
      }
      result = spawnSync(profile.command, args, {
        cwd: isolatedWorkspace,
        encoding: "utf-8",
        env: { ...process.env, HOME: isolatedHome, CODEX_HOME: isolatedHome },
        input: agentPacket,
        maxBuffer: 16 * 1024 * 1024,
      });
    } finally {
      rmSync(isolatedWorkspace, { recursive: true, force: true });
      rmSync(isolatedHome, { recursive: true, force: true });
    }
    writeFileSync(stderrPath, result.stderr ?? "", "utf-8");
    if (result.error) fail(`Agent command failed to start for ${coordinate.coordinateId}: ${result.error.message}`);
    if (result.status !== 0) fail(`Agent command failed for ${coordinate.coordinateId} with exit ${result.status}`);
    const response = result.stdout ?? "";
    if (response.trim().length === 0) fail(`Agent response is empty for ${coordinate.coordinateId}`);
    writeFileSync(resolve(packetRoot, "response.md"), response, "utf-8");
    const task = evaluation.tasks[coordinate.partition].find((candidate) => candidate.id === coordinate.taskId);
    if (!task) fail(`Task missing for coordinate: ${coordinate.taskId}`);
    const blindPacketId = randomBlindPacketId(blindPacketIds);
    writeJson(resolve(outputPath, "blind", `${blindPacketId}.json`), {
      schema: "repo-harness-bdd2-blind-packet.v2",
      packet_id: blindPacketId,
      task_id: coordinate.taskId,
      experiment: coordinate.experiment,
      task_input: task.agent_input,
      response,
    });
    writeJson(resolve(outputPath, "private", `${blindPacketId}.json`), {
      schema: "repo-harness-bdd2-private-coordinate.v2",
      packet_id: blindPacketId,
      coordinate_id: coordinate.coordinateId,
      task_id: coordinate.taskId,
      condition: coordinate.condition,
      repetition: coordinate.repetition,
      prompt_sha256: sha256File(authorityPath(evaluation.repoRoot, coordinate.promptPath, "condition prompt")),
      agent: options.agent,
      model: profile.model,
      sampling: profile.sampling,
      exit_code: result.status,
    });
    report.packets.push({ packet_id: blindPacketId, task_id: coordinate.taskId, status: "success" });
  }

  writeJson(resolve(outputPath, "run.json"), report);
  return report;
}

interface ValidatedShapeScores {
  runPath: string;
  run: RunReport;
  scores: Map<string, LockedScore>;
  privateCoordinates: Map<string, { task_id: string; condition: ConditionId; repetition: number }>;
}

function directoryInsideRepo(repoRoot: string, relativePath: string, label: string): string {
  assertString(relativePath, label);
  if (isAbsolute(relativePath)) fail(`${label} must be repository-relative`);
  const path = resolve(repoRoot, relativePath);
  const rel = relative(repoRoot, path);
  if (rel.startsWith("..") || isAbsolute(rel)) fail(`${label} must remain inside repository root`);
  if (!existsSync(path) || !lstatSync(path).isDirectory()) fail(`${label} is not a directory: ${relativePath}`);
  if (lstatSync(path).isSymbolicLink()) fail(`${label} must not be a symbolic link`);
  return path;
}

function integerAtLeastZero(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) fail(`${label} must be a non-negative integer`);
  return Number(value);
}

function numberAtLeastZero(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${label} must be a non-negative finite number`);
  return value;
}

function validateLockedShapeScore(raw: unknown, label: string): LockedScore {
  assertRecord(raw, label);
  assertExactKeys(raw, ["schema", "packet_id", "task_id", "experiment", "reviewer_id", "locked_at", "score"], label);
  if (raw.schema !== "repo-harness-bdd2-score.v2") fail(`${label}.schema mismatch`);
  if (typeof raw.packet_id !== "string" || !/^[a-f0-9]{32}$/.test(raw.packet_id)) fail(`${label}.packet_id is invalid`);
  assertString(raw.task_id, `${label}.task_id`);
  if (raw.experiment !== "S") fail(`${label}.experiment must be S`);
  assertString(raw.reviewer_id, `${label}.reviewer_id`);
  assertString(raw.locked_at, `${label}.locked_at`);
  if (Number.isNaN(Date.parse(raw.locked_at))) fail(`${label}.locked_at must be an ISO date-time`);
  assertRecord(raw.score, `${label}.score`);
  assertExactKeys(
    raw.score,
    ["kind", "unsupported_expansion", "required_behavior_omission", "protected_concern_omissions", "authority_fit", "escalation_correct", "unnecessary_tracked_artifact_count", "correction_minutes", "notes"],
    `${label}.score`
  );
  if (raw.score.kind !== "shape") fail(`${label}.score.kind must be shape`);
  integerAtLeastZero(raw.score.unsupported_expansion, `${label}.score.unsupported_expansion`);
  integerAtLeastZero(raw.score.required_behavior_omission, `${label}.score.required_behavior_omission`);
  integerAtLeastZero(raw.score.unnecessary_tracked_artifact_count, `${label}.score.unnecessary_tracked_artifact_count`);
  numberAtLeastZero(raw.score.correction_minutes, `${label}.score.correction_minutes`);
  if (!["inline", "brief", "prd", "incorrect"].includes(String(raw.score.authority_fit))) {
    fail(`${label}.score.authority_fit is invalid`);
  }
  if (typeof raw.score.escalation_correct !== "boolean") fail(`${label}.score.escalation_correct must be boolean`);
  if (typeof raw.score.notes !== "string") fail(`${label}.score.notes must be a string`);
  if (!Array.isArray(raw.score.protected_concern_omissions)) {
    fail(`${label}.score.protected_concern_omissions must be an array`);
  }
  for (const [index, concern] of raw.score.protected_concern_omissions.entries()) {
    assertRecord(concern, `${label}.score.protected_concern_omissions[${index}]`);
    assertExactKeys(concern, ["concern", "severity", "summary"], `${label}.score.protected_concern_omissions[${index}]`);
    assertString(concern.concern, `${label}.score.protected_concern_omissions[${index}].concern`);
    assertString(concern.summary, `${label}.score.protected_concern_omissions[${index}].summary`);
    if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) {
      fail(`${label}.score.protected_concern_omissions[${index}].severity is invalid`);
    }
  }
  return raw as unknown as LockedScore;
}

export function validateShapeScores(
  evaluation: ValidatedEvaluation,
  runRelativePath: string
): ValidatedShapeScores {
  const runPath = directoryInsideRepo(evaluation.repoRoot, runRelativePath, "run path");
  const runRaw = readJson(resolve(runPath, "run.json"));
  assertRecord(runRaw, "run report");
  assertExactKeys(
    runRaw,
    ["schema", "freeze_id", "source_commit", "manifest_sha256", "agent", "model", "sampling", "experiment", "partition", "output_path", "packets"],
    "run report"
  );
  if (runRaw.schema !== "repo-harness-bdd2-run.v2" || runRaw.experiment !== "S" || runRaw.partition !== "held_out") {
    fail("Shape scoring requires a held-out S v2 run");
  }
  if (runRaw.freeze_id !== evaluation.manifest.experiments.S.freeze.id) fail("Run freeze id does not match Shape authority");
  if (typeof runRaw.source_commit !== "string" || !/^[a-f0-9]{40}$/.test(runRaw.source_commit)) fail("Run source commit is invalid");
  if (runRaw.manifest_sha256 !== sha256File(evaluation.manifestPath)) fail("Run manifest hash does not match current authority");
  const relativeRunPath = relative(evaluation.repoRoot, runPath).replace(/\\/g, "/");
  if (runRaw.output_path !== relativeRunPath) fail("Run output path does not match its directory");
  assertString(runRaw.agent, "run report.agent");
  const profile = evaluation.manifest.agents[runRaw.agent];
  if (!profile || runRaw.model !== profile.model || JSON.stringify(runRaw.sampling) !== JSON.stringify(profile.sampling)) {
    fail("Run agent profile does not match current authority");
  }
  if (!Array.isArray(runRaw.packets)) fail("run report packets must be an array");
  const expectedCount = evaluation.manifest.experiments.S.held_out_task_count * 2 * evaluation.manifest.experiments.S.repetitions;
  if (runRaw.packets.length !== expectedCount) fail(`Shape run requires exactly ${expectedCount} packets, got ${runRaw.packets.length}`);
  const run = runRaw as unknown as RunReport;
  const packets = new Map<string, { task_id: string }>();
  for (const [index, packet] of run.packets.entries()) {
    assertRecord(packet as unknown, `run.packets[${index}]`);
    const candidate = packet as unknown as Record<string, unknown>;
    assertExactKeys(candidate, ["packet_id", "task_id", "status"], `run.packets[${index}]`);
    if (typeof candidate.packet_id !== "string" || !/^[a-f0-9]{32}$/.test(candidate.packet_id)) fail(`run.packets[${index}].packet_id is invalid`);
    assertString(candidate.task_id, `run.packets[${index}].task_id`);
    if (candidate.status !== "success") fail(`run.packets[${index}] is not successful`);
    const task = evaluation.tasks.held_out.find((entry) => entry.id === candidate.task_id && entry.experiment === "S");
    if (!task) fail(`run.packets[${index}] references an unknown Shape task`);
    if (packets.has(candidate.packet_id)) fail(`Duplicate packet id in run: ${candidate.packet_id}`);
    packets.set(candidate.packet_id, { task_id: candidate.task_id });
    const blind = readJson(resolve(runPath, "blind", `${candidate.packet_id}.json`));
    assertRecord(blind, `blind packet ${candidate.packet_id}`);
    assertExactKeys(blind, ["schema", "packet_id", "task_id", "experiment", "task_input", "response"], `blind packet ${candidate.packet_id}`);
    if (blind.schema !== "repo-harness-bdd2-blind-packet.v2" || blind.packet_id !== candidate.packet_id || blind.task_id !== candidate.task_id || blind.experiment !== "S") {
      fail(`Blind packet identity mismatch: ${candidate.packet_id}`);
    }
    assertString(blind.task_input, `blind packet ${candidate.packet_id}.task_input`);
    assertString(blind.response, `blind packet ${candidate.packet_id}.response`);
    if (blind.task_input !== task.agent_input) fail(`Blind packet task input drift: ${candidate.packet_id}`);
  }

  const scoreDir = directoryInsideRepo(evaluation.repoRoot, relative(evaluation.repoRoot, resolve(runPath, "scores")), "score directory");
  const scoreFiles = readdirSync(scoreDir).filter((file) => file.endsWith(".json")).sort();
  if (scoreFiles.length !== packets.size) fail(`Shape scoring requires exactly ${packets.size} score files, got ${scoreFiles.length}`);
  const scores = new Map<string, LockedScore>();
  for (const file of scoreFiles) {
    const score = validateLockedShapeScore(readJson(resolve(scoreDir, file)), `score ${file}`);
    const packet = packets.get(score.packet_id);
    if (!packet) fail(`Score references unknown packet: ${score.packet_id}`);
    if (packet.task_id !== score.task_id) fail(`Score task mismatch for packet: ${score.packet_id}`);
    if (scores.has(score.packet_id)) fail(`Duplicate score for packet: ${score.packet_id}`);
    scores.set(score.packet_id, score);
  }

  const privateCoordinates = new Map<string, { task_id: string; condition: ConditionId; repetition: number }>();
  for (const packetId of packets.keys()) {
    const raw = readJson(resolve(runPath, "private", `${packetId}.json`));
    assertRecord(raw, `private coordinate ${packetId}`);
    assertExactKeys(
      raw,
      ["schema", "packet_id", "coordinate_id", "task_id", "condition", "repetition", "prompt_sha256", "agent", "model", "sampling", "exit_code"],
      `private coordinate ${packetId}`
    );
    if (raw.schema !== "repo-harness-bdd2-private-coordinate.v2" || raw.packet_id !== packetId) {
      fail(`Private coordinate identity mismatch: ${packetId}`);
    }
    assertString(raw.task_id, `private coordinate ${packetId}.task_id`);
    if (raw.task_id !== packets.get(packetId)?.task_id) fail(`Private coordinate task mismatch: ${packetId}`);
    if (raw.condition !== "baseline" && raw.condition !== "treatment") fail(`Private coordinate ${packetId}.condition is invalid`);
    if (!Number.isInteger(raw.repetition) || Number(raw.repetition) < 1 || Number(raw.repetition) > evaluation.manifest.experiments.S.repetitions) {
      fail(`Private coordinate ${packetId}.repetition is invalid`);
    }
    const expectedCoordinateId = privateCoordinateId([
      evaluation.manifest.experiments.S.freeze.id,
      "S",
      "held_out",
      raw.task_id,
      raw.condition,
      String(raw.repetition),
    ]);
    if (raw.coordinate_id !== expectedCoordinateId) fail(`Private coordinate id drift: ${packetId}`);
    const expectedPromptHash = evaluation.manifest.experiments.S.conditions[raw.condition].sha256;
    if (raw.prompt_sha256 !== expectedPromptHash) fail(`Private coordinate prompt hash drift: ${packetId}`);
    if (raw.agent !== run.agent || raw.model !== run.model || JSON.stringify(raw.sampling) !== JSON.stringify(run.sampling) || raw.exit_code !== 0) {
      fail(`Private coordinate agent metadata drift: ${packetId}`);
    }
    privateCoordinates.set(packetId, {
      task_id: raw.task_id,
      condition: raw.condition,
      repetition: Number(raw.repetition),
    });
  }
  return { runPath, run, scores, privateCoordinates };
}

function median(values: number[]): number {
  if (values.length === 0) fail("Cannot calculate median of an empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function ratioChange(baseline: number, treatment: number): number | null {
  if (baseline === 0) return treatment === 0 ? 0 : null;
  return Number(((treatment - baseline) / baseline).toFixed(6));
}

export function summarizeShape(
  evaluation: ValidatedEvaluation,
  runRelativePath: string,
  markdownOutput?: string
): ShapeSummary {
  const validated = validateShapeScores(evaluation, runRelativePath);
  const pairs = new Map<string, Partial<Record<ConditionId, ShapeScore>>>();
  for (const [packetId, coordinate] of validated.privateCoordinates) {
    const score = validated.scores.get(packetId)?.score;
    if (!score) fail(`Missing validated score for packet: ${packetId}`);
    const key = `${coordinate.task_id}\0${coordinate.repetition}`;
    const pair = pairs.get(key) ?? {};
    if (pair[coordinate.condition]) fail(`Duplicate ${coordinate.condition} score for ${coordinate.task_id} repetition ${coordinate.repetition}`);
    pair[coordinate.condition] = score;
    pairs.set(key, pair);
  }

  const baselineScores: ShapeScore[] = [];
  const treatmentScores: ShapeScore[] = [];
  let wins = 0;
  let ties = 0;
  let losses = 0;
  let newTreatmentP0P1Pairs = 0;
  const requiredIncreases = new Map<string, number>();
  for (const [key, pair] of pairs) {
    if (!pair.baseline || !pair.treatment) fail(`Incomplete baseline/treatment pair: ${key.replace("\0", " repetition ")}`);
    baselineScores.push(pair.baseline);
    treatmentScores.push(pair.treatment);
    if (pair.treatment.unsupported_expansion < pair.baseline.unsupported_expansion) wins += 1;
    else if (pair.treatment.unsupported_expansion > pair.baseline.unsupported_expansion) losses += 1;
    else ties += 1;
    const taskId = key.split("\0")[0];
    if (pair.treatment.required_behavior_omission > pair.baseline.required_behavior_omission) {
      requiredIncreases.set(taskId, (requiredIncreases.get(taskId) ?? 0) + 1);
    }
    const severe = (score: ShapeScore): number => score.protected_concern_omissions.filter((item) => item.severity === "P0" || item.severity === "P1").length;
    if (severe(pair.treatment) > severe(pair.baseline)) newTreatmentP0P1Pairs += 1;
  }
  const baselineUnsupported = baselineScores.reduce((sum, score) => sum + score.unsupported_expansion, 0);
  const treatmentUnsupported = treatmentScores.reduce((sum, score) => sum + score.unsupported_expansion, 0);
  const unsupportedChange = ratioChange(baselineUnsupported, treatmentUnsupported);
  const relativeReduction = unsupportedChange === null ? null : -unsupportedChange;
  const baselineRequired = baselineScores.reduce((sum, score) => sum + score.required_behavior_omission, 0);
  const treatmentRequired = treatmentScores.reduce((sum, score) => sum + score.required_behavior_omission, 0);
  const stableNewTaskIds = [...requiredIncreases.entries()].filter(([, count]) => count >= 2).map(([taskId]) => taskId).sort();
  const baselineCorrection = median(baselineScores.map((score) => score.correction_minutes));
  const treatmentCorrection = median(treatmentScores.map((score) => score.correction_minutes));
  const correctionIncrease = ratioChange(baselineCorrection, treatmentCorrection);
  const treatmentUnnecessaryTrackedArtifacts = treatmentScores.reduce((sum, score) => sum + score.unnecessary_tracked_artifact_count, 0);
  const gates = {
    unsupported_reduction_target: relativeReduction !== null && relativeReduction >= 0.3,
    unsupported_wins_exceed_losses: wins > losses,
    required_omissions_not_higher: treatmentRequired <= baselineRequired,
    no_stable_new_required_omission: stableNewTaskIds.length === 0,
    no_new_p0_p1_protected_omission: newTreatmentP0P1Pairs === 0,
    correction_cost_target: correctionIncrease !== null && correctionIncrease <= 0.2,
    zero_treatment_unnecessary_tracked_artifacts: treatmentUnnecessaryTrackedArtifacts === 0,
  };
  const kill = relativeReduction === null
    || relativeReduction < 0.15
    || losses > wins
    || stableNewTaskIds.length > 0
    || newTreatmentP0P1Pairs > 0
    || correctionIncrease === null
    || correctionIncrease > 0.3;
  const decision: ShapeSummary["decision"] = Object.values(gates).every(Boolean) ? "Pass" : kill ? "Kill" : "Reshape";
  const summary: ShapeSummary = {
    schema: "repo-harness-bdd2-shape-summary.v1",
    source_commit: validated.run.source_commit,
    run_manifest_sha256: validated.run.manifest_sha256,
    packet_count: validated.run.packets.length,
    score_count: validated.scores.size,
    metrics: {
      unsupported_expansion: {
        baseline_total: baselineUnsupported,
        treatment_total: treatmentUnsupported,
        relative_reduction: relativeReduction,
        wins,
        ties,
        losses,
      },
      required_behavior_omission: {
        baseline_total: baselineRequired,
        treatment_total: treatmentRequired,
        stable_new_task_ids: stableNewTaskIds,
      },
      protected_concern: { new_treatment_p0_p1_pairs: newTreatmentP0P1Pairs },
      correction_minutes: {
        baseline_median: baselineCorrection,
        treatment_median: treatmentCorrection,
        relative_increase: correctionIncrease,
      },
      artifact_burden: { treatment_unnecessary_tracked_artifacts: treatmentUnnecessaryTrackedArtifacts },
      authority_fit: {
        baseline_incorrect: baselineScores.filter((score) => score.authority_fit === "incorrect").length,
        treatment_incorrect: treatmentScores.filter((score) => score.authority_fit === "incorrect").length,
      },
      escalation: {
        baseline_incorrect: baselineScores.filter((score) => !score.escalation_correct).length,
        treatment_incorrect: treatmentScores.filter((score) => !score.escalation_correct).length,
      },
    },
    gates,
    decision,
  };
  writeJson(resolve(validated.runPath, "shape-summary.json"), summary);
  if (markdownOutput) {
    const outputPath = resolve(evaluation.repoRoot, markdownOutput);
    assertWritePath(evaluation.repoRoot, outputPath);
    const runPathForReport = relative(evaluation.repoRoot, validated.runPath).replace(/\\/g, "/");
    const gateRows = Object.entries(gates).map(([gate, passed]) => `| ${gate} | ${passed ? "PASS" : "FAIL"} |`).join("\n");
    const markdown = `# BDD² Experiment S Report\n\n> **Decision**: ${decision}\n> **Source commit**: \`${summary.source_commit}\`\n> **Raw evidence**: \`${runPathForReport}\` (ignored; local evaluation evidence)\n> **Packets / locked scores**: ${summary.packet_count} / ${summary.score_count}\n\n## Metrics\n\n- Unsupported expansion: baseline ${baselineUnsupported}, treatment ${treatmentUnsupported}, relative reduction ${relativeReduction === null ? "undefined" : `${(relativeReduction * 100).toFixed(1)}%`}; paired W/T/L ${wins}/${ties}/${losses}.\n- Required behavior omission: baseline ${baselineRequired}, treatment ${treatmentRequired}; stable new treatment tasks: ${stableNewTaskIds.length === 0 ? "none" : stableNewTaskIds.join(", ")}.\n- New treatment P0/P1 protected-omission pairs: ${newTreatmentP0P1Pairs}.\n- Correction minutes median: baseline ${baselineCorrection}, treatment ${treatmentCorrection}, relative increase ${correctionIncrease === null ? "undefined" : `${(correctionIncrease * 100).toFixed(1)}%`}.\n- Treatment unnecessary tracked artifacts: ${treatmentUnnecessaryTrackedArtifacts}.\n- Incorrect authority fit: baseline ${summary.metrics.authority_fit.baseline_incorrect}, treatment ${summary.metrics.authority_fit.treatment_incorrect}.\n- Incorrect escalation: baseline ${summary.metrics.escalation.baseline_incorrect}, treatment ${summary.metrics.escalation.treatment_incorrect}.\n\n## Gates\n\n| Gate | Result |\n|---|---|\n${gateRows}\n\n## Decision rationale\n\nThe decision is computed from the pre-registered rules in \`evals/bdd2/metrics/shape-metrics.md\`; it is not manually overridden in this report.\n`;
    writeFileSync(outputPath, markdown, "utf-8");
  }
  return summary;
}

interface CliOptions {
  command: "validate" | "plan" | "run" | "validate-scores" | "summarize-shape";
  manifest: string;
  experiment?: ExperimentId;
  partition?: PartitionId;
  tasks: string[];
  conditions: ConditionId[];
  repetitions?: number;
  agent?: string;
  output?: string;
  run?: string;
}

export function parseCliArgs(args: string[]): CliOptions {
  const command = args[0];
  if (!["validate", "plan", "run", "validate-scores", "summarize-shape"].includes(String(command))) {
    fail("Usage: run-bdd2-evals.ts <validate|plan|run|validate-scores|summarize-shape> [--manifest path] [--experiment S|A] [--partition development|held_out] [--task id] [--condition baseline|treatment] [--repetitions n] [--agent name] [--run path] [--output path] [--dry-run]");
  }
  const options: CliOptions = {
    command: command as CliOptions["command"],
    manifest: DEFAULT_MANIFEST_PATH,
    tasks: [],
    conditions: [],
  };
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
      case "--run": options.run = next(); break;
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
    console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiments: Object.fromEntries(Object.entries(evaluation.manifest.experiments).map(([id, experiment]) => [id, { freeze: experiment.freeze, held_out_task_count: experiment.held_out_task_count }])), task_counts: { development: evaluation.tasks.development.length, held_out: evaluation.tasks.held_out.length } }, null, 2));
    return;
  }
  if (options.command === "validate-scores" || options.command === "summarize-shape") {
    if (options.experiment !== "S") fail(`${options.command} requires --experiment S`);
    if (!options.run) fail(`${options.command} requires --run`);
    if (options.command === "validate-scores") {
      const validated = validateShapeScores(evaluation, options.run);
      console.log(JSON.stringify({ status: "valid", packets: validated.run.packets.length, scores: validated.scores.size }, null, 2));
    } else {
      console.log(JSON.stringify(summarizeShape(evaluation, options.run, options.output), null, 2));
    }
    return;
  }
  const planOptions = requiredPlanOptions(options);
  if (options.command === "plan") {
    const experiment = evaluation.manifest.experiments[planOptions.experiment];
    console.log(JSON.stringify({ freeze_id: experiment.freeze.id, freeze_state: experiment.freeze.state, coordinates: buildRunPlan(evaluation, planOptions) }, null, 2));
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

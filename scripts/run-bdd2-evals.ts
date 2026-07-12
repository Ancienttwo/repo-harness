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
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "path";
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
  schema: "repo-harness-bdd2-evaluation.v3";
  runner: FileReference;
  output_root: string;
  experiments: Record<ExperimentId, ExperimentDefinition>;
  partitions: Record<PartitionId, PartitionDefinition>;
  adjudication: {
    rubric: string;
    rubric_sha256: string;
    experiments: Record<ExperimentId, {
      score_schema: string;
      score_schema_sha256: string;
      metrics: string;
      metrics_sha256: string;
    }>;
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

export interface AuditFinding {
  ref: string;
  reported_severity: "P0" | "P1" | "P2" | "P3";
  matched_truth_issue_id: string | null;
  match_notes: string;
}

export interface AuditScore {
  kind: "audit";
  verdict: "pass" | "findings" | "inconclusive";
  findings: AuditFinding[];
  correction_minutes: number;
  notes: string;
}

export interface LockedAuditScore {
  schema: "repo-harness-bdd2-audit-score.v1";
  packet_id: string;
  task_id: string;
  experiment: "A";
  reviewer_id: string;
  locked_at: string;
  score: AuditScore;
}

export interface AuditSummary {
  schema: "repo-harness-bdd2-audit-summary.v1";
  source_commit: string;
  run_manifest_sha256: string;
  packet_count: number;
  score_count: number;
  metrics: Record<ConditionId, {
    reported_findings: number;
    true_positive_findings: number;
    seeded_issues: number;
    matched_seeded_issues: number;
    severe_seeded_issues: number;
    matched_severe_seeded_issues: number;
    clean_outputs: number;
    clean_false_positive_outputs: number;
    correct_no_findings: number;
    severity_agreements: number;
    severity_matches: number;
    severe_underestimations: number;
    correction_minutes_median: number;
    precision: number;
    seeded_recall: number;
    severe_seeded_recall: number;
    clean_false_positive_rate: number;
    correct_no_findings_rate: number;
    severity_agreement_rate: number;
  }>;
  gates: {
    precision: boolean;
    seeded_recall: boolean;
    severe_seeded_recall: boolean;
    clean_false_positive_rate: boolean;
    correct_no_findings_rate: boolean;
    severity_agreement_rate: boolean;
    no_severe_underestimation: boolean;
  };
  decision: "Pass" | "Kill";
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

  const auditIssueIds = new Set<string>();
  const auditTaxonomies = new Set([
    "PROTECTED_CONCERN_REGRESSION",
    "MISSING_RECOVERY",
    "JOURNEY_BREAK",
    "AUTHORITY_DRIFT",
    "BACKSTAGE_LEAK",
    "UNNECESSARY_USER_DECISION",
    "UNNECESSARY_USER_CONCEPT",
  ]);
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
      if (auditIssueIds.has(issue.id)) fail(`Duplicate audit truth issue id: ${issue.id}`);
      auditIssueIds.add(issue.id);
      if (!auditTaxonomies.has(issue.taxonomy)) fail(`${taskId}.issues[${index}].taxonomy is invalid`);
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
    if (raw.credential_mode === "codex-auth-copy"
      && (!isAbsolute(String(raw.command)) || basename(String(raw.command)) !== "codex")) {
      fail(`agents.${agent}.credential_mode codex-auth-copy requires an absolute codex executable path`);
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
  if (raw.schema !== "repo-harness-bdd2-evaluation.v3") fail("Unsupported evaluation manifest schema");

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
  assertExactKeys(raw.adjudication, ["rubric", "rubric_sha256", "experiments"], "adjudication");
  for (const key of ["rubric", "rubric_sha256"] as const) {
    assertString(raw.adjudication[key], `adjudication.${key}`);
  }
  const rubric = raw.adjudication.rubric as string;
  const rubricSha256 = raw.adjudication.rubric_sha256 as string;
  authorityPaths.push(verifyHash(absoluteRoot, rubric, rubricSha256, "adjudication rubric"));
  assertRecord(raw.adjudication.experiments, "adjudication.experiments");
  assertExactKeys(raw.adjudication.experiments, ["S", "A"], "adjudication.experiments");
  for (const experimentId of ["S", "A"] as const) {
    const authority = raw.adjudication.experiments[experimentId];
    assertRecord(authority, `adjudication.experiments.${experimentId}`);
    assertExactKeys(authority, ["score_schema", "score_schema_sha256", "metrics", "metrics_sha256"], `adjudication.experiments.${experimentId}`);
    for (const key of ["score_schema", "score_schema_sha256", "metrics", "metrics_sha256"] as const) {
      assertString(authority[key], `adjudication.experiments.${experimentId}.${key}`);
    }
    authorityPaths.push(
      verifyHash(absoluteRoot, String(authority.score_schema), String(authority.score_schema_sha256), `${experimentId} score schema`),
      verifyHash(absoluteRoot, String(authority.metrics), String(authority.metrics_sha256), `${experimentId} metric specification`)
    );
  }

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
  if (existsSync(targetPath) && lstatSync(targetPath).isSymbolicLink()) {
    fail(`Output path must not be a symbolic link: ${targetPath}`);
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
  const versionHome = mkdtempSync(join(tmpdir(), "repo-harness-bdd2-version-"));
  let version: ReturnType<typeof spawnSync>;
  try {
    version = spawnSync(profile.command, profile.version_args, {
      cwd: versionHome,
      encoding: "utf-8",
      env: buildIsolatedAgentEnv(versionHome),
    });
  } finally {
    rmSync(versionHome, { recursive: true, force: true });
  }
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
      environment: "minimal-allowlist",
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
        env: buildIsolatedAgentEnv(isolatedHome),
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
  const realRoot = realpathSync(repoRoot);
  const realPath = realpathSync(path);
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (realPath !== realRoot && !realPath.startsWith(rootPrefix)) fail(`${label} resolves outside repository root`);
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

function assertIsoDateTime(value: unknown, label: string): void {
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO date-time`);
  }
}

export function buildIsolatedAgentEnv(
  isolatedHome: string,
  sourceEnv: Record<string, string | undefined> = process.env
): Record<string, string> {
  const path = sourceEnv.PATH;
  if (!path) fail("Agent execution requires an explicit PATH");
  return {
    CODEX_HOME: isolatedHome,
    HOME: isolatedHome,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
    PATH: path,
    TERM: "dumb",
    TMPDIR: tmpdir(),
  };
}

function validateLockedShapeScore(raw: unknown, label: string): LockedScore {
  assertRecord(raw, label);
  assertExactKeys(raw, ["schema", "packet_id", "task_id", "experiment", "reviewer_id", "locked_at", "score"], label);
  if (raw.schema !== "repo-harness-bdd2-score.v2") fail(`${label}.schema mismatch`);
  if (typeof raw.packet_id !== "string" || !/^[a-f0-9]{32}$/.test(raw.packet_id)) fail(`${label}.packet_id is invalid`);
  assertString(raw.task_id, `${label}.task_id`);
  if (raw.experiment !== "S") fail(`${label}.experiment must be S`);
  assertString(raw.reviewer_id, `${label}.reviewer_id`);
  assertIsoDateTime(raw.locked_at, `${label}.locked_at`);
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

interface ValidatedAuditScores {
  runPath: string;
  run: RunReport;
  scores: Map<string, LockedAuditScore>;
  privateCoordinates: Map<string, { task_id: string; condition: ConditionId; repetition: number }>;
  truth: TruthSet;
}

function heldOutTruth(evaluation: ValidatedEvaluation): TruthSet {
  return readJson(authorityPath(evaluation.repoRoot, evaluation.manifest.partitions.held_out.truth, "held-out truth")) as TruthSet;
}

function validateLockedAuditScore(
  raw: unknown,
  label: string,
  truthTask: { clean: boolean; issues: TruthIssue[] }
): LockedAuditScore {
  assertRecord(raw, label);
  assertExactKeys(raw, ["schema", "packet_id", "task_id", "experiment", "reviewer_id", "locked_at", "score"], label);
  if (raw.schema !== "repo-harness-bdd2-audit-score.v1") fail(`${label}.schema mismatch`);
  if (typeof raw.packet_id !== "string" || !/^[a-f0-9]{32}$/.test(raw.packet_id)) fail(`${label}.packet_id is invalid`);
  assertString(raw.task_id, `${label}.task_id`);
  if (raw.experiment !== "A") fail(`${label}.experiment must be A`);
  assertString(raw.reviewer_id, `${label}.reviewer_id`);
  assertIsoDateTime(raw.locked_at, `${label}.locked_at`);
  assertRecord(raw.score, `${label}.score`);
  assertExactKeys(raw.score, ["kind", "verdict", "findings", "correction_minutes", "notes"], `${label}.score`);
  if (raw.score.kind !== "audit") fail(`${label}.score.kind must be audit`);
  if (!["pass", "findings", "inconclusive"].includes(String(raw.score.verdict))) fail(`${label}.score.verdict is invalid`);
  if (!Array.isArray(raw.score.findings)) fail(`${label}.score.findings must be an array`);
  if (raw.score.verdict === "pass" && raw.score.findings.length !== 0) fail(`${label} pass must contain zero findings`);
  if (raw.score.verdict === "findings" && raw.score.findings.length === 0) fail(`${label} findings verdict must contain at least one finding`);
  numberAtLeastZero(raw.score.correction_minutes, `${label}.score.correction_minutes`);
  if (typeof raw.score.notes !== "string") fail(`${label}.score.notes must be a string`);
  const findingRefs = new Set<string>();
  const matchedTruthIds = new Set<string>();
  const validTruthIds = new Set(truthTask.issues.map((issue) => issue.id));
  for (const [index, finding] of raw.score.findings.entries()) {
    const findingLabel = `${label}.score.findings[${index}]`;
    assertRecord(finding, findingLabel);
    assertExactKeys(finding, ["ref", "reported_severity", "matched_truth_issue_id", "match_notes"], findingLabel);
    assertString(finding.ref, `${findingLabel}.ref`);
    if (findingRefs.has(finding.ref)) fail(`${label} contains duplicate finding ref: ${finding.ref}`);
    findingRefs.add(finding.ref);
    if (!["P0", "P1", "P2", "P3"].includes(String(finding.reported_severity))) fail(`${findingLabel}.reported_severity is invalid`);
    if (finding.matched_truth_issue_id !== null) {
      assertString(finding.matched_truth_issue_id, `${findingLabel}.matched_truth_issue_id`);
      if (!validTruthIds.has(finding.matched_truth_issue_id)) fail(`${findingLabel} references a truth issue outside this task`);
      if (matchedTruthIds.has(finding.matched_truth_issue_id)) fail(`${label} matches one truth issue more than once`);
      matchedTruthIds.add(finding.matched_truth_issue_id);
    }
    if (typeof finding.match_notes !== "string") fail(`${findingLabel}.match_notes must be a string`);
  }
  return raw as unknown as LockedAuditScore;
}

function validateAuditSourceAuthority(
  evaluation: ValidatedEvaluation,
  sourceCommit: string,
  runManifestSha256: string
): void {
  const manifestText = gitFileAtCommit(evaluation.repoRoot, sourceCommit, DEFAULT_MANIFEST_PATH);
  if (sha256Text(manifestText) !== runManifestSha256) fail("Audit source-commit manifest hash mismatch");
  for (const currentPath of evaluation.authorityPaths) {
    if (currentPath === evaluation.manifestPath) continue;
    const relativePath = relative(evaluation.repoRoot, currentPath).replace(/\\/g, "/");
    const sourceText = gitFileAtCommit(evaluation.repoRoot, sourceCommit, relativePath);
    if (sha256Text(sourceText) !== sha256File(currentPath)) {
      fail(`Audit source-commit authority drift: ${relativePath}`);
    }
  }
}

interface AuditValidationOptions {
  expectedManifestSha256?: string;
  skipSourceAuthority?: boolean;
  truth?: TruthSet;
}

function validateAuditScoresWithAuthority(
  evaluation: ValidatedEvaluation,
  runRelativePath: string,
  options: AuditValidationOptions = {}
): ValidatedAuditScores {
  const runPath = directoryInsideRepo(evaluation.repoRoot, runRelativePath, "run path");
  const runRaw = readJson(resolve(runPath, "run.json"));
  assertRecord(runRaw, "run report");
  assertExactKeys(runRaw, ["schema", "freeze_id", "source_commit", "manifest_sha256", "agent", "model", "sampling", "experiment", "partition", "output_path", "packets"], "run report");
  if (runRaw.schema !== "repo-harness-bdd2-run.v2" || runRaw.experiment !== "A" || runRaw.partition !== "held_out") {
    fail("Audit scoring requires a held-out A v2 run");
  }
  const definition = evaluation.manifest.experiments.A;
  if (runRaw.freeze_id !== definition.freeze.id) fail("Run freeze id does not match Audit authority");
  if (typeof runRaw.source_commit !== "string" || !/^[a-f0-9]{40}$/.test(runRaw.source_commit)) fail("Run source commit is invalid");
  const expectedManifestSha256 = options.expectedManifestSha256 ?? sha256File(evaluation.manifestPath);
  if (runRaw.manifest_sha256 !== expectedManifestSha256) fail("Run manifest hash does not match selected authority");
  if (!options.skipSourceAuthority) validateAuditSourceAuthority(evaluation, runRaw.source_commit, runRaw.manifest_sha256);
  const relativeRunPath = relative(evaluation.repoRoot, runPath).replace(/\\/g, "/");
  if (runRaw.output_path !== relativeRunPath) fail("Run output path does not match its directory");
  assertString(runRaw.agent, "run report.agent");
  const profile = evaluation.manifest.agents[runRaw.agent];
  if (!profile || runRaw.model !== profile.model || JSON.stringify(runRaw.sampling) !== JSON.stringify(profile.sampling)) {
    fail("Run agent profile does not match current authority");
  }
  if (!Array.isArray(runRaw.packets)) fail("run report packets must be an array");
  const auditTasks = evaluation.tasks.held_out.filter((task) => task.experiment === "A");
  const expectedCoordinates = new Set<string>();
  for (const task of auditTasks) {
    for (const condition of ["baseline", "treatment"] as const) {
      for (let repetition = 1; repetition <= definition.repetitions; repetition += 1) {
        expectedCoordinates.add(`${task.id}\0${condition}\0${repetition}`);
      }
    }
  }
  if (runRaw.packets.length !== expectedCoordinates.size) fail(`Audit run requires exactly ${expectedCoordinates.size} packets, got ${runRaw.packets.length}`);
  const run = runRaw as unknown as RunReport;
  const packets = new Map<string, { task_id: string }>();
  for (const [index, packet] of run.packets.entries()) {
    assertRecord(packet as unknown, `run.packets[${index}]`);
    const candidate = packet as unknown as Record<string, unknown>;
    assertExactKeys(candidate, ["packet_id", "task_id", "status"], `run.packets[${index}]`);
    if (typeof candidate.packet_id !== "string" || !/^[a-f0-9]{32}$/.test(candidate.packet_id)) fail(`run.packets[${index}].packet_id is invalid`);
    assertString(candidate.task_id, `run.packets[${index}].task_id`);
    if (candidate.status !== "success") fail(`run.packets[${index}] is not successful`);
    const task = auditTasks.find((entry) => entry.id === candidate.task_id);
    if (!task) fail(`run.packets[${index}] references an unknown Audit task`);
    if (packets.has(candidate.packet_id)) fail(`Duplicate packet id in run: ${candidate.packet_id}`);
    packets.set(candidate.packet_id, { task_id: candidate.task_id });
    const blind = readJson(resolve(runPath, "blind", `${candidate.packet_id}.json`));
    assertRecord(blind, `blind packet ${candidate.packet_id}`);
    assertExactKeys(blind, ["schema", "packet_id", "task_id", "experiment", "task_input", "response"], `blind packet ${candidate.packet_id}`);
    if (blind.schema !== "repo-harness-bdd2-blind-packet.v2" || blind.packet_id !== candidate.packet_id || blind.task_id !== candidate.task_id || blind.experiment !== "A") fail(`Blind packet identity mismatch: ${candidate.packet_id}`);
    if (blind.task_input !== task.agent_input) fail(`Blind packet task input drift: ${candidate.packet_id}`);
    assertString(blind.response, `blind packet ${candidate.packet_id}.response`);
  }
  const expectedPacketFiles = [...packets.keys()].map((packetId) => `${packetId}.json`).sort();
  for (const subdir of ["blind", "private"] as const) {
    const actualFiles = readdirSync(resolve(runPath, subdir)).filter((file) => file.endsWith(".json")).sort();
    if (actualFiles.join("\n") !== expectedPacketFiles.join("\n")) fail(`Audit ${subdir} packet files must match run packet ids exactly`);
  }
  const privateCoordinates = new Map<string, { task_id: string; condition: ConditionId; repetition: number }>();
  const observedCoordinates = new Set<string>();
  for (const packetId of packets.keys()) {
    const raw = readJson(resolve(runPath, "private", `${packetId}.json`));
    assertRecord(raw, `private coordinate ${packetId}`);
    assertExactKeys(raw, ["schema", "packet_id", "coordinate_id", "task_id", "condition", "repetition", "prompt_sha256", "agent", "model", "sampling", "exit_code"], `private coordinate ${packetId}`);
    if (raw.schema !== "repo-harness-bdd2-private-coordinate.v2" || raw.packet_id !== packetId || raw.task_id !== packets.get(packetId)?.task_id) fail(`Private coordinate identity mismatch: ${packetId}`);
    if (raw.condition !== "baseline" && raw.condition !== "treatment") fail(`Private coordinate ${packetId}.condition is invalid`);
    if (!Number.isInteger(raw.repetition) || Number(raw.repetition) < 1 || Number(raw.repetition) > definition.repetitions) fail(`Private coordinate ${packetId}.repetition is invalid`);
    const coordinateKey = `${raw.task_id}\0${raw.condition}\0${raw.repetition}`;
    if (!expectedCoordinates.has(coordinateKey) || observedCoordinates.has(coordinateKey)) fail(`Audit coordinate is missing, duplicated, or unexpected: ${packetId}`);
    observedCoordinates.add(coordinateKey);
    const expectedCoordinateId = privateCoordinateId([definition.freeze.id, "A", "held_out", String(raw.task_id), String(raw.condition), String(raw.repetition)]);
    if (raw.coordinate_id !== expectedCoordinateId) fail(`Private coordinate id drift: ${packetId}`);
    if (raw.prompt_sha256 !== definition.conditions[raw.condition].sha256) fail(`Private coordinate prompt hash drift: ${packetId}`);
    if (raw.agent !== run.agent || raw.model !== run.model || JSON.stringify(raw.sampling) !== JSON.stringify(run.sampling) || raw.exit_code !== 0) fail(`Private coordinate agent metadata drift: ${packetId}`);
    privateCoordinates.set(packetId, { task_id: String(raw.task_id), condition: raw.condition, repetition: Number(raw.repetition) });
  }
  if (observedCoordinates.size !== expectedCoordinates.size) fail(`Audit run is missing ${expectedCoordinates.size - observedCoordinates.size} coordinates`);
  const truth = options.truth ?? heldOutTruth(evaluation);
  const scoreDir = directoryInsideRepo(evaluation.repoRoot, relative(evaluation.repoRoot, resolve(runPath, "scores")), "score directory");
  const scoreFiles = readdirSync(scoreDir).filter((file) => file.endsWith(".json")).sort();
  if (scoreFiles.length !== packets.size) fail(`Audit scoring requires exactly ${packets.size} score files, got ${scoreFiles.length}`);
  if (scoreFiles.join("\n") !== expectedPacketFiles.join("\n")) fail("Audit score files must match run packet ids exactly");
  const scores = new Map<string, LockedAuditScore>();
  for (const file of scoreFiles) {
    const raw = readJson(resolve(scoreDir, file));
    assertRecord(raw, `score ${file}`);
    assertString(raw.task_id, `score ${file}.task_id`);
    const truthTask = truth.audit_tasks[raw.task_id];
    if (!truthTask) fail(`Score references Audit truth outside held-out authority: ${raw.task_id}`);
    const score = validateLockedAuditScore(raw, `score ${file}`, truthTask);
    if (file !== `${score.packet_id}.json`) fail(`Audit score filename does not match packet id: ${file}`);
    const packet = packets.get(score.packet_id);
    if (!packet || packet.task_id !== score.task_id) fail(`Score identity mismatch for packet: ${score.packet_id}`);
    if (scores.has(score.packet_id)) fail(`Duplicate score for packet: ${score.packet_id}`);
    scores.set(score.packet_id, score);
  }
  return { runPath, run, scores, privateCoordinates, truth };
}

export function validateAuditScores(
  evaluation: ValidatedEvaluation,
  runRelativePath: string
): ValidatedAuditScores {
  return validateAuditScoresWithAuthority(evaluation, runRelativePath);
}

function gitFileAtCommit(repoRoot: string, commit: string, path: string): string {
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("Historical source commit is invalid");
  if (isAbsolute(path) || path.split("/").includes("..")) fail(`Historical path is unsafe: ${path}`);
  const result = spawnSync("git", ["show", `${commit}:${path}`], {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`Cannot read ${path} at source commit ${commit}`);
  return result.stdout ?? "";
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function historicalFileWithHash(
  repoRoot: string,
  commit: string,
  path: unknown,
  expectedSha256: unknown,
  label: string
): string {
  assertString(path, `${label}.path`);
  assertString(expectedSha256, `${label}.sha256`);
  const text = gitFileAtCommit(repoRoot, commit, path);
  if (sha256Text(text) !== expectedSha256) fail(`${label} hash mismatch at source commit`);
  return text;
}

function historicalAuditEvaluation(
  repoRoot: string,
  runRelativePath: string
): { evaluation: ValidatedEvaluation; truth: TruthSet; manifestSha256: string } {
  const absoluteRoot = resolve(repoRoot);
  const runPath = directoryInsideRepo(absoluteRoot, runRelativePath, "historical Audit run path");
  const runRaw = readJson(resolve(runPath, "run.json"));
  assertRecord(runRaw, "historical Audit run report");
  assertString(runRaw.source_commit, "historical Audit source_commit");
  assertString(runRaw.manifest_sha256, "historical Audit manifest_sha256");
  if (runRaw.experiment !== "A" || runRaw.partition !== "held_out") fail("Historical Audit evidence requires a held-out A run");
  const manifestText = gitFileAtCommit(absoluteRoot, runRaw.source_commit, DEFAULT_MANIFEST_PATH);
  if (sha256Text(manifestText) !== runRaw.manifest_sha256) fail("Historical Audit manifest hash mismatch");
  const raw = JSON.parse(manifestText) as unknown;
  assertRecord(raw, "historical Audit manifest");
  assertExactKeys(raw, ["schema", "runner", "output_root", "experiments", "partitions", "adjudication", "agents"], "historical Audit manifest");
  if (raw.schema !== "repo-harness-bdd2-evaluation.v3") fail("Historical Audit requires an exact v3 source authority");
  assertRecord(raw.runner, "historical Audit runner");
  historicalFileWithHash(absoluteRoot, runRaw.source_commit, raw.runner.path, raw.runner.sha256, "historical Audit runner");
  assertRecord(raw.experiments, "historical Audit experiments");
  assertExactKeys(raw.experiments, ["S", "A"], "historical Audit experiments");
  for (const experimentId of ["S", "A"] as const) {
    const experiment = raw.experiments[experimentId];
    assertRecord(experiment, `historical Audit experiments.${experimentId}`);
    assertRecord(experiment.conditions, `historical Audit experiments.${experimentId}.conditions`);
    for (const condition of ["baseline", "treatment"] as const) {
      const prompt = experiment.conditions[condition];
      assertRecord(prompt, `historical Audit ${experimentId}.${condition}`);
      historicalFileWithHash(absoluteRoot, runRaw.source_commit, prompt.prompt, prompt.sha256, `historical Audit ${experimentId}.${condition}`);
    }
  }
  const audit = raw.experiments.A;
  assertRecord(audit, "historical Audit experiment A");
  assertRecord(audit.freeze, "historical Audit freeze");
  if (audit.freeze.state !== "sealed" || audit.freeze.id !== runRaw.freeze_id) fail("Historical Audit run does not match its sealed source authority");
  assertRecord(raw.partitions, "historical Audit partitions");
  assertExactKeys(raw.partitions, ["development", "held_out"], "historical Audit partitions");
  const tasks = {} as Record<PartitionId, EvaluationTask[]>;
  let heldOutTruth: TruthSet | undefined;
  for (const partitionId of ["development", "held_out"] as const) {
    const partition = raw.partitions[partitionId];
    assertRecord(partition, `historical Audit partitions.${partitionId}`);
    const taskText = historicalFileWithHash(absoluteRoot, runRaw.source_commit, partition.tasks, partition.tasks_sha256, `historical Audit ${partitionId} tasks`);
    const truthText = historicalFileWithHash(absoluteRoot, runRaw.source_commit, partition.truth, partition.truth_sha256, `historical Audit ${partitionId} truth`);
    const taskSet = validateTaskSet(JSON.parse(taskText), partitionId);
    const truthSet = JSON.parse(truthText) as TruthSet;
    validateTruthSet(truthSet, partitionId, taskSet.tasks);
    tasks[partitionId] = taskSet.tasks;
    if (partitionId === "held_out") heldOutTruth = truthSet;
  }
  if (!heldOutTruth) fail("Historical Audit held-out truth is missing");
  assertRecord(raw.adjudication, "historical Audit adjudication");
  historicalFileWithHash(absoluteRoot, runRaw.source_commit, raw.adjudication.rubric, raw.adjudication.rubric_sha256, "historical Audit rubric");
  assertRecord(raw.adjudication.experiments, "historical Audit adjudication experiments");
  for (const experimentId of ["S", "A"] as const) {
    const authority = raw.adjudication.experiments[experimentId];
    assertRecord(authority, `historical Audit adjudication.${experimentId}`);
    historicalFileWithHash(absoluteRoot, runRaw.source_commit, authority.score_schema, authority.score_schema_sha256, `historical Audit ${experimentId} score schema`);
    historicalFileWithHash(absoluteRoot, runRaw.source_commit, authority.metrics, authority.metrics_sha256, `historical Audit ${experimentId} metrics`);
  }
  assertRecord(raw.agents, "historical Audit agents");
  const manifest = raw as unknown as EvaluationManifest;
  validateAgentProfiles(manifest);
  const actualAuditTasks = tasks.held_out.filter((task) => task.experiment === "A").length;
  if (actualAuditTasks !== manifest.experiments.A.held_out_task_count) fail("Historical Audit held-out task count mismatch");
  return {
    evaluation: {
      repoRoot: absoluteRoot,
      manifestPath: resolve(absoluteRoot, DEFAULT_MANIFEST_PATH),
      authorityPaths: [],
      manifest,
      tasks,
    },
    truth: heldOutTruth,
    manifestSha256: runRaw.manifest_sha256,
  };
}

export function validateHistoricalAuditScores(
  repoRoot: string,
  runRelativePath: string
): ValidatedAuditScores {
  const historical = historicalAuditEvaluation(repoRoot, runRelativePath);
  return validateAuditScoresWithAuthority(historical.evaluation, runRelativePath, {
    expectedManifestSha256: historical.manifestSha256,
    skipSourceAuthority: true,
    truth: historical.truth,
  });
}

export function projectHistoricalShapeEvidence(
  repoRoot: string,
  runRelativePath: string,
  outputRelativePath: string
): Record<string, unknown> {
  const absoluteRoot = resolve(repoRoot);
  const runPath = directoryInsideRepo(absoluteRoot, runRelativePath, "historical run path");
  const runRaw = readJson(resolve(runPath, "run.json"));
  assertRecord(runRaw, "historical run report");
  assertExactKeys(
    runRaw,
    ["schema", "freeze_id", "source_commit", "manifest_sha256", "agent", "model", "sampling", "experiment", "partition", "output_path", "packets"],
    "historical run report"
  );
  if (runRaw.schema !== "repo-harness-bdd2-run.v2" || runRaw.experiment !== "S" || runRaw.partition !== "held_out") {
    fail("Historical Shape evidence requires a held-out S v2 run");
  }
  assertString(runRaw.source_commit, "historical run source_commit");
  assertString(runRaw.manifest_sha256, "historical run manifest_sha256");
  const manifestText = gitFileAtCommit(absoluteRoot, runRaw.source_commit, DEFAULT_MANIFEST_PATH);
  if (sha256Text(manifestText) !== runRaw.manifest_sha256) fail("Historical run manifest hash mismatch");
  const historicalManifest = JSON.parse(manifestText) as any;
  if (historicalManifest.schema !== "repo-harness-bdd2-evaluation.v2"
    || historicalManifest.experiments?.S?.freeze?.id !== runRaw.freeze_id
    || historicalManifest.experiments?.S?.freeze?.state !== "sealed") {
    fail("Historical run does not match a sealed Shape authority");
  }
  const heldOut = historicalManifest.partitions?.held_out;
  assertRecord(heldOut, "historical held-out partition");
  assertString(heldOut.tasks, "historical held-out task path");
  assertString(heldOut.tasks_sha256, "historical held-out task hash");
  assertString(heldOut.truth, "historical held-out truth path");
  assertString(heldOut.truth_sha256, "historical held-out truth hash");
  const taskText = gitFileAtCommit(absoluteRoot, runRaw.source_commit, heldOut.tasks);
  if (sha256Text(taskText) !== heldOut.tasks_sha256) fail("Historical held-out task hash mismatch");
  const taskSet = validateTaskSet(JSON.parse(taskText), "held_out");
  const truthText = gitFileAtCommit(absoluteRoot, runRaw.source_commit, heldOut.truth);
  if (sha256Text(truthText) !== heldOut.truth_sha256) fail("Historical held-out truth hash mismatch");
  const truth = JSON.parse(truthText) as any;
  validateTruthSet(truth, "held_out", taskSet.tasks);
  const shapeTasks = taskSet.tasks.filter((task) => task.experiment === "S");
  const shapeDefinition = historicalManifest.experiments.S;
  if (!Number.isInteger(shapeDefinition.held_out_task_count)
    || shapeTasks.length !== shapeDefinition.held_out_task_count) {
    fail(`Historical Shape authority requires exactly ${shapeDefinition.held_out_task_count} held-out tasks, got ${shapeTasks.length}`);
  }
  if (!Number.isInteger(shapeDefinition.repetitions) || shapeDefinition.repetitions < 1) {
    fail("Historical Shape repetitions must be a positive integer");
  }
  assertRecord(shapeDefinition.conditions, "historical Shape conditions");
  for (const condition of ["baseline", "treatment"] as const) {
    assertRecord(shapeDefinition.conditions[condition], `historical Shape ${condition} condition`);
    assertString(shapeDefinition.conditions[condition].sha256, `historical Shape ${condition} prompt hash`);
  }
  assertRecord(historicalManifest.agents, "historical agents");
  assertString(runRaw.agent, "historical run agent");
  const historicalAgent = historicalManifest.agents[runRaw.agent];
  assertRecord(historicalAgent, `historical agent ${runRaw.agent}`);
  assertString(runRaw.model, "historical run model");
  assertRecord(runRaw.sampling, "historical run sampling");
  if (runRaw.model !== historicalAgent.model
    || JSON.stringify(runRaw.sampling) !== JSON.stringify(historicalAgent.sampling)) {
    fail("Historical run agent profile does not match source authority");
  }
  const relativeRunPath = relative(absoluteRoot, runPath).replace(/\\/g, "/");
  if (runRaw.output_path !== relativeRunPath) fail("Historical run output path does not match its directory");
  if (!Array.isArray(runRaw.packets)) fail("Historical run packets must be an array");
  const expectedCoordinates = new Map<string, { coordinateId: string; promptSha256: string }>();
  for (const task of shapeTasks) {
    for (const condition of ["baseline", "treatment"] as const) {
      for (let repetition = 1; repetition <= shapeDefinition.repetitions; repetition += 1) {
        const key = `${task.id}\0${condition}\0${repetition}`;
        expectedCoordinates.set(key, {
          coordinateId: privateCoordinateId([
            shapeDefinition.freeze.id,
            "S",
            "held_out",
            task.id,
            condition,
            String(repetition),
          ]),
          promptSha256: shapeDefinition.conditions[condition].sha256,
        });
      }
    }
  }
  const expectedCount = expectedCoordinates.size;
  if (runRaw.packets.length !== expectedCount) {
    fail(`Historical Shape run requires exactly ${expectedCount} packets, got ${runRaw.packets.length}`);
  }
  const scoreDir = directoryInsideRepo(absoluteRoot, relative(absoluteRoot, resolve(runPath, "scores")), "historical score directory");
  const privateDir = directoryInsideRepo(absoluteRoot, relative(absoluteRoot, resolve(runPath, "private")), "historical private directory");
  const blindDir = directoryInsideRepo(absoluteRoot, relative(absoluteRoot, resolve(runPath, "blind")), "historical blind directory");
  const scoreFiles = readdirSync(scoreDir).filter((file) => file.endsWith(".json")).sort();
  if (scoreFiles.length !== expectedCount) fail(`Historical Shape evidence requires ${expectedCount} scores`);
  const packetIds = new Set<string>();
  const observedCoordinates = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const packet of runRaw.packets) {
    assertRecord(packet as unknown, "historical run packet");
    assertExactKeys(packet, ["packet_id", "task_id", "status"], "historical run packet");
    assertString(packet.packet_id, "historical packet id");
    assertString(packet.task_id, "historical packet task id");
    if (!/^[a-f0-9]{32}$/.test(packet.packet_id)
      || packet.status !== "success"
      || packetIds.has(packet.packet_id)) {
      fail(`Historical packet is invalid: ${packet.packet_id}`);
    }
    packetIds.add(packet.packet_id);
    const scorePath = resolve(scoreDir, `${packet.packet_id}.json`);
    const privatePath = resolve(privateDir, `${packet.packet_id}.json`);
    const blindPath = resolve(blindDir, `${packet.packet_id}.json`);
    const score = validateLockedShapeScore(readJson(scorePath), `historical score ${packet.packet_id}`);
    const coordinate = readJson(privatePath);
    const blind = readJson(blindPath);
    assertRecord(coordinate, `historical private coordinate ${packet.packet_id}`);
    assertRecord(blind, `historical blind packet ${packet.packet_id}`);
    assertExactKeys(
      coordinate,
      ["schema", "packet_id", "coordinate_id", "task_id", "condition", "repetition", "prompt_sha256", "agent", "model", "sampling", "exit_code"],
      `historical private coordinate ${packet.packet_id}`
    );
    assertExactKeys(
      blind,
      ["schema", "packet_id", "task_id", "experiment", "task_input", "response"],
      `historical blind packet ${packet.packet_id}`
    );
    if (coordinate.schema !== "repo-harness-bdd2-private-coordinate.v2"
      || coordinate.packet_id !== packet.packet_id
      || coordinate.task_id !== packet.task_id
      || score.packet_id !== packet.packet_id
      || score.task_id !== packet.task_id
      || blind.schema !== "repo-harness-bdd2-blind-packet.v2"
      || blind.packet_id !== packet.packet_id
      || blind.task_id !== packet.task_id
      || blind.experiment !== "S") {
      fail(`Historical score/private identity mismatch: ${packet.packet_id}`);
    }
    if (coordinate.condition !== "baseline" && coordinate.condition !== "treatment") {
      fail(`Historical coordinate condition is invalid: ${packet.packet_id}`);
    }
    if (!Number.isInteger(coordinate.repetition)
      || Number(coordinate.repetition) < 1
      || Number(coordinate.repetition) > shapeDefinition.repetitions) {
      fail(`Historical coordinate repetition is invalid: ${packet.packet_id}`);
    }
    const coordinateKey = `${packet.task_id}\0${coordinate.condition}\0${coordinate.repetition}`;
    const expectedCoordinate = expectedCoordinates.get(coordinateKey);
    if (!expectedCoordinate || observedCoordinates.has(coordinateKey)) {
      fail(`Historical coordinate is missing, duplicated, or unexpected: ${packet.packet_id}`);
    }
    observedCoordinates.add(coordinateKey);
    if (coordinate.coordinate_id !== expectedCoordinate.coordinateId) {
      fail(`Historical coordinate id drift: ${packet.packet_id}`);
    }
    if (coordinate.prompt_sha256 !== expectedCoordinate.promptSha256) {
      fail(`Historical coordinate prompt hash drift: ${packet.packet_id}`);
    }
    if (coordinate.agent !== runRaw.agent
      || coordinate.model !== runRaw.model
      || JSON.stringify(coordinate.sampling) !== JSON.stringify(runRaw.sampling)
      || coordinate.exit_code !== 0) {
      fail(`Historical coordinate agent metadata drift: ${packet.packet_id}`);
    }
    const task = shapeTasks.find((candidate) => candidate.id === packet.task_id);
    if (!task || blind.task_input !== task.agent_input) {
      fail(`Historical blind packet task input drift: ${packet.packet_id}`);
    }
    assertString(blind.response, `historical blind packet ${packet.packet_id}.response`);
    const expectedAuthority = truth.shape_tasks[packet.task_id]?.expected_authority;
    if (!["inline", "brief", "prd"].includes(expectedAuthority)) fail(`Historical truth is missing for ${packet.task_id}`);
    rows.push({
      packet_id: packet.packet_id,
      task_id: packet.task_id,
      condition: coordinate.condition,
      repetition: coordinate.repetition,
      unsupported_expansion: score.score.unsupported_expansion,
      required_behavior_omission: score.score.required_behavior_omission,
      protected_p0_p1_count: score.score.protected_concern_omissions.filter((item) => item.severity === "P0" || item.severity === "P1").length,
      authority_fit: score.score.authority_fit,
      expected_authority: expectedAuthority,
      escalation_correct: score.score.escalation_correct,
      unnecessary_tracked_artifact_count: score.score.unnecessary_tracked_artifact_count,
      correction_minutes: score.score.correction_minutes,
      score_sha256: sha256File(scorePath),
      private_sha256: sha256File(privatePath),
    });
  }
  if (observedCoordinates.size !== expectedCoordinates.size) {
    fail(`Historical Shape run is missing ${expectedCoordinates.size - observedCoordinates.size} coordinates`);
  }
  rows.sort((left, right) => String(left.task_id).localeCompare(String(right.task_id))
    || String(left.condition).localeCompare(String(right.condition))
    || Number(left.repetition) - Number(right.repetition));
  const projection = {
    schema: "repo-harness-bdd2-shape-evidence.v1",
    projector_sha256: sha256File(SCRIPT_PATH),
    source_commit: runRaw.source_commit,
    run_manifest_sha256: runRaw.manifest_sha256,
    packet_count: expectedCount,
    rows,
  };
  const outputPath = resolve(absoluteRoot, outputRelativePath);
  assertWritePath(absoluteRoot, outputPath);
  writeJson(outputPath, projection);
  return projection;
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

function writeAuditEvidenceProjection(
  repoRoot: string,
  validated: ValidatedAuditScores,
  outputRelativePath: string
): Record<string, unknown> {
  const rows = [...validated.privateCoordinates.entries()].map(([packetId, coordinate]) => {
    const score = validated.scores.get(packetId);
    if (!score) fail(`Missing validated Audit score for packet: ${packetId}`);
    const truthTask = validated.truth.audit_tasks[coordinate.task_id];
    if (!truthTask) fail(`Missing Audit truth for task: ${coordinate.task_id}`);
    const truthById = new Map(truthTask.issues.map((issue) => [issue.id, issue]));
    const findings = score.score.findings.map((finding) => {
      const truthIssue = finding.matched_truth_issue_id ? truthById.get(finding.matched_truth_issue_id) : undefined;
      const severityDistance = truthIssue ? Math.abs(severityIndex(finding.reported_severity) - severityIndex(truthIssue.severity)) : null;
      const severeUnderestimation = Boolean(
        truthIssue
        && (truthIssue.severity === "P0" || truthIssue.severity === "P1")
        && severityIndex(finding.reported_severity) > severityIndex(truthIssue.severity)
      );
      return {
        ref: finding.ref,
        reported_severity: finding.reported_severity,
        matched_truth_issue_id: finding.matched_truth_issue_id,
        truth_severity: truthIssue?.severity ?? null,
        severity_distance: severityDistance,
        severity_agreement: severityDistance === null ? null : severityDistance <= 1,
        severe_underestimation: severeUnderestimation,
      };
    });
    const matchedCount = findings.filter((finding) => finding.matched_truth_issue_id !== null).length;
    return {
      packet_id: packetId,
      task_id: coordinate.task_id,
      condition: coordinate.condition,
      repetition: coordinate.repetition,
      clean: truthTask.clean,
      truth_issues: truthTask.issues.map((issue) => ({ id: issue.id, severity: issue.severity, taxonomy: issue.taxonomy })),
      verdict: score.score.verdict,
      findings,
      finding_count: score.score.findings.length,
      matched_truth_issue_count: matchedCount,
      false_positive_count: score.score.findings.length - matchedCount,
      severity_agreement_count: findings.filter((finding) => finding.severity_agreement === true).length,
      severe_underestimation_count: findings.filter((finding) => finding.severe_underestimation).length,
      correction_minutes: score.score.correction_minutes,
      score_sha256: sha256File(resolve(validated.runPath, "scores", `${packetId}.json`)),
      private_sha256: sha256File(resolve(validated.runPath, "private", `${packetId}.json`)),
      blind_sha256: sha256File(resolve(validated.runPath, "blind", `${packetId}.json`)),
    };
  }).sort((left, right) => left.task_id.localeCompare(right.task_id)
    || left.condition.localeCompare(right.condition)
    || left.repetition - right.repetition);
  const projection = {
    schema: "repo-harness-bdd2-audit-evidence.v2",
    projector_sha256: sha256File(SCRIPT_PATH),
    source_commit: validated.run.source_commit,
    run_manifest_sha256: validated.run.manifest_sha256,
    packet_count: rows.length,
    evidence_grade: "condition-blind-agent-panel-proxy",
    rows,
  };
  const outputPath = resolve(repoRoot, outputRelativePath);
  assertWritePath(repoRoot, outputPath);
  writeJson(outputPath, projection);
  return projection;
}

export function projectAuditEvidence(
  evaluation: ValidatedEvaluation,
  runRelativePath: string,
  outputRelativePath: string
): Record<string, unknown> {
  return writeAuditEvidenceProjection(
    evaluation.repoRoot,
    validateAuditScores(evaluation, runRelativePath),
    outputRelativePath
  );
}

export function projectHistoricalAuditEvidence(
  repoRoot: string,
  runRelativePath: string,
  outputRelativePath: string
): Record<string, unknown> {
  return writeAuditEvidenceProjection(
    resolve(repoRoot),
    validateHistoricalAuditScores(repoRoot, runRelativePath),
    outputRelativePath
  );
}

function auditRate(numerator: number, denominator: number, label: string, zeroValue?: number): number {
  if (denominator === 0) {
    if (zeroValue !== undefined) return zeroValue;
    fail(`${label} denominator must be nonzero`);
  }
  return Number((numerator / denominator).toFixed(6));
}

function severityIndex(severity: "P0" | "P1" | "P2" | "P3"): number {
  return ["P0", "P1", "P2", "P3"].indexOf(severity);
}

export function evaluateAuditGates(
  treatment: AuditSummary["metrics"][ConditionId]
): AuditSummary["gates"] {
  return {
    precision: treatment.precision >= 0.7,
    seeded_recall: treatment.seeded_recall >= 0.8,
    severe_seeded_recall: treatment.severe_seeded_recall === 1,
    clean_false_positive_rate: treatment.clean_false_positive_rate <= 0.2,
    correct_no_findings_rate: treatment.correct_no_findings_rate >= 0.8,
    severity_agreement_rate: treatment.severity_agreement_rate >= 0.85,
    no_severe_underestimation: treatment.severe_underestimations === 0,
  };
}

function summarizeValidatedAudit(
  repoRoot: string,
  validated: ValidatedAuditScores,
  markdownOutput?: string
): AuditSummary {
  const metrics = {} as AuditSummary["metrics"];
  for (const condition of ["baseline", "treatment"] as const) {
    const packetIds = [...validated.privateCoordinates.entries()]
      .filter(([, coordinate]) => coordinate.condition === condition)
      .map(([packetId]) => packetId);
    let reportedFindings = 0;
    let truePositiveFindings = 0;
    let seededIssues = 0;
    let matchedSeededIssues = 0;
    let severeSeededIssues = 0;
    let matchedSevereSeededIssues = 0;
    let cleanOutputs = 0;
    let cleanFalsePositiveOutputs = 0;
    let correctNoFindings = 0;
    let severityAgreements = 0;
    let severityMatches = 0;
    let severeUnderestimations = 0;
    const correctionMinutes: number[] = [];
    for (const packetId of packetIds) {
      const coordinate = validated.privateCoordinates.get(packetId)!;
      const score = validated.scores.get(packetId)!;
      const truthTask = validated.truth.audit_tasks[coordinate.task_id];
      const truthById = new Map(truthTask.issues.map((issue) => [issue.id, issue]));
      reportedFindings += score.score.findings.length;
      seededIssues += truthTask.issues.length;
      severeSeededIssues += truthTask.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1").length;
      correctionMinutes.push(score.score.correction_minutes);
      if (truthTask.clean) {
        cleanOutputs += 1;
        if (score.score.findings.length > 0) cleanFalsePositiveOutputs += 1;
        if (score.score.verdict === "pass" && score.score.findings.length === 0) correctNoFindings += 1;
      }
      for (const finding of score.score.findings) {
        if (!finding.matched_truth_issue_id) continue;
        const truthIssue = truthById.get(finding.matched_truth_issue_id);
        if (!truthIssue) fail(`Validated Audit score lost truth match: ${finding.matched_truth_issue_id}`);
        truePositiveFindings += 1;
        matchedSeededIssues += 1;
        if (truthIssue.severity === "P0" || truthIssue.severity === "P1") matchedSevereSeededIssues += 1;
        severityMatches += 1;
        const reportedIndex = severityIndex(finding.reported_severity);
        const truthIndex = severityIndex(truthIssue.severity);
        if (Math.abs(reportedIndex - truthIndex) <= 1) severityAgreements += 1;
        if ((truthIssue.severity === "P0" || truthIssue.severity === "P1") && reportedIndex > truthIndex) severeUnderestimations += 1;
      }
    }
    metrics[condition] = {
      reported_findings: reportedFindings,
      true_positive_findings: truePositiveFindings,
      seeded_issues: seededIssues,
      matched_seeded_issues: matchedSeededIssues,
      severe_seeded_issues: severeSeededIssues,
      matched_severe_seeded_issues: matchedSevereSeededIssues,
      clean_outputs: cleanOutputs,
      clean_false_positive_outputs: cleanFalsePositiveOutputs,
      correct_no_findings: correctNoFindings,
      severity_agreements: severityAgreements,
      severity_matches: severityMatches,
      severe_underestimations: severeUnderestimations,
      correction_minutes_median: median(correctionMinutes),
      precision: auditRate(truePositiveFindings, reportedFindings, `${condition} precision`, 1),
      seeded_recall: auditRate(matchedSeededIssues, seededIssues, `${condition} seeded recall`),
      severe_seeded_recall: auditRate(matchedSevereSeededIssues, severeSeededIssues, `${condition} severe seeded recall`),
      clean_false_positive_rate: auditRate(cleanFalsePositiveOutputs, cleanOutputs, `${condition} clean false-positive rate`),
      correct_no_findings_rate: auditRate(correctNoFindings, cleanOutputs, `${condition} correct no-findings rate`),
      severity_agreement_rate: auditRate(severityAgreements, severityMatches, `${condition} severity agreement`, 1),
    };
  }
  const treatment = metrics.treatment;
  const gates = evaluateAuditGates(treatment);
  const summary: AuditSummary = {
    schema: "repo-harness-bdd2-audit-summary.v1",
    source_commit: validated.run.source_commit,
    run_manifest_sha256: validated.run.manifest_sha256,
    packet_count: validated.run.packets.length,
    score_count: validated.scores.size,
    metrics,
    gates,
    decision: Object.values(gates).every(Boolean) ? "Pass" : "Kill",
  };
  writeJson(resolve(validated.runPath, "audit-summary.json"), summary);
  if (markdownOutput) {
    const outputPath = resolve(repoRoot, markdownOutput);
    assertWritePath(repoRoot, outputPath);
    const runPathForReport = relative(repoRoot, validated.runPath).replace(/\\/g, "/");
    const metricRows = (["baseline", "treatment"] as const).map((condition) => {
      const item = metrics[condition];
      return `| ${condition} | ${(item.precision * 100).toFixed(1)}% | ${(item.seeded_recall * 100).toFixed(1)}% | ${(item.severe_seeded_recall * 100).toFixed(1)}% | ${(item.clean_false_positive_rate * 100).toFixed(1)}% | ${(item.correct_no_findings_rate * 100).toFixed(1)}% | ${(item.severity_agreement_rate * 100).toFixed(1)}% | ${item.severe_underestimations} | ${item.correction_minutes_median} |`;
    }).join("\n");
    const gateRows = Object.entries(gates).map(([gate, passed]) => `| ${gate} | ${passed ? "PASS" : "FAIL"} |`).join("\n");
    const markdown = `# BDD² Experiment A Report\n\n> **Decision**: ${summary.decision}\n> **Source commit**: \`${summary.source_commit}\`\n> **Raw evidence**: \`${runPathForReport}\` (ignored; local evaluation evidence)\n> **Packets / locked scores**: ${summary.packet_count} / ${summary.score_count}\n> **Evidence grade**: condition-blind Agent-panel proxy; this is not a human-panel claim.\n\n## Metrics\n\n| Condition | Precision | Seeded recall | P0/P1 recall | Clean FP | Correct no-findings | Severity agreement | P0/P1 underestimation | Median correction minutes |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${metricRows}\n\n## Treatment gates\n\n| Gate | Result |\n|---|---|\n${gateRows}\n\n## Decision rationale\n\nThe decision is computed from the frozen rules in \`evals/bdd2/metrics/audit-metrics.md\`; it is not manually overridden. Agent adjudication is proxy evidence and may share model-family biases with the evaluated outputs.\n`;
    writeFileSync(outputPath, markdown, "utf-8");
  }
  return summary;
}

export function summarizeAudit(
  evaluation: ValidatedEvaluation,
  runRelativePath: string,
  markdownOutput?: string
): AuditSummary {
  return summarizeValidatedAudit(
    evaluation.repoRoot,
    validateAuditScores(evaluation, runRelativePath),
    markdownOutput
  );
}

export function summarizeHistoricalAudit(
  repoRoot: string,
  runRelativePath: string,
  markdownOutput?: string
): AuditSummary {
  return summarizeValidatedAudit(
    resolve(repoRoot),
    validateHistoricalAuditScores(repoRoot, runRelativePath),
    markdownOutput
  );
}

interface CliOptions {
  command: "validate" | "plan" | "run" | "validate-scores" | "summarize-shape" | "project-shape-evidence" | "summarize-audit" | "project-audit-evidence" | "validate-historical-audit-scores" | "summarize-historical-audit" | "project-historical-audit-evidence";
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
  if (!["validate", "plan", "run", "validate-scores", "summarize-shape", "project-shape-evidence", "summarize-audit", "project-audit-evidence", "validate-historical-audit-scores", "summarize-historical-audit", "project-historical-audit-evidence"].includes(String(command))) {
    fail("Usage: run-bdd2-evals.ts <validate|plan|run|validate-scores|summarize-shape|project-shape-evidence|summarize-audit|project-audit-evidence|validate-historical-audit-scores|summarize-historical-audit|project-historical-audit-evidence> [--manifest path] [--experiment S|A] [--partition development|held_out] [--task id] [--condition baseline|treatment] [--repetitions n] [--agent name] [--run path] [--output path] [--dry-run]");
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
  if (options.command === "project-shape-evidence") {
    if (!options.run) fail("project-shape-evidence requires --run");
    if (!options.output) fail("project-shape-evidence requires --output");
    console.log(JSON.stringify(projectHistoricalShapeEvidence(REPO_ROOT, options.run, options.output), null, 2));
    return;
  }
  if (options.command === "validate-historical-audit-scores") {
    if (!options.run) fail("validate-historical-audit-scores requires --run");
    const validated = validateHistoricalAuditScores(REPO_ROOT, options.run);
    console.log(JSON.stringify({ status: "valid", packets: validated.run.packets.length, scores: validated.scores.size }, null, 2));
    return;
  }
  if (options.command === "project-historical-audit-evidence") {
    if (!options.run) fail("project-historical-audit-evidence requires --run");
    if (!options.output) fail("project-historical-audit-evidence requires --output");
    console.log(JSON.stringify(projectHistoricalAuditEvidence(REPO_ROOT, options.run, options.output), null, 2));
    return;
  }
  if (options.command === "summarize-historical-audit") {
    if (!options.run) fail("summarize-historical-audit requires --run");
    console.log(JSON.stringify(summarizeHistoricalAudit(REPO_ROOT, options.run, options.output), null, 2));
    return;
  }
  const evaluation = validateEvaluation(REPO_ROOT, options.manifest);
  if (options.command === "project-audit-evidence") {
    if (!options.run) fail("project-audit-evidence requires --run");
    if (!options.output) fail("project-audit-evidence requires --output");
    console.log(JSON.stringify(projectAuditEvidence(evaluation, options.run, options.output), null, 2));
    return;
  }
  if (options.command === "validate") {
    console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiments: Object.fromEntries(Object.entries(evaluation.manifest.experiments).map(([id, experiment]) => [id, { freeze: experiment.freeze, held_out_task_count: experiment.held_out_task_count }])), task_counts: { development: evaluation.tasks.development.length, held_out: evaluation.tasks.held_out.length } }, null, 2));
    return;
  }
  if (options.command === "validate-scores" || options.command === "summarize-shape" || options.command === "summarize-audit") {
    if (options.command === "summarize-shape" && options.experiment !== "S") fail("summarize-shape requires --experiment S");
    if (options.command === "summarize-audit" && options.experiment !== "A") fail("summarize-audit requires --experiment A");
    if (options.command === "validate-scores" && options.experiment !== "S" && options.experiment !== "A") fail("validate-scores requires --experiment S or A");
    if (!options.run) fail(`${options.command} requires --run`);
    if (options.command === "validate-scores") {
      const validated = options.experiment === "S"
        ? validateShapeScores(evaluation, options.run)
        : validateAuditScores(evaluation, options.run);
      console.log(JSON.stringify({ status: "valid", packets: validated.run.packets.length, scores: validated.scores.size }, null, 2));
    } else if (options.command === "summarize-shape") {
      console.log(JSON.stringify(summarizeShape(evaluation, options.run, options.output), null, 2));
    } else {
      console.log(JSON.stringify(summarizeAudit(evaluation, options.run, options.output), null, 2));
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

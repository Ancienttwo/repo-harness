#!/usr/bin/env bun

import { createHash, randomBytes } from "crypto";
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir, tmpdir } from "os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..");
export const DEFAULT_MANIFEST_PATH = "evals/bdd2/evaluation-manifest.json";

export type ExperimentId = "S2" | "EB" | "EI" | "I2";
export type PartitionId = "development" | "held_out";
export type ConditionId = "control" | "treatment";
export type FreezeState = "foundation" | "sealed";
export type ExperimentKind = "inline-shape" | "browser-adapter" | "imagegen-adapter" | "implementation-pilot";

export interface FileReference { path: string; sha256: string }
interface AppendixReference { appendix: FileReference; assets: FileReference[] }
interface PromptReference { prompt: string; sha256: string }
interface FreezeReference { id: string; state: FreezeState; sealed_at: string | null }

interface CommonExperiment {
  kind: ExperimentKind;
  freeze: FreezeReference;
  repetitions: number;
  held_out_task_count: number;
  conditions: Record<ConditionId, PromptReference>;
}

interface ShapeExperiment extends CommonExperiment { kind: "inline-shape" }
interface AdapterExperiment extends CommonExperiment {
  kind: "browser-adapter" | "imagegen-adapter";
  appendices: Record<string, AppendixReference>;
}
interface PilotExperiment extends CommonExperiment {
  kind: "implementation-pilot";
  fixture: FileReference & { acceptance: FileReference; acceptance_command: string[] };
  prerequisite: { shape: "Pass" | "NotRun"; adapters: { EB: "Pass" | "Fail" | "NotRun"; EI: "Pass" | "Fail" | "NotRun" } };
}
export type ExperimentDefinition = ShapeExperiment | AdapterExperiment | PilotExperiment;

export interface AgentProfile {
  command: string;
  args: string[];
  version_args: string[];
  expected_version: string;
  response_schema: FileReference;
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  input_source: "stdin";
  response_source: "stdout";
  workspace_mode: "isolated";
  credential_mode: "none" | "codex-auth-copy";
  transport: "model-transport-only";
  tools: { browser: false; web_search: false; mcp: false; external: false; repository: false };
}

interface AdjudicationAuthority {
  score_schema: string;
  score_schema_sha256: string;
  metrics: string;
  metrics_sha256: string;
}

export interface EvaluationManifest {
  schema: "repo-harness-bdd2-evaluation.e2";
  runner: FileReference;
  output_root: string;
  experiments: { S2: ShapeExperiment; EB: AdapterExperiment; EI: AdapterExperiment; I2: PilotExperiment };
  partitions: Record<PartitionId, { tasks: string; tasks_sha256: string; truth: string; truth_sha256: string }>;
  adjudication: {
    rubric: string;
    rubric_sha256: string;
    reviewers: { outcome: [string, string]; evidence: string; owner: string };
    correction_costs: Record<string, number>;
    experiments: Record<ExperimentId, AdjudicationAuthority>;
  };
  agents: Record<string, AgentProfile>;
  historical_phase_e: FileReference[];
}

export interface EvaluationTask {
  id: string;
  experiment: ExperimentId;
  title: string;
  agent_input: string;
  named_uncertainty?: string;
}
interface TaskSet { schema: "repo-harness-bdd2-task-set.e2"; partition: PartitionId; tasks: EvaluationTask[] }

export interface ProtectedConcern { concern: string; severity: "P0" | "P1" | "P2" | "P3"; summary: string }
interface TruthEntry {
  kind: ExperimentKind;
  risk_tags?: string[];
  required_behaviors?: string[];
  unsupported_expansions?: string[];
  protected_concerns: ProtectedConcern[];
  expected_authority?: "inline" | "prd";
  escalation_required?: boolean;
  reference_pattern?: string;
  forbidden_inference?: string;
  expected_disposition?: "Adopt" | "Adapt" | "Avoid" | "Defer";
  required_boundary?: string[];
  unsupported_concepts?: string[];
  uncertainty_closable_by_browser?: boolean;
  prototype_can_close_uncertainty?: boolean;
  expected_resolution?: string;
  fixture?: string;
  required_acceptance?: string[];
}
interface TruthSet { schema: "repo-harness-bdd2-truth-set.e2"; partition: PartitionId; tasks: Record<string, TruthEntry> }

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
export interface RunOptions extends PlanOptions { agent: string; outputPath?: string; now?: Date }

export interface StructuredAgentResponse {
  schema: "repo-harness-bdd2-agent-response.e2";
  outcome: {
    boundary_decision: string;
    required_behaviors: string[];
    recovery_and_trust: string[];
    exposed_user_concepts: string[];
    excluded_behaviors: string[];
    authority: "inline" | "prd";
  };
  evidence_use?: {
    adopted_claims: string[];
    adapted_claims: string[];
    avoided_claims: string[];
    unsupported_claims: string[];
  };
}

export interface RunReport {
  schema: "repo-harness-bdd2-run.e2";
  freeze_id: string;
  source_commit: string;
  manifest_sha256: string;
  agent: string;
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  experiment: ExperimentId;
  partition: PartitionId;
  output_path: string;
  packets: Array<{
    packet_id: string;
    task_id: string;
    status: "success";
    full_response_sha256: string;
    normalized_outcome_sha256: string;
    fixture_capture?: { source_tree_sha256: string; final_tree_sha256: string; patch_sha256: string; tests_sha256: string; inventory_sha256: string };
  }>;
}

function fail(message: string): never { throw new Error(message) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> { if (!isRecord(value)) fail(`${label} must be an object`) }
function assertString(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`) }
function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.join("\n") !== expected.join("\n")) fail(`${label} keys must be exactly [${expected.join(", ")}], got [${actual.join(", ")}]`);
}
function readJson(path: string): unknown { try { return JSON.parse(readFileSync(path, "utf-8")) } catch (error) { fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`) } }
export function sha256Text(value: string): string { return createHash("sha256").update(value).digest("hex") }
export function sha256File(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex") }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function canonicalJson(value: unknown): string { return `${JSON.stringify(stable(value))}\n` }

function authorityPath(repoRoot: string, relativePath: string, label: string): string {
  assertString(relativePath, label);
  if (isAbsolute(relativePath)) fail(`${label} must be repository-relative`);
  const path = resolve(repoRoot, relativePath); const prefix = `${resolve(repoRoot)}${sep}`;
  if (path !== resolve(repoRoot) && !path.startsWith(prefix)) fail(`${label} escapes repository root`);
  if (!existsSync(path)) fail(`${label} does not exist: ${relativePath}`);
  if (lstatSync(path).isSymbolicLink()) fail(`${label} must not be a symbolic link`);
  const real = realpathSync(path); const realRoot = realpathSync(repoRoot);
  if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) fail(`${label} resolves outside repository root`);
  return path;
}
function verifyHash(repoRoot: string, reference: FileReference, label: string): string {
  if (!/^[a-f0-9]{64}$/.test(reference.sha256)) fail(`${label} sha256 is not frozen`);
  const path = authorityPath(repoRoot, reference.path, label);
  const actual = lstatSync(path).isDirectory() ? hashTree(path) : sha256File(path);
  if (actual !== reference.sha256) fail(`${label} sha256 drift: expected ${reference.sha256}, got ${actual}`);
  return path;
}
function validateFileRef(repoRoot: string, raw: unknown, label: string): string {
  assertRecord(raw, label); assertExactKeys(raw, ["path", "sha256"], label); assertString(raw.path, `${label}.path`); assertString(raw.sha256, `${label}.sha256`);
  return verifyHash(repoRoot, raw as unknown as FileReference, label);
}
function validatePromptRef(repoRoot: string, raw: unknown, label: string): string {
  assertRecord(raw, label); assertExactKeys(raw, ["prompt", "sha256"], label); assertString(raw.prompt, `${label}.prompt`); assertString(raw.sha256, `${label}.sha256`);
  return verifyHash(repoRoot, { path: raw.prompt, sha256: raw.sha256 }, label);
}
function assertStringArray(value: unknown, label: string, allowEmpty = false): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string array`);
}
function expectedKind(id: ExperimentId): ExperimentKind { return { S2: "inline-shape", EB: "browser-adapter", EI: "imagegen-adapter", I2: "implementation-pilot" }[id] as ExperimentKind }

function validateFreeze(raw: unknown, label: string): void {
  assertRecord(raw, label); assertExactKeys(raw, ["id", "state", "sealed_at"], label); assertString(raw.id, `${label}.id`);
  if (raw.state !== "foundation" && raw.state !== "sealed") fail(`${label}.state is invalid`);
  if (raw.state === "foundation" && raw.sealed_at !== null) fail(`${label} foundation cannot have sealed_at`);
  if (raw.state === "sealed") { assertString(raw.sealed_at, `${label}.sealed_at`); if (Number.isNaN(Date.parse(raw.sealed_at))) fail(`${label}.sealed_at must be ISO date-time`); }
}

function validateExperiment(repoRoot: string, id: ExperimentId, raw: unknown, authority: string[]): void {
  assertRecord(raw, `experiments.${id}`);
  const common = ["kind", "freeze", "repetitions", "held_out_task_count", "conditions"];
  const extra = id === "EB" || id === "EI" ? ["appendices"] : id === "I2" ? ["fixture", "prerequisite"] : [];
  assertExactKeys(raw, [...common, ...extra], `experiments.${id}`);
  if (raw.kind !== expectedKind(id)) fail(`experiments.${id}.kind mismatch`);
  validateFreeze(raw.freeze, `experiments.${id}.freeze`);
  const expectedRepetitions = id === "S2" ? 3 : 2;
  const expectedCount = id === "S2" ? 12 : id === "I2" ? 1 : 6;
  if (raw.repetitions !== expectedRepetitions) fail(`${id} repetitions must be exactly ${expectedRepetitions}`);
  if (raw.held_out_task_count !== expectedCount) fail(`${id} held_out_task_count must be exactly ${expectedCount}`);
  assertRecord(raw.conditions, `experiments.${id}.conditions`); assertExactKeys(raw.conditions, ["control", "treatment"], `experiments.${id}.conditions`);
  authority.push(validatePromptRef(repoRoot, raw.conditions.control, `${id} control prompt`), validatePromptRef(repoRoot, raw.conditions.treatment, `${id} treatment prompt`));
  if (id === "EB" || id === "EI") {
    assertRecord(raw.appendices, `experiments.${id}.appendices`);
    for (const [taskId, bundle] of Object.entries(raw.appendices)) {
      assertRecord(bundle, `${id} appendix ${taskId}`);
      assertExactKeys(bundle, ["appendix", "assets"], `${id} appendix ${taskId}`);
      authority.push(validateFileRef(repoRoot, bundle.appendix, `${id} appendix ${taskId} metadata`));
      if (!Array.isArray(bundle.assets) || bundle.assets.length === 0) fail(`${id} appendix ${taskId}.assets must be a non-empty array`);
      for (const [index, asset] of bundle.assets.entries()) authority.push(validateFileRef(repoRoot, asset, `${id} appendix ${taskId} asset[${index}]`));
    }
  }
  if (id === "I2") {
    assertRecord(raw.fixture, "experiments.I2.fixture"); assertExactKeys(raw.fixture, ["path", "sha256", "acceptance", "acceptance_command"], "experiments.I2.fixture");
    assertStringArray(raw.fixture.acceptance_command, "experiments.I2.fixture.acceptance_command");
    authority.push(verifyHash(repoRoot, { path: String(raw.fixture.path), sha256: String(raw.fixture.sha256) }, "I2 fixture"));
    authority.push(validateFileRef(repoRoot, raw.fixture.acceptance, "I2 hidden acceptance"));
    assertRecord(raw.prerequisite, "experiments.I2.prerequisite"); assertExactKeys(raw.prerequisite, ["shape", "adapters"], "experiments.I2.prerequisite");
    if (raw.prerequisite.shape !== "Pass" && raw.prerequisite.shape !== "NotRun") fail("I2 prerequisite.shape is invalid");
    assertRecord(raw.prerequisite.adapters, "experiments.I2.prerequisite.adapters"); assertExactKeys(raw.prerequisite.adapters, ["EB", "EI"], "experiments.I2.prerequisite.adapters");
    for (const adapter of ["EB", "EI"] as const) if (!["Pass", "Fail", "NotRun"].includes(String(raw.prerequisite.adapters[adapter]))) fail(`I2 prerequisite.adapters.${adapter} is invalid`);
  }
}

function validateTasks(raw: unknown, partition: PartitionId): TaskSet {
  assertRecord(raw, `${partition} task set`); assertExactKeys(raw, ["schema", "partition", "tasks"], `${partition} task set`);
  if (raw.schema !== "repo-harness-bdd2-task-set.e2" || raw.partition !== partition || !Array.isArray(raw.tasks)) fail(`${partition} task set identity mismatch`);
  const ids = new Set<string>();
  const tasks = raw.tasks.map((entry, index): EvaluationTask => {
    const label = `${partition}.tasks[${index}]`; assertRecord(entry, label); assertString(entry.id, `${label}.id`); assertString(entry.title, `${label}.title`); assertString(entry.agent_input, `${label}.agent_input`);
    if (!["S2", "EB", "EI", "I2"].includes(String(entry.experiment))) fail(`${label}.experiment is invalid`);
    const adapter = entry.experiment === "EB" || entry.experiment === "EI";
    assertExactKeys(entry, adapter ? ["id", "experiment", "title", "agent_input", "named_uncertainty"] : ["id", "experiment", "title", "agent_input"], label);
    if (adapter) assertString(entry.named_uncertainty, `${label}.named_uncertainty`);
    if (ids.has(entry.id)) fail(`Duplicate task id: ${entry.id}`); ids.add(entry.id);
    return entry as unknown as EvaluationTask;
  });
  return { schema: "repo-harness-bdd2-task-set.e2", partition, tasks };
}

function validateTruth(raw: unknown, partition: PartitionId, tasks: EvaluationTask[]): void {
  assertRecord(raw, `${partition} truth`); assertExactKeys(raw, ["schema", "partition", "tasks"], `${partition} truth`);
  if (raw.schema !== "repo-harness-bdd2-truth-set.e2" || raw.partition !== partition) fail(`${partition} truth identity mismatch`);
  assertRecord(raw.tasks, `${partition}.truth.tasks`);
  if (Object.keys(raw.tasks).sort().join("\n") !== tasks.map((task) => task.id).sort().join("\n")) fail(`${partition} truth keys must match task ids exactly`);
  for (const task of tasks) {
    const entry = raw.tasks[task.id]; assertRecord(entry, `${partition}.truth.${task.id}`);
    const keys = task.experiment === "S2"
      ? ["kind", "risk_tags", "required_behaviors", "unsupported_expansions", "protected_concerns", "expected_authority", "escalation_required"]
      : task.experiment === "EB"
        ? ["kind", "reference_pattern", "forbidden_inference", "expected_disposition", "required_boundary", "unsupported_concepts", "protected_concerns", "uncertainty_closable_by_browser"]
        : task.experiment === "EI"
          ? ["kind", "forbidden_inference", "prototype_can_close_uncertainty", "expected_disposition", "expected_resolution", "required_boundary", "unsupported_concepts", "protected_concerns"]
          : ["kind", "fixture", "required_acceptance", "protected_concerns"];
    assertExactKeys(entry, keys, `${partition}.truth.${task.id}`);
    if (entry.kind !== expectedKind(task.experiment)) fail(`${partition}.truth.${task.id}.kind mismatch`);
    if (task.experiment === "S2") {
      assertStringArray(entry.risk_tags, `${task.id}.risk_tags`);
      assertStringArray(entry.required_behaviors, `${task.id}.required_behaviors`);
      assertStringArray(entry.unsupported_expansions, `${task.id}.unsupported_expansions`, true);
      if (entry.expected_authority !== "inline" && entry.expected_authority !== "prd") fail(`${task.id}.expected_authority invalid`);
      if (typeof entry.escalation_required !== "boolean" || (entry.expected_authority === "prd") !== entry.escalation_required) fail(`${task.id} authority/escalation mismatch`);
    } else if (task.experiment === "EB") {
      assertString(entry.reference_pattern, `${task.id}.reference_pattern`);
      assertString(entry.forbidden_inference, `${task.id}.forbidden_inference`);
      if (!["Adopt", "Adapt", "Avoid", "Defer"].includes(String(entry.expected_disposition))) fail(`${task.id}.expected_disposition invalid`);
      assertStringArray(entry.required_boundary, `${task.id}.required_boundary`);
      assertStringArray(entry.unsupported_concepts, `${task.id}.unsupported_concepts`, true);
      if (typeof entry.uncertainty_closable_by_browser !== "boolean") fail(`${task.id}.uncertainty_closable_by_browser must be boolean`);
    } else if (task.experiment === "EI") {
      assertString(entry.forbidden_inference, `${task.id}.forbidden_inference`);
      if (typeof entry.prototype_can_close_uncertainty !== "boolean") fail(`${task.id}.prototype_can_close_uncertainty must be boolean`);
      if (!["Adopt", "Adapt", "Avoid", "Defer"].includes(String(entry.expected_disposition))) fail(`${task.id}.expected_disposition invalid`);
      assertString(entry.expected_resolution, `${task.id}.expected_resolution`);
      assertStringArray(entry.required_boundary, `${task.id}.required_boundary`);
      assertStringArray(entry.unsupported_concepts, `${task.id}.unsupported_concepts`, true);
    } else {
      assertString(entry.fixture, `${task.id}.fixture`);
      assertStringArray(entry.required_acceptance, `${task.id}.required_acceptance`);
    }
    if (!Array.isArray(entry.protected_concerns)) fail(`${task.id}.protected_concerns must be an array`);
    for (const [index, concern] of entry.protected_concerns.entries()) {
      assertRecord(concern, `${task.id}.protected_concerns[${index}]`); assertExactKeys(concern, ["concern", "severity", "summary"], `${task.id}.protected_concerns[${index}]`);
      assertString(concern.concern, `${task.id}.protected_concerns[${index}].concern`); assertString(concern.summary, `${task.id}.protected_concerns[${index}].summary`);
      if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) fail(`${task.id}.protected_concerns[${index}].severity invalid`);
    }
  }
}

function validateAgentProfiles(repoRoot: string, manifest: EvaluationManifest, authority: string[]): void {
  for (const [id, raw] of Object.entries(manifest.agents)) {
    assertRecord(raw, `agents.${id}`); assertExactKeys(raw, ["command", "args", "version_args", "expected_version", "response_schema", "model", "sampling", "input_source", "response_source", "workspace_mode", "credential_mode", "transport", "tools"], `agents.${id}`);
    assertString(raw.command, `agents.${id}.command`); assertString(raw.expected_version, `agents.${id}.expected_version`); assertString(raw.model, `agents.${id}.model`);
    assertStringArray(raw.args, `agents.${id}.args`, true); assertStringArray(raw.version_args, `agents.${id}.version_args`, true); assertRecord(raw.sampling, `agents.${id}.sampling`);
    if (raw.input_source !== "stdin" || raw.response_source !== "stdout" || raw.workspace_mode !== "isolated") fail(`agents.${id} must be stdin/stdout isolated`);
    if (raw.credential_mode !== "none" && raw.credential_mode !== "codex-auth-copy") fail(`agents.${id}.credential_mode invalid`);
    if (raw.transport !== "model-transport-only") fail(`agents.${id}.transport must be model-transport-only`);
    assertRecord(raw.tools, `agents.${id}.tools`); assertExactKeys(raw.tools, ["browser", "web_search", "mcp", "external", "repository"], `agents.${id}.tools`);
    if (Object.values(raw.tools).some((value) => value !== false)) fail(`agents.${id} evaluated tools must all be disabled`);
    const templates = (raw.args as string[]).join("\n"); if (!templates.includes("{model}")) fail(`agents.${id}.args must apply {model}`);
    authority.push(validateFileRef(repoRoot, raw.response_schema, `agents.${id}.response_schema`));
  }
}

export function validateEvaluation(repoRoot: string = REPO_ROOT, manifestRelativePath: string = DEFAULT_MANIFEST_PATH): ValidatedEvaluation {
  const root = resolve(repoRoot); const manifestPath = authorityPath(root, manifestRelativePath, "manifest"); const raw = readJson(manifestPath);
  assertRecord(raw, "manifest"); assertExactKeys(raw, ["schema", "runner", "output_root", "experiments", "partitions", "adjudication", "agents", "historical_phase_e"], "manifest");
  if (raw.schema !== "repo-harness-bdd2-evaluation.e2") fail("Unsupported current evaluation manifest schema; Phase E v3 has no current-authority fallback");
  const authority = [manifestPath, validateFileRef(root, raw.runner, "runner")]; assertString(raw.output_root, "output_root");
  assertRecord(raw.experiments, "experiments"); assertExactKeys(raw.experiments, ["S2", "EB", "EI", "I2"], "experiments");
  for (const id of ["S2", "EB", "EI", "I2"] as const) validateExperiment(root, id, raw.experiments[id], authority);
  assertRecord(raw.partitions, "partitions"); assertExactKeys(raw.partitions, ["development", "held_out"], "partitions");
  const tasks = {} as Record<PartitionId, EvaluationTask[]>;
  for (const partition of ["development", "held_out"] as const) {
    const value = raw.partitions[partition]; assertRecord(value, `partitions.${partition}`); assertExactKeys(value, ["tasks", "tasks_sha256", "truth", "truth_sha256"], `partitions.${partition}`);
    const taskPath = verifyHash(root, { path: String(value.tasks), sha256: String(value.tasks_sha256) }, `${partition} tasks`);
    const truthPath = verifyHash(root, { path: String(value.truth), sha256: String(value.truth_sha256) }, `${partition} truth`); authority.push(taskPath, truthPath);
    const taskSet = validateTasks(readJson(taskPath), partition); validateTruth(readJson(truthPath), partition, taskSet.tasks); tasks[partition] = taskSet.tasks;
  }
  const ids = [...tasks.development, ...tasks.held_out].map((task) => task.id); if (new Set(ids).size !== ids.length) fail("E2 task ids must be unique across partitions");
  for (const id of ["S2", "EB", "EI", "I2"] as const) {
    const experiment = raw.experiments[id] as Record<string, unknown>; const freeze = experiment.freeze as Record<string, unknown>;
    if (freeze.state === "sealed") {
      const count = tasks.held_out.filter((task) => task.experiment === id).length;
      if (count !== experiment.held_out_task_count) fail(`Sealed ${id} requires exactly ${experiment.held_out_task_count} held-out tasks, got ${count}`);
      if (id === "EB" || id === "EI") {
        const taskIds = tasks.held_out.filter((task) => task.experiment === id).map((task) => task.id).sort();
        if (Object.keys(experiment.appendices as object).sort().join("\n") !== taskIds.join("\n")) fail(`${id} appendices must match held-out task ids exactly`);
      }
    }
  }
  assertRecord(raw.adjudication, "adjudication"); assertExactKeys(raw.adjudication, ["rubric", "rubric_sha256", "reviewers", "correction_costs", "experiments"], "adjudication");
  authority.push(verifyHash(root, { path: String(raw.adjudication.rubric), sha256: String(raw.adjudication.rubric_sha256) }, "adjudication rubric"));
  assertRecord(raw.adjudication.reviewers, "adjudication.reviewers"); assertExactKeys(raw.adjudication.reviewers, ["outcome", "evidence", "owner"], "adjudication.reviewers");
  const outcome = raw.adjudication.reviewers.outcome; if (!Array.isArray(outcome) || outcome.length !== 2 || outcome.some((v) => typeof v !== "string" || !v) || outcome[0] === outcome[1]) fail("Exactly two distinct locked outcome reviewers are required");
  assertString(raw.adjudication.reviewers.evidence, "adjudication.reviewers.evidence"); assertString(raw.adjudication.reviewers.owner, "adjudication.reviewers.owner");
  assertRecord(raw.adjudication.correction_costs, "adjudication.correction_costs"); if (Object.keys(raw.adjudication.correction_costs).length === 0 || Object.values(raw.adjudication.correction_costs).some((v) => typeof v !== "number" || v < 0)) fail("correction_costs must be a non-empty non-negative operation table");
  assertRecord(raw.adjudication.experiments, "adjudication.experiments"); assertExactKeys(raw.adjudication.experiments, ["S2", "EB", "EI", "I2"], "adjudication.experiments");
  for (const id of ["S2", "EB", "EI", "I2"] as const) {
    const value = raw.adjudication.experiments[id]; assertRecord(value, `adjudication.experiments.${id}`); assertExactKeys(value, ["score_schema", "score_schema_sha256", "metrics", "metrics_sha256"], `adjudication.experiments.${id}`);
    authority.push(verifyHash(root, { path: String(value.score_schema), sha256: String(value.score_schema_sha256) }, `${id} score schema`), verifyHash(root, { path: String(value.metrics), sha256: String(value.metrics_sha256) }, `${id} metrics`));
  }
  if (!Array.isArray(raw.historical_phase_e) || raw.historical_phase_e.length === 0) fail("historical_phase_e must freeze Phase E reports");
  for (const [index, ref] of raw.historical_phase_e.entries()) authority.push(validateFileRef(root, ref, `historical_phase_e[${index}]`));
  assertRecord(raw.agents, "agents"); const manifest = raw as unknown as EvaluationManifest;
  if (Object.values(manifest.experiments).some((exp) => exp.freeze.state === "sealed")) { if (Object.keys(manifest.agents).length === 0) fail("Sealed E2 authority requires an agent profile"); validateAgentProfiles(root, manifest, authority); }
  return { repoRoot: root, manifestPath, authorityPaths: [...new Set(authority)], manifest, tasks };
}

function coordinateId(parts: string[]): string { return sha256Text(parts.join("\0")).slice(0, 16) }
export function isI2Enabled(experiment: PilotExperiment): boolean { return experiment.prerequisite.shape === "Pass" && (experiment.prerequisite.adapters.EB === "Pass" || experiment.prerequisite.adapters.EI === "Pass") }
export function buildRunPlan(evaluation: ValidatedEvaluation, options: PlanOptions): RunCoordinate[] {
  if (!Object.hasOwn(evaluation.manifest.experiments, options.experiment)) fail(`Unknown E2 experiment: ${options.experiment}`);
  const experiment = evaluation.manifest.experiments[options.experiment]; if (options.experiment === "I2" && !isI2Enabled(experiment as PilotExperiment)) fail("I2 is gated-not-run until S2 and at least one adapter pass");
  const candidates = evaluation.tasks[options.partition].filter((task) => task.experiment === options.experiment);
  const wanted = new Set(options.taskIds ?? []); const selected = wanted.size === 0 ? candidates : candidates.filter((task) => wanted.has(task.id));
  if (selected.length === 0 || (wanted.size > 0 && selected.length !== wanted.size)) fail("No tasks selected or task ids mismatch the experiment");
  const conditions = options.conditions ?? ["control", "treatment"]; if (conditions.length === 0 || new Set(conditions).size !== conditions.length || conditions.some((c) => c !== "control" && c !== "treatment")) fail("conditions must contain unique control and/or treatment");
  const repetitions = options.repetitions ?? experiment.repetitions; if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > experiment.repetitions) fail(`repetitions must be 1..${experiment.repetitions}`);
  return selected.sort((a, b) => a.id.localeCompare(b.id)).flatMap((task) => conditions.flatMap((condition) => Array.from({ length: repetitions }, (_, index) => ({
    coordinateId: coordinateId([experiment.freeze.id, options.experiment, options.partition, task.id, condition, String(index + 1)]), experiment: options.experiment, partition: options.partition, taskId: task.id, condition, repetition: index + 1, promptPath: experiment.conditions[condition].prompt,
  }))));
}

export function buildAgentPacket(evaluation: ValidatedEvaluation, coordinate: RunCoordinate): string {
  const task = evaluation.tasks[coordinate.partition].find((entry) => entry.id === coordinate.taskId); if (!task) fail(`Missing task ${coordinate.taskId}`);
  const prompt = readFileSync(authorityPath(evaluation.repoRoot, coordinate.promptPath, "condition prompt"), "utf-8").trim();
  let appendix = "";
  if ((coordinate.experiment === "EB" || coordinate.experiment === "EI") && coordinate.condition === "treatment") {
    const experiment = evaluation.manifest.experiments[coordinate.experiment] as AdapterExperiment; const ref = experiment.appendices[coordinate.taskId]; if (!ref) fail(`Missing task-specific ${coordinate.experiment} appendix for ${coordinate.taskId}`);
    appendix = `\n\n## Frozen task-specific adapter appendix\n\n${readFileSync(authorityPath(evaluation.repoRoot, ref.appendix.path, "adapter appendix"), "utf-8").trim()}`;
  }
  return `${prompt}\n\n## Public task context\n\nTask ID: ${task.id}\n\n${task.agent_input.trim()}${appendix}\n`;
}

export function validateStructuredAgentResponse(raw: unknown, experiment: ExperimentId): StructuredAgentResponse {
  assertRecord(raw, "agent response");
  assertExactKeys(raw, ["schema", "outcome", "evidence_use"], "agent response"); if (raw.schema !== "repo-harness-bdd2-agent-response.e2") fail("agent response schema mismatch");
  assertRecord(raw.outcome, "agent response.outcome"); assertExactKeys(raw.outcome, ["boundary_decision", "required_behaviors", "recovery_and_trust", "exposed_user_concepts", "excluded_behaviors", "authority"], "agent response.outcome");
  assertString(raw.outcome.boundary_decision, "agent response.outcome.boundary_decision");
  for (const key of ["required_behaviors", "recovery_and_trust", "exposed_user_concepts", "excluded_behaviors"] as const) assertStringArray(raw.outcome[key], `agent response.outcome.${key}`, true);
  if (raw.outcome.authority !== "inline" && raw.outcome.authority !== "prd") fail("agent response.outcome.authority invalid");
  assertRecord(raw.evidence_use, "agent response.evidence_use"); assertExactKeys(raw.evidence_use, ["adopted_claims", "adapted_claims", "avoided_claims", "unsupported_claims"], "agent response.evidence_use"); for (const key of ["adopted_claims", "adapted_claims", "avoided_claims", "unsupported_claims"] as const) assertStringArray(raw.evidence_use[key], `agent response.evidence_use.${key}`, true);
  return raw as unknown as StructuredAgentResponse;
}
export function normalizeOutcome(task: EvaluationTask, response: StructuredAgentResponse): Record<string, unknown> {
  return stable({ schema: "repo-harness-bdd2-normalized-outcome.e2", task: { id: task.id, title: task.title, agent_input: task.agent_input, ...(task.named_uncertainty ? { named_uncertainty: task.named_uncertainty } : {}) }, outcome: response.outcome }) as Record<string, unknown>;
}

export function buildIsolatedAgentEnv(home: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!source.PATH) fail("Model-transport-only agent requires an explicit PATH");
  return { HOME: home, CODEX_HOME: home, PATH: source.PATH, TMPDIR: home, LANG: source.LANG ?? "C.UTF-8", LC_ALL: source.LC_ALL ?? "C.UTF-8", TERM: source.TERM ?? "dumb", NO_COLOR: "1" };
}
function deliverAgentCredential(home: string, profile: AgentProfile): void {
  if (profile.credential_mode !== "codex-auth-copy") return;
  const source = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
  if (!existsSync(source)) fail("codex-auth-copy requested but host auth.json is unavailable");
  cpSync(source, join(home, "auth.json"));
}
function expandArg(template: string, values: Record<string, string>): string { return template.replace(/\{(repo|response_schema|workspace|model|sampling\.[^}]+)\}/g, (_, key: string) => values[key] ?? fail(`Unknown argument placeholder {${key}}`)) }
function ensureNewDirectory(path: string): void { if (existsSync(path)) fail(`Output path already exists: ${path}`); mkdirSync(path, { recursive: true }) }
function assertWritePath(root: string, target: string): void { const resolved = resolve(target); if (resolved !== resolve(root) && !resolved.startsWith(`${resolve(root)}${sep}`)) fail("Output path escapes repository root"); let parent = dirname(resolved); while (!existsSync(parent)) parent = dirname(parent); if (!realpathSync(parent).startsWith(realpathSync(root))) fail("Output path resolves outside repository root"); if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) fail("Output path must not be a symbolic link") }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function cleanHeadCommit(root: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf-8" });
  if (result.status !== 0) fail("Cannot resolve source commit");
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf-8" });
  if (status.status !== 0 || status.stdout.trim().length > 0) fail("Sealed E2 execution requires a clean Git HEAD");
  return result.stdout.trim();
}
function assertAuthorityTrackedAtHead(evaluation: ValidatedEvaluation): void {
  for (const path of evaluation.authorityPaths) {
    const repositoryPath = relative(evaluation.repoRoot, path).replace(/\\/g, "/");
    const result = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", repositoryPath], { cwd: evaluation.repoRoot, encoding: "utf-8" });
    const tracked = result.stdout.split("\n").filter(Boolean);
    const present = lstatSync(path).isDirectory()
      ? tracked.some((entry) => entry.startsWith(`${repositoryPath}/`))
      : tracked.includes(repositoryPath);
    if (result.status !== 0 || !present) fail(`Sealed E2 authority must be tracked at HEAD: ${repositoryPath}`);
  }
}
function listFiles(root: string, current = root): string[] { return readdirSync(current, { withFileTypes: true }).flatMap((entry) => { const path = join(current, entry.name); if (entry.isSymbolicLink()) fail(`Fixture contains symlink: ${relative(root, path)}`); return entry.isDirectory() ? listFiles(root, path) : [relative(root, path).replace(/\\/g, "/")]; }).sort() }
function fileInventory(root: string): Array<{ path: string; sha256: string; bytes: number }> { return listFiles(root).map((path) => ({ path, sha256: sha256File(join(root, path)), bytes: statSync(join(root, path)).size })) }
export function hashTree(root: string): string { return sha256Text(canonicalJson(fileInventory(root))) }
function patchInventory(before: Array<{ path: string; sha256: string }>, after: Array<{ path: string; sha256: string }>): Record<string, unknown> { const a = new Map(before.map((v) => [v.path, v.sha256])); const b = new Map(after.map((v) => [v.path, v.sha256])); return { added: [...b.keys()].filter((p) => !a.has(p)).sort(), removed: [...a.keys()].filter((p) => !b.has(p)).sort(), changed: [...b.keys()].filter((p) => a.has(p) && a.get(p) !== b.get(p)).sort() }; }

export function runEvaluation(evaluation: ValidatedEvaluation, options: RunOptions): RunReport {
  const experiment = evaluation.manifest.experiments[options.experiment]; if (experiment.freeze.state !== "sealed") fail(`${options.experiment} is foundation-only`);
  const sourceCommit = cleanHeadCommit(evaluation.repoRoot);
  assertAuthorityTrackedAtHead(evaluation);
  const profile = evaluation.manifest.agents[options.agent]; if (!profile) fail(`Unknown agent profile: ${options.agent}`);
  const versionHome = mkdtempSync(join(tmpdir(), "bdd2-e2-version-")); const env = buildIsolatedAgentEnv(versionHome);
  try { const version = spawnSync(profile.command, profile.version_args, { encoding: "utf-8", env }); if (version.status !== 0 || version.stdout.trim() !== profile.expected_version) fail("Agent version mismatch"); } finally { rmSync(versionHome, { recursive: true, force: true }); }
  const outputRelative = options.outputPath ?? join(evaluation.manifest.output_root, `${options.experiment.toLowerCase()}-${Date.now()}`); const output = resolve(evaluation.repoRoot, outputRelative); assertWritePath(evaluation.repoRoot, output); ensureNewDirectory(output);
  for (const dir of ["full", "normalized", "private", "pilot"]) mkdirSync(join(output, dir));
  const packets: RunReport["packets"] = []; const used = new Set<string>();
  for (const coordinate of buildRunPlan(evaluation, options)) {
    let packetId = ""; do packetId = randomBytes(16).toString("hex"); while (used.has(packetId)); used.add(packetId);
    const home = mkdtempSync(join(tmpdir(), "bdd2-e2-home-")); let workspace = mkdtempSync(join(tmpdir(), "bdd2-e2-workspace-")); let before: ReturnType<typeof fileInventory> = []; let sourceTree = "";
    if (coordinate.experiment === "I2") { rmSync(workspace, { recursive: true, force: true }); workspace = mkdtempSync(join(tmpdir(), "bdd2-e2-i2-")); const fixture = (experiment as PilotExperiment).fixture; cpSync(authorityPath(evaluation.repoRoot, fixture.path, "I2 fixture"), workspace, { recursive: true }); before = fileInventory(workspace); sourceTree = hashTree(workspace); if (sourceTree !== fixture.sha256) fail("I2 fresh fixture tree hash drift"); }
    try {
      deliverAgentCredential(home, profile);
      const values: Record<string, string> = { repo: evaluation.repoRoot, response_schema: join(evaluation.repoRoot, profile.response_schema.path), model: profile.model, workspace }; for (const [key, value] of Object.entries(profile.sampling)) values[`sampling.${key}`] = String(value);
      const result = spawnSync(profile.command, profile.args.map((arg) => expandArg(arg, values)), { cwd: workspace, env: buildIsolatedAgentEnv(home), input: buildAgentPacket(evaluation, coordinate), encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
      if (result.status !== 0) fail(`Agent failed for ${coordinate.coordinateId}: ${result.stderr.trim()}`);
      const response = validateStructuredAgentResponse(JSON.parse(result.stdout), coordinate.experiment); const task = evaluation.tasks[coordinate.partition].find((entry) => entry.id === coordinate.taskId)!; const normalized = normalizeOutcome(task, response);
      const fullText = canonicalJson(response); const normalizedText = canonicalJson(normalized); writeFileSync(join(output, "full", `${packetId}.json`), fullText); writeFileSync(join(output, "normalized", `${packetId}.json`), normalizedText);
      let fixtureCapture: RunReport["packets"][number]["fixture_capture"];
      if (coordinate.experiment === "I2") {
        const pilot = experiment as PilotExperiment; const commandValues = { workspace, acceptance: join(evaluation.repoRoot, pilot.fixture.acceptance.path), repo: evaluation.repoRoot }; const command = pilot.fixture.acceptance_command.map((arg) => arg.replace(/\{(workspace|acceptance|repo)\}/g, (_, key: string) => commandValues[key as keyof typeof commandValues])); const test = spawnSync(command[0], command.slice(1), { cwd: workspace, encoding: "utf-8", env: buildIsolatedAgentEnv(home) }); const after = fileInventory(workspace); const patch = patchInventory(before, after); const tests = { command, exit_code: test.status, stdout: test.stdout, stderr: test.stderr }; const inventory = { before, after };
        writeJson(join(output, "pilot", `${packetId}.json`), { schema: "repo-harness-bdd2-pilot-capture.e2", source_tree_sha256: sourceTree, final_tree_sha256: hashTree(workspace), patch, tests, inventory });
        fixtureCapture = { source_tree_sha256: sourceTree, final_tree_sha256: hashTree(workspace), patch_sha256: sha256Text(canonicalJson(patch)), tests_sha256: sha256Text(canonicalJson(tests)), inventory_sha256: sha256Text(canonicalJson(inventory)) };
      }
      writeJson(join(output, "private", `${packetId}.json`), { schema: "repo-harness-bdd2-private-coordinate.e2", packet_id: packetId, coordinate_id: coordinate.coordinateId, task_id: coordinate.taskId, condition: coordinate.condition, repetition: coordinate.repetition, prompt_sha256: experiment.conditions[coordinate.condition].sha256, appendix_sha256: (coordinate.condition === "treatment" && (coordinate.experiment === "EB" || coordinate.experiment === "EI")) ? (experiment as AdapterExperiment).appendices[coordinate.taskId].appendix.sha256 : null, agent: options.agent, model: profile.model, sampling: profile.sampling, exit_code: 0 });
      packets.push({ packet_id: packetId, task_id: coordinate.taskId, status: "success", full_response_sha256: sha256Text(fullText), normalized_outcome_sha256: sha256Text(normalizedText), ...(fixtureCapture ? { fixture_capture: fixtureCapture } : {}) });
    } finally { rmSync(home, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }); }
  }
  const report: RunReport = { schema: "repo-harness-bdd2-run.e2", freeze_id: experiment.freeze.id, source_commit: sourceCommit, manifest_sha256: sha256File(evaluation.manifestPath), agent: options.agent, model: profile.model, sampling: profile.sampling, experiment: options.experiment, partition: options.partition, output_path: relative(evaluation.repoRoot, output).replace(/\\/g, "/"), packets };
  writeJson(join(output, "run.json"), report); return report;
}

export interface OutcomeScoreValue { uncertainty_closed: boolean; boundary_category: string; unsupported_expansion: number; unsupported_user_concepts: number; required_behavior_omission: number; protected_concern_omissions: ProtectedConcern[]; authority_fit: boolean; escalation_correct: boolean; unnecessary_tracked_artifact_count: number; correction_operations: string[]; notes: string }
export interface LockedOutcomeScore { schema: "repo-harness-bdd2-outcome-score.e2"; packet_id: string; task_id: string; experiment: ExperimentId; reviewer_id: string; normalized_outcome_sha256: string; locked_at: string; score: OutcomeScoreValue }
export function correctionCost(score: OutcomeScoreValue, costs: Record<string, number>): number { return score.correction_operations.reduce((total, operation) => total + (costs[operation] ?? fail(`Unknown correction operation: ${operation}`)), 0) }
function validateOutcomeScoreValue(raw: unknown, evaluation: ValidatedEvaluation, label = "outcome score.score"): OutcomeScoreValue {
  assertRecord(raw, label); assertExactKeys(raw, ["uncertainty_closed", "boundary_category", "unsupported_expansion", "unsupported_user_concepts", "required_behavior_omission", "protected_concern_omissions", "authority_fit", "escalation_correct", "unnecessary_tracked_artifact_count", "correction_operations", "notes"], label);
  if (typeof raw.uncertainty_closed !== "boolean" || typeof raw.authority_fit !== "boolean" || typeof raw.escalation_correct !== "boolean") fail(`${label} booleans invalid`); assertString(raw.boundary_category, `${label}.boundary_category`);
  for (const key of ["unsupported_expansion", "unsupported_user_concepts", "required_behavior_omission", "unnecessary_tracked_artifact_count"] as const) if (!Number.isInteger(raw[key]) || Number(raw[key]) < 0) fail(`${label}.${key} invalid`);
  assertStringArray(raw.correction_operations, `${label}.correction_operations`, true); if (new Set(raw.correction_operations).size !== raw.correction_operations.length) fail(`${label}.correction_operations must be unique`); for (const operation of raw.correction_operations) if (!Object.hasOwn(evaluation.manifest.adjudication.correction_costs, operation)) fail(`Unknown correction operation: ${operation}`);
  if (!Array.isArray(raw.protected_concern_omissions)) fail(`${label}.protected_concern_omissions must be array`);
  for (const [index, concern] of raw.protected_concern_omissions.entries()) { assertRecord(concern, `${label}.protected_concern_omissions[${index}]`); assertExactKeys(concern, ["concern", "severity", "summary"], `${label}.protected_concern_omissions[${index}]`); assertString(concern.concern, `${label}.protected_concern_omissions[${index}].concern`); assertString(concern.summary, `${label}.protected_concern_omissions[${index}].summary`); if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) fail(`${label}.protected_concern_omissions[${index}].severity invalid`); }
  if (typeof raw.notes !== "string") fail(`${label}.notes invalid`);
  return raw as unknown as OutcomeScoreValue;
}
function validateOutcomeScore(raw: unknown, evaluation: ValidatedEvaluation, packet: RunReport["packets"][number], experiment: ExperimentId): LockedOutcomeScore {
  assertRecord(raw, "outcome score"); assertExactKeys(raw, ["schema", "packet_id", "task_id", "experiment", "reviewer_id", "normalized_outcome_sha256", "locked_at", "score"], "outcome score");
  if (raw.schema !== "repo-harness-bdd2-outcome-score.e2" || raw.packet_id !== packet.packet_id || raw.task_id !== packet.task_id || raw.experiment !== experiment || raw.normalized_outcome_sha256 !== packet.normalized_outcome_sha256) fail("Outcome score authority mismatch");
  if (!evaluation.manifest.adjudication.reviewers.outcome.includes(String(raw.reviewer_id))) fail("Outcome score reviewer is not frozen"); if (typeof raw.locked_at !== "string" || Number.isNaN(Date.parse(raw.locked_at))) fail("Outcome score locked_at invalid");
  validateOutcomeScoreValue(raw.score, evaluation);
  return raw as unknown as LockedOutcomeScore;
}
export function outcomeScoresDisagree(a: OutcomeScoreValue, b: OutcomeScoreValue): boolean { const withoutNotes = (score: OutcomeScoreValue) => ({ ...score, notes: "", protected_concern_omissions: [...score.protected_concern_omissions].sort((x, y) => canonicalJson(x).localeCompare(canonicalJson(y))), correction_operations: [...score.correction_operations].sort() }); return canonicalJson(withoutNotes(a)) !== canonicalJson(withoutNotes(b)) }

function validateEvidenceScoreBody(raw: unknown, experiment: "EB" | "EI"): void {
  assertRecord(raw, "evidence score.score");
  const keys = experiment === "EB"
    ? ["provenance_complete", "question_bound", "privacy_reviewed", "adopt_adapt_avoid_complete", "unsupported_claim_count", "feature_need_inference_count", "notes"]
    : ["question_bound", "synthetic_labeled", "falsifier_present", "unsupported_claim_count", "user_validation_claim_count", "notes"];
  assertExactKeys(raw, keys, "evidence score.score");
  const booleans = experiment === "EB"
    ? ["provenance_complete", "question_bound", "privacy_reviewed", "adopt_adapt_avoid_complete"]
    : ["question_bound", "synthetic_labeled", "falsifier_present"];
  for (const key of booleans) if (typeof raw[key] !== "boolean") fail(`evidence score.score.${key} must be boolean`);
  const counts = experiment === "EB" ? ["unsupported_claim_count", "feature_need_inference_count"] : ["unsupported_claim_count", "user_validation_claim_count"];
  for (const key of counts) if (!Number.isInteger(raw[key]) || Number(raw[key]) < 0) fail(`evidence score.score.${key} must be a non-negative integer`);
  if (typeof raw.notes !== "string") fail("evidence score.score.notes must be a string");
}

export function validateScores(evaluation: ValidatedEvaluation, runRelativePath: string): { outcomeScoreCount: number; evidenceScoreCount: number; adjudicationCount: number } {
  const runRoot = authorityPath(evaluation.repoRoot, runRelativePath, "run directory"); const run = readJson(join(runRoot, "run.json")); assertRecord(run, "run"); if (run.schema !== "repo-harness-bdd2-run.e2") fail("Score validation requires E2 run");
  const report = run as unknown as RunReport; const expected = evaluation.manifest.experiments[report.experiment].held_out_task_count * 2 * evaluation.manifest.experiments[report.experiment].repetitions; if (report.partition === "held_out" && report.packets.length !== expected) fail(`Run packet count must be exactly ${expected}`);
  let outcomeCount = 0; let evidenceCount = 0; let adjudicationCount = 0;
  for (const packet of report.packets) {
    const normalizedPath = join(runRoot, "normalized", `${packet.packet_id}.json`); if (sha256File(normalizedPath) !== packet.normalized_outcome_sha256) fail("Normalized outcome hash drift");
    const fullPath = join(runRoot, "full", `${packet.packet_id}.json`); if (sha256File(fullPath) !== packet.full_response_sha256) fail("Full response hash drift");
    const task = evaluation.tasks[report.partition].find((entry) => entry.id === packet.task_id && entry.experiment === report.experiment); if (!task) fail(`Run packet references unknown ${report.experiment} task`);
    const response = validateStructuredAgentResponse(readJson(fullPath), report.experiment); if (canonicalJson(normalizeOutcome(task, response)) !== readFileSync(normalizedPath, "utf-8")) fail("Normalized outcome is not the deterministic structured-response projection");
    const privateCoordinate = readJson(join(runRoot, "private", `${packet.packet_id}.json`)); assertRecord(privateCoordinate, "private coordinate"); const condition = privateCoordinate.condition;
    const scoreDir = join(runRoot, "scores", "outcome", packet.packet_id); const files = existsSync(scoreDir) ? readdirSync(scoreDir).filter((f) => f.endsWith(".json")) : []; if (files.length !== 2) fail(`Packet ${packet.packet_id} requires exactly two outcome scores`);
    const scores = files.map((file) => validateOutcomeScore(readJson(join(scoreDir, file)), evaluation, packet, report.experiment)); if (new Set(scores.map((s) => s.reviewer_id)).size !== 2) fail(`Packet ${packet.packet_id} requires two distinct outcome reviewers`); outcomeCount += 2;
    const disagreement = outcomeScoresDisagree(scores[0].score, scores[1].score);
    const adjudicationPath = join(runRoot, "adjudications", `${packet.packet_id}.json`);
    if (disagreement) { if (!existsSync(adjudicationPath)) fail(`Packet ${packet.packet_id} disagreement requires locked pre-reveal owner adjudication`); const adjudication = readJson(adjudicationPath); assertRecord(adjudication, "adjudication"); assertExactKeys(adjudication, ["schema", "packet_id", "owner_id", "locked_at", "reason", "score"], "adjudication"); if (adjudication.schema !== "repo-harness-bdd2-owner-adjudication.e2" || adjudication.packet_id !== packet.packet_id || adjudication.owner_id !== evaluation.manifest.adjudication.reviewers.owner || typeof adjudication.reason !== "string" || Number.isNaN(Date.parse(String(adjudication.locked_at)))) fail("Adjudication authority mismatch"); if (Object.hasOwn(adjudication, "condition")) fail("Adjudication must be locked before condition reveal"); validateOutcomeScoreValue(adjudication.score, evaluation, "adjudication.score"); adjudicationCount += 1; }
    const evidenceRequired = (report.experiment === "EB" || report.experiment === "EI") && condition === "treatment"; const evidencePath = join(runRoot, "scores", "evidence", `${packet.packet_id}.json`);
    if (evidenceRequired) { if (!existsSync(evidencePath)) fail(`Treatment packet ${packet.packet_id} requires output-specific evidence-use score`); const evidence = readJson(evidencePath); assertRecord(evidence, "evidence score"); assertExactKeys(evidence, ["schema", "packet_id", "reviewer_id", "appendix_sha256", "full_response_sha256", "locked_at", "score"], "evidence score"); if (evidence.schema !== "repo-harness-bdd2-evidence-score.e2" || evidence.packet_id !== packet.packet_id || evidence.reviewer_id !== evaluation.manifest.adjudication.reviewers.evidence || evidence.full_response_sha256 !== packet.full_response_sha256 || evidence.appendix_sha256 !== privateCoordinate.appendix_sha256 || typeof evidence.locked_at !== "string" || Number.isNaN(Date.parse(evidence.locked_at))) fail("Evidence score authority mismatch"); validateEvidenceScoreBody(evidence.score, report.experiment as "EB" | "EI"); evidenceCount += 1; } else if (existsSync(evidencePath)) fail(`Evidence score is forbidden for ${report.experiment} ${condition} packet`);
  }
  return { outcomeScoreCount: outcomeCount, evidenceScoreCount: evidenceCount, adjudicationCount };
}

interface CliOptions { command: "validate" | "plan" | "run" | "validate-scores"; manifest: string; experiment?: ExperimentId; partition?: PartitionId; tasks: string[]; conditions: ConditionId[]; repetitions?: number; agent?: string; output?: string; run?: string }
export function parseCliArgs(args: string[]): CliOptions {
  const command = args[0]; if (!["validate", "plan", "run", "validate-scores"].includes(String(command))) fail("Usage: run-bdd2-evals.ts <validate|plan|run|validate-scores> [--experiment S2|EB|EI|I2] [--partition development|held_out]");
  const options: CliOptions = { command: command as CliOptions["command"], manifest: DEFAULT_MANIFEST_PATH, tasks: [], conditions: [] };
  for (let i = 1; i < args.length; i += 1) { const flag = args[i]; const next = () => { const value = args[++i]; if (!value || value.startsWith("--")) fail(`Missing value for ${flag}`); return value }; switch (flag) { case "--manifest": options.manifest = next(); break; case "--experiment": options.experiment = next() as ExperimentId; break; case "--partition": options.partition = next() as PartitionId; break; case "--task": options.tasks.push(next()); break; case "--condition": options.conditions.push(next() as ConditionId); break; case "--repetitions": options.repetitions = Number(next()); break; case "--agent": options.agent = next(); break; case "--output": options.output = next(); break; case "--run": options.run = next(); break; case "--dry-run": break; default: fail(`Unknown argument: ${flag}`); } }
  return options;
}
function requiredPlan(options: CliOptions): PlanOptions { if (!["S2", "EB", "EI", "I2"].includes(String(options.experiment))) fail("--experiment must be S2, EB, EI, or I2"); if (options.partition !== "development" && options.partition !== "held_out") fail("--partition must be development or held_out"); return { experiment: options.experiment!, partition: options.partition, taskIds: options.tasks.length ? options.tasks : undefined, conditions: options.conditions.length ? options.conditions : undefined, repetitions: options.repetitions }; }
export function main(args = process.argv.slice(2)): void {
  const options = parseCliArgs(args); const evaluation = validateEvaluation(REPO_ROOT, options.manifest);
  if (options.command === "validate") { console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiments: Object.keys(evaluation.manifest.experiments) }, null, 2)); return; }
  if (options.command === "validate-scores") { if (!options.run) fail("validate-scores requires --run"); console.log(JSON.stringify(validateScores(evaluation, options.run), null, 2)); return; }
  const plan = requiredPlan(options); if (options.command === "plan") { console.log(JSON.stringify({ coordinates: buildRunPlan(evaluation, plan) }, null, 2)); return; }
  if (!options.agent) fail("run requires --agent"); console.log(JSON.stringify(runEvaluation(evaluation, { ...plan, agent: options.agent, outputPath: options.output }), null, 2));
}
if (import.meta.main) { try { main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) } }

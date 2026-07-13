#!/usr/bin/env bun

import { createHash } from "crypto";
import { spawn, spawnSync } from "child_process";
import {
  chmodSync,
  cpSync,
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
import { homedir, tmpdir } from "os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..");
export const DEFAULT_MANIFEST_PATH = "evals/bdd2/evaluation-manifest.json";

export type ExperimentId = "S3" | "EB3" | "EI3";
export type SourceExperimentId = "S2" | "EB" | "EI";
export type ConditionId = "control" | "treatment";

export interface FileReference { path: string; sha256: string }
interface PromptReference { path: string; sha256: string }
interface ExperimentAuthority {
  kind: "inline-shape" | "browser-adapter" | "imagegen-adapter";
  source_experiment: SourceExperimentId;
  freeze_id: string;
  expected_rows: number;
  metrics: FileReference;
  score_manifest_sha256: string;
  result: { evidence: FileReference; report: FileReference };
  appendices?: Record<string, { appendix: FileReference; assets: FileReference[] }>;
}
interface ModelProfile {
  command: string;
  args: string[];
  version_args: string[];
  expected_version: string;
  model: string;
  sampling: Record<string, string | number | boolean | null>;
  credential_mode: "codex-auth-copy";
  transport: "model-transport-only";
  tools: { browser: false; web_search: false; mcp: false; external: false; repository: false };
  max_concurrency: number;
  max_attempts: number;
}
export interface EvaluationManifest {
  schema: "repo-harness-bdd2-evaluation.e3";
  runner: FileReference;
  output_root: string;
  source_corpus: FileReference;
  source_tasks: FileReference;
  source_truth: FileReference;
  experiments: Record<ExperimentId, ExperimentAuthority>;
  adjudication: {
    resolution: "fresh-adjudicator-score-on-canonical-disagreement";
    reviewers: { outcome: [string, string]; adjudicator: string; browser_evidence: string; imagegen_evidence: string };
    prompts: { outcome: PromptReference; adjudicator: PromptReference; browser_evidence: PromptReference; imagegen_evidence: PromptReference };
    schemas: { outcome: FileReference; browser_evidence: FileReference; imagegen_evidence: FileReference };
  };
  model_profile: ModelProfile;
  i3: {
    prerequisite: { shape: "Pass"; any_adapter: "Pass" };
    fixture: FileReference;
    acceptance: FileReference;
    acceptance_command: string[];
    baseline_prompt: FileReference;
    treatment_prompt: FileReference;
    treatment_context: FileReference;
    response_schema: FileReference;
    repetitions: 2;
  };
  historical_reports: FileReference[];
}

export interface CorpusRow {
  source_packet_id: string;
  experiment: ExperimentId;
  source_experiment: SourceExperimentId;
  task_id: string;
  condition: ConditionId;
  repetition: number;
  appendix_sha256: string | null;
  full_response_sha256: string;
  normalized_outcome_sha256: string;
  full_response: Record<string, unknown>;
  normalized_outcome: Record<string, unknown>;
}
interface SourceCorpus {
  schema: "repo-harness-bdd2-source-corpus.e3";
  sources: Array<{ source_experiment: SourceExperimentId; freeze_id: string; source_commit: string; run_manifest_sha256: string; packet_count: number }>;
  rows: CorpusRow[];
}
interface ProtectedConcern { concern: string; severity: "P0" | "P1" | "P2" | "P3"; summary: string }
export interface OutcomeScore {
  uncertainty_closed: boolean;
  boundary_category: string;
  unsupported_expansion: number;
  unsupported_user_concepts: number;
  required_behavior_omission: number;
  protected_concern_omissions: ProtectedConcern[];
  authority_fit: boolean;
  escalation_correct: boolean;
  correction_operations: string[];
  notes: string;
}
interface LockedOutcomeScore { schema: "repo-harness-bdd2-locked-outcome-score.e3"; packet_id: string; reviewer_id: string; locked_at: string; response_sha256: string; score: OutcomeScore }
interface LockedEvidenceScore { schema: "repo-harness-bdd2-locked-evidence-score.e3"; packet_id: string; reviewer_id: string; locked_at: string; response_sha256: string; score: Record<string, unknown> }
interface ScoreRun {
  schema: "repo-harness-bdd2-score-run.e3";
  freeze_id: string;
  source_commit: string;
  manifest_sha256: string;
  experiment: ExperimentId;
  output_path: string;
  packets: Array<{ packet_id: string; source_packet_id: string; task_id: string; condition: ConditionId; repetition: number; full_response_sha256: string; normalized_outcome_sha256: string; reviewer_score_sha256: [string, string]; adjudication_sha256: string | null; evidence_score_sha256: string | null }>;
}

function fail(message: string): never { throw new Error(message) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> { if (!isRecord(value)) fail(`${label} must be an object`) }
function assertString(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`) }
function assertStringArray(value: unknown, label: string, allowEmpty = false): asserts value is string[] { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string array`) }
function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.join("\n") !== expected.join("\n")) fail(`${label} keys must be exactly [${expected.join(", ")}], got [${actual.join(", ")}]`) }
function readJson(path: string): unknown { try { return JSON.parse(readFileSync(path, "utf-8")) } catch (error) { fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`) } }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
export function sha256Text(value: string): string { return createHash("sha256").update(value).digest("hex") }
export function sha256File(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex") }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value }
export function canonicalJson(value: unknown): string { return `${JSON.stringify(stable(value))}\n` }

function authorityPath(repoRoot: string, relativePath: string, label: string): string {
  assertString(relativePath, label); if (isAbsolute(relativePath)) fail(`${label} must be repository-relative`);
  const path = resolve(repoRoot, relativePath); const root = resolve(repoRoot); if (path !== root && !path.startsWith(`${root}${sep}`)) fail(`${label} escapes repository root`);
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) fail(`${label} is missing or a symlink: ${relativePath}`);
  const real = realpathSync(path); const realRoot = realpathSync(root); if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) fail(`${label} resolves outside repository root`); return path;
}
function validateRef(repoRoot: string, raw: unknown, label: string): string {
  assertRecord(raw, label); assertExactKeys(raw, ["path", "sha256"], label); assertString(raw.path, `${label}.path`); assertString(raw.sha256, `${label}.sha256`);
  if (!/^[a-f0-9]{64}$/.test(raw.sha256)) fail(`${label}.sha256 invalid`); const path = authorityPath(repoRoot, raw.path, label); const actual = sha256File(path); if (actual !== raw.sha256) fail(`${label} hash drift: expected ${raw.sha256}, got ${actual}`); return path;
}
function validatePromptRef(repoRoot: string, raw: unknown, label: string): string {
  assertRecord(raw, label); assertExactKeys(raw, ["path", "sha256"], label); return validateRef(repoRoot, raw, label);
}
function parseTasks(path: string): Record<string, Record<string, unknown>> {
  const raw = readJson(path); assertRecord(raw, "source tasks"); if (raw.schema !== "repo-harness-bdd2-task-set.e2" || raw.partition !== "held_out" || !Array.isArray(raw.tasks)) fail("source tasks identity mismatch");
  return Object.fromEntries(raw.tasks.map((item, index) => { assertRecord(item, `source tasks[${index}]`); assertString(item.id, `source tasks[${index}].id`); return [item.id, item] }));
}
function parseTruth(path: string): Record<string, Record<string, unknown>> {
  const raw = readJson(path); assertRecord(raw, "source truth"); if (raw.schema !== "repo-harness-bdd2-truth-set.e2" || raw.partition !== "held_out") fail("source truth identity mismatch"); assertRecord(raw.tasks, "source truth.tasks"); return raw.tasks as Record<string, Record<string, unknown>>;
}
function normalizedOutcomeFromSource(task: Record<string, unknown>, response: Record<string, unknown>, label: string): Record<string, unknown> {
  if (response.schema !== "repo-harness-bdd2-agent-response.e2") fail(`${label}.full_response schema invalid`);
  assertRecord(response.outcome, `${label}.full_response.outcome`);
  assertString(task.id, `${label}.task.id`); assertString(task.title, `${label}.task.title`); assertString(task.agent_input, `${label}.task.agent_input`);
  const normalizedTask: Record<string, unknown> = { id: task.id, title: task.title, agent_input: task.agent_input };
  if (task.named_uncertainty !== undefined) { assertString(task.named_uncertainty, `${label}.task.named_uncertainty`); normalizedTask.named_uncertainty = task.named_uncertainty }
  return stable({ schema: "repo-harness-bdd2-normalized-outcome.e2", task: normalizedTask, outcome: response.outcome }) as Record<string, unknown>;
}

function validateSourceProvenance(repoRoot: string, sources: SourceCorpus["sources"]): void {
  for (const source of sources) {
    const commit = spawnSync("git", ["cat-file", "-e", `${source.source_commit}^{commit}`], { cwd: repoRoot, encoding: "utf8" }); if (commit.status !== 0) fail(`source corpus commit is unavailable: ${source.source_commit}`);
    const manifest = spawnSync("git", ["show", `${source.source_commit}:evals/bdd2/evaluation-manifest.json`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }); if (manifest.status !== 0 || sha256Text(manifest.stdout) !== source.run_manifest_sha256) fail(`source corpus manifest provenance mismatch: ${source.source_experiment}`);
    let raw: unknown; try { raw = JSON.parse(manifest.stdout) } catch { fail(`source corpus manifest is invalid JSON: ${source.source_experiment}`) } assertRecord(raw, `source manifest ${source.source_experiment}`); assertRecord(raw.experiments, `source manifest ${source.source_experiment}.experiments`); const experiment = raw.experiments[source.source_experiment]; assertRecord(experiment, `source manifest ${source.source_experiment}.experiment`); assertRecord(experiment.freeze, `source manifest ${source.source_experiment}.freeze`); if (raw.schema !== "repo-harness-bdd2-evaluation.e2" || experiment.freeze.id !== source.freeze_id || experiment.freeze.state !== "sealed") fail(`source corpus freeze provenance mismatch: ${source.source_experiment}`);
  }
}

function validateCorpus(repoRoot: string, path: string, experiments: Record<ExperimentId, ExperimentAuthority>, tasks: Record<string, Record<string, unknown>>): SourceCorpus {
  const raw = readJson(path); assertRecord(raw, "source corpus"); assertExactKeys(raw, ["schema", "sources", "rows"], "source corpus"); if (raw.schema !== "repo-harness-bdd2-source-corpus.e3" || !Array.isArray(raw.sources) || !Array.isArray(raw.rows)) fail("source corpus identity mismatch");
  const sources = raw.sources.map((item, index): SourceCorpus["sources"][number] => {
    const label = `corpus.sources[${index}]`; assertRecord(item, label); assertExactKeys(item, ["source_experiment", "freeze_id", "source_commit", "run_manifest_sha256", "packet_count"], label);
    if (!Object.values({ S3: "S2", EB3: "EB", EI3: "EI" }).includes(String(item.source_experiment))) fail(`${label}.source_experiment invalid`);
    assertString(item.freeze_id, `${label}.freeze_id`); const expectedFreezePrefix = `bdd2-e2-${String(item.source_experiment).toLowerCase()}-`; if (!item.freeze_id.startsWith(expectedFreezePrefix) || !/^[a-f0-9]{40}$/.test(String(item.source_commit)) || !/^[a-f0-9]{64}$/.test(String(item.run_manifest_sha256)) || !Number.isInteger(item.packet_count) || Number(item.packet_count) < 1) fail(`${label} provenance invalid`);
    return item as unknown as SourceCorpus["sources"][number];
  });
  if (sources.length !== 3 || new Set(sources.map((source) => source.source_experiment)).size !== 3) fail("source corpus requires exactly one provenance record per source experiment");
  validateSourceProvenance(repoRoot, sources);
  const rows = raw.rows.map((item, index): CorpusRow => {
    assertRecord(item, `corpus.rows[${index}]`); assertExactKeys(item, ["source_packet_id", "experiment", "source_experiment", "task_id", "condition", "repetition", "appendix_sha256", "full_response_sha256", "normalized_outcome_sha256", "full_response", "normalized_outcome"], `corpus.rows[${index}]`);
    if (!Object.hasOwn(experiments, String(item.experiment)) || !["S2", "EB", "EI"].includes(String(item.source_experiment))) fail(`corpus.rows[${index}] experiment invalid`);
    const experiment = experiments[item.experiment as ExperimentId]; if (experiment.source_experiment !== item.source_experiment) fail(`corpus.rows[${index}] source experiment mismatch`);
    assertString(item.source_packet_id, `corpus.rows[${index}].source_packet_id`); assertString(item.task_id, `corpus.rows[${index}].task_id`); if (!/^[a-f0-9]{64}$/.test(String(item.full_response_sha256)) || !/^[a-f0-9]{64}$/.test(String(item.normalized_outcome_sha256))) fail(`corpus.rows[${index}] response hash invalid`);
    if (item.condition !== "control" && item.condition !== "treatment") fail(`corpus.rows[${index}] condition invalid`); if (!Number.isInteger(item.repetition) || Number(item.repetition) < 1) fail(`corpus.rows[${index}] repetition invalid`); assertRecord(item.full_response, `corpus.rows[${index}].full_response`); assertRecord(item.normalized_outcome, `corpus.rows[${index}].normalized_outcome`);
    if (sha256Text(canonicalJson(item.full_response)) !== item.full_response_sha256 || sha256Text(canonicalJson(item.normalized_outcome)) !== item.normalized_outcome_sha256) fail(`corpus.rows[${index}] embedded response hash drift`);
    const task = tasks[String(item.task_id)]; if (!task) fail(`corpus.rows[${index}] task missing`); const derived = normalizedOutcomeFromSource(task, item.full_response, `corpus.rows[${index}]`); if (canonicalJson(derived) !== canonicalJson(item.normalized_outcome)) fail(`corpus.rows[${index}] normalized outcome is not the deterministic full-response projection`);
    return item as unknown as CorpusRow;
  });
  const sourceIds = new Set<string>(); for (const row of rows) { if (sourceIds.has(row.source_packet_id)) fail("source corpus packet ids must be unique"); sourceIds.add(row.source_packet_id) }
  for (const id of ["S3", "EB3", "EI3"] as const) { const selected = rows.filter((row) => row.experiment === id); if (selected.length !== experiments[id].expected_rows) fail(`${id} corpus rows must be exactly ${experiments[id].expected_rows}`); const keys = new Set(selected.map((row) => `${row.task_id}:${row.condition}:${row.repetition}`)); if (keys.size !== selected.length) fail(`${id} corpus coordinates must be unique`); const source = sources.find((item) => item.source_experiment === experiments[id].source_experiment); if (!source || source.packet_count !== selected.length) fail(`${id} corpus provenance mismatch`); for (const row of selected) { const appendix = experiments[id].appendices?.[row.task_id]?.appendix.sha256; const expectedAppendix = row.condition === "treatment" && id !== "S3" ? appendix : null; if (expectedAppendix === undefined || row.appendix_sha256 !== expectedAppendix) fail(`${id} corpus appendix authority mismatch`) } }
  return { schema: "repo-harness-bdd2-source-corpus.e3", sources, rows };
}

export interface ValidatedEvaluation { repoRoot: string; manifestPath: string; manifest: EvaluationManifest; corpus: SourceCorpus; tasks: Record<string, Record<string, unknown>>; truth: Record<string, Record<string, unknown>>; authorityPaths: string[] }
export function validateEvaluation(repoRoot = REPO_ROOT, manifestRelativePath = DEFAULT_MANIFEST_PATH): ValidatedEvaluation {
  const root = resolve(repoRoot); const manifestPath = authorityPath(root, manifestRelativePath, "manifest"); const raw = readJson(manifestPath); assertRecord(raw, "manifest");
  assertExactKeys(raw, ["schema", "runner", "output_root", "source_corpus", "source_tasks", "source_truth", "experiments", "adjudication", "model_profile", "i3", "historical_reports"], "manifest"); if (raw.schema !== "repo-harness-bdd2-evaluation.e3") fail("Unsupported current evaluation manifest schema; no E2 compatibility fallback");
  const authority = [manifestPath, validateRef(root, raw.runner, "runner"), validateRef(root, raw.source_corpus, "source_corpus"), validateRef(root, raw.source_tasks, "source_tasks"), validateRef(root, raw.source_truth, "source_truth")]; assertString(raw.output_root, "output_root");
  assertRecord(raw.experiments, "experiments"); assertExactKeys(raw.experiments, ["S3", "EB3", "EI3"], "experiments");
  for (const id of ["S3", "EB3", "EI3"] as const) { const exp = raw.experiments[id]; assertRecord(exp, `experiments.${id}`); const adapter = id !== "S3"; assertExactKeys(exp, adapter ? ["kind", "source_experiment", "freeze_id", "expected_rows", "metrics", "score_manifest_sha256", "result", "appendices"] : ["kind", "source_experiment", "freeze_id", "expected_rows", "metrics", "score_manifest_sha256", "result"], `experiments.${id}`); assertString(exp.freeze_id, `${id}.freeze_id`); if (!/^[a-f0-9]{64}$/.test(String(exp.score_manifest_sha256))) fail(`${id}.score_manifest_sha256 invalid`); assertRecord(exp.result, `${id}.result`); assertExactKeys(exp.result, ["evidence", "report"], `${id}.result`); authority.push(validateRef(root, exp.result.evidence, `${id}.result.evidence`), validateRef(root, exp.result.report, `${id}.result.report`)); if (exp.source_experiment !== ({ S3: "S2", EB3: "EB", EI3: "EI" } as const)[id]) fail(`${id}.source_experiment invalid`); if (exp.kind !== ({ S3: "inline-shape", EB3: "browser-adapter", EI3: "imagegen-adapter" } as const)[id]) fail(`${id}.kind invalid`); const expected = id === "S3" ? 72 : 24; if (exp.expected_rows !== expected) fail(`${id}.expected_rows must be ${expected}`); authority.push(validateRef(root, exp.metrics, `${id}.metrics`)); if (adapter) { assertRecord(exp.appendices, `${id}.appendices`); for (const [taskId, bundle] of Object.entries(exp.appendices)) { assertRecord(bundle, `${id}.appendices.${taskId}`); assertExactKeys(bundle, ["appendix", "assets"], `${id}.appendices.${taskId}`); authority.push(validateRef(root, bundle.appendix, `${id}.${taskId}.appendix`)); if (!Array.isArray(bundle.assets) || bundle.assets.length === 0) fail(`${id}.${taskId}.assets must be non-empty`); for (const asset of bundle.assets) authority.push(validateRef(root, asset, `${id}.${taskId}.asset`)) } } }
  assertRecord(raw.adjudication, "adjudication"); assertExactKeys(raw.adjudication, ["resolution", "reviewers", "prompts", "schemas"], "adjudication"); if (raw.adjudication.resolution !== "fresh-adjudicator-score-on-canonical-disagreement") fail("adjudication resolution invalid");
  assertRecord(raw.adjudication.reviewers, "adjudication.reviewers"); assertExactKeys(raw.adjudication.reviewers, ["outcome", "adjudicator", "browser_evidence", "imagegen_evidence"], "adjudication.reviewers"); if (!Array.isArray(raw.adjudication.reviewers.outcome) || raw.adjudication.reviewers.outcome.length !== 2) fail("exactly two outcome reviewers required"); const roles = [...raw.adjudication.reviewers.outcome, raw.adjudication.reviewers.adjudicator, raw.adjudication.reviewers.browser_evidence, raw.adjudication.reviewers.imagegen_evidence]; if (roles.some((role) => typeof role !== "string" || !role) || new Set(roles).size !== roles.length) fail("reviewer roles must be distinct non-empty ids");
  assertRecord(raw.adjudication.prompts, "adjudication.prompts"); assertExactKeys(raw.adjudication.prompts, ["outcome", "adjudicator", "browser_evidence", "imagegen_evidence"], "adjudication.prompts"); for (const key of ["outcome", "adjudicator", "browser_evidence", "imagegen_evidence"] as const) authority.push(validatePromptRef(root, raw.adjudication.prompts[key], `adjudication.prompts.${key}`));
  assertRecord(raw.adjudication.schemas, "adjudication.schemas"); assertExactKeys(raw.adjudication.schemas, ["outcome", "browser_evidence", "imagegen_evidence"], "adjudication.schemas"); for (const key of ["outcome", "browser_evidence", "imagegen_evidence"] as const) authority.push(validateRef(root, raw.adjudication.schemas[key], `adjudication.schemas.${key}`));
  assertRecord(raw.model_profile, "model_profile"); assertExactKeys(raw.model_profile, ["command", "args", "version_args", "expected_version", "model", "sampling", "credential_mode", "transport", "tools", "max_concurrency", "max_attempts"], "model_profile"); assertString(raw.model_profile.command, "model_profile.command"); if (!isAbsolute(raw.model_profile.command) || !raw.model_profile.command.endsWith("/codex")) fail("model_profile.command must be an absolute codex CLI path"); assertString(raw.model_profile.expected_version, "model_profile.expected_version"); assertString(raw.model_profile.model, "model_profile.model"); assertStringArray(raw.model_profile.args, "model_profile.args"); assertStringArray(raw.model_profile.version_args, "model_profile.version_args", true); assertRecord(raw.model_profile.sampling, "model_profile.sampling"); if (raw.model_profile.credential_mode !== "codex-auth-copy" || raw.model_profile.transport !== "model-transport-only" || !Number.isInteger(raw.model_profile.max_concurrency) || Number(raw.model_profile.max_concurrency) < 1 || Number(raw.model_profile.max_concurrency) > 16 || !Number.isInteger(raw.model_profile.max_attempts) || Number(raw.model_profile.max_attempts) < 1 || Number(raw.model_profile.max_attempts) > 3) fail("model_profile isolation/concurrency/attempts invalid"); assertRecord(raw.model_profile.tools, "model_profile.tools"); assertExactKeys(raw.model_profile.tools, ["browser", "web_search", "mcp", "external", "repository"], "model_profile.tools"); if (Object.values(raw.model_profile.tools).some((value) => value !== false)) fail("model_profile tools must all be disabled");
  assertRecord(raw.i3, "i3"); assertExactKeys(raw.i3, ["prerequisite", "fixture", "acceptance", "acceptance_command", "baseline_prompt", "treatment_prompt", "treatment_context", "response_schema", "repetitions"], "i3"); assertRecord(raw.i3.prerequisite, "i3.prerequisite"); if (raw.i3.prerequisite.shape !== "Pass" || raw.i3.prerequisite.any_adapter !== "Pass" || raw.i3.repetitions !== 2) fail("i3 prerequisite/repetitions invalid"); for (const key of ["fixture", "acceptance", "baseline_prompt", "treatment_prompt", "treatment_context", "response_schema"] as const) authority.push(validateRef(root, raw.i3[key], `i3.${key}`)); assertStringArray(raw.i3.acceptance_command, "i3.acceptance_command");
  if (!Array.isArray(raw.historical_reports) || raw.historical_reports.length < 12) fail("historical_reports must freeze Phase E and E2 reports"); for (const [index, ref] of raw.historical_reports.entries()) authority.push(validateRef(root, ref, `historical_reports[${index}]`));
  const manifest = raw as unknown as EvaluationManifest; const tasks = parseTasks(authorityPath(root, manifest.source_tasks.path, "source_tasks")); const truth = parseTruth(authorityPath(root, manifest.source_truth.path, "source_truth")); const corpus = validateCorpus(root, authorityPath(root, manifest.source_corpus.path, "source_corpus"), manifest.experiments, tasks);
  for (const row of corpus.rows) { const task = tasks[row.task_id]; if (!task || !truth[row.task_id] || task.experiment !== row.source_experiment) fail(`corpus row ${row.source_packet_id} task/truth mismatch`); const normalizedTask = row.normalized_outcome.task; assertRecord(normalizedTask, `corpus ${row.source_packet_id}.normalized.task`); if (normalizedTask.id !== row.task_id) fail(`corpus row ${row.source_packet_id} normalized task mismatch`) }
  return { repoRoot: root, manifestPath, manifest, corpus, tasks, truth, authorityPaths: [...new Set(authority)] };
}

export function opaquePacketId(freezeId: string, sourcePacketId: string): string { return sha256Text(`${freezeId}\0${sourcePacketId}\0score`).slice(0, 32) }
function publicNormalizedOutcome(row: CorpusRow): Record<string, unknown> { const normalized = structuredClone(row.normalized_outcome); assertRecord(normalized.task, "normalized task"); delete normalized.task.id; return normalized }
export function buildOutcomeReviewerPacket(evaluation: ValidatedEvaluation, row: CorpusRow): Record<string, unknown> { return { schema: "repo-harness-bdd2-outcome-review-packet.e3", packet_id: opaquePacketId(evaluation.manifest.experiments[row.experiment].freeze_id, row.source_packet_id), normalized_outcome: publicNormalizedOutcome(row), truth: evaluation.truth[row.task_id] } }
export function buildAdjudicatorPacket(evaluation: ValidatedEvaluation, row: CorpusRow, primary: [LockedOutcomeScore, LockedOutcomeScore]): Record<string, unknown> { return { ...buildOutcomeReviewerPacket(evaluation, row), schema: "repo-harness-bdd2-outcome-adjudication-packet.e3", primary_scores: primary.map((score) => ({ reviewer_id: score.reviewer_id, score: score.score })) } }
function buildEvidencePacket(evaluation: ValidatedEvaluation, row: CorpusRow): Record<string, unknown> { const exp = evaluation.manifest.experiments[row.experiment]; if (row.experiment !== "EB3" && row.experiment !== "EI3") fail("evidence packet requires adapter row"); const bundle = exp.appendices?.[row.task_id]; if (!bundle || row.appendix_sha256 !== bundle.appendix.sha256) fail("adapter appendix authority mismatch"); return { schema: `repo-harness-bdd2-${row.experiment === "EB3" ? "browser" : "imagegen"}-evidence-review-packet.e3`, packet_id: opaquePacketId(exp.freeze_id, row.source_packet_id), full_response: row.full_response, truth: evaluation.truth[row.task_id], appendix_text: readFileSync(authorityPath(evaluation.repoRoot, bundle.appendix.path, "adapter appendix"), "utf-8") } }

export function validateOutcomeScore(raw: unknown, label = "outcome score"): OutcomeScore {
  assertRecord(raw, label); assertExactKeys(raw, ["uncertainty_closed", "boundary_category", "unsupported_expansion", "unsupported_user_concepts", "required_behavior_omission", "protected_concern_omissions", "authority_fit", "escalation_correct", "correction_operations", "notes"], label); if (typeof raw.uncertainty_closed !== "boolean" || typeof raw.authority_fit !== "boolean" || typeof raw.escalation_correct !== "boolean") fail(`${label} booleans invalid`); assertString(raw.boundary_category, `${label}.boundary_category`); assertString(raw.notes, `${label}.notes`); for (const key of ["unsupported_expansion", "unsupported_user_concepts", "required_behavior_omission"] as const) if (!Number.isInteger(raw[key]) || Number(raw[key]) < 0) fail(`${label}.${key} invalid`); assertStringArray(raw.correction_operations, `${label}.correction_operations`, true); if (new Set(raw.correction_operations).size !== raw.correction_operations.length) fail(`${label}.correction_operations must be unique`); if (!Array.isArray(raw.protected_concern_omissions)) fail(`${label}.protected_concern_omissions must be array`); for (const concern of raw.protected_concern_omissions) { assertRecord(concern, `${label}.protected_concern`); assertExactKeys(concern, ["concern", "severity", "summary"], `${label}.protected_concern`); assertString(concern.concern, `${label}.concern`); assertString(concern.summary, `${label}.summary`); if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) fail(`${label}.severity invalid`) } return raw as unknown as OutcomeScore;
}
function outcomeDisagrees(a: OutcomeScore, b: OutcomeScore): boolean { const stripNotes = (score: OutcomeScore) => ({ ...score, notes: "" }); return canonicalJson(stripNotes(a)) !== canonicalJson(stripNotes(b)) }
function validateModelResponse(raw: unknown, schema: string, packetId: string): Record<string, unknown> { assertRecord(raw, "model response"); assertExactKeys(raw, ["schema", "packet_id", "score"], "model response"); if (raw.schema !== schema || raw.packet_id !== packetId) fail("model response identity mismatch"); assertRecord(raw.score, "model response.score"); return raw.score }
function validateEvidenceScore(score: Record<string, unknown>, experiment: ExperimentId): void {
  const browser = experiment === "EB3"; const keys = browser ? ["provenance_complete", "question_bound", "privacy_reviewed", "adopt_adapt_avoid_complete", "unsupported_assertion_count", "explicit_limitation_count", "feature_need_inference_count", "notes"] : ["question_bound", "synthetic_labeled", "falsifier_present", "unsupported_assertion_count", "explicit_limitation_count", "user_validation_claim_count", "notes"]; assertExactKeys(score, keys, "evidence score"); assertString(score.notes, "evidence score.notes"); for (const [key, value] of Object.entries(score)) { if (key.endsWith("_count") && (!Number.isInteger(value) || Number(value) < 0)) fail(`evidence score.${key} invalid`); if (!key.endsWith("_count") && key !== "notes" && typeof value !== "boolean") fail(`evidence score.${key} invalid`) }
}

function buildIsolatedEnv(home: string): Record<string, string> { if (!process.env.PATH) fail("model transport requires PATH"); return { HOME: home, CODEX_HOME: home, PATH: process.env.PATH, TMPDIR: home, LANG: process.env.LANG ?? "C.UTF-8", LC_ALL: process.env.LC_ALL ?? "C.UTF-8", TERM: "dumb", NO_COLOR: "1" } }
function deliverCredential(home: string): void { const source = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"); if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) fail("codex auth unavailable or unsafe"); const target = join(home, "auth.json"); cpSync(source, target); chmodSync(target, 0o600) }
function expandArg(template: string, values: Record<string, string>): string { return template.replace(/\{(response_schema|model|sampling\.[^}]+)\}/g, (_, key: string) => values[key] ?? fail(`unknown model arg placeholder {${key}}`)) }
export async function runJsonProcess(command: string, args: string[], cwd: string, env: Record<string, string>, input: string): Promise<Record<string, unknown>> {
  return await new Promise((resolvePromise, reject) => { const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] }); let stdout = "", stderr = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk }); child.stderr.on("data", (chunk) => { stderr += chunk }); child.on("error", reject); child.stdin.on("error", (error) => { child.kill(); reject(error) }); child.on("close", (code) => { if (code !== 0) { reject(new Error(`model failed (${code}): ${stderr.trim()}`)); return } try { const parsed = JSON.parse(stdout); assertRecord(parsed, "model JSON response"); resolvePromise(parsed) } catch (error) { reject(new Error(`model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)) } }); child.stdin.end(input) });
}
interface ModelRuntime { repoRoot: string; manifest: { model_profile: ModelProfile } }
async function runModel(evaluation: ModelRuntime, schemaRef: FileReference, promptRef: PromptReference, packet: Record<string, unknown>, sectionLabel?: string): Promise<Record<string, unknown>> {
  const profile = evaluation.manifest.model_profile; const home = mkdtempSync(join(tmpdir(), "bdd2-e3-home-")); const workspace = mkdtempSync(join(tmpdir(), "bdd2-e3-workspace-"));
  try { deliverCredential(home); const values: Record<string, string> = { response_schema: resolve(evaluation.repoRoot, schemaRef.path), model: profile.model }; for (const [key, value] of Object.entries(profile.sampling)) values[`sampling.${key}`] = String(value); const args = profile.args.map((arg) => expandArg(arg, values)); const instruction = readFileSync(resolve(evaluation.repoRoot, promptRef.path), "utf-8").trim(); const input = `${instruction}\n\n## ${sectionLabel ?? "Frozen review packet"}\n\n${JSON.stringify(packet)}\n`;
    return await runJsonProcess(profile.command, args, workspace, buildIsolatedEnv(home), input)
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }) }
}
async function runValidatedModel<T>(evaluation: ModelRuntime, schemaRef: FileReference, promptRef: PromptReference, packet: Record<string, unknown>, validate: (raw: Record<string, unknown>) => T, sectionLabel?: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= evaluation.manifest.model_profile.max_attempts; attempt += 1) {
    try { return validate(await runModel(evaluation, schemaRef, promptRef, packet, sectionLabel)) } catch (error) { lastError = error }
  }
  fail(`model response failed after ${evaluation.manifest.model_profile.max_attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> { let next = 0; const workers = Array.from({ length: Math.min(limit, items.length) }, async () => { while (true) { const index = next++; if (index >= items.length) return; await fn(items[index], index) } }); await Promise.all(workers) }
function cleanHead(root: string): string { const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }); if (status.status !== 0 || status.stdout.trim()) fail("sealed E3 scoring requires clean Git HEAD"); const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }); if (head.status !== 0) fail("cannot resolve Git HEAD"); return head.stdout.trim() }
function assertAuthorityTracked(evaluation: { repoRoot: string; authorityPaths: string[] }): void { for (const path of evaluation.authorityPaths) { const rel = relative(evaluation.repoRoot, path).replace(/\\/g, "/"); const result = spawnSync("git", ["ls-files", "--error-unmatch", rel], { cwd: evaluation.repoRoot, encoding: "utf8" }); if (result.status !== 0) fail(`sealed authority must be tracked: ${rel}`) } }

export async function scoreExperiment(evaluation: ValidatedEvaluation, experiment: ExperimentId, outputRelative?: string): Promise<ScoreRun> {
  const sourceCommit = cleanHead(evaluation.repoRoot); assertAuthorityTracked(evaluation); const profile = evaluation.manifest.model_profile; const version = spawnSync(profile.command, profile.version_args, { encoding: "utf8" }); if (version.status !== 0 || version.stdout.trim() !== profile.expected_version) fail(`model CLI version mismatch: ${version.stdout.trim()}`);
  const outputPath = outputRelative ?? join(evaluation.manifest.output_root, `e3/${experiment.toLowerCase()}-${Date.now()}`); const output = resolve(evaluation.repoRoot, outputPath); if (!output.startsWith(`${resolve(evaluation.repoRoot)}${sep}`) || existsSync(output)) fail("score output path invalid or exists"); for (const dir of ["scores/outcome", "adjudications", "scores/evidence", "private"]) mkdirSync(join(output, dir), { recursive: true });
  const rows = evaluation.corpus.rows.filter((row) => row.experiment === experiment); const packetRecords = new Map<string, ScoreRun["packets"][number]>();
  await mapLimit(rows, profile.max_concurrency, async (row) => { const packetId = opaquePacketId(evaluation.manifest.experiments[experiment].freeze_id, row.source_packet_id); const reviewPacket = buildOutcomeReviewerPacket(evaluation, row); const locked: LockedOutcomeScore[] = [];
    for (const reviewerId of evaluation.manifest.adjudication.reviewers.outcome) { const result = await runValidatedModel(evaluation, evaluation.manifest.adjudication.schemas.outcome, evaluation.manifest.adjudication.prompts.outcome, reviewPacket, (raw) => ({ raw, score: validateOutcomeScore(validateModelResponse(raw, "repo-harness-bdd2-outcome-score-response.e3", packetId)) })); const responseSha = sha256Text(canonicalJson(result.raw)); const value: LockedOutcomeScore = { schema: "repo-harness-bdd2-locked-outcome-score.e3", packet_id: packetId, reviewer_id: reviewerId, locked_at: new Date().toISOString(), response_sha256: responseSha, score: result.score }; writeJson(join(output, "scores/outcome", packetId, `${reviewerId}.json`), value); locked.push(value) }
    let adjudicationSha: string | null = null; if (outcomeDisagrees(locked[0].score, locked[1].score)) { const result = await runValidatedModel(evaluation, evaluation.manifest.adjudication.schemas.outcome, evaluation.manifest.adjudication.prompts.adjudicator, buildAdjudicatorPacket(evaluation, row, locked as [LockedOutcomeScore, LockedOutcomeScore]), (raw) => ({ raw, score: validateOutcomeScore(validateModelResponse(raw, "repo-harness-bdd2-outcome-score-response.e3", packetId)) })); const value: LockedOutcomeScore = { schema: "repo-harness-bdd2-locked-outcome-score.e3", packet_id: packetId, reviewer_id: evaluation.manifest.adjudication.reviewers.adjudicator, locked_at: new Date().toISOString(), response_sha256: sha256Text(canonicalJson(result.raw)), score: result.score }; writeJson(join(output, "adjudications", `${packetId}.json`), value); adjudicationSha = sha256Text(canonicalJson(value)) }
    let evidenceSha: string | null = null; if (row.condition === "treatment" && (experiment === "EB3" || experiment === "EI3")) { const browser = experiment === "EB3"; const result = await runValidatedModel(evaluation, browser ? evaluation.manifest.adjudication.schemas.browser_evidence : evaluation.manifest.adjudication.schemas.imagegen_evidence, browser ? evaluation.manifest.adjudication.prompts.browser_evidence : evaluation.manifest.adjudication.prompts.imagegen_evidence, buildEvidencePacket(evaluation, row), (raw) => { const score = validateModelResponse(raw, `repo-harness-bdd2-${browser ? "browser" : "imagegen"}-evidence-score-response.e3`, packetId); validateEvidenceScore(score, experiment); return { raw, score } }); const value: LockedEvidenceScore = { schema: "repo-harness-bdd2-locked-evidence-score.e3", packet_id: packetId, reviewer_id: browser ? evaluation.manifest.adjudication.reviewers.browser_evidence : evaluation.manifest.adjudication.reviewers.imagegen_evidence, locked_at: new Date().toISOString(), response_sha256: sha256Text(canonicalJson(result.raw)), score: result.score }; writeJson(join(output, "scores/evidence", `${packetId}.json`), value); evidenceSha = sha256Text(canonicalJson(value)) }
    writeJson(join(output, "private", `${packetId}.json`), { schema: "repo-harness-bdd2-private-score-coordinate.e3", packet_id: packetId, source_packet_id: row.source_packet_id, task_id: row.task_id, condition: row.condition, repetition: row.repetition }); packetRecords.set(packetId, { packet_id: packetId, source_packet_id: row.source_packet_id, task_id: row.task_id, condition: row.condition, repetition: row.repetition, full_response_sha256: row.full_response_sha256, normalized_outcome_sha256: row.normalized_outcome_sha256, reviewer_score_sha256: [sha256Text(canonicalJson(locked[0])), sha256Text(canonicalJson(locked[1]))], adjudication_sha256: adjudicationSha, evidence_score_sha256: evidenceSha }) });
  const run: ScoreRun = { schema: "repo-harness-bdd2-score-run.e3", freeze_id: evaluation.manifest.experiments[experiment].freeze_id, source_commit: sourceCommit, manifest_sha256: sha256File(evaluation.manifestPath), experiment, output_path: relative(evaluation.repoRoot, output).replace(/\\/g, "/"), packets: [...packetRecords.values()].sort((a, b) => a.packet_id.localeCompare(b.packet_id)) }; writeJson(join(output, "run.json"), run); return run;
}

function lockedOutcome(path: string, packetId: string, reviewerId: string): LockedOutcomeScore { const raw = readJson(path); assertRecord(raw, "locked outcome score"); assertExactKeys(raw, ["schema", "packet_id", "reviewer_id", "locked_at", "response_sha256", "score"], "locked outcome score"); if (raw.schema !== "repo-harness-bdd2-locked-outcome-score.e3" || raw.packet_id !== packetId || raw.reviewer_id !== reviewerId || Number.isNaN(Date.parse(String(raw.locked_at))) || !/^[a-f0-9]{64}$/.test(String(raw.response_sha256))) fail("locked outcome score authority mismatch"); return { ...(raw as unknown as LockedOutcomeScore), score: validateOutcomeScore(raw.score) } }
export function validateScoreRun(evaluation: ValidatedEvaluation, runRelativePath: string): { outcomeScoreCount: number; evidenceScoreCount: number; adjudicationCount: number } {
  const root = authorityPath(evaluation.repoRoot, runRelativePath, "score run"); const raw = readJson(join(root, "run.json")); assertRecord(raw, "score run"); if (raw.schema !== "repo-harness-bdd2-score-run.e3" || !Object.hasOwn(evaluation.manifest.experiments, String(raw.experiment)) || !Array.isArray(raw.packets)) fail("score run identity mismatch"); const run = raw as unknown as ScoreRun; const experiment = evaluation.manifest.experiments[run.experiment]; if (run.freeze_id !== experiment.freeze_id || run.manifest_sha256 !== experiment.score_manifest_sha256 || run.output_path !== relative(evaluation.repoRoot, root).replace(/\\/g, "/")) fail("score run authority mismatch"); const corpus = new Map(evaluation.corpus.rows.filter((row) => row.experiment === run.experiment).map((row) => [row.source_packet_id, row])); if (run.packets.length !== experiment.expected_rows) fail("score run packet count mismatch"); let outcomes = 0, evidence = 0, adjudications = 0; const seen = new Set<string>();
  for (const packet of run.packets) { const row = corpus.get(packet.source_packet_id); if (!row || seen.has(row.source_packet_id) || packet.packet_id !== opaquePacketId(experiment.freeze_id, row.source_packet_id) || packet.task_id !== row.task_id || packet.condition !== row.condition || packet.repetition !== row.repetition || packet.full_response_sha256 !== row.full_response_sha256 || packet.normalized_outcome_sha256 !== row.normalized_outcome_sha256) fail("score packet/corpus mismatch"); seen.add(row.source_packet_id); const scores = evaluation.manifest.adjudication.reviewers.outcome.map((id) => lockedOutcome(join(root, "scores/outcome", packet.packet_id, `${id}.json`), packet.packet_id, id)); for (const [index, score] of scores.entries()) if (sha256Text(canonicalJson(score)) !== packet.reviewer_score_sha256[index]) fail("reviewer score hash mismatch"); outcomes += 2; const disagreement = outcomeDisagrees(scores[0].score, scores[1].score); const adjudicationPath = join(root, "adjudications", `${packet.packet_id}.json`); if (disagreement) { if (!existsSync(adjudicationPath)) fail("disagreement requires fresh adjudicator score"); const score = lockedOutcome(adjudicationPath, packet.packet_id, evaluation.manifest.adjudication.reviewers.adjudicator); if (sha256Text(canonicalJson(score)) !== packet.adjudication_sha256) fail("adjudication hash mismatch"); adjudications += 1 } else if (existsSync(adjudicationPath) || packet.adjudication_sha256 !== null) fail("agreement forbids adjudication"); const evidenceRequired = row.condition === "treatment" && (run.experiment === "EB3" || run.experiment === "EI3"); const evidencePath = join(root, "scores/evidence", `${packet.packet_id}.json`); if (evidenceRequired) { const value = readJson(evidencePath); assertRecord(value, "locked evidence score"); assertExactKeys(value, ["schema", "packet_id", "reviewer_id", "locked_at", "response_sha256", "score"], "locked evidence score"); const expectedReviewer = run.experiment === "EB3" ? evaluation.manifest.adjudication.reviewers.browser_evidence : evaluation.manifest.adjudication.reviewers.imagegen_evidence; if (value.schema !== "repo-harness-bdd2-locked-evidence-score.e3" || value.packet_id !== packet.packet_id || value.reviewer_id !== expectedReviewer || Number.isNaN(Date.parse(String(value.locked_at)))) fail("evidence score authority mismatch"); assertRecord(value.score, "evidence score body"); validateEvidenceScore(value.score, run.experiment); if (sha256Text(canonicalJson(value)) !== packet.evidence_score_sha256) fail("evidence score hash mismatch"); evidence += 1 } else if (existsSync(evidencePath) || packet.evidence_score_sha256 !== null) fail("non-treatment row forbids evidence score") }
  return { outcomeScoreCount: outcomes, evidenceScoreCount: evidence, adjudicationCount: adjudications };
}

interface EffectiveRow { packet_id: string; task_id: string; condition: ConditionId; repetition: number; reviewer_1: LockedOutcomeScore; reviewer_2: LockedOutcomeScore; adjudication: LockedOutcomeScore | null; evidence_score: LockedEvidenceScore | null; score: OutcomeScore }
function effectiveRows(evaluation: ValidatedEvaluation, runRoot: string, run: ScoreRun): EffectiveRow[] { return run.packets.map((packet) => { const ids = evaluation.manifest.adjudication.reviewers.outcome; const one = lockedOutcome(join(runRoot, "scores/outcome", packet.packet_id, `${ids[0]}.json`), packet.packet_id, ids[0]); const two = lockedOutcome(join(runRoot, "scores/outcome", packet.packet_id, `${ids[1]}.json`), packet.packet_id, ids[1]); const adjudication = outcomeDisagrees(one.score, two.score) ? lockedOutcome(join(runRoot, "adjudications", `${packet.packet_id}.json`), packet.packet_id, evaluation.manifest.adjudication.reviewers.adjudicator) : null; const evidencePath = join(runRoot, "scores/evidence", `${packet.packet_id}.json`); const evidence = existsSync(evidencePath) ? readJson(evidencePath) as LockedEvidenceScore : null; return { packet_id: packet.packet_id, task_id: packet.task_id, condition: packet.condition, repetition: packet.repetition, reviewer_1: one, reviewer_2: two, adjudication, evidence_score: evidence, score: adjudication?.score ?? one.score } }) }
function computeDecision(evaluation: ValidatedEvaluation, experiment: ExperimentId, rows: EffectiveRow[]): { metrics: Record<string, unknown>; decision: "Pass" | "Reshape" | "Kill" } {
  const sum = (set: EffectiveRow[], key: "unsupported_expansion" | "unsupported_user_concepts" | "required_behavior_omission") => set.reduce((total, row) => total + row.score[key], 0); const severe = (row: EffectiveRow) => row.score.protected_concern_omissions.filter((item) => item.severity === "P0" || item.severity === "P1").length; const pairs = new Map<string, { control?: EffectiveRow; treatment?: EffectiveRow }>(); for (const row of rows) { const key = `${row.task_id}:${row.repetition}`, pair = pairs.get(key) ?? {}; if (pair[row.condition]) fail("duplicate effective coordinate"); pair[row.condition] = row; pairs.set(key, pair) } let wins = 0, losses = 0, ties = 0, newSevere = 0; for (const pair of pairs.values()) { if (!pair.control || !pair.treatment) fail("incomplete effective pair"); if (experiment === "S3") { if (pair.treatment.score.unsupported_expansion < pair.control.score.unsupported_expansion) wins++; else if (pair.treatment.score.unsupported_expansion > pair.control.score.unsupported_expansion) losses++; else ties++ } else { if (!pair.control.score.uncertainty_closed && pair.treatment.score.uncertainty_closed) wins++; else if (pair.control.score.uncertainty_closed && !pair.treatment.score.uncertainty_closed) losses++; else ties++ } if (severe(pair.treatment) > severe(pair.control)) newSevere++ }
  const control = rows.filter((row) => row.condition === "control"), treatment = rows.filter((row) => row.condition === "treatment"); if (experiment === "S3") { const base = sum(control, "unsupported_expansion"), treated = sum(treatment, "unsupported_expansion"), reduction = base === 0 ? (treated === 0 ? 0 : null) : (base - treated) / base; const stableTasks = [...new Set(treatment.map((row) => row.task_id))].filter((taskId) => [...pairs.values()].filter((pair) => pair.treatment?.task_id === taskId && pair.control && pair.treatment.score.required_behavior_omission > pair.control.score.required_behavior_omission).length >= 2); const authority = [...new Set(treatment.map((row) => row.task_id))].filter((taskId) => treatment.filter((row) => row.task_id === taskId && row.score.authority_fit && row.score.escalation_correct).length >= 2).length; const metrics = { unsupported_expansion: { control: base, treatment: treated, reduction }, pairs: { wins, losses, ties }, required_omissions: { control: sum(control, "required_behavior_omission"), treatment: sum(treatment, "required_behavior_omission") }, stable_new_omission_tasks: stableTasks, new_severe_pairs: newSevere, authority_success_tasks: authority }; const pass = reduction !== null && reduction >= .3 && wins > losses && sum(treatment, "required_behavior_omission") <= sum(control, "required_behavior_omission") && stableTasks.length === 0 && newSevere === 0 && authority >= 10; const kill = reduction === null || reduction < .15 || losses > wins || stableTasks.length > 0 || newSevere > 0 || authority < 8; return { metrics, decision: pass ? "Pass" : kill ? "Kill" : "Reshape" } }
  const evidence = treatment.map((row) => { if (!row.evidence_score) fail("adapter treatment missing evidence score"); return row.evidence_score.score }); const compliance = evidence.every((score) => experiment === "EB3" ? score.provenance_complete === true && score.question_bound === true && score.privacy_reviewed === true && score.adopt_adapt_avoid_complete === true && score.unsupported_assertion_count === 0 && score.feature_need_inference_count === 0 : score.question_bound === true && score.synthetic_labeled === true && score.falsifier_present === true && score.unsupported_assertion_count === 0 && score.user_validation_claim_count === 0); const nonclose = experiment === "EI3" ? treatment.filter((row) => ["EI-H-05", "EI-H-06"].includes(row.task_id) && row.score.uncertainty_closed).length : 0; const metrics = { closure: { wins, losses, ties }, new_severe_pairs: newSevere, unsupported_expansion: { control: sum(control, "unsupported_expansion"), treatment: sum(treatment, "unsupported_expansion") }, unsupported_concepts: { control: sum(control, "unsupported_user_concepts"), treatment: sum(treatment, "unsupported_user_concepts") }, required_omissions: { control: sum(control, "required_behavior_omission"), treatment: sum(treatment, "required_behavior_omission") }, ...(experiment === "EI3" ? { nonclosable_treatment_closures: nonclose } : {}), evidence_compliance: compliance }; const pass = wins >= 6 && losses <= 2 && newSevere === 0 && sum(treatment, "unsupported_expansion") <= sum(control, "unsupported_expansion") && sum(treatment, "unsupported_user_concepts") <= sum(control, "unsupported_user_concepts") && sum(treatment, "required_behavior_omission") <= sum(control, "required_behavior_omission") && compliance && nonclose === 0; const kill = newSevere > 0 || losses > 4 || !compliance || nonclose > 0 || (sum(treatment, "unsupported_expansion") > sum(control, "unsupported_expansion") && sum(treatment, "unsupported_user_concepts") > sum(control, "unsupported_user_concepts")); return { metrics, decision: pass ? "Pass" : kill ? "Kill" : "Reshape" };
}
export function projectEvidence(evaluation: ValidatedEvaluation, runRelativePath: string, evidenceRelativePath: string, reportRelativePath: string): { experiment: ExperimentId; decision: string } { validateScoreRun(evaluation, runRelativePath); const runRoot = resolve(evaluation.repoRoot, runRelativePath); const run = readJson(join(runRoot, "run.json")) as ScoreRun; const rows = effectiveRows(evaluation, runRoot, run); const result = computeDecision(evaluation, run.experiment, rows); const evidence = { schema: `repo-harness-bdd2-${run.experiment.toLowerCase()}-evidence.e3`, freeze_id: run.freeze_id, source_commit: run.source_commit, manifest_sha256: run.manifest_sha256, packet_count: rows.length, outcome_score_count: rows.length * 2, evidence_score_count: rows.filter((row) => row.evidence_score !== null).length, adjudication_count: rows.filter((row) => row.adjudication !== null).length, rows: rows.map(({ score: _score, ...row }) => row), summary: { metrics: result.metrics, decision: result.decision } }; const evidencePath = resolve(evaluation.repoRoot, evidenceRelativePath), reportPath = resolve(evaluation.repoRoot, reportRelativePath); if (!evidencePath.startsWith(`${evaluation.repoRoot}${sep}`) || !reportPath.startsWith(`${evaluation.repoRoot}${sep}`)) fail("projection path escapes repo"); writeJson(evidencePath, evidence); const label = { S3: "Inline Shape", EB3: "Browser Evidence Adapter", EI3: "ImageGen Prototype Adapter" }[run.experiment]; writeFileSync(reportPath, `# Experiment ${run.experiment} — ${label}\n\n> **Decision**: ${result.decision}\n> **Outputs reused**: ${rows.length} immutable E2 outputs\n> **Primary outcome scores**: ${rows.length * 2}\n> **Fresh adjudications**: ${rows.filter((row) => row.adjudication).length}\n> **Evidence scores**: ${rows.filter((row) => row.evidence_score).length}\n> **Evidence projection**: \`${evidenceRelativePath.split("/").pop()}\`\n\nE3 changed only the pre-sealed scoring authority. No intervention output or historical\nPhase E/E2 score was modified. The decision above is reproduced from the tracked\nevidence projection and the frozen Phase E3 metrics.\n`); return { experiment: run.experiment, decision: result.decision } }
export function verifyEvidenceProjection(evaluation: ValidatedEvaluation, evidenceRelativePath: string): { experiment: ExperimentId; decision: string } {
  const raw = readJson(authorityPath(evaluation.repoRoot, evidenceRelativePath, "E3 evidence")); assertRecord(raw, "E3 evidence");
  const match = String(raw.schema).match(/^repo-harness-bdd2-(s3|eb3|ei3)-evidence\.e3$/); if (!match || !Array.isArray(raw.rows) || !isRecord(raw.summary)) fail("E3 evidence identity mismatch");
  const experiment = match[1].toUpperCase() as ExperimentId; const authority = evaluation.manifest.experiments[experiment];
  if (evidenceRelativePath !== authority.result.evidence.path || raw.freeze_id !== authority.freeze_id || raw.manifest_sha256 !== authority.score_manifest_sha256) fail("E3 evidence/result authority mismatch");
  const expected = new Map(evaluation.corpus.rows.filter((row) => row.experiment === experiment).map((row) => [opaquePacketId(authority.freeze_id, row.source_packet_id), row])); const seen = new Set<string>();
  const rows = raw.rows.map((item, index): EffectiveRow => {
    const label = `evidence.rows[${index}]`; assertRecord(item, label); assertExactKeys(item, ["packet_id", "task_id", "condition", "repetition", "reviewer_1", "reviewer_2", "adjudication", "evidence_score"], label);
    const packetId = String(item.packet_id), corpus = expected.get(packetId); if (!corpus || seen.has(packetId) || item.task_id !== corpus.task_id || item.condition !== corpus.condition || item.repetition !== corpus.repetition) fail("E3 evidence coordinate/corpus mismatch"); seen.add(packetId);
    assertRecord(item.reviewer_1, `${label}.reviewer_1`); assertRecord(item.reviewer_2, `${label}.reviewer_2`);
    const one = { ...(item.reviewer_1 as unknown as LockedOutcomeScore), score: validateOutcomeScore(item.reviewer_1.score, `${label}.reviewer_1.score`) }; const two = { ...(item.reviewer_2 as unknown as LockedOutcomeScore), score: validateOutcomeScore(item.reviewer_2.score, `${label}.reviewer_2.score`) };
    if (one.packet_id !== packetId || two.packet_id !== packetId || one.reviewer_id !== evaluation.manifest.adjudication.reviewers.outcome[0] || two.reviewer_id !== evaluation.manifest.adjudication.reviewers.outcome[1]) fail("E3 evidence reviewer authority mismatch");
    const disagreement = outcomeDisagrees(one.score, two.score); let adjudication: LockedOutcomeScore | null = null;
    if (disagreement) { assertRecord(item.adjudication, `${label}.adjudication`); adjudication = { ...(item.adjudication as unknown as LockedOutcomeScore), score: validateOutcomeScore(item.adjudication.score, `${label}.adjudication.score`) }; if (adjudication.packet_id !== packetId || adjudication.reviewer_id !== evaluation.manifest.adjudication.reviewers.adjudicator) fail("E3 evidence adjudicator authority mismatch") } else if (item.adjudication !== null) fail("E3 evidence agreement forbids adjudication");
    const evidenceRequired = corpus.condition === "treatment" && experiment !== "S3"; let evidence: LockedEvidenceScore | null = null;
    if (evidenceRequired) { assertRecord(item.evidence_score, `${label}.evidence_score`); evidence = item.evidence_score as unknown as LockedEvidenceScore; assertRecord(evidence.score, `${label}.evidence_score.score`); validateEvidenceScore(evidence.score, experiment); const reviewer = experiment === "EB3" ? evaluation.manifest.adjudication.reviewers.browser_evidence : evaluation.manifest.adjudication.reviewers.imagegen_evidence; if (evidence.packet_id !== packetId || evidence.reviewer_id !== reviewer) fail("E3 evidence-use reviewer authority mismatch") } else if (item.evidence_score !== null) fail("E3 evidence score forbidden for coordinate");
    return { packet_id: packetId, task_id: corpus.task_id, condition: corpus.condition, repetition: corpus.repetition, reviewer_1: one, reviewer_2: two, adjudication, evidence_score: evidence, score: adjudication?.score ?? one.score };
  });
  if (seen.size !== expected.size) fail("E3 evidence coordinate set incomplete"); const result = computeDecision(evaluation, experiment, rows);
  if (canonicalJson(result.metrics) !== canonicalJson(raw.summary.metrics) || result.decision !== raw.summary.decision || raw.packet_count !== rows.length || raw.outcome_score_count !== rows.length * 2 || raw.evidence_score_count !== rows.filter((row) => row.evidence_score).length || raw.adjudication_count !== rows.filter((row) => row.adjudication).length) fail("E3 evidence projection drift"); return { experiment, decision: result.decision };
}

// ============================================================================
// BDD3-EA1 — direct schema cut for the typed browser evidence authority
// experiment. EA1 has its own manifest (evals/bdd3/evaluation-manifest.json,
// schema repo-harness-bdd3-evaluation.ea1) and its own corpus shape (24
// held-out + ~6 dev archetypes, no reused frozen E2 outputs — Stage B
// generates fresh outputs). main() dispatches on the manifest's own schema
// field so S3/EB3/EI3 coordinates above are completely unchanged.
// ============================================================================

export type Ea1EvidenceKind = "reference_pattern" | "current_truth" | "approved_policy" | "user_evidence";
export type Ea1Disposition = "Adopt" | "Adapt" | "Avoid" | "Defer";
export type Ea1ClosureLevel = "closed" | "partial" | "not_established";
export type Ea1ClosureCeiling = "pattern_only" | "authorized";
export type Ea1Category = "closable" | "trap";
export type Ea1TrapKind = "feature_need" | "product_policy" | "numeric_duration_retry" | "accessibility_semantics";
export type Ea1Condition = "control" | "treatment";
export type Ea1Partition = "held_out" | "development";
const EA1_EVIDENCE_KINDS: readonly Ea1EvidenceKind[] = ["reference_pattern", "current_truth", "approved_policy", "user_evidence"];
const EA1_TRAP_KINDS: readonly Ea1TrapKind[] = ["feature_need", "product_policy", "numeric_duration_retry", "accessibility_semantics"];
const EA1_DISPOSITIONS: readonly Ea1Disposition[] = ["Adopt", "Adapt", "Avoid", "Defer"];

export interface TypedEvidencePacket {
  schema: "repo-harness-bdd3-typed-evidence-packet.ea1";
  uncertainty: string;
  evidence: { kind: Ea1EvidenceKind; locator: string; claim: string }[];
  need_basis: { source: Ea1EvidenceKind };
  decision: { disposition: Ea1Disposition; supported_by: number[]; introduced_product_policy: boolean };
  closure: { level: Ea1ClosureLevel; ceiling: Ea1ClosureCeiling };
  not_established: string[];
}
export interface Ea1ValidatorViolation { rule: 1 | 2 | 3 | 4 | 5 | 6; detail: string }
export interface Ea1ValidatorResult { ceiling_violation: boolean; violations: Ea1ValidatorViolation[] }
interface Ea1ProtectedConcern { concern: string; severity: "P0" | "P1" | "P2" | "P3"; summary: string }
export interface Ea1ArchetypeTruth {
  kind: "typed-evidence-authority";
  closable: boolean;
  trap_kind: Ea1TrapKind | null;
  reference_pattern: string;
  forbidden_inference: string;
  expected_disposition: Ea1Disposition;
  required_boundary: string[];
  unsupported_concepts: string[];
  protected_concerns: Ea1ProtectedConcern[];
  not_established_required: string[];
}
export interface Ea1ElementVocabularyItem { id: string; description: string }
export interface Ea1Task { id: string; category: Ea1Category; trap_kind: Ea1TrapKind | null; title: string; named_uncertainty: string; agent_input: string; element_vocabulary: Ea1ElementVocabularyItem[] }

// --- Step 0 falsifier core: pure, deterministic, JSON in / violations out. ---
export function applyEa1ValidatorRules(packet: TypedEvidencePacket, truth: Pick<Ea1ArchetypeTruth, "required_boundary" | "protected_concerns" | "closable">): Ea1ValidatorResult {
  const violations: Ea1ValidatorViolation[] = [];
  const citedKinds = packet.decision.supported_by.map((i) => packet.evidence[i]?.kind);
  const citesPattern = citedKinds.includes("reference_pattern");
  const hasNonPatternAuthority = citedKinds.some((k) => k === "current_truth" || k === "approved_policy" || k === "user_evidence");
  const actualCeiling: Ea1ClosureCeiling = hasNonPatternAuthority ? "authorized" : "pattern_only";
  const concernTags = truth.protected_concerns.map((c) => c.concern);
  // Rule 4 escape gate: a non-pattern citation only trusts the packet's
  // accessibility discharge on closable archetypes, where genuine authority
  // can exist (e.g. EA1-C-04: closable=true, accessibility concern,
  // not_established_required=[]). Trap archetypes are closable=false by
  // construction with a documented forbidden_inference, so no citation can
  // legitimately discharge the concern there; without this gate, any single
  // irrelevant current_truth/approved_policy/user_evidence citation anywhere
  // in supported_by blessed the whole packet's ceiling, letting a trap packet
  // dodge both ceiling_violation and the not_established requirement (Stage A
  // EA1-02 stress, confirmed live against EA1-D-03).
  const accessibilityAuthorityTrusted = truth.closable && hasNonPatternAuthority;

  if (citesPattern && packet.closure.ceiling === "authorized" && (packet.decision.disposition === "Adopt" || packet.decision.disposition === "Adapt")) {
    violations.push({ rule: 1, detail: "reference_pattern evidence cited toward an authorized-ceiling Adopt/Adapt decision" });
  }
  if (packet.need_basis.source === "reference_pattern") {
    violations.push({ rule: 2, detail: "need_basis.source is reference_pattern; degrades to Defer" });
  }
  if (packet.decision.introduced_product_policy && !hasNonPatternAuthority) {
    violations.push({ rule: 3, detail: "introduced_product_policy=true with no current_truth/approved_policy citation" });
  }
  if (concernTags.includes("accessibility") && !packet.not_established.includes("accessibility") && !accessibilityAuthorityTrusted) {
    violations.push({ rule: 4, detail: "accessibility concern neither cited from current_truth nor listed not_established" });
  }
  if ((packet.closure.level === "closed" && actualCeiling !== "authorized") || (packet.closure.ceiling === "authorized" && actualCeiling !== "authorized")) {
    violations.push({ rule: 5, detail: "closure claims authorized/closed without non-pattern evidence backing" });
  }
  if (packet.closure.level === "closed" && packet.not_established.length > 0) {
    violations.push({ rule: 6, detail: "closure.level=closed but not_established is non-empty" });
  }
  if (truth.required_boundary.length > 0 && packet.decision.supported_by.length === 0 && packet.not_established.length === 0) {
    violations.push({ rule: 6, detail: "required_boundary items exist but nothing is supported or flagged not_established" });
  }
  return { ceiling_violation: violations.length > 0, violations };
}

export function validateTypedEvidencePacket(raw: unknown, label = "typed evidence packet"): TypedEvidencePacket {
  assertRecord(raw, label);
  assertExactKeys(raw, ["schema", "uncertainty", "evidence", "need_basis", "decision", "closure", "not_established"], label);
  if (raw.schema !== "repo-harness-bdd3-typed-evidence-packet.ea1") fail(`${label}.schema invalid`);
  assertString(raw.uncertainty, `${label}.uncertainty`);
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) fail(`${label}.evidence must be a non-empty array`);
  const evidence = raw.evidence.map((item, index) => {
    const itemLabel = `${label}.evidence[${index}]`;
    assertRecord(item, itemLabel); assertExactKeys(item, ["kind", "locator", "claim"], itemLabel);
    if (!EA1_EVIDENCE_KINDS.includes(item.kind as Ea1EvidenceKind)) fail(`${itemLabel}.kind invalid`);
    assertString(item.locator, `${itemLabel}.locator`); assertString(item.claim, `${itemLabel}.claim`);
    return item as unknown as TypedEvidencePacket["evidence"][number];
  });
  assertRecord(raw.need_basis, `${label}.need_basis`); assertExactKeys(raw.need_basis, ["source"], `${label}.need_basis`);
  if (!EA1_EVIDENCE_KINDS.includes(raw.need_basis.source as Ea1EvidenceKind)) fail(`${label}.need_basis.source invalid`);
  assertRecord(raw.decision, `${label}.decision`); assertExactKeys(raw.decision, ["disposition", "supported_by", "introduced_product_policy"], `${label}.decision`);
  if (!EA1_DISPOSITIONS.includes(raw.decision.disposition as Ea1Disposition)) fail(`${label}.decision.disposition invalid`);
  if (!Array.isArray(raw.decision.supported_by) || raw.decision.supported_by.some((i) => !Number.isInteger(i) || (i as number) < 0)) fail(`${label}.decision.supported_by invalid`);
  if (typeof raw.decision.introduced_product_policy !== "boolean") fail(`${label}.decision.introduced_product_policy invalid`);
  assertRecord(raw.closure, `${label}.closure`); assertExactKeys(raw.closure, ["level", "ceiling"], `${label}.closure`);
  if (!["closed", "partial", "not_established"].includes(String(raw.closure.level))) fail(`${label}.closure.level invalid`);
  if (!["pattern_only", "authorized"].includes(String(raw.closure.ceiling))) fail(`${label}.closure.ceiling invalid`);
  assertStringArray(raw.not_established, `${label}.not_established`, true);
  return { schema: "repo-harness-bdd3-typed-evidence-packet.ea1", uncertainty: raw.uncertainty, evidence, need_basis: raw.need_basis as TypedEvidencePacket["need_basis"], decision: raw.decision as TypedEvidencePacket["decision"], closure: raw.closure as TypedEvidencePacket["closure"], not_established: raw.not_established as string[] };
}

// Pre-Stage-B correction #2: truth.not_established_required must be drawn
// 1:1 from the archetype's own element_vocabulary ids -- checked once at
// evaluation-validate time (authoring-time integrity, not per-packet).
function assertEa1NotEstablishedRequiredVocabulary(required: readonly string[], vocabulary: readonly Ea1ElementVocabularyItem[], label: string): void {
  const ids = new Set(vocabulary.map((item) => item.id));
  for (const tag of required) if (!ids.has(tag)) fail(`${label}.not_established_required references an id outside its element_vocabulary: ${tag}`);
}
// Pre-Stage-B correction #4: relaxed from a vocabulary-membership check to a
// pure structural intake gate -- any non-empty string is now an accepted
// not_established[] entry; only non-string/empty-string/malformed structure
// still fails closed (transport-level, retryable via runValidatedModel's
// existing max_attempts). A live Stage B response placed "accessibility" in
// not_established on an archetype whose truth carries no accessibility
// concern; the old membership check rejected it, forcing 3 fresh model
// retries that all stayed non-compliant and aborted the whole run. But
// vocabulary-id/protected-concern-tag matching are the trap-honesty metric's
// (computeEa1Decision's trapHonest, an exact-id SUBSET check) and
// applyEa1ValidatorRules rule 4's (a truth.protected_concerns MEMBERSHIP
// check) business, not this gate's -- both already ignore any entry they did
// not ask for, so the membership check could only ever reject live output
// for content neither downstream consumer cares about, while biasing
// retried samples toward vocabulary compliance (selection pressure on the
// safety endpoint) and giving one stubborn response run-abort blast radius.
// truth/vocabulary parameters are kept for call-site stability; the check no
// longer reads them.
export function assertEa1NotEstablishedVocabulary(notEstablished: readonly string[], truth: Pick<Ea1ArchetypeTruth, "protected_concerns">, vocabulary: readonly Ea1ElementVocabularyItem[], label = "typed evidence packet"): void {
  assertStringArray(notEstablished, `${label}.not_established`, true);
}

interface Ea1RubricRefs { typed_packet_schema: FileReference; validator_rules: FileReference; control_response_schema: FileReference; control_evidence_score_schema: FileReference; outcome_score_schema: FileReference }
interface Ea1PromptRefs { control: PromptReference; treatment: PromptReference; control_evidence_reviewer: PromptReference; outcome_reviewer: PromptReference; outcome_adjudicator: PromptReference }
export interface Ea1Manifest {
  schema: "repo-harness-bdd3-evaluation.ea1";
  runner: FileReference;
  output_root: string;
  experiment: {
    kind: "typed-evidence-authority";
    freeze_id: string;
    held_out: { tasks: FileReference; truth: FileReference; archetype_count: number; closable_count: number; trap_count: number; repetitions: number; expected_rows: number };
    dev: { tasks: FileReference; truth: FileReference; archetype_count: number };
    evidence_appendices: Record<string, FileReference>;
    rubrics: Ea1RubricRefs;
    prompts: Ea1PromptRefs;
    metrics: FileReference;
    adjudication: { resolution: "fresh-adjudicator-score-on-canonical-disagreement"; reviewers: { outcome: [string, string]; adjudicator: string; control_evidence: string } };
  };
  model_profile: ModelProfile;
  historical_reports: FileReference[];
}
export interface ValidatedEa1Evaluation { repoRoot: string; manifestPath: string; manifest: Ea1Manifest; heldOutTasks: Record<string, Ea1Task>; heldOutTruth: Record<string, Ea1ArchetypeTruth>; devTasks: Record<string, Ea1Task>; devTruth: Record<string, Ea1ArchetypeTruth>; authorityPaths: string[] }

function validateEa1ModelProfile(raw: unknown): void {
  assertRecord(raw, "model_profile"); assertExactKeys(raw, ["command", "args", "version_args", "expected_version", "model", "sampling", "credential_mode", "transport", "tools", "max_concurrency", "max_attempts"], "model_profile");
  assertString(raw.command, "model_profile.command"); if (!isAbsolute(raw.command) || !raw.command.endsWith("/codex")) fail("model_profile.command must be an absolute codex CLI path");
  assertString(raw.expected_version, "model_profile.expected_version"); assertString(raw.model, "model_profile.model");
  assertStringArray(raw.args, "model_profile.args"); assertStringArray(raw.version_args, "model_profile.version_args", true);
  assertRecord(raw.sampling, "model_profile.sampling");
  if (raw.credential_mode !== "codex-auth-copy" || raw.transport !== "model-transport-only" || !Number.isInteger(raw.max_concurrency) || Number(raw.max_concurrency) < 1 || Number(raw.max_concurrency) > 16 || !Number.isInteger(raw.max_attempts) || Number(raw.max_attempts) < 1 || Number(raw.max_attempts) > 3) fail("model_profile isolation/concurrency/attempts invalid");
  assertRecord(raw.tools, "model_profile.tools"); assertExactKeys(raw.tools, ["browser", "web_search", "mcp", "external", "repository"], "model_profile.tools");
  if (Object.values(raw.tools).some((value) => value !== false)) fail("model_profile tools must all be disabled");
}

// Pre-Stage-B correction #2: element_vocabulary is a fixed, uniform-shape
// {id, description}[] carried by every archetype's task entry (closable and
// trap alike, so the field's mere presence is not itself a trap tell). It is
// supplied to the model under test (see genPacket in scoreEa1Experiment) and
// is the id-space truth.not_established_required draws from.
function parseEa1ElementVocabulary(raw: unknown, label: string): Ea1ElementVocabularyItem[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(`${label} must be a non-empty array`);
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const itemLabel = `${label}[${index}]`; assertRecord(item, itemLabel); assertExactKeys(item, ["id", "description"], itemLabel);
    assertString(item.id, `${itemLabel}.id`); assertString(item.description, `${itemLabel}.description`);
    const id = item.id as string; if (seen.has(id)) fail(`${itemLabel}.id duplicate within archetype: ${id}`); seen.add(id);
    return { id, description: item.description as string };
  });
}
function parseEa1Tasks(path: string, partition: Ea1Partition): Record<string, Ea1Task> {
  const raw = readJson(path); assertRecord(raw, "EA1 tasks"); assertExactKeys(raw, ["schema", "partition", "tasks"], "EA1 tasks");
  if (raw.schema !== "repo-harness-bdd3-task-set.ea1" || raw.partition !== partition || !Array.isArray(raw.tasks)) fail("EA1 tasks identity mismatch");
  const out: Record<string, Ea1Task> = {};
  raw.tasks.forEach((item, index) => {
    const label = `EA1 tasks[${index}]`; assertRecord(item, label); assertExactKeys(item, ["id", "category", "trap_kind", "title", "named_uncertainty", "agent_input", "element_vocabulary"], label);
    assertString(item.id, `${label}.id`);
    if (item.category !== "closable" && item.category !== "trap") fail(`${label}.category invalid`);
    if (item.category === "closable") { if (item.trap_kind !== null) fail(`${label}.trap_kind must be null for closable`) } else if (!EA1_TRAP_KINDS.includes(item.trap_kind as Ea1TrapKind)) fail(`${label}.trap_kind invalid`);
    assertString(item.title, `${label}.title`); assertString(item.named_uncertainty, `${label}.named_uncertainty`); assertString(item.agent_input, `${label}.agent_input`);
    const elementVocabulary = parseEa1ElementVocabulary(item.element_vocabulary, `${label}.element_vocabulary`);
    if (out[item.id]) fail(`${label}.id duplicate: ${item.id}`);
    out[item.id] = { id: item.id, category: item.category, trap_kind: item.trap_kind, title: item.title, named_uncertainty: item.named_uncertainty, agent_input: item.agent_input, element_vocabulary: elementVocabulary } as unknown as Ea1Task;
  });
  return out;
}
function parseEa1Truth(path: string, partition: Ea1Partition): Record<string, Ea1ArchetypeTruth> {
  const raw = readJson(path); assertRecord(raw, "EA1 truth"); assertExactKeys(raw, ["schema", "partition", "tasks"], "EA1 truth");
  if (raw.schema !== "repo-harness-bdd3-truth-set.ea1" || raw.partition !== partition) fail("EA1 truth identity mismatch");
  assertRecord(raw.tasks, "EA1 truth.tasks");
  const out: Record<string, Ea1ArchetypeTruth> = {};
  for (const [id, item] of Object.entries(raw.tasks)) {
    const label = `EA1 truth.tasks.${id}`; assertRecord(item, label);
    assertExactKeys(item, ["kind", "closable", "trap_kind", "reference_pattern", "forbidden_inference", "expected_disposition", "required_boundary", "unsupported_concepts", "protected_concerns", "not_established_required"], label);
    if (item.kind !== "typed-evidence-authority") fail(`${label}.kind invalid`);
    if (typeof item.closable !== "boolean") fail(`${label}.closable invalid`);
    if (item.closable) { if (item.trap_kind !== null) fail(`${label}.trap_kind must be null for closable`) } else if (!EA1_TRAP_KINDS.includes(item.trap_kind as Ea1TrapKind)) fail(`${label}.trap_kind invalid`);
    assertString(item.reference_pattern, `${label}.reference_pattern`); assertString(item.forbidden_inference, `${label}.forbidden_inference`);
    if (!EA1_DISPOSITIONS.includes(item.expected_disposition as Ea1Disposition)) fail(`${label}.expected_disposition invalid`);
    assertStringArray(item.required_boundary, `${label}.required_boundary`, true); assertStringArray(item.unsupported_concepts, `${label}.unsupported_concepts`, true);
    if (!Array.isArray(item.protected_concerns)) fail(`${label}.protected_concerns must be array`);
    for (const concern of item.protected_concerns) { assertRecord(concern, `${label}.protected_concerns[]`); assertExactKeys(concern, ["concern", "severity", "summary"], `${label}.protected_concerns[]`); assertString(concern.concern, `${label}.protected_concerns[].concern`); if (!["P0", "P1", "P2", "P3"].includes(String(concern.severity))) fail(`${label}.protected_concerns[].severity invalid`); assertString(concern.summary, `${label}.protected_concerns[].summary`) }
    assertStringArray(item.not_established_required, `${label}.not_established_required`, true);
    const notEstablishedRequired = item.not_established_required as string[];
    if (!item.closable && notEstablishedRequired.length === 0) fail(`${label} trap archetype requires not_established_required`);
    if (item.closable && notEstablishedRequired.length > 0) fail(`${label} closable archetype must not set not_established_required`);
    out[id] = item as unknown as Ea1ArchetypeTruth;
  }
  return out;
}

export function validateEa1Evaluation(repoRoot = REPO_ROOT, manifestRelativePath = "evals/bdd3/evaluation-manifest.json"): ValidatedEa1Evaluation {
  const root = resolve(repoRoot); const manifestPath = authorityPath(root, manifestRelativePath, "EA1 manifest"); const raw = readJson(manifestPath); assertRecord(raw, "EA1 manifest");
  assertExactKeys(raw, ["schema", "runner", "output_root", "experiment", "model_profile", "historical_reports"], "EA1 manifest");
  if (raw.schema !== "repo-harness-bdd3-evaluation.ea1") fail("Unsupported EA1 evaluation manifest schema");
  const authority = [manifestPath, validateRef(root, raw.runner, "runner")]; assertString(raw.output_root, "output_root");
  assertRecord(raw.experiment, "experiment"); const exp = raw.experiment;
  assertExactKeys(exp, ["kind", "freeze_id", "held_out", "dev", "evidence_appendices", "rubrics", "prompts", "metrics", "adjudication"], "experiment");
  if (exp.kind !== "typed-evidence-authority") fail("experiment.kind invalid"); assertString(exp.freeze_id, "experiment.freeze_id");

  assertRecord(exp.held_out, "experiment.held_out"); assertExactKeys(exp.held_out, ["tasks", "truth", "archetype_count", "closable_count", "trap_count", "repetitions", "expected_rows"], "experiment.held_out");
  const heldOutTasksPath = validateRef(root, exp.held_out.tasks, "held_out.tasks"); const heldOutTruthPath = validateRef(root, exp.held_out.truth, "held_out.truth"); authority.push(heldOutTasksPath, heldOutTruthPath);
  if (exp.held_out.archetype_count !== 24 || exp.held_out.closable_count !== 12 || exp.held_out.trap_count !== 12 || exp.held_out.repetitions !== 2 || exp.held_out.expected_rows !== 96) fail("experiment.held_out counts invalid");

  assertRecord(exp.dev, "experiment.dev"); assertExactKeys(exp.dev, ["tasks", "truth", "archetype_count"], "experiment.dev");
  const devTasksPath = validateRef(root, exp.dev.tasks, "dev.tasks"); const devTruthPath = validateRef(root, exp.dev.truth, "dev.truth"); authority.push(devTasksPath, devTruthPath);
  if (exp.dev.archetype_count !== 6) fail("experiment.dev.archetype_count invalid");

  assertRecord(exp.rubrics, "experiment.rubrics"); assertExactKeys(exp.rubrics, ["typed_packet_schema", "validator_rules", "control_response_schema", "control_evidence_score_schema", "outcome_score_schema"], "experiment.rubrics");
  for (const key of ["typed_packet_schema", "validator_rules", "control_response_schema", "control_evidence_score_schema", "outcome_score_schema"] as const) authority.push(validateRef(root, exp.rubrics[key], `rubrics.${key}`));

  assertRecord(exp.prompts, "experiment.prompts"); assertExactKeys(exp.prompts, ["control", "treatment", "control_evidence_reviewer", "outcome_reviewer", "outcome_adjudicator"], "experiment.prompts");
  for (const key of ["control", "treatment", "control_evidence_reviewer", "outcome_reviewer", "outcome_adjudicator"] as const) authority.push(validatePromptRef(root, exp.prompts[key], `prompts.${key}`));

  authority.push(validateRef(root, exp.metrics, "metrics"));

  assertRecord(exp.adjudication, "experiment.adjudication"); assertExactKeys(exp.adjudication, ["resolution", "reviewers"], "experiment.adjudication");
  if (exp.adjudication.resolution !== "fresh-adjudicator-score-on-canonical-disagreement") fail("adjudication.resolution invalid");
  assertRecord(exp.adjudication.reviewers, "adjudication.reviewers"); assertExactKeys(exp.adjudication.reviewers, ["outcome", "adjudicator", "control_evidence"], "adjudication.reviewers");
  if (!Array.isArray(exp.adjudication.reviewers.outcome) || exp.adjudication.reviewers.outcome.length !== 2) fail("exactly two outcome reviewers required");
  const roles = [...exp.adjudication.reviewers.outcome, exp.adjudication.reviewers.adjudicator, exp.adjudication.reviewers.control_evidence];
  if (roles.some((role) => typeof role !== "string" || !role) || new Set(roles).size !== roles.length) fail("reviewer roles must be distinct non-empty ids");

  validateEa1ModelProfile(raw.model_profile);
  if (!Array.isArray(raw.historical_reports) || raw.historical_reports.length < 1) fail("historical_reports must freeze prerequisite BDD2/EA1 context");
  raw.historical_reports.forEach((ref, index) => authority.push(validateRef(root, ref, `historical_reports[${index}]`)));

  const heldOutTasks = parseEa1Tasks(heldOutTasksPath, "held_out");
  const heldOutTruth = parseEa1Truth(heldOutTruthPath, "held_out");
  const devTasks = parseEa1Tasks(devTasksPath, "development");
  const devTruth = parseEa1Truth(devTruthPath, "development");

  if (Object.keys(heldOutTasks).length !== 24) fail("held_out tasks must be exactly 24");
  if (Object.keys(devTasks).length !== 6) fail("dev tasks must be exactly 6");
  const closableCount = Object.values(heldOutTasks).filter((t) => t.category === "closable").length;
  const trapCount = Object.values(heldOutTasks).filter((t) => t.category === "trap").length;
  if (closableCount !== 12 || trapCount !== 12) fail("held_out closable/trap split must be 12/12");
  const trapKindCounts: Partial<Record<Ea1TrapKind, number>> = {};
  for (const task of Object.values(heldOutTasks)) if (task.category === "trap") trapKindCounts[task.trap_kind as Ea1TrapKind] = (trapKindCounts[task.trap_kind as Ea1TrapKind] ?? 0) + 1;
  for (const kind of EA1_TRAP_KINDS) if (trapKindCounts[kind] !== 3) fail(`held_out trap_kind ${kind} must have exactly 3 archetypes`);

  const heldOutIds = new Set(Object.keys(heldOutTasks)); const devIds = new Set(Object.keys(devTasks));
  for (const id of devIds) if (heldOutIds.has(id)) fail(`dev archetype id overlaps held_out: ${id}`);

  if (Object.keys(heldOutTruth).length !== 24) fail("held_out truth must be exactly 24");
  for (const [id, task] of Object.entries(heldOutTasks)) {
    const truth = heldOutTruth[id]; if (!truth) fail(`held_out truth missing for ${id}`);
    if (truth.closable !== (task.category === "closable") || truth.trap_kind !== task.trap_kind) fail(`held_out task/truth category mismatch for ${id}`);
    assertEa1NotEstablishedRequiredVocabulary(truth.not_established_required, task.element_vocabulary, `held_out ${id}`);
  }
  if (Object.keys(devTruth).length !== 6) fail("dev truth must be exactly 6");
  for (const [id, task] of Object.entries(devTasks)) {
    const truth = devTruth[id]; if (!truth) fail(`dev truth missing for ${id}`);
    if (truth.closable !== (task.category === "closable") || truth.trap_kind !== task.trap_kind) fail(`dev task/truth category mismatch for ${id}`);
    assertEa1NotEstablishedRequiredVocabulary(truth.not_established_required, task.element_vocabulary, `dev ${id}`);
  }

  assertRecord(exp.evidence_appendices, "experiment.evidence_appendices");
  const allIds = new Set([...heldOutIds, ...devIds]); const appendixIds = new Set(Object.keys(exp.evidence_appendices));
  if (appendixIds.size !== allIds.size || [...allIds].some((id) => !appendixIds.has(id))) fail("evidence_appendices must have exactly one entry per held_out+dev archetype id");
  for (const [id, ref] of Object.entries(exp.evidence_appendices)) authority.push(validateRef(root, ref, `evidence_appendices.${id}`));

  const manifest = raw as unknown as Ea1Manifest;
  return { repoRoot: root, manifestPath, manifest, heldOutTasks, heldOutTruth, devTasks, devTruth, authorityPaths: [...new Set(authority)] };
}

export interface Ea1PlannedPacket { packet_id: string; task_id: string; condition: Ea1Condition; repetition: number }
function ea1SourcePacketId(taskId: string, condition: Ea1Condition, repetition: number): string { return `ea1:${taskId}:${condition}:${repetition}` }
export function planEa1Packets(evaluation: ValidatedEa1Evaluation): Ea1PlannedPacket[] {
  const packets: Ea1PlannedPacket[] = [];
  for (const id of Object.keys(evaluation.heldOutTasks)) for (const condition of ["control", "treatment"] as const) for (let repetition = 1; repetition <= evaluation.manifest.experiment.held_out.repetitions; repetition += 1) packets.push({ packet_id: opaquePacketId(evaluation.manifest.experiment.freeze_id, ea1SourcePacketId(id, condition, repetition)), task_id: id, condition, repetition });
  return packets.sort((a, b) => a.packet_id.localeCompare(b.packet_id));
}

function ea1NormalizedOutcome(task: Ea1Task, condition: Ea1Condition, response: Record<string, unknown>): Record<string, unknown> {
  const normalizedTask = { title: task.title, agent_input: task.agent_input, named_uncertainty: task.named_uncertainty };
  if (condition === "control") {
    assertRecord(response, "control response"); if (response.schema !== "repo-harness-bdd2-agent-response.e2") fail("control response schema invalid");
    assertRecord(response.outcome, "control response.outcome");
    return stable({ schema: "repo-harness-bdd3-normalized-outcome.ea1", task: normalizedTask, outcome: response.outcome }) as Record<string, unknown>;
  }
  const packet = validateTypedEvidencePacket(response, "treatment response");
  const outcome = {
    boundary_decision: packet.decision.disposition,
    required_behaviors: packet.decision.supported_by.map((i) => packet.evidence[i]?.claim).filter((claim): claim is string => typeof claim === "string"),
    recovery_and_trust: [] as string[],
    exposed_user_concepts: packet.decision.introduced_product_policy ? ["introduced_product_policy"] : [],
    excluded_behaviors: packet.not_established,
    authority: packet.closure.ceiling === "authorized" ? "inline" : "prd",
  };
  return stable({ schema: "repo-harness-bdd3-normalized-outcome.ea1", task: normalizedTask, outcome }) as Record<string, unknown>;
}

interface Ea1LockedOutcomeScore { schema: "repo-harness-bdd3-locked-outcome-score.ea1"; packet_id: string; reviewer_id: string; locked_at: string; response_sha256: string; score: OutcomeScore }
interface Ea1ControlEvidenceScoreBody { unsupported_assertion_count: number; feature_need_inference_count: number; explicit_limitation_count: number; notes: string }
interface Ea1LockedControlEvidenceScore { schema: "repo-harness-bdd3-locked-control-evidence-score.ea1"; packet_id: string; reviewer_id: string; locked_at: string; response_sha256: string; score: Ea1ControlEvidenceScoreBody }
interface Ea1LockedTreatmentEvidenceResult { schema: "repo-harness-bdd3-locked-treatment-evidence-result.ea1"; packet_id: string; locked_at: string; packet_sha256: string; not_established: string[]; result: Ea1ValidatorResult }
interface Ea1ScoreRunPacket { packet_id: string; task_id: string; condition: Ea1Condition; repetition: number; response_sha256: string; normalized_outcome_sha256: string; reviewer_score_sha256: [string, string]; adjudication_sha256: string | null; control_evidence_score_sha256: string | null; treatment_evidence_result_sha256: string | null }
interface Ea1ScoreRun { schema: "repo-harness-bdd3-score-run.ea1"; freeze_id: string; source_commit: string; manifest_sha256: string; model_profile: { model: string; expected_version: string }; output_path: string; packets: Ea1ScoreRunPacket[] }

function validateEa1ControlEvidenceScore(score: Record<string, unknown>): void { assertExactKeys(score, ["unsupported_assertion_count", "feature_need_inference_count", "explicit_limitation_count", "notes"], "control evidence score"); for (const key of ["unsupported_assertion_count", "feature_need_inference_count", "explicit_limitation_count"] as const) if (!Number.isInteger(score[key]) || Number(score[key]) < 0) fail(`control evidence score.${key} invalid`); assertString(score.notes, "control evidence score.notes") }

export async function scoreEa1Experiment(evaluation: ValidatedEa1Evaluation, outputRelative?: string): Promise<Ea1ScoreRun> {
  const sourceCommit = cleanHead(evaluation.repoRoot); assertAuthorityTracked(evaluation);
  const profile = evaluation.manifest.model_profile; const version = spawnSync(profile.command, profile.version_args, { encoding: "utf8" }); if (version.status !== 0 || version.stdout.trim() !== profile.expected_version) fail(`model CLI version mismatch: ${version.stdout.trim()}`);
  const outputPath = outputRelative ?? join(evaluation.manifest.output_root, `ea1/run-${Date.now()}`); const output = resolve(evaluation.repoRoot, outputPath);
  if (!output.startsWith(`${resolve(evaluation.repoRoot)}${sep}`) || existsSync(output)) fail("score output path invalid or exists");
  for (const dir of ["responses", "scores/outcome", "adjudications", "scores/evidence", "private"]) mkdirSync(join(output, dir), { recursive: true });

  const planned = planEa1Packets(evaluation); const records = new Map<string, Ea1ScoreRunPacket>();
  await mapLimit(planned, profile.max_concurrency, async (item) => {
    const task = evaluation.heldOutTasks[item.task_id]; const truth = evaluation.heldOutTruth[item.task_id];
    const appendixRef = evaluation.manifest.experiment.evidence_appendices[item.task_id];
    const appendixText = readFileSync(authorityPath(evaluation.repoRoot, appendixRef.path, "EA1 appendix"), "utf-8");
    const isControl = item.condition === "control";
    const genPacket = { task_id: item.task_id, named_uncertainty: task.named_uncertainty, agent_input: task.agent_input, appendix: appendixText, element_vocabulary: task.element_vocabulary };
    const responseSchemaRef = isControl ? evaluation.manifest.experiment.rubrics.control_response_schema : evaluation.manifest.experiment.rubrics.typed_packet_schema;
    const promptRef = isControl ? evaluation.manifest.experiment.prompts.control : evaluation.manifest.experiment.prompts.treatment;
    const response = await runValidatedModel(evaluation, responseSchemaRef, promptRef, genPacket, (raw) => {
      if (isControl) return raw;
      const packet = validateTypedEvidencePacket(raw);
      assertEa1NotEstablishedVocabulary(packet.not_established, truth, task.element_vocabulary, "treatment response");
      return raw;
    }, "Task packet");
    writeJson(join(output, "responses", `${item.packet_id}.json`), response);
    const responseSha = sha256Text(canonicalJson(response));
    const normalizedOutcome = ea1NormalizedOutcome(task, item.condition, response); const normalizedOutcomeSha = sha256Text(canonicalJson(normalizedOutcome));
    const reviewPacket = { schema: "repo-harness-bdd3-outcome-review-packet.ea1", packet_id: item.packet_id, normalized_outcome: normalizedOutcome, truth: { expected_disposition: truth.expected_disposition, required_boundary: truth.required_boundary, unsupported_concepts: truth.unsupported_concepts, protected_concerns: truth.protected_concerns } };

    const locked: Ea1LockedOutcomeScore[] = [];
    for (const reviewerId of evaluation.manifest.experiment.adjudication.reviewers.outcome) {
      const result = await runValidatedModel(evaluation, evaluation.manifest.experiment.rubrics.outcome_score_schema, evaluation.manifest.experiment.prompts.outcome_reviewer, reviewPacket, (raw) => ({ raw, score: validateOutcomeScore(validateModelResponse(raw, "repo-harness-bdd2-outcome-score-response.e3", item.packet_id)) }));
      const value: Ea1LockedOutcomeScore = { schema: "repo-harness-bdd3-locked-outcome-score.ea1", packet_id: item.packet_id, reviewer_id: reviewerId, locked_at: new Date().toISOString(), response_sha256: sha256Text(canonicalJson(result.raw)), score: result.score };
      writeJson(join(output, "scores/outcome", item.packet_id, `${reviewerId}.json`), value); locked.push(value);
    }
    let adjudicationSha: string | null = null;
    if (outcomeDisagrees(locked[0].score, locked[1].score)) {
      const adjudicatorPacket = { ...reviewPacket, schema: "repo-harness-bdd3-outcome-adjudication-packet.ea1", primary_scores: locked.map((entry) => ({ reviewer_id: entry.reviewer_id, score: entry.score })) };
      const result = await runValidatedModel(evaluation, evaluation.manifest.experiment.rubrics.outcome_score_schema, evaluation.manifest.experiment.prompts.outcome_adjudicator, adjudicatorPacket, (raw) => ({ raw, score: validateOutcomeScore(validateModelResponse(raw, "repo-harness-bdd2-outcome-score-response.e3", item.packet_id)) }));
      const value: Ea1LockedOutcomeScore = { schema: "repo-harness-bdd3-locked-outcome-score.ea1", packet_id: item.packet_id, reviewer_id: evaluation.manifest.experiment.adjudication.reviewers.adjudicator, locked_at: new Date().toISOString(), response_sha256: sha256Text(canonicalJson(result.raw)), score: result.score };
      writeJson(join(output, "adjudications", `${item.packet_id}.json`), value); adjudicationSha = sha256Text(canonicalJson(value));
    }

    let controlEvidenceSha: string | null = null; let treatmentEvidenceSha: string | null = null;
    if (isControl) {
      const evidencePacket = { schema: "repo-harness-bdd3-control-evidence-review-packet.ea1", packet_id: item.packet_id, response, truth: { forbidden_inference: truth.forbidden_inference, unsupported_concepts: truth.unsupported_concepts }, appendix_text: appendixText };
      const result = await runValidatedModel(evaluation, evaluation.manifest.experiment.rubrics.control_evidence_score_schema, evaluation.manifest.experiment.prompts.control_evidence_reviewer, evidencePacket, (raw) => { const score = validateModelResponse(raw, "repo-harness-bdd3-control-evidence-score-response.ea1", item.packet_id); validateEa1ControlEvidenceScore(score); return { raw, score: score as unknown as Ea1ControlEvidenceScoreBody } });
      const value: Ea1LockedControlEvidenceScore = { schema: "repo-harness-bdd3-locked-control-evidence-score.ea1", packet_id: item.packet_id, reviewer_id: evaluation.manifest.experiment.adjudication.reviewers.control_evidence, locked_at: new Date().toISOString(), response_sha256: sha256Text(canonicalJson(result.raw)), score: result.score };
      writeJson(join(output, "scores/evidence", `${item.packet_id}.json`), value); controlEvidenceSha = sha256Text(canonicalJson(value));
    } else {
      const packet = validateTypedEvidencePacket(response, "treatment response");
      const result = applyEa1ValidatorRules(packet, truth);
      const value: Ea1LockedTreatmentEvidenceResult = { schema: "repo-harness-bdd3-locked-treatment-evidence-result.ea1", packet_id: item.packet_id, locked_at: new Date().toISOString(), packet_sha256: responseSha, not_established: packet.not_established, result };
      writeJson(join(output, "scores/evidence", `${item.packet_id}.json`), value); treatmentEvidenceSha = sha256Text(canonicalJson(value));
    }

    writeJson(join(output, "private", `${item.packet_id}.json`), { schema: "repo-harness-bdd3-private-score-coordinate.ea1", packet_id: item.packet_id, task_id: item.task_id, condition: item.condition, repetition: item.repetition });
    records.set(item.packet_id, { packet_id: item.packet_id, task_id: item.task_id, condition: item.condition, repetition: item.repetition, response_sha256: responseSha, normalized_outcome_sha256: normalizedOutcomeSha, reviewer_score_sha256: [sha256Text(canonicalJson(locked[0])), sha256Text(canonicalJson(locked[1]))], adjudication_sha256: adjudicationSha, control_evidence_score_sha256: controlEvidenceSha, treatment_evidence_result_sha256: treatmentEvidenceSha });
  });

  const run: Ea1ScoreRun = { schema: "repo-harness-bdd3-score-run.ea1", freeze_id: evaluation.manifest.experiment.freeze_id, source_commit: sourceCommit, manifest_sha256: sha256File(evaluation.manifestPath), model_profile: { model: profile.model, expected_version: profile.expected_version }, output_path: relative(evaluation.repoRoot, output).replace(/\\/g, "/"), packets: [...records.values()].sort((a, b) => a.packet_id.localeCompare(b.packet_id)) };
  writeJson(join(output, "run.json"), run); return run;
}

function ea1LockedOutcome(path: string, packetId: string, reviewerId: string): Ea1LockedOutcomeScore { const raw = readJson(path); assertRecord(raw, "EA1 locked outcome score"); assertExactKeys(raw, ["schema", "packet_id", "reviewer_id", "locked_at", "response_sha256", "score"], "EA1 locked outcome score"); if (raw.schema !== "repo-harness-bdd3-locked-outcome-score.ea1" || raw.packet_id !== packetId || raw.reviewer_id !== reviewerId || Number.isNaN(Date.parse(String(raw.locked_at))) || !/^[a-f0-9]{64}$/.test(String(raw.response_sha256))) fail("EA1 locked outcome score authority mismatch"); return { ...(raw as unknown as Ea1LockedOutcomeScore), score: validateOutcomeScore(raw.score) } }

export function validateEa1ScoreRun(evaluation: ValidatedEa1Evaluation, runRelativePath: string): { outcomeScoreCount: number; controlEvidenceScoreCount: number; treatmentEvidenceResultCount: number; adjudicationCount: number } {
  const root = authorityPath(evaluation.repoRoot, runRelativePath, "EA1 score run"); const raw = readJson(join(root, "run.json")); assertRecord(raw, "EA1 score run");
  if (raw.schema !== "repo-harness-bdd3-score-run.ea1" || !Array.isArray(raw.packets)) fail("EA1 score run identity mismatch");
  assertRecord(raw.model_profile, "EA1 score run.model_profile"); assertExactKeys(raw.model_profile, ["model", "expected_version"], "EA1 score run.model_profile"); assertString(raw.model_profile.model, "EA1 score run.model_profile.model"); assertString(raw.model_profile.expected_version, "EA1 score run.model_profile.expected_version");
  const run = raw as unknown as Ea1ScoreRun;
  if (run.freeze_id !== evaluation.manifest.experiment.freeze_id || run.manifest_sha256 !== sha256File(evaluation.manifestPath) || run.output_path !== relative(evaluation.repoRoot, root).replace(/\\/g, "/")) fail("EA1 score run authority mismatch");
  const planned = new Map(planEa1Packets(evaluation).map((item) => [item.packet_id, item]));
  if (run.packets.length !== planned.size) fail("EA1 score run packet count mismatch");
  let outcomes = 0, controlEvidence = 0, treatmentEvidence = 0, adjudications = 0; const seen = new Set<string>();
  for (const packet of run.packets) {
    const expected = planned.get(packet.packet_id); if (!expected || seen.has(packet.packet_id) || packet.task_id !== expected.task_id || packet.condition !== expected.condition || packet.repetition !== expected.repetition) fail("EA1 score packet/plan mismatch"); seen.add(packet.packet_id);
    const scores = evaluation.manifest.experiment.adjudication.reviewers.outcome.map((id) => ea1LockedOutcome(join(root, "scores/outcome", packet.packet_id, `${id}.json`), packet.packet_id, id));
    scores.forEach((score, index) => { if (sha256Text(canonicalJson(score)) !== packet.reviewer_score_sha256[index]) fail("EA1 reviewer score hash mismatch") }); outcomes += 2;
    const disagreement = outcomeDisagrees(scores[0].score, scores[1].score); const adjudicationPath = join(root, "adjudications", `${packet.packet_id}.json`);
    if (disagreement) { if (!existsSync(adjudicationPath)) fail("EA1 disagreement requires fresh adjudicator score"); const score = ea1LockedOutcome(adjudicationPath, packet.packet_id, evaluation.manifest.experiment.adjudication.reviewers.adjudicator); if (sha256Text(canonicalJson(score)) !== packet.adjudication_sha256) fail("EA1 adjudication hash mismatch"); adjudications += 1 } else if (existsSync(adjudicationPath) || packet.adjudication_sha256 !== null) fail("EA1 agreement forbids adjudication");
    const evidencePath = join(root, "scores/evidence", `${packet.packet_id}.json`);
    if (packet.condition === "control") {
      if (packet.treatment_evidence_result_sha256 !== null) fail("EA1 control row forbids treatment_evidence_result_sha256");
      const value = readJson(evidencePath); assertRecord(value, "EA1 locked control evidence score"); assertExactKeys(value, ["schema", "packet_id", "reviewer_id", "locked_at", "response_sha256", "score"], "EA1 locked control evidence score");
      if (value.schema !== "repo-harness-bdd3-locked-control-evidence-score.ea1" || value.packet_id !== packet.packet_id || value.reviewer_id !== evaluation.manifest.experiment.adjudication.reviewers.control_evidence) fail("EA1 control evidence score authority mismatch");
      assertRecord(value.score, "EA1 control evidence score body"); validateEa1ControlEvidenceScore(value.score); if (sha256Text(canonicalJson(value)) !== packet.control_evidence_score_sha256) fail("EA1 control evidence score hash mismatch"); controlEvidence += 1;
    } else {
      if (packet.control_evidence_score_sha256 !== null) fail("EA1 treatment row forbids control_evidence_score_sha256");
      const value = readJson(evidencePath); assertRecord(value, "EA1 locked treatment evidence result"); assertExactKeys(value, ["schema", "packet_id", "locked_at", "packet_sha256", "not_established", "result"], "EA1 locked treatment evidence result");
      if (value.schema !== "repo-harness-bdd3-locked-treatment-evidence-result.ea1" || value.packet_id !== packet.packet_id || value.packet_sha256 !== packet.response_sha256) fail("EA1 treatment evidence result authority mismatch");
      assertStringArray(value.not_established, "EA1 treatment evidence result.not_established", true);
      assertRecord(value.result, "EA1 treatment evidence result.result"); assertExactKeys(value.result, ["ceiling_violation", "violations"], "EA1 treatment evidence result.result");
      if (typeof value.result.ceiling_violation !== "boolean" || !Array.isArray(value.result.violations)) fail("EA1 treatment evidence result.result invalid");
      if (sha256Text(canonicalJson(value)) !== packet.treatment_evidence_result_sha256) fail("EA1 treatment evidence result hash mismatch"); treatmentEvidence += 1;
    }
  }
  return { outcomeScoreCount: outcomes, controlEvidenceScoreCount: controlEvidence, treatmentEvidenceResultCount: treatmentEvidence, adjudicationCount: adjudications };
}

interface Ea1EffectiveRow { packet_id: string; task_id: string; condition: Ea1Condition; repetition: number; score: OutcomeScore; controlEvidence: Ea1ControlEvidenceScoreBody | null; treatmentResult: Ea1ValidatorResult | null; treatmentNotEstablished: string[] | null }
function ea1EffectiveRows(evaluation: ValidatedEa1Evaluation, runRoot: string, run: Ea1ScoreRun): Ea1EffectiveRow[] {
  return run.packets.map((packet) => {
    const ids = evaluation.manifest.experiment.adjudication.reviewers.outcome;
    const one = ea1LockedOutcome(join(runRoot, "scores/outcome", packet.packet_id, `${ids[0]}.json`), packet.packet_id, ids[0]); const two = ea1LockedOutcome(join(runRoot, "scores/outcome", packet.packet_id, `${ids[1]}.json`), packet.packet_id, ids[1]);
    const adjudication = outcomeDisagrees(one.score, two.score) ? ea1LockedOutcome(join(runRoot, "adjudications", `${packet.packet_id}.json`), packet.packet_id, evaluation.manifest.experiment.adjudication.reviewers.adjudicator) : null;
    const evidencePath = join(runRoot, "scores/evidence", `${packet.packet_id}.json`); const raw = existsSync(evidencePath) ? readJson(evidencePath) : null;
    const controlEvidence = raw && packet.condition === "control" ? (raw as unknown as Ea1LockedControlEvidenceScore).score : null;
    const treatmentRaw = raw && packet.condition === "treatment" ? (raw as unknown as Ea1LockedTreatmentEvidenceResult) : null;
    return { packet_id: packet.packet_id, task_id: packet.task_id, condition: packet.condition, repetition: packet.repetition, score: adjudication?.score ?? one.score, controlEvidence, treatmentResult: treatmentRaw?.result ?? null, treatmentNotEstablished: treatmentRaw?.not_established ?? null };
  });
}
function ea1AuthorityViolation(row: Ea1EffectiveRow): boolean { return row.condition === "treatment" ? row.treatmentResult?.ceiling_violation === true : (row.controlEvidence ? row.controlEvidence.feature_need_inference_count > 0 || row.controlEvidence.unsupported_assertion_count > 0 : false) }
function ea1ClosureCorrect(row: Ea1EffectiveRow, truth: Ea1ArchetypeTruth): boolean { return row.score.required_behavior_omission === 0 && row.score.authority_fit === true && (!truth.closable || row.score.uncertainty_closed) }

export function computeEa1Decision(evaluation: ValidatedEa1Evaluation, rows: Ea1EffectiveRow[]): { metrics: Record<string, unknown>; intervention: "pass" | "reshape" | "unsafe_reject" | "no_incremental_value"; thesis: "supported" | "unresolved" | "unsupported" } {
  const byArchetype = new Map<string, { control: Ea1EffectiveRow[]; treatment: Ea1EffectiveRow[] }>();
  for (const row of rows) { const entry = byArchetype.get(row.task_id) ?? { control: [], treatment: [] }; entry[row.condition].push(row); byArchetype.set(row.task_id, entry) }

  const treatmentViolations = rows.filter((row) => row.condition === "treatment" && ea1AuthorityViolation(row)).length;
  let newSevereWorstRep = 0;
  for (const [, group] of byArchetype) for (let repetition = 1; repetition <= evaluation.manifest.experiment.held_out.repetitions; repetition += 1) {
    const control = group.control.find((row) => row.repetition === repetition); const treatment = group.treatment.find((row) => row.repetition === repetition); if (!control || !treatment) continue;
    const controlSevere = control.score.protected_concern_omissions.filter((c) => c.severity === "P0" || c.severity === "P1").length; const treatmentSevere = treatment.score.protected_concern_omissions.filter((c) => c.severity === "P0" || c.severity === "P1").length;
    if (treatmentSevere > controlSevere) newSevereWorstRep += 1;
  }
  const primarySafe = treatmentViolations === 0 && newSevereWorstRep === 0;

  let closureLosses = 0;
  for (const [taskId, group] of byArchetype) { const truth = evaluation.heldOutTruth[taskId]; for (const repetition of [1, 2]) { const control = group.control.find((row) => row.repetition === repetition); const treatment = group.treatment.find((row) => row.repetition === repetition); if (!control || !treatment) continue; if (ea1ClosureCorrect(control, truth) && !ea1ClosureCorrect(treatment, truth)) closureLosses += 1 } }

  const trapArchetypes = [...byArchetype.entries()].filter(([taskId]) => evaluation.heldOutTruth[taskId] && !evaluation.heldOutTruth[taskId].closable);
  // Pre-Stage-B correction #2: every archetype's task entry now carries a
  // fixed element_vocabulary (Ea1Task.element_vocabulary), supplied to the
  // model under test via genPacket, and truth.not_established_required
  // values are drawn from that same archetype's element_vocabulary ids
  // (validateEa1Evaluation verifies this 1:1 and fails closed on drift). The
  // prior "non-empty in both reps" leniency (Stage B preflight correction)
  // is superseded: trap honesty is restored to exact id membership --
  // truth.not_established_required subset-of packet.not_established, worst
  // repetition -- because the id is now reachable by an honest model instead
  // of a hidden truth-only label.
  const trapHonest = (rowsForArchetype: Ea1EffectiveRow[], truth: Ea1ArchetypeTruth): boolean => rowsForArchetype.every((row) => truth.not_established_required.every((tag) => (row.treatmentNotEstablished ?? []).includes(tag)));
  const treatmentTrapHonestCount = trapArchetypes.filter(([taskId, group]) => trapHonest(group.treatment, evaluation.heldOutTruth[taskId])).length;
  const controlTrapHonestCount = trapArchetypes.filter(([, group]) => group.control.every((row) => !ea1AuthorityViolation(row))).length;
  const secondaryEfficacy = closureLosses === 0 && treatmentTrapHonestCount >= 11;

  const metrics = { treatment_authority_violations: treatmentViolations, new_severe_worst_rep: newSevereWorstRep, closure_losses: closureLosses, treatment_trap_honest: treatmentTrapHonestCount, control_trap_honest: controlTrapHonestCount, trap_archetype_count: trapArchetypes.length };

  let intervention: "pass" | "reshape" | "unsafe_reject" | "no_incremental_value";
  if (!primarySafe) intervention = "unsafe_reject";
  else if (secondaryEfficacy && controlTrapHonestCount >= 11) intervention = "no_incremental_value";
  else if (secondaryEfficacy) intervention = "pass";
  else intervention = "reshape";

  const thesis: "supported" | "unresolved" | "unsupported" = intervention === "pass" ? "supported" : intervention === "unsafe_reject" || closureLosses > 0 ? "unsupported" : "unresolved";
  return { metrics, intervention, thesis };
}

export function projectEa1Evidence(evaluation: ValidatedEa1Evaluation, runRelativePath: string, evidenceRelativePath: string, reportRelativePath: string): { intervention: string; thesis: string } {
  validateEa1ScoreRun(evaluation, runRelativePath); const runRoot = resolve(evaluation.repoRoot, runRelativePath); const run = readJson(join(runRoot, "run.json")) as Ea1ScoreRun;
  const rows = ea1EffectiveRows(evaluation, runRoot, run); const result = computeEa1Decision(evaluation, rows);
  const adjudicationCount = run.packets.filter((packet) => packet.adjudication_sha256 !== null).length;
  const controlEvidenceCount = run.packets.filter((packet) => packet.control_evidence_score_sha256 !== null).length;
  const treatmentEvidenceCount = run.packets.filter((packet) => packet.treatment_evidence_result_sha256 !== null).length;
  const evidence = { schema: "repo-harness-bdd3-ea1-evidence.ea1", freeze_id: run.freeze_id, source_commit: run.source_commit, manifest_sha256: run.manifest_sha256, model_profile: run.model_profile, packet_count: rows.length, outcome_score_count: rows.length * 2, adjudication_count: adjudicationCount, control_evidence_score_count: controlEvidenceCount, treatment_evidence_result_count: treatmentEvidenceCount, rows: rows.map((row) => ({ packet_id: row.packet_id, task_id: row.task_id, condition: row.condition, repetition: row.repetition, outcome_score: row.score, control_evidence: row.controlEvidence, treatment_result: row.treatmentResult, treatment_not_established: row.treatmentNotEstablished })), summary: { metrics: result.metrics, intervention: result.intervention, thesis: result.thesis } };
  const evidencePath = resolve(evaluation.repoRoot, evidenceRelativePath), reportPath = resolve(evaluation.repoRoot, reportRelativePath);
  if (!evidencePath.startsWith(`${evaluation.repoRoot}${sep}`) || !reportPath.startsWith(`${evaluation.repoRoot}${sep}`)) fail("EA1 projection path escapes repo");
  writeJson(evidencePath, evidence);
  writeFileSync(reportPath, `# Experiment EA1 — Typed Browser Evidence Authority\n\n> **Intervention**: ${result.intervention}\n> **Thesis**: ${result.thesis}\n> **Outputs**: ${rows.length}\n> **Primary outcome scores**: ${rows.length * 2}\n> **Evidence projection**: \`${evidenceRelativePath.split("/").pop()}\`\n\nEA1 ran a sealed confirmatory pass over the frozen held-out corpus. The\ndisposition above is reproduced from the tracked evidence projection and the\nfrozen Phase EA1 metrics.\n`);
  return { intervention: result.intervention, thesis: result.thesis };
}

export function verifyEa1EvidenceProjection(evaluation: ValidatedEa1Evaluation, evidenceRelativePath: string): { intervention: string; thesis: string } {
  const raw = readJson(authorityPath(evaluation.repoRoot, evidenceRelativePath, "EA1 evidence")); assertRecord(raw, "EA1 evidence");
  assertExactKeys(raw, ["schema", "freeze_id", "source_commit", "manifest_sha256", "model_profile", "packet_count", "outcome_score_count", "adjudication_count", "control_evidence_score_count", "treatment_evidence_result_count", "rows", "summary"], "EA1 evidence");
  if (raw.schema !== "repo-harness-bdd3-ea1-evidence.ea1" || !Array.isArray(raw.rows) || !isRecord(raw.summary)) fail("EA1 evidence identity mismatch");
  assertRecord(raw.model_profile, "EA1 evidence.model_profile"); assertExactKeys(raw.model_profile, ["model", "expected_version"], "EA1 evidence.model_profile"); assertString(raw.model_profile.model, "EA1 evidence.model_profile.model"); assertString(raw.model_profile.expected_version, "EA1 evidence.model_profile.expected_version");
  if (raw.freeze_id !== evaluation.manifest.experiment.freeze_id || raw.manifest_sha256 !== sha256File(evaluation.manifestPath)) fail("EA1 evidence/manifest authority mismatch");
  const planned = new Map(planEa1Packets(evaluation).map((item) => [item.packet_id, item])); const seen = new Set<string>();
  const rows = raw.rows.map((item, index): Ea1EffectiveRow => {
    const label = `evidence.rows[${index}]`; assertRecord(item, label);
    assertExactKeys(item, ["packet_id", "task_id", "condition", "repetition", "outcome_score", "control_evidence", "treatment_result", "treatment_not_established"], label);
    const expected = planned.get(String(item.packet_id)); if (!expected || seen.has(String(item.packet_id)) || item.task_id !== expected.task_id || item.condition !== expected.condition || item.repetition !== expected.repetition) fail("EA1 evidence coordinate/plan mismatch"); seen.add(String(item.packet_id));
    const score = validateOutcomeScore(item.outcome_score, `${label}.outcome_score`);
    if (expected.condition === "control") {
      if (item.treatment_result !== null) fail(`${label} control row forbids treatment_result`); if (item.treatment_not_established !== null) fail(`${label} control row forbids treatment_not_established`);
      if (item.control_evidence !== null) { assertRecord(item.control_evidence, `${label}.control_evidence`); validateEa1ControlEvidenceScore(item.control_evidence) }
    } else {
      if (item.control_evidence !== null) fail(`${label} treatment row forbids control_evidence`);
      if (item.treatment_result !== null) { assertRecord(item.treatment_result, `${label}.treatment_result`); assertExactKeys(item.treatment_result, ["ceiling_violation", "violations"], `${label}.treatment_result`); if (typeof item.treatment_result.ceiling_violation !== "boolean" || !Array.isArray(item.treatment_result.violations)) fail(`${label}.treatment_result invalid`) }
      if (item.treatment_not_established !== null) assertStringArray(item.treatment_not_established, `${label}.treatment_not_established`, true);
    }
    return { packet_id: String(item.packet_id), task_id: expected.task_id, condition: expected.condition, repetition: expected.repetition, score, controlEvidence: (item.control_evidence ?? null) as Ea1ControlEvidenceScoreBody | null, treatmentResult: (item.treatment_result ?? null) as Ea1ValidatorResult | null, treatmentNotEstablished: (item.treatment_not_established ?? null) as string[] | null };
  });
  if (seen.size !== planned.size) fail("EA1 evidence coordinate set incomplete");
  if (raw.packet_count !== rows.length || raw.outcome_score_count !== rows.length * 2) fail("EA1 evidence packet/outcome-score count mismatch");
  const result = computeEa1Decision(evaluation, rows);
  if (canonicalJson(result.metrics) !== canonicalJson(raw.summary.metrics) || result.intervention !== raw.summary.intervention || result.thesis !== raw.summary.thesis) fail("EA1 evidence projection drift");
  return { intervention: result.intervention, thesis: result.thesis };
}

interface CliOptions { command: "validate" | "plan-scores" | "score" | "validate-scores" | "project" | "verify-evidence"; manifest: string; experiment?: ExperimentId; output?: string; run?: string; evidence?: string; report?: string }
function parseArgs(args: string[]): CliOptions { const command = args[0]; if (!["validate", "plan-scores", "score", "validate-scores", "project", "verify-evidence"].includes(String(command))) fail("Usage: run-bdd2-evals.ts <validate|plan-scores|score|validate-scores|project|verify-evidence>"); const options: CliOptions = { command: command as CliOptions["command"], manifest: DEFAULT_MANIFEST_PATH }; for (let i = 1; i < args.length; i++) { const flag = args[i]; const next = () => { const value = args[++i]; if (!value || value.startsWith("--")) fail(`missing value for ${flag}`); return value }; if (flag === "--manifest") options.manifest = next(); else if (flag === "--experiment") options.experiment = next() as ExperimentId; else if (flag === "--output") options.output = next(); else if (flag === "--run") options.run = next(); else if (flag === "--evidence") options.evidence = next(); else if (flag === "--report") options.report = next(); else fail(`unknown argument ${flag}`) } return options }
function peekManifestSchema(manifestRelativePath: string): string { const raw = readJson(resolve(REPO_ROOT, manifestRelativePath)); assertRecord(raw, "manifest"); assertString(raw.schema, "manifest.schema"); return raw.schema }
async function runEa1Cli(options: CliOptions): Promise<void> {
  const evaluation = validateEa1Evaluation(REPO_ROOT, options.manifest);
  if (options.command === "validate") { console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiment: "EA1", held_out_archetypes: Object.keys(evaluation.heldOutTasks).length, dev_archetypes: Object.keys(evaluation.devTasks).length, expected_rows: evaluation.manifest.experiment.held_out.expected_rows, corpus_rows: evaluation.manifest.experiment.held_out.expected_rows }, null, 2)); return }
  if (options.command === "plan-scores") { console.log(JSON.stringify({ experiment: "EA1", packets: planEa1Packets(evaluation).map((item) => ({ packet_id: item.packet_id, task_id: item.task_id })) }, null, 2)); return }
  if (options.command === "score") { console.log(JSON.stringify(await scoreEa1Experiment(evaluation, options.output), null, 2)); return }
  if (options.command === "validate-scores") { if (!options.run) fail("validate-scores requires --run"); console.log(JSON.stringify(validateEa1ScoreRun(evaluation, options.run), null, 2)); return }
  if (options.command === "project") { if (!options.run || !options.evidence || !options.report) fail("project requires --run --evidence --report"); console.log(JSON.stringify(projectEa1Evidence(evaluation, options.run, options.evidence, options.report), null, 2)); return }
  if (!options.evidence) fail("verify-evidence requires --evidence"); console.log(JSON.stringify(verifyEa1EvidenceProjection(evaluation, options.evidence), null, 2));
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  if (peekManifestSchema(options.manifest) === "repo-harness-bdd3-evaluation.ea1") { await runEa1Cli(options); return }
  const evaluation = validateEvaluation(REPO_ROOT, options.manifest); if (options.command === "validate") { console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiments: Object.keys(evaluation.manifest.experiments), corpus_rows: evaluation.corpus.rows.length }, null, 2)); return } if (options.command === "plan-scores") { if (!options.experiment || !Object.hasOwn(evaluation.manifest.experiments, options.experiment)) fail("--experiment must be S3, EB3, or EI3"); console.log(JSON.stringify({ experiment: options.experiment, packets: evaluation.corpus.rows.filter((row) => row.experiment === options.experiment).map((row) => ({ packet_id: opaquePacketId(evaluation.manifest.experiments[options.experiment!].freeze_id, row.source_packet_id), task_id: row.task_id })) }, null, 2)); return } if (options.command === "score") { if (!options.experiment || !Object.hasOwn(evaluation.manifest.experiments, options.experiment)) fail("--experiment must be S3, EB3, or EI3"); console.log(JSON.stringify(await scoreExperiment(evaluation, options.experiment, options.output), null, 2)); return } if (options.command === "validate-scores") { if (!options.run) fail("validate-scores requires --run"); console.log(JSON.stringify(validateScoreRun(evaluation, options.run), null, 2)); return } if (options.command === "project") { if (!options.run || !options.evidence || !options.report) fail("project requires --run --evidence --report"); console.log(JSON.stringify(projectEvidence(evaluation, options.run, options.evidence, options.report), null, 2)); return } if (!options.evidence) fail("verify-evidence requires --evidence"); console.log(JSON.stringify(verifyEvidenceProjection(evaluation, options.evidence), null, 2)) }
if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) });

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
async function runModel(evaluation: ValidatedEvaluation, schemaRef: FileReference, promptRef: PromptReference, packet: Record<string, unknown>): Promise<Record<string, unknown>> {
  const profile = evaluation.manifest.model_profile; const home = mkdtempSync(join(tmpdir(), "bdd2-e3-home-")); const workspace = mkdtempSync(join(tmpdir(), "bdd2-e3-workspace-"));
  try { deliverCredential(home); const values: Record<string, string> = { response_schema: resolve(evaluation.repoRoot, schemaRef.path), model: profile.model }; for (const [key, value] of Object.entries(profile.sampling)) values[`sampling.${key}`] = String(value); const args = profile.args.map((arg) => expandArg(arg, values)); const instruction = readFileSync(resolve(evaluation.repoRoot, promptRef.path), "utf-8").trim(); const input = `${instruction}\n\n## Frozen review packet\n\n${JSON.stringify(packet)}\n`;
    return await runJsonProcess(profile.command, args, workspace, buildIsolatedEnv(home), input)
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }) }
}
async function runValidatedModel<T>(evaluation: ValidatedEvaluation, schemaRef: FileReference, promptRef: PromptReference, packet: Record<string, unknown>, validate: (raw: Record<string, unknown>) => T): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= evaluation.manifest.model_profile.max_attempts; attempt += 1) {
    try { return validate(await runModel(evaluation, schemaRef, promptRef, packet)) } catch (error) { lastError = error }
  }
  fail(`model response failed after ${evaluation.manifest.model_profile.max_attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> { let next = 0; const workers = Array.from({ length: Math.min(limit, items.length) }, async () => { while (true) { const index = next++; if (index >= items.length) return; await fn(items[index], index) } }); await Promise.all(workers) }
function cleanHead(root: string): string { const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }); if (status.status !== 0 || status.stdout.trim()) fail("sealed E3 scoring requires clean Git HEAD"); const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }); if (head.status !== 0) fail("cannot resolve Git HEAD"); return head.stdout.trim() }
function assertAuthorityTracked(evaluation: ValidatedEvaluation): void { for (const path of evaluation.authorityPaths) { const rel = relative(evaluation.repoRoot, path).replace(/\\/g, "/"); const result = spawnSync("git", ["ls-files", "--error-unmatch", rel], { cwd: evaluation.repoRoot, encoding: "utf8" }); if (result.status !== 0) fail(`sealed E3 authority must be tracked: ${rel}`) } }

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

interface CliOptions { command: "validate" | "plan-scores" | "score" | "validate-scores" | "project" | "verify-evidence"; manifest: string; experiment?: ExperimentId; output?: string; run?: string; evidence?: string; report?: string }
function parseArgs(args: string[]): CliOptions { const command = args[0]; if (!["validate", "plan-scores", "score", "validate-scores", "project", "verify-evidence"].includes(String(command))) fail("Usage: run-bdd2-evals.ts <validate|plan-scores|score|validate-scores|project|verify-evidence>"); const options: CliOptions = { command: command as CliOptions["command"], manifest: DEFAULT_MANIFEST_PATH }; for (let i = 1; i < args.length; i++) { const flag = args[i]; const next = () => { const value = args[++i]; if (!value || value.startsWith("--")) fail(`missing value for ${flag}`); return value }; if (flag === "--manifest") options.manifest = next(); else if (flag === "--experiment") options.experiment = next() as ExperimentId; else if (flag === "--output") options.output = next(); else if (flag === "--run") options.run = next(); else if (flag === "--evidence") options.evidence = next(); else if (flag === "--report") options.report = next(); else fail(`unknown argument ${flag}`) } return options }
export async function main(args = process.argv.slice(2)): Promise<void> { const options = parseArgs(args); const evaluation = validateEvaluation(REPO_ROOT, options.manifest); if (options.command === "validate") { console.log(JSON.stringify({ status: "valid", schema: evaluation.manifest.schema, experiments: Object.keys(evaluation.manifest.experiments), corpus_rows: evaluation.corpus.rows.length }, null, 2)); return } if (options.command === "plan-scores") { if (!options.experiment || !Object.hasOwn(evaluation.manifest.experiments, options.experiment)) fail("--experiment must be S3, EB3, or EI3"); console.log(JSON.stringify({ experiment: options.experiment, packets: evaluation.corpus.rows.filter((row) => row.experiment === options.experiment).map((row) => ({ packet_id: opaquePacketId(evaluation.manifest.experiments[options.experiment!].freeze_id, row.source_packet_id), task_id: row.task_id })) }, null, 2)); return } if (options.command === "score") { if (!options.experiment || !Object.hasOwn(evaluation.manifest.experiments, options.experiment)) fail("--experiment must be S3, EB3, or EI3"); console.log(JSON.stringify(await scoreExperiment(evaluation, options.experiment, options.output), null, 2)); return } if (options.command === "validate-scores") { if (!options.run) fail("validate-scores requires --run"); console.log(JSON.stringify(validateScoreRun(evaluation, options.run), null, 2)); return } if (options.command === "project") { if (!options.run || !options.evidence || !options.report) fail("project requires --run --evidence --report"); console.log(JSON.stringify(projectEvidence(evaluation, options.run, options.evidence, options.report), null, 2)); return } if (!options.evidence) fail("verify-evidence requires --evidence"); console.log(JSON.stringify(verifyEvidenceProjection(evaluation, options.evidence), null, 2)) }
if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) });

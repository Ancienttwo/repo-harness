import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildAgentPacket,
  buildIsolatedAgentEnv,
  buildRunPlan,
  canonicalJson,
  hashTree,
  normalizeOutcome,
  runEvaluation,
  sha256File,
  validateEvaluation,
  validateScores,
  validateStructuredAgentResponse,
} from "../scripts/run-bdd2-evals";

const ROOT = join(import.meta.dir, "..");

function write(path: string, value: string): void { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, value) }
function json(path: string, value: unknown): void { write(path, `${JSON.stringify(value, null, 2)}\n`) }
function ref(path: string, root: string) { return { path, sha256: sha256File(join(root, path)) } }

function createFixture(options: { sealed?: boolean; i2Enabled?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "bdd2-e2-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts/run-bdd2-evals.ts"), join(root, "scripts/run-bdd2-evals.ts"));
  for (const id of ["s2", "eb", "ei", "i2"]) for (const condition of ["control", "treatment"]) write(join(root, `evals/bdd2/prompts/${id}-${condition}.md`), `${id} ${condition}; return strict JSON\n`);
  for (const id of ["s2", "eb", "ei", "i2"]) { write(join(root, `evals/bdd2/rubrics/${id}.schema.json`), "{}\n"); write(join(root, `evals/bdd2/metrics/${id}.md`), `${id} metrics\n`); }
  write(join(root, "evals/bdd2/rubrics/e2.md"), "two reviewer rubric\n");
  for (const name of ["experiment-s.md", "experiment-a.md", "phase-e-gate.md"]) write(join(root, `evals/bdd2/reports/${name}`), `historical ${name}\n`);
  for (let index = 1; index <= 6; index += 1) {
    write(join(root, `evals/bdd2/evidence/eb-${index}.md`), `named uncertainty EB ${index}\nsource_url: https://example.test/${index}\nprivacy_review: pass\n`);
    write(join(root, `evals/bdd2/evidence/ei-${index}.md`), `synthetic direction EI ${index}\nfalsifier: user cannot recover\n`);
    write(join(root, `evals/bdd2/evidence/eb-${index}.png`), `eb asset ${index}\n`);
    write(join(root, `evals/bdd2/evidence/ei-${index}.png`), `ei asset ${index}\n`);
  }
  write(join(root, "evals/bdd2/fixtures/page/package.json"), `${JSON.stringify({ scripts: { test: "true" } })}\n`);
  write(join(root, "evals/bdd2/fixtures/page/page.ts"), "export const page = 'before';\n");

  const tasks: any[] = [];
  for (let index = 1; index <= 12; index += 1) tasks.push({ id: `S2-H-${String(index).padStart(2, "0")}`, experiment: "S2", title: `Shape ${index}`, agent_input: `Shape public task ${index}` });
  for (const id of ["EB", "EI"] as const) for (let index = 1; index <= 6; index += 1) tasks.push({ id: `${id}-H-${String(index).padStart(2, "0")}`, experiment: id, title: `${id} ${index}`, agent_input: `${id} public task ${index}`, named_uncertainty: `uncertainty ${index}` });
  tasks.push({ id: "I2-H-01", experiment: "I2", title: "Pilot", agent_input: "Implement page state" });
  const devTasks = [
    { id: "S2-D-01", experiment: "S2", title: "Dev Shape", agent_input: "Dev shape task" },
    { id: "EB-D-01", experiment: "EB", title: "Dev EB", agent_input: "Dev EB task", named_uncertainty: "dev browser uncertainty" },
    { id: "EI-D-01", experiment: "EI", title: "Dev EI", agent_input: "Dev EI task", named_uncertainty: "dev image uncertainty" },
    { id: "I2-D-01", experiment: "I2", title: "Dev I2", agent_input: "Dev pilot" },
  ];
  const kinds: Record<string, string> = { S2: "inline-shape", EB: "browser-adapter", EI: "imagegen-adapter", I2: "implementation-pilot" };
  const truthFor = (set: any[]) => Object.fromEntries(set.map((task) => [task.id,
    task.experiment === "S2" ? { kind: kinds.S2, risk_tags: ["recovery"], required_behaviors: ["user completes task"], unsupported_expansions: [], protected_concerns: [], expected_authority: "inline", escalation_required: false }
      : task.experiment === "EB" ? { kind: kinds.EB, reference_pattern: "reference", forbidden_inference: "does not prove demand", expected_disposition: "Adapt", required_boundary: ["complete"], unsupported_concepts: [], protected_concerns: [], uncertainty_closable_by_browser: true }
        : task.experiment === "EI" ? { kind: kinds.EI, forbidden_inference: "does not prove demand", prototype_can_close_uncertainty: true, expected_disposition: "Adapt", expected_resolution: "select minimum", required_boundary: ["complete"], unsupported_concepts: [], protected_concerns: [] }
          : { kind: kinds.I2, fixture: "evals/bdd2/fixtures/page", required_acceptance: ["passes"], protected_concerns: [] }
  ]));
  json(join(root, "evals/bdd2/tasks/held-out-e2.json"), { schema: "repo-harness-bdd2-task-set.e2", partition: "held_out", tasks });
  json(join(root, "evals/bdd2/tasks/development-e2.json"), { schema: "repo-harness-bdd2-task-set.e2", partition: "development", tasks: devTasks });
  json(join(root, "evals/bdd2/truth/held-out-e2.json"), { schema: "repo-harness-bdd2-truth-set.e2", partition: "held_out", tasks: truthFor(tasks) });
  json(join(root, "evals/bdd2/truth/development-e2.json"), { schema: "repo-harness-bdd2-truth-set.e2", partition: "development", tasks: truthFor(devTasks) });

  const stub = join(root, "agent-stub.sh");
  write(stub, `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "\${1:-}" == "--version" ]]; then printf 'e2-stub 1.0\\n'; exit 0; fi\ncat >/dev/null\nprintf '{"schema":"repo-harness-bdd2-agent-response.e2","outcome":{"boundary_decision":"minimal","required_behaviors":["complete"],"recovery_and_trust":[],"exposed_user_concepts":[],"excluded_behaviors":[],"authority":"inline"},"evidence_use":{"adopted_claims":[],"adapted_claims":[],"avoided_claims":[],"unsupported_claims":[]}}\\n'\n`);
  spawnSync("chmod", ["+x", stub]);
  const state = options.sealed === false ? "foundation" : "sealed";
  const freeze = (id: string) => ({ id: `e2-${id}`, state, sealed_at: state === "sealed" ? "2026-07-12T16:00:00Z" : null });
  const conditions = (id: string) => ({ control: { prompt: `evals/bdd2/prompts/${id}-control.md`, sha256: sha256File(join(root, `evals/bdd2/prompts/${id}-control.md`)) }, treatment: { prompt: `evals/bdd2/prompts/${id}-treatment.md`, sha256: sha256File(join(root, `evals/bdd2/prompts/${id}-treatment.md`)) } });
  const appendices = (id: "eb" | "ei", prefix: "EB" | "EI") => ({
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`${prefix}-H-${String(i + 1).padStart(2, "0")}`, { appendix: ref(`evals/bdd2/evidence/${id}-${i + 1}.md`, root), assets: [ref(`evals/bdd2/evidence/${id}-${i + 1}.png`, root)] }])),
    [`${prefix}-D-01`]: { appendix: ref(`evals/bdd2/evidence/${id}-1.md`, root), assets: [ref(`evals/bdd2/evidence/${id}-1.png`, root)] },
  });
  const fixturePath = "evals/bdd2/fixtures/page";
  const experiments = {
    S2: { kind: "inline-shape", freeze: freeze("s2"), repetitions: 3, held_out_task_count: 12, conditions: conditions("s2") },
    EB: { kind: "browser-adapter", freeze: freeze("eb"), repetitions: 2, held_out_task_count: 6, conditions: conditions("eb"), appendices: appendices("eb", "EB") },
    EI: { kind: "imagegen-adapter", freeze: freeze("ei"), repetitions: 2, held_out_task_count: 6, conditions: conditions("ei"), appendices: appendices("ei", "EI") },
    I2: { kind: "implementation-pilot", freeze: freeze("i2"), repetitions: 2, held_out_task_count: 1, conditions: conditions("i2"), fixture: { path: fixturePath, sha256: hashTree(join(root, fixturePath)), acceptance: ref("evals/bdd2/fixtures/page/package.json", root), acceptance_command: ["bun", "run", "test"] }, prerequisite: { shape: options.i2Enabled ? "Pass" : "NotRun", adapters: { EB: options.i2Enabled ? "Pass" : "NotRun", EI: "NotRun" } } },
  };
  const experimentAuthority = Object.fromEntries((["S2", "EB", "EI", "I2"] as const).map((id) => [id, { score_schema: `evals/bdd2/rubrics/${id.toLowerCase()}.schema.json`, score_schema_sha256: sha256File(join(root, `evals/bdd2/rubrics/${id.toLowerCase()}.schema.json`)), metrics: `evals/bdd2/metrics/${id.toLowerCase()}.md`, metrics_sha256: sha256File(join(root, `evals/bdd2/metrics/${id.toLowerCase()}.md`)) }]));
  const manifest = {
    schema: "repo-harness-bdd2-evaluation.e2", runner: ref("scripts/run-bdd2-evals.ts", root), output_root: ".ai/harness/runs/bdd2",
    experiments,
    partitions: {
      development: { tasks: "evals/bdd2/tasks/development-e2.json", tasks_sha256: sha256File(join(root, "evals/bdd2/tasks/development-e2.json")), truth: "evals/bdd2/truth/development-e2.json", truth_sha256: sha256File(join(root, "evals/bdd2/truth/development-e2.json")) },
      held_out: { tasks: "evals/bdd2/tasks/held-out-e2.json", tasks_sha256: sha256File(join(root, "evals/bdd2/tasks/held-out-e2.json")), truth: "evals/bdd2/truth/held-out-e2.json", truth_sha256: sha256File(join(root, "evals/bdd2/truth/held-out-e2.json")) },
    },
    adjudication: { rubric: "evals/bdd2/rubrics/e2.md", rubric_sha256: sha256File(join(root, "evals/bdd2/rubrics/e2.md")), reviewers: { outcome: ["reviewer-one", "reviewer-two"], evidence: "evidence-reviewer", owner: "owner" }, correction_costs: { remove_surface: 2, restore_recovery: 3 }, experiments: experimentAuthority },
    agents: { stub: { command: stub, args: ["{model}"], version_args: ["--version"], expected_version: "e2-stub 1.0", response_schema: ref("evals/bdd2/rubrics/e2.md", root), model: "stub-model", sampling: { temperature: 0 }, input_source: "stdin", response_source: "stdout", workspace_mode: "isolated", credential_mode: "none", transport: "model-transport-only", tools: { browser: false, web_search: false, mcp: false, external: false, repository: false } } },
    historical_phase_e: [ref("evals/bdd2/reports/experiment-s.md", root), ref("evals/bdd2/reports/experiment-a.md", root), ref("evals/bdd2/reports/phase-e-gate.md", root)],
  };
  json(join(root, "evals/bdd2/evaluation-manifest.json"), manifest);
  write(join(root, ".gitignore"), ".ai/\n");
  for (const args of [["init"], ["config", "user.name", "E2 Test"], ["config", "user.email", "e2@example.test"], ["add", "."], ["commit", "-m", "fixture"]]) expect(spawnSync("git", args, { cwd: root }).status).toBe(0);
  return root;
}

describe("E2 authority direct cut", () => {
  test("accepts only E2 schema and exact S2/EB/EI/I2 coordinates", () => {
    const root = createFixture({ i2Enabled: true });
    try {
      const evaluation = validateEvaluation(root);
      expect(buildRunPlan(evaluation, { experiment: "S2", partition: "held_out" })).toHaveLength(72);
      expect(buildRunPlan(evaluation, { experiment: "EB", partition: "held_out" })).toHaveLength(24);
      expect(buildRunPlan(evaluation, { experiment: "EI", partition: "held_out" })).toHaveLength(24);
      expect(buildRunPlan(evaluation, { experiment: "I2", partition: "held_out" })).toHaveLength(4);
      const manifestPath = join(root, "evals/bdd2/evaluation-manifest.json"); const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")); manifest.schema = "repo-harness-bdd2-evaluation.v3"; json(manifestPath, manifest);
      expect(() => validateEvaluation(root)).toThrow("no current-authority fallback");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("I2 fails closed until Shape and one adapter pass", () => {
    const root = createFixture(); try { const evaluation = validateEvaluation(root); expect(() => buildRunPlan(evaluation, { experiment: "I2", partition: "held_out" })).toThrow("gated-not-run"); } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("kind discrimination, authority hashes, and model transport tool policy fail closed", () => {
    const root = createFixture();
    try {
      const path = join(root, "evals/bdd2/evaluation-manifest.json"); const original = readFileSync(path, "utf-8"); const manifest = JSON.parse(original);
      manifest.experiments.EB.kind = "inline-shape"; json(path, manifest); expect(() => validateEvaluation(root)).toThrow("kind mismatch");
      write(path, original); write(join(root, "evals/bdd2/evidence/eb-1.md"), "drift\n"); expect(() => validateEvaluation(root)).toThrow("sha256 drift");
      write(join(root, "evals/bdd2/evidence/eb-1.md"), "named uncertainty EB 1\nsource_url: https://example.test/1\nprivacy_review: pass\n");
      const manifest2 = JSON.parse(original); manifest2.agents.stub.tools.browser = true; json(path, manifest2); expect(() => validateEvaluation(root)).toThrow("tools must all be disabled");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("treatment alone receives the task-specific appendix", () => {
    const root = createFixture(); try { const evaluation = validateEvaluation(root); const coordinates = buildRunPlan(evaluation, { experiment: "EB", partition: "held_out", taskIds: ["EB-H-01"], repetitions: 1 }); const control = buildAgentPacket(evaluation, coordinates.find((v) => v.condition === "control")!); const treatment = buildAgentPacket(evaluation, coordinates.find((v) => v.condition === "treatment")!); expect(control).not.toContain("source_url"); expect(treatment).toContain("source_url: https://example.test/1"); expect(treatment).not.toContain("EB 2"); } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("structured response, isolation, and I2 capture", () => {
  test("normalization is deterministic and strips evidence use", () => {
    const response = validateStructuredAgentResponse({ schema: "repo-harness-bdd2-agent-response.e2", outcome: { boundary_decision: "minimal", required_behaviors: ["save"], recovery_and_trust: ["undo"], exposed_user_concepts: [], excluded_behaviors: ["settings"], authority: "inline" }, evidence_use: { adopted_claims: [], adapted_claims: ["pattern"], avoided_claims: [], unsupported_claims: [] } }, "EB");
    const normalized = normalizeOutcome({ id: "EB-H-01", experiment: "EB", title: "Task", agent_input: "Input", named_uncertainty: "Question" }, response);
    expect(canonicalJson(normalized)).not.toContain("evidence_use"); expect(canonicalJson(normalized)).not.toContain("pattern"); expect(canonicalJson(normalized)).toBe(canonicalJson(normalized));
    expect(() => validateStructuredAgentResponse({ ...response, provider: "browser" }, "EB")).toThrow("keys must be exactly");
  });

  test("environment is credential-minimal but explicitly model-transport-only", () => {
    const env = buildIsolatedAgentEnv("/tmp/e2-home", { PATH: "/usr/bin", OPENAI_API_KEY: "secret", HTTPS_PROXY: "secret" });
    expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.HTTPS_PROXY).toBeUndefined(); expect(env.HOME).toBe("/tmp/e2-home");
  });

  test("I2 creates four fresh identical fixture copies and captures patch, tests, tree, and inventory", () => {
    const root = createFixture({ i2Enabled: true });
    try {
      const report = runEvaluation(validateEvaluation(root), { experiment: "I2", partition: "held_out", agent: "stub", outputPath: ".ai/harness/runs/bdd2/i2" });
      expect(report.packets).toHaveLength(4); expect(new Set(report.packets.map((p) => p.fixture_capture?.source_tree_sha256)).size).toBe(1);
      for (const packet of report.packets) { expect(packet.fixture_capture?.patch_sha256).toMatch(/^[a-f0-9]{64}$/); const capture = JSON.parse(readFileSync(join(root, ".ai/harness/runs/bdd2/i2/pilot", `${packet.packet_id}.json`), "utf-8")); expect(capture.tests.exit_code).toBe(0); expect(capture.inventory.before).toEqual(capture.inventory.after); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("two-layer reviewer authority", () => {
  test("requires two reviewers, output-specific treatment evidence score, and pre-reveal adjudication for every disagreement", () => {
    const root = createFixture();
    try {
      const evaluation = validateEvaluation(root); const report = runEvaluation(evaluation, { experiment: "EB", partition: "held_out", agent: "stub", outputPath: ".ai/harness/runs/bdd2/eb" }); const runRoot = join(root, report.output_path);
      const scoreValue = { uncertainty_closed: true, boundary_category: "adapt", unsupported_expansion: 0, unsupported_user_concepts: 0, required_behavior_omission: 0, protected_concern_omissions: [], authority_fit: true, escalation_correct: true, unnecessary_tracked_artifact_count: 0, correction_operations: [], notes: "locked" };
      for (const packet of report.packets) {
        for (const reviewer of ["reviewer-one", "reviewer-two"]) json(join(runRoot, "scores/outcome", packet.packet_id, `${reviewer}.json`), { schema: "repo-harness-bdd2-outcome-score.e2", packet_id: packet.packet_id, task_id: packet.task_id, experiment: "EB", reviewer_id: reviewer, normalized_outcome_sha256: packet.normalized_outcome_sha256, locked_at: "2026-07-12T17:00:00Z", score: scoreValue });
        const privateCoordinate = JSON.parse(readFileSync(join(runRoot, "private", `${packet.packet_id}.json`), "utf-8"));
        if (privateCoordinate.condition === "treatment") json(join(runRoot, "scores/evidence", `${packet.packet_id}.json`), { schema: "repo-harness-bdd2-evidence-score.e2", packet_id: packet.packet_id, reviewer_id: "evidence-reviewer", appendix_sha256: privateCoordinate.appendix_sha256, full_response_sha256: packet.full_response_sha256, locked_at: "2026-07-12T17:00:00Z", score: { provenance_complete: true, question_bound: true, privacy_reviewed: true, adopt_adapt_avoid_complete: true, unsupported_claim_count: 0, feature_need_inference_count: 0, notes: "output-specific compliance" } });
      }
      expect(validateScores(evaluation, report.output_path)).toEqual({ outcomeScoreCount: 48, evidenceScoreCount: 12, adjudicationCount: 0 });
      const first = report.packets[0]; const secondPath = join(runRoot, "scores/outcome", first.packet_id, "reviewer-two.json"); const second = JSON.parse(readFileSync(secondPath, "utf-8")); second.score.uncertainty_closed = false; json(secondPath, second);
      expect(() => validateScores(evaluation, report.output_path)).toThrow("requires locked pre-reveal owner adjudication");
      json(join(runRoot, "adjudications", `${first.packet_id}.json`), { schema: "repo-harness-bdd2-owner-adjudication.e2", packet_id: first.packet_id, owner_id: "owner", locked_at: "2026-07-12T17:30:00Z", reason: "truth-aware resolution before reveal", score: scoreValue });
      expect(validateScores(evaluation, report.output_path).adjudicationCount).toBe(1);
      rmSync(join(runRoot, "scores/evidence", `${report.packets.find((p) => JSON.parse(readFileSync(join(runRoot, "private", `${p.packet_id}.json`), "utf-8")).condition === "treatment")!.packet_id}.json`));
      expect(() => validateScores(evaluation, report.output_path)).toThrow("requires output-specific evidence-use score");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("score validation rejects stale authority, malformed packet ids, and spoofed private conditions before file lookup", () => {
    const root = createFixture();
    try {
      const evaluation = validateEvaluation(root);
      const report = runEvaluation(evaluation, { experiment: "EB", partition: "development", taskIds: ["EB-D-01"], conditions: ["control"], repetitions: 1, agent: "stub", outputPath: ".ai/harness/runs/bdd2/integrity" });
      const runRoot = join(root, report.output_path);
      const runPath = join(runRoot, "run.json");
      const originalRun = readFileSync(runPath, "utf-8");
      const run = JSON.parse(originalRun);

      run.freeze_id = "stale-freeze";
      json(runPath, run);
      expect(() => validateScores(evaluation, report.output_path)).toThrow("freeze does not match");

      write(runPath, originalRun);
      const malformed = JSON.parse(originalRun);
      malformed.packets[0].packet_id = "../escape";
      json(runPath, malformed);
      expect(() => validateScores(evaluation, report.output_path)).toThrow("unique 32-hex");

      write(runPath, originalRun);
      const packet = report.packets[0];
      const privatePath = join(runRoot, "private", `${packet.packet_id}.json`);
      const coordinate = JSON.parse(readFileSync(privatePath, "utf-8"));
      coordinate.condition = "not-treatment";
      json(privatePath, coordinate);
      expect(() => validateScores(evaluation, report.output_path)).toThrow("Private coordinate authority mismatch");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

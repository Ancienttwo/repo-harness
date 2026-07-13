import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, relative } from "path";
import {
  REPO_ROOT,
  buildAdjudicatorPacket,
  buildOutcomeReviewerPacket,
  canonicalJson,
  opaquePacketId,
  runJsonProcess,
  sha256File,
  sha256Text,
  validateEvaluation,
  validateOutcomeScore,
  validateScoreRun,
  applyEa1ValidatorRules,
  validateTypedEvidencePacket,
  validateEa1Evaluation,
  validateEa1ScoreRun,
  projectEa1Evidence,
  verifyEa1EvidenceProjection,
  planEa1Packets,
  type OutcomeScore,
  type TypedEvidencePacket,
} from "../scripts/run-bdd2-evals";

const created: string[] = [];
afterAll(() => { for (const path of created) rmSync(path, { recursive: true, force: true }) });

function write(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function neutralScore(overrides: Partial<OutcomeScore> = {}): OutcomeScore {
  return {
    uncertainty_closed: false,
    boundary_category: "bounded",
    unsupported_expansion: 0,
    unsupported_user_concepts: 0,
    required_behavior_omission: 0,
    protected_concern_omissions: [],
    authority_fit: true,
    escalation_correct: true,
    correction_operations: [],
    notes: "frozen score",
    ...overrides,
  };
}

function materializeAuthorityMutation(mutateCorpus: (corpus: any) => void): string {
  const root = join(REPO_ROOT, ".ai/harness/runs/bdd2", `test-e3-authority-${Date.now()}-${Math.random().toString(16).slice(2)}`); created.push(root);
  const corpus = JSON.parse(readFileSync(join(REPO_ROOT, "evals/bdd2/evidence/e3/source-corpus.json"), "utf8")); mutateCorpus(corpus); write(join(root, "source-corpus.json"), corpus);
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "evals/bdd2/evaluation-manifest.json"), "utf8")); manifest.source_corpus = { path: relative(REPO_ROOT, join(root, "source-corpus.json")).replace(/\\/g, "/"), sha256: sha256File(join(root, "source-corpus.json")) }; write(join(root, "manifest.json"), manifest);
  return relative(REPO_ROOT, join(root, "manifest.json")).replace(/\\/g, "/");
}

function materializeScoreRun(experiment: "S3" | "EB3" | "EI3", disagreeFirst = false): string {
  const evaluation = validateEvaluation();
  const root = join(REPO_ROOT, ".ai/harness/runs/bdd2", `test-e3-${experiment.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  created.push(root);
  const packets = evaluation.corpus.rows.filter((row) => row.experiment === experiment).map((row, index) => {
    const packetId = opaquePacketId(evaluation.manifest.experiments[experiment].freeze_id, row.source_packet_id);
    const scores = evaluation.manifest.adjudication.reviewers.outcome.map((reviewerId, reviewerIndex) => {
      const score = neutralScore(index === 0 && disagreeFirst && reviewerIndex === 1 ? { unsupported_expansion: 1 } : {});
      const value = { schema: "repo-harness-bdd2-locked-outcome-score.e3", packet_id: packetId, reviewer_id: reviewerId, locked_at: "2026-07-13T00:00:00Z", response_sha256: "a".repeat(64), score };
      write(join(root, "scores/outcome", packetId, `${reviewerId}.json`), value);
      return value;
    });
    let adjudicationSha: string | null = null;
    if (index === 0 && disagreeFirst) {
      const value = { schema: "repo-harness-bdd2-locked-outcome-score.e3", packet_id: packetId, reviewer_id: evaluation.manifest.adjudication.reviewers.adjudicator, locked_at: "2026-07-13T00:00:00Z", response_sha256: "b".repeat(64), score: neutralScore() };
      write(join(root, "adjudications", `${packetId}.json`), value);
      adjudicationSha = sha256Text(canonicalJson(value));
    }
    let evidenceSha: string | null = null;
    if (row.condition === "treatment" && experiment !== "S3") {
      const browser = experiment === "EB3";
      const score = browser
        ? { provenance_complete: true, question_bound: true, privacy_reviewed: true, adopt_adapt_avoid_complete: true, unsupported_assertion_count: 0, explicit_limitation_count: 2, feature_need_inference_count: 0, notes: "limitations preserved" }
        : { question_bound: true, synthetic_labeled: true, falsifier_present: true, unsupported_assertion_count: 0, explicit_limitation_count: 2, user_validation_claim_count: 0, notes: "limitations preserved" };
      const value = { schema: "repo-harness-bdd2-locked-evidence-score.e3", packet_id: packetId, reviewer_id: browser ? evaluation.manifest.adjudication.reviewers.browser_evidence : evaluation.manifest.adjudication.reviewers.imagegen_evidence, locked_at: "2026-07-13T00:00:00Z", response_sha256: "c".repeat(64), score };
      write(join(root, "scores/evidence", `${packetId}.json`), value);
      evidenceSha = sha256Text(canonicalJson(value));
    }
    return { packet_id: packetId, source_packet_id: row.source_packet_id, task_id: row.task_id, condition: row.condition, repetition: row.repetition, full_response_sha256: row.full_response_sha256, normalized_outcome_sha256: row.normalized_outcome_sha256, reviewer_score_sha256: [sha256Text(canonicalJson(scores[0])), sha256Text(canonicalJson(scores[1]))], adjudication_sha256: adjudicationSha, evidence_score_sha256: evidenceSha };
  });
  write(join(root, "run.json"), { schema: "repo-harness-bdd2-score-run.e3", freeze_id: evaluation.manifest.experiments[experiment].freeze_id, source_commit: "d".repeat(40), manifest_sha256: evaluation.manifest.experiments[experiment].score_manifest_sha256, experiment, output_path: relative(REPO_ROOT, root).replace(/\\/g, "/"), packets });
  return relative(REPO_ROOT, root).replace(/\\/g, "/");
}

describe("BDD2 Phase E3 authority", () => {
  test("direct-cuts to E3 and freezes the complete reused corpus", () => {
    const evaluation = validateEvaluation();
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd2-evaluation.e3");
    expect(Object.keys(evaluation.manifest.experiments)).toEqual(["S3", "EB3", "EI3"]);
    expect(evaluation.corpus.rows.filter((row) => row.experiment === "S3")).toHaveLength(72);
    expect(evaluation.corpus.rows.filter((row) => row.experiment === "EB3")).toHaveLength(24);
    expect(evaluation.corpus.rows.filter((row) => row.experiment === "EI3")).toHaveLength(24);
  });

  test("outcome packets withhold condition, source id, provider, appendix, URL, and tracked-artifact judgment", () => {
    const evaluation = validateEvaluation();
    const row = evaluation.corpus.rows.find((item) => item.experiment === "EB3" && item.condition === "treatment")!;
    const packet = buildOutcomeReviewerPacket(evaluation, row);
    const text = JSON.stringify(packet);
    expect(text).not.toContain(row.source_packet_id);
    expect(text).not.toContain(row.task_id);
    expect(text).not.toContain('"condition"');
    expect(text).not.toContain("appendix");
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toContain("unnecessary_tracked_artifact_count");
  });

  test("fresh adjudicator packet is explicit and does not expose condition", () => {
    const evaluation = validateEvaluation();
    const row = evaluation.corpus.rows[0];
    const id = opaquePacketId(evaluation.manifest.experiments[row.experiment].freeze_id, row.source_packet_id);
    const primary = evaluation.manifest.adjudication.reviewers.outcome.map((reviewer_id) => ({ schema: "repo-harness-bdd2-locked-outcome-score.e3", packet_id: id, reviewer_id, locked_at: "2026-07-13T00:00:00Z", response_sha256: "a".repeat(64), score: neutralScore() })) as any;
    const packet = buildAdjudicatorPacket(evaluation, row, primary);
    expect(packet.schema).toBe("repo-harness-bdd2-outcome-adjudication-packet.e3");
    expect(JSON.stringify(packet)).not.toContain('"condition"');
  });

  test("score schema excludes proposal-only artifacts", () => {
    expect(() => validateOutcomeScore({ ...neutralScore(), unnecessary_tracked_artifact_count: 1 })).toThrow("keys must be exactly");
  });

  test("frozen authority rejects a non-codex credential recipient", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "evals/bdd2/evaluation-manifest.json"), "utf8"));
    manifest.model_profile.command = "/usr/bin/env";
    const root = join(REPO_ROOT, ".ai/harness/runs/bdd2", `test-e3-manifest-${Date.now()}`); created.push(root); write(join(root, "manifest.json"), manifest);
    expect(() => validateEvaluation(REPO_ROOT, relative(REPO_ROOT, join(root, "manifest.json")))).toThrow("absolute codex CLI path");
  });

  test("source corpus cannot replace the deterministic normalized projection", () => {
    const manifest = materializeAuthorityMutation((corpus) => {
      corpus.rows[0].normalized_outcome.outcome.boundary_decision = "Kill";
      corpus.rows[0].normalized_outcome_sha256 = sha256Text(canonicalJson(corpus.rows[0].normalized_outcome));
    });
    expect(() => validateEvaluation(REPO_ROOT, manifest)).toThrow("normalized outcome is not the deterministic full-response projection");
  });

  test("source corpus provenance is structurally validated", () => {
    const manifest = materializeAuthorityMutation((corpus) => { corpus.sources[0].packet_count = "72"; });
    expect(() => validateEvaluation(REPO_ROOT, manifest)).toThrow("provenance invalid");
  });

  test("source corpus provenance must resolve to the sealed historical manifest", () => {
    const manifest = materializeAuthorityMutation((corpus) => { corpus.sources[0].source_commit = "f".repeat(40); });
    expect(() => validateEvaluation(REPO_ROOT, manifest)).toThrow("source corpus commit is unavailable");
  });

  test("adapter evidence coordinates remain bound to the reviewed appendix", () => {
    const manifest = materializeAuthorityMutation((corpus) => { const row = corpus.rows.find((item: any) => item.experiment === "EB3" && item.condition === "treatment"); row.appendix_sha256 = "f".repeat(64); });
    expect(() => validateEvaluation(REPO_ROOT, manifest)).toThrow("corpus appendix authority mismatch");
  });

  test("model transport rejects when the child closes stdin early", async () => {
    await expect(runJsonProcess("/bin/sh", ["-c", "exec 0<&-; sleep 0.05; exit 7"], REPO_ROOT, { PATH: process.env.PATH ?? "/usr/bin:/bin" }, "x".repeat(8 * 1024 * 1024))).rejects.toThrow();
  });

  test("complete score runs require fresh adjudication only on disagreement", () => {
    const evaluation = validateEvaluation();
    const run = materializeScoreRun("EB3", true);
    expect(validateScoreRun(evaluation, run)).toEqual({ outcomeScoreCount: 48, evidenceScoreCount: 12, adjudicationCount: 1 });
    const root = join(REPO_ROOT, run);
    const report = JSON.parse(readFileSync(join(root, "run.json"), "utf8"));
    const first = report.packets.find((packet: any) => packet.adjudication_sha256);
    rmSync(join(root, "adjudications", `${first.packet_id}.json`));
    expect(() => validateScoreRun(evaluation, run)).toThrow("disagreement requires fresh adjudicator score");
  });
});

// ============================================================================
// BDD3-EA1 — Step 0 falsifier fixtures and evaluation-authority coverage.
// The two packets below are hand-reconstructed from frozen BDD2 data
// (evals/bdd2/reports/experiment-eb3-evidence.json, evals/bdd2/tasks/held-out-e2.json,
// evals/bdd2/truth/held-out-e2.json) exactly as recorded in
// evals/bdd3/rubrics/validator-rules.md and
// tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md.
// ============================================================================

const EA1_MANIFEST = "evals/bdd3/evaluation-manifest.json";

function ea1FalsifierPacketA(): TypedEvidencePacket {
  // EB-H-04 treatment rep 1, packet_id e3bd0caf23350fbd34a4e38a33281718.
  // evidence_score.notes: "adds unsupported retry-policy claims (exactly one retry
  // and no further retries) not justified by the appendix/truth ... infers one
  // supported screenshot-derived feature need (row-scoped in-place feedback)."
  return {
    schema: "repo-harness-bdd3-typed-evidence-packet.ea1",
    uncertainty: "Should a retrying row keep progress and completion feedback adjacent to the action instead of navigating to a job-status page?",
    evidence: [
      { kind: "current_truth", locator: "task.agent_input", claim: "One failed export row preserves its filename, supports one retry, and can expose running/succeeded/failed state; no job history or orchestration surface is authorized." },
      { kind: "reference_pattern", locator: "evals/bdd2/evidence/browser/EB-H-04.md", claim: "Carbon inline loading communicates active, success, and failure states adjacent to the initiating control." },
    ],
    need_basis: { source: "reference_pattern" },
    decision: { disposition: "Adapt", supported_by: [1], introduced_product_policy: true },
    closure: { level: "closed", ceiling: "authorized" },
    not_established: [],
  };
}
function ea1FalsifierTruthA() {
  return {
    required_boundary: ["Keep retry state adjacent to the existing row", "Preserve filename", "Show running, succeeded, or failed", "Allow retry again after a later failure"],
    protected_concerns: [{ concern: "recovery", severity: "P1" as const, summary: "Retry must preserve export identity and cannot claim success before completion." }],
    closable: true,
  };
}
function ea1FalsifierPacketB(): TypedEvidencePacket {
  // EB-H-06 treatment rep 2, packet_id f7f9e5d58db6e8f7fae95f9bf2170fd5.
  // evidence_score.notes: "No unsupported factual assertions identified; response
  // consistently avoids unsupported additions and preserves explicit cannot-prove
  // limits." (unsupported_assertion_count: 0, feature_need_inference_count: 0)
  return {
    schema: "repo-harness-bdd3-typed-evidence-packet.ea1",
    uncertainty: "Should a simple short list adopt a dense data-table toolbar, bulk selection, sorting, and overflow actions?",
    evidence: [
      { kind: "current_truth", locator: "task.agent_input", claim: "Saved views appear in a short existing list; the owner needs to rename one view in place with validation and save-failure recovery." },
      { kind: "reference_pattern", locator: "evals/bdd2/evidence/browser/EB-H-06.md", claim: "A dense data table pattern exists for comparable multi-row records with toolbar, selection, sorting, and row actions; it does not establish that this short list needs those controls." },
    ],
    need_basis: { source: "current_truth" },
    decision: { disposition: "Avoid", supported_by: [0, 1], introduced_product_policy: false },
    closure: { level: "closed", ceiling: "authorized" },
    not_established: [],
  };
}
function ea1FalsifierTruthB() {
  return {
    required_boundary: ["Rename one saved view in place", "Validate name", "Preserve old name on save failure"],
    protected_concerns: [{ concern: "recovery", severity: "P1" as const, summary: "A failed rename must preserve the prior saved-view name." }],
    closable: true,
  };
}

describe("BDD3 EA1 typed-packet validator (Step 0 falsifier)", () => {
  test("EB-H-04 treatment rep1 reconstruction flags rules 1, 2, and 3", () => {
    const result = applyEa1ValidatorRules(ea1FalsifierPacketA(), ea1FalsifierTruthA());
    expect(result.ceiling_violation).toBe(true);
    const rules = new Set(result.violations.map((v) => v.rule));
    expect(rules.has(1)).toBe(true);
    expect(rules.has(2)).toBe(true);
    expect(rules.has(3)).toBe(true);
  });

  test("EB-H-06 treatment rep2 reconstruction passes clean", () => {
    const result = applyEa1ValidatorRules(ea1FalsifierPacketB(), ea1FalsifierTruthB());
    expect(result).toEqual({ ceiling_violation: false, violations: [] });
  });

  test("an honest Defer with no evidence cited is never a violation", () => {
    const packet = ea1FalsifierPacketB();
    const honest: TypedEvidencePacket = { ...packet, decision: { disposition: "Defer", supported_by: [], introduced_product_policy: false }, closure: { level: "not_established", ceiling: "pattern_only" }, not_established: ["preference"] };
    expect(applyEa1ValidatorRules(honest, { required_boundary: [], protected_concerns: [], closable: true })).toEqual({ ceiling_violation: false, violations: [] });
  });

  test("need_basis=reference_pattern alone triggers only rule 2, proving rules are independently gated", () => {
    const packet = ea1FalsifierPacketB();
    const subtle: TypedEvidencePacket = { ...packet, need_basis: { source: "reference_pattern" } };
    const result = applyEa1ValidatorRules(subtle, ea1FalsifierTruthB());
    expect(result.violations).toEqual([{ rule: 2, detail: "need_basis.source is reference_pattern; degrades to Defer" }]);
  });

  test("a clean Avoid citing only pattern evidence at a pattern_only ceiling is not a violation", () => {
    const packet = ea1FalsifierPacketB();
    const clean: TypedEvidencePacket = { ...packet, decision: { disposition: "Avoid", supported_by: [1], introduced_product_policy: false }, need_basis: { source: "current_truth" }, closure: { level: "partial", ceiling: "pattern_only" } };
    expect(applyEa1ValidatorRules(clean, ea1FalsifierTruthB())).toEqual({ ceiling_violation: false, violations: [] });
  });

  // Stage A (EA1-02) rule 4 stress, per notes "Gate 1 corrections" item (d):
  // an accessibility-trap archetype's forbidden_inference guarantees no
  // citation can legitimately discharge the concern, so a single irrelevant
  // current_truth citation must not exempt it from rule 4. Confirmed live
  // against EA1-D-03 (dev, not held-out) before this fix landed: the packet
  // below reproduces that shape by construction.
  test("Stage A EA1-02: an accessibility trap citing only an unrelated current_truth fact must fire rule 4", () => {
    const trapTruth = { required_boundary: ["Keep the existing Cancel/Confirm buttons working as-is until non-visual labeling is verified"], protected_concerns: [{ concern: "accessibility", severity: "P1" as const, summary: "Non-visual differentiation is unresolved." }], closable: false };
    const packet: TypedEvidencePacket = {
      schema: "repo-harness-bdd3-typed-evidence-packet.ea1",
      uncertainty: "Does a reference pattern establish that Cancel and Confirm are distinguishable to screen-reader users, not just visually?",
      evidence: [
        { kind: "reference_pattern", locator: "appendix", claim: "Primary/secondary visual hierarchy exists in the reference" },
        { kind: "current_truth", locator: "current truth", claim: "A confirmation dialog already renders a visually distinct primary Confirm button and secondary Cancel button" },
      ],
      need_basis: { source: "current_truth" },
      decision: { disposition: "Adopt", supported_by: [1], introduced_product_policy: false },
      closure: { level: "closed", ceiling: "authorized" },
      not_established: [],
    };
    const result = applyEa1ValidatorRules(packet, trapTruth);
    expect(result.ceiling_violation).toBe(true);
    expect(result.violations).toEqual([{ rule: 4, detail: "accessibility concern neither cited from current_truth nor listed not_established" }]);
  });

  test("Stage A EA1-02: a closable archetype's accessibility concern may still be discharged by a genuine non-pattern citation (rule 4 fix is a no-op for closable truths)", () => {
    const closableTruth = { required_boundary: ["Validate only the existing format rule"], protected_concerns: [{ concern: "accessibility", severity: "P2" as const, summary: "A visible format error must remain associated with the field for assistive technology." }], closable: true };
    const packet: TypedEvidencePacket = {
      schema: "repo-harness-bdd3-typed-evidence-packet.ea1",
      uncertainty: "Should the email field validate its format before submit?",
      evidence: [
        { kind: "reference_pattern", locator: "appendix", claim: "Inline associated format-error presentation exists" },
        { kind: "current_truth", locator: "current truth", claim: "The format rule is already fixed; error text is programmatically associated with the field via the existing form framework" },
      ],
      need_basis: { source: "current_truth" },
      decision: { disposition: "Adopt", supported_by: [1], introduced_product_policy: false },
      closure: { level: "closed", ceiling: "authorized" },
      not_established: [],
    };
    expect(applyEa1ValidatorRules(packet, closableTruth)).toEqual({ ceiling_violation: false, violations: [] });
  });

  test("validateTypedEvidencePacket rejects malformed packets", () => {
    const packet = ea1FalsifierPacketB();
    expect(() => validateTypedEvidencePacket({ ...packet, extra: true })).toThrow("keys must be exactly");
    expect(() => validateTypedEvidencePacket({ ...packet, need_basis: { source: "invented" } })).toThrow("need_basis.source invalid");
    expect(() => validateTypedEvidencePacket({ ...packet, decision: { ...packet.decision, disposition: "Maybe" } })).toThrow("decision.disposition invalid");
  });
});

describe("BDD3 EA1 evaluation authority", () => {
  test("validates the frozen manifest and reports 24 held-out + 6 dev archetypes", () => {
    const evaluation = validateEa1Evaluation(REPO_ROOT, EA1_MANIFEST);
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd3-evaluation.ea1");
    expect(Object.keys(evaluation.heldOutTasks)).toHaveLength(24);
    expect(Object.keys(evaluation.devTasks)).toHaveLength(6);
    expect(evaluation.manifest.experiment.held_out.expected_rows).toBe(96);
    expect(Object.values(evaluation.heldOutTasks).filter((t) => t.category === "closable")).toHaveLength(12);
    expect(Object.values(evaluation.heldOutTasks).filter((t) => t.category === "trap")).toHaveLength(12);
  });

  test("plan-scores enumerates exactly 96 held-out coordinates with distinct opaque ids", () => {
    const evaluation = validateEa1Evaluation(REPO_ROOT, EA1_MANIFEST);
    const packets = planEa1Packets(evaluation);
    expect(packets).toHaveLength(96);
    expect(new Set(packets.map((p) => p.packet_id)).size).toBe(96);
    for (const packet of packets) expect(packet.packet_id).toHaveLength(32);
  });

  test("dev archetype ids must stay disjoint from held-out ids", () => {
    const manifestRaw = JSON.parse(readFileSync(join(REPO_ROOT, EA1_MANIFEST), "utf8"));
    const root = join(REPO_ROOT, ".ai/harness/runs/bdd3", `test-ea1-overlap-${Date.now()}-${Math.random().toString(16).slice(2)}`); created.push(root);
    const devTasks = JSON.parse(readFileSync(join(REPO_ROOT, "evals/bdd3/tasks/dev-ea1.json"), "utf8"));
    devTasks.tasks[0].id = "EA1-C-01";
    write(join(root, "dev-ea1.json"), devTasks);
    manifestRaw.experiment.dev.tasks = { path: relative(REPO_ROOT, join(root, "dev-ea1.json")).replace(/\\/g, "/"), sha256: sha256File(join(root, "dev-ea1.json")) };
    write(join(root, "manifest.json"), manifestRaw);
    expect(() => validateEa1Evaluation(REPO_ROOT, relative(REPO_ROOT, join(root, "manifest.json")))).toThrow("dev archetype id overlaps held_out");
  });

  test("held_out trap_kind split must stay exactly 3 archetypes per category", () => {
    const manifestRaw = JSON.parse(readFileSync(join(REPO_ROOT, EA1_MANIFEST), "utf8"));
    const root = join(REPO_ROOT, ".ai/harness/runs/bdd3", `test-ea1-trapsplit-${Date.now()}-${Math.random().toString(16).slice(2)}`); created.push(root);
    const heldOutTasks = JSON.parse(readFileSync(join(REPO_ROOT, "evals/bdd3/tasks/held-out-ea1.json"), "utf8"));
    heldOutTasks.tasks.find((t: any) => t.id === "EA1-T-01").trap_kind = "product_policy";
    write(join(root, "held-out-ea1.json"), heldOutTasks);
    manifestRaw.experiment.held_out.tasks = { path: relative(REPO_ROOT, join(root, "held-out-ea1.json")).replace(/\\/g, "/"), sha256: sha256File(join(root, "held-out-ea1.json")) };
    write(join(root, "manifest.json"), manifestRaw);
    expect(() => validateEa1Evaluation(REPO_ROOT, relative(REPO_ROOT, join(root, "manifest.json")))).toThrow(/must have exactly 3 archetypes/);
  });

  test("a hash-mismatched validator-rules file fails validate closed", () => {
    const manifestRaw = JSON.parse(readFileSync(join(REPO_ROOT, EA1_MANIFEST), "utf8"));
    manifestRaw.experiment.rubrics.validator_rules.sha256 = "f".repeat(64);
    const root = join(REPO_ROOT, ".ai/harness/runs/bdd3", `test-ea1-rulesdrift-${Date.now()}-${Math.random().toString(16).slice(2)}`); created.push(root);
    write(join(root, "manifest.json"), manifestRaw);
    expect(() => validateEa1Evaluation(REPO_ROOT, relative(REPO_ROOT, join(root, "manifest.json")))).toThrow("hash drift");
  });
});

function ea1NeutralOutcomeScore(overrides: Partial<OutcomeScore> = {}): OutcomeScore {
  return {
    uncertainty_closed: true,
    boundary_category: "bounded",
    unsupported_expansion: 0,
    unsupported_user_concepts: 0,
    required_behavior_omission: 0,
    protected_concern_omissions: [],
    authority_fit: true,
    escalation_correct: true,
    correction_operations: [],
    notes: "frozen EA1 fixture score",
    ...overrides,
  };
}

// Two trap archetypes are given a control-arm violation so the fixture exercises
// the "pass" path distinctly from "no_incremental_value" (which fires only when
// control ALSO resists >=11/12 traps).
const EA1_CONTROL_TRAP_VIOLATIONS = new Set(["EA1-T-01", "EA1-T-04"]);

function materializeEa1ScoreRun(): string {
  const evaluation = validateEa1Evaluation(REPO_ROOT, EA1_MANIFEST);
  const root = join(REPO_ROOT, ".ai/harness/runs/bdd3", `test-ea1-score-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  created.push(root);
  const packets = planEa1Packets(evaluation);
  const records = packets.map((planned) => {
    const scores = evaluation.manifest.experiment.adjudication.reviewers.outcome.map((reviewerId) => {
      const value = { schema: "repo-harness-bdd3-locked-outcome-score.ea1", packet_id: planned.packet_id, reviewer_id: reviewerId, locked_at: "2026-07-13T00:00:00Z", response_sha256: "a".repeat(64), score: ea1NeutralOutcomeScore() };
      write(join(root, "scores/outcome", planned.packet_id, `${reviewerId}.json`), value);
      return value;
    });
    let controlEvidenceSha: string | null = null; let treatmentEvidenceSha: string | null = null;
    if (planned.condition === "control") {
      const violated = EA1_CONTROL_TRAP_VIOLATIONS.has(planned.task_id);
      const value = { schema: "repo-harness-bdd3-locked-control-evidence-score.ea1", packet_id: planned.packet_id, reviewer_id: evaluation.manifest.experiment.adjudication.reviewers.control_evidence, locked_at: "2026-07-13T00:00:00Z", response_sha256: "c".repeat(64), score: { unsupported_assertion_count: 0, feature_need_inference_count: violated ? 1 : 0, explicit_limitation_count: 1, notes: "fixture" } };
      write(join(root, "scores/evidence", `${planned.packet_id}.json`), value);
      controlEvidenceSha = sha256Text(canonicalJson(value));
    } else {
      const truth = evaluation.heldOutTruth[planned.task_id];
      const result: { ceiling_violation: boolean; violations: { rule: 1 | 2 | 3 | 4 | 5 | 6; detail: string }[] } = { ceiling_violation: false, violations: [] };
      const value = { schema: "repo-harness-bdd3-locked-treatment-evidence-result.ea1", packet_id: planned.packet_id, locked_at: "2026-07-13T00:00:00Z", packet_sha256: "b".repeat(64), not_established: truth.not_established_required, result };
      write(join(root, "scores/evidence", `${planned.packet_id}.json`), value);
      treatmentEvidenceSha = sha256Text(canonicalJson(value));
    }
    return { packet_id: planned.packet_id, task_id: planned.task_id, condition: planned.condition, repetition: planned.repetition, response_sha256: "b".repeat(64), normalized_outcome_sha256: "e".repeat(64), reviewer_score_sha256: [sha256Text(canonicalJson(scores[0])), sha256Text(canonicalJson(scores[1]))] as [string, string], adjudication_sha256: null, control_evidence_score_sha256: controlEvidenceSha, treatment_evidence_result_sha256: treatmentEvidenceSha };
  });
  write(join(root, "run.json"), { schema: "repo-harness-bdd3-score-run.ea1", freeze_id: evaluation.manifest.experiment.freeze_id, source_commit: "f".repeat(40), manifest_sha256: evaluation.manifest.experiment.score_manifest_sha256, output_path: relative(REPO_ROOT, root).replace(/\\/g, "/"), packets: records });
  return relative(REPO_ROOT, root).replace(/\\/g, "/");
}

describe("BDD3 EA1 score-run validation and evidence projection (fixture round trip, no live model calls)", () => {
  test("validates a fixture score run and projects a reproducible disposition", () => {
    const evaluation = validateEa1Evaluation(REPO_ROOT, EA1_MANIFEST);
    const run = materializeEa1ScoreRun();
    const counts = validateEa1ScoreRun(evaluation, run);
    expect(counts).toEqual({ outcomeScoreCount: 192, controlEvidenceScoreCount: 48, treatmentEvidenceResultCount: 48, adjudicationCount: 0 });

    const evidenceRel = `${run}/evidence.json`; const reportRel = `${run}/report.md`;
    const projected = projectEa1Evidence(evaluation, run, evidenceRel, reportRel);
    expect(projected.intervention).toBe("pass");
    expect(projected.thesis).toBe("supported");

    const verified = verifyEa1EvidenceProjection(evaluation, evidenceRel);
    expect(verified).toEqual(projected);

    const reportText = readFileSync(join(REPO_ROOT, reportRel), "utf8");
    expect(reportText).toContain("EA1");
    expect(reportText).toContain("pass");
  });

  test("verify-evidence fails closed when a treatment row's ceiling_violation is tampered with post-projection", () => {
    const evaluation = validateEa1Evaluation(REPO_ROOT, EA1_MANIFEST);
    const run = materializeEa1ScoreRun();
    const evidenceRel = `${run}/evidence-tamper.json`; const reportRel = `${run}/report-tamper.md`;
    projectEa1Evidence(evaluation, run, evidenceRel, reportRel);
    const evidencePath = join(REPO_ROOT, evidenceRel);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const treatmentRow = evidence.rows.find((row: any) => row.condition === "treatment");
    treatmentRow.treatment_result.ceiling_violation = true;
    treatmentRow.treatment_result.violations = [{ rule: 3, detail: "tampered for test" }];
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(() => verifyEa1EvidenceProjection(evaluation, evidenceRel)).toThrow("EA1 evidence projection drift");
  });
});

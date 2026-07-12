import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, relative } from "path";
import {
  REPO_ROOT,
  buildAdjudicatorPacket,
  buildOutcomeReviewerPacket,
  canonicalJson,
  opaquePacketId,
  sha256Text,
  validateEvaluation,
  validateOutcomeScore,
  validateScoreRun,
  type OutcomeScore,
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

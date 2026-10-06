import { REVIEW_FINDING_RULES, type ReviewFinding, type ReviewOutput } from './generic-review';

export interface ReviewPacketInput {
  context_sha256: string;
  subject_sha256: string;
  actual_harness: ReviewOutput['actual_harness'];
  actual_role: string;
  prior_findings: readonly ReviewFinding[];
  contract: string;
  goal: string;
  verification: string;
  source: string;
}

/** Build the complete domain packet before any reviewer pane starts. */
export function composeReviewPacket(input: ReviewPacketInput): string {
  const packet = [
    'Review the complete current subject against its goal, contract and prepared verification evidence. Do not edit production code or invoke other reviewers. Only author one final JSON file to the exact request.result_ref; no temp/rename or alternate submission. Terminal output and idle are observation only.',
    'Outer transport JSON is {request_id: request.request_id, context_sha256: request.context_sha256, value: domain output}. Provider value has EXACTLY request_id, context_sha256, subject_sha256, verdict, summary, findings. Domain request_id is request.request_id; domain context_sha256 is the prepared domain hash below (distinct from transport packet hash). The owner adds actual harness/role/model from the bound task-agent and OAR Session observation, not your self-description.',
    REVIEW_FINDING_RULES.text,
    `DOMAIN IDENTITY: ${JSON.stringify({ context_sha256: input.context_sha256, subject_sha256: input.subject_sha256, actual_harness: input.actual_harness, actual_role: input.actual_role })}`,
    `PRIOR FINDINGS: ${JSON.stringify(input.prior_findings)}`, `CONTRACT:\n${input.contract}`, `GOAL:\n${input.goal}`,
    `PREPARED VERIFICATION:\n${input.verification}`, `CURRENT SOURCE:\n${input.source}`,
  ].join('\n\n');
  if (Buffer.byteLength(packet) > 10 * 1024 * 1024) throw new Error('review_context_too_large');
  return packet;
}

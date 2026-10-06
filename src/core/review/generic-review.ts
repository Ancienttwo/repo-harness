export const REVIEW_FINDING_RULES = {
  prompt_version: '1',
  text: 'PASS requires no unresolved P0/P1. FAIL requires at least one unresolved finding. Each finding has EXACTLY id, severity:P0|P1|P2|P3, status:new|open|resolved, message. Keep stable IDs: every prior finding must remain resolved/open with current evidence. A previous verdict is not evidence for current code.',
} as const;

export const REVIEW_MAX_ROUNDS = 3;
export const REVIEW_TIMEOUT_MS = 1_800_000;

export interface ReviewFinding {
  id: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'new' | 'open' | 'resolved';
  message: string;
}

/** Domain identity only. Runtime launch identity never enters this schema. */
export interface ReviewOutput {
  request_id: string;
  context_sha256: string;
  subject_sha256: string;
  actual_harness: 'claude' | 'codex';
  actual_role: string;
  actual_model: string;
  verdict: 'PASS' | 'FAIL';
  summary: string;
  findings: ReviewFinding[];
}

export function validateReviewOutput(value: unknown, expected: Omit<ReviewOutput, 'verdict' | 'summary' | 'findings'>,
  previous: readonly ReviewFinding[] = []): ReviewOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review_malformed_result');
  const output = value as ReviewOutput;
  const fields = ['request_id', 'context_sha256', 'subject_sha256', 'actual_harness', 'actual_role', 'actual_model', 'verdict', 'summary', 'findings'];
  if (Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('review_malformed_result');
  for (const [field, wanted] of Object.entries(expected)) {
    if (output[field as keyof ReviewOutput] !== wanted) throw new Error(`review_${field}_mismatch`);
  }
  if (!['PASS', 'FAIL'].includes(output.verdict) || typeof output.summary !== 'string' || !output.summary.trim()
    || !Array.isArray(output.findings)) throw new Error('review_malformed_result');
  const ids = new Set<string>();
  for (const finding of output.findings) {
    if (!finding || typeof finding !== 'object' || Object.keys(finding).sort().join(',') !== 'id,message,severity,status'
      || typeof finding.id !== 'string' || !finding.id.trim() || ids.has(finding.id)
      || typeof finding.message !== 'string' || !finding.message.trim()
      || !['P0', 'P1', 'P2', 'P3'].includes(finding.severity)
      || !['new', 'open', 'resolved'].includes(finding.status)) throw new Error('review_malformed_finding');
    ids.add(finding.id);
    if (output.verdict === 'PASS' && finding.status !== 'resolved' && ['P0', 'P1'].includes(finding.severity)) {
      throw new Error('review_conflicting_verdict');
    }
  }
  for (const prior of previous) {
    const current = output.findings.find(finding => finding.id === prior.id);
    if (!current || current.status === 'new') throw new Error('review_previous_finding_unaddressed');
  }
  return output;
}

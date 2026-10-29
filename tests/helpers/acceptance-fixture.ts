// Standalone-safe acceptance fixtures. Keep test-runner lifecycle hooks in repo-fixture.ts.

/** Explicit synthetic fixture opinion; never converts a real provider claim into PASS. */
export async function fixtureReviewResult(args: {
  root: string; authority: import('../../src/effects/admission/admission-source').ReviewAdmissionSource; verification: string; reviewer: string;
  disposition: string; summary: string; findings: import('../../scripts/acceptance-receipt').AcceptanceFinding[];
}): Promise<import('../../scripts/acceptance-receipt').AcceptanceReviewResult> {
  const { acceptanceContext, acceptanceReviewContextDigest } = await import('../../scripts/acceptance-receipt');
  const context = await acceptanceContext(args);
  return { request_id: 'fixture-review-request', context_sha256: acceptanceReviewContextDigest(context),
    subject_sha256: context.subject.review_subject_sha256, actual_harness: args.reviewer === 'Codex' ? 'codex' : 'claude',
    actual_role: 'deep-reasoner', actual_model: 'fixture-model', verdict: args.disposition === 'external_pass' ? 'PASS' : 'FAIL',
    summary: args.summary, findings: args.findings };
}

/** A fixture opinion has no bound author task session. */
export async function recordFixtureAcceptance(args: Omit<Parameters<typeof import('../../scripts/acceptance-receipt').recordAcceptance>[0], 'author'>) {
  const { recordAcceptance } = await import('../../scripts/acceptance-receipt');
  if (args.disposition === 'user_waiver') return recordAcceptance({ ...args, author: null });
  return recordAcceptance({ ...args, author: null, reviewResult: args.reviewResult ?? await fixtureReviewResult(args) });
}

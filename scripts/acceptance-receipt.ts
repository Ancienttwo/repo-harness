#!/usr/bin/env bun

import {
  ACCEPTANCE_VALIDATOR_RULE_IDS,
  ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
  ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
  CONSUMED_RECEIPT_KEYS,
  GENERIC_REVIEW_ROLE,
  acceptanceBenchmarkRequirement,
  acceptanceContext,
  acceptancePolicySource,
  acceptanceReceiptPath,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationPath,
  acceptanceVerificationObservationSubjectKey,
  authorityFingerprint,
  contractCarriesArchiveProjection,
  inspectAcceptanceCurrentBinding,
  inspectAcceptanceEvidence,
  parseAcceptancePolicy,
  projectAcceptance,
  readAcceptanceReceiptFile,
  readAcceptanceVerificationObservation,
  readUserWaiverGrantFile,
  recordAcceptance,
  recordUserWaiverAcceptance,
  recordUserWaiverGrant,
  renderAcceptanceProjection,
  resolveProtectedGitRuntime,
  revokeUserWaiverGrant,
  runAcceptanceReceiptCli,
  userWaiverGrantPath,
  validateAcceptanceReceiptAgainstPolicy,
  verifyAcceptance,
  verifyUserWaiverGrant,
  writeAcceptanceVerificationObservation,
} from '../src/effects/review/acceptance-receipt';

export {
  ACCEPTANCE_VALIDATOR_RULE_IDS,
  ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
  ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
  CONSUMED_RECEIPT_KEYS,
  GENERIC_REVIEW_ROLE,
  acceptanceBenchmarkRequirement,
  acceptanceContext,
  acceptancePolicySource,
  acceptanceReceiptPath,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationPath,
  acceptanceVerificationObservationSubjectKey,
  authorityFingerprint,
  contractCarriesArchiveProjection,
  inspectAcceptanceCurrentBinding,
  inspectAcceptanceEvidence,
  parseAcceptancePolicy,
  projectAcceptance,
  readAcceptanceReceiptFile,
  readAcceptanceVerificationObservation,
  readUserWaiverGrantFile,
  recordAcceptance,
  recordUserWaiverAcceptance,
  recordUserWaiverGrant,
  renderAcceptanceProjection,
  resolveProtectedGitRuntime,
  revokeUserWaiverGrant,
  runAcceptanceReceiptCli,
  userWaiverGrantPath,
  validateAcceptanceReceiptAgainstPolicy,
  verifyAcceptance,
  verifyUserWaiverGrant,
  writeAcceptanceVerificationObservation,
};

export type {
  AcceptanceDisposition,
  AcceptanceEvidence,
  AcceptanceFinding,
  AcceptancePolicy,
  AcceptancePolicyV1,
  AcceptancePolicyV2,
  AcceptanceReceipt,
  AcceptanceReceiptPolicyInput,
  AcceptanceReceiptPolicyVerdict,
  AcceptanceReviewResult,
  AcceptanceValidatorRuleId,
  AcceptanceVerificationObservationV1,
  ReviewSubject,
  UserWaiverGrant,
} from '../src/effects/review/acceptance-receipt';

if (import.meta.main) {
  try {
    process.exit(await runAcceptanceReceiptCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`acceptance-receipt: ${(error as Error).message}`);
    process.exit((error as Error & { exitCode?: number }).exitCode ?? 1);
  }
}

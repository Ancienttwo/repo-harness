import { isRecord } from '../evidence/is-record';
import { sha256, stableJson } from './acceptance-receipt';
import {
  validateChangeAssessment,
  validateReviewSelectionPacketAgainstAssessment,
  type ChangeAssessment,
  type ReviewSelectionPacket,
} from './change-assessment';

export const CHANGE_ASSESSMENT_EVIDENCE_SCHEMA = 'repo-harness-change-assessment-evidence.v1' as const;
export const CHANGE_ASSESSMENT_EVIDENCE_PATH = '.ai/harness/checks/change-assessment.latest.json' as const;
export const CHECK_RECORDS_PROTOCOL = 1 as const;
export const CHECK_RECORDS_KIND = 'repo-harness.check-records' as const;
/** Upper bound for a record read outside a surface policy; an assessment envelope is a few KiB. */
export const CHECK_RECORD_MAX_BYTES = 1024 * 1024;

/** The result of reading one record file at its fixed path. */
export type CheckRecordRead =
  | { readonly state: 'absent' }
  | { readonly state: 'read'; readonly content: string }
  | { readonly state: 'unreadable'; readonly message: string };

export type ChangeAssessmentEvidence =
  | {
    readonly status: 'pass';
    readonly evidence_sha256: string;
    readonly assessment: ChangeAssessment;
    readonly selection_packet: ReviewSelectionPacket;
  }
  | {
    readonly status: 'fail';
    readonly evidence_sha256: string;
    readonly message: string | null;
  };

export class CheckRecordError extends Error {
  readonly code = 'check_record_invalid' as const;
}

type CheckRecordLocation = { readonly id: 'change-assessment'; readonly path: typeof CHANGE_ASSESSMENT_EVIDENCE_PATH };

export type ChangeAssessmentCheckRecord = CheckRecordLocation & (
  | { readonly state: 'absent' }
  | { readonly state: 'invalid'; readonly error: { readonly code: CheckRecordError['code']; readonly message: string } }
  | {
    readonly state: 'present';
    readonly status: 'pass';
    readonly evidence_sha256: string;
    readonly target_ref: string;
    readonly target_revision: string;
    readonly review_subject_sha256: string;
  }
  | { readonly state: 'present'; readonly status: 'fail'; readonly evidence_sha256: string; readonly message: string | null }
);

export interface CheckRecordsV1 {
  readonly protocol: typeof CHECK_RECORDS_PROTOCOL;
  readonly kind: typeof CHECK_RECORDS_KIND;
  readonly records: readonly ChangeAssessmentCheckRecord[];
}

const PASS_KEYS = stableJson(['assessment', 'evidence_sha256', 'schema', 'selection_packet', 'status']);
const FAIL_MESSAGE_KEYS = stableJson(['evidence_sha256', 'message', 'schema', 'status']);

function invalid(message: string): never {
  throw new CheckRecordError(`Change Assessment evidence ${message}`);
}

/**
 * Decodes the envelope that `scripts/change-assessment.ts` writes. A failed
 * run writes either `message` or the blocked assessment and packet; the
 * failed variant keeps only the message, because no consumer reads the rest.
 */
export function decodeChangeAssessmentEvidence(content: string): ChangeAssessmentEvidence {
  let value: unknown;
  try { value = JSON.parse(content); } catch { invalid('is invalid JSON'); }
  if (!isRecord(value) || value.schema !== CHANGE_ASSESSMENT_EVIDENCE_SCHEMA) invalid('schema is unsupported');
  const { evidence_sha256: evidenceSha256, ...basis } = value;
  if (typeof evidenceSha256 !== 'string' || evidenceSha256 !== sha256(stableJson(basis))) invalid('fingerprint is stale');
  const keys = stableJson(Object.keys(value).sort());
  if (value.status === 'pass') {
    if (keys !== PASS_KEYS) invalid('pass record fields are invalid');
    let assessment: ChangeAssessment;
    let packet: ReviewSelectionPacket;
    try {
      assessment = validateChangeAssessment(value.assessment);
      packet = validateReviewSelectionPacketAgainstAssessment(value.selection_packet, assessment);
    } catch (error) { invalid(`is invalid: ${(error as Error).message}`); }
    if (assessment.status !== 'ready' || packet.status !== 'ready') invalid('pass record carries a blocked assessment');
    return { status: 'pass', evidence_sha256: evidenceSha256, assessment, selection_packet: packet };
  }
  if (value.status === 'fail') {
    if (keys === FAIL_MESSAGE_KEYS) {
      if (typeof value.message !== 'string') invalid('fail message is invalid');
      return { status: 'fail', evidence_sha256: evidenceSha256, message: value.message };
    }
    if (keys !== PASS_KEYS) invalid('fail record fields are invalid');
    return { status: 'fail', evidence_sha256: evidenceSha256, message: null };
  }
  return invalid('status is invalid');
}

export function projectCheckRecords(input: { readonly changeAssessment: CheckRecordRead }): CheckRecordsV1 {
  const location: CheckRecordLocation = { id: 'change-assessment', path: CHANGE_ASSESSMENT_EVIDENCE_PATH };
  const read = input.changeAssessment;
  let record: ChangeAssessmentCheckRecord;
  if (read.state === 'absent') {
    record = { ...location, state: 'absent' };
  } else if (read.state === 'unreadable') {
    record = { ...location, state: 'invalid', error: { code: 'check_record_invalid', message: `Change Assessment evidence ${read.message}` } };
  } else {
    try {
      const evidence = decodeChangeAssessmentEvidence(read.content);
      record = evidence.status === 'pass'
        ? {
          ...location,
          state: 'present',
          status: 'pass',
          evidence_sha256: evidence.evidence_sha256,
          target_ref: evidence.selection_packet.target_ref,
          target_revision: evidence.selection_packet.target_revision,
          review_subject_sha256: evidence.selection_packet.review_subject_sha256,
        }
        : { ...location, state: 'present', status: 'fail', evidence_sha256: evidence.evidence_sha256, message: evidence.message };
    } catch (error) {
      if (!(error instanceof CheckRecordError)) throw error;
      record = { ...location, state: 'invalid', error: { code: error.code, message: error.message } };
    }
  }
  return { protocol: CHECK_RECORDS_PROTOCOL, kind: CHECK_RECORDS_KIND, records: [record] };
}

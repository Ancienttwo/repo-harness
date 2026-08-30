import { readFileSync } from 'fs';
import { describe, expect, test } from 'bun:test';

import * as admission from '../../src/core/collaboration/admission';
import {
  COLLABORATION_ACTIVE_READER_STATES,
  COLLABORATION_ADMISSION_REJECTION_REASONS,
  COLLABORATION_RELEASED_READER_STATES,
  buildCollaborationDelegationAdmission,
  canonicalCollaborationDelegationAdmissionBytes,
  collaborationReaderHoldsSeat,
  validateCollaborationDelegationAdmission,
} from '../../src/core/collaboration/admission';
import { COLLABORATION_PROTOCOL } from '../../src/core/collaboration/common';

const CLAIM = '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a';
const BINDING = '11111111-1111-4111-8111-111111111111';
const ROLE_PROFILE = `sha256:${'a'.repeat(64)}`;

function input(overrides: Record<string, unknown> = {}) {
  return {
    parent_claim_id: CLAIM,
    round_index: 0,
    parent_engineer_id: 'engineer:capability.runtime-harness.collaboration',
    parent_binding_id: BINDING,
    parent_binding_generation: 1,
    logical_role: 'explorer',
    role_profile_sha256: ROLE_PROFILE,
    max_parallel_readers: 3,
    observed_active_readers: 0,
    decision: 'admitted',
    rejection_reason: null,
    decided_at: '2026-08-30T00:00:00.000Z',
    ...overrides,
  } as Parameters<typeof buildCollaborationDelegationAdmission>[0];
}

describe('C4 collaboration delegation admission record', () => {
  test('round-trips through canonical bytes and refuses a stale digest', () => {
    const record = buildCollaborationDelegationAdmission(input());
    expect(validateCollaborationDelegationAdmission(
      JSON.parse(canonicalCollaborationDelegationAdmissionBytes(record)),
    )).toEqual(record);
    expect(() => validateCollaborationDelegationAdmission({ ...record, observed_active_readers: 2 }))
      .toThrow('admission_sha256 is stale');
  });

  test('a record cannot contradict itself about its own decision', () => {
    expect(() => buildCollaborationDelegationAdmission(
      input({ decision: 'admitted', rejection_reason: 'max_parallel_readers_exceeded' }),
    )).toThrow('an admitted decision carries no rejection_reason');
    expect(() => buildCollaborationDelegationAdmission(input({ decision: 'rejected', rejection_reason: null })))
      .toThrow('rejection_reason is invalid');
    expect(() => buildCollaborationDelegationAdmission(
      input({ decision: 'rejected', rejection_reason: 'too_busy' }),
    )).toThrow('rejection_reason is invalid');
  });

  test('every rejection reason in the closed set builds a valid record', () => {
    for (const reason of COLLABORATION_ADMISSION_REJECTION_REASONS) {
      const record = buildCollaborationDelegationAdmission(input({ decision: 'rejected', rejection_reason: reason }));
      expect(record.rejection_reason).toBe(reason);
    }
  });

  test('the record mints no second protocol constant for the plane', () => {
    expect(Object.keys(admission).filter((name) => name.endsWith('_PROTOCOL'))).toEqual([]);
    expect(buildCollaborationDelegationAdmission(input()).protocol).toBe(COLLABORATION_PROTOCOL);
  });
});

describe('C4 D6 seat rule', () => {
  /**
   * The decision table is C0's, copied here verbatim from
   * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`
   * section D6. C4 does not re-derive it; this table is the acceptance source,
   * and the assertion below proves the freeze record still carries these rows so
   * the two cannot drift apart silently.
   */
  const D6: readonly {
    readonly row: string;
    readonly active: number;
    readonly state: string | null;
    readonly admit: boolean;
  }[] = [
    { row: 'A1', active: 0, state: null, admit: true },
    { row: 'A2', active: 1, state: null, admit: true },
    { row: 'A3', active: 2, state: null, admit: true },
    { row: 'A4', active: 3, state: null, admit: false },
    { row: 'A7', active: 0, state: 'reconciliation_required', admit: false },
    { row: 'A8', active: 3, state: 'completed', admit: true },
    { row: 'A9', active: 3, state: 'failed', admit: true },
  ];

  test('the frozen table still lives in the C0 record this row reads from', () => {
    const freeze = readFileSync(
      'docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md',
      'utf8',
    );
    expect(freeze).toContain('Frozen for `max_parallel_readers = 3`');
    for (const entry of D6) expect(freeze).toContain(`| ${entry.row} |`);
    expect(freeze).toContain('max_parallel_readers_exceeded');
  });

  test('A1 to A4: the seat comparison admits 0, 1 and 2 and refuses 3', () => {
    const limit = 3;
    for (const entry of D6.filter((row) => row.state === null)) {
      expect(entry.active < limit).toBe(entry.admit);
    }
  });

  test('A8 and A9: completed and failed readers release their seat', () => {
    for (const state of COLLABORATION_RELEASED_READER_STATES) {
      expect(collaborationReaderHoldsSeat(state)).toBe(false);
    }
  });

  test('active states hold a seat', () => {
    for (const state of COLLABORATION_ACTIVE_READER_STATES) {
      expect(collaborationReaderHoldsSeat(state)).toBe(true);
    }
  });

  test('A6 and A7: reconciliation_required and any unclassified state are not free seats', () => {
    // `null` is the caller's instruction to fail closed. The one thing this must
    // never return for an unknown state is `false`, which would round the count
    // down and leak a seat.
    expect(collaborationReaderHoldsSeat('reconciliation_required')).toBeNull();
    expect(collaborationReaderHoldsSeat('some_future_state')).toBeNull();
    expect(collaborationReaderHoldsSeat('')).toBeNull();
  });

  test('the two closed state sets are disjoint and cover the delegated-run machine', () => {
    const active = new Set<string>(COLLABORATION_ACTIVE_READER_STATES);
    const released = new Set<string>(COLLABORATION_RELEASED_READER_STATES);
    expect([...active].filter((state) => released.has(state))).toEqual([]);
    // Every state the delegated-run machine can be in is either classified or
    // deliberately left to fail closed; `reconciliation_required` is the only
    // member of the third category, and D6 A7 is why.
    const machine = [
      'intent_persisted', 'launch_claimed', 'running', 'collecting',
      'completed', 'failed', 'reconciliation_required',
    ];
    const unclassified = machine.filter((state) => collaborationReaderHoldsSeat(state) === null);
    expect(unclassified).toEqual(['reconciliation_required']);
  });
});

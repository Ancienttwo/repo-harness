import { describe, expect, test } from 'bun:test';

import * as contribution from '../../src/core/collaboration/contribution';
import {
  CONTRIBUTION_COMMIT_EVIDENCE_PREFIX,
  CONTRIBUTION_SIGNAL_MAX_COUNT,
  buildCollaborationContributionCommit,
  canonicalCollaborationContributionCommitBytes,
  canonicalCollaborationContributionDraftBytes,
  collaborationContributionCommitId,
  collaborationContributionDraftSha256,
  contributionCommitEvidenceRef,
  contributionHandoffIdentityKey,
  contributionSignalIdentityKey,
  deriveCollaborationContributionCommitId,
  validateCollaborationContributionCommit,
  validateCollaborationContributionDraft,
} from '../../src/core/collaboration/contribution';
import { COLLABORATION_PROTOCOL } from '../../src/core/collaboration/common';

const RUN_REF = `sha256:${'1'.repeat(64)}`;
const OTHER_RUN_REF = `sha256:${'2'.repeat(64)}`;
const SIGNAL_SHA = `sha256:${'3'.repeat(64)}`;
const HANDOFF_SHA = `sha256:${'4'.repeat(64)}`;
const DRAFT_SHA = `sha256:${'5'.repeat(64)}`;
const SIGNAL_ID = '6'.repeat(64);
const HANDOFF_ID = '7'.repeat(64);

function signalDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'lock contention on the thread domain',
    body: 'Handoff publish took the signal lock; splitting it changed nothing observable.',
    labels: ['finding'],
    scope_refs: [{ kind: 'free_topic', value: 'collaboration/locks' }],
    artifact_refs: [],
    reply_to_signal_id: null,
    source_signal_ids: [],
    ...overrides,
  };
}

function handoffDraft(overrides: Record<string, unknown> = {}) {
  return {
    trigger: 'budget_low',
    goal: 'Establish whether the shared lock domain was load-bearing.',
    completed: ['read the publish path'],
    key_findings: ['records publish through link, so no torn read exists'],
    attempted_paths: [
      { description: 'split the domain first', outcome: 'needed the analysis first', evidence_refs: [] },
    ],
    dead_ends: [],
    open_hypotheses: [],
    next_actions: ['record the deviation in the freeze ledger'],
    source_signal_ids: [],
    execution_context: { kind: 'none' },
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    protocol: COLLABORATION_PROTOCOL,
    kind: 'repo-harness-collaboration-contribution-draft',
    thread_key: 'collaboration/lock-domains',
    signals: [signalDraft()],
    handoff: null,
    built_on_signal_ids: [],
    ...overrides,
  };
}

function commitInput(overrides: Record<string, unknown> = {}) {
  return {
    worker_run_ref_sha256: RUN_REF,
    draft_sha256: DRAFT_SHA,
    signal_refs: [{ signal_id: SIGNAL_ID, signal_sha256: SIGNAL_SHA }],
    handoff_ref: null,
    committed_at: '2026-08-30T00:00:00.000Z',
    ...overrides,
  } as Parameters<typeof buildCollaborationContributionCommit>[0];
}

describe('C4 contribution draft schema', () => {
  test('accepts a whole draft and round-trips through canonical bytes', () => {
    const valid = validateCollaborationContributionDraft(draft());
    expect(valid.kind).toBe('repo-harness-collaboration-contribution-draft');
    expect(validateCollaborationContributionDraft(
      JSON.parse(canonicalCollaborationContributionDraftBytes(valid)),
    )).toEqual(valid);
  });

  test('rejects any self-declared identity, which is the only way a Worker could name itself', () => {
    for (const field of ['actor', 'engineer_id', 'worker_run_ref_sha256', 'repository_id']) {
      expect(() => validateCollaborationContributionDraft(draft({ [field]: 'anything' })))
        .toThrow('contribution draft');
    }
    // The same rule one level down: a signal draft carries no author either.
    expect(() => validateCollaborationContributionDraft(
      draft({ signals: [signalDraft({ actor: { kind: 'module_engineer' } })] }),
    )).toThrow('contribution signal draft');
  });

  test('rejects a draft that proposes nothing rather than committing an empty contribution', () => {
    expect(() => validateCollaborationContributionDraft(draft({ signals: [], handoff: null })))
      .toThrow('must carry at least one signal or a handoff');
  });

  test('accepts a handoff-only contribution', () => {
    const valid = validateCollaborationContributionDraft(draft({ signals: [], handoff: handoffDraft() }));
    expect(valid.signals).toHaveLength(0);
    expect(valid.handoff?.trigger).toBe('budget_low');
  });

  test('holds the frozen handoff content rules: blank entries and an empty next_actions are refused', () => {
    expect(() => validateCollaborationContributionDraft(
      draft({ handoff: handoffDraft({ key_findings: ['   '] }) }),
    )).toThrow('must not be blank');
    expect(() => validateCollaborationContributionDraft(
      draft({ handoff: handoffDraft({ next_actions: [] }) }),
    )).toThrow('next_actions must not be empty');
    expect(() => validateCollaborationContributionDraft(
      draft({ handoff: handoffDraft({ attempted_paths: [] }) }),
    )).toThrow('attempted_paths must hold');
    expect(() => validateCollaborationContributionDraft(
      draft({ handoff: handoffDraft({ trigger: 'because_i_said_so' }) }),
    )).toThrow('trigger is invalid');
  });

  test('bounds the signal count and refuses duplicate source ids', () => {
    expect(() => validateCollaborationContributionDraft(
      draft({ signals: Array.from({ length: CONTRIBUTION_SIGNAL_MAX_COUNT + 1 }, () => signalDraft()) }),
    )).toThrow('signals exceeds');
    expect(() => validateCollaborationContributionDraft(
      draft({ built_on_signal_ids: [SIGNAL_ID, SIGNAL_ID] }),
    )).toThrow('must be unique');
  });

  test('the draft digest is a pure function of the draft bytes', () => {
    const one = collaborationContributionDraftSha256(validateCollaborationContributionDraft(draft()));
    const two = collaborationContributionDraftSha256(validateCollaborationContributionDraft(draft()));
    const other = collaborationContributionDraftSha256(
      validateCollaborationContributionDraft(draft({ thread_key: 'other' })),
    );
    expect(one).toBe(two);
    expect(other).not.toBe(one);
  });
});

describe('C4 contribution identity derivation', () => {
  test('signal and handoff keys are derived from the run reference and the entry index', () => {
    expect(contributionSignalIdentityKey(RUN_REF, 0)).toBe(`${RUN_REF}#0`);
    expect(contributionSignalIdentityKey(RUN_REF, 3)).toBe(`${RUN_REF}#3`);
    expect(contributionHandoffIdentityKey(RUN_REF)).toBe(`${RUN_REF}#handoff`);
    expect(contributionSignalIdentityKey(OTHER_RUN_REF, 0)).not.toBe(contributionSignalIdentityKey(RUN_REF, 0));
  });

  test('an index outside the bounded slot range is refused rather than silently accepted', () => {
    expect(() => contributionSignalIdentityKey(RUN_REF, -1)).toThrow('index is invalid');
    expect(() => contributionSignalIdentityKey(RUN_REF, CONTRIBUTION_SIGNAL_MAX_COUNT)).toThrow('index is invalid');
    expect(() => contributionSignalIdentityKey('not-a-digest', 0)).toThrow('worker_run_ref_sha256');
  });

  test('one run derives exactly one commit identity, which is what makes a second commit impossible', () => {
    expect(deriveCollaborationContributionCommitId(RUN_REF))
      .toBe(deriveCollaborationContributionCommitId(RUN_REF));
    expect(deriveCollaborationContributionCommitId(OTHER_RUN_REF))
      .not.toBe(deriveCollaborationContributionCommitId(RUN_REF));
    // The identity is recomputed from persisted bytes, never carried as a field.
    const commit = buildCollaborationContributionCommit(commitInput());
    expect(collaborationContributionCommitId(commit)).toBe(deriveCollaborationContributionCommitId(RUN_REF));
    expect(Object.keys(commit)).not.toContain('commit_id');
  });
});

describe('C4 contribution commit schema', () => {
  test('round-trips and refuses a stale digest', () => {
    const commit = buildCollaborationContributionCommit(commitInput());
    expect(validateCollaborationContributionCommit(
      JSON.parse(canonicalCollaborationContributionCommitBytes(commit)),
    )).toEqual(commit);
    expect(() => validateCollaborationContributionCommit({ ...commit, committed_at: '2026-01-01T00:00:00.000Z' }))
      .toThrow('commit_sha256 is stale');
  });

  test('refuses a commit that publishes nothing', () => {
    expect(() => buildCollaborationContributionCommit(commitInput({ signal_refs: [], handoff_ref: null })))
      .toThrow('must publish at least one signal or a handoff');
  });

  test('carries a handoff reference when one was published', () => {
    const commit = buildCollaborationContributionCommit(commitInput({
      handoff_ref: { handoff_id: HANDOFF_ID, handoff_sha256: HANDOFF_SHA },
    }));
    expect(commit.handoff_ref).toEqual({ handoff_id: HANDOFF_ID, handoff_sha256: HANDOFF_SHA });
  });

  test('refuses duplicate signal references', () => {
    expect(() => buildCollaborationContributionCommit(commitInput({
      signal_refs: [
        { signal_id: SIGNAL_ID, signal_sha256: SIGNAL_SHA },
        { signal_id: SIGNAL_ID, signal_sha256: SIGNAL_SHA },
      ],
    }))).toThrow('signal_refs must be unique');
  });

  test('the evidence reference a WorkerResult carries names the commit and pins its bytes', () => {
    const commit = buildCollaborationContributionCommit(commitInput());
    const ref = contributionCommitEvidenceRef(commit);
    expect(ref.ref).toBe(`${CONTRIBUTION_COMMIT_EVIDENCE_PREFIX}${collaborationContributionCommitId(commit)}`);
    expect(ref.sha256).toBe(commit.commit_sha256);
  });
});

describe('C4 protocol ownership', () => {
  /**
   * The closed inclusion scan in `collaboration-authority-baseline.test.ts`
   * ranges over `src/core/**` modules that own a `*_PROTOCOL` constant. C1 and
   * C3 kept the whole plane on one constant so the scan's universe would not
   * move; this asserts C4 did the same rather than assuming it.
   *
   * The adjudication if a constant had been minted: the contribution plane fails
   * C-1 outright — it is not one of the five planes C0 froze — and it fails C-2
   * as well. A commit does decide visibility for other agents, but visibility of
   * advisory context is not "who owns work or what has been published or
   * accepted"; a commit grants no Claim, moves no Lease generation, and C4 adds
   * no HTTP route and no `--json` document, so the republication limb is not
   * reached either. It would have been a second `DELIBERATELY_EXCLUDED` row
   * saying exactly what `common.ts` already says.
   */
  test('C4 mints no second protocol constant for the collaboration plane', () => {
    const owned = Object.keys(contribution).filter((name) => name.endsWith('_PROTOCOL'));
    expect(owned).toEqual([]);
    expect(validateCollaborationContributionDraft(draft()).protocol).toBe(COLLABORATION_PROTOCOL);
    expect(buildCollaborationContributionCommit(commitInput()).protocol).toBe(COLLABORATION_PROTOCOL);
  });
});

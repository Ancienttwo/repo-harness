import { describe, expect, test } from 'bun:test';

import {
  notStackMemberDetail,
  projectPullRequestMergeReadiness,
  type MergeReadinessStackDetailV1,
  type ProviderMergeReadinessFactsV1,
  type PullRequestMergeReadinessInput,
  type RequiredCheckCoverageFactsV1,
} from '../../src/core/publication/merge-readiness';
import { checkClosingReferences, parseClosingReferences } from '../../src/core/publication/closing-references';
import { assessRequiredCheckFailure, validateRequiredCheckFailureEvidence } from '../../src/core/evidence/required-check-evidence';
import { assertionThenPassedEvidence, productFailureEvidence, requiredCheckAttempt, requiredCheckObservation } from '../helpers/required-check-evidence-fixture';
import { parsePublicationPolicy, publicationPolicyChanged, requiredCheckCoveragePolicyAtRef } from '../../src/core/publication/acceptance-merge-policy';
import { protectedPathMatches, validateRequiredCheckCoverageEvidenceOrNull } from '../../src/core/publication/required-check-coverage';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function readyInput(): PullRequestMergeReadinessInput {
  return {
    expected_head_sha: HEAD,
    expected_base_sha: BASE,
    integration_mode: 'unmerged',
    observation: 'stable',
    provider: {
      state: 'OPEN',
      is_draft: false,
      head_sha: HEAD,
      base_sha: BASE,
      review_decision: null,
      unresolved_thread_count: 0,
      rollback_boundary: { status: 'not_active' },
      checks: [{ name: 'Required / CI', bucket: 'pass' }],
      check_failures: [],
      required_check_coverage: { status: 'absent' },
      mergeable: 'MERGEABLE',
    },
    stack: notStackMemberDetail(),
  };
}

describe('projectPullRequestMergeReadiness', () => {
  test('projects a ready verdict only from fully fenced inputs', () => {
    expect(projectPullRequestMergeReadiness(readyInput())).toEqual({
      ready: true,
      expected_head_sha: HEAD,
      expected_base_sha: BASE,
      integration_mode: 'unmerged',
      attention_owner: 'none',
      blockers: [],
      check_failures: [],
      required_check_coverage: null,
      stack: notStackMemberDetail(),
    });
  });

  test('always preserves expected fences and deterministically routes aggregate blockers', () => {
    const verdict = projectPullRequestMergeReadiness({
      ...readyInput(),
      integration_mode: 'absorbed',
      provider: {
        ...readyInput().provider!,
        state: 'CLOSED',
        is_draft: true,
        head_sha: 'd'.repeat(40),
        base_sha: 'e'.repeat(40),
        review_decision: 'CHANGES_REQUESTED',
        unresolved_thread_count: 1,
        checks: [{ name: 'Required / CI', bucket: 'pending' }, { name: 'Required / CI', bucket: 'skipping' }],
        mergeable: 'CONFLICTING',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual([
      'already_integrated',
      'pr_not_open',
      'draft',
      'head_moved',
      'base_moved_since_verification',
      'changes_requested',
      'unresolved_threads',
      'checks_pending',
      'checks_failed',
      'not_mergeable',
    ]);
  });

  test('fails closed for provider data churn and unavailable provider facts', () => {
    const changed = projectPullRequestMergeReadiness({
      ...readyInput(),
      observation: 'changed_during_read',
      provider: null,
    });
    const unavailable = projectPullRequestMergeReadiness({
      ...readyInput(),
      observation: 'provider_data_incomplete',
      provider: null,
    });

    expect(changed.ready).toBe(false);
    expect(changed.attention_owner).toBe('external');
    expect(changed.blockers.map((blocker) => blocker.code)).toEqual(['changed_during_read']);
    expect(unavailable.ready).toBe(false);
    expect(unavailable.attention_owner).toBe('external');
    expect(unavailable.blockers.map((blocker) => blocker.code)).toEqual(['provider_data_incomplete']);
  });

  test('treats only passing required-CI buckets as green and review null as no review requirement', () => {
    const verdict = projectPullRequestMergeReadiness({
      ...readyInput(),
      provider: {
        ...readyInput().provider!,
        checks: [{ name: 'Required / CI', bucket: 'pass' }, { name: 'Required / CI', bucket: 'cancel' }],
        review_decision: 'REVIEW_REQUIRED',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers).toEqual([
      { code: 'checks_failed', attention_owner: 'agent' },
    ]);
  });
});

describe('stacked pull request readiness projection', () => {
  const PARENT_HEAD = 'c'.repeat(40);
  const FINAL_BASE = 'd'.repeat(40);
  const memberChain = [
    { pr_number: 42, head_ref: 'feat/stack', head_sha: HEAD, base_ref: 'feat/base', base_sha: BASE },
    { pr_number: 41, head_ref: 'feat/base', head_sha: PARENT_HEAD, base_ref: 'main', base_sha: FINAL_BASE },
  ];

  function memberStack(overrides: Partial<MergeReadinessStackDetailV1> = {}): MergeReadinessStackDetailV1 {
    return {
      member: true, depth: 1, chain: memberChain, final_base_sha: FINAL_BASE, status: 'complete',
      ...overrides,
    };
  }

  test('a stack member stays blocked when its own-base facts are green', () => {
    const verdict = projectPullRequestMergeReadiness({ ...readyInput(), stack: memberStack() });
    expect(verdict.ready).toBe(false);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
    expect(verdict.stack).toEqual(memberStack());
  });

  test.each([
    ['cycle', 'stack_cycle'],
    ['base_pr_missing', 'stack_base_pr_missing'],
    ['base_pr_not_open', 'stack_base_pr_not_open'],
    ['foreign_pr', 'stack_foreign_pr'],
    ['depth_exceeded', 'stack_depth_exceeded'],
  ] as const)('a %s chain keeps its typed blocker and the observed edges', (status, code) => {
    const chain = [memberChain[0]!];
    const verdict = projectPullRequestMergeReadiness({
      ...readyInput(),
      stack: { member: true, depth: 0, chain, final_base_sha: null, status },
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member', code]);
    expect(verdict.stack).toEqual({ member: true, depth: 0, chain, final_base_sha: null, status });
  });

  test('a member with an unobserved chain is blocked by membership alone', () => {
    const verdict = projectPullRequestMergeReadiness({
      ...readyInput(),
      stack: { member: true, depth: 0, chain: [memberChain[0]!], final_base_sha: null, status: 'unobserved' },
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
    expect(verdict.stack.status).toBe('unobserved');
  });

  test('a malformed, misbound or forged member chain fails closed', () => {
    const malformed = [
      { ...memberStack(), depth: 0 },
      { ...memberStack(), chain: [memberChain[1]!] },
      { ...memberStack(), final_base_sha: null },
      { ...memberStack(), chain: [memberChain[0]!, { ...memberChain[1]!, head_ref: 'other' }] },
      { ...memberStack(), status: 'not_member' as const },
      { member: false as const, depth: 0, chain: [], final_base_sha: FINAL_BASE, status: 'not_member' as const },
    ];
    for (const stack of malformed) {
      const verdict = projectPullRequestMergeReadiness({ ...readyInput(), stack: stack as MergeReadinessStackDetailV1 });
      expect([stack.status, verdict.ready]).toEqual([stack.status, false]);
      expect(verdict.blockers.map((blocker) => blocker.code)).toContain('provider_data_incomplete');
    }
  });

  test('a stack member is blocked even without own-base facts', () => {
    const verdict = projectPullRequestMergeReadiness({ ...readyInput(), provider: null, stack: memberStack() });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
    expect(verdict.check_failures).toEqual([]);
  });
});

test.each(['head_sha','base_sha'] as const)('an otherwise green pull request loses readiness when provider %s moves', field => {
  const input=readyInput();
  const verdict=projectPullRequestMergeReadiness({...input,provider:{...input.provider!,[field]:'9'.repeat(40)}});
  expect(verdict.ready).toBe(false);
  expect(verdict.blockers.map(b=>b.code)).toEqual([field==='head_sha'?'head_moved':'base_moved_since_verification']);
});
test('ordinary PR readiness needs no receipt, lease or acceptance artifact', () => {
  const { provider, integration_mode, observation, stack } = readyInput();
  const input = { provider: provider!, integration_mode, observation, stack,
    expected_head_sha: HEAD, expected_base_sha: BASE };
  expect(projectPullRequestMergeReadiness(input).ready).toBe(true);
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider, checks: [] } }).ready).toBe(false);
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider, checks: [{ name: 'fake-green', bucket: 'pass' }] } }).ready).toBe(false);
});

test.each([null, -1, 0.5, Number.NaN])('missing or invalid thread count %s fails closed', count => {
  const input = readyInput();
  const verdict = projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider!, unresolved_thread_count: count } });
  expect(verdict.blockers.map(blocker => blocker.code)).toEqual(['provider_data_incomplete']);
});

test.each(['APPROVED', 'REVIEW_REQUIRED', null])('review decision %s needs no local approval artifact', decision => {
  const input = readyInput();
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider!, review_decision: decision } }).ready).toBe(true);
});


test('a ready rollback boundary binds both provider and expected base', () => {
  const input = readyInput();
  const boundary = { status: 'ready' as const, pr_number: 17, before_sha: 'c'.repeat(40), after_sha: BASE };
  const provider = { ...input.provider!, rollback_boundary: boundary };
  expect(projectPullRequestMergeReadiness({ ...input, provider }).ready).toBe(true);
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...provider, base_sha: 'd'.repeat(40) } }).blockers.map(b => b.code))
    .toEqual(['base_moved_since_verification', 'provider_data_incomplete']);
  expect(projectPullRequestMergeReadiness({ provider, integration_mode: 'unmerged', observation: 'stable',
    expected_head_sha: HEAD, expected_base_sha: 'd'.repeat(40), stack: notStackMemberDetail() }).blockers.map(b => b.code))
    .toEqual(['base_moved_since_verification', 'provider_data_incomplete']);
});

test.each([undefined, null, 'ready', [], { status: 'pending' }, { status: 'ready' },
  ...[0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '17'].map(pr_number => ({ status: 'ready', pr_number, before_sha: 'c'.repeat(40), after_sha: BASE })),
  ...[undefined, '0'.repeat(40), 'invalid', BASE].map(before_sha => ({ status: 'ready', pr_number: 17, before_sha, after_sha: BASE })),
  ...[undefined, '0'.repeat(40), 'invalid', 'd'.repeat(40)].map(after_sha => ({ status: 'ready', pr_number: 17, before_sha: 'c'.repeat(40), after_sha })),
].map(rollback_boundary => ({ rollback_boundary })))('invalid rollback boundary fails closed: %j', ({ rollback_boundary }) => {
  const input = readyInput();
  const provider = { ...input.provider!, rollback_boundary } as unknown as ProviderMergeReadinessFactsV1;
  expect(projectPullRequestMergeReadiness({ ...input, provider }).blockers.map(b => b.code)).toEqual(['provider_data_incomplete']);
});

test('retired rollback facts do not supply the new boundary', () => {
  const input = readyInput();
  const { rollback_boundary: _boundary, ...facts } = input.provider!;
  const provider = { ...facts, rollback_tags: 'ready' } as unknown as ProviderMergeReadinessFactsV1;
  expect(projectPullRequestMergeReadiness({ ...input, provider }).blockers.map(b => b.code)).toEqual(['provider_data_incomplete']);
});

describe('closing reference check', () => {
  const repository = 'example/repo-harness';
  const linked = (references: string[], has_next_page = false) => ({
    has_next_page,
    references: references.map((reference) => {
      const [repo, number] = reference.split('#');
      return { repository: repo!, number: Number(number) };
    }),
  });

  test('parses every closing keyword, case-insensitive, with an optional colon and a qualified repository', () => {
    const text = [
      'close #1', 'Closes #2', 'CLOSED: #3', 'fix #4', 'Fixes #5', 'fixed:#6', 'resolve #7', 'Resolves #8', 'resolved Other/Repo#9',
      'fixes https://github.com/example/repo-harness/issues/10', 'Refs #11', 'prefix #12', 'closed-loop #13',
    ].join('\n');
    expect(parseClosingReferences(repository, text)).toEqual({ references: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => `${repository}#${n}`),
      'other/repo#9',
    ].sort(), unsupported: [] });
  });

  test('a closing keyword before a pull request URL is an unsupported target, with or without a fragment', () => {
    const pull = 'https://github.com/o/r/pull/9#issuecomment-123';
    expect(parseClosingReferences(repository, `Fixes ${pull}\ncloses http://www.github.com/o/r/pull/10`))
      .toEqual({ references: [], unsupported: [pull, 'http://www.github.com/o/r/pull/10'].sort() });
    expect(checkClosingReferences({ repository, commit_headline: 'Ship (#42)', commit_body: `Fixes ${pull}`, linked: linked([]) }))
      .toMatchObject({ ok: false, code: 'closing_references_mismatch', message_only: [], linked_only: [], unsupported: [pull] });
  });

  test('accepts equal repository-qualified sets from the headline and body', () => {
    expect(checkClosingReferences({ repository, commit_headline: 'Ship (#42)', commit_body: 'Fixes #7\nResolves Example/Repo-Harness#8',
      linked: linked([`${repository}#7`, `${repository}#8`]) })).toEqual({ ok: true, references: [`${repository}#7`, `${repository}#8`] });
  });

  test('reports both differences on a mismatch', () => {
    expect(checkClosingReferences({ repository, commit_headline: 'Ship, fixes #9 (#42)', commit_body: 'Refs #12',
      linked: linked([`${repository}#12`]) })).toMatchObject({
      ok: false, code: 'closing_references_mismatch', message_only: [`${repository}#9`], linked_only: [`${repository}#12`],
    });
  });

  test('an unobserved page of closing links fails closed', () => {
    expect(checkClosingReferences({ repository, commit_headline: 'Ship', commit_body: '', linked: linked([], true) }))
      .toMatchObject({ ok: false, code: 'closing_references_incomplete' });
  });
});

describe('acceptance merge policy switch', () => {
  const file = (value: unknown) => ({ status: 'present' as const, text: JSON.stringify(value) });

  test('a missing file, object or field is off', () => {
    for (const policy of [{ status: 'missing' as const }, file({}), file({ publication: {} })]) {
      expect(parsePublicationPolicy(policy)).toMatchObject({ ok: true, acceptance_merge: 'off' });
    }
    expect(parsePublicationPolicy(file({ publication: { acceptance_merge: 'on' } }))).toMatchObject({ ok: true, acceptance_merge: 'on' });
  });

  test('any other value or shape is invalid', () => {
    for (const policy of [
      { status: 'present' as const, text: '{' }, file([]), file({ publication: null }), file({ publication: 'on' }),
      file({ publication: { acceptance_merge: 'yes' } }), file({ publication: { acceptance_merge: true } }),
      file({ publication: { acceptance_merge: 'on', extra: 1 } }),
    ]) {
      expect(parsePublicationPolicy(policy).ok).toBe(false);
    }
  });

  test('only a change to the publication subtree counts as a policy change', () => {
    const base = parsePublicationPolicy(file({ merge_gate: { enabled: true }, publication: { acceptance_merge: 'on' } }));
    if (!base.ok) throw new Error('fixture policy must parse');
    expect(publicationPolicyChanged(base, { status: 'present', text: '{"publication":{"acceptance_merge":"on"},"merge_gate":{"enabled":false}}' })).toBe(false);
    for (const head of [file({ publication: { acceptance_merge: 'off' } }), file({}), { status: 'missing' as const }, { status: 'present' as const, text: '{' }]) {
      expect(publicationPolicyChanged(base, head)).toBe(true);
    }
  });
});


describe('required-check failure evidence', () => {
  test('a same-SHA assertion failure then pass is failed_then_passed and is never infrastructure', () => {
    const evidence = assertionThenPassedEvidence();
    expect(evidence.observed_result).toBe('failed_then_passed');
    expect(evidence.failed.shape).toBe('assertion_mismatch');
    expect(evidence.retry).toMatchObject({ attempted: true, attempts: 2, outcome: 'failed_then_passed', revalidated: true });
    expect(evidence.cause).not.toBe('infrastructure');
    expect(evidence.cause).toBe('unknown');
    // The run/attempt/job link survives the rerun.
    expect([evidence.failed.run_id, evidence.failed.attempt, evidence.failed.job_id]).toEqual([123, 1, 456]);
    expect([evidence.retry.latest.run_id, evidence.retry.latest.attempt, evidence.retry.latest.job_id]).toEqual([123, 2, 789]);
    expect(evidence.workflow).toEqual({ path: '.github/workflows/ci.yml', id: 99, revision: HEAD });
  });

  test('a platform-evidenced runner abort that later passes is still not a proven infrastructure flake', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ conclusion: 'cancelled', steps: ['Run tests'], failed_tests: ['session-runtime > chunk boundary'],
        failure_excerpt: null, logs_available: false,
        platform_evidence: ['The runner has received a shutdown signal and the job was cancelled'] }),
      requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
        conclusion: 'success', steps: [], failure_excerpt: null,
        scope: { executed: ['test (ubuntu-latest)', 'Run tests', 'session-runtime > chunk boundary'], skipped: [] } }),
    ]));
    expect(evidence.failed.shape).toBe('runner_abort');
    expect(evidence.observed_result).toBe('failed_then_passed');
    expect(evidence.cause).toBe('unknown');
  });

  test('a runner abort without platform or log evidence stays unknown', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ conclusion: 'cancelled', steps: [], failure_excerpt: null, logs_available: false }),
    ]));
    expect(evidence.failed.shape).toBe('runner_abort');
    expect(evidence.observed_result).toBe('failed');
    expect(evidence.retry.outcome).toBe('not_attempted');
    expect(evidence.cause).toBe('unknown');
    expect(evidence.cause_evidence).toEqual([]);
  });

  test('a runner abort with platform evidence is infrastructure', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ conclusion: 'cancelled', steps: [], failure_excerpt: null, logs_available: false,
        platform_evidence: ['The runner has received a shutdown signal and the job was cancelled'] }),
    ]));
    expect(evidence.cause).toBe('infrastructure');
    expect(evidence.cause_evidence).toEqual(['The runner has received a shutdown signal and the job was cancelled']);
  });

  test('a retry that skips the originally failed test is not revalidation', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ failed_tests: ['session-runtime > chunk boundary'], scope: { executed: ['Run tests'], skipped: [] } }),
      requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
        conclusion: 'success', steps: [], failure_excerpt: null,
        scope: { executed: ['Run tests', 'session-runtime > unrelated'], skipped: ['session-runtime > chunk boundary'] } }),
    ]));
    expect(evidence.observed_result).toBe('not_revalidated');
    expect(evidence.retry.outcome).toBe('failed_then_not_revalidated');
    expect(evidence.retry.revalidated).toBe(false);
    expect(evidence.cause).toBe('unknown');
  });

  test('an assertion retry with only a generic step label is not revalidation', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ steps: ['Run tests'], failed_tests: [], scope: { executed: ['Run tests'], skipped: [] } }),
      requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
        conclusion: 'success', steps: [], failure_excerpt: null,
        scope: { executed: ['test (ubuntu-latest)', 'Run tests'], skipped: [] } }),
    ]));
    expect(evidence.failed.shape).toBe('assertion_mismatch');
    expect(evidence.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false });
    expect(evidence.observed_result).toBe('not_revalidated');
  });

  test('stored evidence rejects array, object and number enum values', () => {
    const valid = assertionThenPassedEvidence();
    expect(validateRequiredCheckFailureEvidence(valid)).toEqual(valid);
    const fields: readonly (readonly [string, string])[] = [
      ['failed.shape', 'timeout'],
      ['retry.outcome', 'failed_then_passed'],
      ['retry.latest.conclusion', 'success'],
      ['observed_result', 'failed_then_passed'],
      ['cause', 'unknown'],
    ];
    for (const [field, value] of fields) {
      for (const malformed of [[value], { value }, 7]) {
        const tampered = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
        const parts = field.split('.');
        let target = tampered;
        for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
        target[parts[parts.length - 1]!] = malformed;
        let message: string | null = null;
        try { validateRequiredCheckFailureEvidence(tampered); } catch (error) { message = (error as Error).message; }
        expect([field, Array.isArray(malformed) ? 'array' : typeof malformed, message !== null && message.includes('is invalid')])
          .toEqual([field, Array.isArray(malformed) ? 'array' : typeof malformed, true]);
      }
    }
  });

  test('a retry without a failed child identifier is not revalidated even when the aggregate step passes', () => {
    const evidence = assessRequiredCheckFailure(requiredCheckObservation([
      requiredCheckAttempt({ steps: ['Run tests'], failed_tests: [], failure_excerpt: null, logs_available: false }),
      requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
        conclusion: 'success', steps: [], failure_excerpt: null,
        scope: { executed: ['test (ubuntu-latest)', 'Run tests'], skipped: [] } }),
    ]));
    expect(evidence.failed.shape).toBe('logs_unavailable');
    expect(evidence.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false });
    expect(evidence.observed_result).toBe('not_revalidated');
  });

  test('a real product failure remains a blocker and a rerun pass never clears it', () => {
    const productFailure = productFailureEvidence();
    expect(productFailure.cause).toBe('product_defect');
    expect(productFailure.cause_evidence).toEqual(['AssertionError: expected product response code 200 but received 500']);
    const base = readyInput();
    const blocked = projectPullRequestMergeReadiness({ ...base,
      provider: { ...base.provider!, checks: [{ name: 'Required / CI', bucket: 'fail' }], check_failures: [productFailure] } });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers.map((blocker) => blocker.code)).toContain('checks_failed');
    expect(blocked.check_failures).toEqual([productFailure]);

    // A passing rerun is evidence, not an automatic pass: the observed failed
    // bucket still blocks and the executor decision is unchanged.
    const rerun = assertionThenPassedEvidence();
    const stillBlocked = projectPullRequestMergeReadiness({ ...base,
      provider: { ...base.provider!, checks: [{ name: 'Required / CI', bucket: 'fail' }], check_failures: [rerun] } });
    expect(stillBlocked.ready).toBe(false);
    expect(stillBlocked.blockers.map((blocker) => blocker.code)).toContain('checks_failed');
    expect(stillBlocked.check_failures).toEqual([rerun]);
  });

  test('failure evidence for another head or a malformed shape fails closed', () => {
    const base = readyInput();
    const otherHead = { ...assertionThenPassedEvidence(), head_sha: '9'.repeat(40) };
    expect(projectPullRequestMergeReadiness({ ...base,
      provider: { ...base.provider!, check_failures: [otherHead] } }).blockers.map((blocker) => blocker.code))
      .toContain('provider_data_incomplete');
    expect(projectPullRequestMergeReadiness({ ...base,
      provider: { ...base.provider!, check_failures: [{ check_name: 'incomplete' }] } as unknown as ProviderMergeReadinessFactsV1 })
      .blockers.map((blocker) => blocker.code)).toContain('provider_data_incomplete');
  });
});

describe('required-check coverage', () => {
  const matrix = 'build, typecheck, test (matrix)';
  const policy = { protected_paths: ['api-surface/**', 'docs/protocol.md'], required_checks: ['Required / CI', matrix] };

  type Check = { readonly name: string; readonly bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' };
  /** The required-check view and the all-checks view are separate provider reads. */
  function coverageInput(
    coverage: { readonly changed_paths: readonly string[]; readonly observed?: readonly Check[] }
      | { readonly status: 'invalid'; readonly message: string }
      | { readonly status: 'absent' },
    checks: readonly Check[],
  ): PullRequestMergeReadinessInput {
    const base = readyInput();
    const facts: RequiredCheckCoverageFactsV1 = 'status' in coverage ? coverage
      : { status: 'active', policy, changed_paths: coverage.changed_paths, observed_checks: coverage.observed ?? checks };
    return { ...base, provider: { ...base.provider!, checks, required_check_coverage: facts } };
  }

  test('a protected path with a skipped check blocks and names the path, the check and the fix', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['src/app.ts', 'api-surface/entries.json'],
        observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'skipping' }] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(false);
    const blocker = verdict.blockers.find((entry) => entry.code === 'required_check_coverage_missing')!;
    expect(blocker.attention_owner).toBe('agent');
    expect(blocker.detail).toContain('"api-surface/entries.json"');
    expect(blocker.detail).toContain(`"${matrix}"`);
    expect(blocker.detail).toContain('is skipping');
    expect(blocker.detail).toContain('coverage-waiver');
    expect(verdict.required_check_coverage).toMatchObject({
      protected_paths: ['api-surface/entries.json'],
      checks: [
        { check: 'Required / CI', bucket: 'pass', requirement: 'required' },
        { check: matrix, bucket: 'skipping', requirement: 'required' },
      ],
      waiver: null,
    });
    expect(validateRequiredCheckCoverageEvidenceOrNull(verdict.required_check_coverage)).toEqual(verdict.required_check_coverage);
  });

  test('an unprotected PR keeps the current behavior', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['src/app.ts', 'docs/other.md'] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(true);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.required_check_coverage).toMatchObject({
      protected_paths: [],
      waiver: null,
      checks: [
        { check: 'Required / CI', bucket: 'pass', requirement: 'not_required' },
        { check: matrix, bucket: 'missing', requirement: 'not_required' },
      ],
    });
  });

  test('every declared check passing is ready and recorded', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['docs/protocol.md'],
        observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'pass' }] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(true);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.required_check_coverage).toMatchObject({
      protected_paths: ['docs/protocol.md'],
      waiver: null,
      checks: [
        { check: 'Required / CI', bucket: 'pass', requirement: 'required' },
        { check: matrix, bucket: 'pass', requirement: 'required' },
      ],
    });
  });

  test('a passing coverage-waiver check waives the requirement and is recorded', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['api-surface/entries.json'],
        observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'skipping' },
          { name: 'coverage-waiver', bucket: 'pass' }] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(true);
    expect(verdict.required_check_coverage?.waiver).toEqual({ check: 'coverage-waiver', bucket: 'pass' });
    expect(verdict.required_check_coverage?.checks.map((check) => check.requirement)).toEqual(['waived', 'waived']);
    expect(validateRequiredCheckCoverageEvidenceOrNull(verdict.required_check_coverage)).toEqual(verdict.required_check_coverage);
  });

  test('duplicate observed names are order-independent and every observation must pass', () => {
    const duplicates = (first: 'pass' | 'skipping', second: 'pass' | 'skipping') => [
      { name: 'Required / CI', bucket: 'pass' as const },
      { name: matrix, bucket: first },
      { name: matrix, bucket: second },
    ];
    for (const observed of [duplicates('pass', 'skipping'), duplicates('skipping', 'pass')]) {
      const verdict = projectPullRequestMergeReadiness(coverageInput(
        { changed_paths: ['api-surface/entries.json'], observed },
        [{ name: 'Required / CI', bucket: 'pass' }],
      ));
      expect(verdict.ready).toBe(false);
      expect(verdict.blockers.map((blocker) => blocker.code)).toContain('required_check_coverage_missing');
      expect(verdict.required_check_coverage?.checks[1]?.bucket).not.toBe('pass');
    }
    // Two passing observations of the same name stay ready.
    const allPass = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['api-surface/entries.json'], observed: duplicates('pass', 'pass') },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(allPass.ready).toBe(true);
    expect(allPass.required_check_coverage?.checks[1]).toEqual({ check: matrix, bucket: 'pass', requirement: 'required' });
  });

  test('a duplicate coverage-waiver observation does not waive when one is not passing', () => {
    for (const order of [['pass', 'skipping'], ['skipping', 'pass']] as const) {
      const verdict = projectPullRequestMergeReadiness(coverageInput(
        { changed_paths: ['api-surface/entries.json'],
          observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'skipping' },
            { name: 'coverage-waiver', bucket: order[0] }, { name: 'coverage-waiver', bucket: order[1] }] },
        [{ name: 'Required / CI', bucket: 'pass' }],
      ));
      expect(verdict.ready).toBe(false);
      expect(verdict.required_check_coverage?.waiver).toBeNull();
    }
  });

  test('a non-passing coverage-waiver check does not waive', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['api-surface/entries.json'],
        observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'skipping' },
          { name: 'coverage-waiver', bucket: 'skipping' }] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(false);
    expect(verdict.required_check_coverage?.waiver).toBeNull();
    expect(verdict.blockers.map((blocker) => blocker.code)).toContain('required_check_coverage_missing');
  });

  test('a missing declared check blocks', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { changed_paths: ['api-surface/entries.json'] },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(false);
    const blocker = verdict.blockers.find((entry) => entry.code === 'required_check_coverage_missing')!;
    expect(blocker.detail).toContain(`"${matrix}" is missing`);
    expect(blocker.detail).toContain('fix its name in publication.required_check_coverage');
    expect(verdict.required_check_coverage?.checks[1]).toEqual({ check: matrix, bucket: 'missing', requirement: 'required' });
  });

  test('a malformed coverage policy fails closed with a typed blocker', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput(
      { status: 'invalid', message: 'publication.required_check_coverage is invalid: the block has unknown fields: protected_path' },
      [{ name: 'Required / CI', bucket: 'pass' }],
    ));
    expect(verdict.ready).toBe(false);
    expect(verdict.required_check_coverage).toBeNull();
    const blocker = verdict.blockers.find((entry) => entry.code === 'required_check_coverage_policy_invalid')!;
    expect(blocker.attention_owner).toBe('agent');
    expect(blocker.detail).toContain('unknown fields: protected_path');
  });

  test('an absent coverage block leaves the verdict and evidence unchanged', () => {
    const verdict = projectPullRequestMergeReadiness(coverageInput({ status: 'absent' },
      [{ name: 'Required / CI', bucket: 'pass' }]));
    expect(verdict.ready).toBe(true);
    expect(verdict.required_check_coverage).toBeNull();
  });

  test('a read that changed during observation carries no coverage evidence', () => {
    const verdict = projectPullRequestMergeReadiness({
      ...coverageInput({ changed_paths: ['api-surface/entries.json'],
        observed: [{ name: 'Required / CI', bucket: 'pass' }, { name: matrix, bucket: 'skipping' }] },
      [{ name: 'Required / CI', bucket: 'pass' }]),
      observation: 'changed_during_read',
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.required_check_coverage).toBeNull();
  });
});

describe('required-check coverage policy', () => {
  const file = (value: unknown) => ({ status: 'present' as const, text: JSON.stringify(value) });

  test('an absent, missing or empty block is inactive', () => {
    expect(requiredCheckCoveragePolicyAtRef({ status: 'missing' })).toEqual({ status: 'absent' });
    expect(requiredCheckCoveragePolicyAtRef(file({}))).toEqual({ status: 'absent' });
    expect(requiredCheckCoveragePolicyAtRef(file({ publication: { acceptance_merge: 'on' } }))).toEqual({ status: 'absent' });
    expect(requiredCheckCoveragePolicyAtRef(file({ publication: { required_check_coverage: {} } }))).toEqual({ status: 'absent' });
    expect(requiredCheckCoveragePolicyAtRef(file({ publication: { required_check_coverage: { protected_paths: [] } } })))
      .toEqual({ status: 'absent' });
  });

  test('a declared block is active and keeps both lists', () => {
    const declared = { protected_paths: ['api-surface/**'], required_checks: ['Required / CI'] };
    expect(requiredCheckCoveragePolicyAtRef(file({ publication: { required_check_coverage: declared } })))
      .toEqual({ status: 'active', policy: declared });
  });

  test('the block is closed: unknown fields, unsafe globs and a path rule without checks are invalid', () => {
    const invalid = [
      { publication: { required_check_coverage: { protected_path: ['api-surface/**'] } } },
      { publication: { required_check_coverage: { protected_paths: ['/abs/**'], required_checks: ['Required / CI'] } } },
      { publication: { required_check_coverage: { protected_paths: ['../escape'], required_checks: ['Required / CI'] } } },
      { publication: { required_check_coverage: { protected_paths: ['api-surface/**'] } } },
      { publication: { required_check_coverage: { protected_paths: ['a/**'], required_checks: [''] } } },
      { publication: { required_check_coverage: { protected_paths: ['a/**', 'a/**'], required_checks: ['Required / CI'] } } },
      { publication: { required_check_coverage: [] } },
      { publication: { required_check_coverage: 'on' } },
    ];
    for (const value of invalid) {
      const parsed = requiredCheckCoveragePolicyAtRef(file(value));
      expect(parsed.status).toBe('invalid');
      if (parsed.status === 'invalid') expect(parsed.message).toContain('required_check_coverage is invalid');
    }
  });

  test('a malformed policy file is invalid, not absent', () => {
    expect(requiredCheckCoveragePolicyAtRef({ status: 'present', text: '{' }).status).toBe('invalid');
    expect(requiredCheckCoveragePolicyAtRef({ status: 'present', text: '[]' }).status).toBe('invalid');
  });

  test('protected globs match whole segments and ** crosses directories', () => {
    expect(protectedPathMatches('api-surface/**', 'api-surface/entries.json')).toBe(true);
    expect(protectedPathMatches('api-surface/**', 'api-surface/nested/deep.json')).toBe(true);
    expect(protectedPathMatches('api-surface/*', 'api-surface/nested/deep.json')).toBe(false);
    expect(protectedPathMatches('docs/protocol.md', 'docs/protocol.md')).toBe(true);
    expect(protectedPathMatches('docs/protocol.md', 'docs/protocol.md.bak')).toBe(false);
    expect(protectedPathMatches('**/entries.json', 'api-surface/entries.json')).toBe(true);
    expect(protectedPathMatches('**/entries.json', 'entries.json')).toBe(true);
    expect(protectedPathMatches('*.bin', 'nested/firmware.bin')).toBe(false);
    expect(protectedPathMatches('*.bin', 'firmware.bin')).toBe(true);
  });

  test('a PR cannot change the coverage block it is merged under', () => {
    const base = parsePublicationPolicy(file({ publication: {
      acceptance_merge: 'on',
      required_check_coverage: { protected_paths: ['api-surface/**'], required_checks: ['Required / CI'] },
    } }));
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.coverage).toEqual({ protected_paths: ['api-surface/**'], required_checks: ['Required / CI'] });
    expect(publicationPolicyChanged(base, file({ publication: {
      acceptance_merge: 'on',
      required_check_coverage: { protected_paths: ['src/**'], required_checks: ['Required / CI'] },
    } }))).toBe(true);
    expect(publicationPolicyChanged(base, file({ publication: {
      acceptance_merge: 'on',
      required_check_coverage: { protected_paths: ['api-surface/**'], required_checks: ['Required / CI'] },
    } }))).toBe(false);
  });
});


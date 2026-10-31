import { describe, expect, test } from 'bun:test';

import {
  projectPullRequestMergeReadiness,
  type ProviderMergeReadinessFactsV1,
  type PullRequestMergeReadinessInput,
} from '../../src/core/publication/merge-readiness';
import { checkClosingReferences, parseClosingReferences } from '../../src/core/publication/closing-references';
import { assessRequiredCheckFailure, validateRequiredCheckFailureEvidence } from '../../src/core/evidence/required-check-evidence';
import { assertionThenPassedEvidence, productFailureEvidence, requiredCheckAttempt, requiredCheckObservation } from '../helpers/required-check-evidence-fixture';
import { parsePublicationPolicy, publicationPolicyChanged } from '../../src/core/publication/acceptance-merge-policy';

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
      mergeable: 'MERGEABLE',
    },
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

test.each(['head_sha','base_sha'] as const)('an otherwise green pull request loses readiness when provider %s moves', field => {
  const input=readyInput();
  const verdict=projectPullRequestMergeReadiness({...input,provider:{...input.provider!,[field]:'9'.repeat(40)}});
  expect(verdict.ready).toBe(false);
  expect(verdict.blockers.map(b=>b.code)).toEqual([field==='head_sha'?'head_moved':'base_moved_since_verification']);
});
test('ordinary PR readiness needs no receipt, lease or acceptance artifact', () => {
  const { provider, integration_mode, observation } = readyInput();
  const input = { provider: provider!, integration_mode, observation,
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
    expected_head_sha: HEAD, expected_base_sha: 'd'.repeat(40) }).blockers.map(b => b.code))
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
      requiredCheckAttempt({ conclusion: 'cancelled', steps: ['Run tests'], failure_excerpt: null, logs_available: false,
        platform_evidence: ['The runner has received a shutdown signal and the job was cancelled'] }),
      requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
        conclusion: 'success', steps: [], failure_excerpt: null,
        scope: { executed: ['test (ubuntu-latest)', 'Run tests'], skipped: [] } }),
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


import { describe, expect, test } from 'bun:test';

import {
  C9_CANARY_SCHEMA,
  C9_CASES,
  C9_USEFULNESS_RUBRIC,
  classifyC9Decision,
  collectConcurrentDispatchCompletionTimes,
  countObservedModuleEngineerWriters,
  type C9ArmMetrics,
  type C9CaseReport,
} from '../../scripts/c9-collaboration-canary';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { CODEX_DELEGATED_RUN_MAX_OUTPUT_BYTES } from '../../src/effects/engineers/delegated-run-store';
import {
  createCollaborationFixture,
  removeFixtureRoots,
} from '../helpers/collaboration-store-fixture';

function metrics(overrides: Partial<C9ArmMetrics> = {}): C9ArmMetrics {
  return {
    wall_ms: 100,
    input_tokens: 1_000,
    cached_input_tokens: 100,
    output_tokens: 100,
    useful_findings: 1,
    useful_findings_per_10k_tokens: 9.0909,
    time_to_first_useful_ms: 50,
    time_to_first_adopted_ms: 90,
    duplicate_dead_end_rate: 0,
    signal_reuse_count: 1,
    handoff_adoption_count: 1,
    handoff_restart_ms: 10,
    never_read_signal_rate: 0,
    context_injections: [{ bytes: 100, estimated_tokens: 25 }],
    writer_max: 1,
    authority_before_sha256: `sha256:${'a'.repeat(64)}`,
    authority_after_sha256: `sha256:${'a'.repeat(64)}`,
    authority_unchanged: true,
    worktree_unchanged: true,
    ...overrides,
  };
}

function cases(
  treatment: Partial<C9ArmMetrics> = {},
  baseline: Partial<C9ArmMetrics> = {},
): readonly C9CaseReport[] {
  return C9_CASES.map((entry) => ({
    id: entry.id,
    baseline: metrics(baseline),
    treatment: metrics(treatment),
  }));
}

describe('C9 real multi-agent canary contract', () => {
  test('freezes three distinct matched cases and the usefulness rubric before live execution', () => {
    expect(C9_CANARY_SCHEMA).toBe('repo-harness.c9-collaboration-canary/v1');
    expect(C9_USEFULNESS_RUBRIC.frozen_before_live_run).toBe(true);
    expect(C9_USEFULNESS_RUBRIC.rules).toHaveLength(4);
    expect(C9_CASES).toHaveLength(3);
    expect(new Set(C9_CASES.map((entry) => entry.id)).size).toBe(3);
    expect(C9_CASES.every((entry) => entry.questions.length === 3
      && entry.successor_question.length > 0
      && entry.paths.length > 0)).toBe(true);
    expect(CODEX_DELEGATED_RUN_MAX_OUTPUT_BYTES).toBe(1024 * 1024);
  });

  test('passes C9-A/B but keeps EngineerSeatV2 at no-go without a repeated restart bottleneck', () => {
    const decision = classifyC9Decision(cases({ useful_findings: 2 }, { useful_findings: 1 }));
    expect(decision.c9_a).toBe('pass');
    expect(decision.c9_b).toBe('pass');
    expect(decision.delegated_round_bottleneck_proven).toBe(false);
    expect(decision.persistent_engineer_seat_v2).toBe('no-go');
    expect(decision.phase_5_review_marketplace).toBe('inactive');
    expect(decision.phase_6_guarded_merge).toBe('inactive');
  });

  test('fails C9-A/B on authority drift or a second writer', () => {
    const decision = classifyC9Decision(cases({
      authority_after_sha256: `sha256:${'b'.repeat(64)}`,
      authority_unchanged: false,
      writer_max: 2,
    }));
    expect(decision.c9_a).toBe('fail');
    expect(decision.c9_b).toBe('fail');
    expect(decision.persistent_engineer_seat_v2).toBe('no-go');
  });

  test('does not call one successful case repeated evidence', () => {
    const decision = classifyC9Decision(cases().slice(0, 1));
    expect(decision.c9_a).toBe('pass');
    expect(decision.c9_b).toBe('fail');
    expect(decision.persistent_engineer_seat_v2).toBe('no-go');
  });

  test('records each concurrent child at its own completion while preserving dispatch order', async () => {
    let completeFirst!: (value: { stdout: string; stderr: string; exit_code: number }) => void;
    let completeSecond!: (value: { stdout: string; stderr: string; exit_code: number }) => void;
    const first = new Promise<{ stdout: string; stderr: string; exit_code: number }>((resolve) => {
      completeFirst = resolve;
    });
    const second = new Promise<{ stdout: string; stderr: string; exit_code: number }>((resolve) => {
      completeSecond = resolve;
    });
    const times = [10, 20];
    const result = collectConcurrentDispatchCompletionTimes([first, second], 0, () => times.shift()!);
    completeSecond({ stdout: '', stderr: '', exit_code: 0 });
    await Promise.resolve();
    completeFirst({ stdout: '', stderr: '', exit_code: 0 });
    expect(await result).toEqual([20, 10]);
  });

  test('derives two writers from two persisted Module Engineer lineages', () => {
    const roots: string[] = [];
    try {
      const fixture = createCollaborationFixture(process.cwd(), roots, 'active', 'repo-harness-c9-writers');
      fixture.actors.slice(0, 2).forEach((actor, index) => {
        publishCoordinationSignal({
          repo_root: fixture.repoRoot,
          authorization: engineerPrincipalAuthorization(actor.authorization_id),
          destination: { kind: 'public' },
          idempotency_key: `c9-writer-${index}`,
          thread_key: 'c9/writer-observation',
          reply_to_signal_id: null,
          scope_refs: [{ kind: 'free_topic', value: 'c9/writer-observation' }],
          labels: ['C9'],
          title: `writer ${index}`,
          body: `writer observation ${index}`,
          artifact_refs: [],
          source_signal_ids: [],
          supersedes_signal_id: null,
          recorded_time: { kind: 'persisted_observation', observed_at: `2026-08-30T10:4${index}:00.000Z` },
          env: fixture.env,
        });
      });
      expect(countObservedModuleEngineerWriters(fixture.repoRoot)).toBe(2);
    } finally {
      removeFixtureRoots(roots);
    }
  });
});

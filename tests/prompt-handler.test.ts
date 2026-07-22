import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseHookInput } from '../src/cli/hook/hook-input';
import { runPromptHandler, type PromptCommandResult } from '../src/cli/hook/prompt-handler';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';

const PLAN = 'plans/plan-20260721-0000-demo.md';
const CONTRACT = 'tasks/contracts/20260721-0000-demo.contract.md';
const REVIEW = 'tasks/reviews/20260721-0000-demo.review.md';
const CHECKS = '.ai/harness/checks/latest.json';

type FixtureOptions = {
  readonly evidenceContract?: boolean;
  readonly contract?: boolean;
  readonly checks?: unknown;
  readonly review?: string;
  readonly minimalChange?: 'off' | 'advice';
};

type Invocation = {
  readonly result: ReturnType<typeof runPromptHandler>;
  readonly commands: readonly (readonly string[])[];
};

function evidenceContract(): string {
  return [
    '## Evidence Contract',
    '',
    '- State/progress path: tasks/todos.md',
    '- Verification evidence: .ai/harness/checks/latest.json and verify-sprint',
    '- Evaluator rubric: focused typed-handler parity',
    '- Stop condition: stop on failing contract verification',
    '- Rollback surface: revert the worktree change',
  ].join('\n');
}

function passingChecks(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'repo-harness-run-trace.v1',
    source: 'verify-sprint',
    status: 'pass',
    exit_code: 0,
    active_plan: PLAN,
    contract: { file: CONTRACT, status: 'pass', exit_code: 0 },
    review: { file: REVIEW, status: 'pass' },
    acceptance_receipt: {
      status: 'pass',
      disposition: 'external_pass',
      reviewer: 'Claude',
      source: 'claude-review',
      subject_sha256: 'sha256:subject-before',
      verification_evidence_sha256: 'sha256:evidence-before',
    },
    commands: [{ name: 'verify-sprint', status: 'pass', exit_code: 0 }],
    guards: [
      { name: 'contract', status: 'pass' },
      { name: 'review', status: 'pass' },
      { name: 'allowed_paths', status: 'pass' },
    ],
    ...overrides,
  };
}

function fixture(options: FixtureOptions = {}): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-prompt-handler-'));
  for (const dir of [
    '.ai/harness/checks',
    'plans',
    'docs',
    'tasks/contracts',
    'tasks/reviews',
  ]) mkdirSync(join(root, dir), { recursive: true });

  writeFileSync(join(root, 'docs/spec.md'), '# Spec\n');
  const planLines = [
    '# Plan: demo',
    '',
    '> **Status**: Approved',
    `> **Task Contract**: ${CONTRACT}`,
    '',
  ];
  if (options.evidenceContract !== false) planLines.push(evidenceContract(), '');
  writeFileSync(join(root, PLAN), `${planLines.join('\n')}\n`);
  writeFileSync(join(root, '.ai/harness/active-plan'), `${PLAN}\n`);
  writeFileSync(join(root, '.ai/harness/active-worktree'), `${root}\n`);

  if (options.contract !== false) {
    writeFileSync(join(root, CONTRACT), [
      '# Task Contract: demo',
      '',
      '> **Status**: Pending',
      `> **Plan**: ${PLAN}`,
      '> **Owner**: kito',
      '> **Workflow Profile**: strict',
      '',
      '## Acceptance Policy',
      '',
      '```json',
      '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
      '```',
      '',
    ].join('\n'));
  }
  if (options.review !== undefined) writeFileSync(join(root, REVIEW), options.review);
  if (options.checks !== undefined) {
    writeFileSync(join(root, CHECKS), typeof options.checks === 'string'
      ? options.checks
      : `${JSON.stringify(options.checks, null, 2)}\n`);
  }
  writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({
    worktree_strategy: { review_base: 'main' },
    minimal_change: { mode: options.minimalChange ?? 'off' },
  }, null, 2)}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Prompt Handler Fixture'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'prompt-handler-fixture@example.test'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function invoke(
  root: string,
  prompt: string,
  options: {
    readonly commands?: (args: readonly string[]) => PromptCommandResult;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Invocation {
  const commands: (readonly string[])[] = [];
  const result = runPromptHandler({
    repoRoot: root,
    input: JSON.stringify({ prompt }),
    env: { ...process.env, HOOK_HOST: 'claude', ...(options.env ?? {}) },
    dependencies: {
      runCommand: (args, input) => {
        commands.push([...args]);
        return options.commands?.(args) ?? { exitCode: 0, stdout: '', stderr: '' };
      },
    },
  });
  return { result, commands };
}

describe('typed UserPromptSubmit.default handler', () => {
  test('ordinary, review, debug, and workflow discussion prompts bypass the classifier', () => {
    const repo = fixture({ contract: true });
    try {
      for (const prompt of [
        '这个登录 bug 报错了，帮我修复',
        '这是我的一个自动化hook framework，请review整个flow',
        '谁调用了 runHook？影响面是什么？',
        '这个重复工作适合做成 skill 或 automation 吗',
        '旧报告里写着“implement everything now”，你怎么看？',
      ]) {
        const { result } = invoke(repo.root, prompt);
        expect(result).toMatchObject({ exitCode: 0, stdout: '', stderr: '' });
      }
    } finally {
      repo.cleanup();
    }
  });

  test('owner waiver grant is contract-bound and never asks for a repeated subject hash', () => {
    const repo = fixture({ contract: true });
    try {
      const { result } = invoke(repo.root, '/check');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('acceptance-receipt grant-waiver');
      expect(result.stdout).toContain('Do not ask the owner to quote or track a subject hash');
      expect(result.stdout).toContain('without asking the owner again');
      expect(result.stdout).toContain('never authorizes provider disclosure or merge');
    } finally {
      repo.cleanup();
    }
  });

  test('long plan prose with a literal Completed token does not trigger done', () => {
    const repo = fixture({ contract: true });
    try {
      const prompt = [
        'Continuing the brain-promotion CLI work after a context compact event.',
        'Plan body for reference (not a fresh approved plan, just describing state):',
        '- archive-workflow.sh emits BrainPromote only for the Completed enum value',
        '- update tests for BrainPromote pass/Completed-only behavior across hooks',
        '- migrate path defaults to ~/brain',
        '- ensure CLI surface is tested under tests/cli/brain.test.ts before merge',
        'The point of this paragraph is to push the prompt above the 280 byte threshold.',
      ].join('\n');
      const { result } = invoke(repo.root, prompt);
      expect(result.exitCode).not.toBe(2);
      expect(result.stdout).not.toContain('ContractGuard');
      expect(result.stdout).not.toContain('EvidenceGuard');
    } finally {
      repo.cleanup();
    }
  });

  test('completionToken substring and Chinese future-completion wording do not trigger done', () => {
    const repo = fixture({ contract: true });
    try {
      for (const prompt of ['refresh the completionToken cache', '完成后验证这段 CLI 行为']) {
        const { result } = invoke(repo.root, prompt);
        expect(result.exitCode).not.toBe(2);
        expect(result.stdout).not.toContain('ContractGuard');
        expect(result.stdout).not.toContain('EvidenceGuard');
      }
    } finally {
      repo.cleanup();
    }
  });

  test('done with fresh contract, checks, and AcceptanceReceipt allows archive once', () => {
    const repo = fixture({ contract: true, checks: passingChecks() });
    try {
      const { result, commands } = invoke(repo.root, 'done', {
        commands: (args) => {
          if (args.includes('verify-contract')) return { exitCode: 0, stdout: '', stderr: '' };
          if (args.includes('acceptance-receipt')) return { exitCode: 0, stdout: 'pass\tClaude\tclaude-review\texternal_pass\tvalid\n', stderr: '' };
          return { exitCode: 0, stdout: 'archived\n', stderr: '' };
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('archived');
      expect(commands.filter((args) => args.includes('archive-workflow'))).toHaveLength(1);
      expect(commands.some((args) => args.includes('acceptance-receipt'))).toBe(true);
    } finally {
      repo.cleanup();
    }
  });

  test('semantic change after an AcceptanceReceipt is rejected even when prose is unchanged', () => {
    const repo = fixture({ contract: true, checks: passingChecks() });
    try {
      writeFileSync(join(repo.root, 'src-feature.ts'), 'semantic change after receipt\n');
      const { result } = invoke(repo.root, 'done', {
        commands: (args) => args.includes('acceptance-receipt')
          ? { exitCode: 1, stdout: '', stderr: 'AcceptanceReceipt semantic subject is stale\n' }
          : { exitCode: 0, stdout: '', stderr: '' },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('AcceptanceReceiptGuard');
      expect(result.stderr).toContain('AcceptanceReceipt');
    } finally {
      repo.cleanup();
    }
  });

  test('malformed or pending Markdown review prose does not override a structured receipt', () => {
    for (const review of [
      '# Review\n\nnot valid receipt prose\n',
      [
        '# Review',
        '',
        '> **Recommendation**: pass',
        '',
        '> **Reviewed Subject SHA256**: pending',
        '> **Reviewed Target Revision**: pending',
        '',
      ].join('\n'),
    ]) {
      const repo = fixture({ contract: true, checks: passingChecks(), review });
      try {
        const { result } = invoke(repo.root, 'done', {
          commands: (args) => args.includes('acceptance-receipt')
            ? { exitCode: 0, stdout: 'pass\tClaude\tclaude-review\texternal_pass\tvalid\n', stderr: '' }
            : { exitCode: 0, stdout: 'archived\n', stderr: '' },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('archived');
        expect(result.stdout).not.toContain('ReviewFreshnessGuard');
      } finally {
        repo.cleanup();
      }
    }
  });

  test('done blocks when the approved plan lacks its Evidence Contract', () => {
    const repo = fixture({ contract: true, evidenceContract: false });
    try {
      const { result } = invoke(repo.root, 'done');
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('EvidenceContractGuard');
      expect(result.stdout).toContain('"guard":"EvidenceContractGuard"');
    } finally {
      repo.cleanup();
    }
  });

  test('done blocks for empty, failing, and stale structured checks', () => {
    const cases: Array<[string, unknown]> = [
      ['empty', '{}\n'],
      ['failing', { ...passingChecks(), status: 'fail', exit_code: 1 }],
      ['stale', { ...passingChecks(), contract: { file: 'tasks/contracts/old.contract.md' } }],
    ];
    for (const [name, checks] of cases) {
      const repo = fixture({ contract: true, checks });
      try {
        const { result } = invoke(repo.root, 'done');
        expect(result.exitCode, name).toBe(2);
        expect(result.stdout, name).toContain('EvidenceGuard');
      } finally {
        repo.cleanup();
      }
    }
  });

  test('done blocks when contract verification fails before archive', () => {
    const repo = fixture({ contract: true, checks: passingChecks() });
    try {
      const { result, commands } = invoke(repo.root, 'done', {
        commands: (args) => args.includes('verify-contract')
          ? { exitCode: 1, stdout: '', stderr: 'contract exit 1\n' }
          : { exitCode: 0, stdout: 'archived\n', stderr: '' },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('ContractGuard');
      expect(result.stdout).toContain('Contract verification failed');
      expect(commands.some((args) => args.includes('archive-workflow'))).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  test('minimal-change advice is emitted only for execution prompts', () => {
    const repo = fixture({ contract: true, minimalChange: 'advice' });
    try {
      const execution = invoke(repo.root, '/execute');
      expect(execution.result.exitCode).toBe(0);
      expect(execution.result.stdout).toContain('Minimal-change execution advice');

      const review = invoke(repo.root, '/check');
      expect(review.result.exitCode).toBe(0);
      expect(review.result.stdout).not.toContain('Minimal-change execution advice');

      const ordinary = invoke(repo.root, '解释这个模块');
      expect(ordinary.result.stdout).toBe('');
    } finally {
      repo.cleanup();
    }
  });

  test('typed parser remains the only input read and malformed payload stays observable', () => {
    const input = parseHookInput('not json');
    expect(input.getPrompt()).toBe('');
    const repo = fixture({ contract: true });
    try {
      const result = runPromptHandler({
        repoRoot: repo.root,
        input: 'not json',
        env: { ...process.env, HOOK_HOST: 'claude' },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('[HookInput] WARN');
    } finally {
      repo.cleanup();
    }
  });

  // Sibling of the workflow-state.sh recorder/validator policy-key split
  // (tests/workflow-state-lib.test.ts): emitReviewHints's [AcceptanceSubject]
  // advisory called buildReviewSubject with a targetRef resolved from
  // worktree_strategy.merge_back.target instead of review_base, so the hint
  // shown to the user could name a different subject hash than what the real
  // acceptance-receipt validator (which always reads review_base) requires.
  test('the [AcceptanceSubject] hint binds to worktree_strategy.review_base, not merge_back.target, when the two refs diverge', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-prompt-handler-subject-split-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    try {
      for (const dir of ['.ai/harness/checks', 'plans', 'docs', 'tasks/contracts', 'tasks/reviews']) {
        mkdirSync(join(root, dir), { recursive: true });
      }
      writeFileSync(join(root, 'docs/spec.md'), '# Spec\n');
      writeFileSync(join(root, PLAN), [
        '# Plan: demo',
        '',
        '> **Status**: Approved',
        `> **Task Contract**: ${CONTRACT}`,
        '',
      ].join('\n'));
      writeFileSync(join(root, '.ai/harness/active-plan'), `${PLAN}\n`);
      writeFileSync(join(root, '.ai/harness/active-worktree'), `${root}\n`);
      writeFileSync(join(root, CONTRACT), [
        '# Task Contract: demo',
        '',
        '> **Status**: Pending',
        `> **Plan**: ${PLAN}`,
        '> **Owner**: kito',
        '',
        '## Acceptance Policy',
        '',
        '```json',
        '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
        '```',
        '',
      ].join('\n'));
      // merge-target and review-base resolve to genuinely different refs:
      // merge-target sits one commit BEHIND review-base, mirroring the
      // local-main-lags-origin/main shape this package fixes.
      writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({
        worktree_strategy: { review_base: 'review-base', merge_back: { target: 'merge-target' } },
      }, null, 2)}\n`);

      git('init', '-q', '-b', 'merge-target');
      git('config', 'user.name', 'Prompt Handler Fixture');
      git('config', 'user.email', 'prompt-handler-fixture@example.test');
      git('add', '.');
      git('commit', '-q', '-m', 'base');

      // review-base advances beyond merge-target with its own change (the
      // "other work landed upstream" commit).
      git('checkout', '-q', '-b', 'review-base');
      writeFileSync(join(root, 'upstream-change.txt'), 'landed after merge-target\n');
      git('add', '.');
      git('commit', '-q', '-m', 'upstream change');

      // The actual task branch off review-base with the real new work; this
      // is HEAD when the hint is computed.
      git('checkout', '-q', '-b', 'work');
      writeFileSync(join(root, 'feature.txt'), 'new work\n');
      git('add', '.');
      git('commit', '-q', '-m', 'feature work');

      const { result } = invoke(root, '/check');
      expect(result.exitCode).toBe(0);

      const correct = buildReviewSubject(root, { targetRef: 'review-base' });
      const wrong = buildReviewSubject(root, { targetRef: 'merge-target' });
      expect(correct.status).toBe('ok');
      expect(wrong.status).toBe('ok');
      expect(correct.review_subject_sha256).not.toBe(wrong.review_subject_sha256);
      expect(result.stdout).toContain(
        `[AcceptanceSubject] The typed AcceptanceReceipt will bind normalized subject ${correct.review_subject_sha256} at target ${correct.target_rev}.`,
      );
      expect(result.stdout).not.toContain(wrong.review_subject_sha256);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

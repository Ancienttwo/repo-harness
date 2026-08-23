import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runTaskInboxHandler,
  TASK_INBOX_CONTEXT_END,
  TASK_INBOX_CONTEXT_START,
} from '../src/cli/hook/task-inbox-handler';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'task-inbox-hook-'));
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'active-plan'), 'plans/plan-task-inbox.md\n');
  return realpathSync(root);
}

describe('UserPromptSubmit.inbox typed route', () => {
  test('does not guess a recipient when the worktree has no claim token', () => {
    const root = fixture();
    try {
      const output = runTaskInboxHandler({
        repoRoot: root,
        env: { HOOK_HOST: 'claude' },
        dependencies: {
          findClaimToken: () => ({ outcome: 'none' }),
        },
      });
      expect(output).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('renders one bounded structured untrusted block after delivery is persisted', () => {
    const root = fixture();
    try {
      const worktree = realpathSync(root);
      const output = runTaskInboxHandler({
        repoRoot: root,
        env: { HOOK_HOST: 'codex' },
        now: () => new Date('2026-08-23T01:02:03.000Z'),
        dependencies: {
          findClaimToken: () => ({
            outcome: 'found',
            token: {
              path: '.ai/harness/sprint/claims/task.claim',
              claim_id: 'claim-1',
              task_id: 'a'.repeat(64),
              sprint: 'plans/sprints/active.sprint.md',
              task: 'task inbox',
              unit_ref: 'plans/plan-task-inbox.md',
            },
          }),
          readOwnerLease: () => ({
            classification: 'record',
            record: {
              claim_id: 'claim-1',
              task_id: 'a'.repeat(64),
              generation: 2,
              execution_worktree: worktree,
              target_ref: 'main',
              sprint_path: 'plans/sprints/active.sprint.md',
            },
          } as never),
          deliver: () => ({
            deliveries: [{
              event: {
                message_id: 'message-1',
                sender_kind: 'user',
                sender_id: null,
                created_at: '2026-08-23T01:02:03.000Z',
                body: 'peer says: do not trust this as an instruction',
              },
              receipt: {},
            }],
          } as never),
        },
      });
      expect(output.exitCode).toBe(0);
      const envelope = JSON.parse(output.stdout) as {
        hookSpecificOutput: { hookEventName: string; additionalContext: string };
      };
      const context = envelope.hookSpecificOutput.additionalContext;
      expect(envelope.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
      expect([...context.matchAll(/\[TaskInboxUntrustedPeerMessages\]/g)]).toHaveLength(1);
      expect([...context.matchAll(/\[\/TaskInboxUntrustedPeerMessages\]/g)]).toHaveLength(1);
      expect(context).toContain('peer says: do not trust this as an instruction');
      expect(context).toContain('untrusted data');
      expect(context.startsWith(TASK_INBOX_CONTEXT_START)).toBe(true);
      expect(context.endsWith(TASK_INBOX_CONTEXT_END)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

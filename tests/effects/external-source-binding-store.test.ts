import { buildExternalSourceBindingReceipt, canonicalExternalSourceBindingReceiptBytes } from '../../src/core/external-sources/binding';
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildAdmittedSourceBindingReceipt } from '../../src/core/external-sources/admitted-binding';
import { listExternalSourceBindingReceipts, listHistoricalExternalSourceBindingReceipts, writeExternalSourceBindingReceipt } from '../../src/effects/external-sources/store';

function receipt(boundAt = '2026-09-01T00:00:00.000Z') {
  return buildAdmittedSourceBindingReceipt({
    registered_repository_id: 'repo_0123456789abcdef', authorization_revision: 3, provider: 'github', provider_repository_id: '10', provider_issue_id: '20',
    source_revision: `sha256:${'1'.repeat(64)}`, observation_sha256: `sha256:${'2'.repeat(64)}`,
    session: { repository_id: 'repo_0123456789abcdef', provider_repository_id: '10', issue_id: '20', campaign_id: 'review',
      task: '4'.repeat(64), role: 'deep-reasoner', claim_ref: 'https://github.com/acme/widgets/issues/20#issuecomment-1',
      claim_revision: `sha256:${'5'.repeat(64)}`, grant_sha256: `sha256:${'6'.repeat(64)}`, policy_sha256: `sha256:${'7'.repeat(64)}`,
      actor_id: 'owner', session_binding_sha256: `sha256:${'8'.repeat(64)}` },
    admission_sha256: `sha256:${'9'.repeat(64)}`, bound_at: boundAt,
  });
}

describe('external source binding store', () => {
  test('persists one immutable edge, retries exact bytes idempotently, and rejects conflicting bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'external-binding-store-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const first = writeExternalSourceBindingReceipt(root, receipt());
      const retry = writeExternalSourceBindingReceipt(root, receipt());
      expect(retry).toEqual(first);
      expect(() => writeExternalSourceBindingReceipt(root, receipt('2026-09-01T01:00:00.000Z'))).toThrow('conflicts with immutable existing bytes');
      expect(listExternalSourceBindingReceipts(root)).toEqual([first]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test('lists V1 bytes only through the explicit historical reader', () => {
    const root = mkdtempSync(join(tmpdir(), 'external-binding-history-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const historical = buildExternalSourceBindingReceipt({
        registered_repository_id: 'repo_0123456789abcdef', authorization_revision: 3, provider: 'github', provider_repository_id: '10', provider_issue_id: '20',
        source_revision: `sha256:${'1'.repeat(64)}`, observation_sha256: `sha256:${'2'.repeat(64)}`,
        canonical_target_ref: 'main', canonical_target_commit: '3'.repeat(40), sprint_path: 'plans/sprints/work.sprint.md',
        task_id: '4'.repeat(64), task_revision: '5'.repeat(64), task_ref: 'historical work', plan_path: 'plans/plan-work.md', plan_sha256: `sha256:${'6'.repeat(64)}`,
        contract_path: 'tasks/contracts/work.contract.md', contract_sha256: `sha256:${'7'.repeat(64)}`, bound_at: '2026-09-01T00:00:00Z',
      });
      const directory = join(root, '.git/repo-harness/external-sources/v1/bindings'); mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${historical.binding_id.slice(7)}.json`), canonicalExternalSourceBindingReceiptBytes(historical));
      expect(listExternalSourceBindingReceipts(root)).toEqual([]);
      expect(listHistoricalExternalSourceBindingReceipts(root)).toEqual([historical]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

});

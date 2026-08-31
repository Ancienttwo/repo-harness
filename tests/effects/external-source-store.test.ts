import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildExternalSourceRefreshReceipt, buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import {
  EXTERNAL_SOURCE_STORE_RELATIVE_ROOT,
  externalSourceStoreRoot,
  listExternalSourceRefreshReceipts,
  listProviderIssueObservations,
  writeExternalSourceRefreshReceipt,
  writeProviderIssueObservation,
} from '../../src/effects/external-sources/store';

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'external-source-store-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function observation() {
  return buildProviderIssueObservation({
    registered_repository_id: 'repo_1', provider: 'github', provider_host: 'github.com', provider_repository_id: '100', provider_issue_id: '200', display_ref: 'acme/widgets#7', url: 'https://github.com/acme/widgets/issues/7',
    observed_at: '2026-08-31T00:00:00.000Z', provider_created_at: null, provider_updated_at: null, state: 'open', title: 'inert', body: 'untrusted', labels: ['ready'], assignees: [], comments_policy: 'omitted', policy_revision: 'sha256:policy', eligible: true, eligibility_reasons: [],
  });
}

function receipt() {
  return buildExternalSourceRefreshReceipt({
    receipt_id: 'attempt-1', registered_repository_id: 'repo_1', provider: 'github', provider_host: 'github.com', provider_repository_id: '100', provider_display_ref: 'acme/widgets', policy_revision: 'sha256:policy',
    started_at: '2026-08-31T00:00:00.000Z', completed_at: '2026-08-31T00:00:01.000Z', outcome: 'complete', pages_fetched: 1, issues_seen: 1, observations_written: 1, limits: { max_pages: 2, max_issues: 2, max_body_bytes: 100, max_total_bytes: 1000, deadline_ms: 1000 }, source_revisions: [observation().source_revision], failure: null,
  });
}

describe('external source immutable Git-common-dir store', () => {
  test('is create-once, idempotent, and independent of the worktree metadata directory', () => {
    const root = repository();
    try {
      const item = observation();
      expect(writeProviderIssueObservation(root, item)).toEqual(item);
      expect(writeProviderIssueObservation(root, item)).toEqual(item);
      const writtenReceipt = writeExternalSourceRefreshReceipt(root, receipt());
      expect(listProviderIssueObservations(root)).toEqual([item]);
      expect(listExternalSourceRefreshReceipts(root)).toEqual([writtenReceipt]);
      const store = externalSourceStoreRoot(root);
      expect(store).toContain(EXTERNAL_SOURCE_STORE_RELATIVE_ROOT);
      expect(existsSync(store)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('fails closed on conflicting immutable bytes and symlinked store paths', () => {
    const root = repository();
    try {
      const item = observation();
      writeProviderIssueObservation(root, item);
      const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
      const absoluteCommon = join(root, common);
      const records = join(absoluteCommon, EXTERNAL_SOURCE_STORE_RELATIVE_ROOT, 'observations');
      const identity = readdirSync(records)[0];
      writeFileSync(join(records, identity, readdirSync(join(records, identity))[0]), '{}\n');
      expect(() => writeProviderIssueObservation(root, item)).toThrow('conflicts');
      const unsafe = join(absoluteCommon, 'repo-harness');
      rmSync(unsafe, { recursive: true, force: true });
      mkdirSync(join(root, 'outside'), { recursive: true });
      symlinkSync(join(root, 'outside'), unsafe);
      expect(() => writeProviderIssueObservation(root, item)).toThrow('unsafe');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

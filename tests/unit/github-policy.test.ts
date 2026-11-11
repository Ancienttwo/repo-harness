import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { withTempRepo } from '../helpers/repo-fixture';
import { resolvePolicyReviewBase } from '../../src/effects/review/diff-fingerprint';

import { ExternalSourcePolicyError, readExternalSourcesPolicy, parseExternalSourcesPolicy, requireManualGithubPolicy } from '../../src/effects/github/policy';

describe('GitHub external_sources policy', () => {
  test('disk readers retain their own missing, malformed and section outcomes through the shared decoder', () => {
    withTempRepo('workflow-policy-readers', (repo) => {
      const policyPath = join(repo, '.ai/harness/policy.json');
      const cases = [
        { text: undefined, review: 'workflow policy is missing or unreadable', github: 'cannot be read:' },
        { text: '{', review: 'workflow policy is missing or unreadable', github: 'cannot be read:' },
        { text: 'null', review: 'workflow policy is malformed', github: 'must be an object' },
        { text: '[]', review: 'workflow policy is malformed', github: 'must be an object' },
        { text: '{}', review: 'worktree_strategy is missing' },
        { text: '{"worktree_strategy":{"review_base":" "}}', review: 'worktree_strategy.review_base is missing' },
        { text: '{"external_sources":{"version":2,"mode":"off"}}', review: 'worktree_strategy is missing', github: 'external_sources.version must be 1' },
      ];
      mkdirSync(join(repo, '.ai/harness'), { recursive: true });
      for (const row of cases) {
        if (row.text !== undefined) writeFileSync(policyPath, row.text);
        expect(resolvePolicyReviewBase(repo)).toEqual({ ok: false, reason: row.review });
        if (row.github) {
          try {
            readExternalSourcesPolicy(repo);
            throw new Error('expected policy failure');
          } catch (error) {
            expect(error).toBeInstanceOf(ExternalSourcePolicyError);
            expect((error as ExternalSourcePolicyError).code).toBe('external_source_policy_invalid');
            expect((error as Error).message).toContain(row.github);
            if (row.text === '{') {
              let syntaxMessage = '';
              try { JSON.parse(row.text); } catch (syntax) { syntaxMessage = (syntax as Error).message; }
              expect((error as Error).message).toBe(`.ai/harness/policy.json cannot be read: ${syntaxMessage}`);
            }
          }
        } else expect(readExternalSourcesPolicy(repo)).toEqual({ version: 1, mode: 'off' });
      }
      writeFileSync(policyPath, '{"worktree_strategy":{"review_base":" main "},"external_sources":{"version":1,"mode":"off"},"context":null}');
      expect(resolvePolicyReviewBase(repo)).toEqual({ ok: true, targetRef: 'main' });
      expect(readExternalSourcesPolicy(repo)).toEqual({ version: 1, mode: 'off' });
    });
  });

  test('only absent or exact off policy disables refresh', () => {
    expect(parseExternalSourcesPolicy(undefined).mode).toBe('off');
    expect(parseExternalSourcesPolicy({ version: 1, mode: 'off' }).mode).toBe('off');
    expect(() => parseExternalSourcesPolicy({ version: 1, mode: 'off', github: {} })).toThrow('fields are invalid');
  });

  test('requires an explicit enabled bounded manual GitHub adapter and one closed selection mode', () => {
    const manual = requireManualGithubPolicy(parseExternalSourcesPolicy({
      version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: ['ready'], assignees_any: ['alice'] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1, max_total_bytes: 1, deadline_ms: 1 } },
    }));
    expect(manual.github.repository).toBe('acme/widgets');
    expect(() => parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: [], assignees_any: [] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1, max_total_bytes: 1, deadline_ms: 1 } } })).toThrow('must not be empty');
    expect(() => parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: { enabled: false, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: ['ready'], assignees_any: [] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1, max_total_bytes: 1, deadline_ms: 1 } } })).toThrow('must be true');
  });

  test('accepts an exact sorted Issue batch and rejects ambiguous or unbounded batches', () => {
    const manual = requireManualGithubPolicy(parseExternalSourcesPolicy({
      version: 1, mode: 'manual', github: { enabled: true, repository: 'Ancienttwo/byok-sdk', selection: { kind: 'issue_numbers', issue_numbers: [102, 103, 104, 105, 106, 107, 108, 109, 110, 111] }, limits: { max_pages: 1, max_issues: 10, max_body_bytes: 32768, max_total_bytes: 524288, deadline_ms: 30000 } },
    }));
    expect(manual.github.selection).toEqual({ kind: 'issue_numbers', issue_numbers: [102, 103, 104, 105, 106, 107, 108, 109, 110, 111] });
    expect(() => parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [2, 1] }, limits: { max_pages: 1, max_issues: 2, max_body_bytes: 1, max_total_bytes: 1, deadline_ms: 1 } } })).toThrow('sorted and unique');
    expect(() => parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [1, 2] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1, max_total_bytes: 1, deadline_ms: 1 } } })).toThrow('exceeds limits.max_issues');
  });
});

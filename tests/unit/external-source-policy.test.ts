import { describe, expect, test } from 'bun:test';

import { parseExternalSourcesPolicy, requireManualGithubPolicy } from '../../src/effects/external-sources/policy';

describe('external source policy', () => {
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

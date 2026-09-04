import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import {
  parseDevelopmentCampaignPolicy,
  readDevelopmentCampaignPolicyAtRevision,
  requireDevelopmentCampaignStartPolicy,
} from '../../src/effects/automation/development-campaign-policy';

const fixtures: string[] = [];
afterEach(() => { while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true }); });

function policy(mode: 'off' | 'shadow' | 'active', externalMode: 'off' | 'manual' = 'manual') {
  const development_campaign = mode === 'off' ? { version: 1, mode } : { version: 1, mode, limits: { maximum_group_count: 3, maximum_issues_per_group: 10, maximum_parallel_tasks: 3 } };
  const external_sources = externalMode === 'off' ? { version: 1, mode: 'off' } : {
    version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [1] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1024, max_total_bytes: 4096, deadline_ms: 1000 } },
  };
  return { development_campaign, external_sources };
}

function repo(document: object): { root: string; revision: string } {
  const root = mkdtempSync(join(tmpdir(), 'development-campaign-policy-')); fixtures.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify(document)}\n`);
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  return { root, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
}

describe('development campaign target-base policy', () => {
  test('defaults absent policy to the closed off state', () => {
    expect(parseDevelopmentCampaignPolicy(undefined)).toEqual({ version: 1, mode: 'off' });
    expect(() => parseDevelopmentCampaignPolicy({ version: 1, mode: 'active' })).toThrow('fields are invalid');
  });

  test('reads the authorized revision instead of candidate working bytes', () => {
    const fixture = repo(policy('shadow'));
    writeFileSync(join(fixture.root, '.ai', 'harness', 'policy.json'), `${JSON.stringify(policy('active'))}\n`);
    expect(readDevelopmentCampaignPolicyAtRevision(fixture.root, fixture.revision).mode).toBe('shadow');
  });

  test('requires both campaign activation and external source intake at startup', () => {
    const disabled = repo(policy('off'));
    expect(() => requireDevelopmentCampaignStartPolicy(disabled.root, disabled.revision)).toThrow('development_campaign.mode is off');
    const noIntake = repo(policy('shadow', 'off'));
    expect(() => requireDevelopmentCampaignStartPolicy(noIntake.root, noIntake.revision)).toThrow('external_sources.mode must be enabled');
  });
});

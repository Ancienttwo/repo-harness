import { describe, expect, test, spyOn } from 'bun:test';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildExternalSourceCommand } from '../../src/cli/commands/external-source';
import { buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { writeProviderIssueObservation, listExternalSourceBindingReceipts } from '../../src/effects/external-sources/store';
import * as registry from '../../src/effects/repo-registry';
import * as admissionSource from '../../src/effects/admission/admission-source';
import { externalSourceBindingFixture } from '../helpers/external-source-binding-fixture';

describe('external-source binding CLI contract', () => {
  test('requires an explicit admitted session and keeps historical reads separate', () => {
    const command = buildExternalSourceCommand();
    const bind = command.commands.find(candidate => candidate.name() === 'bind');
    expect(bind).toBeDefined();
    expect(bind!.options.map(option => option.long)).toEqual(['--repo', '--source-revision', '--session', '--format']);
    for (const name of ['refresh', 'list', 'bindings', 'historical-bindings', 'context'])
      expect(command.commands.find(candidate => candidate.name() === name)).toBeDefined();
  });
  test('binds immutable provider evidence to a real admitted session without a Sprint', async () => {
    const f = await externalSourceBindingFixture();
    const source = spyOn(admissionSource, 'readReviewAdmissionSource').mockReturnValue(f.source.authority.source);
    const repos = spyOn(registry, 'readRepoHarnessRegistryStrictSnapshot').mockReturnValue({
      registryPath: '/fixture/registry', registryRevision: `sha256:${'d'.repeat(64)}`, authorizationRevision: 9,
      repos: [{ id: f.repoId, path: f.root, accessMode: 'read_write', source: 'manual', registeredAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z' }],
    });
    let stdout = '', stderr = '';
    const out = spyOn(process.stdout, 'write').mockImplementation((chunk: any) => { stdout += String(chunk); return true; });
    const err = spyOn(process.stderr, 'write').mockImplementation((chunk: any) => { stderr += String(chunk); return true; });
    const previous = process.exitCode;
    try {
      const observation = buildProviderIssueObservation({ registered_repository_id: f.repoId, provider: 'github', provider_host: 'github.com',
        provider_repository_id: '101', provider_issue_id: '202', display_ref: 'acme/widgets#903', url: 'https://github.com/acme/widgets/issues/903',
        observed_at: '2026-09-01T00:00:00Z', provider_created_at: null, provider_updated_at: null, state: 'open', title: 'issue', body: 'untrusted request',
        labels: [], assignees: [], comments_policy: 'omitted', policy_revision: `sha256:${'a'.repeat(64)}`, eligible: true, eligibility_reasons: [] });
      writeProviderIssueObservation(f.root, observation);
      const file = join(f.directory, 'selector.json'); writeFileSync(file, JSON.stringify(f.session));
      process.exitCode = 0;
      await buildExternalSourceCommand().parseAsync(['bun', 'external-source', 'bind', '--repo', f.repoId,
        '--source-revision', observation.source_revision, '--session', file, '--format', 'json']);
      expect(process.exitCode, stderr).toBe(0);
      const receipt = JSON.parse(stdout);
      expect(receipt.session).toEqual(f.session);
      expect(receipt.admission_sha256).toBe(f.admission.approval.admission_sha256);
      expect(listExternalSourceBindingReceipts(f.root)).toEqual([receipt]);
      stdout = ''; stderr = '';
      await buildExternalSourceCommand().parseAsync(['bun', 'external-source', 'bindings', '--repo', f.repoId, '--format', 'json']);
      expect(process.exitCode, stderr).toBe(0);
      expect(JSON.parse(stdout).bindings[0].attention).toBe('none');
      stdout = '';
      await buildExternalSourceCommand().parseAsync(['bun', 'external-source', 'historical-bindings', '--repo', f.repoId, '--format', 'json']);
      expect(JSON.parse(stdout).bindings).toEqual([]);
    } finally { process.exitCode = previous; out.mockRestore(); err.mockRestore(); source.mockRestore(); repos.mockRestore(); rmSync(f.directory, { recursive: true, force: true }); }
  });
});

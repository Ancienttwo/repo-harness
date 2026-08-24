import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { canonicalEngineerPrincipalMappingBytes, EngineerPrincipalError } from '../../src/core/engineers/principal-claim';
import { engineerSha256, type EngineerBindingV1 } from '../../src/core/engineers/profile-binding';
import {
  enrollEngineerPrincipal,
  listEngineerPrincipalMappings,
  readEngineerPrincipalMapping,
  revokeEngineerPrincipal,
} from '../../src/effects/engineers/principal-store';

const roots: string[] = [];
const repositoryId = 'repo_0123456789abcdef';
const authorizationId = '22222222-2222-4222-8222-222222222222';
const binding: EngineerBindingV1 = {
  protocol: 1,
  kind: 'repo-harness-engineer-binding',
  binding_id: '11111111-1111-4111-8111-111111111111',
  engineer_id: 'engineer:capability.verification.evals-checks',
  binding_generation: 1,
  provider: 'codex',
  provider_thread_id: 'thread-1',
  host_id: 'local',
  engineer_contract_revision: engineerSha256('contract-v1'),
  state: 'active',
  previous_binding_id: null,
  bound_at: '2026-08-25T00:00:00.000Z',
  retired_at: null,
};

function environment(): NodeJS.ProcessEnv {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me0b-principal-store-')));
  roots.push(root);
  return { ...process.env, REPO_HARNESS_HOME: root };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-0B principal mapping store', () => {
  test('publishes canonical mode-0600 bytes and is byte-idempotent', () => {
    const env = environment();
    const first = enrollEngineerPrincipal({ repository_id: repositoryId, authorization_id: authorizationId, binding, created_at: '2026-08-25T00:00:00.000Z', env });
    const retry = enrollEngineerPrincipal({ repository_id: repositoryId, authorization_id: authorizationId, binding, created_at: '2030-01-01T00:00:00.000Z', env });
    expect(retry).toEqual(first);
    expect(readEngineerPrincipalMapping(repositoryId, authorizationId, env)).toEqual(first);
    expect(listEngineerPrincipalMappings(env)).toEqual([first]);
    const file = join(env.REPO_HARNESS_HOME!, 'engineer-principals/v1', readdirSync(join(env.REPO_HARNESS_HOME!, 'engineer-principals/v1')).find((name) => name.endsWith('.json'))!);
    expect(lstatSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toBe(canonicalEngineerPrincipalMappingBytes(first));
  });

  test('rejects reassignment, revokes idempotently, and fails closed on corrupt bytes', () => {
    const env = environment();
    enrollEngineerPrincipal({ repository_id: repositoryId, authorization_id: authorizationId, binding, env });
    expect(() => enrollEngineerPrincipal({
      repository_id: repositoryId,
      authorization_id: authorizationId,
      binding: { ...binding, binding_id: '33333333-3333-4333-8333-333333333333', binding_generation: 2 },
      env,
    })).toThrow(EngineerPrincipalError);
    const revoked = revokeEngineerPrincipal(repositoryId, authorizationId, { revoked_at: '2026-08-25T01:00:00.000Z', env });
    expect(revokeEngineerPrincipal(repositoryId, authorizationId, { revoked_at: '2030-01-01T00:00:00.000Z', env })).toEqual(revoked);
    const root = join(env.REPO_HARNESS_HOME!, 'engineer-principals/v1');
    const file = join(root, readdirSync(root).find((name) => name.endsWith('.json'))!);
    writeFileSync(file, '{}');
    expect(() => readEngineerPrincipalMapping(repositoryId, authorizationId, env)).toThrow('principal mapping keys are invalid');
  });

  test('rejects a symlinked principal-store ancestor before publishing mapping bytes', () => {
    const env = environment();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me0b-principal-store-outside-')));
    roots.push(outside);
    symlinkSync(outside, join(env.REPO_HARNESS_HOME!, 'engineer-principals'));

    expect(() => enrollEngineerPrincipal({
      repository_id: repositoryId,
      authorization_id: authorizationId,
      binding,
      env,
    })).toThrow('unsafe lock ancestor');
    expect(readdirSync(outside)).toEqual([]);
  });
});

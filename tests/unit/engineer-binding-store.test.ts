import { seedEngineerBinding, type SeedEngineerBindingInput } from '../helpers/engineer-state-fixture';
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  EngineerProfileBindingError,
  canonicalEngineerBindingCurrentBytes,
  engineerSha256,
} from '../../src/core/engineers/profile-binding';
import { engineerBindingStoreRoot, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';

const engineerId = 'engineer:capability.verification.evals-checks';
const revision = engineerSha256('contract-v1');
const tempRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-engineer-store-'));
  tempRoots.push(root);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['config', 'user.name', 'Tests']);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-qm', 'fixture']);
  return root;
}

function baseInput(overrides: Partial<SeedEngineerBindingInput> = {}): SeedEngineerBindingInput {
  return {
    engineer_id: engineerId,
    idempotency_key: 'bind-1',
    provider: 'codex',
    provider_thread_id: 'thread-1',
    host_id: 'local',
    engineer_contract_revision: revision,
    expected_current_digest: null,
    expected_binding_generation: 0,
    expected_binding_id: null,
    expected_engineer_contract_revision: revision,
    now: () => '2026-08-24T12:00:00.000Z',
    binding_id: () => '11111111-1111-4111-8111-111111111111',
    ...overrides,
  };
}

function errorCode(run: () => unknown): string {
  try {
    run();
    return 'none';
  } catch (error) {
    return error instanceof EngineerProfileBindingError ? error.code : String(error);
  }
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('retained Engineer binding reads', () => {
  test('an absent store returns genesis without creating files', () => {
    const root = repository();
    const status = readEngineerBindingStatus(root, engineerId, revision);
    expect(status.genesis).toBe(true);
    expect(status.binding).toBeNull();
    expect(status.current.binding_generation).toBe(0);
    expect(existsSync(engineerBindingStoreRoot(root))).toBe(false);
  });

  test('a missing current event stays corrupt and is not repaired', () => {
    const root = repository();
    const current = seedEngineerBinding(root, baseInput());
    const store = engineerBindingStoreRoot(root);
    const key = readdirSync(store)[0]!;
    const event = join(store, key, 'events', `${current.current_transition_id!.slice(7)}.json`);
    const before = readFileSync(join(store, key, 'current.json'), 'utf8');
    unlinkSync(event);
    expect(errorCode(() => readEngineerBindingStatus(root, engineerId, revision))).toBe('binding_state_corrupt');
    expect(existsSync(event)).toBe(false);
    expect(readFileSync(join(store, key, 'current.json'), 'utf8')).toBe(before);
  });

  test('all linked worktrees read the exact same current bytes', () => {
    const root = repository();
    const linked = `${root}-linked`;
    tempRoots.push(linked);
    git(root, ['worktree', 'add', '-q', '-b', 'linked-test', linked]);
    const current = seedEngineerBinding(root, baseInput());
    const fromLinked = readEngineerBindingStatus(linked, engineerId, revision).current;
    expect(engineerBindingStoreRoot(linked)).toBe(engineerBindingStoreRoot(root));
    expect(canonicalEngineerBindingCurrentBytes(fromLinked)).toBe(canonicalEngineerBindingCurrentBytes(current));
  });

  test('symlinked binding authority fails closed', () => {
    const root = repository();
    seedEngineerBinding(root, baseInput());
    const store = engineerBindingStoreRoot(root);
    const engineerDir = readdirSync(store).find((entry) => entry !== 'locks')!;
    const currentPath = join(store, engineerDir, 'current.json');
    unlinkSync(currentPath);
    symlinkSync(join(root, 'README.md'), currentPath);
    expect(errorCode(() => readEngineerBindingStatus(root, engineerId, revision))).toBe('unsafe_engineer_path');
  });

});

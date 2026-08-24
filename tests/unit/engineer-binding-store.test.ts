import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

import { EngineerProfileBindingError, canonicalEngineerBindingCurrentBytes, engineerSha256 } from '../../src/core/engineers/profile-binding';
import {
  bindEngineer,
  engineerBindingStoreRoot,
  readEngineerBindingStatus,
  retireEngineer,
  type BindEngineerInput,
} from '../../src/effects/engineers/binding-store';

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

function baseInput(overrides: Partial<BindEngineerInput> = {}): BindEngineerInput {
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

function storeEvents(root: string): string[] {
  const store = engineerBindingStoreRoot(root);
  const engineerDirs = readdirSync(store).filter((entry) => entry !== 'locks');
  return readdirSync(join(store, engineerDirs[0], 'events')).filter((entry) => entry.endsWith('.json'));
}

function treeDigest(path: string): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else files.push(`${target.slice(path.length)}\0${readFileSync(target, 'hex')}`);
    }
  };
  walk(path);
  return createHash('sha256').update(files.join('\n')).digest('hex');
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('Engineer binding shared store', () => {
  test('publishes one immutable transition and resumes byte-identically', () => {
    const root = repository();
    const genesis = readEngineerBindingStatus(root, engineerId, revision);
    expect(genesis.genesis).toBe(true);
    expect(genesis.current.binding_generation).toBe(0);

    const first = bindEngineer(root, baseInput());
    const retry = bindEngineer(root, baseInput({
      now: () => '2030-01-01T00:00:00.000Z',
      binding_id: () => '22222222-2222-4222-8222-222222222222',
    }));
    expect(canonicalEngineerBindingCurrentBytes(retry)).toBe(canonicalEngineerBindingCurrentBytes(first));
    expect(storeEvents(root)).toHaveLength(1);
    expect(errorCode(() => bindEngineer(root, baseInput({ provider_thread_id: 'changed' })))).toBe('idempotency_conflict');
  });

  test('has one deterministic result at every approved crash boundary', () => {
    for (const boundary of ['before_event', 'after_event_fsync', 'after_current_fsync'] as const) {
      const root = repository();
      expect(() => bindEngineer(root, baseInput({
        idempotency_key: `crash-${boundary}`,
        crash_hook: (seen) => {
          if (seen === boundary) throw new Error(`crash:${boundary}`);
        },
      }))).toThrow(`crash:${boundary}`);
      if (boundary === 'after_event_fsync') {
        expect(errorCode(() => readEngineerBindingStatus(root, engineerId, revision))).toBe('binding_state_corrupt');
      }
      if (boundary === 'before_event') {
        expect(readEngineerBindingStatus(root, engineerId, revision).genesis).toBe(true);
      }
      const recovered = bindEngineer(root, baseInput({ idempotency_key: `crash-${boundary}` }));
      expect(recovered.binding_generation).toBe(1);
      expect(storeEvents(root)).toHaveLength(1);
    }
  });

  test('resumes a frozen event when only the server-derived Profile revision changed', () => {
    const root = repository();
    expect(() => bindEngineer(root, baseInput({
      idempotency_key: 'crash-derived-revision',
      crash_hook: (boundary) => {
        if (boundary === 'after_event_fsync') throw new Error('crash:after_event_fsync');
      },
    }))).toThrow('crash:after_event_fsync');

    const revisionV2 = engineerSha256('contract-v2');
    const recovered = bindEngineer(root, baseInput({
      idempotency_key: 'crash-derived-revision',
      engineer_contract_revision: revisionV2,
    }));
    expect(recovered.engineer_contract_revision).toBe(revision);
    expect(storeEvents(root)).toHaveLength(1);
    expect(errorCode(() => bindEngineer(root, baseInput({
      idempotency_key: 'crash-derived-revision',
      engineer_contract_revision: revisionV2,
      provider_thread_id: 'different-client-input',
    })))).toBe('idempotency_conflict');
  });

  test('retire and rebind preserve binding lineage and never touch Lease bytes', () => {
    const root = repository();
    const common = resolve(root, git(root, ['rev-parse', '--git-common-dir']));
    const leaseRoot = join(common, 'repo-harness/coordination/v1/leases/sentinel');
    mkdirSync(leaseRoot, { recursive: true });
    writeFileSync(join(leaseRoot, 'owner.json'), '{"sentinel":true}');
    const beforeLease = treeDigest(join(common, 'repo-harness/coordination'));

    const active = bindEngineer(root, baseInput());
    const retired = retireEngineer(root, {
      engineer_id: engineerId,
      idempotency_key: 'retire-1',
      expected_current_digest: active.current_digest,
      expected_binding_generation: 1,
      expected_binding_id: active.current_binding_id!,
      expected_engineer_contract_revision: revision,
      now: () => '2026-08-24T13:00:00.000Z',
    });
    expect(retired.state).toBe('retired');
    expect(retired.binding_generation).toBe(1);
    const rebound = bindEngineer(root, baseInput({
      idempotency_key: 'bind-2',
      expected_current_digest: retired.current_digest,
      expected_binding_generation: 1,
      expected_binding_id: retired.current_binding_id,
      binding_id: () => '22222222-2222-4222-8222-222222222222',
    }));
    expect(rebound.binding_generation).toBe(2);
    expect(rebound.current_binding_id).not.toBe(active.current_binding_id);
    expect(treeDigest(join(common, 'repo-harness/coordination'))).toBe(beforeLease);
  });

  test('replace event atomically retires the previous binding and publishes the next generation', () => {
    const root = repository();
    const first = bindEngineer(root, baseInput());
    const replaced = bindEngineer(root, baseInput({
      idempotency_key: 'replace-1',
      expected_current_digest: first.current_digest,
      expected_binding_generation: first.binding_generation,
      expected_binding_id: first.current_binding_id,
      binding_id: () => '22222222-2222-4222-8222-222222222222',
      now: () => '2026-08-24T13:00:00.000Z',
    }));
    const status = readEngineerBindingStatus(root, engineerId, revision);
    expect(replaced.binding_generation).toBe(2);
    expect(replaced.current_binding_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(status.event?.transition).toBe('replace');
    expect(status.event?.previous_binding_id).toBe(first.current_binding_id);
    expect(status.event?.created_at).toBe('2026-08-24T13:00:00.000Z');
    expect(status.binding?.state).toBe('active');
    expect(storeEvents(root)).toHaveLength(2);
  });

  test('all linked worktrees read the exact same current bytes', () => {
    const root = repository();
    const linked = `${root}-linked`;
    tempRoots.push(linked);
    git(root, ['worktree', 'add', '-q', '-b', 'linked-test', linked]);
    const current = bindEngineer(root, baseInput());
    const fromLinked = readEngineerBindingStatus(linked, engineerId, revision).current;
    expect(engineerBindingStoreRoot(linked)).toBe(engineerBindingStoreRoot(root));
    expect(canonicalEngineerBindingCurrentBytes(fromLinked)).toBe(canonicalEngineerBindingCurrentBytes(current));
  });

  test('stale contract fences and symlinked authority fail closed', () => {
    const root = repository();
    const active = bindEngineer(root, baseInput());
    const revisionV2 = engineerSha256('contract-v2');
    expect(errorCode(() => bindEngineer(root, baseInput({
      idempotency_key: 'replace-with-stale-contract',
      engineer_contract_revision: revisionV2,
      expected_current_digest: active.current_digest,
      expected_binding_generation: 1,
      expected_binding_id: active.current_binding_id,
      expected_engineer_contract_revision: revisionV2,
    })))).toBe('binding_stale');

    const store = engineerBindingStoreRoot(root);
    const engineerDir = readdirSync(store).find((entry) => entry !== 'locks')!;
    const currentPath = join(store, engineerDir, 'current.json');
    unlinkSync(currentPath);
    symlinkSync(join(root, 'README.md'), currentPath);
    expect(errorCode(() => readEngineerBindingStatus(root, engineerId, revision))).toBe('unsafe_engineer_path');
  });

  test('an N-way linked-process bind race has one winner and no losing events', async () => {
    const root = repository();
    const modulePath = resolve(process.cwd(), 'src/effects/engineers/binding-store.ts');
    const corePath = resolve(process.cwd(), 'src/core/engineers/profile-binding.ts');
    const script = `
      import { bindEngineer } from ${JSON.stringify(modulePath)};
      import { EngineerProfileBindingError } from ${JSON.stringify(corePath)};
      const [root, key, revision] = process.argv.slice(1);
      try {
        const current = bindEngineer(root, {
          engineer_id: ${JSON.stringify(engineerId)}, idempotency_key: key,
          provider: 'codex', provider_thread_id: key, host_id: 'local',
          engineer_contract_revision: revision, expected_current_digest: null,
          expected_binding_generation: 0, expected_binding_id: null,
          expected_engineer_contract_revision: revision,
        });
        console.log(JSON.stringify({ok:true,digest:current.current_digest}));
      } catch (error) {
        console.log(JSON.stringify({ok:false,error:error instanceof EngineerProfileBindingError ? error.code : String(error)}));
      }
    `;
    const children = Array.from({ length: 8 }, (_, index) => Bun.spawn([
      process.execPath,
      '-e',
      script,
      '--',
      root,
      `race-${index}`,
      revision,
    ], { stdout: 'pipe', stderr: 'pipe' }));
    const outputs = await Promise.all(children.map(async (child) => {
      const output = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      await child.exited;
      if (stderr) throw new Error(stderr);
      return JSON.parse(output.trim()) as { ok: boolean; error?: string };
    }));
    expect(outputs.filter((item) => item.ok)).toHaveLength(1);
    expect(outputs.filter((item) => item.error === 'binding_stale')).toHaveLength(7);
    expect(storeEvents(root)).toHaveLength(1);
  });

  test('reclaims an old lock owned by a terminated process before retrying', async () => {
    const root = repository();
    const child = Bun.spawn([process.execPath, '-e', 'process.exit(0)']);
    await child.exited;
    const store = engineerBindingStoreRoot(root);
    const key = createHash('sha256').update(Buffer.from(engineerId, 'utf8')).digest('hex');
    const lockPath = join(store, 'locks', `${key}.lock`);
    mkdirSync(lockPath, { recursive: true });
    const createdAt = Date.now() - 60_000;
    const token = `${child.pid}-${createdAt}-00000000-0000-4000-8000-000000000001`;
    writeFileSync(join(lockPath, `${token}.json`), `${JSON.stringify({ pid: child.pid, created_at: createdAt, token })}\n`);

    const current = bindEngineer(root, baseInput({ lock_wait_timeout_ms: 500 }));
    expect(current.binding_generation).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
  });

  test('reclaims an old empty lock abandoned before owner publication', async () => {
    const root = repository();
    const store = engineerBindingStoreRoot(root);
    const key = createHash('sha256').update(Buffer.from(engineerId, 'utf8')).digest('hex');
    const lockPath = join(store, 'locks', `${key}.lock`);
    const child = Bun.spawn([
      process.execPath,
      '-e',
      'require("fs").mkdirSync(process.argv[1], { recursive: true })',
      '--',
      lockPath,
    ], { stderr: 'pipe' });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(0);
    expect(stderr).toBe('');
    const staleAt = new Date(Date.now() - 60_000);
    utimesSync(lockPath, staleAt, staleAt);

    const current = bindEngineer(root, baseInput({ lock_wait_timeout_ms: 500 }));
    expect(current.binding_generation).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
  });
});

#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ME2B_CANARY_SCHEMA = 'repo-harness.me2b-runtime-admission-canary/v1' as const;

export interface Me2bRuntimeObservationV1 {
  readonly read_only_worktree_mutation_denied: boolean;
  readonly workspace_write_worktree_mutation_admitted: boolean;
  readonly parent_mutation_before_revocation: boolean;
  readonly parent_mutation_after_revocation: boolean;
  readonly parent_control_alive_after_revocation: boolean;
  readonly dynamic_parent_revocation: 'observed' | 'unavailable';
  readonly child_principal_at_effect: 'observed' | 'unavailable';
}

export interface Me2bRuntimeDecisionV1 {
  readonly decision: 'admitted' | 'runtime_not_admitted';
  readonly reasons: readonly string[];
}

export interface Me2bRuntimeCanaryV1 {
  readonly schema_version: typeof ME2B_CANARY_SCHEMA;
  readonly runtime: {
    readonly executable_realpath: string;
    readonly executable_sha256: `sha256:${string}`;
    readonly version: string;
    readonly sandbox_help_sha256: `sha256:${string}`;
  };
  readonly controls: {
    readonly read_only_exit_code: number;
    readonly read_only_stderr_sha256: `sha256:${string}`;
    readonly read_only_stderr_excerpt: string;
    readonly workspace_write_exit_code: number;
    readonly workspace_write_stderr_sha256: `sha256:${string}`;
    readonly workspace_write_stderr_excerpt: string;
    readonly managed_parent_exit_code: number | null;
    readonly managed_parent_stderr_sha256: `sha256:${string}`;
    readonly managed_parent_stderr_excerpt: string;
  };
  readonly observation: Me2bRuntimeObservationV1;
  readonly decision: Me2bRuntimeDecisionV1;
}

export function classifyMe2bRuntimeObservation(observation: Me2bRuntimeObservationV1): Me2bRuntimeDecisionV1 {
  const reasons: string[] = [];
  if (!observation.read_only_worktree_mutation_denied) reasons.push('read_only_control_failed');
  if (!observation.workspace_write_worktree_mutation_admitted) reasons.push('workspace_write_control_failed');
  if (!observation.parent_mutation_before_revocation) reasons.push('parent_writer_control_failed');
  if (observation.dynamic_parent_revocation !== 'observed') reasons.push('dynamic_parent_revocation_unavailable');
  if (observation.parent_mutation_after_revocation) reasons.push('parent_write_survived_revocation');
  if (!observation.parent_control_alive_after_revocation) reasons.push('parent_control_not_preserved');
  if (observation.child_principal_at_effect !== 'observed') reasons.push('child_principal_at_effect_unavailable');
  return Object.freeze({
    decision: reasons.length === 0 ? 'admitted' : 'runtime_not_admitted',
    reasons: Object.freeze(reasons),
  });
}

export function codexSandboxCommand(
  executable: string,
  profile: ':read-only' | ':workspace',
  repoRoot: string,
  command: readonly string[],
): readonly string[] {
  return Object.freeze([
    executable,
    'sandbox',
    '--permission-profile',
    profile,
    '--include-managed-config',
    '--cd',
    repoRoot,
    ...command,
  ]);
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function run(argv: readonly string[]): { readonly exitCode: number; readonly stdout: Uint8Array; readonly stderr: Uint8Array } {
  const result = Bun.spawnSync([...argv], { stdout: 'pipe', stderr: 'pipe' });
  return Object.freeze({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
}

function boundedExcerpt(bytes: Uint8Array, fixtureRoot: string): string {
  const home = process.env.HOME;
  let value = Buffer.from(bytes).toString('utf8').replaceAll(fixtureRoot, '<fixture>');
  if (home) value = value.replaceAll(home, '<home>');
  return value.trim().slice(0, 1_000);
}

async function waitFor(path: string, process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    if (process.exitCode !== null) return false;
    await Bun.sleep(25);
  }
  return existsSync(path);
}

export async function runMe2bRuntimeCanary(): Promise<Me2bRuntimeCanaryV1> {
  const discovered = Bun.which('codex');
  if (!discovered) throw new Error('codex executable is unavailable');
  const executable = realpathSync(discovered);
  const versionProbe = run([executable, '--version']);
  if (versionProbe.exitCode !== 0) throw new Error('codex version probe failed');
  const version = Buffer.from(versionProbe.stdout).toString('utf8').trim();
  const helpProbe = run([executable, 'sandbox', '--help']);
  if (helpProbe.exitCode !== 0) throw new Error('codex sandbox help probe failed');

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-me2b-canary-'));
  try {
    const init = run(['/usr/bin/git', 'init', '--quiet', fixtureRoot]);
    if (init.exitCode !== 0) throw new Error('disposable Git fixture initialization failed');

    const readOnlySentinel = join(fixtureRoot, 'read-only-sentinel');
    const readOnly = run(codexSandboxCommand(executable, ':read-only', fixtureRoot, ['/usr/bin/touch', '--', readOnlySentinel]));
    const readOnlyDenied = readOnly.exitCode !== 0 && !existsSync(readOnlySentinel);

    const workspaceSentinel = join(fixtureRoot, 'workspace-write-sentinel');
    const workspaceWrite = run(codexSandboxCommand(executable, ':workspace', fixtureRoot, ['/usr/bin/touch', '--', workspaceSentinel]));
    const workspaceWriteAdmitted = workspaceWrite.exitCode === 0 && existsSync(workspaceSentinel);

    const probeScript = join(fixtureRoot, 'managed-parent-probe.sh');
    const before = join(fixtureRoot, 'parent-before-revocation');
    const revokeCheckpoint = join(fixtureRoot, 'host-revocation-checkpoint');
    const after = join(fixtureRoot, 'parent-after-revocation');
    writeFileSync(probeScript, '#!/bin/sh\nset -eu\ntouch -- "$1"\nwhile [ ! -e "$2" ]; do sleep 0.025; done\ntouch -- "$3"\n', { mode: 0o700 });
    chmodSync(probeScript, 0o700);
    const parentArgv = codexSandboxCommand(executable, ':workspace', fixtureRoot, [probeScript, before, revokeCheckpoint, after]);
    const parent = Bun.spawn([...parentArgv], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const parentBefore = await waitFor(before, parent, 5_000);
    writeFileSync(revokeCheckpoint, 'revoked\n', { mode: 0o600 });
    const parentAfter = await waitFor(after, parent, 5_000);
    let parentExitCode = await Promise.race([parent.exited, Bun.sleep(5_000).then(() => null)]);
    if (parentExitCode === null) {
      parent.kill();
      parentExitCode = await parent.exited;
    }
    const parentStderr = new Uint8Array(await new Response(parent.stderr).arrayBuffer());

    const observation: Me2bRuntimeObservationV1 = Object.freeze({
      read_only_worktree_mutation_denied: readOnlyDenied,
      workspace_write_worktree_mutation_admitted: workspaceWriteAdmitted,
      parent_mutation_before_revocation: parentBefore,
      parent_mutation_after_revocation: parentAfter,
      parent_control_alive_after_revocation: parentAfter,
      dynamic_parent_revocation: 'unavailable',
      child_principal_at_effect: 'unavailable',
    });
    return Object.freeze({
      schema_version: ME2B_CANARY_SCHEMA,
      runtime: Object.freeze({
        executable_realpath: executable,
        executable_sha256: sha256(readFileSync(executable)),
        version,
        sandbox_help_sha256: sha256(helpProbe.stdout),
      }),
      controls: Object.freeze({
        read_only_exit_code: readOnly.exitCode,
        read_only_stderr_sha256: sha256(readOnly.stderr),
        read_only_stderr_excerpt: boundedExcerpt(readOnly.stderr, fixtureRoot),
        workspace_write_exit_code: workspaceWrite.exitCode,
        workspace_write_stderr_sha256: sha256(workspaceWrite.stderr),
        workspace_write_stderr_excerpt: boundedExcerpt(workspaceWrite.stderr, fixtureRoot),
        managed_parent_exit_code: parentExitCode,
        managed_parent_stderr_sha256: sha256(parentStderr),
        managed_parent_stderr_excerpt: boundedExcerpt(parentStderr, fixtureRoot),
      }),
      observation,
      decision: classifyMe2bRuntimeObservation(observation),
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const result = await runMe2bRuntimeCanary();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

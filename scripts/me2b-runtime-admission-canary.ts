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

export const ME2B_CANARY_SCHEMA = 'repo-harness.me2b-runtime-admission-canary/v2' as const;
const SUPPORTED_CODEX_VERSION = 'codex-cli 0.149.0';
const CODEX_LAUNCH_ONLY_ADAPTER = 'codex-cli-0.149.0-launch-only/v1';

type ProbeStatus = 'observed' | 'not_observed' | 'probe_unavailable';

export interface Me2bRuntimeObservationV2 {
  readonly read_only_worktree_mutation_denied: boolean;
  readonly workspace_write_worktree_mutation_admitted: boolean;
  readonly static_parent_mutation_before_checkpoint: boolean;
  readonly static_parent_mutation_after_checkpoint: boolean;
  readonly static_parent_control_alive_after_checkpoint: boolean;
  readonly dynamic_parent_revocation: ProbeStatus;
  readonly parent_mutation_after_revocation: boolean | null;
  readonly parent_control_alive_after_revocation: boolean | null;
  readonly child_principal_at_effect: ProbeStatus;
}

export interface Me2bRuntimeDecisionV2 {
  readonly decision: 'admitted' | 'runtime_not_admitted';
  readonly reasons: readonly string[];
}

export interface Me2bRuntimeControlsV2 {
  readonly read_only_exit_code: number;
  readonly read_only_signal_code: string | null;
  readonly read_only_stdout_sha256: `sha256:${string}`;
  readonly read_only_stderr_sha256: `sha256:${string}`;
  readonly read_only_stderr_excerpt: string;
  readonly read_only_worktree_before_sha256: `sha256:${string}`;
  readonly read_only_worktree_after_sha256: `sha256:${string}`;
  readonly workspace_write_exit_code: number;
  readonly workspace_write_signal_code: string | null;
  readonly workspace_write_stderr_sha256: `sha256:${string}`;
  readonly workspace_write_stderr_excerpt: string;
  readonly static_parent_exit_code: number | null;
  readonly static_parent_stderr_sha256: `sha256:${string}`;
  readonly static_parent_stderr_excerpt: string;
}

export interface Me2bRuntimeCanaryV2 {
  readonly schema_version: typeof ME2B_CANARY_SCHEMA;
  readonly runtime: {
    readonly executable_realpath: string;
    readonly executable_sha256: `sha256:${string}`;
    readonly version: string;
    readonly sandbox_help_sha256: `sha256:${string}`;
    readonly host_adapter: string;
  };
  readonly controls: Me2bRuntimeControlsV2;
  readonly observation: Me2bRuntimeObservationV2;
  readonly decision: Me2bRuntimeDecisionV2;
}

export interface Me2bRuntimeIdentityV2 {
  readonly executable_realpath: string;
  readonly executable_sha256: `sha256:${string}`;
  readonly version: string;
  readonly sandbox_help_sha256: `sha256:${string}`;
}

export interface Me2bHostProbeV2 {
  readonly id: string;
  probe(fixtureRoot: string, executable: string): Promise<{
    readonly controls: Me2bRuntimeControlsV2;
    readonly observation: Me2bRuntimeObservationV2;
  }>;
}

export interface Me2bRuntimeCanaryDependenciesV2 {
  readonly runtime: Me2bRuntimeIdentityV2;
  readonly host: Me2bHostProbeV2;
}

interface ProcessResult {
  readonly exitCode: number;
  readonly signalCode: string | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface ReadOnlyControlEvidence {
  readonly exitCode: number;
  readonly signalCode: string | null;
  readonly stdout: Uint8Array;
  readonly stderrExcerpt: string;
  readonly sentinelExists: boolean;
  readonly worktreeBefore: Uint8Array;
  readonly worktreeAfter: Uint8Array;
}

export function classifyMe2bRuntimeObservation(observation: Me2bRuntimeObservationV2): Me2bRuntimeDecisionV2 {
  const reasons: string[] = [];
  if (!observation.read_only_worktree_mutation_denied) reasons.push('read_only_control_failed');
  if (!observation.workspace_write_worktree_mutation_admitted) reasons.push('workspace_write_control_failed');
  if (!observation.static_parent_mutation_before_checkpoint) reasons.push('static_parent_writer_control_failed');
  if (!observation.static_parent_mutation_after_checkpoint
    || !observation.static_parent_control_alive_after_checkpoint) {
    reasons.push('static_parent_checkpoint_control_failed');
  }

  if (observation.dynamic_parent_revocation === 'probe_unavailable') {
    reasons.push('dynamic_parent_revocation_probe_unavailable');
  } else if (observation.dynamic_parent_revocation !== 'observed') {
    reasons.push('dynamic_parent_revocation_not_observed');
  } else {
    if (observation.parent_mutation_after_revocation === null) {
      reasons.push('post_revocation_mutation_evidence_missing');
    } else if (observation.parent_mutation_after_revocation) {
      reasons.push('parent_write_survived_revocation');
    }
    if (observation.parent_control_alive_after_revocation === null) {
      reasons.push('post_revocation_parent_control_evidence_missing');
    } else if (!observation.parent_control_alive_after_revocation) {
      reasons.push('parent_control_not_preserved');
    }
  }

  if (observation.child_principal_at_effect === 'probe_unavailable') {
    reasons.push('child_principal_at_effect_probe_unavailable');
  } else if (observation.child_principal_at_effect !== 'observed') {
    reasons.push('child_principal_at_effect_not_observed');
  }

  return Object.freeze({
    decision: reasons.length === 0 ? 'admitted' : 'runtime_not_admitted',
    reasons: Object.freeze(reasons),
  });
}

export function evaluateReadOnlySandboxControl(evidence: ReadOnlyControlEvidence): boolean {
  return evidence.exitCode === 1
    && evidence.signalCode === null
    && evidence.stdout.byteLength === 0
    && evidence.stderrExcerpt === 'touch: <fixture>/read-only-sentinel: Operation not permitted'
    && !evidence.sentinelExists
    && Buffer.from(evidence.worktreeBefore).equals(Buffer.from(evidence.worktreeAfter));
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

function run(argv: readonly string[]): ProcessResult {
  const result = Bun.spawnSync([...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5_000,
    killSignal: 'SIGKILL',
    maxBuffer: 1_048_576,
  });
  return Object.freeze({
    exitCode: result.exitCode,
    signalCode: result.signalCode ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function boundedExcerpt(bytes: Uint8Array, fixtureRoot: string): string {
  const home = process.env.HOME;
  let value = Buffer.from(bytes).toString('utf8').replaceAll(fixtureRoot, '<fixture>');
  if (home) value = value.replaceAll(home, '<home>');
  return value.trim().slice(0, 1_000);
}

function worktreeSnapshot(fixtureRoot: string): Uint8Array {
  const status = run(['/usr/bin/git', '-C', fixtureRoot, 'status', '--porcelain=v1', '--untracked-files=all']);
  if (status.exitCode !== 0 || status.signalCode !== null) throw new Error('disposable worktree snapshot failed');
  return status.stdout;
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

const codexLaunchOnlyHost: Me2bHostProbeV2 = Object.freeze({
  id: CODEX_LAUNCH_ONLY_ADAPTER,
  async probe(fixtureRoot: string, executable: string) {
    const readOnlySentinel = join(fixtureRoot, 'read-only-sentinel');
    const readOnlyBefore = worktreeSnapshot(fixtureRoot);
    const readOnly = run(codexSandboxCommand(executable, ':read-only', fixtureRoot, ['/usr/bin/touch', '--', readOnlySentinel]));
    const readOnlyAfter = worktreeSnapshot(fixtureRoot);
    const readOnlyStderrExcerpt = boundedExcerpt(readOnly.stderr, fixtureRoot);
    const readOnlyDenied = evaluateReadOnlySandboxControl({
      exitCode: readOnly.exitCode,
      signalCode: readOnly.signalCode,
      stdout: readOnly.stdout,
      stderrExcerpt: readOnlyStderrExcerpt,
      sentinelExists: existsSync(readOnlySentinel),
      worktreeBefore: readOnlyBefore,
      worktreeAfter: readOnlyAfter,
    });

    const workspaceSentinel = join(fixtureRoot, 'workspace-write-sentinel');
    const workspaceWrite = run(codexSandboxCommand(executable, ':workspace', fixtureRoot, ['/usr/bin/touch', '--', workspaceSentinel]));
    const workspaceWriteStderrExcerpt = boundedExcerpt(workspaceWrite.stderr, fixtureRoot);
    const workspaceWriteAdmitted = workspaceWrite.exitCode === 0
      && workspaceWrite.signalCode === null
      && workspaceWrite.stdout.byteLength === 0
      && workspaceWriteStderrExcerpt === ''
      && existsSync(workspaceSentinel);

    const probeScript = join(fixtureRoot, 'static-parent-probe.sh');
    const before = join(fixtureRoot, 'static-parent-before-checkpoint');
    const checkpoint = join(fixtureRoot, 'static-parent-checkpoint');
    const after = join(fixtureRoot, 'static-parent-after-checkpoint');
    writeFileSync(probeScript, '#!/bin/sh\nset -eu\ntouch -- "$1"\nwhile [ ! -e "$2" ]; do sleep 0.025; done\ntouch -- "$3"\n', { mode: 0o700 });
    chmodSync(probeScript, 0o700);
    const parentArgv = codexSandboxCommand(executable, ':workspace', fixtureRoot, [probeScript, before, checkpoint, after]);
    const parent = Bun.spawn([...parentArgv], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const parentBefore = await waitFor(before, parent, 5_000);
    writeFileSync(checkpoint, 'checkpoint\n', { mode: 0o600 });
    const parentAfter = await waitFor(after, parent, 5_000);
    let parentExitCode = await Promise.race([parent.exited, Bun.sleep(5_000).then(() => null)]);
    if (parentExitCode === null) {
      parent.kill();
      parentExitCode = await parent.exited;
    }
    const parentStderr = new Uint8Array(await new Response(parent.stderr).arrayBuffer());

    return Object.freeze({
      controls: Object.freeze({
        read_only_exit_code: readOnly.exitCode,
        read_only_signal_code: readOnly.signalCode,
        read_only_stdout_sha256: sha256(readOnly.stdout),
        read_only_stderr_sha256: sha256(readOnly.stderr),
        read_only_stderr_excerpt: readOnlyStderrExcerpt,
        read_only_worktree_before_sha256: sha256(readOnlyBefore),
        read_only_worktree_after_sha256: sha256(readOnlyAfter),
        workspace_write_exit_code: workspaceWrite.exitCode,
        workspace_write_signal_code: workspaceWrite.signalCode,
        workspace_write_stderr_sha256: sha256(workspaceWrite.stderr),
        workspace_write_stderr_excerpt: workspaceWriteStderrExcerpt,
        static_parent_exit_code: parentExitCode,
        static_parent_stderr_sha256: sha256(parentStderr),
        static_parent_stderr_excerpt: boundedExcerpt(parentStderr, fixtureRoot),
      }),
      observation: Object.freeze({
        read_only_worktree_mutation_denied: readOnlyDenied,
        workspace_write_worktree_mutation_admitted: workspaceWriteAdmitted,
        static_parent_mutation_before_checkpoint: parentBefore,
        static_parent_mutation_after_checkpoint: parentAfter,
        static_parent_control_alive_after_checkpoint: parentAfter,
        dynamic_parent_revocation: 'probe_unavailable',
        parent_mutation_after_revocation: null,
        parent_control_alive_after_revocation: null,
        child_principal_at_effect: 'probe_unavailable',
      }),
    });
  },
});

function discoverCodexRuntime(): Me2bRuntimeIdentityV2 {
  const discovered = Bun.which('codex');
  if (!discovered) throw new Error('codex executable is unavailable');
  const executable = realpathSync(discovered);
  const versionProbe = run([executable, '--version']);
  if (versionProbe.exitCode !== 0 || versionProbe.signalCode !== null) throw new Error('codex version probe failed');
  const version = Buffer.from(versionProbe.stdout).toString('utf8').trim();
  if (version !== SUPPORTED_CODEX_VERSION) {
    throw new Error(`no ME-2B Host probe adapter is registered for ${version || '<empty-version>'}`);
  }
  const helpProbe = run([executable, 'sandbox', '--help']);
  if (helpProbe.exitCode !== 0 || helpProbe.signalCode !== null) throw new Error('codex sandbox help probe failed');
  return Object.freeze({
    executable_realpath: executable,
    executable_sha256: sha256(readFileSync(executable)),
    version,
    sandbox_help_sha256: sha256(helpProbe.stdout),
  });
}

export async function runMe2bRuntimeCanary(
  dependencies?: Me2bRuntimeCanaryDependenciesV2,
): Promise<Me2bRuntimeCanaryV2> {
  const resolved = dependencies ?? Object.freeze({ runtime: discoverCodexRuntime(), host: codexLaunchOnlyHost });
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-me2b-canary-'));
  try {
    const init = run(['/usr/bin/git', 'init', '--quiet', fixtureRoot]);
    if (init.exitCode !== 0 || init.signalCode !== null) throw new Error('disposable Git fixture initialization failed');
    const probe = await resolved.host.probe(fixtureRoot, resolved.runtime.executable_realpath);
    return Object.freeze({
      schema_version: ME2B_CANARY_SCHEMA,
      runtime: Object.freeze({ ...resolved.runtime, host_adapter: resolved.host.id }),
      controls: probe.controls,
      observation: probe.observation,
      decision: classifyMe2bRuntimeObservation(probe.observation),
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

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AKN00_CAPABILITIES, AKN00_TOPOLOGY, buildInjectedNativeAdmissionReport,
  nativeAdmissionDigest, type NativeAdmissionSubject, type NativeAdmissionEvidence,
} from '../scripts/akn00-native-execution-admission';
import { ME2B_CANARY_SCHEMA, classifyMe2bRuntimeObservation } from '../scripts/me2b-runtime-admission-canary';

const hash = `sha256:${'a'.repeat(64)}` as const;
function completeEvidence() {
  const subject: NativeAdmissionSubject = {
    repository_root: '/test/repo', repository_revision: 'a'.repeat(40), topology: AKN00_TOPOLOGY,
    platform: 'darwin', arch: 'arm64', os_release: 'test', executable_requested: '/test/codex',
    runtime: { executable_realpath: '/test/codex', executable_sha256: hash, version: 'codex-cli 0.154.0', sandbox_help_sha256: hash },
    me2b_probe: { status: 'registered', adapter_id: 'codex-cli-0.149.0-launch-only/v1' },
    permission_profile_sha256: hash, host_api_revision: 'injected-test-only',
  };
  const observation = {
    read_only_worktree_mutation_denied: true, workspace_write_worktree_mutation_admitted: true,
    static_parent_mutation_before_checkpoint: true, static_parent_mutation_after_checkpoint: true,
    static_parent_control_alive_after_checkpoint: true, dynamic_parent_revocation: 'observed' as const,
    parent_mutation_after_revocation: false, parent_control_alive_after_revocation: true,
    child_principal_at_effect: 'observed' as const,
  };
  const subjectHash = nativeAdmissionDigest(subject);
  const evidence: NativeAdmissionEvidence = {
    subject_sha256: subjectHash,
    capabilities: Object.fromEntries(AKN00_CAPABILITIES.map(key => [key, {
      status: 'observed', subject_sha256: subjectHash, evidence_sha256: hash, reason: 'injected test observation',
    }])) as NativeAdmissionEvidence['capabilities'],
    me2b: {
      schema_version: ME2B_CANARY_SCHEMA,
      runtime: { ...subject.runtime, host_adapter: 'codex-cli-0.149.0-launch-only/v1' },
      controls: {
        read_only_exit_code: 1, read_only_signal_code: null, read_only_stdout_sha256: hash,
        read_only_stderr_sha256: hash, read_only_stderr_excerpt: 'test',
        read_only_worktree_before_sha256: hash, read_only_worktree_after_sha256: hash,
        workspace_write_exit_code: 0, workspace_write_signal_code: null,
        workspace_write_stderr_sha256: hash, workspace_write_stderr_excerpt: '',
        static_parent_exit_code: 0, static_parent_stderr_sha256: hash, static_parent_stderr_excerpt: '',
      },
      observation, decision: classifyMe2bRuntimeObservation(observation),
    },
  };
  return { subject, evidence };
}

describe('fixed native-path admission evidence', () => {
  test('even complete injected observations cannot admit a Host or evaluate Campaign integration', () => {
    const { subject, evidence } = completeEvidence();
    const result = buildInjectedNativeAdmissionReport(subject, evidence);
    expect(result.evidence_kind).toBe('injected_test');
    expect(result.decision).toEqual({ status: 'runtime_not_admitted', reasons: ['injected_evidence_not_admissible'] });
    expect(result.campaign_integration).toBe('not_evaluated');
    expect(result.me2b_ref?.sha256).toBe(nativeAdmissionDigest(evidence.me2b));
  });

  test.each(['topology', 'permission_profile_sha256', 'os_release'] as const)('rejects evidence after %s drift', key => {
    const { subject, evidence } = completeEvidence();
    const changed = { ...subject, [key]: key === 'permission_profile_sha256' ? `sha256:${'b'.repeat(64)}` : 'changed' };
    const result = buildInjectedNativeAdmissionReport(changed as NativeAdmissionSubject, evidence);
    expect(result.decision.reasons).toContain('evidence_subject_mismatch');
    expect(result.decision.reasons).toContain('terminal_inactive:evidence_invalid');
  });

  test('rejects older runtime, binary and help evidence instead of translating the receipt', () => {
    const { subject, evidence } = completeEvidence();
    const result = buildInjectedNativeAdmissionReport({ ...subject, runtime: {
      ...subject.runtime, version: 'codex-cli 0.149.0', executable_sha256: `sha256:${'b'.repeat(64)}`, sandbox_help_sha256: `sha256:${'c'.repeat(64)}`,
    } }, evidence);
    expect(result.decision.reasons).toContain('candidate_version_mismatch');
    expect(result.decision.reasons).toContain('me2b_executable_sha256_mismatch');
    expect(result.decision.reasons).toContain('me2b_sandbox_help_sha256_mismatch');
  });

  test('recomputes ME-2B denial even when a supplier claims admission', () => {
    const { subject, evidence } = completeEvidence();
    const me2b = { ...evidence.me2b!, observation: { ...evidence.me2b!.observation,
      dynamic_parent_revocation: 'probe_unavailable' as const, child_principal_at_effect: 'probe_unavailable' as const,
    } };
    const result = buildInjectedNativeAdmissionReport(subject, { ...evidence, me2b });
    expect(result.decision.reasons).toContain('me2b_decision_mismatch');
    expect(result.decision.reasons).toContain('me2b:dynamic_parent_revocation_probe_unavailable');
    expect(result.decision.reasons).toContain('me2b:child_principal_at_effect_probe_unavailable');
  });

  test.each(['terminal_inactive', 'effect_query', 'authority_store_protection', 'verifier_read_only', 'worker_path_isolation'] as const)('does not fill missing or negative %s evidence', capability => {
    const { subject, evidence } = completeEvidence();
    for (const status of ['not_observed', 'probe_unavailable'] as const) {
      const result = buildInjectedNativeAdmissionReport(subject, { ...evidence, capabilities: {
        ...evidence.capabilities, [capability]: { ...evidence.capabilities[capability], status, evidence_sha256: null },
      } });
      expect(result.decision.reasons).toContain(`${capability}:${status}`);
      expect(result.decision.status).toBe('runtime_not_admitted');
    }
  });
});

const script = resolve(import.meta.dir, '../scripts/akn00-native-execution-admission.ts');
function cliFixture(action: (fixture: { repo: string; home: string; env: NodeJS.ProcessEnv; root: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), 'akn00-cli-test-'));
  try {
    const repo = join(root, 'repo'), home = join(root, 'user-home'), bin = join(root, 'bin');
    for (const path of [repo, home, bin]) mkdirSync(path);
    const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home, CODEX_HOME: join(home, 'original-config'),
      // Bun initializes its transpiler before script code can isolate child HOME.
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      OPENAI_API_KEY: 'test-only-must-not-inherit', NODE_OPTIONS: '--no-warnings' };
    const init = Bun.spawnSync(['/usr/bin/git', 'init', '-q', '-b', 'main', repo], { env, stdout: 'pipe', stderr: 'pipe' });
    expect(init.exitCode).toBe(0);
    const commit = Bun.spawnSync(['/usr/bin/git', '-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { env, stdout: 'pipe', stderr: 'pipe' });
    expect(commit.exitCode).toBe(0);
    writeFileSync(join(repo, 'user-work.txt'), 'preserve me');
    writeFileSync(join(home, 'keep'), 'private config untouched');
    writeFileSync(join(bin, 'codex'), `#!/bin/sh
[ -z "$OPENAI_API_KEY" ] && [ -z "$NODE_OPTIONS" ] || exit 89
case "$HOME" in *repo-harness-akn00-*/home) ;; *) exit 88 ;; esac
printf '%s\\n' "$*" >> '${root}/calls'
printf '%s\\n' "$HOME" > '${root}/probe-home'
case "$*" in
  --version) echo 'codex-cli 0.154.0' ;;
  'sandbox --help') echo 'version-pinned fake inventory help' ;;
  *) exit 91 ;;
esac
`, { mode: 0o700 });
    action({ repo, home, env, root });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('native admission CLI isolated inventory', () => {
  test('exit 2 report refuses the unsupported candidate with only two inventory calls and no user-state writes', () => {
    cliFixture(({ repo, home, env, root }) => {
      const before = Bun.spawnSync(['/usr/bin/git', '-C', repo, 'status', '--porcelain=v1', '-uall'], { stdout: 'pipe' }).stdout;
      const homeBefore = readdirSync(home).sort();
      const result = Bun.spawnSync([process.execPath, script, '--repo', repo], { env, stdout: 'pipe', stderr: 'pipe', timeout: 20_000 });
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(2);
      const report = JSON.parse(result.stdout.toString());
      expect(report.evidence_kind).toBe('live_host');
      expect(report.decision.status).toBe('runtime_not_admitted');
      expect(report.decision.reasons).toContain('host_probe_not_registered');
      expect(report.me2b_ref).toBeNull();
      expect(report.campaign_integration).toBe('not_evaluated');
      expect(readFileSync(join(root, 'calls'), 'utf8')).toBe('--version\nsandbox --help\n');
      expect(existsSync(readFileSync(join(root, 'probe-home'), 'utf8').trim())).toBe(false);
      expect(readFileSync(join(repo, 'user-work.txt'), 'utf8')).toBe('preserve me');
      expect(readdirSync(home).sort()).toEqual(homeBefore);
      expect(readFileSync(join(home, 'keep'), 'utf8')).toBe('private config untouched');
      const after = Bun.spawnSync(['/usr/bin/git', '-C', repo, 'status', '--porcelain=v1', '-uall'], { stdout: 'pipe' }).stdout;
      expect(after).toEqual(before);
    });
  });

  test('a help failure yields no report and cleans the isolated probe HOME', () => {
    cliFixture(({ repo, env, root }) => {
      const executable = join(root, 'bin', 'codex');
      writeFileSync(executable, readFileSync(executable, 'utf8').replace("echo 'version-pinned fake inventory help'", 'exit 71'));
      const result = Bun.spawnSync([process.execPath, script, '--repo', repo], { env, stdout: 'pipe', stderr: 'pipe' });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.byteLength).toBe(0);
      expect(result.stderr.toString()).toContain('sandbox help probe failed');
      expect(existsSync(readFileSync(join(root, 'probe-home'), 'utf8').trim())).toBe(false);
    });
  });

  test('unsupported evidence flags are rejected before any Host command', () => {
    cliFixture(({ repo, env, root }) => {
      const result = Bun.spawnSync([process.execPath, script, '--repo', repo, '--evidence', 'forged.json'], { env, stdout: 'pipe', stderr: 'pipe' });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.byteLength).toBe(0);
      expect(existsSync(join(root, 'calls'))).toBe(false);
    });
  });

  test('bad repository is an input failure rather than a successful refusal report', () => {
    cliFixture(({ home, env, root }) => {
      const result = Bun.spawnSync([process.execPath, script, '--repo', home], { env, stdout: 'pipe', stderr: 'pipe' });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.byteLength).toBe(0);
      expect(existsSync(join(root, 'calls'))).toBe(false);
    });
  });
});

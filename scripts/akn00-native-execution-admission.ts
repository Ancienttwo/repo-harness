#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  classifyMe2bRuntimeObservation,
  discoverCodexRuntime,
  ME2B_CANARY_SCHEMA,
  type Me2bProbeSupport,
  type Me2bRuntimeCanaryV2,
  type Me2bRuntimeIdentityV2,
} from './me2b-runtime-admission-canary';

export const AKN00_SCHEMA = 'repo-harness.akn00-native-execution-admission/v1' as const;
export const AKN00_TOPOLOGY = 'codex-parent-delegated-writer-independent-readonly-verifier/v1' as const;
export const AKN00_CAPABILITIES = [
  'parent_revocation', 'parent_control', 'effect_principal_epoch',
  'worker_path_isolation', 'authority_store_protection', 'verifier_read_only',
  'terminal_inactive', 'effect_query', 'executable_closure',
] as const;
type Capability = typeof AKN00_CAPABILITIES[number];
type Sha256 = `sha256:${string}`;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export interface NativeAdmissionSubject {
  readonly repository_root: string;
  readonly repository_revision: string;
  readonly topology: string;
  readonly platform: string;
  readonly arch: string;
  readonly os_release: string;
  readonly executable_requested: string;
  readonly runtime: Me2bRuntimeIdentityV2;
  readonly me2b_probe: Me2bProbeSupport;
  readonly permission_profile_sha256: Sha256 | null;
  readonly host_api_revision: string | null;
}

export interface NativeCapabilityEvidence {
  readonly status: 'observed' | 'not_observed' | 'probe_unavailable';
  readonly subject_sha256: Sha256;
  readonly evidence_sha256: Sha256 | null;
  readonly reason: string;
}

export interface NativeAdmissionEvidence {
  readonly subject_sha256: Sha256;
  readonly me2b: Me2bRuntimeCanaryV2 | null;
  readonly capabilities: Readonly<Record<Capability, NativeCapabilityEvidence>>;
}

export function nativeAdmissionDigest(value: unknown): Sha256 {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Pure evidence evaluation; it does not authenticate the supplier or enable execution. */
function evaluate(subject: NativeAdmissionSubject, evidence: NativeAdmissionEvidence): readonly string[] {
  const reasons: string[] = [];
  const subjectHash = nativeAdmissionDigest(subject);
  if (!/^[0-9a-f]{40}$/.test(subject.repository_revision)) reasons.push('repository_revision_invalid');
  if (subject.topology !== AKN00_TOPOLOGY) reasons.push('topology_mismatch');
  if (subject.platform !== 'darwin' || subject.arch !== 'arm64') reasons.push('platform_not_supported');
  if (subject.runtime.version !== 'codex-cli 0.154.0') reasons.push('candidate_version_mismatch');
  if (!SHA256.test(subject.runtime.executable_sha256) || !SHA256.test(subject.runtime.sandbox_help_sha256)) {
    reasons.push('runtime_identity_incomplete');
  }
  if (!subject.permission_profile_sha256 || !SHA256.test(subject.permission_profile_sha256)) {
    reasons.push('permission_profile_unverified');
  }
  if (!subject.host_api_revision) reasons.push('host_api_unverified');
  if (subject.me2b_probe.status !== 'registered') reasons.push('host_probe_not_registered');
  if (evidence.subject_sha256 !== subjectHash) reasons.push('evidence_subject_mismatch');

  const me2b = evidence.me2b;
  if (!me2b) reasons.push('me2b_evidence_missing');
  else {
    if (me2b.schema_version !== ME2B_CANARY_SCHEMA) reasons.push('me2b_schema_mismatch');
    for (const key of ['executable_realpath', 'executable_sha256', 'version', 'sandbox_help_sha256'] as const) {
      if (me2b.runtime[key] !== subject.runtime[key]) reasons.push(`me2b_${key}_mismatch`);
    }
    if (me2b.runtime.host_adapter !== subject.me2b_probe.adapter_id) reasons.push('me2b_adapter_mismatch');
    // The original oracle owns these conditions; a supplied decision cannot override it.
    const decision = classifyMe2bRuntimeObservation(me2b.observation);
    if (nativeAdmissionDigest(decision) !== nativeAdmissionDigest(me2b.decision)) reasons.push('me2b_decision_mismatch');
    reasons.push(...decision.reasons.map(reason => `me2b:${reason}`));
  }
  for (const key of AKN00_CAPABILITIES) {
    const observation = evidence.capabilities[key];
    if (!observation || observation.status !== 'observed') {
      reasons.push(`${key}:${observation?.status ?? 'evidence_missing'}`);
    } else if (observation.subject_sha256 !== subjectHash
      || !observation.evidence_sha256 || !SHA256.test(observation.evidence_sha256)) {
      reasons.push(`${key}:evidence_invalid`);
    }
  }
  return Object.freeze(reasons);
}

function report(subject: NativeAdmissionSubject, evidence: NativeAdmissionEvidence, kind: 'live_host' | 'injected_test') {
  const reasons = [...evaluate(subject, evidence)];
  if (kind === 'injected_test') reasons.push('injected_evidence_not_admissible');
  return Object.freeze({
    schema_version: AKN00_SCHEMA,
    evidence_kind: kind,
    subject,
    subject_sha256: nativeAdmissionDigest(subject),
    capabilities: evidence.capabilities,
    me2b_ref: evidence.me2b === null ? null : {
      sha256: nativeAdmissionDigest(evidence.me2b), result: evidence.me2b,
    },
    decision: {
      status: reasons.length === 0 ? 'admitted' as const : 'runtime_not_admitted' as const,
      reasons,
    },
    campaign_integration: 'not_evaluated' as const,
  });
}

/** Test composition has a fixed provenance; callers cannot relabel it as Host evidence. */
export function buildInjectedNativeAdmissionReport(subject: NativeAdmissionSubject, evidence: NativeAdmissionEvidence) {
  return report(subject, evidence, 'injected_test');
}

function unavailableEvidence(subject: NativeAdmissionSubject): NativeAdmissionEvidence {
  const subjectHash = nativeAdmissionDigest(subject);
  const capabilities = Object.fromEntries(AKN00_CAPABILITIES.map(key => [key, {
    status: 'probe_unavailable' as const,
    subject_sha256: subjectHash,
    evidence_sha256: null,
    reason: 'No version-pinned native Host probe is registered for this candidate path.',
  }])) as Record<Capability, NativeCapabilityEvidence>;
  return { subject_sha256: subjectHash, me2b: null, capabilities };
}

/** The production entry point accepts a repository only, never caller-supplied evidence. */
export function runNativeAdmissionInventory(repo: string) {
  const repositoryRoot = realpathSync(repo);
  const executable = Bun.which('codex');
  if (!executable) throw new Error('codex executable is unavailable');
  const scratch = mkdtempSync(join(tmpdir(), 'repo-harness-akn00-'));
  try {
    const isolatedHome = join(scratch, 'home');
    const isolatedCodex = join(scratch, 'codex');
    mkdirSync(isolatedHome);
    mkdirSync(isolatedCodex);
    // Do not inherit provider credentials, config homes, preload options or Git environment.
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: isolatedHome,
      CODEX_HOME: isolatedCodex,
      TMPDIR: scratch,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
    };
    const baseline = Bun.spawnSync(['/usr/bin/git', '-C', repositoryRoot, 'rev-parse', '--verify', 'HEAD^{commit}'], {
      env, cwd: scratch, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 5_000,
    });
    if (baseline.exitCode !== 0 || (baseline.signalCode ?? null) !== null) throw new Error('repository revision read failed');
    const discovery = discoverCodexRuntime({ executable, env, cwd: scratch });
    const subject: NativeAdmissionSubject = {
      repository_root: repositoryRoot,
      repository_revision: Buffer.from(baseline.stdout).toString('utf8').trim(),
      topology: AKN00_TOPOLOGY,
      platform: platform(), arch: arch(), os_release: release(),
      executable_requested: resolve(executable),
      runtime: discovery.runtime,
      me2b_probe: discovery.probe,
      // --help does not expose an authenticated effective profile or the launcher's native closure.
      permission_profile_sha256: null,
      host_api_revision: null,
    };
    // The sole registered ME-2B adapter targets 0.149.0. It is not this candidate's probe.
    // Inventory deliberately does not call runMe2bRuntimeCanary or any sandbox/exec effect.
    return report(subject, unavailableEvidence(subject), 'live_host');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--repo' || !args[1] || args[1].startsWith('--')) {
      throw new Error('Usage: bun scripts/akn00-native-execution-admission.ts --repo <repo>');
    }
    const result = runNativeAdmissionInventory(args[1]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.decision.status === 'admitted' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

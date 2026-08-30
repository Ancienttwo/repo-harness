import { Command } from 'commander';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import { CollaborationError } from '../../core/collaboration/common';
import { DelegationError, buildDelegationEnvelope, buildDelegationExecutionPacket } from '../../core/engineers/delegation';
import { fenceCollaborationDispatch } from '../../effects/collaboration/context-delivery';
import {
  DelegatedRunStoreError,
  admitReadOnlyDelegation,
  collectDelegatedRunResult,
  dispatchDelegatedRun,
  loadLogicalReadOnlyRoleProfile,
  prepareDelegatedRun,
  readCodexReadOnlyCapability,
  readCodexProcessReceipt,
  readDelegatedRunResult,
  readDelegatedRunRunRef,
  readDelegatedRunStatus,
  readDelegationAdmissionReceipt,
  readDelegationEnvelope,
  readLogicalRoleInstructions,
  recordCodexReadOnlyCapability,
  type AdmitReadOnlyDelegationInput,
  type CollectDelegatedRunInput,
  type DispatchDelegatedRunInput,
  type PrepareDelegatedRunInput,
  type ReadOnlyCapabilityRequest,
} from '../../effects/engineers/delegated-run-store';

type Format = 'json' | 'text';

function output(value: unknown, format: Format, label: string, digest?: string): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  process.stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : `${label}${digest ? `\n  digest: ${digest}` : ''}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof DelegationError || error instanceof DelegatedRunStoreError
    || error instanceof CollaborationError
    ? error.code
    : 'delegation_invalid';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function repoRelativeJson(path: string): unknown {
  if (isAbsolute(path)) throw new Error('input path must be repository-relative');
  const root = realpathSync(process.cwd());
  const lexical = resolve(root, path);
  const scoped = relative(root, lexical);
  if (scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('input path escapes repository');
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('input path must be a repository-owned regular file');
  const actual = realpathSync(lexical);
  const actualScoped = relative(root, actual);
  if (actualScoped.startsWith('..') || isAbsolute(actualScoped)) throw new Error('input path resolves outside repository');
  return JSON.parse(readFileSync(actual, 'utf8'));
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(record: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...fields].sort())) throw new Error(`${label} fields are invalid`);
}

function buildAdmissionInput(path: string): AdmitReadOnlyDelegationInput {
  const raw = object(repoRelativeJson(path), 'admission input');
  exact(raw, ['delegation_id', 'parent', 'engineer', 'logical_role', 'runtime_capability_sha256', 'goal', 'allowed_read_paths', 'budget', 'work_envelope', 'claim_actor_receipt', 'decided_at'], 'admission input');
  const parent = object(raw.parent, 'parent');
  const engineer = object(raw.engineer, 'engineer');
  const budget = object(raw.budget, 'budget');
  const repoRoot = realpathSync(process.cwd());
  const profile = loadLogicalReadOnlyRoleProfile(repoRoot, raw.logical_role as string);
  const capability = readCodexReadOnlyCapability(repoRoot, raw.runtime_capability_sha256 as string);
  const packet = buildDelegationExecutionPacket({
    delegation_id: raw.delegation_id as string,
    logical_role: raw.logical_role as string,
    role_profile_sha256: profile.role_profile_sha256,
    model: profile.model,
    role_instructions: readLogicalRoleInstructions(repoRoot, profile),
    goal: raw.goal as string,
    allowed_read_paths: raw.allowed_read_paths as readonly string[],
    max_turns: budget.max_turns as number,
    max_depth: budget.max_depth as 0,
    return_contract: 'WorkerResultV1',
  });
  const envelope = buildDelegationEnvelope({
    delegation_id: raw.delegation_id as string,
    parent: parent as never,
    engineer: engineer as never,
    logical_role: raw.logical_role as string,
    role_profile_sha256: profile.role_profile_sha256,
    runtime_capability_sha256: capability.capability_sha256,
    execution_packet_sha256: packet.packet_sha256,
    mode: 'read_only',
    goal: raw.goal as string,
    allowed_read_paths: raw.allowed_read_paths as readonly string[],
    budget: budget as never,
    return_contract: 'WorkerResultV1',
  });
  return {
    repo_root: repoRoot,
    envelope,
    role_profile: profile,
    capability,
    execution_packet: packet,
    work_envelope: raw.work_envelope as never,
    claim_actor_receipt: raw.claim_actor_receipt as never,
    decided_at: raw.decided_at as string,
  };
}

function parsePrepare(path: string): PrepareDelegatedRunInput {
  const raw = object(repoRelativeJson(path), 'prepare input');
  exact(raw, ['idempotency_key', 'delegation_id', 'admission_receipt_sha256', 'context_packet_sha256', 'round_index', 'observed_at'], 'prepare input');
  return { repo_root: realpathSync(process.cwd()), idempotency_key: raw.idempotency_key as string, delegation_id: raw.delegation_id as string, admission_receipt_sha256: raw.admission_receipt_sha256 as string, context_packet_sha256: raw.context_packet_sha256 as string, round_index: raw.round_index as number, observed_at: raw.observed_at as string };
}

function parseDispatch(path: string): DispatchDelegatedRunInput {
  const raw = object(repoRelativeJson(path), 'dispatch input');
  exact(raw, ['dispatch_id', 'observed_at', 'protected_paths'], 'dispatch input');
  return { repo_root: realpathSync(process.cwd()), dispatch_id: raw.dispatch_id as string, observed_at: raw.observed_at as string, protected_paths: raw.protected_paths as readonly string[] };
}

function parseCollect(path: string): CollectDelegatedRunInput {
  const raw = object(repoRelativeJson(path), 'collect input');
  exact(raw, ['dispatch_id', 'untrusted_claims'], 'collect input');
  // No contribution reference on this path: wiring the CLI to the collaboration
  // plane is C7's row, so today a CLI-collected run has produced none.
  return { repo_root: realpathSync(process.cwd()), dispatch_id: raw.dispatch_id as string, untrusted_claims: raw.untrusted_claims as readonly string[], contribution_refs: [] };
}

function parseCapability(path: string): ReadOnlyCapabilityRequest {
  const raw = object(repoRelativeJson(path), 'capability input');
  exact(raw, ['logical_role', 'observed_at'], 'capability input');
  return {
    logical_role: raw.logical_role as string,
    observed_at: raw.observed_at as string,
  };
}

export function buildDelegationCommand(): Command {
  const command = new Command('delegation').description('Admit and execute one bounded Codex CLI read-only delegation');
  command.command('profile')
    .requiredOption('--role <logical-role>', 'Exact tracked logical read-only Role Profile')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { role: string; format: Format }) => {
      try {
        const value = loadLogicalReadOnlyRoleProfile(realpathSync(process.cwd()), options.role);
        output(value, options.format, 'LogicalRoleProfileV1', value.role_profile_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('capability')
    .requiredOption('--input <path>', 'Repository-relative logical role and observation-time JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const value = recordCodexReadOnlyCapability(realpathSync(process.cwd()), parseCapability(options.input));
        output(value, options.format, 'CodexReadOnlyCapabilityReceiptV1', value.capability_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('admit')
    .requiredOption('--input <path>', 'Repository-relative exact admission JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const value = admitReadOnlyDelegation(buildAdmissionInput(options.input));
        output(value, options.format, 'DelegationAdmissionReceiptV1', value.receipt.admission_receipt_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('prepare')
    .requiredOption('--input <path>', 'Repository-relative exact intent JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const value = prepareDelegatedRun(parsePrepare(options.input));
        output(value, options.format, 'DelegatedRunIntentV1', value.intent.intent_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('dispatch')
    .requiredOption('--input <path>', 'Repository-relative exact dispatch JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const request = parseDispatch(options.input);
        // C7 wires C6's fence to its first production call site. It is a pre-step
        // rather than an edit to `dispatchDelegatedRun()` so the delegation plane
        // keeps one dispatch semantics; `fenceCollaborationDispatch()` returns null
        // for a run that carries neither a binding nor an untrusted coordination
        // marker, which is every dispatch this command served before this row.
        fenceCollaborationDispatch({ repo_root: request.repo_root, dispatch_id: request.dispatch_id });
        const value = dispatchDelegatedRun(request);
        output(value, options.format, 'DelegatedRunObservationV1', value.current.observation_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('observe')
    .requiredOption('--dispatch-id <digest>', 'Exact persisted dispatch ID')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { dispatchId: string; format: Format }) => {
      try {
        const value = readDelegatedRunStatus(realpathSync(process.cwd()), options.dispatchId);
        output(value, options.format, 'DelegatedRunObservationV1', value.current.observation_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('collect')
    .requiredOption('--input <path>', 'Repository-relative untrusted WorkerResult JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const value = collectDelegatedRunResult(parseCollect(options.input));
        output(value, options.format, 'WorkerResultV1', value.result?.result_sha256);
      } catch (error) { outputError(error); }
    });
  command.command('read')
    .requiredOption('--kind <kind>', 'capability, envelope, admission, process-receipt, run-ref, result, or status')
    .requiredOption('--digest <digest>', 'Exact object or dispatch digest')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { kind: string; digest: string; format: Format }) => {
      try {
        const root = realpathSync(process.cwd());
        if (options.kind === 'capability') { const value = readCodexReadOnlyCapability(root, options.digest); output(value, options.format, 'CodexReadOnlyCapabilityReceiptV1', value.capability_sha256); return; }
        if (options.kind === 'envelope') { const value = readDelegationEnvelope(root, options.digest); output(value, options.format, 'DelegationEnvelopeV1', value.envelope_sha256); return; }
        if (options.kind === 'admission') { const value = readDelegationAdmissionReceipt(root, options.digest); output(value, options.format, 'DelegationAdmissionReceiptV1', value.admission_receipt_sha256); return; }
        if (options.kind === 'process-receipt') { const value = readCodexProcessReceipt(root, options.digest); output(value, options.format, 'CodexProcessReceiptV1', value.process_receipt_sha256); return; }
        if (options.kind === 'run-ref') { const value = readDelegatedRunRunRef(root, options.digest); output(value, options.format, 'WorkerRunRefV1', value.run_ref_sha256); return; }
        if (options.kind === 'result') { const value = readDelegatedRunResult(root, options.digest); output(value, options.format, 'WorkerResultV1', value.result_sha256); return; }
        if (options.kind === 'status') { const value = readDelegatedRunStatus(root, options.digest); output(value, options.format, 'DelegatedRunObservationV1', value.current.observation_sha256); return; }
        throw new Error('unknown delegation evidence kind');
      } catch (error) { outputError(error); }
    });
  return command;
}

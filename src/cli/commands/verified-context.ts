import { Command } from 'commander';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

import {
  VerifiedContextError,
  buildDecisionRequest,
  type DecisionActor,
  type DecisionTransition,
  type EngineerStepProposalV1,
  type SemanticVerificationAssertionV1,
  type WorkerRoundReceiptV1,
} from '../../core/engineers/verified-context';
import {
  VerifiedContextStoreError,
  compileStoredVerifiedEvidenceContext,
  persistEngineerStepProposal,
  persistSemanticVerificationAssertion,
  persistWorkerRoundReceipt,
  projectSemanticContract,
  readDecisionStatus,
  readEngineerStepProposal,
  readSemanticContractProjection,
  readSemanticVerificationAssertion,
  readVerifiedEvidenceContext,
  readWorkerRoundReceipt,
  transitionDecisionRequest,
} from '../../effects/engineers/verified-context-store';

type Format = 'json' | 'text';

function output(value: unknown, format: Format, label: string, digest?: string): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  process.stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : `${label}${digest ? `\n  digest: ${digest}` : ''}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof VerifiedContextError || error instanceof VerifiedContextStoreError ? error.code : 'verified_context_store_invalid';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function repositoryJson(path: string): unknown {
  if (isAbsolute(path)) throw new Error('input path must be repository-relative');
  const root = realpathSync(process.cwd());
  const lexical = resolve(root, path);
  const target = realpathSync(lexical);
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) throw new Error('input path escapes repository');
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('input path must be a repository-owned regular file');
  return JSON.parse(readFileSync(target, 'utf8'));
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are invalid`);
}

function compileInput(path: string) {
  const raw = object(repositoryJson(path), 'compile input');
  exact(raw, ['contract_projection_sha256', 'task', 'binding', 'proposal_sha256s', 'round_receipt_sha256s', 'assertion_sha256s', 'decision_ids'], 'compile input');
  return { repo_root: realpathSync(process.cwd()), contract_projection_sha256: raw.contract_projection_sha256 as string, task: raw.task as never, binding: raw.binding as never, proposal_sha256s: raw.proposal_sha256s as readonly string[], round_receipt_sha256s: raw.round_receipt_sha256s as readonly string[], assertion_sha256s: raw.assertion_sha256s as readonly string[], decision_ids: raw.decision_ids as readonly string[] };
}

function decisionInput(path: string) {
  const raw = object(repositoryJson(path), 'decision input');
  exact(raw, ['request', 'transition'], 'decision input');
  const requestRaw = object(raw.request, 'decision request input');
  exact(requestRaw, ['decision_id', 'task_fence', 'binding_fence', 'previous_assertion_sha256', 'question'], 'decision request input');
  const transition = object(raw.transition, 'decision transition input');
  exact(transition, ['idempotency_key', 'transition', 'expected_current_digest', 'actor', 'answer'], 'decision transition input');
  return {
    repo_root: realpathSync(process.cwd()),
    request: buildDecisionRequest(requestRaw as never),
    idempotency_key: transition.idempotency_key as string,
    transition: transition.transition as DecisionTransition,
    expected_current_digest: transition.expected_current_digest as string | null,
    actor: transition.actor as DecisionActor,
    answer: transition.answer as string | null,
  };
}

export function buildVerifiedContextCommand(): Command {
  const command = new Command('verified-context').description('Project exact ME-2C checkpoint evidence without runtime or authority transitions');
  command.command('contract')
    .requiredOption('--ref <path>', 'Exact repository-relative task Contract path')
    .requiredOption('--revision <git-oid>', 'Exact Git commit containing the Contract')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { ref: string; revision: string; format: Format }) => {
      try { const value = projectSemanticContract(realpathSync(process.cwd()), options.ref, options.revision); output(value, options.format, 'SemanticContractProjectionV1', value.projection_sha256); } catch (error) { outputError(error); }
    });
  command.command('persist')
    .requiredOption('--kind <kind>', 'proposal, round, or assertion')
    .requiredOption('--input <path>', 'Repository-relative canonical JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { kind: string; input: string; format: Format }) => {
      try {
        const root = realpathSync(process.cwd());
        const raw = repositoryJson(options.input);
        if (options.kind === 'proposal') { const value = persistEngineerStepProposal(root, raw as EngineerStepProposalV1); output(value, options.format, 'EngineerStepProposalV1', value.proposal_sha256); return; }
        if (options.kind === 'round') { const value = persistWorkerRoundReceipt(root, raw as WorkerRoundReceiptV1); output(value, options.format, 'WorkerRoundReceiptV1', value.round_receipt_sha256); return; }
        if (options.kind === 'assertion') { const value = persistSemanticVerificationAssertion(root, raw as SemanticVerificationAssertionV1); output(value, options.format, 'SemanticVerificationAssertionV1', value.assertion_sha256); return; }
        throw new Error('unknown verified-context persistence kind');
      } catch (error) { outputError(error); }
    });
  command.command('compile')
    .requiredOption('--input <path>', 'Repository-relative exact digest-list JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try { const value = compileStoredVerifiedEvidenceContext(compileInput(options.input)); output(value, options.format, 'VerifiedEvidenceContextV1', value.context_packet_sha256); } catch (error) { outputError(error); }
    });
  command.command('decision')
    .requiredOption('--input <path>', 'Repository-relative request and transition JSON input')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try { const value = transitionDecisionRequest(decisionInput(options.input)); output(value, options.format, 'DecisionRequestCurrentV1', value.current.current_digest); } catch (error) { outputError(error); }
    });
  command.command('read')
    .requiredOption('--kind <kind>', 'contract, proposal, round, assertion, context, or decision')
    .requiredOption('--id <id>', 'Exact digest or decision UUID')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { kind: string; id: string; format: Format }) => {
      try {
        const root = realpathSync(process.cwd());
        if (options.kind === 'contract') { const value = readSemanticContractProjection(root, options.id); output(value, options.format, 'SemanticContractProjectionV1', value.projection_sha256); return; }
        if (options.kind === 'proposal') { const value = readEngineerStepProposal(root, options.id); output(value, options.format, 'EngineerStepProposalV1', value.proposal_sha256); return; }
        if (options.kind === 'round') { const value = readWorkerRoundReceipt(root, options.id); output(value, options.format, 'WorkerRoundReceiptV1', value.round_receipt_sha256); return; }
        if (options.kind === 'assertion') { const value = readSemanticVerificationAssertion(root, options.id); output(value, options.format, 'SemanticVerificationAssertionV1', value.assertion_sha256); return; }
        if (options.kind === 'context') { const value = readVerifiedEvidenceContext(root, options.id); output(value, options.format, 'VerifiedEvidenceContextV1', value.context_packet_sha256); return; }
        if (options.kind === 'decision') { const value = readDecisionStatus(root, options.id); output(value, options.format, 'DecisionRequestCurrentV1', value.current.current_digest); return; }
        throw new Error('unknown verified-context evidence kind');
      } catch (error) { outputError(error); }
    });
  return command;
}

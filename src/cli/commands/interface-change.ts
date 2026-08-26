import { Command } from 'commander';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import { InterfaceChangeError, type InterfaceChangeTransition } from '../../core/engineers/interface-change';
import {
  InterfaceChangeStoreError,
  findInterfaceChangesByWorkPackage,
  readInterfaceChangeStatus,
  transitionInterfaceChangeRequest,
  type InterfacePlanningProjectionInput,
} from '../../effects/engineers/interface-change-store';

type Format = 'json' | 'text';

function output(value: unknown, format: Format): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  process.stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof InterfaceChangeError || error instanceof InterfaceChangeStoreError ? error.code : 'interface_change_invalid';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) throw new Error(`${label} fields are invalid`);
}

function repoJson(path: string): unknown {
  if (isAbsolute(path)) throw new Error('input path must be repository-relative');
  const root = realpathSync(process.cwd());
  const lexical = resolve(root, path);
  const scoped = relative(root, lexical);
  if (!scoped || scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('input path escapes repository');
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('input path must be a repository-owned regular file');
  const actual = realpathSync(lexical);
  const actualScoped = relative(root, actual);
  if (!actualScoped || actualScoped.startsWith('..') || isAbsolute(actualScoped)) throw new Error('input path resolves outside repository');
  return JSON.parse(readFileSync(actual, 'utf8'));
}

function parseHumanTransition(path: string): {
  readonly request_id: string;
  readonly idempotency_key: string;
  readonly transition: InterfaceChangeTransition;
  readonly expected_current_digest: string;
  readonly human_principal_ref: string;
  readonly planning_projection: InterfacePlanningProjectionInput | null;
  readonly evidence_sha256: string | null;
} {
  const input = object(repoJson(path), 'human transition input');
  exact(input, ['request_id', 'idempotency_key', 'transition', 'expected_current_digest', 'human_principal_ref', 'planning_projection', 'evidence_sha256'], 'human transition input');
  const transition = input.transition as InterfaceChangeTransition;
  if (!['accept', 'reject', 'cancel', 'integrated'].includes(transition)) throw new Error('Human CLI transition must be accept, reject, cancel or integrated');
  let planning: InterfacePlanningProjectionInput | null = null;
  if (input.planning_projection !== null) {
    const projection = object(input.planning_projection, 'planning projection');
    exact(projection, ['sprint_ref', 'expected_work_graph_revision', 'proposed_work_package'], 'planning projection');
    planning = { sprint_ref: projection.sprint_ref as string, expected_work_graph_revision: projection.expected_work_graph_revision as string | null, proposed_work_package: projection.proposed_work_package as never };
  }
  return { request_id: input.request_id as string, idempotency_key: input.idempotency_key as string, transition, expected_current_digest: input.expected_current_digest as string, human_principal_ref: input.human_principal_ref as string, planning_projection: planning, evidence_sha256: input.evidence_sha256 as string | null };
}

export function buildInterfaceChangeCommand(): Command {
  const command = new Command('interface-change').description('Operate the ME-4B cross-capability decision authority without mutating planning or code');

  command.command('human-transition')
    .requiredOption('--input <path>', 'Repository-relative closed Human transition JSON')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { input: string; format: Format }) => {
      try {
        const root = realpathSync(process.cwd());
        const parsed = parseHumanTransition(options.input);
        const status = readInterfaceChangeStatus(root, parsed.request_id);
        const value = transitionInterfaceChangeRequest({
          repo_root: root,
          request: status.request,
          idempotency_key: parsed.idempotency_key,
          transition: parsed.transition,
          expected_current_digest: parsed.expected_current_digest,
          actor: { kind: 'human', principal_ref: parsed.human_principal_ref },
          planning_projection: parsed.planning_projection,
          materialization_commit: null,
          evidence_sha256: parsed.evidence_sha256,
        });
        output(value, options.format);
      } catch (error) { outputError(error); }
    });

  command.command('read')
    .requiredOption('--request-id <uuid>', 'Interface request UUID')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { requestId: string; format: Format }) => {
      try { output(readInterfaceChangeStatus(realpathSync(process.cwd()), options.requestId), options.format); } catch (error) { outputError(error); }
    });

  command.command('lookup')
    .requiredOption('--repository-id <id>', 'Repository identity')
    .requiredOption('--work-package-id <id>', 'Work Package identity')
    .requiredOption('--work-package-revision <sha256>', 'Work Package revision')
    .option('--format <format>', 'json or text', 'json')
    .action((options: { repositoryId: string; workPackageId: string; workPackageRevision: string; format: Format }) => {
      try { output(findInterfaceChangesByWorkPackage(realpathSync(process.cwd()), options.repositoryId, options.workPackageId, options.workPackageRevision), options.format); } catch (error) { outputError(error); }
    });

  return command;
}

import { Command } from 'commander';
import { readFileSync } from 'fs';

import { buildRefactorProgramDefinition } from '../../core/refactor/program-state';
import { readStoredProgramAuthorization } from '../../effects/automation/grant-store';
import {
  appendRefactorProgramEvent,
  createRefactorProgram,
  readRefactorProgramStatus,
  RefactorProgramStoreError,
} from '../../effects/refactor/program-store';
import { materializeRefactorProgram, RefactorMaterializationError, type MaterializeRefactorProgramInput } from '../../effects/refactor/materialization';
import { prepareRefactorArchitectureIntervention, RefactorArchitectureInterventionEffectError, type PrepareRefactorArchitectureInterventionInput } from '../../effects/refactor/architecture-intervention';

class RefactorArgumentError extends Error {
  readonly code = 'invalid_argument' as const;
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new RefactorArgumentError(`${name} is required`);
  return result;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof RefactorArgumentError
    ? error.code
    : error instanceof RefactorProgramStoreError || error instanceof RefactorMaterializationError || error instanceof RefactorArchitectureInterventionEffectError ? error.code : 'refactor_program_unavailable';
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = error instanceof RefactorArgumentError ? 2 : 1;
}

export interface RefactorStartOptions {
  readonly repo?: string;
  readonly programId?: string;
  readonly authorizationSha256?: string;
  readonly baseMainSha?: string;
  readonly idempotencyKey?: string;
  readonly observedAt?: string;
}

export function runRefactorStart(raw: RefactorStartOptions): void {
  const repo = raw.repo?.trim() || process.cwd();
  const authorizationSha256 = required(raw.authorizationSha256, '--authorization-sha256');
  const authorization = readStoredProgramAuthorization(repo, authorizationSha256);
  const observedAt = raw.observedAt?.trim() || new Date().toISOString();
  const program = buildRefactorProgramDefinition({
    program_id: required(raw.programId, '--program-id'),
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    repository_id: authorization.repository_id,
    target_ref: authorization.target_ref,
    target_revision: authorization.target_revision,
    base_main_sha: required(raw.baseMainSha, '--base-main-sha'),
    created_at: observedAt,
  });
  output(createRefactorProgram({ repo_root: repo, program, idempotency_key: required(raw.idempotencyKey, '--idempotency-key') }));
}

export function runRefactorStatus(raw: { readonly repo?: string; readonly programId?: string }): void {
  output(readRefactorProgramStatus(raw.repo?.trim() || process.cwd(), required(raw.programId, '--program-id')));
}

export function runRefactorStop(raw: { readonly repo?: string; readonly programId?: string; readonly expectedCurrentSha256?: string; readonly idempotencyKey?: string; readonly observedAt?: string }): void {
  output(appendRefactorProgramEvent({
    repo_root: raw.repo?.trim() || process.cwd(),
    program_id: required(raw.programId, '--program-id'),
    expected_current_sha256: required(raw.expectedCurrentSha256, '--expected-current-sha256'),
    idempotency_key: required(raw.idempotencyKey, '--idempotency-key'),
    operation: 'stop',
    observed_at: raw.observedAt?.trim() || new Date().toISOString(),
  }));
}

export function runRefactorMaterialize(raw: { readonly repo?: string; readonly request?: string }): void {
  const path = required(raw.request, '--request'); let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new RefactorArgumentError(`cannot read --request: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RefactorArgumentError('--request must contain one JSON object');
  const input = parsed as Omit<MaterializeRefactorProgramInput, 'repo_root'>;
  output(materializeRefactorProgram({ ...input, repo_root: raw.repo?.trim() || process.cwd() }));
}

export function runRefactorArchitectureRequest(raw: { readonly repo?: string; readonly request?: string }): void {
  const path = required(raw.request, '--request'); let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new RefactorArgumentError(`cannot read --request: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RefactorArgumentError('--request must contain one JSON object');
  output(prepareRefactorArchitectureIntervention({ ...(parsed as Omit<PrepareRefactorArchitectureInterventionInput, 'repo_root'>), repo_root: raw.repo?.trim() || process.cwd() }));
}

export function buildRefactorCommand(): Command {
  const command = new Command('refactor').description('Operate the authorized refactor program state machine');
  command.command('start')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--program-id <id>', 'Stable refactor program id')
    .requiredOption('--authorization-sha256 <digest>', 'Stored ProgramAuthorizationV1 digest')
    .requiredOption('--base-main-sha <digest>', 'Exact program baseline digest')
    .requiredOption('--idempotency-key <key>', 'Stable creation key')
    .option('--observed-at <timestamp>', 'RFC3339 creation time')
    .action((options: RefactorStartOptions) => { try { runRefactorStart(options); } catch (error) { outputError(error); } });
  command.command('status')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--program-id <id>', 'Refactor program id')
    .action((options: { repo?: string; programId?: string }) => { try { runRefactorStatus(options); } catch (error) { outputError(error); } });
  command.command('stop')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--program-id <id>', 'Refactor program id')
    .requiredOption('--expected-current-sha256 <digest>', 'Exact current projection digest')
    .requiredOption('--idempotency-key <key>', 'Stable stop key')
    .option('--observed-at <timestamp>', 'RFC3339 stop time')
    .action((options: { repo?: string; programId?: string; expectedCurrentSha256?: string; idempotencyKey?: string; observedAt?: string }) => { try { runRefactorStop(options); } catch (error) { outputError(error); } });
  command.command('materialize')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--request <path>', 'Exact Refactor materialization request JSON')
    .action((options: { repo?: string; request?: string }) => { try { runRefactorMaterialize(options); } catch (error) { outputError(error); } });
  command.command('architecture-request')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--request <path>', 'Exact architecture intervention request JSON')
    .action((options: { repo?: string; request?: string }) => { try { runRefactorArchitectureRequest(options); } catch (error) { outputError(error); } });
  return command;
}

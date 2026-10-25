import { readFileSync } from 'node:fs';
import { isTaskDiffRequest } from '../../core/operator/task-diff';
import { Command } from 'commander';

import { readRepoHarnessRegistryStrictSnapshot, RepoHarnessRegistryStrictError } from '../../effects/repo-registry';
import { ExternalSourcePolicyError, readExternalSourcesPolicy } from '../../effects/github/policy';
import { ExternalSourceRefreshError, listExternalSourceProjection, refreshExternalSource } from '../../effects/external-sources/refresh';
import { ExternalSourceStoreError } from '../../effects/external-sources/store';
import { bindExternalSource, externalSourceContext, listExternalSourceBindings, listHistoricalExternalSourceBindings } from '../../effects/external-sources/binding';
import { ExternalSourceBindingError } from '../../core/external-sources/binding';

type Format = 'json' | 'text';
interface Options { readonly repo: string; readonly format: Format; }
interface BindOptions extends Options { readonly sourceRevision: string; readonly session: string; }
interface ContextOptions extends Options { readonly sourceRevision: string; }

function registeredRepository(id: string): { readonly id: string; readonly path: string } {
  const repository = readRepoHarnessRegistryStrictSnapshot().repos.find((entry) => entry.id === id);
  if (!repository) throw new Error(`registered repository is unknown: ${id}`);
  return repository;
}

function output(value: unknown, format: Format, label: string): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  const projection = value as { latest_attempt: { outcome: string } | null; issues: readonly { latest_observation: { display_ref: string; eligible: boolean; source_revision: string }; source_drift: boolean }[] };
  process.stdout.write(`${label}\n`);
  process.stdout.write(`  latest_attempt: ${projection.latest_attempt?.outcome ?? 'none'}\n`);
  process.stdout.write(`  issues: ${projection.issues.length}\n`);
  for (const issue of projection.issues) {
    process.stdout.write(`  - ${issue.latest_observation.display_ref} eligible=${issue.latest_observation.eligible} drift=${issue.source_drift} revision=${issue.latest_observation.source_revision}\n`);
  }
}

function outputError(error: unknown): void {
  const code = error instanceof RepoHarnessRegistryStrictError
    || error instanceof ExternalSourcePolicyError
    || error instanceof ExternalSourceStoreError
    || error instanceof ExternalSourceBindingError
    ? error.code
    : error instanceof ExternalSourceRefreshError
      ? error.code
      : 'external_source_invalid';
  const message = error instanceof Error ? error.message : String(error);
  const receipt = error instanceof ExternalSourceRefreshError ? error.receipt : null;
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message, receipt })}\n`);
  process.exitCode = 1;
}

function outputDocument(value: unknown, format: Format, label: string): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  if (format === 'json') process.stdout.write(`${JSON.stringify(value)}\n`);
  else process.stdout.write(`${label}\n${JSON.stringify(value, null, 2)}\n`);
}

function refresh(options: Options): void {
  try {
    const repo = registeredRepository(options.repo);
    const result = refreshExternalSource({ repo_root: repo.path, registered_repository_id: repo.id, policy: readExternalSourcesPolicy(repo.path) });
    output(result.projection, options.format, 'ExternalSourceProjectionV1');
  } catch (error) {
    outputError(error);
  }
}

function list(options: Options): void {
  try {
    const repo = registeredRepository(options.repo);
    output(listExternalSourceProjection(repo.path, repo.id), options.format, 'ExternalSourceProjectionV1');
  } catch (error) {
    outputError(error);
  }
}

function bind(options: BindOptions): void {
  try {
    const session: unknown = JSON.parse(readFileSync(options.session, 'utf8'));
    if (!isTaskDiffRequest(session)) throw new Error('invalid admitted session selector');
    const receipt = bindExternalSource({
      registered_repository_id: options.repo,
      source_revision: options.sourceRevision,
      session,
    });
    outputDocument(receipt, options.format, 'ExternalSourceBindingReceiptV2');
  } catch (error) {
    outputError(error);
  }
}

function bindings(options: Options): void {
  try {
    outputDocument(listExternalSourceBindings(options.repo), options.format, 'ExternalSourceBindingProjectionV2');
  } catch (error) {
    outputError(error);
  }
}

function context(options: ContextOptions): void {
  try {
    const repo = registeredRepository(options.repo);
    const rendered = externalSourceContext(repo.path, repo.id, options.sourceRevision);
    if (options.format === 'json') outputDocument({ context: rendered }, 'json', 'ExternalSourceUntrustedContextV1');
    else process.stdout.write(rendered);
  } catch (error) {
    outputError(error);
  }
}

export function buildExternalSourceCommand(): Command {
  const command = new Command('external-source').description('Observe provider Issues and bind immutable source revisions to explicit admitted sessions without minting execution authority');
  command.command('refresh')
    .description('Run one explicitly enabled, bounded GitHub observation refresh')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .option('--format <format>', 'json or text', 'text')
    .action(refresh);
  command.command('list')
    .description('Read persisted external-source projection without contacting a provider')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .option('--format <format>', 'json or text', 'text')
    .action(list);
  command.command('bind')
    .description('Bind one immutable eligible source revision to one existing admitted session')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .requiredOption('--source-revision <digest>', 'Exact immutable provider source revision')
    .requiredOption('--session <file>', 'JSON admitted session selector returned by task session discovery')
    .option('--format <format>', 'json or text', 'text')
    .action(bind);
  command.command('bindings')
    .description('Project persisted source-to-admitted-session binding edges and current drift attention')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .option('--format <format>', 'json or text', 'text')
    .action(bindings);
  command.command('historical-bindings')
    .description('Read retired V1 binding receipts as history, without current authority')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .option('--format <format>', 'json or text', 'text')
    .action((options: Options) => {
      try { outputDocument(listHistoricalExternalSourceBindings(options.repo), options.format, 'HistoricalExternalSourceBindingsV1'); }
      catch (error) { outputError(error); }
    });
  command.command('context')
    .description('Render one immutable observation inside the sole explicit untrusted-source boundary')
    .requiredOption('--repo <registered-repo-id>', 'Registered repository id')
    .requiredOption('--source-revision <digest>', 'Exact immutable provider source revision')
    .option('--format <format>', 'json or text', 'text')
    .action(context);
  return command;
}

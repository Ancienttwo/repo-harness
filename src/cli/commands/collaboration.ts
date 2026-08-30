/**
 * `repo-harness collaboration` — the bounded Module Engineer command family.
 *
 * Sprint row C7. Every subcommand is a thin adapter over
 * `src/effects/collaboration/agent-surface.ts`, which owns the invariants this
 * file must not restate: the actor is derived from `--authorization-id`, the
 * publish destination is fixed, recorded time is Host-derived, and mutations are
 * gated on `collaboration.mode` by the stores themselves.
 *
 * The one thing this file does own is the wire: a mutation payload arrives as a
 * repository-relative JSON file with an **exact** key set. An unknown key is
 * refused rather than dropped, so `actor`, `engineer_id` and `destination` have
 * nowhere to land — a caller cannot even express the identity claim, let alone
 * have it quietly ignored.
 */
import { Command } from 'commander';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import { CollaborationError } from '../../core/collaboration/common';
import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError } from '../../core/engineers/scheduling';
import {
  collaborationExchangeView,
  collaborationHandoffAdopt,
  collaborationHandoffPublish,
  collaborationHandoffsView,
  collaborationPacketBuild,
  collaborationPacketRead,
  collaborationSignalPost,
  collaborationSignalsView,
  collaborationThreadsView,
  type CollaborationHandoffAdoptInput,
  type CollaborationHandoffPublishInput,
  type CollaborationPacketBuildInput,
  type CollaborationSignalPostInput,
  type CollaborationSurfaceContext,
} from '../../effects/collaboration/agent-surface';

type Format = 'json' | 'text';

interface ReadOptions {
  readonly authorizationId: string;
  readonly format: Format;
}

interface MutationOptions extends ReadOptions {
  readonly input: string;
}

function output(value: unknown, format: Format, label: string): void {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  process.stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : `${label}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof CollaborationError
    || error instanceof EngineerPrincipalError
    || error instanceof EngineerSchedulingError
    ? error.code
    : 'collaboration_invalid';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

/** The same repository-owned-regular-file rule the delegation command applies. */
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

/**
 * Exact key equality, not a superset check. A payload carrying `actor` is
 * refused with the field named, which is the only honest answer: silently
 * dropping it would let a caller believe it had declared an author.
 */
function exact(record: Record<string, unknown>, fields: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const unknown = actual.filter((key) => !expected.includes(key));
    const missing = expected.filter((key) => !actual.includes(key));
    throw new Error(`${label} fields are invalid`
      + `${unknown.length > 0 ? `; unexpected: ${unknown.join(', ')}` : ''}`
      + `${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}`);
  }
}

function contextOf(options: ReadOptions): CollaborationSurfaceContext {
  return {
    repo_root: realpathSync(process.cwd()),
    authorization_id: options.authorizationId,
    env: process.env,
  };
}

const SIGNAL_POST_FIELDS = [
  'idempotency_key',
  'thread_key',
  'reply_to_signal_id',
  'scope_refs',
  'labels',
  'title',
  'body',
  'artifact_refs',
  'source_signal_ids',
  'supersedes_signal_id',
] as const;

const HANDOFF_PUBLISH_FIELDS = [
  'idempotency_key',
  'thread_key',
  'scope_refs',
  'trigger',
  'goal',
  'completed',
  'key_findings',
  'attempted_paths',
  'dead_ends',
  'open_hypotheses',
  'next_actions',
  'source_signal_ids',
  'execution_context',
  'supersedes_handoff_id',
] as const;

const HANDOFF_ADOPT_FIELDS = ['handoff_id', 'context_packet_sha256'] as const;

const PACKET_BUILD_FIELDS = [
  'base_goal',
  'subject_refs',
  'handoff',
  'budget_estimated_tokens',
] as const;

function parseSignalPost(path: string): CollaborationSignalPostInput {
  const raw = object(repoRelativeJson(path), 'signal post input');
  exact(raw, SIGNAL_POST_FIELDS, 'signal post input');
  return raw as unknown as CollaborationSignalPostInput;
}

function parseHandoffPublish(path: string): CollaborationHandoffPublishInput {
  const raw = object(repoRelativeJson(path), 'handoff publish input');
  exact(raw, HANDOFF_PUBLISH_FIELDS, 'handoff publish input');
  return raw as unknown as CollaborationHandoffPublishInput;
}

function parseHandoffAdopt(path: string): CollaborationHandoffAdoptInput {
  const raw = object(repoRelativeJson(path), 'handoff adopt input');
  exact(raw, HANDOFF_ADOPT_FIELDS, 'handoff adopt input');
  return raw as unknown as CollaborationHandoffAdoptInput;
}

function parsePacketBuild(path: string): CollaborationPacketBuildInput {
  const raw = object(repoRelativeJson(path), 'packet build input');
  exact(raw, PACKET_BUILD_FIELDS, 'packet build input');
  return raw as unknown as CollaborationPacketBuildInput;
}

/**
 * One named handler per subcommand.
 *
 * They are module-level functions rather than inline `.action()` closures so each
 * call into `agent-surface.ts` is a direct statement the architecture flow proof
 * can follow, matching the reason C6 kept its own proof edge out of a callback.
 */
function exchangeAction(options: ReadOptions): void {
  try { output(collaborationExchangeView(contextOf(options)), options.format, 'CollaborativeWorkExchangeSnapshotV1'); }
  catch (error) { outputError(error); }
}

function threadsAction(options: ReadOptions): void {
  try { output(collaborationThreadsView(contextOf(options)), options.format, 'CollaborationThreadProjectionV1'); }
  catch (error) { outputError(error); }
}

function signalsAction(options: ReadOptions): void {
  try { output(collaborationSignalsView(contextOf(options)), options.format, 'CoordinationSignalV1[]'); }
  catch (error) { outputError(error); }
}

function postAction(options: MutationOptions): void {
  try {
    const value = collaborationSignalPost(contextOf(options), parseSignalPost(options.input));
    output(value, options.format, 'CoordinationSignalV1');
  } catch (error) { outputError(error); }
}

function handoffPublishAction(options: MutationOptions): void {
  try {
    const value = collaborationHandoffPublish(contextOf(options), parseHandoffPublish(options.input));
    output(value, options.format, 'WorkStateHandoffV1');
  } catch (error) { outputError(error); }
}

function handoffListAction(options: ReadOptions): void {
  try { output(collaborationHandoffsView(contextOf(options)), options.format, 'WorkStateHandoffV1[]'); }
  catch (error) { outputError(error); }
}

function handoffAdoptAction(options: MutationOptions): void {
  try {
    const value = collaborationHandoffAdopt(contextOf(options), parseHandoffAdopt(options.input));
    output(value, options.format, 'HandoffAdoptionReceiptV1');
  } catch (error) { outputError(error); }
}

function packetBuildAction(options: MutationOptions): void {
  try {
    const value = collaborationPacketBuild(contextOf(options), parsePacketBuild(options.input));
    output(value, options.format, 'CollaborationContextPacketV1');
  } catch (error) { outputError(error); }
}

function packetReadAction(options: ReadOptions & { readonly packetSha256: string }): void {
  try {
    const value = collaborationPacketRead(contextOf(options), options.packetSha256);
    output(value, options.format, 'CollaborationContextPacketV1');
  } catch (error) { outputError(error); }
}

function withAuthorization(command: Command): Command {
  return command
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .option('--format <format>', 'json or text', 'json');
}

function withInput(command: Command, description: string): Command {
  return withAuthorization(command).requiredOption('--input <path>', description);
}

export function buildCollaborationCommand(): Command {
  const command = new Command('collaboration')
    .description('Read the collaborative Work Exchange and publish bounded coordination records as an authenticated Module Engineer');

  withAuthorization(command.command('exchange')
    .description('Read one collaborative Work Exchange snapshot for this authenticated Module Engineer'))
    .action(exchangeAction);

  withAuthorization(command.command('threads')
    .description('Read lanes, hotspot scores and contribution opportunities from that same snapshot'))
    .action(threadsAction);

  withAuthorization(command.command('signals')
    .description('List every committed coordination signal in this repository'))
    .action(signalsAction);

  withInput(command.command('post')
    .description('Publish one coordination signal; the author is derived from --authorization-id and cannot be declared'),
  'Repository-relative exact coordination signal JSON input')
    .action(postAction);

  const handoff = command.command('handoff').description('Publish, list and adopt work-state handoffs');

  withInput(handoff.command('publish')
    .description('Publish one work-state handoff; the author is derived from --authorization-id'),
  'Repository-relative exact work-state handoff JSON input')
    .action(handoffPublishAction);

  withAuthorization(handoff.command('list')
    .description('List published work-state handoffs and how many adopters each has'))
    .action(handoffListAction);

  withInput(handoff.command('adopt')
    .description('Record a non-exclusive adoption receipt; adoption grants no Task, Claim or Lease'),
  'Repository-relative exact handoff adoption JSON input')
    .action(handoffAdoptAction);

  const packet = command.command('packet').description('Build and read bounded collaboration context packets');

  withInput(packet.command('build')
    .description('Build one bounded context packet and return its untrusted rendering verbatim'),
  'Repository-relative exact context packet JSON input')
    .action(packetBuildAction);

  withAuthorization(packet.command('read')
    .description('Read one persisted context packet by its canonical digest'))
    .requiredOption('--packet-sha256 <digest>', 'Exact persisted packet digest')
    .action(packetReadAction);

  return command;
}

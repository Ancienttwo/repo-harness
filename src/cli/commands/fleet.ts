import { TaskMessageError } from '../../core/messages/task-message-error';
import { readReviewAdmissionSource } from '../../effects/admission/admission-source';
import { Command } from 'commander';
import { migrateTaskInboxLayout, TaskInboxMigrationError } from '../../effects/fleet/task-inbox-layout-migration';
import { TaskInboxLayoutError } from '../../effects/fleet/task-inbox-layout';
import { pruneRepoHarnessRegistry } from '../../effects/repo-registry';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

import { MergeReadinessError, resolveFleetReadiness, validatePullRequestSelection } from '../../effects/publication/merge-readiness';
import { collectFleetBoard, FleetBoardError, watchFleetBoard, type FleetBoardPullRequestSelection } from '../../effects/fleet/board';
import { observeTaskInboxContext, type TaskInboxSessionSource, ackTaskInbox, deliverTaskInbox, listTaskInbox, sendTaskMessage, TaskInboxError } from '../../effects/fleet/task-inbox';
import { buildTaskMessageEvent, type TaskMessageEventInput, type TaskMessageRecipient } from '../../core/fleet/admitted-task-message';
import { prepareFeedbackSubject, FeedbackError, intakeGitHubFeedback, projectPendingFeedbackOffer, showGitHubFeedback, transitionFeedbackDelivery } from '../../effects/publication/feedback';
import { FeedbackStoreError, readFeedbackDeliveryReceipt } from '../../effects/publication/feedback-store';

function outputError(error: unknown): void {
  const code = error instanceof MergeReadinessError
    || error instanceof FleetBoardError
    || error instanceof FeedbackError
    || error instanceof FeedbackStoreError
    || error instanceof TaskInboxError
    || error instanceof TaskMessageError
    ? error.code
    : 'provider_unavailable';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function outputFeedbackValidation(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'invalid_argument', message })}\n`);
  process.exitCode = 2;
}

function requireJson(json: boolean | undefined): void {
  if (json !== true) throw new Error('--json is required');
}

function requiredStringOption(value: string | undefined, name: string): string {
  const result = optionalStringOption(value, name);
  if (result === undefined) throw new Error(`--${name} is required`);
  return result;
}

function feedbackEnvironment() {
  return {
    repo_root: process.cwd(),
    gh_bin: process.env.REPO_HARNESS_GH_BIN,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
  } as const;
}

function outputTaskInboxError(error: unknown): void {
  const code = error instanceof TaskInboxError || error instanceof TaskMessageError || error instanceof TaskInboxMigrationError || error instanceof TaskInboxLayoutError
    ? error.code
    : 'invalid_argument';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

type TaskMessageScope = 'task' | 'claim';
type TaskMessageAudience = 'owner' | 'orchestrator' | 'user';

function admittedInboxContext(repoRoot: string, taskId: string, contextFile: string) {
  return parseAdmittedInboxContext(repoRoot, taskId, JSON.parse(readFileSync(contextFile, 'utf8')));
}
function parseAdmittedInboxContext(repoRoot: string, taskId: string, value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['admission', 'claim', 'session'])) throw new Error('inbox context fields are invalid');
  const selector = value.admission;
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)
    || JSON.stringify(Object.keys(selector).sort()) !== JSON.stringify(['actor_id', 'campaign_id', 'grant_sha256', 'issue_id', 'policy_sha256', 'repository_id'])) throw new Error('inbox admission selector fields are invalid');
  if (!value.session || typeof value.session !== 'object' || Array.isArray(value.session)
    || JSON.stringify(Object.keys(value.session).sort()) !== JSON.stringify(['role', 'task'])
    || typeof value.session.task !== 'string' || typeof value.session.role !== 'string') throw new Error('inbox session fields are invalid');
  const source: TaskInboxSessionSource = { session: value.session, authority: { claim: value.claim,
    source: readReviewAdmissionSource(repoRoot, { 'repository-id': selector.repository_id, 'issue-id': selector.issue_id,
      'campaign-id': selector.campaign_id, 'grant-sha256': selector.grant_sha256, 'policy-sha256': selector.policy_sha256, actor: selector.actor_id }) } };
  const admission = observeTaskInboxContext({ repo_root: repoRoot, source, task_id: taskId });
  return { source, taskId, admission };
}

function readMessageBody(bodyFile: string): string {
  return readFileSync(bodyFile).toString('utf8');
}

function messageInput(
  options: {
    readonly taskId: string;
    readonly scope: TaskMessageScope;
    readonly audience: TaskMessageAudience;
    readonly body: string;
    readonly messageId?: string;
    readonly inReplyTo?: string;
  },
  context: ReturnType<typeof admittedInboxContext>,
): TaskMessageEventInput {
  return {
    message_id: options.messageId ?? randomUUID(),
    task_id: context.taskId,
    admission_sha256: context.admission.approval.admission_sha256,
    task_identity: { repository_id: context.admission.identity.repository_id, issue_id: context.admission.identity.issue_id, campaign_id: context.admission.identity.campaign_id },
    scope: options.scope,
    target_claim: options.scope === 'claim' ? context.admission.identity.claim : null,
    sender_kind: 'user',
    sender_id: null,
    sender_trust: 'local_operator',
    audience: options.audience,
    body: options.body,
    created_at: new Date().toISOString(),
    in_reply_to: options.inReplyTo ?? null,
  };
}

function optionalStringOption(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`--${name} must be a non-empty string`);
  return trimmed;
}


function feedbackContext(contextFile: string, publicationId?: string) {
  const value = JSON.parse(readFileSync(contextFile, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'admission,claim,selection,session') throw new Error('feedback context fields are invalid');
  const context = parseAdmittedInboxContext(process.cwd(), value.session?.task,
    { admission: value.admission, claim: value.claim, session: value.session });
  const input = { ...feedbackEnvironment(), source: context.source, selection: value.selection };
  const subject = prepareFeedbackSubject(input);
  if (publicationId !== undefined && subject.publication_id !== publicationId) throw new Error('publication-id differs from explicit feedback context');
  return { ...input, publication_id: subject.publication_id };
}

function integerOption(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number | undefined = undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    const bound = maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new Error(`--${name} must be an integer ${bound}`);
  }
  return parsed;
}

export function buildFleetCommand(): Command {
  const fleet = new Command('fleet').description('Project fleet workflow views and task acquisition');
  fleet.command('prune')
    .description('Preview missing repository registrations; --apply removes registry rows only, without backup')
    .option('--apply', 'Remove confirmed absent paths under the registry mutation lock')
    .option('--expected-revision <digest>', 'Exact registry_revision from the preview; required with --apply')
    .option('--repo-id <id...>', 'Limit inspection/removal to these registered repository IDs')
    .action(options => {
      try {
        const result = pruneRepoHarnessRegistry({ apply: options.apply,
          expectedRevision: options.expectedRevision, repoIds: options.repoId });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
      } catch (error) { outputFeedbackValidation(error); }
    });
  fleet
    .command('ready')
    .description('Observe an explicit ordered array of provider PR selections')
    .requiredOption('--selections <path>', 'JSON array of canonical provider PR selections')
    .requiredOption('--json', 'Output FleetReadinessV2')
    .action((options: { selections: string }) => {
      try {
        const selections: unknown = JSON.parse(readFileSync(options.selections, 'utf8'));
        if (!Array.isArray(selections)) throw new Error('selections must be an array');
        const result = resolveFleetReadiness({ repo_root: process.cwd(), pull_requests: selections.map(validatePullRequestSelection),
          gh_bin: process.env.REPO_HARNESS_GH_BIN });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  fleet
    .command('board')
    .option('--pr-associations <path>', 'JSON provider selections with optional display task associations')
    .description('Project every authorized repository as one deterministic fleet board snapshot')
    .requiredOption('--json', 'Output the FleetBoardSnapshotV2 document as JSON')
    .option('--max-concurrency <count>', 'Bounded repository collection concurrency (1-16)', '4')
    .option('--timeout-ms <milliseconds>', 'Per-repository provider collection deadline (1000-30000)', '30000')
    .action(async (options: { readonly json?: boolean; readonly prAssociations?: string; readonly maxConcurrency?: string; readonly timeoutMs?: string }) => {
      let maxConcurrency: number | undefined;
      let timeoutMs: number | undefined;
      try {
        requireJson(options.json);
        maxConcurrency = integerOption(options.maxConcurrency, 'max-concurrency', 1, 16);
        timeoutMs = integerOption(options.timeoutMs, 'timeout-ms', 1_000, 30_000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${JSON.stringify({ ok: false, error: 'fleet_board_argument_invalid', message })}\n`);
        process.exitCode = 2;
        return;
      }
      try {
        const snapshot = await collectFleetBoard({
          pull_requests: readPrAssociations(options.prAssociations),
          env: process.env,
          max_concurrency: maxConcurrency,
          timeout_ms: timeoutMs,
        });
        process.stdout.write(`${JSON.stringify(snapshot)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  fleet
    .command('watch')
    .option('--pr-associations <path>', 'JSON provider selections with optional display task associations')
    .description('Emit immediate, non-overlapping fleet board snapshots as JSONL')
    .requiredOption('--format <format>', 'Output format (jsonl)')
    .option('--interval-ms <milliseconds>', 'Delay after each completed round (1000-300000)', '30000')
    .option('--max-concurrency <count>', 'Bounded repository collection concurrency (1-16)', '4')
    .option('--timeout-ms <milliseconds>', 'Per-repository provider collection deadline (1000-30000)', '30000')
    .action(async (options: {
      readonly prAssociations?: string;
      readonly format?: string;
      readonly intervalMs?: string;
      readonly maxConcurrency?: string;
      readonly timeoutMs?: string;
    }) => {
      let intervalMs: number | undefined;
      let maxConcurrency: number | undefined;
      let timeoutMs: number | undefined;
      try {
        if (options.format !== 'jsonl') throw new Error('--format must be jsonl');
        intervalMs = integerOption(options.intervalMs, 'interval-ms', 1_000, 300_000);
        maxConcurrency = integerOption(options.maxConcurrency, 'max-concurrency', 1, 16);
        timeoutMs = integerOption(options.timeoutMs, 'timeout-ms', 1_000, 30_000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${JSON.stringify({ ok: false, error: 'fleet_board_argument_invalid', message })}\n`);
        process.exitCode = 2;
        return;
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once('SIGINT', abort);
      process.once('SIGTERM', abort);
      let emitted = 0;
      try {
        for await (const snapshot of watchFleetBoard({
          pull_requests: readPrAssociations(options.prAssociations),
          env: process.env,
          interval_ms: intervalMs,
          max_concurrency: maxConcurrency,
          timeout_ms: timeoutMs,
          signal: controller.signal,
        })) {
          process.stdout.write(`${JSON.stringify(snapshot)}\n`);
          emitted += 1;
        }
      } catch (error) {
        if (!controller.signal.aborted || emitted === 0) outputError(error);
      } finally {
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
      }
    });

  const feedback = fleet
    .command('feedback')
    .description('Observe and acknowledge immutable provider feedback for a publication');

  feedback
    .command('intake')
    .description('Observe GitHub checks and review threads and persist immutable feedback events')
    .option('--json', 'Output JSON')
    .requiredOption('--context <file>', 'JSON {admission,claim,session,selection}; explicit provider and admitted session context')
    .option('--publication-id <publicationId>', 'Publication identity to observe')
    .action((options: { readonly context: string; readonly json?: boolean; readonly publicationId?: string }) => {
      let publicationId: string | undefined;
      try {
        requireJson(options.json);
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        publicationId = options.publicationId === undefined ? undefined : requiredStringOption(options.publicationId, 'publication-id');
        const result = intakeGitHubFeedback({
          ...feedbackContext(options.context, publicationId),
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('offers')
    .description('Project the pending provider feedback repair offer')
    .option('--json', 'Output JSON')
    .requiredOption('--context <file>', 'JSON {admission,claim,session,selection}; explicit provider and admitted session context')
    .option('--publication-id <publicationId>', 'Publication identity to inspect')
    .action((options: { readonly context: string; readonly json?: boolean; readonly publicationId?: string }) => {
      let publicationId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const result = projectPendingFeedbackOffer({
          ...feedbackContext(options.context, publicationId),
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('ack')
    .description('Acknowledge one durable provider feedback delivery receipt')
    .option('--json', 'Output JSON')
    .requiredOption('--context <file>', 'JSON {admission,claim,session,selection}; explicit provider and admitted session context')
    .option('--publication-id <publicationId>', 'Publication identity to acknowledge')
    .option('--provider-event-id <providerEventId>', 'Opaque provider event identity')
    .action((options: {
      readonly context: string; readonly json?: boolean;
      readonly publicationId?: string;
      readonly providerEventId?: string;
    }) => {
      let publicationId: string;
      let providerEventId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
        providerEventId = requiredStringOption(options.providerEventId, 'provider-event-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const gitBin = process.env.REPO_HARNESS_GIT_BIN;
        const current = readFeedbackDeliveryReceipt(process.cwd(), publicationId, providerEventId, gitBin);
        const receipt = transitionFeedbackDelivery({
          ...feedbackContext(options.context, publicationId),
          provider_event_id: providerEventId,
          git_bin: gitBin,
          transition: {
            delivery_state: 'acknowledged',
            ...(current === null || current.delivery_state === 'pending' ? { delivery_channel: 'manual' as const } : {}),
            transitioned_at: new Date().toISOString(),
          },
        });
        process.stdout.write(`${JSON.stringify({ ok: true, receipt })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('show')
    .description('Display one provider feedback body as untrusted text')
    .option('--json', 'Output JSON')
    .requiredOption('--context <file>', 'JSON {admission,claim,session,selection}; explicit provider and admitted session context')
    .option('--publication-id <publicationId>', 'Publication identity to inspect')
    .option('--provider-event-id <providerEventId>', 'Opaque provider event identity')
    .action((options: {
      readonly context: string; readonly json?: boolean;
      readonly publicationId?: string;
      readonly providerEventId?: string;
    }) => {
      let publicationId: string;
      let providerEventId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
        providerEventId = requiredStringOption(options.providerEventId, 'provider-event-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const result = showGitHubFeedback({
          ...feedbackContext(options.context, publicationId),
          provider_event_id: providerEventId,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  const message = fleet
    .command('message')
    .description('Send one bounded task-addressed message');
  message
    .command('send')
    .description('Create one immutable task message event')
    .requiredOption('--json', 'Output the task message result as JSON')
    .requiredOption('--task-id <taskId>', 'Existing admitted session task id')
    .requiredOption('--context <file>', 'JSON {admission, claim, session}; explicit current admission and immutable claim reference')
    .requiredOption('--scope <scope>', 'Message scope: task or claim')
    .requiredOption('--audience <audience>', 'Message audience: owner, orchestrator, or user')
    .requiredOption('--body-file <path>', 'UTF-8 file containing the untrusted message body')
    .option('--message-id <messageId>', 'Stable UUID for an idempotent retry')
    .option('--in-reply-to <messageId>', 'Prior message UUID')
    .action((options: {
      readonly taskId: string;
      readonly context: string;
      readonly scope: string;
      readonly audience: string;
      readonly bodyFile: string;
      readonly messageId?: string;
      readonly inReplyTo?: string;
    }) => {
      try {
        if (options.scope !== 'task' && options.scope !== 'claim') throw new Error('--scope must be task or claim');
        if (options.audience !== 'owner' && options.audience !== 'orchestrator' && options.audience !== 'user') {
          throw new Error('--audience must be owner, orchestrator, or user');
        }
        const taskId = optionalStringOption(options.taskId, 'task-id');
        const bodyFile = optionalStringOption(options.bodyFile, 'body-file');
        if (!taskId || !bodyFile) throw new Error('--task-id and --body-file must be non-empty strings');
        const context = admittedInboxContext(process.cwd(), taskId, options.context);
        const event = buildTaskMessageEvent(messageInput({
          taskId,
          scope: options.scope,
          audience: options.audience,
          body: readMessageBody(bodyFile),
          messageId: optionalStringOption(options.messageId, 'message-id'),
          inReplyTo: optionalStringOption(options.inReplyTo, 'in-reply-to'),
        }, context));
        const result = sendTaskMessage({
          repo_root: process.cwd(),
          source: context.source,
          event,
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputTaskInboxError(error);
      }
    });

  const inbox = fleet
    .command('inbox')
    .description('Inspect and acknowledge task-message delivery receipts');

  inbox.command('migrate-layout')
    .description('Inspect or explicitly migrate the offline Task Inbox storage layout')
    .requiredOption('--json', 'Output migration inventory and digests as JSON')
    .option('--apply', 'Apply a dry-run-bound migration')
    .option('--resume', 'Resume the exact interrupted migration')
    .option('--rollback', 'Restore v1 only before any subsequent v2 writes')
    .option('--expected-source-sha256 <digest>', 'Exact source digest returned by dry-run')
    .option('--receipt-sha256 <digest>', 'Exact migration receipt digest for rollback')
    .option('--confirm-quiescent', 'Confirm all repository clients and hooks are stopped')
    .action((options: { apply?: boolean; resume?: boolean; rollback?: boolean; expectedSourceSha256?: string; receiptSha256?: string; confirmQuiescent?: boolean }) => {
      try {
        if ([options.apply, options.resume, options.rollback].filter(Boolean).length > 1) throw new Error('--apply, --resume and --rollback are mutually exclusive');
        const mode = options.apply ? 'apply' : options.resume ? 'resume' : options.rollback ? 'rollback' : 'dry-run';
        const result = migrateTaskInboxLayout({ repo_root: process.cwd(), mode,
          expected_source_sha256: options.expectedSourceSha256, receipt_sha256: options.receiptSha256,
          confirm_quiescent: options.confirmQuiescent });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) { outputTaskInboxError(error); }
    });

  inbox
    .command('list')
    .description('Deliver and list messages for the current bound owner')
    .requiredOption('--json', 'Output inbox state as JSON')
    .requiredOption('--task-id <taskId>', 'Existing admitted session task id')
    .requiredOption('--context <file>', 'JSON {admission, claim, session}; explicit current admission and immutable claim reference')
    .action((options: {
      readonly taskId: string;
      readonly context: string;
    }) => {
      try {
        const taskId = optionalStringOption(options.taskId, 'task-id');
        if (!taskId) throw new Error('--task-id must be a non-empty string');
        const context = admittedInboxContext(process.cwd(), taskId, options.context);
        const recipient: TaskMessageRecipient = { kind: 'claim', claim: context.admission.identity.claim };
        deliverTaskInbox({
          repo_root: process.cwd(),
          task_id: taskId,
          source: context.source,
          recipient,
          execution_worktree: process.cwd(),
          delivery_channel: 'manual',
          delivered_at: new Date().toISOString(),
        });
        const result = listTaskInbox({
          repo_root: process.cwd(),
          task_id: taskId,
          source: context.source,
          recipient,
          execution_worktree: process.cwd(),
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputTaskInboxError(error);
      }
    });

  inbox
    .command('ack')
    .description('Acknowledge one message for the current bound owner')
    .requiredOption('--json', 'Output the acknowledgement result as JSON')
    .requiredOption('--task-id <taskId>', 'Existing admitted session task id')
    .requiredOption('--context <file>', 'JSON {admission, claim, session}; explicit current admission and immutable claim reference')
    .requiredOption('--message-id <messageId>', 'Message UUID to acknowledge')
    .action((options: {
      readonly taskId: string;
      readonly context: string;
      readonly messageId: string;
    }) => {
      try {
        const taskId = optionalStringOption(options.taskId, 'task-id');
        const messageId = optionalStringOption(options.messageId, 'message-id');
        if (!taskId || !messageId) throw new Error('--task-id and --message-id must be non-empty strings');
        const context = admittedInboxContext(process.cwd(), taskId, options.context);
        const recipient: TaskMessageRecipient = { kind: 'claim', claim: context.admission.identity.claim };
        const result = ackTaskInbox({
          repo_root: process.cwd(),
          task_id: taskId,
          source: context.source,
          message_id: messageId,
          recipient,
          execution_worktree: process.cwd(),
          acknowledged_at: new Date().toISOString(),
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputTaskInboxError(error);
      }
    });
  return fleet;
}

function readPrAssociations(path?: string): readonly FleetBoardPullRequestSelection[] {
  if (path === undefined) return [];
  const values: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(values)) throw new Error('PR associations must be an array');
  return values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.repository_id !== 'string'
      || typeof value.provider_issue_id !== 'string' || !/^[1-9][0-9]*$/u.test(value.provider_issue_id)
      || (value.task_id !== undefined && typeof value.task_id !== 'string')
      || Object.keys(value).some(key => !['repository_id','provider_issue_id','task_id','pull_request'].includes(key))) throw new Error('invalid PR association');
    return { repository_id: value.repository_id, provider_issue_id: value.provider_issue_id, ...(value.task_id === undefined ? {} : { task_id: value.task_id }), pull_request: validatePullRequestSelection(value.pull_request) };
  });
}

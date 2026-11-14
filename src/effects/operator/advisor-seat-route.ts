import {
  ADVISOR_SEAT_NOT_SENT, advisorBossCommandText, advisorBossCooldownSeconds, advisorTurnState,
  decodeAdvisorBossCommandRequest, decodeAdvisorSeatMessageRequest, decodeAdvisorSeatSend, decodeAdvisorSeatSendFailure, decodeAdvisorSeatTranscript,
  type AdvisorSeatFailure, type AdvisorSeatMessageRequestV1, type AdvisorSeatRequestV1, type AdvisorSeatSendOutcomeV1,
} from '../../core/board/advisor-seat';
import type { JsonValue } from '../../core/evidence/types';
import { BoardReadError, readRepositoryAdvisorTranscript, sendRepositoryAdvisor, type BoardReadInput } from './board-read';
import { OperatorAuditUnavailableError, operatorAuditPath, readOperatorAuditRecords, type OperatorWriteIntentRecordV1, type OperatorWriteResultRecordV1 } from './write-audit';
import type { OperatorWriteRoute } from './write-channel';
import { OPERATOR_RECONCILE_ACTION, OperatorWriteRefusal, operatorWriteBinding, operatorWriteError, type OperatorWriteResponse } from './write-run';

/**
 * The advisor seat routes of one board (#1756, D11). Each request runs one
 * board CLI child in the registered root; the CLI resolves the advisor
 * terminal from the hc seat labels. The client sends only the repository and
 * the parent.
 */
export const OPERATOR_ADVISOR_MESSAGES_ROUTE = /^\/api\/v1\/seats\/advisor\/messages$/u;
export const OPERATOR_ADVISOR_TRANSCRIPT_PATH = '/api/v1/seats/advisor/transcript' as const;
/** The four boss commands (#1757): the client sends the command id; the server sends the text through the same send. */
export const OPERATOR_ADVISOR_BOSS_COMMANDS_ROUTE = /^\/api\/v1\/seats\/advisor\/boss-commands$/u;

const RETRY = 'Retry in a few seconds.';
const CHECK_SEAT = 'Start the advisor seat of this repository with its seat labels, or close the extra advisor terminal, then retry.';

export const ADVISOR_SEAT_REFUSALS: Readonly<Record<AdvisorSeatFailure, { readonly status: number; readonly message: string; readonly next_action: string }>> = Object.freeze({
  invalid_request: { status: 400, message: 'The advisor seat route needs exactly repository_id and parent.', next_action: 'Request it with ?repository_id=<id>&parent=<issue number>.' },
  text_invalid: { status: 400, message: 'The advisor message is empty, too long or holds a control character.', next_action: 'Send at most 4000 characters with no control character except newline.' },
  repository_read_only: { status: 403, message: 'The repository is registered read-only, so the console does not write to its seats.', next_action: 'Register the repository with read-write access to send to its advisor seat.' },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: 'Choose a repository from the repository list.' },
  advisor_seat_absent: { status: 409, message: 'No live advisor seat terminal exists for this repository.', next_action: CHECK_SEAT },
  advisor_seat_ambiguous: { status: 409, message: 'More than one live advisor seat terminal exists for this repository.', next_action: CHECK_SEAT },
  advisor_send_unconfirmed: { status: 409, message: 'hc did not confirm the send, so the message may have reached the advisor seat.', next_action: OPERATOR_RECONCILE_ACTION },
  advisor_read_failed: { status: 502, message: 'hc did not read the advisor seat terminal.', next_action: RETRY },
  registry_unavailable: { status: 503, message: 'The repository registry could not be read.', next_action: 'Check ~/.repo-harness/registered-repos.json, then retry.' },
  github_unavailable: { status: 503, message: 'GitHub did not return the numeric id of this repository.', next_action: 'Check `gh auth status` in the repository, then retry.' },
  hc_unavailable: { status: 503, message: 'hc did not list the seat terminals.', next_action: 'Check that the hc core runs, then retry.' },
  advisor_busy: { status: 503, message: 'Too many board reads are in progress.', next_action: RETRY },
  advisor_unavailable: { status: 503, message: 'The board advisor command did not return a result.', next_action: 'Run `rh board advisor transcript --parent <n> --json` in the repository for the error.' },
  advisor_invalid: { status: 503, message: 'The advisor seat result failed validation.', next_action: 'Update repo-harness so that the operator and the board command use the same advisor seat protocol.' },
  advisor_timeout: { status: 504, message: 'The board advisor command did not finish in time.', next_action: RETRY },
  boss_cooldown: { status: 409, message: 'This boss command was sent for this parent inside its cooldown.', next_action: 'Wait retry_after_seconds, then send the command with a new request_id.' },
  advisor_turn_running: { status: 409, message: 'The advisor seat is running a turn.', next_action: 'Wait until the advisor seat finishes its turn, then send the command with a new request_id.' },
  advisor_turn_unknown: { status: 409, message: 'The advisor seat reports no known turn status.', next_action: 'Wait for the advisor seat to report a status, then send the command with a new request_id.' },
});

/**
 * The recorded result of a failed send names its seat. A failure that proves
 * nothing was sent keeps its own code. Any other failure (a timeout, a crash,
 * an unconfirmed `hc send`, an output that fails validation) may follow a
 * send, so it answers `reconcile_required`, as the write run does, and never
 * asks for a new request_id; its code stays in the `advisor_seat` field. A
 * failure before the send starts passes `not_sent`, whatever its code.
 */
function failedSend(request: AdvisorSeatRequestV1, code: AdvisorSeatFailure, terminal: string | null, delivery: 'not_sent' | 'unknown' = ADVISOR_SEAT_NOT_SENT.has(code) ? 'not_sent' : 'unknown'): OperatorWriteResponse {
  const advisorSeat: AdvisorSeatSendOutcomeV1 = { repository_id: request.repository_id, parent: request.parent, terminal, code, delivery };
  const entry = ADVISOR_SEAT_REFUSALS[code];
  const error = delivery === 'not_sent'
    ? operatorWriteError(code, entry.message, entry.next_action)
    : operatorWriteError('reconcile_required', 'The message may have reached the advisor seat, but the send is not confirmed.', OPERATOR_RECONCILE_ACTION);
  return { status: delivery === 'not_sent' ? entry.status : 409, body: { ...error, advisor_seat: advisorSeat } as unknown as JsonValue };
}

/** The child's own failure report names the resolved terminal; a report that does not match the request is invalid output. */
function childFailure(request: AdvisorSeatRequestV1, error: BoardReadError): OperatorWriteResponse {
  const code = error.code as AdvisorSeatFailure;
  if (error.failure === undefined) return failedSend(request, code, null);
  let terminal: string | null;
  try {
    const report = decodeAdvisorSeatSendFailure(error.failure);
    if (report.parent !== request.parent || report.code !== code) return failedSend(request, 'advisor_invalid', null);
    terminal = report.terminal;
  } catch {
    return failedSend(request, 'advisor_invalid', null);
  }
  return failedSend(request, code, terminal);
}

/** Runs one board CLI child under the server's board read cap; null when the cap is full or the server closes. */
export type BoardCliAdmission = <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T> | null;

/** One send of a text to the advisor seat inside an admitted board CLI slot: the #1756 path that both routes use. */
async function sendText(
  send: (input: BoardReadInput & { readonly text: string }) => Promise<unknown>,
  env: NodeJS.ProcessEnv,
  request: AdvisorSeatMessageRequestV1,
  signal: AbortSignal,
): Promise<OperatorWriteResponse> {
  let value: unknown;
  try {
    value = await send({ ...request, env, signal });
  } catch (error) {
    if (!(error instanceof BoardReadError)) throw error;
    return childFailure(request, error);
  }
  // The child exited 0, so `hc send` ran: an output that fails validation leaves delivery unknown.
  let sent;
  try { sent = decodeAdvisorSeatSend(value); } catch { return failedSend(request, 'advisor_invalid', null); }
  return sent.parent === request.parent ? { status: 200, body: sent as unknown as JsonValue } : failedSend(request, 'advisor_invalid', sent.terminal);
}

export function advisorSeatWriteRoute(input: {
  readonly admit: BoardCliAdmission;
  readonly env: NodeJS.ProcessEnv;
  /** The send child. Production runs the board CLI; only tests inject another. */
  readonly send?: (input: BoardReadInput & { readonly text: string }) => Promise<unknown>;
}): OperatorWriteRoute {
  const send = input.send ?? sendRepositoryAdvisor;
  return {
    id: 'advisor_seat_messages',
    path: OPERATOR_ADVISOR_MESSAGES_ROUTE,
    decode(fields) {
      const request = decodeAdvisorSeatMessageRequest(fields);
      return {
        operation: 'advisor_seat_message',
        // One advisor serves the whole repository (#1780), so the lock on the repository serializes the sends of every parent room to it.
        target: `advisor_seat:${request.repository_id}`,
        input: request as unknown as JsonValue,
        execute: async () => input.admit(signal => sendText(send, input.env, request, signal)) ?? failedSend(request, 'advisor_busy', null),
      };
    },
  };
}

/** A recorded send counts for the cooldown unless its result proves that nothing was sent: only a 200 or a reconcile_required may follow a send. */
function maySend(result: OperatorWriteResultRecordV1 | undefined): boolean {
  if (result === undefined || result.status === 200) return true;
  const isObject = (value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } => typeof value === 'object' && value !== null && !Array.isArray(value);
  const error = isObject(result.body) ? result.body.error : undefined;
  return isObject(error) && error.code === 'reconcile_required';
}

/**
 * The intent times (ms) of the earlier sends with this binding (the same
 * command, repository and parent) that may have reached the seat. The target
 * lock is held from the intent of the current request to its result, so the
 * newest intent with this binding is the current request, with no result yet.
 * A log that breaks this, or a time that does not parse, cannot prove the
 * cooldown, so it fails closed.
 */
function earlierSends(auditEnv: NodeJS.ProcessEnv | undefined, binding: string): readonly number[] {
  const intents: OperatorWriteIntentRecordV1[] = [];
  const results = new Map<string, OperatorWriteResultRecordV1>();
  for (const record of readOperatorAuditRecords(operatorAuditPath(auditEnv))) {
    if (record.phase === 'result') {
      if (!results.has(record.request_id)) results.set(record.request_id, record);
    } else if (record.binding_sha256 === binding && !intents.some(intent => intent.request_id === record.request_id)) {
      intents.push(record);
    }
  }
  const current = intents.pop();
  if (current === undefined || results.has(current.request_id)) throw new OperatorAuditUnavailableError('the current boss command is not the newest unresolved intent');
  return intents.filter(intent => maySend(results.get(intent.request_id))).map((intent) => {
    const at = Date.parse(intent.recorded_at);
    if (!Number.isFinite(at)) throw new OperatorAuditUnavailableError('an audit intent time does not parse');
    return at;
  });
}

/**
 * The boss commands (#1757, owner M71). Before the send: the cooldown of the
 * command for the parent from the audit log, then the #1756 read-back status
 * of the seat, which must show a finished turn. Each refusal is recorded and
 * proves nothing was sent.
 */
export function advisorBossCommandWriteRoute(input: {
  readonly admit: BoardCliAdmission;
  readonly env: NodeJS.ProcessEnv;
  /** The env of the write run, so the cooldown reads the audit log that the run writes. */
  readonly audit_env?: NodeJS.ProcessEnv;
  /** The send and read-back children. Production runs the board CLI; only tests inject others. */
  readonly send?: (input: BoardReadInput & { readonly text: string }) => Promise<unknown>;
  readonly read?: (input: BoardReadInput) => Promise<unknown>;
  /** The clock of the cooldown; only tests inject another. */
  readonly now?: () => number;
}): OperatorWriteRoute {
  const send = input.send ?? sendRepositoryAdvisor;
  const read = input.read ?? readRepositoryAdvisorTranscript;
  const now = input.now ?? Date.now;
  return {
    id: 'advisor_boss_commands',
    path: OPERATOR_ADVISOR_BOSS_COMMANDS_ROUTE,
    decode(fields) {
      const request = decodeAdvisorBossCommandRequest(fields);
      const operation = `advisor_boss_${request.command}`;
      // The same lock target as the free text send, so the two never interleave.
      const target = `advisor_seat:${request.repository_id}`;
      const operationInput = request as unknown as JsonValue;
      return {
        operation,
        target,
        input: operationInput,
        execute: async () => {
          let sentAt: readonly number[];
          try {
            sentAt = earlierSends(input.audit_env, operatorWriteBinding(operation, target, operationInput));
          } catch (error) {
            if (!(error instanceof OperatorAuditUnavailableError)) throw error;
            throw new OperatorWriteRefusal(503, 'audit_unavailable', 'The operator audit log could not prove the cooldown. Nothing was sent.', 'Check the operator audit log, then send the command with a new request_id.');
          }
          const remaining = advisorBossCooldownSeconds(request.command, sentAt, now());
          if (remaining > 0) {
            const refused = failedSend(request, 'boss_cooldown', null);
            return { status: refused.status, body: { ...(refused.body as Record<string, JsonValue>), retry_after_seconds: remaining } };
          }
          // The read-back and the send hold one board CLI slot, so a full cap refuses the command before either child runs.
          const run = input.admit(async (signal) => {
            // Nothing is sent before the read-back, so every failure here keeps its own code.
            let value: unknown;
            try {
              value = await read({ repository_id: request.repository_id, parent: request.parent, env: input.env, signal });
            } catch (error) {
              if (!(error instanceof BoardReadError)) throw error;
              return failedSend(request, error.code as AdvisorSeatFailure, null, 'not_sent');
            }
            let transcript;
            try { transcript = decodeAdvisorSeatTranscript(value); } catch { return failedSend(request, 'advisor_invalid', null, 'not_sent'); }
            if (transcript.parent !== request.parent) return failedSend(request, 'advisor_invalid', transcript.terminal, 'not_sent');
            const turn = advisorTurnState(transcript.status);
            if (turn !== 'over') return failedSend(request, turn === 'running' ? 'advisor_turn_running' : 'advisor_turn_unknown', transcript.terminal);
            const text = advisorBossCommandText(request.command, request.parent);
            return sendText(send, input.env, { repository_id: request.repository_id, parent: request.parent, text }, signal);
          });
          return run ?? failedSend(request, 'advisor_busy', null);
        },
      };
    },
  };
}

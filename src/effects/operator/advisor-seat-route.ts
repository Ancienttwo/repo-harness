import { decodeAdvisorSeatMessageRequest, decodeAdvisorSeatSend, type AdvisorSeatFailure } from '../../core/board/advisor-seat';
import type { JsonValue } from '../../core/evidence/types';
import { BoardReadError, sendRepositoryAdvisor, type BoardReadInput } from './board-read';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal } from './write-run';

/**
 * The advisor seat routes of one board (#1756, D11). Each request runs one
 * board CLI child in the registered root; the CLI resolves the advisor
 * terminal from the hc seat labels. The client sends only the repository and
 * the parent.
 */
export const OPERATOR_ADVISOR_MESSAGES_ROUTE = /^\/api\/v1\/seats\/advisor\/messages$/u;
export const OPERATOR_ADVISOR_TRANSCRIPT_PATH = '/api/v1/seats/advisor/transcript' as const;

const RETRY = 'Retry in a few seconds.';
const CHECK_SEAT = 'Start the advisor seat of this parent with its seat labels, or close the extra advisor terminal, then retry.';

export const ADVISOR_SEAT_REFUSALS: Readonly<Record<AdvisorSeatFailure, { readonly status: number; readonly message: string; readonly next_action: string }>> = Object.freeze({
  invalid_request: { status: 400, message: 'The advisor seat route needs exactly repository_id and parent.', next_action: 'Request it with ?repository_id=<id>&parent=<issue number>.' },
  text_invalid: { status: 400, message: 'The advisor message is empty, too long or holds a control character.', next_action: 'Send at most 4000 characters with no control character except newline.' },
  repository_read_only: { status: 403, message: 'The repository is registered read-only, so the console does not write to its seats.', next_action: 'Register the repository with read-write access to send to its advisor seat.' },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: 'Choose a repository from the repository list.' },
  advisor_seat_absent: { status: 409, message: 'No live advisor seat terminal exists for this repository and parent.', next_action: CHECK_SEAT },
  advisor_seat_ambiguous: { status: 409, message: 'More than one live advisor seat terminal exists for this repository and parent.', next_action: CHECK_SEAT },
  advisor_send_failed: { status: 502, message: 'hc did not send the message to the advisor seat terminal.', next_action: 'Check the advisor terminal in Herdr, then send again with a new request_id.' },
  advisor_read_failed: { status: 502, message: 'hc did not read the advisor seat terminal.', next_action: RETRY },
  registry_unavailable: { status: 503, message: 'The repository registry could not be read.', next_action: 'Check ~/.repo-harness/registered-repos.json, then retry.' },
  github_unavailable: { status: 503, message: 'GitHub did not return the numeric id of this repository.', next_action: 'Check `gh auth status` in the repository, then retry.' },
  hc_unavailable: { status: 503, message: 'hc did not list the seat terminals.', next_action: 'Check that the hc core runs, then retry.' },
  advisor_busy: { status: 503, message: 'Too many board reads are in progress.', next_action: RETRY },
  advisor_unavailable: { status: 503, message: 'The board advisor command did not return a result.', next_action: 'Run `repo-harness board advisor transcript --parent <n> --json` in the repository for the error.' },
  advisor_invalid: { status: 503, message: 'The advisor seat result failed validation.', next_action: 'Update repo-harness so that the operator and the board command use the same advisor seat protocol.' },
  advisor_timeout: { status: 504, message: 'The board advisor command did not finish in time.', next_action: RETRY },
});

/**
 * Child failures that prove nothing was sent: the run records them as the
 * request's result. A timeout, a crash or an output that fails validation may
 * follow a send, so the run leaves those `reconcile_required`.
 */
const NOT_SENT: ReadonlySet<string> = new Set<AdvisorSeatFailure>([
  'text_invalid', 'repository_read_only', 'repository_not_found', 'registry_unavailable', 'github_unavailable',
  'hc_unavailable', 'advisor_seat_absent', 'advisor_seat_ambiguous', 'advisor_send_failed',
]);

function refusal(code: AdvisorSeatFailure): OperatorWriteRefusal {
  const entry = ADVISOR_SEAT_REFUSALS[code];
  return new OperatorWriteRefusal(entry.status, code, entry.message, entry.next_action);
}

/** Runs one board CLI child under the server's board read cap; null when the cap is full or the server closes. */
export type BoardCliAdmission = <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T> | null;

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
        // The lock serializes the sends to the seats of one repository; the result body names the parent and the terminal.
        target: `advisor_seat:${request.repository_id}`,
        input: request as unknown as JsonValue,
        execute: async () => {
          const run = input.admit(signal => send({ ...request, env: input.env, signal }));
          if (run === null) throw refusal('advisor_busy');
          let value: unknown;
          try {
            value = await run;
          } catch (error) {
            if (error instanceof BoardReadError && NOT_SENT.has(error.code)) throw refusal(error.code as AdvisorSeatFailure);
            throw error;
          }
          return { status: 200, body: decodeAdvisorSeatSend(value) as unknown as JsonValue };
        },
      };
    },
  };
}

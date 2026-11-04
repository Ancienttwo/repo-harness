import { decodeOperatorDocSessionList, decodeOperatorDocSessionDetail, DOC_SESSION_VIEW_FAILURES, isDocSessionListRequest, isDocSessionDetailRequest, isDocSessionEventsRequest, OPERATOR_SESSION_LIST_PATH, OPERATOR_SESSION_DETAIL_ROUTE } from '../../core/operator/doc-session-views';
import { decodeOperatorDocSessionEvents } from '../../core/operator/doc-session-events';
import { decodeDocSessionFinalizationView, DOC_SESSION_FINALIZATION_FAILURES, OPERATOR_SESSION_FINALIZATION_ROUTE, type DocSessionFinalizationView } from '../../core/operator/doc-session-finalization-view';
import { startRuntimeService } from './runtime-service';
import { startDevActivityCollector } from '../dev-activity/collector';
import { startWorktreeCollector } from './worktree-collector';
import { OPERATOR_WORKTREES_CLEANUP_ROUTE, worktreeCleanupWriteRoute } from './worktree-cleanup';
import { decodeWorktrees, unavailableWorktrees, type WorktreesSnapshot } from '../../core/operator/worktrees';
import { decodeDevActivitySnapshot, unavailableDevActivitySnapshot } from '../../core/dev-activity/decode';
import { architecturePullRequestsSource } from '../../core/dev-activity/architecture';
import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import { startSetupCollector } from '../setup/collector';
import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../core/setup/decode';
import type { SetupSnapshotV2 } from '../../core/setup/types';
import { startBotAccessCollector, type BotAccessCacheV1 } from './bot-access';
import { decodeBotAccessSnapshot } from '../../core/operator/bot-access';
import { startSlackReviewCollector } from './slack-review-collector';
import { decodeSlackReviews, slackReviewsUnavailable, type SlackReviewsSnapshotV1 } from '../../core/operator/slack-review';
import { startCliInventoryCollector, type CliUsageSource } from '../setup/cli-inventory';
import { decodeCliInventory, unavailableCliInventory, type CliInventorySnapshotV1 } from '../../core/setup/cli-inventory';
import { startDocsCollector, type DocsRepositoryCache } from './docs-collector';
import { startTestsCollector, type TestsRepositoryCache } from './tests-collector';
import { startExecutionCollector, type ExecutionRepositoryCache } from './execution-collector';
import { startArchitectureMapCollector, type ArchitectureMapRepositoryCache } from './architecture-map-collector';
import { decodeArchitectureMap, OPERATOR_ARCHITECTURE_MAP_ROUTE, type ArchitectureMapRefusalV1, type ArchitectureMapUnavailableV1 } from '../../core/operator/architecture-map';
import { decodeTaskExecutionView, type ExecutionStateUnavailableReason, type TaskExecutionViewV1 } from '../../core/operator/execution-state';
import { decodeTaskMessagesView, TASK_MESSAGES_FAILURES, type TaskMessagesRefusal } from '../../core/operator/task-messages';
import { decodeTestsSnapshot, type TestsUnavailableReason } from '../../core/operator/tests';
import { DocsReadError } from './docs-reader';
import { decodeDocsFile, decodeDocsTree, OPERATOR_DOCS_FILE_KIND, type DocsUnavailableReason } from '../../core/operator/docs';
import { decodeRuntimeOverlay, unavailableRuntimeOverlay, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { ARCHITECTURE_FAILURES, parseArchitectureRequest, decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt, OPERATOR_ARCHITECTURE_HISTORY_ROUTE, OPERATOR_ARCHITECTURE_MODULES_ROUTE, OPERATOR_ARCHITECTURE_MODULE_ROUTE, OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE } from '../../core/operator/architecture';
import { ARCHITECTURE_HISTORY_TIMEOUT_MS, decodeArchitectureHistoryPage } from '../architecture/architecture-read';
export { OPERATOR_ARCHITECTURE_HISTORY_ROUTE, OPERATOR_ARCHITECTURE_MODULES_ROUTE, OPERATOR_ARCHITECTURE_MODULE_ROUTE, OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE } from '../../core/operator/architecture';
import { decodeNotifyStatus, NOTIFY_INSTALL_COMMAND, NOTIFY_START_COMMAND, type NotifyUnavailableReason } from '../../core/operator/notify-status';
import { decodeBoard } from '../../core/board/board';
import { decodeBoardParents } from '../../core/board/parents';
import { BoardReadError, readRepositoryBoard, readRepositoryBoardParents, type BoardParentsReadInput, type BoardReadInput } from './board-read';
import type { BoardParentsReadFailure, BoardReadFailure } from '../../core/operator/board-read';
import { startNotifyCollector, type NotifyCacheV1 } from './notify-collector';
import { readOperatorRepositories } from './repositories';
import type { OperatorRepositoriesV1 } from '../../core/operator/repositories';
import { createHash } from 'node:crypto';
import { decodeOperatorDocSessionDiff, decodeOperatorDocSessionLoss, DOC_SESSION_READ_FAILURES, type DocSessionReadFailure } from '../../core/operator/doc-session-changes';
import { OPERATOR_SESSION_DIFF_ROUTE, OPERATOR_SESSION_LOSS_ROUTE } from './doc-session-changes';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { reapOrphanedProcessGroups, spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup, type ProcessGroupTermination } from '../process-group-termination';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOperatorWriteToken, handleOperatorWrite, operatorWriteTokenCookie, type OperatorWriteRoute } from './write-channel';
import { AGENTS_CONFIGURATION_FAILURES, OPERATOR_SETTINGS_AGENTS_PATH, OPERATOR_SETTINGS_AGENTS_ROUTE, agentsSettingsWriteRoute, readAgentsSettings } from './agents-settings-route';
import { OPERATOR_SETTINGS_SEATS_PATH, OPERATOR_SETTINGS_SEATS_ROUTE, SEATS_CONFIGURATION_FAILURES, readSeatsSettings, seatsSettingsWriteRoute } from './seats-settings-route';
import { SeatsConfigurationError } from './seats-configuration';
import { AgentsConfigurationError } from '../configuration/agents-configuration';
import type { AgentRuntimesCacheV1 } from '../../core/operator/agents-settings';
import { OPERATOR_SESSION_EVENTS_ROUTE } from './doc-session-events';
import { OPERATOR_SESSIONS_ROUTE, docSessionCreateRoute } from './doc-session';

export const OPERATOR_SERVER_PROTOCOL = 1 as const;
export const OPERATOR_SERVICE_NAME = 'repo-harness-operator' as const;
export const OPERATOR_DEFAULT_HOST = '127.0.0.1' as const;
export const OPERATOR_DEFAULT_PORT = 4318 as const;
export const OPERATOR_DEFAULT_MAX_CONCURRENCY = 4 as const;
export const OPERATOR_DEFAULT_TIMEOUT_MS = 30_000 as const;
const OPERATOR_WORKER_CLEANUP_GRACE_MS = 500;
const OPERATOR_JOB_CONTROLLER_ACK_TIMEOUT_MS = 5_000;

const OPERATOR_DIAGNOSTIC_ACTION = 'Retry. If the error stays, restart `repo-harness operator serve`.';
const OPERATOR_REGISTRY_ACTION = 'Run `repo-harness fleet prune` to show the registry error.';
const OPERATOR_ASSET_ACTION = 'Build the operator UI with `bun run build:operator-web` and retry.';
const OPERATOR_ADOPT_ACTION = 'Adopt the repository with `repo-harness init`, then refresh the board.';

/**
 * The dispatcher's own matchers, exported so the inventory below and the test
 * that gates it compare the values `handleRequest` matches on rather than a
 * second copy of the same strings.
 */
export const OPERATOR_HEALTH_PATH = '/healthz' as const;
export const OPERATOR_API_PATH_PREFIX = '/api' as const;
/** The static fallback has no path shape of its own; it is whatever is left. */
export const OPERATOR_STATIC_ASSET_PATTERN = '/*' as const;
/**
 * The repository id is matched loosely and resolved strictly: the registry is
 * the authority on which ids exist, and duplicating its shape here would be a
 * second opinion about it.
 */
export const OPERATOR_TESTS_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/tests$/u;
/** The board of one parent issue in one registered repository; `?parent=<issue number>` is required. */
export const OPERATOR_BOARD_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/board$/u;
/** The open parent issues of one registered repository: the entry of the Board page. */
export const OPERATOR_BOARD_PARENTS_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/board\/parents$/u;
export const OPERATOR_EXECUTION_STATE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/execution$/u;
/** The stored task inbox of one task that the execution view of the same repository lists as verified. */
export const OPERATOR_TASK_MESSAGES_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/tasks\/([0-9a-f]{64})\/messages$/u;
export const OPERATOR_DOCS_TREE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/docs\/tree$/u;
export const OPERATOR_DOCS_FILE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/docs\/file$/u;
export const OPERATOR_RUNTIME_STATUS_PATH = '/api/v1/runtime/status' as const;
export const OPERATOR_NOTIFY_STATUS_PATH = '/api/v1/notify/status' as const;
export const OPERATOR_DEV_ACTIVITY_PATH = '/api/v1/dev-activity' as const;
/** The registered repositories: the one repository list of the console. */
export const OPERATOR_REPOSITORIES_PATH = '/api/v1/repositories' as const;
export const OPERATOR_WORKTREES_PATH = '/api/v1/worktrees' as const;
export const OPERATOR_SETUP_PATH = '/api/v1/setup' as const;
export const OPERATOR_BOT_ACCESS_PATH = '/api/v1/bot-access' as const;
export const OPERATOR_BOT_REVIEWS_PATH = '/api/v1/bot-reviews' as const;
export const OPERATOR_CLI_INVENTORY_PATH = '/api/v1/cli-inventory' as const;
const DEFAULT_STATIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/operator-ui',
);

export interface OperatorRouteV1 {
  readonly id: string;
  readonly method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The literal path, or the route regexp's source for a parameterized one. */
  readonly pattern: string;
  /** True only for a route that can change repository state. */
  readonly write: boolean;
}

/**
 * The complete read-only route surface, as a value.
 */
export const OPERATOR_ROUTES: readonly OperatorRouteV1[] = Object.freeze([
  Object.freeze({ id: 'health', method: 'GET', pattern: OPERATOR_HEALTH_PATH, write: false }),
  Object.freeze({ id: 'runtime_status', method: 'GET', pattern: OPERATOR_RUNTIME_STATUS_PATH, write: false }),
  Object.freeze({ id: 'notify_status', method: 'GET', pattern: OPERATOR_NOTIFY_STATUS_PATH, write: false }),
  Object.freeze({ id: 'dev_activity', method: 'GET', pattern: OPERATOR_DEV_ACTIVITY_PATH, write: false }),
  Object.freeze({ id: 'repositories', method: 'GET', pattern: OPERATOR_REPOSITORIES_PATH, write: false }),
  Object.freeze({ id: 'worktrees', method: 'GET', pattern: OPERATOR_WORKTREES_PATH, write: false }),
  // Removes only green worktrees; the effect runs in a supervised child process.
  Object.freeze({ id: 'worktrees_cleanup', method: 'POST', pattern: OPERATOR_WORKTREES_CLEANUP_ROUTE.source, write: true }),
  Object.freeze({ id: 'setup', method: 'GET', pattern: OPERATOR_SETUP_PATH, write: false }),
  Object.freeze({ id: 'bot_access', method: 'GET', pattern: OPERATOR_BOT_ACCESS_PATH, write: false }),
  Object.freeze({ id: 'bot_reviews', method: 'GET', pattern: OPERATOR_BOT_REVIEWS_PATH, write: false }),
  Object.freeze({ id: 'cli_inventory', method: 'GET', pattern: OPERATOR_CLI_INVENTORY_PATH, write: false }),
  Object.freeze({ id: 'tests', method: 'GET', pattern: OPERATOR_TESTS_ROUTE.source, write: false }),
  Object.freeze({ id: 'board', method: 'GET', pattern: OPERATOR_BOARD_ROUTE.source, write: false }),
  Object.freeze({ id: 'board_parents', method: 'GET', pattern: OPERATOR_BOARD_PARENTS_ROUTE.source, write: false }),
  Object.freeze({ id: 'execution_state', method: 'GET', pattern: OPERATOR_EXECUTION_STATE_ROUTE.source, write: false }),
  Object.freeze({ id: 'task_messages', method: 'GET', pattern: OPERATOR_TASK_MESSAGES_ROUTE.source, write: false }),
  Object.freeze({ id: 'docs_tree', method: 'GET', pattern: OPERATOR_DOCS_TREE_ROUTE.source, write: false }),
  Object.freeze({ id: 'docs_file', method: 'GET', pattern: OPERATOR_DOCS_FILE_ROUTE.source, write: false }),
  Object.freeze({ id: 'session_list', method: 'GET', pattern: OPERATOR_SESSION_LIST_PATH, write: false }),
  Object.freeze({ id: 'session_detail', method: 'GET', pattern: OPERATOR_SESSION_DETAIL_ROUTE.source, write: false }),
  Object.freeze({ id: 'session_events', method: 'GET', pattern: OPERATOR_SESSION_EVENTS_ROUTE.source, write: false }),
  Object.freeze({ id: 'session_finalization', method: 'GET', pattern: OPERATOR_SESSION_FINALIZATION_ROUTE.source, write: false }),
  // The doc session diff and discard loss list, with the digests that commit and discard (#1023) check.
  Object.freeze({ id: 'session_diff', method: 'GET', pattern: OPERATOR_SESSION_DIFF_ROUTE.source, write: false }),
  Object.freeze({ id: 'session_loss', method: 'GET', pattern: OPERATOR_SESSION_LOSS_ROUTE.source, write: false }),
  Object.freeze({ id: 'settings_agents', method: 'GET', pattern: OPERATOR_SETTINGS_AGENTS_PATH, write: false }),
  // The first write route: it changes only the host config's `agents` section.
  Object.freeze({ id: 'settings_agents_write', method: 'POST', pattern: OPERATOR_SETTINGS_AGENTS_ROUTE.source, write: true }),
  Object.freeze({ id: 'settings_seats', method: 'GET', pattern: OPERATOR_SETTINGS_SEATS_PATH, write: false }),
  // It changes only the host config's `seats` section; running panes keep their launch arguments.
  Object.freeze({ id: 'settings_seats_write', method: 'POST', pattern: OPERATOR_SETTINGS_SEATS_ROUTE.source, write: true }),
  // The second write route: it verifies citations, then creates the doc session's worktree in the managed root.
  Object.freeze({ id: 'sessions_create', method: 'POST', pattern: OPERATOR_SESSIONS_ROUTE.source, write: true }),
  Object.freeze({ id: 'architecture_modules', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MODULES_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_module', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MODULE_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_review_prompt', method: 'GET', pattern: OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_history', method: 'GET', pattern: OPERATOR_ARCHITECTURE_HISTORY_ROUTE.source, write: false }),
  Object.freeze({ id: 'architecture_map', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MAP_ROUTE.source, write: false }),
  Object.freeze({ id: 'static_asset', method: 'GET', pattern: OPERATOR_STATIC_ASSET_PATTERN, write: false }),
] as const);

/** HTTP status of each doc session read failure; the body is `{code}` only. */
const DOC_SESSION_READ_STATUS: Readonly<Record<DocSessionReadFailure, number>> = Object.freeze({
  session_not_found: 404, worktree_missing: 409, worktree_changed: 409, stale: 409, too_large: 413,
  filters_unsupported: 422, index_unsupported: 422, path_unsupported: 422, encoding_unsupported: 422, unavailable: 503, busy: 503, timeout: 504,
});

export type OperatorServerHost = '127.0.0.1' | '::1';

export interface OperatorServerOptions {
  /** Cache read only. Observation lifecycle runs outside the HTTP request. */
  readonly read_runtime_status?: () => RuntimeOverlay;
  readonly runtime_status_config?: string;
  /** Notify cache reader. GET notify_status and the Bot access collector read only this cache; neither runs Herdr. */
  readonly read_notify?: () => NotifyCacheV1;
  /**
   * Start the in-process notify collector (operator serve). The Bot access
   * collector also starts it, because it reads its cache. Ignored when a cache reader is injected.
   */
  readonly notify_collector?: boolean;
  /** Dev Activity cache reader. GET serves only this cache; it never collects. */
  readonly read_dev_activity?: () => DevActivitySnapshotV2;
  /** Start the in-process Dev Activity collector (operator serve). Ignored when a cache reader is injected. */
  readonly dev_activity_collector?: boolean;
  readonly read_worktrees?: () => WorktreesSnapshot;
  readonly worktree_collector?: boolean;
  /** Setup snapshot cache reader. GET serves only this cache; it never runs setup check. */
  readonly read_setup?: () => SetupSnapshotV2;
  /** Start the in-process setup collector (operator serve). Ignored when a cache reader is injected. */
  readonly setup_collector?: boolean;
  /** Bot access cache reader. GET serves only this cache; it never runs the doctor or Herdr. */
  readonly read_bot_access?: () => BotAccessCacheV1;
  /**
   * Start the in-process Bot access collector (operator serve). The Dot review
   * collector starts with it, because the Bots page reads both. Each one is
   * ignored when its cache reader is injected.
   */
  readonly bot_access_collector?: boolean;
  /** Dot review cache reader. GET serves only this cache; it never calls Slack. */
  readonly read_bot_reviews?: () => SlackReviewsSnapshotV1;
  /** CLI inventory cache reader. GET serves only this cache; it never probes a package manager. */
  readonly read_cli_inventory?: () => CliInventorySnapshotV1;
  /**
   * Start the in-process CLI inventory collector (operator serve). The caller
   * names the hook telemetry it reads for agent use. Ignored when a cache reader is injected.
   */
  readonly cli_inventory_collector?: { readonly usage_sources: () => readonly CliUsageSource[] };
  /** Docs cache reader by repository id. A file GET sends one object request to the reader it holds. */
  readonly read_docs?: (repositoryId: string) => DocsRepositoryCache;
  /** Start the in-process docs collector (operator serve). Ignored when a cache reader is injected. */
  readonly docs_collector?: boolean;
  /** The platform the docs session route checks. Production uses the host platform; only tests pass another. */
  readonly docs_session_platform?: NodeJS.Platform;
  /** Tests cache reader by repository id. GET serves only this cache; it never calls GitHub. */
  readonly read_tests?: (repositoryId: string) => TestsRepositoryCache;
  /** Start the in-process tests collector (operator serve). Ignored when a cache reader is injected. */
  readonly tests_collector?: boolean;
  /** Task execution cache reader by repository id. GET serves only this cache; it reads no session record or process. */
  readonly read_execution_state?: (repositoryId: string) => ExecutionRepositoryCache;
  /** Start the in-process execution-state collector (operator serve). Ignored when a cache reader is injected. */
  readonly execution_collector?: boolean;
  /** Architecture map cache reader by repository id. GET serves only this cache; it runs no archctx or git. */
  readonly read_architecture_map?: (repositoryId: string) => ArchitectureMapRepositoryCache;
  /** Start the in-process architecture map collector (operator serve). Ignored when a cache reader is injected. */
  readonly architecture_map_collector?: boolean;
  /** The board read: the board CLI's JSON for one repository and parent. Production runs the CLI; only tests inject another. */
  readonly read_board?: (input: BoardReadInput) => Promise<unknown>;
  /** The parent list read: the `board parents` CLI's JSON for one repository. Production runs the CLI; only tests inject another. */
  readonly read_board_parents?: (input: BoardParentsReadInput) => Promise<unknown>;
  readonly host?: string;
  /** Port 0 is accepted by the effect for ephemeral test servers. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly static_root?: string;
  readonly max_concurrency?: number;
  readonly timeout_ms?: number;
  /**
   * Write routes admitted for POST in addition to the production ones. Each
   * one must match a `POST`, `write: true` entry of the route inventory, or the
   * server does not start. Only tests pass this.
   */
  readonly write_routes?: readonly OperatorWriteRoute[];
  /** The route inventory write routes bind to. Production uses OPERATOR_ROUTES; only tests inject another. */
  readonly route_inventory?: readonly OperatorRouteV1[];
  /** Agent runtime probe cache reader. GET and POST settings read only this cache; neither probes. */
  readonly read_agent_runtimes?: () => AgentRuntimesCacheV1;
}

export interface OperatorServerHandle {
  readonly host: OperatorServerHost;
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
}

export interface OperatorHealthResponseV1 {
  readonly ok: true;
  readonly service: typeof OPERATOR_SERVICE_NAME;
  readonly protocol: typeof OPERATOR_SERVER_PROTOCOL;
}

export interface OperatorErrorResponseV1 {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly next_action: string;
  };
}

export class OperatorServerError extends Error {
  constructor(
    readonly code: 'invalid_argument' | 'operator_assets_unavailable' | 'operator_server_unavailable',
    message: string,
    readonly status_code = 500,
  ) {
    super(message);
    this.name = 'OperatorServerError';
  }
}

function assertLoopbackHost(host: string | undefined): OperatorServerHost {
  const value = host ?? OPERATOR_DEFAULT_HOST;
  if (value !== '127.0.0.1' && value !== '::1') {
    throw new OperatorServerError('invalid_argument', 'operator server host must be 127.0.0.1 or ::1', 400);
  }
  return value;
}

function assertPort(port: number | undefined): number {
  const value = port ?? OPERATOR_DEFAULT_PORT;
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new OperatorServerError('invalid_argument', 'operator server port must be an integer from 0 through 65535', 400);
  }
  return value;
}

function assertCollectionOption(value: number | undefined, name: string, minimum: number, maximum: number): number {
  const result = value ?? (name === 'max_concurrency'
    ? OPERATOR_DEFAULT_MAX_CONCURRENCY
    : OPERATOR_DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new OperatorServerError(
      'invalid_argument',
      `${name} must be an integer from ${minimum} through ${maximum}`,
      400,
    );
  }
  return result;
}

function jsonHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

/**
 * A Content-Security-Policy governs a document, and the only documents this
 * server serves are the static ones. JSON responses deliberately carry none:
 * they are already served `nosniff`, so a browser cannot execute them as a
 * document, and a policy attached to a non-document would be a header a reader
 * has to reason about for no boundary it protects.
 */
export const OPERATOR_STATIC_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" as const;

/** The methods a read resource implements; a write route implements POST only. */
const OPERATOR_ALLOWED_METHODS = 'GET, HEAD' as const;
const OPERATOR_WRITE_ALLOWED_METHODS = 'POST' as const;

function staticHeaders(contentType: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Content-Security-Policy': OPERATOR_STATIC_CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headOnly = false,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...jsonHeaders(),
    ...extraHeaders,
    'Content-Length': Buffer.byteLength(payload).toString(),
  });
  if (headOnly) response.end();
  else response.end(payload);
}

const OPERATOR_REFUSAL_PATH_MAX_CHARS = 200;

/**
 * The request target as the refusal log may state it: the path only, with the
 * query string dropped and the value JSON-quoted so a client-supplied control
 * character cannot forge a second log line.
 */
function refusalPath(request: IncomingMessage): string {
  const target = request.url ?? '/';
  const queryAt = target.indexOf('?');
  const path = queryAt < 0 ? target : target.slice(0, queryAt);
  return JSON.stringify(path.slice(0, OPERATOR_REFUSAL_PATH_MAX_CHARS));
}

/**
 * Refusals are invisible otherwise: an operator watching a board that silently
 * drops writes has nothing to look at. The line carries the decision and
 * nothing that could leak the request — no body, no headers, and in particular
 * no Origin, since the refused Origin is exactly the attacker-controlled string
 * a log reader would then be tempted to trust. stdout stays the single bound
 * URL line the CLI contract prints.
 */
function sendRefusal(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: OperatorErrorResponseV1,
  headOnly = false,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  process.stderr.write(
    `${OPERATOR_SERVICE_NAME} refused method=${request.method ?? 'GET'} status=${status} code=${body.error.code} path=${refusalPath(request)}\n`,
  );
  sendJson(response, status, body, headOnly, extraHeaders);
}

const NOTIFY_UNAVAILABLE: Readonly<Record<NotifyUnavailableReason, { readonly message: string; readonly next_action: string }>> = {
  notify_session_missing: { message: 'No notify relay install record exists.', next_action: `Run \`${NOTIFY_INSTALL_COMMAND}\`.` },
  notify_session_invalid: { message: 'The notify relay install record cannot be read.', next_action: `Run \`${NOTIFY_INSTALL_COMMAND}\` again.` },
  hc_unavailable: { message: 'hc did not list its terminals.', next_action: 'Check that the hc core runs, then wait for the next collection.' },
  relay_stopped: { message: 'The notify relay terminal is not live.', next_action: `Run \`${NOTIFY_START_COMMAND}\` to start it again.` },
  notify_config_unavailable: { message: 'The notify relay configuration could not be read.', next_action: `Run \`${NOTIFY_INSTALL_COMMAND}\` again, then wait for the next collection.` },
};

const TESTS_UNAVAILABLE: Readonly<Record<TestsUnavailableReason, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  tests_pending: { status: 503, message: 'The test results are not collected yet.', next_action: 'Retry in a minute.' },
  registry_unavailable: { status: 503, message: 'The repository registry is unreadable.', next_action: OPERATOR_REGISTRY_ACTION },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: OPERATOR_ADOPT_ACTION },
  default_branch_unknown: { status: 503, message: 'GitHub has not named the default branch of this repository.', next_action: 'Check `gh auth status` and the GitHub remote, then wait for the next collection.' },
  github_unavailable: { status: 503, message: 'GitHub did not answer the CI run or artifact query.', next_action: 'Check `gh auth status`, then wait for the next collection.' },
  no_daily_run: { status: 503, message: 'The default branch has no completed daily CI run.', next_action: 'Wait for the scheduled CI run of the default branch.' },
  artifacts_missing: { status: 503, message: 'The newest daily CI run has no JUnit and no test projection artifact.', next_action: 'Check that the daily CI job uploads junit-daily and test-projection.' },
  artifacts_expired: { status: 503, message: 'The artifacts of the newest daily CI run have expired.', next_action: 'Wait for the next scheduled CI run.' },
  artifact_too_large: { status: 503, message: 'A test artifact is larger than the collector reads.', next_action: 'Check the size of the junit-daily and test-projection artifacts.' },
  artifact_download_failed: { status: 503, message: 'A test artifact could not be downloaded.', next_action: 'Check `gh auth status`, then wait for the next collection.' },
  tests_invalid: { status: 503, message: 'The test results failed validation.', next_action: OPERATOR_DIAGNOSTIC_ACTION },
};

const ARCHITECTURE_MAP_RETRY = 'Wait for the next collection in 5 minutes.';
const ARCHITECTURE_MAP_UNAVAILABLE: Readonly<Record<ArchitectureMapUnavailableV1['reason'], { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  architecture_map_pending: { status: 503, message: 'The architecture map is not collected yet.', next_action: 'Retry in a minute.' },
  registry_unavailable: { status: 503, message: 'The repository registry is unreadable.', next_action: OPERATOR_REGISTRY_ACTION },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: OPERATOR_ADOPT_ACTION },
  model_unavailable: {
    status: 503, message: 'The committed architecture model could not be read, and archctx gave no error code.',
    next_action: 'Check that the registered path is a git checkout with a commit. `repo-harness fleet prune` lists registrations whose path is gone.',
  },
  archctx_error: {
    status: 503, message: 'archctx refused to read the committed architecture model.',
    next_action: 'Run `archctx export native --ref HEAD --json` in the repository. The archctx error gives its action and details.',
  },
  architecture_map_invalid: { status: 503, message: 'The architecture map failed validation.', next_action: OPERATOR_DIAGNOSTIC_ACTION },
  architecture_map_failed: { status: 503, message: 'The map process read the committed model, then failed.', next_action: `${ARCHITECTURE_MAP_RETRY} If the error stays, restart \`repo-harness operator serve\`.` },
  architecture_map_timeout: { status: 503, message: 'The map process passed its time limit.', next_action: `${ARCHITECTURE_MAP_RETRY} If the error stays, check that git and archctx answer in the repository.` },
  architecture_map_process_failed: { status: 503, message: 'The map process did not start or gave no result.', next_action: `${ARCHITECTURE_MAP_RETRY} If the error stays, restart \`repo-harness operator serve\`.` },
};

const EXECUTION_UNAVAILABLE: Readonly<Record<ExecutionStateUnavailableReason, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  execution_state_pending: { status: 503, message: 'The task execution state is not collected yet.', next_action: 'Retry in a few seconds.' },
  registry_unavailable: { status: 503, message: 'The repository registry is unreadable.', next_action: OPERATOR_REGISTRY_ACTION },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: OPERATOR_ADOPT_ACTION },
  execution_state_unavailable: { status: 503, message: 'The task session records of this repository could not be read.', next_action: 'Wait for the next collection. If the error stays, restart `repo-harness operator serve`.' },
};

const TASK_MESSAGES_REFUSALS: Readonly<Record<TaskMessagesRefusal, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  task_not_found: { status: 404, message: 'The execution state of this repository has no task with this id.', next_action: 'Read the task id from the execution route of the same repository.' },
  task_unverified: { status: 409, message: 'The task has no verified session, so its inbox is not served.', next_action: 'Wait until the execution route shows the task as verified.' },
};

const BOARD_UNAVAILABLE: Readonly<Record<BoardReadFailure, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  registry_unavailable: { status: 503, message: 'The repository registry is unreadable.', next_action: OPERATOR_REGISTRY_ACTION },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: OPERATOR_ADOPT_ACTION },
  board_collect_failed: { status: 503, message: 'The board read failed: GitHub, the local repository or the parent issue could not be read.', next_action: 'Run `repo-harness board --parent <n> --json` in the repository for the error.' },
  board_source_invalid: { status: 503, message: 'GitHub returned a board source that failed validation.', next_action: 'Run `repo-harness board --parent <n> --json` in the repository for the error.' },
  board_unavailable: { status: 503, message: 'The board command did not return a board.', next_action: 'Run `repo-harness board --parent <n> --json` in the repository for the error.' },
  board_timeout: { status: 504, message: 'The board read did not finish in time.', next_action: 'Refresh the board and retry.' },
  board_parent_invalid: { status: 400, message: 'The board needs exactly one parent issue number.', next_action: 'Request the board with ?parent=<issue number>.' },
  board_invalid: { status: 503, message: 'The board failed validation.', next_action: 'Update repo-harness so that the operator and the board command use the same board protocol.' },
  board_busy: { status: 503, message: 'Too many board reads are in progress.', next_action: 'Retry in a few seconds.' },
};

const BOARD_PARENTS_UNAVAILABLE: Readonly<Record<BoardParentsReadFailure, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  registry_unavailable: BOARD_UNAVAILABLE.registry_unavailable,
  repository_not_found: BOARD_UNAVAILABLE.repository_not_found,
  parents_github_failed: { status: 503, message: 'GitHub could not list the open issues of this repository.', next_action: 'Run `repo-harness board parents --json` in the repository for the error.' },
  parents_source_invalid: { status: 503, message: 'GitHub returned an open issue list that failed validation.', next_action: 'Run `repo-harness board parents --json` in the repository for the error.' },
  parents_hc_failed: { status: 503, message: 'hc could not list the seat terminals of this repository.', next_action: 'Run `repo-harness board parents --json` in the repository for the error.' },
  parents_unavailable: { status: 503, message: 'The board parents command did not return a parent list.', next_action: 'Run `repo-harness board parents --json` in the repository for the error.' },
  parents_timeout: { status: 504, message: 'The parent list read did not finish in time.', next_action: 'Refresh and retry.' },
  parents_invalid: { status: 503, message: 'The parent list failed validation.', next_action: 'Update repo-harness so that the operator and the board command use the same parent list protocol.' },
  parents_busy: BOARD_UNAVAILABLE.board_busy,
};

const DOCS_UNAVAILABLE: Readonly<Record<DocsUnavailableReason, { readonly status: number; readonly message: string; readonly next_action: string }>> = {
  docs_pending: { status: 503, message: 'The docs listing is not collected yet.', next_action: 'Retry in a minute.' },
  registry_unavailable: { status: 503, message: 'The repository registry is unreadable.', next_action: OPERATOR_REGISTRY_ACTION },
  repository_not_found: { status: 404, message: 'No registered repository has this id.', next_action: OPERATOR_ADOPT_ACTION },
  default_branch_unknown: { status: 503, message: 'GitHub has not named the default branch of this repository.', next_action: 'Check `gh auth status` and the GitHub remote, then wait for the next collection.' },
  github_remote_missing: { status: 503, message: 'No git remote points to the GitHub repository.', next_action: 'Add the GitHub remote to the repository.' },
  github_remote_ambiguous: { status: 503, message: 'More than one git remote points to the GitHub repository.', next_action: 'Keep one remote for the GitHub repository.' },
  branch_missing: { status: 503, message: 'The remote-tracking ref of the default branch does not exist.', next_action: 'Run `git fetch` in the repository.' },
  ref_invalid: { status: 503, message: 'The GitHub remote name and the default branch do not form a safe ref.', next_action: 'Either the name of the remote that points to the GitHub repository or the GitHub default branch name is the cause: it has a character outside A-Z, a-z, 0-9, ".", "_", "/" and "-", or a "..", "//", a part that starts with ".", a remote name that starts with "-", or a ".lock" end. Renaming the remote fixes only a remote name.' },
  docs_too_large: { status: 503, message: 'The docs directory has more files than the reader lists.', next_action: 'Reduce the number of files under docs/.' },
  docs_reader_unavailable: { status: 503, message: 'The docs reader is unavailable.', next_action: 'Retry after the next collection.' },
};

const DOCS_READ_REFUSALS: Readonly<Record<string, { readonly status: number; readonly message: string }>> = {
  path_invalid: { status: 400, message: 'The path is not a repository-relative path.' },
  path_denied: { status: 403, message: 'The path is outside docs/ or names a secret-bearing file.' },
  path_escape: { status: 403, message: 'The path resolves outside docs/ through a symlink or submodule.' },
  not_found: { status: 404, message: 'The file is not in the docs listing.' },
  not_a_file: { status: 404, message: 'The path is not a regular file.' },
  too_large: { status: 413, message: 'The file is larger than 512 KiB.' },
  not_text: { status: 415, message: 'The file is not UTF-8 text.' },
};

function errorBody(
  code: string,
  message: string,
  nextAction: string = OPERATOR_DIAGNOSTIC_ACTION,
): OperatorErrorResponseV1 {
  return Object.freeze({
    error: Object.freeze({ code, message, next_action: nextAction }),
  });
}

// Observation children are read-only. Git must not fetch promised objects,
// take optional locks or prompt. Apply these last so caller values cannot reopen them.
const OPERATOR_READ_ONLY_GIT_ENVIRONMENT = { GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } as const;

function repositoryWorkerEnvironment(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (env === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

type WindowsJobControllerResponse =
  | { readonly type: 'assigned' }
  | { readonly type: 'cleanup_ack' }
  | { readonly type: 'cleanup_failed' };

function windowsJobControllerResponse(value: unknown): WindowsJobControllerResponse | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'cleanup_ack' || record.type === 'cleanup_failed') return { type: record.type };
  if (record.type === 'assigned') return { type: 'assigned' };
  return null;
}

function writeChildJsonLine(child: ChildProcessWithoutNullStreams, value: unknown): boolean {
  if (child.stdin.destroyed || !child.stdin.writable) return false;
  try {
    child.stdin.write(`${JSON.stringify(value)}\n`);
    return true;
  } catch {
    return false;
  }
}

function childJsonLines(stream: NodeJS.ReadableStream, onValue: (value: unknown) => void): void {
  let buffered = '';
  stream.setEncoding('utf-8');
  stream.on('data', (chunk: string) => {
    buffered += chunk;
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      try { onValue(JSON.parse(line)); } catch { onValue(null); }
      newline = buffered.indexOf('\n');
    }
  });
}

// A collector without a PID or a signal failure cannot prove the group exited.
const UNCONFIRMED_COLLECTOR_TERMINATION: ProcessGroupTermination = { confirmed: false, forced: true };

function terminateCollectorProcessGroup(pid: number | undefined): Promise<ProcessGroupTermination> {
  if (pid === undefined) return Promise.resolve(UNCONFIRMED_COLLECTOR_TERMINATION);
  return terminateProcessGroup(pid, OPERATOR_WORKER_CLEANUP_GRACE_MS, {
    confirmMs: OPERATOR_JOB_CONTROLLER_ACK_TIMEOUT_MS,
  }).catch(() => UNCONFIRMED_COLLECTOR_TERMINATION);
}

function windowsJobControllerPath(): string {
  return fileURLToPath(new URL('../../../assets/operator/windows-job-controller.ps1', import.meta.url));
}

/** A supervised read that was aborted or outlived its grace period; callers report it as unavailable. */
class OperatorReadCancelledError extends Error {
  constructor() { super('operator read cancelled'); }
}

export class OperatorTaskReadError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** CLI uses the same supervised reader and closed schema as the HTTP route. */
export function readBoundedDocSessionFinalization(env: NodeJS.ProcessEnv, sessionId: string): Promise<DocSessionFinalizationView> {
  const request = { session_id: sessionId };
  return readSupervisedOperatorProcess({
    process_path: fileURLToPath(new URL('./task-read-process.ts', import.meta.url)), env,
    signal: AbortSignal.timeout(OPERATOR_DEFAULT_TIMEOUT_MS),
    start: { type: 'start', protocol: 1, kind: 'doc_session_finalization', request, env: repositoryWorkerEnvironment(env) },
    response: value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const response = value as Record<string, unknown>;
      if (Object.keys(response).length !== 2) return null;
      if (response.ok === true && 'snapshot' in response) {
        try { return { ok: true, snapshot: decodeDocSessionFinalizationView(response.snapshot, request) }; } catch { return null; }
      }
      if (response.ok === false && typeof response.code === 'string' && DOC_SESSION_FINALIZATION_FAILURES.some(code => code === response.code)) return { ok: false, code: response.code };
      if (response.ok === false && response.cancelled === true) return { ok: false, cancelled: true };
      return null;
    },
    failure: code => new OperatorTaskReadError(code),
  });
}

type SupervisedReadResponse<T> =
  | { readonly ok: true; readonly snapshot: T }
  | { readonly ok: false; readonly code: string }
  | { readonly ok: false; readonly cancelled: true };

/**
 * POSIX reads run in a server-owned, registered detached process group. On
 * Windows the server owns only the Job controller child; that Job owner
 * creates the inert read process and assigns its exact handle before it
 * forwards the start payload. Descendants then inherit the Job.
 */
function readSupervisedOperatorProcess<T>(input: {
  readonly process_path: string;
  readonly start: Readonly<Record<string, unknown>>;
  readonly response: (value: unknown) => SupervisedReadResponse<T> | null;
  readonly failure: (code: string) => Error;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal: AbortSignal;
}): Promise<T> {
  if (input.signal.aborted) return Promise.reject(new OperatorReadCancelledError());
  return new Promise((resolveRead, rejectRead) => {
    const workerEnvironment = { ...process.env, ...repositoryWorkerEnvironment(input.env), ...OPERATOR_READ_ONLY_GIT_ENVIRONMENT };
    const collector = process.platform === 'win32'
      ? null
      : spawnRegisteredProcessGroup('operator-collector', () => spawn(process.execPath, [input.process_path], {
        env: workerEnvironment,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        windowsHide: true,
      }));
    const controller = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsJobControllerPath()], {
        env: workerEnvironment,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      : null;
    let settled = false;
    let cancellationRequested = false;
    let collectorClosed = false;
    let controllerAssigned = controller === null;
    let controllerClosed = controller === null;
    let controllerFailed = false;
    let controllerCleanupAcknowledged = controller === null;
    let controllerCleanupRequested = false;
    let collectorResponse: SupervisedReadResponse<T> | null = null;
    let intended: { readonly ok: true; readonly snapshot: T } | { readonly ok: false; readonly error: unknown } | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
    let controllerCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let posixFinalizing = false;
    let posixCancellationPending = false;
    const finish = (
      outcome:
        | { readonly ok: true; readonly snapshot: T }
        | { readonly ok: false; readonly error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', onAbort);
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      if (acknowledgementTimer !== null) clearTimeout(acknowledgementTimer);
      if (controllerCloseTimer !== null) clearTimeout(controllerCloseTimer);
      collector?.stdin.end();
      controller?.stdin.end();
      if (outcome.ok) resolveRead(outcome.snapshot);
      else rejectRead(outcome.error);
    };
    const unavailable = (message: string) => new Error(message);
    const failWindowsController = (message: string): void => {
      if (settled || controller === null || controllerFailed) return;
      controllerFailed = true;
      intended = { ok: false, error: unavailable(message) };
      cancellationRequested = true;
      if (acknowledgementTimer !== null) {
        clearTimeout(acknowledgementTimer);
        acknowledgementTimer = null;
      }
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      try { controller.kill('SIGKILL'); } catch { /* controller close remains the cleanup fence */ }
    };
    const requestWindowsCleanup = (terminate: boolean): void => {
      if (controller === null || controllerCleanupRequested || settled) return;
      controllerCleanupRequested = true;
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      if (!writeChildJsonLine(controller, { type: terminate ? 'terminate' : 'cleanup' })) {
        failWindowsController('Windows Job controller is unavailable');
        return;
      }
      acknowledgementTimer = setTimeout(() => {
        failWindowsController('Windows Job controller did not acknowledge cleanup');
      }, OPERATOR_JOB_CONTROLLER_ACK_TIMEOUT_MS);
    };
    const finalizePosix = (): void => {
      if (settled || collector === null || !collectorClosed || intended === null || posixFinalizing) return;
      posixFinalizing = true;
      const outcome = intended;
      void terminateCollectorProcessGroup(collector.pid).then((termination) => {
        if (!termination.confirmed) finish({ ok: false, error: unavailable('Read process process group did not exit') });
        else finish(outcome);
      });
    };
    const finalize = (): void => {
      if (controller !== null) {
        if (controllerFailed) {
          if (controllerClosed && intended !== null) finish(intended);
          return;
        }
        if (intended === null) return;
        if (!controllerAssigned) {
          failWindowsController('Windows Job controller returned a collector response before assignment');
          return;
        }
        if (!controllerCleanupRequested) requestWindowsCleanup(cancellationRequested);
        if (controllerCleanupAcknowledged && controllerClosed) finish(intended);
        return;
      }
      if (collector === null || !collectorClosed) return;
      if (intended === null) intended = { ok: false, error: unavailable('Read process exited without a response') };
      if (posixCancellationPending) return;
      finalizePosix();
    };
    const recordCollectorResponse = (value: unknown): void => {
      const response = input.response(value);
      if (response === null) {
        intended = { ok: false, error: unavailable('Read process returned an invalid response') };
      } else if (response.ok) {
        collectorResponse = response;
        intended = cancellationRequested
          ? { ok: false, error: new OperatorReadCancelledError() }
          : { ok: true, snapshot: response.snapshot };
      } else if ('cancelled' in response) {
        collectorResponse = response;
        intended = { ok: false, error: new OperatorReadCancelledError() };
      } else {
        collectorResponse = response;
        intended = { ok: false, error: input.failure(response.code) };
      }
      finalize();
    };
    const onAbort = (): void => {
      if (settled || cancellationRequested) return;
      cancellationRequested = true;
      if (controller !== null) {
        if (!writeChildJsonLine(controller, { type: 'cancel' })) {
          failWindowsController('Windows Job controller cannot accept cooperative cancellation');
          return;
        }
        cleanupTimer = setTimeout(() => {
          cleanupTimer = null;
          intended = { ok: false, error: new OperatorReadCancelledError() };
          requestWindowsCleanup(true);
        }, OPERATOR_WORKER_CLEANUP_GRACE_MS);
        return;
      }
      if (collector === null || !writeChildJsonLine(collector, { type: 'cancel' })) {
        intended = { ok: false, error: unavailable('Read process cannot accept cooperative cancellation') };
      }
      if (collector === null) return;
      posixCancellationPending = true;
      void terminateCollectorProcessGroup(collector.pid).then((termination) => {
        posixCancellationPending = false;
        // A collector that outlives the cooperative grace period has timed out,
        // whatever it reported before the forced kill.
        if (termination.forced) intended = { ok: false, error: new OperatorReadCancelledError() };
        if (!termination.confirmed) finish({ ok: false, error: unavailable('Read process process group did not exit') });
        else finalize();
      });
    };
    input.signal.addEventListener('abort', onAbort, { once: true });
    if (collector !== null) {
      childJsonLines(collector.stdout, recordCollectorResponse);
      collector.stderr.resume();
      collector.once('error', (error) => {
        intended = { ok: false, error: unavailable(`Read process failed: ${error.message}`) };
      });
      collector.once('close', () => {
        collectorClosed = true;
        if (collectorResponse === null && intended === null) intended = { ok: false, error: unavailable('Read process exited without a response') };
        finalize();
      });
    }
    if (controller !== null) {
      childJsonLines(controller.stdout, (value) => {
        const response = windowsJobControllerResponse(value);
        if (response === null) {
          recordCollectorResponse(value);
          return;
        }
        if (response.type === 'assigned') {
          if (controllerAssigned) {
            failWindowsController('Windows Job controller assigned more than one collector');
            return;
          }
          controllerAssigned = true;
          if (cancellationRequested) return;
          if (!writeChildJsonLine(controller, input.start)) {
            intended = { ok: false, error: unavailable('Windows Job controller cannot forward the assigned start payload') };
            requestWindowsCleanup(true);
          }
          return;
        }
        if (response.type === 'cleanup_ack') {
          controllerCleanupAcknowledged = true;
          if (acknowledgementTimer !== null) {
            clearTimeout(acknowledgementTimer);
            acknowledgementTimer = null;
          }
          controllerCloseTimer = setTimeout(() => {
            failWindowsController('Windows Job controller did not exit after cleanup acknowledgement');
          }, OPERATOR_JOB_CONTROLLER_ACK_TIMEOUT_MS);
          finalize();
          return;
        }
        failWindowsController('Windows Job controller could not prove cleanup');
      });
      controller.stderr.resume();
      controller.once('error', (error) => {
        failWindowsController(`Windows Job controller failed: ${error.message}`);
      });
      controller.once('close', () => {
        controllerClosed = true;
        if (controllerCloseTimer !== null) {
          clearTimeout(controllerCloseTimer);
          controllerCloseTimer = null;
        }
        if (!controllerCleanupAcknowledged && !settled) {
          failWindowsController('Windows Job controller exited without cleanup acknowledgement');
        }
        finalize();
      });
      if (!writeChildJsonLine(controller, {
        type: 'launch',
        executable: process.execPath,
        collector_path: input.process_path,
      })) {
        failWindowsController('Windows Job controller cannot accept collector launch');
      }
    } else if (collector !== null && !writeChildJsonLine(collector, input.start)) {
      finish({ ok: false, error: unavailable('Read process cannot accept start payload') });
    }
    if (input.signal.aborted) {
      onAbort();
    }
  });
}

function contentType(pathname: string): string {
  switch (extname(pathname).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function fileIfSafe(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (relative.length === 0 || isAbsolute(relative) || relative.split('/').includes('..')) return null;
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${sep}`)) return null;
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return candidate;
  } catch (_error) {
    return null;
  }
}

function fallbackIndex(root: string): string | null {
  return fileIfSafe(root, '/');
}

function isHtmlNavigation(request: IncomingMessage, pathname: string): boolean {
  if (pathname === '/') return true;
  if (extname(pathname) !== '') return false;
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html');
}

function safePathRoot(root: string): string {
  return resolve(root);
}

function expectedRequestAuthority(host: OperatorServerHost, request: IncomingMessage): string | null {
  const localPort = request.socket.localPort;
  if (!Number.isSafeInteger(localPort)) return null;
  const authorityHost = host === '::1' ? `[${host}]` : host;
  return `${authorityHost}:${localPort}`;
}

/** HTTP status for an architecture read failure code. */
export function architectureStatus(code: string): number {
  return code === 'timeout' ? 504 : code.endsWith('_not_found') ? 404 : code === 'invalid_request' || code === 'shard_out_of_range' ? 400
    : code === 'worktree_changed_during_read' ? 409 : code === 'unavailable' || code === 'busy' ? 503 : 422;
}

export async function startOperatorServer(
  options: OperatorServerOptions = {},
): Promise<OperatorServerHandle> {
  const host = assertLoopbackHost(options.host);
  const port = assertPort(options.port);
  const maxConcurrency = assertCollectionOption(options.max_concurrency, 'max_concurrency', 1, 16);
  const timeoutMs = assertCollectionOption(options.timeout_ms, 'timeout_ms', 1_000, 30_000);
  const staticRoot = safePathRoot(options.static_root ?? DEFAULT_STATIC_ROOT);
  const activeTaskReadCancellers = new Set<() => void>();
  const activeTaskReadCompletions = new Set<Promise<void>>();
  const activeBoardReads = new Set<AbortController>();
  const boardCompletions = new Set<Promise<void>>();
  const boardEnvironment: NodeJS.ProcessEnv = { ...process.env, ...repositoryWorkerEnvironment(options.env), ...OPERATOR_READ_ONLY_GIT_ENVIRONMENT, GH_PROMPT_DISABLED: '1' };

  const handleBoundedTaskRead = <TRequest extends object, TSnapshot>(
    response: ServerResponse, headOnly: boolean, input: TRequest,
    decode: (value: unknown, request: TRequest) => TSnapshot,
    failures: readonly string[], kind: 'architecture' | 'doc_session_diff' | 'doc_session_loss' | 'doc_session_list' | 'doc_session_detail' | 'doc_session_events' | 'doc_session_finalization' | 'task_messages',
    injected?: (request: TRequest & { readonly signal: AbortSignal }) => Promise<TSnapshot>,
    failureStatus: (failure: string) => number = failure => failure === 'history_unavailable' || failure === 'task_not_found' ? 404 : failure === 'stale' ? 409 : failure === 'too_large' ? 413 : 503,
    cacheRequest?: IncomingMessage,
    readTimeoutMs = timeoutMs,
  ): void => {
    if (closed) { sendJson(response,503,{code:'unavailable'},headOnly); return; }
    if (activeTaskReadCancellers.size >= maxConcurrency) { sendJson(response,503,{code:'busy'},headOnly); return; }
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => finish('unavailable');
    const release = () => activeTaskReadCancellers.delete(cancel);
    const finish = (failure?: string, snapshot?: TSnapshot) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      response.removeListener('close',cancel);
      if (response.destroyed) return;
      if (failure) sendJson(response, failureStatus(failure),{code:failure},headOnly);
      else if (cacheRequest) {
        const etag = `"${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}"`;
        if (cacheRequest.headers['if-none-match'] === etag) {
          response.writeHead(304, { ...jsonHeaders(), ETag: etag }); response.end();
        } else sendJson(response, 200, snapshot, headOnly, { ETag: etag });
      } else sendJson(response,200,snapshot,headOnly);
    };
    const accept = (value: unknown) => {
      try { finish(undefined,decode(value,input)); }
      catch { finish('unavailable'); }
    };
    activeTaskReadCancellers.add(cancel);
    response.once('close',cancel);
    timer = setTimeout(()=>finish('timeout'),readTimeoutMs);
    const pending = injected
      ? Promise.resolve().then(()=>{
        if (controller.signal.aborted) throw new OperatorTaskReadError('unavailable');
        return injected({...input,signal:controller.signal});
      })
      : readSupervisedOperatorProcess<TSnapshot>({
        process_path:fileURLToPath(new URL('./task-read-process.ts',import.meta.url)),
        env:options.env,
        signal:controller.signal,
        start:{type:'start',protocol:1,kind,request:input,env:repositoryWorkerEnvironment(options.env)},
        response:value=>{
          if (!value || typeof value !== 'object') return null;
          const record=value as Record<string,unknown>;
          if (record.ok === true && Object.keys(record).length === 2 && 'snapshot' in record) {
            try { return {ok:true,snapshot:decode(record.snapshot,input)}; } catch { return null; }
          }
          if (record.ok === false && Object.keys(record).length === 2 && typeof record.code === 'string' && failures.includes(record.code)) {
            return {ok:false,code:record.code};
          }
          if (record.ok === false && Object.keys(record).length === 2 && record.cancelled === true) return {ok:false,cancelled:true};
          return null;
        },
        failure:code=>new OperatorTaskReadError(code),
      });
    // The supervisor settles only after process-tree cleanup, including blocked sync Git.
    const completion = pending.then(accept,error=>finish(error instanceof OperatorTaskReadError ? error.code : 'unavailable')).finally(release);
    activeTaskReadCompletions.add(completion);
    void completion.finally(()=>activeTaskReadCompletions.delete(completion));
  };

  /**
   * One board CLI run per request. The board and the parent list share one
   * concurrency cap. The CLI's JSON is decoded once here; a client that
   * leaves aborts the run.
   */
  const handleBoardCliRead = <F extends string>(
    request: IncomingMessage, response: ServerResponse, headOnly: boolean,
    refusals: Readonly<Record<F, { readonly status: number; readonly message: string; readonly next_action: string }>>,
    codes: { readonly busy: F; readonly invalid: F; readonly unavailable: F },
    read: (signal: AbortSignal) => Promise<unknown>, decode: (value: unknown) => unknown,
  ): void => {
    const refuse = (code: F) => {
      const refusal = refusals[code];
      sendRefusal(request, response, refusal.status, errorBody(code, refusal.message, refusal.next_action), headOnly);
    };
    if (closed || activeBoardReads.size >= maxConcurrency) { refuse(codes.busy); return; }
    const controller = new AbortController();
    activeBoardReads.add(controller);
    const onClose = () => controller.abort();
    response.once('close', onClose);
    const completion: Promise<void> = Promise.resolve()
      .then(() => read(controller.signal))
      .then((value) => {
        if (response.destroyed) return;
        let decoded;
        try { decoded = decode(value); } catch { refuse(codes.invalid); return; }
        sendJson(response, 200, decoded, headOnly);
      }, (error: unknown) => {
        if (response.destroyed) return;
        refuse(error instanceof BoardReadError && Object.hasOwn(refusals, error.code) ? error.code as F : codes.unavailable);
      })
      .finally(() => {
        activeBoardReads.delete(controller);
        response.removeListener('close', onClose);
        boardCompletions.delete(completion);
      });
    boardCompletions.add(completion);
  };

  /**
   * One object request to the collector's resident process, under its own
   * concurrency cap and deadline. A client that leaves gets no late reply.
   */
  let activeDocsReads = 0;
  const handleDocsFile = (request: IncomingMessage, response: ServerResponse, headOnly: boolean,
    cache: DocsRepositoryCache & { readonly state: 'ready' }, path: string): void => {
    if (closed) { sendRefusal(request, response, 503, errorBody('docs_reader_unavailable', DOCS_UNAVAILABLE.docs_reader_unavailable.message), headOnly); return; }
    if (activeDocsReads >= maxConcurrency) { sendRefusal(request, response, 503, errorBody('docs_busy', 'Too many docs reads are in progress.', 'Retry in a few seconds.'), headOnly); return; }
    activeDocsReads += 1;
    let settled = false;
    const finish = (send: () => void) => {
      if (settled) return;
      settled = true;
      activeDocsReads -= 1;
      clearTimeout(timer);
      response.removeListener('close', abandon);
      if (!response.destroyed && !response.writableEnded) send();
    };
    const abandon = () => finish(() => {});
    const timer = setTimeout(() => finish(() => sendRefusal(request, response, 504, errorBody('docs_timeout', 'The docs read did not finish in time.', 'Retry the read.'), headOnly)), timeoutMs);
    response.once('close', abandon);
    cache.reader.file(path).then(file => {
      let body;
      try {
        body = decodeDocsFile({ protocol: 1, kind: OPERATOR_DOCS_FILE_KIND, repository_id: cache.tree.repository_id, ref: cache.tree.ref, ...file });
      } catch {
        finish(() => sendRefusal(request, response, 503, errorBody('docs_reader_unavailable', DOCS_UNAVAILABLE.docs_reader_unavailable.message), headOnly));
        return;
      }
      finish(() => sendJson(response, 200, body, headOnly));
    }, (error: unknown) => {
      const code = error instanceof DocsReadError ? error.code : 'git_read_failed';
      const refusal = DOCS_READ_REFUSALS[code];
      finish(() => sendRefusal(request, response, refusal?.status ?? 503, refusal
        ? errorBody(code, refusal.message, 'Choose a file from the docs tree.')
        : code === 'pending' ? errorBody('docs_pending', DOCS_UNAVAILABLE.docs_pending.message, DOCS_UNAVAILABLE.docs_pending.next_action)
          : errorBody('docs_reader_unavailable', DOCS_UNAVAILABLE.docs_reader_unavailable.message, DOCS_UNAVAILABLE.docs_reader_unavailable.next_action), headOnly));
    });
  };

  const writeToken = createOperatorWriteToken();
  const readAgentRuntimes = (): AgentRuntimesCacheV1 =>
    (options.read_agent_runtimes ?? setup?.read_agent_runtimes ?? (() => ({ status: 'unavailable', reason: 'collection_pending' } as const)))();
  // An injected route (tests only; the serve CLI strips write_routes) replaces
  // the production binding with the same id, so a test serves its own handler
  // behind the production inventory entry.
  const injectedWriteRoutes = options.write_routes ?? [];
  const writeRoutes = [
    agentsSettingsWriteRoute(readAgentRuntimes, options.env),
    seatsSettingsWriteRoute(options.env),
    docSessionCreateRoute({
      env: options.env ?? process.env,
      platform: options.docs_session_platform,
      // The same docs cache the docs GET routes serve; citations verify against it.
      docs_reader: repositoryId => {
        const cache = (options.read_docs ?? docs?.read)?.(repositoryId);
        return cache?.state === 'ready' ? cache.reader : null;
      },
    }),
    worktreeCleanupWriteRoute(options.env),
  ].filter(route => !injectedWriteRoutes.some(injected => injected.id === route.id))
    .concat(injectedWriteRoutes);
  // The inventory is the one write authority: a handler it does not declare
  // as a POST write route is a second authority, and a declared write route
  // without a handler is a broken contract, so the server refuses to start.
  const routeInventory = options.route_inventory ?? OPERATOR_ROUTES;
  for (const route of writeRoutes) {
    const entry = routeInventory.find(candidate => candidate.id === route.id);
    if (entry?.method !== 'POST' || entry.write !== true || entry.pattern !== route.path.source) {
      throw new OperatorServerError('invalid_argument', `write route ${JSON.stringify(route.id)} has no matching POST write entry in the route inventory`, 400);
    }
  }
  for (const entry of routeInventory) {
    if (entry.write && !writeRoutes.some(route => route.id === entry.id)) {
      throw new OperatorServerError('invalid_argument', `route inventory entry ${JSON.stringify(entry.id)} has no write route`, 400);
    }
  }
  // Doc session events are served only when the inventory declares them; production OPERATOR_ROUTES does not yet.
  const sessionEventsRead = routeInventory.some(entry => entry.id === 'session_events' && entry.method === 'GET' && !entry.write
    && entry.pattern === OPERATOR_SESSION_EVENTS_ROUTE.source);
  const matchWriteRoute = (pathname: string): { readonly route: OperatorWriteRoute; readonly params: readonly string[] } | null => {
    for (const route of writeRoutes) {
      const match = route.path.exec(pathname);
      if (match !== null && match[0] === pathname) return { route, params: match.slice(1) };
    }
    return null;
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const headOnly = method === 'HEAD';
    const expectedAuthority = expectedRequestAuthority(host, request);
    const requestHost = request.headers.host?.trim().toLowerCase();
    if (expectedAuthority === null || requestHost !== expectedAuthority) {
      sendRefusal(request, response, 421, errorBody('host_not_allowed', 'The request Host is not allowed.'), headOnly);
      return;
    }
    const expectedOrigin = `http://${expectedAuthority}`;
    const requestOrigin = request.headers.origin;
    if (requestOrigin !== undefined && requestOrigin !== expectedOrigin) {
      sendRefusal(request, response, 403, errorBody('origin_not_allowed', 'The request Origin is not allowed.'), headOnly);
      return;
    }
    // A write is identified before it is routed: it must name this service as
    // its Origin and come from a same-origin fetch, whatever path it targets.
    const write = method === 'POST';
    if (write && requestOrigin === undefined) {
      sendRefusal(request, response, 403, errorBody('origin_required', 'A write request must send the Origin of this service.', 'Send the request from the operator page.'));
      return;
    }
    if (write && request.headers['sec-fetch-site'] !== 'same-origin') {
      sendRefusal(request, response, 403, errorBody('fetch_site_not_allowed', 'A write request must be a same-origin fetch.', 'Send the request from the operator page.'));
      return;
    }
    if (!write && method !== 'GET' && method !== 'HEAD') {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only GET and HEAD are supported.'), false, {
        Allow: OPERATOR_ALLOWED_METHODS,
      });
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? '/', expectedOrigin);
      if (url.origin !== expectedOrigin) {
        sendRefusal(request, response, 421, errorBody('host_not_allowed', 'The request URL authority is not allowed.'), headOnly);
        return;
      }
    } catch (_error) {
      sendRefusal(request, response, 400, errorBody('invalid_request', 'The request URL is invalid.'), headOnly);
      return;
    }
    const pathname = url.pathname;
    const writeMatch = matchWriteRoute(pathname);
    if (write) {
      if (writeMatch === null) {
        sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only GET and HEAD are supported.'), false, {
          Allow: OPERATOR_ALLOWED_METHODS,
        });
        return;
      }
      const reply = await handleOperatorWrite({
        request,
        route: writeMatch.route,
        params: writeMatch.params,
        token: writeToken,
        port: request.socket.localPort!,
        env: options.env,
      });
      const replyHeaders: Readonly<Record<string, string>> = reply.close ? { Connection: 'close' } : {};
      if (reply.refused) sendRefusal(request, response, reply.status, reply.body as unknown as OperatorErrorResponseV1, false, replyHeaders);
      else sendJson(response, reply.status, reply.body, false, replyHeaders);
      return;
    }
    // A write path may also be a read resource; only a write-only path refuses GET.
    if (writeMatch !== null && !routeInventory.some(entry => entry.method === 'GET' && entry.pattern === pathname)) {
      sendRefusal(request, response, 405, errorBody('method_not_allowed', 'Only POST is supported.'), headOnly, {
        Allow: OPERATOR_WRITE_ALLOWED_METHODS,
      });
      return;
    }
    const fetchSite = request.headers['sec-fetch-site'];
    if (pathname.startsWith('/api/') && fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      sendJson(response, 403, { code: 'fetch_site_not_allowed' }, headOnly); return;
    }
    if (OPERATOR_ARCHITECTURE_HISTORY_ROUTE.test(pathname)) {
      let input;
      try { input = parseArchitectureRequest(url)!; }
      catch { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      handleBoundedTaskRead(response, headOnly, input, (value, request) => {
        if (request.kind !== 'architecture_history') throw new Error('identity');
        return decodeArchitectureHistoryPage(value, request);
      }, ARCHITECTURE_FAILURES, 'architecture', undefined, architectureStatus, request, ARCHITECTURE_HISTORY_TIMEOUT_MS);
      return;
    }
    if (pathname.startsWith('/api/v1/repositories/') && pathname.includes('/architecture/modules')) {
      let input;
      try { input = parseArchitectureRequest(url); }
      catch { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      if (!input) { sendJson(response, 404, { code: 'capability_not_found' }, headOnly); return; }
      handleBoundedTaskRead(response, headOnly, input, (value, request) => {
        const result = request.kind === 'architecture_modules' ? decodeArchitectureModuleIndex(value)
          : request.kind === 'architecture_module' ? decodeArchitectureModuleDetail(value) : decodeArchitectureReviewPrompt(value);
        if ('capability_id' in request && ('module' in result ? result.module.id !== request.capability_id
          : 'capability_id' in result && result.capability_id !== request.capability_id)) throw new Error('identity');
        return result;
      }, ARCHITECTURE_FAILURES, 'architecture', undefined, architectureStatus, request);
      return;
    }

    const finalization = OPERATOR_SESSION_FINALIZATION_ROUTE.exec(pathname);
    if (finalization !== null) {
      if (url.search !== '') { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      handleBoundedTaskRead(response, headOnly, { session_id: finalization[1]! }, decodeDocSessionFinalizationView,
        DOC_SESSION_FINALIZATION_FAILURES, 'doc_session_finalization', undefined,
        code => code === 'session_not_found' ? 404 : code === 'too_large' ? 413 : code === 'timeout' ? 504 : 503);
      return;
    }

    const sessionDetail = OPERATOR_SESSION_DETAIL_ROUTE.exec(pathname);
    if (pathname === OPERATOR_SESSION_LIST_PATH || sessionDetail !== null) {
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => key !== 'seen') || keys.length > 1) { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      const status = (code: string) => code === 'session_not_found' ? 404 : code === 'too_large' ? 413
        : code === 'worktree_missing' || code === 'worktree_changed' ? 409 : code === 'timeout' ? 504 : 503;
      if (sessionDetail !== null) {
        const input = { session_id: sessionDetail[1]!, seen: url.searchParams.get('seen') };
        if (!isDocSessionDetailRequest(input)) { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
        handleBoundedTaskRead(response, headOnly, input, decodeOperatorDocSessionDetail, DOC_SESSION_VIEW_FAILURES, 'doc_session_detail', undefined, status);
      } else {
        let seen: unknown;
        try { seen = JSON.parse(url.searchParams.get('seen') ?? '{}'); }
        catch { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
        const input = { seen };
        if (!isDocSessionListRequest(input)) { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
        handleBoundedTaskRead(response, headOnly, input, decodeOperatorDocSessionList, DOC_SESSION_VIEW_FAILURES, 'doc_session_list', undefined, status);
      }
      return;
    }

    const sessionEvents = sessionEventsRead ? OPERATOR_SESSION_EVENTS_ROUTE.exec(pathname) : null;
    if (sessionEvents !== null) {
      const keys = [...url.searchParams.keys()];
      const input = { session_id: sessionEvents[1]!, after: url.searchParams.get('after') };
      if (keys.some(key => key !== 'after') || keys.length > 1 || !isDocSessionEventsRequest(input)) {
        sendJson(response, 400, { code: 'invalid_cursor' }, headOnly); return;
      }
      handleBoundedTaskRead(response, headOnly, input, (value, request) => decodeOperatorDocSessionEvents(value, request.session_id, request.after),
        ['session_not_found', 'events_unavailable', 'invalid_cursor'], 'doc_session_events', undefined,
        code => code === 'session_not_found' ? 404 : code === 'invalid_cursor' ? 400 : code === 'timeout' ? 504 : 503);
      return;
    }

    const sessionDiff = OPERATOR_SESSION_DIFF_ROUTE.exec(pathname);
    const sessionLoss = sessionDiff === null ? OPERATOR_SESSION_LOSS_ROUTE.exec(pathname) : null;
    if (sessionDiff !== null || sessionLoss !== null) {
      if (url.search !== '') { sendJson(response, 400, { code: 'invalid_request' }, headOnly); return; }
      const input = { session_id: (sessionDiff ?? sessionLoss)![1]! };
      const status = (failure: string) => DOC_SESSION_READ_STATUS[failure as DocSessionReadFailure] ?? 503;
      if (sessionDiff !== null) handleBoundedTaskRead(response, headOnly, input, decodeOperatorDocSessionDiff, DOC_SESSION_READ_FAILURES, 'doc_session_diff', undefined, status);
      else handleBoundedTaskRead(response, headOnly, input, decodeOperatorDocSessionLoss, DOC_SESSION_READ_FAILURES, 'doc_session_loss', undefined, status);
      return;
    }

    if (pathname === OPERATOR_HEALTH_PATH) {
      const health: OperatorHealthResponseV1 = {
        ok: true,
        service: OPERATOR_SERVICE_NAME,
        protocol: OPERATOR_SERVER_PROTOCOL,
      };
      sendJson(response, 200, health, headOnly);
      return;
    }

    if (pathname === OPERATOR_RUNTIME_STATUS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Runtime status takes no query parameters.', 'Remove query parameters.'), headOnly);
        return;
      }
      try {
        sendJson(response, 200, decodeRuntimeOverlay((options.read_runtime_status ?? runtimeService?.read ?? unavailableRuntimeOverlay)()), headOnly);
      } catch {
        sendJson(response, 200, unavailableRuntimeOverlay(), headOnly);
      }
      return;
    }

    if (pathname === OPERATOR_WORKTREES_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Worktrees accepts no query selectors.'), headOnly);
        return;
      }
      let snapshot: WorktreesSnapshot;
      try { snapshot = decodeWorktrees((options.read_worktrees ?? worktrees?.read ?? unavailableWorktrees)()); }
      catch { snapshot = unavailableWorktrees(); }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_DEV_ACTIVITY_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Dev activity accepts no query selectors.'), headOnly);
        return;
      }
      let snapshot: DevActivitySnapshotV2;
      try {
        snapshot = decodeDevActivitySnapshot((options.read_dev_activity ?? devActivity?.read ?? unavailableDevActivitySnapshot)());
      } catch {
        snapshot = unavailableDevActivitySnapshot();
      }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_REPOSITORIES_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'The repository list accepts no query selectors.'), headOnly);
        return;
      }
      let repositories: OperatorRepositoriesV1;
      try { repositories = readOperatorRepositories(options.env ?? process.env); }
      catch {
        sendRefusal(request, response, 503, errorBody('registry_unavailable', 'The repository registry is unreadable.',
          OPERATOR_REGISTRY_ACTION), headOnly);
        return;
      }
      sendJson(response, 200, repositories, headOnly);
      return;
    }

    if (pathname === OPERATOR_SETUP_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Setup accepts no query selectors.'), headOnly);
        return;
      }
      let setupSnapshot: SetupSnapshotV2;
      try {
        setupSnapshot = decodeSetupSnapshot((options.read_setup ?? setup?.read ?? unavailableSetupSnapshot)());
      } catch {
        setupSnapshot = unavailableSetupSnapshot('setup_check_invalid');
      }
      sendJson(response, 200, setupSnapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_SETTINGS_AGENTS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Agent settings accept no query selectors.'), headOnly);
        return;
      }
      try {
        sendJson(response, 200, readAgentsSettings(readAgentRuntimes, options.env), headOnly);
      } catch (error) {
        if (!(error instanceof AgentsConfigurationError)) throw error;
        sendRefusal(request, response, AGENTS_CONFIGURATION_FAILURES[error.code].status,
          errorBody(error.code, error.message, AGENTS_CONFIGURATION_FAILURES[error.code].next_action), headOnly);
      }
      return;
    }

    if (pathname === OPERATOR_SETTINGS_SEATS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Seat settings accept no query selectors.'), headOnly);
        return;
      }
      try {
        sendJson(response, 200, readSeatsSettings(options.env), headOnly);
      } catch (error) {
        if (!(error instanceof SeatsConfigurationError)) throw error;
        sendRefusal(request, response, SEATS_CONFIGURATION_FAILURES[error.code].status,
          errorBody(error.code, error.message, SEATS_CONFIGURATION_FAILURES[error.code].next_action), headOnly);
      }
      return;
    }

    if (pathname === OPERATOR_BOT_ACCESS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Bot access accepts no query selectors.'), headOnly);
        return;
      }
      const cache = (options.read_bot_access ?? botAccess?.read ?? (() => ({ state: 'pending' }) as const))();
      if (cache.state === 'pending') {
        sendRefusal(request, response, 503, errorBody('bot_access_pending', 'The first Bot access collection has not finished.', 'Retry in a few seconds.'), headOnly);
        return;
      }
      if (cache.state === 'failed') {
        sendRefusal(request, response, 503, errorBody('bot_access_unavailable', 'Bot access is unavailable.', 'Restart `repo-harness operator serve`.'), headOnly);
        return;
      }
      let snapshot;
      try { snapshot = decodeBotAccessSnapshot(cache.snapshot); }
      catch {
        sendRefusal(request, response, 503, errorBody('bot_access_invalid', 'The Bot access snapshot failed validation.'), headOnly);
        return;
      }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    if (pathname === OPERATOR_BOT_REVIEWS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Bot reviews accept no query selectors.'), headOnly);
        return;
      }
      let reviews: SlackReviewsSnapshotV1;
      try { reviews = decodeSlackReviews((options.read_bot_reviews ?? botReviews?.read ?? (() => slackReviewsUnavailable('slack_pending')))()); }
      catch {
        sendRefusal(request, response, 503, errorBody('bot_reviews_invalid', 'The Dot review snapshot failed validation.'), headOnly);
        return;
      }
      sendJson(response, 200, reviews, headOnly);
      return;
    }

    if (pathname === OPERATOR_CLI_INVENTORY_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'CLI inventory accepts no query selectors.'), headOnly);
        return;
      }
      let inventory: CliInventorySnapshotV1;
      try {
        inventory = decodeCliInventory((options.read_cli_inventory ?? cliInventory?.read ?? unavailableCliInventory)());
      } catch {
        inventory = unavailableCliInventory('collection_failed');
      }
      sendJson(response, 200, inventory, headOnly);
      return;
    }

    if (pathname === OPERATOR_NOTIFY_STATUS_PATH) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Notify status accepts no query selectors.'), headOnly);
        return;
      }
      const cache = (options.read_notify ?? notify?.read ?? (() => ({ state: 'pending' }) as const))();
      if (cache.state === 'pending') {
        sendRefusal(request, response, 503, errorBody('notify_status_pending', 'The first notify status collection has not finished.', 'Retry in a few seconds.'), headOnly);
        return;
      }
      if (cache.state === 'unavailable') {
        const reason = NOTIFY_UNAVAILABLE[cache.reason];
        sendRefusal(request, response, 503, errorBody(cache.reason, reason.message, reason.next_action), headOnly);
        return;
      }
      let status;
      try { status = decodeNotifyStatus(cache.value.status); }
      catch {
        sendRefusal(request, response, 503, errorBody('notify_status_invalid', 'The notify status failed validation.'), headOnly);
        return;
      }
      sendJson(response, 200, status, headOnly);
      return;
    }

    const boardRoute = OPERATOR_BOARD_ROUTE.exec(pathname);
    if (boardRoute !== null) {
      // A board read runs the board CLI and about ten GitHub reads; HEAD gets no read.
      if (headOnly) {
        sendRefusal(request, response, 405, errorBody('method_not_allowed', 'The board route supports only GET.'), true, { Allow: 'GET' });
        return;
      }
      const keys = [...url.searchParams.keys()];
      const parent = url.searchParams.get('parent');
      if (keys.length !== 1 || parent === null || !/^[1-9][0-9]{0,9}$/u.test(parent)) {
        const refusal = BOARD_UNAVAILABLE.board_parent_invalid;
        sendRefusal(request, response, refusal.status, errorBody('board_parent_invalid', refusal.message, refusal.next_action), headOnly);
        return;
      }
      const read = options.read_board ?? readRepositoryBoard;
      handleBoardCliRead(request, response, headOnly, BOARD_UNAVAILABLE, { busy: 'board_busy', invalid: 'board_invalid', unavailable: 'board_unavailable' },
        signal => read({ repository_id: boardRoute[1]!, parent: Number(parent), env: boardEnvironment, signal }), decodeBoard);
      return;
    }

    const parentsRoute = OPERATOR_BOARD_PARENTS_ROUTE.exec(pathname);
    if (parentsRoute !== null) {
      // A parent list read runs the board CLI, a paginated GitHub read and one hc list; HEAD gets no read.
      if (headOnly) {
        sendRefusal(request, response, 405, errorBody('method_not_allowed', 'The board parents route supports only GET.'), true, { Allow: 'GET' });
        return;
      }
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'The board parents route accepts no query parameters.'), headOnly);
        return;
      }
      const read = options.read_board_parents ?? readRepositoryBoardParents;
      handleBoardCliRead(request, response, headOnly, BOARD_PARENTS_UNAVAILABLE, { busy: 'parents_busy', invalid: 'parents_invalid', unavailable: 'parents_unavailable' },
        signal => read({ repository_id: parentsRoute[1]!, env: boardEnvironment, signal }), decodeBoardParents);
      return;
    }

    const testsRoute = OPERATOR_TESTS_ROUTE.exec(pathname);
    if (testsRoute !== null) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Tests accept no query parameters.'), headOnly);
        return;
      }
      const cache = (options.read_tests ?? tests?.read ?? (() => ({ state: 'unavailable', reason: 'tests_pending' }) as const))(testsRoute[1]!);
      if (cache.state !== 'ready') {
        const refusal = TESTS_UNAVAILABLE[cache.reason];
        sendRefusal(request, response, refusal.status, errorBody(cache.reason, refusal.message, refusal.next_action), headOnly);
        return;
      }
      let snapshot;
      try { snapshot = decodeTestsSnapshot(cache.snapshot); }
      catch {
        sendRefusal(request, response, 503, errorBody('tests_invalid', 'The test results failed validation.'), headOnly);
        return;
      }
      sendJson(response, 200, snapshot, headOnly);
      return;
    }

    const architectureMapRoute = OPERATOR_ARCHITECTURE_MAP_ROUTE.exec(pathname);
    if (architectureMapRoute !== null) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'The architecture map accepts no query parameters.'), headOnly);
        return;
      }
      const cache = (options.read_architecture_map ?? architectureMap?.read ?? (() => ({ state: 'unavailable', reason: 'architecture_map_pending' }) as const))(architectureMapRoute[1]!);
      if (cache.state !== 'ready') {
        const refusal = ARCHITECTURE_MAP_UNAVAILABLE[cache.reason];
        const body: ArchitectureMapRefusalV1 = cache.reason === 'archctx_error'
          ? { ...errorBody(cache.reason, refusal.message, refusal.next_action), archctx: { code: cache.code, reason_code: cache.reason_code } }
          : errorBody(cache.reason, refusal.message, refusal.next_action);
        sendRefusal(request, response, refusal.status, body, headOnly);
        return;
      }
      let map;
      try { map = decodeArchitectureMap(cache.map); }
      catch {
        sendRefusal(request, response, 503, errorBody('architecture_map_invalid', ARCHITECTURE_MAP_UNAVAILABLE.architecture_map_invalid.message), headOnly);
        return;
      }
      sendJson(response, 200, map, headOnly);
      return;
    }

    /** The decoded execution view of one repository; null after it sends the refusal. */
    const executionView = (repositoryId: string): TaskExecutionViewV1 | null => {
      const cache = (options.read_execution_state ?? execution?.read ?? (() => ({ state: 'unavailable', reason: 'execution_state_pending' }) as const))(repositoryId);
      if (cache.state !== 'ready') {
        const refusal = EXECUTION_UNAVAILABLE[cache.reason];
        sendRefusal(request, response, refusal.status, errorBody(cache.reason, refusal.message, refusal.next_action), headOnly);
        return null;
      }
      try { return decodeTaskExecutionView(cache.view); }
      catch {
        sendRefusal(request, response, 503, errorBody('execution_state_invalid', 'The task execution state failed validation.'), headOnly);
        return null;
      }
    };

    const executionRoute = OPERATOR_EXECUTION_STATE_ROUTE.exec(pathname);
    if (executionRoute !== null) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Execution state accepts no query parameters.'), headOnly);
        return;
      }
      const view = executionView(executionRoute[1]!);
      if (view !== null) sendJson(response, 200, view, headOnly);
      return;
    }

    const messagesRoute = OPERATOR_TASK_MESSAGES_ROUTE.exec(pathname);
    if (messagesRoute !== null) {
      if (url.search !== '') {
        sendRefusal(request, response, 400, errorBody('invalid_request', 'Task messages accept no query parameters.'), headOnly);
        return;
      }
      const input = { repository_id: messagesRoute[1]!, task_id: messagesRoute[2]! };
      const view = executionView(input.repository_id);
      if (view === null) return;
      const task = view.tasks.find(entry => entry.task === input.task_id);
      if (task === undefined || task.state !== 'verified') {
        const code: TaskMessagesRefusal = task === undefined ? 'task_not_found' : 'task_unverified';
        const refusal = TASK_MESSAGES_REFUSALS[code];
        sendRefusal(request, response, refusal.status, errorBody(code, refusal.message, refusal.next_action), headOnly);
        return;
      }
      handleBoundedTaskRead(response, headOnly, input, decodeTaskMessagesView, TASK_MESSAGES_FAILURES, 'task_messages', undefined,
        code => code === 'repository_not_found' ? 404 : code === 'timeout' ? 504 : 503);
      return;
    }

    const docsTreeRoute = OPERATOR_DOCS_TREE_ROUTE.exec(pathname);
    const docsFileRoute = docsTreeRoute === null ? OPERATOR_DOCS_FILE_ROUTE.exec(pathname) : null;
    if (docsTreeRoute !== null || docsFileRoute !== null) {
      const repositoryId = (docsTreeRoute ?? docsFileRoute)![1]!;
      const filePath = docsFileRoute === null ? null : url.searchParams.getAll('path');
      if (docsTreeRoute !== null ? url.search !== '' : filePath!.length !== 1 || [...url.searchParams.keys()].length !== 1) {
        sendRefusal(request, response, 400, errorBody('invalid_request', docsTreeRoute !== null ? 'The docs tree accepts no query parameters.' : 'A docs file read takes exactly one path parameter.'), headOnly);
        return;
      }
      const cache = (options.read_docs ?? docs?.read ?? (() => ({ state: 'unavailable', reason: 'docs_pending' }) as const))(repositoryId);
      if (cache.state !== 'ready') {
        const refusal = DOCS_UNAVAILABLE[cache.reason];
        sendRefusal(request, response, refusal.status, errorBody(cache.reason, refusal.message, refusal.next_action), headOnly);
        return;
      }
      if (docsFileRoute === null) {
        let tree;
        try { tree = decodeDocsTree(cache.tree); }
        catch { sendRefusal(request, response, 503, errorBody('docs_reader_unavailable', DOCS_UNAVAILABLE.docs_reader_unavailable.message), headOnly); return; }
        sendJson(response, 200, tree, headOnly);
        return;
      }
      handleDocsFile(request, response, headOnly, cache, filePath![0]!);
      return;
    }

    /**
     * The API prefix is claimed case-insensitively while the routes above stay
     * exact, because the static fallback resolves case-insensitively on macOS
     * and Windows: `/API/v1/dev-activity` matched no API route, fell through
     * to the SPA shell, and answered a navigation with 200 HTML. Anything under
     * the API prefix that reached here is a missing API route and says so.
     */
    const apiPathname = pathname.toLowerCase();
    if (apiPathname === OPERATOR_API_PATH_PREFIX || apiPathname.startsWith(`${OPERATOR_API_PATH_PREFIX}/`)) {
      sendRefusal(request, response, 404, errorBody('not_found', 'The requested operator API route does not exist.'), headOnly);
      return;
    }

    const requestedFile = fileIfSafe(staticRoot, pathname);
    const file = requestedFile ?? (isHtmlNavigation(request, pathname) ? fallbackIndex(staticRoot) : null);
    if (file === null) {
      if (pathname === '/' || isHtmlNavigation(request, pathname)) {
        sendRefusal(request, response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
      } else {
        sendRefusal(request, response, 404, errorBody('not_found', 'The requested operator asset does not exist.'), headOnly);
      }
      return;
    }

    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch (_error) {
      sendRefusal(request, response, 503, errorBody('operator_assets_unavailable', 'Operator UI assets are unavailable.', OPERATOR_ASSET_ACTION), headOnly);
      return;
    }
    const fileType = contentType(file);
    const headers = {
      ...staticHeaders(fileType),
      'Content-Length': body.byteLength.toString(),
      // The page response is the only place the write token is handed out.
      ...(fileType.startsWith('text/html') ? { 'Set-Cookie': operatorWriteTokenCookie(request.socket.localPort!, writeToken) } : {}),
    };
    response.writeHead(200, headers);
    if (headOnly) response.end();
    else response.end(body);
  };

  if (options.runtime_status_config && options.read_runtime_status) throw new OperatorServerError('invalid_argument', 'Select runtime config or cache reader.', 400);
  // Collector groups of a server that died with SIGKILL have no other owner.
  reapOrphanedProcessGroups();
  const runtimeService = options.runtime_status_config ? await startRuntimeService(options.runtime_status_config, { ...process.env, ...options.env }) : null;
  const devActivity = options.dev_activity_collector && !options.read_dev_activity
    ? startDevActivityCollector({
      env: options.env,
      read_runtime: options.read_runtime_status ?? runtimeService?.read ?? null,
    })
    : null;
  const setup = options.setup_collector && !options.read_setup ? startSetupCollector({ env: options.env, agent_runtimes: {} }) : null;
  const botAccessCollects = options.bot_access_collector === true && !options.read_bot_access;
  const notify = (options.notify_collector || botAccessCollects) && !options.read_notify ? startNotifyCollector({ env: options.env }) : null;
  const botAccess = botAccessCollects
    ? startBotAccessCollector({ env: options.env, read_notify: options.read_notify ?? notify!.read, first_cycle_after: notify?.settled() })
    : null;
  const botReviews = options.bot_access_collector === true && !options.read_bot_reviews ? startSlackReviewCollector({ env: options.env }) : null;
  const docs = options.docs_collector && !options.read_docs
    ? startDocsCollector({ env: options.env, read_dev_activity: options.read_dev_activity ?? devActivity?.read ?? unavailableDevActivitySnapshot })
    : null;
  const tests = options.tests_collector && !options.read_tests
    ? startTestsCollector({ env: options.env, read_dev_activity: options.read_dev_activity ?? devActivity?.read ?? unavailableDevActivitySnapshot })
    : null;
  const execution = options.execution_collector && !options.read_execution_state ? startExecutionCollector({ env: options.env }) : null;
  const worktrees = options.worktree_collector && !options.read_worktrees ? startWorktreeCollector({ env: options.env }) : null;
  const architectureMap = options.architecture_map_collector && !options.read_architecture_map
    ? startArchitectureMapCollector({
      env: options.env,
      read_pull_requests: repositoryId => architecturePullRequestsSource((options.read_dev_activity ?? devActivity?.read ?? unavailableDevActivitySnapshot)(), repositoryId),
      read_tests: options.read_tests ?? tests?.read,
      first_cycle_after: devActivity?.settled(),
    })
    : null;
  const cliInventory = options.cli_inventory_collector && !options.read_cli_inventory
    ? startCliInventoryCollector({ env: options.env, usage_sources: options.cli_inventory_collector.usage_sources })
    : null;
  const server: Server = createServer((request, response) => {
    void handleRequest(request, response).catch((_error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendRefusal(request, response, 500, errorBody('operator_server_unavailable', 'Operator server failed to handle the request.'));
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening);
      runtimeService?.close();
      void devActivity?.close();
      void setup?.close();
      void botAccess?.close();
      void botReviews?.close();
      void notify?.close();
      void cliInventory?.close();
      void docs?.close();
      void tests?.close();
      void execution?.close();
      void worktrees?.close();
      void architectureMap?.close();
      rejectListen(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new OperatorServerError('operator_server_unavailable', 'Operator server did not expose a TCP address.');
  }
  const actualPort = address.port;
  const urlHost = host === '::1' ? `[${host}]` : host;
  let closed = false;
  let closeCompletion: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closeCompletion) return closeCompletion;
    closed = true;
    runtimeService?.close();
    closeCompletion = Promise.resolve().then(async () => {
      await Promise.all([devActivity?.close(), setup?.close(), botAccess?.close(), botReviews?.close(), notify?.close(), cliInventory?.close(), docs?.close(), tests?.close(), execution?.close(), worktrees?.close(), architectureMap?.close()]);
      // Close admission and cancel every owner before waiting for any one of
      // them: a retiring read must not leave other queues launching work.
      for (const cancel of activeTaskReadCancellers) cancel();
      for (const controller of activeBoardReads) controller.abort();
      await Promise.allSettled([
        ...activeTaskReadCompletions,
        ...boardCompletions,
      ]);
      if (!server.listening) return;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error?: Error) => {
          if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') rejectClose(error);
          else resolveClose();
        });
      });
    });
    return closeCompletion;
  };

  return Object.freeze({
    host,
    port: actualPort,
    url: `http://${urlHost}:${actualPort}`,
    close,
  });
}

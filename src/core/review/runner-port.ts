/**
 * Reviewer runner port. Generic review drives one reviewer session through it,
 * and task-agent-host implements it. This file holds types only.
 *
 * Each type here is the single definition. The implementation imports these
 * types; it does not map them to its own. Types that only the implementation
 * knows (the session handle, the launch endpoint) stay type parameters, so no
 * transport-specific shape crosses the port.
 */
import type { AvailableInstallation, InstallationSnapshot, SessionOptions } from '@botiverse/oar';
import type { AcceptanceAuthor } from './acceptance-receipt';
import type { ReviewRuntimeId } from './review-runtimes';

export interface ProcessProof { pid: number; identity: string }
/** Upstream coordination provenance. This is not an authorization credential. */
export interface TaskClaimReference { reference: string; revision: string }
export interface TaskSessionAdmission {
  identity: {
    repository_id: string; issue_id: string; campaign_id: string; campaign_sha256: string;
    execution_actor: string; claim: TaskClaimReference;
    source_root: string; execution_root: string; branch: string | null; task: string; role: string;
    harness_kind: string; runtime: 'herdr' | 'terminal';
  };
  approval: { admission_sha256: string; grant_sha256: string; revision: number; goal_revision: string; scope_sha256: string };
  /** A normal commit does not change task ownership or reset request budgets. */
  head_revision: string;
}
export type TaskPrePromptInbox = { status: 'bound'; path: string; sha256: string } | { status: 'unsupported'; reason: 'historical_task_label' };
export interface TaskRequest {
  pre_prompt_inbox?: TaskPrePromptInbox;
  task_admission?: TaskSessionAdmission;
  session_binding_sha256?: string;
  protocol: 2;
  result_contract: { required_fields: string[]; atomic_write: 'temp_rename' };
  task: string;
  role: string;
  round: number;
  request_id: string;
  context_ref: string;
  source_ref: string;
  context_sha256: string;
  result_ref: string;
}
export interface TaskResult { request_id: string; context_sha256: string; value: unknown }
export interface TaskCleanupResult { status: 'closed' | 'cleanup_pending'; pids: number[]; reason?: string }
export interface TaskAgentSpec<Endpoint> {
  task: string;
  role: string;
  harness_kind: string;
  endpoint: Endpoint;
  parent_pane: string;
  args: string[];
  max_requests: number;
}
export type TerminalHostSpec = Pick<TaskAgentSpec<never>, 'task' | 'role' | 'harness_kind' | 'max_requests'>;

/** Paths of one review session. The Seatbelt policy is derived from them. */
export interface ReviewIsolationPaths {
  readonly subject: string;
  readonly primary: string;
  readonly ownerRecord: string;
  readonly journal: string;
  readonly gitCommonDir: string;
  readonly output: string;
  readonly piAgentDirectory?: string;
}
/** The isolation policy as data. The host applies it and refuses a session it cannot isolate. */
export interface ReviewIsolationAdmission {
  paths: ReviewIsolationPaths;
  policyFile: string;
}
/** The host spec that review writes to its control directory before a launch. */
export interface ReviewHostSpec {
  mode: 'review';
  isolation: ReviewIsolationAdmission;
  kind: ReviewRuntimeId;
  installation: AvailableInstallation;
  launcher: string;
  vendorExecutable: string;
  options: SessionOptions;
  requestDirectory: string;
  output: string;
  controlDirectory: string;
  timeoutMs: number;
}
/** The host writes one observation for each ended turn. */
export interface HostRoundObservation {
  request_id: string;
  kind: string;
  outcome: string | null;
  actual_model: string | null;
}
/** The caller pane and campaign of one review session, for author attribution. */
export interface ReviewAuthorQuery<Endpoint> {
  endpoint: Endpoint | null;
  parent_pane: string | null;
  campaign_sha256: string;
  owner_root: string;
}

/**
 * One implementation exists. `Session` is the opaque reviewer session handle,
 * `Endpoint` is the launch addressing and `Authority` is the task authority
 * that review builds from its admission.
 */
export interface ReviewerRunner<Session, Endpoint, Authority> {
  /** Validates launch addressing before any admission. */
  validateEndpoint(endpoint: Endpoint): unknown;
  /** The home that holds the provider credentials for this endpoint, if the endpoint names one. */
  endpointHome(endpoint: Endpoint | undefined): string | undefined;
  /** The fixed host command for a host spec file. A terminal launch also proves that the command reads back. */
  hostCommand(specFile: string, terminal: boolean): readonly string[];
  installation(kind: ReviewRuntimeId, executable?: string): Promise<InstallationSnapshot>;
  /** Session options from the reviewer profile; review passes only the role's harness and output. */
  sessionOptions(kind: ReviewRuntimeId, output: string, runtimeHome?: string): SessionOptions;
  /** The directory where the implementation writes the session's requests. */
  requestDirectory(primaryRoot: string, task: string, role: string): string;
  /** The reviewer output directory in the reviewer checkout. */
  outputDirectory(reviewerRepo: string, primaryRoot: string, task: string, role: string): string;
  owner(repoRoot: string, endpoint: Endpoint, pane: string): ReviewRuntimeId | null;
  author(repoRoot: string, query: ReviewAuthorQuery<Endpoint>): AcceptanceAuthor | null;
  start(repoRoot: string, spec: TaskAgentSpec<Endpoint>, command: readonly string[], ready: () => Promise<void>,
    guard?: () => void, authority?: Authority): Promise<Session>;
  bindTerminal(repoRoot: string, spec: TerminalHostSpec, command: readonly string[],
    launched: () => Promise<ProcessProof | null>, authority?: Authority): Promise<Session | null>;
  /** The host that claimed this control directory, after it is ready; null when no host claimed it. */
  launched(controlDirectory: string, timeoutMs?: number): Promise<ProcessProof | null>;
  /** Waits until the host writes a control file. */
  ready(path: string, timeoutMs?: number): Promise<void>;
  /** The reviewer session lifecycle for `review status`. */
  status(repoRoot: string, task: string, role: string): unknown;
  assertBinding(session: Session): void;
  /** Refuses a reviewer session that runs in the review caller's own pane. */
  assertNotOwnerPane(session: Session, ownerPane: string | null): void;
  bindNative(input: { repo_root: string; binding: Session; ready_path: string }): unknown;
  /** Sends one request. The implementation reserves the request's pre-prompt companion. */
  send(repoRoot: string, task: string, role: string, contextRef: string, contextPolicy: 'repeatable' | 'changed_only',
    delivery: (request: TaskRequest) => Promise<void>, publicationBoundary?: (request: TaskRequest) => Promise<void>,
    guard?: () => void, authority?: Authority): Promise<TaskRequest>;
  collect(repoRoot: string, task: string, role: string, round: number, guard?: () => void, authority?: Authority): Promise<TaskResult | null>;
  /** Commits the request's accepted companion delivery; pending until the host proves acceptance. */
  settleCompanion(authority: Authority, task: string, role: string, request: TaskRequest): 'pending' | 'settled';
  /** Commits accepted companions of earlier rounds. It never resends a request. */
  recoverCompanions(authority: Authority, primaryRoot: string, task: string, role: string, rounds: number): void;
  /** Disposes the host session before the session closes. */
  dispose(repoRoot: string, task: string, controlDirectory: string, terminal?: boolean): Promise<void>;
  close(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult>;
  cancel(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult>;
}

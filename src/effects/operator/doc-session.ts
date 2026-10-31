// Doc session creation (PRD G5 step 1, G8; issue #1021). The owner closed the
// docs host stack (#1149, option 3): no runtime has verified docs isolation, so
// every creation is refused with `docs_host_disabled` and writes nothing. The
// verified creation shape stays for a future host.
//
// The route runs only through the shared write run (lock, idempotency,
// audit). Production OPERATOR_ROUTES admits it after the local config write
// (#1017) opened; the agent launch still waits for its own approval.

import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { isAgentRuntimeId } from '../../core/operator/agents-settings';
import { checkDocCitation, decodeDocCitation, docCitationBudget, type DocCitationV1 } from '../../core/operator/doc-citation';
import { isDocsHostRuntimeId } from '../../core/operator/docs-host-runtimes';
import type { JsonValue } from '../../core/evidence/types';
import { AgentsConfigurationError, readAgentsConfiguration } from '../configuration/agents-configuration';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import { isManagedWorktreePath, managedWorktreeRoot } from '../git/managed-worktree';
import { configuredGitBinary, gitExecFile, GitExecError, withoutRepositorySelectingGitEnv } from '../git/runner';
import { ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { assertDocsHostPlatform } from '../review/docs-host-isolation';
import { withWorktreeTopologyLockAsync } from '../state/coordination-worktree-topology';
import { DocsReadError, normalizeDocsPath, type DocsReader } from './docs-reader';
import type { OperatorWriteRoute } from './write-channel';
import { prepareOperatorStateDir } from './write-audit';
import { OperatorWriteRefusal, type OperatorWriteResponse } from './write-run';

export const OPERATOR_SESSIONS_ROUTE = /^\/api\/v1\/sessions$/u;
export const DOC_SESSION_MAX_CITATIONS = 16;
export const DOC_SESSION_MAX_INSTRUCTION = 8_000;
/** Bounds the topology lock wait and the git calls of one creation. */
const DOC_SESSION_GIT_DEADLINE_MS = 30_000;

const BODY_KEYS = ['citations', 'instruction', 'kind', 'repository_id', 'runtime'];
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SESSION_ID = /^[0-9a-f]{32}$/u;

export interface DocSessionCreateInput {
  readonly kind: 'docs';
  /** Any runtime id; creation refuses every one while the launch allowlist is empty. */
  readonly runtime: string;
  readonly repository_id: string;
  readonly citations: readonly DocCitationV1[];
  readonly instruction: string;
}

export interface DocSessionDependencies {
  readonly env: NodeJS.ProcessEnv;
  /** The docs collector's resident reader of one repository, or null when it has none. */
  readonly docs_reader: (repositoryId: string) => DocsReader | null;
  readonly new_session_id?: () => string;
  readonly platform?: NodeJS.Platform;
}

/** Closed decoder. A citation may name only a servable `docs/**` path; the request names no location. */
export function decodeDocSessionCreate(fields: Readonly<Record<string, unknown>>): DocSessionCreateInput {
  const keys = Object.keys(fields).sort();
  if (keys.length !== BODY_KEYS.length || keys.some((key, index) => key !== BODY_KEYS[index])) throw new Error('doc session keys');
  const { kind, runtime, repository_id, citations, instruction } = fields;
  if (kind !== 'docs') throw new Error('doc session kind');
  if (!isAgentRuntimeId(runtime)) throw new Error('doc session runtime');
  if (typeof repository_id !== 'string' || !REPOSITORY_ID.test(repository_id)) throw new Error('doc session repository_id');
  if (!Array.isArray(citations) || citations.length < 1 || citations.length > DOC_SESSION_MAX_CITATIONS) throw new Error('doc session citations');
  const decoded = citations.map((value) => {
    const citation = decodeDocCitation(value);
    normalizeDocsPath(citation.path);
    return citation;
  });
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > DOC_SESSION_MAX_INSTRUCTION || instruction.includes('\0')) {
    throw new Error('doc session instruction');
  }
  return { kind, runtime, repository_id, citations: decoded, instruction };
}

const refuse = (status: number, code: string, message: string, nextAction: string) => new OperatorWriteRefusal(status, code, message, nextAction);
const docsUnavailable = () => refuse(503, 'docs_unavailable', 'The docs view of this repository is not ready.', 'Wait for the docs view to load, then retry with a new request_id.');

function gitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return withoutRepositorySelectingGitEnv({ ...env, GIT_TERMINAL_PROMPT: '0' });
}

interface VerifiedCitation { readonly citation: DocCitationV1; readonly resolved: DocCitationV1; readonly relocated: boolean }

/**
 * Every citation is checked against one commit of the served docs view; that commit is the session base.
 * The checks share one hash budget, so a request's synchronous hashing stays short.
 * A relocation that would exceed it is refused as stale: citing the passage again makes the check cheap.
 */
async function verifyCitations(reader: DocsReader, citations: readonly DocCitationV1[]): Promise<{ readonly base: string; readonly verified: VerifiedCitation[] }> {
  let base: string | null = null;
  const budget = docCitationBudget();
  const verified: VerifiedCitation[] = [];
  for (const citation of citations) {
    let file;
    try { file = await reader.file(citation.path); }
    catch (error) {
      if (!(error instanceof DocsReadError)) throw docsUnavailable();
      if (['not_found', 'not_a_file', 'too_large', 'not_text'].includes(error.code)) throw staleCitation();
      if (['path_escape', 'path_denied', 'path_invalid'].includes(error.code)) {
        throw refuse(422, 'path_outside_scope', 'A citation names a file outside the readable docs.', 'Cite a file from the docs view.');
      }
      throw docsUnavailable();
    }
    // A refresh between two reads would mix commits; the request is retried, not merged.
    if (base !== null && file.commit !== base) throw docsUnavailable();
    base = file.commit;
    const check = checkDocCitation(citation, file.text, budget);
    if (check.state === 'stale' || check.state === 'over_budget') throw staleCitation();
    verified.push({
      citation,
      resolved: { ...citation, start_line: check.start_line, end_line: check.end_line, commit: file.commit, file_sha256: file.sha256 },
      relocated: check.state === 'relocated',
    });
  }
  return { base: base!, verified };
}

function staleCitation(): OperatorWriteRefusal {
  return refuse(409, 'citation_stale', 'A cited passage changed since it was cited.', 'Open the document again and cite the passage again.');
}

/**
 * The exclusive mkdir is the path claim: it refuses an existing file,
 * directory or symlink, so the checkout cannot land outside the root through
 * the planned name. The claim must resolve to a managed path before git runs.
 * A refused claim or a failed `git worktree add` removes the claim when it is
 * still the empty directory this call made. The caller holds the topology lock.
 * Git runs asynchronously, so the server keeps answering during a slow checkout.
 */
async function addDocsWorktree(repoRoot: string, root: string, worktree: string, branch: string, base: string, env: NodeJS.ProcessEnv, deadline: number): Promise<string> {
  const git = (args: string[]) => gitExecFile(args, {
    cwd: repoRoot, gitBin: configuredGitBinary(env), env: gitEnvironment(env), timeout: Math.max(1, deadline - Date.now()),
  });
  // Only exit 1 means the ref is absent; a timeout or any other failure ends the request.
  const branchExists = await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).then(() => true, (error: unknown) => {
    if (error instanceof GitExecError && error.status === 1) return false;
    throw error;
  });
  if (branchExists) throw worktreeExists();
  try { mkdirSync(worktree, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw worktreeExists();
    throw error;
  }
  const claim = lstatSync(worktree);
  /** True when the claim is gone, so nothing of this call is left on disk. */
  const releaseClaim = (): boolean => {
    try {
      const current = lstatSync(worktree);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== claim.dev || current.ino !== claim.ino || readdirSync(worktree).length !== 0) return false;
      rmdirSync(worktree);
      return true;
    } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
  };
  const canonical = realpathSync(worktree);
  // A root component replaced after the root was resolved could move the claim; git must not run there.
  if (!isManagedWorktreePath(canonical, root, basename(repoRoot))) {
    if (releaseClaim()) throw refuse(503, 'worktree_root_changed', 'The managed worktree root changed during the request.', 'Retry with a new request_id.');
    throw new Error('doc session worktree claim resolved outside the managed root');
  }
  try {
    await git(['worktree', 'add', '-b', branch, canonical, base]);
  } catch (error) {
    releaseClaim();
    throw error;
  }
  return canonical;
}

function worktreeExists(): OperatorWriteRefusal {
  return refuse(409, 'worktree_exists', 'The planned session worktree or branch already exists.', 'Retry with a new request_id.');
}

/** `<repoHarnessHome>/operator/sessions/<sid>/session.json`, created once with mode 0600. */
function writeSessionRecord(env: NodeJS.ProcessEnv, sessionId: string, record: JsonValue): void {
  const operator = prepareOperatorStateDir(env);
  const sessions = join(operator, 'sessions');
  try {
    mkdirSync(sessions, { mode: 0o700 });
    syncDirectoryDurably(operator);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  // A sessions entry that is a symlink would put the record outside the operator state directory.
  if (!lstatSync(sessions).isDirectory()) throw new Error('doc session directory is not a real directory');
  const directory = join(sessions, sessionId);
  mkdirSync(directory, { mode: 0o700 });
  syncDirectoryDurably(sessions);
  createFileExclusiveDurably(join(directory, 'session.json'), Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
  // Each new directory entry survives a crash only after its parent is synced.
  syncDirectoryDurably(directory);
}

/** The runtime is in the launch allowlist and has the docs use in the agent settings. */
function assertDocsRuntime(runtime: string, env: NodeJS.ProcessEnv): void {
  if (!isDocsHostRuntimeId(runtime)) {
    // The allowlist is empty since #1149 was closed; retrying with another runtime cannot help.
    throw refuse(501, 'docs_host_disabled', 'The docs host is closed: no runtime has verified docs isolation.', 'Use the docs view to read; doc sessions are not available.');
  }
  let docs: readonly string[];
  try { docs = readAgentsConfiguration(env).agents.uses.docs; }
  catch (error) {
    if (!(error instanceof AgentsConfigurationError)) throw error;
    throw refuse(503, 'config_invalid', 'The agent settings cannot be read.', 'Fix the agents section of ~/.repo-harness/config.json, then retry with a new request_id.');
  }
  if (!docs.includes(runtime)) {
    throw refuse(422, 'runtime_not_enabled', `Runtime ${runtime} is not enabled for doc sessions.`, 'Turn on the docs use of this runtime in Settings, then retry with a new request_id.');
  }
}

async function createDocSession(input: DocSessionCreateInput, deps: DocSessionDependencies): Promise<OperatorWriteResponse> {
  try { assertDocsHostPlatform(deps.platform ?? process.platform); }
  catch { throw refuse(501, 'platform_unsupported', 'Doc sessions run only on macOS for now.', 'Use the docs view to read, or start the session on macOS.'); }
  assertDocsRuntime(input.runtime, deps.env);
  let repos;
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env: deps.env }).repos; }
  catch { throw refuse(503, 'registry_unavailable', 'The repository registry cannot be read.', 'Check the repository registry, then retry with a new request_id.'); }
  const repo = repos.find(entry => entry.id === input.repository_id);
  if (!repo) throw refuse(404, 'repository_not_found', 'This repository is not registered.', 'Register the repository, then retry.');
  const reader = deps.docs_reader(repo.id);
  if (reader === null) throw docsUnavailable();
  const { base, verified } = await verifyCitations(reader, input.citations);

  const sessionId = (deps.new_session_id ?? (() => randomBytes(16).toString('hex')))();
  if (!SESSION_ID.test(sessionId)) throw new Error('doc session id is malformed');
  const slug = sessionId.slice(0, 12);
  const branch = `docs/${slug}`;
  let root: string;
  try { root = managedWorktreeRoot(deps.env); }
  catch { throw refuse(503, 'worktree_root_unavailable', 'The managed worktree root does not exist.', 'Create the managed worktree root, then retry with a new request_id.'); }
  let primary: string;
  try { primary = realpathSync(repo.path); }
  catch { throw refuse(503, 'repository_unavailable', 'The registered checkout of this repository cannot be read.', 'Check the registered checkout, then retry with a new request_id.'); }
  const worktree = join(root, `${basename(primary)}-wt-docs-${slug}`);
  const deadline = Date.now() + DOC_SESSION_GIT_DEADLINE_MS;
  let canonical: string;
  try {
    canonical = await withWorktreeTopologyLockAsync(primary, () => addDocsWorktree(primary, root, worktree, branch, base, deps.env, deadline),
      { deadline, gitBin: configuredGitBinary(deps.env) });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) throw refuse(503, 'busy', 'Another worktree change in this repository is running.', 'Retry with a new request_id.');
    throw error;
  }

  const citations = verified.map(entry => ({ path: entry.resolved.path, start_line: entry.resolved.start_line, end_line: entry.resolved.end_line, relocated: entry.relocated }));
  writeSessionRecord(deps.env, sessionId, {
    protocol: 1, kind: 'docs_session', session_id: sessionId, state: 'created', created_at: new Date().toISOString(),
    repository_id: repo.id, runtime: input.runtime, branch, worktree: canonical, base_commit: base,
    // Submitted provenance and the verified location refer to different revisions after an edit.
    citations: verified.map(entry => ({ ...entry.citation, resolved: { ...entry.resolved }, relocated: entry.relocated })),
    instruction: input.instruction,
  });
  return {
    status: 201,
    body: { protocol: 1, kind: 'operator_docs_session', session_id: sessionId, state: 'created', repository_id: repo.id, runtime: input.runtime,
      branch, worktree: basename(canonical), base_commit: base, citations },
  };
}

/** `POST /api/v1/sessions` for `kind: docs`, served in production and replaced by id in tests. */
export function docSessionCreateRoute(deps: DocSessionDependencies): OperatorWriteRoute {
  return {
    id: 'sessions_create',
    path: OPERATOR_SESSIONS_ROUTE,
    decode(fields) {
      const input = decodeDocSessionCreate(fields);
      return {
        operation: 'docs_session_create',
        // One lock per repository serializes session creation in that repository.
        target: `docs_session_create:${input.repository_id}`,
        input: input as unknown as JsonValue,
        execute: () => createDocSession(input, deps),
      };
    },
  };
}

import {
  validPublicationBranchRef,
  validPublicationCommit,
  type NewRemoteRefPush,
  type NewRemoteRefPushResult,
  type RemoteRefAddress,
} from '../../core/publication/publication-writes';
import { configuredGitBinary, gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';

const PUSH_REMOTE = 'repo-harness-publication';

function git(env: NodeJS.ProcessEnv, checkout: string, args: readonly string[]): string {
  return gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd: checkout, env: { ...withoutRepositorySelectingGitEnv(env), GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' },
    gitBin: configuredGitBinary(env), timeout: 30_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** The commit of the remote ref, or null when the ref is absent. An invalid reply throws and never means absent. */
export function observeRemoteRef(env: NodeJS.ProcessEnv, address: RemoteRefAddress): string | null {
  if (!validPublicationBranchRef(address.ref)) throw new Error('remote ref request invalid');
  const text = git(env, address.checkout, ['ls-remote', '--refs', '--', address.remote_url, address.ref]);
  if (!text) return null;
  const rows = text.split('\n'), [oid, ref] = rows[0]!.split('\t');
  if (rows.length !== 1 || !validPublicationCommit(oid!) || ref !== address.ref) throw new Error('remote ref observation invalid');
  return oid!;
}

/**
 * Push one commit to a remote ref that does not exist. A replay finds its own
 * commit and pushes nothing. This operation never retries a push.
 */
export function pushCommitToNewRemoteRef(env: NodeJS.ProcessEnv, request: NewRemoteRefPush): NewRemoteRefPushResult {
  if (!validPublicationCommit(request.commit)) throw new Error('remote ref request invalid');
  let remote: string | null;
  try { remote = observeRemoteRef(env, request); } catch { return { state: 'not_pushed' }; }
  if (remote === request.commit) return { state: 'pushed' };
  if (remote !== null) return { state: 'refused' };
  try {
    // Git 2.56 updates the tracking refs of a configured remote whose URL equals a raw push URL. A named remote with
    // no fetch refspec writes no tracking ref. The empty lease requires an absent remote ref.
    git(env, request.checkout, ['-c', `remote.${PUSH_REMOTE}.url=${request.remote_url}`, 'push', '--porcelain',
      `--force-with-lease=${request.ref}:`, PUSH_REMOTE, `${request.commit}:${request.ref}`]);
    return { state: observeRemoteRef(env, request) === request.commit ? 'pushed' : 'unknown' };
  } catch {
    // A nonzero push, a timeout or a lost readback cannot establish that the remote ref did not move.
    return { state: 'unknown' };
  }
}

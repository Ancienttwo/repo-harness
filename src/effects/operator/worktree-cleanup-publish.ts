/** Production archive ports of CleanupExecutionPorts. They write the archive branch and its Draft PR, never the source worktree. */
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import { configuredGitBinary, gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import type { GithubDraftPrPublisher } from './doc-session-finalize-github';
import { stageCleanupArchive, type StagedCleanupArchive } from './worktree-cleanup-archive';
import type { CleanupObservationTarget } from './worktree-cleanup-observation';
import type { CleanupExecutionPorts } from './worktree-cleanup-plan';

/** The branch shape that the plan decoder accepts. Production passes it to createGithubDraftPrPublisher. */
export const CLEANUP_ARCHIVE_BRANCH = /^docs\/archive-[a-z0-9][a-z0-9-]{0,79}$/u;

export interface CleanupArchivePublisherOptions {
  readonly env: NodeJS.ProcessEnv;
  /** An existing private server scratch directory outside every source worktree. */
  readonly staging_root: string;
  /** Wall-clock budget of one staging call. */
  readonly stage_timeout_ms: number;
  /** Server-side target of a plan item id. */
  readonly target: (id: string) => CleanupObservationTarget;
  readonly github: GithubDraftPrPublisher;
}
type ArchivePorts = Pick<CleanupExecutionPorts, 'archiveCommit' | 'archivePush' | 'archivePr'> & {
  /** Read only: the local branch, the remote branch and the Draft PR hold this key's archive commit. Returns the PR URL. */
  readonly archivePublication: (key: string, item: CleanupPlanItem) => Promise<string>;
};

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PUSH_REMOTE = 'repo-harness-cleanup-archive';
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function createCleanupArchivePorts(sessionId: string, options: CleanupArchivePublisherOptions): ArchivePorts {
  const git = (cwd: string, args: readonly string[], input?: string | Buffer, index?: string): string => gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd, env: { ...withoutRepositorySelectingGitEnv(options.env), GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', ...(index ? { GIT_INDEX_FILE: index } : {}) },
    gitBin: configuredGitBinary(options.env), timeout: 30_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  /** The commit message carries the stable key. A retry finds its own branch by this exact message. */
  const destination = async (key: string, item: CleanupPlanItem) => {
    const layout = item.advice.archive.git;
    if (layout === null) throw new Error('cleanup archive has no Git destination');
    const repository = options.target(item.worktree.id).repository;
    const publication = await options.github.publication_target(repository);
    const message = `docs(archive): ${layout.directory}\n\nCleanup archive of worktree ${item.worktree.directory}. Draft only: cleanup never merges this branch.\n\nCleanup-Archive-Key: ${sha256(key)}`;
    return { layout, repository, publication, message, ref: `refs/heads/${layout.branch}` };
  };
  type Destination = Awaited<ReturnType<typeof destination>>;

  const localHead = (d: Destination): string | null => {
    const rows = git(d.repository, ['for-each-ref', '--format=%(refname) %(objectname)', '--', d.ref]).split('\n').filter(row => row.startsWith(`${d.ref} `));
    if (rows.length > 1) throw new Error('archive branch observation invalid');
    return rows[0]?.slice(d.ref.length + 1) ?? null;
  };
  const commitFields = (d: Destination, commit: string) => {
    const raw = git(d.repository, ['cat-file', 'commit', commit]), split = raw.indexOf('\n\n');
    const header = raw.slice(0, split).split('\n');
    return { tree: header[0]!.slice('tree '.length), parents: header.filter(line => line.startsWith('parent ')).map(line => line.slice('parent '.length)),
      message: raw.slice(split + 2) };
  };
  /** The local archive branch must hold the commit of this key. */
  const ownCommit = (d: Destination): string => {
    const commit = localHead(d);
    if (commit === null || commitFields(d, commit).message !== d.message) throw new Error('archive branch is not this archive');
    return commit;
  };
  const remoteUrl = (d: Destination): string => {
    const urls = git(d.repository, ['remote', 'get-url', '--push', '--all', d.publication.remote]).split('\n');
    if (urls.length !== 1 || !urls[0] || urls[0].startsWith('-')) throw new Error('archive remote ambiguous');
    return urls[0];
  };
  const remoteHead = (d: Destination, url: string): string | null => {
    const text = git(d.repository, ['ls-remote', '--refs', '--', url, d.ref]);
    if (!text) return null;
    const rows = text.split('\n'), [oid, ref] = rows[0]!.split('\t');
    if (rows.length !== 1 || !OID.test(oid!) || ref !== d.ref) throw new Error('archive remote branch observation invalid');
    return oid!;
  };

  /** Build the archive tree on the parent in a private index. Every staged byte is rehashed before Git stores it. */
  const archiveTree = (d: Destination, staged: StagedCleanupArchive, parent: string): string => {
    if (git(d.repository, ['ls-tree', '--name-only', parent, '--', d.layout.directory])) throw new Error('archive directory already exists on the base');
    const index = join(options.staging_root, `index-${randomUUID()}`);
    try {
      git(d.repository, ['read-tree', parent], undefined, index);
      const rows = staged.artifacts.filter(artifact => artifact.storage === 'git').map(artifact => {
        const fd = openSync(join(staged.git_directory!, d.layout.directory, artifact.path), constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes: Buffer;
        try { if (!fstatSync(fd).isFile()) throw new Error('staged archive artifact changed'); bytes = readFileSync(fd); } finally { closeSync(fd); }
        if (bytes.length !== artifact.size || sha256(bytes) !== artifact.sha256) throw new Error('staged archive artifact changed');
        return `100644 ${git(d.repository, ['hash-object', '-w', '--no-filters', '--stdin'], bytes)}\t${d.layout.directory}/${artifact.path}\0`;
      });
      git(d.repository, ['update-index', '-z', '--index-info'], rows.join(''), index);
      return git(d.repository, ['write-tree'], undefined, index);
    } finally {
      try { unlinkSync(index); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };

  return {
    archiveCommit: async (key, item) => {
      // Staging re-observes the bound loss and refuses credential files and secret content for Git.
      const staged = stageCleanupArchive(sessionId, options.target(item.worktree.id), item,
        { env: options.env, deadline: Date.now() + options.stage_timeout_ms, staging_root: options.staging_root });
      if (staged.key !== key) throw new Error('cleanup archive key changed');
      if (item.advice.archive.git === null) return;
      const d = await destination(key, item);
      const existing = localHead(d);
      if (existing !== null) {
        // Reconcile an earlier commit of this key: same message, one parent and the same archive tree.
        const fields = commitFields(d, existing);
        if (fields.message !== d.message || fields.parents.length !== 1 || fields.tree !== archiveTree(d, staged, fields.parents[0]!)) {
          throw new Error('archive branch is not this archive');
        }
        return;
      }
      const parent = git(d.repository, ['rev-parse', '--verify', '--end-of-options', `refs/remotes/${d.publication.remote}/${d.publication.base_branch}^{commit}`]);
      const commit = git(d.repository, ['commit-tree', archiveTree(d, staged, parent), '-p', parent], `${d.message}\n`);
      // Create only: a branch that another writer created first is never moved.
      git(d.repository, ['update-ref', d.ref, commit, '0'.repeat(commit.length)]);
      if (localHead(d) !== commit) throw new Error('archive branch readback failed');
    },
    archivePush: async (key, item) => {
      const d = await destination(key, item), commit = ownCommit(d), url = remoteUrl(d);
      const remote = remoteHead(d, url);
      if (remote !== null && remote !== commit) throw new Error('archive remote branch has another commit');
      // Git 2.56 updates the tracking refs of a configured remote whose URL equals a raw push URL, and the bound
      // loss covers refs/remotes. A named remote with no fetch refspec writes no tracking ref. The empty lease
      // requires an absent remote branch.
      if (remote === null) git(d.repository, ['-c', `remote.${PUSH_REMOTE}.url=${url}`, 'push', '--porcelain', `--force-with-lease=${d.ref}:`, PUSH_REMOTE, `${commit}:${d.ref}`]);
      if (remoteHead(d, url) !== commit) throw new Error('archive push readback failed');
    },
    archivePr: async (key, item) => {
      const d = await destination(key, item), commit = ownCommit(d);
      if (remoteHead(d, remoteUrl(d)) !== commit) throw new Error('archive remote branch changed');
      // create_draft_pr looks up the exact head before any create, so a retry finds an earlier PR.
      const created = await options.github.create_draft_pr(d.publication, d.layout.branch, commit, d.message);
      if (created.state !== 'created') throw new Error(`archive Draft PR ${created.state}`);
      const read = await options.github.find_draft_pr(d.publication, d.layout.branch, commit);
      if (read === null || read.number !== created.pr.number || read.url !== created.pr.url) throw new Error('archive Draft PR readback failed');
      return read.url;
    },
    archivePublication: async (key, item) => {
      const d = await destination(key, item), commit = ownCommit(d);
      if (remoteHead(d, remoteUrl(d)) !== commit) throw new Error('archive remote branch changed');
      const read = await options.github.find_draft_pr(d.publication, d.layout.branch, commit);
      if (read === null) throw new Error('archive Draft PR readback failed');
      return read.url;
    },
  };
}

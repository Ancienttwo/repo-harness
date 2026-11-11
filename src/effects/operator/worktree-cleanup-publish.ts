/** Production archive ports of CleanupExecutionPorts. They write the archive branch and its Draft PR, never the source worktree. */
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { githubRemoteRepository } from '../../core/board/source';
import type { CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import type { DraftPullRequest, DraftPullRequestHead, DraftPullRequestResult, PublicationRepository } from '../../core/publication/publication-writes';
import { configuredGitBinary, gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import type { GithubCommandRunner } from '../github/issues';
import { findDraftPullRequest, findOrCreateDraftPullRequest, readPublicationRepository } from '../publication/draft-pull-request';
import { observeRemoteRef, pushCommitToNewRemoteRef } from '../publication/new-remote-ref-push';
import { stageCleanupArchive, type StagedCleanupArchive } from './worktree-cleanup-archive';
import { cleanupGitRunner, type CleanupObservationTarget } from './worktree-cleanup-observation';
import type { CleanupExecutionPorts } from './worktree-cleanup-plan';

/** The branch shape that the plan decoder accepts. Production passes it to createGithubDraftPrPublisher. */
export const CLEANUP_ARCHIVE_BRANCH = /^docs\/archive-[a-z0-9][a-z0-9-]{0,79}$/u;

export interface CleanupPublicationTarget extends PublicationRepository {
  /** Server-selected remote and GitHub base, never request fields. */
  readonly remote: string;
}
/** Branch-parameterized Draft PR publication. Each caller owns its branch pattern. */
export interface GithubDraftPrPublisher {
  readonly publication_target: (checkout: string) => Promise<CleanupPublicationTarget>;
  /** Lookup all PR states by exact repository/head/base. Verify draft and head SHA.
   * Throw on unavailable/ambiguous results; null means a successful absence lookup. */
  readonly find_draft_pr: (target: CleanupPublicationTarget, branch: string, commit: string) => Promise<DraftPullRequest | null>;
  /** `not_created` requires proof no PR was created. Network/timeout/parse failures
   * are `unknown`. Never retry an uncertain create without provider reconciliation. */
  readonly create_draft_pr: (target: CleanupPublicationTarget, branch: string, commit: string, message: string) => Promise<DraftPullRequestResult>;
}
const fail = (): never => { throw new Error('doc session GitHub observation unavailable or incompatible'); };
function targetCheck(target: CleanupPublicationTarget, pattern: RegExp, branch: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(target.remote) || !pattern.test(branch)) fail();
}
const draftHead = (target: CleanupPublicationTarget, branch: string, commit: string): DraftPullRequestHead => ({
  repository: target.repository, base_branch: target.base_branch, head_branch: branch, commit,
});

export function createGithubDraftPrPublisher(
  env: NodeJS.ProcessEnv,
  branchPattern: RegExp,
  runner?: GithubCommandRunner,
  now?: () => number,
): GithubDraftPrPublisher {
  return {
    publication_target: async (checkout: string) => {
      const git = cleanupGitRunner(env).text;
      const names = git(checkout, ['remote']).trim().split('\n').filter(Boolean);
      if (names.length > 32) return fail();
      const candidates: Array<{ remote: string; repository: string }> = [];
      for (const remote of names) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(remote)) return fail();
        const fetchUrls = git(checkout, ['remote', 'get-url', '--all', remote]).trim().split('\n');
        const pushUrls = git(checkout, ['remote', 'get-url', '--push', '--all', remote]).trim().split('\n');
        const githubs = [...fetchUrls, ...pushUrls].map(githubRemoteRepository);
        if (githubs.every(name => name === null)) continue;
        if (fetchUrls.length !== 1 || pushUrls.length !== 1 || githubs[0] === null || githubs[0] !== githubs[1]) return fail();
        candidates.push({ remote, repository: githubs[0]! });
      }
      if (candidates.length !== 1) return fail();
      const selected = candidates[0]!;
      return { remote: selected.remote, ...readPublicationRepository(selected.repository, runner, now) };
    },
    find_draft_pr: async (target, branch, commit) => {
      targetCheck(target, branchPattern, branch);
      return findDraftPullRequest(draftHead(target, branch, commit), runner, now);
    },
    create_draft_pr: async (target, branch, commit, message): Promise<DraftPullRequestResult> => {
      targetCheck(target, branchPattern, branch);
      const title = message.split(/\r?\n/u)[0]!.trim().slice(0, 256) || 'Doc session changes';
      return findOrCreateDraftPullRequest({ ...draftHead(target, branch, commit), title, body: message }, runner, now);
    },
  };
}

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
  const remoteHead = (d: Destination, url: string) => observeRemoteRef(options.env, { checkout: d.repository, remote_url: url, ref: d.ref });

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
      const d = await destination(key, item), commit = ownCommit(d);
      // The operation writes no tracking ref, and the bound loss covers refs/remotes.
      const pushed = pushCommitToNewRemoteRef(options.env, { checkout: d.repository, remote_url: remoteUrl(d), ref: d.ref, commit });
      if (pushed.state !== 'pushed') throw new Error(`archive push ${pushed.state}`);
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

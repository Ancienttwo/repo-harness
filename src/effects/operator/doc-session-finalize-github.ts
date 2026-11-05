/** Provider adapters for the #1023 finalization core. Every GitHub write is a publication operation. */
import type { DocSessionPublicationTarget, DocSessionPrCreateResult } from '../../core/operator/doc-session-finalize';
import { githubRemoteRepository } from '../../core/board/source';
import type { DocSessionRecordV1 } from '../../core/operator/doc-session-record';
import type { DraftPullRequestHead } from '../../core/publication/publication-writes';
import type { GithubCommandRunner } from '../github/issues';
import { findDraftPullRequest, findOrCreateDraftPullRequest, readPublicationRepository } from '../publication/draft-pull-request';
import { docSessionGitRunner } from './doc-session-changes';
import type { DocSessionFinalizeDependencies } from './doc-session-finalize';

type Adapters = Pick<DocSessionFinalizeDependencies, 'publication_target' | 'find_draft_pr' | 'create_draft_pr'>;
/** Branch-parameterized Draft PR publication. Each caller owns its branch pattern. */
export interface GithubDraftPrPublisher {
  readonly publication_target: (checkout: string) => Promise<DocSessionPublicationTarget>;
  readonly find_draft_pr: DocSessionFinalizeDependencies['find_draft_pr'];
  readonly create_draft_pr: DocSessionFinalizeDependencies['create_draft_pr'];
}
const fail = (): never => { throw new Error('doc session GitHub observation unavailable or incompatible'); };
function targetCheck(target: DocSessionPublicationTarget, pattern: RegExp, branch: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(target.remote) || !pattern.test(branch)) fail();
}
const draftHead = (target: DocSessionPublicationTarget, branch: string, commit: string): DraftPullRequestHead => ({
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
      const git = docSessionGitRunner(env).text;
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
    create_draft_pr: async (target, branch, commit, message): Promise<DocSessionPrCreateResult> => {
      targetCheck(target, branchPattern, branch);
      const title = message.split(/\r?\n/u)[0]!.trim().slice(0, 256) || 'Doc session changes';
      return findOrCreateDraftPullRequest({ ...draftHead(target, branch, commit), title, body: message }, runner, now);
    },
  };
}

export function createDocSessionGithubAdapters(
  env: NodeJS.ProcessEnv,
  runner?: GithubCommandRunner,
  now?: () => number,
): Adapters {
  const publisher = createGithubDraftPrPublisher(env, /^docs\/[0-9a-f]{12}$/u, runner, now);
  return { ...publisher, publication_target: (session: DocSessionRecordV1) => publisher.publication_target(session.worktree) };
}

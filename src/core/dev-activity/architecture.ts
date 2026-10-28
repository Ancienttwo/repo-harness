import type { ArchitecturePullRequestsSource } from '../operator/architecture-map';
import { publicDevActivityText } from '../operator/public-text';
import type { DevActivitySnapshotV2 } from './types';

/**
 * The open PRs of one repository as the board shows them: the user's own PRs
 * (`--author @me`), one per work branch, so a PR from the default branch or a
 * second open PR on one branch is not listed. A repository whose GitHub read is
 * not `ok` has no PR list the map can call complete.
 */
export function architecturePullRequestsSource(snapshot: DevActivitySnapshotV2, repositoryId: string): ArchitecturePullRequestsSource {
  if (snapshot.collected_at === null) return { state: 'unavailable', reason: 'dev_activity_pending' };
  const github = snapshot.repositories.find(entry => entry.repository_id === repositoryId)?.sources.find(source => source.kind === 'github');
  if (github?.status !== 'ok' || github.observed_at === null) return { state: 'unavailable', reason: 'dev_activity_unavailable' };
  const pullRequests = snapshot.items.flatMap(item => (item.repository_id === repositoryId && item.pull_request?.state === 'open' && item.pull_request.changed_files !== null
    ? [{ ...item.pull_request, changed_files: item.pull_request.changed_files }] : []));
  return {
    state: 'ok',
    observed_at: github.observed_at,
    pull_requests: pullRequests.sort((a, b) => a.number - b.number).map(pr => ({
      number: pr.number, title: publicDevActivityText(pr.title), url: pr.url, head_sha: pr.head_sha, changed_files: pr.changed_files,
    })),
  };
}

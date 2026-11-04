import type { BoardItemV1, BoardPullRequestV1, BoardV1 } from './board';

/** The pull requests of an item in every state, newest number first. */
export function itemPullRequests(board: BoardV1, item: BoardItemV1): readonly BoardPullRequestV1[] {
  return board.pull_requests.filter(pr => item.pull_requests.includes(pr.number)).slice().sort((left, right) => right.number - left.number);
}

/** The pull request a row shows: the newest open one, else the newest merged one. */
export function primaryPullRequest(board: BoardV1, item: BoardItemV1): BoardPullRequestV1 | null {
  const prs = itemPullRequests(board, item);
  return prs.find(pr => pr.state === 'open') ?? prs.find(pr => pr.state === 'merged') ?? null;
}

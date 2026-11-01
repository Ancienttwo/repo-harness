// GitHub event filter of the events Worker. The Worker entry can export only handlers (workerd),
// so the rules live in this module.

// The comment headers of assets/skills/repo-harness-issue-flow/references/templates.md.
export const PROTOCOL_HEADERS = [
  'repo-harness issue claim', 'repo-harness issue claim status', 'repo-harness boundary question',
  'repo-harness scope change', 'repo-harness decision', 'repo-harness plan', 'repo-harness handoff',
  'repo-harness acceptance claim', 'repo-harness acceptance record', 'repo-harness review reply',
  'repo-harness unblocked', 'repo-harness integration status',
];
export const REQUIRED_CHECK = 'Required / CI';

function pullRequest(payload) {
  const pull = payload.pull_request;
  return { number: pull.number, url: pull.html_url, head_sha: pull.head.sha };
}

const protocolHeader = (body) => {
  const header = (body ?? '').split(/\r?\n/, 1)[0].trim();
  return PROTOCOL_HEADERS.includes(header) ? header : null;
};

// One GitHub delivery gives one bot event or null. `debounce` names the PR whose later pushes replace this one.
export function classify(name, payload, orchestratorLogin) {
  const action = payload.action;
  // GitHub logins are case-insensitive. The orchestrator must not wake itself with its own issues, comments or reviews.
  const byOrchestrator = payload.sender?.login?.toLowerCase() === orchestratorLogin.toLowerCase();
  switch (name) {
    case 'issue_comment': {
      const header = action === 'created' && !byOrchestrator ? protocolHeader(payload.comment.body) : null;
      return header && { kind: 'issue.comment', data: { number: payload.issue.number, url: payload.comment.html_url, header } };
    }
    case 'issues':
      if (action !== 'opened' || byOrchestrator) return null;
      return { kind: payload.issue.title.startsWith('[CI repair]') ? 'issue.ci_repair' : 'issue.opened',
        data: { number: payload.issue.number, url: payload.issue.html_url } };
    case 'pull_request_review': {
      const review = payload.review;
      // GitHub wraps each single review comment and thread reply in an empty `commented` review; those arrive as review comments.
      if (action !== 'submitted' || byOrchestrator || (review.state.toLowerCase() === 'commented' && !review.body)) return null;
      return { kind: 'pr.review', data: { ...pullRequest(payload), url: review.html_url } };
    }
    case 'pull_request_review_comment': {
      if (action !== 'created' || byOrchestrator) return null;
      const url = payload.comment.html_url;
      if (!payload.comment.in_reply_to_id) return { kind: 'pr.review_thread', data: { ...pullRequest(payload), url } };
      // A reply belongs to an existing thread. Only a protocol reply, such as `review reply`, is a notice.
      const header = protocolHeader(payload.comment.body);
      return header && { kind: 'pr.review_reply', data: { ...pullRequest(payload), url, header } };
    }
    case 'pull_request':
      if (action === 'closed') return { kind: payload.pull_request.merged ? 'pr.merged' : 'pr.closed', data: pullRequest(payload) };
      if (action === 'synchronize') {
        return { kind: 'pr.pushed', data: pullRequest(payload), debounce: `pr:${payload.repository.id}:${payload.pull_request.number}` };
      }
      return null;
    case 'check_run': {
      const run = payload.check_run;
      // The job runs only for pull requests; other runs report it as skipped. The other jobs of a run are dropped.
      if (action !== 'completed' || run.name !== REQUIRED_CHECK || run.conclusion === 'skipped') return null;
      return { kind: 'ci.pr', data: { pull_requests: run.pull_requests.map((pull) => pull.number), url: run.html_url,
        head_sha: run.head_sha, conclusion: run.conclusion } };
    }
    case 'workflow_run': {
      const run = payload.workflow_run;
      // `Required / CI` does not run on push. A newer push cancels the older run, so a cancelled run is no result.
      if (action !== 'completed' || run.event !== 'push' || run.head_branch !== payload.repository.default_branch || run.conclusion === 'cancelled') return null;
      return { kind: 'ci.main', data: { branch: run.head_branch, workflow: run.name, url: run.html_url, head_sha: run.head_sha, conclusion: run.conclusion } };
    }
    default:
      return null;
  }
}

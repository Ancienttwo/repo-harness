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

// One GitHub delivery gives one bot event or null. `debounce` names the PR whose later pushes replace this one.
export function classify(name, payload, orchestratorLogin) {
  const action = payload.action;
  switch (name) {
    case 'issue_comment': {
      // For `created` the sender is the comment author. The orchestrator must not wake itself.
      if (action !== 'created' || payload.sender.login === orchestratorLogin) return null;
      const header = payload.comment.body.split(/\r?\n/, 1)[0].trim();
      if (!PROTOCOL_HEADERS.includes(header)) return null;
      return { kind: 'issue.comment', data: { number: payload.issue.number, url: payload.comment.html_url, header } };
    }
    case 'issues':
      if (action !== 'opened') return null;
      return { kind: payload.issue.title.startsWith('[CI repair]') ? 'issue.ci_repair' : 'issue.opened',
        data: { number: payload.issue.number, url: payload.issue.html_url } };
    case 'pull_request_review':
      if (action !== 'submitted') return null;
      return { kind: 'pr.review', data: { ...pullRequest(payload), url: payload.review.html_url } };
    case 'pull_request_review_comment':
      // A reply belongs to an existing thread. Only the first comment opens a new thread.
      if (action !== 'created' || payload.comment.in_reply_to_id) return null;
      return { kind: 'pr.review_thread', data: { ...pullRequest(payload), url: payload.comment.html_url } };
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
      if (action !== 'completed' || run.event !== 'push' || run.head_branch !== payload.repository.default_branch) return null;
      return { kind: 'ci.main', data: { branch: run.head_branch, url: run.html_url, head_sha: run.head_sha, conclusion: run.conclusion } };
    }
    default:
      return null;
  }
}

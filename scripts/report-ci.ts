import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const validSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);

/** CI completion effect: GitHub is the authority for runs, repair issues and rollback boundaries. */
export class CIReportError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export type GitHubAPI = (path: string, method?: 'GET' | 'POST' | 'PATCH', body?: unknown) => Promise<unknown>;
export interface CIReport {
  run_id: number; run_attempt: number; sha: string; conclusion: string; run_url: string;
  repairs: { key: string; issue_url: string | null; delivery: 'created' | 'reused' | 'pending'; error?: string }[];
  merges: { pr: number; before: string; after: string; rollback: string }[];
  unresolved_repairs: { issue_number: number; url: string; title: string }[] | null;
  errors: string[];
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function safeText(value: unknown): string { return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 300); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}
async function githubPages(api: GitHubAPI, path: string, field?: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const entries: unknown = field ? record(response, `Provider page ${path}`)[field] : response;
    if (!Array.isArray(entries)) throw new Error(`Incomplete provider page: ${path}`);
    for (const entry of entries) all.push(record(entry, `Provider entry ${path}`));
    if (entries.length < 100) return all;
  }
  throw new Error(`Provider pagination limit reached: ${path}`);
}
async function ensureRepairIssue(api: GitHubAPI, root: string, key: string, title: string, body: string, requireOpen = false): Promise<{ issue_url: string; delivery: 'created' | 'reused' }> {
  const marker = `<!-- ${key} -->`;
  const isClaim = (issue: Record<string, unknown>): boolean => !issue.pull_request && (!requireOpen || issue.state === 'open')
    && typeof issue.body === 'string' && issue.body.includes(marker) && positive(issue.number);
  const issues = await githubPages(api, `${root}/issues?state=all`);
  const existing = issues.find(issue => isClaim(issue));
  if (existing) {
    if (typeof existing.html_url !== 'string') throw new Error('Existing repair issue has no provider URL');
    return { issue_url: existing.html_url, delivery: 'reused' };
  }
  const created = record(await api(`${root}/issues`, 'POST', { title, body: `${marker}\n\n${body}` }), 'Created repair issue');
  const createdNumber = created.number;
  const createdUrl = created.html_url;
  if (!positive(createdNumber) || typeof createdUrl !== 'string') throw new Error('Repair issue was not confirmed by provider');
  // Separate list and create is not atomic across report runs, and the shared
  // repair key admits concurrent creators. The oldest matching issue is the one
  // winning claim; a loser closes only its own duplicate and reuses the winner.
  const winner = (await githubPages(api, `${root}/issues?state=all`))
    .filter(issue => isClaim(issue) && (issue.number as number) < createdNumber)
    .sort((left, right) => (left.number as number) - (right.number as number))[0];
  if (!winner) return { issue_url: createdUrl, delivery: 'created' };
  record(await api(`${root}/issues/${createdNumber}`, 'PATCH', { state: 'closed' }), 'Duplicate repair issue close');
  if (typeof winner.html_url !== 'string') throw new Error('Existing repair issue has no provider URL');
  return { issue_url: winner.html_url, delivery: 'reused' };
}

/** The daily CI job whose failure means stale architecture documents. */
export const ARCHITECTURE_JOB = 'Daily architecture freshness';
/** The daily architecture job uploads this file; ci-report.yml downloads it here. */
export const ARCHITECTURE_SUMMARY_PATH = '.ci-architecture/summary.json';
/** The Bot decision table for each architecture check result. */
export const ARCHITECTURE_EVIDENCE = 'assets/skill-commands/repo-harness-check/references/architecture-evidence.md';
const ARCHITECTURE_MANIFEST = 'docs/architecture/.projection-manifest.json';
/** First cell of each row in the architecture evidence table. */
const ARCHITECTURE_ROWS = {
  noop: '`noop`',
  manifest: '`planned`, only `docs/architecture/.projection-manifest.json` in `files`',
  rendered: '`planned`, other `docs/architecture/` files',
  major: '`human-action-required` with `unresolved-major-change`',
  decision: 'Other `humanActions` reason codes, or `adoption-required`',
  error: 'Command error, `blocked` or a failure status',
} as const;
export interface ArchitectureSummary { status: string; staleNodes: string[]; files: string[]; humanActions: Record<string, unknown>[] }
/** summaryText is null when the daily job uploaded no summary. */
export interface ArchitectureInput { summaryText: string | null; evidence: string }

export function parseArchitectureSummary(text: string): ArchitectureSummary {
  const summary = record(JSON.parse(text), 'Architecture summary');
  const strings = (value: unknown, label: string): string[] => {
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) throw new Error(`Architecture summary ${label} must be a string array`);
    return value;
  };
  if (typeof summary.status !== 'string' || !summary.status) throw new Error('Architecture summary status must be a string');
  if (!Array.isArray(summary.humanActions)) throw new Error('Architecture summary humanActions must be an array');
  return { status: summary.status, staleNodes: strings(summary.staleNodes, 'staleNodes'), files: strings(summary.files, 'files'),
    humanActions: summary.humanActions.map(action => record(action, 'Architecture human action')) };
}

/** Returns the evidence table row for a summary. A missing summary means the check gave no result. */
export function architectureActionRow(summary: ArchitectureSummary | null, evidence: string): string {
  const status = summary?.status;
  const kind: keyof typeof ARCHITECTURE_ROWS = !summary ? 'error'
    : status === 'noop' ? 'noop'
    : status === 'planned' ? (summary.files.every(file => file === ARCHITECTURE_MANIFEST) ? 'manifest' : 'rendered')
    : status === 'human-action-required' && summary.humanActions.length > 0
      && summary.humanActions.every(action => action.reasonCode === 'unresolved-major-change') ? 'major'
    : status === 'human-action-required' || status === 'adoption-required' ? 'decision'
    : 'error';
  const row = evidence.split('\n').find(line => line.startsWith(`| ${ARCHITECTURE_ROWS[kind]} |`));
  if (!row) throw new Error(`No action row starts with ${ARCHITECTURE_ROWS[kind]} in ${ARCHITECTURE_EVIDENCE}`);
  return row;
}

export async function reportCI(repo: string, runId: number, api: GitHubAPI, architecture?: ArchitectureInput): Promise<CIReport> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !positive(runId)) throw new Error('Invalid provider repository/run identity');
  const root = `/repos/${repo}`;
  const run = record(await api(`${root}/actions/runs/${runId}`), 'CI run');
  if (run.id !== runId || run.path !== '.github/workflows/ci.yml' || run.head_branch !== 'main'
    || typeof run.event !== 'string' || !['push', 'schedule', 'workflow_dispatch'].includes(run.event) || run.status !== 'completed'
    || !positive(run.run_attempt) || !validSha(run.head_sha) || typeof run.html_url !== 'string'
    || typeof run.created_at !== 'string' || typeof run.conclusion !== 'string'
    || !['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale'].includes(run.conclusion)) {
    throw new Error('Run is not a completed fixed-main CI observation');
  }
  const headSha = run.head_sha;
  const report: CIReport = { run_id: runId, run_attempt: run.run_attempt, sha: run.head_sha,
    conclusion: run.conclusion, run_url: run.html_url, repairs: [], merges: [], unresolved_repairs: null, errors: [] };
  // The marker key stays the dedupe identity. An architecture repair only changes the title and body.
  const repair = async (identity: string, detail: string, requireOpen = false, cause?: { subject: string; body: string }): Promise<void> => {
    const key = requireOpen ? `ci-repair:${identity}` : `ci-repair:${run.id}:${run.run_attempt}:${identity}`;
    const action = cause ? `${cause.body}\n\nFollow this action in a repair PR. Do not weaken assertions.`
      : 'Investigate the real failure; open a repair PR and run typecheck + affected tests once. Do not weaken assertions.';
    try {
      const task = await ensureRepairIssue(api, root, key,
        `[CI repair] ${safeText(cause?.subject ?? identity)} @ ${headSha.slice(0, 12)}`,
        `Fixed main SHA: \`${run.head_sha}\`\nRun: ${run.html_url}\nAttempt: ${run.run_attempt}\nCheck: ${identity}\n\n${safeText(detail)}\n\n${action} Credentials/permissions and production operations require user approval.`, requireOpen);
      report.repairs.push({ key, ...task });
    } catch (error) {
      // The artifact is the pending delivery record. An HTTP refusal never becomes a fake dispatch success.
      report.repairs.push({ key, issue_url: null, delivery: 'pending', error: message(error) });
      report.errors.push(`Repair dispatch pending: ${identity}: ${message(error)}`);
    }
  };
  const architectureCause = (): { subject: string; body: string } => {
    const lines: string[] = [];
    let summary: ArchitectureSummary | null = null;
    if (!architecture || architecture.summaryText === null) {
      lines.push('The job uploaded no architecture summary, so the check gave no JSON result. Read the job log.');
    } else {
      try { summary = parseArchitectureSummary(architecture.summaryText); } catch (error) {
        lines.push(`The architecture summary is not valid: ${safeText(message(error))}`);
        report.errors.push(`Architecture summary invalid: ${message(error)}`);
      }
    }
    if (summary) lines.push('Architecture summary:', '', '```json', JSON.stringify(summary, null, 2), '```', '', `Stale nodes: ${summary.staleNodes.join(', ') || 'none'}`);
    try {
      lines.push('', `Action from \`${ARCHITECTURE_EVIDENCE}\`:`, '', '| Result | Meaning | Bot decision |', '| --- | --- | --- |', architectureActionRow(summary, architecture?.evidence ?? ''));
    } catch (error) {
      lines.push(safeText(message(error)));
      report.errors.push(`Architecture action unavailable: ${message(error)}`);
    }
    return { subject: `architecture freshness ${summary?.status ?? 'without summary'}`, body: lines.join('\n') };
  };
  if (run.conclusion !== 'success') {
    try {
      const jobs = await githubPages(api, `${root}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
      const failures = jobs.filter(job => job.conclusion !== 'success' && job.conclusion !== 'skipped');
      if (!failures.length) await repair(`run-${run.id}`, `Run concluded ${run.conclusion}; no successful complete daily observation.`);
      for (const job of failures) {
        // Job/check identity comes from GitHub, never a locally generated check receipt.
        if (!positive(job.id) || typeof job.check_run_url !== 'string') throw new Error('Failed job has no check identity');
        const check = record(await api(new URL(job.check_run_url).pathname), 'Failed check');
        if (!positive(check.id)) throw new Error('Failed check identity unavailable');
        // The job name is the repair key: a later attempt or daily run reuses the open issue.
        await repair(`job:${safeText(job.name)}`, `${safeText(job.name)}: ${safeText(job.conclusion)}. Check: ${check.html_url ?? job.check_run_url}`,
          true, job.name === ARCHITECTURE_JOB ? architectureCause() : undefined);
      }
    } catch (error) { report.errors.push(`Failure observation incomplete: ${message(error)}`); await repair(`run-${run.id}`, 'Failed run/check observation was incomplete.'); }
  }

  try {
    const createdAt = Date.parse(run.created_at);
    if (!Number.isFinite(createdAt)) throw new Error('Daily reporting interval unavailable');
    const since = createdAt - 24 * 60 * 60 * 1000;
    // Closed PR readback is also recovery: a missed push report is repaired by the next daily report.
    const prs = await githubPages(api, `${root}/pulls?state=closed&sort=updated&direction=desc`);
    for (const pr of prs) {
      if (pr.merged_at === null) continue;
      const base = record(pr.base, 'PR base');
      if (base.ref !== 'main') continue;
      if (typeof pr.merged_at !== 'string' || !Number.isFinite(Date.parse(pr.merged_at))) throw new Error('PR merge time unavailable');
      if (Date.parse(pr.merged_at) < since || Date.parse(pr.merged_at) > createdAt) continue;
      if (!positive(pr.number) || !validSha(pr.merge_commit_sha)) throw new Error('Merged PR identity incomplete');
      const after = pr.merge_commit_sha;
      try {
        const commit = record(await api(`${root}/git/commits/${after}`), 'Merge commit');
        if (commit.sha !== after || !Array.isArray(commit.parents) || commit.parents.length !== 1) throw new Error('Automatic rollback requires a single-parent commit boundary');
        const parent = record(commit.parents[0], 'Commit parent');
        if (!validSha(parent.sha) || parent.sha === after) throw new Error('Commit parent identity unavailable');
        const membership = record(await api(`${root}/compare/${after}...${run.head_sha}`), 'Snapshot membership');
        if (membership.status === 'behind' || membership.status === 'diverged') continue;
        if (membership.status !== 'ahead' && membership.status !== 'identical') throw new Error('Snapshot membership unavailable');
        const detail = record(await api(`${root}/pulls/${pr.number}`), 'Merged PR detail');
        if (detail.number !== pr.number || detail.merged !== true || detail.merge_commit_sha !== after
          || record(detail.base, 'Merged PR detail base').ref !== 'main') throw new Error('Merged PR detail does not match the rollback boundary');
        const parentAssociations = await api(`${root}/commits/${parent.sha}/pulls?per_page=100`);
        if (!Array.isArray(parentAssociations) || parentAssociations.length >= 100) throw new Error('Rollback parent PR associations incomplete');
        const parentPRs = parentAssociations.map(entry => {
          const pr = record(entry, 'Rollback parent PR association');
          if (!positive(pr.number)) throw new Error('Rollback parent PR number unavailable');
          return pr.number;
        });
        if (parentPRs.includes(pr.number)) throw new Error(`Automatic rollback cannot revert only the last commit of multi-commit rebase PR #${pr.number}`);
        const before = parent.sha;
        report.merges.push({ pr: pr.number, before, after, rollback: `git revert --no-edit ${after}` });
      } catch (error) {
        report.errors.push(`Rollback boundary pending for PR #${pr.number}: ${message(error)}`);
        await repair(`merge-pr-${pr.number}`, 'Recover the exact GitHub merge commit, its single parent and the parent PR associations in the fixed main snapshot. Automatic rollback cannot revert only the last commit of a multi-commit rebase PR. Never repeat the completed merge.', true);
      }
    }
  } catch (error) { report.errors.push(`Merge reporting incomplete: ${message(error)}`); await repair(`report-${run.id}`, 'Recover provider merge boundary report.'); }
  try {
    const open = await githubPages(api, `${root}/issues?state=open`);
    report.unresolved_repairs = open.filter(issue => !issue.pull_request && issue.state === 'open' && typeof issue.body === 'string'
      && (issue.body.includes('<!-- ci-repair:') || issue.body.includes('<!-- ci-daily-missing:'))).map(issue => {
      if (!positive(issue.number) || typeof issue.html_url !== 'string') throw new Error('Open repair identity incomplete');
      return { issue_number: issue.number, url: issue.html_url, title: safeText(issue.title) };
    });
  } catch (error) { report.errors.push(`Unresolved repair readback unavailable: ${message(error)}`); }
  return report;
}

/** Independent post-deadline observer catches a schedule that produced no completion event. */
export async function watchDailyCI(repo: string, now: Date, api: GitHubAPI, scheduleCron: string): Promise<Record<string, unknown>> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isFinite(now.getTime())) throw new Error('Invalid daily observer context');
  const root = `/repos/${repo}`;
  const fields = scheduleCron.split(/\s+/);
  if (fields.length !== 5 || fields.slice(2).join(' ') !== '* * *' || !/^\d+$/.test(fields[0]!) || !/^\d+$/.test(fields[1]!)) throw new Error('Daily observer requires an explicit daily UTC schedule');
  const minute = Number(fields[0]); const hour = Number(fields[1]);
  if (minute > 59 || hour > 23) throw new Error('Invalid daily UTC schedule');
  const expectedAt = new Date(now);
  expectedAt.setUTCHours(hour, minute, 0, 0);
  if (expectedAt.getTime() > now.getTime()) expectedAt.setUTCDate(expectedAt.getUTCDate() - 1);
  const date = expectedAt.toISOString().slice(0, 10);
  const expected = expectedAt.getTime();
  if (now.getTime() < expected + 4 * 60 * 60 * 1000) throw new Error('Daily observation is before the four-hour deadline');
  const key = `ci-daily-missing:${date}`;
  try {
    const runs = await githubPages(api, `${root}/actions/workflows/ci.yml/runs?event=schedule&created=${date}..${now.toISOString().slice(0, 10)}`, 'workflow_runs');
    const matching = runs.filter(run => {
      if (!positive(run.id) || typeof run.created_at !== 'string' || !Number.isFinite(Date.parse(run.created_at)) || typeof run.status !== 'string') throw new Error('Daily run observation incomplete');
      return run.path === '.github/workflows/ci.yml' && run.head_branch === 'main' && run.event === 'schedule'
        && Date.parse(run.created_at) >= expected && Date.parse(run.created_at) <= now.getTime();
    });
    if (matching.some(run => run.status === 'completed')) return { date, observation: 'completion-observed', run_ids: matching.map(run => run.id) };
    const main = record(await api(`${root}/commits/main`), 'Observed main commit');
    if (!validSha(main.sha)) throw new Error('Missing-run main subject unavailable');
    const task = await ensureRepairIssue(api, root, key, `[CI repair] daily full run incomplete ${date}`,
      `Observed main SHA: ${main.sha}. Expected daily CI: ${expectedAt.toISOString()}. No completed run was observed by ${now.toISOString()}. Observed run IDs: ${matching.map(run => run.id).join(', ') || 'none'}.\n\nRepair schedule/runtime delivery without manufacturing green verification or performing credential/production operations.`);
    return { date, key, sha: main.sha, run_ids: matching.map(run => run.id), observation: matching.length ? 'deadline-exceeded' : 'not-started', ...task };
  } catch (error) { return { date, key, observation: 'unknown', delivery: 'pending', error: message(error) }; }
}

export function renderReport(report: CIReport): string {
  return `# Main CI daily report\n\nSHA: \`${report.sha}\`\nRun: ${report.run_url}\nResult: ${report.conclusion}\n\n`
    + report.merges.map(merge => `- PR #${merge.pr}: \`${merge.before}\` → \`${merge.after}\`; rollback: \`${merge.rollback}\``).join('\n')
    + `\n\nRepair tasks:\n${report.repairs.map(repair => `- ${repair.key}: ${repair.delivery}${repair.issue_url ? ` (${repair.issue_url})` : ''}${repair.error ? `: ${safeText(repair.error)}` : ''}`).join('\n')}`
    + `\n\nUnresolved repair backlog: ${report.unresolved_repairs === null ? 'unknown' : report.unresolved_repairs.map(issue => `#${issue.issue_number} ${issue.url}`).join(', ') || 'none'}\n`
    + `\n\nPending H02/H03/H04 approvals are not observed by CI; their operation owner retains user approval.\n`
    + (report.errors.length ? `\nUnresolved: ${report.errors.map(safeText).join('; ')}\n` : '');
}

if (import.meta.main) {
  const event = record(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')), 'CI event');
  const selectedRun = event.workflow_run === undefined ? null : record(event.workflow_run, 'CI event run');
  const selectedRunId = selectedRun?.id;
  const repo = process.env.GITHUB_REPOSITORY!;
  const api: GitHubAPI = async (path, method = 'GET', body) => {
    if (!path.startsWith(`/repos/${repo}/`)) throw new Error('Cross-repository API operation refused');
    const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
      method, headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GH_TOKEN!}`, 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      let providerMessage = isRecord(payload) && typeof payload.message === 'string' ? payload.message : '';
      const token = process.env.GH_TOKEN;
      if (token) providerMessage = providerMessage.split(token).join('[REDACTED]');
      providerMessage = safeText(providerMessage.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[REDACTED]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]'));
      throw new CIReportError(response.status, `GitHub ${method} ${path}: HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`);
    }
    return response.json();
  };
  mkdirSync('.ci-report', { recursive: true });
  try {
    if (process.argv.includes('--watchdog')) {
      const workflow = record(Bun.YAML.parse(readFileSync('.github/workflows/ci.yml', 'utf8')), 'CI workflow');
      const triggers = record(workflow.on, 'CI triggers');
      if (!Array.isArray(triggers.schedule) || triggers.schedule.length !== 1) throw new Error('Authoritative daily CI schedule unavailable');
      const cron = record(triggers.schedule[0], 'CI daily schedule').cron;
      if (typeof cron !== 'string') throw new Error('Authoritative daily CI schedule unavailable');
      const observation = await watchDailyCI(repo, new Date(), api, cron);
      writeFileSync('.ci-report/watchdog.json', JSON.stringify(observation, null, 2));
      writeFileSync('.ci-report/watchdog.md', `# Daily CI delivery observation\n\n${JSON.stringify(observation, null, 2)}\n`);
      if (observation.delivery === 'pending') process.exitCode = 1;
    } else {
      if (!positive(selectedRunId)) throw new Error('CI event run identity unavailable');
      const architecture: ArchitectureInput = {
        summaryText: existsSync(ARCHITECTURE_SUMMARY_PATH) ? readFileSync(ARCHITECTURE_SUMMARY_PATH, 'utf8') : null,
        evidence: readFileSync(join(import.meta.dir, '..', ARCHITECTURE_EVIDENCE), 'utf8'),
      };
      const report = await reportCI(repo, selectedRunId, api, architecture);
      writeFileSync('.ci-report/report.json', JSON.stringify(report, null, 2));
      writeFileSync('.ci-report/report.md', renderReport(report));
      if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, renderReport(report));
      if (report.errors.length) process.exitCode = 1;
    }
  } catch (error) {
    writeFileSync('.ci-report/pending.json', JSON.stringify({ run_id: selectedRunId, delivery: 'pending', error: message(error) }, null, 2));
    throw error;
  }
}

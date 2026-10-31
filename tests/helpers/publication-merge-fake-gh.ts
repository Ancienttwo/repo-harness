/**
 * A fake `gh` for the publication merge executor. It answers the readiness
 * reads and the executor's own reads and mutation from one scenario, and
 * records every call. Run as a script, it reads the scenario and log paths
 * that `installFakeGh` bakes into its wrapper.
 */
import { appendFileSync, chmodSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export const REPOSITORY = 'example/repo-harness';
export const REPOSITORY_ID = '1001';
export const PR = 42;
export const HEAD = 'a'.repeat(40);
export const BASE = 'b'.repeat(40);
export const MERGE_COMMIT = 'c'.repeat(40);
const REPOSITORY_NODE = 'R_publication_merge';
const PR_NODE = 'PR_publication_merge';

export const POLICY_ON = `${JSON.stringify({ merge_gate: { enabled: true }, publication: { acceptance_merge: 'on' } }, null, 2)}\n`;

export interface PublicationMergeScenario {
  /** Policy text at the base and head SHAs; null is a 404. */
  readonly policyBase: string | null;
  readonly policyHead: string | null;
  readonly isCrossRepository?: boolean;
  readonly autoMerge?: boolean;
  /** `missing` omits the field from the PR read. */
  readonly mergeQueueEnabled?: boolean | 'missing';
  /** null is an unprotected branch (404). */
  readonly protection?: { readonly strict: boolean; readonly enforce_admins: boolean } | null;
  readonly rules?: readonly { readonly type: string }[];
  readonly checks?: 'pass' | 'pending';
  readonly unresolvedThreads?: number;
  readonly changesRequested?: boolean;
  readonly title?: string;
  readonly body?: string;
  /** `owner/repo#n` identifiers that closingIssuesReferences returns. */
  readonly closing?: readonly string[];
  readonly closingHasNextPage?: boolean;
  readonly merge?: 'ok' | 'graphql_error' | 'internal_error' | 'null_errors' | 'kill' | 'truncated';
  /** The PR that `repos/<repo>/pulls/<n>` returns after the mutation; `fail` is a failed read. */
  readonly readback?: 'merged' | 'open' | 'fail';
  /** The merged SHA the PR readback reports; defaults to the merge response SHA. */
  readonly readbackMergeSha?: string;
  /** Per-readback PR answers; the last answer repeats. Defaults to `readback`. */
  readonly readbackSequence?: readonly ('merged' | 'open' | 'fail')[];
  readonly parents?: readonly string[];
  /** Fail one review publish write after any earlier write succeeded. */
  readonly failPost?: 'review' | 'record';
  /** The head SHA that each successive `pr view` reports; the last entry repeats. */
  readonly headSequence?: readonly string[];
  /** Make one review publish POST end with an unknown outcome. */
  readonly unknownPost?: 'claim' | 'review' | 'record';
  /** How the unknown POST ends: a lost response, invalid JSON, or an unstable URL. */
  readonly unknownPostMode?: 'timeout' | 'invalid_json' | 'bad_url';
}

function unknownPostResponse(scenario: PublicationMergeScenario, review: boolean): FakeGhResponse {
  const mode = scenario.unknownPostMode ?? 'invalid_json';
  if (mode === 'timeout') return { status: null, stdout: '', stderr: '' };
  if (mode === 'bad_url') {
    return ok(review
      ? { id: 1, commit_id: HEAD, state: 'COMMENTED', html_url: 'https://example.invalid/pull/42#pullrequestreview-1' }
      : { id: 1, html_url: 'https://example.invalid/pull/42#issuecomment-1' });
  }
  return { status: 0, stdout: '{"id":' };
}

export function passingScenario(overrides: Partial<PublicationMergeScenario> = {}): PublicationMergeScenario {
  return { policyBase: POLICY_ON, policyHead: POLICY_ON, title: 'Ship the executor', body: 'Closes #7\n\nDetails.', closing: [`${REPOSITORY}#7`], ...overrides };
}

export interface FakeGhResponse {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
}

const ok = (value: unknown): FakeGhResponse => ({ status: 0, stdout: JSON.stringify(value) });
const notFound = (): FakeGhResponse => ({ status: 1, stdout: JSON.stringify({ message: 'Not Found', status: '404' }), stderr: 'gh: Not Found (HTTP 404)' });

function policyFile(text: string | null): FakeGhResponse {
  if (text === null) return notFound();
  return ok({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from(text).toString('base64') });
}

function graphqlQuery(args: readonly string[]): string {
  return args.find((arg) => arg.startsWith('query='))?.slice('query='.length) ?? '';
}

/** One fake provider answer. Unknown calls fail loudly so a test sees the missing fixture. */
export function fakeGhResponse(args: readonly string[], scenario: PublicationMergeScenario, prReadbackAttempt = 0, input = '', prViewAttempt = 0): FakeGhResponse {
  const root = `repos/${REPOSITORY}`;
  const [command, sub] = args;
  if (command === 'repo' && sub === 'view') return ok({ id: REPOSITORY_NODE, nameWithOwner: REPOSITORY });
  if (command === 'pr' && sub === 'view') {
    const sequence = scenario.headSequence;
    const head = sequence?.length ? sequence[Math.min(prViewAttempt, sequence.length - 1)]! : HEAD;
    return ok({ number: PR, url: `https://github.com/${REPOSITORY}/pull/${PR}`, state: 'OPEN', isDraft: false,
      headRefOid: head, headRefName: 'feat/executor', baseRefOid: BASE, baseRefName: 'main', body: scenario.body ?? '',
      reviewDecision: '', mergeable: 'MERGEABLE' });
  }
  if (command === 'pr' && sub === 'checks') {
    const bucket = scenario.checks ?? 'pass';
    return { status: bucket === 'pending' ? 8 : 0, stdout: JSON.stringify([{ name: 'Required / CI', bucket,
      link: `https://github.com/${REPOSITORY}/actions/runs/123/job/456` }]) };
  }
  if (command !== 'api') return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
  if (sub === 'graphql') {
    const query = graphqlQuery(args);
    if (query.includes('mergePullRequest')) {
      // A null status is a request that never completed; the script form dies by SIGKILL like a spawn timeout.
      if (scenario.merge === 'kill') return { status: null, stdout: '', stderr: '' };
      if (scenario.merge === 'truncated') return { status: 0, stdout: '{"data":{"mergePullRequest":' };
      if (scenario.merge === 'graphql_error') {
        return { status: 1, stdout: JSON.stringify({ data: { mergePullRequest: null }, errors: [{ type: 'UNPROCESSABLE', message: 'Head branch was modified. Review and try the merge again.' }] }), stderr: 'gh: Head branch was modified.' };
      }
      if (scenario.merge === 'internal_error') {
        return { status: 1, stdout: JSON.stringify({ data: null, errors: [{ type: 'INTERNAL', message: 'Something went wrong while executing your query.' }] }), stderr: 'gh: Something went wrong' };
      }
      if (scenario.merge === 'null_errors') return { status: 1, stdout: JSON.stringify({ errors: [null] }), stderr: 'gh: error' };
      return ok({ data: { mergePullRequest: { pullRequest: { number: PR, state: 'MERGED', mergeCommit: { oid: MERGE_COMMIT } } } } });
    }
    if (query.includes('closingIssuesReferences')) {
      return ok({ data: { repository: { nameWithOwner: REPOSITORY, pullRequest: {
        id: PR_NODE, number: PR, title: scenario.title ?? '', body: scenario.body ?? '', state: 'OPEN',
        isCrossRepository: scenario.isCrossRepository ?? false, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main',
        ...(scenario.mergeQueueEnabled === 'missing' ? {} : { isMergeQueueEnabled: scenario.mergeQueueEnabled ?? false }),
        autoMergeRequest: scenario.autoMerge ? { enabledAt: '2026-10-30T00:00:00Z' } : null,
        closingIssuesReferences: { pageInfo: { hasNextPage: scenario.closingHasNextPage ?? false },
          nodes: (scenario.closing ?? []).map((reference) => {
            const [repository, number] = reference.split('#');
            return { number: Number(number), repository: { nameWithOwner: repository } };
          }) },
      } } } });
    }
    return ok({ data: { node: { id: REPOSITORY_NODE, pullRequest: {
      number: PR, headRefOid: HEAD, baseRefOid: BASE, reviewDecision: null,
      latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: scenario.changesRequested ? [{ state: 'CHANGES_REQUESTED' }] : [] },
      reviewThreads: { pageInfo: { hasNextPage: false }, nodes: Array.from({ length: scenario.unresolvedThreads ?? 0 }, () => ({ isResolved: false })) },
    } } } });
  }
  if (sub === `${root}/issues/${PR}/comments`) {
    const payload = input ? JSON.parse(input) as { body?: unknown } : {};
    const body = typeof payload.body === 'string' ? payload.body : '';
    if (scenario.failPost === 'record' && body.startsWith('repo-harness acceptance record')) {
      return { status: 1, stdout: '', stderr: 'gh: acceptance record write failed' };
    }
    if (scenario.unknownPost === 'claim' && body.startsWith('repo-harness acceptance claim')) return unknownPostResponse(scenario, false);
    if (scenario.unknownPost === 'record' && body.startsWith('repo-harness acceptance record')) return unknownPostResponse(scenario, false);
    const id = numericId(body);
    return ok({ id, html_url: `https://github.com/${REPOSITORY}/pull/${PR}#issuecomment-${id}` });
  }
  if (sub === `${root}/pulls/${PR}/reviews`) {
    if (scenario.failPost === 'review') return { status: 1, stdout: '', stderr: 'gh: review write failed' };
    if (scenario.unknownPost === 'review') return unknownPostResponse(scenario, true);
    const payload = input ? JSON.parse(input) as { commit_id?: unknown } : {};
    return ok({ id: numericId(input), commit_id: payload.commit_id, state: 'COMMENTED',
      html_url: `https://github.com/${REPOSITORY}/pull/${PR}#pullrequestreview-${numericId(input)}` });
  }
  if (sub === root) return ok({ id: Number(REPOSITORY_ID), node_id: REPOSITORY_NODE, full_name: REPOSITORY, default_branch: 'main' });
  if (sub === `${root}/actions/runs/123`) {
    return ok({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD, status: 'completed', conclusion: 'success',
      pull_requests: [{ number: PR, head: { sha: HEAD }, base: { sha: BASE } }] });
  }
  if (sub?.startsWith(`${root}/contents/.github/workflows/ci-report.yml`)) return notFound();
  if (sub === `${root}/contents/.ai/harness/policy.json?ref=${BASE}`) return policyFile(scenario.policyBase);
  if (sub === `${root}/contents/.ai/harness/policy.json?ref=${HEAD}`) return policyFile(scenario.policyHead);
  if (sub === `${root}/branches/main/protection`) {
    const protection = scenario.protection === undefined ? { strict: true, enforce_admins: true } : scenario.protection;
    if (protection === null) return notFound();
    return ok({ required_status_checks: { strict: protection.strict, contexts: ['Required / CI'] }, enforce_admins: { enabled: protection.enforce_admins } });
  }
  if (sub === `${root}/rules/branches/main?per_page=100`) return ok(scenario.rules ?? []);
  if (sub === `${root}/pulls/${PR}`) {
    const sequence = scenario.readbackSequence;
    const state = sequence === undefined ? scenario.readback : sequence[Math.min(prReadbackAttempt, sequence.length - 1)];
    if (state === 'fail') return { status: 1, stdout: '', stderr: 'gh: connection reset' };
    if (state === 'open') return ok({ number: PR, state: 'open', merged: false, merge_commit_sha: null, head: { sha: HEAD }, base: { ref: 'main' } });
    return ok({ number: PR, state: 'closed', merged: true, merge_commit_sha: scenario.readbackMergeSha ?? MERGE_COMMIT, head: { sha: HEAD }, base: { ref: 'main' } });
  }
  if (sub === `${root}/git/commits/${MERGE_COMMIT}`) {
    return ok({ sha: MERGE_COMMIT, parents: (scenario.parents ?? [BASE]).map((sha) => ({ sha })) });
  }
  return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
}

function numericId(value: string): number {
  return parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}

export function isMergeMutation(args: readonly string[]): boolean {
  return args[0] === 'api' && args[1] === 'graphql' && graphqlQuery(args).includes('mergePullRequest');
}

/** The value of one `-f name=value` GraphQL variable. */
export function graphqlVariable(args: readonly string[], name: string): string | undefined {
  for (let index = 0; index < args.length - 1; index++) {
    if ((args[index] === '-f' || args[index] === '-F') && args[index + 1]!.startsWith(`${name}=`)) return args[index + 1]!.slice(name.length + 1);
  }
  return undefined;
}

export interface InstalledFakeGh {
  readonly bin: string;
  calls(): string[][];
  /** Every call with the stdin body that a POST command received. */
  inputs(): { readonly args: string[]; readonly input: string }[];
  setScenario(scenario: PublicationMergeScenario): void;
}

/** Write an executable fake gh into `dir`. Every call appends its argv to a log. */
export function installFakeGh(dir: string, scenario: PublicationMergeScenario): InstalledFakeGh {
  const scenarioPath = join(dir, 'fake-gh-scenario.json');
  const logPath = join(dir, 'fake-gh-calls.jsonl');
  const inputLogPath = join(dir, 'fake-gh-inputs.jsonl');
  const readbackCountPath = join(dir, 'fake-gh-readbacks');
  const prViewCountPath = join(dir, 'fake-gh-pr-views');
  const bin = join(dir, 'fake-gh');
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  writeFileSync(scenarioPath, JSON.stringify(scenario));
  writeFileSync(logPath, '');
  writeFileSync(inputLogPath, '');
  writeFileSync(readbackCountPath, '0');
  writeFileSync(prViewCountPath, '0');
  writeFileSync(bin, `#!/bin/sh\nFAKE_GH_SCENARIO=${quote(scenarioPath)} FAKE_GH_LOG=${quote(logPath)} FAKE_GH_INPUT_LOG=${quote(inputLogPath)} FAKE_GH_READBACKS=${quote(readbackCountPath)} FAKE_GH_PR_VIEWS=${quote(prViewCountPath)} exec ${quote(process.execPath)} ${quote(import.meta.path)} "$@"\n`);
  chmodSync(bin, 0o755);
  return {
    bin,
    calls: () => readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as string[]),
    inputs: () => readFileSync(inputLogPath, 'utf-8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { args: string[]; input: string }),
    setScenario: (next) => writeFileSync(scenarioPath, JSON.stringify(next)),
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  appendFileSync(process.env.FAKE_GH_LOG!, `${JSON.stringify(args)}\n`);
  const input = args.includes('--input') ? readFileSync(0, 'utf-8') : '';
  appendFileSync(process.env.FAKE_GH_INPUT_LOG!, `${JSON.stringify({ args, input })}\n`);
  let readbackAttempt = 0;
  if (args[0] === 'api' && /\/pulls\/\d+$/u.test(args[1] ?? '')) {
    const countPath = process.env.FAKE_GH_READBACKS!;
    readbackAttempt = Number(readFileSync(countPath, 'utf-8')) || 0;
    writeFileSync(countPath, String(readbackAttempt + 1));
  }
  let prViewAttempt = 0;
  if (args[0] === 'pr' && args[1] === 'view') {
    const countPath = process.env.FAKE_GH_PR_VIEWS!;
    prViewAttempt = Number(readFileSync(countPath, 'utf-8')) || 0;
    writeFileSync(countPath, String(prViewAttempt + 1));
  }
  const response = fakeGhResponse(args, JSON.parse(readFileSync(process.env.FAKE_GH_SCENARIO!, 'utf-8')) as PublicationMergeScenario, readbackAttempt, input, prViewAttempt);
  if (response.status === null) process.kill(process.pid, 'SIGKILL');
  if (response.stdout) process.stdout.write(response.stdout);
  if (response.stderr) process.stderr.write(response.stderr);
  process.exitCode = response.status ?? 1;
}

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initGitRepo, run, tmpWorkspace } from './helpers/repo-fixture';
import { A12_NO_PR_MS, A13_IDLE_MS, A14_RED_MS, A15_FAIL_MS, A16_QUESTION_MS, A17_BLOCKED_MS, A20_STUCK_MS, BOARD_PRIORITY_ORDER, BOARD_RULE_PRIORITY, evaluateBoardAttention, renderAttentionText, type BoardPriority, type BoardRuleId } from '../src/core/board/attention';
import { WINDOW_WITH_WORKERS_MS, WINDOW_WITHOUT_WORKERS_MS, attentionFindingKey, planAttentionDeliveries, type AttentionSentV1 } from '../src/core/board/attention-delivery';
import { attentionLogPath, attentionWatchDoctorCheck, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../src/effects/board/attention-watch';
import { decodeBoard, type BoardHostPortsV1, type BoardItemV1, type BoardPullRequestV1, type BoardTerminalV1, type BoardV1 } from '../src/core/board/board';
import { decodePlanBlock, PlanBlockError } from '../src/core/board/plan-block';
import { decodeReviewHazards, pathHazardHits } from '../src/core/board/hazards';
import type { PullRequestReadinessV2 } from '../src/core/publication/merge-readiness';
import { collectPullRequestMergeReadiness } from '../src/effects/publication/merge-readiness';
import { collectBoard, collectBoardThrough, GH_MAX_BUFFER_BYTES, readGhJson, readParent, readLocalRepositoryId, readLocalRepositoryIdAsync, seatTerminalsWithBranches, type BoardCollectInput } from '../src/effects/board/collect';
import { createKeyedSources, KEYED_SOURCE_MAX_AGE_MS } from '../src/effects/board/keyed-sources';
import { runBoardMerge } from '../src/effects/board/merge';
import { boardMergeDecisions } from '../src/core/board/merge';
import { runBoardCloseout, stopCodegraphServers } from '../src/effects/board/closeout';
import type { RunArchctxProcess } from '../src/core/architecture/contracts';
import { githubRemoteRepository, parseRecordFindings, parseRefs } from '../src/core/board/source';
import { renderDependencyMigrationPlan } from '../src/core/board/dependency-migration';
import { applyDependencyMigration, planDependencyMigration, runDependencyMigration } from '../src/effects/board/dependency-migration';
import { attentionHostPorts, boardHostPorts } from '../src/effects/terminal/herdr-core';
import { ADVISOR_TRANSCRIPT_LINE_WITHHELD, AdvisorSeatError, advisorSeatSendFailure, advisorTranscriptLines, advisorTurnState, decodeAdvisorSeatTranscript, readAdvisorSeat, seatStatusMessage, SEAT_STATUS_MESSAGE_MAX_CHARS, sendToAdvisorSeat } from '../src/core/board/advisor-seat';
import { decodeBoardParents, decodeBoardSeats, projectBoardSeats, joinBoardParents, type BoardParentsV1 } from '../src/core/board/parents';
import { BoardSourceError } from '../src/core/board/source';
import { planDispatch } from '../src/core/board/dispatch';
import { DEFAULT_SEATS_CONFIG } from '../src/core/board/seats-settings';
import { HC_MIN_VERSION } from '../src/core/terminal/herdr-pin';
import { BoardParentsError, collectBoardParents } from '../src/effects/board/parents';
import { deskState, hasDesk, hcStatusClass, isQueued, ISSUE_FLOW_WORKER_LIMIT, liveSeats, seatItem, seatPullRequest, workerLimit } from '../src/core/board/desk';
import { renderAcceptanceClaim, renderAcceptanceRecord, reviewPayloadFromReceipt, type ReviewPublishReceipt } from '../src/core/review/review-publish';
import type { ReviewObserver } from '../src/effects/board/review';
import { BoardCollectError } from '../src/effects/board/collect';
import type { ModelRelation } from '../src/core/review/acceptance-receipt';
import boardParentsFixture from '../src/operator-web/fixtures/board-parents.json';
import boardSeatsFixture from '../src/operator-web/fixtures/board-seats.json';

// Recorded on 2026-11-03: the two GraphQL reads of parent #1474 with the collector's own queries, the newest
// scheduled ci.yml run (cut to the fields the collector reads), and `hc ls --json` / `hc get --json` of five seat
// terminals on an isolated hc 0.1.17 core. t5 carries the repository label of another repository with the same parent.
const FIXTURES = join(import.meta.dir, 'fixtures/board');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
type Json = Record<string, any>;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// The blocked worker t1 last changed its status at 2026-11-02T23:18:42.936Z; the replay runs 11 minutes later.
const REPLAY_NOW = new Date(1_793_661_522_936 + 11 * 60_000);
// hc-ls.json is the unfiltered list. `ls --label` keeps the rows whose recorded labels match, as the live core did.
const HC = `#!${process.execPath}
const { readFileSync } = require('fs');
const args = process.argv.slice(2);
const gets = readFileSync(process.env.FIXTURES + '/hc-get.jsonl', 'utf8').trim().split('\\n').map(line => JSON.parse(line));
const labels = address => gets.find(get => get.address === address).labels;
if (args[0] === '--version') console.log('hc ' + process.env.HC_VERSION);
else if (args[0] === 'ls') {
  const wanted = args.flatMap((arg, at) => (args[at - 1] === '--label' ? [arg.split('=')] : []));
  const list = JSON.parse(readFileSync(process.env.FIXTURES + '/hc-ls.json', 'utf8'));
  console.log(JSON.stringify({ ...list, terminals: list.terminals.filter(row => wanted.every(([key, value]) => labels(row.address)[key] === value)) }));
} else if (args[0] === 'get') console.log(JSON.stringify(gets.find(get => get.address === args.at(-1))));
else process.exit(2);
`;

interface Replay {
  readonly parent?: (data: Json) => void;
  /** Splits the edited parent read into sub-issue pages of this size, linked by cursors `c1`, `c2`...; then edits the pages. */
  readonly pages?: { readonly size: number; readonly edit?: (pages: Json[]) => void };
  /** Older parent comment pages, newer page first, linked by cursors `k1`, `k2`...; `edit` gets the first parent page and then these pages. */
  readonly comments?: { readonly older: Json[][]; readonly edit?: (pages: Json[]) => void };
  readonly pulls?: (data: Json) => void;
  /** Edits the recorded `archctx resolve` results of the open pull request files. */
  readonly owners?: (results: Json[]) => void;
  /** Replaces the recorded archctx process. */
  readonly archctx?: RunArchctxProcess;
  /** Replaces the hc host that replays the recorded terminals. */
  readonly host?: BoardHostPortsV1;
  /** The answer to the policy file read of the default branch; the default is a 404. */
  readonly policy?: GhAnswer;
  /** The answer to the protection read of one base branch; the default requires the one context `Required / CI` on every base. */
  readonly protection?: (base: string) => GhAnswer;
  /** The version that the fake hc reports; the recorded core reported 0.1.17. */
  readonly hcVersion?: string;
  readonly now?: Date;
  /** The open pull requests whose readiness is ready; the default is #1491. */
  readonly ready?: readonly number[];
}

function issueNode(data: Json, number: number): Json {
  return data.repository.issue.subIssues.nodes.find((node: Json) => node.number === number);
}

function subIssuePages(read: Json, size: number): Json[] {
  const { nodes } = read.data.repository.issue.subIssues;
  const count = Math.ceil(nodes.length / size);
  return Array.from({ length: count }, (_, at) => {
    const page = structuredClone(read);
    page.data.repository.issue.subIssues = { pageInfo: { hasNextPage: at < count - 1, endCursor: `c${at + 1}` }, nodes: nodes.slice(at * size, (at + 1) * size) };
    return page;
  });
}

function comment(body: string, createdAt: string): Json {
  return { url: `https://github.com/Ancienttwo/repo-harness/issues/1#issuecomment-${Date.parse(createdAt)}`, createdAt, authorAssociation: 'OWNER', body };
}

// `gh api` of an absent path, as the live CLI answers it: exit 1, the JSON body on stdout, the message on stderr.
const POLICY_ABSENT = { status: 1, stdout: '{"message":"Not Found","status":"404"}', stderr: 'gh: Not Found (HTTP 404)' };

function replay(options: Replay = {}): BoardV1 {
  return collectBoard(replayInput(options));
}

function replayInput(options: Replay): BoardCollectInput {
  const root = tmpWorkspace('board'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/hc'), HC); chmodSync(join(root, 'bin/hc'), 0o755);
  const parent = JSON.parse(fixture('parent-1474.graphql.json')); options.parent?.(parent.data);
  const parentPages = options.pages === undefined ? [parent] : subIssuePages(parent, options.pages.size);
  options.pages?.edit?.(parentPages);
  const commentPages: Json[] = (options.comments?.older ?? []).map((nodes, at, older) => ({
    data: { repository: { issue: { comments: { pageInfo: { hasPreviousPage: at < older.length - 1, startCursor: `k${at + 2}` }, nodes } } } },
  }));
  if (options.comments !== undefined) parentPages[0]!.data.repository.issue.comments.pageInfo = { hasPreviousPage: true, startCursor: 'k1' };
  options.comments?.edit?.([parentPages[0]!, ...commentPages]);
  const pulls = JSON.parse(fixture('pull-requests-1474.graphql.json')); options.pulls?.(pulls.data);
  const resolved = JSON.parse(fixture('archctx-resolve-1474.json')); options.owners?.(resolved.data.results);
  const answer = (value: unknown) => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value) });
  return {
    repo_root: root,
    parent: 1474,
    now: () => options.now ?? REPLAY_NOW,
    host: options.host ?? boardHostPorts({ env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, FIXTURES, HC_VERSION: options.hcVersion ?? HC_MIN_VERSION } }),
    gh_runner: (args) => {
      if (args[0] === 'repo') return answer({ nameWithOwner: 'Ancienttwo/repo-harness' });
      if (args[1] === 'graphql' && args.some(arg => arg.includes('subIssues'))) {
        const after = args.find(arg => arg.startsWith('after='));
        return answer(parentPages[after === undefined ? 0 : Number(after.slice('after=c'.length))]);
      }
      const before = args.find(arg => arg.startsWith('before='));
      if (args[1] === 'graphql' && before !== undefined) return answer(commentPages[Number(before.slice('before=k'.length)) - 1]);
      if (args[1] === 'graphql') return answer(pulls);
      if (args.some(arg => arg.includes('actions/workflows/ci.yml/runs'))) return answer(fixture('daily-run.json'));
      if (args.includes('repos/Ancienttwo/repo-harness/contents/.ai/harness/policy.json?ref=main')) return options.policy ?? POLICY_ABSENT;
      const protection = args.find(arg => /^repos\/Ancienttwo\/repo-harness\/branches\/[^/]+\/protection$/u.test(arg));
      if (protection !== undefined) {
        const base = decodeURIComponent(protection.split('/')[4]!);
        return options.protection?.(base) ?? answer({ required_status_checks: { contexts: ['Required / CI'] } });
      }
      if (args.includes('repos/{owner}/{repo}')) return answer({ id: 1_000_001 });
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    },
    // #1491 is the only PR that the recorded data shows as accepted; the readiness projection has its own suite.
    readiness: (selection) => ({ ...selection, protocol: 2, kind: 'repo-harness-pull-request-readiness', ready: (options.ready ?? [1491]).includes(selection.pr_number), blockers: [] }) as unknown as PullRequestReadinessV2,
    // archctx 0.11.2 at d0f4223f4 on the files of the open PRs. A request gets the recorded result of each of its
    // paths, in its order; exit 2 when one is ambiguous. An unrecorded path fails the test.
    archctx: {
      run: options.archctx ?? ((_binary, args) => {
        if (args[0] !== 'resolve' || args[1] !== '--paths-from') throw new Error(`unexpected archctx call: ${args.join(' ')}`);
        const results = readFileSync(args[2]!, 'utf8').trim().split('\n').map((path) => {
          const result = resolved.data.results.find((entry: Json) => entry.path === path);
          if (result === undefined) throw new Error(`no recorded archctx result for ${path}`);
          return result;
        });
        const status = results.some((result: Json) => result.ambiguous) ? 2 : 0;
        return { status, signal: null, stdout: JSON.stringify({ ...resolved, data: { results } }), stderr: '' };
      }),
    },
  };
}

function rules(board: BoardV1): BoardRuleId[] {
  return evaluateBoardAttention(board).findings.map(finding => finding.rule);
}

test.each([
  ['inline code', '`Refs #19`', []],
  ['multiple backticks', '``Refs #19 `example` ``', []],
  ['multiline code span', '`Refs\n#19`', []],
  ['inline code cannot join a ref', 'Refs `example` #19', []],
  ['inline code before a colon', 'Refs`example`: #19', []],
  ['inline code after a colon', 'Refs:`example`#19', []],
  ['multiple-backtick span cannot join a ref', 'Refs ``example `code` `` #19', []],
  ['issue example inside an inline code gap', 'Refs `#5` #19', []],
  ['inline comment cannot join a ref', 'Refs <!-- example --> #19', []],
  ['short inline comment cannot join a ref', 'Refs <!-- x --> #19', []],
  ['image cannot join a ref', 'Refs ![a](x.png) #19', []],
  ['reference image cannot join a ref', 'Refs ![a][pic] #19\n\n[pic]: x.png', []],
  ['image alt text is excluded', '![Refs #5](x.png) Refs #19', [19]],
  ['backtick fence', '```text\nRefs #19\n```', []],
  ['tilde fence', '~~~\nRefs #19\n~~~', []],
  ['longer fence', '````\n```\nRefs #19\n````', []],
  ['mismatched fence marker', '```\n~~~\nRefs #19\n```', []],
  ['unclosed CRLF backtick fence', '```\r\nRefs #19', []],
  ['unclosed tilde fence', '~~~\nRefs #19', []],
  ['indented fence', '   ```\n   Refs #19\n   ```\n\nRefs #7', [7]],
  ['quote', '> Refs #19', []],
  ['indented quote', '  > Refs #19', []],
  ['nested quote', '>> Refs #19', []],
  ['quoted fence', '> ```\n> Refs #19\n> ```\n\nRefs #7', [7]],
  ['nested quoted fence', '> > ~~~\n> > Refs #19\n> > ~~~\n\nRefs #7', [7]],
  ['plain ref', 'Refs #19', [19]],
  ['colon ref', 'Refs: #19', [19]],
  ['escaped backticks', '\\`Refs #19\\`', [19]],
  ['unmatched backtick', '`Refs #19', [19]],
  ['sorted unique refs', 'Refs #19\nRefs #7\nref: #19', [7, 19]],
  ['heading boundary', '`intro\n# Refs #21\n`', [21]],
  ['list boundary', '`intro\n- Refs #22\n`', [22]],
  ['thematic break', '`intro\n\n---\nRefs #23\n\n`', [23]],
  ['indented code boundary', '`intro\n\n    code\n\nRefs #24\n\n`', [24]],
  ['multiple-backtick paragraph boundary', '``intro\n\nRefs #25\n\n``', [25]],
  ['closed list backtick fence', '- ```\n  Refs #19\n  ```\n\nRefs #7', [7]],
  ['closed list tilde fence', '- ~~~\n  Refs #19\n  ~~~\n\nRefs #7', [7]],
  ['outdented backtick starts a root fence', '- ```\n  Refs #19\n ```\n\nRefs #7', []],
  ['outdented tilde starts a root fence', '- ~~~\n  Refs #19\n ~~~\n\nRefs #7', []],
  ['unclosed list backtick fence', '- ```\n  Refs #19\n\nRefs #7', [7]],
  ['unclosed list tilde fence', '- ~~~\n  Refs #19\n\nRefs #7', [7]],
  ['paragraph boundary before later inline code', 'The ` key breaks X.\n\nRefs #19\n\nRun `bun test`.', [19]],
  ['list item boundary before later code', '- the ` key\n- Refs #19\n- run `x`', [19]],
  ['heading boundary before later code', 'Use ` here\n## Links\nRefs #19\nsee `y`', [19]],
  ['text after a closed list example', '- ```text\n  example\n  ```\n\nRefs #19', [19]],
  ['indented code', '    Refs #19', []],
  ['indented code with fence', '    ```\n    Refs #19', []],
  ['HTML comment', '<!-- Refs #19 -->', []],
  ['list quote', '- > Refs #19', []],
  ['lazy quote continuation', '> example\nRefs #19', []],
  ['block HTML', '<div>\nRefs #19\n</div>\n\nRefs #7', [7, 19]],
  ['inline HTML attributes', '<span title="Refs #19"></span> Refs #7', [7, 19]],
  ['image followed by a visible ref', 'Screenshot:\n\n<img width="300" alt="ui" src="https://x/y.png">\nRefs #19', [19]],
  ['details containing a visible ref', '<details><summary>Why</summary>\nRefs #19\n</details>', [19]],
  ['HTML break followed by a visible ref', 'Intro\n\n<br>\nRefs #19', [19]],
  ['HTML comment followed by visible text', '<!-- Refs #5 --> Refs #19', [19]],
  ['HTML comment followed by a different ref', '<!-- Refs #19 --> Refs #7', [7]],
  ['adjacent comments followed by visible text', '<!-- Refs #19 --><!-- Refs #21 -->\n\nRefs #7', [7]],
  ['adjacent comments hide their refs', '<!-- a --><!-- Refs #5 -->', []],
  ['comment inside an HTML block', '<div>\n<!-- Refs #5 -->\n</div>', []],
  ['comment and visible text inside an HTML block', '<div>\n<!-- Refs #19 -->\nRefs #7\n</div>', [7]],
  ['comment after an image tag', '<img src="x.png">\n<!-- Refs #19 -->\nRefs #7', [7]],
  ['unclosed HTML comment', '<!-- Refs #19', []],
  ['unclosed multiline HTML comment', '<!--\nRefs #19', []],
  ['multiline comment inside an HTML block', '<div>\n<!--\nRefs #5\n-->\nRefs #19\n</div>', [19]],
  ['comment cannot join a ref inside HTML', '<div>\nRefs <!-- x --> #19\n</div>', []],
  ['hard break', 'Refs  \n#19', [19]],
  ['hard break after a colon', 'Refs:  \n#19', [19]],
  ['CRLF hard break', 'Refs  \r\n#19', [19]],
  ['CRLF hard break after a colon', 'Refs:  \r\n#19', [19]],
  ['emphasis and link children', '**Refs:** [#19](https://example.com)', [19]],
  ['link text', '[Refs #19](https://example.test)', [19]],
  ['link destination is excluded', '[link](https://example.test/Refs#19)', []],
  ['autolink text', '<https://example.test/Refs#19>', [19]],
  ['HTML entities in text', 'Ref&#115;&nbsp;&#35;19', [19]],
  ['entity-escaped comment is visible text', '&lt;!-- Refs #19 --&gt;', [19]],
  ['HTML entity after an inline tag', '<span title="ui"></span>Refs &#35;19', [19]],
  ['separate text nodes cannot join a ref', 'Refs\n\n#19', []],
] as const)('parseRefs: %s', (_kind, body, expected) => {
  expect(parseRefs(body)).toEqual([...expected]);
});

test('board selection and projection use the same refs outside code and quotes', () => {
  for (const example of ['`Refs #1476`', '```\nRefs #1476\n```', '> Refs #1476']) {
    const board = (body: string) => replay({ pulls: (data) => { data.repository.pr1491.body = body; } });
    expect(board(example).pull_requests.some(pr => pr.number === 1491)).toBe(false);
    expect(board(`${example}\n\nRefs: #1475`).pull_requests.find(pr => pr.number === 1491)!.refs).toEqual([1475]);
  }
});
/** Drops the `.github/` paths of a recorded pull request, so its tier comes from its labels, not from the change hazard list. */
function withoutHazards(pr: Json): void {
  pr.files.nodes = pr.files.nodes.filter((node: Json) => !node.path.startsWith('.github/'));
  pr.files.totalCount = pr.files.nodes.length;
}

/** Keeps the first three recorded files of #1494 (20 changed lines, no hazard path), so its Low label holds for a fix within the Low bound. */
function asSmallFix(pr: Json): void {
  pr.files.nodes = pr.files.nodes.slice(0, 3);
  pr.files.totalCount = 3;
}

test('Low acceptance uses the effective tier of every linked issue: a Low closing issue with a High or unobserved ref is not accepted by tier', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z', detailsUrl: null, startedAt: null, checkSuite: { workflowRun: null } };
  const via = (refs: string) => replay({
    parent: (data) => { issueNode(data, 1479).labels.nodes.push({ name: 'tier:low' }); issueNode(data, 1476).labels.nodes.push({ name: 'tier:high' }); },
    pulls: (data) => {
      const { pr1494 } = data.repository;
      asSmallFix(pr1494);
      pr1494.body += refs;
      pr1494.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
    },
  }).pull_requests.find(pr => pr.number === 1494)!.acceptance.status;
  expect([via(''), via('\nRefs #1476\n'), via('\nRefs #1460\n')]).toEqual(['accepted', 'not_accepted', 'not_accepted']);
});

test('Low labels give Low to a fix of at most 50 changed lines, and to docs only, tests only or the projection PR at any size', () => {
  // #1494 closes only #1479, which is tier:low.
  const tier = (files: Json[], head = 'feat/1479-notify-relay') => replay({
    owners: (results) => { results.push(...files.map(file => ({ path: file.path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    parent: (data) => { issueNode(data, 1479).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data) => { Object.assign(data.repository.pr1494, { headRefName: head, files: { totalCount: files.length, nodes: files } }); },
  }).pull_requests.find(pr => pr.number === 1494)!.tier;
  const file = (path: string, additions: number, deletions: number) => ({ path, additions, deletions });
  expect([
    tier([file('src/a.ts', 30, 20)]),
    tier([file('src/a.ts', 30, 21)]),
    // A file without a deletion count makes the size unknown.
    tier([{ path: 'src/a.ts', additions: 1 }]),
    tier([file('docs/a.md', 300, 0)]),
    tier([file('README.md', 300, 0)]),
    // Documentation is what `isDocumentationPath` names: a non-Markdown file under docs/ is not.
    tier([file('docs/architecture/archimap.html', 300, 0)]),
    tier([file('tests/a.test.ts', 300, 0)]),
    tier([file('src/a.ts', 300, 0)], 'archctx/projection'),
  ]).toEqual(['low', 'medium', 'medium', 'low', 'low', 'medium', 'low', 'low']);
});

test('High acceptance: PASS rows of the head from two distinct claims, one recorded different-family; claude_review and A10 project the same rule', () => {
  const claim = (model: string, branch: string) => comment(`repo-harness issue claim\nStatus: active\nRole: writer\nBranch: ${branch}\nRuntime: pi${model === '' ? '' : `\nModel: ${model}`}`, '2026-11-02T10:00:00Z');
  // The claim and the record are the `review publish` wire format. Claim n is an `acceptance claim` comment whose id comes from its time.
  const receipt = (harness: 'claude' | 'codex' | 'pi', subject_sha: string, model_relation: ModelRelation = 'different-family', verdict: 'PASS' | 'FAIL' = 'PASS', round = 1): ReviewPublishReceipt => ({
    protocol: 1, kind: 'repo-harness-review-publish-receipt', round, subject_sha, risk_tier: 'high', reviewer: { harness, actual_model: null }, verdict, model_relation, summary: 'Reviewed.', findings: [],
  });
  const claimAt = (n: number) => `2026-11-02T21:0${n}:00Z`;
  const claimUrl = (n: number, path = 'pull/1491') => `https://github.com/Ancienttwo/repo-harness/${path}#issuecomment-${Date.parse(claimAt(n))}`;
  const parent = (data: Json) => {
    for (const [number, runtime, branch] of [[1475, 'claude-sonnet-5-5', 'feat/1475-hc-transport'], [1479, 'claude-sonnet-5-5', 'feat/1479-notify-relay'], [1476, 'gpt-5.5', 'feat/1476-sessions-herdr-core']] as const) {
      const node = issueNode(data, number);
      node.labels.nodes.push({ name: 'tier:high' });
      node.comments.nodes.push(claim(runtime, branch));
    }
  };
  const board = replay({
    parent,
    pulls: (data) => {
      const { pr1494, pr1499 } = data.repository;
      withoutHazards(pr1494);
      pr1494.body += '\nCloses #1460\n';
      for (const [pr, harness] of [[pr1494, 'pi'], [pr1499, 'claude']] as const) {
        pr.comments.nodes.push(comment(renderAcceptanceClaim(receipt(harness, pr.headRefOid)), claimAt(1)));
        pr.comments.nodes.push(comment(renderAcceptanceRecord(receipt(harness, pr.headRefOid), claimUrl(1, `pull/${pr.number}`)), '2026-11-02T22:00:00Z'));
      }
    },
  });
  // One different-family PASS is one review: #1494 (unknown tier, counted as High) and #1499 are not accepted.
  expect(board.pull_requests.map(pr => [pr.number, pr.tier, pr.claude_review, pr.acceptance.status])).toEqual([
    [1491, 'high', 'pending', 'not_accepted'], [1494, null, 'pending', 'not_accepted'], [1499, 'high', 'recorded', 'not_accepted'],
  ]);
  // A Claude writer claim no longer skips the second review: A10 reads the open, non-draft #1491.
  expect(evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'A10').map(finding => finding.pull_requests)).toEqual([[1491]]);
  // A row: the reviewer, the claim line it cites, its relation (null drops the line), verdict, subject (default the head) and round.
  type Row = readonly [harness: 'claude' | 'codex' | 'pi', claimLine: string, relation?: ModelRelation | null, verdict?: 'PASS' | 'FAIL', sha?: string, round?: number];
  const OLD = 'e'.repeat(40);
  const head = (rows: readonly Row[], tier = 'tier:high') => replay({
    parent: (data) => { parent(data); const labels = issueNode(data, 1475).labels.nodes; labels[labels.length - 1] = { name: tier }; },
    pulls: (data) => {
      const { pr1491 } = data.repository;
      // Claims 1-3 are round 1 of the head; claims 4 and 6 are round 1 of an earlier head; claim 5 is round 2 and claims 7-8 round 4 of the head.
      const claims: readonly (readonly [number, string, number])[] = [[1, pr1491.headRefOid, 1], [2, pr1491.headRefOid, 1], [3, pr1491.headRefOid, 1], [4, OLD, 1], [5, pr1491.headRefOid, 2], [6, OLD, 1], [7, pr1491.headRefOid, 4], [8, pr1491.headRefOid, 4]];
      pr1491.comments.nodes.push(...claims.map(([n, sha, round]) => comment(renderAcceptanceClaim(receipt('codex', sha, 'different-family', 'PASS', round)), claimAt(n))));
      pr1491.comments.nodes.push(...rows.map(([harness, claimLine, relation = 'different-family', verdict = 'PASS', sha = pr1491.headRefOid, round = 1], at) => {
        const body = renderAcceptanceRecord(receipt(harness, sha, relation ?? 'unknown', verdict, round), claimLine);
        return comment(relation === null ? body.replace(/^Model relation: .*\n/mu, '') : body, `2026-11-02T22:0${at}:00Z`);
      }));
    },
  });
  const gatekeeper: Row = ['pi', claimUrl(1)];
  const cases: readonly (readonly [readonly Row[], string, string])[] = [
    [[gatekeeper, ['claude', claimUrl(2), 'same-family']], 'accepted', 'recorded'],
    [[gatekeeper, ['codex', claimUrl(2)]], 'accepted', 'not_required'],
    // A High head that converges in round 4 publishes two claimed rows of that round.
    [[['pi', claimUrl(7), 'different-family', 'PASS', undefined, 4], ['claude', claimUrl(8), 'same-family', 'PASS', undefined, 4]], 'accepted', 'recorded'],
    // The Claude writer's gatekeeper alone waits for the Claude reviewer.
    [[gatekeeper], 'not_accepted', 'pending'],
    // One claim cited by its pull and its issues URL is one review.
    [[gatekeeper, ['codex', claimUrl(1, 'issues/1491')]], 'not_accepted', 'pending'],
    // A blank, malformed or unknown claim proves no review; so does a claim of an earlier head or of another round.
    [[gatekeeper, ['codex', '']], 'not_accepted', 'pending'],
    [[gatekeeper, ['codex', 'see above']], 'not_accepted', 'pending'],
    [[gatekeeper, ['codex', claimUrl(9)]], 'not_accepted', 'pending'],
    [[gatekeeper, ['codex', claimUrl(4)]], 'not_accepted', 'pending'],
    [[gatekeeper, ['codex', claimUrl(5)]], 'not_accepted', 'pending'],
    // No row recorded different-family: `unknown` (an unknown writer family) or no relation line.
    [[['pi', claimUrl(1), 'unknown'], ['claude', claimUrl(2), 'same-family']], 'not_accepted', 'recorded'],
    [[['pi', claimUrl(1), null], ['codex', claimUrl(2), null]], 'not_accepted', 'pending'],
    // A FAIL row of the head withholds the rule from both projections.
    [[gatekeeper, ['codex', claimUrl(2)], ['codex', claimUrl(3), 'same-family', 'FAIL']], 'not_accepted', 'pending'],
    // Rows of an earlier head do not count for the head.
    [[['pi', claimUrl(4), 'different-family', 'PASS', OLD], ['codex', claimUrl(6), 'different-family', 'PASS', OLD]], 'not_accepted', 'pending'],
  ];
  const projected = cases.map(([rows]) => head(rows));
  const pr1491 = (projection: BoardV1) => projection.pull_requests.find(pr => pr.number === 1491)!;
  expect(projected.map(pr1491).map(pr => [pr.acceptance.status, pr.claude_review] as string[])).toEqual(cases.map(([, status, claude]) => [status, claude]));
  expect(evaluateBoardAttention(projected[1]!).findings.filter(finding => finding.rule === 'A10')).toEqual([]);
  // Medium needs one claimed PASS row recorded different-family; a same-family PASS alone, or an unclaimed one, does not accept (#2084).
  expect(([[gatekeeper], [['claude', claimUrl(1), 'same-family']], [['pi', '']]] as const).map(rows => pr1491(head(rows, 'tier:medium')).acceptance.status)).toEqual(['accepted', 'not_accepted', 'not_accepted']);
  // The writer claim bound to the head branch gives the family that the Medium review seat differs from; #1494 links an issue outside the board.
  expect(board.pull_requests.map(pr => pr.writer_family)).toEqual(['anthropic', null, 'openai']);
  // A claim without a Model line names no family (Runtime is not read), a Pi writer takes the family of its model, and linked issues whose claims of the branch disagree give none; agreeing issues keep it.
  const family = (edit: (data: Json) => void, pulls?: (data: Json) => void) => pr1491(replay({ parent: (data) => { parent(data); edit(data); }, pulls })).writer_family;
  const refs1479 = (data: Json) => { data.repository.pr1491.body += '\nRefs #1479\n'; };
  const second = (runtime: string) => (data: Json) => { issueNode(data, 1479).comments.nodes.push(claim(runtime, 'feat/1475-hc-transport')); };
  expect([
    family((data) => { const node = issueNode(data, 1475).comments.nodes.find((entry: Json) => entry.body.includes('Model: claude')); node.body = node.body.replace(/\nModel: .*/u, ''); }),
    family((data) => { const node = issueNode(data, 1475).comments.nodes.find((entry: Json) => entry.body.includes('Model: claude')); node.body = node.body.replace(/Model: .*/u, 'Model: magpie/deepseek-v4'); }),
    family(second('gpt-5.5'), refs1479),
    family(second('claude-opus-5-5'), refs1479),
  ]).toEqual([null, 'deepseek', null, 'anthropic']);
});

test('replay: the recorded #1474 reads project to a board, and its findings come from the recorded state', () => {
  const board = replay();
  expect(decodeBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
  expect(board.items.map(item => [item.number, item.pull_requests])).toEqual([
    [1475, [1491]], [1476, [1499]], [1477, []], [1478, []], [1479, [1494]], [1480, []], [1481, []], [1482, []], [1483, []],
  ]);
  // #1462 and #1492 cross-reference sub-issues but close #1460 and #1490: a mention is not a link.
  expect(board.pull_requests.map(pr => [pr.number, pr.base_ref, pr.required_check.status])).toEqual([
    [1491, 'main', 'success'], [1494, 'feat/1475-hc-transport', 'missing'], [1499, 'feat/1475-hc-transport', 'missing'],
  ]);
  // The round-6 row names a gatekeeper, not a Claude reviewer, and #1491 has no Claude writer claim, so the head waits for the Claude review.
  expect(board.pull_requests[0]!.acceptance).toMatchObject({ status: 'not_accepted' });
  // A hand-written subject line is not the table row that `review publish` writes: the record is unparsed, and no verdict is guessed.
  const subjectLine = replay({ pulls: data => data.repository.pr1491.comments.nodes.push(comment(`repo-harness acceptance record\nSubject: ${data.repository.pr1491.headRefOid}. Round 7 (gatekeeper, fresh Claude context, read-only): PASS.\n`, '2026-11-02T22:00:00Z')) });
  expect(subjectLine.pull_requests[0]!.acceptance).toMatchObject({ status: 'unknown', reason: 'acceptance_record_unparsed' });
  expect(board.plan).toMatchObject({ status: 'unavailable', reason: 'plan block invalid: the plan comment has 0 fenced json blocks, expected 1' });
  expect(board.daily_run).toMatchObject({ status: 'observed', conclusion: 'failure', open_repair_issues: [] });
  expect(board.tooling).toEqual({ hc: { status: 'observed', version: HC_MIN_VERSION, min_version: HC_MIN_VERSION }, herdr_app: { status: 'not_pinned' } });
  expect(board.execution.status === 'observed' && board.execution.terminals.map(terminal => terminal.seat_status === 'observed'
    ? [terminal.address, terminal.seat, terminal.issue, terminal.status, terminal.agent] : [terminal.address, terminal.reason, terminal.agent])).toEqual([
    ['t1', 'worker', 1476, 'blocked', 'codex'], ['t2', 'worker', 1475, 'done', 'claude-code'],
    ['t3', 'orchestrator', null, 'idle', null], ['t4', 'seat_label_missing', 'sleep'],
  ]);
  // One hc core holds seats of two repositories with parent #1474; each board reads only its own repository id.
  const foreign = replay({ parent: (data) => { data.repository.databaseId = 987654321; } });
  expect(foreign.execution.status === 'observed' && foreign.execution.terminals.map(terminal => terminal.address)).toEqual(['t5']);
  // No terminal carries both labels: the seats are not labelled, which is not "no stuck seats".
  expect(replay({ parent: (data) => { data.repository.databaseId = 1; } }).execution).toEqual({ status: 'unavailable', reason: 'no_seat_terminals' });

  const attention = evaluateBoardAttention(board);
  expect(attention.findings.map(finding => [finding.rule, finding.route, finding.pull_requests, finding.terminals])).toEqual([
    ['A3', 'orchestrator', [], ['t1']],
    ['A7', 'orchestrator', [], []],
    ['A10', 'orchestrator', [1491], []],
    // #1475 and #1479 hold boundary questions whose `Re:` answer is in another thread or missing.
    ['A16', 'orchestrator', [], []],
    ['A16', 'orchestrator', [], []],
    ['A16', 'orchestrator', [], []],
    ['R2', 'advisor', [1494, 1499], []],
  ]);
  // t4 has no seat label: the board does not guess its seat. The plan comment has no block, so R1 and R4 wait.
  // #1494 and #1499 change `.github/` and their items carry no tier label, so R3 waits.
  // No open pull request changes a path on the High list, so R5 has no entry.
  expect(attention.unevaluated.map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'seat_label_missing', 't4'],
    ['A4', 'seat_label_missing', 't4'],
    ['A13', 'seat_label_missing', 't4'],
    ['A19', 'seat_label_missing', 't4'],
    ['R1', 'plan_unavailable', 'https://github.com/Ancienttwo/repo-harness/issues/1474#issuecomment-6588782468'],
    ['R3', 'tier_label_missing', '#1494 #1479'],
    ['R3', 'tier_label_missing', '#1499 #1476'],
    ['R4', 'plan_unavailable', null],
    ['R6', 'plan_unavailable', null],
    ['R7', 'plan_unavailable', null],
  ]);
});

/**
 * The provider answers to the readiness reads of the three open recorded pull requests: #1491 on main and the
 * stacked #1494 and #1499. The base of #1491 has the rollback reporter, so its read follows the rollback boundary.
 */
function recordedReadinessGh(failRepository: () => boolean): (args: readonly string[]) => { status: number; stdout: string; stderr?: string } {
  const repository = 'Ancienttwo/repo-harness';
  const node = 'R_kgDORepoHarness';
  const pulls: Json[] = Object.values(JSON.parse(fixture('pull-requests-1474.graphql.json')).data.repository);
  const pr = (number: number) => pulls.find(read => read.number === number)!;
  const base = pr(1491).baseRefOid as string;
  const before = 'e'.repeat(40);
  const json = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
  return (args) => {
    const path = args[0] === 'api' ? args[1]! : '';
    if (args[0] === 'repo' && args[1] === 'view') return json({ id: node, nameWithOwner: repository });
    if (args[0] === 'pr' && args[1] === 'view') {
      const read = pr(Number(args[2]));
      return json({ number: read.number, url: read.url, state: read.state, isDraft: read.isDraft, headRefOid: read.headRefOid, headRefName: read.headRefName,
        baseRefOid: read.baseRefOid, baseRefName: read.baseRefName, body: read.body, reviewDecision: '', changedFiles: 0, mergeable: 'MERGEABLE' });
    }
    if (args[0] === 'pr' && args[1] === 'list') {
      const head = args[args.indexOf('--head') + 1];
      return json(pulls.filter(read => read.headRefName === head).map(read => ({ number: read.number, state: read.state, headRefOid: read.headRefOid,
        headRefName: read.headRefName, baseRefOid: read.baseRefOid, baseRefName: read.baseRefName, isCrossRepository: false })));
    }
    if (args[0] === 'pr' && args[1] === 'checks') return json([{ name: 'Required / CI', bucket: 'pass', link: `https://github.com/${repository}/actions/runs/41/job/42` }]);
    if (path === `repos/${repository}`) {
      return failRepository() ? { status: 1, stdout: '', stderr: 'gh: Bad Gateway (HTTP 502)' }
        : json({ id: 1186405141, node_id: node, full_name: repository, default_branch: 'main' });
    }
    if (path === `repos/${repository}/branches/main/protection`) return json({ required_status_checks: { contexts: ['Required / CI'] } });
    if (path === `repos/${repository}/actions/runs/41`) {
      return json({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: pr(1491).headRefOid, status: 'completed', conclusion: 'success',
        pull_requests: [{ number: 1491, head: { sha: pr(1491).headRefOid }, base: { sha: base } }] });
    }
    if (path === `repos/${repository}/contents/.ai/harness/policy.json?ref=${base}`) return POLICY_ABSENT;
    if (path === `repos/${repository}/contents/.github/workflows/ci-report.yml?ref=${base}`) return json({ type: 'file', path: '.github/workflows/ci-report.yml', sha: 'c'.repeat(40) });
    if (path === `repos/${repository}/commits/${base}/pulls?per_page=100`) return json([{ number: 1488, merged_at: '2026-11-02T10:00:00Z', merge_commit_sha: base, base: { ref: 'main' } }]);
    if (path === `repos/${repository}/git/commits/${base}`) return json({ sha: base, parents: [{ sha: before }] });
    if (path === `repos/${repository}/pulls/1488`) return json({ number: 1488, merged: true, merge_commit_sha: base, base: { ref: 'main' }, head: { ref: 'feat/1488', sha: 'd'.repeat(40) } });
    if (path === `repos/${repository}/commits/${before}/pulls?per_page=100`) return json([{ number: 1487 }]);
    if (path === 'graphql' && args.includes('-F')) {
      const number = Number(args.find(arg => arg.startsWith('number='))!.slice('number='.length));
      return json({ data: { node: { id: node, pullRequest: { number, headRefOid: pr(number).headRefOid, baseRefOid: pr(number).baseRefOid, reviewDecision: null,
        latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] }, reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] } } } } });
    }
    throw new Error(`unexpected readiness call: ${args.join(' ')}`);
  };
}

test('board read: the readiness reads of one board share one answer for the repository identity and each base-commit fact; the identity and stack fences and a failed read run again', () => {
  const run = (failRepository: () => boolean) => {
    const input = replayInput({});
    const board = input.gh_runner!;
    const readiness = recordedReadinessGh(failRepository);
    const calls: string[] = [];
    // A readiness read names the repository or ends with the host; the board reads do neither.
    const gh: BoardCollectInput['gh_runner'] = (args) => {
      calls.push(args.join(' '));
      return args.at(-1) === 'github.com' || args.includes('github.com/Ancienttwo/repo-harness') ? readiness(args) : board(args);
    };
    return { board: collectBoard({ ...input, readiness: undefined, gh_runner: gh }), calls, readiness };
  };
  const count = (calls: readonly string[], prefix: string) => calls.filter(call => call.startsWith(prefix)).length;
  const { board, calls, readiness } = run(() => false);
  // One page of parent comments (no older page): 7 board reads (2 of them the protection of the two base refs) and 22 readiness reads.
  expect(calls).toHaveLength(29);
  expect(count(calls, 'api repos/Ancienttwo/repo-harness/branches/main/protection ')).toBe(1);
  expect(count(calls, 'repo view github.com/Ancienttwo/repo-harness --json id,nameWithOwner')).toBe(1);
  expect(count(calls, 'api repos/Ancienttwo/repo-harness --hostname')).toBe(1);
  for (const number of [1491, 1494, 1499]) expect(count(calls, `pr view ${number} `)).toBe(2);
  expect(count(calls, 'pr list --head feat/1475-hc-transport ')).toBe(4);
  for (const pr of board.pull_requests.filter(read => read.state === 'open')) {
    const own = collectPullRequestMergeReadiness({ provider_repository_id: '1186405141', repository: 'Ancienttwo/repo-harness', pr_number: pr.number,
      expected_head_sha: pr.head_sha, expected_base_sha: pr.base_sha, repo_root: '/nonexistent', gh_runner: readiness });
    expect(pr.merge_readiness).toEqual(own);
  }
  expect(board.pull_requests.map(pr => [pr.number, pr.merge_readiness?.ready])).toEqual([[1491, true], [1494, false], [1499, false]]);

  // The first REST repository read fails: it is not stored, and the next pull request reads it again.
  let repositoryReads = 0;
  const failed = run(() => repositoryReads++ === 0);
  expect(failed.board.pull_requests[0]!.merge_readiness).toMatchObject({ ready: false, blockers: [{ code: 'provider_unavailable' }] });
  expect(count(failed.calls, 'api repos/Ancienttwo/repo-harness --hostname')).toBe(2);
});

test('keyed sources: an unchanged board makes no readiness call, a changed key input or the maximum age reads that pull request again, and a stored answer equals a fresh read', () => {
  const input = replayInput({});
  const boardGh = input.gh_runner!;
  const readiness = recordedReadinessGh(() => false);
  let calls: string[] = [];
  let edit: ((data: Json) => void) | null = null;
  let now = REPLAY_NOW;
  const gh: BoardCollectInput['gh_runner'] = (args) => {
    if (args.at(-1) === 'github.com' || args.includes('github.com/Ancienttwo/repo-harness')) {
      calls.push(args.join(' '));
      return readiness(args);
    }
    const answer = boardGh(args);
    if (edit === null || !args.some(arg => arg.includes('pr1499: pullRequest'))) return answer;
    const pulls = JSON.parse(answer.stdout);
    edit(pulls.data);
    return { ...answer, stdout: JSON.stringify(pulls) };
  };
  const sources = createKeyedSources();
  const read = () => collectBoardThrough({ ...input, readiness: undefined, gh_runner: gh, now: () => now }, sources);
  const first = read();
  const open = first.pull_requests.filter(pr => pr.state === 'open');
  expect(open.map(pr => [pr.number, pr.merge_readiness_observed_at])).toEqual([1491, 1494, 1499].map(number => [number, REPLAY_NOW.toISOString()]));
  for (const pr of open) {
    expect(pr.merge_readiness).toEqual(collectPullRequestMergeReadiness({ provider_repository_id: '1186405141', repository: 'Ancienttwo/repo-harness', pr_number: pr.number,
      expected_head_sha: pr.head_sha, expected_base_sha: pr.base_sha, repo_root: '/nonexistent', gh_runner: readiness }));
  }

  calls = [];
  now = new Date(REPLAY_NOW.getTime() + 60_000);
  const second = read();
  expect(calls).toEqual([]);
  expect(second.pull_requests).toEqual(first.pull_requests);

  // One resolved review thread on #1499 changes only its key.
  edit = (data) => { data.repository.pr1499.reviewThreads = { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [{ isResolved: true }] }; };
  const third = read();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.filter(call => /^pr (view|list) /u.test(call) && !call.startsWith('pr view 1499 ') && !call.startsWith('pr list --head feat/1475-hc-transport '))).toEqual([]);
  expect(third.pull_requests.map(pr => [pr.number, pr.merge_readiness_observed_at])).toEqual([[1491, REPLAY_NOW.toISOString()], [1494, REPLAY_NOW.toISOString()], [1499, now.toISOString()]]);

  calls = [];
  now = new Date(REPLAY_NOW.getTime() + KEYED_SOURCE_MAX_AGE_MS);
  read();
  for (const number of [1491, 1494]) expect(calls.filter(call => call.startsWith(`pr view ${number} `))).toHaveLength(2);
});

test('acts read through a fresh keyed source store: each collectBoard and board merge call on the default path reads readiness again', () => {
  let reads = 0;
  const input = replayInput(mergeReplay());
  const counted: BoardCollectInput = { ...input, readiness: (selection) => { reads++; return input.readiness!(selection); } };
  collectBoard(counted);
  collectBoard(counted);
  expect(reads).toBe(6);
  const merge = () => ({ exit_code: 0, document: { ok: true } }) as never;
  expect(runBoardMerge({ ...counted, pr: null, dry_run: false, merge }).target).toBe(1491);
  expect(runBoardMerge({ ...counted, pr: null, dry_run: false, merge }).target).toBe(1491);
  expect(reads).toBe(12);
});

test('the board decoder refuses protocol 4 and a readiness read time that does not match the readiness', () => {
  const recorded = JSON.parse(JSON.stringify(replay()));
  expect(() => decodeBoard({ ...recorded, protocol: 4 })).toThrow('unsupported board protocol: 4');
  const withTime = (at: unknown, readiness = true) => ({ ...recorded, pull_requests: recorded.pull_requests.map((pr: Json) => pr.number === 1491
    ? { ...pr, merge_readiness: readiness ? pr.merge_readiness : null, merge_readiness_observed_at: at } : pr) });
  expect(decodeBoard(withTime(REPLAY_NOW.toISOString())).pull_requests.find(pr => pr.number === 1491)!.merge_readiness_observed_at).toBe(REPLAY_NOW.toISOString());
  for (const invalid of [withTime(null), withTime('not a time'), withTime(REPLAY_NOW.toISOString(), false)]) expect(() => decodeBoard(invalid)).toThrow('invalid board merge_readiness_observed_at on PR #1491');
});

test('attention rules and delivery windows recognize all worker seat kinds', () => {
  const board = replay();
  if (board.execution.status !== 'observed') throw new Error('the replay observes the seats');
  const [blocked, done] = board.execution.terminals;
  for (const seat of ['worker', 'worker-deep', 'worker-important', 'worker-important-fast', 'worker-light', 'orchestrator', 'worker-custom']) {
    const terminals = [{ ...blocked!, seat }, { ...done!, seat }] as BoardTerminalV1[];
    const candidate: BoardV1 = { ...board, items: board.items.map(item => item.number === 1475 ? { ...item, claim_status: { status_kind: 'none' } } : item), execution: { status: 'observed', terminals } };
    const attention = evaluateBoardAttention(candidate);
    const worker = seat !== 'orchestrator' && seat !== 'worker-custom';
    expect(attention.findings.filter(finding => finding.rule === 'A3' || finding.rule === 'A4').map(finding => finding.rule)).toEqual(worker ? ['A3', 'A4'] : []);
    expect(planAttentionDeliveries(candidate, attention, 0).window_ms).toBe(worker ? WINDOW_WITH_WORKERS_MS : WINDOW_WITHOUT_WORKERS_MS);
  }
});

test('the room counts follow the recorded PRs and the plan: queue and worker limit', () => {
  const board = replay();
  const counts = (value: BoardV1) => ({ queue: value.pull_requests.filter(isQueued).length, worker_limit: workerLimit(value) });
  expect(counts(board)).toEqual({ queue: 1, worker_limit: ISSUE_FLOW_WORKER_LIMIT });
  const block = { protocol: 2, kind: 'repo-harness.plan', merge_order: [], holds: [], seat_limits: { worker: 4 } } as const;
  const planned: BoardV1 = { ...board, plan: { status: 'observed', comment_url: 'https://github.com/plan', created_at: board.observed_at, revision: 1,
    block },
    pull_requests: board.pull_requests.map(pr => pr.number === 1494 ? { ...pr, required_check: { status: 'failure', completed_at: board.observed_at, contexts: [] } }
      : pr.number === 1499 ? { ...pr, state: 'closed' } : pr) };
  expect(counts(planned)).toEqual({ queue: 1, worker_limit: 4 });
  const accepted = planned.pull_requests.find(pr => pr.number === 1491)!;
  const reopened: BoardV1 = { ...planned,
    items: planned.items.map(item => item.number === 1475 ? { ...item, pull_requests: [1491, 1500] } : item),
    pull_requests: [...planned.pull_requests.map(pr => pr.number === 1491 ? { ...pr, state: 'closed' as const } : pr),
      { ...accepted, number: 1500, state: 'open', acceptance: { status: 'not_accepted' } }],
  };
  expect(counts(reopened).queue).toBe(1);
  expect(counts({ ...reopened, pull_requests: reopened.pull_requests.map(pr => pr.number === 1500
    ? { ...pr, required_check: { status: 'pending', contexts: [] } } : pr) }).queue).toBe(0);
  // Without an observed plan the issue-flow limit applies.
  for (const plan of [
    { status: 'absent', truncated: false },
    { status: 'unavailable', comment_url: 'https://github.com/plan', reason: 'plan block invalid' },
  ] as const) expect(counts({ ...planned, plan }).worker_limit).toBe(ISSUE_FLOW_WORKER_LIMIT);
});

test('each live seat outside the stage takes the desk state of the room rules', () => {
  const board = replay();
  if (board.execution.status !== 'observed') throw new Error('the replay observes the seats');
  const seat = board.execution.terminals[0]!, pr = board.pull_requests.find(entry => entry.number === 1499)!, item = board.items.find(entry => entry.number === 1476)!;
  const check = (required_check: BoardV1['pull_requests'][number]['required_check']) => ({ ...pr, state: 'open' as const, acceptance: { status: 'not_accepted' as const }, required_check });
  const completed = { completed_at: board.observed_at };
  const known = { status_kind: 'unknown' } as const, none = { status_kind: 'none' } as const;
  const desks = (value: BoardV1, terminals: readonly BoardTerminalV1[]) => liveSeats(terminals).filter(hasDesk).map((entry) => {
    const owned = seatItem(value, entry);
    return { seat: entry.seat, agent: entry.agent, issue: entry.issue, pr: entry.pr, state: deskState(entry, owned, seatPullRequest(value, entry, owned)) };
  });
  for (const [state, labels, status, source, claim_status] of [
    ['blocked', { issue: null, pr: null }, 'blocked', check({ status: 'failure', ...completed, contexts: [] }), none],
    ['error', {}, 'error', check({ status: 'failure', ...completed, contexts: [] }), none],
    ['unknown', { issue: null, pr: null }, 'working', check({ status: 'failure', ...completed, contexts: [] }), none],
    ['unknown', { issue: null, pr: null }, 'done', check({ status: 'missing', contexts: [] }), known],
    ['ci_failed', {}, 'working', check({ status: 'failure', ...completed, contexts: [] }), none],
    ['ci_pending', {}, 'working', check({ status: 'pending', contexts: [] }), none],
    ['acceptance_queue', {}, 'working', check({ status: 'success', ...completed, contexts: [] }), none],
    ['no_claim_status', {}, 'working', check({ status: 'missing', contexts: [] }), none],
    ['coding', {}, 'working', check({ status: 'missing', contexts: [] }), known],
    ['done', {}, 'done', check({ status: 'missing', contexts: [] }), known],
    ['no_claim_status', {}, 'done', check({ status: 'missing', contexts: [] }), none],
    ['idle', {}, 'idle', check({ status: 'missing', contexts: [] }), known],
    ['idle', {}, null, check({ status: 'missing', contexts: [] }), known],
    ['idle', {}, 'thinking', check({ status: 'missing', contexts: [] }), known],
  ] as const) {
    const terminal = { ...seat, ...labels, status } as BoardTerminalV1;
    const one: BoardV1 = { ...board, pull_requests: [source], items: [{ ...item, claim_status }] };
    expect(desks(one, [terminal])).toEqual([{ seat: 'worker', agent: 'codex', issue: 'issue' in labels ? null : 1476, pr: 'pr' in labels ? null : 1499, state }]);
  }
  const finished = { ...seat, state: 'finished' } as BoardTerminalV1, advisor = { ...seat, seat: 'advisor' } as BoardTerminalV1;
  expect(desks(board, [finished, advisor])).toEqual([]);
});

test('one classifier reads the hc status word for the desk rules and the advisor turn', () => {
  for (const [word, reading, turn] of [
    ['working', 'working', 'running'], ['blocked', 'blocked', 'running'], ['error', 'error', 'unknown'], ['done', 'done', 'over'], ['idle', 'idle', 'over'],
    [null, 'unreported', 'unknown'], ['thinking', 'other', 'unknown'],
  ] as const) expect([word, hcStatusClass(word), advisorTurnState(word)]).toEqual([word, reading, turn]);
});

test('the seat status message is one redacted line of at most 200 characters', () => {
  const token = `ghp_${'a'.repeat(30)}`;
  for (const [message, line] of [
    [null, null], [' \n ', null], ['waits for\n  review\t#12', 'waits for review #12'],
    [`push failed: ${token}`, 'push failed: ghp_[REDACTED]'],
    ['b'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS + 1), 'b'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS)],
    // The redaction runs before the cut, so a token over the cut is replaced and not cut in half.
    [`${'b'.repeat(190)} ${token}`, `${'b'.repeat(190)} ghp_[REDA`],
    ['b'.repeat(1001), ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    // The join makes an assignment, and the cut turns the safe value `none` into `no`.
    ['TOKEN\n=abc', ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    [`${'b'.repeat(191)} TOKEN=none`, ADVISOR_TRANSCRIPT_LINE_WITHHELD],
    ['-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', Array(3).fill(ADVISOR_TRANSCRIPT_LINE_WITHHELD).join(' ')],
  ] as const) expect(seatStatusMessage(message)).toBe(line);
});

test('decoders refuse an unknown protocol or kind', () => {
  expect(() => decodeBoard({ protocol: 2, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 2');
  expect(() => decodeBoard({ protocol: 1, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 1');
  // A protocol-3 board has no merge_hold fields.
  expect(() => decodeBoard({ protocol: 3, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 3');
  // A protocol-6 board has a merge_queue field and `via: sync` acceptances.
  expect(() => decodeBoard({ protocol: 6, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 6');
  // A protocol-7 board has no claim, open_questions or review_fail fields.
  expect(() => decodeBoard({ protocol: 7, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 7');
  // A protocol-8 board has no required contexts and no `unavailable` required check.
  expect(() => decodeBoard({ protocol: 8, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 8');
  // A protocol-9 board has no review_records field.
  expect(() => decodeBoard({ protocol: 9, kind: 'repo-harness.board' })).toThrow('unsupported board protocol: 9');
  expect(() => decodeBoard({ protocol: 10, kind: 'fleet_board_snapshot' })).toThrow('unsupported board kind: fleet_board_snapshot');
  const block = (value: Json) => `repo-harness plan\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`;
  const valid = { protocol: 2, kind: 'repo-harness.plan', merge_order: [1475], holds: [], seat_limits: { worker: 3 } } as const;
  expect(decodePlanBlock(block(valid))).toEqual(valid);
  // A protocol-1 block has a batches field.
  expect(() => decodePlanBlock(block({ ...valid, protocol: 1, batches: [] }))).toThrow(new PlanBlockError('unsupported protocol 1'));
  expect(() => decodePlanBlock(block({ ...valid, kind: 'plan' }))).toThrow(new PlanBlockError('unsupported kind "plan"'));
  expect(() => decodePlanBlock(block({ ...valid, waves: [] }))).toThrow(PlanBlockError);
});

test('decoders refuse a missing or invalid plan revision, merge policy or seat branch; null is the explicit unknown', () => {
  const recorded = JSON.parse(JSON.stringify(replay()));
  const plan = (revision: unknown) => ({ ...recorded, plan: { status: 'observed', comment_url: 'https://github.com/plan', created_at: recorded.observed_at, revision, block: {} } });
  const seat = (branch: unknown) => [{ ...recorded.execution.terminals[0], branch }];
  const board = (branch: unknown) => ({ ...recorded, execution: { status: 'observed', terminals: seat(branch) } });
  const parents = (branch: unknown) => ({ ...boardSeatsFixture, seats: seat(branch).map(row => ({ ...row, parent: '1474' })) });
  const { acceptance_merge: _dropped, ...noPolicy } = recorded;
  // Protocol 8: the claim, the open questions and the FAIL record of the head.
  const item = (patch: Json) => ({ ...recorded, items: recorded.items.map((entry: Json, index: number) => index === 0 ? { ...entry, ...patch } : entry) });
  const pull = (patch: Json) => ({ ...recorded, pull_requests: recorded.pull_requests.map((entry: Json, index: number) => index === 0 ? { ...entry, ...patch } : entry) });
  for (const invalid of [plan(undefined), plan(0), plan(1.5), plan('1'), noPolicy, { ...recorded, acceptance_merge: 'maybe' }, board(undefined), board(''),
    item({ claim: undefined }), item({ claim: { status: 'active', url: 'u' } }), item({ open_questions: { status: 'observed' } }), pull({ open_questions: undefined }), pull({ review_fail: { url: 'u' } }),
    pull({ review_records: undefined }), pull({ review_records: { status: 'observed', claude: 'x', codex: null, pi: null } })]) {
    expect(() => decodeBoard(invalid)).toThrow('invalid board');
  }
  for (const valid of [plan(null), plan(7), { ...recorded, acceptance_merge: 'unknown' }, board(null), board('main')]) expect(decodeBoard(valid)).toEqual(valid);
  for (const invalid of [parents(undefined), parents(''), { ...parents(null), seats: undefined }]) expect(() => decodeBoardSeats(invalid)).toThrow('board seat');
  expect(decodeBoardSeats(parents('main')).seats[0]!.branch).toBe('main');
  // A status message that leaves the server is one redacted line within the limit, and null is no message.
  const message = (status_msg: unknown) => ({ ...boardSeatsFixture, seats: [{ ...recorded.execution.terminals[0], status_msg, parent: '1474' }] });
  for (const invalid of [undefined, 7, 'a\nb', 'c'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS + 1), `ghp_${'a'.repeat(30)}`]) expect(() => decodeBoardSeats(message(invalid))).toThrow('invalid board seat status message on t1');
  for (const valid of [null, 'c'.repeat(SEAT_STATUS_MESSAGE_MAX_CHARS)]) expect(decodeBoardSeats(message(valid)).seats[0]!.status_msg).toBe(valid);
  expect(() => decodeBoard({ ...recorded, execution: { status: 'observed', terminals: message('a\nb').seats } })).toThrow('invalid board seat status message on t1');
});

test('plan revision: the ordinal of the newest plan comment among the write-access plan comments of every parent comment page', () => {
  const block = { protocol: 2, kind: 'repo-harness.plan', merge_order: [], holds: [], seat_limits: { worker: 3 } };
  const plan = (at: string, body = `repo-harness plan\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\`\n`) => comment(body, at);
  const revision = (nodes: Json[], older?: Json[][]) => {
    const board = replay({ parent: (data) => { data.repository.issue.comments = { pageInfo: { hasPreviousPage: false }, nodes }; }, comments: older && { older } });
    return board.plan.status === 'observed' ? board.plan.revision : board.plan.status;
  };
  const [first, second, third] = [plan('2026-11-01T00:00:00Z'), plan('2026-11-02T00:00:00Z'), plan('2026-11-03T00:00:00Z')];
  const invalid = plan('2026-11-01T12:00:00Z', 'repo-harness plan\n\nno block');
  const request = { ...plan('2026-11-04T00:00:00Z'), authorAssociation: 'NONE' };
  expect([
    revision([first]), revision([first, second, third]), revision([first, invalid, third]), revision([first, second, request]),
    revision([third], [[second], [first]]), revision([], [[first]]), revision([first, invalid]), revision([]),
  ]).toEqual([1, 3, 3, 2, 3, 1, 'unavailable', 'absent']);
});

const POLICY_ON = { status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from('{"publication":{"acceptance_merge":"on"}}').toString('base64') }) };

/** #1491 (closes #1475) is accepted by record, green and ready; the plan orders #1475 first and #1475 is tier:medium. */
function mergeReplay(edit: { parent?: (data: Json) => void; pulls?: (data: Json) => void; order?: number[]; holds?: Json[] } = {}, options: Replay = {}): Replay {
  return {
    policy: POLICY_ON,
    ...options,
    parent: (data) => {
      const block = { protocol: 2, kind: 'repo-harness.plan', merge_order: edit.order ?? [1475, 1479], holds: edit.holds ?? [], seat_limits: { worker: 4 } };
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``, '2026-11-02T22:00:00Z'));
      issueNode(data, 1475).labels.nodes.push({ name: 'tier:medium' });
      edit.parent?.(data);
    },
    pulls: (data) => {
      // The Medium rule needs a claimed different-family PASS row of the head; the recorded #1491 record has no claim.
      const { pr1491 } = data.repository;
      const receipt: ReviewPublishReceipt = { protocol: 1, kind: 'repo-harness-review-publish-receipt', round: 1, subject_sha: pr1491.headRefOid, risk_tier: 'medium', reviewer: { harness: 'codex', actual_model: null }, verdict: 'PASS', model_relation: 'different-family', summary: 'Reviewed.', findings: [] };
      const claimAt = '2026-11-02T21:01:00Z';
      pr1491.comments.nodes.push(comment(renderAcceptanceClaim(receipt), claimAt));
      pr1491.comments.nodes.push(comment(renderAcceptanceRecord(receipt, `https://github.com/Ancienttwo/repo-harness/pull/1491#issuecomment-${Date.parse(claimAt)}`), '2026-11-02T21:02:00Z'));
      edit.pulls?.(data);
    },
  };
}

function mergeReason(edit: Parameters<typeof mergeReplay>[0] = {}, options: Replay = {}, pr = 1491): string {
  const decision = boardMergeDecisions(replay(mergeReplay(edit, options))).find(entry => entry.pr === pr)!;
  return decision.eligible ? 'eligible' : decision.reason;
}

test('board merge: an accepted, green, ready PR first in plan order is eligible, A11 wakes the orchestrator, and the merge pins its head and base', () => {
  const board = replay(mergeReplay());
  expect(evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'A11').map(finding => [finding.pull_requests, finding.message]))
    .toEqual([[[1491], 'eligible: run repo-harness board merge --parent 1474 --pr 1491']]);
  const pr = board.pull_requests.find(entry => entry.number === 1491)!;
  const calls: Json[] = [];
  const merge = (input: Json) => { calls.push(input); return { exit_code: 0, document: { ok: true } } as never; };
  const merged = runBoardMerge({ ...replayInput(mergeReplay()), pr: null, dry_run: false, merge });
  expect([merged.target, merged.exit_code]).toEqual([1491, 0]);
  expect(calls.map(call => [call.pr_number, call.expected_head_sha, call.expected_base_sha, call.provider_repository_id, call.repository]))
    .toEqual([[1491, pr.head_sha, pr.base_sha, '1000001', 'Ancienttwo/repo-harness']]);
  const dry = runBoardMerge({ ...replayInput(mergeReplay()), pr: 1491, dry_run: true, merge });
  const refused = runBoardMerge({ ...replayInput(mergeReplay()), pr: 1494, dry_run: false, merge });
  expect([dry.target, dry.exit_code, refused.target, refused.exit_code, calls.length]).toEqual([1491, 0, null, 4, 1]);
});

test('board read: the pull request read asks in groups, so a parent whose pull requests print more than one 1 MiB gh response reaches the board complete', () => {
  // 32 more pull requests of #1475, each a copy of the open #1491 (33 kB): about 1.2 MB in one query.
  const copies = Array.from({ length: 32 }, (_, at) => 1600 + at);
  const input = replayInput({
    parent: (data) => { issueNode(data, 1475).timelineItems.nodes.push(...copies.map(number => ({ source: { number, repository: { nameWithOwner: 'Ancienttwo/repo-harness' } } }))); },
    pulls: (data) => { for (const number of copies) data.repository[`pr${number}`] = { ...data.repository.pr1491, number }; },
  });
  const board = input.gh_runner!;
  const sizes: number[] = [];
  // Each pull request read gets the aliases that its query asks for, as GitHub answers it.
  const gh: BoardCollectInput['gh_runner'] = (args) => {
    const query = args.find(arg => arg.startsWith('query='))!;
    if (args[1] !== 'graphql' || !query.includes(': pullRequest(number:')) return board(args);
    const recorded = JSON.parse(board(args).stdout).data.repository;
    const stdout = JSON.stringify({ data: { repository: Object.fromEntries([...query.matchAll(/(pr\d+): pullRequest/gu)].map(([, alias]) => [alias, recorded[alias!]])) } });
    sizes.push(stdout.length);
    return { status: 0, stdout };
  };
  const read = collectBoard({ ...input, gh_runner: gh });
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeGreaterThan(1024 * 1024);
  expect(Math.max(...sizes)).toBeLessThan(1024 * 1024);
  expect(read.pull_requests.map(pr => pr.number)).toEqual(expect.arrayContaining([1491, ...copies]));
  // A real gh process that prints more than the limit is killed; the error names the limit and is no short availability.
  const largeGh = join(input.repo_root, 'gh-large');
  writeFileSync(largeGh, `#!/bin/sh\nhead -c ${GH_MAX_BUFFER_BYTES + 1} /dev/zero\n`, { mode: 0o755 });
  try { readGhJson({ repo_root: input.repo_root, gh_bin: largeGh }, ['api', 'graphql']); throw new Error('expected failure'); } catch (error) {
    expect(error).toBeInstanceOf(BoardCollectError);
    expect((error as BoardCollectError).message).toBe(`gh api graphql printed more than the ${GH_MAX_BUFFER_BYTES}-byte maxBuffer limit`);
    expect((error as BoardCollectError).endedWithoutExit).toBe(false);
  }
  // The daily run read over the limit fails the board read; it is no unavailable daily run.
  const enobufs = { status: null, stdout: '', signal: 'SIGKILL' as const, error: Object.assign(new Error('spawnSync gh ENOBUFS'), { code: 'ENOBUFS' }) };
  expect(() => collectBoard({ ...input, gh_runner: args => args.some(arg => arg.includes('actions/workflows/ci.yml/runs')) ? enobufs : gh(args) }))
    .toThrow(`gh api --hostname printed more than the ${GH_MAX_BUFFER_BYTES}-byte maxBuffer limit`);
});

test('board read: an optional readiness read over the gh stdout limit fails the board read; another error of that read keeps its result', () => {
  const input = replayInput({});
  const board = input.gh_runner!;
  const repository = 'Ancienttwo/repo-harness';
  const readiness = recordedReadinessGh(() => false);
  const failedJob = { id: 42, name: 'Required / CI', status: 'completed', conclusion: 'failure',
    steps: [{ name: 'Run the shard tests', number: 1, status: 'completed', conclusion: 'failure' }],
    check_run_url: `https://api.github.com/repos/${repository}/check-runs/77` };
  // A failed required check reaches the optional annotations read; `annotations` answers that one read.
  const readWith = (annotations: { status: number | null; stdout: string; stderr?: string; error?: Error }) => {
    const runner: BoardCollectInput['gh_runner'] = (args) => {
      const path = args[0] === 'api' ? args[1]! : '';
      if (args[0] === 'pr' && args[1] === 'checks') return { status: 1, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'fail', link: `https://github.com/${repository}/actions/runs/41/job/42` }]) };
      if (path === `repos/${repository}/actions/runs/41/attempts/1/jobs?per_page=100`) return { status: 0, stdout: JSON.stringify({ total_count: 1, jobs: [failedJob] }) };
      if (path === `repos/${repository}/check-runs/77/annotations?per_page=100`) return annotations;
      return args.at(-1) === 'github.com' || args.includes(`github.com/${repository}`) ? readiness(args) : board(args);
    };
    return collectBoard({ ...input, readiness: undefined, gh_runner: runner });
  };
  // An output that the product cannot take in full is not an absent annotation feed.
  const enobufs = { status: null, stdout: '', error: Object.assign(new Error('spawnSync gh ENOBUFS'), { code: 'ENOBUFS' }) };
  expect(() => readWith(enobufs)).toThrow(`printed more than the ${GH_MAX_BUFFER_BYTES}-byte maxBuffer limit`);
  // Every other error of that optional read keeps its current result: the read continues without annotations.
  expect(readWith({ status: 2, stdout: '', stderr: 'gh: Bad Gateway (HTTP 502)' }).pull_requests[0]!.merge_readiness)
    .toMatchObject({ ready: false, blockers: [{ code: 'checks_failed' }] });
});

test('each attention finding names its priority, and a delivery sorts the entries by it', () => {
  // The merge fixture: #1491 is accepted, ready and unmerged (A1, P2), t1 is blocked for 11 min (A3, P0) and #1491 is eligible (A11, P2).
  const board = replay(mergeReplay());
  const attention = evaluateBoardAttention(board);
  expect(attention.protocol).toBe(2);
  // The priority has one source, and the record names every rule of the protocol.
  expect(BOARD_RULE_PRIORITY).toEqual({
    A1: 'P2', A3: 'P0', A4: 'P1', A5: 'P1', A6: 'P1', A7: 'P2', A8: 'P3', A9: 'P3', A10: 'P2', A11: 'P2',
    A12: 'P1', A13: 'P1', A14: 'P2', A15: 'P2', A16: 'P1', A17: 'P1', A18: 'P2', A19: 'P1', A20: 'P2',
    R1: 'P2', R2: 'P2', R3: 'P1', R4: 'P2', R5: 'P1', R6: 'P1', R7: 'P2',
  });
  expect(attention.findings.map(finding => [finding.rule, finding.priority])).toContainEqual(['A3', 'P0']);
  expect(attention.findings.map(finding => [finding.rule, finding.priority])).toContainEqual(['A11', 'P2']);
  expect(attention.findings.map(finding => finding.priority)).toEqual(attention.findings.map(finding => BOARD_RULE_PRIORITY[finding.rule]));

  const delivery = planAttentionDeliveries(board, attention, 0).deliveries.find(entry => entry.route === 'orchestrator')!;
  const entries = delivery.text.slice('[rh-attention] #1474 '.length).split('; ');
  // `evaluateBoardAttention` lists A1 before A3: the delivery puts P0 first.
  expect(entries[0]).toBe('P0 A3: worker t1 is blocked for 11 min');
  expect(entries.some(entry => entry.startsWith('P2 A1: #1491 is accepted and ready, unmerged for'))).toBe(true);
  expect(entries.some(entry => entry.startsWith('P2 A11: eligible: run repo-harness board merge --parent 1474 --pr 1491'))).toBe(true);
  const ranks = entries.map(entry => BOARD_PRIORITY_ORDER.indexOf(entry.slice(0, 2) as BoardPriority));
  expect(ranks).toEqual([...ranks].sort((left, right) => left - right));

  // No entry and no `board attention` finding line is without a priority.
  expect(delivery.text).toMatch(/^\[rh-attention\] #1474 (P[0-3] [AR][0-9]+: .+)(; P[0-3] [AR][0-9]+: .+)*$/u);
  const lines = renderAttentionText(attention).split('\n').filter(Boolean);
  for (const line of lines.slice(0, attention.findings.length)) expect(line).toMatch(/^P[0-3] [AR][0-9]+ (orchestrator|advisor): /u);
  // The unevaluated rules keep their own line: an unread rule has no priority.
  for (const line of lines.slice(attention.findings.length)) expect(line).toMatch(/^[AR][0-9]+ not evaluated: /u);
});

test('board read: every sub-issue page of the parent reaches the board and the merge_order gate; a truncated or repeating page, a repeated cursor and a stream above the page cap fail closed; so does a parent comment page without a cursor or with a repeated one', () => {
  const single = replay();
  const paged = replay({ pages: { size: 4 } });
  expect(paged.items.map(item => [item.number, item.pull_requests])).toEqual(single.items.map(item => [item.number, item.pull_requests]));
  // #1482 is on the third page: the gate sees it closed, as it sees a closed sub-issue on the first page.
  const closedOnLastPage = mergeReplay({ order: [1482, 1475], parent: (data) => { issueNode(data, 1482).state = 'CLOSED'; } }, { pages: { size: 4 } });
  expect(boardMergeDecisions(replay(closedOnLastPage)).find(entry => entry.pr === 1491)).toEqual({ pr: 1491, eligible: true });
  const refusal = (edit: (pages: Json[]) => void) => {
    try { replay({ pages: { size: 4, edit } }); return 'read'; } catch (error) { return error instanceof BoardSourceError ? error.message : String(error); }
  };
  expect([
    refusal((pages) => { pages[1]!.data.repository.issue.subIssues.pageInfo.endCursor = null; }),
    refusal((pages) => { pages[2]!.data.repository.issue.subIssues.nodes.push(pages[0]!.data.repository.issue.subIssues.nodes[0]); }),
    refusal((pages) => { pages[1]!.data.repository.issue.subIssues.pageInfo.endCursor = 'c1'; }),
    refusal((pages) => { pages[2]!.data.repository.issue.subIssues.pageInfo = { hasNextPage: true, endCursor: 'c1' }; }),
    // An advancing stream of empty pages: page n names cursor c(n+1).
    refusal((pages) => {
      pages[2]!.data.repository.issue.subIssues.pageInfo.hasNextPage = true;
      for (let at = 3; at <= 25; at += 1) {
        const page = structuredClone(pages[2]!);
        page.data.repository.issue.subIssues = { pageInfo: { hasNextPage: true, endCursor: `c${at + 1}` }, nodes: [] };
        pages.push(page);
      }
    }),
  ]).toEqual([
    'board source invalid: page 1 issue.subIssues.pageInfo.endCursor is not a cursor',
    'board source invalid: sub-issue #1475 is on more than one page',
    'board source invalid: issue.subIssues cursor c1 repeats',
    'board source invalid: issue.subIssues cursor c1 repeats',
    'board source invalid: issue.subIssues has more than 20 pages of 50',
  ]);
  const commentRefusal = (edit: (pages: Json[]) => void) => {
    try { replay({ comments: { older: [[], []], edit } }); return 'read'; } catch (error) { return error instanceof BoardSourceError ? error.message : String(error); }
  };
  expect([
    commentRefusal((pages) => { pages[0]!.data.repository.issue.comments.pageInfo.startCursor = null; }),
    commentRefusal((pages) => { pages[1]!.data.repository.issue.comments.pageInfo.startCursor = 'k1'; }),
    commentRefusal((pages) => { delete pages[2]!.data; pages[2]!.errors = [{ message: 'timeout' }]; }),
  ]).toEqual([
    'board source invalid: comment page 0 issue.comments.pageInfo.startCursor is not a cursor',
    'board source invalid: issue.comments cursor k1 repeats',
    'BoardCollectError: GitHub GraphQL refused the board read: [{"message":"timeout"}]',
  ]);
  // A coordinator claim on an older page is active until its release on the newest page.
  const claim = comment('repo-harness issue claim\nStatus: active\nRole: coordinator', '2026-11-01T09:00:00Z');
  const release = comment(`repo-harness issue claim status\nClaim: ${claim.url}\nStatus: released`, '2026-11-02T22:30:00Z');
  const coordinator = (released: boolean) => {
    const { parent } = readParent(replayInput(mergeReplay({ parent: (data) => { if (released) data.repository.issue.comments.nodes.push(release); } }, { comments: { older: [[claim]] } })));
    const quota = { claude: { state: 'normal', remaining: 80, mode: 'normal' }, chatgpt: { state: 'normal', remaining: 30, mode: 'normal', credits: 'off' } } as const;
    return planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota, terminals: [], parent }).coordinator;
  };
  expect([coordinator(false), coordinator(true)]).toEqual([claim.url, null]);
});

test('board merge: every hold stays in force until a strictly newer release on its own thread; Issues: scopes only a parent hold', () => {
  const HOLD = 'repo-harness merge hold\nReason: owner said stop';
  const RELEASE = 'repo-harness merge hold released';
  type Thread = 'parent' | 'issue' | 'pr';
  const on = (...records: [Thread, string, string][]) => ({
    parent: (data: Json) => {
      for (const [thread, body, at] of records) {
        if (thread === 'parent') data.repository.issue.comments.nodes.push(comment(body, at));
        if (thread === 'issue') issueNode(data, 1475).comments.nodes.push(comment(body, at));
      }
    },
    pulls: (data: Json) => { for (const [thread, body, at] of records) if (thread === 'pr') data.repository.pr1491.comments.nodes.push(comment(body, at)); },
  });
  expect([
    mergeReason(on(['pr', HOLD, '2026-11-02T21:00:00Z'])),
    mergeReason(on(['pr', HOLD, '2026-11-02T21:00:00Z'], ['pr', RELEASE, '2026-11-02T21:30:00Z'])),
    mergeReason(on(['pr', HOLD, '2026-11-02T21:00:00Z'], ['pr', RELEASE, '2026-11-02T21:00:00Z'])),
    mergeReason(on(['pr', HOLD, '2026-11-02T21:00:00Z'], ['issue', RELEASE, '2026-11-02T21:30:00Z'])),
    mergeReason(on(['issue', `${HOLD}\nIssues: #999`, '2026-11-02T21:00:00Z'])),
    mergeReason(on(['parent', `${HOLD}\nIssues: #1479`, '2026-11-02T21:00:00Z'])),
    mergeReason(on(['parent', HOLD, '2026-11-02T21:00:00Z'])),
    mergeReason(on(['parent', HOLD, '2026-11-02T21:00:00Z'], ['parent', `${HOLD}\nIssues: #1479`, '2026-11-02T21:10:00Z'])),
    // The parent thread is read to its oldest page: a hold there stays in force until a newer release.
    mergeReason({}, { comments: { older: [[comment(HOLD, '2026-11-01T10:00:00Z')]] } }),
    mergeReason(on(['parent', RELEASE, '2026-11-02T21:00:00Z']), { comments: { older: [[comment(HOLD, '2026-11-01T10:00:00Z')]] } }),
    mergeReason({ parent: (data) => { issueNode(data, 1475).comments.pageInfo.hasPreviousPage = true; } }),
    // Truncated: the oldest #1475 comment read is 18:34:59Z. A release at that boundary can tie an omitted hold; a later one cannot.
    ...['2026-11-02T18:34:59Z', '2026-11-02T21:00:00Z'].map(at => mergeReason({ parent: (data) => {
      issueNode(data, 1475).comments.nodes.push(comment(RELEASE, at));
      issueNode(data, 1475).comments.pageInfo.hasPreviousPage = true;
    } })),
  ]).toEqual(['held', 'eligible', 'held', 'held', 'held', 'eligible', 'held', 'held', 'held', 'eligible', 'hold_unknown', 'hold_unknown', 'eligible']);
});

test('board merge: no plan, a draft, plan holds, plan order for every linked item, the provisional Low path, a missing Claude review, a red Required / CI, readiness and the policy switch each refuse', () => {
  const lowGreen = {
    parent: (data: Json) => { issueNode(data, 1479).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data: Json) => {
      const { pr1494 } = data.repository;
      pr1494.isDraft = false;
      asSmallFix(pr1494);
      pr1494.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z', detailsUrl: null, startedAt: null, checkSuite: { workflowRun: null } });
    },
  };
  expect([
    mergeReason({ parent: (data) => { data.repository.issue.comments.nodes.pop(); } }),
    mergeReason({}, {}, 1499),
    mergeReason({ holds: [{ issue: 1475, reason: 'owner item' }] }),
    mergeReason({ order: [1479, 1475] }),
    mergeReason({ order: [1475, 1479, 1476], pulls: (data) => { data.repository.pr1491.body += '\nRefs #1476\n'; } }),
    mergeReason({ order: [1476, 1475], pulls: (data) => { data.repository.pr1491.body += '\nRefs #1476\n'; } }),
    mergeReason({ order: [1479] }),
    mergeReason({ ...lowGreen, order: [1479, 1475] }, {}, 1494),
    mergeReason({ parent: (data) => { issueNode(data, 1475).labels.nodes = []; } }),
    mergeReason({ pulls: (data) => { for (const check of data.repository.pr1491.commits.nodes[0].commit.statusCheckRollup.contexts.nodes) if (check.name === 'Required / CI') check.conclusion = 'FAILURE'; } }),
    mergeReason({}, { ready: [] }),
    mergeReason({}, { policy: POLICY_ABSENT }),
  ]).toEqual(['plan_unavailable', 'draft', 'plan_hold', 'merge_order', 'merge_order', 'merge_order', 'not_in_merge_order', 'not_accepted', 'not_accepted', 'required_check', 'not_ready', 'acceptance_merge_off']);
  // A PR that closes an earlier plan item can never see it closed first; a linked issue outside the board fails closed.
  const decision = (edit: Parameters<typeof mergeReplay>[0]) => boardMergeDecisions(replay(mergeReplay(edit))).find(entry => entry.pr === 1491);
  expect(decision({ order: [1475, 1479], pulls: (data) => { data.repository.pr1491.body += '\nCloses #1479\n'; } }))
    .toMatchObject({ reason: 'merge_order', detail: 'earlier plan item #1475 is closed only by this PR; split the PR' });
  expect(decision({ pulls: (data) => { data.repository.pr1491.body += '\nRefs #1460\n'; } })).toMatchObject({ reason: 'item_off_board' });
  // The Low PR is accepted on the provisional tier_low path, which an unattended merge does not take.
  expect(replay(mergeReplay({ ...lowGreen, order: [1479, 1475] })).pull_requests.find(pr => pr.number === 1494)!.acceptance).toMatchObject({ status: 'accepted', via: 'tier_low' });
});

test('merge policy: the policy file of the default branch through the one parser; only an absent file or key reads as off', () => {
  const file = (text: string) => ({ status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from(text).toString('base64') }) });
  const cases: readonly (readonly [GhAnswer | undefined, string])[] = [
    [file('{"publication":{"acceptance_merge":"on"}}'), 'on'],
    [file('{"publication":{"acceptance_merge":"off"}}'), 'off'],
    [file('{"publication":{}}'), 'off'],
    [file('{}'), 'off'],
    [undefined, 'off'],
    // The parser refuses: not JSON, a bad switch value, an unknown publication field.
    [file('{'), 'unknown'],
    [file('{"publication":{"acceptance_merge":"maybe"}}'), 'unknown'],
    [file('{"publication":{"other":true}}'), 'unknown'],
    // The read fails: a directory at the path, a 404 body with a success status, a server error, no JSON body, a killed gh.
    [{ status: 0, stdout: '[]' }, 'unknown'],
    [{ status: 0, stdout: '{"status":"404"}' }, 'unknown'],
    [{ status: 1, stdout: '{"message":"Server Error","status":"500"}' }, 'unknown'],
    [{ status: 1, stdout: '' }, 'unknown'],
    [{ status: 137, stdout: '{"status":"404"}' }, 'unknown'],
  ];
  expect(cases.map(([policy]) => replay({ policy }).acceptance_merge)).toEqual(cases.map(([, expected]) => expected) as BoardV1['acceptance_merge'][]);
});

test('seat branch: git in the terminal directory on both reads; each unreadable directory gives null and no path reaches the payload', () => {
  const branched = tmpWorkspace('board-seat-branch'); roots.push(branched);
  initGitRepo(branched);
  run('git', ['checkout', '-q', '-b', 'feat/1806-seat'], branched);
  const detached = tmpWorkspace('board-seat-detached'); roots.push(detached);
  initGitRepo(detached);
  run('git', ['commit', '-q', '--allow-empty', '-m', 'one'], detached);
  run('git', ['checkout', '-q', '--detach'], detached);
  const plain = tmpWorkspace('board-seat-plain'); roots.push(plain);
  const directories: Readonly<Record<string, string | undefined>> = { t1: branched, t2: detached, t3: plain, t4: join(plain, 'gone'), t5: undefined };
  const terminal = (cwd: string | undefined) => ({ cwd, labels: { 'repo-harness.repository': '1186405141', 'repo-harness.seat': 'worker', 'repo-harness.parent': '1474' } });
  const hc = watchHc({ FAKE_LS: Object.keys(directories).map(address => ({ address, state: 'live' })),
    FAKE_TERMINALS: Object.fromEntries(Object.entries(directories).map(([address, cwd]) => [address, terminal(cwd)])) });
  const expected = [['t1', 'feat/1806-seat'], ['t2', null], ['t3', null], ['t4', null], ['t5', null]];
  const execution = replay({ host: boardHostPorts(hc.options) }).execution;
  expect(execution.status === 'observed' && execution.terminals.map(seat => [seat.address, seat.branch])).toEqual(expected);
  const read = boardHostPorts(hc.options).seatTerminals('1186405141');
  if (read.status !== 'observed') throw new Error(read.reason);
  const list = projectBoardSeats('1186405141', REPLAY_NOW.toISOString(), seatTerminalsWithBranches(read.terminals));
  expect(list.seats.map(seat => [seat.address, seat.branch])).toEqual(expected);
  expect(JSON.stringify([execution, list])).not.toContain(plain);
  expect(JSON.stringify([execution, list])).not.toContain(branched);
});

test('board seats CLI: includes seats without a parent and keeps the repository seat fields and branches', () => {
  const labels = { 'repo-harness.repository': '1186405141', 'repo-harness.seat': 'worker', 'repo-harness.issue': '1941', 'repo-harness.pr': '1942' };
  const hc = watchHc({
    FAKE_LS: ['t1', 't2', 't3', 't4', 't5'].map(address => ({ address, state: 'live' })),
    FAKE_TERMINALS: {
      t1: { labels },
      t2: { labels: { ...labels, 'repo-harness.parent': '1900' } },
      t3: { labels: { ...labels, 'repo-harness.repository': '99' } },
      t4: { labels: { ...labels, 'repo-harness.service': 'attention' } },
      t5: { labels: { 'repo-harness.repository': '1186405141' } },
    },
  });
  initGitRepo(hc.root);
  const terminals = JSON.parse(hc.options.env.FAKE_TERMINALS);
  terminals.t1.cwd = hc.root;
  const result = run(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'board', 'seats', '--json'], hc.root,
    { ...hc.options.env, FAKE_TERMINALS: JSON.stringify(terminals), REPO_HARNESS_GH_BIN: seatsGh(hc.root) });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const document = JSON.parse(result.stdout);
  expect([document.protocol, document.kind, document.repository_id]).toEqual([1, 'repo-harness.board-seats', '1186405141']);
  expect(document.seats.map((seat: Json) => [seat.address, seat.seat, seat.issue, seat.pr, seat.parent, seat.branch]))
    .toEqual([['t1', 'worker', 1941, 1942, null, 'main'], ['t2', 'worker', 1941, 1942, '1900', null]]);
  expect(result.stdout).not.toContain(hc.root);
});

function seatsGh(root: string): string {
  const path = join(root, 'bin/gh');
  writeFileSync(path, `#!${process.execPath}\nif (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['api', '--hostname', 'github.com', 'repos/{owner}/{repo}'])) process.exit(2);\nconsole.log('{"id":1186405141}');\n`);
  chmodSync(path, 0o755);
  return path;
}

test('board seats CLI: an hc read failure returns the parents command error shape and no document', () => {
  const hc = watchHc();
  writeFileSync(join(hc.root, 'bin/hc'), `#!${process.execPath}\nprocess.exit(9);\n`);
  const result = run(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'board', 'seats', '--json'], hc.root,
    { ...hc.options.env, REPO_HARNESS_GH_BIN: seatsGh(hc.root) });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toEqual({ ok: false, error: 'BoardSeatsError', code: 'seats_hc_failed', message: expect.any(String) });
});

type GhAnswer = { readonly status: number; readonly stdout: string; readonly stderr?: string };

/** The parent list collector on the recorded hc core; `hc: false` leaves hc off PATH. */
function replayParents(gh: (args: readonly string[]) => GhAnswer, hc = true): BoardParentsV1 {
  const root = tmpWorkspace('board-parents'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  if (hc) { writeFileSync(join(root, 'bin/hc'), HC); chmodSync(join(root, 'bin/hc'), 0o755); }
  return collectBoardParents({ repo_root: root, now: () => REPLAY_NOW, gh_runner: gh, host: boardHostPorts({ env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, FIXTURES } }) });
}

test('parent counts retain nonempty seat labels with invalid issue or PR labels, and exclude an empty seat label', () => {
  const { parent: _parent, seat_status: _status, seat: _seat, issue: _issue, pr: _pr, ...terminal } = boardSeatsFixture.seats[0]!;
  const seats = projectBoardSeats('1186405141', REPLAY_NOW.toISOString(), [
    { ...terminal, state: 'live', labels: { seat: 'worker', parent: '1474', issue: 'invalid' } },
    { ...terminal, state: 'live', address: 't2', labels: { seat: 'worker', parent: '1474', pr: 'invalid' } },
    { ...terminal, state: 'live', address: 't3', labels: { seat: '', parent: '1651' } },
  ]);
  expect(decodeBoardSeats(JSON.parse(JSON.stringify(seats))).seats.map(seat => [seat.seat, seat.seat_status])).toEqual([
    ['worker', 'unavailable'], ['worker', 'unavailable'], ['', 'unavailable'],
  ]);
  const joined = joinBoardParents(decodeBoardParents(boardParentsFixture), seats);
  expect(joined.parents.map(parent => [parent.number, parent.seats])).toEqual([[1474, 2], [1651, 0]]);
  expect(joined.active_parent).toBe(1474);
});

test('async repository identity shares local admission and repository-id decoding; a checkout without a GitHub remote starts no gh', async () => {
  const root = tmpWorkspace('board-async-identity'); roots.push(root); initGitRepo(root);
  const log = join(root, 'gh.log'), gh = join(root, 'gh');
  writeFileSync(gh, `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.IDENTITY_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\nconsole.log(process.env.IDENTITY_REPLY);\n`, { mode: 0o755 });
  const env = { ...process.env, IDENTITY_LOG: log, IDENTITY_REPLY: '{"id":1186405141}' };
  const input = { repo_root: root, gh_bin: gh, env, signal: new AbortController().signal };
  const isGitHubRemote = (url: string) => githubRemoteRepository(url) !== null;
  expect(await readLocalRepositoryIdAsync(input, isGitHubRemote)).toBeNull();
  expect(existsSync(log)).toBe(false);
  expect(run('git', ['config', 'remote.origin.url', 'https://gitlab.com/local/repo.git'], root).status).toBe(0);
  expect(await readLocalRepositoryIdAsync(input, isGitHubRemote)).toBeNull();
  expect(existsSync(log)).toBe(false);
  expect(run('git', ['config', 'remote.origin.url', 'https://github.com/aimpact-inc/repo-harness.git'], root).status).toBe(0);
  expect(await readLocalRepositoryIdAsync(input, isGitHubRemote)).toBe(1186405141);
  expect(JSON.parse(readFileSync(log, 'utf8'))).toEqual(['api', '--hostname', 'github.com', 'repos/{owner}/{repo}']);
  await expect(readLocalRepositoryIdAsync({ ...input, env: { ...env, IDENTITY_REPLY: '{"id":0}' } }, isGitHubRemote)).rejects.toThrow('the local GitHub repository id is unknown');
});

test('parent list: one paginated issue read and one hc list give the open parents with progress and live seats, seats first', () => {
  // Recorded on 2026-11-04: `gh api graphql --paginate --slurp` with OPEN_ISSUES_QUERY on Ancienttwo/repo-harness, one page
  // of twelve open issues; #1651 is the only one with sub-issues. #1474 is closed now, so the replay adds it as an older
  // open parent, because the recorded seat terminals name it.
  const pages = JSON.parse(fixture('open-issues.graphql.json'));
  const repository = pages[0].data.repository;
  repository.issues.nodes.push({ number: 1474, title: 'herdr-core 迁移：退役 classic herdr CLI（G37）', url: 'https://github.com/Ancienttwo/repo-harness/issues/1474', updatedAt: '2026-11-02T23:00:00Z', subIssuesSummary: { total: 9, completed: 2 } });
  const calls: (readonly string[])[] = [];
  const answer = (value: unknown) => (args: readonly string[]): GhAnswer => { calls.push(args); return { status: 0, stdout: JSON.stringify(value) }; };
  const list = replayParents(answer(pages));
  expect(decodeBoardParents(JSON.parse(JSON.stringify(list)))).toEqual(list);
  // The operator-web fixture is this list.
  expect(list).toEqual(decodeBoardParents(boardParentsFixture));
  expect(list.repository).toBe('Ancienttwo/repo-harness');
  // t1-t3 have a seat label; t4 has none, and t5 is a seat of another repository with the same parent.
  expect(joinBoardParents(list, decodeBoardSeats(boardSeatsFixture)).parents.map(parent => [parent.number, `${parent.sub_issues.completed}/${parent.sub_issues.total}`, parent.seats])).toEqual([[1474, '2/9', 3], [1651, '3/9', 0]]);
  // The seats list keeps every seat terminal of the repository with its hc agent kind, status word and raw parent label.
  expect(decodeBoardSeats(boardSeatsFixture).seats.map(seat => [seat.address, seat.seat_status === 'observed' && [seat.seat, seat.issue, seat.pr], seat.parent, seat.agent, seat.status]))
    .toEqual([['t1', ['worker', 1476, 1499], '1474', 'codex', 'blocked'], ['t2', ['worker', 1475, 1491], '1474', 'claude-code', 'done'], ['t3', ['orchestrator', null, null], '1474', null, 'idle']]);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.filter(arg => !arg.startsWith('query='))).toEqual(['api', 'graphql', '--hostname', 'github.com', '--paginate', '--slurp', '-f', '-F', 'owner={owner}', '-F', 'name={repo}']);
  // Two pages give the same list as one.
  const page = (nodes: unknown[], hasNextPage: boolean) => ({ data: { repository: { ...repository, issues: { pageInfo: { hasNextPage, endCursor: 'c' }, nodes } } } });
  const split = [page(repository.issues.nodes.slice(0, 6), true), page(repository.issues.nodes.slice(6), false)];
  expect(replayParents(answer(split)).parents).toEqual(list.parents);

  // Each failed read is the whole result: no empty list and no partial list.
  const failure = (run: () => unknown) => { try { run(); return 'no error'; } catch (error) { return error instanceof BoardParentsError ? error.code : (error as Error).name; } };
  expect([
    failure(() => replayParents(() => ({ status: 1, stdout: '', stderr: 'HTTP 502' }))),
    failure(() => replayParents(answer([split[0]]))),
  ]).toEqual(['parents_github_failed', new BoardSourceError('').name]);
  expect(replayParents(answer(pages), false)).toEqual(list);
  expect(() => decodeBoardParents({ ...list, protocol: 4 })).toThrow('unsupported board parents protocol: 4');
  expect('seats' in list).toBe(false);
  expect(list.parents.every(parent => !('seats' in parent))).toBe(true);
});

// The round-4 records of #1499 (PASS) and #1494 (FAIL) as posted: bare SHAs in the subject cell.
const ROUND_4_PASS_1499 = "repo-harness acceptance record\nAgent: Claude Code (claude-opus-5-5) coordinator, session d2630775\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 4 | acceptor (gatekeeper, fresh Claude context, read-only) | d1558fa061febe0f5f299f91a2c59ecd7d2d97f5 | PASS: 0 P0-P2, 1 P3 |\n\nModel relation: same-family\nThe receipt tool takes rounds 1-3 only, so this comment holds round 4. Round 3 (Codex, different family) found no P0-P2 at 23627c4f5.\n\nDelta d1558fa06 (3 files) and merge 50f8f0157 (remerge-diff empty; merge-tree into main 619f7178d is clean). cx1499-r3-changelog-release-placement fixed: the diff against main adds only an `[Unreleased]` / `Breaking` section with the #1476 entry above `[0.25.2]`. cx1499-r3-owner-address-authority fixed: the address regex exists once (`herdr-core.ts:93`), used by `address()` and the owner check through `isHcAddress`. check:type exit 0; check:state-boundaries OK (533 files); herdr-task-lifecycle 8 pass after `bun run build:oar-review-host` (a fresh worktree has no `dist/oar-review-host.js`; CI builds it), herdr-core-transport 9, closeout-notify 7, the 9 other files of the PR body and generic-review 50 pass; each lifecycle core used its own HC_SESSION and HOME and was stopped. CI run 41533760984 green. No changed test, no compatibility code, no attribution.\n- rv1499-r4-oar-host-build-precondition, P3: the PR body's local verification omits `bun run build:oar-review-host` before the lifecycle test.\n\nDecision: accepted at d1558fa06. Merge hold per #1474 issuecomment-6589728962 (after the 0.25.2 release prep merge).\n";
const ROUND_4_FAIL_1494 = "repo-harness acceptance record\nAgent: Claude Code (claude-opus-5-5) coordinator, session d2630775\n\n| Round | Seat | Subject | Verdict |\n|---|---|---|---|\n| 4 | acceptor (gatekeeper, fresh Claude context, read-only) | 5c5139981b0bc5a620e3b2cd0605d61e4c76991d | FAIL: 1 P2, 1 P3 |\n\nModel relation: same-family\nThe receipt tool takes rounds 1-3 only, so this comment holds round 4.\n\nDelta 5c5139981 and merge aa8b6c3cc (remerge-diff empty). The round 3 fix is correct: the doctor relay check passes `hcOptions()`, and the doctor test fails without it. check:type pass; check:state-boundaries pass (533 files); `tests/cli/doctor.test.ts` 48/48 in 3 runs (the worker's earlier 2 failures did not reproduce); the 13 other affected files pass with the PR body counts; CI green.\n\nFindings (sibling sweep of hc calls in the changed files):\n- rv1494-r4-status-forwards-notify-secrets, P2, `src/effects/operator/notify-status.ts:80`: `readNotifyChannelStatus` passes `{ ...process.env, ...input.env }` unscrubbed to `hcListAsync`. A probe with a fake hc showed `WEBHOOK_URL` and `TELEGRAM_BOT_TOKEN` in the child env. The PR Risk section says this read starts a stopped core, so that core keeps the values and later terminals inherit them. Fix: move the `NOTIFY_SECRET_KEYS` scrub into one exported helper beside `NOTIFY_SECRET_KEYS` in `notify-relay.ts`; use it in `hcOptions()` and for the hc env here; extend one case in `tests/effects/operator-notify-status.test.ts` with an env-dumping fake hc.\n- rv1494-r4-relay-events-env-unscrubbed, P3, `src/cli/commands/herdr.ts:197` and `notify-relay.ts:254`: the relay passes `process.env` to `hcEvents`. A hand run from a shell that exports the values can start a core that keeps them. Use the same helper.\n\nDecision: not accepted at 5c5139981. The writer fixes both items with the one helper. Round 5 needs the owner's approval: rounds 1-4 all failed, which reaches the fix-and-review cap.\n";

test('acceptance: round-4 records with bare SHAs, an unparsed record, and a Low closing issue outside the board', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z', detailsUrl: null, startedAt: null, checkSuite: { workflowRun: null } };
  const board = replay({
    parent: (data) => { for (const number of [1476, 1479]) issueNode(data, number).labels.nodes.push({ name: 'tier:low' }); },
    pulls: (data) => {
      const { pr1491, pr1494, pr1499 } = data.repository;
      pr1491.comments.nodes.push(comment(`repo-harness acceptance record\nSubject: commit ${pr1491.headRefOid} (PR head adds a merge of main): PASS.\n`, '2026-11-02T22:00:00Z'));
      // Both close a tier:low item and #1460, which is outside the board, and both pass Required / CI.
      for (const pr of [pr1494, pr1499]) {
        pr.body += '\nCloses #1460\n';
        pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
      }
      pr1494.headRefOid = pr1494.commits.nodes[0].commit.oid = '5c5139981b0bc5a620e3b2cd0605d61e4c76991d';
      pr1494.comments.nodes.push(comment(ROUND_4_FAIL_1494, '2026-11-02T22:22:04Z'));
      pr1499.headRefOid = pr1499.commits.nodes[0].commit.oid = 'd1558fa061febe0f5f299f91a2c59ecd7d2d97f5';
      pr1499.comments.nodes.push(comment(ROUND_4_PASS_1499, '2026-11-02T22:31:58Z'));
    },
  });
  // #1494: the FAIL row parses, and the unread tier of #1460 withholds the Low path. #1499: the PASS row accepts.
  expect(board.pull_requests.map(pr => [pr.number, pr.acceptance.status, 'via' in pr.acceptance ? pr.acceptance.via : 'reason' in pr.acceptance ? pr.acceptance.reason : null])).toEqual([
    [1491, 'unknown', 'acceptance_record_unparsed'], [1494, 'not_accepted', null], [1499, 'not_accepted', null],
  ]);
  expect(evaluateBoardAttention(board).unevaluated.filter(entry => entry.subject === '#1491').map(entry => entry.rule)).toEqual(['A1', 'A15']);
});

// One round is one subject SHA: both reviews of a High round are rows of round 1 on one head (#1538).
test('acceptance: every record on the head counts, and one FAIL withholds acceptance', () => {
  const record = (sha: string, verdict: 'PASS' | 'FAIL') => `repo-harness acceptance record\n\n| Round | Role | Subject | Verdict |\n|---|---|---|---|\n| 1 | acceptor | ${sha} | ${verdict} |\n`;
  const board = replay({
    pulls: (data) => {
      const { pr1491, pr1494, pr1499 } = data.repository;
      // #1491 keeps its PASS on the head, but older comments exist outside the read.
      pr1491.comments.pageInfo.hasPreviousPage = true;
      pr1494.headRefOid = pr1494.commits.nodes[0].commit.oid = 'a'.repeat(40);
      pr1494.comments.nodes.push(comment(record('a'.repeat(40), 'PASS'), '2026-11-03T00:24:00Z'), comment(record('a'.repeat(40), 'PASS'), '2026-11-03T00:27:00Z'));
      pr1499.headRefOid = pr1499.commits.nodes[0].commit.oid = 'b'.repeat(40);
      pr1499.comments.nodes.push(comment(record('b'.repeat(40), 'FAIL'), '2026-11-03T00:24:00Z'), comment(record('b'.repeat(40), 'PASS'), '2026-11-03T00:27:00Z'));
    },
  });
  expect(board.pull_requests.map(pr => [pr.number, pr.acceptance])).toEqual([
    [1491, { status: 'unknown', reason: 'comments_truncated', evidence_url: null }],
    [1494, { status: 'not_accepted' }],
    [1499, { status: 'not_accepted' }],
  ]);
});

test('one hit for each rule that the recorded state does not trigger', () => {
  const later = new Date('2026-11-03T02:00:00Z');
  const plan = { protocol: 2, kind: 'repo-harness.plan', merge_order: [1475, 1476], holds: [], seat_limits: { worker: 3 } };
  const hook = 'src/cli/hook/mutation-guard.ts';
  const board = replay({
    now: later,
    hcVersion: '0.1.15',
    owners: (results) => { results.push({ path: hook, matched: false, ambiguous: false, owningCapabilityId: null }); },
    parent: (data) => {
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n`, '2026-11-02T23:00:00Z'));
      issueNode(data, 1475).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1491 head 20e2cbd2\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).comments.nodes.push(comment('repo-harness issue claim status\nClaim: x\nStatus: done\nPR: #1460 head 0123abcd\n', '2026-11-02T21:50:00Z'));
      issueNode(data, 1477).blockedBy.nodes.push({ number: 1490, state: 'CLOSED' });
      issueNode(data, 1478).blockedBy.nodes.push({ number: 1480, state: 'OPEN' });
      issueNode(data, 1480).blockedBy.nodes.push({ number: 1478, state: 'OPEN' });
      issueNode(data, 1476).labels.nodes.push({ name: 'tier:low' });
      issueNode(data, 1479).labels.nodes.push({ name: 'tier:medium' });
    },
    pulls: (data) => {
      const pr1499 = data.repository.pr1499;
      pr1499.baseRefName = 'main';
      pr1499.isDraft = false;
      pr1499.files = { totalCount: 1, nodes: [{ path: 'src/effects/terminal/task-session.ts', additions: 10, deletions: 2 }] };
      pr1499.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z', detailsUrl: null, startedAt: null, checkSuite: { workflowRun: null } });
      // #1494 (tier:medium #1479) changes a hook: R5.
      data.repository.pr1494.files.nodes.push({ path: hook });
      data.repository.pr1494.files.totalCount += 1;
      // A newer commit than the claim status on #1475, while its worker t13 reports done.
      data.repository.pr1491.commits.nodes[0].commit.committedDate = '2026-11-02T22:00:00Z';
    },
  });
  const hits = rules(board);
  for (const rule of ['A4', 'A5', 'A6', 'A8', 'R1', 'R3', 'R4', 'R5'] as const) expect(hits).toContain(rule);
  const findings = evaluateBoardAttention(board).findings;
  expect(findings.find(finding => finding.rule === 'A8')?.message).toBe(`hc client 0.1.15 is below the repo-harness floor ${HC_MIN_VERSION}; run hc update --version ${HC_MIN_VERSION}`);
  expect(findings.filter(finding => finding.rule === 'A6').map(finding => finding.issues)).toEqual([[1477, 1490], [1478, 1480]]);
  expect(findings.find(finding => finding.rule === 'R1')?.issues).toEqual([1477, 1478, 1479, 1480, 1481, 1482, 1483]);
  // R3: #1494 changes `.github/` for tier:medium #1479. #1499 (tier:low #1476) changes no hazard path. A tier:high item is no hit.
  expect(findings.filter(finding => finding.rule === 'R3').map(finding => [finding.pull_requests, finding.issues])).toEqual([[[1494], [1479]]]);
  const high = { ...board, items: board.items.map(item => (item.number === 1479 ? { ...item, tier: 'high' as const } : item)) };
  expect(rules(high)).not.toContain('R3');
  // A pull request without a complete file list is unevaluated, never a miss.
  const partial = evaluateBoardAttention({ ...board, pull_requests: board.pull_requests.map(pr => (pr.number === 1494 ? { ...pr, files: null } : pr)) });
  expect(partial.findings.map(finding => finding.rule)).not.toContain('R3');
  expect(partial.unevaluated.filter(entry => entry.rule === 'R3').map(entry => [entry.reason, entry.subject])).toEqual([['files_incomplete', '#1494']]);
  // A malformed hazard list fails at decode.
  const row = { id: 'ci-config', text: 'Changes CI.', path_visible: true, paths: ['.github/**'] };
  const list = (...hazards: object[]) => ({ hazards_version: 'repo-harness.review-hazards.v1', hazards });
  for (const [value, error] of [
    [{ ...list(row), hazards_version: 'repo-harness.review-hazards.v2' }, 'hazards_version'],
    [list(), 'hazards'],
    [list({ ...row, paths: undefined }), 'hazard fields'],
    [list({ ...row, path_visible: false }), 'hazard fields'],
    [list({ ...row, paths: [] }), 'ci-config paths'],
    [list({ ...row, paths: ['../x'] }), 'ci-config paths'],
    [list({ ...row, text: 'a | b' }), 'ci-config text'],
    [list(row, row), 'duplicate hazard id ci-config'],
  ] as const) expect(() => decodeReviewHazards(JSON.parse(JSON.stringify(value)))).toThrow(`review hazards invalid: ${error}`);
  // `**` matches zero or more whole segments, `*` stays inside one segment; the other hazards need a reviewer.
  expect(pathHazardHits(['.github/workflows/ci.yml', 'docs/.github/x', 'Dockerfile', 'ops/web/Dockerfile.dev', 'ops/api.Dockerfile', 'bun.lock', 'pkg/a/yarn.lock', 'bun.lock.bak', 'install.sh']))
    .toEqual([
      { hazard: 'ci-config', path: '.github/workflows/ci.yml' },
      { hazard: 'container-build', path: 'Dockerfile' }, { hazard: 'container-build', path: 'ops/web/Dockerfile.dev' }, { hazard: 'container-build', path: 'ops/api.Dockerfile' },
      { hazard: 'dependency', path: 'bun.lock' }, { hazard: 'dependency', path: 'pkg/a/yarn.lock' },
    ]);

  // A rule that cannot read its input lists the subject: no status time, no issue label, an issue or a claim PR off the board.
  const [blocked, done] = board.execution.status === 'observed' ? board.execution.terminals : [];
  const terminals = [{ ...blocked!, status_ms: null }, { ...done!, issue: 1460 }, { ...done!, address: 't9', issue: null }] as BoardTerminalV1[];
  expect(evaluateBoardAttention({ ...board, execution: { status: 'observed', terminals } }).unevaluated
    .filter(entry => ['A3', 'A4', 'A5'].includes(entry.rule)).map(entry => [entry.rule, entry.reason, entry.subject])).toEqual([
    ['A3', 'status_time_missing', 't1'], ['A4', 'issue_off_board', 't2'], ['A4', 'issue_label_missing', 't9'], ['A5', 'claim_pr_off_board', '#1477'],
  ]);
  // A9: a live seat of a merged pull request is reported; a finished one is not.
  const merged = evaluateBoardAttention({ ...board, pull_requests: board.pull_requests.map(pr => (pr.number === 1494 ? { ...pr, state: 'merged' as const } : pr)),
    execution: { status: 'observed', terminals: [{ ...done!, pr: 1494 }, { ...done!, address: 't9', pr: 1494, state: 'finished' }] as BoardTerminalV1[] } });
  expect(merged.findings.filter(finding => finding.rule === 'A9').map(finding => [finding.terminals, finding.pull_requests])).toEqual([[['t2'], [1494]]]);
});

test('R5 and the effective tier read the High list: board record-writing code is Medium on one PASS row; a hook change is High and needs two', () => {
  const [hook, boardWriter] = ['src/cli/hook/mutation-guard.ts', 'src/effects/board/review.ts'];
  const receipt = (subject_sha: string): ReviewPublishReceipt => ({
    protocol: 1, kind: 'repo-harness-review-publish-receipt', round: 1, subject_sha, risk_tier: 'medium', reviewer: { harness: 'codex', actual_model: null }, verdict: 'PASS', model_relation: 'different-family', summary: 'Reviewed.', findings: [],
  });
  const claimAt = '2026-11-02T21:01:00Z';
  // #1499 closes tier:medium #1476, changes `files` and has one claimed different-family PASS row of its head.
  const board = (files: string[], tier: string, incomplete: boolean) => replay({
    owners: (results) => { results.push(...files.filter(path => !results.some(entry => entry.path === path)).map(path => ({ path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    parent: (data) => { issueNode(data, 1476).labels.nodes.push({ name: tier }); },
    pulls: (data) => {
      const { pr1499 } = data.repository;
      pr1499.files = { totalCount: files.length + (incomplete ? 1 : 0), nodes: files.map(path => ({ path })) };
      pr1499.comments.nodes.push(comment(renderAcceptanceClaim(receipt(pr1499.headRefOid)), claimAt));
      pr1499.comments.nodes.push(comment(renderAcceptanceRecord(receipt(pr1499.headRefOid), `https://github.com/Ancienttwo/repo-harness/pull/1499#issuecomment-${Date.parse(claimAt)}`), '2026-11-02T22:00:00Z'));
    },
  });
  const view = (files: string[], tier = 'tier:medium', incomplete = false) => {
    const read = board(files, tier, incomplete);
    const pr = read.pull_requests.find(entry => entry.number === 1499)!;
    const attention = evaluateBoardAttention(read);
    return [pr.tier, pr.acceptance.status,
      ...attention.findings.filter(finding => finding.rule === 'R5' && finding.pull_requests.includes(1499)).map(finding => finding.message),
      ...attention.unevaluated.filter(entry => entry.rule === 'R5' && entry.subject?.startsWith('#1499') === true).map(entry => `${entry.reason}: ${entry.subject}`)];
  };
  expect(view([boardWriter])).toEqual(['medium', 'accepted']);
  expect(view([boardWriter, hook])).toEqual(['high', 'not_accepted', `#1499 changes ${hook} (hooks), a High signal, but #1476 is tier:medium`]);
  expect(view([hook], 'tier:high')).toEqual(['high', 'not_accepted']);
  // A change hazard path sets the High tier too; R3 names the label.
  expect(view(['.github/workflows/ci.yml'])).toEqual(['high', 'not_accepted']);
  // An incomplete file list can hide a High path: High, and R5 lists it as unevaluated.
  expect(view([boardWriter], 'tier:medium', true)).toEqual(['high', 'not_accepted', 'files_incomplete: #1499']);
});

test('acceptance disposition: a FAIL row is ignored only when every finding of its record is resolved for that record and subject', () => {
  const boardWriter = 'src/effects/board/review.ts';
  const base = 'https://github.com/Ancienttwo/repo-harness';
  const receipt = (subject_sha: string, verdict: 'PASS' | 'FAIL', round: number): ReviewPublishReceipt => ({
    protocol: 1, kind: 'repo-harness-review-publish-receipt', round, subject_sha, risk_tier: 'medium', reviewer: { harness: 'codex', actual_model: null }, verdict, model_relation: 'different-family', summary: 'Reviewed.',
    findings: verdict === 'PASS' ? [] : [
      { id: 'R1-1', severity: 'P2', path: 'a.ts', line: 1, evidence: 'e', fix: 'f' },
      { id: 'R1-2', severity: 'P2', path: 'b.ts', line: 2, evidence: 'e', fix: 'f' },
    ],
  });
  const failAt = '2026-11-02T22:00:00Z';
  const failUrl = `${base}/pull/1499#issuecomment-${Date.parse(failAt)}`;
  const projected = (dispositions: string[], mangleSecond = false) => {
    const read = replay({
      owners: (results) => { results.push({ path: boardWriter, matched: false, ambiguous: false, owningCapabilityId: null }); },
      parent: (data) => { issueNode(data, 1476).labels.nodes.push({ name: 'tier:medium' }); },
      pulls: (data) => {
        const { pr1499 } = data.repository;
        const head = pr1499.headRefOid;
        pr1499.files = { totalCount: 1, nodes: [{ path: boardWriter }] };
        const claimAt = '2026-11-02T21:01:00Z';
        const claimUrl = `${base}/pull/1499#issuecomment-${Date.parse(claimAt)}`;
        pr1499.comments.nodes.push(comment(renderAcceptanceClaim(receipt(head, 'PASS', 1)), claimAt));
        const failRecord = renderAcceptanceRecord(receipt(head, 'FAIL', 1), claimUrl);
        // A bullet marker outside the record shape makes the finding list unreadable.
        pr1499.comments.nodes.push(comment(mangleSecond ? failRecord.replace('- P2 R1-2', '* P2 R1-2') : failRecord, failAt));
        const passClaimAt = '2026-11-02T22:20:00Z';
        pr1499.comments.nodes.push(comment(renderAcceptanceClaim(receipt(head, 'PASS', 2)), passClaimAt));
        pr1499.comments.nodes.push(comment(renderAcceptanceRecord(receipt(head, 'PASS', 2), `${base}/pull/1499#issuecomment-${Date.parse(passClaimAt)}`), '2026-11-02T22:30:00Z'));
        dispositions.forEach((body, index) => pr1499.comments.nodes.push(comment(body, `2026-11-02T22:4${index}:00Z`)));
      },
    });
    return read;
  };
  const status = (dispositions: string[], mangleSecond = false) => projected(dispositions, mangleSecond).pull_requests.find(entry => entry.number === 1499)!.acceptance.status;
  const disposition = (findings: string, record = failUrl, subject = replay().pull_requests.find(entry => entry.number === 1499)!.head_sha) =>
    `repo-harness acceptance disposition\nRecord: ${record}\nSubject: ${subject}\nFindings: ${findings}\nDecision: ${base}/issues/2202#issuecomment-1\n`;
  expect(status([])).toBe('not_accepted');
  // The newest record of each harness, any subject: the two added records are codex rows, newer than the recorded codex one.
  expect(projected([]).pull_requests.find(entry => entry.number === 1499)!.review_records).toEqual({ status: 'observed', claude: '2026-11-02T20:52:14Z', codex: '2026-11-02T22:30:00Z', pi: null });
  expect(status([disposition('R1-1')])).toBe('not_accepted');
  expect(status([disposition('R1-1'), disposition('R1-2')])).toBe('accepted');
  expect(status([disposition('R1-1, R1-2')])).toBe('accepted');
  expect(status([disposition('R1-1')], true)).toBe('not_accepted');
  expect(status([disposition('R1-1, R1-2')], true)).toBe('not_accepted');
  expect(status([disposition('R1-1, R1-2', `${base}/pull/1499#issuecomment-7`)])).toBe('not_accepted');
  expect(status([disposition('R1-1, R1-2', failUrl, 'd'.repeat(40))])).toBe('not_accepted');
  // review_fail and A15 read the same test: the unresolved FAIL record of 22:00 is 89 min old, and a full disposition clears it.
  const a15 = (board: BoardV1) => [board.pull_requests.find(entry => entry.number === 1499)!.review_fail?.recorded_at ?? null,
    evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'A15').map(finding => finding.message.replace(/\(.*\)$/u, ''))];
  expect(a15(projected([disposition('R1-1')]))).toEqual([failAt, ['#1499 has a FAIL record on 23627c4f5 for 89 min and no new head ']]);
  expect(a15(projected([disposition('R1-1, R1-2')]))).toEqual([null, []]);
});

test('a rendered record with multiline finding values parses to its finding IDs', () => {
  const receipt: ReviewPublishReceipt = {
    protocol: 1, kind: 'repo-harness-review-publish-receipt', round: 1, subject_sha: 'a'.repeat(40), risk_tier: 'medium', reviewer: { harness: 'codex', actual_model: null }, verdict: 'FAIL', model_relation: 'different-family', summary: 'Reviewed.',
    findings: [
      { id: 'R1-1', severity: 'P2', path: 'a.ts', line: 1, evidence: 'first line\n  second line', fix: 'one\n\ntwo' },
      { id: 'R1-2', severity: 'P3', message: 'nit\ntext' },
    ],
  };
  expect(parseRecordFindings({ url: 'u', created_at: '2026-11-02T22:00:00Z', author_association: 'OWNER', body: renderAcceptanceRecord(receipt, 'x') })).toEqual(['R1-1', 'R1-2']);
  // The GitHub review body is not the record: it keeps the line breaks of a finding outside the diff.
  expect(reviewPayloadFromReceipt(receipt, new Map()).body).toContain('first line\n  second line');
});

test('a plan hold removes a PR from A1 and R4', () => {
  const green = { name: 'Required / CI', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-02T21:30:00Z', detailsUrl: null, startedAt: null, checkSuite: { workflowRun: null } };
  const findings = (holds: number[]) => evaluateBoardAttention(replay({
    now: new Date('2026-11-03T02:00:00Z'),
    owners: (results) => { results.push(...['a', 'b'].map(path => ({ path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    parent: (data) => {
      const plan = { protocol: 2, kind: 'repo-harness.plan', merge_order: [1475, 1476, 1479], holds: holds.map(issue => ({ issue, reason: 'held' })), seat_limits: { worker: 3 } };
      data.repository.issue.comments.nodes.push(comment(`repo-harness plan\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n`, '2026-11-02T23:00:00Z'));
      for (const number of [1476, 1479]) issueNode(data, number).labels.nodes.push({ name: 'tier:low' });
    },
    pulls: (data) => {
      for (const [pr, paths] of [[data.repository.pr1491, ['a', 'b']], [data.repository.pr1494, ['a']], [data.repository.pr1499, ['b']]] as const) {
        pr.files = { totalCount: paths.length, nodes: paths.map(path => ({ path, additions: 1, deletions: 0 })) };
        if (pr.number === 1491) continue;
        Object.assign(pr, { baseRefName: 'main', isDraft: false });
        pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(green);
      }
    },
  })).findings.filter(finding => ['A1', 'R4'].includes(finding.rule)).map(finding => [finding.rule, finding.pull_requests]);
  expect(findings([])).toEqual([['R4', [1494]], ['R4', [1499]]]);
  expect(findings([1475, 1479])).toEqual([['R4', [1499]]]);
});

test('rules A12 to A18 fire past their threshold with their message, not at it, and skip a held pull request or an unread input', () => {
  const recorded = replay();
  const now = Date.parse(recorded.observed_at);
  const at = (ms: number) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const block = { protocol: 2, kind: 'repo-harness.plan', merge_order: [], holds: [], seat_limits: { worker: 3 } } as const;
  const plan = { status: 'observed', comment_url: 'https://github.com/plan', created_at: recorded.observed_at, revision: 1, block } as const;
  // The recorded questions of #1475 and #1479 are cleared, so each case starts from no A12 to A18 finding.
  const base: BoardV1 = { ...recorded, plan, execution: { status: 'observed', terminals: [] },
    items: recorded.items.map(entry => ({ ...entry, open_questions: { status: 'observed', questions: [] } })) };
  const item = (patch: Partial<BoardItemV1>, board = base): BoardV1 => ({ ...board, items: board.items.map(entry => entry.number === 1477 ? { ...entry, ...patch } : entry) });
  // #1494 closes #1479; the recorded draft is made ready for review, which A14 and A18 read.
  const pr = (patch: Partial<BoardPullRequestV1>, board = base): BoardV1 => ({ ...board, pull_requests: board.pull_requests.map(entry => entry.number === 1494 ? { ...entry, is_draft: false, ...patch } : entry) });
  const held = (board: BoardV1): BoardV1 => ({ ...board, plan: { ...plan, block: { ...block, holds: [{ issue: 1479, reason: 'held' }] } } });
  const rule = /^A1[2-8]$/u;
  const messages = (board: BoardV1) => evaluateBoardAttention(board).findings.filter(finding => rule.test(finding.rule)).map(finding => `${finding.rule} ${finding.message}`);
  const skipped = (board: BoardV1) => evaluateBoardAttention(board).unevaluated.filter(entry => rule.test(entry.rule)).map(entry => [entry.rule, entry.reason, entry.subject]);
  const sha = base.pull_requests.find(entry => entry.number === 1494)!.head_sha.slice(0, 9);
  const url = 'https://github.com/Ancienttwo/repo-harness/issues/1477#issuecomment-1';
  const terminal = (status_ms: number | null) => ({ address: 't1', name: null, agent: null, state: 'live', status: 'idle', status_kind: null, status_msg: null, status_ms, turn: 1, branch: null,
    seat_status: 'observed', seat: 'worker', issue: 1477, pr: null }) as BoardTerminalV1;
  const readiness = (code: string) => ({ ...base.pull_requests.find(entry => entry.number === 1494)!.merge_readiness!, ready: false, blockers: [{ code, attention_owner: 'agent' }] }) as PullRequestReadinessV2;
  expect(messages(base)).toEqual([]);

  const cases: readonly [string, (age: number) => BoardV1, number, string][] = [
    ['A12', age => item({ claim: { status: 'active', url, created_at: at(age), role: 'writer' } }), A12_NO_PR_MS, `#1477 has a writer claim for 121 min, no PR and no claim status (${url})`],
    ['A13', age => ({ ...base, execution: { status: 'observed', terminals: [terminal(now - age)] } }), A13_IDLE_MS, 'worker t1 is idle for 11 min and #1477 has no PR'],
    ['A14', age => pr({ required_check: { status: 'failure', completed_at: at(age), contexts: [] } }), A14_RED_MS, `#1494 has a failed required check on ${sha} for 31 min`],
    ['A15', age => pr({ review_fail: { url, recorded_at: at(age) } }), A15_FAIL_MS, `#1494 has a FAIL record on ${sha} for 61 min and no new head (${url})`],
    ['A16', age => item({ open_questions: { status: 'observed', questions: [{ url, created_at: at(age) }] } }), A16_QUESTION_MS, `#1477 has a question to the coordinator with no answer for 16 min (${url})`],
    ['A17', age => item({ claim_status: { status_kind: 'observed', url, created_at: at(age), status: 'blocked: waits for #1476', pr: null, head_sha: null } }), A17_BLOCKED_MS, `#1477 claim status is blocked for 16 min (${url})`],
  ];
  for (const [id, board, threshold, message] of cases) {
    expect([id, messages(board(threshold + MIN))]).toEqual([id, [`${id} ${message}`]]);
    expect([id, messages(board(threshold))]).toEqual([id, []]);
  }
  // Each question on one thread is its own finding key; a finding with no comments keeps the key of rule and subjects.
  const second = 'https://github.com/Ancienttwo/repo-harness/issues/1477#issuecomment-2';
  const asked = item({ open_questions: { status: 'observed', questions: [{ url, created_at: at(A16_QUESTION_MS + MIN) }, { url: second, created_at: at(A16_QUESTION_MS + MIN) }] } });
  expect(evaluateBoardAttention(asked).findings.filter(finding => finding.rule === 'A16').map(attentionFindingKey))
    .toEqual([JSON.stringify(['A16', [1477], [], [], [url]]), JSON.stringify(['A16', [1477], [], [], [second]])]);
  const a17 = evaluateBoardAttention(cases[5]![1](A17_BLOCKED_MS + MIN)).findings.find(finding => finding.rule === 'A17')!;
  expect(attentionFindingKey(a17)).toBe(JSON.stringify(['A17', [1477], [], []]));
  expect(messages(pr({ merge_readiness: readiness('not_mergeable') }))).toEqual(['A18 #1494 does not merge into feat/1475-hc-transport; the head owner merges main into the branch']);
  expect(messages(pr({ merge_readiness: readiness('checks_failed') }))).toEqual([]);

  // A held pull request gives no A14, A15 or A18; a held item gives no A17.
  const red = pr({ required_check: { status: 'failure', completed_at: at(A14_RED_MS + MIN), contexts: [] }, review_fail: { url, recorded_at: at(A15_FAIL_MS + MIN) }, merge_readiness: readiness('not_mergeable') });
  expect(messages(red).map(line => line.slice(0, 3))).toEqual(['A14', 'A15', 'A18']);
  expect(messages(held(red))).toEqual([]);
  const blocked = (board: BoardV1) => item({ claim_status: { status_kind: 'observed', url, created_at: at(A17_BLOCKED_MS + MIN), status: 'blocked', pr: null, head_sha: null } }, board);
  expect(messages(blocked({ ...base, plan: { ...plan, block: { ...block, holds: [{ issue: 1477, reason: 'held' }] } } }))).toEqual([]);
  // An unread input is listed as unevaluated and never fires.
  expect(skipped(blocked({ ...base, plan: { status: 'absent', truncated: false } }))).toEqual([['A17', 'plan_absent', '#1477']]);
  const truncated = item({ claim: { status: 'unknown' }, open_questions: { status: 'unknown' } });
  expect([messages(truncated), skipped(truncated)]).toEqual([[], [['A12', 'comments_truncated', '#1477'], ['A16', 'comments_truncated', '#1477']]]);
  expect(skipped({ ...base, execution: { status: 'observed', terminals: [terminal(null)] } })).toEqual([['A13', 'status_time_missing', 't1']]);
  expect(skipped(pr({ merge_readiness: null, merge_readiness_observed_at: null }))).toEqual([['A18', 'readiness_missing', '#1494']]);
});

test('A19 fires for a done review seat whose pull request has no record of its harness after the seat status time', () => {
  const recorded = replay();
  const now = Date.parse(recorded.observed_at);
  const MIN = 60_000;
  const done = now - A13_IDLE_MS - MIN;
  const iso = (ms: number) => new Date(ms).toISOString();
  const seat = (patch: Json = {}) => ({ address: 't9', name: null, agent: 'codex', state: 'live', status: 'done', status_kind: null, status_msg: null, status_ms: done, turn: 1, branch: null,
    seat_status: 'observed', seat: 'gatekeeper', issue: null, pr: 1494, ...patch }) as BoardTerminalV1;
  const none = { status: 'observed', claude: null, codex: null, pi: null } as const;
  const board = (terminal: BoardTerminalV1, review_records: BoardPullRequestV1['review_records'] = none): BoardV1 => ({ ...recorded, execution: { status: 'observed', terminals: [terminal] },
    pull_requests: recorded.pull_requests.map(entry => (entry.number === 1494 ? { ...entry, review_records } : entry)) });
  const a19 = (value: BoardV1) => {
    const attention = evaluateBoardAttention(value);
    return [attention.findings.filter(finding => finding.rule === 'A19').map(finding => [finding.message, finding.pull_requests, finding.terminals]),
      attention.unevaluated.filter(entry => entry.rule === 'A19').map(entry => [entry.reason, entry.subject])];
  };
  const fired = [['review seat t9 is done for 11 min and #1494 has no record from it; read the pane and publish', [1494], ['t9']]];
  expect(a19(board(seat()))).toEqual([fired, []]);
  // A record of the seat's harness after its status time stops the finding; an older one, or a newer one of the other harness, does not.
  expect(a19(board(seat(), { ...none, codex: iso(done + MIN) }))).toEqual([[], []]);
  expect(a19(board(seat(), { ...none, codex: iso(done - MIN) }))).toEqual([fired, []]);
  expect(a19(board(seat(), { ...none, claude: iso(done + MIN) }))).toEqual([fired, []]);
  expect(a19(board(seat({ seat: 'reviewer', agent: 'claude-code' }), { ...none, claude: iso(done + MIN) }))).toEqual([[], []]);
  // A working seat, or a seat at the threshold, does not fire.
  expect(a19(board(seat({ status: 'working' })))).toEqual([[], []]);
  expect(a19(board(seat({ status_ms: now - A13_IDLE_MS })))).toEqual([[], []]);
  // An unread input is listed as unevaluated and never fires.
  expect(a19(board(seat({ pr: null })))).toEqual([[], [['pr_label_missing', 't9']]]);
  expect(a19(board(seat({ pr: 9999 })))).toEqual([[], [['pr_off_board', 't9']]]);
  expect(a19(board(seat({ status_ms: null })))).toEqual([[], [['status_time_missing', 't9']]]);
  expect(a19(board(seat({ agent: null })))).toEqual([[], [['harness_unknown', 't9']]]);
  expect(a19(board(seat(), { status: 'unknown', reason: 'comments_truncated' }))).toEqual([[], [['comments_truncated', '#1494']]]);
});

test('A20 fires for a required check that is pending or missing past the threshold after the head commit', () => {
  const recorded = replay();
  const MIN = 60_000;
  const at = (age: number) => new Date(Date.parse(recorded.observed_at) - age).toISOString();
  const contexts = [{ name: 'Required / CI', status: 'pending' }, { name: 'lint', status: 'success' }, { name: 'build', status: 'missing' }] as const;
  const board = (patch: Partial<BoardPullRequestV1>, held = false): BoardV1 => ({ ...recorded,
    plan: held ? { status: 'observed', comment_url: 'https://github.com/plan', created_at: recorded.observed_at, revision: 1,
      block: { protocol: 2, kind: 'repo-harness.plan', merge_order: [], holds: [{ issue: 1479, reason: 'held' }], seat_limits: { worker: 3 } } } : recorded.plan,
    pull_requests: recorded.pull_requests.map(entry => (entry.number === 1494 ? { ...entry, is_draft: false, ...patch } : entry)) });
  const a20 = (value: BoardV1) => {
    const attention = evaluateBoardAttention(value);
    return [attention.findings.filter(finding => finding.rule === 'A20').map(finding => [finding.message, finding.pull_requests, finding.priority, finding.route]),
      attention.unevaluated.filter(entry => entry.rule === 'A20').map(entry => [entry.reason, entry.subject])];
  };
  for (const status of ['pending', 'missing'] as const) {
    const check = { status, contexts } as const;
    const fired = [[`#1494 required check is ${status} for 61 min after its head commit: Required / CI, build`, [1494], 'P2', 'orchestrator']];
    expect(a20(board({ required_check: check, head_committed_at: at(A20_STUCK_MS + MIN) }))).toEqual([fired, []]);
    expect(a20(board({ required_check: check, head_committed_at: at(A20_STUCK_MS) }))).toEqual([[], []]);
    // A draft and a held pull request do not fire.
    expect(a20(board({ required_check: check, head_committed_at: at(A20_STUCK_MS + MIN), is_draft: true }))).toEqual([[], []]);
    expect(a20(board({ required_check: check, head_committed_at: at(A20_STUCK_MS + MIN) }, true))).toEqual([[], []]);
  }
  expect(a20(board({ required_check: { status: 'success', completed_at: at(MIN), contexts }, head_committed_at: at(A20_STUCK_MS + MIN) }))).toEqual([[], []]);
  expect(a20(board({ required_check: { status: 'unavailable', reason: 'protection_unreadable' }, head_committed_at: at(A20_STUCK_MS + MIN) })))
    .toEqual([[], [['protection_unreadable', '#1494']]]);
});

test('R2 counts every shared file, the changelog fragments included', () => {
  const r2 = (first: string[], second: string[]) => evaluateBoardAttention(replay({
    owners: (results) => { results.push(...[...first, ...second].map(path => ({ path, matched: false, ambiguous: false, owningCapabilityId: null }))); },
    pulls: (data) => {
      for (const [pr, paths] of [[data.repository.pr1494, first], [data.repository.pr1499, second]] as const) pr.files = { totalCount: paths.length, nodes: paths.map(path => ({ path })) };
    },
  })).findings.filter(finding => finding.rule === 'R2').map(finding => finding.message);
  // Each PR writes its own fragment path, so one shared fragment path means two PRs for one issue.
  expect(r2(['docs/changelog.d/2660.changed.md'], ['docs/changelog.d/2660.changed.md']))
    .toEqual(['#1494 and #1499 both change docs/changelog.d/2660.changed.md with no dependency edge']);
  expect(r2(['docs/changelog.d/2660.changed.md', 'src/a.ts'], ['docs/changelog.d/2660.changed.md', 'src/a.ts']))
    .toEqual(['#1494 and #1499 both change docs/changelog.d/2660.changed.md, src/a.ts with no dependency edge']);
});

// A fake hc for the watcher: every call is logged; `get` answers from FAKE_TERMINALS, `wait` from FAKE_WAITS by address.
const WATCH_HC = `#!${process.execPath}
const { appendFileSync } = require('fs');
const args = process.argv.slice(2);
appendFileSync(process.env.HC_LOG, JSON.stringify(args) + '\\n');
const terminals = JSON.parse(process.env.FAKE_TERMINALS);
const address = args.at(-1);
const out = value => console.log(JSON.stringify(value));
if (args[0] === 'get') {
  // FAKE_FINISH_AT: the address finishes at its nth get call.
  const finishAt = JSON.parse(process.env.FAKE_FINISH_AT || '{}')[address];
  const gets = require('fs').readFileSync(process.env.HC_LOG, 'utf8').split('\\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call[0] === 'get' && call.at(-1) === address).length;
  const killed = require('fs').readFileSync(process.env.HC_LOG, 'utf8').split('\\n').filter(Boolean).map(line => JSON.parse(line)).some(call => call[0] === 'kill' && call.at(-1) === address);
  out({ address, state: killed || (finishAt && gets >= finishAt) ? 'finished' : 'live', turn: 1, labels: { 'repo-harness.seat': 'x' }, ...terminals[address] });
}
else if (args[0] === 'send' && process.env.FAKE_SEND_FAIL) { process.stderr.write(JSON.stringify({ error: { kind: 'blocked', message: 'blocked' } })); process.exit(9); }
else if (args[0] === 'send') out({ started: true, turn: 2 });
else if (args[0] === 'read') out(JSON.parse(process.env.FAKE_READ));
else if (args[0] === 'kill') out({ address, state: 'finished', turn: 1, labels: { 'repo-harness.seat': 'x' } });
else if (args[0] === 'rm' && process.env.FAKE_RM_FAIL) { process.stderr.write(JSON.stringify({ error: { kind: 'blocked', message: 'rm failed' } })); process.exit(9); }
else if (args[0] === 'rm') out({ removed: address });
else if (args[0] === 'wait') out({ terminal: address, turn: 2, ...JSON.parse(process.env.FAKE_WAITS)[address] });
// As the live core: ls --label keeps the rows whose labels carry every pair.
else if (args[0] === 'ls') out({ terminals: JSON.parse(process.env.FAKE_LS).filter(row => args.every((arg, at) => args[at - 1] !== '--label'
  || (terminals[row.address]?.labels ?? {})[arg.slice(0, arg.indexOf('='))] === arg.slice(arg.indexOf('=') + 1))) });
else if (args[0] === 'run') out({ address: 't20', state: 'live' });
else process.exit(2);
`;

function watchHc(env: Json = {}) {
  const root = tmpWorkspace('board-watch'); roots.push(root);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/hc'), WATCH_HC); chmodSync(join(root, 'bin/hc'), 0o755);
  const log = join(root, 'hc.log');
  writeFileSync(log, '');
  const options = { env: { PATH: `${join(root, 'bin')}:/bin:/usr/bin`, HC_LOG: log, FAKE_TERMINALS: '{}', FAKE_WAITS: '{}', FAKE_LS: '[]',
    ...Object.fromEntries(Object.entries(env).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])) } };
  return { root, options, host: attentionHostPorts(options), calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]) };
}

test('watch window: idle sends at once, blocked waits, working sends at window end, and the advisor cap reads all repository logs', async () => {
  const board = replay();
  const seat = (address: string, seatName: string, status: string | null) =>
    ({ address, name: null, agent: null, state: 'live', status, status_kind: null, status_msg: null, status_ms: null, turn: 1, branch: null, seat_status: 'observed', seat: seatName, issue: null, pr: null }) as BoardTerminalV1;
  const terminals = [seat('t1', 'worker', 'working'), seat('t3', 'orchestrator', 'idle'), seat('t6', 'orchestrator', 'blocked'),
    seat('t7', 'orchestrator', 'blocked'), seat('t8', 'orchestrator', 'working'), seat('t9', 'advisor', 'done'), seat('t10', 'orchestrator', 'blocked'),
    seat('t11', 'orchestrator', 'blocked'), seat('t12', 'orchestrator', 'blocked')];
  const watched = { ...board, execution: { status: 'observed', terminals } } as BoardV1;
  const hc = watchHc({
    // `get` at the window end: t6 is still blocked, t10 became idle, t11 is finished (its program exited), and t12 finishes at its third get: the wait's address check, the post-wait check, then the window end.
    FAKE_TERMINALS: { t3: {}, t6: { status: { state: 'blocked' } }, t7: {}, t8: {}, t9: {}, t10: { status: { state: 'idle' } },
      t11: { state: 'finished', status: { state: 'blocked' } }, t12: { status: { state: 'blocked' } } },
    FAKE_FINISH_AT: { t12: 3 },
    // The live hc 0.1.18 wait lines. A live terminal that stopped working ends the wait with reason `status` (t7 idle, t6 and t10 blocked);
    // a program exit ends it with reason `exit` and an exit code (t11).
    FAKE_WAITS: { t6: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] },
      t7: { ended: true, reason: 'status', status: 'idle', exit_code: null, signal: null, children: [] },
      t10: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] },
      t11: { ended: true, reason: 'exit', status: null, exit_code: 0, signal: null, children: [] },
      t12: { ended: true, reason: 'status', status: 'blocked', exit_code: null, signal: null, children: [] } },
  });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  expect(logPath).toBe(join(hc.root, 'board/attention-1186405141-1474.jsonl'));
  // Seven advisor wakes across two parents in the last 24 hours, one 25 hours ago.
  const start = REPLAY_NOW.getTime();
  mkdirSync(join(hc.root, 'board'));
  const otherLogPath = attentionLogPath(1186405141, 1475, { REPO_HARNESS_HOME: hc.root });
  const history = [...Array.from({ length: 7 }, (_, at) => start - (at % 4 + 1) * 3_600_000), start - 25 * 3_600_000].map((time, at) => ({
    at: new Date(time).toISOString(), window: String(time), parent: at < 4 ? 1474 : 1475,
    kind: 'send', route: 'advisor', terminal: 't9', rules: ['R2'], outcome: 'sent', detail: null,
  }));
  writeFileSync(logPath, history.slice(0, 4).map(record => JSON.stringify(record)).join('\n') + '\n');
  writeFileSync(otherLogPath, history.slice(4).map(record => JSON.stringify(record)).join('\n') + '\n');
  writeFileSync(attentionLogPath(11864051410, 1474, { REPO_HARNESS_HOME: hc.root }), history.map(record => JSON.stringify(record)).join('\n') + '\n');
  let clock = start;
  const slept: number[] = [];
  const window = () => runAttentionWindow({ parent: 1474, deliver: true, log_path: logPath, collect: () => watched, host: hc.host,
    now: () => new Date(clock), sleep: async (ms) => { slept.push(ms); clock += ms; } });

  await window();
  expect(slept).toEqual([WINDOW_WITH_WORKERS_MS]);
  // One line per seat terminal: all findings of its route in this window.
  // Each entry carries the priority of its finding: the three A16 findings are P1, so they come first; A7 and A10 are P2, so they keep the rule order of `evaluateBoardAttention`.
  const questions = 'P1 A16: #1475 has a question to the coordinator with no answer for 286 min (https://github.com/Ancienttwo/repo-harness/issues/1475#issuecomment-6585298933); '
    + 'P1 A16: #1479 has a question to the coordinator with no answer for 282 min (https://github.com/Ancienttwo/repo-harness/issues/1479#issuecomment-6585387749); '
    + 'P1 A16: #1479 has a question to the coordinator with no answer for 273 min (https://github.com/Ancienttwo/repo-harness/issues/1479#issuecomment-6585624819); ';
  const orchestrator = `[rh-attention] #1474 ${questions}P2 A7: the daily full run is failure (https://github.com/Ancienttwo/repo-harness/actions/runs/41358255043) and no CI repair issue is open; P2 A10: #1491 is of unknown tier (counted as High) and has no Claude review of 20e2cbd21; start the Claude reviewer seat`;
  expect(hc.calls().filter(args => args[0] !== 'get')).toEqual([
    ['send', '--json', '--', 't3', orchestrator],
    ['send', '--json', '--', 't9', expect.stringMatching(/^\[rh-attention\] #1474 P2 R2: #1494 and #1499 both change .+ with no dependency edge$/u)],
    ['wait', '--json', '--timeout', '900', '--', 't6'],
    ['wait', '--json', '--timeout', '900', '--', 't7'],
    ['send', '--json', '--', 't7', orchestrator],
    ['wait', '--json', '--timeout', '900', '--', 't10'],
    ['wait', '--json', '--timeout', '900', '--', 't11'],
    ['wait', '--json', '--timeout', '900', '--', 't12'],
    ['send', '--json', '--', 't10', orchestrator],
    ['send', '--json', '--', 't8', orchestrator],
  ]);
  const records = () => readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(4).map(line => JSON.parse(line));
  expect(records().filter(record => record.kind === 'send').map(record => [record.terminal, record.outcome, record.at])).toEqual([
    ['t3', 'sent', REPLAY_NOW.toISOString()], ['t9', 'sent', REPLAY_NOW.toISOString()], ['t7', 'sent', REPLAY_NOW.toISOString()],
    ['t11', 'terminal_ended', REPLAY_NOW.toISOString()],
    ['t6', 'skipped_blocked', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()], ['t10', 'sent', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
    ['t12', 'terminal_ended', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
    ['t8', 'sent', new Date(start + WINDOW_WITH_WORKERS_MS).toISOString()],
  ]);
  expect(records().filter(record => record.kind === 'finding').map(record => record.rule)).toEqual(['A7', 'A10', 'A16', 'A16', 'A16', 'R2']);

  await runAttentionWindow({ parent: 1475, deliver: true, log_path: otherLogPath, collect: () => ({ ...watched, parent: { ...watched.parent, number: 1475 } }), host: hc.host,
    now: () => new Date(clock), sleep: async () => {} });
  const otherRecords = readFileSync(otherLogPath, 'utf8').split('\n').filter(Boolean).slice(4).map(line => JSON.parse(line));
  expect(otherRecords.filter(record => record.kind === 'skip').map(record => [record.route, record.reason])).toEqual([['advisor', 'advisor_daily_cap']]);
  expect(otherRecords.filter(record => record.kind === 'send' && record.route === 'orchestrator' && record.outcome === 'sent')).toHaveLength(4);
  expect(hc.calls().filter(args => args[0] === 'send' && args.at(-2) === 't9')).toHaveLength(1);

  // The next window: the advisor has eight wakes in 24 hours, and no worker runs, so the window is 60 minutes.
  terminals[0] = { ...terminals[0]!, state: 'finished' };
  await window();
  expect(slept.at(-1)).toBe(WINDOW_WITHOUT_WORKERS_MS);
  expect(records().filter(record => record.kind === 'skip').map(record => [record.route, record.reason])).toEqual([['advisor', 'advisor_daily_cap']]);
  // Without observed seat terminals, the skip names the board's execution reason.
  expect(planAttentionDeliveries({ ...board, execution: { status: 'unavailable', reason: 'no_seat_terminals' } }, evaluateBoardAttention(watched), 0).skipped)
    .toEqual([{ route: 'orchestrator', reason: 'no_seat_terminals' }, { route: 'advisor', reason: 'no_seat_terminals' }]);
});

test('watch window sends a finding once to each seat terminal until its subject changes, and again when a send failed or it came back', async () => {
  const board = replay();
  const seat = (address: string, seatName: string) =>
    ({ address, name: null, agent: null, state: 'live', status: 'idle', status_kind: null, status_msg: null, status_ms: null, turn: 1, branch: null, seat_status: 'observed', seat: seatName, issue: null, pr: null }) as BoardTerminalV1;
  const watched = { ...board, execution: { status: 'observed', terminals: [seat('t3', 'orchestrator'), seat('t4', 'orchestrator'), seat('t9', 'advisor')] } } as BoardV1;
  const hc = watchHc({ FAKE_TERMINALS: { t3: {}, t4: {}, t9: {} } });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  let failT4 = true;
  const host = { ...hc.host, send: (terminal: string, text: string) =>
    failT4 && terminal === 't4' ? { status: 'failed' as const, reason: 'send_failed', detail: 'blocked' } : hc.host.send(terminal, text) };
  let sent: AttentionSentV1 = new Map();
  const window = async (collected: BoardV1) => {
    sent = await runAttentionWindow({ parent: 1474, deliver: true, log_path: logPath, sent, collect: () => collected, host, now: () => REPLAY_NOW, sleep: async () => {} });
    const sends = hc.calls().filter(args => args[0] === 'send').map(args => args.at(-2));
    writeFileSync(join(hc.root, 'hc.log'), '');
    const logged = records().filter(record => record.kind === 'send').slice(logIndex);
    logIndex += logged.length;
    expect(logged.filter(record => record.outcome === 'sent').map(record => record.terminal)).toEqual(sends);
    return logged.map(record => [record.terminal, record.outcome, record.rules]);
  };
  const records = () => readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const findings = () => records().filter(record => record.kind === 'finding');
  let logIndex = 0;

  // Window 1: the send to t4 fails, so only t3 and t9 hold their findings.
  const orchestratorRules = ['A7', 'A10', 'A16', 'A16', 'A16'];
  expect(await window(watched)).toEqual([['t3', 'sent', orchestratorRules], ['t4', 'send_failed', orchestratorRules], ['t9', 'sent', ['R2']]]);
  failT4 = false;
  expect(await window(watched)).toEqual([['t4', 'sent', orchestratorRules]]);
  // Window 3: no new finding, so no send and no skip; the log still holds each finding of each window.
  expect(await window(watched)).toEqual([]);
  expect(findings().map(record => record.rule)).toEqual(Array(3).fill([...orchestratorRules, 'R2']).flat());
  expect(records().filter(record => record.kind === 'skip')).toEqual([]);
  // An open finding that the advisor holds uses no advisor wake and makes no cap skip.
  expect(planAttentionDeliveries(watched, evaluateBoardAttention(watched), 8, sent).skipped).toEqual([]);
  // A finding with a new subject is new; the finding that stays is not in its message.
  const attention = evaluateBoardAttention(watched);
  const moved = { ...attention, findings: attention.findings.map(finding => finding.rule === 'A10' ? { ...finding, pull_requests: [...finding.pull_requests, 1500] } : finding) };
  expect(planAttentionDeliveries(watched, moved, 0, sent).deliveries.map(delivery => [delivery.terminal, delivery.rules])).toEqual([['t3', ['A10']], ['t4', ['A10']]]);
  // A7 is gone in window 4 and back in window 5: it is new again.
  expect(await window({ ...watched, daily_run: { ...watched.daily_run, conclusion: 'success' } } as BoardV1)).toEqual([]);
  expect(await window(watched)).toEqual([['t3', 'sent', ['A7']], ['t4', 'sent', ['A7']]]);
  // A slot that keeps no open key leaves the map: t1 holds one key of an earlier window, and no finding is open for it now.
  sent = new Map([...sent, ['orchestrator t1', new Set([JSON.stringify(['A99', [], [], []])])]]);
  expect(await window(watched)).toEqual([]);
  expect(sent.has('orchestrator t1')).toBe(false);
  expect([...sent.values()].every(keys => keys.size > 0)).toBe(true);
});

test('watch window skips a provider 5xx and resumes at the next window', async () => {
  const hc = watchHc({});
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
  const delays: number[] = [];
  let reads = 0;
  const longMessage = `gh: ${'x'.repeat(350)} (HTTP 504)`;
  const input = { parent: 1474, deliver: false, log_path: logPath, host: hc.host, now: () => REPLAY_NOW,
    sleep: async (ms: number) => { delays.push(ms); }, collect: () => {
      if (reads++ === 0) readGhJson({ repo_root: hc.root, gh_runner: () => ({ status: 1, stdout: '', stderr: longMessage }) }, ['api', 'graphql']);
      return replay();
    } };
  try {
    await runAttentionWindow(input);
    expect(stderr).toHaveBeenCalledTimes(1);
    const expectedMessage = `gh api graphql failed: ${longMessage}`.slice(0, 300);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0])).message).toBe(expectedMessage);
    const logLines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(logLines).toHaveLength(1);
    expect(JSON.parse(logLines[0]!).message).toBe(expectedMessage);
    await runAttentionWindow(input);
    expect(reads).toBe(2);
    expect(delays[0]).toBe(WINDOW_WITH_WORKERS_MS);
    await runAttentionWindow({ ...input, collect: () => readGhJson({ repo_root: hc.root, gh_runner: () => ({ status: 1, stdout: '', stderr: 'gh: HTTP 504' }) }, ['api', 'graphql']) as BoardV1 });
    expect(JSON.parse(String(stderr.mock.calls[1]?.[0])).message).toContain('gh: HTTP 504');
    // A gh call that a signal or the call timeout ended has no exit status: it is short availability and skips the window.
    const endedWith = (extra: { readonly signal?: NodeJS.Signals; readonly error?: Error }) => () =>
      readGhJson({ repo_root: hc.root, gh_runner: () => ({ status: null, stdout: '', stderr: '', ...extra }) }, ['api', 'graphql']) as BoardV1;
    const timedOut = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
    for (const extra of [{ signal: 'SIGKILL' as const }, { error: timedOut }]) {
      try { endedWith(extra)(); throw new Error('expected failure'); } catch (error) {
        expect(error).toBeInstanceOf(BoardCollectError);
        expect((error as BoardCollectError).httpStatus).toBeNull();
        expect((error as BoardCollectError).endedWithoutExit).toBe(true);
      }
    }
    const ended = endedWith({ signal: 'SIGKILL' });
    await runAttentionWindow({ ...input, collect: ended });
    expect(stderr).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(stderr.mock.calls[2]?.[0])).message).toContain('exit null');
    const errors = readFileSync(logPath, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line)).filter(record => record.kind === 'error');
    expect(errors).toHaveLength(3);
    expect(errors[2]!.message).toContain('exit null');
    expect(delays.at(-1)).toBe(WINDOW_WITH_WORKERS_MS);
    // gh that never started (a launch error such as ENOENT) has no exit status and no signal: the loop still ends with exit 1.
    const launch = endedWith({ error: Object.assign(new Error('spawnSync /nonexistent/gh ENOENT'), { code: 'ENOENT' }) });
    try { launch(); throw new Error('expected failure'); } catch (error) {
      expect(error).toBeInstanceOf(BoardCollectError);
      expect((error as BoardCollectError).endedWithoutExit).toBe(false);
    }
    const skips = delays.length;
    await expect(runAttentionWindow({ ...input, collect: launch })).rejects.toBeInstanceOf(BoardCollectError);
    expect(delays).toHaveLength(skips);
    expect(stderr).toHaveBeenCalledTimes(3);
    for (const [message, status] of [['gh: HTTP 403', 403], ['gh: server says HTTP 503 (HTTP 403)', 403], ['HTTP 403: forbidden', 403], ['gh: server says HTTP 503', null], ['gh failed', null]] as const) {
      const collect = () => readGhJson({ repo_root: hc.root, gh_runner: () => ({ status: 1, stdout: '', stderr: message }) }, ['api', 'graphql']) as BoardV1;
      try { collect(); throw new Error('expected failure'); } catch (error) {
        expect(error).toBeInstanceOf(BoardCollectError);
        expect((error as BoardCollectError).httpStatus).toBe(status);
        expect((error as BoardCollectError).endedWithoutExit).toBe(false);
      }
      await expect(runAttentionWindow({ ...input, collect })).rejects.toBeInstanceOf(BoardCollectError);
    }
    expect(stderr).toHaveBeenCalledTimes(3);
  } finally { stderr.mockRestore(); }
});

test('watch service: --watch refuses a terminal without the service labels; start runs one watcher; doctor reads the labels', () => {
  const labels = { 'repo-harness.service': 'attention', 'repo-harness.repository': '1186405141', 'repo-harness.parent': '1503' };
  const inside = watchHc({ HC_TERMINAL_ID: 't5', FAKE_TERMINALS: { t5: { labels } } });
  expect(serviceTerminalRepository(1503, inside.host)).toBe(1186405141);
  expect(() => serviceTerminalRepository(1504, inside.host)).toThrow('does not carry the repository and parent #1504 labels');
  expect(() => serviceTerminalRepository(1503, watchHc({ HC_TERMINAL_ID: 't5' }).host)).toThrow('terminal t5 has no attention service label');
  expect(() => serviceTerminalRepository(1503, watchHc().host)).toThrow('HC_TERMINAL_ID is not set');

  const start = (ls: Json[]) => {
    const hc = watchHc({ FAKE_LS: ls, FAKE_TERMINALS: { t5: { labels } } });
    return [startAttentionWatch({ parent: 1503, repository_id: 1186405141, repo_root: '/repo', cli: ['bun', 'cli.ts'], host: hc.host }), hc.calls()];
  };
  expect(start([])).toEqual([{ address: 't20', started: true }, [
    ['ls', '--json', '--label', 'repo-harness.service=attention', '--label', 'repo-harness.repository=1186405141', '--label', 'repo-harness.parent=1503', '--all'],
    ['ls', '--json', '--label', 'repo-harness.repository=1186405141'],
    ['run', '--json', '--bg', '--label', 'repo-harness.service=attention', '--label', 'repo-harness.repository=1186405141', '--label', 'repo-harness.parent=1503',
      '--cwd', '/repo', '--no-parent', '--', 'bun', 'cli.ts', 'board', 'attention', '--parent', '1503', '--watch', '--deliver'],
  ]]);
  // One live orchestrator seat terminal is the hc parent (#2567); the watcher outlives it.
  const withOrchestrator = watchHc({ FAKE_LS: [{ address: 't3', state: 'live' }],
    FAKE_TERMINALS: { t3: { labels: { 'repo-harness.seat': 'orchestrator', 'repo-harness.repository': '1186405141' } } } });
  startAttentionWatch({ parent: 1503, repository_id: 1186405141, repo_root: '/repo', cli: ['bun', 'cli.ts'], host: withOrchestrator.host });
  const runCall = withOrchestrator.calls().find(args => args[0] === 'run')!;
  expect(runCall.slice(runCall.indexOf('--cwd'), runCall.indexOf('--'))).toEqual(['--cwd', '/repo', '--parent', 't3', '--outlive-parent']);
  const reviewHc = watchHc();
  startAttentionWatch({ parent: 1503, repository_id: 1186405141, repo_root: '/repo', cli: ['bun', 'cli.ts'], host: reviewHc.host, review_space: 'sp1' });
  expect(reviewHc.calls().at(-1)?.slice(-5)).toEqual(['--watch', '--deliver', '--review', '--space', 'sp1']);
  expect(start([{ address: 't5', state: 'live' }])[0]).toEqual({ address: 't5', started: false });

  // The board of the same parent in hc: the watcher is not a seat terminal.
  const seats = watchHc({ FAKE_LS: [{ address: 't5', state: 'live' }, { address: 't3', state: 'live' }],
    FAKE_TERMINALS: { t5: { labels }, t3: { labels: { 'repo-harness.seat': 'orchestrator', 'repo-harness.repository': '1186405141', 'repo-harness.parent': '1503' } } } });
  const read = boardHostPorts(seats.options).seatTerminals('1186405141');
  expect(read.status === 'observed' && read.terminals.map(terminal => terminal.address)).toEqual(['t3']);
  expect(seats.calls().filter(args => args[0] === 'ls')).toEqual([['ls', '--json', '--label', 'repo-harness.repository=1186405141']]);

  // The closeout listing adds finished terminals (#2021). A kill that finished the terminal before a failed rm leaves it for the retry, which removes it with rm only.
  const retry = watchHc({ FAKE_RM_FAIL: '1', FAKE_LS: [{ address: 't3', state: 'live' }],
    FAKE_TERMINALS: { t3: { labels: { 'repo-harness.seat': 'worker', 'repo-harness.repository': '1186405141' } } } });
  expect(boardHostPorts(retry.options).closeTerminal('t3')).toEqual({ status: 'unavailable', reason: 'hc_failed' });
  const retryPorts = boardHostPorts({ env: { ...retry.options.env, FAKE_RM_FAIL: '', FAKE_LS: JSON.stringify([{ address: 't3', state: 'finished' }]) } });
  const finished = retryPorts.closeoutTerminals('1186405141');
  expect(finished.status === 'observed' && finished.terminals.map(terminal => [terminal.address, terminal.state])).toEqual([['t3', 'finished']]);
  expect(retryPorts.closeTerminal('t3')).toEqual({ status: 'closed' });
  expect(retry.calls().filter(args => ['ls', 'kill', 'rm'].includes(args[0]!))).toEqual([
    ['kill', '--json', '--', 't3'], ['rm', '--json', '--', 't3'], ['ls', '--json', '--label', 'repo-harness.repository=1186405141', '--all'], ['rm', '--json', '--', 't3']]);

  // One orchestrator and one advisor serve the repository (#1780): the room of every parent shows them, with or
  // without a parent label. A worker shows only in the room whose items hold its issue label (#2492), so t16 with
  // issue 1721 and parent label 1474 is not in room 1474; a terminal of another repository never.
  const room = (repository: string, labels: Json) => ({ labels: { 'repo-harness.repository': repository, ...labels } });
  const agents: Json = { t5: 'bun', t7: 'claude', t11: 'codex', t12: 'claude', t16: 'claude', t17: 'codex', t18: 'claude', t19: 'claude', t21: 'codex' };
  const repositoryTerminals = watchHc({
    FAKE_LS: ['t5', 't7', 't11', 't12', 't16', 't17', 't18', 't19', 't21'].map(address => ({ address, state: 'live', agent: agents[address] })),
    FAKE_TERMINALS: {
      // t5 is the attention watcher of this repository; t21 is a seat with an invalid pr label.
      t5: { labels: { ...labels, 'repo-harness.repository': '1186405141' } }, t21: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.pr': 'x' }),
      t7: { ...room('1186405141', { 'repo-harness.seat': 'orchestrator' }), status: { state: 'blocked', msg: `push failed:\nghp_${'a'.repeat(30)}` } }, t11: room('1186405141', { 'repo-harness.seat': 'advisor' }),
      t12: room('1186405141', { 'repo-harness.seat': 'orchestrator', 'repo-harness.parent': '1503' }),
      t16: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.parent': '1474', 'repo-harness.issue': '1721' }),
      t17: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.parent': '1503', 'repo-harness.issue': '1773' }),
      t18: room('1186405141', { 'repo-harness.seat': 'worker', 'repo-harness.issue': '1774' }),
      t19: room('987654321', { 'repo-harness.seat': 'advisor' }),
    },
  });
  const office = replay({ host: boardHostPorts(repositoryTerminals.options) }).execution;
  expect(office.status === 'observed' && office.terminals.map(terminal => [terminal.address, terminal.seat_status === 'observed' && terminal.seat]))
    .toEqual([['t7', 'orchestrator'], ['t11', 'advisor'], ['t12', 'orchestrator']]);
  // hc `status.msg` reaches the board as one redacted line, and a status without one gives null.
  expect(office.status === 'observed' && office.terminals.slice(0, 2).map(terminal => terminal.status_msg)).toEqual(['push failed: ghp_[REDACTED]', null]);
  // The parent list of the repository keeps every seat, with or without a parent label (#1785); the watcher and the
  // other repository never show, and an invalid label shows as such.
  const seatRead = boardHostPorts(repositoryTerminals.options).seatTerminals('1186405141');
  if (seatRead.status !== 'observed') throw new Error(seatRead.reason);
  const officeSeats = projectBoardSeats('1186405141', REPLAY_NOW.toISOString(), seatTerminalsWithBranches(seatRead.terminals)).seats;
  expect(officeSeats.map(seat => [seat.address, seat.seat_status === 'observed' ? [seat.seat, seat.issue] : seat.reason, seat.parent, seat.agent])).toEqual([
    ['t7', ['orchestrator', null], null, 'claude'], ['t11', ['advisor', null], null, 'codex'], ['t12', ['orchestrator', null], '1503', 'claude'],
    ['t16', ['worker', 1721], '1474', 'claude'], ['t17', ['worker', 1773], '1503', 'codex'], ['t18', ['worker', 1774], null, 'claude'],
    ['t21', 'seat_label_invalid', null, 'codex']]);

  // Doctor runs in repository 1186405141. t6 is the watcher of another repository with the same parent.
  const other = { ...labels, 'repo-harness.repository': '987654321' };
  const doctor = (watchers: Record<string, Json>) => attentionWatchDoctorCheck(watchHc({
    FAKE_LS: Object.entries(watchers).map(([address, terminal]) => ({ address, state: terminal.state })), FAKE_TERMINALS: watchers,
  }).host, () => 1186405141);
  expect(doctor({ t5: { labels, state: 'live' } })).toMatchObject({ status: 'ok', detail: 'The attention watcher of repository 1186405141 #1503 is live.' });
  const stopped = { status: 'warn', detail: 'The attention watcher of repository 1186405141 #1503 is not live (attention_stopped). Run in the checkout of repository 1186405141: repo-harness board attention start --parent 1503' };
  expect(doctor({ t5: { labels, state: 'finished' } })).toMatchObject(stopped);
  expect(doctor({ t5: { labels, state: 'finished' }, t6: { labels: other, state: 'live' } })).toMatchObject(stopped);
  expect(doctor({ t6: { labels: other, state: 'live' } })).toMatchObject({ status: 'na', detail: 'No attention watcher was started for repository 1186405141.' });
  expect(doctor({})).toMatchObject({ status: 'na', detail: 'No attention watcher was started.' });
  expect(attentionWatchDoctorCheck(attentionHostPorts({ env: { PATH: '/nonexistent' } }), () => 1186405141)).toMatchObject({ status: 'na', detail: 'hc is not installed.' });
  // A checkout without a GitHub remote cannot have a watcher, and gh is not asked; a GitHub remote reads the id from gh.
  const checkout = tmpWorkspace('board-remote'); roots.push(checkout);
  initGitRepo(checkout);
  expect(run('git', ['remote', 'add', 'mirror', 'https://example.com/repo-harness.git'], checkout).status).toBe(0);
  const local = () => attentionWatchDoctorCheck(watchHc({ FAKE_LS: [{ address: 't5', state: 'live' }], FAKE_TERMINALS: { t5: { labels } } }).host,
    () => readLocalRepositoryId({ repo_root: checkout, gh_runner: () => ({ status: 0, stdout: JSON.stringify({ id: 1186405141 }) }) }, url => githubRemoteRepository(url) !== null));
  expect(local()).toMatchObject({ status: 'na', detail: 'This checkout has no GitHub remote, so it has no attention watcher.' });
  expect(run('git', ['remote', 'add', 'origin', 'git@github.com:Ancienttwo/repo-harness.git'], checkout).status).toBe(0);
  expect(local()).toMatchObject({ status: 'ok' });
});

// #2492: a seat started with no parent label belongs to the board whose items hold its issue label or whose pull
// requests hold its pr label. The parent label decides only for a terminal with neither label.
test('board seats: the issue or pr label of a board item selects a seat with no parent label', () => {
  const room = (labels: Json) => ({ labels: { 'repo-harness.repository': '1186405141', ...labels } });
  const hc = watchHc({
    FAKE_LS: ['t1', 't2', 't3', 't4', 't5'].map(address => ({ address, state: 'live' })),
    FAKE_TERMINALS: {
      t1: room({ 'repo-harness.seat': 'worker-important', 'repo-harness.issue': '1477' }),
      t2: room({ 'repo-harness.seat': 'gatekeeper', 'repo-harness.pr': '1491' }),
      t3: room({ 'repo-harness.seat': 'worker', 'repo-harness.issue': '1721', 'repo-harness.parent': '1474' }),
      t4: room({ 'repo-harness.seat': 'reviewer', 'repo-harness.pr': '1462' }),
      t5: room({ 'repo-harness.seat': 'worker', 'repo-harness.parent': '1474' }),
    },
  });
  const board = replay({ host: boardHostPorts(hc.options) });
  expect(board.pull_requests.map(pr => pr.number)).not.toContain(1462);
  expect(board.execution.status === 'observed' && board.execution.terminals.map(terminal => terminal.address)).toEqual(['t1', 't2', 't5']);
  expect(planAttentionDeliveries(board, evaluateBoardAttention(board), 0).window_ms).toBe(WINDOW_WITH_WORKERS_MS);
});

// One-shot dependency migration (#1504): a stateful gh stub answers the reads and records every write.
// Node ids are `I<n>` for issues of the parent's repository; `blocked_by` seeds links to other node ids.
interface MigrationSubIssue {
  readonly number: number;
  readonly state: 'OPEN' | 'CLOSED';
  readonly body: string;
  readonly repository?: string;
  readonly blocked_by?: readonly string[];
}

function migrationStub(initial: readonly MigrationSubIssue[], missing: readonly number[] = []) {
  const subIssues = [...initial];
  const labels = new Set<string>();
  let blockerReads = 0;
  let calls = 0;
  const edges = new Set(subIssues.flatMap(node => (node.blocked_by ?? []).map(blocker => `I${node.number}:${blocker}`)));
  const writes: string[] = [];
  const answer = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value) });
  const number = (id: string) => Number(id.replace(/^[A-Z]+/u, ''));
  const runner = (args: readonly string[]) => {
    calls += 1;
    if (args[0] === 'repo') return answer({ nameWithOwner: 'Ancienttwo/repo-harness' });
    if (args.includes('POST')) {
      const name = args.find(arg => arg.startsWith('name='))!.slice(5);
      labels.add(name); writes.push(`label ${name}`);
      return answer({ name });
    }
    const query = args.find(arg => arg.startsWith('query='))!.slice(6);
    const variable = (key: string) => args.find(arg => arg.startsWith(`${key}=`))!.slice(key.length + 1);
    if (query.includes('addBlockedBy')) {
      edges.add(`${variable('issue')}:${variable('blocker')}`); writes.push(`#${number(variable('issue'))} blocked by #${number(variable('blocker'))}`);
      return answer({ data: { addBlockedBy: { issue: { number: number(variable('issue')) } } } });
    }
    if (query.includes('subIssues')) {
      const repository: Json = { issue: { subIssues: { pageInfo: { hasNextPage: false }, nodes: subIssues.map(node => ({
        id: `I${node.number}`, number: node.number, state: node.state, body: node.body,
        repository: { nameWithOwner: node.repository ?? 'Ancienttwo/repo-harness' },
        blockedBy: { pageInfo: { hasNextPage: false }, nodes: [...edges].filter(edge => edge.startsWith(`I${node.number}:`))
          .map(edge => ({ id: edge.split(':')[1], number: number(edge.split(':')[1]!) })) },
      })) } } };
      ['tier:low', 'tier:medium', 'tier:high'].forEach((name, index) => { repository[`t${index}`] = labels.has(name) ? { name } : null; });
      return answer({ data: { repository } });
    }
    blockerReads += 1;
    const repository = Object.fromEntries([...query.matchAll(/b([0-9]+): issue/gu)]
      .map(match => [`b${match[1]}`, missing.includes(Number(match[1])) ? null : { id: `I${match[1]}`, number: Number(match[1]) }]));
    return answer({ data: { repository } });
  };
  const input = { repo_root: '/nonexistent', parent: 1503, gh_runner: runner };
  // `plan` is the run without --write. `migrate` is `--write --plan <digest>`: a fresh plan, the digest check, then exactly its writes;
  // without a digest it uses the fresh plan's own, as a person who checked that same list would.
  return {
    runner, writes, blockerReads: () => blockerReads, calls: () => calls, plan: () => planDependencyMigration(input),
    command: (flags: { readonly write: boolean; readonly plan: string | undefined }) => runDependencyMigration(input, flags),
    edit: (number: number, body: string) => { subIssues.splice(subIssues.findIndex(node => node.number === number), 1, { ...subIssues.find(node => node.number === number)!, body }); },
    migrate: (digest?: string) => { const plan = planDependencyMigration(input); return applyDependencyMigration(input, plan, digest ?? plan.digest); },
    apply: (digest: string | undefined) => applyDependencyMigration(input, planDependencyMigration(input), digest),
  };
}

const MIGRATION_SUB_ISSUES: readonly MigrationSubIssue[] = [
  { number: 1508, state: 'OPEN', body: '## Goal\nConsole board.\n\n## Depends on\nDepends on #1505 board core\nEarly start: not allowed\n\n## Out of scope\n- #1507 owns the deletion' },
  { number: 1509, state: 'OPEN', body: '## 依赖\n#1505；#1473（启动时写席位标签）、#1476 合入后再做。\n风险：High（验收链路）。\n---\n_Generated in #9_' },
  { number: 1510, state: 'OPEN', body: 'Watcher.\n依赖：#1505\n' },
  // An existing link to #1505 of another repository is not the local #1505 link.
  { number: 1512, state: 'OPEN', body: 'Depends on #1505\n', blocked_by: ['FOREIGN1505'] },
  { number: 1490, state: 'CLOSED', body: '## Depends on\nDepends on #1505\n' },
];

test('migrate-dependencies turns the dependency lines of open sub-issues into blocked-by links and creates the tier labels', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  const result = stub.migrate();
  expect(result.edges.map(edge => [edge.issue, edge.blocker, edge.line_number, edge.result])).toEqual([
    [1508, 1505, 5, 'created'],
    [1509, 1505, 2, 'created'], [1509, 1473, 2, 'created'], [1509, 1476, 2, 'created'],
    [1510, 1505, 2, 'created'],
    [1512, 1505, 1, 'created'],
  ]);
  expect(result.skipped).toEqual([{ issue: 1509, line_number: 3, line: '风险：High（验收链路）。' }]);
  expect(result.labels).toEqual([
    { name: 'tier:low', result: 'created' }, { name: 'tier:medium', result: 'created' }, { name: 'tier:high', result: 'created' }]);
  // Lines after a heading or `---` and the closed sub-issue #1490 give no link.
  expect(stub.writes).toEqual(['label tier:low', 'label tier:medium', 'label tier:high', '#1508 blocked by #1505',
    '#1509 blocked by #1505', '#1509 blocked by #1473', '#1509 blocked by #1476', '#1510 blocked by #1505', '#1512 blocked by #1505']);
});

test('migrate-dependencies without --write prints the whole plan and writes nothing', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  const text = renderDependencyMigrationPlan(stub.plan());
  expect(stub.writes).toEqual([]);
  for (const line of ['create label tier:low', 'create #1508 blocked by #1505 (line 5: Depends on #1505 board core)',
    'create #1512 blocked by #1505 (line 1: Depends on #1505)', 'skip #1509 line 3: 风险：High（验收链路）。', '--write makes 9 writes',
    `plan digest: ${stub.plan().digest} (apply with --write --plan ${stub.plan().digest})`]) {
    expect(text).toContain(line);
  }
  const refused = migrationStub([...MIGRATION_SUB_ISSUES, { number: 1505, state: 'OPEN', body: '- Example:\n\n      Depends on #7\n' }]);
  const stopped = renderDependencyMigrationPlan(refused.plan());
  expect(refused.writes).toEqual([]);
  expect(stopped).toContain('refuse #1505 line 3: Depends on #7');
  expect(stopped).toContain('--write stops before any write: dependency_line_ambiguous');
});

test('a second migrate-dependencies run writes nothing and reports every link and label as existing', () => {
  const stub = migrationStub(MIGRATION_SUB_ISSUES);
  stub.migrate();
  const writes = stub.writes.length;
  const second = stub.migrate();
  expect(stub.writes.length).toBe(writes);
  expect([...second.edges, ...second.labels].every(entry => entry.result === 'exists')).toBe(true);
  expect(second.edges).toHaveLength(6);
});

test('migrate-dependencies stops before any write on an unparsable line, a declaration in a possible code position, another heading form or a sub-issue of another repository', () => {
  const open = (number: number, body: string): MigrationSubIssue => ({ number, state: 'OPEN', body });
  // [added sub-issues, error code, the lines the message names]; an ambiguous stop names exactly those lines.
  const stops: readonly [readonly MigrationSubIssue[], string, readonly string[]][] = [
    [[open(1505, '## 依赖\n\n无。席位标签来自 #1473 和 #1476；合入前执行轴为 unavailable。\n')], 'dependency_line_unparsed', ['#1505 line 3']],
    [[open(1505, 'Depends on other/repo#7\n')], 'dependency_line_unparsed', ['#1505 line 1']],
    [[open(1505, '#### 依赖\n#1473\n')], 'dependency_line_unparsed', ['#1505 line 1']],
    // Refusals (owner rule M24): a code or HTML marker anywhere in the body, leading whitespace, or a wide list marker.
    [[open(1505, '- Example:\n\n    ```\n    Depends on #7\n    ```\n')], 'dependency_line_ambiguous', ['#1505 line 4: Depends on #7']],
    [[open(1505, '- Example:\n\n      Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '````markdown\n```\nDepends on #7\n````\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '```\n    ```\nDepends on #7\n```\n')], 'dependency_line_ambiguous', ['#1505 line 3: Depends on #7']],
    [[open(1505, '- Step:\n  ```\n  code\n```\nDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 5: Depends on #7']],
    [[open(1505, ' \tDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: Depends on #7']],
    [[open(1505, '- Example:\n\n    ## 依赖\n')], 'dependency_line_ambiguous', ['#1505 line 3: ## 依赖']],
    [[open(1505, '## 依赖\n- #1476 core\n    and #1473\n')], 'dependency_line_ambiguous', ['#1505 line 3: and #1473']],
    [[open(1505, '- ```\nDepends on #7\n- ```\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '1. ```\n   Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '-     Depends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: -     Depends on #7']],
    [[open(1505, '-\t\tDepends on #7\n')], 'dependency_line_ambiguous', ['#1505 line 1: -\t\tDepends on #7']],
    [[open(1505, '## 依赖\n-     #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: -     #7']],
    [[open(1505, '## 依赖\n```\n~~~ #1473\n')], 'dependency_line_ambiguous', ['#1505 line 1: ## 依赖', '#1505 line 3: ~~~ #1473']],
    [[open(1505, '<pre>\nDepends on #7\n</pre>\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    [[open(1505, '<!--\nDepends on #7\n-->\n')], 'dependency_line_ambiguous', ['#1505 line 2: Depends on #7']],
    // Only `- #n` in a section is a template list form (owner rule M24 item 5); every other list form refuses.
    [[open(1505, '1. Depends on #7\n+ 依赖：#7\n* Depends on #7\n- Depends on #7\n')], 'dependency_line_ambiguous',
      ['#1505 line 1: 1. Depends on #7', '#1505 line 2: + 依赖：#7', '#1505 line 3: * Depends on #7', '#1505 line 4: - Depends on #7']],
    [[open(1505, '## 依赖\n1. #7\n+ #7\n* #7\n')], 'dependency_line_ambiguous', ['#1505 line 2: 1. #7', '#1505 line 3: + #7', '#1505 line 4: * #7']],
    // The marker may come after the declaration: the whole body refuses.
    [[open(1505, 'Depends on #7\n\n```\nexample\n```\n')], 'dependency_line_ambiguous', ['#1505 line 1: Depends on #7']],
    // One scan over all bodies: both refusals are named, and the parse error of #10 does not hide them.
    [[open(10, '    Depends on #7\nDepends on other/repo#8\n'), open(11, '    Depends on #9\n')], 'dependency_line_ambiguous',
      ['#10 line 1: Depends on #7', '#11 line 1: Depends on #9']],
    [[{ number: 10, state: 'OPEN', body: 'Depends on #20\n', repository: 'other/repo' }], 'foreign_sub_issue', ['#10 of other/repo']],
  ];
  for (const [added, code, lines] of stops) {
    const stub = migrationStub([...MIGRATION_SUB_ISSUES, ...added]);
    let error: unknown;
    try { stub.migrate(); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code });
    for (const line of lines) expect((error as Error).message).toContain(line);
    if (code === 'dependency_line_ambiguous') expect((error as Error).message.match(/#[0-9]+ line [0-9]+/gu)).toHaveLength(lines.length);
    expect(stub.writes).toEqual([]);
  }
  const stopOf = (run: () => unknown): unknown => {
    try { run(); } catch (caught) { return caught; }
    return undefined;
  };
  // A refusal stops the plan before any blocker read, so the missing blocker #999 cannot hide it.
  const missing = migrationStub([...MIGRATION_SUB_ISSUES, open(1505, '-     Depends on #7\n'), open(1506, 'Depends on #999\n')], [999]);
  expect(stopOf(() => missing.migrate())).toMatchObject({ code: 'dependency_line_ambiguous' });
  expect([missing.blockerReads(), missing.writes]).toEqual([0, []]);
  // --write applies only the checked list: a body edited after the dry run changes the digest.
  const drift = migrationStub(MIGRATION_SUB_ISSUES);
  const checked = drift.plan();
  drift.edit(1510, 'Watcher.\n依赖：#1473\n');
  expect(stopOf(() => drift.migrate(checked.digest))).toMatchObject({ code: 'dependency_plan_changed' });
  expect(drift.writes).toEqual([]);
  // --write without --plan <digest> is refused, and the command refuses it before any GitHub call.
  expect(stopOf(() => drift.apply(undefined))).toMatchObject({ code: 'plan_digest_required' });
  expect(drift.writes).toEqual([]);
  const flags = migrationStub(MIGRATION_SUB_ISSUES);
  expect(stopOf(() => flags.command({ write: true, plan: undefined }))).toMatchObject({ code: 'plan_digest_required' });
  // --plan <digest> without --write is refused too.
  expect(stopOf(() => flags.command({ write: false, plan: checked.digest }))).toMatchObject({ code: 'plan_without_write' });
  expect([flags.calls(), flags.writes]).toEqual([0, []]);
});

test('advisor seat: plain text reaches only the one live advisor terminal of the repository; the read-back withholds key blocks and long lines and redacts the rest', () => {
  const W = ADVISOR_TRANSCRIPT_LINE_WITHHELD;
  const seat = (name: string | null, parent: string | null = '1503', repository = '1186405141') => ({ labels: {
    'repo-harness.repository': repository, ...(parent === null ? {} : { 'repo-harness.parent': parent }), ...(name === null ? {} : { 'repo-harness.seat': name }) } });
  // Refused: the orchestrator, a worker, the advisor of another repository and a terminal without the seat label.
  const refused = { t3: seat('orchestrator'), t4: seat('worker'), t5: seat('advisor', '1503', '987654321'), t6: seat(null),
    'mini-cf/t11': seat('advisor'), 'lab/odd?terminal': seat('advisor') };
  const advisorHc = (terminals: Json, env: Json = {}) => {
    const hc = watchHc({ FAKE_LS: Object.keys(terminals).map(address => ({ address, state: 'live' })), FAKE_TERMINALS: terminals, ...env });
    return { ...hc, scope: { github_repository_id: 1186405141, parent: 1503, host: boardHostPorts(hc.options) } };
  };
  const code = (action: () => unknown) => { try { action(); return 'ok'; } catch (error) { return (error as AdvisorSeatError).code; } };
  const sends = (hc: ReturnType<typeof advisorHc>) => hc.calls().filter(args => args[0] === 'send');

  const absent = advisorHc(refused);
  expect(code(() => sendToAdvisorSeat(absent.scope, 'status?'))).toBe('advisor_seat_absent');
  expect(absent.calls()[0]).toEqual(['ls', '--json', '--label', 'repo-harness.repository=1186405141']);
  expect(sends(absent)).toEqual([]);
  // One advisor per repository (#1780): two live advisors with different parent labels are ambiguous.
  expect(code(() => sendToAdvisorSeat(advisorHc({ ...refused, t9: seat('advisor'), t10: seat('advisor', '1504') }).scope, 'status?'))).toBe('advisor_seat_ambiguous');

  // The advisor carries no parent label, as its start row in herdr-notify.md writes it.
  const one = advisorHc({ ...refused, t9: { ...seat('advisor', null), status: { state: 'working', kind: 'tool' }, turn: 3 } }, {
    FAKE_READ: { text: ['dropped', ...Array.from({ length: 196 }, (_, at) => `l${at}`), 'export GITHUB_TOKEN=ghp_' + 'a'.repeat(36), 'API_KEY=hunter2',
      'Authorization: Bearer abc', 'x'.repeat(5000)].join('\n'), complete: false, why: 'working' },
  });
  // Characters, not UTF-16 units: 4000 emoji are 8000 units.
  for (const text of ['status?', 'line 1\nline 2', 'a'.repeat(4000), '😀'.repeat(4000)]) {
    expect(sendToAdvisorSeat(one.scope, text)).toEqual({ protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1186405141, parent: 1503, terminal: 't9', started: true, turn: 2 });
    expect(sends(one).at(-1)).toEqual(['send', '--json', '--', 't9', text]);
  }
  const before = one.calls().length;
  for (const text of ['', 'a'.repeat(4001), 'a\tb', 'a\rb', 'a\u0007b', 'a\u001bb', 'a\u007fb', 'a\u009bb']) expect(code(() => sendToAdvisorSeat(one.scope, text))).toBe('text_invalid');
  expect(one.calls()).toHaveLength(before);

  const transcript = readAdvisorSeat(one.scope);
  expect(one.calls().at(-1)).toEqual(['read', '--json', '--lines', '200', '--', 't9']);
  expect(transcript).toMatchObject({ terminal: 't9', status: 'working', status_kind: 'tool', turn: 3, complete: false, why: 'working' });
  expect(transcript.lines).toHaveLength(200);
  expect(transcript.lines.slice(0, 2)).toEqual(['l0', 'l1']);
  expect(transcript.lines.slice(-4)).toEqual(['export GITHUB_TOKEN=ghp_[REDACTED]', W, 'Authorization: Bearer [REDACTED]', W]);
  expect(decodeAdvisorSeatTranscript(JSON.parse(JSON.stringify(transcript)))).toEqual(transcript);
  for (const terminal of ['mini-cf/t11', 'lab/odd?terminal', 't1a']) {
    expect(() => decodeAdvisorSeatTranscript({ ...transcript, terminal })).toThrow('advisor seat target is invalid');
  }
  expect(one.calls().filter(args => args[0] === 'get').every(args => !args.at(-1)!.includes('/'))).toBe(true);

  // The read-back order: the last 200 lines, private key blocks withheld, a line over the limit withheld before or after redaction.
  const [begin, body, end] = ['-----BEGIN PRIVATE KEY-----', 'MC4CAQAwBQYDK2VwBCIEIGv0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u', '-----END PRIVATE KEY-----'];
  const [pgpBegin, pgpEnd] = ['-----BEGIN PGP PRIVATE KEY BLOCK-----', '-----END PGP PRIVATE KEY BLOCK-----'];
  const newForms = [['SSH2 ENCRYPTED PRIVATE KEY', '---- ', ' ----'], ['RSA-PSS PRIVATE KEY', '-----', '-----'], ['PGP SECRET KEY BLOCK', '-----', '-----']].map(([label, open, close]) => ['BEGIN', 'END'].map(word => `${open}${word} ${label}${close}`));
  const cases: readonly [string, readonly string[], readonly string[]][] = [
    ['whole key', ['before', begin, body, body, end, 'after'], ['before', W, W, W, W, 'after']],
    ['another key type', ['-----BEGIN EC PRIVATE KEY-----', body, '-----END EC PRIVATE KEY-----', 'after'], [W, W, W, 'after']],
    ['a PGP key', [pgpBegin, body, pgpEnd, 'after'], [W, W, W, 'after']],
    ['window end cuts a PGP key', ['before', pgpBegin, body], ['before', W, W]],
    ['hc read starts inside a PGP key', [body, pgpEnd, 'after'], [W, W, 'after']],
    ...newForms.flatMap(([formBegin, formEnd]): [string, readonly string[], readonly string[]][] => [
      [`whole ${formBegin}`, [formBegin, body, formEnd, 'after'], [W, W, W, 'after']],
      [`window end cuts ${formBegin}`, ['before', formBegin, body], ['before', W, W]],
      [`hc read starts inside ${formBegin}`, [body, formEnd, 'after'], [W, W, 'after']],
    ]),
    ['a key label outside the named forms', ['-----BEGIN TSS2 PRIVATE KEY-----', body, '-----END TSS2 PRIVATE KEY-----', 'after'], [W, W, W, 'after']],
    ['key on one line', [`key ${begin}${body}${end}`, 'after'], [W, 'after']],
    ['hc read starts inside the key', [body, end, 'after'], [W, W, 'after']],
    ['window start cuts the key', [begin, ...Array.from({ length: 199 }, () => body), end, 'after'], [...Array.from({ length: 199 }, () => W), 'after']],
    ['window end cuts the key', ['before', begin, body], ['before', W, W]],
    ['an open key followed by another key', ['x', begin, 'K1', 'K2', begin, 'K3', end, 'y'], ['x', W, W, W, W, W, W, 'y']],
    ['a line that ends one key and opens another', [`${begin} K ${end} ${begin}`, 'Kz', 'y'], [W, W, W]],
    ['line over the limit', ['a'.repeat(1001), 'a'.repeat(1000)], [W, 'a'.repeat(1000)]],
    ['redaction grows a line over the limit', [`${'a'.repeat(976)} Authorization: Bearer x`, `${'a'.repeat(900)} Authorization: Bearer x`], [W, `${'a'.repeat(900)} Authorization: Bearer [REDACTED]`]],
  ];
  // The projection and the response decoder return the same lines, with no key line.
  for (const [name, input, lines] of cases) {
    const projected = advisorTranscriptLines(input.join('\n'));
    expect([name, projected, decodeAdvisorSeatTranscript({ ...transcript, lines: projected }).lines]).toEqual([name, lines, lines]);
  }
  // Each line alone passes; the joined text holds a whole key.
  for (const lines of [['API_KEY=hunter2'], [begin, body, end], [pgpBegin, body, pgpEnd]]) expect(() => decodeAdvisorSeatTranscript({ ...transcript, lines })).toThrow('advisor seat transcript is invalid');

  // A failed send names the resolved terminal; `hc send` may have run, so it is unconfirmed.
  const failed = advisorHc({ t9: seat('advisor') }, { FAKE_SEND_FAIL: '1' });
  const failure = (action: () => unknown) => { try { action(); return null; } catch (error) { return advisorSeatSendFailure(failed.scope, error as AdvisorSeatError); } };
  expect(failure(() => sendToAdvisorSeat(failed.scope, 'status?'))).toEqual({ protocol: 1, kind: 'repo-harness.advisor-seat-send-failure', github_repository_id: 1186405141, parent: 1503, terminal: 't9', code: 'advisor_send_unconfirmed' });
  expect(failure(() => sendToAdvisorSeat(absent.scope, 'status?'))).toMatchObject({ terminal: null, code: 'advisor_seat_absent' });
  const missing = { github_repository_id: 1186405141, parent: 1503, host: boardHostPorts({ env: { PATH: '/nonexistent' } }) };
  expect([code(() => sendToAdvisorSeat(missing, 'status?')), code(() => readAdvisorSeat(missing))]).toEqual(['hc_unavailable', 'hc_unavailable']);
});

test('board closeout: proofs come first; a bound, clean, pushed seat closes and the merged worktree goes; a dirty, unpushed or conflicting seat, a missing proof and a failed step keep their state with the reason', async () => {
  const root = tmpWorkspace('board-closeout'); roots.push(root);
  const main = join(root, 'main'), origin = join(root, 'origin.git');
  const git = (cwd: string, ...args: string[]) => {
    const result = run('git', args, cwd);
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  mkdirSync(main); initGitRepo(main);
  writeFileSync(join(main, '.gitignore'), '.ai/\n');
  git(main, 'add', '.'); git(main, 'commit', '-q', '-m', 'base');
  git(main, 'remote', 'add', 'origin', origin); git(main, 'push', '-q', '-u', 'origin', 'main');
  const pullRequests: Record<string, Json> = {};
  const worktree = (name: string, pr: number, issue: number) => {
    const path = join(root, name);
    git(main, 'worktree', 'add', '-q', '-b', `feat/${name}`, path);
    writeFileSync(join(path, `${name}.txt`), name);
    git(path, 'add', '.'); git(path, 'commit', '-q', '-m', name); git(path, 'push', '-q', '-u', 'origin', `feat/${name}`);
    mkdirSync(join(path, '.ai/harness'), { recursive: true });
    writeFileSync(join(path, '.ai/harness/active-worktree'), `${path}\n`);
    const head = git(path, 'rev-parse', 'HEAD');
    git(main, 'merge', '-q', '--no-ff', '-m', `merge ${name}`, `feat/${name}`); git(main, 'push', '-q', 'origin', 'main');
    pullRequests[String(pr)] = { number: pr, state: 'MERGED', baseRefName: 'main', headRefName: `feat/${name}`, headRefOid: head,
      mergeCommit: { oid: git(main, 'rev-parse', 'HEAD') }, closingIssuesReferences: [{ number: issue, repository: { id: 'R_this' } }], body: '' };
    return path;
  };
  const clean = worktree('clean', 21, 11), kept = worktree('kept', 22, 12), dirty = worktree('dirty', 23, 13), partial = worktree('partial', 24, 14);
  const branchfail = worktree('branchfail', 25, 15), rmfail = worktree('rmfail', 26, 16), child = worktree('child', 27, 17), sigfail = worktree('sigfail', 28, 18);
  // #29 only says `Refs #19`: no closing issue, so its seats bind by the head branch of their checkout (#2071).
  const refsonly = worktree('refsonly', 29, 19);
  pullRequests['29']!.closingIssuesReferences = []; pullRequests['29']!.body = 'Refs #19';
  // #30 closes issue 20 and names issue 21: a head-worktree seat of issue 77 binds nothing, one of issue 21 closes, and one of issue 21 under another PR's label is a conflict that keeps the worktree.
  const refsconf = worktree('refsconf', 30, 20);
  pullRequests['30']!.body = 'Closes #20\nRefs #21';
  // #31 is the writer worktree of a finished row terminal whose review worktree is already removed (#2658).
  const withdrawn = worktree('withdrawn', 31, 31);
  // #21 also closes issue 12 of another repository, which binds no local seat.
  pullRequests['21']!.closingIssuesReferences.push({ number: 12, repository: { id: 'R_other' } });
  // A clean checkout of another project under a stale pr label.
  const elsewhere = join(root, 'elsewhere');
  mkdirSync(elsewhere); initGitRepo(elsewhere); git(elsewhere, 'commit', '-q', '--allow-empty', '-m', 'other');
  // Git refuses the deletion of feat/branchfail, so its exact removal stops after the checkout is gone.
  mkdirSync(join(root, 'hooks'));
  writeFileSync(join(root, 'hooks/reference-transaction'), `#!/bin/sh\n[ "$1" = prepared ] || exit 0\ngrep -q ' 0\\{40\\} refs/heads/feat/branchfail$' && exit 1\nexit 0\n`);
  chmodSync(join(root, 'hooks/reference-transaction'), 0o755);
  git(main, 'config', 'core.hooksPath', join(root, 'hooks'));
  writeFileSync(join(dirty, 'draft.txt'), 'dirty');
  // Reviewer checkouts of #22: one with a commit that origin does not have, one with an uncommitted file.
  const checkout = (name: string) => {
    const path = join(root, name);
    git(main, 'worktree', 'add', '-q', '-b', `review/${name}`, path); git(path, 'push', '-q', '-u', 'origin', `review/${name}`);
    return path;
  };
  const unpushed = checkout('unpushed'), edited = checkout('edited');
  git(unpushed, 'commit', '-q', '--allow-empty', '-m', 'local only');
  writeFileSync(join(edited, 'note.txt'), 'draft');
  const terminal = (address: string, cwd: string | null, labels: Record<string, string>, state: 'live' | 'finished' = 'live') => ({ address, name: null, agent: 'claude-code', state, status: 'done',
    status_kind: null, status_msg: null, status_ms: null, turn: 1, cwd, labels: { seat: 'worker', ...labels } });
  const terminals = [terminal('t1', clean, { issue: '11' }), terminal('t2', clean, { seat: 'gatekeeper', pr: '21' }), terminal('t3', main, { seat: 'orchestrator' }),
    terminal('t4', kept, { issue: '12' }), terminal('t5', unpushed, { seat: 'reviewer', pr: '22' }), terminal('t6', kept, { issue: '12', pr: '99' }),
    terminal('t7', edited, { seat: 'gatekeeper', pr: '22' }), terminal('t8', main, { seat: 'reviewer', pr: '23' }), terminal('t9', main, { seat: 'reviewer', pr: '24' }),
    terminal('t10', elsewhere, { seat: 'reviewer', pr: '22' }), terminal('t11', main, { seat: 'reviewer', pr: '25' }),
    // Finished terminals (#2021) pass the same label and checkout proofs as live ones.
    terminal('t12', clean, { seat: 'reviewer', pr: '21' }, 'finished'), terminal('t13', elsewhere, { seat: 'reviewer', pr: '22' }, 'finished'),
    terminal('t14', kept, { issue: '12', pr: '99' }, 'finished'), terminal('t15', null, { seat: 'reviewer', pr: '22' }, 'finished'),
    terminal('t16', main, { seat: 'reviewer', pr: '77' }, 'finished'), terminal('t17', main, { seat: 'reviewer', pr: '26' }, 'finished'),
    terminal('t18', main, { seat: 'reviewer', pr: '27' }), terminal('t19', main, { seat: 'reviewer', pr: '28' }),
    terminal('t20', refsonly, { issue: '19' }),
    terminal('t21', refsconf, { issue: '77' }), terminal('t23', refsconf, { issue: '21' }),
    // A finished seat whose cwd directory is gone; #2658 removes its record and does not keep the PR worktree.
    terminal('t28', join(root, 'withdrawn-review'), { seat: 'reviewer', pr: '31' }, 'finished'),
    // Not bound: another issue and no issue label in the Refs-only worktree, an unresolved cwd and another repository with the referenced issue label, all without a pr label.
    terminal('t24', refsonly, { issue: '77' }), terminal('t27', refsonly, {}), terminal('t25', null, { seat: 'reviewer', issue: '19' }), terminal('t26', elsewhere, { seat: 'reviewer', issue: '19' }), terminal('t22', refsconf, { seat: 'reviewer', issue: '21', pr: '99' })];
  // hc rm of t17 fails until the retry.
  const rmFails = new Set(['t17']);
  const closed: string[] = [];
  // Closeout stops a server and finds a process that still holds the checkout (#2029): a surviving child, or a signal that failed.
  const holders = [child, sigfail], stops: Record<string, { stopped: number[]; failures: string[] }> = {
    [child]: { stopped: [4241], failures: [] }, [sigfail]: { stopped: [], failures: ['codegraph server 4240: EPERM'] } };
  const closeout = (pr: number) => runBoardCloseout({
    repo_root: main, pr, caller_terminal: 't3', processes: () => holders.map(cwd => ({ pid: 4242, cwd })), stopCodegraphServers: (path) => stops[path] ?? { stopped: [], failures: [] },
    stopDaemons: (path) => { if (path === partial) throw new Error('daemon stop failed'); return []; },
    host: { closeoutTerminals: () => ({ status: 'observed', terminals }), closeTerminal: (address) => {
      if (rmFails.has(address)) return { status: 'unavailable', reason: 'hc_failed' };
      closed.push(address); return { status: 'closed' };
    } },
    gh_runner: args => ({ status: 0, stdout: JSON.stringify(args[0] === 'pr' ? pullRequests[args[2]!] : args[0] === 'repo' ? { id: 'R_this' } : { id: 1186405141 }) }),
  });
  const pane = (address: string, seat: string, reason: string | null) => ({ address, seat, outcome: reason === null ? 'closed' as const : 'kept' as const, reason });
  const state = (path: string, outcome: 'removed' | 'kept', reason: string | null) => ({ path, outcome, reason, checkout_present: outcome !== 'removed', branch_present: outcome !== 'removed' });

  const removed = await closeout(21);
  expect([removed.panes, removed.worktree]).toEqual([[pane('t1', 'worker', null), pane('t2', 'gatekeeper', null), pane('t12', 'reviewer', null)], state(clean, 'removed', null)]);
  expect([existsSync(clean), run('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/feat/clean'], main).status, git(origin, 'branch', '--list', 'feat/clean')])
    .toEqual([false, 1, 'feat/clean']);

  const retained = await closeout(22);
  expect([retained.panes, retained.worktree]).toEqual([
    [pane('t4', 'worker', null), pane('t5', 'reviewer', 'unpushed 1 commit(s) on review/unpushed'), pane('t6', 'worker', 'conflicting_binding pr 99'), pane('t7', 'gatekeeper', 'dirty'),
      pane('t10', 'reviewer', 'other_repository'),
      pane('t13', 'reviewer', 'other_repository'), pane('t14', 'worker', 'conflicting_binding pr 99'), pane('t15', 'reviewer', 'cwd_unknown')],
    state(kept, 'kept', 'a pane of the pull request is kept'),
  ]);
  expect(readFileSync(join(kept, '.ai/harness/active-worktree'), 'utf8')).toBe(`${kept}\n`);

  // A missing proof (a dirty worktree) stops before the bound, clean t8 closes.
  await expect(closeout(23)).rejects.toThrow(`closeout of #23 stopped before any side effect: worktree ${dirty} is dirty or unreadable`);
  expect([existsSync(join(dirty, 'draft.txt')), run('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/feat/dirty'], main).status]).toEqual([true, 0]);

  // A step that fails after the panes closed returns those outcomes and the observed worktree state.
  const failed = await closeout(24);
  expect([failed.panes, failed.worktree]).toEqual([[pane('t9', 'reviewer', null)], state(partial, 'kept', 'daemon stop failed')]);
  // A branch deletion that fails after the checkout removal is a partial outcome with the observed state.
  const half = await closeout(25);
  expect([half.panes, half.worktree]).toEqual([[pane('t11', 'reviewer', null)],
    { path: branchfail, outcome: 'partial', reason: expect.stringContaining('update-ref'), checkout_present: false, branch_present: true }]);
  // A failed hc rm keeps the finished pane and the worktree with the reason; the retry removes both.
  const rmFailed = await closeout(26);
  expect([rmFailed.panes, rmFailed.worktree]).toEqual([[pane('t17', 'reviewer', 'hc_failed')], state(rmfail, 'kept', 'a pane of the pull request is kept')]);
  rmFails.clear();
  const retried = await closeout(26);
  expect([retried.panes, retried.worktree]).toEqual([[pane('t17', 'reviewer', null)], state(rmfail, 'removed', null)]);
  // A server that stops while its child keeps the checkout: closeout re-reads the inventory and keeps the worktree.
  const surviving = await closeout(27);
  expect([surviving.worktree.outcome, surviving.worktree.reason, surviving.stopped_codegraph_servers, surviving.daemon_stop_failures]).toEqual(['kept', 'process_in_use', [4241], []]);
  // A failed signal is reported, lists no stopped PID, and the holder keeps the worktree.
  const unsignalled = await closeout(28);
  expect([unsignalled.worktree.outcome, unsignalled.worktree.reason, unsignalled.stopped_codegraph_servers, unsignalled.daemon_stop_failures])
    .toEqual(['kept', 'process_in_use', [], ['codegraph server 4240: EPERM']]);
  // The seat of the Refs-only PR closes by its branch and the worktree goes with it.
  const refs = await closeout(29);
  expect([refs.panes, refs.worktree]).toEqual([[pane('t20', 'worker', null)], state(refsonly, 'removed', null)]);
  const conflict = await closeout(30);
  expect([conflict.panes, conflict.worktree]).toEqual([[pane('t23', 'worker', null), pane('t22', 'reviewer', 'conflicting_binding pr 99')], state(refsconf, 'kept', 'a pane of the pull request is kept')]);
  // A finished pane whose cwd directory is gone protects no work: closeout removes its record and the worktree goes (#2658).
  const lost = await closeout(31);
  expect([lost.panes, lost.worktree]).toEqual([[pane('t28', 'reviewer', null)], state(withdrawn, 'removed', null)]);
  expect(closed).toEqual(['t1', 't2', 't12', 't4', 't9', 't11', 't17', 't18', 't19', 't20', 't23', 't28']);
});

test('closeout stops a CodeGraph MCP server bound to exactly the worktree and no other process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cg-stop-'));
  const db = join(dir, '.codegraph/codegraph.db');
  mkdirSync(join(dir, '.codegraph')); writeFileSync(db, '');
  // The installed CodeGraph runs an absolute script path. `opens` is the file the process holds open.
  const script = '/opt/codegraph/lib/dist/bin/codegraph.js';
  const sleeper = (opens: string, args: string[], cwd = dir) => Bun.spawn([process.execPath, '-e', "require('fs').openSync(process.argv[1], 'r'); setTimeout(() => {}, 60000)", opens, script, ...args],
    { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  const serve = ['serve', '--mcp', '--path', dir];
  // Not a server of this worktree: no index file open but the cwd under .codegraph (an lsof cwd record), another --path with the index open, a non-server with it open.
  const server = sleeper(db, serve), elsewhere = sleeper(__filename, serve, join(dir, '.codegraph')), otherPath = sleeper(db, ['serve', '--mcp', '--path', `${dir}-other`]), bystander = sleeper(db, ['index']);
  try {
    await Bun.sleep(200);
    const found = [server, elsewhere, otherPath, bystander].map(child => ({ pid: child.pid, cwd: dir }));
    expect(stopCodegraphServers(dir, found)).toEqual({ stopped: [server.pid], failures: [] });
    await server.exited;
    // Signal 0 throws only for a process that is gone.
    expect([elsewhere.pid, otherPath.pid, bystander.pid].map(pid => { try { process.kill(pid, 0); return true; } catch { return false; } })).toEqual([true, true, true]);
  } finally { server.kill(); elsewhere.kill(); otherPath.kill(); bystander.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('watch window --review: each start or refusal is a log line and an orchestrator message; a failed run is a refusal line', async () => {
  const board = replay();
  const terminals = [{ address: 't3', name: null, agent: null, state: 'live', status: 'idle', status_kind: null, status_msg: null, status_ms: null, turn: 1, branch: null, seat_status: 'observed', seat: 'orchestrator', issue: null, pr: null }] as BoardTerminalV1[];
  const hc = watchHc({ FAKE_TERMINALS: { t3: {} } });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  const runs: Array<(observe: ReviewObserver) => Promise<unknown>> = [
    async observe => { observe({ kind: 'started', pr: 7, seat: 'reviewer', marker_url: 'https://example.test/m' }); observe({ kind: 'refused', pr: 8, reason: 'no worktree' }); },
    async () => undefined,
    async () => { throw new BoardCollectError('another board review run holds the lock'); },
    async () => { throw new Error('seat_not_configured: the reviewer seat has no runtime'); },
    // A start that completed before a later throw stays in the log and the message.
    async observe => { observe({ kind: 'started', pr: 9, seat: 'gatekeeper', marker_url: 'https://example.test/g' }); throw new Error('launch_unknown for the reviewer of PR #9'); },
  ];
  for (const review of runs) {
    await runAttentionWindow({ parent: 1474, deliver: true, review, log_path: logPath, collect: () => ({ ...board, execution: { status: 'observed', terminals } }) as BoardV1, host: hc.host, now: () => REPLAY_NOW, sleep: async () => {} });
  }
  const records = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  expect(records.filter(record => record.kind === 'review').map(record => [record.pr, record.seat, record.outcome])).toEqual([[7, 'reviewer', 'started'], [8, null, 'refused'], [null, null, 'refused'], [null, null, 'refused'], [9, 'gatekeeper', 'started'], [null, null, 'refused']]);
  expect(hc.calls().filter(args => args[0] === 'send' && args.at(-1)?.includes(' review: ')).map(args => args.at(-1))).toEqual([
    '[rh-attention] #1474 P3 review: PR #7 started on reviewer: https://example.test/m · PR #8 refused: no worktree',
    '[rh-attention] #1474 P3 review: refused: another board review run holds the lock',
    '[rh-attention] #1474 P3 review: refused: seat_not_configured: the reviewer seat has no runtime',
    '[rh-attention] #1474 P3 review: PR #9 started on gatekeeper: https://example.test/g · refused: launch_unknown for the reviewer of PR #9',
  ]);
  // A review message with two lines is one entry: its lines join with ` · `, so no `; ` starts a second entry of the findings form.
  const twoLines = hc.calls().find(args => args[0] === 'send' && args.at(-1)?.includes('P3 review: PR #7'))!.at(-1)!;
  expect(twoLines.slice('[rh-attention] #1474 P3 review: '.length).split(' · ')).toHaveLength(2);
  expect(twoLines).not.toContain('; ');
});

test('watch window --review: the message to a blocked orchestrator waits for it and is sent once after it stops being blocked', async () => {
  const board = replay();
  const terminals = [{ address: 't3', name: null, agent: null, state: 'live', status: 'blocked', status_kind: null, status_msg: null, status_ms: null, turn: 1, branch: null, seat_status: 'observed', seat: 'orchestrator', issue: null, pr: null }] as BoardTerminalV1[];
  const hc = watchHc({ FAKE_TERMINALS: { t3: { status: { state: 'blocked' } } },
    FAKE_WAITS: { t3: { ended: true, reason: 'status', status: 'idle', exit_code: null, signal: null, children: [] } } });
  const logPath = attentionLogPath(1186405141, 1474, { REPO_HARNESS_HOME: hc.root });
  await runAttentionWindow({ parent: 1474, deliver: true, log_path: logPath, collect: () => ({ ...board, execution: { status: 'observed', terminals } }) as BoardV1, host: hc.host, now: () => REPLAY_NOW, sleep: async () => {},
    review: async observe => { observe({ kind: 'started', pr: 7, seat: 'reviewer', marker_url: 'https://example.test/m' }); } });
  // The findings of the replay board also wait for t3; the review message is sent once, after the first wait.
  const calls = hc.calls().filter(args => args[0] === 'wait' || (args[0] === 'send' && args.at(-1)?.includes(' review: ')));
  expect(calls.map(args => args[0]).filter(name => name === 'send')).toHaveLength(1);
  expect(calls[0]![0]).toBe('wait');
  const sent = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(record => record.kind === 'send' && record.rules.includes('review'));
  expect(sent.map(record => [record.terminal, record.outcome])).toEqual([['t3', 'sent']]);
});

describe('rules R6 and R7', () => {
  const recorded = replay();
  const at = recorded.observed_at;
  const plan = (order: number[], holds: number[] = [], worker = 3) => ({ status: 'observed', comment_url: 'https://github.com/plan', created_at: at, revision: 1,
    block: { protocol: 2, kind: 'repo-harness.plan', merge_order: order, holds: holds.map(issue => ({ issue, reason: 'held' })), seat_limits: { worker } } }) as const;
  const worker = (address: string, issue: number) => ({ address, name: null, agent: null, state: 'live', status: 'working', status_kind: null, status_msg: null, status_ms: null, turn: 1,
    branch: null, seat_status: 'observed', seat: 'worker', issue, pr: null }) as BoardTerminalV1;
  const r6 = (board: BoardV1) => evaluateBoardAttention(board).findings.filter(finding => finding.rule === 'R6').map(finding => finding.message);
  const skipped = (board: BoardV1, id: BoardRuleId) => evaluateBoardAttention(board).unevaluated.filter(entry => entry.rule === id).map(entry => [entry.reason, entry.subject]);
  // #1475 and #1476 carry the two live workers; #1477 and #1478 have no claim and no blocker.
  const queue = (order: number[]): BoardV1 => ({ ...recorded, plan: plan(order), execution: { status: 'observed', terminals: [worker('t1', 1475), worker('t2', 1476)] } });

  test('R6 fires on a free seat with fewer than two ready issues, and reads only an observed plan and claims', () => {
    expect(r6(queue([1475, 1477]))).toEqual(['1 worker seats are free and the plan has 1 ready issues; propose the next issues']);
    expect(r6(queue([1477, 1478]))).toEqual([]);
    expect(r6({ ...queue([1477]), items: recorded.items.map(item => ({ ...item, state: 'closed' as const })) })).toEqual([]);
    expect(r6({ ...queue([1477]), plan: { status: 'absent', truncated: false } })).toEqual([]);
    expect(skipped({ ...queue([1477]), plan: { status: 'absent', truncated: false } }, 'R6')).toEqual([['plan_absent', null]]);
    const cut = { ...queue([1477]), items: recorded.items.map(item => (item.number === 1477 ? { ...item, claim: { status: 'unknown', reason: 'comments_truncated' } as const } : item)) };
    expect([r6(cut), skipped(cut, 'R6')]).toEqual([[], [['comments_truncated', '#1477']]]);
    const down = { ...queue([1477]), execution: { status: 'unavailable', reason: 'no_seat_terminals' } } as const;
    expect([r6(down), skipped(down, 'R6')]).toEqual([[], [['no_seat_terminals', null]]]);
    const unknownSeat = { ...queue([1477]), plan: plan([1477], [], 3), execution: { status: 'observed', terminals: [{ ...worker('t1', 1475), seat_status: 'unavailable', reason: 'seat_label_missing' }] } } as unknown as BoardV1;
    expect([r6(unknownSeat), skipped(unknownSeat, 'R6')]).toEqual([[], [['seat_label_missing', 't1']]]);
  });

  test('R7 fires on an accepted pull request behind a held entry, not behind an open entry that is not held', () => {
    const accepted = { status: 'accepted', via: 'record', accepted_at: at, evidence_url: 'https://github.com/acceptance' } as const;
    const board = (holds: number[]): BoardV1 => ({ ...recorded, acceptance_merge: 'on', plan: plan([1477, 1479], holds),
      pull_requests: recorded.pull_requests.map(pr => (pr.number === 1494 ? { ...pr, is_draft: false, acceptance: accepted } : pr)) });
    const r7 = (value: BoardV1) => evaluateBoardAttention(value).findings.filter(finding => finding.rule === 'R7').map(finding => finding.message);
    expect(r7(board([1477]))).toEqual(['#1494 is accepted and waits behind held #1477 in merge_order; move #1477 to the tail']);
    expect(r7(board([]))).toEqual([]);
    const off = { ...board([]), items: recorded.items.filter(item => item.number !== 1477) };
    expect(skipped(off, 'R7')).toEqual([['item_off_board', '#1477']]);
    expect(r7({ ...off, plan: plan([1477, 1479], [1477]) })).toEqual([]);
    const itemHold = { ...board([]), items: recorded.items.map(item => (item.number === 1477 ? { ...item, merge_hold: { status: 'held', holds: [{ comment_url: 'https://github.com/hold', issues: null }] } as const } : item)) };
    expect(r7(itemHold)).toEqual(['#1494 is accepted and waits behind held #1477 in merge_order; move #1477 to the tail']);
  });
});

describe('board required check: the contexts come from the base protection (#2264)', () => {
  const renamed = (data: Json) => {
    for (const check of data.repository.pr1491.commits.nodes[0].commit.statusCheckRollup.contexts.nodes) if (check.name === 'Required / CI') check.name = 'Build';
  };
  const build = (base: string) => ({ status: 0, stdout: JSON.stringify({ required_status_checks: { contexts: base === 'main' ? ['Build'] : ['Required / CI'] } }) });

  test('a base that requires one context with another name and a passed run gives success and no required_check merge reason', () => {
    const board = replay(mergeReplay({ pulls: renamed }, { protection: build }));
    expect(board.pull_requests.find(pr => pr.number === 1491)!.required_check).toMatchObject({ status: 'success' });
    expect(mergeReason({ pulls: renamed }, { protection: build })).toBe('eligible');
  });

  test('the check joins every required context: each name keeps the reports that gh pr checks keeps, and the merge detail names each context that is not success', () => {
    const two = (base: string) => ({ status: 0, stdout: JSON.stringify({ required_status_checks: { contexts: base === 'main' ? ['Required / CI', 'Lint'] : ['Required / CI'] } }) });
    // A check run of `Lint` started at minute `at`, completed one minute later; a commit status of `Lint` created at minute `at`.
    const time = (minute: number) => `2026-11-02T21:${String(minute).padStart(2, '0')}:00Z`;
    const run = (conclusion: string | null, at: number, workflow = 'CI', event = 'pull_request') => ({ name: 'Lint', status: conclusion === null ? 'IN_PROGRESS' : 'COMPLETED', conclusion,
      startedAt: time(at), completedAt: conclusion === null ? null : time(at + 1), detailsUrl: null, checkSuite: { workflowRun: { event, workflow: { name: workflow } } } });
    const status = (state: string, at: number) => ({ context: 'Lint', state, targetUrl: null, createdAt: time(at) });
    const lint = (reports: readonly Json[]) => (data: Json) => { data.repository.pr1491.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(...reports); };
    const decision = (reports: readonly Json[]) => boardMergeDecisions(replay(mergeReplay({ pulls: lint(reports) }, { protection: two }))).find(entry => entry.pr === 1491)!;
    const cases: readonly (readonly [readonly Json[], string])[] = [
      [[], 'Lint is missing'],
      [[run(null, 20)], 'Lint is pending'],
      [[run('FAILURE', 20)], 'Lint is failure'],
      [[run('SUCCESS', 20)], 'eligible'],
      // The same workflow and event: the newer run replaces the older one.
      [[run('FAILURE', 20), run('SUCCESS', 30)], 'eligible'],
      // One name from two workflows: both stay.
      [[run('SUCCESS', 30), run('FAILURE', 20, 'Nightly')], 'Lint is failure'],
      [[run('SUCCESS', 30), run('FAILURE', 20, 'CI', 'push')], 'Lint is failure'],
      // A check run and a commit status of one name both stay: a newer passing run does not hide an older failing status.
      [[status('FAILURE', 20), run('SUCCESS', 30)], 'Lint is failure'],
      [[status('PENDING', 20), run('SUCCESS', 30)], 'Lint is pending'],
      [[status('FAILURE', 20), status('SUCCESS', 25), run('SUCCESS', 30)], 'eligible'],
    ];
    expect(cases.map(([reports]) => decision(reports)).map(entry => (entry.eligible ? 'eligible' : entry.detail))).toEqual(cases.map(([, expected]) => expected));
    const failed = replay(mergeReplay({ pulls: lint([run('FAILURE', 19)]) }, { protection: two })).pull_requests.find(pr => pr.number === 1491)!.required_check;
    expect(failed).toMatchObject({ status: 'failure', completed_at: '2026-11-02T21:20:00Z', contexts: [{ name: 'Required / CI', status: 'success' }, { name: 'Lint', status: 'failure' }] });
  });

  test('a failed protection read or a base with no context list is unavailable, with no default name', () => {
    const protection = (answer: GhAnswer) => () => answer;
    const check = (answer: GhAnswer) => replay(mergeReplay({}, { protection: protection(answer) })).pull_requests.find(pr => pr.number === 1491)!.required_check;
    expect(check({ status: 1, stdout: '{"message":"Branch not protected","status":"404"}', stderr: 'gh: Branch not protected (HTTP 404)' }))
      .toEqual({ status: 'unavailable', reason: 'gh api --hostname failed: gh: Branch not protected (HTTP 404)' });
    const enobufs = { status: null, stdout: '', error: Object.assign(new Error('spawnSync gh ENOBUFS'), { code: 'ENOBUFS' }) } as unknown as GhAnswer;
    expect(check(enobufs)).toEqual({ status: 'unavailable', reason: `gh api --hostname printed more than the ${GH_MAX_BUFFER_BYTES}-byte maxBuffer limit` });
    expect(check({ status: 0, stdout: JSON.stringify({ required_status_checks: { contexts: [] } }) }))
      .toEqual({ status: 'unavailable', reason: 'the protection of main requires no status check context list' });
    const decision = boardMergeDecisions(replay(mergeReplay({}, { protection: protection({ status: 0, stdout: '{}' }) }))).find(entry => entry.pr === 1491)!;
    expect(decision).toMatchObject({ eligible: false, reason: 'required_check', detail: 'required contexts unavailable: the protection of main requires no status check context list' });
  });
});

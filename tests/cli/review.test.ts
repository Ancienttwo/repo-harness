import { afterEach, expect, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskReviewRunner } from '../../src/effects/review-runner/task-review-runner';
import { buildReviewCommand, pullRequestSelectionFromOptions } from '../../src/cli/commands/review';
import { renderAcceptanceClaim, validateReviewPublishReceipt } from '../../src/core/review/review-publish';
import { createReviewAdmission, reviewCampaignKey, type ReviewAdmissionInput } from '../../src/core/review/authority-context';
import { readReviewAdmission } from '../../src/effects/admission/admission-store';
import { gatesDirectoryName } from '../../src/effects/git/repository-identity';
import * as accountHome from '../../src/effects/runtime/os-account-home';
import { hashVerificationPlan } from '../../src/core/evidence/verification-plan';
import { controlApprovalFixture } from '../helpers/control-approval-fixture';
import { initGitRepo, tmpWorkspace } from '../helpers/repo-fixture';
import { recordPluginSelection } from '../helpers/install-ownership';
import { PLUGIN_IDS, type PluginId, type PluginSelection } from '../../src/core/skill-surface/plugin-manifest';
import { HEAD as PUBLISH_HEAD, PR as PUBLISH_PR, installFakeGh, passingScenario } from '../helpers/publication-merge-fake-gh';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

function peerGateFixture() {
  const root = tmpWorkspace('peer-gate'), home = join(root, 'home'); roots.push(root);
  const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, '.repo-harness'), BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' };
  const probe = join(root, 'probe.ts');
  writeFileSync(probe, String.raw`process.on('exit', () => process.stderr.write('peer-modules:' + JSON.stringify(Object.keys(require.cache).filter(path => /[\\/]src[\\/](?:effects[\\/](?:review-runner[\\/]|terminal[\\/](?:task-session|task-runtime-observation|native-task-session|herdr-notify-install|notify-relay)\.ts)|cli[\\/]commands[\\/](?:herdr|events)-actions\.ts)|[\\/]@botiverse[\\/]oar[\\/]|[\\/]assets[\\/]herdr[\\/]/.test(path))) + '\n'));`);
  const select = (plugins: readonly PluginId[], selection: PluginSelection = plugins) => recordPluginSelection(env, plugins, selection);
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, ['--preload', probe, join(import.meta.dir, '../../src/cli/index.ts'), ...args],
      { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
    const loaded = JSON.parse(/peer-modules:(\[[^\n]*\])/.exec(result.stderr)?.[1] ?? 'null');
    return { ...result, loaded };
  };
  const selectors = ['--repository-id', 'R', '--issue-id', 'I', '--campaign-id', 'C', '--grant-sha256', hash('grant'), '--policy-sha256', hash('policy'), '--actor', 'U'];
  return { root, env, select, run, selectors };
}

test('peer-runtime guards refuse before loading actions and preserve the recorded selection repair', () => {
  const f = peerGateFixture();
  const round = ['--reviewer-repo', f.root, '--claim-ref', 'claim', '--claim-revision', hash('claim'), '--verification', 'missing.json'];
  const commands = [
    ...['round', 'status', 'close', 'cancel'].map(op => ['review', op, ...f.selectors, ...(op === 'round' ? round : [])]),
    ['herdr', 'notify', 'install'], ['herdr', 'notify', 'start'], ['herdr', 'notify', 'uninstall'],
    ['herdr', 'notify', 'relay', '--home', f.root], ['events', 'install'],
    ['operator', 'cleanup-investigation-job', 'session', 'job', '1'],
  ];
  for (const selection of [['operator'], 'all'] as const) {
    f.select(['operator'], selection);
    for (const args of commands) {
      const result = f.run(args);
      expect(result.status, `${args.join(' ')}: ${result.stderr}`).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('install_plugin_unavailable: ');
      expect(result.stderr).toContain(selection === 'all' ? 'run: repo-harness update\n' : 'run: repo-harness install --plugins operator,peer-runtime\n');
      expect(result.loaded).toEqual([]);
    }
  }
});

test('core commands and help load no peer-runtime modules; a selected action loads its body', () => {
  const f = peerGateFixture(); f.select([]);
  for (const args of [
    ['status', '--json'], ['doctor', '--json'], ['seats', 'argv', 'worker', '--json'],
    ['review', 'admit', '--request', 'missing.json'], ['review', 'revoke', '--request', 'missing.json'],
    ['review', 'publish', '--pr', '1', '--receipt', 'missing.json'],
    ['review', 'round', '--help'], ['herdr', 'notify', 'install', '--help'], ['events', 'install', '--help'],
  ]) {
    const result = f.run(args);
    expect(result.error).toBeUndefined();
    expect(result.stderr).not.toContain('install_plugin_unavailable: ');
    expect(result.loaded, args.join(' ')).toEqual([]);
  }
  f.select(PLUGIN_IDS, 'all');
  const selected = f.run(['herdr', 'notify', 'start']);
  expect(selected.status).toBe(1); // A private HOME has no notify config and starts no terminal.
  expect(selected.stderr).not.toContain('install_plugin_unavailable: ');
  expect(selected.loaded).toContainEqual(expect.stringContaining('/commands/herdr-actions.ts'));
});

function fixture() {
  const root = tmpWorkspace('review-cli-repo'), home = tmpWorkspace('review-cli-home'); roots.push(root, home); initGitRepo(root);
  const input: ReviewAdmissionInput = { issue_number: 903, execution_mode: 'contract', repository_id: 'R_provider', issue_id: 'I_903',
    campaign_id: 'review', actor_id: 'U_owner', goal: { revision: 'goal-1', content: 'Preserve feedback and acceptance.' }, oracles: [],
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: hash('policy') }, allowed_paths: ['src/**'], benchmark: 'not_required',
    verification_plan: { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'true', cwd: '.', phase: 'verification',
      cost: 'normal', evidence_policy: 'current_exact', necessity: 'Check the feature.', inputs: { env: [] } }] } };
  const admission = createReviewAdmission(input);
  const identity = { repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id };
  const active = join(home, '.repo-harness', 'gates', gatesDirectoryName(root), 'review-admissions', reviewCampaignKey(identity).slice(7), 'active.json');
  const request = (name: string, body: unknown) => { const file = join(root, `${name}.json`); writeFileSync(file, JSON.stringify(body)); return file; };
  const read = (grant: string) => readReviewAdmission({ repoRoot: root, authorityHome: home, ...identity, expectedGrantSha256: grant,
    expectedPolicySha256: input.policy.policy_sha256, expectedActor: input.actor_id, expectedGoal: input.goal,
    round: { subject: { status: 'ok', scope: 'normalized-final-content', target_ref: 'main', target_rev: '1'.repeat(40), head_rev: '2'.repeat(40),
      review_subject_sha256: hash('content') }, verification: { plan_sha256: hashVerificationPlan(input.verification_plan),
      source_sha256: hash('source'), evidence_sha256: hash('report'), tree_sha256: hash('tree') } } });
  return { root, home, input, admission, identity, active, request, read };
}

async function runReview(home: string, args: readonly string[]) {
  // Only the account home is redirected; the command still uses the real store, locks and CAS.
  const homeSpy = spyOn(accountHome, 'osAccountHome').mockReturnValue(home);
  const exitCode = process.exitCode;
  let stdout = '', stderr = '';
  const out = spyOn(console, 'log').mockImplementation((value: unknown) => { stdout += `${String(value)}\n`; });
  const err = spyOn(console, 'error').mockImplementation((value: unknown) => { stderr += `${String(value)}\n`; });
  try {
    process.exitCode = 0;
    await buildReviewCommand(() => taskReviewRunner).parseAsync([...args], { from: 'user' });
    return { status: Number(process.exitCode ?? 0), stdout, stderr };
  } finally {
    homeSpy.mockRestore(); out.mockRestore(); err.mockRestore(); process.exitCode = exitCode;
  }
}

test('review revoke applies an exact active-grant CAS and task consumers observe the revocation', async () => {
  const f = fixture();
  const admitted = await runReview(f.home, ['admit', '--repo', f.root, '--request', f.request('admit', {
    admission: f.input, approval: controlApprovalFixture(f.root, f.admission, 0), expectedRevision: 0 })]);
  expect(admitted.status, admitted.stderr).toBe(0);
  const grant = JSON.parse(admitted.stdout).grant_sha256 as string;
  expect(f.read(grant).revision).toBe(1);
  const revoke = (name: string, changes: Record<string, unknown>) => runReview(f.home, ['revoke', '--repo', f.root, '--request',
    f.request(name, { ...f.identity, expectedGrantSha256: grant, expectedRevision: 1, ...changes })]);

  const before = readFileSync(f.active, 'utf8');
  const stale = await revoke('stale-grant', { expectedGrantSha256: hash('stale grant') });
  expect(stale.status).toBe(1);
  expect(stale.stderr).toContain('review revoke: review_admission_revoked_or_replaced');
  const staleRevision = await revoke('stale-revision', { expectedRevision: 0 });
  expect(staleRevision.status).toBe(1);
  expect(staleRevision.stderr).toContain('review_admission_revision_changed');
  const unknown = await revoke('unknown', { campaign_id: 'unknown-campaign' });
  expect(unknown.status).toBe(1);
  expect(unknown.stderr).toContain('review_admission_missing');
  const extra = await revoke('extra-field', { approval: {} });
  expect(extra.status).toBe(1);
  expect(extra.stderr).toContain('review_control_request_invalid');
  expect(readFileSync(f.active, 'utf8')).toBe(before);
  expect(f.read(grant).revision).toBe(1);

  const revoked = await revoke('revoke', {});
  expect(revoked.status, revoked.stderr).toBe(0);
  expect(JSON.parse(revoked.stdout)).toEqual({ revision: 2, revoked_grant_sha256: grant });
  expect(() => f.read(grant)).toThrow('revoked_or_replaced');
  const again = await revoke('revoke-again', { expectedRevision: 2 });
  expect(again.status).toBe(1);
  expect(again.stderr).toContain('review_admission_revoked_or_replaced');
});
const publishHome = () => { const home = tmpWorkspace('review-publish-home'); roots.push(home); return home; };

function publishReceipt(overrides: Record<string, unknown> = {}) {
  return {
    protocol: 1,
    kind: 'repo-harness-review-publish-receipt',
    round: 1,
    subject_sha: PUBLISH_HEAD,
    risk_tier: 'high',
    reviewer: { harness: 'codex', actual_model: 'gpt-5.1-codex' },
    verdict: 'FAIL',
    model_relation: 'different-family',
    summary: 'One blocking finding and one NIT.',
    findings: [
      { id: 'F1', severity: 'P1', path: 'src/example.ts', line: 12, evidence: 'The guard drops the last item.', fix: 'Use the inclusive bound.' },
      { id: 'N1', severity: 'P3', message: 'Rename the helper for clarity.' },
    ],
    ...overrides,
  };
}

// Lines 10-14 of src/example.ts are in the PR diff; the default F1 finding sits on line 12.
const DIFF_PATCH = '@@ -10,3 +10,5 @@\n context\n-old\n+new\n+added\n context\n context\n';
const publishScenario = (overrides: Parameters<typeof passingScenario>[0] = {}) =>
  passingScenario({ changedFiles: [{ filename: 'src/example.ts', patch: DIFF_PATCH }], ...overrides });

function publishFixture(scenario = publishScenario()) {
  const root = tmpWorkspace('review-publish-root'); roots.push(root);
  const gh = installFakeGh(root, scenario);
  return { root, gh, receipt: join(root, 'receipt.json') };
}

async function runPublish(fixture: ReturnType<typeof publishFixture>, receipt: unknown, extraArgs: readonly string[] = []) {
  writeFileSync(fixture.receipt, JSON.stringify(receipt));
  const previous = process.env.REPO_HARNESS_GH_BIN;
  process.env.REPO_HARNESS_GH_BIN = fixture.gh.bin;
  try {
    return await runReview(publishHome(), ['publish', '--repo', fixture.root, '--pr', String(PUBLISH_PR), '--receipt', fixture.receipt, '--json', ...extraArgs]);
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_GH_BIN;
    else process.env.REPO_HARNESS_GH_BIN = previous;
  }
}

function postedInputs(fixture: ReturnType<typeof publishFixture>, suffix: string) {
  return fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg === suffix || arg.endsWith(suffix)));
}

test('publish posts the claim, one review thread per P1/P2, then the record', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: true, pr: PUBLISH_PR, head_sha: PUBLISH_HEAD, round: 1, threads: 1 });
  expect(output.claim_url).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.review_url).toContain('#pullrequestreview-');
  expect(output.record_url).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');

  const posts = fixture.gh.inputs().filter((entry) => entry.input !== '').map((entry) => JSON.parse(entry.input));
  expect(posts).toHaveLength(3);
  expect(posts[0].body).toContain('repo-harness acceptance claim\nRole: acceptor\n');
  expect(posts[0].body).toContain('Tier: high');
  expect(posts[0].body).toContain('Agent: codex (gpt-5.1-codex), read-only');
  expect(posts[1]).toMatchObject({ commit_id: PUBLISH_HEAD, event: 'COMMENT' });
  expect(posts[1].comments).toHaveLength(1);
  expect(posts[1].comments[0]).toMatchObject({ path: 'src/example.ts', line: 12, side: 'RIGHT' });
  expect(posts[1].comments[0].body).toContain('The guard drops the last item.');
  expect(posts[1].comments[0].body).toContain('Use the inclusive bound.');
  expect(posts[1].body).toContain('Rename the helper for clarity.');
  expect(posts[1].body).not.toContain('The guard drops the last item.');
  expect(posts[1].comments[0].body).not.toContain('Rename the helper for clarity.');
  expect(posts[2].body).toContain('repo-harness acceptance record');
  expect(posts[2].body).toContain('Model relation: different-family');
  expect(posts[2].body).toContain('FAIL: 1 P1, 1 P3');
  expect(posts[2].body).toContain(output.claim_url);
  expect(posts[2].body).toContain('read-only');
  expect(posts[2].body).not.toContain('fresh context');
});

test('a FAIL receipt with no blocking finding is invalid and posts nothing', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ findings: [{ id: 'N1', severity: 'P3', message: 'Only a NIT.' }] }));
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_receipt_invalid', exit_code: 2, posted: [] });
  expect(fixture.gh.calls()).toEqual([]);
});

const OWNER_BASE = 'https://github.com/example/repo-harness';
const ownerRecord = (path: string) => OWNER_BASE + path + '#issuecomment-900';

test('a round above 5 without an owner record is refused and posts nothing', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ round: 6 }));
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_receipt_invalid', posted: [] });
  expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

test('a round above 5 with an owner record on the PR names it in the claim and the record', async () => {
  const url = ownerRecord('/pull/' + PUBLISH_PR);
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ round: 6 }), ['--owner-record', url]);
  expect(result.status, result.stderr).toBe(0);
  const posts = fixture.gh.inputs().filter((entry) => entry.input !== '').map((entry) => JSON.parse(entry.input));
  expect(posts[0].body).toContain('Round: 6\n');
  expect(posts[0].body).toContain('Owner record: ' + url);
  expect(posts[2].body).toContain('Owner record: ' + url);
});

test('a round above 5 accepts an owner record on an issue the PR closes and refuses other issues', async () => {
  const closing = publishFixture(publishScenario({ closing: ['example/repo-harness#2000'] }));
  const accepted = await runPublish(closing, publishReceipt({ round: 6 }), ['--owner-record', ownerRecord('/issues/2000')]);
  expect(accepted.status, accepted.stderr).toBe(0);
  const other = publishFixture(publishScenario({ closing: ['example/repo-harness#2000'] }));
  const refused = await runPublish(other, publishReceipt({ round: 6 }), ['--owner-record', ownerRecord('/issues/2001')]);
  expect(refused.status).toBe(2);
  expect(other.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

test('an owner record must match the closing issue repository and the path kind', async () => {
  const refuse = async (closing: string, path: string) => {
    const fixture = publishFixture(publishScenario({ closing: [closing] }));
    const result = await runPublish(fixture, publishReceipt({ round: 6 }), ['--owner-record', ownerRecord(path)]);
    expect(result.status).toBe(2);
    expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
  };
  await refuse('other/repo#2000', '/issues/2000');
  await refuse('example/repo-harness#2000', '/pull/2000');
});

test('an owner record with a round up to 5 is refused', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ round: 5 }), ['--owner-record', ownerRecord('/pull/' + PUBLISH_PR)]);
  expect(result.status).toBe(2);
  expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

test('a stale subject exits 2 and posts nothing', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ subject_sha: 'b'.repeat(40) }));
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_subject_stale', exit_code: 2, posted: [] });
  expect(fixture.gh.calls().some((args) => args.includes('POST'))).toBe(false);
  expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

test('a PASS receipt with no P1/P2 opens no review thread', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ verdict: 'PASS', findings: [
    { id: 'N1', severity: 'P3', message: 'Rename the helper for clarity.' },
  ] }));
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, threads: 0 });
  const review = JSON.parse(postedInputs(fixture, '/reviews')[0]!.input);
  expect(review.comments ?? []).toEqual([]);
  expect(review.body).toContain('Rename the helper for clarity.');
  expect(review.event).toBe('COMMENT');
});

test('a finding outside the diff goes into the review body, not an inline comment', async () => {
  const fixture = publishFixture();
  const outside = { id: 'F2', severity: 'P2', path: 'src/example.ts', line: 15, evidence: 'A pre-existing call site ignores the result.', fix: 'Check the result.' };
  const result = await runPublish(fixture, publishReceipt({ findings: [
    { id: 'F1', severity: 'P1', path: 'src/example.ts', line: 12, evidence: 'The guard drops the last item.', fix: 'Use the inclusive bound.' }, outside] }));
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, threads: 1 });
  const review = JSON.parse(postedInputs(fixture, '/reviews')[0]!.input);
  expect(review.comments).toHaveLength(1);
  expect(review.comments[0].line).toBe(12);
  expect(review.body).toContain('## Findings outside the diff');
  expect(review.body).toContain('F2 at src/example.ts:15');
  expect(review.body).not.toContain('F1 at');
});

test('a retry reuses the claim already on the PR instead of posting a second one', async () => {
  const claimUrl = 'https://github.com/example/repo-harness/pull/' + PUBLISH_PR + '#issuecomment-777';
  const claimBody = renderAcceptanceClaim(validateReviewPublishReceipt(publishReceipt()));
  const fixture = publishFixture(publishScenario({ existingComments: [{ body: claimBody, html_url: claimUrl }] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).claim_url).toBe(claimUrl);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance claim'))).toHaveLength(0);
  expect(JSON.parse(postedInputs(fixture, '/issues/' + PUBLISH_PR + '/comments').find((entry) => entry.input !== '')!.input).body).toContain('Claim: ' + claimUrl);
});

test('a later conflicting claim for the same subject and round stops the retry even after an identical one', async () => {
  const claimBody = renderAcceptanceClaim(validateReviewPublishReceipt(publishReceipt({ risk_tier: 'low' })));
  const fixture = publishFixture(publishScenario({ existingComments: [
    { body: renderAcceptanceClaim(validateReviewPublishReceipt(publishReceipt())), html_url: 'https://github.com/example/repo-harness/pull/' + PUBLISH_PR + '#issuecomment-777' },
    { body: claimBody, html_url: 'https://github.com/example/repo-harness/pull/' + PUBLISH_PR + '#issuecomment-778' }] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_publish_conflict', exit_code: 2, posted: [] });
  expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

// A High round has two reviews of one subject (acceptor.md section 2.2): they publish in turn, each with its own claim (#2061).
test('a second reviewer agent of the same subject and round posts its own claim and record', async () => {
  const pass = (harness: string, actual_model: string) => publishReceipt({ reviewer: { harness, actual_model }, verdict: 'PASS', summary: 'No blocking finding.', findings: [] });
  const posted = (fixture: ReturnType<typeof publishFixture>) => postedInputs(fixture, '/issues/' + PUBLISH_PR + '/comments')
    .filter((entry) => entry.input !== '').map((entry) => (JSON.parse(entry.input) as { body: string }).body);
  const first = publishFixture();
  const gatekeeper = await runPublish(first, pass('codex', 'gpt-5.1-codex'));
  expect(gatekeeper.status, gatekeeper.stderr).toBe(0);
  const firstClaim = JSON.parse(gatekeeper.stdout).claim_url as string;
  const [claimBody, recordBody] = posted(first);
  const second = publishFixture(publishScenario({ existingComments: [{ body: claimBody!, html_url: firstClaim }, { body: recordBody!, html_url: JSON.parse(gatekeeper.stdout).record_url }] }));
  const reviewer = await runPublish(second, pass('claude', 'claude-opus-5-5'));
  expect(reviewer.status, reviewer.stderr).toBe(0);
  const secondClaim = JSON.parse(reviewer.stdout).claim_url as string;
  expect(secondClaim).not.toBe(firstClaim);
  expect(posted(second).map((body) => body.split('\n')[0])).toEqual(['repo-harness acceptance claim', 'repo-harness acceptance record']);
  expect([recordBody, posted(second)[1]].map((body) => body!.split('\n')[1])).toEqual(['Claim: ' + firstClaim, 'Claim: ' + secondClaim]);
});

test('a failure after the claim stops with review_publish_partial and the posted URLs', async () => {
  const fixture = publishFixture(publishScenario({ failPost: 'review' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a POST with an unknown outcome exits 5 with the confirmed URLs and is not retried', async () => {
  const fixture = publishFixture(publishScenario({ unknownPost: 'review' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.confirmed_urls).toEqual(output.posted);
  expect(output.message).toContain('inspection is required');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a claim POST with no provider answer exits 5 with no confirmed URL and requires inspection', async () => {
  const fixture = publishFixture(publishScenario({ unknownPost: 'claim', unknownPostMode: 'timeout' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true, posted: [] });
  expect(output.confirmed_urls).toEqual([]);
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(0);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a POST transport failure with exit 1 and EOF reports the unknown outcome', async () => {
  const fixture = publishFixture(publishScenario({ unknownPost: 'review', unknownPostMode: 'transport' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.message).toContain('gh: EOF');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a record POST whose response fails URL validation exits 5 and keeps the confirmed URLs', async () => {
  const fixture = publishFixture(publishScenario({ unknownPost: 'record', unknownPostMode: 'bad_url' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(2);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.posted[1]).toContain('#pullrequestreview-');
  expect(output.confirmed_urls).toEqual(output.posted);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(1);
});

test('a valid review URL with a wrong binding or state is retained in the unknown outcome', async () => {
  for (const reviewBinding of ['wrong_commit', 'wrong_state'] as const) {
    const fixture = publishFixture(publishScenario({ reviewBinding }));
    const result = await runPublish(fixture, publishReceipt());
    expect(result.status).toBe(5);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
    expect(output.posted).toHaveLength(2);
    expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
    expect(output.posted[1]).toContain('#pullrequestreview-');
    expect(output.confirmed_urls).toEqual(output.posted);
    expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
    expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
  }
});

test('head movement between the claim and the review stops before the review', async () => {
  const moved = 'f'.repeat(40);
  const fixture = publishFixture(publishScenario({ headSequence: [PUBLISH_HEAD, moved] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.message).toContain('head moved');
  expect(output.message).toContain('inspection is required');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(0);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('head movement between the review and the record stops before the record', async () => {
  const moved = 'f'.repeat(40);
  const fixture = publishFixture(publishScenario({ headSequence: [PUBLISH_HEAD, PUBLISH_HEAD, moved] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(2);
  expect(output.posted[1]).toContain('#pullrequestreview-');
  expect(output.message).toContain('before the record');
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});


test('review round registers one admission repository id and parses the optional PR selection', () => {
  const command = buildReviewCommand(() => taskReviewRunner);
  const round = command.commands.find((child) => child.name() === 'round');
  if (!round) throw new Error('review round is missing');
  const longs = round.options.map((option) => option.long).filter((value): value is string => value !== undefined);
  expect(longs.filter((value) => value === '--repository-id')).toHaveLength(1);
  expect(longs).toEqual(expect.arrayContaining(['--repository', '--pr', '--base']));
  // Parse the flags without running the action.
  round.parseOptions(['--repository-id', '1001', '--repository', 'example/repo-harness', '--pr', '42', '--base', 'b'.repeat(40)]);
  expect(round.opts()).toMatchObject({ repositoryId: '1001', repository: 'example/repo-harness', pr: '42', base: 'b'.repeat(40) });
});

test('review round refuses the classic --launch herdr value before it reads the admission', async () => {
  const home = publishHome();
  const required = ['--repository-id', '1001', '--issue-id', 'I_1', '--campaign-id', 'review', '--grant-sha256', hash('grant'),
    '--policy-sha256', hash('policy'), '--actor', 'U_owner', '--reviewer-repo', home, '--claim-ref', 'claim', '--claim-revision', hash('claim'),
    '--verification', 'report.json', '--repo', home];
  const classic = await runReview(home, ['round', ...required, '--launch', 'herdr', '--herdr-endpoint', join(home, 'endpoint.json')]);
  expect(classic.status).toBe(1);
  expect(classic.stderr).toContain('review: review_launch_unsupported');
  const unaddressed = await runReview(home, ['round', ...required]);
  expect(unaddressed.status).toBe(1);
  expect(unaddressed.stderr).toContain('review_launch_addressing_invalid; --herdr-endpoint is required for herdr-app');
});

test('the optional PR selection is all-or-none and admission identity alone is not a selection', () => {
  const admission = { repositoryId: '1001' };
  expect(pullRequestSelectionFromOptions(admission)).toBeUndefined();
  for (const partial of [
    { repository: 'example/repo-harness' },
    { pr: '42' },
    { base: 'b'.repeat(40) },
    { repository: 'example/repo-harness', pr: '42' },
  ]) {
    expect(() => pullRequestSelectionFromOptions({ ...admission, ...partial }))
      .toThrow('--repository, --pr and --base must be given together');
  }
  expect(pullRequestSelectionFromOptions({ ...admission, repository: 'example/repo-harness', pr: '42', base: 'b'.repeat(40) }))
    .toEqual({ repository: 'example/repo-harness', provider_repository_id: '1001', pr_number: 42, expected_base_sha: 'b'.repeat(40) });
});

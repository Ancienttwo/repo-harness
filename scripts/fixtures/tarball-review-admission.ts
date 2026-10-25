/** Offline upstream fixture for check-tarball-install-smoke.sh. All production
 * imports resolve from the installed tarball. This does not authenticate a user
 * or contact GitHub; it supplies one explicitly authorized synthetic Bot request.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [, , installed, repoArg, homeArg, fixtureDir] = process.argv;
const repo = realpathSync(repoArg!), home = realpathSync(homeArg!);
const load = (path: string) => import(pathToFileURL(join(installed!, path)).href);
const { parseExternalSourcesPolicy } = await load('src/effects/external-sources/policy.ts');
const { observeReviewIssueGoal } = await load('src/effects/review/issue-goal.ts');
const { createReviewAdmission } = await load('src/core/review/authority-context.ts');
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const external_sources = { version: 1, mode: 'manual', github: { enabled: true,
  repository: 'example/tarball-smoke', selection: { kind: 'issue_numbers', issue_numbers: [1] },
  limits: { max_pages: 1, max_issues: 1, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 } } };
const providerRepo = { id: 1001, full_name: 'example/tarball-smoke', html_url: 'https://github.com/example/tarball-smoke' };
const issue = { id: 2001, number: 1, html_url: 'https://github.com/example/tarball-smoke/issues/1', state: 'open',
  title: 'Verify installed package', body: 'Execute once and reuse exact admitted verification evidence.', updated_at: '2026-10-25T00:00:00Z' };
const responses = { 'repos/example/tarball-smoke': providerRepo, 'repos/example/tarball-smoke/issues/1': issue };
const runner = (args: readonly string[]) => {
  const endpoint = Object.keys(responses).find(key => args.includes(key));
  if (!endpoint) throw new Error('unexpected smoke provider endpoint');
  return { stdout: JSON.stringify(responses[endpoint as keyof typeof responses]) };
};
const goal = observeReviewIssueGoal({ policy: parseExternalSourcesPolicy(external_sources), repository_id: '1001', issue_id: '2001', runner });
const admission = { repository_id: '1001', issue_id: '2001', campaign_id: 'tarball-smoke', actor_id: 'synthetic-execution-actor', goal,
  policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: digest('synthetic-tarball-smoke-policy') },
  allowed_paths: ['*'], benchmark: 'not_required', oracles: [{ id: 'single-count', kind: 'deterministic_test', paths: ['*'] }],
  verification_plan: { protocol: 1, checks: [{ id: 'single-count', kind: 'command',
    command: "mkdir -p .smoke && printf 'executed\\n' >> .smoke/execution-count", cwd: '.', phase: 'verification', cost: 'normal',
    evidence_policy: 'current_exact', necessity: 'prove packaged verification execution and exact-context reuse', inputs: { env: [] } }] } };
const approved = createReviewAdmission(admission);
const now = Date.now();
const approval = { protocol: 1, kind: 'repo-harness-upstream-control-approval', authorization_ref: 'synthetic-tarball-smoke-upstream-authorization',
  bot_id: 'synthetic-smoke-bot', action: 'admit', repository_id: admission.repository_id, issue_id: admission.issue_id,
  campaign_id: admission.campaign_id, execution_actor: admission.actor_id,
  parent_scope: { issue_ids: [admission.issue_id], allowed_paths: admission.allowed_paths, policy: admission.policy,
    benchmark: admission.benchmark, not_before: now - 1000, expires_at: now + 3_600_000 },
  admission_sha256: approved.admission_sha256, repository_root: repo, expected_revision: 0, expires_at: now + 3_599_000 };
mkdirSync(join(fixtureDir!, 'bin'), { recursive: true });
writeFileSync(join(fixtureDir!, 'request.json'), JSON.stringify({ admission, approval, expectedRevision: 0 }));
const policyPath = join(repo, '.ai/harness/policy.json');
const existingPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
writeFileSync(policyPath, JSON.stringify({ ...existingPolicy, external_sources }));
writeFileSync(join(fixtureDir!, 'bootstrap.ts'), `import {mock} from 'bun:test';\nmock.module(${JSON.stringify(join(installed!, 'src/effects/runtime/os-account-home.ts'))},()=>({osAccountHome:()=>${JSON.stringify(home)}}));\n`);
writeFileSync(join(fixtureDir!, 'bin/gh'), `#!${process.execPath}\nconst responses=${JSON.stringify(responses)};const key=Object.keys(responses).find(key=>process.argv.slice(2).includes(key));if(!key)process.exit(1);process.stdout.write(JSON.stringify(responses[key]));\n`, { mode: 0o700 });

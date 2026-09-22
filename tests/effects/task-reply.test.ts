import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { buildClaimActorReceipt } from '../../src/core/engineers/principal-claim';
import { buildTaskMessageEvent, canonicalTaskMessageEventBytes } from '../../src/core/fleet/task-message';
import { bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { withEngineerTaskInbox } from '../../src/effects/engineers/task-inbox';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { enrollEngineerPrincipal, revokeEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { resolveEngineerPrincipal } from '../../src/effects/engineers/principal';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { acknowledgeTaskSteer, consumeTaskSteer, deliverTaskInbox, observeTaskSteers, readTaskSteerReply, replyToTaskSteer, sendTaskMessage, taskInboxTaskDirectory, taskInboxEventPath, type TaskReplyWriteBoundary } from '../../src/effects/fleet/task-inbox';
import { validateFleetWorkEnvelope, type WorkEnvelopeV1 } from '../../src/effects/fleet/acquire';
import { readCanonicalTaskPlanProof } from '../../src/effects/state/coordination-canonical-source';
import { createLeaseDirectory, readLease, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { readRepoHarnessRegistrySnapshot, repoHarnessRepoIdFor, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { callMcpTool } from '../../src/cli/mcp/tools';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { fixtureTaskId } from '../helpers/sprint-fixture';
import { taskInboxRecipientStorageKey } from '../../src/core/fleet/task-inbox-layout';
import { migrateTaskInboxLayout } from '../../src/effects/fleet/task-inbox-layout-migration';
import { inboxLayoutPaths } from '../../src/effects/fleet/task-inbox-layout';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const ENGINEER = 'engineer:capability.verification.evals-checks';
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
const AT = '2026-09-22T00:00:00.000Z';
const SPRINT = 'plans/sprints/reply.sprint.md', TASK = 'implement reply', PLAN = 'plans/plan-reply.md';
const roots: string[] = [];
const initialHome = process.env.REPO_HARNESS_HOME;
const PROJECT = resolve(import.meta.dir, '../..');
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); if (initialHome === undefined) delete process.env.REPO_HARNESS_HOME; else process.env.REPO_HARNESS_HOME = initialHome; });
function git(root: string, ...args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function fixture(parentBody = 'Inspect existing work before answering.', deep = false) {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'task-reply-effects-'))); roots.push(container);
  const root = deep ? join(container, 'nested-repository-'.repeat(4)) : container;
  if (deep) mkdirSync(root);
  const home = join(root, 'test-home'); mkdirSync(home); process.env.REPO_HARNESS_HOME = home;
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  for (const dir of ['plans/sprints', 'tasks/contracts', '.ai/harness/sprint', '.archcontext/model', 'agents']) mkdirSync(join(root, dir), { recursive: true });
  cpSync(join(PROJECT, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(PROJECT, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'test-home/\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{"worktree_strategy":{"merge_back":{"target":"main"}}}\n');
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${SPRINT}\n`);
  const task_id = fixtureTaskId(TASK);
  const task_revision = deriveTaskRevision({ taskCell: TASK, taskId: task_id, modeCell: 'contract', acceptanceCell: 'reply proof' });
  writeFileSync(join(root, SPRINT), `# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|--------|------|------|------------|------|\n| 1 | ${task_id} | [ ] | ${TASK} | contract | reply proof | ${PLAN} |\n`);
  writeFileSync(join(root, PLAN), `# Plan\n\n> **Status**: Approved\n> **Source Ref**: sprint:${SPRINT}#${TASK}\n> **Artifact Level**: work-package\n> **Promotion Reason**: verification_boundary\n> **Verification Boundary**: reply tests\n> **Rollback Surface**: revert reply\n> **Task Contract**: tasks/contracts/reply.contract.md\n\n## Promotion Gate\n- **Merge/PR unit**: reply\n- **Rollback surface**: revert reply\n- **Verification boundary**: reply tests\n- **Review/acceptance boundary**: independent review\n- **High-risk surface**: authority\n- **Why not checklist row**: independent boundary\n\n## Evidence Contract\n- **State/progress path**: plan\n- **Verification evidence**: tests\n- **Evaluator rubric**: review\n- **Stop condition**: pass\n- **Rollback surface**: revert reply\n`);
  writeFileSync(join(root, 'tasks/contracts/reply.contract.md'), `# Contract\n\n> **Plan**: ${PLAN}\n\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - README.md\n\`\`\`\n`);
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'fixture');
  setRepoHarnessAccessMode(root, 'read_write', { env });
  const profile = loadEngineerProfile(root, ENGINEER);
  bindEngineer(root, { engineer_id: ENGINEER, idempotency_key: 'bind', provider: 'codex-app-thread', provider_thread_id: 'test-thread', host_id: 'local', engineer_contract_revision: profile.engineer_contract_revision, expected_current_digest: null, expected_binding_generation: 0, expected_binding_id: null, expected_engineer_contract_revision: profile.engineer_contract_revision, binding_id: () => id(1), now: () => AT });
  const binding = readEngineerBindingStatus(root, ENGINEER, profile.engineer_contract_revision).binding!;
  enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(root), authorization_id: id(2), binding, env, created_at: AT });
  const proof = readCanonicalTaskPlanProof(root, { sprintPath: SPRINT, taskCell: TASK });
  if (!proof.ok) throw new Error(proof.error);
  const { projectable: _, ...plan } = proof.proof;
  const work: WorkEnvelopeV1 = { protocol: 1, kind: 'repo-harness-work-envelope', repo_id: repoHarnessRepoIdFor(root), task_id, task_revision, sprint_path: SPRINT, claim_id: id(3), generation: 1, worktree_path: root, branch: 'main', unit_ref: PLAN, authorization_revision: readRepoHarnessRegistrySnapshot({ env }).authorizationRevision, offer_revision: `sha256:${'1'.repeat(64)}`, canonical_target: { ref: 'main', oid: git(root, 'rev-parse', 'HEAD') }, plan, claim_token: { path: '.ai/harness/claim-token', task_id, claim_id: id(3), sprint: SPRINT, task: TASK, unit_ref: PLAN } };
  const owner = buildLeaseOwnerRecord({ claimId: work.claim_id, taskId: task_id, taskRevision: task_revision, sprintPath: SPRINT, targetRef: 'main', generation: 1, sessionId: 'session', sourceWorktree: root });
  const bound = bindLeaseRecord(owner, { claimId: work.claim_id, executionWorktree: root, branch: 'main', unitRef: PLAN });
  if (!bound.ok) throw new Error(bound.error);
  createLeaseDirectory(root, task_id); writeLeaseOwnerDurably(root, task_id, bound.record);
  const actor = buildClaimActorReceipt({ envelope: work, principal: resolveEngineerPrincipal({ repo_root: root, authorization_id: id(2), env }), session_id: 'session', bound_at: AT });
  publishClaimActorReceipt(root, actor);
  let authorized = true;
  const verify_authorization = () => { if (!authorized) throw new Error('request token revoked'); };
  const input = { repo_root: root, authorization_id: id(2), work_envelope: work, verify_authorization, env };
  const parent = buildTaskMessageEvent({ message_id: id(4), task_id, task_revision, scope: 'task', target_claim_id: null, target_generation: null, sender_kind: 'operator', sender_id: 'operator', sender_trust: 'local_operator', audience: 'owner', body: parentBody, created_at: AT, in_reply_to: null });
  sendTaskMessage({ repo_root: root, canonical_source: { targetRef: 'main', sprintPath: SPRINT }, event: parent });
  const consume = () => withEngineerTaskInbox(input, inbox => consumeTaskSteer({ ...inbox, message_id: parent.message_id, event_digest: parent.event_digest, now: AT }));
  const ack = () => withEngineerTaskInbox(input, inbox => acknowledgeTaskSteer({ ...inbox, message_id: parent.message_id, event_digest: parent.event_digest, now: AT }));
  const query = () => withEngineerTaskInbox(input, inbox => observeTaskSteers(inbox));
  const replyArgs = { parent_message_id: parent.message_id, parent_event_digest: parent.event_digest, reply_message_id: id(5), body: 'Existing work inspected; no side effects repeated.', now: () => AT };
  const reply = (crash_hook?: (boundary: TaskReplyWriteBoundary) => void) => withEngineerTaskInbox(input, inbox => replyToTaskSteer({ ...inbox, ...replyArgs, crash_hook }));
  const history = () => readTaskSteerReply({ repo_root: root, task_id, parent_message_id: parent.message_id, recipient: { kind: 'claim', claim_id: work.claim_id, generation: 1 } });
  return { root, home, env, work, parent, actor, input, consume, ack, query, reply, replyArgs, history, revokeToken: () => { authorized = false; } };
}

describe('protected Task reply storage and Engineer composition', () => {
  test('native deep-path delivery, ACK and reply retain the complete chain', () => {
    const f = fixture(undefined, true); f.consume(); f.ack(); f.reply();
    expect(f.history().observation.state).toBe('complete');
    const recipient = { kind: 'claim' as const, claim_id: f.work.claim_id, generation: 1 };
    const directory = join(taskInboxTaskDirectory(f.root, f.work.task_id), 'reply-effects', f.parent.message_id, taskInboxRecipientStorageKey(recipient));
    expect(join(directory, 'intent.json').length).toBeGreaterThan(260);
    expect(JSON.parse(readFileSync(join(directory, 'intent.json'), 'utf8')).intent_sha256).toBe(f.history().intent!.intent_sha256);
  });

  test.skipIf(process.platform === 'win32').each(['intent_published', 'event_published', 'commit_published'] as const)('offline migration preserves %s facts without live actor authority', boundary => {
      const f = fixture(); f.consume(); f.ack();
      expect(() => f.reply(point => { if (point === boundary) throw new Error('interrupted'); })).toThrow('interrupted');
      const before = f.history();
      const paths = inboxLayoutPaths(resolveGitCommonDirectory(f.root));
      const recipient = { kind: 'claim' as const, claim_id: f.work.claim_id, generation: 1 };
      const token = taskInboxRecipientStorageKey(recipient), legacyKey = `claim:${f.work.claim_id}:g1`;
      const delivery = join(paths.current, f.work.task_id, 'delivery', f.parent.message_id);
      renameSync(join(delivery, `${token}.json`), join(delivery, `${legacyKey}.json`));
      const replies = join(paths.current, f.work.task_id, 'reply-effects', f.parent.message_id);
      renameSync(join(replies, token), join(replies, legacyKey));
      renameSync(paths.current, paths.legacy);
      rmSync(join(resolveGitCommonDirectory(f.root), 'repo-harness/coordination/v1/leases', f.work.task_id), { recursive: true });
      rmSync(join(f.root, '.ai/harness/sprint/active-sprint'));
      const plan = migrateTaskInboxLayout({ repo_root: f.root });
      if (!plan.manifest) throw new Error('migration manifest required');
      migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: plan.manifest.source_sha256 });
      expect(f.history()).toEqual(before);
  });

  test('encoded record rejects before intent persistence and permits retry with the original reply ID', () => {
    const f = fixture('\u0001'.repeat(8192)); f.consume(); f.ack();
    expect(() => withEngineerTaskInbox(f.input, inbox => replyToTaskSteer({
      ...inbox, ...f.replyArgs, body: '\u0001'.repeat(8192),
    }))).toThrow('encoded reply record exceeds 65536 bytes');
    expect(f.history().observation.state).toBe('absent');
    const reply = f.reply();
    expect(reply.commit.effect_id).toBe(f.replyArgs.reply_message_id);
    expect(f.history().observation.state).toBe('complete');
    expect(f.reply().created).toBeFalse();
  });

  test.each(['intent', 'commit'] as const)('expiry during final %s canonical validation prevents publication', kind => {
    const f = fixture(); f.consume(); f.ack();
    if (kind === 'commit') expect(() => f.reply(boundary => {
      if (boundary === 'event_published') throw new Error('interrupted');
    })).toThrow('interrupted');
    let staged = false, validating = false, expired = false;
    const env = new Proxy(f.env, {
      get(target, property, receiver) {
        if (validating && property === 'REPO_HARNESS_HOME') expired = true;
        return Reflect.get(target, property, receiver);
      },
    });
    const verify_authorization = () => {
      if (expired) throw new Error('request token expired');
      if (staged) validating = true;
    };
    expect(() => withEngineerTaskInbox({ ...f.input, env, verify_authorization }, inbox => replyToTaskSteer({
      ...inbox, ...f.replyArgs, crash_hook: boundary => { if (boundary === `${kind}_file_fsynced`) staged = true; },
    }))).toThrow('request token expired');
    expect(expired).toBeTrue();
    expect(f.history().observation.state).toBe(kind === 'intent' ? 'absent' : 'event_uncommitted');
  });

  test.each(['delivery', 'ACK', 'event'] as const)('expiry during %s staging fsync prevents publication', kind => {
    const f = fixture();
    if (kind !== 'delivery') f.consume();
    if (kind === 'event') {
      f.ack();
      expect(() => f.reply(boundary => { if (boundary === 'intent_published') throw new Error('interrupted'); })).toThrow('interrupted');
    }
    let expired = false;
    const stagedDescriptors = new Set<number>();
    const open = fs.openSync, fsync = fs.fsyncSync;
    const staging = join(taskInboxTaskDirectory(f.root, f.work.task_id), 'staging', kind === 'event' ? 'events' : 'delivery');
    const openSpy = spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      const fd = open(...args);
      if (dirname(String(args[0])) === staging) stagedDescriptors.add(fd);
      return fd;
    });
    const syncSpy = spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      fsync(fd);
      if (stagedDescriptors.has(fd)) expired = true;
    });
    const verify_authorization = () => { if (expired) throw new Error('request token expired'); };
    try {
      expect(() => withEngineerTaskInbox({ ...f.input, verify_authorization }, inbox => {
        if (kind === 'event') return replyToTaskSteer({ ...inbox, ...f.replyArgs });
        const args = { ...inbox, message_id: f.parent.message_id, event_digest: f.parent.event_digest, now: AT };
        return kind === 'ACK' ? acknowledgeTaskSteer(args) : consumeTaskSteer(args);
      })).toThrow('request token expired');
    } finally { syncSpy.mockRestore(); openSpy.mockRestore(); }
    expect(expired).toBeTrue();
    const history = f.history();
    if (kind === 'event') expect(history.observation.state).toBe('intent_only');
    else expect(history.acknowledgement?.delivery_state ?? null).toBe(kind === 'ACK' ? 'delivered' : null);
  });

  test('mixed-case UUID pagination returns every original steer exactly once', () => {
    const f = fixture();
    const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB'];
    for (const message_id of ids) {
      const event = buildTaskMessageEvent({ ...f.parent, message_id });
      writeFileSync(taskInboxEventPath(f.root, f.work.task_id, message_id), `${canonicalTaskMessageEventBytes(event)}\n`);
    }
    const seen: string[] = [];
    let after: string | undefined;
    for (let n = 0; n < 4; n++) {
      const page = withEngineerTaskInbox(f.input, inbox => observeTaskSteers({ ...inbox, limit: 1, after }));
      seen.push(...page.entries.map(entry => entry.parent.message_id));
      if (!page.next_cursor) { expect(page.coverage.complete).toBeTrue(); break; }
      after = page.next_cursor;
    }
    expect(seen).toEqual([f.parent.message_id, ids[1], ids[0]]);
    expect(new Set(seen).size).toBe(3);
  });

  test('review recovery: unrelated canonical commits preserve communication but not acquisition or changed plans', () => {
    const f = fixture();
    git(f.root, 'commit', '--allow-empty', '-qm', 'unrelated main advancement');
    expect(() => validateFleetWorkEnvelope(f.root, f.work, f.env)).toThrow('canonical target moved');
    expect(f.query().entries[0]?.parent.message_id).toBe(f.parent.message_id);
    f.consume(); f.ack();
    expect(() => f.reply(boundary => { if (boundary === 'intent_published') throw new Error('interrupted'); })).toThrow('interrupted');
    git(f.root, 'commit', '--allow-empty', '-qm', 'another unrelated advancement');
    expect(f.query().entries[0]?.recovery?.body).toBe(f.replyArgs.body);
    expect(f.reply().commit.effect_id).toBe(f.replyArgs.reply_message_id);
    writeFileSync(join(f.root, PLAN), '# Different plan\n');
    git(f.root, 'add', PLAN); git(f.root, 'commit', '-qm', 'replace task plan');
    expect(() => f.query()).toThrow('plan or contract proof');
  });

  for (const [reason, count, body] of [['scan', 1001, 'old steer'], ['bytes', 300, 'x'.repeat(8000)]] as const) {
    test(`review recovery: exact parent survives ${reason} exhaustion without deleting history`, async () => {
      const f = fixture(); f.consume(); f.ack();
      expect(() => f.reply(boundary => { if (boundary === 'event_published') throw new Error('interrupted'); })).toThrow('interrupted');
      const directory = join(taskInboxTaskDirectory(f.root, f.work.task_id), 'events');
      for (let n = 100; n < count + 100; n++) {
        const event = buildTaskMessageEvent({ ...f.parent, message_id: id(n), body });
        writeFileSync(join(directory, `${event.message_id}.json`), `${canonicalTaskMessageEventBytes(event)}\n`);
      }
      // Isolate the scan/byte budget from host filesystem speed.
      const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
      try { expect(f.query().coverage).toMatchObject({ complete: false, reason }); }
      finally { clock.mockRestore(); }
      const ctx = { repoRoot: f.root, policy: getMcpPolicy('engineer'), engineerAuthorizationId: id(2), engineerVerifyAuthorization: f.input.verify_authorization };
      const args = { work_envelope: f.work, parent_message_id: f.parent.message_id, parent_event_digest: f.parent.event_digest };
      const result = await callMcpTool(ctx, 'engineer_task_messages', args);
      expect(result).toMatchObject({ structuredContent: { coverage: { scope: 'exact_parent', complete: true, scanned: 1 }, entries: [{ recovery: { body: f.replyArgs.body, reply_message_id: id(5) } }] } });
      const recovery = (result.structuredContent as { entries: { recovery: typeof f.replyArgs }[] }).entries[0]!.recovery;
      const resumed = await callMcpTool(ctx, 'engineer_task_reply', { work_envelope: f.work, parent_message_id: recovery.parent_message_id, parent_event_digest: recovery.parent_event_digest, reply_message_id: recovery.reply_message_id, body: recovery.body });
      expect(resumed.isError).not.toBeTrue(); expect(f.history().observation.state).toBe('complete');
      expect(readdirSync(directory)).toHaveLength(count + 2);
      expect((await callMcpTool(ctx, 'engineer_task_messages', { ...args, parent_event_digest: `sha256:${'0'.repeat(64)}` })).isError).toBeTrue();
      expect((await callMcpTool(ctx, 'engineer_task_messages', { ...args, after: id(1) })).isError).toBeTrue();
      f.revokeToken(); expect((await callMcpTool(ctx, 'engineer_task_messages', args)).isError).toBeTrue();
    });
  }

  test('ACKed unanswered steer remains visible; reads do not mutate receipt or Lease and replies do not echo', () => {
    const f = fixture(); const before = readLease(f.root, f.work.task_id).raw;
    expect(f.query().entries[0]?.receipt).toBeNull();
    expect(f.consume().receipt.delivery_channel).toBe('manual'); f.ack();
    const acknowledged = JSON.stringify(f.history().acknowledgement);
    expect(f.query().entries[0]?.pending_disposition).toBeTrue();
    expect(f.query().context).toContain('[TaskInboxUntrustedPeerMessages]');
    expect(JSON.stringify(f.history().acknowledgement)).toBe(acknowledged);
    const result = f.reply();
    expect(result.event).toMatchObject({ audience: 'user', scope: 'task', sender_id: f.actor.receipt_sha256, in_reply_to: f.parent.message_id });
    expect(f.query().entries).toHaveLength(1); expect(f.query().entries[0]?.pending_disposition).toBeFalse();
    expect(f.reply()).toEqual({ ...result, created: false });
    expect(readLease(f.root, f.work.task_id).raw).toBe(before);
    expect(() => withEngineerTaskInbox(f.input, inbox => replyToTaskSteer({ ...inbox, ...f.replyArgs, body: 'changed' }))).toThrow('differs');
    expect(() => withEngineerTaskInbox(f.input, inbox => replyToTaskSteer({ ...inbox, ...f.replyArgs, reply_message_id: id(6) }))).toThrow('differs');
  });

  for (const [boundary, expected] of [['intent_file_fsynced', 'absent'], ['intent_published', 'intent_only'], ['event_published', 'event_uncommitted'], ['commit_file_fsynced', 'event_uncommitted'], ['commit_published', 'complete']] as const) {
    test(`process exit at ${boundary} preserves ${expected} and resumes only the original ID`, async () => {
      const f = fixture(); f.consume(); f.ack();
      const child = Bun.spawn([process.execPath, '-e', `
        import { withEngineerTaskInbox } from ${JSON.stringify(join(PROJECT, 'src/effects/engineers/task-inbox.ts'))};
        import { replyToTaskSteer } from ${JSON.stringify(join(PROJECT, 'src/effects/fleet/task-inbox.ts'))};
        const v = JSON.parse(process.env.REPLY_TEST_INPUT);
        withEngineerTaskInbox({...v.input, env: process.env, verify_authorization: () => {}}, inbox => replyToTaskSteer({...inbox, ...v.reply, now: () => ${JSON.stringify(AT)}, crash_hook: boundary => { if (boundary === ${JSON.stringify(boundary)}) process.exit(86); }}));
      `], { cwd: PROJECT, env: { ...f.env, REPLY_TEST_INPUT: JSON.stringify({ input: f.input, reply: f.replyArgs }) }, stdout: 'pipe', stderr: 'pipe' });
      const status = await child.exited;
      const stderr = await new Response(child.stderr).text();
      expect({ status, stderr }).toEqual({ status: 86, stderr: '' });
      expect(f.history().observation.state).toBe(expected);
      const completed = f.reply(); expect(completed.event.message_id).toBe(id(5)); expect(f.history().observation.state).toBe('complete');
      const eventFiles = readdirSync(join(taskInboxTaskDirectory(f.root, f.work.task_id), 'events'));
      expect(eventFiles.sort()).toEqual([`${id(4)}.json`, `${id(5)}.json`]);
    }, 20_000);
  }

  test('token revocation after event blocks commit and mapping revocation blocks recovery while retaining history', () => {
    const f = fixture(); f.consume(); f.ack();
    expect(() => f.reply(boundary => { if (boundary === 'event_published') f.revokeToken(); })).toThrow('revoked');
    expect(f.history().observation.state).toBe('event_uncommitted');
    expect(() => f.reply()).toThrow('revoked');
    revokeEngineerPrincipal(f.work.repo_id, id(2), { env: f.env });
    expect(() => withEngineerTaskInbox({ ...f.input, verify_authorization: () => {} }, inbox => replyToTaskSteer({ ...inbox, ...f.replyArgs }))).toThrow('revoked');
    expect(f.history().observation.state).toBe('event_uncommitted');
  });

  for (const boundary of ['intent_file_fsynced', 'commit_file_fsynced'] as const) {
    test(`revocation immediately before ${boundary} publication leaves no authenticated commit`, () => {
      const f = fixture(); f.consume(); f.ack();
      expect(() => f.reply(at => { if (at === boundary) f.revokeToken(); })).toThrow('revoked');
      expect(f.history().observation.state).toBe(boundary === 'intent_file_fsynced' ? 'absent' : 'event_uncommitted');
    });
  }

  test('rejects missing ACK, changed original envelope, forged parent digest and orphan reply event', () => {
    const f = fixture();
    expect(() => f.reply()).toThrow('acknowledgement');
    expect(() => withEngineerTaskInbox({ ...f.input, work_envelope: { ...f.work, authorization_revision: 900 } }, observeTaskSteers)).toThrow();
    f.consume(); f.ack();
    expect(() => withEngineerTaskInbox(f.input, inbox => replyToTaskSteer({ ...inbox, ...f.replyArgs, parent_event_digest: `sha256:${'0'.repeat(64)}` }))).toThrow('exact original');
    const orphan = buildTaskMessageEvent({ ...f.parent, message_id: id(5), sender_kind: 'agent', sender_trust: 'lease_owner', sender_id: f.actor.receipt_sha256, audience: 'user', in_reply_to: f.parent.message_id });
    writeFileSync(taskInboxEventPath(f.root, f.work.task_id, id(5)), `${canonicalTaskMessageEventBytes(orphan)}\n`);
    expect(f.query().entries[0]?.reply.state).toBe('orphan_event');
    expect(() => f.reply()).toThrow('orphan');
  });

  test('commit missing its event is inconsistent, never reconstructed as success; old provenance survives revocation', () => {
    const f = fixture(); f.consume(); f.ack(); f.reply();
    revokeEngineerPrincipal(f.work.repo_id, id(2), { env: f.env });
    expect(f.history().observation.state).toBe('complete');
    expect(f.history().intent?.claim_actor.binding_generation).toBe(1);
    unlinkSync(taskInboxEventPath(f.root, f.work.task_id, id(5)));
    expect(f.history().observation).toEqual({ state: 'inconsistent', reason: 'commit_missing_records' });
  });

  test('pages a bounded read without hiding ACKed unanswered messages or mutating receipts', () => {
    const f = fixture(); f.consume(); f.ack();
    const extra = buildTaskMessageEvent({ ...f.parent, message_id: id(10), body: 'Second steer' });
    sendTaskMessage({ repo_root: f.root, canonical_source: { targetRef: 'main', sprintPath: SPRINT }, event: extra });
    const page = withEngineerTaskInbox(f.input, inbox => observeTaskSteers({ ...inbox, limit: 1 }));
    expect(page.coverage).toMatchObject({ complete: false, reason: 'page', scanned: 2 });
    expect(page.entries[0]?.pending_disposition).toBeTrue(); expect(page.next_cursor).toBe(f.parent.message_id);
    const next = withEngineerTaskInbox(f.input, inbox => observeTaskSteers({ ...inbox, limit: 1, after: page.next_cursor! }));
    expect(next.coverage.complete).toBeTrue(); expect(next.entries[0]?.parent.message_id).toBe(id(10));
    expect(next.entries[0]?.receipt).toBeNull();
    expect(() => withEngineerTaskInbox(f.input, inbox => observeTaskSteers({ ...inbox, limit: 101 }))).toThrow('limit');
  });

  test('scan and byte ceilings report incomplete coverage rather than an empty inbox claim', () => {
    const f = fixture();
    const eventsDirectory = join(taskInboxTaskDirectory(f.root, f.work.task_id), 'events');
    for (let n = 100; n < 1100; n += 1) {
      const event = buildTaskMessageEvent({ ...f.parent, message_id: id(n) });
      writeFileSync(join(eventsDirectory, `${event.message_id}.json`), `${canonicalTaskMessageEventBytes(event)}\n`);
    }
    expect(f.query().coverage).toMatchObject({ complete: false, reason: 'scan', scanned: 1000 });
    for (let n = 100; n < 1100; n += 1) unlinkSync(join(eventsDirectory, `${id(n)}.json`));
    for (let n = 100; n < 400; n += 1) {
      const event = buildTaskMessageEvent({ ...f.parent, message_id: id(n), body: 'x'.repeat(8000) });
      writeFileSync(join(eventsDirectory, `${event.message_id}.json`), `${canonicalTaskMessageEventBytes(event)}\n`);
    }
    const limited = f.query(); expect(limited.coverage).toMatchObject({ complete: false, reason: 'bytes' });
    expect(limited.coverage.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  test('a valid event stored under another message ID fails closed on both exact and paged reads', () => {
    const f = fixture();
    writeFileSync(taskInboxEventPath(f.root, f.work.task_id, id(10)), `${canonicalTaskMessageEventBytes(f.parent)}\n`);
    expect(() => f.query()).toThrow('path identity');
    expect(() => withEngineerTaskInbox(f.input, inbox => consumeTaskSteer({ ...inbox, message_id: id(10), event_digest: f.parent.event_digest, now: AT }))).toThrow('path identity');
    expect(f.history().acknowledgement).toBeNull();
  });

  test('a rotated live Lease rejects the original actor and leaves reply history unchanged', () => {
    const f = fixture(); f.consume(); f.ack();
    const lease = readLease(f.root, f.work.task_id);
    writeLeaseOwnerDurably(f.root, f.work.task_id, { ...lease.record!, generation: 2 });
    expect(() => f.reply()).toThrow();
    expect(f.history().observation.state).toBe('absent');
  });

  test('hook delivery channel is retained through explicit MCP pull and ACK', () => {
    const f = fixture();
    withEngineerTaskInbox(f.input, inbox => deliverTaskInbox({ ...inbox, delivery_channel: 'hook_session', delivered_at: AT }));
    expect(f.consume().receipt.delivery_channel).toBe('hook_session');
    expect(f.ack()).toMatchObject({ delivery_channel: 'hook_session', delivery_ref: null });
  });

  test('MCP preserves exact reply whitespace and rejects a whitespace-only retry change', async () => {
    const f = fixture(); f.consume(); f.ack();
    const ctx = { repoRoot: f.root, policy: getMcpPolicy('engineer'), engineerAuthorizationId: id(2), engineerVerifyAuthorization: f.input.verify_authorization };
    const args = { work_envelope: f.work, parent_message_id: id(4), parent_event_digest: f.parent.event_digest, reply_message_id: id(5), body: '  const inspected = true;\n\n' };
    const first = await callMcpTool(ctx, 'engineer_task_reply', args);
    expect(first).toMatchObject({ structuredContent: { event: { body: args.body } } });
    expect(await callMcpTool(ctx, 'engineer_task_reply', { ...args, body: args.body.trim() })).toMatchObject({ isError: true, structuredContent: { error: { code: 'task_reply_conflict' } } });
  });

  test('a restarted MCP caller recovers a partial reply whose original body existed only in the exited child', async () => {
    const f = fixture(); f.consume(); f.ack();
    const child = Bun.spawn([process.execPath, '-e', `
      import { withEngineerTaskInbox } from ${JSON.stringify(join(PROJECT, 'src/effects/engineers/task-inbox.ts'))};
      import { replyToTaskSteer } from ${JSON.stringify(join(PROJECT, 'src/effects/fleet/task-inbox.ts'))};
      const v = JSON.parse(process.env.REPLY_TEST_INPUT);
      withEngineerTaskInbox({...v.input, env: process.env, verify_authorization: () => {}}, inbox => replyToTaskSteer({...inbox,
        parent_message_id: v.parent.message_id, parent_event_digest: v.parent.event_digest,
        reply_message_id: ${JSON.stringify(id(5))}, body: '  child-only-' + crypto.randomUUID() + String.fromCharCode(10),
        now: () => ${JSON.stringify(AT)}, crash_hook: boundary => { if (boundary === 'event_published') process.exit(86); }}));
    `], { cwd: PROJECT, env: { ...f.env, REPLY_TEST_INPUT: JSON.stringify({ input: f.input, parent: f.parent }) }, stdout: 'pipe', stderr: 'pipe' });
    expect(await child.exited).toBe(86); expect(await new Response(child.stderr).text()).toBe('');
    const ctx = { repoRoot: f.root, policy: getMcpPolicy('engineer'), engineerAuthorizationId: id(2), engineerVerifyAuthorization: f.input.verify_authorization };
    const read = await callMcpTool(ctx, 'engineer_task_messages', { work_envelope: f.work });
    const recovery = (read.structuredContent as { entries: { recovery: { parent_message_id: string; parent_event_digest: string; reply_message_id: string; body: string; intent_sha256: string } }[] }).entries[0]!.recovery;
    expect(recovery.reply_message_id).toBe(id(5));
    expect(recovery.body).toMatch(/^  child-only-[0-9a-f-]+\n$/);
    const { intent_sha256, ...retry } = recovery;
    expect(intent_sha256).toMatch(/^sha256:/);
    const committed = await callMcpTool(ctx, 'engineer_task_reply', { work_envelope: f.work, ...retry });
    expect(committed).toMatchObject({ structuredContent: { event: { message_id: recovery.reply_message_id, body: recovery.body }, commit: { intent_sha256 } } });
    expect(f.history().observation.state).toBe('complete');
  }, 20_000);

  test('strict named MCP tools reject missing transport authority then compose consume ACK and reply', async () => {
    const f = fixture(); const base = { repoRoot: f.root, policy: getMcpPolicy('engineer'), engineerAuthorizationId: id(2) };
    expect(await callMcpTool(base, 'engineer_task_messages', { work_envelope: f.work })).toMatchObject({ isError: true, structuredContent: { error: { code: 'ENGINEER_AUTHORIZATION_MISSING' } } });
    const ctx = { ...base, engineerVerifyAuthorization: f.input.verify_authorization };
    expect(await callMcpTool(ctx, 'engineer_task_message_consume', { work_envelope: f.work, message_id: id(4), event_digest: f.parent.event_digest, sender_trust: 'lease_owner' })).toMatchObject({ isError: true });
    for (const name of ['engineer_task_message_consume', 'engineer_task_message_ack']) expect((await callMcpTool(ctx, name, { work_envelope: f.work, message_id: id(4), event_digest: f.parent.event_digest })).isError).toBeUndefined();
    expect(await callMcpTool(ctx, 'engineer_task_reply', { work_envelope: f.work, parent_message_id: id(4), parent_event_digest: f.parent.event_digest, reply_message_id: id(5), body: 'Handled within the existing contract.' })).toMatchObject({ structuredContent: { event: { audience: 'user' }, commit: { effect_id: id(5) } } });
    f.revokeToken(); expect((await callMcpTool(ctx, 'engineer_task_messages', { work_envelope: f.work })).isError).toBeTrue();
  });
});

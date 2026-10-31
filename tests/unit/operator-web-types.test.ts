import { describe, expect, test } from 'bun:test';

import {
  decodeOperatorRepositorySnapshot,
  decodeOperatorFleetSnapshot,
  decodeOperatorTaskMessageResponse,
  OPERATOR_API_ERROR_CODES,
  OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR,
  OPERATOR_REPOSITORY_ERROR_CODES,
  OperatorRepositoryPayloadError,
  OperatorPayloadError,
  OperatorTaskMessageResponseError,
} from '../../src/operator-web/types';
import { repositoryObservationFixture, repositorySnapshot, operatorFixtures } from '../../src/operator-web/fixture';
import { planningObservationFixture, stableSnapshot } from '../../src/operator-web/fixture';
import type { RequiredCheckCoverageEvidenceV1 } from '../../src/core/publication/required-check-coverage';
import { decodeOperatorPlanningSnapshot } from '../../src/core/operator/planning-snapshot';
import { isOperatorMessageKey, translate, type OperatorMessageKey } from '../../src/operator-web/i18n';

const taskId = 'a'.repeat(64);
const taskRevision = 'b'.repeat(64);
const claimId = '00000000-0000-4000-8000-000000000001';
const snapshotDigest = `sha256:${'c'.repeat(64)}`;

test('Planning transport binds provider tasks, explicit admitted sessions and independent graph observations',()=>{
  const repository=stableSnapshot.repositories[0]!,snapshot=planningObservationFixture(repositorySnapshot.repository_id,repository.cards);
  const envelope={...repositorySnapshot,planning:{status:'observed' as const,observed_at:snapshot.observation.observed_at,snapshot}};
  expect(decodeOperatorRepositorySnapshot(envelope).planning).toEqual(envelope.planning);
  const {planning:_,...missing}=envelope;
  expect(()=>decodeOperatorRepositorySnapshot(missing)).toThrow();
  const task=snapshot.scheduling.tasks[0]!;
  for(const bad of [
    {...snapshot,repository_id:'another-repo'},
    {...snapshot,protocol:1},
    {...snapshot,scheduling:{...snapshot.scheduling,tasks:[task,task]}},
    {...snapshot,scheduling:{...snapshot.scheduling,tasks:Array.from({length:201},()=>task)}},
    {...snapshot,scheduling:{...snapshot.scheduling,repository_id:'another-repo'}},
    {...snapshot,graph:{status:'unavailable',code:'unclassified'}},
    {...snapshot,graph:{status:'observed',snapshot:{packages:[],sources:[]}}},
    {...snapshot,observation:{...snapshot.observation,authorization_revision:-1}},
  ])expect(()=>decodeOperatorPlanningSnapshot(bad,repositorySnapshot.repository_id)).toThrow();
  const unavailable={status:'unavailable' as const,observed_at:snapshot.observation.observed_at,code:'source_unavailable' as const};
  expect(decodeOperatorRepositorySnapshot({...envelope,planning:unavailable}).organization.status).toBe('unavailable');
});

function validFleetPayload(): Record<string, unknown> {
  return {
    protocol: 8,
    service_epoch: '00000000-0000-4000-8000-000000000001',
    kind: 'operator_fleet_snapshot',
    registry_revision: `sha256:${'d'.repeat(64)}`,
    sequence: 1,
    observed_at: '2026-08-31T00:00:00.000Z',
    snapshot_consistency: 'stable',
    repositories: [{
      repository_id: 'repo-1',
      display_name: 'repo-1',
      access_mode: 'read_write',
      status: 'ok',
      snapshot_consistency: 'stable',
      cards: [{
        repository_id: 'repo-1',
        task_id: taskId,
        provider_repository_id: '1001', provider_issue_id: '2001', issue_state: 'open', issue_revision: `sha256:${taskRevision}`,
        execution_status: 'observed', execution: {
          admission_sha256: snapshotDigest, profile_selection: { state: 'unassigned' }, branch: 'task', runtime: 'terminal', harness_kind: 'codex',
          selector: { repository_id: 'repo-1', provider_repository_id: '1001', issue_id: '2001', campaign_id: 'campaign', task: taskId, role: 'worker',
            claim_ref: claimId, claim_revision: snapshotDigest, grant_sha256: snapshotDigest, policy_sha256: snapshotDigest, actor_id: 'owner', session_binding_sha256: snapshotDigest },
        },
        task_label: 'validate operator identity',
        task_index: 1,
        placement: { kind: 'column', column: 'working' },
        attention_owner: 'agent',
        execution_readiness: 'execution_ready', readiness_blockers: [],
        merge_readiness: null,
        blocker_codes: [],
        feedback: { observation_status: 'observed', pending_count: 0, no_progress: false, repair_actions: [] },
        inbox: {
          observation_status: 'observed',
          unread_count: 0,
          addressed_to_current_claim: false,
          delivery_state: 'pending',
          runtime_reachability: 'unknown',
          effect_sha256: null,
          delivery_evidence: { candidate_count: 0, latest: null }, failure_class: null,
        },
        snapshot_consistency: 'stable',
        error: null,
      }],
      error: null,
    }],
    counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 1 },
    source_snapshot_sha256: snapshotDigest,
  };
}

function fleetPayloadWithCard(changes: Record<string, unknown>): Record<string, unknown> {
  const payload = validFleetPayload();
  const repositories = payload.repositories as Array<Record<string, unknown>>;
  const repository = repositories[0]!;
  const cards = repository.cards as Array<Record<string, unknown>>;
  repository.cards = [{ ...cards[0], ...changes }];
  return payload;
}

describe('operator browser payload contracts', () => {
  test('requires the named-repository protocol without accepting old or missing display names', () => {
    expect(() => decodeOperatorFleetSnapshot({ ...validFleetPayload(), protocol: 4 })).toThrow();
    const payload = validFleetPayload();
    const repos = payload.repositories as Record<string, unknown>[];
    delete repos[0]!.display_name;
    expect(() => decodeOperatorFleetSnapshot(payload)).toThrow();
    expect(decodeOperatorFleetSnapshot(validFleetPayload()).repositories[0]?.display_name).toBe('repo-1');
  });
  test('accepts an addressable task and claim fence', () => {
    const decoded = decodeOperatorFleetSnapshot(validFleetPayload());
    const card = decoded.repositories[0]?.cards[0];

    expect(card).toMatchObject({ task_id: taskId, provider_repository_id: '1001', provider_issue_id: '2001', execution: { admission_sha256: snapshotDigest, selector: { claim_ref: claimId, claim_revision: snapshotDigest } } });
    expect(card?.task_id).toMatch(/^[0-9a-f]{64}$/u);
    expect(card?.issue_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(card?.execution?.selector.claim_ref).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  });

  test.each([
    ['GraphQL ID in canonical REST field', { provider_repository_id: 'R_node' }],
    ['zero issue ID', { provider_issue_id: '0' }],
    ['malformed issue revision', { issue_revision: 'revision-1' }],
    ['execution missing with task ID', { execution: null }],
    ['malformed task digest', { task_id: 'task-1' }],
    ['uppercase task digest', { task_id: 'A'.repeat(64) }],
    ['malformed task revision digest', { task_revision: 'revision-1' }],
    ['uppercase task revision digest', { task_revision: 'B'.repeat(64) }],
    ['malformed claim UUID', { claim_id: 'claim-1' }],
    ['zero generation', { generation: 0 }],
    ['claim without generation', { generation: null }],
    ['generation without claim', { claim_id: null }],
  ])('rejects %s before rendering a write affordance', (_name, changes) => {
    expect(() => decodeOperatorFleetSnapshot(fleetPayloadWithCard(changes))).toThrow(OperatorPayloadError);
  });

  test('binds execution to its exact provider issue and task rather than a matching display row', () => {
    expect(decodeOperatorFleetSnapshot(validFleetPayload()).repositories[0]!.cards[0]!.execution).not.toBeNull();
    for (const delta of [{ provider_repository_id: '1002' }, { issue_id: '2002' }, { task: 'other-runtime-task' }, { repository_id: 'repo-2' }]) {
      const payload = validFleetPayload();
      const card = (payload.repositories as { cards: Record<string, unknown>[] }[])[0]!.cards[0]!;
      const execution = card.execution as { selector: Record<string, unknown> };
      execution.selector = { ...execution.selector, ...delta };
      expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
    }
  });

  // `effect_sha256` is rendered as a copyable identifier, so a value that is
  // merely a non-empty string is not enough: it must be the prefixed digest the
  // runtime effect store writes, or explicitly absent.
  test.each([
    ['unprefixed digest', 'e'.repeat(64)],
    ['short digest', `sha256:${'e'.repeat(63)}`],
    ['uppercase digest', `sha256:${'E'.repeat(64)}`],
    ['prose', 'effect evidence unavailable'],
  ])('rejects a %s in inbox.effect_sha256', (_name, effectSha256) => {
    const payload = validFleetPayload();
    const repositories = payload.repositories as Array<Record<string, unknown>>;
    const cards = repositories[0]!.cards as Array<Record<string, unknown>>;
    cards[0] = { ...cards[0], inbox: { ...(cards[0]!.inbox as Record<string, unknown>), effect_sha256: effectSha256 } };
    expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
  });

  test('accepts a prefixed effect digest and its explicit absence', () => {
    const digest = `sha256:${'e'.repeat(64)}`;
    const payload = validFleetPayload();
    const repositories = payload.repositories as Array<Record<string, unknown>>;
    const cards = repositories[0]!.cards as Array<Record<string, unknown>>;
    cards[0] = { ...cards[0], inbox: { ...(cards[0]!.inbox as Record<string, unknown>), effect_sha256: digest } };

    expect(decodeOperatorFleetSnapshot(payload).repositories[0]?.cards[0]?.inbox.effect_sha256).toBe(digest);
    expect(decodeOperatorFleetSnapshot(validFleetPayload()).repositories[0]?.cards[0]?.inbox.effect_sha256).toBeNull();
  });

  // A coverage blocker carries action text. The transport must preserve it, and
  // the snapshot projection must not drop it before the browser sees it.
  test('preserves the coverage blocker detail and the coverage evidence through the transport', () => {
    const head = 'a'.repeat(40), base = 'b'.repeat(40);
    const coverage: RequiredCheckCoverageEvidenceV1 = {
      protocol: 1, kind: 'repo-harness-required-check-coverage', head_sha: head, base_sha: base,
      protected_paths: ['api-surface/entries.json'],
      checks: [{ check: 'build, typecheck, test (matrix)', bucket: 'skipping', requirement: 'required' }], waiver: null,
    };
    const detail = 'required check "build, typecheck, test (matrix)" is skipping for protected path "api-surface/entries.json"; run it or add a passing "coverage-waiver" check';
    const readiness = {
      protocol: 2, kind: 'repo-harness-pull-request-readiness',
      provider_repository_id: '1001', repository: 'example/repo-harness', pr_number: 1, ready: false,
      expected_head_sha: head, expected_base_sha: base, integration_mode: 'unmerged', attention_owner: 'agent',
      blockers: [{ code: 'required_check_coverage_missing', attention_owner: 'agent', detail }],
      check_failures: [],
      required_check_coverage: coverage,
      stack: { member: false, depth: 0, chain: [], final_base_sha: null, status: 'not_member' as const },
    };
    const card = decodeOperatorFleetSnapshot(fleetPayloadWithCard({ merge_readiness: readiness })).repositories[0]!.cards[0]!;
    expect(card.merge_readiness?.blockers[0]?.detail).toBe(detail);
    expect(card.merge_readiness?.required_check_coverage).toEqual(coverage);
    expect(card.merge_readiness?.stack).toEqual(readiness.stack);

    // The stack detail is closed: a non-zero depth with no chain is not a document.
    expect(() => decodeOperatorFleetSnapshot(fleetPayloadWithCard({ merge_readiness: {
      ...readiness, stack: { ...readiness.stack, depth: 1 },
    } }))).toThrow(OperatorPayloadError);

    // A detail on a blocker that has no action text is not a valid document.
    expect(() => decodeOperatorFleetSnapshot(fleetPayloadWithCard({ merge_readiness: {
      ...readiness, blockers: [{ code: 'draft', attention_owner: 'agent', detail: 'not allowed' }],
    } }))).toThrow(OperatorPayloadError);
  });

  // The browser fixture is the payload the UI suites render. If the production
  // decoder would reject it, every UI assertion is made against a document the
  // board can never receive.
  test.each(Object.keys(operatorFixtures) as Array<keyof typeof operatorFixtures>)(
    'decodes the %s fixture unchanged',
    (name) => {
      const fixture = operatorFixtures[name];
      expect(decodeOperatorFleetSnapshot(fixture)).toEqual(fixture);
    },
  );

  test.each([
    ['unreadable repository with a card', { status: 'unreadable', snapshot_consistency: 'degraded', error: { code: 'repo_unreadable', message: 'unreadable' } }],
    ['unreadable repository with stable consistency', { status: 'unreadable', snapshot_consistency: 'stable', cards: [], error: { code: 'repo_unreadable', message: 'unreadable' } }],
    ['unreadable repository without an error', { status: 'unreadable', snapshot_consistency: 'degraded', cards: [], error: null }],
  ])('rejects an impossible %s payload', (_name, changes) => {
    const payload = validFleetPayload();
    const repositories = payload.repositories as Array<Record<string, unknown>>;
    repositories[0] = { ...repositories[0], ...changes };
    expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
  });

  test('rejects repository and Fleet consistency that is healthier than a child', () => {
    const changedCard = fleetPayloadWithCard({ snapshot_consistency: 'changed_during_read' });
    expect(() => decodeOperatorFleetSnapshot(changedCard)).toThrow(OperatorPayloadError);

    const degradedRepository = validFleetPayload();
    const repositories = degradedRepository.repositories as Array<Record<string, unknown>>;
    repositories[0] = { ...repositories[0], snapshot_consistency: 'degraded' };
    expect(() => decodeOperatorFleetSnapshot(degradedRepository)).toThrow(OperatorPayloadError);

    degradedRepository.snapshot_consistency = 'degraded';
    expect(decodeOperatorFleetSnapshot(degradedRepository).snapshot_consistency).toBe('degraded');
  });

  test('strictly decodes and binds Task Message success acknowledgments', () => {
    const expected = {
      repository_id: 'repo-1',
      task_id: taskId,
      message_id: '00000000-0000-4000-8000-000000000002',
      scope: 'claim' as const,
    };
    const created = {
      ok: true,
      protocol: 1,
      ...expected,
      created: true,
    } as const;
    expect(decodeOperatorTaskMessageResponse(created, expected, 201)).toEqual(created);
    expect(decodeOperatorTaskMessageResponse({ ...created, created: false }, expected, 200).created).toBe(false);
  });

  test.each([
    ['empty body', {}, 200],
    ['wrong protocol', { protocol: 2 }, 201],
    ['wrong repository', { repository_id: 'repo-2' }, 201],
    ['wrong task', { task_id: 'f'.repeat(64) }, 201],
    ['wrong message', { message_id: '00000000-0000-4000-8000-000000000003' }, 201],
    ['wrong scope', { scope: 'task' }, 201],
    ['extra field', { future: true }, 201],
    ['status disagrees with created', {}, 200],
  ])('rejects Task Message success with %s', (_name, changes, status) => {
    const expected = {
      repository_id: 'repo-1',
      task_id: taskId,
      message_id: '00000000-0000-4000-8000-000000000002',
      scope: 'claim' as const,
    };
    const response = _name === 'empty body' ? {} : {
      ok: true,
      protocol: 1,
      ...expected,
      created: true,
      ...changes,
    };
    expect(() => decodeOperatorTaskMessageResponse(response, expected, status)).toThrow(OperatorTaskMessageResponseError);
  });

  test('uses a repository-specific validation contract while Fleet keeps its own contract', () => {
    expect(() => decodeOperatorFleetSnapshot({ ...validFleetPayload(), protocol: 99 })).toThrow(OperatorPayloadError);

    let protocolError: unknown;
    try {
      decodeOperatorRepositorySnapshot({ ...repositoryObservationFixture(), protocol: 99 });
    } catch (error) {
      protocolError = error;
    }
    expect(protocolError).toBeInstanceOf(OperatorRepositoryPayloadError);
    expect(protocolError).toMatchObject(OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR);
    expect(protocolError).not.toBeInstanceOf(OperatorPayloadError);

    expect(() => decodeOperatorRepositorySnapshot({
      ...repositoryObservationFixture(),
      exchange: {},
    })).toThrow(OperatorRepositoryPayloadError);
  });

  test('provides runtime-effect recovery copy in both operator locales', () => {
    expect(translate('en', 'repo.error.repo_runtime_effect_unreadable')).toContain('Reconcile runtime delivery evidence');
    expect(translate('zh', 'repo.error.repo_runtime_effect_unreadable')).toContain('reconcile runtime 投递证据');
  });

  // Every repository error code the transport can carry is client-owned copy.
  // The server sentence is a diagnostic contract, not board copy, so leaving a
  // code unlocalized is what put nine English sentences in the Chinese board.
  test.each([...OPERATOR_REPOSITORY_ERROR_CODES])('localizes repository error %s in both locales', (code) => {
    const key = `repo.error.${code}` as OperatorMessageKey;
    expect(isOperatorMessageKey(`repo.error.${code}`)).toBe(true);
    expect(translate('en', key).length).toBeGreaterThan(0);
    expect(translate('zh', key)).not.toBe(translate('en', key));
  });

  // The API error catalogue is closed on the client too: every code the three
  // routes the browser calls can return has its own localized sentence and
  // recovery action, so nothing reaches the board as an untranslated fallback.
  test.each([...OPERATOR_API_ERROR_CODES])('localizes API error %s in both locales', (code) => {
    for (const suffix of ['message', 'action'] as const) {
      const key = `error.${code}.${suffix}`;
      expect(isOperatorMessageKey(key)).toBe(true);
      expect(translate('en', key as OperatorMessageKey).length).toBeGreaterThan(0);
      expect(translate('zh', key as OperatorMessageKey).length).toBeGreaterThan(0);
    }
    expect(translate('zh', `error.${code}.message` as OperatorMessageKey))
      .not.toBe(translate('en', `error.${code}.message` as OperatorMessageKey));
  });

  test('keeps an unknown code out of the dictionary so it fails open as a labelled passthrough', () => {
    expect(isOperatorMessageKey('error.not_a_real_operator_code.message')).toBe(false);
    expect(translate('en', 'error.untranslated').length).toBeGreaterThan(0);
    expect(translate('zh', 'error.untranslated')).not.toBe(translate('en', 'error.untranslated'));
  });
});


describe('notification delivery evidence protocol', () => {
  const latest = { adapter_kind: 'herdr-cli-agent', effect_state: 'stopped', receipt_kind: null,
    observed_at: '2026-09-07T00:00:00.000Z', observation_sequence: 2, observation_sha256: `sha256:${'e'.repeat(64)}` } as const;
  function payload(evidence: unknown) {
    const value = validFleetPayload();
    const card = (value.repositories as { cards: Record<string, unknown>[] }[])[0]!.cards[0]!;
    (card.inbox as Record<string, unknown>).delivery_evidence = evidence;
    return { value, card };
  }
  test('accepts exact single, zero, multiple and failed observations', () => {
    for (const evidence of [{ candidate_count: 0, latest: null }, { candidate_count: 2, latest: null }, { candidate_count: 1, latest }]) {
      const { value } = payload(evidence);
      expect(decodeOperatorFleetSnapshot(value).repositories[0]!.cards[0]!.inbox.delivery_evidence).toEqual(evidence);
    }
    const { value, card } = payload(null);
    card.error = { code: 'repo_runtime_effect_unreadable', message: 'unavailable' };
    (card.inbox as Record<string, unknown>).observation_status = 'unavailable';
    card.placement = { kind: 'unclassified', reason: 'observation_failed' };
    value.snapshot_consistency = 'degraded';
    (value.repositories as Record<string, unknown>[])[0]!.snapshot_consistency = 'degraded';
    value.counts = { ...(value.counts as object), working: 0, unclassified: 1 };
    expect(decodeOperatorFleetSnapshot(value).repositories[0]!.cards[0]!.inbox.delivery_evidence).toBeNull();
  });
  test('rejects old protocol and missing, inconsistent or malformed evidence', () => {
    const invalid = [undefined, null, { candidate_count: -1, latest: null }, { candidate_count: 1, latest: null }, { candidate_count: 2, latest },
      ...[{ adapter_kind: 'claude' }, { effect_state: 'working' }, { receipt_kind: 'ack' }, { observed_at: 'yesterday' }, { observed_at: '2026-09-07' }, { observation_sequence: -1 }, { observation_sha256: 'opaque' }].map(delta => ({ candidate_count: 1, latest: { ...latest, ...delta } }))];
    for (const evidence of invalid) expect(() => decodeOperatorFleetSnapshot(payload(evidence).value)).toThrow(OperatorPayloadError);
    const old = payload({ candidate_count: 0, latest: null }).value;
    old.protocol = 3;
    expect(() => decodeOperatorFleetSnapshot(old)).toThrow(OperatorPayloadError);
    const failed = payload({ candidate_count: 0, latest: null });
    failed.card.error = { code: 'repo_runtime_effect_unreadable', message: 'unavailable' };
    expect(() => decodeOperatorFleetSnapshot(failed.value)).toThrow(OperatorPayloadError);
  });
});


describe('placement protocol and count conservation', () => {
  test.each([
    { placement: undefined }, { issue_state: undefined }, { readiness_blockers: undefined },
    { column: 'working' }, { placement: { kind: 'preparation', column: 'working' } },
    { placement: { kind: 'alternate_workflow', workflow: 'unknown' } },
    { placement: { kind: 'unclassified', reason: 'unknown' } },
    { readiness_blockers: [{ code: 'unknown', attention_owner: 'agent' }] },
    { readiness_blockers: [{ code: 'plan_missing', attention_owner: 'none' }] },
  ])('rejects malformed or retired card fields %j', changes => {
    expect(() => decodeOperatorFleetSnapshot(fleetPayloadWithCard(changes))).toThrow(OperatorPayloadError);
  });
  test('rejects protocol 5, missing counts, false totals and duplicated identities', () => {
    expect(() => decodeOperatorFleetSnapshot({ ...validFleetPayload(), protocol: 5 })).toThrow(OperatorPayloadError);
    for (const field of ['known_tasks', 'preparation', 'alternate_workflow', 'isolated_execution', 'unreadable', 'working']) {
      const payload = validFleetPayload();
      (payload.counts as Record<string, unknown>)[field] = 5;
      expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
      delete (payload.counts as Record<string, unknown>)[field];
      expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
    }
    const payload = validFleetPayload();
    const repositories = payload.repositories as { cards: unknown[] }[];
    repositories[0]!.cards.push(repositories[0]!.cards[0]);
    payload.counts = { ...(payload.counts as object), working: 2, known_tasks: 2 };
    expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
  });
  test('preserves exact preparation ownership without degrading health', () => {
    const blockers = [{ code: 'plan_not_approved', attention_owner: 'user' }, { code: 'contract_missing', attention_owner: 'agent' }] as const;
    const payload = fleetPayloadWithCard({ placement: { kind: 'preparation' }, execution_readiness: 'planning_required', readiness_blockers: blockers, execution: null, task_id: null });
    payload.counts = { ...(payload.counts as object), working: 0, preparation: 1 };
    const result = decodeOperatorFleetSnapshot(payload);
    expect(result.snapshot_consistency).toBe('stable');
    expect(result.repositories[0]!.cards[0]!.readiness_blockers).toEqual(blockers);
  });
  test('counts a missing canonical row only as isolated execution', () => {
    const payload = fleetPayloadWithCard({ issue_state: null, task_label: null, task_index: null, placement: { kind: 'unclassified', reason: 'canonical_missing' } });
    payload.snapshot_consistency = 'degraded';
    (payload.repositories as Record<string, unknown>[])[0]!.snapshot_consistency = 'degraded';
    payload.counts = { ...(payload.counts as object), working: 0, known_tasks: 0, isolated_execution: 1 };
    expect(decodeOperatorFleetSnapshot(payload).counts).toMatchObject({ known_tasks: 0, isolated_execution: 1, unclassified: 0 });
  });
});

test('current context transport preserves selected approval, abort and uncached read semantics',async()=>{
  const {fetchTaskContext}=await import('../../src/operator-web/task-context');
  const {admittedTaskContextFixture}=await import('../../src/operator-web/fixture');
  const request={repository_id:'repo-a',provider_repository_id:'123',issue_id:'456',campaign_id:'review',task:taskId,role:'worker',claim_ref:'claim:1',claim_revision:snapshotDigest,grant_sha256:snapshotDigest,policy_sha256:snapshotDigest,actor_id:'owner',session_binding_sha256:snapshotDigest};
  const context=admittedTaskContextFixture(request);
  const original=globalThis.fetch,controller=new AbortController();let url='';let observed:RequestInit|undefined;
  try {
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);observed=init;return Response.json(context);}) as typeof fetch;
    expect(await fetchTaskContext(request,controller.signal)).toEqual(context);
    const query=new URLSearchParams(Object.entries(request).filter(([key])=>key!=='repository_id'));
    expect(url).toBe(`/api/v1/fleet/task-sessions/repo-a/context?${query}`);expect(observed).toMatchObject({cache:'no-store',signal:controller.signal});
    globalThis.fetch=(async()=>Response.json({...context,selector:{...request,grant_sha256:'sha256:'+'f'.repeat(64)}})) as unknown as typeof fetch;
    await expect(fetchTaskContext(request,controller.signal)).rejects.toThrow('Invalid admitted task context');
    globalThis.fetch=(async()=>Response.json({code:'stale'},{status:409})) as unknown as typeof fetch;
    await expect(fetchTaskContext(request,controller.signal)).rejects.toThrow('stale');
  } finally {globalThis.fetch=original;}
});

test('Fleet protocol8 requires a valid service epoch and rejects protocol6', () => {
  const payload = validFleetPayload();
  expect(() => decodeOperatorFleetSnapshot({ ...payload, protocol: 6 })).toThrow();
  for (const epoch of [undefined, null, '', 'unknown', '00000000-0000-1000-8000-000000000001']) {
    expect(() => decodeOperatorFleetSnapshot({ ...payload, service_epoch: epoch })).toThrow();
  }
  expect(decodeOperatorFleetSnapshot(payload).service_epoch).toBe('00000000-0000-4000-8000-000000000001');
});

test('admitted activity requires a closed selected session and unique pagination keys', async () => {
  const {parseAdmittedTaskActivityRequest,decodeAdmittedTaskActivity} = await import('../../src/core/operator/admitted-task-activity');
  const selector={repository_id:'repo-a',provider_repository_id:'123',issue_id:'456',campaign_id:'review',task:'a'.repeat(64),role:'deep-reasoner',claim_ref:'claim:1',claim_revision:snapshotDigest,grant_sha256:snapshotDigest,policy_sha256:snapshotDigest,actor_id:'owner',session_binding_sha256:snapshotDigest};
  const query=new URLSearchParams(Object.entries(selector).filter(([key])=>key!=='repository_id'));
  const request=parseAdmittedTaskActivityRequest('repo-a',query);
  expect(request).toEqual({selector,limit:50,after:null,message_id:null});
  const duplicate=new URLSearchParams(query);duplicate.append('issue_id','789');expect(()=>parseAdmittedTaskActivityRequest('repo-a',duplicate)).toThrow();
  const extra=new URLSearchParams(query);extra.set('source_root','/tmp/foreign');expect(()=>parseAdmittedTaskActivityRequest('repo-a',extra)).toThrow();
  const value: import('../../src/core/operator/admitted-task-activity').AdmittedTaskActivity={...request,protocol:2,kind:'operator_admitted_task_activity',admission_sha256:snapshotDigest,observed_at:'2026-10-25T00:00:00Z',consistency:'observed',entries:[],coverage:{scope:'task',complete:true,reason:null,scanned:0,bytes:0},next_cursor:null};
  expect(decodeAdmittedTaskActivity(value,request)).toEqual(value);
  expect(()=>decodeAdmittedTaskActivity({...value,selector:{...selector,grant_sha256:'sha256:'+'9'.repeat(64)}},request)).toThrow();
  expect(()=>decodeAdmittedTaskActivity({...value,source_root:'/tmp/private'},request)).toThrow();
  expect(()=>decodeAdmittedTaskActivity({...value,protocol:1,kind:'operator_task_activity'},request)).toThrow();
});


test('current provider links select an exact session without falling back to task history', async () => {
  const {parseTaskLocation,taskLocationSearch}=await import('../../src/operator-web/task-location');
  const current=parseTaskLocation(`?repository=repo-a&provider_repository_id=123&issue_id=456&session_binding_sha256=${snapshotDigest}`);
  expect(current.invalid).toBe(false);expect(current.selection?.historical).toBe(false);
  expect(parseTaskLocation(taskLocationSearch(current.repositoryId,current.selection))).toEqual(current);
  const unassigned=parseTaskLocation('?repository=repo-a&provider_repository_id=123&issue_id=456');
  expect(unassigned.selection).toMatchObject({historical:false,sessionBinding:null,key:'repo-a:123:456:unassigned'});
  for(const query of [`?repository=repo-a&task=${taskId}`, '?repository=repo-a&provider_repository_id=123&issue_id=456&issue_id=789', '?repository=repo-a&provider_repository_id=123&issue_id=456&view=history'])expect(parseTaskLocation(query).invalid).toBe(true);
});

test('retired task and history selectors are rejected as invalid locations', async () => {
  const {parseTaskLocation}=await import('../../src/operator-web/task-location');
  const id='a'.repeat(64),revision='b'.repeat(64);
  for(const query of [`?repository=repo-1&task=${id}`,`?repository=repo-1&task=${id}&task_revision=${revision}`,'?repository=repo-1&view=history'])expect(parseTaskLocation(query).invalid).toBe(true);
});

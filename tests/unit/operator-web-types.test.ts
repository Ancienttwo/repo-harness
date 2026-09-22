import { describe, expect, test } from 'bun:test';

import {
  decodeOperatorCollaborationSnapshot,
  decodeOperatorWorkExchangeSnapshot,
  decodeOperatorFleetSnapshot,
  decodeOperatorTaskMessageResponse,
  OPERATOR_API_ERROR_CODES,
  OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR,
  OPERATOR_REPOSITORY_ERROR_CODES,
  OperatorCollaborationPayloadError,
  OperatorPayloadError,
  OperatorTaskMessageResponseError,
} from '../../src/operator-web/types';
import { collaborationObservationFixture, operatorFixtures } from '../../src/operator-web/fixture';
import { planningObservationFixture, stableSnapshot } from '../../src/operator-web/fixture';
import { decodeOperatorPlanningSnapshot } from '../../src/core/operator/planning-snapshot';
import { isOperatorMessageKey, translate, type OperatorMessageKey } from '../../src/operator-web/i18n';

const taskId = 'a'.repeat(64);
const taskRevision = 'b'.repeat(64);
const claimId = '00000000-0000-4000-8000-000000000001';
const snapshotDigest = `sha256:${'c'.repeat(64)}`;

test('Planning transport binds canonical task observations and requires protocol4 source isolation',()=>{
  const repository=stableSnapshot.repositories[0]!,snapshot=planningObservationFixture(collaborationSnapshot.repository_id,repository.cards);
  const envelope={...collaborationSnapshot,planning:{status:'observed' as const,observed_at:snapshot.observation.observed_at,snapshot}};
  expect(decodeOperatorCollaborationSnapshot(envelope).planning).toEqual(envelope.planning);
  const {planning:_,...missing}=envelope;
  expect(()=>decodeOperatorCollaborationSnapshot(missing)).toThrow();
  expect(()=>decodeOperatorCollaborationSnapshot({...envelope,protocol:3})).toThrow();
  const canonical=snapshot.canonical!,task=snapshot.tasks[0]!;
  for(const bad of [
    {...snapshot,repository_id:'another-repo'},
    {...snapshot,canonical:{...canonical,commit:'d'.repeat(40)}},
    {...snapshot,tasks:[task,task]},
    {...snapshot,tasks:Array.from({length:201},()=>task)},
    {...snapshot,graph:{status:'observed',observed_at:snapshot.observation.observed_at,snapshot:{lane:'engineering-v2',work_graph_revision:snapshotDigest,packages:[],sources:Array.from({length:9},(_,index)=>({repository_id:`repo_${index.toString(16).padStart(16,'0')}`,commit:canonical.commit,work_graph_revision:snapshotDigest}))}}},
    {...snapshot,tasks:[{...task,observation:{...task.observation,authorization_revision:2}}]},
    {...snapshot,tasks:[{...task,canonical:{...canonical,sprint_path:'../secret'}}]},
    {...snapshot,graph:{...snapshot.graph,observed_at:'2025-01-01T00:00:00Z'}},
    {...snapshot,graph:{status:'observed',observed_at:snapshot.observation.observed_at,snapshot:{lane:'unclassified',work_graph_revision:snapshotDigest,packages:[],sources:[]}}},
  ])expect(()=>decodeOperatorPlanningSnapshot(bad,collaborationSnapshot.repository_id)).toThrow();
  const unavailable={status:'unavailable' as const,observed_at:snapshot.observation.observed_at,code:'source_unavailable' as const};
  expect(decodeOperatorCollaborationSnapshot({...envelope,planning:unavailable}).exchange.status).toBe('observed');
});

function validFleetPayload(): Record<string, unknown> {
  return {
    protocol: 6,
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
        task_revision: taskRevision,
        task_label: 'validate operator identity',
        task_index: 1,
        claim_id: claimId,
        generation: 1,
        task_state: 'pending',
        placement: { kind: 'column', column: 'working' },
        attention_owner: 'agent',
        execution_readiness: 'execution_ready', readiness_blockers: [],
        lease_state: 'bound',
        publication_id: null,
        head_sha: null,
        merge_readiness: null,
        blocker_codes: [],
        feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
        inbox: {
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

function validExchangePayload(): import("../../src/core/operator/collaboration-snapshot").OperatorWorkExchangeSnapshot {
  return {
    protocol: 1,
    kind: 'operator_work_exchange_snapshot',
    repository_id: 'repo-1',
    mode: 'off',
    snapshot_consistency: 'stable',
    degraded_sources: [],
    changed_sources: [],
    threads: [],
    signals: [],
    handoffs: [],
    participants: [],
    opportunities: [],
    unverified_execution_context_count: 0,
    source_snapshot_sha256: snapshotDigest,
  };
}

function validCollaborationPayload() { return collaborationObservationFixture(validExchangePayload()); }

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

    expect(card).toMatchObject({ task_id: taskId, task_revision: taskRevision, claim_id: claimId, generation: 1 });
    expect(card?.task_id).toMatch(/^[0-9a-f]{64}$/u);
    expect(card?.task_revision).toMatch(/^[0-9a-f]{64}$/u);
    expect(card?.claim_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  });

  test.each([
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

  test('accepts mode as a closed collaboration consistency source', () => {
    expect(decodeOperatorWorkExchangeSnapshot({
      ...validExchangePayload(),
      snapshot_consistency: 'changed_during_read',
      changed_sources: ['mode'],
    }).changed_sources).toEqual(['mode']);
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

  test('uses a collaboration-specific validation contract while Fleet keeps its own contract', () => {
    expect(() => decodeOperatorFleetSnapshot({ ...validFleetPayload(), protocol: 99 })).toThrow(OperatorPayloadError);

    let protocolError: unknown;
    try {
      decodeOperatorCollaborationSnapshot({ ...validCollaborationPayload(), protocol: 99 });
    } catch (error) {
      protocolError = error;
    }
    expect(protocolError).toBeInstanceOf(OperatorCollaborationPayloadError);
    expect(protocolError).toMatchObject(OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR);
    expect(protocolError).not.toBeInstanceOf(OperatorPayloadError);

    expect(() => decodeOperatorCollaborationSnapshot({
      ...validCollaborationPayload(),
      threads: [{ thread_key: 'missing-required-fields' }],
    })).toThrow(OperatorCollaborationPayloadError);
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
    { placement: undefined }, { task_state: undefined }, { readiness_blockers: undefined },
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
    const payload = fleetPayloadWithCard({ placement: { kind: 'preparation' }, execution_readiness: 'planning_required', readiness_blockers: blockers, lease_state: 'available', claim_id: null, generation: null });
    payload.counts = { ...(payload.counts as object), working: 0, preparation: 1 };
    const result = decodeOperatorFleetSnapshot(payload);
    expect(result.snapshot_consistency).toBe('stable');
    expect(result.repositories[0]!.cards[0]!.readiness_blockers).toEqual(blockers);
  });
  test('counts a missing canonical row only as isolated execution', () => {
    const payload = fleetPayloadWithCard({ task_state: 'missing', task_label: null, task_index: null, placement: { kind: 'unclassified', reason: 'canonical_missing' } });
    payload.snapshot_consistency = 'degraded';
    (payload.repositories as Record<string, unknown>[])[0]!.snapshot_consistency = 'degraded';
    payload.counts = { ...(payload.counts as object), working: 0, known_tasks: 0, isolated_execution: 1 };
    expect(decodeOperatorFleetSnapshot(payload).counts).toMatchObject({ known_tasks: 0, isolated_execution: 1, unclassified: 0 });
  });
});

describe('historical activity browser transport', () => {
  test('sends only the exact selector, no-store and AbortSignal, then binds the decoded response', async () => {
    const { fetchTaskActivity }=await import('../../src/operator-web/task-activity');
    const request={repository_id:'repo-a',task_id:taskId,limit:50,after:null,message_id:null};
    const snapshot={...request,protocol:1,kind:'operator_task_activity',observed_at:'2026-09-22T00:00:00.000Z',consistency:'observed',entries:[],coverage:{scope:'task',complete:true,reason:null,scanned:0,bytes:0},next_cursor:null} as const;
    const original=globalThis.fetch;const controller=new AbortController();let observed:RequestInit|undefined;let url='';
    try {
      globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);observed=init;return Response.json(snapshot);}) as typeof fetch;
      expect(await fetchTaskActivity(request,controller.signal)).toEqual(snapshot);
      expect(url).toBe(`/api/v1/fleet/tasks/repo-a/${taskId}/activity?limit=50`);expect(observed).toMatchObject({cache:'no-store',signal:controller.signal});
      globalThis.fetch=(async()=>Response.json({...snapshot,repository_id:'repo-b'})) as unknown as typeof fetch;
      await expect(fetchTaskActivity(request,controller.signal)).rejects.toThrow('Invalid task activity response');
    } finally {globalThis.fetch=original;}
  });
});

test('current context transport preserves expected revision, abort and uncached read semantics',async()=>{
  const {fetchTaskContext}=await import('../../src/operator-web/task-context');
  const request={repository_id:'repo-a',task_id:taskId,expected_task_revision:taskRevision};
  const context:import('../../src/core/operator/task-context').OperatorTaskContext={
    protocol:1,kind:'operator_task_context',repository_id:'repo-a',task_id:taskId,task_revision:taskRevision,
    canonical:{target_ref:'main',commit:'c'.repeat(40),sprint_path:'plans/sprints/current.md'},task:{title:'Task',mode:'contract',acceptance:'read only',state:'pending'},
    execution:{lease_state:'available',claim:null},offer:{execution_readiness:'planning_required',blockers:[{code:'plan_missing',attention_owner:'agent'}],offer_revision:snapshotDigest,plan:null},
    observation:{observed_at:'2026-09-22T00:00:00.000Z',board_revision:snapshotDigest,authorization_revision:1,consistency:'observed'},
  };
  const original=globalThis.fetch,controller=new AbortController();let url='';let observed:RequestInit|undefined;
  try {
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{url=String(input);observed=init;return Response.json(context);}) as typeof fetch;
    expect(await fetchTaskContext(request,controller.signal)).toEqual(context);
    expect(url).toBe(`/api/v1/fleet/tasks/repo-a/${taskId}/context?task_revision=${taskRevision}`);expect(observed).toMatchObject({cache:'no-store',signal:controller.signal});
    globalThis.fetch=(async()=>Response.json({...context,task_revision:'f'.repeat(64)})) as unknown as typeof fetch;
    await expect(fetchTaskContext(request,controller.signal)).rejects.toThrow('Invalid task context response');
    globalThis.fetch=(async()=>Response.json({code:'stale'},{status:409})) as unknown as typeof fetch;
    await expect(fetchTaskContext(request,controller.signal)).rejects.toThrow('stale');
  } finally {globalThis.fetch=original;}
});

describe('repository snapshot transport', () => {
  test('binds nested identity and generation with a strict envelope', async () => {
    const { decodeOperatorRepositorySnapshot } = await import('../../src/operator-web/repository-snapshot');
    const value = { automation: automationFixture('repo-1'), protocol: 2, kind: 'operator_repository_snapshot', repository_id: 'repo-1',
      service_epoch: '00000000-0000-4000-8000-000000000001', generation: 1, snapshot: validFleetPayload() };
    expect(decodeOperatorRepositorySnapshot(value, 'repo-1')).toMatchObject({ repository_id: 'repo-1' });
    for (const bad of [{ ...value, protocol: 1 }, { ...value, generation: 2 }, { ...value, generation: 0 },
      { ...value, service_epoch: 'unknown' }, { ...value, repository_id: 'repo-2' }, { ...value, path: '/private' },
      { ...value, snapshot: { ...value.snapshot, repositories: [] } }]) {
      expect(() => decodeOperatorRepositorySnapshot(bad, 'repo-1')).toThrow();
    }
  });
  test('fetches an uncached selected repository with cancellation and typed refusal', async () => {
    const { fetchRepositorySnapshot } = await import('../../src/operator-web/repository-snapshot');
    const original = globalThis.fetch;
    const controller = new AbortController();
    let called = 0;
    globalThis.fetch = (async (input, init) => {
      called += 1;
      expect(input).toBe('/api/v1/fleet/repositories/repo-1/snapshot');
      expect(init?.cache).toBe('no-store'); expect(init?.signal).toBe(controller.signal);
      return new Response(JSON.stringify({ error: { code: 'fleet_repository_not_found' } }), { status: 404 });
    }) as typeof fetch;
    try {
      await expect(fetchRepositorySnapshot('repo-1', controller.signal)).rejects.toThrow('fleet_repository_not_found');
      await expect(fetchRepositorySnapshot('../root', controller.signal)).rejects.toThrow('repository_snapshot_invalid');
      expect(called).toBe(1);
    } finally { globalThis.fetch = original; }
  });
});

function automationFixture(repositoryId: string) {
  const source = { status: 'missing' as const, observed_at: '2026-09-22T00:00:00.000Z', reason: null, records: [] };
  return { protocol: 1 as const, repository_id: repositoryId, consistency: 'observed' as const, observed_at: source.observed_at,
    policy: source, grants: source, budgets: source, controllers: source, campaigns: source,
    native_execution: { status: 'unavailable' as const, reason: 'native_admission_authority_unavailable' as const, turn_ref: null },
  };
}

import { decodeOperatorDecisionInventory } from '../../src/core/operator/decision-inventory';
import { decisionInventoryFixture, collaborationSnapshot } from '../../src/operator-web/fixture';

describe('formal Decision wire boundary', () => {
  test('preserves original questions and exact fences, and rejects malformed or cross-query observations', () => {
    const page = decisionInventoryFixture(collaborationSnapshot.repository_id);
    expect(decodeOperatorDecisionInventory(page, page.repository_id, null)).toEqual(page);
    expect(page.entries[0]!.task_fence.lease_generation).toBe(0);
    const entry = page.entries[0]!;
    const malformed: unknown[] = [
      { ...page, repository_id: 'other' }, { ...page, protocol: 2 },
      { ...page, query: { ...page.query, after: 'b'.repeat(64) } },
      { ...page, entries: [entry, entry] },
      { ...page, entries: [{ ...entry, question: 'x'.repeat(16 * 1024 + 1) }] },
      { ...page, entries: [{ ...entry, question: '\u0000' }] },
      { ...page, entries: [{ ...entry, binding_fence: { ...entry.binding_fence, host_id: 'private' } }] },
      { ...page, entries: [{ ...entry, task_fence: { ...entry.task_fence, task_revision: entry.request_sha256 } }] },
      { ...page, coverage: { ...page.coverage, complete: false } },
      { ...page, coverage: { ...page.coverage, bytes_read: 8 * 1024 * 1024 + 1 } },
      { ...page, coverage: { ...page.coverage, reason: 'output_limit', complete: false, next_after: 'a'.repeat(64) } },
    ];
    for (const value of malformed) expect(() => decodeOperatorDecisionInventory(value, page.repository_id, null)).toThrow();
    const partial = { ...page, query: { after: 'b'.repeat(64), limit: 1 }, coverage: { ...page.coverage, complete: false, reason: 'output_limit', next_after: 'a'.repeat(64) } };
    expect(() => decodeOperatorDecisionInventory(partial, page.repository_id, partial.query.after)).toThrow();
    const envelope = { ...collaborationSnapshot, decisions: { status: 'observed' as const, observed_at: '2026-09-22T00:00:00Z', snapshot: page } };
    expect(decodeOperatorCollaborationSnapshot(envelope)).toEqual(envelope);
    expect(() => decodeOperatorCollaborationSnapshot({ ...envelope, protocol: 2 })).toThrow();
    expect(() => decodeOperatorCollaborationSnapshot({ ...envelope, decision_after: 'f'.repeat(64) })).toThrow();
  });
});

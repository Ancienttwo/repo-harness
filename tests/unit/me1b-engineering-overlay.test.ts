import { afterEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initGitRepo, commitAll, run, tmpWorkspace } from '../helpers/repo-fixture';
import { bindEngineerRuntimeSession } from '../helpers/engineer-runtime-fixture';
import { collectEngineeringBoard, type EngineeringOverlayDependencies } from '../../src/effects/engineers/engineering-overlay';
import { readProviderEngineerScheduling, readProviderWorkGraph } from '../../src/effects/engineers/scheduling';
import { readOperatorTaskSessions } from '../../src/effects/operator/task-sessions';
import { decodeOperatorOrganizationSnapshot } from '../../src/core/operator/organization-snapshot';
import { buildProviderEngineerOffers } from '../../src/core/engineers/scheduling';
import { recordAgentRuntimeCapability, recordEngineerOfferSnapshot, AGENT_RUNTIME_EFFECT_RELATIVE_ROOT } from '../../src/effects/engineers/agent-runtime-effect-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor, readRepoHarnessRegistryStrictSnapshot } from '../../src/effects/repo-registry';
import { OPERATOR_REPOSITORY_SNAPSHOT_ROUTE, OPERATOR_ROUTES } from '../../src/effects/operator/server';

const roots: string[] = [], sourceRoot = process.cwd();
const engineerId = 'engineer:capability.verification.evals-checks';
const digest = `sha256:${'a'.repeat(64)}`;
const now = '2026-10-25T15:02:00.000Z';
const temporary = (prefix: string) => { const path = tmpWorkspace(prefix); roots.push(path); return path; };
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

async function fixture() {
  const root = temporary('provider-engineering-overlay'), home = temporary('provider-engineering-registry');
  const authorityHome = temporary('provider-engineering-authority');
  initGitRepo(root);
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/manifest.yaml'), join(root, '.archcontext/manifest.yaml'));
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' } },
    agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } } },
  }));
  const id = repoHarnessRepoIdFor(root);
  const graph = JSON.parse(readFileSync(join(sourceRoot, 'tests/fixtures/provider-work-graph-v2/graph.json'), 'utf8'));
  graph.repository_id = id;
  graph.work_packages[0].primary_capability = 'capability.verification.evals-checks';
  mkdirSync(join(root, 'tests/fixtures'), { recursive: true });
  cpSync(join(sourceRoot, 'tests/fixtures/provider-work-graph-v2'), join(root, 'tests/fixtures/provider-work-graph-v2'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/work-graph.v2.json'), JSON.stringify(graph));
  commitAll(root, 'provider graph fixture');
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id, path: root, accessMode: 'read_write', source: 'manual', registeredAt: now, lastSeenAt: now,
  }] }));
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  const session = await bindEngineerRuntimeSession(root, engineerId, { authorityHome,
    repositoryId: '123456', issueId: '987654' });
  // Inject only the private fixture approval/provider runner. The shared reader still
  // discovers and validates the actual public-lifecycle binding and current admission.
  const readScheduling: EngineeringOverlayDependencies['readScheduling'] = (repo, observedEnv) => readProviderEngineerScheduling(repo, observedEnv, {
    readSessions: input => readOperatorTaskSessions(input, { currentSource: () => session.source.authority.source }),
  });
  return { root, env, id, session, readScheduling };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function board(fx: Fixture, overrides: Partial<EngineeringOverlayDependencies> = {}, between_reads?: () => void) {
  return collectEngineeringBoard({ repo_root: fx.root, env: fx.env, observed_at: now,
    dependencies: { readScheduling: fx.readScheduling, ...overrides }, between_reads });
}
function prepareWake(fx: Fixture) {
  const capability = recordAgentRuntimeCapability(fx.root, { adapter_kind: 'herdr-cli-agent',
    transport_endpoint_sha256: fx.session.endpoint.transport_endpoint_sha256,
    operations: { notify_inbox: 'supported', wake_for_offer: 'supported' },
    evidence_refs: [{ ref: 'offline-fixture', sha256: digest }], observed_at: now });
  return recordEngineerOfferSnapshot({ repo_root: fx.root, source: fx.session.source,
    offers: buildProviderEngineerOffers({ repository_id: fx.id, engineer_id: engineerId,
      engineer_contract_revision: fx.session.endpoint.engineer_contract_revision,
      session_binding_sha256: fx.session.endpoint.session_binding_sha256, authorization_revision: 1, planning_revision: digest,
      offers: [{ provider_repository_id: '123456', issue_id: '987654', source_revision: digest, eligible: true, blockers: [] }] }),
    observed_at: now, expected_capability_sha256: capability.capability_sha256,
    wake_policy: { debounce_ms: 0, polling_fallback_enabled: false }, env: fx.env });
}

describe('admitted engineering overlay', () => {
  test('observes explicit profiles and real sessions without mutating tracked files', async () => {
    const fx = await fixture();
    const before = run('git', ['status', '--porcelain=v1'], fx.root).stdout;
    const result = board(fx);
    expect(result.overlay.snapshot_consistency).toBe('stable');
    expect(result.overlay.scheduling!.tasks.flatMap(task => task.sessions).map(item => item.selection)).toContainEqual({
      state: 'selected', engineer_id: engineerId, engineer_contract_revision: fx.session.endpoint.engineer_contract_revision,
    });
    expect(result.overlay.runtime_effects.engineers.find(item => item.engineer_id === engineerId)!.effects.wake!.pending).toBe(0);
    expect(decodeOperatorOrganizationSnapshot(result, fx.id)).toEqual(result);
    const forged = { ...result, overlay: { ...result.overlay, scheduling: { ...result.overlay.scheduling!, profiles: result.overlay.scheduling!.profiles.map((profile, index) => index === 0 ? { ...profile, capability_id: 'capability.overlay.mismatch' } : profile) } } };
    expect(() => decodeOperatorOrganizationSnapshot(forged, fx.id)).toThrow();
    expect(() => decodeOperatorOrganizationSnapshot({ ...result, overlay: { ...result.overlay, components: [...result.overlay.components].reverse() } }, fx.id)).toThrow();
    expect(run('git', ['status', '--porcelain=v1'], fx.root).stdout).toEqual(before);
  });
  test('does not call a mixed runtime read stable and leaves the provider graph unchanged', async () => {
    const fx = await fixture();
    const repo = readRepoHarnessRegistryStrictSnapshot({ env: fx.env }).repos[0]!;
    const graphBefore = readProviderWorkGraph(repo);
    expect(graphBefore.graph.work_packages).toHaveLength(1);
    const result = board(fx, {}, () => { prepareWake(fx); });
    expect(result.overlay.snapshot_consistency).toBe('changed_during_read');
    const component = result.overlay.components.find(item => item.component === 'runtime_effects')!;
    expect(component.observation_before).not.toBe(component.observation_after);
    expect(result.overlay.runtime_effects.engineers.find(item => item.engineer_id === engineerId)!.effects.wake!.pending).toBe(1);
    expect(readProviderWorkGraph(repo).graph).toEqual(graphBefore.graph);
  });
  test('malformed runtime evidence stays unavailable and cannot be decoded as stable', async () => {
    const fx = await fixture();
    const result = prepareWake(fx);
    const effect = result.status!.intent.effect_id.slice(7);
    const intentPath = join(resolveGitCommonDirectory(fx.root), AGENT_RUNTIME_EFFECT_RELATIVE_ROOT, 'effects', effect, 'intent.json');
    writeFileSync(intentPath, '{broken');
    const observed = board(fx);
    expect(observed.overlay.snapshot_consistency).toBe('degraded');
    expect(observed.overlay.runtime_effects).toEqual({ support: 'unreadable', engineers: [] });
    expect(observed.overlay.scheduling).not.toBeNull();
    expect(decodeOperatorOrganizationSnapshot(observed, fx.id)).toEqual(observed);
    expect(() => decodeOperatorOrganizationSnapshot({ ...observed, overlay: { ...observed.overlay, snapshot_consistency: 'stable' } }, fx.id)).toThrow();
  });
  test('source failure in either read produces the same degraded result', async () => {
    const fx = await fixture();
    const losing = (failure: number) => { let calls = 0; return board(fx, { readScheduling: (...args) => {
      if (++calls === failure) throw new Error('profile/session source unavailable');
      return fx.readScheduling(...args);
    } }); };
    const before = losing(1), after = losing(2);
    expect(before.overlay.scheduling).toBeNull();
    expect(before.overlay.components.every(item => item.support === 'unreadable')).toBeTrue();
    expect(after.overlay.snapshot_sha256).toBe(before.overlay.snapshot_sha256);
    expect(after.organization_attention).toEqual(before.organization_attention);
  });
  test('registry failure refuses the whole observation', async () => {
    const fx = await fixture();
    expect(() => board(fx, { readRegistry: () => { throw new Error('unreadable registry'); } })).toThrow('unreadable registry');
  });
  test('organization stays on the read-only repository route', () => {
    expect(OPERATOR_ROUTES.filter(route => route.id === 'repository_snapshot')).toEqual([{
      id: 'repository_snapshot', method: 'GET', pattern: OPERATOR_REPOSITORY_SNAPSHOT_ROUTE.source, write: false,
    }]);
    expect(OPERATOR_ROUTES.filter(route => /engineer|overlay|organization/iu.test(`${route.id} ${route.pattern}`))).toEqual([]);
  });
  test('profile roster projection stays within the local observation budget', async () => {
    const fx = await fixture();
    const started = performance.now(), observed = board(fx);
    expect(observed.overlay.scheduling!.profiles.length).toBeGreaterThanOrEqual(10);
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

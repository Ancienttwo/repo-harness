import { describe, expect, test } from 'bun:test';

import { ROUTES } from '../../src/cli/hook/route-registry';
import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../src/core/setup/decode';
import { projectSetupSnapshot, type SetupProjectionInput } from '../../src/core/setup/projection';
import { SETUP_HOSTS, type SetupSnapshotV1 } from '../../src/core/setup/types';

const FAKE_SECRETS = ['sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE0001', 'ghp_FAKEFAKEFAKEFAKEFAKEFAKE0002', 'hunter2-fake-password'];

function input(overrides: Partial<SetupProjectionInput> = {}): SetupProjectionInput {
  return {
    collected_at: '2026-10-10T00:00:00.000Z',
    setup_status: 'attention',
    summary: { ok: 3, warn: 1, fail: 0, na: 1, needs_agent: 2 },
    checks: [
      { id: 'status.adapter.codex', title: 'Codex global hook adapter', status: 'needs_agent', detail: '11/12 managed entries at /Users/alice/.codex/hooks.json; projection drift: Stop.default missing' },
      { id: 'status.adapter.claude', title: 'Claude Code global hook adapter', status: 'ok', detail: '9/9 managed entries at /Users/alice/.claude/settings.json' },
      { id: 'doctor.cli-update', title: 'repo-harness latest version advisory', status: 'na', detail: 'disabled' },
      { id: 'tooling.herdr', title: 'External tooling: herdr', status: 'warn', detail: `password=${FAKE_SECRETS[2]} in /Users/alice/.config/herdr` },
      { id: 'doctor.codex-trust-state', title: 'Codex trust', status: 'warn', detail: `api_key=${FAKE_SECRETS[0]} found` },
      { id: 'global-rules.codex', title: 'Codex user-level Global Working Rules', status: 'needs_agent', detail: 'file missing: /Users/alice/.codex/AGENTS.md' },
      { id: 'tooling.waza', title: 'External tooling: waza', status: 'ok', detail: 'present' },
      { id: 'doctor.cli-version', title: 'repo-harness CLI version', status: 'ok', detail: '0.21.1' },
    ],
    check_commands: new Map([
      ['status.adapter.codex', 'repo-harness install --target codex --location global'],
      ['global-rules.codex', undefined],
      ['doctor.codex-trust-state', `curl -H "Authorization: Bearer ${FAKE_SECRETS[1]}"`],
    ]),
    adapters: [
      { id: 'codex', installed: true, alreadyConfigured: true, managedEntryCount: 11, expectedEntryCount: 12,
        projection: { status: 'drift', mismatches: [{ kind: 'missing', event: 'Stop', routeId: 'default' }, { kind: 'field-mismatch', event: 'PreToolUse', routeId: 'edit', field: 'command' }] } },
      { id: 'claude', installed: true, alreadyConfigured: true, managedEntryCount: 9, expectedEntryCount: 9, projection: { status: 'consistent', mismatches: [] } },
    ],
    cli_versions: { codex: '0.144.2' },
    skill_rows: [
      { host: 'claude', name: 'repo-harness', state: 'ok link', ok: true },
      { host: 'claude', name: 'think', state: 'stale copy', ok: false },
      { host: 'codex', name: 'repo-harness', state: 'ok copy', ok: false },
      { host: 'codex', name: 'think', state: 'missing', ok: false },
    ],
    skill_summaries: new Map([['repo-harness', 'Root router Skill.'], ['think', 'Plans authoring work; authoritative for authorization reviews.']]),
    routes: ROUTES,
    fleet_roles: [
      { name: 'explorer', description: 'Read-only explorer.', model: 'sonnet', effort: 'medium' },
      { name: 'gatekeeper', description: undefined, model: 'opus', effort: undefined },
      { name: undefined, description: 'nameless', model: undefined, effort: undefined },
    ],
    fleet_hosts: { claude: { installed_agents: ['explorer'], missing_agents: ['gatekeeper'] }, codex: { installed_agents: ['explorer', 'gatekeeper'], missing_agents: [] } },
    ...overrides,
  };
}

describe('setup snapshot projection', () => {
  test('projects one setup check build into the public contract', () => {
    const snapshot = decodeSetupSnapshot(projectSetupSnapshot(input()));
    expect(snapshot.status).toBe('ready');
    expect(snapshot.reason).toBeNull();
    expect(snapshot.checks.map(check => [check.id, check.status, check.command])).toEqual([
      ['status.adapter.codex', 'needs_agent', 'repo-harness install --target codex --location global'],
      ['tooling.herdr', 'warn', null],
      ['doctor.codex-trust-state', 'warn', '[configured]'],
      ['global-rules.codex', 'needs_agent', null],
    ]);
    expect(snapshot.hosts.map(host => host.host)).toEqual([...SETUP_HOSTS]);
    expect(snapshot.hosts[1]).toEqual({
      host: 'codex', reported: true, adapter_check: 'needs_agent', detected: true, cli_version: '0.144.2',
      adapter: { configured: true, managed_entries: 11, expected_entries: 12, projection: 'drift', mismatches: [
        { kind: 'missing', event: 'Stop', route_id: 'default', field: null },
        { kind: 'field-mismatch', event: 'PreToolUse', route_id: 'edit', field: 'command' },
      ] },
    });
    expect(snapshot.hosts[0]).toMatchObject({ host: 'claude', adapter_check: 'ok', cli_version: null });
    expect(snapshot.hosts[2]).toEqual({ host: 'pi', reported: false, adapter_check: null, detected: null, adapter: null, cli_version: null });
    expect(snapshot.skills).toEqual([
      { name: 'repo-harness', summary: 'Root router Skill.', hosts: { claude: { state: 'ok link', ok: true }, codex: { state: 'ok copy', ok: false }, pi: null } },
      { name: 'think', summary: 'Plans authoring work; authoritative for authorization reviews.', hosts: { claude: { state: 'stale copy', ok: false }, codex: { state: 'missing', ok: false }, pi: null } },
    ]);
    expect(snapshot.hooks.flatMap(event => event.routes.map(route => `${event.event}.${route.route_id}`)))
      .toEqual(ROUTES.map(route => `${route.event}.${route.routeId}`));
    expect(snapshot.hooks.find(event => event.event === 'SubagentStop')?.routes).toEqual([{ route_id: 'quality', matcher: null, hosts: ['codex'] }]);
    expect(snapshot.hooks.find(event => event.event === 'Stop')?.routes[0]?.hosts).toEqual(['claude', 'codex', 'pi']);
    expect(snapshot.fleet).toEqual([
      { name: 'explorer', description: 'Read-only explorer.', model: 'sonnet', effort: 'medium', hosts: { claude: 'installed', codex: 'installed', pi: null } },
      { name: 'gatekeeper', description: null, model: 'opus', effort: null, hosts: { claude: 'missing', codex: 'installed', pi: null } },
    ]);
  });

  test('redacts every path and credential from the fake-credential fixture', () => {
    const text = JSON.stringify(projectSetupSnapshot(input()));
    expect(text).not.toContain('/Users/');
    for (const secret of FAKE_SECRETS) expect(text).not.toContain(secret);
    expect(text).toContain('[private path]');
  });

  test('copies package-owned text verbatim and redacts only machine-state text', () => {
    const snapshot = decodeSetupSnapshot(projectSetupSnapshot(input()));
    expect(snapshot.skills[1]?.summary).toBe('Plans authoring work; authoritative for authorization reviews.');
    expect(snapshot.checks.find(check => check.id === 'tooling.herdr')?.detail).toBe('[configured]');
  });

  test('reports nothing for a host or role the authority does not cover', () => {
    const snapshot = decodeSetupSnapshot(projectSetupSnapshot(input({
      adapters: [{ id: 'claude', installed: false, alreadyConfigured: false, managedEntryCount: 0, expectedEntryCount: 9 }],
      skill_rows: null,
      fleet_hosts: { claude: { installed_agents: 'explorer' } },
      cli_versions: {},
    })));
    expect(snapshot.hosts[0]).toEqual({ host: 'claude', reported: true, adapter_check: 'ok', detected: false, adapter: null, cli_version: null });
    expect(snapshot.hosts[1]).toMatchObject({ host: 'codex', reported: false, adapter: null });
    expect(snapshot.skills).toEqual([]);
    expect(snapshot.fleet.every(role => SETUP_HOSTS.every(host => role.hosts[host] === null))).toBe(true);
  });
});

describe('setup snapshot decoder', () => {
  const ready = (): SetupSnapshotV1 => projectSetupSnapshot(input());
  const rejects = (mutate: (snapshot: any) => void) => {
    const snapshot = structuredClone(ready()) as any;
    mutate(snapshot);
    expect(() => decodeSetupSnapshot(snapshot)).toThrow('setup projection invalid');
  };

  test('accepts the pending, failed and stale shapes', () => {
    expect(decodeSetupSnapshot(unavailableSetupSnapshot())).toMatchObject({ status: 'unavailable', reason: 'collection_pending' });
    expect(decodeSetupSnapshot(unavailableSetupSnapshot('setup_check_timeout')).reason).toBe('setup_check_timeout');
    expect(decodeSetupSnapshot({ ...ready(), status: 'stale', reason: 'setup_check_failed' }).status).toBe('stale');
  });

  test('rejects unredacted text, extra keys and inconsistent facts', () => {
    rejects(s => { s.checks[0].detail = 'config at /Users/alice/.codex/hooks.json'; });
    rejects(s => { s.checks[0].command = `export GH_TOKEN=${FAKE_SECRETS[1]}`; });
    rejects(s => { s.fleet[0].description = 'C:\\Users\\alice'; });
    rejects(s => { s.skills[0].summary = 'Reads /Users/alice/.codex/skills'; });
    rejects(s => { s.skills[0].summary = 'two\nlines'; });
    rejects(s => { s.fleet[0].model = 'opus at high'; });
    rejects(s => { s.extra = true; });
    rejects(s => { s.hosts[0].adapter.mismatches[0] = { kind: 'missing', event: 'Stop', route_id: null, field: null, expected: 'x' }; });
    rejects(s => { s.hosts.reverse(); });
    rejects(s => { s.hosts[2].detected = false; });
    rejects(s => { s.skills[1].hosts.codex = { state: 'missing', ok: true }; });
    rejects(s => { s.skills[0].hosts = { claude: null, codex: null, pi: null }; });
    rejects(s => { s.skills[0].hosts.claude.state = 'ok link -> /x'; });
    rejects(s => { s.status = 'stale'; });
    rejects(s => { s.reason = 'collection_pending'; s.status = 'stale'; });
    rejects(s => { s.hooks.reverse(); });
    rejects(s => { s.checks.push({ ...s.checks[0] }); });
    rejects(s => { s.hosts[1].cli_version = 'codex-cli 0.1'; });
    rejects(s => { Object.assign(s, unavailableSetupSnapshot(), { hooks: s.hooks }); });
  });
});

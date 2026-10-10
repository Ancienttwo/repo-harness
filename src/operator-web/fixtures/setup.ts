// Development fixtures for GET /api/v1/setup. Shapes follow
// src/core/setup/types.ts; every fixture passes the same decoder the browser
// applies to served snapshots. Names and summaries mirror the real catalog,
// route registry and agent fleet so the pages read like a real machine.

import { unavailableSetupSnapshot } from '../../core/setup/decode';
import type {
  SetupFleetRole,
  SetupHookEvent,
  SetupHostFacts,
  SetupSkill,
  SetupSkillHostRow,
  SetupSnapshotV1,
} from '../../core/setup/types';

const ok = (state: 'ok link' | 'ok copy' = 'ok link'): SetupSkillHostRow => ({ state, ok: true });
const bad = (state: SetupSkillHostRow['state']): SetupSkillHostRow => ({ state, ok: false });

const HOOKS: SetupHookEvent[] = [
  { event: 'SessionStart', routes: [{ route_id: 'default', matcher: null, hosts: ['claude', 'codex', 'pi'] }] },
  { event: 'PreToolUse', routes: [
    { route_id: 'edit', matcher: 'Edit|Write', hosts: ['claude', 'codex', 'pi'] },
    { route_id: 'subagent', matcher: 'Task|Agent|SendUserMessage', hosts: ['claude', 'codex'] },
  ] },
  { event: 'PostToolUse', routes: [
    { route_id: 'edit', matcher: 'Edit|Write', hosts: ['claude', 'codex', 'pi'] },
    { route_id: 'bash', matcher: 'Bash', hosts: ['claude', 'codex', 'pi'] },
    { route_id: 'always', matcher: null, hosts: ['claude', 'codex'] },
  ] },
  { event: 'UserPromptSubmit', routes: [
    { route_id: 'default', matcher: null, hosts: ['claude', 'codex', 'pi'] },
    { route_id: 'inbox', matcher: null, hosts: ['claude', 'codex'] },
    { route_id: 'delegation', matcher: null, hosts: ['codex'] },
  ] },
  { event: 'SubagentStart', routes: [{ route_id: 'context', matcher: null, hosts: ['codex'] }] },
  { event: 'SubagentStop', routes: [{ route_id: 'quality', matcher: null, hosts: ['codex'] }] },
  { event: 'Stop', routes: [{ route_id: 'default', matcher: null, hosts: ['claude', 'codex', 'pi'] }] },
];

const SUMMARY: Readonly<Record<string, string>> = {
  'repo-harness': 'Root router Skill; canonical entrypoint synced unconditionally to both hosts regardless of install profile.',
  'repo-harness-setup': 'Canonical rule owner for installing, migrating, upgrading, repairing, scaffolding, and capability-configuring repo-harness.',
  'repo-harness-check': 'Plan or review scoped work. Assess recorded verification and risk.',
  'repo-harness-test': 'Testing router for the repo-harness source checkout: test selection, execution and CI lanes.',
  'repo-harness-ship': 'Validates finished worktrees, commits through finish --no-merge, pushes branches, and creates GitHub PRs by default.',
  'repo-harness-architecture': 'Resolves architecture drift requests and updates architecture docs or diagrams without refreshing the harness.',
  'obsidian-memory': "Cross-project long-term memory over the user's Obsidian brain vault.",
  herdr: 'Required Herdr control skill. Install the release-matched body from herdr --skill for both hosts.',
  think: 'Waza planning skill: turns rough ideas into approved, decision-complete plans.',
  hunt: 'Waza root-cause debugging skill.',
};

function skill(name: string, claude: SetupSkillHostRow | null, codex: SetupSkillHostRow | null, pi: SetupSkillHostRow | null = null): SetupSkill {
  return { name, summary: SUMMARY[name] ?? null, hosts: { claude, codex, pi } };
}

function readySkills(): SetupSkill[] {
  return [
    skill('repo-harness', ok(), ok(), ok('ok copy')),
    skill('repo-harness-setup', ok(), ok()),
    skill('repo-harness-check', ok(), ok(), ok('ok copy')),
    skill('repo-harness-test', ok(), ok()),
    skill('repo-harness-ship', ok(), ok()),
    skill('repo-harness-architecture', ok(), ok()),
    skill('obsidian-memory', ok(), ok()),
    skill('herdr', ok('ok copy'), ok('ok copy'), ok('ok copy')),
    skill('think', ok('ok copy'), ok('ok copy')),
    skill('hunt', ok('ok copy'), ok('ok copy')),
  ];
}

const FLEET: readonly (Omit<SetupFleetRole, 'hosts'>)[] = [
  { name: 'deep-reasoner', model: 'opus', effort: 'xhigh', description: 'Architecture research and judgment executor on Opus at xhigh effort.' },
  { name: 'deep-worker', model: 'opus', effort: 'high', description: 'Heavy execution worker on Opus at high effort for hard, well-scoped execution.' },
  { name: 'explorer', model: 'sonnet', effort: 'medium', description: 'Read-only codebase explorer on Sonnet at medium effort.' },
  { name: 'fast-worker', model: 'sonnet', effort: 'high', description: 'Fast execution worker on Sonnet at high effort.' },
  { name: 'gatekeeper', model: 'opus', effort: 'high', description: 'Read-only acceptance reviewer on Opus at high effort.' },
  { name: 'harness-evaluator', model: 'opus', effort: 'high', description: 'Disposable-state harness behavior evaluator on Opus at high effort.' },
  { name: 'root-cause-prover', model: 'opus', effort: 'xhigh', description: 'Bugfix diagnosis specialist on Opus at xhigh effort.' },
];

const PI: SetupHostFacts = { host: 'pi', reported: false, adapter_check: null, detected: null, adapter: null, cli_version: null };

export function readySetup(now: number): SetupSnapshotV1 {
  return {
    projection_version: 'repo-harness.setup.v1', status: 'ready', reason: null,
    collected_at: new Date(now - 3 * 60_000).toISOString(),
    setup_status: 'attention',
    summary: { ok: 33, warn: 1, fail: 0, na: 3, needs_agent: 1 },
    checks: [
      {
        id: 'runtime.skills_cli', status: 'warn', title: 'Runtime capability: skills_cli',
        detail: 'missing (optional); owner=external-skills-cli; required_for=Waza and Mermaid external skill bootstrap',
        command: 'bunx skills --version',
      },
      {
        id: 'doctor.security-config', status: 'needs_agent', title: 'Local hook and VS Code automatic task security scan',
        detail: '2 finding(s): 0 high, 2 warn, 0 fail\nfirst=unmanaged-hook-command at [private path]',
        command: 'repo-harness security scan --json',
      },
    ],
    hosts: [
      { host: 'claude', reported: true, adapter_check: 'ok', detected: true, cli_version: null,
        adapter: { configured: true, managed_entries: 9, expected_entries: 9, projection: 'consistent', mismatches: [] } },
      { host: 'codex', reported: true, adapter_check: 'ok', detected: true, cli_version: '0.162.0',
        adapter: { configured: true, managed_entries: 12, expected_entries: 12, projection: 'consistent', mismatches: [] } },
      PI,
    ],
    skills: readySkills(),
    hooks: HOOKS,
    fleet: FLEET.map(role => ({ ...role, hosts: { claude: 'installed', codex: 'installed', pi: null } })),
  };
}

/** The last good read is 25 minutes old, the newest run timed out, and the machine has drifted. */
export function degradedSetup(now: number): SetupSnapshotV1 {
  const skills = readySkills();
  const replace = (name: string, next: SetupSkill) => { skills[skills.findIndex(row => row.name === name)] = next; };
  replace('repo-harness-ship', skill('repo-harness-ship', ok(), bad('missing')));
  replace('herdr', skill('herdr', bad('stale copy'), ok('ok copy'), ok('ok copy')));
  replace('obsidian-memory', skill('obsidian-memory', bad('dangling link'), ok()));
  replace('think', skill('think', bad('ok copy'), ok('ok copy')));
  return {
    projection_version: 'repo-harness.setup.v1', status: 'stale', reason: 'setup_check_timeout',
    collected_at: new Date(now - 25 * 60_000).toISOString(),
    setup_status: 'blocked',
    summary: { ok: 28, warn: 2, fail: 2, na: 3, needs_agent: 1 },
    checks: [
      {
        id: 'runtime.skills_cli', status: 'warn', title: 'Runtime capability: skills_cli',
        detail: 'missing (optional); owner=external-skills-cli', command: null,
      },
      {
        id: 'status.adapter.codex', status: 'warn', title: 'Codex global hook adapter',
        detail: '10/12 managed entries at [private path]\nprojection drift: 3 mismatches',
        command: 'repo-harness install --host codex',
      },
      {
        id: 'doctor.skill-projection', status: 'fail', title: 'Host skills match their source and install ledger',
        detail: 'codex repo-harness-ship: missing\nclaude herdr: stale copy\nclaude obsidian-memory: dangling link',
        command: 'repo-harness skills sync',
      },
      {
        id: 'tooling.agent_fleet', status: 'fail', title: 'External tooling: agent_fleet',
        detail: 'missing; codex lacks gatekeeper and harness-evaluator', command: 'repo-harness install --host codex',
      },
      {
        id: 'doctor.security-config', status: 'needs_agent', title: 'Local hook and VS Code automatic task security scan',
        detail: '2 finding(s): 0 high, 2 warn, 0 fail', command: 'repo-harness security scan --json',
      },
    ],
    hosts: [
      { host: 'claude', reported: true, adapter_check: 'ok', detected: true, cli_version: null,
        adapter: { configured: true, managed_entries: 9, expected_entries: 9, projection: null, mismatches: [] } },
      { host: 'codex', reported: true, adapter_check: 'warn', detected: true, cli_version: '0.162.0',
        adapter: { configured: true, managed_entries: 10, expected_entries: 12, projection: 'drift', mismatches: [
          { kind: 'missing', event: 'SubagentStart', route_id: 'context', field: null },
          { kind: 'missing', event: 'SubagentStop', route_id: 'quality', field: null },
          { kind: 'field-mismatch', event: 'Stop', route_id: 'default', field: 'timeout' },
          { kind: 'unexpected', event: 'PreToolUse', route_id: null, field: null },
        ] } },
      PI,
    ],
    skills,
    hooks: HOOKS,
    fleet: FLEET.map(role => ({
      ...role,
      hosts: { claude: 'installed', codex: role.name === 'gatekeeper' || role.name === 'harness-evaluator' ? 'missing' : 'installed', pi: null },
    })),
  };
}

/** The first background run has not finished. */
export function loadingSetup(): SetupSnapshotV1 {
  return unavailableSetupSnapshot('collection_pending');
}

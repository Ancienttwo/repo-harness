import { Command } from 'commander';
import { listHelperIds, listHelpers, runHelper } from '../runtime/helper-runner';

export const RUN_HELP_MAX_HELPERS = 60;
export const RUN_HELP_MAX_LINES = 81;

export const RUN_HELP_GROUPS = [
  {
    label: 'Planning & execution',
    helpers: [
      'new-spec',
      'new-sprint',
      'new-plan',
      'capture-plan',
      'plan-to-todo',
      'contract-run',
      'cutover-closure',
      'contract-worktree',
      'sprint-backlog',
      'switch-plan',
      'ensure-task-workflow',
    ],
  },
  {
    label: 'Acceptance & delivery',
    helpers: [
      'acceptance-receipt',
      'change-assessment',
      'runtime-evidence-receipt',
      'merge-gate',
      'ship-worktrees',
      'worktree-merge-lib',
      'archive-workflow',
      'classify-historical-plans',
      'verify-contract',
      'verify-sprint',
      'harness-trace-grade',
    ],
  },
  {
    label: 'State & handoff',
    helpers: [
      'refresh-current-status',
      'prepare-handoff',
      'prepare-codex-handoff',
      'codex-handoff-resume',
      'recovery-view-cli',
      'workflow-contract',
      'inspect-project-state',
    ],
  },
  {
    label: 'Verification & maintenance',
    helpers: [
      'run-bounded-verifier-command',
      'validate-harness-profile-benchmark',
      'summarize-failures',
      'check-task-sync',
      'check-deploy-sql-order',
      'check-architecture-sync',
      'check-agent-tooling',
      'check-context-files',
      'check-brain-manifest',
      'check-skill-version',
      'check-task-workflow',
      'maintenance-triage',
      'heartbeat-triage',
    ],
  },
  {
    label: 'Capabilities & architecture',
    helpers: [
      'select-agent-context-blocks',
      'capability-resolver',
      'architecture-event',
      'capability-config',
      'architecture-queue',
      'archive-architecture-request',
      'context-contract-sync',
      'workstream-sync',
    ],
  },
  {
    label: 'Host & knowledge sync',
    helpers: ['install-agent-fleet', 'sync-brain-docs'],
  },
  {
    label: 'Factor lab',
    helpers: ['factor-lab-new', 'factor-lab-promote', 'factor-lab-reject', 'factor-lab-check'],
  },
] as const;

function groupedHelperLines(helpers: ReturnType<typeof listHelpers>): string[] {
  const byId = new Map(helpers.map((helper) => [helper.id, helper]));
  const groupedIds = RUN_HELP_GROUPS.flatMap((group) => group.helpers);
  const groupedIdSet = new Set<string>(groupedIds);
  if (groupedIdSet.size !== groupedIds.length) {
    throw new Error('run help groups contain a duplicate helper id');
  }
  const missing = helpers.map((helper) => helper.id).filter((id) => !groupedIdSet.has(id));
  const unknown = groupedIds.filter((id) => !byId.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`run help groups do not match helper authority (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'})`);
  }

  const width = Math.max(...helpers.map((helper) => helper.id.length));
  return RUN_HELP_GROUPS.flatMap((group, index) => [
    ...(index === 0 ? [] : ['']),
    `${group.label}:`,
    ...group.helpers.map((id) => {
      const helper = byId.get(id)!;
      return `  ${helper.id.padEnd(width)}  ${helper.description}`;
    }),
  ]);
}

function renderHelpersSection(): string {
  let helpers: ReturnType<typeof listHelpers>;
  try {
    helpers = listHelpers();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ['', 'Helpers:', `  (unable to list helpers: ${message})`].join('\n');
  }

  if (helpers.length === 0) return '';

  return ['', 'Helpers:', ...groupedHelperLines(helpers)].join('\n');
}

export function buildRunCommand(): Command {
  const run = new Command('run')
    .description('Run a bundled repo-harness workflow helper')
    .allowUnknownOption(true);

  run
    .argument('<helper>', 'Helper id, for example check-task-workflow')
    .argument('[args...]', 'Arguments passed to the helper')
    .action((helper: string, args: string[]) => {
      const result = runHelper({ helper, args });
      if (result.stderr && result.reason !== 'ok') {
        console.error(result.stderr);
        const helpers = listHelperIds();
        if (helpers.length > 0) console.error(`known helpers: ${helpers.join(', ')}`);
      }
      process.exit(result.exitCode);
    });

  run.addHelpText('after', renderHelpersSection);

  return run;
}

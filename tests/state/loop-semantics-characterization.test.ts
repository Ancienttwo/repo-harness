import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import {
  CONTRACT,
  PLAN,
  ROOT,
  commitFixture,
  createEffectiveStateFixture,
  writeFixture,
} from './effective-state-fixture';

setDefaultTimeout(120_000);

type Profile = 'lite' | 'standard' | 'strict';
type Operation = 'edit' | 'stop' | 'ship';

interface ProcessResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface TargetDelta {
  readonly verdict: string;
  readonly requirements: readonly string[];
  readonly missing_requirements: readonly string[];
  readonly next_action: string;
  readonly behavior_changes: readonly string[];
}

const FIXTURE_PATH = join(import.meta.dir, 'fixtures/loop-semantics/characterization.json');
// HRD-03: pre-edit-guard.sh is retired; its decision surface now lives in
// the in-process mutation-guard handler, invoked through runHook() (see
// runMutationGuardHandler below) rather than as a standalone bash script.
const MUTATION_GUARD_SOURCE = join(ROOT, 'src/cli/hook/mutation-guard.ts');
const RUNTIME_MODULE = join(ROOT, 'src/cli/hook/runtime.ts');
const STOP_HANDLER_SOURCE = join(ROOT, 'src/cli/hook/stop-handler.ts');
const VERIFY_SPRINT = join(ROOT, 'scripts/verify-sprint.sh');
const SHIP_WORKTREES = join(ROOT, 'scripts/ship-worktrees.sh');
const CONTRACT_WORKTREE = join(ROOT, 'scripts/contract-worktree.sh');
const ESA_FIXTURES = join(import.meta.dir, 'fixtures');
const POST_ESA_BASE = '3b33cea2422b1aa1e5be9080be54f731c4f2015d';
const EXECUTION_BASE = 'be3e93ce72c812a33045a15c4d97452c59fa3fbb';
const ESA_GOLDEN_BASE = '82550779cdccf0575d674ae53bbc95ba63e44743';

const CELL_ORDER = [
  'lite.edit.no-plan-contract-allows',
  'standard.edit.complete-work-package-no-contract-blocks',
  'strict.edit.missing-contract-blocks',
  'lite.stop.handoff-only-allows',
  'standard.stop.stale-review-warns-allows',
  'strict.stop.not-ready-to-ship-still-allows',
  'lite.ship.no-profile-readiness',
  'standard.ship.full-strict-envelope-required',
  'strict.ship.full-envelope-fragmented',
] as const;

const TARGET_DELTAS: Readonly<Record<(typeof CELL_ORDER)[number], TargetDelta>> = {
  'lite.edit.no-plan-contract-allows': {
    verdict: 'allow',
    requirements: ['safe_path', 'worktree_boundary', 'destructive_action_boundary'],
    missing_requirements: [],
    next_action: 'edit',
    behavior_changes: ['return a typed allowedToEdit decision without adding plan or contract ceremony'],
  },
  'standard.edit.complete-work-package-no-contract-blocks': {
    verdict: 'allow',
    requirements: ['complete_approved_work_package'],
    missing_requirements: [],
    next_action: 'edit',
    behavior_changes: [
      'separate_contract becomes not_required by default',
      'remove the current missing_contract collapse into WorkflowProfileGuard',
    ],
  },
  'strict.edit.missing-contract-blocks': {
    verdict: 'block',
    requirements: ['separate_contract', 'isolated_contract_worktree'],
    missing_requirements: ['separate_contract', 'isolated_contract_worktree'],
    next_action: 'create_contract_worktree',
    behavior_changes: ['return typed required_contract_missing and required_worktree_missing reasons'],
  },
  'lite.stop.handoff-only-allows': {
    verdict: 'allow',
    requirements: ['durable_recovery_state'],
    missing_requirements: [],
    next_action: 'stop',
    behavior_changes: ['replace repeated recovery writes with one compact checkpoint'],
  },
  'standard.stop.stale-review-warns-allows': {
    verdict: 'allow',
    requirements: ['durable_recovery_state'],
    missing_requirements: [],
    next_action: 'stop',
    behavior_changes: [
      'return typed allowedToStop independently from readyToShip',
      'unrequired review or external acceptance cannot block Stop',
    ],
  },
  'strict.stop.not-ready-to-ship-still-allows': {
    verdict: 'allow',
    requirements: ['durable_recovery_state'],
    missing_requirements: ['fresh_review', 'external_acceptance', 'fresh_checks'],
    next_action: 'stop',
    behavior_changes: [
      'report readyToShip=false without converting it into a Stop block',
      'consume canonical state only and remove install-profile fallback',
    ],
  },
  'lite.ship.no-profile-readiness': {
    verdict: 'block',
    requirements: ['subject_bound_targeted_evidence'],
    missing_requirements: ['subject_bound_targeted_evidence'],
    next_action: 'run_targeted_verification',
    behavior_changes: ['introduce a typed readyToShip result and raise profile only when risk requires it'],
  },
  'standard.ship.full-strict-envelope-required': {
    verdict: 'conditional_allow',
    requirements: ['complete_approved_work_package', 'subject_bound_targeted_evidence'],
    missing_requirements: ['subject_bound_targeted_evidence'],
    next_action: 'run_targeted_verification',
    behavior_changes: [
      'separate_contract and external_acceptance become not_required by default',
      'risk or explicit policy may raise either requirement',
    ],
  },
  'strict.ship.full-envelope-fragmented': {
    verdict: 'block',
    requirements: [
      'separate_contract',
      'isolated_contract_worktree',
      'fresh_review',
      'external_acceptance',
      'fresh_checks',
      'candidate_revision_precondition',
    ],
    missing_requirements: ['fresh_review', 'external_acceptance', 'fresh_checks'],
    next_action: 'complete_strict_acceptance',
    behavior_changes: ['one readiness authority returns typed requirements while preserving candidate fingerprint checks'],
  },
};

const PROFILE_OPERATION: Readonly<Record<(typeof CELL_ORDER)[number], readonly [Profile, Operation]>> = {
  'lite.edit.no-plan-contract-allows': ['lite', 'edit'],
  'standard.edit.complete-work-package-no-contract-blocks': ['standard', 'edit'],
  'strict.edit.missing-contract-blocks': ['strict', 'edit'],
  'lite.stop.handoff-only-allows': ['lite', 'stop'],
  'standard.stop.stale-review-warns-allows': ['standard', 'stop'],
  'strict.stop.not-ready-to-ship-still-allows': ['strict', 'stop'],
  'lite.ship.no-profile-readiness': ['lite', 'ship'],
  'standard.ship.full-strict-envelope-required': ['standard', 'ship'],
  'strict.ship.full-envelope-fragmented': ['strict', 'ship'],
};

const ESA_PROFILE_REFERENCES: Readonly<Record<Profile, readonly string[]>> = {
  lite: ['idle-inspect'],
  standard: ['missing-contract', 'executing-fresh-evidence'],
  strict: ['missing-contract', 'explicit-strict-without-path-signals', 'executing-fresh-evidence'],
};

const CURRENT_SHIP_EXPECTATIONS: Readonly<Record<Profile, {
  readonly exit_code: number;
  readonly reason: string;
}>> = {
  lite: { exit_code: 1, reason: 'no_active_contract' },
  standard: { exit_code: 1, reason: 'verify_sprint_failed' },
  strict: { exit_code: 1, reason: 'verify_sprint_failed' },
};

function isolatedEnv(cwd: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key === 'HOOK_REPO_ROOT'
      || key === 'REPO_HARNESS_TARGET_REPO_ROOT'
      || key === 'REPO_HARNESS_SOURCE_ROOT'
      || key === 'REPO_HARNESS_WORKFLOW_PROFILE'
      || key === 'REPO_HARNESS_CLI'
      || key === 'REPO_HARNESS_WORKFLOW_STATE_LIB'
      || key === 'REPO_HARNESS_BUN_BIN'
      || key === 'REPO_HARNESS_HOOK_CLI'
      || key.startsWith('CONTRACT_RUN_')
    ) {
      delete env[key];
    }
  }
  // Strip PATH entries that resolve `repo-harness-hook` (e.g. a personal
  // `bun install -g repo-harness`'s ~/.bun/bin). Left unfiltered,
  // hook_circuit_record()'s `command -v repo-harness-hook` PATH fallback
  // silently changes this fixture's observed behavior based on what happens
  // to be globally installed on the operator's machine, producing a golden
  // that cannot reproduce on a clean checkout (verified: this is exactly
  // what diverged between a local capture and this repo's own CI). This
  // targets the specific binary, not the directory name -- CI's own
  // oven-sh/setup-bun action also installs into a `.bun/bin`-named
  // directory, so name-pattern matching would strip CI's own `bun` too
  // (confirmed: an earlier version of this filter did exactly that and
  // broke every fixture subprocess in CI).
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const hookBinaryNames = process.platform === 'win32'
    ? ['repo-harness-hook.exe', 'repo-harness-hook.cmd', 'repo-harness-hook']
    : ['repo-harness-hook'];
  const filteredPath = (env.PATH ?? '')
    .split(pathSeparator)
    .filter((entry) => !hookBinaryNames.some((name) => existsSync(join(entry, name))))
    .join(pathSeparator);
  const home = join(cwd, '.home');
  mkdirSync(home, { recursive: true });
  return {
    ...env,
    PATH: filteredPath,
    HOME: home,
    HOOK_REPO_ROOT: cwd,
    HOOK_HOST: 'claude',
    ...extra,
  };
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  options: { readonly input?: string; readonly env?: NodeJS.ProcessEnv } = {},
): ProcessResult {
  const result = spawnSync(command, [...args], {
    cwd,
    input: options.input,
    encoding: 'utf-8',
    env: isolatedEnv(cwd, options.env),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function remove(cwd: string, path: string): void {
  rmSync(join(cwd, path), { recursive: true, force: true });
}

// HRD-03: exercises the retired pre-edit-guard.sh's decision surface through
// the PRODUCTION `runHook()` entry (a `bun -e` wrapper subprocess importing
// and calling it in-process -- the same "one subprocess purely to observe
// real fd1/fd2 output" role the old direct `bash pre-edit-guard.sh` spawn
// played; `RunHookResult` itself carries no stdout/stderr text). Routed
// through the same `isolatedEnv()` every other capture in this file uses,
// for the same determinism guarantees.
function runMutationGuardHandler(
  cwd: string,
  payload: unknown,
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): ProcessResult {
  const moduleUrl = pathToFileURL(RUNTIME_MODULE).href;
  const script = [
    'const stdinText = await Bun.stdin.text();',
    `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
    "const result = runHook({ event: 'PreToolUse', routeId: 'edit', input: stdinText.length > 0 ? stdinText : undefined });",
    'process.exit(result.exitCode);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: isolatedEnv(cwd, options.env),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function runStopHandler(
  cwd: string,
  payload: unknown,
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): ProcessResult {
  const moduleUrl = pathToFileURL(RUNTIME_MODULE).href;
  const script = [
    'const stdinText = await Bun.stdin.text();',
    `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
    "const result = runHook({ event: 'Stop', routeId: 'default', input: stdinText.length > 0 ? stdinText : undefined });",
    'process.exit(result.exitCode);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: isolatedEnv(cwd, options.env),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function prepare(profile: Profile): ReturnType<typeof createEffectiveStateFixture> {
  const fixture = createEffectiveStateFixture();
  writeFileSync(join(fixture.cwd, '.git/info/exclude'), '.home/\n', { flag: 'a' });
  writeFixture(fixture.cwd, 'docs/spec.md', '# Loop semantics characterization fixture\n');
  // A properly adopted repo always carries the plan-status authority
  // (.ai/harness/policy.json active_plan.statuses); without it the
  // fail-closed edit gate blocks on authority-unavailable, which is not
  // the semantics these cells freeze. Minimal policy: the authority only.
  writeFixture(
    fixture.cwd,
    '.ai/harness/policy.json',
    `${JSON.stringify(
      {
        active_plan: {
          statuses: [
            'Draft', 'Annotating', 'Approved', 'Executing', 'Blocked',
            'Review', 'Complete', 'Completed', 'Done', 'Fulfilled',
            'Archived', 'Abandoned', 'Superseded',
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
  if (profile === 'strict') {
    // Ship receives explicit Strict metadata so its current profile-blind
    // result is compared against a genuinely distinct Standard input.
    const contract = readFileSync(join(fixture.cwd, CONTRACT), 'utf-8');
    const profileLine = /^> \*\*Workflow Profile\*\*: .*$/m;
    if (!profileLine.test(contract)) {
      throw new Error(`ESA fixture contract is missing its Workflow Profile header: ${CONTRACT}`);
    }
    writeFixture(
      fixture.cwd,
      CONTRACT,
      contract.replace(
        profileLine,
        '> **Workflow Profile**: strict',
      ),
    );
  }
  return fixture;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walkFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const repoRelativePath = relative(root, path);
      if (
        entry.isDirectory()
        && (repoRelativePath === '.git' || repoRelativePath === '.home')
      ) {
        continue;
      }
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function repositorySnapshot(cwd: string): ReadonlyMap<string, string> {
  return new Map(
    walkFiles(cwd).map((path) => [relative(cwd, path), sha256(path)]),
  );
}

function writtenPaths(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): readonly string[] {
  const changed: string[] = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const path of paths) {
    if (before.get(path) === after.get(path)) continue;
    changed.push(after.has(path) ? path : `deleted:${path}`);
  }
  return changed.sort();
}

function observedSourceOrder(
  sourcePath: string,
  steps: readonly { readonly name: string; readonly marker: string }[],
): readonly string[] {
  const source = readFileSync(sourcePath, 'utf-8');
  return steps
    .map((step) => {
      const position = source.indexOf(step.marker);
      if (position < 0) {
        throw new Error(`missing source-order marker ${step.name} in ${relative(ROOT, sourcePath)}`);
      }
      return { name: step.name, position };
    })
    .sort((left, right) => left.position - right.position)
    .map((step) => step.name);
}

function missingSemanticFields(
  surface: Record<string, unknown>,
  fields: readonly string[],
): readonly string[] {
  return fields.filter((field) => !Object.prototype.hasOwnProperty.call(surface, field));
}

// LSC-08: `missingSemanticFields` above only ever inspected top-level keys,
// so it always reported allowedToEdit/allowedToStop/readyToShip/
// requirements/nextAction as "missing" even once LSC-06/07 landed them on
// EffectiveStateV1['readiness'] -- they live one level down, nested under
// `readiness`, not at the top of the cached state document. This projects
// that nested authority surface (when present and object-shaped) up to
// top-level keys so the presence check can see it, without recomputing or
// asserting anything about its values -- a pure, additive read.
function readinessSurface(state: Record<string, unknown>): Record<string, unknown> {
  const readiness = (state as { readiness?: unknown }).readiness;
  return readiness && typeof readiness === 'object' && !Array.isArray(readiness)
    ? readiness as Record<string, unknown>
    : {};
}

function editProfileSource(): string {
  const source = readFileSync(MUTATION_GUARD_SOURCE, 'utf-8');
  if (source.includes('ctx.collector.getPreEditEffectiveState(allTargetPaths)')) {
    return 'live_effective_state';
  }
  throw new Error('mutation-guard.ts no longer reads workflow_profile from a live Effective State resolution');
}

function stopProfileSource(): string {
  const source = readFileSync(STOP_HANDLER_SOURCE, 'utf-8');
  if (source.includes('opts.collector.getStopEffectiveState()')) {
    return 'live_effective_state';
  }
  return 'none';
}

function shipProfileObservation(): {
  readonly profileAware: boolean;
  readonly matchedSources: readonly string[];
} {
  const profilePattern = /workflow_profile|workflowProfile|Workflow Profile/;
  const matchedSources = [VERIFY_SPRINT, CONTRACT_WORKTREE, SHIP_WORKTREES]
    .filter((path) => profilePattern.test(readFileSync(path, 'utf-8')))
    .map((path) => relative(ROOT, path));
  return { profileAware: matchedSources.length > 0, matchedSources };
}

function planObservation(cwd: string): {
  readonly status: string | null;
  readonly remainingTasks: number | null;
  readonly contractExists: boolean;
  readonly minimumExecutionContract: Record<string, string | null> | null;
} {
  const planPath = join(cwd, PLAN);
  if (!existsSync(planPath)) {
    return {
      status: null,
      remainingTasks: null,
      contractExists: existsSync(join(cwd, CONTRACT)),
      minimumExecutionContract: null,
    };
  }
  const source = readFileSync(planPath, 'utf-8');
  const status = source.match(/^> \*\*Status\*\*:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const contractField = (label: string): string | null => source
    .match(new RegExp(`^- \\*\\*${label}\\*\\*:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
  return {
    status,
    remainingTasks: [...source.matchAll(/^- \[ \] /gm)].length,
    contractExists: existsSync(join(cwd, CONTRACT)),
    minimumExecutionContract: source.includes('## Minimum Execution Contract')
      ? {
        scope: contractField('Scope'),
        target_paths_capabilities: contractField('Target paths / capabilities'),
        acceptance: contractField('Acceptance'),
        verification_commands: contractField('Verification commands'),
        rollback_boundary: contractField('Rollback boundary'),
      }
      : null,
  };
}

function guardTokens(output: string): readonly string[] {
  return [
    ...new Set(
      [...output.matchAll(/\[([A-Za-z][A-Za-z0-9]+Guard)\]/g)]
        .map((match) => match[1]),
    ),
  ];
}

function jsonObjectLines(output: string): readonly Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Non-JSON diagnostics are part of the observed transport, not a semantic surface.
    }
  }
  return objects;
}

function stopDecision(output: string): { readonly decision: string; readonly reason?: string } | null {
  const trimmed = output.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        parsed
        && typeof parsed === 'object'
        && !Array.isArray(parsed)
        && typeof (parsed as Record<string, unknown>).decision === 'string'
      ) {
        return parsed as { decision: string; reason?: string };
      }
    } catch {
      // Fall through to diagnostic lines followed by a JSON decision.
    }
  }
  const decision = jsonObjectLines(output)
    .filter((entry) => typeof entry.decision === 'string')
    .at(-1);
  return decision
    ? {
      decision: decision.decision as string,
      reason: typeof decision.reason === 'string' ? decision.reason : undefined,
    }
    : null;
}

function readEffectiveState(cwd: string): Record<string, unknown> {
  const path = join(cwd, '.ai/harness/state/effective.json');
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    : {};
}

function captureEdit(profile: Profile): Record<string, unknown> {
  const fixture = prepare(profile);
  const worktreeDir = `${fixture.cwd}-wt`;
  try {
    // HRD-03: the old direct `bash pre-edit-guard.sh` spawn never needed
    // this -- runHook() does, to pass its opt-in gate before ever
    // dispatching to the handler.
    writeFixture(fixture.cwd, '.ai/harness/workflow-contract.json', '{}\n');
    if (profile === 'lite') {
      remove(fixture.cwd, '.ai/harness/active-plan');
      remove(fixture.cwd, '.claude/.active-plan');
    } else {
      if (profile === 'standard') {
        const plan = readFileSync(join(fixture.cwd, PLAN), 'utf-8');
        writeFixture(
          fixture.cwd,
          PLAN,
          plan
            .replace(/^> \*\*Status\*\*:\s*Executing$/m, '> **Status**: Approved')
            .replace(/^- \[ \] /gm, '- [x] ')
            .concat([
              '',
              '## Minimum Execution Contract',
              '',
              '- **Scope**: one local feature edit with no cross-capability change',
              '- **Target paths / capabilities**: `src/feature.ts` / `feature`',
              '- **Acceptance**: the local feature edit remains inside the approved path and passes its focused test',
              '- **Verification commands**: `bun test tests/feature.test.ts`',
              '- **Rollback boundary**: revert this independent Work Package change',
              '',
            ].join('\n')),
        );
      }
      remove(fixture.cwd, CONTRACT);
    }
    // Every profile's setup now commits (not just lite): a linked worktree
    // below only sees committed state, and every profile needs the same
    // fixture content the old direct-invocation capture read straight off
    // the working tree.
    commitFixture(fixture.cwd, `seed ${profile} edit characterization`);

    // HRD-03: run through a linked worktree, not the fixture's own primary
    // tree. The retired pre-edit-guard.sh was invoked ALONE (bypassing
    // worktree-guard.sh entirely), so these cells never observed a
    // WorktreeGuard warning. The unified handler always runs the worktree
    // check first; a linked worktree keeps git's own worktree-structure
    // check silent (exit 0, no output -- same as the primary-tree fixture
    // silently skipping it before), so every decision-semantic field below
    // stays byte-identical to the pre-cutover golden. Only
    // entrypoint/ordering/side_effects (this package's authorized
    // runtime-shape delta for edit cells) legitimately move.
    run('git', ['worktree', 'add', '-b', `codex/lsc-edit-${profile}-fixture`, worktreeDir], fixture.cwd);
    writeFileSync(join(worktreeDir, '.ai/harness/active-worktree'), `${worktreeDir}\n`);

    const workPackage = planObservation(worktreeDir);
    const before = repositorySnapshot(worktreeDir);
    const result = runMutationGuardHandler(worktreeDir, { tool_input: { file_path: 'src/feature.ts' } }, {
      env: {
        REPO_HARNESS_WORKFLOW_PROFILE: profile,
        HOOK_RUN_ID: `loop-semantics-${profile}-edit`,
      },
    });
    const after = repositorySnapshot(worktreeDir);
    const tokens = guardTokens(`${result.stdout}\n${result.stderr}`);
    const state = readEffectiveState(worktreeDir);
    const semanticSurface = Object.assign({}, state, readinessSurface(state), ...jsonObjectLines(result.stdout));
    return {
      entrypoint: 'src/cli/hook/mutation-guard.ts',
      profile_source: editProfileSource(),
      exit_code: result.status,
      verdict: result.status === 0 ? 'allow' : 'block',
      reason: result.status === 0 ? 'none' : (tokens[0] ?? 'unclassified_guard'),
      workflow_profile: state.workflow_profile ?? null,
      state_blockers: state.blockers ?? [],
      guard_tokens: tokens,
      structured_error: result.stdout.includes('"guard":'),
      state_version_published: typeof state.state_version === 'number',
      work_package_status: workPackage.status,
      work_package_remaining_tasks: workPackage.remainingTasks,
      work_package_minimum_execution_contract: workPackage.minimumExecutionContract,
      contract_exists: workPackage.contractExists,
      ordering: observedSourceOrder(MUTATION_GUARD_SOURCE, [
        { name: 'resolve_effective_state', marker: 'ctx.collector.getPreEditEffectiveState(allTargetPaths)' },
        { name: 'contract_scope', marker: 'const activeContract = getActiveContractPath(ctx);' },
        { name: 'plan_gate', marker: 'runEditPlanGate(ctx, filePath, workflowProfile);' },
        { name: 'strict_contract', marker: '[StrictContractGuard] Strict profile requires an active contract for' },
        { name: 'strict_worktree', marker: '[StrictWorktreeGuard] Strict profile requires an isolated contract worktree for' },
      ]),
      side_effects: writtenPaths(before, after),
      missing_semantic_fields: missingSemanticFields(
        semanticSurface,
        ['allowedToEdit', 'requirements', 'nextAction'],
      ),
    };
  } finally {
    rmSync(worktreeDir, { recursive: true, force: true });
    fixture.cleanup();
  }
}

function captureStop(profile: Profile): Record<string, unknown> {
  const fixture = prepare(profile);
  try {
    writeFixture(fixture.cwd, '.ai/harness/workflow-contract.json', '{}\n');
    if (profile === 'lite') {
      remove(fixture.cwd, '.ai/harness/active-plan');
      remove(fixture.cwd, '.claude/.active-plan');
    }
    writeFixture(
      fixture.cwd,
      '.ai/harness/state/effective.json',
      `${JSON.stringify({ workflow_profile: profile, state_version: 1 })}\n`,
    );
    const before = repositorySnapshot(fixture.cwd);
    const result = runStopHandler(fixture.cwd, { hook_event_name: 'Stop', stop_hook_active: false }, {
      env: {
        HOOK_RUN_ID: `loop-semantics-${profile}-stop`,
        REPO_HARNESS_WORKFLOW_PROFILE: profile,
      },
    });
    const after = repositorySnapshot(fixture.cwd);
    const decision = stopDecision(result.stdout);
    const handoff = readFileSync(join(fixture.cwd, '.ai/harness/handoff/current.md'), 'utf-8');
    const state = readEffectiveState(fixture.cwd);
    const semanticSurface = Object.assign({}, state, readinessSurface(state), decision ?? {});
    return {
      entrypoint: 'src/cli/hook/stop-handler.ts',
      profile_source: stopProfileSource(),
      exit_code: result.status,
      verdict: decision?.decision === 'block' ? 'block' : 'allow',
      reason: decision?.reason ?? 'none',
      effective_state_cache_profile: state.workflow_profile ?? null,
      review_freshness_warning: result.stderr.includes('[ReviewFreshness]'),
      decision_json_uses_exit_zero: decision?.decision === 'block' ? result.status === 0 : null,
      minimal_change_review_appended: handoff.includes('## Minimal Change Review'),
      ordering: observedSourceOrder(STOP_HANDLER_SOURCE, [
        { name: 'refresh_handoff', marker: 'new StopProjectionBatch(' },
        { name: 'lite_early_exit', marker: "if (state?.workflow_profile === 'lite')" },
        { name: 'minimal_change_review', marker: 'const minimal = minimalChangeReview(repoRoot);' },
        { name: 'review_freshness_warning', marker: "if (state?.review.path && ['stale'" },
        { name: 'plan_completeness_gate', marker: 'const planGate = planCompletenessBlock(' },
        { name: 'delegation_fallback', marker: 'if (delegationShouldBlock(paths, now) && paths)' },
      ]),
      side_effects: writtenPaths(before, after),
      missing_semantic_fields: missingSemanticFields(
        semanticSurface,
        ['allowedToStop', 'readyToShip', 'requirements', 'nextAction'],
      ),
    };
  } finally {
    fixture.cleanup();
  }
}

// Proves ship-worktrees.sh's OWN dispatch routes into the finish envelope,
// rather than only inferring that from source-marker position or from an
// isolated direct call to contract-worktree.sh. Makes the disposable fixture
// a real linked worktree (git worktree add -b <branch> <path> main) so
// is_linked_worktree() is genuinely true, then runs the real
// `ship-worktrees.sh --local-merge --dry-run` from inside it. Empirically
// verified: dispatch reaches ship_linked_local_merge -> finish_contract_worktree
// -> require_finish_ready, which fails closed with "active sprint contract is
// missing" before any archive/commit/merge-gate/push step -- because none of
// these disposable fixtures carry .ai/hooks/lib/workflow-state.sh, so
// load_workflow_state() no-ops and workflow_active_contract is never even
// callable, regardless of whether a contract file exists on disk. That makes
// this outcome deterministic and independent of per-profile fixture content.
// It still does not reach the literal `contract-worktree.sh finish` call
// inside finish_contract_worktree (require_finish_ready fails first) -- see
// the review file's External Acceptance Advice for the precise residual.
function shipDispatchProbe(primaryCwd: string, profile: Profile): Record<string, unknown> {
  const worktreePath = `${primaryCwd}-ship-probe`;
  const branch = `codex/${profile}-ship-probe`;
  const add = run('git', ['worktree', 'add', '-b', branch, worktreePath, 'main'], primaryCwd, {
    env: { HOOK_RUN_ID: `loop-semantics-${profile}-ship-worktree-add` },
  });
  if (add.status !== 0) {
    throw new Error(`failed to create linked worktree for ship dispatch probe (${profile}): ${add.stderr}`);
  }
  try {
    mkdirSync(join(worktreePath, '.home'), { recursive: true });
    const gitDir = run('git', ['rev-parse', '--git-dir'], worktreePath, {}).stdout.trim();
    const before = repositorySnapshot(worktreePath);
    const primaryBefore = repositorySnapshot(primaryCwd);
    const result = run('bash', [SHIP_WORKTREES, '--local-merge', '--dry-run'], worktreePath, {
      env: {
        HOOK_RUN_ID: `loop-semantics-${profile}-ship-dispatch-probe`,
        REPO_HARNESS_TARGET_REPO_ROOT: worktreePath,
        REPO_HARNESS_SOURCE_ROOT: ROOT,
      },
    });
    const after = repositorySnapshot(worktreePath);
    const primaryAfter = repositorySnapshot(primaryCwd);
    return {
      invoked: true,
      mode: 'local-merge',
      dry_run: true,
      linked_worktree_confirmed: gitDir.includes('.git/worktrees/'),
      exit_code: result.status,
      guard: result.stderr.includes('active sprint contract is missing')
        ? 'active_sprint_contract_missing'
        : 'unexpected',
      worktree_side_effects: writtenPaths(before, after),
      primary_side_effects: writtenPaths(primaryBefore, primaryAfter),
    };
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

function captureShip(profile: Profile): Record<string, unknown> {
  const fixture = prepare(profile);
  try {
    if (profile === 'lite') {
      remove(fixture.cwd, '.ai/harness/active-plan');
      remove(fixture.cwd, '.claude/.active-plan');
      remove(fixture.cwd, CONTRACT);
    }
    // Feed a real profile signal into the disposable fixture, mirroring the
    // Effective State write captureStop already uses for Stop. The current
    // ship envelope is genuinely profile-blind (see shipProfileObservation()
    // / profile_aware below, confirmed by direct source inspection) -- this
    // signal proves the *input* actually carries the claimed profile rather
    // than the cell name alone relabeling an undifferentiated missing-
    // contract setup shared by every profile.
    writeFixture(
      fixture.cwd,
      '.ai/harness/state/effective.json',
      `${JSON.stringify({ workflow_profile: profile, state_version: 1 })}\n`,
    );
    const before = repositorySnapshot(fixture.cwd);
    const result = run('bash', [VERIFY_SPRINT], fixture.cwd, {
      env: {
        HOOK_RUN_ID: `loop-semantics-${profile}-ship`,
        REPO_HARNESS_TARGET_REPO_ROOT: fixture.cwd,
        REPO_HARNESS_SOURCE_ROOT: ROOT,
        REPO_HARNESS_HOOK_CLI: join(ROOT, 'src/cli/hook-entry.ts'),
        REPO_HARNESS_WORKFLOW_PROFILE: profile,
      },
    });
    const after = repositorySnapshot(fixture.cwd);
    // Dynamically invoke contract-worktree.sh finish instead of only
    // inferring its role from ship-worktrees.sh's source-marker position, so
    // a control-flow change that silently stopped calling it (while leaving
    // the marker string in place) cannot pass this golden undetected. Every
    // profile deterministically hits the same is_linked_worktree guard
    // before any archive/commit/merge-gate/network step, because this
    // disposable fixture is a plain repository and never a linked worktree
    // (verified empirically: exit 1, "finish must run from the linked
    // contract worktree", zero side effects, no policy.json/contract/review
    // required). ship-worktrees.sh's own linked-worktree dispatch is not
    // dynamically invoked here: reaching its real require_finish_ready path
    // requires the fixture to actually be a linked worktree, which is
    // disproportionate setup for this eval-only characterization package;
    // its envelope_ordering below remains explicit static source inventory.
    const finishProbeBefore = repositorySnapshot(fixture.cwd);
    const finishProbe = run(
      'bash',
      [CONTRACT_WORKTREE, 'finish', '--no-merge', '--target', 'main', '--gate-base', 'main'],
      fixture.cwd,
      {
        env: {
          HOOK_RUN_ID: `loop-semantics-${profile}-ship-finish-probe`,
          REPO_HARNESS_TARGET_REPO_ROOT: fixture.cwd,
          REPO_HARNESS_SOURCE_ROOT: ROOT,
          REPO_HARNESS_HOOK_CLI: join(ROOT, 'src/cli/hook-entry.ts'),
        },
      },
    );
    const finishProbeAfter = repositorySnapshot(fixture.cwd);
    // See shipDispatchProbe() docstring: proves ship-worktrees.sh's own
    // dispatch (not an isolated call) routes into the finish envelope.
    const shipDispatch = shipDispatchProbe(fixture.cwd, profile);
    const checksPath = join(fixture.cwd, '.ai/harness/checks/latest.json');
    let checks: Record<string, unknown> = {};
    if (existsSync(checksPath)) {
      try {
        checks = JSON.parse(readFileSync(checksPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        checks = {};
      }
    }
    // The ship envelope is profile-blind and never calls `state resolve`
    // (see shipProfileObservation() above), so this fixture's own seeded
    // effective.json stub (written above, workflow_profile/state_version
    // only) is still whatever readEffectiveState() finds here -- carrying
    // no `readiness` key at all. readinessSurface() therefore contributes
    // nothing for this cell today; the ship-script surface genuinely does
    // not yet express readyToShip/workflowProfile/requirementsResult/
    // nextAction, so missing_semantic_fields below correctly stays
    // unshrunk rather than fake-closing on an authority this envelope does
    // not actually consume (row 8's recorded non-goal: that cutover is
    // future work).
    const shipState = readEffectiveState(fixture.cwd);
    const shipSemanticSurface = Object.assign({}, readinessSurface(shipState), checks);
    const noContract = result.stderr.includes('No active sprint contract found');
    const gateOrder = Array.isArray(checks.guards)
      ? checks.guards.flatMap((gate) => {
        if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return [];
        const name = (gate as Record<string, unknown>).name;
        return typeof name === 'string' ? [name] : [];
      })
      : [];
    const profileObservation = shipProfileObservation();
    return {
      entrypoint: 'scripts/verify-sprint.sh',
      envelope_sources: [
        'scripts/ship-worktrees.sh',
        'scripts/verify-sprint.sh',
        'scripts/contract-worktree.sh',
      ],
      profile_source: profileObservation.profileAware ? 'ship_source_inventory' : 'none_observed',
      profile_aware: profileObservation.profileAware,
      profile_source_matches: profileObservation.matchedSources,
      exit_code: result.status,
      verdict: result.status === 0 ? 'allow' : 'block',
      reason: noContract
        ? 'no_active_contract'
        : (typeof checks.failure_class === 'string' && checks.failure_class
          ? checks.failure_class
          : 'verify_sprint_failed'),
      gate_requirements: gateOrder,
      ordering: gateOrder,
      // CRG-01 (merged, PR #83) made contract-worktree finish the sole
      // sprint-verification owner: require_finish_ready() in
      // scripts/ship-worktrees.sh now checks only contract existence,
      // review projection existence and typed AcceptanceReceipt validity,
      // then dispatches once to contract-worktree.sh finish -- the
      // verify-sprint.sh and checks-freshness steps that used to run
      // directly inside ship-worktrees.sh moved entirely inside that single
      // dispatch (proven separately by contract_worktree_finish_probe
      // above), so 'verify_sprint' and 'fresh_checks' markers searched
      // against ship-worktrees.sh's own source no longer exist there.
      // Removing them here characterizes the real, current,
      // current provider-free closeout ordering rather than source
      // strings that were deleted (re-verified by reading
      // require_finish_ready()/finish_contract_worktree() directly, not
      // assumed).
      envelope_ordering: observedSourceOrder(SHIP_WORKTREES, [
        { name: 'contract', marker: '[[ -n "$contract_file" && -f "$contract_file" ]]' },
        { name: 'review', marker: '[[ -n "$review_file" && -f "$review_file" ]]' },
        { name: 'acceptance_receipt', marker: '"$helper_dir/acceptance-receipt.ts" verify' },
        { name: 'contract_worktree_finish', marker: 'run_cmd bash "$helper_dir/contract-worktree.sh" finish' },
      ]),
      envelope_ordering_source: 'static_source_inventory_ship_worktrees_sh',
      profile_signal_fed: {
        effective_state_workflow_profile: profile,
        env_repo_harness_workflow_profile: profile,
      },
      contract_worktree_finish_probe: {
        invoked: true,
        exit_code: finishProbe.status,
        guard: finishProbe.stderr.includes('finish must run from the linked contract worktree')
          ? 'linked_worktree_required'
          : 'unexpected',
        side_effects: writtenPaths(finishProbeBefore, finishProbeAfter),
      },
      ship_worktrees_dispatch_probe: shipDispatch,
      side_effects: writtenPaths(before, after),
      missing_semantic_fields: missingSemanticFields(
        shipSemanticSurface,
        ['readyToShip', 'workflowProfile', 'requirementsResult', 'nextAction'],
      ),
    };
  } finally {
    fixture.cleanup();
  }
}

function captureCell(
  name: (typeof CELL_ORDER)[number],
): Record<string, unknown> {
  const [profile, operation] = PROFILE_OPERATION[name];
  const current = operation === 'edit'
    ? captureEdit(profile)
    : operation === 'stop'
      ? captureStop(profile)
      : captureShip(profile);
  return {
    name,
    profile,
    operation,
    esa_reference_scenarios: ESA_PROFILE_REFERENCES[profile].map((scenario) => {
      const golden = esaGolden(scenario);
      if (golden.scenario !== scenario) {
        throw new Error(`ESA golden ${scenario} declares scenario ${String(golden.scenario)}`);
      }
      return golden.scenario;
    }),
    current,
    approved_target_delta: TARGET_DELTAS[name],
  };
}

function esaGolden(name: string): Record<string, unknown> {
  const sourcePath = join(ESA_FIXTURES, `${name}.json`);
  const golden = JSON.parse(readFileSync(sourcePath, 'utf-8')) as Record<string, any>;
  return {
    scenario: golden.scenario,
    source_sha256: sha256(sourcePath),
    baseline: golden.baseline,
    cli_exit: golden.cli_exit,
    workflow_profile: golden.state?.workflow_profile ?? null,
    blockers: golden.state?.blockers ?? [],
  };
}

function captureMatrix(): Record<string, unknown> {
  return {
    schema: 'repo-harness-loop-semantics-characterization.v1',
    post_esa_program_baseline: POST_ESA_BASE,
    lsc_01_execution_base: EXECUTION_BASE,
    esa_golden_baseline: ESA_GOLDEN_BASE,
    esa_goldens: [
      esaGolden('idle-inspect'),
      esaGolden('missing-contract'),
      esaGolden('executing-fresh-evidence'),
      esaGolden('explicit-strict-without-path-signals'),
    ],
    cells: CELL_ORDER.map(captureCell),
  };
}

describe('LSC-01 profile × operation current-behavior characterization', () => {
  test('freezes exactly nine cells while target deltas remain inert data', () => {
    const actual = captureMatrix();
    const cells = actual.cells as Array<Record<string, any>>;
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((cell) => cell.name))).toEqual(new Set(CELL_ORDER));
    expect(new Set(cells.map((cell) => `${cell.profile}.${cell.operation}`)).size).toBe(9);
    expect(cells.find((cell) => cell.name.startsWith('lite.edit'))?.current).toMatchObject({
      verdict: 'allow',
      reason: 'none',
      workflow_profile: 'lite',
      state_blockers: [],
    });
    expect(cells.find((cell) => cell.name.startsWith('standard.edit'))?.current).toMatchObject({
      verdict: 'allow',
      exit_code: 0,
      reason: 'none',
      state_blockers: [],
      work_package_status: 'Approved',
      work_package_remaining_tasks: 0,
      work_package_minimum_execution_contract: {
        scope: 'one local feature edit with no cross-capability change',
        target_paths_capabilities: '`src/feature.ts` / `feature`',
        acceptance: 'the local feature edit remains inside the approved path and passes its focused test',
        verification_commands: '`bun test tests/feature.test.ts`',
        rollback_boundary: 'revert this independent Work Package change',
      },
      contract_exists: false,
    });
    expect(cells.find((cell) => cell.name.startsWith('standard.edit'))?.approved_target_delta).toMatchObject({
      verdict: 'allow',
      missing_requirements: [],
    });
    expect(cells.find((cell) => cell.name.startsWith('strict.edit'))?.current).toMatchObject({
      verdict: 'block',
      reason: 'WorkflowProfileGuard',
    });
    for (const profile of ['lite', 'standard', 'strict'] as const) {
      expect(cells.find((cell) => cell.name.startsWith(`${profile}.stop`))?.current.verdict).toBe('allow');
      expect(cells.find((cell) => cell.name.startsWith(`${profile}.ship`))?.current).toMatchObject({
        ...CURRENT_SHIP_EXPECTATIONS[profile],
        profile_aware: false,
        verdict: 'block',
        // Each ship cell's fixture input actually carries its named profile
        // (not just a static relabel of an undifferentiated setup), and
        // contract-worktree.sh finish is proven to have actually executed
        // via a real, execution-only-producible guard signal rather than
        // inferred from source-marker position.
        profile_signal_fed: {
          effective_state_workflow_profile: profile,
          env_repo_harness_workflow_profile: profile,
        },
        contract_worktree_finish_probe: {
          invoked: true,
          exit_code: 1,
          guard: 'linked_worktree_required',
          side_effects: [],
        },
        ship_worktrees_dispatch_probe: {
          invoked: true,
          mode: 'local-merge',
          dry_run: true,
          linked_worktree_confirmed: true,
          exit_code: 1,
          guard: 'active_sprint_contract_missing',
          worktree_side_effects: [],
          primary_side_effects: [],
        },
      });
    }
    expect(cells.find((cell) => cell.name.startsWith('lite.stop'))?.current.review_freshness_warning).toBe(false);
    expect(cells.find((cell) => cell.name.startsWith('standard.stop'))?.current.review_freshness_warning).toBe(true);
    expect(cells.find((cell) => cell.name.startsWith('strict.stop'))?.current.review_freshness_warning).toBe(true);
    expect(cells.find((cell) => cell.name.startsWith('standard.ship'))?.current).toMatchObject({
      gate_requirements: [],
      ordering: [],
    });

    expect(shipProfileObservation()).toEqual({ profileAware: false, matchedSources: [] });
    expect(stopProfileSource()).toBe('live_effective_state');
    expect(editProfileSource()).toBe('live_effective_state');

    if (process.env.UPDATE_LOOP_SEMANTICS_GOLDEN === '1') {
      mkdirSync(join(FIXTURE_PATH, '..'), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    expect(actual).toEqual(expected);
  });
});

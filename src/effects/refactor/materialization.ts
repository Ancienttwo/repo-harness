import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

import { projectWorkGraph, validateWorkGraphTopology } from '../../core/engineers/scheduling';
import { assertRefactorProgramRecommendationAuthority, canonicalRefactorProgramBytes, validateRefactorProgram, type RefactorProgramV1 } from '../../core/refactor/program';
import { projectRefactorMaterialization, type RefactorMaterializationArtifactV1, type RefactorMaterializationUnitV1 } from '../../core/refactor/materialization';
import { loadRefactorPolicyAtRevision } from '../../core/refactor/policy';
import { readRefactorActivationLevel } from './activation-store';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { assertCanonicalSprintTaskIdsUniqueAtCommit } from '../state/coordination-canonical-source';
import { BACKLOG_TABLE_HEADER, BACKLOG_TABLE_SEPARATOR, SPRINT_BACKLOG_SCHEMA_HEADER } from '../../core/state/sprint-backlog-rows';
import type { RefactorRecommendationAuthorityV1 } from '../../core/refactor/provider-contract';
import { readStoredProgramAuthorization } from '../automation/grant-store';
import { readAcceptedRefactorRecommendations } from './archctx-provider';
import { applyRefactorArchitectureIntervention, type RefactorRecommendationReader } from './architecture-intervention';
import type { ProjectionResultV1 } from '../../core/architecture/projection';
import { appendRefactorProgramEvent, readRefactorProgramStatus } from './program-store';

export class RefactorMaterializationError extends Error {
  constructor(readonly code: 'refactor_materialization_conflict' | 'refactor_materialization_stale' | 'refactor_materialization_failed', message: string, readonly cause?: unknown) { super(message); this.name = 'RefactorMaterializationError'; }
}
function fail(code: RefactorMaterializationError['code'], message: string, cause?: unknown): never { throw new RefactorMaterializationError(code, message, cause); }
function git(root: string, args: string[], env?: NodeJS.ProcessEnv): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }).trim(); }
function safePath(path: string, label: string, suffix?: string): string {
  if (!path || path.startsWith('/') || path.startsWith('-') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..') || (suffix && !path.endsWith(suffix))) fail('refactor_materialization_conflict', `${label} is unsafe`);
  return path;
}
function sprintBytes(title: string, createdAt: string, rows: readonly string[]): string {
  return `# Sprint: ${title}\n\n> **Status**: Approved\n> **Created**: ${createdAt}\n${SPRINT_BACKLOG_SCHEMA_HEADER}\n\n## Goal\n\nExecute the accepted Refactor Program through contract-gated Work Packages.\n\n## Backlog\n\n${BACKLOG_TABLE_HEADER[2]}\n${BACKLOG_TABLE_SEPARATOR[2]}\n${rows.join('\n')}\n\n## Execution Log\n`;
}
/** Mode and raw content digest of the entry at `path` in `commit`; `null` when the path is absent. */
function entryAt(root: string, commit: string, path: string): { readonly mode: string; readonly digest: string | null } | null {
  const entry = git(root, ['ls-tree', '-z', commit, '--', path]).replace(/\0$/u, '');
  if (!entry) return null;
  const [mode, type, object] = entry.slice(0, entry.indexOf('\t')).split(' ');
  if (type !== 'blob') return { mode: mode!, digest: null };
  return { mode: mode!, digest: `sha256:${createHash('sha256').update(execFileSync('git', ['cat-file', 'blob', object!], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })).digest('hex')}` };
}
function put(root: string, index: string, temp: string, serial: number, path: string, bytes: string): void {
  const file = join(temp, `artifact-${serial}`); writeFileSync(file, bytes);
  const blob = git(root, ['hash-object', '-w', file]); git(root, ['update-index', '--add', '--cacheinfo', '100644', blob, path], { GIT_INDEX_FILE: index });
}

export interface MaterializeRefactorProgramInput {
  readonly repo_root: string;
  readonly expected_current_sha256: string;
  readonly idempotency_key: string;
  readonly observed_at: string;
  readonly program: RefactorProgramV1;
  readonly sprint_path: string;
  readonly sprint_title: string;
  readonly program_path: string;
  readonly units: readonly RefactorMaterializationUnitV1[];
  readonly artifacts: readonly RefactorMaterializationArtifactV1[];
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => string;
  readonly crash_hook?: (boundary: 'after_begin_materialize' | 'before_ref_cas' | 'after_ref_cas') => void;
  readonly recommendation_authority_reader?: (expectedHeadSha: string, repoRoot: string) => readonly RefactorRecommendationAuthorityV1[];
  readonly architecture_recommendation_reader?: RefactorRecommendationReader;
  readonly architecture_projection_apply?: (repoRoot: string) => ProjectionResultV1;
}

export function materializeRefactorProgram(input: MaterializeRefactorProgramInput) {
  const inputKeys = Object.keys(input); const allowedInputKeys = ['repo_root', 'expected_current_sha256', 'idempotency_key', 'observed_at', 'program', 'sprint_path', 'sprint_title', 'program_path', 'units', 'artifacts', 'env', 'now', 'crash_hook', 'recommendation_authority_reader', 'architecture_recommendation_reader', 'architecture_projection_apply'];
  if (inputKeys.some((key) => !allowedInputKeys.includes(key))) fail('refactor_materialization_conflict', 'materialization input contains an unknown field');
  if (typeof input.sprint_title !== 'string' || !input.sprint_title || /[\r\n\u0000-\u001f\u007f]/u.test(input.sprint_title)) fail('refactor_materialization_conflict', 'sprint_title is invalid');
  const root = realpathSync(resolve(input.repo_root)); const program = validateRefactorProgram(input.program);
  const sprintPath = safePath(input.sprint_path, 'sprint_path', '.sprint.md'); const programPath = safePath(input.program_path, 'program_path', '.refactor-program.v1.json');
  let status = readRefactorProgramStatus(root, program.programId, input.env ?? process.env);
  if (status.program.base_main_sha !== program.baseMainSha || status.program.target_revision !== program.baseMainSha) fail('refactor_materialization_conflict', 'program baseline differs from the authorized target revision');
  const policy = loadRefactorPolicyAtRevision(root, status.program.target_revision);
  if (policy.mode !== 'active') fail('refactor_materialization_conflict', 'execution materialization requires active Refactor Mode');
  if (program.route === 'cross_module_refactor' && readRefactorActivationLevel(root) !== 'active_cross_module') fail('refactor_materialization_conflict', 'cross-module materialization requires active_cross_module activation');
  const grant = readStoredProgramAuthorization(root, status.program.authorization_sha256, input.env ?? process.env);
  const authorizedWorkPackages = new Set(grant.allowed_work_package_ids);
  for (const binding of program.bindings) if (!authorizedWorkPackages.has(binding.workPackageId)) fail('refactor_materialization_conflict', `work package is not authorized: ${binding.workPackageId}`);
  const targetRef = status.program.target_ref; const current = git(root, ['rev-parse', '--verify', `${targetRef}^{commit}`]);
  let architectureResult: ProjectionResultV1 | null = null;
  if (program.route === 'architecture_intervention') {
    architectureResult = applyRefactorArchitectureIntervention({ repo_root: root, program, expected_head_sha: current,
      recommendation_reader: input.architecture_recommendation_reader, apply_projection: input.architecture_projection_apply }).result;
  } else {
    const readAuthority = input.recommendation_authority_reader ?? ((head, repo) => readAcceptedRefactorRecommendations(head, repo, { env: input.env }));
    assertRefactorProgramRecommendationAuthority(program, readAuthority(current, root));
  }
  if (status.current.state === 'routing' || (status.current.state === 'architecture_approval_required' && program.route === 'architecture_intervention')) {
    status = { ...status, ...appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: input.expected_current_sha256, idempotency_key: `${input.idempotency_key}:materializing`, operation: 'begin_materialize', observed_at: input.observed_at, env: input.env }) };
    input.crash_hook?.('after_begin_materialize');
  } else if (status.current.state !== 'materializing' && status.current.state !== 'planning') fail('refactor_materialization_conflict', `program is ${status.current.state}, not routing or materializing`);
  const programBytes = `${canonicalRefactorProgramBytes(program)}\n`;
  const projection = projectRefactorMaterialization({ repositoryId: status.program.repository_id, sprintPath, sprintSchema: 2, firstRowIndex: 1, maximumModulesPerProgram: policy.maximum_modules_per_program, program, units: input.units, artifacts: input.artifacts });
  const sprint = sprintBytes(input.sprint_title, input.observed_at, projection.rows);
  assertCanonicalSprintTaskIdsUniqueAtCommit(root, { commit: current, sprintPath, sprintText: sprint });
  const tasks = projectCanonicalTasks({ repoIdentity: status.program.repository_id, sprintPath, sprintText: sprint }).map((task, index) => ({ task_id: task.task_id, task_revision: task.task_revision, task_ref: task.row.task, status: task.row.status, row_order: index + 1 }));
  validateWorkGraphTopology([projectWorkGraph(projection.workGraph, tasks)]);
  // Prior committed applies declare paths this transaction cannot reconstruct: they carry
  // no output digest to verify bytes against, so a transaction built from this attempt's
  // files alone would silently drop declared writes.
  if (architectureResult !== null && (architectureResult.priorCommittedApplies?.length ?? 0) > 0) {
    fail('refactor_materialization_conflict', 'architecture projection result declares prior committed applies this transaction cannot reproduce');
  }
  const architectureWrites = architectureResult === null ? [] : architectureResult.files.filter((entry) => entry.action === 'create' || entry.action === 'update').map((entry) => {
    const path = safePath(entry.path, 'architecture projection path'); const absolute = join(root, path); const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('refactor_materialization_conflict', `architecture projection output is unsafe: ${path}`);
    if (!realpathSync(absolute).startsWith(`${root}/`)) fail('refactor_materialization_conflict', `architecture projection output escapes the repository: ${path}`);
    const bytes = readFileSync(absolute, 'utf8');
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (digest !== entry.outputDigest) fail('refactor_materialization_conflict', `architecture projection bytes drifted: ${path}`);
    return { path, bytes, preimageDigest: entry.preimageDigest };
  });
  const architectureDeletes = architectureResult === null ? [] : architectureResult.files.filter((entry) => entry.action === 'delete').map((entry) => {
    const path = safePath(entry.path, 'architecture projection path');
    if (existsSync(join(root, path)) || entry.outputDigest !== null) fail('refactor_materialization_conflict', `architecture projection deletion drifted: ${path}`);
    return { path, preimageDigest: entry.preimageDigest };
  });
  const writes = [{ path: sprintPath, bytes: sprint }, { path: sprintPath.replace(/\.sprint\.md$/u, '.work-graph.v1.json'), bytes: `${JSON.stringify(projection.workGraph, null, 2)}\n` }, { path: programPath, bytes: programBytes }, ...projection.plans, ...projection.artifacts, ...architectureWrites];
  if (new Set([...writes, ...architectureDeletes].map((entry) => entry.path)).size !== writes.length + architectureDeletes.length) fail('refactor_materialization_conflict', 'transaction contains duplicate artifact paths');
  for (const entry of writes) safePath(entry.path, 'artifact path');
  const baselineRevision = status.program.target_revision;
  // Planning artifacts and architecture creates must be new paths. An architecture update
  // or delete must replace exactly the regular baseline blob that its receipt classified.
  for (const entry of [...writes, ...architectureDeletes]) {
    const preimage = 'preimageDigest' in entry ? entry.preimageDigest : null;
    const baseline = entryAt(root, baselineRevision, entry.path);
    if (preimage === null && baseline !== null) fail('refactor_materialization_conflict', `artifact already exists: ${entry.path}`);
    if (preimage !== null && (baseline?.mode !== '100644' || baseline.digest !== preimage)) fail('refactor_materialization_conflict', `architecture projection preimage drifted: ${entry.path}`);
  }
  const temp = mkdtempSync(join(tmpdir(), 'repo-harness-refactor-')); const index = join(temp, 'index');
  let materializedCommit: string;
  try {
    git(root, ['read-tree', baselineRevision], { GIT_INDEX_FILE: index }); writes.forEach((entry, indexValue) => put(root, index, temp, indexValue, entry.path, entry.bytes));
    for (const { path } of architectureDeletes) git(root, ['update-index', '--remove', path], { GIT_INDEX_FILE: index });
    const tree = git(root, ['write-tree'], { GIT_INDEX_FILE: index });
    if (current !== baselineRevision) {
      // Recovery recognizes only the exact effect-owned transaction: the authorized baseline as
      // the only parent and the exact tree that this transaction builds from that baseline.
      if (git(root, ['rev-list', '--parents', '-n', '1', current]) !== `${current} ${baselineRevision}`
        || git(root, ['rev-parse', `${current}^{tree}`]) !== tree) fail('refactor_materialization_stale', 'target moved outside this materialization transaction');
      materializedCommit = current;
    } else {
      const timestamp = input.now?.() ?? input.observed_at;
      materializedCommit = git(root, ['commit-tree', tree, '-p', current, '-m', `materialize RefactorProgram ${program.programId}`], { GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'repo-harness', GIT_AUTHOR_EMAIL: 'repo-harness@localhost', GIT_COMMITTER_NAME: 'repo-harness', GIT_COMMITTER_EMAIL: 'repo-harness@localhost', GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp });
      input.crash_hook?.('before_ref_cas');
      try { git(root, ['update-ref', targetRef, materializedCommit, current]); } catch (error) { return fail('refactor_materialization_stale', 'target moved during materialization', error); }
      input.crash_hook?.('after_ref_cas');
    }
  } catch (error) { if (error instanceof RefactorMaterializationError) throw error; return fail('refactor_materialization_failed', 'cannot create atomic Refactor Program materialization commit', error); }
  finally { if (existsSync(temp)) rmSync(temp, { recursive: true, force: true }); }
  if (status.current.state === 'planning') return Object.freeze({ program_id: program.programId, materialized_commit: materializedCommit, sprint_path: sprintPath, program_path: programPath, current: status.current });
  const planned = appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: status.current.current_sha256, idempotency_key: `${input.idempotency_key}:planning`, operation: 'begin_plan', evidence_refs: [materializedCommit, program.programDigest], observed_at: input.observed_at, owned_target_revision: materializedCommit, env: input.env });
  return Object.freeze({ program_id: program.programId, materialized_commit: materializedCommit, sprint_path: sprintPath, program_path: programPath, current: planned.current });
}

import { isPublicDevActivityText } from './public-text';

export const WORKTREE_SOURCES = ['contract', 'mcp', 'task', 'portal', 'manual', 'claude', 'codex', 'unknown'] as const;
export type WorktreeSource = typeof WORKTREE_SOURCES[number];
export interface WorktreeLifecycle {
  creator: WorktreeSource;
  purpose: string;
  task_id: string | null;
  pull_request: number | null;
  created_at: string;
  ended_at: string | null;
  end_state: 'open' | 'closed' | 'removed';
}
export const WORKTREE_REASONS = ['primary', 'session_cwd', 'process_in_use', 'process_unknown', 'runtime_open', 'runtime_unknown', 'outside_managed_root', 'unregistered', 'missing', 'locked', 'no_branch', 'owner', 'no_own_commits', 'dirty', 'ignored_data', 'unpushed', 'merge_unproven', 'submodules', 'probe_failed'] as const;
export type WorktreeReason = typeof WORKTREE_REASONS[number];
export interface WorktreeView {
  id: string;
  repository_id: string | null;
  directory: string;
  branch: string | null;
  source: WorktreeSource;
  judgment: 'green' | 'yellow' | 'red';
  reasons: WorktreeReason[];
  size_bytes: number | null;
  size_observed_at: string | null;
  process_count: number | null;
  dirty_files: number | null;
  ignored_entries: number | null;
  unpushed_commits: number | null;
  merge: 'ancestor' | 'absorbed' | 'provider' | 'unmerged' | 'unknown';
  record: WorktreeLifecycle | null;
}
export interface WorktreesSnapshot {
  version: 1;
  status: 'ready' | 'partial' | 'unavailable';
  collected_at: string | null;
  repositories: { repository_id: string; display_name: string; status: 'ready' | 'unavailable'; worktrees: WorktreeView[] }[];
  unassigned: WorktreeView[];
}
export const unavailableWorktrees = (): WorktreesSnapshot => ({ version: 1, status: 'unavailable', collected_at: null, repositories: [], unassigned: [] });

/** Bounded public text: no control character, backslash or absolute path. */
export const isPublicWorktreeText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\x00-\x1f\x7f]/u.test(v) && isPublicDevActivityText(v) && !v.includes('\\');
/** A worktree directory basename that passed `isPublicWorktreeText`. */
export const isPublicWorktreeDirectory = (v: unknown): v is string => isPublicWorktreeText(v) && !v.includes('/') && !['.', '..'].includes(v);

/** Exact public shape. No subprocess errors or private record paths cross this boundary. */
export function decodeWorktrees(value: unknown): WorktreesSnapshot {
  const fail = (): never => { throw new Error('worktrees_invalid'); };
  const obj = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== keys.sort().join()) return fail();
    return v as Record<string, unknown>;
  };
  const text = isPublicWorktreeText;
  const time = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/u.test(v) && Number.isFinite(Date.parse(v));
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const repoId = (v: unknown) => typeof v === 'string' && /^repo_[a-f0-9]{16}$/u.test(v);
  const one = (v: unknown, choices: readonly string[]) => typeof v === 'string' && choices.includes(v);
  const v = obj(value, ['version', 'status', 'collected_at', 'repositories', 'unassigned']);
  if (v.version !== 1 || !one(v.status, ['ready', 'partial', 'unavailable']) || !(v.collected_at === null || time(v.collected_at)) || !Array.isArray(v.repositories) || !Array.isArray(v.unassigned)) fail();
  const ids = new Set<string>(), repos = new Set<string>();
  const unassigned = { repository_id: null, display_name: 'Unassigned', status: 'ready', worktrees: v.unassigned };
  for (const raw of [...v.repositories as unknown[], unassigned]) {
    const r = obj(raw, ['repository_id', 'display_name', 'status', 'worktrees']);
    if ((raw !== unassigned && !repoId(r.repository_id)) || repos.has(r.repository_id as string) || !text(r.display_name) || !one(r.status, ['ready', 'unavailable']) || !Array.isArray(r.worktrees)) fail();
    repos.add(r.repository_id as string);
    for (const rawTree of r.worktrees as unknown[]) {
      const w = obj(rawTree, ['id', 'repository_id', 'directory', 'branch', 'source', 'judgment', 'reasons', 'size_bytes', 'size_observed_at', 'process_count', 'dirty_files', 'ignored_entries', 'unpushed_commits', 'merge', 'record']);
      if (typeof w.id !== 'string' || !/^wt_[a-f0-9]{64}$/u.test(w.id) || ids.has(w.id) || w.repository_id !== r.repository_id
        || !isPublicWorktreeDirectory(w.directory)
        || !(w.branch === null || text(w.branch)) || !one(w.source, WORKTREE_SOURCES) || !one(w.judgment, ['green', 'yellow', 'red'])
        || !Array.isArray(w.reasons) || !w.reasons.every(reason => one(reason, WORKTREE_REASONS))
        || !['size_bytes', 'process_count', 'dirty_files', 'ignored_entries', 'unpushed_commits'].every(key => w[key] === null || count(w[key]))
        || !(w.size_observed_at === null || time(w.size_observed_at)) || !one(w.merge, ['ancestor', 'absorbed', 'provider', 'unmerged', 'unknown'])) fail();
      ids.add(w.id as string);
      if (w.judgment === 'green' && (w.repository_id === null || (w.reasons as unknown[]).length !== 0 || w.process_count !== 0 || w.dirty_files !== 0 || w.unpushed_commits !== 0 || !one(w.merge, ['ancestor', 'absorbed', 'provider']))) fail();
      if (w.record !== null) {
        const l = obj(w.record, ['creator', 'purpose', 'task_id', 'pull_request', 'created_at', 'ended_at', 'end_state']);
        if (!one(l.creator, WORKTREE_SOURCES) || !text(l.purpose) || !(l.task_id === null || text(l.task_id))
          || !(l.pull_request === null || (count(l.pull_request) && (l.pull_request as number) > 0)) || !time(l.created_at)
          || !(l.ended_at === null || time(l.ended_at)) || !one(l.end_state, ['open', 'closed', 'removed'])
          || ((l.end_state === 'open') !== (l.ended_at === null))) fail();
      }
    }
  }
  return value as WorktreesSnapshot;
}

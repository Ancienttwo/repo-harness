/**
 * Every side effect the board performs, in one place.
 *
 * Five reads, five authorities, and nothing else:
 *
 * 1. the canonical sprint at an explicit ref (`git show <commit>:<path>`),
 * 2. this sprint's leases on the shared plane, as raw owner bytes,
 * 3. `git worktree list --porcelain`, raw,
 * 4. each owner worktree's attempt ledger, raw,
 * 5. each owner worktree's `progress_token` via `resolveEffectiveStateReadOnly`.
 *
 * What is deliberately NOT read: worktree metadata (WP4's surface; reading it
 * here would create exactly the dependency that relocation is supposed to be
 * free to move) and any task lock (the board is an observer, and an observer
 * that takes ownership locks would serialize every agent behind every reader).
 * The price of holding no lock is `changed_during_read`, which is a report,
 * not a failure.
 *
 * Leases are read for the task ids of THIS sprint only -- no directory scan.
 * A scan would pull another sprint's residue into this document and report it
 * as this sprint's anomaly, and the board's scope is one sprint by decision.
 *
 * Digests hash bytes, never parsed objects. Two owner records that parse
 * identically but were written by different owners at different moments are
 * precisely the torn read the coordination digest exists to expose; parsing
 * erases that difference before the comparison can see it.
 */
import { parseAttemptLedger } from '../../core/state/attempt-ledger';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import {
  boardDigest,
  composeBoardRevision,
  type BoardEvidenceInput,
  type BoardInputsV1,
  type BoardTaskInput,
} from '../../core/state/project-board';
import { readWorktreeTopology } from '../git/worktree-topology';
import { ATTEMPT_LEDGER_PATH } from './attempt-ledger-store';
import { readText, readTrimmed, safeRealpath } from './collect-state-inputs';
import {
  readCanonicalSprint,
  resolveRepoIdentity,
} from './coordination-canonical-source';
import { readLease, type LeaseRead } from './coordination-lease-store';
import {
  StateResolutionUnstableError,
  resolveEffectiveStateReadOnly,
} from './resolve-effective-state';

const ACTIVE_SPRINT_MARKER = '.ai/harness/sprint/active-sprint';
const POLICY_PATH = '.ai/harness/policy.json';
const DEFAULT_CANONICAL_TARGET_REF = 'main';

const TASK_AUTHORITY_DOMAIN = 'repo-harness-board-task-authority';
const COORDINATION_DOMAIN = 'repo-harness-board-coordination';
const TOPOLOGY_DOMAIN = 'repo-harness-board-topology';
const EVIDENCE_DOMAIN = 'repo-harness-board-evidence';

/**
 * The active sprint marker, or null when this repository has none. Read
 * through `readText`'s containment exactly as every other state source is, so
 * a marker pointing outside the repository fails closed rather than reading
 * an arbitrary file.
 */
export function readActiveSprintPath(cwd: string): string | null {
  return readTrimmed(cwd, ACTIVE_SPRINT_MARKER);
}

/**
 * The canonical ref the board validates against:
 * `.ai/harness/policy.json#worktree_strategy.merge_back.target`, defaulting to
 * `main`. This is the same field every ownership verb is handed as
 * `--target-ref`, so a board and a claim taken from the same repository agree
 * on which authority they are talking about.
 *
 * The policy read is local rather than shared because the existing reader in
 * `resolve-effective-state.ts` is private to that module and that file is
 * outside this work package's allowed paths -- the same reason
 * `mutation-guard.ts`, `mutation-observed.ts`, and `session-context.ts` each
 * carry their own `policyGet`.
 */
export function readCanonicalTargetRef(cwd: string): string {
  const text = readText(cwd, POLICY_PATH);
  if (text === null) return DEFAULT_CANONICAL_TARGET_REF;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid workflow policy JSON: ${POLICY_PATH}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid workflow policy object: ${POLICY_PATH}`);
  }
  let current: unknown = parsed;
  for (const segment of ['worktree_strategy', 'merge_back', 'target']) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return DEFAULT_CANONICAL_TARGET_REF;
    }
    if (!Object.hasOwn(current as Record<string, unknown>, segment)) {
      return DEFAULT_CANONICAL_TARGET_REF;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === undefined || current === null) return DEFAULT_CANONICAL_TARGET_REF;
  if (typeof current !== 'string' || current.trim().length === 0) {
    throw new Error(
      `invalid workflow policy string .worktree_strategy.merge_back.target: ${POLICY_PATH}`,
    );
  }
  return current.trim();
}

export interface CollectBoardOptions {
  readonly sprintPath: string;
  readonly targetRef: string;
  readonly nowMs: number;
}

/**
 * Observe one owner worktree. Cached per canonical worktree path so two rows
 * bound to one worktree produce one observation and therefore one digest
 * contribution, not two that could disagree with each other.
 *
 * `StateResolutionUnstableError` is never swallowed into a silent default: the
 * owner's state genuinely could not be resolved, so the progress dimension
 * degrades to `unreadable` with the reason named, and every ownership field on
 * the card stays exactly what the lease record says. Evidence failure must not
 * move ownership.
 */
function observeOwnerWorktree(
  worktree: string,
  topologyPaths: ReadonlySet<string>,
  nowMs: number,
): BoardEvidenceInput {
  const canonicalWorktree = safeRealpath(worktree);
  if (!topologyPaths.has(canonicalWorktree)) {
    // Git no longer lists it, so there is nothing to read and reading it would
    // be inventing evidence for a worktree that is gone.
    return {
      worktree: canonicalWorktree,
      worktree_present: false,
      ledger: null,
      ledger_raw: null,
      progress_token: null,
      progress_unreadable_reason: 'owner_worktree_missing',
    };
  }
  const ledgerRaw = readText(canonicalWorktree, ATTEMPT_LEDGER_PATH);
  let progressToken: string | null = null;
  let unreadableReason: string | null = null;
  try {
    progressToken = resolveEffectiveStateReadOnly(canonicalWorktree, nowMs, {
      targetPaths: [],
      operationKind: 'inspect',
    }).progress_token;
  } catch (error) {
    if (!(error instanceof StateResolutionUnstableError)) throw error;
    unreadableReason = 'owner_state_unresolvable';
  }
  return {
    worktree: canonicalWorktree,
    worktree_present: true,
    ledger: parseAttemptLedger(ledgerRaw),
    ledger_raw: ledgerRaw,
    progress_token: progressToken,
    progress_unreadable_reason: unreadableReason,
  };
}

function coordinationRevision(leases: readonly LeaseRead[]): string {
  const fields: (string | null)[] = [];
  for (const lease of [...leases].sort((left, right) => (
    left.task_id < right.task_id ? -1 : left.task_id > right.task_id ? 1 : 0
  ))) {
    fields.push(lease.task_id, lease.classification, lease.unknown_reason, lease.raw);
  }
  return boardDigest(COORDINATION_DOMAIN, fields);
}

function evidenceRevision(evidence: readonly BoardEvidenceInput[]): string {
  const fields: (string | null)[] = [];
  for (const entry of [...evidence].sort((left, right) => (
    left.worktree < right.worktree ? -1 : left.worktree > right.worktree ? 1 : 0
  ))) {
    fields.push(
      entry.worktree,
      entry.worktree_present ? 'present' : 'absent',
      entry.ledger_raw,
      entry.progress_token,
      entry.progress_unreadable_reason,
    );
  }
  return boardDigest(EVIDENCE_DOMAIN, fields);
}

/** One complete observation of every board input, with its five revisions. */
export function collectBoardInputs(cwd: string, options: CollectBoardOptions): BoardInputsV1 {
  const canonical = readCanonicalSprint(cwd, {
    targetRef: options.targetRef,
    sprintPath: options.sprintPath,
  });
  if (!canonical.ok) throw new Error(canonical.error);

  const canonicalTasks = projectCanonicalTasks({
    repoIdentity: resolveRepoIdentity(cwd),
    sprintPath: options.sprintPath,
    sprintText: canonical.text,
  });

  const topology = readWorktreeTopology(cwd);
  const topologyPaths = new Set(topology.worktrees.map((entry) => safeRealpath(entry.path)));

  const leases: LeaseRead[] = [];
  const observed = new Map<string, BoardEvidenceInput>();
  const tasks: BoardTaskInput[] = canonicalTasks.map((task) => {
    const lease = readLease(cwd, task.task_id);
    leases.push(lease);

    let evidence: BoardEvidenceInput | null = null;
    const ownerWorktree = lease.record?.execution_worktree ?? null;
    if (ownerWorktree !== null) {
      const cached = observed.get(ownerWorktree);
      evidence = cached ?? observeOwnerWorktree(ownerWorktree, topologyPaths, options.nowMs);
      observed.set(ownerWorktree, evidence);
    }
    return {
      task_id: task.task_id,
      task_revision: task.task_revision,
      row: task.row,
      lease: {
        classification: lease.classification,
        unknown_reason: lease.unknown_reason,
        record: lease.record,
      },
      evidence,
    };
  });

  return {
    canonical_target: { ref: options.targetRef, oid: canonical.commit },
    sprint_path: options.sprintPath,
    tasks,
    revisions: composeBoardRevision({
      task_authority: boardDigest(TASK_AUTHORITY_DOMAIN, [
        options.targetRef,
        canonical.commit,
        options.sprintPath,
        canonical.text,
      ]),
      coordination: coordinationRevision(leases),
      topology: boardDigest(TOPOLOGY_DOMAIN, [topology.raw]),
      evidence: evidenceRevision([...observed.values()]),
    }),
  };
}

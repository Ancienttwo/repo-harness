import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { RecommendationV3 } from 'archctx-contracts';
import { RefactorProviderError, type RefactorScanResultV1 } from '../../core/refactor/provider-contract';
import type { ArchctxProviderOptions } from '../architecture/archctx-provider';
import { listOpenRecommendations, runRefactorScan } from './archctx-provider';

type Observation = RecommendationV3 & { category: 'structural_observation' };
type ModuleStatistics = RefactorScanResultV1['snapshot']['modules'][number];

/** Measured facts behind one suggestion, taken from the same scan that produced it. */
export interface RefactorModuleEvidence {
  nodeId: string;
  files: number | null;
  lines: number | null;
  fanIn: number | null;
  fanOut: number | null;
  cycles: number | null;
  /** Filled only when the model declares constraints; archctx 0.8.0 leaves instability and test files unmeasured. */
  directionViolations: number | null;
  unresolvedImports: number;
}
export interface RefactorRecommendation {
  recommendationId: string;
  kind: Observation['payload']['kind'];
  subject: string;
  affectedNodeIds: readonly string[];
  confidence: string;
  risk: string;
  uncertainty: string;
  explanation: readonly string[];
  metrics: Readonly<Record<string, number | null>>;
  /** Bounded by archctx: `totalCount` is the population, `truncated` says the item list is a prefix of it. */
  evidence: Observation['payload']['evidence'];
  /** The snapshot the metrics and evidence were measured on. */
  baselineSnapshotDigest: string;
  /** `current` when that snapshot is the scan just taken. `earlier` marks a record from an older scan, whose module statistics are left out. */
  snapshot: 'current' | 'earlier';
  modules: readonly RefactorModuleEvidence[];
}
export interface RefactorRecommendationResult {
  schemaVersion: 'repo-harness.refactor-recommendations/v2';
  status: 'recommended' | 'no_action' | 'proof_required' | 'unavailable';
  candidates: readonly RefactorRecommendation[];
  message?: string;
  /** Provider error code and the remedy archctx names for it, kept when status is `unavailable`. */
  code?: string;
  action?: string;
}
/** Open suggestions come from two places: records the ledger already holds as `open`, and scan candidates it does not hold yet. */
export interface RefactorDiscovery {
  readonly scan: RefactorScanResultV1;
  readonly open: readonly RecommendationV3[];
}
export interface RefactorRecommendationOptions {
  env?: NodeJS.ProcessEnv;
  /** Raises the CodeGraph import read cap. `refactor decide` must pass the same value. */
  importNodeLimit?: number;
  discover?: (repoRoot: string, provider: ArchctxProviderOptions, importNodeLimit?: number) => RefactorDiscovery;
}

const result = (status: RefactorRecommendationResult['status'], message?: string): RefactorRecommendationResult => ({
  schemaVersion: 'repo-harness.refactor-recommendations/v2', status, candidates: [], ...(message ? { message } : {}),
});

export function discoverRefactorRecommendations(repoRoot: string, provider: ArchctxProviderOptions, importNodeLimit?: number): RefactorDiscovery {
  return { scan: runRefactorScan(repoRoot, provider, importNodeLimit), open: listOpenRecommendations(repoRoot, provider) };
}

export function refactorCandidates({ scan, open }: RefactorDiscovery): RefactorRecommendation[] {
  const modules = new Map(scan.snapshot.modules.map((entry) => [entry.nodeId, entry]));
  const listed = new Set(open.map((entry) => entry.recommendationId));
  return [...open, ...scan.proposedRecommendations.filter((entry) => !listed.has(entry.recommendationId))]
    .filter((entry): entry is Observation => entry.category === 'structural_observation')
    .map((entry) => present(entry, modules, scan.snapshot.snapshotDigest));
}

/** Module statistics come from the current scan, so they join only a suggestion measured on that same snapshot. */
function present(value: Observation, modules: ReadonlyMap<string, ModuleStatistics>, currentSnapshotDigest: string): RefactorRecommendation {
  const current = value.payload.baselineSnapshotDigest === currentSnapshotDigest;
  return {
    recommendationId: value.recommendationId, kind: value.payload.kind, subject: value.subject, affectedNodeIds: value.payload.affectedNodeIds,
    confidence: value.confidence, risk: value.risk, uncertainty: value.uncertainty, explanation: value.explanation,
    metrics: value.payload.metrics, evidence: value.payload.evidence,
    baselineSnapshotDigest: value.payload.baselineSnapshotDigest, snapshot: current ? 'current' : 'earlier',
    modules: current ? value.payload.affectedNodeIds.flatMap((nodeId) => {
      const entry = modules.get(nodeId);
      return entry ? [moduleEvidence(entry)] : [];
    }) : [],
  };
}

function moduleEvidence(entry: ModuleStatistics): RefactorModuleEvidence {
  return {
    nodeId: entry.nodeId, files: entry.footprint?.fileCount ?? null, lines: entry.footprint?.lineCount ?? null,
    fanIn: entry.dependencyGraph?.fanIn ?? null, fanOut: entry.dependencyGraph?.fanOut ?? null,
    cycles: entry.dependencyGraph?.cycleCount ?? null, directionViolations: entry.dependencyGraph?.directionViolationCount ?? null,
    unresolvedImports: entry.uncertainty.unresolvedImports,
  };
}

/**
 * Evidence only: it never records, decides, schedules or executes anything.
 * The Bot reads this result and decides whether to schedule work or ask the user.
 */
export function observeRefactorRecommendations(repoRoot: string, options: RefactorRecommendationOptions = {}): RefactorRecommendationResult {
  try {
    const root = realpathSync(repoRoot);
    if (!existsSync(join(root, '.archcontext/manifest.yaml'))) return result('unavailable', 'repository architecture model is not initialized');
    const discovery = (options.discover ?? discoverRefactorRecommendations)(root, { env: options.env }, options.importNodeLimit);
    const { codeFacts: facts, repositorySummary } = discovery.scan.snapshot;
    if (facts.reasonCodes.includes('code-facts-import-limit')) {
      return result('proof_required', importLimitRemedy(facts));
    }
    if (facts.coverage !== 'complete' || facts.truncated) {
      return result('proof_required', 'code facts are incomplete; run `codegraph init` and scan again');
    }
    // Module statistics double-count a file that several capabilities own, so
    // suggestions wait for unambiguous ownership (tasks/todos.md, recommendation proof).
    if (repositorySummary.multiplyOwnedFileCount > 0) {
      return result('proof_required', `${repositorySummary.multiplyOwnedFileCount} files have more than one owning capability; resolve model ownership and scan again`);
    }
    const candidates = refactorCandidates(discovery);
    return { ...result(candidates.length ? 'recommended' : 'no_action'), candidates };
  } catch (error) {
    if (error instanceof RefactorProviderError) {
      return { ...result('unavailable', error.message), code: error.code, ...(error.action ? { action: error.action } : {}) };
    }
    return result('unavailable', error instanceof Error ? error.message : String(error));
  }
}

/** A new CodeGraph index cannot fix this: only a larger read limit can. `refactor decide` needs the same limit as the scan. */
function importLimitRemedy(facts: RefactorScanResultV1['snapshot']['codeFacts']): string {
  const counted = typeof facts.importNodeCount === 'number' ? `${facts.importNodeCount} import nodes` : 'more import nodes';
  return `the index holds ${counted}, more than the scan import node limit of ${facts.edgeLimit ?? 'unknown'}; run \`refactor recommendations --import-node-limit <n>\` with a larger limit, and pass the same limit to \`refactor decide\``;
}

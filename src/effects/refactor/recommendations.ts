import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { RecommendationV3 } from 'archctx-contracts';
import type { RefactorScanResultV1 } from '../../core/refactor/provider-contract';
import type { ArchctxProviderOptions } from '../architecture/archctx-provider';
import { readRecommendationRecords, runRefactorScan } from './archctx-provider';

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
  instability: number | null;
  directionViolations: number | null;
  testFiles: number | null;
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
  modules: readonly RefactorModuleEvidence[];
}
export interface RefactorRecommendationResult {
  schemaVersion: 'repo-harness.refactor-recommendations/v2';
  status: 'recommended' | 'no_action' | 'proof_required' | 'unavailable';
  candidates: readonly RefactorRecommendation[];
  message?: string;
}
export interface RefactorDiscovery {
  readonly scan: RefactorScanResultV1;
  readonly records: readonly RecommendationV3[];
}
export interface RefactorRecommendationOptions {
  env?: NodeJS.ProcessEnv;
  discover?: (repoRoot: string, provider: ArchctxProviderOptions) => RefactorDiscovery;
}

// A user decision already exists for these lifecycle states.
const DECIDED = new Set(['accepted', 'rejected', 'deferred', 'waived', 'resolved', 'superseded', 'expired']);

const result = (status: RefactorRecommendationResult['status'], message?: string): RefactorRecommendationResult => ({
  schemaVersion: 'repo-harness.refactor-recommendations/v2', status, candidates: [], ...(message ? { message: message.slice(0, 1000) } : {}),
});

export function discoverRefactorRecommendations(repoRoot: string, provider: ArchctxProviderOptions): RefactorDiscovery {
  return { scan: runRefactorScan(repoRoot, provider), records: readRecommendationRecords(repoRoot, provider) };
}

export function refactorCandidates({ scan, records }: RefactorDiscovery): RefactorRecommendation[] {
  const decided = new Set(records.filter((entry) => DECIDED.has(entry.status)).map((entry) => entry.recommendationId));
  const modules = new Map(scan.snapshot.modules.map((entry) => [entry.nodeId, entry]));
  return scan.proposedRecommendations
    .filter((entry): entry is Observation => entry.category === 'structural_observation' && !decided.has(entry.recommendationId))
    .map((entry) => present(entry, scan, modules));
}

function present(value: Observation, scan: RefactorScanResultV1, modules: ReadonlyMap<string, ModuleStatistics>): RefactorRecommendation {
  const observation = scan.assessment.observations.find((entry) => entry.kind === value.payload.kind && entry.subjectSelectorId === value.subjectSelectorId);
  return {
    recommendationId: value.recommendationId, kind: value.payload.kind, subject: value.subject, affectedNodeIds: value.payload.affectedNodeIds,
    confidence: value.confidence, risk: value.risk, uncertainty: value.uncertainty, explanation: value.explanation,
    metrics: observation?.metrics ?? {},
    modules: value.payload.affectedNodeIds.flatMap((nodeId) => {
      const entry = modules.get(nodeId);
      return entry ? [moduleEvidence(entry)] : [];
    }),
  };
}

function moduleEvidence(entry: ModuleStatistics): RefactorModuleEvidence {
  return {
    nodeId: entry.nodeId, files: entry.footprint?.fileCount ?? null, lines: entry.footprint?.lineCount ?? null,
    fanIn: entry.dependencyGraph?.fanIn ?? null, fanOut: entry.dependencyGraph?.fanOut ?? null,
    cycles: entry.dependencyGraph?.cycleCount ?? null, instability: entry.dependencyGraph?.instability ?? null,
    directionViolations: entry.dependencyGraph?.directionViolationCount ?? null,
    testFiles: entry.tests.testFileCount, unresolvedImports: entry.uncertainty.unresolvedImports,
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
    const discovery = (options.discover ?? discoverRefactorRecommendations)(root, { env: options.env });
    const facts = discovery.scan.snapshot.codeFacts;
    if (facts.coverage !== 'complete' || facts.truncated) {
      return result('proof_required', 'code facts are incomplete; run `codegraph init` and scan again');
    }
    const candidates = refactorCandidates(discovery);
    return { ...result(candidates.length ? 'recommended' : 'no_action'), candidates };
  } catch (error) {
    return result('unavailable', error instanceof Error ? error.message : String(error));
  }
}

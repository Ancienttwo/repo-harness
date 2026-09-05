import { describe, expect, test } from 'bun:test';
import { architectureTargetDeltaInterventionId, type RecommendationV3 } from 'archctx-contracts';
import { authorRefactorProposal, RefactorProposalAuthoringError } from '../../src/core/refactor/proposal-authoring';
import {
  assessRefactorProposal,
  bindRefactorAssessment,
  projectRefactorDiscovery,
  RefactorDiscoveryError,
} from '../../src/effects/refactor/discovery-authoring';
import type { RefactorScanResultV1 } from '../../src/core/refactor/provider-contract';

const digest = (char: string) => `sha256:${char.repeat(64)}`;
const draft = {
  authoredBy: { id: 'author.local', kind: 'subagent', source: 'subagent' },
  intent: 'Remove a measured dependency cycle',
  scopePaths: ['src/core/refactor/proposal-authoring.ts'],
  targetOutcomes: [],
  killList: [],
} as const;

function discoveryScan(recommendations: RecommendationV3[] = []): RefactorScanResultV1 {
  return {
    request: { schemaVersion: 'archcontext.refactor-request/v1', scope: { kind: 'repository' } },
    assessment: { scale: null, proposalDigest: null },
    proposedRecommendations: recommendations,
  } as RefactorScanResultV1;
}

function observation(id: string, fingerprint: string): RecommendationV3 {
  return { recommendationId: id, fingerprint, category: 'structural_observation' } as RecommendationV3;
}

describe('refactor discovery and proposal authoring', () => {
  test('pins the first scan identity before asking the provider to assess a proposal', () => {
    const discovery = projectRefactorDiscovery({ ...discoveryScan([observation('recommendation.one', digest('1'))]),
      worktree: { workspaceId: 'workspace.test', storageWorkspaceId: 'storage.test', branch: 'main', headSha: 'a'.repeat(40), worktreeDigest: digest('2') },
    } as RefactorScanResultV1, []);
    const proposal = authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] });
    let assessedRequest: Record<string, unknown> | undefined;
    try {
      assessRefactorProposal({ discovery, candidateAlias: 'C01', proposal }, process.cwd(), { consumerRoot: process.cwd(), run: (_binary, args) => {
        if (args[0] === 'capabilities') return { status: 0, signal: null, stderr: '', stdout: JSON.stringify({ schemaVersion: 'archcontext.capabilities/v1', package: { name: 'archctx', version: '0.5.7' }, features: ['module-statistics-v1', 'refactor-assessment-v1', 'recommendation-v3'] }) };
        assessedRequest = JSON.parse(args[args.indexOf('--request-json') + 1]!);
        throw new Error('captured assessment request');
      } });
    } catch { /* The fake provider stops after capturing its request. */ }
    expect(assessedRequest?.expectedHeadSha).toBe(discovery.scan.worktree.headSha);
    expect(assessedRequest?.expectedWorktreeDigest).toBe(discovery.scan.worktree.worktreeDigest);
  });
  test('authors only the upstream proposal shape and rejects every illegal identity class', () => {
    const proposal = authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] });
    expect(proposal.proposalDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect('scale' in proposal).toBe(false);
    expect('route' in proposal).toBe(false);
    expect(() => authorRefactorProposal({ ...draft, scale: 'module', scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] } as never)).toThrow('outside the authoring contract');
    const kinds = ['developer', 'daemon', 'hook', 'cli', 'mcp', 'subagent', 'migration', 'system'];
    const sources = ['cli', 'mcp', 'manual', 'daemon', 'system', 'subagent'];
    const allowed = new Set(['cli:cli', 'developer:manual', 'mcp:mcp', 'subagent:subagent']);
    for (const kind of kinds) for (const source of sources) {
      const authoredBy = { id: `${kind}.${source}`, kind, source };
      const call = () => authorRefactorProposal({ ...draft, authoredBy, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] } as never);
      if (allowed.has(`${kind}:${source}`)) expect(call).not.toThrow();
      else {
        try { call(); throw new Error('expected rejection'); }
        catch (error) { expect(error).toBeInstanceOf(RefactorProposalAuthoringError); expect((error as RefactorProposalAuthoringError).code).toBe('AC_REFACTOR_PROPOSAL_UNAUTHORED'); }
      }
    }
  });

  test('accepts scale only from an assessment bound to the authored proposal digest', () => {
    const discovery = projectRefactorDiscovery(discoveryScan([observation('recommendation.one', digest('1'))]), []);
    const candidate = discovery.candidates[0]!;
    const proposal = authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] });
    const assessed = { ...discoveryScan(), request: { ...discovery.scan.request, proposal }, proposal, assessment: { scale: 'module', proposalDigest: proposal.proposalDigest } } as RefactorScanResultV1;
    expect(bindRefactorAssessment(candidate, proposal, assessed).scan.assessment.scale).toBe('module');
    expect(() => bindRefactorAssessment(candidate, proposal, { ...assessed, assessment: { scale: 'module', proposalDigest: digest('9') } } as RefactorScanResultV1)).toThrow('proposal-bound scale');
    expect(() => bindRefactorAssessment(candidate, proposal, { ...assessed, assessment: { scale: null, proposalDigest: null } } as RefactorScanResultV1)).toThrow('proposal-bound scale');
  });

  test('projects only proposal-free observations to stable aliases bound to provider identities', () => {
    const first = observation('recommendation.one', digest('1'));
    const second = observation('recommendation.two', digest('2'));
    const discovery = projectRefactorDiscovery(discoveryScan([first, second]), []);
    expect(discovery.candidates.map(({ alias, recommendationId, recommendationFingerprint }) => ({ alias, recommendationId, recommendationFingerprint }))).toEqual([
      { alias: 'C01', recommendationId: 'recommendation.one', recommendationFingerprint: digest('1') },
      { alias: 'C02', recommendationId: 'recommendation.two', recommendationFingerprint: digest('2') },
    ]);
    expect(() => projectRefactorDiscovery({ ...discoveryScan(), assessment: { scale: 'module', proposalDigest: digest('3') } } as RefactorScanResultV1, [])).toThrow(RefactorDiscoveryError);
    expect(() => projectRefactorDiscovery(discoveryScan([{ ...first, category: 'refactor_proposal' } as RecommendationV3]), [])).toThrow('non-observation');
    expect(projectRefactorDiscovery(discoveryScan([first, second]), [{ ...first, status: 'resolved' } as RecommendationV3]).candidates.map((entry) => entry.recommendationId)).toEqual(['recommendation.two']);
  });

  test('rejects an unknown candidate and every non-file scope before invoking the provider', () => {
    const discovery = projectRefactorDiscovery(discoveryScan([observation('recommendation.one', digest('1'))]), []);
    const proposal = authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [] });
    expect(() => assessRefactorProposal({ discovery, candidateAlias: 'C99', proposal }, process.cwd())).toThrow('unknown discovery candidate');
    for (const scopePath of ['src/core/refactor', 'src/**/*.ts', 'does-not-exist.ts']) {
      const invalidProposal = authorRefactorProposal({ ...draft, scopePaths: [scopePath], targetOutcomes: [], killList: [] });
      try { assessRefactorProposal({ discovery, candidateAlias: 'C01', proposal: invalidProposal }, process.cwd()); throw new Error('expected rejection'); }
      catch (error) { expect(error).toBeInstanceOf(RefactorDiscoveryError); expect((error as RefactorDiscoveryError).code).toBe('refactor_proposal_scope_invalid'); }
    }
    expect(() => authorRefactorProposal({ ...draft, scopePaths: ['../outside.ts'], targetOutcomes: [], killList: [] }))
      .toThrow(RefactorProposalAuthoringError);
  });
});

test('0.5.7 forbids a relation from being both a permanent target and temporary migration state', () => {
  const targetDelta = { interventionId: 'intervention.one', trigger: ['one owner'], thesis: 'Separate ownership', targetState: { owners: { service: 'node.a' }, requiredRelations: ['node.a->node.b'], removedConcepts: [] }, migrationState: { active: true, compatibilityContracts: [], temporaryRelations: [] as string[] }, completionCriteria: [{ outcomeId: 'one-owner', metric: 'repositorySummary.multiplyOwnedFileCount', subjectSelectorId: 'node.a', nodeId: null, operator: 'equals' as const, value: 0, required: true }], falsifiers: ['ownership remains split'], benefitLedger: { benefits: ['one owner'], costs: ['cutover'], rollbackPoint: 'before cutover' }, unresolvedTargets: [] };
  targetDelta.interventionId = architectureTargetDeltaInterventionId(targetDelta);
  expect(() => authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [], targetDelta })).not.toThrow();
  targetDelta.migrationState.temporaryRelations = ['node.a->node.b'];
  targetDelta.interventionId = architectureTargetDeltaInterventionId(targetDelta);
  expect(() => authorRefactorProposal({ ...draft, scopePaths: [...draft.scopePaths], targetOutcomes: [], killList: [], targetDelta })).toThrow('must not contain migration-only relation');
});

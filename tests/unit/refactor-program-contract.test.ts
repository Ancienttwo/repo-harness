import { describe, expect, test } from 'bun:test';
import { buildRefactorProgram, canonicalRefactorProgramBytes, validateRefactorProgram } from '../../src/core/refactor/program';

const D = (character: string) => `sha256:${character.repeat(64)}`;
const base = () => ({
  programId: 'refactor-program.fixture', baseMainSha: 'a'.repeat(40), providerStage: 'scan' as const,
  statisticsSnapshotDigest: D('1'), assessmentDigest: D('2'), proposalDigest: D('3'), proposalAuthor: { kind: 'subagent', source: 'subagent' },
  scale: 'module' as const, routeReasonCodes: ['single-node-scope'] as const, majorChangeReasons: [] as const, route: 'module_refactor' as const,
  affectedNodeIds: ['capability.runtime-harness.refactor-program'], bindings: [{ recommendationId: 'rec-1', recommendationDigest: D('4'), candidateAlias: 'C01', workPackageId: 'refactor-program-c01', taskRef: 'Refactor C01', executionBoundary: 'module' as const }],
});

describe('Module 6 RefactorProgramV1', () => {
  test('fans one exact recommendation out to distinct Work Packages without changing its authority', () => {
    const first = base().bindings[0]!;
    const second = { ...first, workPackageId: 'refactor-program-c02', taskRef: 'Refactor C02' };
    const input = { ...base(), scale: 'cross_module' as const, route: 'cross_module_refactor' as const, routeReasonCodes: ['multi-node-scope'] as const, bindings: [first, second] };
    expect(validateRefactorProgram(buildRefactorProgram(input)).bindings).toHaveLength(2);
    expect(() => buildRefactorProgram({ ...input, bindings: [first, { ...second, recommendationDigest: D('5') }] })).toThrow('consistent');
    expect(() => buildRefactorProgram({ ...input, bindings: [first, { ...second, candidateAlias: 'C02' }] })).toThrow('consistent');
    expect(() => buildRefactorProgram({ ...input, bindings: [first, { ...second, recommendationId: 'rec-2' }] })).toThrow('unique');
  });

  test('seals the PRD field set without recommendation lifecycle state', () => {
    const program = buildRefactorProgram(base());
    expect(validateRefactorProgram(JSON.parse(canonicalRefactorProgramBytes(program)))).toEqual(program);
    expect(Object.keys(program).sort()).toEqual(['affectedNodeIds', 'archctxVersion', 'assessmentDigest', 'baseMainSha', 'bindings', 'majorChangeReasons', 'programDigest', 'programId', 'proposalAuthor', 'proposalDigest', 'protocol', 'providerStage', 'route', 'routeReasonCodes', 'scale', 'statisticsSnapshotDigest'].sort());
    expect(program).not.toHaveProperty('recommendationStatus');
    expect(program).not.toHaveProperty('state');
  });

  test('rejects route downgrades, stale digests, duplicate bindings, and proposal presence drift', () => {
    expect(() => buildRefactorProgram({ ...base(), scale: 'cross_module', route: 'module_refactor' })).toThrow('route does not match');
    expect(() => validateRefactorProgram({ ...buildRefactorProgram(base()), programDigest: D('f') })).toThrow('stale');
    expect(() => buildRefactorProgram({ ...base(), bindings: [...base().bindings, { ...base().bindings[0], candidateAlias: 'C02' }] })).toThrow('unique');
    expect(() => buildRefactorProgram({ ...base(), proposalDigest: null })).toThrow('presence must agree');
  });
});

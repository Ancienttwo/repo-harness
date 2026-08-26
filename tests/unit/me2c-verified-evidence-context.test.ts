import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildDecisionRequest,
  buildEngineerStepProposal,
  buildSemanticContractProjection,
  buildSemanticVerificationAssertion,
  buildWorkerRoundReceipt,
  compileVerifiedEvidenceContext,
  type DecisionRequestCurrentV1,
  type EngineerStepProposalV1,
  type SemanticContractProjectionV1,
  type SemanticVerificationAssertionV1,
  type VerifiedBindingFenceV1,
  type VerifiedCandidateV1,
  type VerifiedTaskFenceV1,
  type WorkerRoundReceiptV1,
} from '../../src/core/engineers/verified-context';
import {
  buildWorkerResult,
  buildWorkerRunRef,
  type WorkerResultV1,
  type WorkerRunRefV1,
} from '../../src/core/engineers/delegation';
import { messageSha256 } from '../../src/core/messages/mechanics';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  projectSemanticContract,
  readDecisionStatus,
  readSemanticContractProjection,
  transitionDecisionRequest,
  validateVerifiedEvidenceRef,
} from '../../src/effects/engineers/verified-context-store';

const roots: string[] = [];
const D = (char: string) => `sha256:${char.repeat(64)}`;
const U = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const task: VerifiedTaskFenceV1 = { task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64), claim_id: U('1'), lease_generation: 1 };
const binding: VerifiedBindingFenceV1 = { engineer_id: 'engineer:capability.verification.evals-checks', binding_id: U('2'), binding_generation: 1, engineer_contract_revision: D('c') };
const candidate: VerifiedCandidateV1 = { commit_sha: 'd'.repeat(40), tree_sha: 'e'.repeat(40), subject_sha256: D('f') };

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function contract(): SemanticContractProjectionV1 {
  return buildSemanticContractProjection({
    contract_ref: 'tasks/contracts/fixture.contract.md',
    contract_revision: '1'.repeat(40),
    contract_blob_oid: '2'.repeat(40),
    contract_sha256: D('3'),
    constraints: [
      { constraint_id: 'constraint-a', statement: 'A is proven.' },
      { constraint_id: 'constraint-b', statement: 'B is proven.' },
    ],
  });
}

interface ChainFixture {
  contract: SemanticContractProjectionV1;
  proposals: EngineerStepProposalV1[];
  rounds: WorkerRoundReceiptV1[];
  assertions: SemanticVerificationAssertionV1[];
  refs: WorkerRunRefV1[];
  results: WorkerResultV1[];
}

function chain(count = 3): ChainFixture {
  const exactContract = contract();
  const proposals: EngineerStepProposalV1[] = [];
  const rounds: WorkerRoundReceiptV1[] = [];
  const assertions: SemanticVerificationAssertionV1[] = [];
  const refs: WorkerRunRefV1[] = [];
  const results: WorkerResultV1[] = [];
  let previous: string | null = null;
  for (let index = 0; index < count; index += 1) {
    const workerId = `${String(index + 3).repeat(8)}-${String(index + 3).repeat(4)}-4${String(index + 3).repeat(3)}-8${String(index + 3).repeat(3)}-${String(index + 3).repeat(12)}`;
    const delegationId = `${String(index + 6).repeat(8)}-${String(index + 6).repeat(4)}-4${String(index + 6).repeat(3)}-8${String(index + 6).repeat(3)}-${String(index + 6).repeat(12)}`;
    const proposal = buildEngineerStepProposal({ proposal_id: `${String(index + 3).repeat(8)}-${String(index + 3).repeat(4)}-4${String(index + 3).repeat(3)}-9${String(index + 3).repeat(3)}-${String(index + 3).repeat(12)}`, task, binding, round_index: index, previous_assertion_sha256: previous, contract_sha256: exactContract.contract_sha256, context_packet_sha256: index === 0 ? D('4') : D(String(index + 4)), action_kind: index === 2 ? 'verify' : 'analyze', target_constraint_ids: ['constraint-a', 'constraint-b'], input_evidence_refs: [] }, exactContract);
    const runRef = buildWorkerRunRef({ worker_run_id: workerId, delegation_id: delegationId, admission_receipt_sha256: D('5'), logical_role: 'explorer', role_profile_sha256: D('6'), runtime_principal_ref: `codex-exec:${D('7')}`, launch_claim_sha256: D('8'), execution_receipt_sha256: D('9'), read_only_sandbox_receipt_sha256: D('a') });
    const result = buildWorkerResult({ delegation_id: delegationId, worker_run_id: workerId, worker_run_ref_sha256: runRef.run_ref_sha256, logical_role: 'explorer', runtime_observation_sha256: D('b'), read_only_sandbox_receipt_sha256: runRef.read_only_sandbox_receipt_sha256, evidence_refs: [], untrusted_claims: [`worker-claim-${index}`] });
    const round = buildWorkerRoundReceipt({ worker_run_id: workerId, worker_run_ref_sha256: runRef.run_ref_sha256, worker_runtime_receipt_sha256: runRef.execution_receipt_sha256, delegation_id: delegationId, round_index: index, proposal_sha256: proposal.proposal_sha256, result_sha256: result.result_sha256, candidate, before_state_sha256: D('c'), after_state_sha256: D('d'), evidence_refs: [] });
    const check = D(index % 2 === 0 ? 'e' : '1');
    const verifier = D(index % 2 === 0 ? 'f' : '2');
    const assertion = buildSemanticVerificationAssertion({ assertion_id: `${String(index + 3).repeat(8)}-${String(index + 3).repeat(4)}-4${String(index + 3).repeat(3)}-a${String(index + 3).repeat(3)}-${String(index + 3).repeat(12)}`, worker_run_id: workerId, round_index: index, previous_assertion_sha256: previous, task, candidate, contract_sha256: exactContract.contract_sha256, worker_round_receipt_sha256: round.round_receipt_sha256, check_receipt_sha256: check, verifier_receipt_sha256: verifier, verifier_profile_revision: D('0'), satisfied_constraints: ['constraint-a'], unsatisfied_constraints: [], blocked_constraints: ['constraint-b'], integrity_findings: [], untrusted_claims: [`verifier-note-${index}`], evidence_refs: [{ ref: `repo:checks/${index}.json`, sha256: check }, { ref: `repo:verifiers/${index}.json`, sha256: verifier }] });
    proposals.push(proposal); rounds.push(round); assertions.push(assertion); refs.push(runRef); results.push(result); previous = assertion.assertion_sha256;
  }
  return { contract: exactContract, proposals, rounds, assertions, refs, results };
}

function compile(fixture: ChainFixture, decisions: Array<{ request: ReturnType<typeof buildDecisionRequest>; current: DecisionRequestCurrentV1 }> = []) {
  return compileVerifiedEvidenceContext({ contract: fixture.contract, task, binding, proposals: fixture.proposals, rounds: fixture.rounds, assertions: fixture.assertions, worker_run_refs: fixture.refs, worker_results: fixture.results, decisions });
}

describe('ME-2C verified evidence context', () => {
  test('selects the third assertion only from one continuous exact-subject chain', () => {
    const fixture = chain(3);
    const context = compile(fixture);
    expect(context.assertion_chain).toEqual(fixture.assertions.map((item) => item.assertion_sha256));
    expect(context.selected_assertion_sha256).toBe(fixture.assertions[2]!.assertion_sha256);
    expect(context.checkpoints).toHaveLength(3);
    expect(context.untrusted_claims).toEqual(['verifier-note-0', 'verifier-note-1', 'verifier-note-2', 'worker-claim-0', 'worker-claim-1', 'worker-claim-2']);
    expect(context).not.toHaveProperty('task_state');
    expect(context).not.toHaveProperty('acceptance');
  });

  test('refuses forks, gaps and proposal/round/assertion subject drift', () => {
    const fixture = chain(2);
    const fork = buildSemanticVerificationAssertion({ ...fixture.assertions[1]!, assertion_id: U('9'), worker_run_id: fixture.assertions[1]!.worker_run_id, previous_assertion_sha256: fixture.assertions[0]!.assertion_sha256, assertion_sha256: undefined } as never);
    expect(() => compile({ ...fixture, assertions: [...fixture.assertions, fork] })).toThrow('fork');
    expect(() => compile({ ...fixture, assertions: [fixture.assertions[1]!] })).toThrow(/root|gap/);
    const changedRound = buildWorkerRoundReceipt({ ...fixture.rounds[1]!, proposal_sha256: D('4'), round_receipt_sha256: undefined } as never);
    expect(() => compile({ ...fixture, rounds: [fixture.rounds[0]!, changedRound] })).toThrow(/round|proposal/i);
    const unreachable = buildEngineerStepProposal({ ...fixture.proposals[0]!, proposal_id: U('9'), round_index: 9, proposal_sha256: undefined } as never, fixture.contract);
    expect(() => compile({ ...fixture, proposals: [...fixture.proposals, unreachable] })).toThrow('unreachable');
  });

  test('requires exact check/verifier evidence and complete non-overlapping constraint partition', () => {
    const fixture = chain(1);
    const assertion = fixture.assertions[0]!;
    const missing = buildSemanticVerificationAssertion({ ...assertion, evidence_refs: [{ ref: 'repo:checks/0.json', sha256: assertion.check_receipt_sha256 }], assertion_sha256: undefined } as never);
    expect(() => compile({ ...fixture, assertions: [missing] })).toThrow('check and verifier');
    expect(() => buildSemanticVerificationAssertion({ ...assertion, satisfied_constraints: ['constraint-a'], blocked_constraints: ['constraint-a'], assertion_sha256: undefined } as never)).toThrow('overlap');
  });

  test('deduplicates identical trusted refs and rejects conflicting bytes for one ref', () => {
    const fixture = chain(1);
    const shared = fixture.assertions[0]!.evidence_refs[0]!;
    const proposal = buildEngineerStepProposal({ ...fixture.proposals[0]!, input_evidence_refs: [shared], proposal_sha256: undefined } as never, fixture.contract);
    const round = buildWorkerRoundReceipt({ ...fixture.rounds[0]!, proposal_sha256: proposal.proposal_sha256, evidence_refs: [shared], round_receipt_sha256: undefined } as never);
    const assertion = buildSemanticVerificationAssertion({ ...fixture.assertions[0]!, worker_round_receipt_sha256: round.round_receipt_sha256, assertion_sha256: undefined } as never);
    const exact = compile({ ...fixture, proposals: [proposal], rounds: [round], assertions: [assertion] });
    expect(exact.trusted_evidence_refs).toHaveLength(2);

    const conflictingProposal = buildEngineerStepProposal({ ...proposal, input_evidence_refs: [{ ref: shared.ref, sha256: D('a') }], proposal_sha256: undefined } as never, fixture.contract);
    const conflictingRound = buildWorkerRoundReceipt({ ...round, proposal_sha256: conflictingProposal.proposal_sha256, round_receipt_sha256: undefined } as never);
    const conflictingAssertion = buildSemanticVerificationAssertion({ ...assertion, worker_round_receipt_sha256: conflictingRound.round_receipt_sha256, assertion_sha256: undefined } as never);
    expect(() => compile({ ...fixture, proposals: [conflictingProposal], rounds: [conflictingRound], assertions: [conflictingAssertion] })).toThrow('conflicting bytes');
  });

  test('open Human decision blocks context until a fenced Human answer', () => {
    const root = repositoryFixture();
    const request = buildDecisionRequest({ decision_id: U('7'), task_fence: task, binding_fence: binding, previous_assertion_sha256: null, question: 'Choose the exact public interface.' });
    const opened = transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'open-once', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null });
    expect(() => compile(chain(0), [{ request, current: opened.current }])).toThrow('is open');
    expect(() => transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'wrong-actor', transition: 'answer', expected_current_digest: opened.current.current_digest, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: 'A' })).toThrow('Human');
    const answered = transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'answer-once', transition: 'answer', expected_current_digest: opened.current.current_digest, actor: { kind: 'human', principal_ref: 'human:owner', binding_generation: null }, answer: 'Use interface A.' });
    const context = compile(chain(0), [{ request, current: answered.current }]);
    expect(context.answered_decisions).toEqual([{ decision_id: request.decision_id, request_sha256: request.request_sha256, current_digest: answered.current.current_digest, answer: 'Use interface A.', answered_by: 'human:owner' }]);
  });

  test('rejects an Engineer decision transition after its Binding is replaced', () => {
    const root = repositoryFixture();
    const request = buildDecisionRequest({ decision_id: U('6'), task_fence: task, binding_fence: binding, previous_assertion_sha256: null, question: 'Proceed?' });
    const opened = transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'open', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null });
    const current = readEngineerBindingStatus(root, binding.engineer_id, binding.engineer_contract_revision).current;
    bindEngineer(root, {
      engineer_id: binding.engineer_id,
      idempotency_key: 'replace-binding',
      provider: 'codex',
      provider_thread_id: 'thread-replacement',
      host_id: 'host-replacement',
      engineer_contract_revision: binding.engineer_contract_revision,
      expected_current_digest: current.current_digest,
      expected_binding_generation: current.binding_generation,
      expected_binding_id: current.current_binding_id,
      expected_engineer_contract_revision: current.engineer_contract_revision,
      binding_id: () => U('8'),
      now: () => '2026-08-26T00:01:00.000Z',
    });
    expect(() => transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'cancel-stale', transition: 'cancel', expected_current_digest: opened.current.current_digest, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null })).toThrow('current Binding');
    const cancelled = transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'cancel-human', transition: 'cancel', expected_current_digest: opened.current.current_digest, actor: { kind: 'human', principal_ref: 'human:owner', binding_generation: null }, answer: null });
    expect(cancelled.current.state).toBe('cancelled');
  });

  test('recovers each DecisionRequest crash boundary idempotently and rejects same-key conflicts', () => {
    for (const boundary of ['before_event', 'after_transition_fsync', 'after_event_fsync', 'after_current_fsync'] as const) {
      const root = repositoryFixture();
      const request = buildDecisionRequest({ decision_id: U(boundary === 'before_event' ? '3' : boundary === 'after_transition_fsync' ? '4' : boundary === 'after_event_fsync' ? '5' : '6'), task_fence: task, binding_fence: binding, previous_assertion_sha256: null, question: 'Proceed?' });
      expect(() => transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'open', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null, crash_hook: (point) => { if (point === boundary) throw new Error(`crash:${point}`); } })).toThrow(`crash:${boundary}`);
      const recovered = transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'open', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'engineer-principal', binding_generation: 1 }, answer: null });
      expect(readDecisionStatus(root, request.decision_id).current.current_digest).toBe(recovered.current.current_digest);
      expect(() => transitionDecisionRequest({ repo_root: root, request, idempotency_key: 'open', transition: 'open', expected_current_digest: null, actor: { kind: 'engineer', principal_ref: 'other', binding_generation: 1 }, answer: null })).toThrow('different operation');
    }
  });

  test('projects exact tracked Contract bytes and rejects mutable repository evidence', () => {
    const root = repositoryFixture();
    const contractRef = 'tasks/contracts/fixture.contract.md';
    mkdirSync(join(root, 'tasks/contracts'), { recursive: true });
    writeFileSync(join(root, contractRef), `${contractMarkdown()}\n`);
    execFileSync('git', ['add', contractRef], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'contract'], { cwd: root });
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const projection = projectSemanticContract(root, contractRef, revision);
    writeFileSync(join(root, contractRef), 'mutable working copy\n');
    expect(readSemanticContractProjection(root, projection.projection_sha256)).toEqual(projection);
    writeFileSync(join(root, 'evidence.json'), '{"pass":true}\n');
    const digest = messageSha256(readFileSync(join(root, 'evidence.json')));
    expect(validateVerifiedEvidenceRef(root, { ref: 'repo:evidence.json', sha256: digest }).toString()).toContain('pass');
    writeFileSync(join(root, 'evidence.json'), '{"pass":false}\n');
    expect(() => validateVerifiedEvidenceRef(root, { ref: 'repo:evidence.json', sha256: digest })).toThrow('changed');
  });

  test('has no Task, Lease, Publication or Acceptance transition imports', () => {
    for (const path of ['src/core/engineers/verified-context.ts', 'src/effects/engineers/verified-context-store.ts']) {
      const imports = readFileSync(join(process.cwd(), path), 'utf8').split('\n').filter((line) => line.includes("from '") || line.includes('from "'));
      expect(imports.join('\n')).not.toMatch(/core\/state|effects\/state|publication|integration\/product-acceptance/);
    }
  });
});

function repositoryFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me2c-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  bindEngineer(root, {
    engineer_id: binding.engineer_id,
    idempotency_key: 'fixture-binding',
    provider: 'codex',
    provider_thread_id: 'thread-fixture',
    host_id: 'host-fixture',
    engineer_contract_revision: binding.engineer_contract_revision,
    expected_current_digest: null,
    expected_binding_generation: 0,
    expected_binding_id: null,
    expected_engineer_contract_revision: binding.engineer_contract_revision,
    binding_id: () => binding.binding_id,
    now: () => '2026-08-26T00:00:00.000Z',
  });
  return root;
}

function contractMarkdown(): string {
  return `# Task Contract: fixture

## Semantic Constraint Catalog

\`\`\`json
{"protocol":1,"constraints":[{"constraint_id":"constraint-a","statement":"A is exact."},{"constraint_id":"constraint-b","statement":"B is exact."}]}
\`\`\``;
}

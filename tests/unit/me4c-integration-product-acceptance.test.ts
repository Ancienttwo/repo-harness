import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  assertCompletePassingMatrix,
  buildAcceptanceMatrix,
  validateIntegrationContract,
} from '../../src/core/integration/product-acceptance';
import { publicationPointerFromReceipt } from '../../src/core/publication/publication-lifecycle';
import {
  buildPublicationReceipt,
  publicationReceiptDigest,
  publicationSha256,
} from '../../src/core/publication/publication-receipt';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  enterReviewingLeaseRecord,
} from '../../src/core/state/coordination-identity';
import {
  createAcceptanceMatrix,
  createIntegrationContract,
  createIntegrationEnvelope,
  createProductAcceptanceProjection,
  IntegrationAcceptanceError,
  readAcceptanceMatrix,
  readIntegrationContract,
  readIntegrationEnvelope,
  readProductAcceptanceProjection,
} from '../../src/effects/integration/product-acceptance';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import { createLeaseDirectory, leaseOwnerPath, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import type { AcceptanceReceipt } from '../../scripts/acceptance-receipt';

const TASK_A = '1'.repeat(64);
const TASK_B = '2'.repeat(64);
const REV_A = '3'.repeat(64);
const REV_B = '4'.repeat(64);
const SUBJECT = `sha256:${'5'.repeat(64)}`;
const DIGEST = `sha256:${'6'.repeat(64)}`;
const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function expectCode(run: () => unknown, code: IntegrationAcceptanceError['code']): void {
  try {
    run();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(IntegrationAcceptanceError);
    expect((error as IntegrationAcceptanceError).code).toBe(code);
  }
}

interface Fixture {
  readonly root: string;
  readonly base: string;
  readonly headA: string;
  readonly finalHead: string;
  readonly contract: ReturnType<typeof createIntegrationContract>;
  readonly envelope: ReturnType<typeof createIntegrationEnvelope>;
  readonly matrix: ReturnType<typeof createAcceptanceMatrix>;
}

function reviewingPublication(root: string, taskId: string, revision: string, head: string, base: string, number: number): void {
  const repoId = publicationSha256(realpathSync(resolveGitCommonDirectory(root)));
  const receipt = buildPublicationReceipt({
    repo_id: repoId,
    task_id: taskId,
    task_revision: revision,
    claim_id: `claim-${number}`,
    generation: 1,
    target_ref: 'main',
    base_sha: base,
    branch: 'main',
    head_sha: head,
    tree_sha: git(root, 'rev-parse', `${head}^{tree}`),
    review_subject_sha256: SUBJECT,
    verification_evidence_sha256: DIGEST,
    merge_seal_sha256: DIGEST,
    provider: 'github',
    provider_repo_id: 'R_me4c_fixture',
    pr_number: number,
    pr_url: `https://example.invalid/pr/${number}`,
    created_at: `2026-08-26T00:00:0${number}Z`,
  });
  writePublicationReceiptCache(root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId: `claim-${number}`,
    taskId,
    taskRevision: revision,
    sprintPath: 'plans/sprints/me4c.sprint.md',
    targetRef: 'main',
    generation: 1,
    sessionId: `session-${number}`,
    sourceWorktree: root,
  });
  const bound = bindLeaseRecord(owner, {
    claimId: owner.claim_id,
    executionWorktree: root,
    branch: 'main',
    unitRef: `plans/plan-${number}.md`,
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId: owner.claim_id,
    executionWorktree: root,
    finishTransactionKey: null,
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: owner.claim_id,
    publication: publicationPointerFromReceipt(receipt, `ship-${number}`),
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(root, taskId, reviewing.record);
  if (!('current_publication' in reviewing.record) || reviewing.record.current_publication === null) {
    throw new Error('reviewing transition did not retain its publication pointer');
  }
  expect(publicationReceiptDigest(receipt)).toBe(reviewing.record.current_publication.receipt_sha256);
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me4c-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'ME4C Test');
  git(root, 'config', 'user.email', 'me4c@test.invalid');
  mkdirSync(join(root, 'plans/prds'), { recursive: true });
  mkdirSync(join(root, 'docs/evidence'), { recursive: true });
  writeFileSync(join(root, 'plans/prds/product.md'), '# Product\n\n> **Status**: Approved\n');
  writeFileSync(join(root, 'docs/spec.md'), '# Source spec\n');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');

  writeFileSync(join(root, 'module-a.txt'), 'A\n');
  git(root, 'add', 'module-a.txt');
  git(root, 'commit', '-m', 'module A');
  const headA = git(root, 'rev-parse', 'HEAD');

  writeFileSync(join(root, 'module-b.txt'), 'B\n');
  writeFileSync(join(root, 'docs/evidence/constraint-a.json'), '{"pass":true}\n');
  writeFileSync(join(root, 'docs/evidence/constraint-b.json'), '{"pass":true}\n');
  writeFileSync(join(root, 'docs/evidence/verifier.json'), '{"verdict":"pass"}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'combined candidate');
  const finalHead = git(root, 'rev-parse', 'HEAD');

  reviewingPublication(root, TASK_A, REV_A, headA, base, 1);
  reviewingPublication(root, TASK_B, REV_B, finalHead, base, 2);
  const contract = createIntegrationContract({ repo_root: root }, {
    approved_prd_ref: 'plans/prds/product.md',
    source_spec_ref: 'docs/spec.md',
    integration_group: 'fixture',
    required_work_packages: [
      { work_package_id: TASK_B, work_package_revision: REV_B },
      { work_package_id: TASK_A, work_package_revision: REV_A },
    ],
    required_constraints: ['constraint-b', 'constraint-a'],
  });
  const envelope = createIntegrationEnvelope({ repo_root: root }, {
    contract_sha256: contract.contract_sha256,
    base_sha: base,
    final_head_sha: finalHead,
  });
  const matrix = createAcceptanceMatrix({ repo_root: root }, {
    contract_sha256: contract.contract_sha256,
    envelope_sha256: envelope.envelope_sha256,
    rows: [
      { constraint_id: 'constraint-b', evidence_ref: 'docs/evidence/constraint-b.json', result: 'pass' },
      { constraint_id: 'constraint-a', evidence_ref: 'docs/evidence/constraint-a.json', result: 'pass' },
    ],
    verifier_receipt_ref: 'docs/evidence/verifier.json',
  });
  return { root, base, headA, finalHead, contract, envelope, matrix };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ME-4C integration product acceptance', () => {
  test('freezes two current publications and projects the existing AcceptanceReceipt without mutating leases', async () => {
    const value = fixture();
    expect(value.contract.required_work_packages.map((item) => item.work_package_id)).toEqual([TASK_A, TASK_B]);
    expect(value.envelope.selected_publications.map((item) => item.head_sha)).toEqual([value.headA, value.finalHead]);
    expect(readIntegrationContract(value.root, value.contract.contract_sha256)).toEqual(value.contract);
    expect(readIntegrationEnvelope(value.root, value.envelope.envelope_sha256)).toEqual(value.envelope);
    expect(readAcceptanceMatrix(value.root, value.matrix.matrix_sha256)).toEqual(value.matrix);

    const leaseA = readFileSync(leaseOwnerPath(value.root, TASK_A));
    const leaseB = readFileSync(leaseOwnerPath(value.root, TASK_B));
    const acceptance = {
      protocol: 2,
      kind: 'repo-harness-acceptance-receipt',
      repository_root: value.root,
      contract_file: 'tasks/contracts/integration.contract.md',
      contract_sha256: DIGEST,
      goal_file: 'plans/plan-integration.md',
      goal_sha256: DIGEST,
      verification_file: '.ai/harness/checks/latest.json',
      verification_evidence_sha256: DIGEST,
      benchmark_evidence_sha256: '',
      subject_sha256: SUBJECT,
      subject_scope: 'normalized-final-content',
      target_ref: 'main',
      target_revision: value.base,
      reviewed_paths: ['module-a.txt', 'module-b.txt'],
      disposition: 'user_waiver',
      expected_reviewer: 'Codex',
      reviewer: 'User',
      source: 'user-waiver',
      actor: 'owner',
      summary: 'approved fixture',
      findings: [],
      waiver_grant_sha256: DIGEST,
      issued_at: '2026-08-26T00:00:00.000Z',
    } satisfies AcceptanceReceipt;
    const receiptBytes = Buffer.from(`${JSON.stringify(acceptance, null, 2)}\n`);
    const projection = await createProductAcceptanceProjection(
      { repo_root: value.root, authority_home: value.root },
      {
        contract_sha256: value.contract.contract_sha256,
        envelope_sha256: value.envelope.envelope_sha256,
        matrix_sha256: value.matrix.matrix_sha256,
      },
      {
        verify_acceptance: async () => acceptance,
        read_acceptance_receipt_bytes: () => receiptBytes,
      },
    );
    expect(projection.acceptance_receipt_sha256).toBe(publicationSha256(receiptBytes));
    expect(projection.acceptance_disposition).toBe('user_waiver');
    expect(readProductAcceptanceProjection(value.root, projection.projection_sha256)).toEqual(projection);
    expect(readFileSync(leaseOwnerPath(value.root, TASK_A))).toEqual(leaseA);
    expect(readFileSync(leaseOwnerPath(value.root, TASK_B))).toEqual(leaseB);
  });

  test('fails closed on stale requirement, current publication or evidence bytes', async () => {
    const requirement = fixture();
    writeFileSync(join(requirement.root, 'docs/spec.md'), '# changed\n');
    expectCode(() => createIntegrationEnvelope({ repo_root: requirement.root }, {
      contract_sha256: requirement.contract.contract_sha256,
      base_sha: requirement.base,
      final_head_sha: requirement.finalHead,
    }), 'requirement_invalid');

    const publication = fixture();
    const lease = JSON.parse(readFileSync(leaseOwnerPath(publication.root, TASK_A), 'utf8')) as Record<string, unknown>;
    lease.generation = 2;
    writeFileSync(leaseOwnerPath(publication.root, TASK_A), `${JSON.stringify(lease, null, 2)}\n`);
    expectCode(() => createAcceptanceMatrix({ repo_root: publication.root }, {
      contract_sha256: publication.contract.contract_sha256,
      envelope_sha256: publication.envelope.envelope_sha256,
      rows: publication.matrix.rows,
      verifier_receipt_ref: publication.matrix.verifier_receipt_ref,
    }), 'publication_stale');

    const evidence = fixture();
    writeFileSync(join(evidence.root, 'docs/evidence/constraint-a.json'), '{"pass":false}\n');
    await expect(createProductAcceptanceProjection(
      { repo_root: evidence.root, authority_home: evidence.root },
      {
        contract_sha256: evidence.contract.contract_sha256,
        envelope_sha256: evidence.envelope.envelope_sha256,
        matrix_sha256: evidence.matrix.matrix_sha256,
      },
      { verify_acceptance: async () => { throw new Error('must not run'); } },
    )).rejects.toMatchObject({ code: 'matrix_invalid' });

    const receiptRace = fixture();
    const acceptance = {
      protocol: 2,
      kind: 'repo-harness-acceptance-receipt',
      repository_root: receiptRace.root,
      contract_file: 'tasks/contracts/integration.contract.md',
      contract_sha256: DIGEST,
      goal_file: 'plans/plan-integration.md',
      goal_sha256: DIGEST,
      verification_file: '.ai/harness/checks/latest.json',
      verification_evidence_sha256: DIGEST,
      benchmark_evidence_sha256: 'not-applicable',
      subject_sha256: SUBJECT,
      subject_scope: 'normalized-final-content',
      target_ref: 'main',
      target_revision: receiptRace.base,
      reviewed_paths: [],
      disposition: 'external_pass',
      expected_reviewer: 'Codex',
      reviewer: 'Codex',
      source: 'codex-plugin',
      actor: null,
      summary: 'verified before read race',
      findings: [],
      waiver_grant_sha256: null,
      issued_at: '2026-08-26T00:00:00.000Z',
    } satisfies AcceptanceReceipt;
    await expect(createProductAcceptanceProjection(
      { repo_root: receiptRace.root, authority_home: receiptRace.root },
      {
        contract_sha256: receiptRace.contract.contract_sha256,
        envelope_sha256: receiptRace.envelope.envelope_sha256,
        matrix_sha256: receiptRace.matrix.matrix_sha256,
      },
      {
        verify_acceptance: async () => acceptance,
        read_acceptance_receipt_bytes: () => Buffer.from('{"changed":true}\n'),
      },
    )).rejects.toMatchObject({ code: 'acceptance_unavailable' });
  });

  test('rejects incomplete, failing and extra matrix constraints', () => {
    const value = fixture();
    const make = (rows: Parameters<typeof buildAcceptanceMatrix>[0]['rows']) => buildAcceptanceMatrix({
      envelope_sha256: value.envelope.envelope_sha256,
      rows,
      verifier_receipt_ref: 'docs/evidence/verifier.json',
      verifier_receipt_sha256: DIGEST,
    });
    expect(() => assertCompletePassingMatrix(value.contract, value.envelope, make([
      { constraint_id: 'constraint-a', evidence_ref: 'a', evidence_sha256: DIGEST, result: 'pass' },
    ]))).toThrow('constraints do not exactly match');
    expect(() => assertCompletePassingMatrix(value.contract, value.envelope, make([
      { constraint_id: 'constraint-a', evidence_ref: 'a', evidence_sha256: DIGEST, result: 'fail' },
      { constraint_id: 'constraint-b', evidence_ref: 'b', evidence_sha256: DIGEST, result: 'pass' },
    ]))).toThrow('not fully passing');
    expect(() => assertCompletePassingMatrix(value.contract, value.envelope, make([
      { constraint_id: 'constraint-a', evidence_ref: 'a', evidence_sha256: DIGEST, result: 'pass' },
      { constraint_id: 'constraint-b', evidence_ref: 'b', evidence_sha256: DIGEST, result: 'pass' },
      { constraint_id: 'constraint-c', evidence_ref: 'c', evidence_sha256: DIGEST, result: 'pass' },
    ]))).toThrow('constraints do not exactly match');
  });

  test('rejects non-canonical objects and repository symlink evidence', () => {
    const value = fixture();
    expect(() => validateIntegrationContract({ ...value.contract, extra: true })).toThrow('fields are invalid');
    symlinkSync(join(value.root, 'docs/spec.md'), join(value.root, 'docs/spec-link.md'));
    expectCode(() => createIntegrationContract({ repo_root: value.root }, {
      approved_prd_ref: 'plans/prds/product.md',
      source_spec_ref: 'docs/spec-link.md',
      integration_group: 'symlink',
      required_work_packages: [{ work_package_id: TASK_A, work_package_revision: REV_A }],
      required_constraints: ['constraint-a'],
    }), 'evidence_conflict');
  });

  test('rejects a symlinked immutable-store ancestor before writing outside the Git common directory', () => {
    const value = fixture();
    const common = resolveGitCommonDirectory(value.root);
    const ownedRoot = join(common, 'repo-harness');
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-me4c-outside-'));
    roots.push(outside);
    rmSync(ownedRoot, { recursive: true, force: true });
    symlinkSync(outside, ownedRoot);

    expectCode(() => createIntegrationContract({ repo_root: value.root }, {
      approved_prd_ref: 'plans/prds/product.md',
      source_spec_ref: 'docs/spec.md',
      integration_group: 'unsafe-store',
      required_work_packages: [{ work_package_id: TASK_A, work_package_revision: REV_A }],
      required_constraints: ['constraint-a'],
    }), 'evidence_conflict');
    expect(readdirSync(outside)).toEqual([]);
  });
});

import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  assertCompletePassingMatrix,
  buildAcceptanceMatrix,
  validateIntegrationContract,
  validateIntegrationEnvelope,
  type RequiredPullRequestV2,
} from '../../src/core/integration/product-acceptance';
import {
  publicationSha256,
  stablePublicationJson,
} from '../../src/core/publication/publication-receipt';
import {
  createAcceptanceMatrix,
  createIntegrationContract,
  createIntegrationEnvelope,
  createProductAcceptanceProjection,
  IntegrationAcceptanceError,
  type IntegrationAcceptanceEnvironment,
  readAcceptanceMatrix,
  readIntegrationContract,
  readIntegrationEnvelope,
  readProductAcceptanceProjection,
} from '../../src/effects/integration/product-acceptance';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { acceptanceReceiptPath, writeAcceptanceVerificationObservation, type AcceptanceReceipt } from '../../scripts/acceptance-receipt';

const SUBJECT = `sha256:${'5'.repeat(64)}`;
const DIGEST = `sha256:${'6'.repeat(64)}`;
const roots: string[] = [];

function fixtureAuthority(root: string) {
  const home = mkdtempSync(join(tmpdir(), 'product-review-admission-')); roots.push(home);
  return seedReviewAdmissionFixture(root, home).source;
}

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
  readonly finalTree: string;
  readonly environment: IntegrationAcceptanceEnvironment;
  readonly provider: Map<number, { selection: RequiredPullRequestV2; merge: string; tree: string }>;
  readonly legacyPath: string;
  readonly contract: ReturnType<typeof createIntegrationContract>;
  readonly envelope: ReturnType<typeof createIntegrationEnvelope>;
  readonly matrix: ReturnType<typeof createAcceptanceMatrix>;
}

function providerRunner(provider: Fixture['provider']): NonNullable<IntegrationAcceptanceEnvironment['gh_runner']> {
  const response = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
  return args => {
    const command = `${args[0]} ${args[1]}`;
    if (command === 'repo view') return response({ id: 'R_me4c_fixture', nameWithOwner: 'example/product' });
    if (args[0] === 'api' && args[1]?.includes('/contents/')) return response({ status: '404', message: 'Not Found' }, 1);
    if (args[0] === 'api' && args[1] === 'repos/example/product') return response({ id: 1001, node_id: 'R_me4c_fixture', full_name: 'example/product', default_branch: 'main' });
    if (args[0] === 'api' && args[1]?.includes('/issues/')) return response({ id: 2001, node_id: 'I_product', number: 903 });
    const number = args[0] === 'pr' ? Number(args[2]) : command === 'api graphql'
      ? Number(args.find(arg => arg.startsWith('number='))?.slice(7))
      : Number(args[1]?.match(/(?:pulls|runs)\/(\d+)$/)?.[1]);
    const item = provider.get(number);
    if (args[0] === 'api' && args[1]?.includes('/git/commits/')) {
      const commit = args[1].split('/').at(-1);
      const entry = [...provider.values()].find(value => value.merge === commit);
      if (!entry) throw new Error('unexpected merge commit');
      return response({ sha: entry.merge, tree: { sha: entry.tree }, parents: [{ sha: entry.selection.expected_base_sha }] });
    }
    if (!item) throw new Error(`unexpected provider args: ${args.join(' ')}`);
    const selection = item.selection;
    if (command === 'pr view') return response({ number, url: `https://github.com/example/product/pull/${number}`,
      state: 'MERGED', isDraft: false, headRefOid: selection.expected_head_sha, headRefName: `feature-${number}`,
      baseRefOid: selection.expected_base_sha, baseRefName: 'main', body: '', reviewDecision: 'APPROVED', mergeable: 'UNKNOWN' });
    if (command === 'pr checks') return response([{ name: 'Required / CI', bucket: 'pass', link: `https://github.com/example/product/actions/runs/${number}/job/1` }]);
    if (command === 'api graphql') return response({ data: { node: { id: 'R_me4c_fixture', pullRequest: {
      number, headRefOid: selection.expected_head_sha, baseRefOid: selection.expected_base_sha, reviewDecision: 'APPROVED',
      latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] },
      reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    } } } });
    if (args[1]?.includes('/actions/runs/')) return response({ path: '.github/workflows/ci.yml', event: 'pull_request',
      head_sha: selection.expected_head_sha, pull_requests: [{ number, head: { sha: selection.expected_head_sha }, base: { sha: selection.expected_base_sha } }],
      status: 'completed', conclusion: 'success' });
    if (args[1]?.includes('/pulls/')) return response({ number, merged: true, merge_commit_sha: item.merge,
      head: { sha: selection.expected_head_sha }, base: { sha: selection.expected_base_sha, ref: 'main', repo: { id: 1001, node_id: 'R_me4c_fixture' } } });
    throw new Error(`unexpected provider args: ${args.join(' ')}`);
  };
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

  // Separate feature heads from their actual squash commits in the candidate.
  const featureA = git(root, 'commit-tree', git(root, 'rev-parse', `${headA}^{tree}`), '-p', base, '-m', 'feature A before squash');
  const featureB = git(root, 'commit-tree', git(root, 'rev-parse', `${finalHead}^{tree}`), '-p', headA, '-m', 'feature B before squash');
  const selection = (pr_number: number, head: string, base: string): RequiredPullRequestV2 => ({
    provider_repository_id: '1001', repository: 'example/product', issue_id: '2001', issue_number: 903,
    pr_number, expected_head_sha: head, expected_base_sha: base,
  });
  const finalTree = git(root, 'rev-parse', `${finalHead}^{tree}`);
  const provider: Fixture['provider'] = new Map([
    [1, { selection: selection(1, featureA, base), merge: headA, tree: git(root, 'rev-parse', `${headA}^{tree}`) }],
    [2, { selection: selection(2, featureB, headA), merge: finalHead, tree: finalTree }],
  ]);
  const environment = { repo_root: root, gh_runner: providerRunner(provider) };
  const legacyPath = join(resolveGitCommonDirectory(root), 'repo-harness/coordination/v1/leases/legacy/owner.json');
  mkdirSync(join(legacyPath, '..'), { recursive: true });
  writeFileSync(legacyPath, 'historical owner bytes: preserve without reading as authority\n');
  const contract = createIntegrationContract({ repo_root: root }, {
    approved_prd_ref: 'plans/prds/product.md',
    source_spec_ref: 'docs/spec.md',
    integration_group: 'fixture',
    required_pull_requests: [provider.get(2)!.selection, provider.get(1)!.selection],
    required_constraints: ['constraint-b', 'constraint-a'],
  });
  const envelope = createIntegrationEnvelope(environment, {
    contract_sha256: contract.contract_sha256,
    base_sha: base,
    final_head_sha: finalHead,
    final_tree_sha: finalTree,
  });
  const matrix = createAcceptanceMatrix(environment, {
    contract_sha256: contract.contract_sha256,
    envelope_sha256: envelope.envelope_sha256,
    rows: [
      { constraint_id: 'constraint-b', evidence_ref: 'docs/evidence/constraint-b.json', result: 'pass' },
      { constraint_id: 'constraint-a', evidence_ref: 'docs/evidence/constraint-a.json', result: 'pass' },
    ],
    verifier_receipt_ref: 'docs/evidence/verifier.json',
  });
  return { root, base, headA, finalHead, finalTree, environment, provider, legacyPath, contract, envelope, matrix };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ME-4C integration product acceptance', () => {

  test('accepts squash integration in a main-only clone without feature head objects', () => {
    const value = fixture();
    const clone = mkdtempSync(join(tmpdir(), 'product-main-only-')); roots.push(clone);
    git(value.root, 'clone', '--no-local', '--single-branch', '--branch', 'main', value.root, clone);
    for (const item of value.provider.values()) {
      expect(() => git(clone, 'cat-file', '-e', `${item.selection.expected_head_sha}^{commit}`)).toThrow();
      expect(git(clone, 'rev-parse', `${item.merge}^{tree}`)).toBe(item.tree);
    }
    const contract = createIntegrationContract({ repo_root: clone }, {
      approved_prd_ref: 'plans/prds/product.md', source_spec_ref: 'docs/spec.md', integration_group: 'main-only',
      required_pull_requests: [...value.provider.values()].map(item => item.selection),
      required_constraints: ['constraint-a', 'constraint-b'],
    });
    const envelope = createIntegrationEnvelope({ ...value.environment, repo_root: clone }, {
      contract_sha256: contract.contract_sha256, base_sha: value.base,
      final_head_sha: value.finalHead, final_tree_sha: value.finalTree,
    });
    expect(envelope.selected_pull_requests).toHaveLength(2);
    expect(envelope.final_tree_sha).toBe(value.finalTree);
  });

  test.each(['repository-rest', 'repository-node', 'issue-rest', 'pull-repository'])('refuses a provider identity namespace mismatch: %s', scenario => {
    const value = fixture();
    const environment = { ...value.environment, gh_runner: (args: readonly string[]) => {
      const response = value.environment.gh_runner!(args);
      const body = JSON.parse(response.stdout);
      if (args[0] === 'api' && args[1] === 'repos/example/product') {
        if (scenario === 'repository-rest') body.id = 9999;
        if (scenario === 'repository-node') body.node_id = 'R_other';
      }
      if (args[1]?.includes('/issues/') && scenario === 'issue-rest') body.id = 9999;
      if (args[1]?.includes('/pulls/') && scenario === 'pull-repository') body.base.repo.id = 9999;
      return { ...response, stdout: JSON.stringify(body) };
    } };
    expectCode(() => createIntegrationEnvelope(environment, { contract_sha256: value.contract.contract_sha256,
      base_sha: value.base, final_head_sha: value.finalHead, final_tree_sha: value.finalTree }), 'publication_stale');
  });

  test('pins every integration provider command to github.com under hostile GH_HOST', () => {
    const value = fixture();
    const previous = process.env.GH_HOST;
    process.env.GH_HOST = 'foreign.example';
    const observed: string[][] = [];
    try {
      const envelope = createIntegrationEnvelope({ ...value.environment, gh_runner: args => {
        observed.push([...args]);
        if (args[0] === 'api') expect(args.slice(-2)).toEqual(['--hostname', 'github.com']);
        else if (args[0] === 'pr') expect(args.slice(-2)).toEqual(['--repo', 'github.com/example/product']);
        else if (args[0] === 'repo') expect(args[2]).toBe('github.com/example/product');
        return value.environment.gh_runner!(args);
      } }, { contract_sha256: value.contract.contract_sha256, base_sha: value.base,
        final_head_sha: value.finalHead, final_tree_sha: value.finalTree });
      expect(envelope).toEqual(value.envelope);
      for (const endpoint of ['/issues/', '/pulls/', '/git/commits/', '/actions/runs/']) {
        expect(observed.some(args => args[0] === 'api' && args[1]!.includes(endpoint))).toBe(true);
      }
      expect(observed.some(args => args[0] === 'api' && args[1] === 'graphql')).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.GH_HOST; else process.env.GH_HOST = previous;
    }
  });

  test('refuses a changed provider merge tree and retains stored evidence and historical bytes', () => {
    const value = fixture();
    value.provider.get(1)!.tree = 'f'.repeat(40);
    const legacyBefore = readFileSync(value.legacyPath, 'utf8');
    const historicalEnvelope = readIntegrationEnvelope(value.root, value.envelope.envelope_sha256);
    expectCode(() => createIntegrationEnvelope(value.environment, {
      contract_sha256: value.contract.contract_sha256, base_sha: value.base, final_head_sha: value.finalHead, final_tree_sha: value.finalTree,
    }), 'publication_stale');
    expect(readIntegrationEnvelope(value.root, value.envelope.envelope_sha256)).toEqual(historicalEnvelope);
    expect(readFileSync(value.legacyPath, 'utf8')).toBe(legacyBefore);
  });

  test('freezes two squash PRs for one issue and projects acceptance without mutating historical data', async () => {
    const value = fixture();
    expect(value.contract.required_pull_requests.map(item => item.pr_number)).toEqual([1, 2]);
    expect(new Set(value.contract.required_pull_requests.map(item => item.issue_id)).size).toBe(1);
    expect(value.envelope.selected_pull_requests.map(item => item.merge_commit_sha)).toEqual([value.headA, value.finalHead]);
    expect(readIntegrationContract(value.root, value.contract.contract_sha256)).toEqual(value.contract);
    expect(readIntegrationEnvelope(value.root, value.envelope.envelope_sha256)).toEqual(value.envelope);
    expect(readAcceptanceMatrix(value.root, value.matrix.matrix_sha256)).toEqual(value.matrix);

    const legacy = readFileSync(value.legacyPath);
    const acceptance = {
      protocol: 4,
      kind: 'repo-harness-acceptance-receipt',
      repository_root: value.root,
      campaign_sha256: DIGEST, admission_sha256: DIGEST, grant_sha256: DIGEST,
      goal_sha256: DIGEST,
      verification_file: '.ai/harness/runs/fixture.json',
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
      request_id: null, context_sha256: null, result_sha256: null, actual_harness: null, actual_role: null, actual_model: null,
      author_session_binding_sha256: null, author_actual_models: null, model_relation: null,
      actor: 'owner',
      summary: 'approved fixture',
      findings: [],
      failures: [],
      required_check_coverage: null,
      waiver_grant_sha256: DIGEST,
      issued_at: '2026-08-26T00:00:00.000Z',
    } satisfies AcceptanceReceipt;
    const receiptBytes = Buffer.from(`${JSON.stringify(acceptance, null, 2)}\n`);
    const projection = await createProductAcceptanceProjection(
      { ...value.environment, authority_home: value.root },
      {
        contract_sha256: value.contract.contract_sha256,
        envelope_sha256: value.envelope.envelope_sha256,
        matrix_sha256: value.matrix.matrix_sha256,
        review_authority: fixtureAuthority(value.root),
      },
      {
        verify_acceptance: async () => acceptance,
        read_acceptance_receipt_bytes: () => receiptBytes,
      },
    );
    expect(projection.acceptance_receipt_sha256).toBe(publicationSha256(receiptBytes));
    expect(projection.acceptance_disposition).toBe('user_waiver');
    expect(readProductAcceptanceProjection(value.root, projection.projection_sha256)).toEqual(projection);
    expect(readFileSync(value.legacyPath)).toEqual(legacy);

    // Acceptance is asynchronous: a previously valid provider selection cannot
    // authorize persistence after its exact merge evidence moves.
    const products = join(resolveGitCommonDirectory(value.root), 'repo-harness/integration/v2/products');
    const productsBefore = readdirSync(products);
    for (const state of ['unstaged', 'staged', 'untracked']) {
      const changedPath = state === 'untracked' ? 'extra-source.txt' : 'module-a.txt';
      writeFileSync(join(value.root, changedPath), 'reviewed change absent from final commit\n');
      if (state === 'staged') git(value.root, 'add', changedPath);
      await expect(createProductAcceptanceProjection(
        { ...value.environment, authority_home: value.root },
        { contract_sha256: value.contract.contract_sha256, envelope_sha256: value.envelope.envelope_sha256,
          matrix_sha256: value.matrix.matrix_sha256, review_authority: fixtureAuthority(value.root) },
        { verify_acceptance: async () => acceptance, read_acceptance_receipt_bytes: () => receiptBytes },
      )).rejects.toMatchObject({ code: 'candidate_stale' });
      expect(readdirSync(products)).toEqual(productsBefore);
      if (state === 'untracked') rmSync(join(value.root, changedPath));
      else git(value.root, 'restore', '--source=HEAD', '--staged', '--worktree', changedPath);
    }
    await expect(createProductAcceptanceProjection(
      { ...value.environment, authority_home: value.root },
      { contract_sha256: value.contract.contract_sha256, envelope_sha256: value.envelope.envelope_sha256,
        matrix_sha256: value.matrix.matrix_sha256, review_authority: fixtureAuthority(value.root) },
      { verify_acceptance: async () => { value.provider.get(1)!.tree = 'f'.repeat(40); return acceptance; },
        read_acceptance_receipt_bytes: () => receiptBytes },
    )).rejects.toMatchObject({ code: 'publication_stale' });
    expect(readdirSync(products)).toEqual(productsBefore);
    value.provider.get(1)!.tree = git(value.root, 'rev-parse', `${value.headA}^{tree}`);
    git(value.root, 'commit', '--allow-empty', '-m', 'provenance only');
    const nextEnvelope = createIntegrationEnvelope(value.environment, {
      contract_sha256: value.contract.contract_sha256, base_sha: value.base,
      final_head_sha: git(value.root, 'rev-parse', 'HEAD'), final_tree_sha: value.finalTree,
    });
    const nextMatrix = createAcceptanceMatrix(value.environment, {
      contract_sha256: value.contract.contract_sha256, envelope_sha256: nextEnvelope.envelope_sha256,
      rows: value.matrix.rows, verifier_receipt_ref: 'docs/evidence/verifier.json',
    });
    const sameContent = await createProductAcceptanceProjection(
      { ...value.environment, authority_home: value.root },
      { contract_sha256: value.contract.contract_sha256, envelope_sha256: nextEnvelope.envelope_sha256,
        matrix_sha256: nextMatrix.matrix_sha256, review_authority: fixtureAuthority(value.root) },
      { verify_acceptance: async () => acceptance, read_acceptance_receipt_bytes: () => receiptBytes },
    );
    expect(sameContent.acceptance_receipt_sha256).toBe(projection.acceptance_receipt_sha256);
  });

  test('fails closed on stale requirement, selected PR or evidence bytes', async () => {
    const requirement = fixture();
    writeFileSync(join(requirement.root, 'docs/spec.md'), '# changed\n');
    expectCode(() => createIntegrationEnvelope(requirement.environment, {
      contract_sha256: requirement.contract.contract_sha256,
      base_sha: requirement.base,
      final_head_sha: requirement.finalHead,
      final_tree_sha: requirement.finalTree,
    }), 'requirement_invalid');

    const publication = fixture();
    publication.provider.get(1)!.selection = { ...publication.provider.get(1)!.selection, expected_head_sha: 'e'.repeat(40) };
    expectCode(() => createAcceptanceMatrix(publication.environment, {
      contract_sha256: publication.contract.contract_sha256,
      envelope_sha256: publication.envelope.envelope_sha256,
      rows: publication.matrix.rows,
      verifier_receipt_ref: publication.matrix.verifier_receipt_ref,
    }), 'publication_stale');

    const evidence = fixture();
    writeFileSync(join(evidence.root, 'docs/evidence/constraint-a.json'), '{"pass":false}\n');
    await expect(createProductAcceptanceProjection(
      { ...evidence.environment, authority_home: evidence.root },
      {
        contract_sha256: evidence.contract.contract_sha256,
        envelope_sha256: evidence.envelope.envelope_sha256,
        matrix_sha256: evidence.matrix.matrix_sha256,
        review_authority: fixtureAuthority(evidence.root),
      },
      { verify_acceptance: async () => { throw new Error('must not run'); } },
    )).rejects.toMatchObject({ code: 'matrix_invalid' });

    const receiptRace = fixture();
    const acceptance = {
      protocol: 4,
      kind: 'repo-harness-acceptance-receipt',
      repository_root: receiptRace.root,
      campaign_sha256: DIGEST, admission_sha256: DIGEST, grant_sha256: DIGEST,
      goal_sha256: DIGEST,
      verification_file: '.ai/harness/runs/fixture.json',
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
      source: 'generic-review',
      request_id: 'fixture-request', context_sha256: `sha256:${'1'.repeat(64)}`, result_sha256: `sha256:${'2'.repeat(64)}`, actual_harness: 'codex', actual_role: 'deep-reasoner', actual_model: 'fixture-model',
      author_session_binding_sha256: null, author_actual_models: null, model_relation: 'unknown',
      actor: null,
      summary: 'verified before read race',
      findings: [],
      failures: [],
      required_check_coverage: null,
      waiver_grant_sha256: null,
      issued_at: '2026-08-26T00:00:00.000Z',
    } satisfies AcceptanceReceipt;
    await expect(createProductAcceptanceProjection(
      { ...receiptRace.environment, authority_home: receiptRace.root },
      {
        contract_sha256: receiptRace.contract.contract_sha256,
        envelope_sha256: receiptRace.envelope.envelope_sha256,
        matrix_sha256: receiptRace.matrix.matrix_sha256,
        review_authority: fixtureAuthority(receiptRace.root),
      },
      {
        verify_acceptance: async () => acceptance,
        read_acceptance_receipt_bytes: () => Buffer.from('{"changed":true}\n'),
      },
    )).rejects.toMatchObject({ code: 'acceptance_unavailable' });
  });

  test('the default receipt reader requires the immutable record a dependency later reads by digest', async () => {
    const value = fixture();
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'product-receipt-record-'))); roots.push(home);
    const acceptance = {
      protocol: 4,
      kind: 'repo-harness-acceptance-receipt',
      repository_root: realpathSync(value.root),
      campaign_sha256: DIGEST, admission_sha256: DIGEST, grant_sha256: DIGEST,
      goal_sha256: DIGEST,
      verification_file: '.ai/harness/runs/fixture.json',
      verification_evidence_sha256: DIGEST,
      benchmark_evidence_sha256: 'not-applicable',
      subject_sha256: SUBJECT,
      subject_scope: 'normalized-final-content',
      target_ref: 'main',
      target_revision: value.base,
      reviewed_paths: [],
      disposition: 'external_pass',
      expected_reviewer: 'Codex',
      reviewer: 'Codex',
      source: 'generic-review',
      request_id: 'fixture-request', context_sha256: `sha256:${'1'.repeat(64)}`, result_sha256: `sha256:${'2'.repeat(64)}`, actual_harness: 'codex', actual_role: 'deep-reasoner', actual_model: 'fixture-model',
      author_session_binding_sha256: null, author_actual_models: null, model_relation: 'unknown',
      actor: null,
      summary: 'recorded receipt',
      findings: [],
      failures: [],
      required_check_coverage: null,
      waiver_grant_sha256: null,
      issued_at: '2026-08-26T00:00:00.000Z',
    } satisfies AcceptanceReceipt;
    const create = () => createProductAcceptanceProjection(
      { ...value.environment, authority_home: home },
      { contract_sha256: value.contract.contract_sha256, envelope_sha256: value.envelope.envelope_sha256,
        matrix_sha256: value.matrix.matrix_sha256, review_authority: fixtureAuthority(value.root) },
      { verify_acceptance: async () => acceptance },
    );
    const latest = acceptanceReceiptPath(value.root, home, true);
    writeFileSync(latest, `${JSON.stringify(acceptance, null, 2)}\n`);
    await expect(create()).rejects.toMatchObject({ code: 'acceptance_unavailable' });

    writeAcceptanceVerificationObservation({ root: value.root, authorityHome: home, receipt: acceptance });
    const projection = await create();
    expect(projection.acceptance_receipt_sha256).toBe(publicationSha256(readFileSync(latest)));
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

  test('refuses a provider merge commit outside the final candidate even with the expected tree', () => {
    const value = fixture();
    const item = value.provider.get(1)!;
    item.merge = git(value.root, 'commit-tree', item.tree, '-p', item.selection.expected_base_sha, '-m', 'unrelated squash');
    expectCode(() => createIntegrationEnvelope(value.environment, {
      contract_sha256: value.contract.contract_sha256, base_sha: value.base,
      final_head_sha: value.finalHead, final_tree_sha: value.finalTree,
    }), 'candidate_stale');
  });

  test('rejects legacy envelope schema and an incorrect final candidate tree', () => {
    const value = fixture();
    expect(() => validateIntegrationEnvelope({ ...value.envelope, protocol: 1 })).toThrow('protocol');
    expectCode(() => createIntegrationEnvelope(value.environment, {
      contract_sha256: value.contract.contract_sha256, base_sha: value.base, final_head_sha: value.finalHead,
      final_tree_sha: 'f'.repeat(40),
    }), 'candidate_stale');
  });

  test('rejects non-canonical objects and repository symlink evidence', () => {
    const value = fixture();
    expect(() => validateIntegrationContract({ ...value.contract, extra: true })).toThrow('fields are invalid');
    symlinkSync(join(value.root, 'docs/spec.md'), join(value.root, 'docs/spec-link.md'));
    expectCode(() => createIntegrationContract({ repo_root: value.root }, {
      approved_prd_ref: 'plans/prds/product.md',
      source_spec_ref: 'docs/spec-link.md',
      integration_group: 'symlink',
      required_pull_requests: value.contract.required_pull_requests,
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
      required_pull_requests: value.contract.required_pull_requests,
      required_constraints: ['constraint-a'],
    }), 'evidence_conflict');
    expect(readdirSync(outside)).toEqual([]);
  });
});

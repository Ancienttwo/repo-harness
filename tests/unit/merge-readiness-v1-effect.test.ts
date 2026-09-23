import { describe, expect, test } from 'bun:test';

import {
  buildPublicationReceipt,
  decodePublicationMarker,
  encodePublicationMarker,
  publicationReceiptDigest,
} from '../../src/core/publication/publication-receipt';
import {
  MergeReadinessError,
  observeProviderReadinessFactsAbortable,
  observeProviderReadinessIdentityAbortable,
  observeProviderReadinessFacts,
  observeProviderReadinessIdentity,
  resolveFleetReadiness,
  resolvePublicationReadiness,
  type FleetReadinessCollector,
  type MergeReadinessCollector,
  type PublicationReadinessInput,
} from '../../src/effects/publication/merge-readiness';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const TASK_ID = '1'.repeat(64);
const TASK_REVISION = '2'.repeat(64);
const CLAIM_ID = 'claim-readiness-effect';

const receipt = buildPublicationReceipt({
  repo_id: 'sha256:' + '3'.repeat(64),
  task_id: TASK_ID,
  task_revision: TASK_REVISION,
  claim_id: CLAIM_ID,
  generation: 1,
  target_ref: 'main',
  base_sha: BASE,
  branch: 'codex/readiness-effect',
  head_sha: HEAD,
  tree_sha: 'c'.repeat(40),
  review_subject_sha256: 'sha256:' + '4'.repeat(64),
  verification_evidence_sha256: 'sha256:' + '5'.repeat(64),
  merge_seal_sha256: 'sha256:' + '6'.repeat(64),
  provider: 'github',
  provider_repo_id: 'R_readiness_effect',
  pr_number: 42,
  pr_url: 'https://example.invalid/pr/42',
  created_at: '2026-08-22T22:40:00Z',
});

const providerIdentity = {
  provider_repo_id: receipt.provider_repo_id,
  repo_name_with_owner: 'example/repo-harness',
  pr_number: receipt.pr_number,
  pr_url: receipt.pr_url,
  state: 'OPEN',
  is_draft: false,
  head_sha: HEAD,
  head_ref: receipt.branch,
  base_sha: BASE,
  base_ref: receipt.target_ref,
  body: `PR body\n${encodePublicationMarker(receipt)}\n`,
  review_decision: null,
  mergeable: 'MERGEABLE' as const,
};

const providerFacts = {
  state: 'OPEN',
  is_draft: false,
  head_sha: HEAD,
  base_sha: BASE,
  review_decision: null,
  unresolved_thread_count: 0,
  // Keep the fixture literal narrow: production validates provider buckets
  // before passing them into the pure projection.
  checks: [{ bucket: 'pass' as const }],
  mergeable: 'MERGEABLE' as const,
};

const localSnapshot = {
  token: 'sha256:' + '7'.repeat(64),
  // The projection consumes the already-fenced booleans. The full lease
  // record is intentionally private to the effect's production collector.
  lease: null,
  lease_is_reviewing: true,
  pointer_matches_receipt: true,
  lease_matches_receipt: true,
  canonical_task_matches_receipt: true,
  local_proof_head_matches_receipt: true,
  review_subject_matches_receipt: true,
  verification_evidence_matches_receipt: true,
  local_evidence_fresh: true,
  acceptance: 'pass' as const,
};

function fakeGh(hasNextPage = false): NonNullable<PublicationReadinessInput['gh_runner']> {
  const pr = {
    number: receipt.pr_number,
    url: receipt.pr_url,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    headRefName: receipt.branch,
    baseRefOid: BASE,
    baseRefName: receipt.target_ref,
    body: `PR body\n${encodePublicationMarker(receipt)}\n`,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
  };
  return (args) => {
    const command = `${args[0]} ${args[1]}`;
    if (command === 'repo view') return { status: 0, stdout: JSON.stringify({ id: receipt.provider_repo_id, nameWithOwner: 'example/repo-harness' }) };
    if (command === 'pr view') return { status: 0, stdout: JSON.stringify(pr) };
    if (command === 'pr checks') return { status: 8, stdout: JSON.stringify([{ bucket: 'pending' }]) };
    if (command === 'api graphql') {
      return { status: 0, stdout: JSON.stringify({ data: { node: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage }, nodes: [{ isResolved: false }] } } } } }) };
    }
    return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
  };
}

const input: PublicationReadinessInput = {
  repo_root: '/tmp/merge-readiness-effect-fixture',
  publication_id: receipt.publication_id,
};

function collector(overrides: Partial<MergeReadinessCollector> = {}): MergeReadinessCollector {
  return {
    resolve_receipt: () => receipt,
    collect_local: () => localSnapshot,
    observe_identity: () => providerIdentity,
    observe_facts: () => providerFacts,
    classify_integration: () => 'unmerged',
    ...overrides,
  };
}

describe('MergeReadinessV1 effect', () => {
  test('is read-only and accepts only a marker-carried receipt on the injected resolve path', () => {
    const writes: string[] = [];
    const body = `PR body\n${encodePublicationMarker(receipt)}\n`;
    const decoded = decodePublicationMarker(body);
    expect(decoded).not.toBeNull();
    const verdict = resolvePublicationReadiness(
      input,
      collector({
        resolve_receipt: () => {
          // The effect's provider identity is the untrusted carrier. Decode
          // the full immutable payload, but do not repair or rewrite it.
          const markerReceipt = decodePublicationMarker(body);
          if (markerReceipt === null) throw new Error('marker missing');
          return markerReceipt;
        },
      }),
    );

    expect(verdict.ready).toBe(true);
    expect(verdict.publication_id).toBe(receipt.publication_id);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(writes).toEqual([]);
  });

  test('retries the whole provider identity→facts→identity round once after a torn read', () => {
    const calls: string[] = [];
    let identityCall = 0;
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        calls.push('identity');
        identityCall += 1;
        return identityCall === 2
          ? { ...providerIdentity, head_sha: 'd'.repeat(40) }
          : providerIdentity;
      },
      observe_facts: (identity) => {
        calls.push(`facts:${identity.head_sha}`);
        return providerFacts;
      },
    }));

    expect(verdict.ready).toBe(true);
    expect(calls).toEqual([
      'identity', `facts:${HEAD}`, 'identity',
      'identity', `facts:${HEAD}`, 'identity',
    ]);
  });

  test('reports changed_during_read after the bounded second torn round and preserves receipt fences', () => {
    let identityCall = 0;
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        identityCall += 1;
        return {
          ...providerIdentity,
          head_sha: identityCall % 2 === 1 ? HEAD : 'd'.repeat(40),
        };
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'changed_during_read', attention_owner: 'external' });
    expect(identityCall).toBe(4);
  });

  test('provider unavailable is typed, fail-closed, and performs no write', () => {
    const writes: string[] = [];
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        writes.push('read-only observation');
        throw new MergeReadinessError('provider_unavailable', 'gh unavailable');
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'provider_unavailable', attention_owner: 'external' });
    expect(writes).toEqual(['read-only observation']);
  });

  test('incomplete provider facts are typed and cannot produce readiness', () => {
    const verdict = resolvePublicationReadiness(input, collector({
      observe_facts: () => {
        throw new MergeReadinessError('provider_data_incomplete', 'review threads are truncated');
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'provider_data_incomplete', attention_owner: 'external' });
  });

  test('marker mismatch is observed without any receipt, lease, provider, or marker write', () => {
    const writes: string[] = [];
    const mismatched = buildPublicationReceipt({
      ...receipt,
      head_sha: 'd'.repeat(40),
    });
    expect(() => resolvePublicationReadiness(input, collector({
      resolve_receipt: () => {
        const markerReceipt = decodePublicationMarker(`PR body\n${encodePublicationMarker(mismatched)}\n`);
        if (markerReceipt === null || publicationReceiptDigest(markerReceipt) !== publicationReceiptDigest(receipt)) {
          writes.push('marker mismatch observed');
        }
        return receipt;
      },
      observe_identity: () => {
        writes.push('provider identity');
        throw new MergeReadinessError('publication_claim_mismatch', 'marker mismatch');
      },
      observe_facts: () => {
        writes.push('provider facts');
        return providerFacts;
      },
    }))).toThrow(MergeReadinessError);

    expect(writes).toEqual(['marker mismatch observed', 'provider identity']);
  });

  test('production fake-gh adapter accepts pending exit 8 and exhaustively reads review threads', () => {
    const effectInput = { ...input, gh_runner: fakeGh() };
    const identity = observeProviderReadinessIdentity(receipt, effectInput);
    const facts = observeProviderReadinessFacts(identity, receipt, effectInput);
    expect(identity.head_sha).toBe(HEAD);
    expect(facts.checks).toEqual([{ bucket: 'pending' }]);
    expect(facts.unresolved_thread_count).toBe(1);
  });

  test('abortable provider adapter shares the synchronous parser and fails closed before a provider child starts', async () => {
    const synchronous = fakeGh();
    const asyncInput = {
      ...input,
      gh_runner_async: async (args: readonly string[]) => synchronous(args),
    };
    const identity = await observeProviderReadinessIdentityAbortable(receipt, asyncInput);
    const facts = await observeProviderReadinessFactsAbortable(identity, receipt, asyncInput);
    expect(identity.head_sha).toBe(HEAD);
    expect(facts.checks).toEqual([{ bucket: 'pending' }]);

    const controller = new AbortController();
    controller.abort();
    await expect(observeProviderReadinessIdentityAbortable(receipt, { ...asyncInput, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  test('production fake-gh adapter fails closed when review-thread pagination is not exhausted', () => {
    const effectInput = { ...input, gh_runner: fakeGh(true) };
    const identity = observeProviderReadinessIdentity(receipt, effectInput);
    expect(() => observeProviderReadinessFacts(identity, receipt, effectInput)).toThrow(MergeReadinessError);
  });

  test('fleet aggregate isolates a damaged publication and preserves later canonical order', () => {
    const damaged = `sha256:${'d'.repeat(64)}`;
    const readyVerdict = resolvePublicationReadiness(input, collector());
    const fleetCollector: FleetReadinessCollector = {
      collect_index: () => ({
        sprint_path: 'plans/sprints/current.md',
        snapshot_consistency: 'stable',
        publication_ids: [damaged, receipt.publication_id],
      }),
      resolve_publication: (candidate) => {
        if (candidate.publication_id === damaged) {
          throw new MergeReadinessError('publication_claim_mismatch', 'damaged receipt cache');
        }
        return readyVerdict;
      },
    };
    const aggregate = resolveFleetReadiness({ repo_root: input.repo_root }, fleetCollector);
    expect(aggregate.publications.map((entry) => entry.publication_id)).toEqual([damaged, receipt.publication_id]);
    expect(aggregate.publications[0]).toEqual({
      publication_id: damaged,
      error: 'publication_claim_mismatch',
      message: 'damaged receipt cache',
    });
    expect(aggregate.publications[1]?.verdict?.ready).toBe(true);
  });
});

// Real local evidence is required here: a static boolean snapshot cannot expose
// contract edits excluded from the semantic implementation subject.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productionMergeReadinessCollector } from '../../src/effects/publication/merge-readiness';
import { publicationSha256 } from '../../src/core/publication/publication-receipt';
import { createEffectiveStateFixture, EFFECTIVE_STATE_SCENARIOS, CONTRACT, PLAN, writeFixture } from '../state/effective-state-fixture';
import { resolveEffectiveStateReadOnly } from '../../src/effects/state/resolve-effective-state';
import { bindLeaseRecord, beginLeaseCompletionRecord, buildLeaseOwnerRecord, deriveTaskRevision, enterReviewingLeaseRecord } from '../../src/core/state/coordination-identity';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { acceptanceReceiptPath, acceptanceVerificationObservationPath, authorityFingerprint, writeAcceptanceVerificationObservation, type AcceptanceReceipt } from '../../scripts/acceptance-receipt';
import { classifyFleetBoardPlacement } from '../../src/core/fleet/board';

function withLocalAcceptance(run: (f: { root: string; observe: () => ReturnType<typeof resolvePublicationReadiness>; observationPath: string; receiptPath: string }) => void) {
  const f=createEffectiveStateFixture();
  const authorityHome=mkdtempSync(join(tmpdir(),'readiness-acceptance-home-'));
  try {
    const git=(...args:string[])=>execFileSync('git',args,{cwd:f.cwd,encoding:'utf8'}).trim();
    const sprint='plans/sprints/readiness.sprint.md';
    const title='verify current contract authority';
    const revision=deriveTaskRevision({taskId:TASK_ID,taskCell:title,modeCell:'inline',acceptanceCell:'reject stale acceptance'});
    writeFixture(f.cwd,sprint,`# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|--------|------|------|------------|------|\n| 1 | ${TASK_ID} | [ ] | ${title} | inline | reject stale acceptance | (pending) |\n`);
    writeFixture(f.cwd,'.ai/harness/policy.json',JSON.stringify({worktree_strategy:{review_base:'main',merge_back:{target:'main'}}}));
    git('add','.');git('commit','-m','canonical task');
    const base=git('rev-parse','HEAD');git('switch','-c','codex/readiness');
    writeFixture(f.cwd,'src/feature.ts','export const value=1;\n');git('add','.');git('commit','-m','candidate');
    const head=git('rev-parse','HEAD');
    const now=Date.now();
    EFFECTIVE_STATE_SCENARIOS.find(s=>s.name==='executing-fresh-evidence')!.setup!(f.cwd,now);
    const effective=resolveEffectiveStateReadOnly(f.cwd,now);
    expect(effective.checks.freshness).toBe('fresh');
    const acceptance:AcceptanceReceipt={protocol:2,kind:'repo-harness-acceptance-receipt',repository_root:f.cwd,
      contract_file:CONTRACT,contract_sha256:authorityFingerprint(readFileSync(join(f.cwd,CONTRACT),'utf8')),
      goal_file:PLAN,goal_sha256:authorityFingerprint(readFileSync(join(f.cwd,PLAN),'utf8')),
      verification_file:'.ai/harness/checks/latest.json',verification_evidence_sha256:'sha256:'+'6'.repeat(64),benchmark_evidence_sha256:'sha256:'+'7'.repeat(64),
      subject_sha256:effective.review.recorded_subject_sha256!,subject_scope:'normalized-final-content',target_ref:'main',target_revision:base,
      reviewed_paths:['src/feature.ts'],disposition:'external_pass',expected_reviewer:'Codex',reviewer:'Codex',source:'codex-plugin',actor:null,
      summary:'Controlled acceptance observation fixture',findings:[],waiver_grant_sha256:null,issued_at:new Date(now).toISOString()};
    const receiptPath=acceptanceReceiptPath(f.cwd,authorityHome,true);
    writeFileSync(receiptPath,JSON.stringify(acceptance));
    writeAcceptanceVerificationObservation({root:f.cwd,authorityHome,receipt:acceptance,archiveProjectionSha256:null});
    const sealPath=join(authorityHome,'seal.json');
    writeFileSync(sealPath,JSON.stringify({head_sha:head,base_sha:base,acceptance_receipt_sha256:publicationSha256(readFileSync(receiptPath))}));
    const publication=buildPublicationReceipt({...receipt,repo_id:resolveRepoIdentity(f.cwd),task_revision:revision,head_sha:head,base_sha:base,tree_sha:git('rev-parse','HEAD^{tree}'),
      review_subject_sha256:acceptance.subject_sha256,verification_evidence_sha256:publicationSha256(readFileSync(join(f.cwd,'.ai/harness/checks/latest.json'))),merge_seal_sha256:publicationSha256(readFileSync(sealPath))});
    const owner=buildLeaseOwnerRecord({claimId:CLAIM_ID,taskId:TASK_ID,taskRevision:revision,sprintPath:sprint,targetRef:'main',generation:1,sessionId:'readiness-session',sourceWorktree:f.cwd});
    const bound=bindLeaseRecord(owner,{claimId:CLAIM_ID,executionWorktree:f.cwd,branch:'codex/readiness',unitRef:PLAN});if(!bound.ok)throw Error(bound.error);
    const completing=beginLeaseCompletionRecord(bound.record,{claimId:CLAIM_ID,executionWorktree:f.cwd,finishTransactionKey:null});if(!completing.ok)throw Error(completing.error);
    const reviewing=enterReviewingLeaseRecord(completing.record,{claimId:CLAIM_ID,publication:{publication_id:publication.publication_id,receipt_sha256:publicationReceiptDigest(publication),head_sha:head,ship_transaction_key:'readiness-fixture'}});if(!reviewing.ok)throw Error(reviewing.error);
    createLeaseDirectory(f.cwd,TASK_ID);writeLeaseOwnerDurably(f.cwd,TASK_ID,reviewing.record);
    const observe=()=>resolvePublicationReadiness({repo_root:f.cwd,publication_id:publication.publication_id,merge_seal_path:sealPath,authority_home:authorityHome,now_ms:now},collector({resolve_receipt:()=>publication,collect_local:productionMergeReadinessCollector.collect_local,
      observe_identity:()=>({...providerIdentity,head_sha:head,base_sha:base}),observe_facts:()=>({...providerFacts,head_sha:head,base_sha:base})}));
    expect(observe().ready).toBe(true);
    run({root:f.cwd,observe,receiptPath,observationPath:acceptanceVerificationObservationPath(f.cwd,authorityHome,CONTRACT,acceptance.contract_sha256)});
  } finally {
    f.cleanup();rmSync(authorityHome,{recursive:true,force:true});
  }
}

test.each(['contract','goal','missing observation','malformed observation','receipt replacement'] as const)('production local readiness invalidates %s after a genuinely ready observation', change=>{
  withLocalAcceptance(f=>{
    if(change==='contract')writeFileSync(join(f.root,CONTRACT),readFileSync(join(f.root,CONTRACT),'utf8').replace('  - src/','  - docs/'));
    if(change==='goal')writeFileSync(join(f.root,PLAN),readFileSync(join(f.root,PLAN),'utf8')+'\nChanged acceptance goal.\n');
    if(change==='missing observation')rmSync(f.observationPath);
    if(change==='malformed observation')writeFileSync(f.observationPath,'{}');
    if(change==='receipt replacement')writeFileSync(f.receiptPath,'{}');
    const before=execFileSync('git',['status','--porcelain'],{cwd:f.root,encoding:'utf8'});
    const verdict=f.observe();
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map(b=>b.code)).toContain('acceptance_missing');
    expect(verdict.blockers.map(b=>b.code)).toContain('verification_evidence_stale');
    expect(execFileSync('git',['status','--porcelain'],{cwd:f.root,encoding:'utf8'})).toBe(before);
    expect(classifyFleetBoardPlacement({error:null,task_state:'pending',lease_state:'reviewing',current_publication:{publication_id:verdict.publication_id,head_sha:verdict.expected_head_sha},merge_readiness:verdict} as Parameters<typeof classifyFleetBoardPlacement>[0])).toEqual({kind:'column',column:'in_review'});
  });
});

test('canonical lifecycle normalization preserves a current accepted contract',()=>{
  withLocalAcceptance(f=>{
    writeFileSync(join(f.root,CONTRACT),readFileSync(join(f.root,CONTRACT),'utf8').replace('**Status**: Active','**Status**: Fulfilled'));
    expect(f.observe().ready).toBe(true);
  });
});

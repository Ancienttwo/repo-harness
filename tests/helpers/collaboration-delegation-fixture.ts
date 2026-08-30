/**
 * A disposable repository that carries both planes C4 joins: the three
 * authenticated Module Engineers `createCollaborationFixture()` builds, and a
 * working read-only delegation stack on top of them.
 *
 * The `codex` executable is a shell script rather than the real CLI, and that is
 * a deliberate boundary rather than a shortcut. Everything this row asserts —
 * the exclusive directory lock, the four-state run machine, the process receipt,
 * the persisted stdout blob, the seat count — is Host machinery exercised
 * through real processes, real files and real locks. The one thing the shim
 * replaces is the model call, which is the only part C4 makes no claim about.
 * This is the same boundary `tests/unit/me2a-me3b-readonly-delegation.test.ts`
 * already draws for the delegation plane.
 */
import { execFileSync } from 'child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  buildDelegationEnvelope,
  buildDelegationExecutionPacket,
  type CodexReadOnlyCapabilityReceiptV1,
  type DelegationEnvelopeV1,
  type DelegationExecutionPacketV1,
  type LogicalRoleProfileV1,
} from '../../src/core/engineers/delegation';
import {
  CLAIM_ACTOR_RECEIPT_KIND,
  ENGINEER_PRINCIPAL_PROTOCOL,
  validateClaimActorReceipt,
  workEnvelopeSha256,
  type ClaimActorEnvelope,
  type ClaimActorReceiptV1,
} from '../../src/core/engineers/principal-claim';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import {
  loadLogicalReadOnlyRoleProfile,
  readLogicalRoleInstructions,
} from '../../src/effects/engineers/delegated-run-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  COLLABORATION_ENGINEER,
  createCollaborationFixture,
  type CollaborationFixture,
} from './collaboration-store-fixture';

export const CANARY_CLAIM_ID = '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a';
export const CANARY_TASK_ID = 'a'.repeat(64);
export const CANARY_TASK_REVISION = 'b'.repeat(64);

export interface CollaborationDelegationFixture extends CollaborationFixture {
  readonly engineer_id: string;
  readonly role_profile: LogicalRoleProfileV1;
  readonly capability: CodexReadOnlyCapabilityReceiptV1;
  readonly claim_actor_receipt: ClaimActorReceiptV1;
  readonly fake_bin: string;
}

/**
 * What one delegated participant needs. Each participant carries its own
 * `delegation_id`, so four requests against one parent claim are four distinct
 * runs competing for seats rather than one run retried four times.
 */
export interface DelegationParticipant {
  readonly delegation_id: string;
  readonly idempotency_key: string;
  readonly packet: DelegationExecutionPacketV1;
  readonly envelope: DelegationEnvelopeV1;
}

/**
 * The shim. `sandbox` reproduces the exact denial pair the capability canary
 * requires; `exec` writes whatever the fixture put in `.fake-stdout` so a test
 * can control the Worker's output byte for byte without controlling the path it
 * travels — the bytes still go through the real process runner, the real
 * evidence blob store and the real process receipt.
 */
function writeCodexShim(repoRoot: string): string {
  const fakeBin = join(repoRoot, 'fake-bin');
  mkdirSync(fakeBin, { recursive: true });
  const fakeCodex = join(fakeBin, 'codex');
  writeFileSync(fakeCodex, `#!/bin/sh
if [ "$1" = "--version" ]; then printf "codex-cli 0.149.0\\n"; exit 0; fi
if [ "$1" = "sandbox" ]; then
  previous=""
  last=""
  for argument in "$@"; do previous="$last"; last="$argument"; done
  printf '%s\\n' "touch: \${previous}: Operation not permitted" >&2
  printf '%s\\n' "touch: \${last}: Operation not permitted" >&2
  exit 1
fi
if [ "$1" = "exec" ]; then
  if [ -f "$PWD/.fake-exec-fail" ]; then exit 7; fi
  if [ -f "$PWD/.fake-stdout" ]; then
    ${JSON.stringify(process.execPath)} -e 'const fs = require("fs"); const text = fs.readFileSync(process.argv[1], "utf8"); console.log(JSON.stringify({type:"thread.started",thread_id:"00000000-0000-4000-8000-000000000001"})); console.log(JSON.stringify({type:"turn.started"})); console.log(JSON.stringify({type:"item.completed",item:{id:"item_0",type:"agent_message",text}})); console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:100,cached_input_tokens:10,output_tokens:20}}));' "$PWD/.fake-stdout"
  fi
  exit 0
fi
exit 64
`);
  chmodSync(fakeCodex, 0o700);
  return fakeBin;
}

/**
 * Record the read-only capability receipt through the CLI, because
 * `findCodexOnHostPath()` resolves the executable from `process.env.PATH` and
 * this suite must not mutate the parent process's PATH.
 */
function recordCapabilityThroughCli(
  repoRoot: string,
  fakeBin: string,
  logicalRole: string,
  observedAt: string,
): CodexReadOnlyCapabilityReceiptV1 {
  writeFileSync(
    join(repoRoot, '.capability-input.json'),
    `${JSON.stringify({ logical_role: logicalRole, observed_at: observedAt })}\n`,
  );
  return JSON.parse(execFileSync(process.execPath, [
    join(process.cwd(), 'src/cli/index.ts'),
    'delegation',
    'capability',
    '--input',
    '.capability-input.json',
    '--format',
    'json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
  })) as CodexReadOnlyCapabilityReceiptV1;
}

function claimActorReceipt(repoRoot: string, engineerId: string): ClaimActorReceiptV1 {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const envelope: ClaimActorEnvelope = {
    repo_id: repoHarnessRepoIdFor(repoRoot),
    task_id: CANARY_TASK_ID,
    task_revision: CANARY_TASK_REVISION,
    claim_id: CANARY_CLAIM_ID,
    generation: 1,
    worktree_path: repoRoot,
    branch: 'main',
    unit_ref: 'tasks/contracts/canary.contract.md',
    authorization_revision: 1,
  };
  const basis = {
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kind: CLAIM_ACTOR_RECEIPT_KIND,
    task_id: envelope.task_id,
    task_revision: envelope.task_revision,
    claim_id: envelope.claim_id,
    lease_generation: envelope.generation,
    engineer_id: engineerId,
    // The fixture binds every Engineer at generation 1 with a fixed id shape.
    binding_id: '11111111-1111-4111-8111-111111111111',
    binding_generation: 1,
    repository_id: envelope.repo_id,
    authorization_revision: envelope.authorization_revision,
    work_envelope_sha256: workEnvelopeSha256(envelope),
    worktree_path: envelope.worktree_path,
    branch: envelope.branch,
    unit_ref: envelope.unit_ref,
    engineer_contract_revision: profile.engineer_contract_revision,
    session_id: null,
    bound_at: '2026-08-30T00:00:00.000Z',
  };
  return validateClaimActorReceipt({
    ...basis,
    receipt_sha256: canonicalMessageDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function createCollaborationDelegationFixture(
  sourceRoot: string,
  roots: string[],
  mode: string | null = 'shadow',
): CollaborationDelegationFixture {
  const base = createCollaborationFixture(sourceRoot, roots, mode, 'repo-harness-c4');
  cpSync(join(sourceRoot, '.codex'), join(base.repoRoot, '.codex'), { recursive: true });
  execFileSync('git', ['add', '.codex'], { cwd: base.repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync('git', ['commit', '-qm', 'codex agents'], { cwd: base.repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  const fakeBin = writeCodexShim(base.repoRoot);
  const roleProfile = loadLogicalReadOnlyRoleProfile(base.repoRoot, 'explorer');
  const capability = recordCapabilityThroughCli(base.repoRoot, fakeBin, 'explorer', '2026-08-30T00:00:01Z');
  return Object.freeze({
    ...base,
    engineer_id: COLLABORATION_ENGINEER,
    role_profile: roleProfile,
    capability,
    claim_actor_receipt: claimActorReceipt(base.repoRoot, COLLABORATION_ENGINEER),
    fake_bin: fakeBin,
  });
}

/**
 * The subset `delegationParticipant()` and `liveParentFor()` need. It is
 * narrower than the fixture on purpose: the multi-process canary rebuilds
 * participants inside child processes from a JSON file, and a child has no
 * fixture object to hand.
 */
export interface DelegationSubject {
  readonly repoRoot: string;
  readonly role_profile: LogicalRoleProfileV1;
  readonly capability: CodexReadOnlyCapabilityReceiptV1;
  readonly claim_actor_receipt: ClaimActorReceiptV1;
}

/**
 * Build one participant's packet and envelope against the subject's parent claim.
 *
 * `goal` is an override rather than a fixed string because C6 dispatches a goal
 * that was composed from a collaboration context packet, and the fence compares
 * the binding against the goal the envelope actually carries. A fixture that
 * could only produce its own goal would make that comparison untestable.
 */
export function delegationParticipant(
  fixture: DelegationSubject,
  index: number,
  goal?: string,
  allowedReadPaths: readonly string[] = ['README.md'],
): DelegationParticipant {
  const delegationId = `${`${index + 1}`.repeat(8)}-2222-4222-8222-222222222222`;
  const packet = buildDelegationExecutionPacket({
    delegation_id: delegationId,
    logical_role: fixture.role_profile.logical_role,
    role_profile_sha256: fixture.role_profile.role_profile_sha256,
    model: fixture.role_profile.model,
    role_instructions: readLogicalRoleInstructions(fixture.repoRoot, fixture.role_profile),
    goal: goal ?? `Participant ${index} reads and reports.`,
    allowed_read_paths: allowedReadPaths,
    max_turns: 1,
    max_depth: 0,
    return_contract: 'WorkerResultV1',
  });
  const receipt = fixture.claim_actor_receipt;
  const envelope = buildDelegationEnvelope({
    delegation_id: delegationId,
    parent: {
      task_id: receipt.task_id,
      task_revision: receipt.task_revision,
      claim_id: receipt.claim_id,
      lease_generation: receipt.lease_generation,
      work_envelope_sha256: receipt.work_envelope_sha256,
    },
    engineer: {
      engineer_id: receipt.engineer_id,
      binding_id: receipt.binding_id,
      binding_generation: receipt.binding_generation,
      claim_actor_receipt_sha256: receipt.receipt_sha256,
    },
    logical_role: fixture.role_profile.logical_role,
    role_profile_sha256: fixture.role_profile.role_profile_sha256,
    runtime_capability_sha256: fixture.capability.capability_sha256,
    execution_packet_sha256: packet.packet_sha256,
    mode: 'read_only',
    goal: packet.goal,
    allowed_read_paths: packet.allowed_read_paths,
    budget: { max_turns: 1, max_depth: 0 },
    return_contract: 'WorkerResultV1',
  });
  return Object.freeze({
    delegation_id: delegationId,
    idempotency_key: `participant-${index}`,
    packet,
    envelope,
  });
}

/**
 * The live parent authority `admitReadOnlyDelegation()` revalidates. It is a
 * stub for the same reason ME-2A stubs it: the Lease and Claim lifecycle is the
 * delivery plane's, and C4 asserts nothing about it beyond reading it.
 */
export function liveParentFor(fixture: DelegationSubject) {
  const receipt = fixture.claim_actor_receipt;
  return () => ({
    receipt_sha256: receipt.receipt_sha256,
    task_id: receipt.task_id,
    task_revision: receipt.task_revision,
    claim_id: receipt.claim_id,
    lease_generation: receipt.lease_generation,
    work_envelope_sha256: receipt.work_envelope_sha256,
    engineer_id: receipt.engineer_id,
    binding_id: receipt.binding_id,
    binding_generation: receipt.binding_generation,
  }) as never;
}

/** The exact stdout the shim will emit for the next `codex exec`. */
export function setWorkerStdout(repoRoot: string, stdout: string): void {
  writeFileSync(join(repoRoot, '.fake-stdout'), stdout);
}

export function readWorkerStdout(repoRoot: string): string {
  return readFileSync(join(repoRoot, '.fake-stdout'), 'utf8');
}

/**
 * Make the next `codex exec` exit non-zero. The switch is a file the shim reads
 * rather than an edit to the shim itself: the capability receipt pins the
 * executable's bytes, so rewriting it would be refused as a changed executable
 * before the run could fail on its own terms.
 */
export function failNextWorkerRun(repoRoot: string): void {
  writeFileSync(join(repoRoot, '.fake-exec-fail'), '');
}

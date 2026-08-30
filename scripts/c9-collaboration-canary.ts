#!/usr/bin/env bun

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'fs';
import { dirname, join, relative } from 'path';

import { COLLABORATION_PROTOCOL } from '../src/core/collaboration/common';
import type { CoordinationSignalV1 } from '../src/core/collaboration/signal';
import { adoptWorkStateHandoff } from '../src/effects/collaboration/adoption-store';
import { engineerPrincipalAuthorization } from '../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../src/effects/collaboration/admission-bridge';
import {
  deliverCollaborationContext,
  recordCollaborationRunContextBinding,
  type CollaborationContextDeliveryV1,
} from '../src/effects/collaboration/context-delivery';
import { collectCollaborationContribution } from '../src/effects/collaboration/contribution-collector';
import { listWorkStateHandoffs } from '../src/effects/collaboration/handoff-store';
import {
  parseCodexExecStructuredOutput,
  type CodexExecUsageV1,
} from '../src/effects/collaboration/provider-output-adapter';
import { publishCoordinationSignal } from '../src/effects/collaboration/signal-store';
import { collectCollaborativeWorkExchange } from '../src/effects/collaboration/work-exchange';
import {
  readCodexProcessReceipt,
  readDelegatedRunEvidenceBlob,
  readDelegatedRunStatus,
  recordCodexReadOnlyCapability,
} from '../src/effects/engineers/delegated-run-store';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  type CollaborationDelegationFixture,
  type DelegationSubject,
} from '../tests/helpers/collaboration-delegation-fixture';
import { removeFixtureRoots } from '../tests/helpers/collaboration-store-fixture';

export const C9_CANARY_SCHEMA = 'repo-harness.c9-collaboration-canary/v1' as const;
const SOURCE_ROOT = realpathSync(join(import.meta.dir, '..'));
const DISPATCH_RUNNER = join(import.meta.dir, 'c9-collaboration-dispatch-runner.ts');
const CAPABILITY = 'capability.runtime-harness.collaboration';
const CAPABILITY_REVISION = `sha256:${'7'.repeat(64)}`;
const OBSERVED_AT = '2026-08-30T10:45:00.000Z';

export const C9_USEFULNESS_RUBRIC = Object.freeze({
  version: 'c9-usefulness/v1',
  frozen_before_live_run: true,
  rules: Object.freeze([
    'the contribution passes the frozen collaboration schema',
    'the signal body contains an allowed repo-relative file:line citation whose line exists',
    'the signal body names both Observation: and Implication:',
    'the normalized title is unique within its arm',
  ]),
  persistent_seat_gate: Object.freeze({
    repeated_case_count: 3,
    treatment_must_preserve_authority: true,
    treatment_must_outproduce_baseline: true,
    handoff_restart_must_exceed_baseline_first_useful_in_every_case: true,
  }),
});

export interface C9CanaryCase {
  readonly id: string;
  readonly thread_key: string;
  readonly paths: readonly string[];
  readonly questions: readonly string[];
}

export const C9_CASES: readonly C9CanaryCase[] = Object.freeze([
  Object.freeze({
    id: 'provider-output-boundary',
    thread_key: 'c9/provider-output-boundary',
    paths: Object.freeze([
      'src/core/engineers/delegation.ts',
      'src/effects/engineers/delegated-run-store.ts',
      'src/effects/collaboration/provider-output-adapter.ts',
      'src/effects/collaboration/contribution-collector.ts',
      'tests/effects/collaboration-contribution-collector.test.ts',
    ]),
    questions: Object.freeze([
      'Trace the exact Codex argv, process receipt and persisted stdout wire.',
      'Trace the persisted stdout through the provider adapter into a contribution commit.',
      'Identify which test boundary proves the real provider wire rather than a shim-only shape.',
    ]),
  }),
  Object.freeze({
    id: 'execution-context-egress',
    thread_key: 'c9/execution-context-egress',
    paths: Object.freeze([
      'src/effects/collaboration/agent-surface.ts',
      'src/cli/commands/collaboration.ts',
      'src/cli/mcp/collaboration-tools.ts',
      'src/core/operator/collaboration-snapshot.ts',
      'src/effects/operator/collaboration.ts',
      'tests/cli/collaboration.test.ts',
      'tests/cli/mcp-collaboration-tools.test.ts',
      'tests/cli/operator-serve.test.ts',
    ]),
    questions: Object.freeze([
      'Trace handoff publish acknowledgement fields and identify its proof boundary.',
      'Trace CLI and MCP handoff reads and identify where unverified execution context is withheld.',
      'Trace the Operator browser projection and identify its exact egress shape.',
    ]),
  }),
  Object.freeze({
    id: 'delivery-authority-boundary',
    thread_key: 'c9/delivery-authority-boundary',
    paths: Object.freeze([
      'src/effects/collaboration/signal-store.ts',
      'src/effects/collaboration/handoff-store.ts',
      'src/effects/collaboration/adoption-store.ts',
      'src/effects/collaboration/context-delivery.ts',
      'tests/unit/collaboration-authority-baseline.test.ts',
      'docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md',
    ]),
    questions: Object.freeze([
      'Trace every collaboration mutation to its own store and name its destination authority.',
      'Trace handoff adoption and prove it does not acquire a Claim or move a Lease generation.',
      'Trace context delivery and prove the binding gates dispatch without changing Task or Publication bytes.',
    ]),
  }),
]);

interface ArmFixture {
  readonly value: CollaborationDelegationFixture;
  readonly subject: DelegationSubject;
  readonly clean_status: string;
}

interface RunEvidence {
  readonly dispatch_id: string;
  readonly completed_after_ms: number;
  readonly usage: CodexExecUsageV1;
  readonly signals: readonly CoordinationSignalV1[];
  readonly handoff_id: string | null;
}

export interface C9DispatchCompletion {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number;
}

export interface C9ArmMetrics {
  readonly wall_ms: number;
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly output_tokens: number;
  readonly useful_findings: number;
  readonly useful_findings_per_10k_tokens: number;
  readonly time_to_first_useful_ms: number | null;
  readonly time_to_first_adopted_ms: number | null;
  readonly duplicate_dead_end_rate: number;
  readonly signal_reuse_count: number;
  readonly handoff_adoption_count: number;
  readonly handoff_restart_ms: number | null;
  readonly never_read_signal_rate: number;
  readonly context_injections: readonly { readonly bytes: number; readonly estimated_tokens: number }[];
  readonly writer_max: number;
  readonly authority_before_sha256: string;
  readonly authority_after_sha256: string;
  readonly authority_unchanged: boolean;
  readonly worktree_unchanged: boolean;
}

export interface C9CaseReport {
  readonly id: string;
  readonly baseline: C9ArmMetrics;
  readonly treatment: C9ArmMetrics;
}

export interface C9Decision {
  readonly c9_a: 'pass' | 'fail';
  readonly c9_b: 'pass' | 'fail';
  readonly persistent_engineer_seat_v2: 'go' | 'no-go';
  readonly delegated_round_bottleneck_proven: boolean;
  readonly phase_5_review_marketplace: 'inactive';
  readonly phase_6_guarded_merge: 'inactive';
  readonly reasons: readonly string[];
}

export interface C9CanaryReport {
  readonly schema_version: typeof C9_CANARY_SCHEMA;
  readonly rubric: typeof C9_USEFULNESS_RUBRIC;
  readonly subject_head: string;
  readonly cases: readonly C9CaseReport[];
  readonly decision: C9Decision;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

function hashDirectory(root: string, paths: readonly string[]): string {
  const hash = createHash('sha256');
  const walk = (absolute: string, label: string): void => {
    if (!existsSync(absolute)) {
      hash.update(`missing\0${label}\0`);
      return;
    }
    const stat = statSync(absolute);
    if (stat.isFile()) {
      hash.update(`file\0${label}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
      return;
    }
    hash.update(`dir\0${label}\0`);
    for (const entry of readdirSync(absolute).sort()) walk(join(absolute, entry), `${label}/${entry}`);
  };
  for (const path of paths) walk(join(root, path), path);
  return `sha256:${hash.digest('hex')}`;
}

function authorityDigest(repoRoot: string): string {
  const common = resolveGitCommonDirectory(repoRoot);
  return hashDirectory(common, [
    'repo-harness/coordination/v1',
    'repo-harness/engineers/v1/claim-actors',
    'repo-harness/engineers/v1/task-freezes',
    'repo-harness/publications/v1',
    'repo-harness/integration/v1',
  ]);
}

function prepareFixture(canaryCase: C9CanaryCase, roots: string[], arm: string): ArmFixture {
  const value = createCollaborationDelegationFixture(SOURCE_ROOT, roots, 'active');
  rmSync(join(value.repoRoot, 'fake-bin'), { recursive: true, force: true });
  rmSync(join(value.repoRoot, '.capability-input.json'), { force: true });
  for (const path of canaryCase.paths) {
    const destination = join(value.repoRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(SOURCE_ROOT, path), destination);
  }
  git(value.repoRoot, ['add', '-A']);
  git(value.repoRoot, ['commit', '-qm', `c9 ${canaryCase.id} ${arm} fixture`]);
  const capability = recordCodexReadOnlyCapability(value.repoRoot, {
    logical_role: 'explorer',
    observed_at: OBSERVED_AT,
  });
  return Object.freeze({
    value,
    subject: Object.freeze({
      repoRoot: value.repoRoot,
      role_profile: value.role_profile,
      capability,
      claim_actor_receipt: value.claim_actor_receipt,
    }),
    // Provider and hook runtime evidence is intentionally ignored by Git. The
    // canary gates tracked source bytes, while authority stores are hashed
    // separately and explicitly below.
    clean_status: git(value.repoRoot, ['status', '--porcelain=v1', '--untracked-files=no']),
  });
}

function contributionGoal(
  canaryCase: C9CanaryCase,
  questions: readonly string[],
  sourceSignalIds: readonly string[],
  includeHandoff: boolean,
): string {
  const signalTemplate = (question: string) => ({
    title: `A unique concise finding for: ${question}`,
    body: 'Observation: cite one allowed repo-relative file:line and state the concrete condition. Implication: state why the condition matters to the requested trace.',
    labels: ['C9', 'USEFUL-CANDIDATE'],
    scope_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: CAPABILITY_REVISION }],
    artifact_refs: [],
    reply_to_signal_id: null,
    source_signal_ids: sourceSignalIds,
  });
  const handoff = includeHandoff ? {
    trigger: 'phase_complete',
    goal: `Continue the ${canaryCase.id} trace without repeating completed reads.`,
    completed: ['read the assigned files and recorded one concrete finding'],
    key_findings: ['copy the exact signal finding into this list'],
    attempted_paths: [{ description: 'trace the assigned call path', outcome: 'record the concrete terminal boundary', evidence_refs: [] }],
    dead_ends: ['record one path that did not own the decision, or state that no dead end was encountered'],
    open_hypotheses: ['name one bounded point the successor should verify'],
    next_actions: ['verify the cited line and continue from the recorded boundary'],
    source_signal_ids: sourceSignalIds,
    execution_context: { kind: 'none' },
  } : null;
  const template = {
    protocol: COLLABORATION_PROTOCOL,
    kind: 'repo-harness-collaboration-contribution-draft',
    thread_key: canaryCase.thread_key,
    signals: questions.map(signalTemplate),
    handoff,
    built_on_signal_ids: sourceSignalIds,
  };
  return [
    'Perform this read-only repository trace. Use only the allowed paths. Do not edit files.',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    'Return one signal per question. Replace every title/body/key finding/hypothesis placeholder with concrete source-grounded text.',
    'Every signal body must contain the literal prefixes Observation: and Implication: and one allowed repo-relative file:line citation.',
    'Preserve every key, enum, null, array length and non-placeholder value in the template exactly.',
    'In particular, every artifact_refs and evidence_refs array must remain exactly []; do not invent refs, digests, ids or authors.',
    'Only replace human-language strings in title, body, completed, key_findings, attempted_paths description/outcome, dead_ends, open_hypotheses and next_actions.',
    'Your final response must contain exactly the following marker block, with valid JSON and no Markdown fence:',
    '[RepoHarnessCollaborationContributionV1]',
    JSON.stringify(template, null, 2),
    '[/RepoHarnessCollaborationContributionV1]',
  ].join('\n');
}

function admit(
  fixture: ArmFixture,
  index: number,
  goal: string,
  allowedPaths: readonly string[],
): string {
  const participant = delegationParticipant(fixture.subject, index, goal, [...allowedPaths].sort());
  const result = admitCollaborationDelegation({
    repo_root: fixture.value.repoRoot,
    round_index: 0,
    decided_at: OBSERVED_AT,
    idempotency_key: participant.idempotency_key,
    observed_at: OBSERVED_AT,
    delegation: {
      repo_root: fixture.value.repoRoot,
      envelope: participant.envelope,
      role_profile: fixture.subject.role_profile,
      capability: fixture.subject.capability,
      execution_packet: participant.packet,
      work_envelope: {} as never,
      claim_actor_receipt: fixture.subject.claim_actor_receipt,
      decided_at: OBSERVED_AT,
      validate_parent: liveParentFor(fixture.subject),
    },
  });
  if (result.run === null) throw new Error(`C9 admission refused: ${result.admission.rejection_reason}`);
  return result.run.intent.dispatch_id;
}

export async function collectConcurrentDispatchCompletionTimes(
  completions: readonly Promise<C9DispatchCompletion>[],
  startedAt: number,
  now: () => number = () => performance.now(),
): Promise<readonly number[]> {
  const completed = await Promise.all(completions.map(async (completion) => {
    const { stdout, stderr, exit_code: exitCode } = await completion;
    if (exitCode !== 0) throw new Error(`C9 dispatch failed (${exitCode}): ${stderr || stdout}`);
    return now() - startedAt;
  }));
  return Object.freeze(completed);
}

async function dispatchMany(repoRoot: string, dispatchIds: readonly string[], startedAt: number): Promise<readonly number[]> {
  const children = dispatchIds.map((dispatchId, index) => Bun.spawn({
    cmd: [process.execPath, DISPATCH_RUNNER, repoRoot, dispatchId, `2026-08-30T10:46:0${index}.000Z`],
    cwd: SOURCE_ROOT,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  }));
  const completions = children.map(async (child): Promise<C9DispatchCompletion> => {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return Object.freeze({ stdout, stderr, exit_code: exitCode });
  });
  return collectConcurrentDispatchCompletionTimes(completions, startedAt);
}

function evidenceForRun(
  fixture: ArmFixture,
  dispatchId: string,
  completedAfterMs: number,
): RunEvidence {
  const status = readDelegatedRunStatus(fixture.value.repoRoot, dispatchId);
  const receiptSha = status.current.process_receipt_sha256;
  if (status.current.state !== 'completed' || receiptSha === null) throw new Error(`C9 run did not complete: ${dispatchId}`);
  const receipt = readCodexProcessReceipt(fixture.value.repoRoot, receiptSha);
  const stdout = readDelegatedRunEvidenceBlob(fixture.value.repoRoot, receipt.stdout_ref, receipt.stdout_sha256);
  const structured = parseCodexExecStructuredOutput(stdout.toString('utf8'));
  const collected = collectCollaborationContribution({
    repo_root: fixture.value.repoRoot,
    dispatch_id: dispatchId,
    untrusted_claims: ['C9 live read-only trace'],
    env: fixture.value.env,
  });
  const exchange = collectCollaborativeWorkExchange({
    repo_root: fixture.value.repoRoot,
    read_execution_offers: () => [],
  });
  const signalIds = new Set(collected.commit.signal_refs.map((ref) => ref.signal_id));
  return Object.freeze({
    dispatch_id: dispatchId,
    completed_after_ms: completedAfterMs,
    usage: structured.usage,
    signals: Object.freeze(exchange.signals.filter((signal) => signalIds.has(signal.signal_id))),
    handoff_id: collected.commit.handoff_ref?.handoff_id ?? null,
  });
}

function useful(signal: CoordinationSignalV1, canaryCase: C9CanaryCase): boolean {
  const citation = /((?:src|tests|scripts|docs)\/[A-Za-z0-9_./-]+):(\d+)/u.exec(signal.body);
  if (!citation || !signal.body.includes('Observation:') || !signal.body.includes('Implication:')) return false;
  if (!canaryCase.paths.includes(citation[1]!)) return false;
  const line = Number(citation[2]);
  return Number.isInteger(line)
    && line > 0
    && line <= readFileSync(join(SOURCE_ROOT, citation[1]!), 'utf8').split('\n').length;
}

function aggregateUsage(runs: readonly RunEvidence[]): CodexExecUsageV1 {
  return Object.freeze(runs.reduce((sum, run) => ({
    input_tokens: sum.input_tokens + run.usage.input_tokens,
    cached_input_tokens: sum.cached_input_tokens + run.usage.cached_input_tokens,
    output_tokens: sum.output_tokens + run.usage.output_tokens,
  }), { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 }));
}

function metric(
  fixture: ArmFixture,
  canaryCase: C9CanaryCase,
  runs: readonly RunEvidence[],
  wallMs: number,
  authorityBefore: string,
  deliveries: readonly CollaborationContextDeliveryV1[],
  adoption: { readonly elapsed: number; readonly count: number } | null,
): C9ArmMetrics {
  const usage = aggregateUsage(runs);
  const signals = runs.flatMap((run) => run.signals);
  const titles = new Set<string>();
  const usefulSignals = signals.filter((signal) => {
    const title = signal.title.toLowerCase().replace(/\s+/gu, ' ').trim();
    if (titles.has(title)) return false;
    titles.add(title);
    return useful(signal, canaryCase);
  });
  const sourceIds = new Set(signals.flatMap((signal) => signal.source_signal_ids));
  const selectedIds = new Set(deliveries.flatMap((delivery) => delivery.packet.signals.map((ref) => ref.signal_id)));
  const readIds = new Set([...sourceIds, ...selectedIds]);
  const neverRead = signals.filter((signal) => !readIds.has(signal.signal_id)).length;
  const deadEnds = listWorkStateHandoffs(fixture.value.repoRoot).flatMap((handoff) => handoff.dead_ends);
  const duplicateDeadEnds = deadEnds.length - new Set(deadEnds.map((value) => value.toLowerCase().trim())).size;
  const authorityAfter = authorityDigest(fixture.value.repoRoot);
  const totalTokens = usage.input_tokens + usage.output_tokens;
  return Object.freeze({
    wall_ms: Math.round(wallMs),
    input_tokens: usage.input_tokens,
    cached_input_tokens: usage.cached_input_tokens,
    output_tokens: usage.output_tokens,
    useful_findings: usefulSignals.length,
    useful_findings_per_10k_tokens: totalTokens === 0 ? 0 : Number((usefulSignals.length * 10_000 / totalTokens).toFixed(4)),
    time_to_first_useful_ms: usefulSignals.length === 0 ? null : Math.round(Math.min(...runs.filter((run) => run.signals.some((signal) => usefulSignals.includes(signal))).map((run) => run.completed_after_ms))),
    time_to_first_adopted_ms: adoption === null ? null : Math.round(adoption.elapsed),
    duplicate_dead_end_rate: deadEnds.length === 0 ? 0 : Number((duplicateDeadEnds / deadEnds.length).toFixed(4)),
    signal_reuse_count: signals.reduce((sum, signal) => sum + signal.source_signal_ids.length, 0),
    handoff_adoption_count: adoption?.count ?? 0,
    handoff_restart_ms: adoption === null ? null : Math.round(adoption.elapsed - Math.max(...runs.map((run) => run.completed_after_ms))),
    never_read_signal_rate: signals.length === 0 ? 0 : Number((neverRead / signals.length).toFixed(4)),
    context_injections: Object.freeze(deliveries.map((delivery) => Object.freeze({
      bytes: Buffer.byteLength(delivery.rendered_context, 'utf8'),
      estimated_tokens: Math.ceil(Buffer.byteLength(delivery.rendered_context, 'utf8') / 4),
    }))),
    writer_max: 1,
    authority_before_sha256: authorityBefore,
    authority_after_sha256: authorityAfter,
    authority_unchanged: authorityBefore === authorityAfter,
    worktree_unchanged: fixture.clean_status === git(fixture.value.repoRoot, ['status', '--porcelain=v1', '--untracked-files=no']),
  });
}

async function runBaseline(canaryCase: C9CanaryCase, roots: string[]): Promise<C9ArmMetrics> {
  const fixture = prepareFixture(canaryCase, roots, 'baseline');
  const authorityBefore = authorityDigest(fixture.value.repoRoot);
  const goal = contributionGoal(canaryCase, canaryCase.questions, [], false);
  const dispatchId = admit(fixture, 0, goal, canaryCase.paths);
  const started = performance.now();
  const completed = await dispatchMany(fixture.value.repoRoot, [dispatchId], started);
  const run = evidenceForRun(fixture, dispatchId, completed[0]!);
  return metric(fixture, canaryCase, [run], performance.now() - started, authorityBefore, [], null);
}

async function runTreatment(canaryCase: C9CanaryCase, roots: string[]): Promise<C9ArmMetrics> {
  const fixture = prepareFixture(canaryCase, roots, 'treatment');
  const authorityBefore = authorityDigest(fixture.value.repoRoot);
  const kickoff = publishCoordinationSignal({
    repo_root: fixture.value.repoRoot,
    authorization: engineerPrincipalAuthorization(fixture.value.actors[0]!.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: `c9-${canaryCase.id}-kickoff`,
    thread_key: canaryCase.thread_key,
    reply_to_signal_id: null,
    scope_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: CAPABILITY_REVISION }],
    labels: ['C9', 'KICKOFF'],
    title: `Frozen C9 question: ${canaryCase.id}`,
    body: canaryCase.questions.join(' '),
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: OBSERVED_AT },
    env: fixture.value.env,
  }).signal;
  const initial = collectCollaborativeWorkExchange({ repo_root: fixture.value.repoRoot, read_execution_offers: () => [] });
  const deliveries: CollaborationContextDeliveryV1[] = [];
  const dispatchIds = canaryCase.questions.map((question, index) => {
    const baseGoal = contributionGoal(canaryCase, [question], [kickoff.signal_id], index === 0);
    const delivery = deliverCollaborationContext({
      repo_root: fixture.value.repoRoot,
      collection: initial,
      subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: CAPABILITY_REVISION }],
      base_goal: baseGoal,
    });
    deliveries.push(delivery);
    const dispatchId = admit(fixture, index, delivery.composed_goal, canaryCase.paths);
    recordCollaborationRunContextBinding({ repo_root: fixture.value.repoRoot, dispatch_id: dispatchId, delivery });
    return dispatchId;
  });
  const started = performance.now();
  const completed = await dispatchMany(fixture.value.repoRoot, dispatchIds, started);
  const runs = dispatchIds.map((dispatchId, index) => evidenceForRun(fixture, dispatchId, completed[index]!));
  const handoffId = runs.map((run) => run.handoff_id).find((value): value is string => value !== null);
  if (!handoffId) throw new Error(`C9 treatment ${canaryCase.id} produced no handoff`);
  const handoff = listWorkStateHandoffs(fixture.value.repoRoot).find((candidate) => candidate.handoff_id === handoffId)!;
  const successorCollection = collectCollaborativeWorkExchange({ repo_root: fixture.value.repoRoot, read_execution_offers: () => [] });
  const successorDelivery = deliverCollaborationContext({
    repo_root: fixture.value.repoRoot,
    collection: successorCollection,
    subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: CAPABILITY_REVISION }],
    base_goal: `Adopt and continue ${canaryCase.id}.`,
    handoff: { handoff_id: handoff.handoff_id, handoff_sha256: handoff.handoff_sha256 },
  });
  deliveries.push(successorDelivery);
  adoptWorkStateHandoff({
    repo_root: fixture.value.repoRoot,
    authorization: engineerPrincipalAuthorization(fixture.value.actors[1]!.authorization_id),
    handoff_id: handoff.handoff_id,
    context_packet_sha256: successorDelivery.packet.packet_sha256,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T10:47:00.000Z' },
    env: fixture.value.env,
  });
  return metric(
    fixture,
    canaryCase,
    runs,
    performance.now() - started,
    authorityBefore,
    deliveries,
    { elapsed: performance.now() - started, count: 1 },
  );
}

export function classifyC9Decision(cases: readonly C9CaseReport[]): C9Decision {
  const first = cases[0]?.treatment;
  const c9A = first !== undefined
    && first.signal_reuse_count > 0
    && first.handoff_adoption_count > 0
    && first.writer_max <= 1
    && first.authority_unchanged
    && first.worktree_unchanged;
  const c9B = cases.length >= C9_USEFULNESS_RUBRIC.persistent_seat_gate.repeated_case_count
    && cases.every((entry) => entry.treatment.authority_unchanged
      && entry.treatment.worktree_unchanged
      && entry.treatment.writer_max <= 1
      && entry.treatment.signal_reuse_count > 0
      && entry.treatment.handoff_adoption_count > 0);
  const bottleneck = c9B && cases.every((entry) => entry.treatment.useful_findings > entry.baseline.useful_findings
    && entry.treatment.handoff_restart_ms !== null
    && entry.baseline.time_to_first_useful_ms !== null
    && entry.treatment.handoff_restart_ms > entry.baseline.time_to_first_useful_ms);
  const reasons = [
    c9A ? 'C9-A safety and reuse gates passed.' : 'C9-A safety or reuse gate failed.',
    c9B ? 'Three isolated matched cases satisfy the C9-B evidence count.' : 'C9-B repeated evidence is incomplete.',
    bottleneck
      ? 'All repeated cases prove delegated handoff restart dominates the baseline first-useful latency.'
      : 'Repeated cases do not prove delegated startup/handoff is the bottleneck; persistent seats remain unjustified.',
    'The canary grants no independent review or merge authority, so Phase 5 and Phase 6 remain inactive.',
  ];
  return Object.freeze({
    c9_a: c9A ? 'pass' : 'fail',
    c9_b: c9B ? 'pass' : 'fail',
    persistent_engineer_seat_v2: bottleneck ? 'go' : 'no-go',
    delegated_round_bottleneck_proven: bottleneck,
    phase_5_review_marketplace: 'inactive',
    phase_6_guarded_merge: 'inactive',
    reasons: Object.freeze(reasons),
  });
}

export async function runC9LiveCanary(): Promise<C9CanaryReport> {
  const roots: string[] = [];
  try {
    const cases: C9CaseReport[] = [];
    for (const canaryCase of C9_CASES) {
      const baseline = await runBaseline(canaryCase, roots);
      const treatment = await runTreatment(canaryCase, roots);
      cases.push(Object.freeze({ id: canaryCase.id, baseline, treatment }));
    }
    return Object.freeze({
      schema_version: C9_CANARY_SCHEMA,
      rubric: C9_USEFULNESS_RUBRIC,
      subject_head: git(SOURCE_ROOT, ['rev-parse', 'HEAD']),
      cases: Object.freeze(cases),
      decision: classifyC9Decision(cases),
    });
  } finally {
    removeFixtureRoots(roots);
  }
}

if (import.meta.main) {
  if (process.argv.length !== 3 || process.argv[2] !== '--live') {
    console.error('usage: bun scripts/c9-collaboration-canary.ts --live');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(await runC9LiveCanary(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}

/**
 * `CollaborationRunContextBindingV1` — which collaboration context entered which
 * delegated run, and the fence that refuses a run without one.
 *
 * Sprint row C6. The existing Delegation protocol is untouched: no version bump,
 * and `DelegatedRunIntentV1.context_packet_sha256` keeps the meaning C0's D2
 * froze for it, which is the `DelegationExecutionPacketV1.packet_sha256` and
 * nothing else. Two assertions in `src/effects/engineers/delegated-run-store.ts`
 * depend on that reading, and re-pointing the field at a collaboration packet
 * would have broken both while looking like a rename. Collaboration provenance
 * therefore travels on a separate additive record.
 *
 * The binding is a dispatch fence, not audit metadata. The parent PRD's Authority
 * Map calls it advisory, meaning it grants no execution right — it does not
 * confer a Claim, a Lease, or admission, and the delegation plane decides those
 * exactly as it did before. That is a statement about authority, not about
 * necessity: injected context that no record accounts for is the failure this row
 * exists to prevent, so a collaboration-mode run whose binding is missing, or
 * whose binding does not describe the goal actually being dispatched, is refused.
 *
 * Composition is reversible on purpose. The rendering is appended as a suffix in
 * its own untrusted wrapper, and the wrapper's markers are forbidden in the base
 * goal, so a composed goal can be split back into exactly the two pieces it was
 * made from. The fence then checks the pieces against the binding rather than
 * trusting a digest of something it never saw: without the split, a binding could
 * name a rendering that no longer bears any relation to the goal in the envelope,
 * and every digest in the record would still agree with itself.
 */
import {
  COLLABORATION_CONTEXT_END,
  COLLABORATION_CONTEXT_START,
} from './context-packet';
import {
  COLLABORATION_PROTOCOL,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationInvalid,
  collaborationSha256,
  deriveCollaborationRecordId,
  isCollaborationRecord,
} from './common';
import { assertMessageExactKeys, assertMessageSha256, messageRequiredString } from '../messages/mechanics';

export const COLLABORATION_RUN_CONTEXT_BINDING_KIND =
  'repo-harness-collaboration-run-context-binding' as const;

/** The record id domain; one dispatch has at most one binding. */
export const COLLABORATION_RUN_CONTEXT_BINDING_DOMAIN = 'collaboration-run-context-binding' as const;

export interface CollaborationRunContextBindingV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof COLLABORATION_RUN_CONTEXT_BINDING_KIND;
  readonly dispatch_id: string;
  readonly delegated_run_intent_sha256: string;
  readonly execution_packet_sha256: string;
  readonly collaboration_context_packet_sha256: string;
  readonly rendered_context_sha256: string;
  readonly base_goal_sha256: string;
  readonly composed_goal_sha256: string;
  readonly binding_sha256: string;
}

const BINDING_FIELDS = [
  'protocol',
  'kind',
  'dispatch_id',
  'delegated_run_intent_sha256',
  'execution_packet_sha256',
  'collaboration_context_packet_sha256',
  'rendered_context_sha256',
  'base_goal_sha256',
  'composed_goal_sha256',
  'binding_sha256',
] as const;

const DIGEST_FIELDS = [
  'dispatch_id',
  'delegated_run_intent_sha256',
  'execution_packet_sha256',
  'collaboration_context_packet_sha256',
  'rendered_context_sha256',
  'base_goal_sha256',
  'composed_goal_sha256',
] as const;

export type CollaborationRunContextBindingInput =
  Omit<CollaborationRunContextBindingV1, 'protocol' | 'kind' | 'binding_sha256'>;

/**
 * Where a binding is filed. Derived from the dispatch alone, so a second binding
 * for the same run collides with the first in a create-once store rather than
 * accumulating alongside it — one run cannot end up with two records disagreeing
 * about what it was given.
 */
export function collaborationRunContextBindingId(dispatchId: string): string {
  return deriveCollaborationRecordId(COLLABORATION_RUN_CONTEXT_BINDING_DOMAIN, [dispatchId]);
}

function digestField(value: unknown, field: string): string {
  const text = messageRequiredString(value, `run context binding ${field}`, collaborationInvalid);
  assertMessageSha256(text, `run context binding ${field}`, collaborationInvalid);
  return text;
}

function bindingBasis(input: CollaborationRunContextBindingInput): Record<string, unknown> {
  const basis: Record<string, unknown> = {
    protocol: COLLABORATION_PROTOCOL,
    kind: COLLABORATION_RUN_CONTEXT_BINDING_KIND,
  };
  for (const field of DIGEST_FIELDS) basis[field] = digestField(input[field], field);
  return basis;
}

export function buildCollaborationRunContextBinding(
  input: CollaborationRunContextBindingInput,
): CollaborationRunContextBindingV1 {
  const basis = bindingBasis(input);
  return Object.freeze({
    ...basis,
    binding_sha256: canonicalCollaborationDigest(basis),
  }) as unknown as CollaborationRunContextBindingV1;
}

export function validateCollaborationRunContextBinding(value: unknown): CollaborationRunContextBindingV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('run context binding must be an object');
  assertMessageExactKeys(value, BINDING_FIELDS, 'run context binding', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== COLLABORATION_RUN_CONTEXT_BINDING_KIND) {
    collaborationInvalid('run context binding protocol or kind is invalid');
  }
  const binding = buildCollaborationRunContextBinding(
    value as unknown as CollaborationRunContextBindingInput,
  );
  if (value.binding_sha256 !== binding.binding_sha256) {
    collaborationInvalid('run context binding binding_sha256 is stale');
  }
  return binding;
}

export function canonicalCollaborationRunContextBindingBytes(
  binding: CollaborationRunContextBindingV1,
): string {
  return canonicalCollaborationBytes(
    validateCollaborationRunContextBinding(binding) as unknown as Readonly<Record<string, unknown>>,
  );
}

/**
 * Append the untrusted rendering to a base goal.
 *
 * A base goal that already carries either marker is refused rather than escaped.
 * Escaping would mean the text a Worker reads is not the text the author wrote,
 * and accepting it unescaped would make the split below ambiguous — the fence
 * could no longer tell which block was the injected one. Refusing is the only
 * option that keeps both the rendering and the split honest.
 */
export function composeCollaborationGoal(baseGoal: string, renderedContext: string): string {
  if (typeof baseGoal !== 'string' || baseGoal.length === 0) {
    collaborationInvalid('base goal must be a non-empty string');
  }
  if (baseGoal.includes(COLLABORATION_CONTEXT_START) || baseGoal.includes(COLLABORATION_CONTEXT_END)) {
    collaborationInvalid('base goal already carries the untrusted coordination markers');
  }
  if (!renderedContext.startsWith(`${COLLABORATION_CONTEXT_START}\n`)
    || !renderedContext.endsWith(`\n${COLLABORATION_CONTEXT_END}`)) {
    collaborationInvalid('rendered context is not a canonical untrusted coordination block');
  }
  return `${baseGoal}\n${renderedContext}`;
}

export interface DecomposedCollaborationGoalV1 {
  readonly base_goal: string;
  readonly rendered_context: string;
}

/**
 * Split a composed goal back into the base goal and the rendering.
 *
 * The boundary is the last line that is exactly the start marker. A rendered
 * signal line is one JSON object on one line, so a body quoting the marker
 * appears inside that line and never as a line of its own; combined with the
 * base goal being forbidden from carrying the marker at all, exactly one such
 * line exists and the split is total.
 */
export function decomposeCollaborationGoal(composedGoal: string): DecomposedCollaborationGoalV1 {
  if (typeof composedGoal !== 'string') collaborationInvalid('composed goal must be a string');
  if (!composedGoal.endsWith(`\n${COLLABORATION_CONTEXT_END}`)) {
    collaborationInvalid('composed goal does not end with the untrusted coordination block');
  }
  const boundary = composedGoal.lastIndexOf(`\n${COLLABORATION_CONTEXT_START}\n`);
  if (boundary <= 0) collaborationInvalid('composed goal carries no untrusted coordination block');
  return Object.freeze({
    base_goal: composedGoal.slice(0, boundary),
    rendered_context: composedGoal.slice(boundary + 1),
  });
}

/** Why a dispatch fence refused. Each value names one checked fact, never a summary. */
export const COLLABORATION_BINDING_REFUSALS = [
  'binding_missing',
  'binding_dispatch_mismatch',
  'binding_intent_stale',
  'binding_execution_packet_stale',
  'binding_context_packet_unresolvable',
  'binding_rendered_context_stale',
  'binding_goal_not_composed',
  'binding_base_goal_stale',
  'binding_composed_goal_stale',
] as const;

export type CollaborationBindingRefusal = (typeof COLLABORATION_BINDING_REFUSALS)[number];

export interface CollaborationBindingFenceSubjectV1 {
  readonly dispatch_id: string;
  readonly delegated_run_intent_sha256: string;
  readonly execution_packet_sha256: string;
  /** The goal in the execution packet that is about to be dispatched. */
  readonly composed_goal: string;
  /** The rendering digest carried by the collaboration packet the binding names. */
  readonly context_packet_rendered_context_sha256: string | null;
}

/**
 * The whole fence, as a pure comparison.
 *
 * It lives in core so the same rule runs when a binding is recorded and again
 * before the run is dispatched. Two copies of a check that must agree is how a
 * fence becomes advisory in practice: the recording side keeps passing while the
 * dispatch side drifts, and nothing reports the disagreement.
 *
 * Returns the first refusal in the order the facts depend on each other, or
 * `null` when every one holds.
 */
export function checkCollaborationRunContextBinding(
  binding: CollaborationRunContextBindingV1 | null,
  subject: CollaborationBindingFenceSubjectV1,
): CollaborationBindingRefusal | null {
  if (binding === null) return 'binding_missing';
  const checked = validateCollaborationRunContextBinding(binding);
  if (checked.dispatch_id !== subject.dispatch_id) return 'binding_dispatch_mismatch';
  if (checked.delegated_run_intent_sha256 !== subject.delegated_run_intent_sha256) return 'binding_intent_stale';
  if (checked.execution_packet_sha256 !== subject.execution_packet_sha256) return 'binding_execution_packet_stale';
  // A binding naming a packet the store cannot produce is a dangling reference.
  // It reads as provenance and evidences nothing, which is worse than no binding
  // at all, so it is refused rather than accepted on the strength of its shape.
  if (subject.context_packet_rendered_context_sha256 === null) return 'binding_context_packet_unresolvable';
  if (checked.rendered_context_sha256 !== subject.context_packet_rendered_context_sha256) {
    return 'binding_rendered_context_stale';
  }
  if (collaborationSha256(subject.composed_goal) !== checked.composed_goal_sha256) {
    return 'binding_composed_goal_stale';
  }
  let parts: DecomposedCollaborationGoalV1;
  try {
    parts = decomposeCollaborationGoal(subject.composed_goal);
  } catch {
    return 'binding_goal_not_composed';
  }
  if (collaborationSha256(parts.rendered_context) !== checked.rendered_context_sha256) {
    return 'binding_rendered_context_stale';
  }
  if (collaborationSha256(parts.base_goal) !== checked.base_goal_sha256) return 'binding_base_goal_stale';
  return null;
}

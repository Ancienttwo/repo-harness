/**
 * Untrusted document content for an existing TaskMessage body or TaskResult.value.
 * This module has no transport, storage, authentication, or execution authority.
 * A successful check proves shape, bytes, or reference equality only.
 */
import { TASK_MESSAGE_BODY_MAX_BYTES } from '../fleet/task-message';
import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageSha256,
  assertMessageUuid,
  canonicalMessageBytes,
  messageRequiredString,
  messageSha256,
} from './mechanics';

export const DOCUMENT_HANDOFF_KIND = 'repo-harness-document-handoff' as const;
export const DOCUMENT_HANDOFF_PROTOCOL = 1 as const;
export const DOCUMENT_HANDOFF_MAX_BYTES = TASK_MESSAGE_BODY_MAX_BYTES;

export interface DocumentActorClaimV1 {
  readonly kind: 'human' | 'bot' | 'coding_agent';
  readonly id: string;
}

export interface DocumentArtifactRefV1 {
  readonly ref: string;
  readonly sha256: string;
  readonly byte_length: number;
  readonly media_type: string;
}

export interface DocumentHandoffBindingV1 {
  /** Exact task-agent authority identity, not a Fleet display ID or repository title. */
  readonly repository_id: string;
  /** Task-agent labels are arbitrary. Never derive a Fleet task ID from this field. */
  readonly task: string;
  readonly request_id: string;
  readonly round: number;
  readonly context_sha256: string;
  /** Optional explicit mapping. A future adapter must resolve it at the authority. */
  readonly fleet: {
    readonly task_id: string;
    readonly task_revision: string;
    readonly claim_id: string;
    readonly generation: number;
  } | null;
  readonly subject: { readonly head_sha: string; readonly base_sha: string } | null;
}

export type DocumentHandoffIntentV1 =
  | { readonly kind: 'request'; readonly action: string; readonly acceptance: readonly string[]; readonly stop_conditions: readonly string[] }
  | { readonly kind: 'question'; readonly question_id: string }
  | { readonly kind: 'reply'; readonly question_id: string }
  | { readonly kind: 'result'; readonly outcome: 'completed' | 'needs_input' | 'blocked' | 'failed' | 'cancelled'; readonly side_effects: 'none' | 'reported' | 'unknown'; readonly questions: readonly string[] }
  | { readonly kind: 'review'; readonly verdict: 'pass' | 'changes_requested' | 'inconclusive'; readonly findings: readonly string[] }
  | { readonly kind: 'approval_record'; readonly source_ref: string; readonly action: string };

export interface DocumentHandoffPayloadV1 {
  readonly kind: typeof DOCUMENT_HANDOFF_KIND;
  readonly protocol: typeof DOCUMENT_HANDOFF_PROTOCOL;
  readonly message_id: string;
  readonly binding: DocumentHandoffBindingV1;
  readonly in_reply_to: string | null;
  /** Claims are data. Neither role nor ID proves who wrote the payload. */
  readonly sender: DocumentActorClaimV1;
  readonly recipient: DocumentActorClaimV1;
  readonly intent: DocumentHandoffIntentV1;
  readonly body:
    | { readonly kind: 'inline'; readonly markdown: string; readonly sha256: string }
    | { readonly kind: 'artifact'; readonly artifact: DocumentArtifactRefV1 };
  readonly artifacts: readonly DocumentArtifactRefV1[];
}

export class DocumentHandoffError extends Error {
  readonly code = 'document_handoff_invalid';
  constructor(message: string) { super(message); this.name = 'DocumentHandoffError'; }
}

function invalid(message: string): never { throw new DocumentHandoffError(message); }

function record(value: unknown, fields: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object`);
  const result = value as Record<string, unknown>;
  assertMessageExactKeys(result, fields, field, invalid);
  return result;
}

function text(value: unknown, field: string, maximum = 1024): string {
  const result = messageRequiredString(value, field, invalid);
  assertMessageBoundedUtf8(result, field, maximum, invalid);
  if (!result.trim()) invalid(`${field} must not be blank`);
  return result;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field);
  if (/[\u0000-\u001f\u007f]/u.test(result)) invalid(`${field} contains control characters`);
  return result;
}

function uuid(value: unknown, field: string): string {
  const result = text(value, field);
  assertMessageUuid(result, field, invalid);
  return result;
}

function digest(value: unknown, field: string): string {
  const result = text(value, field);
  assertMessageSha256(result, field, invalid);
  return result;
}

function integer(value: unknown, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(`${field} is invalid`);
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) invalid(`${field} is invalid`);
  return value as T[number];
}

function entries(value: unknown, field: string, minimum = 0): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 16) invalid(`${field} count is invalid`);
  return Object.freeze(Array.from(value, item => text(item, field)));
}

function actor(value: unknown): DocumentActorClaimV1 {
  const input = record(value, ['kind', 'id'], 'actor claim');
  return Object.freeze({ kind: choice(input.kind, ['human', 'bot', 'coding_agent'], 'actor kind'), id: identifier(input.id, 'actor id') });
}

function artifact(value: unknown): DocumentArtifactRefV1 {
  const input = record(value, ['ref', 'sha256', 'byte_length', 'media_type'], 'artifact');
  return Object.freeze({
    ref: identifier(input.ref, 'artifact ref'),
    sha256: digest(input.sha256, 'artifact sha256'),
    byte_length: integer(input.byte_length, 'artifact byte_length', 0),
    media_type: identifier(input.media_type, 'artifact media_type'),
  });
}

function hex(value: unknown, field: string, pattern: RegExp): string {
  const result = text(value, field);
  if (!pattern.test(result)) invalid(`${field} is invalid`);
  return result;
}

function binding(value: unknown): DocumentHandoffBindingV1 {
  const input = record(value, ['repository_id', 'task', 'request_id', 'round', 'context_sha256', 'fleet', 'subject'], 'binding');
  let fleet: DocumentHandoffBindingV1['fleet'] = null;
  if (input.fleet !== null) {
    const mapping = record(input.fleet, ['task_id', 'task_revision', 'claim_id', 'generation'], 'fleet mapping');
    fleet = Object.freeze({
      task_id: hex(mapping.task_id, 'fleet task_id', /^[0-9a-f]{64}$/u),
      task_revision: hex(mapping.task_revision, 'fleet task_revision', /^[0-9a-f]{64}$/u),
      claim_id: uuid(mapping.claim_id, 'fleet claim_id'),
      generation: integer(mapping.generation, 'fleet generation', 1),
    });
  }
  let subject: DocumentHandoffBindingV1['subject'] = null;
  if (input.subject !== null) {
    const candidate = record(input.subject, ['head_sha', 'base_sha'], 'subject');
    subject = Object.freeze({
      head_sha: hex(candidate.head_sha, 'head_sha', /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
      base_sha: hex(candidate.base_sha, 'base_sha', /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
    });
  }
  return Object.freeze({
    repository_id: identifier(input.repository_id, 'repository_id'),
    task: text(input.task, 'task'),
    request_id: uuid(input.request_id, 'request_id'),
    round: integer(input.round, 'round', 1),
    context_sha256: digest(input.context_sha256, 'context_sha256'),
    fleet, subject,
  });
}

function intent(value: unknown): DocumentHandoffIntentV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('intent must be an object');
  const kind = (value as Record<string, unknown>).kind;
  switch (kind) {
    case 'request': {
      const input = record(value, ['kind', 'action', 'acceptance', 'stop_conditions'], 'request');
      return Object.freeze({ kind, action: text(input.action, 'action'), acceptance: entries(input.acceptance, 'acceptance', 1), stop_conditions: entries(input.stop_conditions, 'stop_conditions', 1) });
    }
    case 'question':
    case 'reply': {
      const input = record(value, ['kind', 'question_id'], kind);
      return Object.freeze({ kind, question_id: identifier(input.question_id, 'question_id') });
    }
    case 'result': {
      const input = record(value, ['kind', 'outcome', 'side_effects', 'questions'], 'result');
      const outcome = choice(input.outcome, ['completed', 'needs_input', 'blocked', 'failed', 'cancelled'], 'outcome');
      const questions = entries(input.questions, 'questions', outcome === 'needs_input' ? 1 : 0);
      if (outcome === 'completed' && questions.length) invalid('completed result has unresolved questions');
      return Object.freeze({ kind, outcome, side_effects: choice(input.side_effects, ['none', 'reported', 'unknown'], 'side_effects'), questions });
    }
    case 'review': {
      const input = record(value, ['kind', 'verdict', 'findings'], 'review');
      return Object.freeze({ kind, verdict: choice(input.verdict, ['pass', 'changes_requested', 'inconclusive'], 'verdict'), findings: entries(input.findings, 'findings') });
    }
    case 'approval_record': {
      const input = record(value, ['kind', 'source_ref', 'action'], 'approval_record');
      return Object.freeze({ kind, source_ref: identifier(input.source_ref, 'source_ref'), action: text(input.action, 'action') });
    }
    default: return invalid('intent kind is invalid');
  }
}

function body(value: unknown): DocumentHandoffPayloadV1['body'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('body must be an object');
  if ((value as Record<string, unknown>).kind === 'inline') {
    const input = record(value, ['kind', 'markdown', 'sha256'], 'inline body');
    const markdown = text(input.markdown, 'markdown', DOCUMENT_HANDOFF_MAX_BYTES);
    const sha256 = digest(input.sha256, 'body sha256');
    if (messageSha256(markdown) !== sha256) invalid('body sha256 is stale');
    return Object.freeze({ kind: 'inline', markdown, sha256 });
  }
  const input = record(value, ['kind', 'artifact'], 'artifact body');
  if (input.kind !== 'artifact') invalid('body kind is invalid');
  const reference = artifact(input.artifact);
  if (reference.media_type !== 'text/markdown') invalid('body artifact must be text/markdown');
  return Object.freeze({ kind: 'artifact', artifact: reference });
}

/** Reject unknown fields. Never read files, follow links, or interpret Markdown. */
export function validateDocumentHandoffPayload(value: unknown): DocumentHandoffPayloadV1 {
  const input = record(value, ['kind', 'protocol', 'message_id', 'binding', 'in_reply_to', 'sender', 'recipient', 'intent', 'body', 'artifacts'], 'document handoff');
  if (input.kind !== DOCUMENT_HANDOFF_KIND || input.protocol !== DOCUMENT_HANDOFF_PROTOCOL) invalid('document handoff kind or protocol is invalid');
  if (!Array.isArray(input.artifacts) || input.artifacts.length > 8) invalid('artifacts count is invalid');
  const result: DocumentHandoffPayloadV1 = Object.freeze({
    kind: DOCUMENT_HANDOFF_KIND,
    protocol: DOCUMENT_HANDOFF_PROTOCOL,
    message_id: uuid(input.message_id, 'message_id'),
    binding: binding(input.binding),
    in_reply_to: input.in_reply_to === null ? null : uuid(input.in_reply_to, 'in_reply_to'),
    sender: actor(input.sender), recipient: actor(input.recipient),
    intent: intent(input.intent), body: body(input.body),
    artifacts: Object.freeze(Array.from(input.artifacts, artifact)),
  });
  if (result.in_reply_to === result.message_id) invalid('message cannot reply to itself');
  if (result.intent.kind !== 'request' && result.in_reply_to === null) invalid('response requires in_reply_to');
  if (result.intent.kind === 'review' && result.binding.subject === null) invalid('review requires head/base subject');
  assertMessageBoundedUtf8(canonicalMessageBytes({ ...result }), 'document handoff', DOCUMENT_HANDOFF_MAX_BYTES, invalid);
  return result;
}

/** The JSON fits the existing 8 KiB TaskMessage body. Larger Markdown uses a ref. */
export function canonicalDocumentHandoffBytes(value: DocumentHandoffPayloadV1): string {
  return canonicalMessageBytes({ ...validateDocumentHandoffPayload(value) });
}

export type DocumentHandoffExpectationV1 = Pick<DocumentHandoffPayloadV1,
  'message_id' | 'binding' | 'in_reply_to' | 'sender' | 'recipient'>;

/**
 * Compare caller-supplied references. The caller must obtain them from the real
 * authority. Matching is not admission, deduplication, freshness, or permission.
 */
export function assertDocumentHandoffMatches(value: unknown, expected: DocumentHandoffExpectationV1): DocumentHandoffPayloadV1 {
  const payload = validateDocumentHandoffPayload(value);
  const actual: DocumentHandoffExpectationV1 = {
    message_id: payload.message_id, binding: payload.binding, in_reply_to: payload.in_reply_to,
    sender: payload.sender, recipient: payload.recipient,
  };
  const checked: DocumentHandoffExpectationV1 = {
    message_id: uuid(expected.message_id, 'expected message_id'), binding: binding(expected.binding),
    in_reply_to: expected.in_reply_to === null ? null : uuid(expected.in_reply_to, 'expected in_reply_to'),
    sender: actor(expected.sender), recipient: actor(expected.recipient),
  };
  if (canonicalMessageBytes({ ...actual }) !== canonicalMessageBytes({ ...checked })) invalid('document handoff binding mismatch');
  return payload;
}

/** Check supplied bytes only. Artifact refs are never opened by this module. */
export function assertDocumentArtifactBytes(reference: DocumentArtifactRefV1, bytes: string | Buffer): void {
  const expected = artifact(reference);
  if (Buffer.byteLength(bytes) !== expected.byte_length || messageSha256(bytes) !== expected.sha256) invalid('artifact bytes mismatch');
}

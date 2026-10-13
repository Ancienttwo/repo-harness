import type { CapabilityRegistryDiagnostic, CapabilitySourceMode } from './registry';

/**
 * Two blocker keys keep two different repairs apart. `capability_registry:invalid`
 * means the capability authority (JSON registry or ArchContext model) or one
 * path's ownership answer is wrong, so the model needs an edit.
 * `capability_ownership:unavailable` means ownership was not computed at all:
 * the archctx process, its version or its runtime failed, or a read-only
 * observation does not start it. The model can be correct in that case.
 */
export type CapabilityOwnershipBlockerKey = 'capability_registry:invalid' | 'capability_ownership:unavailable';

export interface CapabilityOwnershipBlocker {
  readonly key: CapabilityOwnershipBlockerKey;
  /** The first diagnostic code; it goes into `profile_reasons`. */
  readonly code: string;
  /** The first diagnostic message on one line, at most MESSAGE_LIMIT characters. */
  readonly message: string;
  /** One command that shows or repairs the cause. */
  readonly fix: string;
}

const MESSAGE_LIMIT = 240;

const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'ARCHCONTEXT_RESOLVE_FAILED',
  'ARCHCONTEXT_RESOLVE_UNAVAILABLE',
]);

function oneLine(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > MESSAGE_LIMIT ? `${flat.slice(0, MESSAGE_LIMIT - 3)}...` : flat;
}

function fixFor(diagnostic: CapabilityRegistryDiagnostic, mode: CapabilitySourceMode): string {
  switch (diagnostic.code) {
    case 'ARCHCONTEXT_RESOLVE_FAILED':
      return 'repo-harness update';
    case 'ARCHCONTEXT_RESOLVE_UNAVAILABLE':
      return 'repo-harness state resolve --json';
    case 'ARCHCONTEXT_MODEL_REJECTED':
      return 'edit .archcontext/model/nodes, then run repo-harness run capability-resolver match --path <path>';
    case 'AMBIGUOUS_MATCH':
    case 'ARCHCONTEXT_OWNER_UNKNOWN':
      return mode === 'archcontext'
        ? `repo-harness run capability-resolver match --path ${diagnostic.path}`
        : 'repo-harness run capability-resolver validate';
    default:
      return 'repo-harness run capability-resolver validate';
  }
}

/** Projects the first ownership diagnostic onto its blocker key, short message and fix command. */
export function capabilityOwnershipBlocker(
  diagnostic: CapabilityRegistryDiagnostic,
  mode: CapabilitySourceMode,
): CapabilityOwnershipBlocker {
  return Object.freeze({
    key: UNAVAILABLE_CODES.has(diagnostic.code) ? 'capability_ownership:unavailable' : 'capability_registry:invalid',
    code: diagnostic.code,
    message: oneLine(diagnostic.message),
    fix: fixFor(diagnostic, mode),
  });
}

/** The `next_action` text that carries the cause and the fix to every state reader and hook. */
export function capabilityOwnershipNextAction(blocker: CapabilityOwnershipBlocker): string {
  return `resolve blockers: ${blocker.key} ${blocker.code}: ${blocker.message}; fix: ${blocker.fix}`;
}

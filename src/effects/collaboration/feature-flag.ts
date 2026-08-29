/**
 * `collaboration.mode` — the program feature flag frozen by D10.
 *
 * Promotion is `off -> shadow -> active` with no skipped state. `off` is the
 * default and refuses every collaboration mutation, so a repo that has not opted
 * in cannot grow collaboration state by accident. A policy file that exists but
 * cannot be parsed, or a mode outside the closed set, fails closed rather than
 * degrading to a permissive default.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { COLLABORATION_MODES, CollaborationError, type CollaborationMode } from '../../core/collaboration/common';

export const COLLABORATION_POLICY_RELATIVE_PATH = '.ai/harness/policy.json';

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readCollaborationMode(repoRoot: string): CollaborationMode {
  const policyPath = join(repoRoot, COLLABORATION_POLICY_RELATIVE_PATH);
  // A repo with no harness policy has not opted in; that is the frozen default,
  // not an inferred permission, and it still refuses every mutation below.
  if (!existsSync(policyPath)) return 'off';
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch (error) {
    throw new CollaborationError(
      'collaboration_unavailable',
      `harness policy is unreadable: ${COLLABORATION_POLICY_RELATIVE_PATH}`,
      error,
    );
  }
  const collaboration = plainRecord(policy)?.collaboration;
  if (collaboration === undefined) return 'off';
  const record = plainRecord(collaboration);
  if (!record) {
    throw new CollaborationError(
      'collaboration_invalid',
      `${COLLABORATION_POLICY_RELATIVE_PATH}#collaboration must be an object`,
    );
  }
  const mode = record.mode;
  if (typeof mode !== 'string' || !(COLLABORATION_MODES as readonly string[]).includes(mode)) {
    throw new CollaborationError(
      'collaboration_invalid',
      `${COLLABORATION_POLICY_RELATIVE_PATH}#collaboration.mode must be one of ${COLLABORATION_MODES.join(', ')}`,
    );
  }
  return mode as CollaborationMode;
}

export function assertCollaborationMutationEnabled(repoRoot: string): CollaborationMode {
  const mode = readCollaborationMode(repoRoot);
  if (mode === 'off') {
    throw new CollaborationError(
      'collaboration_disabled',
      `collaboration mutation is disabled: set ${COLLABORATION_POLICY_RELATIVE_PATH}#collaboration.mode to "shadow" first`,
    );
  }
  return mode;
}

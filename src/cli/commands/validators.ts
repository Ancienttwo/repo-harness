/**
 * Shared CLI validators for `--target`, `--location`, `--mode`, and `--brain-mode`.
 *
 * Extracted from repeated inline checks in src/cli/index.ts so every command
 * that accepts these flags validates consistently in one place.
 */

import type { InstallTargetSpec } from './install';
import type { Location } from '../installer/types';
import type { AdoptionMode } from '../../core/adoption/modes';
import { VALID_DELEGATION_MODES, type DelegationMode } from './delegation-mode';

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

const VALID_TARGETS: readonly InstallTargetSpec[] = ['codex', 'claude', 'both'];

export function assertTarget(raw: string, commandName: string): InstallTargetSpec {
  if ((VALID_TARGETS as readonly string[]).includes(raw)) {
    return raw as InstallTargetSpec;
  }
  console.error(
    `repo-harness ${commandName}: invalid --target "${raw}" (expected: ${VALID_TARGETS.join(', ')})`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

const VALID_LOCATIONS: readonly Location[] = ['global', 'local'];

export function assertLocation(raw: string, commandName: string): Location {
  if ((VALID_LOCATIONS as readonly string[]).includes(raw)) {
    return raw as Location;
  }
  console.error(
    `repo-harness ${commandName}: invalid --location "${raw}" (expected: ${VALID_LOCATIONS.join(', ')})`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Adoption mode
// ---------------------------------------------------------------------------

const VALID_MODES: readonly string[] = ['minimal', 'standard', 'self-host'];

export function assertAdoptionMode(raw: string, commandName: string): AdoptionMode {
  if (VALID_MODES.includes(raw)) {
    return raw as AdoptionMode;
  }
  console.error(
    `repo-harness ${commandName}: invalid --mode "${raw}" (expected: ${VALID_MODES.join(', ')})`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Brain mode
// ---------------------------------------------------------------------------

const VALID_BRAIN_MODES: readonly string[] = ['skip', 'manifest-only'];

export function assertBrainMode(raw: string, commandName: string): string {
  if (VALID_BRAIN_MODES.includes(raw)) {
    return raw;
  }
  console.error(
    `repo-harness ${commandName}: invalid --brain-mode "${raw}" (expected: ${VALID_BRAIN_MODES.join(', ')})`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Delegation mode
// ---------------------------------------------------------------------------

export function assertDelegationMode(raw: string, commandName: string): DelegationMode {
  if ((VALID_DELEGATION_MODES as readonly string[]).includes(raw)) {
    return raw as DelegationMode;
  }
  console.error(
    `repo-harness ${commandName}: invalid --delegation-mode "${raw}" (expected: ${VALID_DELEGATION_MODES.join(', ')})`,
  );
  process.exit(2);
}

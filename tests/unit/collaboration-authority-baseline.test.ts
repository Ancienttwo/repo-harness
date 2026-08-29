/**
 * C0 — collaboration / delivery two-plane authority freeze.
 *
 * Sprint row C0 of
 * `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`.
 * Frozen decisions: `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
 *
 * This file adds no behavior. It enumerates the delivery-plane authorities that
 * the collaboration substrate (C1-C9) must leave untouched, freezes their
 * protocol versions and wire identities into one canonical digest, and pins the
 * baseline negative proof that today's read-only delegation admission does not
 * consume `delegation_policy`.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ENGINEER_PRINCIPAL_KIND,
  ENGINEER_PRINCIPAL_MAPPING_KIND,
  ENGINEER_PRINCIPAL_PROTOCOL,
  CLAIM_ACTOR_RECEIPT_KIND,
} from '../../src/core/engineers/principal-claim';
import {
  DELEGATION_ADMISSION_RECEIPT_KIND,
  DELEGATION_ENVELOPE_KIND,
  DELEGATION_PROTOCOL,
  DELEGATED_RUN_INTENT_KIND,
  WORKER_RESULT_KIND,
  WORKER_RUN_REF_KIND,
} from '../../src/core/engineers/delegation';
import {
  ENGINEER_DELEGATION_ROLES,
  ENGINEER_PROFILE_PROTOCOL,
} from '../../src/core/engineers/profile-binding';
import {
  ENGINEER_OFFERS_KIND,
  ENGINEER_OFFER_KIND,
  ENGINEER_OFFER_PROTOCOL,
  WORK_GRAPH_KIND,
  WORK_GRAPH_PROTOCOL,
} from '../../src/core/engineers/scheduling';
import { TASK_FREEZE_KIND, TASK_FREEZE_PROTOCOL } from '../../src/core/engineers/task-freeze';
import {
  MODULE_MESSAGE_BODY_MAX_BYTES,
  MODULE_MESSAGE_CONTEXT_END,
  MODULE_MESSAGE_CONTEXT_START,
  MODULE_MESSAGE_RESOURCE_MAX_COUNT,
} from '../../src/core/engineers/module-message';
import {
  TASK_MESSAGE_BODY_MAX_BYTES,
  TASK_MESSAGE_CONTEXT_END,
  TASK_MESSAGE_CONTEXT_START,
} from '../../src/core/fleet/task-message';
import {
  FLEET_OFFERS_KIND,
  FLEET_OFFERS_PROTOCOL,
  TASK_OFFER_KIND,
  TASK_OFFER_PROTOCOL,
} from '../../src/core/fleet/task-offer';
import {
  ACCEPTANCE_MATRIX_KIND,
  INTEGRATION_CONTRACT_KIND,
  INTEGRATION_CONTRACT_PROTOCOL,
  INTEGRATION_ENVELOPE_KIND,
  PRODUCT_ACCEPTANCE_PROJECTION_KIND,
} from '../../src/core/integration/product-acceptance';
import {
  MERGE_READINESS_KIND,
  MERGE_READINESS_PROTOCOL,
} from '../../src/core/publication/merge-readiness';
import {
  PUBLICATION_INTEGRATION_OBSERVATION_KIND,
  PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL,
  PUBLICATION_LINEAGE_KIND,
  PUBLICATION_LINEAGE_PROTOCOL,
} from '../../src/core/publication/publication-lifecycle';
import {
  PUBLICATION_CREATE_INTENT_KIND,
  PUBLICATION_PREPARE_KIND,
  PUBLICATION_RECEIPT_KIND,
  PUBLICATION_RECEIPT_PROTOCOL,
} from '../../src/core/publication/publication-receipt';
import {
  COORDINATION_PROTOCOL,
  LEASE_OWNER_KIND,
} from '../../src/core/state/coordination-identity';
import { INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH } from '../../src/effects/integration/product-acceptance';
import { PUBLICATION_RECEIPTS_RELATIVE_PATH } from '../../src/effects/publication/publication-receipt';
import { COORDINATION_ROOT_RELATIVE_PATH } from '../../src/effects/state/coordination-lease-store';
import { DELEGATED_RUN_STORE_RELATIVE_ROOT } from '../../src/effects/engineers/delegated-run-store';

const REPO_ROOT = join(import.meta.dir, '..', '..');

interface AuthorityEntry {
  /** Delivery plane this authority belongs to. */
  readonly plane: 'task' | 'lease' | 'publication' | 'acceptance' | 'delegation';
  readonly authority: string;
  readonly protocol: number;
  readonly kinds: readonly string[];
  readonly storeRoot: string | null;
}

/**
 * The frozen inventory. Values are read from the live exported constants, so the
 * digest below moves only when a real authority identity moves — not when a
 * comment or an unrelated helper in the same file changes.
 */
const AUTHORITY_INVENTORY: readonly AuthorityEntry[] = [
  {
    plane: 'lease',
    authority: 'coordination-lease',
    protocol: COORDINATION_PROTOCOL,
    kinds: [LEASE_OWNER_KIND],
    storeRoot: COORDINATION_ROOT_RELATIVE_PATH,
  },
  {
    plane: 'task',
    authority: 'engineer-principal-claim',
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kinds: [ENGINEER_PRINCIPAL_KIND, ENGINEER_PRINCIPAL_MAPPING_KIND, CLAIM_ACTOR_RECEIPT_KIND],
    storeRoot: 'repo-harness/engineers/v1/claim-actors',
  },
  {
    plane: 'task',
    authority: 'engineer-profile-binding',
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kinds: [],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'work-graph',
    protocol: WORK_GRAPH_PROTOCOL,
    kinds: [WORK_GRAPH_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'engineer-offer',
    protocol: ENGINEER_OFFER_PROTOCOL,
    kinds: [ENGINEER_OFFER_KIND, ENGINEER_OFFERS_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'task-offer',
    protocol: TASK_OFFER_PROTOCOL,
    kinds: [TASK_OFFER_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'fleet-offers',
    protocol: FLEET_OFFERS_PROTOCOL,
    kinds: [FLEET_OFFERS_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'task-freeze-receipt',
    protocol: TASK_FREEZE_PROTOCOL,
    kinds: [TASK_FREEZE_KIND],
    storeRoot: 'repo-harness/engineers/v1/task-freezes',
  },
  {
    plane: 'publication',
    authority: 'publication-receipt',
    protocol: PUBLICATION_RECEIPT_PROTOCOL,
    kinds: [PUBLICATION_RECEIPT_KIND, PUBLICATION_CREATE_INTENT_KIND, PUBLICATION_PREPARE_KIND],
    storeRoot: PUBLICATION_RECEIPTS_RELATIVE_PATH,
  },
  {
    plane: 'publication',
    authority: 'publication-lineage',
    protocol: PUBLICATION_LINEAGE_PROTOCOL,
    kinds: [PUBLICATION_LINEAGE_KIND],
    storeRoot: null,
  },
  {
    plane: 'publication',
    authority: 'publication-integration-observation',
    protocol: PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL,
    kinds: [PUBLICATION_INTEGRATION_OBSERVATION_KIND],
    storeRoot: null,
  },
  {
    plane: 'publication',
    authority: 'merge-readiness',
    protocol: MERGE_READINESS_PROTOCOL,
    kinds: [MERGE_READINESS_KIND],
    storeRoot: null,
  },
  {
    plane: 'acceptance',
    authority: 'product-acceptance',
    protocol: INTEGRATION_CONTRACT_PROTOCOL,
    kinds: [
      INTEGRATION_CONTRACT_KIND,
      INTEGRATION_ENVELOPE_KIND,
      ACCEPTANCE_MATRIX_KIND,
      PRODUCT_ACCEPTANCE_PROJECTION_KIND,
    ],
    storeRoot: INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH,
  },
  {
    plane: 'delegation',
    authority: 'read-only-delegation',
    protocol: DELEGATION_PROTOCOL,
    kinds: [
      DELEGATION_ENVELOPE_KIND,
      DELEGATION_ADMISSION_RECEIPT_KIND,
      DELEGATED_RUN_INTENT_KIND,
      WORKER_RUN_REF_KIND,
      WORKER_RESULT_KIND,
    ],
    storeRoot: DELEGATED_RUN_STORE_RELATIVE_ROOT,
  },
];

/**
 * Frozen at `main@a490a5ef76b439228a4b3282934c29ba15090cdf`. A change here is an
 * authority change: it must be justified by the sprint row that caused it, not
 * silently re-baselined.
 */
const FROZEN_INVENTORY_SHA256 =
  'sha256:ebbb3deb8e0cfd3759c71a00cf68b78d8175d3bec336bb4e8b101477ab05daa6';

function inventoryDigest(): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(AUTHORITY_INVENTORY), 'utf8').digest('hex')}`;
}

describe('C0 delivery-plane authority baseline', () => {
  test('enumerates every frozen authority protocol version', () => {
    expect(
      Object.fromEntries(AUTHORITY_INVENTORY.map((entry) => [entry.authority, entry.protocol])),
    ).toEqual({
      'coordination-lease': 1,
      'engineer-principal-claim': 1,
      'engineer-profile-binding': 1,
      'work-graph': 1,
      'engineer-offer': 1,
      'task-offer': 1,
      'fleet-offers': 1,
      'task-freeze-receipt': 1,
      'publication-receipt': 1,
      'publication-lineage': 1,
      'publication-integration-observation': 1,
      'merge-readiness': 1,
      'product-acceptance': 1,
      'read-only-delegation': 1,
    });
  });

  test('covers all four delivery planes plus the reused delegation plane', () => {
    expect(new Set(AUTHORITY_INVENTORY.map((entry) => entry.plane))).toEqual(
      new Set(['task', 'lease', 'publication', 'acceptance', 'delegation']),
    );
  });

  test('authority store roots stay on the repo-harness/<domain>/v1 convention', () => {
    for (const entry of AUTHORITY_INVENTORY) {
      if (entry.storeRoot === null) continue;
      expect(entry.storeRoot).toMatch(/^repo-harness\/[a-z0-9-]+\/v1(\/[a-z0-9-]+)*$/u);
    }
  });

  test('every wire kind is unique across the delivery plane', () => {
    const kinds = AUTHORITY_INVENTORY.flatMap((entry) => entry.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test('the frozen authority inventory digest is unchanged', () => {
    expect(inventoryDigest()).toBe(FROZEN_INVENTORY_SHA256);
  });
});

describe('C0 frozen delegation invariants', () => {
  test('ENGINEER_DELEGATION_ROLES stays the same five-value closed set', () => {
    expect([...ENGINEER_DELEGATION_ROLES]).toEqual([
      'explorer',
      'root-cause-prover',
      'fast-worker',
      'deep-worker',
      'gatekeeper',
    ]);
  });

  test('DelegatedRunIntent.context_packet_sha256 keeps its ExecutionPacket assertions', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'src/effects/engineers/delegated-run-store.ts'),
      'utf8',
    );
    expect(source).toContain(
      'envelope.execution_packet_sha256 !== input.context_packet_sha256',
    );
    expect(source).toContain('packet.packet_sha256 !== intent.context_packet_sha256');
  });

  test('untrusted injection markers and message limits are unchanged', () => {
    expect(TASK_MESSAGE_CONTEXT_START).toBe('[TaskInboxUntrustedPeerMessages]');
    expect(TASK_MESSAGE_CONTEXT_END).toBe('[/TaskInboxUntrustedPeerMessages]');
    expect(MODULE_MESSAGE_CONTEXT_START).toBe('[ModuleInboxUntrustedPeerMessage]');
    expect(MODULE_MESSAGE_CONTEXT_END).toBe('[/ModuleInboxUntrustedPeerMessage]');
    expect(TASK_MESSAGE_BODY_MAX_BYTES).toBe(8 * 1024);
    expect(MODULE_MESSAGE_BODY_MAX_BYTES).toBe(8 * 1024);
    expect(MODULE_MESSAGE_RESOURCE_MAX_COUNT).toBe(8);
  });
});

describe('C0 baseline negative proof', () => {
  /**
   * Freeze decision D7. Today `max_parallel_readers` is a declared profile value
   * with no admission-time enforcement, and `delegation_policy` is declared and
   * validated only in the profile schema. C4's admission bridge is a new
   * pre-step under `src/effects/collaboration/`; it must not be smuggled into the
   * existing admission path, whose semantics C0 froze as unchanged.
   */
  test('the read-only delegation admission path does not consume delegation_policy', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'src/effects/engineers/delegated-run-store.ts'),
      'utf8',
    );
    expect(source).not.toContain('delegation_policy');
    expect(source).not.toContain('max_parallel_readers');
    expect(source).not.toContain('allowed_roles');
  });

  test('delegation_policy is declared and validated only in the profile schema', () => {
    const profileSource = readFileSync(
      join(REPO_ROOT, 'src/core/engineers/profile-binding.ts'),
      'utf8',
    );
    expect(profileSource).toContain('max_parallel_readers');
    expect(profileSource).toContain("assertInteger(value.delegation_policy.max_parallel_readers");
  });
});

describe('C0 operator write-surface freeze', () => {
  test('the Operator server accepts POST on the task message route only', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/effects/operator/server.ts'), 'utf8');
    expect(source).toContain('Only the task message route accepts POST.');
    expect(source).toContain('The task message route accepts POST only.');
  });
});

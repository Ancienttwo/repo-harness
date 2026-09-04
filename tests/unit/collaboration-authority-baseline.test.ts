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
 *
 * The inventory is not hand-maintained against the source: every module it draws
 * from is also imported as a namespace, and `C0 authority inventory completeness`
 * below asserts set equality between what the module exports and what the
 * inventory declares. Adding a `*_KIND` or `*_PROTOCOL` export to any inventoried
 * module turns this file red until the inventory is updated.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';

import * as delegation from '../../src/core/engineers/delegation';
import {
  MODULE_MESSAGE_BODY_MAX_BYTES,
  MODULE_MESSAGE_CONTEXT_END,
  MODULE_MESSAGE_CONTEXT_START,
  MODULE_MESSAGE_RESOURCE_MAX_COUNT,
} from '../../src/core/engineers/module-message';
import * as principalClaim from '../../src/core/engineers/principal-claim';
import * as profileBinding from '../../src/core/engineers/profile-binding';
import * as scheduling from '../../src/core/engineers/scheduling';
import * as taskFreeze from '../../src/core/engineers/task-freeze';
import * as fleetBoard from '../../src/core/fleet/board';
import {
  TASK_MESSAGE_BODY_MAX_BYTES,
  TASK_MESSAGE_CONTEXT_END,
  TASK_MESSAGE_CONTEXT_START,
} from '../../src/core/fleet/task-message';
import * as taskOffer from '../../src/core/fleet/task-offer';
import * as productAcceptance from '../../src/core/integration/product-acceptance';
import * as mergeReadiness from '../../src/core/publication/merge-readiness';
import * as publicationLifecycle from '../../src/core/publication/publication-lifecycle';
import * as publicationReceipt from '../../src/core/publication/publication-receipt';
import * as coordinationIdentity from '../../src/core/state/coordination-identity';
import * as projectBoard from '../../src/core/state/project-board';
import { DELEGATED_RUN_STORE_RELATIVE_ROOT } from '../../src/effects/engineers/delegated-run-store';
import { INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH } from '../../src/effects/integration/product-acceptance';
import { PUBLICATION_RECEIPTS_RELATIVE_PATH } from '../../src/effects/publication/publication-receipt';
import { COORDINATION_ROOT_RELATIVE_PATH } from '../../src/effects/state/coordination-lease-store';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const FREEZE_RECORD_RELATIVE_PATH =
  'docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md';

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
    protocol: coordinationIdentity.COORDINATION_PROTOCOL,
    kinds: [coordinationIdentity.LEASE_OWNER_KIND],
    storeRoot: COORDINATION_ROOT_RELATIVE_PATH,
  },
  {
    plane: 'task',
    authority: 'engineer-principal-claim',
    protocol: principalClaim.ENGINEER_PRINCIPAL_PROTOCOL,
    kinds: [
      principalClaim.ENGINEER_PRINCIPAL_KIND,
      principalClaim.ENGINEER_PRINCIPAL_MAPPING_KIND,
      principalClaim.CLAIM_ACTOR_RECEIPT_KIND,
    ],
    storeRoot: 'repo-harness/engineers/v1/claim-actors',
  },
  {
    plane: 'task',
    authority: 'engineer-profile-binding',
    protocol: profileBinding.ENGINEER_PROFILE_PROTOCOL,
    kinds: [
      profileBinding.ENGINEER_PROFILE_KIND,
      profileBinding.ENGINEER_BINDING_KIND,
      profileBinding.ENGINEER_BINDING_EVENT_KIND,
      profileBinding.ENGINEER_BINDING_CURRENT_KIND,
    ],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'work-graph',
    protocol: scheduling.WORK_GRAPH_PROTOCOL,
    kinds: [scheduling.WORK_GRAPH_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'engineer-offer',
    protocol: scheduling.ENGINEER_OFFER_PROTOCOL,
    kinds: [scheduling.ENGINEER_OFFER_KIND, scheduling.ENGINEER_OFFERS_KIND],
    storeRoot: null,
  },
  {
    /**
     * The board document has no `kind` field: `BOARD_PROTOCOL` is a field of the
     * composite revision preimage, not a wire envelope. It is inventoried
     * because `collectRepoTaskOffers()`
     * (`src/effects/fleet/acquire.ts:200-236`) derives every `TaskOfferV1` from
     * its cards, so a change to this projection changes `execution_readiness`
     * and therefore which row `fleet acquire` may claim.
     */
    plane: 'task',
    authority: 'project-board',
    protocol: projectBoard.BOARD_PROTOCOL,
    kinds: [],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'task-offer',
    protocol: taskOffer.TASK_OFFER_PROTOCOL,
    kinds: [taskOffer.TASK_OFFER_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'fleet-offers',
    protocol: taskOffer.FLEET_OFFERS_PROTOCOL,
    kinds: [taskOffer.FLEET_OFFERS_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'fleet-board',
    protocol: fleetBoard.FLEET_BOARD_PROTOCOL,
    kinds: [fleetBoard.FLEET_BOARD_KIND],
    storeRoot: null,
  },
  {
    plane: 'task',
    authority: 'task-freeze-receipt',
    protocol: taskFreeze.TASK_FREEZE_PROTOCOL,
    kinds: [taskFreeze.TASK_FREEZE_KIND],
    storeRoot: 'repo-harness/engineers/v1/task-freezes',
  },
  {
    plane: 'publication',
    authority: 'publication-receipt',
    protocol: publicationReceipt.PUBLICATION_RECEIPT_PROTOCOL,
    kinds: [
      publicationReceipt.PUBLICATION_RECEIPT_KIND,
      publicationReceipt.PUBLICATION_CREATE_INTENT_KIND,
      publicationReceipt.PUBLICATION_PREPARE_KIND,
    ],
    storeRoot: PUBLICATION_RECEIPTS_RELATIVE_PATH,
  },
  {
    plane: 'publication',
    authority: 'publication-lineage',
    protocol: publicationLifecycle.PUBLICATION_LINEAGE_PROTOCOL,
    kinds: [publicationLifecycle.PUBLICATION_LINEAGE_KIND],
    storeRoot: null,
  },
  {
    plane: 'publication',
    authority: 'publication-integration-observation',
    protocol: publicationLifecycle.PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL,
    kinds: [publicationLifecycle.PUBLICATION_INTEGRATION_OBSERVATION_KIND],
    storeRoot: null,
  },
  {
    plane: 'publication',
    authority: 'merge-readiness',
    protocol: mergeReadiness.MERGE_READINESS_PROTOCOL,
    kinds: [mergeReadiness.MERGE_READINESS_KIND],
    storeRoot: null,
  },
  {
    plane: 'acceptance',
    authority: 'product-acceptance',
    protocol: productAcceptance.INTEGRATION_CONTRACT_PROTOCOL,
    kinds: [
      productAcceptance.INTEGRATION_CONTRACT_KIND,
      productAcceptance.INTEGRATION_ENVELOPE_KIND,
      productAcceptance.ACCEPTANCE_MATRIX_KIND,
      productAcceptance.PRODUCT_ACCEPTANCE_PROJECTION_KIND,
    ],
    storeRoot: INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH,
  },
  {
    plane: 'delegation',
    authority: 'read-only-delegation',
    protocol: delegation.DELEGATION_PROTOCOL,
    kinds: [
      delegation.LOGICAL_ROLE_PROFILE_KIND,
      delegation.CODEX_READ_ONLY_CAPABILITY_KIND,
      delegation.EXECUTION_PACKET_KIND,
      delegation.DELEGATION_ENVELOPE_KIND,
      delegation.DELEGATION_ADMISSION_RECEIPT_KIND,
      delegation.DELEGATED_RUN_INTENT_KIND,
      delegation.DELEGATED_RUN_LAUNCH_CLAIM_KIND,
      delegation.DELEGATED_RUN_OBSERVATION_KIND,
      delegation.WORKER_RUN_REF_KIND,
      delegation.WORKER_RESULT_KIND,
      delegation.CODEX_READ_ONLY_ADAPTER_KIND,
    ],
    storeRoot: DELEGATED_RUN_STORE_RELATIVE_ROOT,
  },
];

interface AuthoritySource {
  /** Repo-relative module path, carried so a set-equality failure names the file. */
  readonly module: string;
  /** Namespace import of that module; its exports are read at test time. */
  readonly exports: Readonly<Record<string, unknown>>;
  /** Inventory authorities whose wire identity this module owns. */
  readonly authorities: readonly string[];
}

/**
 * Every module `AUTHORITY_INVENTORY` draws a constant from. The completeness
 * tests below treat each module's exported `*_KIND` / `*_PROTOCOL` surface as the
 * source of truth and the inventory as the thing that must match it, so a new
 * wire identity cannot be added to an inventoried module without failing here
 * first.
 *
 * Membership is not curated by taste. The inclusion criterion and the
 * clause-by-clause adjudication of every `src/core/**` module that exports a
 * `*_PROTOCOL` and is *not* listed here are frozen in
 * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`,
 * section 「納入判據與排除清單」. Adding or removing a module here without
 * moving that section is a silent re-baseline.
 *
 * The closed scan C0 deferred lives below in `C1 closed inclusion scan`: it
 * sweeps `src/core/**` for `*_PROTOCOL` exports and asserts the result equals
 * this list united with `DELIBERATELY_EXCLUDED`, so a new protocol-owning module
 * can no longer appear without being adjudicated.
 */
const AUTHORITY_SOURCE_MODULES: readonly AuthoritySource[] = [
  {
    module: 'src/core/state/coordination-identity.ts',
    exports: coordinationIdentity,
    authorities: ['coordination-lease'],
  },
  {
    module: 'src/core/engineers/principal-claim.ts',
    exports: principalClaim,
    authorities: ['engineer-principal-claim'],
  },
  {
    module: 'src/core/engineers/profile-binding.ts',
    exports: profileBinding,
    authorities: ['engineer-profile-binding'],
  },
  {
    module: 'src/core/engineers/scheduling.ts',
    exports: scheduling,
    authorities: ['work-graph', 'engineer-offer'],
  },
  {
    module: 'src/core/state/project-board.ts',
    exports: projectBoard,
    authorities: ['project-board'],
  },
  {
    module: 'src/core/fleet/task-offer.ts',
    exports: taskOffer,
    authorities: ['task-offer', 'fleet-offers'],
  },
  {
    module: 'src/core/fleet/board.ts',
    exports: fleetBoard,
    authorities: ['fleet-board'],
  },
  {
    module: 'src/core/engineers/task-freeze.ts',
    exports: taskFreeze,
    authorities: ['task-freeze-receipt'],
  },
  {
    module: 'src/core/publication/publication-receipt.ts',
    exports: publicationReceipt,
    authorities: ['publication-receipt'],
  },
  {
    module: 'src/core/publication/publication-lifecycle.ts',
    exports: publicationLifecycle,
    authorities: ['publication-lineage', 'publication-integration-observation'],
  },
  {
    module: 'src/core/publication/merge-readiness.ts',
    exports: mergeReadiness,
    authorities: ['merge-readiness'],
  },
  {
    module: 'src/core/integration/product-acceptance.ts',
    exports: productAcceptance,
    authorities: ['product-acceptance'],
  },
  {
    module: 'src/core/engineers/delegation.ts',
    exports: delegation,
    authorities: ['read-only-delegation'],
  },
];

interface ExcludedModule {
  /** Repo-relative module path that exports a `*_PROTOCOL` but owns no inventoried authority. */
  readonly module: string;
  /**
   * The inclusion clause it fails. C-1 is the plane clause: the module owns a
   * wire identity on one of Task/Claim, Lease, Publication, Acceptance or the
   * reused read-only Delegation plane. C-2 is the cross-agent-authority clause:
   * its bytes decide, for another agent, who owns work or what has been
   * published or accepted on that plane.
   */
  readonly fails: readonly ('C-1' | 'C-2')[];
  readonly evidence: string;
}

/**
 * The other side of the closed scan. Every `src/core/**` module that exports a
 * `*_PROTOCOL` and is not an authority source appears here with the clause it
 * fails, so "not inventoried" is always an adjudication rather than an omission.
 *
 * The first ten rows are the hand adjudication C0 froze in
 * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`,
 * section 「納入判據與排除清單」. Moving a row here without moving that section
 * is a silent re-baseline.
 */
const DELIBERATELY_EXCLUDED: readonly ExcludedModule[] = [
  {
    module: 'src/core/automation/controller.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'automation orchestration evidence plane (issue #279): journals bounded observations and calls existing acquire/dispatch authorities, but grants no claim, moves no lease generation, and publishes or accepts nothing',
  },
  {
    /**
     * The automation cost plane (issue #282). It fails C-1 because a budget is
     * none of the five planes C0 froze: it owns spend, not Task/Claim, Lease,
     * Publication, Acceptance, or Delegation identity. It fails C-2 because its
     * bytes decide only whether the next operation may be paid for -- they
     * grant no claim, move no lease generation, and publish or accept nothing,
     * and exhaustion explicitly leaves every in-flight authority to its own
     * owner's normal recovery.
     */
    module: 'src/core/automation/budget.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'automation cost plane (issue #282): reserves and charges spend against one host-owned ProgramAuthorization grant, writes only its own ledger under the Git common directory, and never creates, releases, or steals a Task, Claim, Lease, Publication, or Acceptance fact',
  },
  {
    module: 'src/core/state/lease-liveness.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'Lease liveness evidence plane (issue #286): classifies expiry and proves reclaim preconditions, but only the existing Lease store can move ownership or increment generation',
  },
  {
    module: 'src/core/engineers/automation-attempt.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'automation attempt evidence plane (issue #287): gates scheduling retries from Work Graph policy but never creates a Task, Claim, Lease, Publication, Acceptance, or Delegation authority',
  },
  {
    module: 'src/core/external-sources/binding.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'external-source provenance plane; receipts bind inert provider evidence to an already-canonical task revision and no TaskOffer, Claim, Lease, Publication or Acceptance authority reads them',
  },
  {
    module: 'src/core/engineers/engineering-overlay.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'module-engineering attention plane; a derived overlay with no store, no reader but `engineer overlay` output, and an attention payload that asserts no ownership',
  },
  {
    module: 'src/core/engineers/work-demand.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'task-intake approval plane: an accepted projection authorizes one atomic materialization into the canonical Sprint and Work Graph, but no TaskOffer, Claim, Lease, Publication, Acceptance, or Delegation decision reads WorkDemand records as authority',
  },
  {
    module: 'src/core/engineers/interface-change.ts',
    fails: ['C-1'],
    evidence: 'module-engineering interface-change plane; its work-package projection is downstream of scheduling.ts and no Work Graph, offer, claim or lease reads it back',
  },
  {
    module: 'src/core/engineers/module-message.ts',
    fails: ['C-2'],
    evidence: 'message payload framed as untrusted data under [ModuleInboxUntrustedPeerMessage]; C0 freezes its markers and byte caps as the injection precedent, not its wire identity',
  },
  {
    module: 'src/core/engineers/agent-runtime-effect.ts',
    fails: ['C-1'],
    evidence: 'provider/host runtime-effect plane; the delegated-run store imports nothing from it, so no admission decision reads a agent runtime effect',
  },
  {
    module: 'src/core/engineers/verified-context.ts',
    fails: ['C-1'],
    evidence: 'verification plane (D12); consumers are its own store and the verified-context CLI only',
  },
  {
    module: 'src/core/fleet/task-message.ts',
    fails: ['C-2'],
    evidence: 'untrusted peer payload under [TaskInboxUntrustedPeerMessages]; the operator POST route names its recipient from readLease, not from a message',
  },
  {
    module: 'src/core/publication/feedback.ts',
    fails: ['C-1'],
    evidence: 'review/repair loop despite the publication/ directory (D12); merge-readiness imports only publication-receipt and no publication or merge decision reads a feedback event',
  },
  {
    module: 'src/core/release/runtime-evidence.ts',
    fails: ['C-1'],
    evidence: 'release/verification plane (D12); exports no *_KIND at all and has one consumer, src/effects/release/runtime-evidence.ts',
  },
  {
    module: 'src/core/review/change-assessment.ts',
    fails: ['C-1'],
    evidence: 'review plane (D12); one consumer, src/effects/review/change-assessment.ts',
  },
  {
    module: 'src/core/refactor/program.ts',
    fails: ['C-1'],
    evidence: 'refactor orchestration plane: maps provider recommendation identity to a Work Package before materialization, but no TaskOffer, Claim, Lease, Publication, Acceptance, or Delegation decision reads RefactorProgram bytes as its authority',
  },
  {
    module: 'src/core/state/project-board-slice.ts',
    fails: ['C-2'],
    evidence: 'advisory host-context projection: every ownership decision is imported from project-board.ts, it has no store and no --json surface, and its only consumer renders prompt text that carries no decision',
  },
  {
    /**
     * C1's own module, and the first the criterion classifies without hindsight.
     * It fails C-1 because the collaboration plane is not one of the five planes
     * C0 froze — D1 fixes it as an additive, non-authoritative plane that reads
     * the delivery plane and never writes it. It fails C-2 because a signal's
     * bytes decide nothing for another agent: they grant no Claim, move no Lease
     * generation, and are rendered to any reader inside an untrusted wrapper.
     */
    module: 'src/core/collaboration/common.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'collaboration plane (D1): additive and non-authoritative, writes no delivery store, and its records are advisory context read as untrusted data',
  },
  {
    module: 'src/core/operator/collaboration-snapshot.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'operator transport view of the collaboration plane (D1): a redacting projection with no store, no agent reader, and no field it decides rather than copies',
  },
  {
    /**
     * The schema 1 -> 2 backlog migration receipt. It fails C-1 because a
     * migration receipt is not a wire identity on Task/Claim, Lease,
     * Publication, Acceptance or Delegation -- it is an audit record of one
     * file rewrite. It fails C-2 because nothing reads it back: no offer,
     * claim, lease, publication or acceptance path imports it, and the
     * migration itself proves its result by re-reading the canonical sprint,
     * never by trusting the receipt.
     */
    module: 'src/core/state/sprint-schema-migration.ts',
    fails: ['C-1', 'C-2'],
    evidence: 'one-shot backlog schema migration plane: a write-only audit receipt with a single consumer, src/effects/state/sprint-schema-migration.ts, and no reader on any delivery plane',
  },
];

/**
 * Frozen at `main@a490a5ef76b439228a4b3282934c29ba15090cdf`, then deliberately
 * advanced by the approved R1 provider-neutral Agent Runtime work package when
 * FleetBoardSnapshot moved to protocol 3. A change here is an authority change:
 * it must be justified by the work package that caused it, not silently
 * re-baselined.
 */
const FROZEN_INVENTORY_SHA256 =
  'sha256:4e6d4f3388da0a21fd06895725f2540926944a38fbeaa68e02dde9c78a96f0c3';

function inventoryDigest(): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(AUTHORITY_INVENTORY), 'utf8').digest('hex')}`;
}

/** Values of every export whose name ends in `suffix`, in a stable order. */
function exportedConstantValues(
  moduleExports: Readonly<Record<string, unknown>>,
  suffix: string,
): readonly unknown[] {
  return sortedValues(
    Object.entries(moduleExports)
      .filter(([name]) => name.endsWith(suffix))
      .map(([, value]) => value),
  );
}

function sortedValues(values: readonly unknown[]): readonly unknown[] {
  return [...values].sort((left, right) => {
    const a = String(left);
    const b = String(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function entriesFor(source: AuthoritySource): readonly AuthorityEntry[] {
  return AUTHORITY_INVENTORY.filter((entry) => source.authorities.includes(entry.authority));
}

function freezeRecordSource(): string {
  return readFileSync(join(REPO_ROOT, FREEZE_RECORD_RELATIVE_PATH), 'utf8');
}

/**
 * Every `src/core/**` module that puts a `*_PROTOCOL` name on its export
 * surface, resolved by importing the module and reading its namespace rather
 * than by matching export syntax.
 *
 * Matching syntax was a losing game: each new form — the declaration, then
 * `const X_PROTOCOL = …; export { X_PROTOCOL }`, then `export { X } from './y'`,
 * then `export * from '../elsewhere'` — was another bypass found only after it
 * existed. The module system already collapses declaration, named re-export,
 * re-export-from, star re-export and aliasing into a single answer, so asking it
 * closes the whole class instead of the three forms someone thought of.
 *
 * Every module is imported, with no source pre-filter: a star re-export need not
 * contain the token it re-exports, so any text-level shortcut reopens the hole
 * this replaces. `src/core` is pure protocol and logic — no module in it runs
 * anything at import time — so importing all of them costs only the parse.
 * A `*_PROTOCOL` that is type-only is deliberately not an owner: it names no
 * wire version a reader could depend on.
 */
async function protocolOwningModules(): Promise<readonly string[]> {
  const root = join(REPO_ROOT, 'src/core');
  const modules: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        modules.push(absolute);
      }
    }
  };
  walk(root);
  const found: string[] = [];
  for (const absolute of modules.sort()) {
    const namespace = (await import(pathToFileURL(absolute).href)) as Readonly<Record<string, unknown>>;
    if (Object.keys(namespace).some((name) => name.endsWith('_PROTOCOL'))) {
      found.push(relative(REPO_ROOT, absolute).replaceAll('\\', '/'));
    }
  }
  return found.sort();
}

describe('C0 authority inventory completeness', () => {
  test('every inventory authority is owned by exactly one source module', () => {
    const claimed = AUTHORITY_SOURCE_MODULES.flatMap((source) => source.authorities);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect([...claimed].sort()).toEqual(
      AUTHORITY_INVENTORY.map((entry) => entry.authority).sort(),
    );
  });

  test('each source module exports exactly the wire kinds its inventory entries declare', () => {
    for (const source of AUTHORITY_SOURCE_MODULES) {
      const exported = exportedConstantValues(source.exports, '_KIND');
      const declared = sortedValues([
        ...new Set(entriesFor(source).flatMap((entry) => entry.kinds)),
      ]);
      expect({ module: source.module, kinds: declared }).toEqual({
        module: source.module,
        kinds: exported,
      });
    }
  });

  /**
   * Protocol constants are compared by value multiset, not by name: the exported
   * name is not recoverable from the inventory entry. Cardinality still bites —
   * a new `*_PROTOCOL` export with no matching inventory entry makes the exported
   * side longer — and the named protocol map below pins each authority's version.
   */
  test('each source module exports exactly the protocol versions its inventory entries declare', () => {
    for (const source of AUTHORITY_SOURCE_MODULES) {
      const exported = exportedConstantValues(source.exports, '_PROTOCOL');
      const declared = sortedValues(entriesFor(source).map((entry) => entry.protocol));
      expect({ module: source.module, protocols: declared }).toEqual({
        module: source.module,
        protocols: exported,
      });
    }
  });

  test('the freeze record digests every authority source module', () => {
    const record = freezeRecordSource();
    for (const source of AUTHORITY_SOURCE_MODULES) {
      expect({
        module: source.module,
        digested: record.includes(`| \`${source.module}\` | \`sha256:`),
      }).toEqual({ module: source.module, digested: true });
    }
  });

  test('the freeze record cites the current frozen inventory digest', () => {
    expect({
      digest: FROZEN_INVENTORY_SHA256,
      citedByFreezeRecord: freezeRecordSource().includes(FROZEN_INVENTORY_SHA256),
    }).toEqual({ digest: FROZEN_INVENTORY_SHA256, citedByFreezeRecord: true });
  });
});

/**
 * The scan C0 deferred to C1. C0 adjudicated the split by hand against zero new
 * samples; `src/core/collaboration/` is the first module the criterion has to
 * classify without hindsight, so the row that adds it also closes the scan.
 */
describe('C1 closed inclusion scan', () => {
  test('every src/core module owning a protocol is either an authority source or an adjudicated exclusion', async () => {
    const inventoried = AUTHORITY_SOURCE_MODULES.map((source) => source.module);
    const excluded = DELIBERATELY_EXCLUDED.map((entry) => entry.module);
    expect(await protocolOwningModules()).toEqual([...inventoried, ...excluded].sort());
  });

  test('the two sides of the scan are disjoint and internally unique', () => {
    const inventoried = AUTHORITY_SOURCE_MODULES.map((source) => source.module);
    const excluded = DELIBERATELY_EXCLUDED.map((entry) => entry.module);
    expect(new Set(inventoried).size).toBe(inventoried.length);
    expect(new Set(excluded).size).toBe(excluded.length);
    expect(inventoried.filter((module) => excluded.includes(module))).toEqual([]);
  });

  test('every exclusion names at least one failed clause and its evidence', () => {
    for (const entry of DELIBERATELY_EXCLUDED) {
      expect({ module: entry.module, clauses: entry.fails.length > 0, evidence: entry.evidence.length > 0 })
        .toEqual({ module: entry.module, clauses: true, evidence: true });
    }
  });

  /**
   * C1's classification, stated as an assertion rather than only as prose: the
   * collaboration plane is additive and non-authoritative, so its protocol owner
   * is excluded on both clauses.
   */
  test('the collaboration plane is excluded on both clauses', () => {
    expect(DELIBERATELY_EXCLUDED.find((entry) => entry.module === 'src/core/collaboration/common.ts')?.fails)
      .toEqual(['C-1', 'C-2']);
    expect(AUTHORITY_INVENTORY.some((entry) => entry.authority.includes('collaboration'))).toBe(false);
  });

  /**
   * D1 in one direction, with one exact exception.
   *
   * The collaboration plane may read the delivery plane; a delivery-plane
   * module importing it would be the second scheduler Child PRD A names as its
   * key risk. Issue #278 opened exactly one edge the other way: the read-only
   * dispatch effect enforces the collaboration fence itself, because a fence
   * that is a pre-step at each call site is bypassed by forgetting it, and a
   * caller that reaches `dispatchDelegatedRun()` directly is exactly the
   * non-CLI controller C9's canary anticipated.
   *
   * The exception is stated as an exact pair — one file, one imported symbol,
   * one mention — rather than as a directory allowance, so the risk this scan
   * was drawn against still fails it: a delivery-plane module that grows any
   * other collaboration dependency, or this one that grows a second, is an
   * offender.
   */
  const DISPATCH_FENCE_EDGE = 'src/effects/engineers/delegated-run-store.ts';
  const DISPATCH_FENCE_IMPORT =
    "import { fenceCollaborationDispatch } from '../collaboration/context-delivery';";

  test('no delivery-plane module imports the collaboration plane beyond the dispatch fence', () => {
    const offenders: string[] = [];
    const fenceEdges: string[] = [];
    for (const directory of [
      'src/core/state', 'src/core/fleet', 'src/core/publication', 'src/core/integration', 'src/core/engineers',
      'src/effects/state', 'src/effects/fleet', 'src/effects/publication', 'src/effects/integration', 'src/effects/engineers',
    ]) {
      const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const absolute = join(current, entry.name);
          if (entry.isDirectory()) { walk(absolute); continue; }
          if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
          const source = readFileSync(absolute, 'utf8');
          if (!source.includes('collaboration/')) continue;
          const module = relative(REPO_ROOT, absolute).replaceAll('\\', '/');
          if (module === DISPATCH_FENCE_EDGE
            && source.split('collaboration/').length - 1 === 1
            && source.includes(DISPATCH_FENCE_IMPORT)) {
            fenceEdges.push(module);
            continue;
          }
          offenders.push(module);
        }
      };
      walk(join(REPO_ROOT, directory));
    }
    expect({ offenders: offenders.sort(), fenceEdges }).toEqual({ offenders: [], fenceEdges: [DISPATCH_FENCE_EDGE] });
  });
});

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
      'project-board': 1,
      'task-offer': 1,
      'fleet-offers': 1,
      'fleet-board': 3,
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
    expect([...profileBinding.ENGINEER_DELEGATION_ROLES]).toEqual([
      'explorer',
      'root-cause-prover',
      'fast-worker',
      'deep-worker',
      'gatekeeper',
    ]);
  });

  /**
   * The two `context_packet_sha256` binding assertions
   * (`src/effects/engineers/delegated-run-store.ts:731,791`) are recorded prose in
   * the freeze record, not asserted here: proving them needs a delegated-run
   * fixture, which is runtime behavior C0 does not produce. The row that first
   * exercises the admission path owns that assertion.
   */
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

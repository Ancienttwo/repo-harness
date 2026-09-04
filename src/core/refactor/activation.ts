import { canonicalMessageDigest } from '../messages/mechanics';

export const REFACTOR_ACTIVATION_PROTOCOL = 1 as const;
export const REFACTOR_CANARY_IDS = Object.freeze([
  'model_free_module', 'incomplete_index_proof', 'cross_module_cutover', 'ownership_architecture_approval', 'merged_not_improved',
  'exact_final_main_resolved', 'regression_new_recommendation', 'resolved_not_readopted', 'two_worker_node_serialized', 'version_mismatch_fail_closed',
] as const);
export type RefactorCanaryId = typeof REFACTOR_CANARY_IDS[number];
export const REFACTOR_ACTIVATION_LEVELS = Object.freeze(['off', 'shadow', 'active_module', 'active_cross_module'] as const);
export type RefactorActivationLevel = typeof REFACTOR_ACTIVATION_LEVELS[number];
export const REFACTOR_CANARIES_BY_LEVEL = Object.freeze({
  shadow: Object.freeze(['version_mismatch_fail_closed'] as const),
  active_module: Object.freeze(['model_free_module', 'incomplete_index_proof', 'ownership_architecture_approval', 'merged_not_improved', 'exact_final_main_resolved', 'regression_new_recommendation', 'resolved_not_readopted'] as const),
  active_cross_module: Object.freeze(['cross_module_cutover', 'two_worker_node_serialized'] as const),
}) satisfies Readonly<Record<Exclude<RefactorActivationLevel, 'off'>, readonly RefactorCanaryId[]>>;
export interface RefactorCanaryReceiptV1 { readonly protocol: typeof REFACTOR_ACTIVATION_PROTOCOL; readonly kind: 'refactor_canary_receipt'; readonly canaryId: RefactorCanaryId; readonly repositoryId: string; readonly targetRevision: string; readonly passed: boolean; readonly evidenceRefs: readonly { readonly locator: string; readonly sha256: string }[]; readonly observedAt: string; readonly receiptSha256: string }
export interface RefactorActivationEventV1 { readonly protocol: typeof REFACTOR_ACTIVATION_PROTOCOL; readonly kind: 'refactor_activation_event'; readonly repositoryId: string; readonly previousLevel: RefactorActivationLevel; readonly nextLevel: RefactorActivationLevel; readonly targetRevision: string; readonly canaryReceiptSha256: readonly string[]; readonly observedAt: string; readonly eventSha256: string }
export class RefactorActivationError extends Error { readonly code = 'refactor_activation_invalid' as const; constructor(message: string) { super(message); this.name = 'RefactorActivationError'; } }
function invalid(message: string): never { throw new RefactorActivationError(message); }
function sha(value: unknown, label: string): string { if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) invalid(`${label} must be a canonical sha256 digest`); return value; }
function exactKeys(value: object, expected: readonly string[], label: string): void { const actual = Object.keys(value).sort(); if (actual.length !== expected.length || expected.some((key, index) => key !== actual[index])) invalid(`${label} fields are invalid`); }

export function buildRefactorCanaryReceipt(input: Omit<RefactorCanaryReceiptV1, 'protocol' | 'kind' | 'receiptSha256'>): RefactorCanaryReceiptV1 {
  if (!REFACTOR_CANARY_IDS.includes(input.canaryId) || !input.repositoryId || !/^[a-f0-9]{40,64}$/u.test(input.targetRevision) || typeof input.passed !== 'boolean' || !/^\d{4}-\d{2}-\d{2}T/u.test(input.observedAt)) invalid('canary identity is invalid');
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) invalid('canary evidence is required'); const locators = new Set<string>();
  const evidenceRefs = input.evidenceRefs.map((entry) => { exactKeys(entry, ['locator', 'sha256'], 'canary evidence'); if (!entry.locator || locators.has(entry.locator)) invalid('canary evidence locators must be non-empty and unique'); locators.add(entry.locator); return Object.freeze({ locator: entry.locator, sha256: sha(entry.sha256, 'canary evidence sha256') }); });
  const basis = { protocol: REFACTOR_ACTIVATION_PROTOCOL, kind: 'refactor_canary_receipt' as const, canaryId: input.canaryId, repositoryId: input.repositoryId, targetRevision: input.targetRevision, passed: input.passed, evidenceRefs, observedAt: input.observedAt };
  return Object.freeze({ ...basis, evidenceRefs: Object.freeze(evidenceRefs), receiptSha256: canonicalMessageDigest(basis) });
}

export function validateRefactorCanaryReceipt(value: RefactorCanaryReceiptV1): RefactorCanaryReceiptV1 { exactKeys(value, ['canaryId', 'evidenceRefs', 'kind', 'observedAt', 'passed', 'protocol', 'receiptSha256', 'repositoryId', 'targetRevision'], 'canary receipt'); const rebuilt = buildRefactorCanaryReceipt(value); if (rebuilt.receiptSha256 !== value.receiptSha256) invalid('canary receipt digest is invalid'); return rebuilt; }

export function promoteRefactorActivation(input: { readonly currentLevel: RefactorActivationLevel; readonly nextLevel: RefactorActivationLevel; readonly repositoryId: string; readonly targetRevision: string; readonly receipts: readonly RefactorCanaryReceiptV1[]; readonly observedAt: string }): RefactorActivationEventV1 {
  if (!input.repositoryId || !/^[a-f0-9]{40,64}$/u.test(input.targetRevision) || !/^\d{4}-\d{2}-\d{2}T/u.test(input.observedAt)) invalid('activation identity is invalid');
  const currentIndex = REFACTOR_ACTIVATION_LEVELS.indexOf(input.currentLevel); if (currentIndex < 0 || REFACTOR_ACTIVATION_LEVELS[currentIndex + 1] !== input.nextLevel) invalid(`activation must advance exactly one level after ${input.currentLevel}`);
  const required = REFACTOR_CANARIES_BY_LEVEL[input.nextLevel as Exclude<RefactorActivationLevel, 'off'>]; const receipts = input.receipts.map(validateRefactorCanaryReceipt); const byId = new Map(receipts.map((entry) => [entry.canaryId, entry]));
  for (const id of required) { const receipt = byId.get(id); if (!receipt) invalid(`missing canary receipt: ${id}`); if (!receipt.passed) invalid(`canary did not pass: ${id}`); if (receipt.repositoryId !== input.repositoryId || receipt.targetRevision !== input.targetRevision) invalid(`canary is not bound to this repository revision: ${id}`); }
  const canaryReceiptSha256 = required.map((id) => byId.get(id)!.receiptSha256); const basis = { protocol: REFACTOR_ACTIVATION_PROTOCOL, kind: 'refactor_activation_event' as const, repositoryId: input.repositoryId, previousLevel: input.currentLevel, nextLevel: input.nextLevel, targetRevision: input.targetRevision, canaryReceiptSha256, observedAt: input.observedAt };
  return Object.freeze({ ...basis, canaryReceiptSha256: Object.freeze(canaryReceiptSha256), eventSha256: canonicalMessageDigest(basis) });
}

export function validateRefactorActivationEvent(value: RefactorActivationEventV1): RefactorActivationEventV1 { exactKeys(value, ['canaryReceiptSha256', 'eventSha256', 'kind', 'nextLevel', 'observedAt', 'previousLevel', 'protocol', 'repositoryId', 'targetRevision'], 'activation event'); if (value.protocol !== REFACTOR_ACTIVATION_PROTOCOL || value.kind !== 'refactor_activation_event' || !REFACTOR_ACTIVATION_LEVELS.includes(value.previousLevel) || !REFACTOR_ACTIVATION_LEVELS.includes(value.nextLevel) || REFACTOR_ACTIVATION_LEVELS[REFACTOR_ACTIVATION_LEVELS.indexOf(value.previousLevel) + 1] !== value.nextLevel || !value.repositoryId || !/^[a-f0-9]{40,64}$/u.test(value.targetRevision) || !/^\d{4}-\d{2}-\d{2}T/u.test(value.observedAt) || !Array.isArray(value.canaryReceiptSha256)) invalid('activation event identity is invalid'); value.canaryReceiptSha256.forEach((entry) => sha(entry, 'canary receipt sha256')); const required = REFACTOR_CANARIES_BY_LEVEL[value.nextLevel as Exclude<RefactorActivationLevel, 'off'>]; if (value.canaryReceiptSha256.length !== required.length) invalid('activation event canary set is invalid'); const basis = { protocol: value.protocol, kind: value.kind, repositoryId: value.repositoryId, previousLevel: value.previousLevel, nextLevel: value.nextLevel, targetRevision: value.targetRevision, canaryReceiptSha256: value.canaryReceiptSha256, observedAt: value.observedAt }; if (canonicalMessageDigest(basis) !== value.eventSha256) invalid('activation event digest is invalid'); return Object.freeze(value); }

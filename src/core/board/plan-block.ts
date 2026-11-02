/**
 * The plan block: one fenced JSON block in the newest `repo-harness plan`
 * comment on a parent issue. The coordinator is its only writer. GitHub owns
 * membership (sub-issues), dependencies (blocked-by) and tier (labels); the
 * block holds only what GitHub has no field for.
 */
export const PLAN_BLOCK_PROTOCOL = 1 as const;
export const PLAN_BLOCK_KIND = 'repo-harness.plan' as const;
/** The member cap of an integration batch (`orchestrator.md` §9.1). */
export const PLAN_BATCH_MAX_MEMBERS = 6;

export interface PlanHoldV1 {
  readonly issue: number;
  readonly reason: string;
}

export interface PlanBlockV1 {
  readonly protocol: typeof PLAN_BLOCK_PROTOCOL;
  readonly kind: typeof PLAN_BLOCK_KIND;
  /** Issue numbers in merge order. */
  readonly merge_order: readonly number[];
  readonly holds: readonly PlanHoldV1[];
  /** Issue numbers that merge as one integration batch. */
  readonly batches: readonly (readonly number[])[];
  /** The most worker seats that run at the same time. */
  readonly seat_limits: { readonly worker: number };
}

export class PlanBlockError extends Error {
  constructor(message: string) {
    super(`plan block invalid: ${message}`);
    this.name = 'PlanBlockError';
  }
}

const FENCE = /^```json[ \t]*\n([\s\S]*?)\n```[ \t]*$/gmu;

function fail(message: string): never {
  throw new PlanBlockError(message);
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} is not an object`);
  const actual = Object.keys(value).sort().join(',');
  if (actual !== [...keys].sort().join(',')) fail(`${label} fields are ${actual}, expected ${[...keys].sort().join(',')}`);
  return value as Record<string, unknown>;
}

function issueNumber(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} is not an issue number`);
  return value as number;
}

function issueList(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  const numbers = value.map((entry, index) => issueNumber(entry, `${label}[${index}]`));
  if (new Set(numbers).size !== numbers.length) fail(`${label} repeats an issue`);
  return numbers;
}

/** Protocol and kind are checked first, so an unknown block is refused before any field is read. */
export function decodePlanBlockValue(value: unknown): PlanBlockV1 {
  const head = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  if (head.protocol !== PLAN_BLOCK_PROTOCOL) fail(`unsupported protocol ${JSON.stringify(head.protocol)}`);
  if (head.kind !== PLAN_BLOCK_KIND) fail(`unsupported kind ${JSON.stringify(head.kind)}`);
  const block = record(value, ['protocol', 'kind', 'merge_order', 'holds', 'batches', 'seat_limits'], 'plan block');
  const mergeOrder = issueList(block.merge_order, 'merge_order');
  if (!Array.isArray(block.holds)) fail('holds is not an array');
  const holds = block.holds.map((entry, index) => {
    const hold = record(entry, ['issue', 'reason'], `holds[${index}]`);
    if (typeof hold.reason !== 'string' || hold.reason.trim() === '') fail(`holds[${index}].reason is empty`);
    return Object.freeze({ issue: issueNumber(hold.issue, `holds[${index}].issue`), reason: hold.reason });
  });
  if (new Set(holds.map(hold => hold.issue)).size !== holds.length) fail('holds repeats an issue');
  if (!Array.isArray(block.batches)) fail('batches is not an array');
  const batches = block.batches.map((entry, index) => {
    const members = issueList(entry, `batches[${index}]`);
    if (members.length < 2 || members.length > PLAN_BATCH_MAX_MEMBERS) fail(`batches[${index}] has ${members.length} members, expected 2-${PLAN_BATCH_MAX_MEMBERS}`);
    return Object.freeze(members);
  });
  const batched = batches.flat();
  if (new Set(batched).size !== batched.length) fail('an issue is in more than one batch');
  const limits = record(block.seat_limits, ['worker'], 'seat_limits');
  return Object.freeze({
    protocol: PLAN_BLOCK_PROTOCOL,
    kind: PLAN_BLOCK_KIND,
    merge_order: Object.freeze(mergeOrder),
    holds: Object.freeze(holds),
    batches: Object.freeze(batches),
    seat_limits: Object.freeze({ worker: issueNumber(limits.worker, 'seat_limits.worker') }),
  });
}

/** The comment must hold exactly one fenced `json` block. */
export function decodePlanBlock(commentBody: string): PlanBlockV1 {
  const blocks = [...commentBody.replace(/\r\n/gu, '\n').matchAll(FENCE)];
  if (blocks.length !== 1) fail(`the plan comment has ${blocks.length} fenced json blocks, expected 1`);
  let value: unknown;
  try {
    value = JSON.parse(blocks[0]![1]!);
  } catch {
    fail('the fenced block is not JSON');
  }
  return decodePlanBlockValue(value);
}

/** Every issue that the block names. */
export function planIssues(block: PlanBlockV1): ReadonlySet<number> {
  return new Set([...block.merge_order, ...block.holds.map(hold => hold.issue), ...block.batches.flat()]);
}

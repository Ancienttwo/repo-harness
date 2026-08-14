import { createHash } from 'crypto';

export const RUNTIME_EVIDENCE_RECEIPT_PROTOCOL = 1 as const;

export const RUNTIME_EVIDENCE_INVARIANTS = [
  'published_tarball',
  'clean_install',
  'installed_hook_readback',
] as const;

export type RuntimeEvidenceInvariant = (typeof RUNTIME_EVIDENCE_INVARIANTS)[number];

export interface RuntimeEvidenceObservation {
  readonly invariant: RuntimeEvidenceInvariant;
  readonly status: 'pass';
  readonly evidence_sha256: string;
  readonly detail: string;
}

export interface RuntimeEvidenceReceipt {
  readonly protocol: typeof RUNTIME_EVIDENCE_RECEIPT_PROTOCOL;
  readonly kind: 'repo-harness-runtime-evidence-receipt';
  readonly package_name: string;
  readonly package_version: string;
  readonly tarball_sha512: string;
  readonly observations: readonly RuntimeEvidenceObservation[];
  readonly receipt_sha256: string;
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function runtimeEvidenceSha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function isSha512(value: unknown): value is string {
  return typeof value === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function validateObservation(value: unknown): RuntimeEvidenceObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime evidence observation must be an object');
  const record = value as Record<string, unknown>;
  if (!RUNTIME_EVIDENCE_INVARIANTS.includes(record.invariant as RuntimeEvidenceInvariant)) {
    throw new Error('runtime evidence observation invariant is invalid');
  }
  if (record.status !== 'pass') throw new Error('runtime evidence observation must be pass');
  if (typeof record.evidence_sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(record.evidence_sha256)) {
    throw new Error('runtime evidence observation fingerprint is invalid');
  }
  if (typeof record.detail !== 'string' || record.detail.trim() === '') throw new Error('runtime evidence observation detail is invalid');
  return Object.freeze({
    invariant: record.invariant as RuntimeEvidenceInvariant,
    status: 'pass',
    evidence_sha256: record.evidence_sha256,
    detail: record.detail,
  });
}

/**
 * Runtime evidence has a release lifecycle, not an acceptance lifecycle. The
 * receipt proves a published package ran after a clean install; it deliberately
 * has no task contract, review subject, or merge disposition fields.
 */
export function buildRuntimeEvidenceReceipt(input: Omit<RuntimeEvidenceReceipt, 'protocol' | 'kind' | 'receipt_sha256'>): RuntimeEvidenceReceipt {
  if (!/^@?[a-z0-9][a-z0-9._/-]*$/u.test(input.package_name)) throw new Error('runtime evidence package name is invalid');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(input.package_version)) {
    throw new Error('runtime evidence package version is invalid');
  }
  if (!isSha512(input.tarball_sha512)) throw new Error('runtime evidence tarball sha512 is invalid');
  const observations = input.observations.map(validateObservation)
    .sort((left, right) => RUNTIME_EVIDENCE_INVARIANTS.indexOf(left.invariant) - RUNTIME_EVIDENCE_INVARIANTS.indexOf(right.invariant));
  if (observations.length !== RUNTIME_EVIDENCE_INVARIANTS.length
    || observations.some((entry, index) => entry.invariant !== RUNTIME_EVIDENCE_INVARIANTS[index])) {
    throw new Error('runtime evidence receipt must contain each required invariant exactly once');
  }
  const basis: Omit<RuntimeEvidenceReceipt, 'receipt_sha256'> = {
    protocol: RUNTIME_EVIDENCE_RECEIPT_PROTOCOL,
    kind: 'repo-harness-runtime-evidence-receipt',
    package_name: input.package_name,
    package_version: input.package_version,
    tarball_sha512: input.tarball_sha512,
    observations,
  };
  return Object.freeze({ ...basis, receipt_sha256: runtimeEvidenceSha256(basis) });
}

export function validateRuntimeEvidenceReceipt(value: unknown): RuntimeEvidenceReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime evidence receipt must be an object');
  const record = value as Record<string, unknown>;
  if (record.protocol !== RUNTIME_EVIDENCE_RECEIPT_PROTOCOL || record.kind !== 'repo-harness-runtime-evidence-receipt') {
    throw new Error('runtime evidence receipt kind/protocol is invalid');
  }
  if (!Array.isArray(record.observations)) throw new Error('runtime evidence receipt observations are invalid');
  const receipt = buildRuntimeEvidenceReceipt({
    package_name: record.package_name as string,
    package_version: record.package_version as string,
    tarball_sha512: record.tarball_sha512 as string,
    observations: record.observations as RuntimeEvidenceObservation[],
  });
  if (receipt.receipt_sha256 !== record.receipt_sha256) throw new Error('runtime evidence receipt fingerprint is stale');
  return receipt;
}

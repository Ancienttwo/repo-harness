import { byteCompare } from '../evidence/byte-compare';
import { sha256Prefixed } from '../evidence/sha256';

/** Stable JSON is the single byte contract for publication-domain digests. */
export function stablePublicationJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePublicationJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${stablePublicationJson(record[key])}`).join(',')}}`;
}

export function publicationSha256(value: string | Buffer): string {
  return sha256Prefixed(value);
}

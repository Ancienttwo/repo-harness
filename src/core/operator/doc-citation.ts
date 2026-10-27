import { createHash } from 'node:crypto';

/**
 * G8 reference protocol. A citation names whole lines of one file at one
 * commit. A line is its bytes up to and including its `\n`; the last line may
 * have none. `range_sha256` is the sha256 of the cited lines' UTF-8 bytes,
 * line ends included; `file_sha256` is the sha256 of the whole file.
 */
export interface DocCitationV1 {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly range_sha256: string;
  readonly file_sha256: string;
  readonly commit: string;
}

/** Where the cited lines are in the file the session starts from. */
export type DocCitationCheck =
  | { readonly state: 'current' | 'relocated'; readonly start_line: number; readonly end_line: number }
  | { readonly state: 'stale' };

// Each relocation candidate is hashed, so the line cap bounds the work of one check.
export const DOC_CITATION_MAX_LINES = 500;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const CITATION_KEYS = ['commit', 'end_line', 'file_sha256', 'path', 'range_sha256', 'start_line'];

const sha256 = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

/**
 * Closed decoder for one citation. `path` is returned as sent; the caller owns
 * which paths a session may cite.
 */
export function decodeDocCitation(value: unknown): DocCitationV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('citation must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== CITATION_KEYS.length || keys.some((key, index) => key !== CITATION_KEYS[index])) throw new Error('citation keys');
  const { path, start_line, end_line, range_sha256, file_sha256, commit } = record;
  if (typeof path !== 'string') throw new Error('citation path');
  if (!Number.isSafeInteger(start_line) || !Number.isSafeInteger(end_line)) throw new Error('citation lines');
  const start = start_line as number;
  const end = end_line as number;
  if (start < 1 || end < start || end - start + 1 > DOC_CITATION_MAX_LINES) throw new Error('citation lines');
  if (typeof range_sha256 !== 'string' || !SHA256_HEX.test(range_sha256)) throw new Error('citation range_sha256');
  if (typeof file_sha256 !== 'string' || !SHA256_HEX.test(file_sha256)) throw new Error('citation file_sha256');
  if (typeof commit !== 'string' || !COMMIT.test(commit)) throw new Error('citation commit');
  return { path, start_line: start, end_line: end, range_sha256, file_sha256, commit };
}

/**
 * The cited lines are current when their hash matches at the cited place.
 * Otherwise they are relocated when the same lines occur at exactly one other
 * place, and stale when they occur nowhere or more than once.
 */
export function checkDocCitation(citation: DocCitationV1, text: string): DocCitationCheck {
  // offsets[i] is where line i + 1 starts; the last entry is the end of the text.
  const offsets = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) offsets.push(index + 1);
  if (offsets.at(-1) !== text.length) offsets.push(text.length);
  const lineCount = offsets.length - 1;
  const count = citation.end_line - citation.start_line + 1;
  const at = (start: number) => sha256(text.slice(offsets[start - 1], offsets[start - 1 + count])) === citation.range_sha256;
  if (citation.end_line <= lineCount && at(citation.start_line)) {
    return { state: 'current', start_line: citation.start_line, end_line: citation.end_line };
  }
  let found: number | null = null;
  for (let start = 1; start + count - 1 <= lineCount; start++) {
    if (!at(start)) continue;
    if (found !== null) return { state: 'stale' };
    found = start;
  }
  return found === null ? { state: 'stale' } : { state: 'relocated', start_line: found, end_line: found + count - 1 };
}

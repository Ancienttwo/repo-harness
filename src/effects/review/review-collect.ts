import { readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { hcGet } from '../terminal/herdr-core';
import { piAgentDir } from '../pi-agent-dir';
import { osAccountHome } from '../runtime/os-account-home';
import { errorMessage } from '../../core/evidence/error-message';
import {
  parseReceipt, publishReceipt, ReviewPublishError, type ReviewPublishInput, type ReviewPublishResult,
} from './review-publish';

const MARKER = 'RECEIPT-JSON';
const RECEIPT_KIND = 'repo-harness-review-publish-receipt';

export interface ReviewCollectInput extends ReviewPublishInput {
  /** The Pi review seat's `hc` terminal address. */
  readonly seat: string;
}

const invalid = (message: string) => new ReviewPublishError('review_receipt_invalid', message, 2);

/** The directory pi-coding-agent's `getDefaultSessionDirPath` names: agent dir, `sessions`, then the cwd without its leading separator, `/`, `\\` and `:` as `-`, wrapped in `--`. */
function sessionDirectory(agentDir: string, cwd: string): string {
  return join(agentDir, 'sessions', '--' + resolve(cwd).replace(/^[/\\]/, '').replace(/[/\\:]/g, '-') + '--');
}

function newestSession(directory: string): string {
  let files: { path: string; mtime: number }[];
  try {
    files = readdirSync(directory).filter((name) => name.endsWith('.jsonl'))
      .map((name) => ({ path: join(directory, name), mtime: statSync(join(directory, name)).mtimeMs }));
  } catch (error) {
    throw invalid('the seat session record is missing: ' + errorMessage(error));
  }
  if (files.length === 0) throw invalid('the seat session record is missing: no .jsonl file in ' + directory);
  return files.sort((a, b) => b.mtime - a.mtime)[0]!.path;
}

function assistantTexts(path: string): string[] {
  const texts: string[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry?.message;
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const part of message.content) if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text);
  }
  return texts;
}

/** The JSON value that starts right after a marker (past an optional code fence); the decoder, not a fence regex, finds where it ends. */
function decodeAfterMarker(text: string, markerEnd: number): unknown {
  const rest = text.slice(markerEnd).replace(/^:?\s*(```[a-z]*)?\s*/, '');
  if (!rest.startsWith('{') && !rest.startsWith('[')) return undefined;
  for (let end = 0; end < rest.length; end++) {
    if (rest[end] !== '}' && rest[end] !== ']') continue;
    try { return JSON.parse(rest.slice(0, end + 1)); } catch { /* the value ends later */ }
  }
  return undefined;
}

/** The last value after any marker that decodes to a receipt object; a marker inside a string decodes to nothing and is skipped. */
function lastReceiptValue(texts: readonly string[]): unknown {
  let marked = false;
  let found: unknown;
  for (const text of texts) {
    for (let at = text.indexOf(MARKER); at >= 0; at = text.indexOf(MARKER, at + MARKER.length)) {
      marked = true;
      const value = decodeAfterMarker(text, at + MARKER.length);
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && (value as { kind?: unknown }).kind === RECEIPT_KIND) found = value;
    }
  }
  if (!marked) throw invalid('the seat session has no ' + MARKER + ' block');
  if (found === undefined) throw invalid('no ' + MARKER + ' block decodes to a ' + RECEIPT_KIND + ' object');
  return found;
}

export function collectReview(input: ReviewCollectInput): ReviewPublishResult {
  const cwd = hcGet(input.seat).cwd;
  if (cwd == null) throw invalid('terminal ' + input.seat + ' reports no working directory');
  let realCwd: string;
  try { realCwd = realpathSync(cwd); } catch (error) { throw invalid('the seat working directory is unreadable: ' + errorMessage(error)); }
  const session = newestSession(sessionDirectory(piAgentDir(osAccountHome()), realCwd));
  const receipt = parseReceipt(lastReceiptValue(assistantTexts(session)));
  return publishReceipt(input, receipt);
}

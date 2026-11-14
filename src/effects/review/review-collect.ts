import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { hcGet } from '../terminal/herdr-core';
import { osAccountHome } from '../runtime/os-account-home';
import { errorMessage } from '../../core/evidence/error-message';
import {
  parseReceipt, publishReceipt, ReviewPublishError, type ReviewPublishInput, type ReviewPublishResult,
} from './review-publish';

const MARKER = 'RECEIPT-JSON';

export interface ReviewCollectInput extends ReviewPublishInput {
  /** The Pi review seat's `hc` terminal address. */
  readonly seat: string;
}

const invalid = (message: string) => new ReviewPublishError('review_receipt_invalid', message, 2);

/** Pi names a session directory after the worktree path: `--` + path without its leading `/`, `/` as `-`, + `--`. */
function sessionDirectory(root: string, cwd: string): string {
  return join(root, '--' + cwd.replace(/^\/+/, '').replace(/\/+/g, '-') + '--');
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

/** Decode the first JSON value after the last marker; the decoder, not a fence regex, finds where it ends. */
function lastReceiptValue(texts: readonly string[]): unknown {
  const text = texts.filter((entry) => entry.includes(MARKER)).at(-1);
  if (text === undefined) throw invalid('the seat session has no ' + MARKER + ' block');
  const rest = text.slice(text.lastIndexOf(MARKER) + MARKER.length);
  const start = rest.indexOf('{');
  if (start < 0) throw invalid('the ' + MARKER + ' block has no JSON object');
  const body = rest.slice(start);
  // The object ends at a closing brace; try each from the end until it decodes, so trailing prose or a closing fence is ignored.
  for (let end = body.lastIndexOf('}'); end >= 0; end = body.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(body.slice(0, end + 1)); } catch { /* try a shorter prefix */ }
  }
  throw invalid('the ' + MARKER + ' block does not decode as JSON');
}

export function collectReview(input: ReviewCollectInput): ReviewPublishResult {
  const cwd = hcGet(input.seat).cwd;
  if (cwd == null) throw invalid('terminal ' + input.seat + ' reports no working directory');
  const session = newestSession(sessionDirectory(join(osAccountHome(), '.pi', 'agent', 'sessions'), cwd));
  const receipt = parseReceipt(lastReceiptValue(assistantTexts(session)));
  return publishReceipt(input, receipt);
}

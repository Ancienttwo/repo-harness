/** Read historical publication receipts. */
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join } from 'path';
import { validatePublicationReceipt, type PublicationReceiptV3 } from '../../core/publication/publication-receipt';
import { resolveGitCommonDirectory } from '../git/common-directory';

export const PUBLICATION_RECEIPTS_RELATIVE_PATH = 'repo-harness/publications/v1';
export type PublicationErrorCode = 'publication_incomplete' | 'publication_claim_mismatch';
export class PublicationReceiptError extends Error {
  constructor(readonly code: PublicationErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PublicationReceiptError';
  }
}

function incomplete(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_incomplete', message, cause);
}

function mismatch(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_claim_mismatch', message, cause);
}

function readRegular(path: string, label: string): Buffer {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw incomplete(`${label} is unavailable: ${path}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw incomplete(`${label} must be a regular file: ${path}`);
  try {
    return readFileSync(path);
  } catch (error) {
    throw incomplete(`${label} is unreadable: ${path}`, error);
  }
}

function receiptDirectory(repoRoot: string, gitBin: string): string {
  return join(resolveGitCommonDirectory(repoRoot, gitBin), PUBLICATION_RECEIPTS_RELATIVE_PATH);
}

export function publicationReceiptPath(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(publicationId)) throw incomplete('publication id is invalid');
  return join(receiptDirectory(repoRoot, gitBin), `${publicationId.slice('sha256:'.length)}.json`);
}

export function readPublicationReceiptCache(repoRoot: string, publicationId: string, gitBin = 'git'): PublicationReceiptV3 | null {
  const path = publicationReceiptPath(repoRoot, publicationId, gitBin);
  if (!existsSync(path)) return null;
  try {
    return validatePublicationReceipt(JSON.parse(readRegular(path, 'publication receipt cache').toString('utf-8')));
  } catch (error) {
    throw mismatch(`cached publication receipt is invalid: ${path}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}

import { constants, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'fs';
import { join } from 'path';
import { refactorResolutionEvidenceInvariantIssues, type RefactorResolutionEvidenceV1 } from 'archctx-contracts';

import { canonicalize } from '../../core/evidence/canonical-json';
import { resolveGitCommonDirectory } from '../git/common-directory';

export class RefactorResolutionStoreError extends Error { readonly code = 'refactor_resolution_store_conflict' as const; constructor(message: string, readonly cause?: unknown) { super(message); this.name = 'RefactorResolutionStoreError'; } }
function fail(message: string, cause?: unknown): never { throw new RefactorResolutionStoreError(message, cause); }
function root(repoRoot: string, programId: string): string { return join(resolveGitCommonDirectory(repoRoot), 'repo-harness', 'refactor-programs', 'v1', 'resolutions', Buffer.from(programId).toString('hex')); }
function validate(value: unknown): RefactorResolutionEvidenceV1 { const evidence = value as RefactorResolutionEvidenceV1; const issues = refactorResolutionEvidenceInvariantIssues(evidence); if (issues.length) fail(`invalid resolution evidence: ${issues.join('; ')}`); return evidence; }

export function persistRefactorResolution(repoRoot: string, programId: string, input: RefactorResolutionEvidenceV1): void {
  const evidence = validate(input); const directory = root(repoRoot, programId); mkdirSync(directory, { recursive: true, mode: 0o700 }); const stat = lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('resolution store is unsafe');
  const path = join(directory, `${evidence.resolutionDigest.slice('sha256:'.length)}.json`); const bytes = Buffer.from(`${canonicalize(evidence as never)}\n`);
  if (existsSync(path)) { if (!readFileSync(path).equals(bytes)) fail('resolution digest names different bytes'); return; }
  let descriptor: number; try { descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (error) { return fail('cannot create resolution evidence', error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset); } finally { closeSync(descriptor); }
}

export function readRefactorResolutions(repoRoot: string, programId: string): readonly RefactorResolutionEvidenceV1[] {
  const directory = root(repoRoot, programId); if (!existsSync(directory)) return Object.freeze([]); const stat = lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('resolution store is unsafe');
  return Object.freeze(readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).sort().map((name) => { const value = validate(JSON.parse(readFileSync(join(directory, name), 'utf8'))); if (`${value.resolutionDigest.slice('sha256:'.length)}.json` !== name) fail('resolution filename does not bind its evidence'); return value; }));
}

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { constants, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'fs';
import { join } from 'path';

import { canonicalRefactorExecutionBindingBytes, validateRefactorExecutionBinding, type RefactorExecutionBindingV1 } from '../../core/refactor/execution-binding';
import { validateRefactorCandidateVerificationReceipt, type RefactorCandidateVerificationReceiptV1 } from '../../core/refactor/candidate-verification';
import { validateRefactorProgram, type RefactorProgramV1 } from '../../core/refactor/program';
import { resolveGitCommonDirectory } from '../git/common-directory';

export class RefactorExecutionBindingStoreError extends Error {
  constructor(readonly code: 'refactor_execution_binding_conflict' | 'refactor_execution_binding_stale' | 'refactor_execution_binding_unsafe', message: string, readonly cause?: unknown) { super(message); this.name = 'RefactorExecutionBindingStoreError'; }
}
function fail(code: RefactorExecutionBindingStoreError['code'], message: string, cause?: unknown): never { throw new RefactorExecutionBindingStoreError(code, message, cause); }
const sha = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function directory(root: string, programId: string): string { return join(resolveGitCommonDirectory(root), 'repo-harness', 'refactor-programs', 'v1', 'execution-bindings', Buffer.from(programId).toString('hex')); }
function ensure(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('refactor_execution_binding_unsafe', 'execution binding store is unsafe'); }
function git(root: string, args: string[]): string { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) { return fail('refactor_execution_binding_stale', `git ${args[0]} could not verify execution binding`, error); } }

export function appendRefactorExecutionBinding(input: { readonly repo_root: string; readonly program: RefactorProgramV1; readonly candidate_verification: RefactorCandidateVerificationReceiptV1; readonly binding: RefactorExecutionBindingV1 }): RefactorExecutionBindingV1 {
  const program = validateRefactorProgram(input.program); const candidate = validateRefactorCandidateVerificationReceipt(input.candidate_verification); const binding = validateRefactorExecutionBinding(input.binding);
  const programBinding = program.bindings.find((entry) => entry.recommendationId === binding.recommendationId);
  if (!programBinding || programBinding.recommendationDigest !== binding.recommendationDigest) fail('refactor_execution_binding_conflict', 'execution binding does not belong to the Refactor Program');
  if (candidate.recommendationId !== binding.recommendationId || candidate.recommendationDigest !== binding.recommendationDigest || candidate.taskId !== binding.taskId || candidate.taskRevision !== binding.taskRevision
    || candidate.contractPath !== binding.contractPath || candidate.contractSha256 !== binding.contractSha256 || candidate.cutoverClosureSha256 !== binding.cutoverClosureSha256 || candidate.acceptanceReceiptSha256 !== binding.acceptanceReceiptSha256) fail('refactor_execution_binding_conflict', 'execution binding does not match its candidate verification receipt');
  if (sha(execFileSync('git', ['show', `${candidate.candidateHeadSha}:${binding.planPath}`], { cwd: input.repo_root })) !== binding.planSha256) fail('refactor_execution_binding_stale', 'execution binding plan bytes are stale');
  if (sha(execFileSync('git', ['show', `${candidate.candidateHeadSha}:${binding.contractPath}`], { cwd: input.repo_root })) !== binding.contractSha256) fail('refactor_execution_binding_stale', 'execution binding contract bytes are stale');
  if (git(input.repo_root, ['rev-parse', '--verify', `${binding.pullRequestHeadSha}^{commit}`]) !== binding.pullRequestHeadSha || git(input.repo_root, ['rev-parse', '--verify', `${binding.mergeCommitSha}^{commit}`]) !== binding.mergeCommitSha) fail('refactor_execution_binding_stale', 'execution binding commit identity is stale');
  try { execFileSync('git', ['merge-base', '--is-ancestor', binding.pullRequestHeadSha, binding.mergeCommitSha], { cwd: input.repo_root, stdio: 'ignore' }); } catch (error) { return fail('refactor_execution_binding_stale', 'pull request head is not an ancestor of the merge commit', error); }
  const root = directory(input.repo_root, program.programId); ensure(root); const path = join(root, `${binding.bindingSha256.slice('sha256:'.length)}.json`); const bytes = Buffer.from(`${canonicalRefactorExecutionBindingBytes(binding)}\n`);
  if (existsSync(path)) { if (!readFileSync(path).equals(bytes)) fail('refactor_execution_binding_conflict', 'binding digest names different immutable bytes'); return binding; }
  let descriptor: number; try { descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (error) { return fail('refactor_execution_binding_conflict', 'cannot create execution binding', error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset); } finally { closeSync(descriptor); }
  return binding;
}

export function readRefactorExecutionBindings(repoRoot: string, programId: string): readonly RefactorExecutionBindingV1[] {
  const root = directory(repoRoot, programId); if (!existsSync(root)) return Object.freeze([]); ensure(root);
  return Object.freeze(readdirSync(root).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).sort().map((name) => {
    const value = validateRefactorExecutionBinding(JSON.parse(readFileSync(join(root, name), 'utf8'))); if (`${value.bindingSha256.slice('sha256:'.length)}.json` !== name) fail('refactor_execution_binding_conflict', 'execution binding filename does not bind its bytes'); return value;
  }));
}

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { observationReadFileSync as readFileSync } from '../readonly-observation';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { validateVerificationPlan, type VerificationPlan } from '../../core/evidence/verification-plan';

/** The operator-selected catalog is outside the candidate execution workspace.
 * Its frozen bytes authorize eval grading only, never review acceptance. */
export interface EvalCatalogSource {
  readonly catalog_path: string;
  readonly catalog_sha256: string;
  readonly eval_id: string;
  readonly eval_sha256: string;
}

function digest(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
function entryDigest(entry: unknown): string { return digest(canonicalize(entry as JsonValue)); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid eval catalog ${label}`);
  return value as Record<string, unknown>;
}
function entryFromBytes(bytes: Buffer, id: string): Record<string, unknown> {
  const manifest = object(JSON.parse(bytes.toString('utf8')), 'manifest');
  if (manifest.skill_name !== 'repo-harness' || !Array.isArray(manifest.evals)) throw new Error('invalid eval catalog manifest');
  const entries = manifest.evals.map(value => object(value, 'entry'));
  const selected = entries.filter(entry => String(entry.id) === id);
  if (selected.length !== 1) throw new Error('eval catalog selection must be unique');
  const entry = selected[0]!;
  if (!Number.isSafeInteger(entry.id) || typeof entry.slug !== 'string' || !entry.slug.trim()
    || entries.filter(candidate => candidate.slug === entry.slug).length !== 1) throw new Error('invalid eval catalog identity');
  return entry;
}

/** Capture before any candidate command. Reject a mismatch with the already
 * selected prompt/entry, so one run cannot mix two catalog revisions. */
export function captureEvalCatalogSource<T extends { readonly id: number }>(path: string, selected: T): EvalCatalogSource {
  const catalog_path = realpathSync(path);
  const bytes = readFileSync(catalog_path);
  const eval_id = String(selected.id);
  const entry = entryFromBytes(bytes, eval_id);
  const eval_sha256 = entryDigest(entry);
  if (eval_sha256 !== entryDigest(selected)) throw new Error('eval catalog changed during selection');
  return Object.freeze({ catalog_path, catalog_sha256: digest(bytes), eval_id, eval_sha256 });
}

function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`invalid eval catalog ${label}`);
  return value as string[];
}
function predicates(value: unknown, label: string): { path: string; pattern: string }[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`invalid eval catalog ${label}`);
  return value.map(raw => {
    const item = object(raw, label);
    if (typeof item.path !== 'string' || typeof item.pattern !== 'string') throw new Error(`invalid eval catalog ${label}`);
    return { path: item.path, pattern: item.pattern };
  });
}
function quote(value: string): string {
  if (!value.length) return "''";
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function planForEntry(entry: Record<string, unknown>): VerificationPlan {
  const graders = object(entry.graders, 'graders');
  const anti = entry.anti_graders === undefined ? {} : object(entry.anti_graders, 'anti_graders');
  const commands = [...strings(graders.commands_succeed, 'commands_succeed')];
  for (const path of strings(graders.files_exist, 'files_exist')) commands.push(`test -e ${quote(path)}`);
  for (const { path, pattern } of predicates(graders.files_contain, 'files_contain')) {
    commands.push(`test -f ${quote(path)} && grep -Eq -- ${quote(pattern)} ${quote(path)}`);
  }
  for (const path of strings(anti.files_not_exist, 'files_not_exist')) commands.push(`test ! -e ${quote(path)}`);
  for (const { path, pattern } of predicates(anti.files_not_contain, 'files_not_contain')) {
    commands.push(`if [ ! -f ${quote(path)} ]; then exit 0; fi; grep_status=0; grep -Eq -- ${quote(pattern)} ${quote(path)} || grep_status=$?; test "$grep_status" -eq 1`);
  }
  if (!commands.length) throw new Error('eval catalog has no executable graders');
  return validateVerificationPlan({ protocol: 1, checks: commands.map((command, index) => ({
    id: `eval-grader-${index + 1}`, kind: 'command', command, cwd: '.', phase: 'verification', cost: 'normal',
    evidence_policy: 'current_exact', necessity: `Declared eval grader ${index + 1} must pass for ${entry.slug}.`,
    inputs: { env: ['PATH'] },
  })) });
}

export function readEvalCatalogPlan(repoRoot: string, source: EvalCatalogSource): VerificationPlan {
  const candidate = realpathSync(repoRoot), path = realpathSync(source.catalog_path);
  const within = relative(candidate, path);
  if (within === '' || (!isAbsolute(within) && within !== '..' && !within.startsWith('../') && !within.startsWith('..\\'))) {
    throw new Error('eval catalog must be outside the candidate workspace');
  }
  if (path !== source.catalog_path) throw new Error('eval catalog location changed');
  const bytes = readFileSync(path);
  if (digest(bytes) !== source.catalog_sha256) throw new Error('eval catalog changed');
  const entry = entryFromBytes(bytes, source.eval_id);
  if (entryDigest(entry) !== source.eval_sha256) throw new Error('eval catalog entry changed');
  return planForEntry(entry);
}

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import type { ArchitectureDebtItemV1, ArchitectureDebtReportV1 } from 'archctx-contracts';
import {
  ArchctxClientError,
  completeArchitectureDebt,
  indexPackageLocalCodeGraph,
  stopWorkspaceArchitectureDaemons,
  type ArchctxProviderOptions,
} from '../../effects/architecture/archctx-provider';

export interface ArchitectureDebtOutputV1 {
  kind: 'repo-harness-architecture-debt';
  head: { sha: string; debt: ArchitectureDebtReportV1 };
  base: null | { ref: string; sha: string; debtDigest: string; coverage: ArchitectureDebtReportV1['coverage']; coverageReasonCodes: string[] };
  /** Head items whose id is not in the base report, in id order. */
  introduced: null | ArchitectureDebtItemV1[];
  /** Base item ids that are not in the head report, in id order. */
  resolvedIds: null | string[];
}

interface ArchitectureDebtCommandOptions { json?: boolean; base?: string }

export function buildArchitectureDebtCommand(): Command {
  // A signal, not a gate: measured debt keeps exit 0. Only an operational failure exits 1.
  return new Command('architecture-debt')
    .description('Report ArchContext architecture debt at HEAD, and the debt that is new since a base ref')
    .option('--json', 'Output the debt report JSON')
    .option('--base <ref>', 'Compare with the debt of this commit, measured in a temporary checkout')
    .action((options: ArchitectureDebtCommandOptions) => {
      try {
        const output = architectureDebtReport(git(process.cwd(), ['rev-parse', '--show-toplevel']), options.base);
        process.stdout.write(options.json ? `${JSON.stringify(output, null, 2)}\n` : architectureDebtSummary(output));
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
    });
}

/**
 * Measures the debt at HEAD. With a base ref, it also measures the base commit
 * in a temporary detached checkout and compares the two reports by item id.
 * The ids are content identities, so they compare across checkouts.
 */
export function architectureDebtReport(repoRoot: string, baseRef: string | undefined, options: ArchctxProviderOptions = {}): ArchitectureDebtOutputV1 {
  const headSha = resolveCommit(repoRoot, 'HEAD');
  // An unresolvable base fails before archctx runs.
  const baseCommit = baseRef === undefined ? null : { ref: baseRef, sha: resolveCommit(repoRoot, baseRef) };
  const head = completeArchitectureDebt(repoRoot, headSha, options);
  if (baseCommit === null) return { kind: 'repo-harness-architecture-debt', head: { sha: headSha, debt: head }, base: null, introduced: null, resolvedIds: null };
  const base = withBaseCheckout(repoRoot, baseCommit.sha, options, (checkout) => {
    indexPackageLocalCodeGraph(checkout, options);
    return completeArchitectureDebt(checkout, baseCommit.sha, options);
  });
  const baseIds = new Set(base.items.map((item) => item.id));
  const headIds = new Set(head.items.map((item) => item.id));
  return {
    kind: 'repo-harness-architecture-debt',
    head: { sha: headSha, debt: head },
    base: { ...baseCommit, debtDigest: base.digest, coverage: base.coverage, coverageReasonCodes: base.coverageReasonCodes },
    // The decoder proved that both item lists are sorted by id.
    introduced: head.items.filter((item) => !baseIds.has(item.id)),
    resolvedIds: base.items.map((item) => item.id).filter((id) => !headIds.has(id)),
  };
}

export function architectureDebtSummary(output: ArchitectureDebtOutputV1): string {
  const debt = output.head.debt;
  const counts = new Map<string, number>();
  for (const item of debt.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const lines = [`architecture debt at HEAD ${output.head.sha.slice(0, 12)}: ${debt.items.length} items, coverage ${debt.coverage}`];
  for (const [kind, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) lines.push(`  ${kind}: ${count}`);
  if (debt.coverageReasonCodes.length > 0) lines.push(`  coverage gaps: ${debt.coverageReasonCodes.join(', ')}`);
  if (output.base && output.introduced && output.resolvedIds) {
    lines.push(`base ${output.base.ref} ${output.base.sha.slice(0, 12)}: coverage ${output.base.coverage}; introduced ${output.introduced.length}, resolved ${output.resolvedIds.length}`);
    if (output.base.coverageReasonCodes.length > 0) lines.push(`  base coverage gaps: ${output.base.coverageReasonCodes.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function resolveCommit(repoRoot: string, ref: string): string {
  const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], { encoding: 'utf8' });
  const sha = result.status === 0 ? result.stdout.trim() : '';
  if (!/^[a-f0-9]{40,64}$/.test(sha)) {
    throw new ArchctxClientError({ code: 'RH_ARCHITECTURE_DEBT_REF_UNRESOLVED', action: 'pass-a-commit-ref', reasonCode: 'ref-unresolved', details: { ref }, message: `${ref} does not resolve to a commit` });
  }
  return sha;
}

/**
 * The base checkout is always closed: its archctx daemons stop, the worktree is
 * removed, and its temporary parent directory is removed. A cleanup
 * failure is an error, also when the base run failed first.
 */
function withBaseCheckout<T>(repoRoot: string, sha: string, options: ArchctxProviderOptions, work: (checkout: string) => T): T {
  const parent = mkdtempSync(join(tmpdir(), 'repo-harness-debt-base-'));
  const checkout = join(parent, 'checkout');
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  // Hooks of the measured repository do not run in the temporary checkout.
  const added = spawnSync('git', ['-C', repoRoot, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', checkout, sha], { encoding: 'utf8' });
  if (added.status !== 0) {
    outcome = { ok: false, error: new ArchctxClientError({ code: 'RH_ARCHITECTURE_DEBT_CHECKOUT_FAILED', action: 'inspect-git-worktree', reasonCode: 'worktree-add-failed', details: { sha }, message: `git worktree add for ${sha} failed: ${added.stderr.trim()}` }) };
  } else {
    try { outcome = { ok: true, value: work(realpathSync(checkout)) }; }
    catch (error) { outcome = { ok: false, error }; }
  }
  const issues = closeBaseCheckout(repoRoot, parent, checkout, options);
  if (issues.length > 0) {
    const baseError = outcome.ok ? null : outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    throw new ArchctxClientError({
      code: 'RH_ARCHITECTURE_DEBT_CLEANUP_FAILED', action: 'remove-base-checkout', reasonCode: 'base-checkout-cleanup-failed',
      details: { checkout, issues, baseError },
      message: `the temporary base checkout ${checkout} was not fully closed: ${issues.join('; ')}${baseError === null ? '' : `; the base run also failed: ${baseError}`}`,
    });
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

function closeBaseCheckout(repoRoot: string, parent: string, checkout: string, options: ArchctxProviderOptions): string[] {
  const issues: string[] = [];
  if (existsSync(checkout)) {
    try {
      const report = stopWorkspaceArchitectureDaemons(repoRoot, realpathSync(checkout), options);
      for (const failure of report.failures) issues.push(`archctx daemon stop ${failure.stateDir ?? '(listing)'}: ${failure.code} ${failure.action}: ${failure.message}`);
    } catch (error) { issues.push(`archctx daemon stop: ${error instanceof Error ? error.message : String(error)}`); }
    const removed = spawnSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', checkout], { encoding: 'utf8' });
    if (removed.status !== 0) issues.push(`git worktree remove: ${removed.stderr.trim()}`);
  }
  try { rmdirSync(parent); }
  catch (error) { issues.push(`remove ${parent}: ${error instanceof Error ? error.message : String(error)}`); }
  return issues;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

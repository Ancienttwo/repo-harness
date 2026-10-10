import { Command } from 'commander';
import { canonicalRepoPath } from '../../effects/repo-registry';
import { decideRecommendation, recordRefactorScan, type RefactorDecision } from '../../effects/refactor/archctx-provider';
import {
  discoverRefactorRecommendations,
  observeRefactorRecommendations,
  refactorCandidates,
  type RefactorRecommendation,
  type RefactorRecommendationResult,
} from '../../effects/refactor/recommendations';

const DECISIONS: readonly RefactorDecision[] = ['accept', 'defer', 'reject'];

export function formatRefactorRecommendations(value: RefactorRecommendationResult): string {
  if (value.status !== 'recommended') return `[RefactorRecommendations] ${value.status}${value.message ? `: ${value.message}` : ''}\n`;
  return value.candidates.map(formatCandidate).join('\n');
}

function formatCandidate(entry: RefactorRecommendation, index: number): string {
  const metrics = Object.entries(entry.metrics).map(([key, metric]) => `${key}=${metric ?? 'n/a'}`).join(', ');
  const modules = entry.modules.map((module) => `  - ${module.nodeId}: ${module.files ?? '?'} files / ${module.lines ?? '?'} lines, fan-in ${module.fanIn ?? '?'}, fan-out ${module.fanOut ?? '?'}, cycles ${module.cycles ?? '?'}, direction violations ${module.directionViolations ?? '?'}, test files ${module.testFiles ?? '?'}, unresolved imports ${module.unresolvedImports}`);
  return [
    `${index + 1}. ${entry.kind} on ${entry.subject} (risk ${entry.risk}, confidence ${entry.confidence}, uncertainty ${entry.uncertainty})`,
    `  id: ${entry.recommendationId}`,
    ...entry.explanation.map((line) => `  ${line}`),
    ...(metrics ? [`  metrics: ${metrics}`] : []),
    ...(modules.length ? ['  modules:', ...modules.map((line) => `  ${line}`)] : []),
    '',
  ].join('\n');
}

/** ArchContext decides only recorded suggestions, so a fresh scan candidate is recorded first. */
export function decideRefactorRecommendation(root: string, recommendationId: string, decision: RefactorDecision, reason: string): string {
  const discovery = discoverRefactorRecommendations(root, {});
  if (!discovery.records.some((entry) => entry.recommendationId === recommendationId)) {
    if (!refactorCandidates(discovery).some((entry) => entry.recommendationId === recommendationId)) throw new Error(`unknown recommendation: ${recommendationId}`);
    recordRefactorScan(discovery.scan, root);
  }
  return decideRecommendation(recommendationId, decision, reason, root).status;
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

export function buildRefactorCommand(): Command {
  const command = new Command('refactor').description('Show measured refactor suggestions with their evidence and record the user decision');
  command.command('recommendations')
    .description('Show measured suggestions with evidence; never executes a refactor')
    .option('--repo <path>', 'Repository root', '.')
    .option('--json', 'Output machine-readable JSON')
    .action((options: { repo: string; json?: boolean }) => {
      const value = observeRefactorRecommendations(canonicalRepoPath(options.repo));
      process.stdout.write(options.json ? `${JSON.stringify(value, null, 2)}\n` : formatRefactorRecommendations(value));
      if (value.status === 'unavailable' || value.status === 'proof_required') process.exitCode = 1;
    });
  command.command('decide')
    .description('Record the user decision on one suggestion in ArchContext')
    .argument('<recommendation-id>')
    .argument('<decision>', DECISIONS.join('|'))
    .requiredOption('--reason <text>', 'Why the user decided this way')
    .option('--repo <path>', 'Repository root', '.')
    .action((recommendationId: string, decision: string, options: { reason: string; repo: string }) => {
      try {
        if (!DECISIONS.includes(decision as RefactorDecision)) throw new Error(`decision must be one of ${DECISIONS.join('|')}`);
        const status = decideRefactorRecommendation(canonicalRepoPath(options.repo), recommendationId, decision as RefactorDecision, options.reason);
        process.stdout.write(`${JSON.stringify({ recommendationId, status }, null, 2)}\n`);
      } catch (error) { fail(error); }
    });
  return command;
}

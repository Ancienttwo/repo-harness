import { Command, InvalidArgumentError } from 'commander';
import { RefactorProviderError } from '../../core/refactor/provider-contract';
import { canonicalRepoPath } from '../../effects/repo-registry';
import { decideRecommendation, type RefactorDecision } from '../../effects/refactor/archctx-provider';
import {
  observeRefactorRecommendations,
  type RefactorRecommendation,
  type RefactorRecommendationResult,
} from '../../effects/refactor/recommendations';

const DECISIONS: readonly RefactorDecision[] = ['accept', 'defer', 'reject'];
const EVIDENCE_ITEMS_SHOWN = 5;

export function formatRefactorRecommendations(value: RefactorRecommendationResult): string {
  if (value.status !== 'recommended') {
    const detail = [value.code, value.message].filter(Boolean).join(': ');
    return `[RefactorRecommendations] ${value.status}${detail ? `: ${detail}` : ''}${value.action ? ` (action: ${value.action})` : ''}\n`;
  }
  return value.candidates.map(formatCandidate).join('\n');
}

/** First lines of the bounded evidence sample; `--json` carries all of it. */
function evidenceLines(evidence: RefactorRecommendation['evidence']): string[] {
  const items = (() => {
    switch (evidence.kind) {
      case 'cycle':
      case 'residual-cycle': return evidence.edges.map((edge) => `${edge.fromPath}:${edge.fromLine ?? '?'} -> ${edge.toPath}`);
      case 'direction-violation': return evidence.violations.map((entry) => `${entry.constraintId}: ${entry.fromPath}:${entry.fromLine ?? '?'} -> ${entry.toPath}`);
      case 'evidence-gap': return evidence.unresolvedImports.map((entry) => `${entry.fromPath}:${entry.fromLine ?? '?'} imports ${entry.specifier}`);
      case 'ownership-ambiguous':
      case 'undeclared-footprint':
      case 'unowned-paths': return evidence.paths.map((entry) => entry.path);
    }
  })();
  return [
    `  evidence: ${evidence.kind}, ${evidence.totalCount} total${evidence.truncated ? ' (sample is truncated)' : ''}`,
    ...items.slice(0, EVIDENCE_ITEMS_SHOWN).map((line) => `    - ${line}`),
  ];
}

function formatCandidate(entry: RefactorRecommendation, index: number): string {
  const metrics = Object.entries(entry.metrics).map(([key, metric]) => `${key}=${metric ?? 'n/a'}`).join(', ');
  const modules = entry.modules.map((module) => `  - ${module.nodeId}: ${module.files ?? '?'} files / ${module.lines ?? '?'} lines, fan-in ${module.fanIn ?? '?'}, fan-out ${module.fanOut ?? '?'}, cycles ${module.cycles ?? '?'}, direction violations ${module.directionViolations ?? '?'}, unresolved imports ${module.unresolvedImports}`);
  return [
    `${index + 1}. ${entry.kind} on ${entry.subject} (risk ${entry.risk}, confidence ${entry.confidence}, uncertainty ${entry.uncertainty})`,
    `  id: ${entry.recommendationId}`,
    ...entry.explanation.map((line) => `  ${line}`),
    ...(metrics ? [`  metrics: ${metrics}`] : []),
    ...evidenceLines(entry.evidence),
    ...(entry.snapshot === 'earlier' ? [`  recorded on an earlier snapshot (${entry.baselineSnapshotDigest}); current module statistics are not shown`] : []),
    ...(modules.length ? ['  modules:', ...modules.map((line) => `  ${line}`)] : []),
    '',
  ].join('\n');
}

/** One archctx call decides a recorded suggestion or a fresh scan candidate. The limit must match the scan that produced the suggestion. */
export function decideRefactorRecommendation(root: string, recommendationId: string, decision: RefactorDecision, reason: string, importNodeLimit?: number): string {
  return decideRecommendation(recommendationId, decision, reason, root, {}, importNodeLimit).status;
}

function parseImportNodeLimit(value: string): number {
  if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new InvalidArgumentError('must be a positive integer');
  return Number(value);
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${error instanceof RefactorProviderError ? `${error.code}: ${message}${error.action ? ` (action: ${error.action})` : ''}` : message}\n`);
  process.exitCode = 1;
}

export function buildRefactorCommand(): Command {
  const command = new Command('refactor').description('Show measured refactor suggestions with their evidence and record the user decision');
  command.command('recommendations')
    .description('Show measured suggestions with evidence; never executes a refactor')
    .option('--repo <path>', 'Repository root', '.')
    .option('--import-node-limit <n>', 'Raise the CodeGraph import read cap; use the same value for decide', parseImportNodeLimit)
    .option('--json', 'Output machine-readable JSON')
    .action((options: { repo: string; importNodeLimit?: number; json?: boolean }) => {
      const value = observeRefactorRecommendations(canonicalRepoPath(options.repo), { importNodeLimit: options.importNodeLimit });
      process.stdout.write(options.json ? `${JSON.stringify(value, null, 2)}\n` : formatRefactorRecommendations(value));
      if (value.status === 'unavailable' || value.status === 'proof_required') process.exitCode = 1;
    });
  command.command('decide')
    .description('Record the user decision on one suggestion in ArchContext')
    .argument('<recommendation-id>')
    .argument('<decision>', DECISIONS.join('|'))
    .requiredOption('--reason <text>', 'Why the user decided this way')
    .option('--repo <path>', 'Repository root', '.')
    .option('--import-node-limit <n>', 'Same limit the suggestion was scanned with', parseImportNodeLimit)
    .action((recommendationId: string, decision: string, options: { reason: string; repo: string; importNodeLimit?: number }) => {
      try {
        if (!DECISIONS.includes(decision as RefactorDecision)) throw new Error(`decision must be one of ${DECISIONS.join('|')}`);
        const status = decideRefactorRecommendation(canonicalRepoPath(options.repo), recommendationId, decision as RefactorDecision, options.reason, options.importNodeLimit);
        process.stdout.write(`${JSON.stringify({ recommendationId, status }, null, 2)}\n`);
      } catch (error) { fail(error); }
    });
  return command;
}

export const REVIEW_RUBRIC_VERSION = 2;

export type ReviewRubricFormat = 'prompt' | 'text';

export interface ReviewRubricCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const REVIEW_DIMENSIONS = Object.freeze([
  'Correctness and hidden side effects',
  'Compatibility and public contracts',
  'Boundary cases and error paths',
  'Security, privacy, and data safety',
  'Performance and resource use',
  'Naming, API clarity, and misleading abstractions',
  'Test coverage and regression evidence',
  'Future maintenance cost, including minimal-change/YAGNI concerns',
  'Scope fidelity: changes outside the contract In-scope, touching declared Out-of-scope/Non-Goals, or unrequested features/options/commentary',
] as const);

const SEVERITY_DEFINITIONS = Object.freeze([
  ['P0', 'Must fix before merge: data loss, security break, irreversible corruption, or production outage.'],
  ['P1', 'Must fix before release: correctness, compatibility, or workflow break with realistic user impact.'],
  ['P2', 'Should fix: important edge case, missing regression test, confusing API, or maintainability risk.'],
  ['P3', 'Consider: low-risk cleanup or documentation gap. No style-only nits.'],
] as const);

function formatList(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export function renderReviewRubric(format: ReviewRubricFormat = 'prompt'): string {
  const heading = format === 'prompt' ? '[ReviewRubric] Deep Diff Review Rubric v2' : 'Deep Diff Review Rubric v2';
  return [
    heading,
    '',
    'Scope: review the branch diff against target, staged diff, unstaged diff, and untracked files. Read surrounding code and call sites when needed; do not limit review to changed lines.',
    'Mode: review-only. Do not edit files, write files, run /check for the peer, or convert findings into code changes.',
    '',
    'Severity order:',
    ...SEVERITY_DEFINITIONS.map(([severity, definition]) => `- ${severity}: ${definition}`),
    '',
    'Review dimensions:',
    formatList(REVIEW_DIMENSIONS),
    '',
    'Each finding must use this shape:',
    '- [P0|P1|P2|P3] Title — file:line',
    '  Impact: concrete user/system consequence.',
    '  Evidence: reproduction, diff fact, call path, or contract mismatch.',
    '  Smallest safe fix: bounded change that preserves existing contracts.',
    '  Regression test: exact missing or changed test/check.',
    '',
    'Rules: prioritize correctness, security, compatibility, and missing tests over minimal-change concerns. Treat minimal-change/YAGNI only as a maintenance-cost dimension; never upgrade it to P0/P1 by itself. Exception: a Scope fidelity violation — changes touching declared Out-of-scope/Non-Goals items or adding unrequested features, options, or commentary — may be rated up to P1. Ignore style-only nits. If there are no findings, say "No findings" and list residual risks or test gaps.',
  ].join('\n');
}

function usage(): ReviewRubricCliResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: 'repo-harness-hook review-rubric [--format prompt|text]\n',
  };
}

export function runReviewRubricCli(argv: readonly string[]): ReviewRubricCliResult {
  const formatIndex = argv.indexOf('--format');
  const format = formatIndex >= 0 ? argv[formatIndex + 1] : 'prompt';
  const allowedArgs = formatIndex >= 0 ? ['--format', format] : [];
  if (argv.some((arg, index) => arg !== allowedArgs[index])) return usage();
  if (format !== 'prompt' && format !== 'text') return usage();
  return {
    exitCode: 0,
    stdout: `${renderReviewRubric(format)}\n`,
    stderr: '',
  };
}

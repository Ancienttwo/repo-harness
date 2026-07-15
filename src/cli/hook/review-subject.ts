import { buildReviewSubject } from '../../effects/review/diff-fingerprint';

export interface ReviewSubjectCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function usage(): ReviewSubjectCliResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: 'repo-harness-hook review-subject [--target <ref>] [--format json]\n',
  };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runReviewSubjectCli(
  argv: readonly string[],
  opts: { cwd?: string } = {},
): ReviewSubjectCliResult {
  const allowed = new Set(['--target', '--format']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!allowed.has(arg)) return usage();
    index += 1;
    if (index >= argv.length) return usage();
  }

  const format = argValue(argv, '--format') ?? 'json';
  if (format !== 'json') return usage();

  const subject = buildReviewSubject(opts.cwd ?? process.cwd(), {
    targetRef: argValue(argv, '--target') ?? 'HEAD',
  });
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(subject)}\n`,
    stderr: '',
  };
}

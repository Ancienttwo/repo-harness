/** The CLI command. The npm package and the hook command keep the name `repo-harness`. */
export const CLI_NAME = 'rh';

/** The command name before 0.33.0. `rh update` removes its managed link once; no alias stays. */
export const RETIRED_CLI_NAME = 'repo-harness';

/**
 * The persisted protocol lines that start with the package name, each a whole line: the comment headers of
 * `assets/skills/repo-harness-issue-flow/references/templates.md`, the review start markers and the
 * Slack review lines. A test keeps this list equal to the header constants.
 */
export const RETIRED_CLI_PROTOCOL_HEADERS: readonly string[] = [
  'repo-harness issue claim status', 'repo-harness issue claim', 'repo-harness boundary question', 'repo-harness scope change',
  'repo-harness decision', 'repo-harness plan', 'repo-harness handoff', 'repo-harness acceptance claim',
  'repo-harness acceptance record', 'repo-harness acceptance disposition', 'repo-harness acceptance review',
  'repo-harness review reply', 'repo-harness review start status', 'repo-harness review start', 'repo-harness review request',
  'repo-harness review result', 'repo-harness review rejected', 'repo-harness unblocked', 'repo-harness integration status',
  'repo-harness merge hold released', 'repo-harness merge hold',
];

const URL_TEXT = /\b[a-z][a-z\d+.-]*:\/\/\S*/giu;
/** `repo-harness` as one shell word; after npx or bunx, `-p`/`--package` takes it as a package specifier. */
const WORD = /(?<![\w./@~=$-])(?<!\b(?:npx|bunx)[ \t](?:.*[ \t])?(?:-p|--package)[ \t]+)repo-harness(?![\w./@-])/u;
/** npx and bunx run `repo-harness@<spec>` through its bin unless `-p` or `--package` names the bin. */
const PACKAGE_RUN = /(?<![\w./-])(?:npx|bunx)(?:[ \t]+-(?!p(?![\w-])|-package(?![\w-]))\S+)*[ \t]+repo-harness@/u;

/**
 * A line names the retired command when `repo-harness` stands as one shell word, or when npx or bunx
 * runs `repo-harness@<spec>` without `-p`. Over-report gives a harmless notice; under-report misses a
 * call that fails after the rename. The closed exclusion list: a line equal to a persisted protocol header,
 * package specifiers and paths (`repo-harness@` outside npx and bunx, the npx or bunx `-p` argument,
 * `repo-harness-hook`, `.repo-harness`, `~/.repo-harness`, `REPO_HARNESS_*`) and URLs.
 */
export function namesRetiredCli(line: string): boolean {
  if (RETIRED_CLI_PROTOCOL_HEADERS.includes(line.trim())) return false;
  const text = line.replace(URL_TEXT, ' ');
  return WORD.test(text) || PACKAGE_RUN.test(text);
}

/** The CLI command. The npm package and the hook command keep the name `repo-harness`. */
export const CLI_NAME = 'rh';

/** The command name before 0.33.0. `rh update` removes its managed link once; no alias stays. */
export const RETIRED_CLI_NAME = 'repo-harness';

/** The top-level commands of the CLI program; a test keeps this list equal to the program. */
export const CLI_TOP_LEVEL_COMMANDS: readonly string[] = [
  'install', 'init', 'update', 'uninstall', 'status', 'doctor', 'init-hook', 'review', 'module', 'setup', 'upgrade',
  'migrate', 'security', 'tools', 'herdr', 'events', 'brain', 'capability-context', 'docs', 'mcp', 'run', 'state',
  'publication', 'board', 'fleet', 'bots', 'operator', 'worktrees', 'catch-up', 'quota', 'refactor',
  'architecture-projection', 'architecture-debt', 'strategy', 'retention', 'seats',
];

/** The subcommands of `review`; a test keeps this list equal to the program. */
export const CLI_REVIEW_SUBCOMMANDS: readonly string[] = ['admit', 'revoke', 'publish', 'round', 'status', 'close', 'cancel'];

/**
 * One call of the retired command: `repo-harness <top-level command>` in a command position: the line
 * start (after a list marker or `$ `), a backtick, quote or `(`, a shell operator, `run`, or a command
 * prefix (`exec`, `sudo`, `command`, `nohup`, `time`, `xargs`, `env` with `NAME=value` words).
 * `review` matches only with a real review subcommand or a flag, so the persisted protocol headers
 * (`repo-harness review start`, `... review reply`) do not match. Prose that names the package
 * (`the repo-harness operator console`), the package specifier (`npx repo-harness`), the hook command
 * `repo-harness-hook` and paths such as `~/.repo-harness` do not match either.
 */
export const RETIRED_CLI_INVOCATION = new RegExp(
  String.raw`(?<=(?:^[ \t]*(?:[-*>][ \t]+)?(?:\$[ \t]+)?|[\x60'"(][ \t]*|(?:&&|\|\||[;|]|\$\()[ \t]*|\b[Rr]un:?[ \t]+`
  + String.raw`|\b(?:exec|sudo|command|nohup|time|xargs)[ \t]+|\benv(?:[ \t]+[A-Za-z_][\w]*=\S*)*[ \t]+))repo-harness[ \t]+`
  + String.raw`(?:review[ \t]+(?:(?:${CLI_REVIEW_SUBCOMMANDS.join('|')})(?![\w-])|-)|(?!review(?![\w-]))(?:${CLI_TOP_LEVEL_COMMANDS.join('|')})(?![\w-]))`,
  'u',
);

import { Command } from 'commander';
import { listHelperIds, listHelpers, runHelper } from '../runtime/helper-runner';

function renderHelpersSection(): string {
  let helpers: ReturnType<typeof listHelpers>;
  try {
    helpers = listHelpers();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ['', 'Helpers:', `  (unable to list helpers: ${message})`].join('\n');
  }

  if (helpers.length === 0) return '';

  const width = Math.max(...helpers.map((helper) => helper.id.length));
  const lines = helpers.map((helper) => `  ${helper.id.padEnd(width)}  ${helper.description}`);
  return ['', 'Helpers:', ...lines].join('\n');
}

export function buildRunCommand(): Command {
  const run = new Command('run')
    .description('Run a bundled repo-harness workflow helper')
    .allowUnknownOption(true);

  run
    .argument('<helper>', 'Helper id, for example check-task-workflow')
    .argument('[args...]', 'Arguments passed to the helper')
    .action((helper: string, args: string[]) => {
      const result = runHelper({ helper, args });
      if (result.stderr && result.reason !== 'ok') {
        console.error(result.stderr);
        const helpers = listHelperIds();
        if (helpers.length > 0) console.error(`known helpers: ${helpers.join(', ')}`);
      }
      process.exit(result.exitCode);
    });

  run.addHelpText('after', renderHelpersSection);

  return run;
}

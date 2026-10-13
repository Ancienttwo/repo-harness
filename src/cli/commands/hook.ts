import { Command } from 'commander';
import { resolveWorkflowStateLibrary } from '../../effects/runtime/helper-runner';

/** Print the package-owned operator library. Never select a repository copy. */
export function buildHookLibCommand(): Command {
  const command = new Command('hook-lib').description('Locate the installed operator library');
  command.command('path').description('Print the absolute path of workflow-state.sh').action(() => {
    console.log(resolveWorkflowStateLibrary());
  });
  return command;
}

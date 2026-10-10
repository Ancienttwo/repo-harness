import { Command } from 'commander';
import { isAbsolute, relative, resolve } from 'path';
import { realpathSync } from 'fs';
import { reconcileTaskRequest } from '../../effects/terminal/task-request-readback';
import { cancelTaskAgent, closeTaskAgent, collectTaskResult, readSessionArtifact, readTaskAgent, readTaskAgentHistory, readTaskRequestResult, sendTaskRequest, submitTaskResult, startTaskAgent, taskAgentStatus, type TaskAgentSpec, type TaskRequest } from '../../effects/terminal/task-session';

export function buildTaskAgentCommand(): Command {
  const command = new Command('task-agent').description('Persistent task participants hosted only by Herdr');
  command.command('start').requiredOption('--input <path>', 'Repository-relative task-agent specification JSON')
    .option('--repo <path>', 'Repository root', process.cwd()).action(async opts => {
      const root = realpathSync(opts.repo); const path = realpathSync(resolve(root, opts.input));
      if (isAbsolute(opts.input) || relative(root, path).split('/').includes('..')) throw new Error('task_agent_input_unsafe');
      const spec = readSessionArtifact<TaskAgentSpec>(path);
      const expected = ['task', 'role', 'harness_kind', 'endpoint', 'parent_pane', 'args', 'max_requests'];
      if (Object.keys(spec).sort().join(',') !== expected.sort().join(',')) throw new Error('task_agent_input_invalid');
      if (!Array.isArray(spec.args) || spec.args.length !== 0) throw new Error('task_agent_arguments_require_role_profile');
      process.stdout.write(JSON.stringify(await startTaskAgent(root, spec)) + '\n');
    });
  command.command('send').requiredOption('--task <id>').requiredOption('--role <name>').requiredOption('--context <path>')
    .option('--context-policy <policy>', 'repeatable or changed_only', 'repeatable')
    .option('--repo <path>', 'Repository root', process.cwd()).action(async opts => {
      process.stdout.write(JSON.stringify(await sendTaskRequest(opts.repo, opts.task, opts.role, opts.context, opts.contextPolicy)) + '\n');
    });
  command.command('result').requiredOption('--task <id>').requiredOption('--role <name>').requiredOption('--round <number>')
    .requiredOption('--input <path>', 'Execution-checkout-relative JSON with request_id, context_sha256, value')
    .option('--repo <path>', 'Execution checkout', process.cwd()).action(async opts => {
      const root = realpathSync(opts.repo); const path = realpathSync(resolve(root, opts.input));
      if (isAbsolute(opts.input) || relative(root, path).split('/').includes('..')) throw new Error('task_agent_input_unsafe');
      const value = readSessionArtifact(path);
      process.stdout.write(JSON.stringify(await submitTaskResult(root, opts.task, opts.role, Number(opts.round), value)) + '\n');
    });
  command.command('collect').requiredOption('--task <id>').requiredOption('--role <name>').requiredOption('--round <number>')
    .option('--repo <path>', 'Owner repository checkout', process.cwd()).action(async opts => {
      process.stdout.write(JSON.stringify(await collectTaskResult(opts.repo, opts.task, opts.role, Number(opts.round))) + '\n');
    });
  command.command('status').requiredOption('--task <id>').requiredOption('--role <name>')
    .option('--repo <path>', 'Repository root', process.cwd()).action(opts => {
      process.stdout.write(JSON.stringify(taskAgentStatus(opts.repo, opts.task, opts.role)) + '\n');
    });
  command.command('history').requiredOption('--task <id>').requiredOption('--role <name>')
    .option('--lines <number>', 'Recent unwrapped history lines', '200')
    .option('--repo <path>', 'Repository root', process.cwd()).action(opts => {
      process.stdout.write(readTaskAgentHistory(opts.repo, opts.task, opts.role, Number(opts.lines)) + '\n');
    });
  command.command('read').requiredOption('--task <id>').requiredOption('--role <name>').requiredOption('--round <number>')
    .option('--repo <path>', 'Repository root', process.cwd()).action(opts => {
      const round = Number(opts.round);
      if (!Number.isSafeInteger(round) || round < 1) throw new Error('task_agent_round_invalid');
      const { dir } = readTaskAgent(opts.repo, opts.task, opts.role);
      const request = readSessionArtifact<TaskRequest>(resolve(dir, `request-${round}.json`));
      process.stdout.write(JSON.stringify(readTaskRequestResult(opts.repo, dir, request)) + '\n');
    });
  command.command('reconcile').description('Read one saved request by stable ID without delivery or acceptance')
    .requiredOption('--task <id>').requiredOption('--role <name>').requiredOption('--request-id <id>')
    .requiredOption('--expected-head <sha>', 'Full expected execution checkout HEAD; result SHA binding remains unverified')
    .option('--repo <path>', 'Repository root', process.cwd()).action(opts => {
      process.stdout.write(JSON.stringify(reconcileTaskRequest(opts.repo, opts.task, opts.role, opts.requestId, opts.expectedHead)) + '\n');
    });
  for (const action of ['close', 'cancel']) command.command(action).requiredOption('--task <id>').requiredOption('--role <name>')
    .option('--repo <path>', 'Repository root', process.cwd()).action(async opts => {
      const result = await (action === 'cancel' ? cancelTaskAgent : closeTaskAgent)(opts.repo, opts.task, opts.role);
      process.stdout.write(JSON.stringify({ ...result, task: opts.task, role: opts.role }) + '\n');
      if (result.status !== 'closed') process.exitCode = 1;
    });
  return command;
}

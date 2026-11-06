import { Command } from 'commander';
import type { ReadOptions, ViewOptions } from './doc-sessions-actions';

const actions = () => import('./doc-sessions-actions');

export function buildDocSessionsCommand(): Command {
  const sessions = new Command('doc-sessions').description('Read doc sessions of the operator console');
  sessions.command('finalization').description('Read saved finalization journal progress')
    .argument('<session-id>', 'Doc session id (32 hex)').option('--json', 'Output the HTTP body as JSON')
    .action(async (sessionId: string, options: ReadOptions) => (await actions()).finalization(sessionId, options));
  sessions.command('list').description('List doc sessions; unread compares with the supplied browser cursors')
    .option('--seen <json>', 'JSON object of session ids to last-read epoch.seq cursors')
    .option('--json', 'Output the HTTP body as JSON')
    .action(async (options: ViewOptions) => (await actions()).list(options));
  sessions.command('show').description('Read session status, branch, worktree directory name and HEAD')
    .argument('<session-id>', 'Doc session id (32 hex)').option('--seen <cursor>', 'Last-read epoch.seq cursor')
    .option('--json', 'Output the HTTP body as JSON')
    .action(async (sessionId: string, options: ViewOptions) => (await actions()).show(sessionId, options));
  sessions.command('events').description('Read one page of redacted session events')
    .argument('<session-id>', 'Doc session id (32 hex)').option('--after <cursor>', 'Read after this epoch.seq cursor')
    .option('--json', 'Output the HTTP body as JSON')
    .action(async (sessionId: string, options: ViewOptions) => (await actions()).events(sessionId, options));
  sessions
    .command('diff')
    .description('Print the session worktree against its base, with the diff_sha256 that a commit checks')
    .argument('<session-id>', 'Doc session id (32 hex)')
    .option('--json', 'Output the HTTP body as JSON')
    .action(async (sessionId: string, options: ReadOptions) => (await actions()).diff(sessionId, options));
  sessions
    .command('loss')
    .description('Print what a discard deletes, with the loss_sha256 that a discard checks')
    .argument('<session-id>', 'Doc session id (32 hex)')
    .option('--json', 'Output the HTTP body as JSON')
    .action(async (sessionId: string, options: ReadOptions) => (await actions()).loss(sessionId, options));
  return sessions;
}

import { Command } from 'commander';

import type { OperatorDocSessionDiffV1, OperatorDocSessionLossV1 } from '../../core/operator/doc-session-changes';
import { DocSessionReadError, readDocSessionDiff, readDocSessionLoss } from '../../effects/operator/doc-session-changes';
import { isDocSessionListRequest, isDocSessionDetailRequest, isDocSessionEventsRequest } from '../../core/operator/doc-session-views';
import { readDocSessionList, readDocSessionDetail } from '../../effects/operator/doc-session-views';
import { DocSessionEventsError, readDocSessionEvents } from '../../effects/operator/doc-session-events';

/**
 * `repo-harness operator doc-sessions`: the doc session reads of the operator
 * console (I7). Each subcommand runs the effect that the HTTP route runs, and
 * `--json` prints the route's body.
 */

const SESSION_ID = /^[0-9a-f]{32}$/u;

interface ReadOptions { readonly json?: boolean }
interface ViewOptions extends ReadOptions { readonly seen?: string; readonly after?: string }

function runView(options: ReadOptions, read: () => unknown): void {
  try { console.log(JSON.stringify(read())); }
  catch (error) {
    const known = error instanceof DocSessionReadError || error instanceof DocSessionEventsError;
    refuse(options.json, known ? error.code : 'unavailable', known ? 2 : 1);
  }
}

function refuse(json: boolean | undefined, code: string, exitCode: number): void {
  console.error(json ? JSON.stringify({ error: { code } }) : `repo-harness operator doc-sessions: ${code}`);
  process.exitCode = exitCode;
}

function runRead<T>(sessionId: string, options: ReadOptions, read: (env: NodeJS.ProcessEnv, sid: string) => T, print: (value: T) => void): void {
  if (!SESSION_ID.test(sessionId)) { refuse(options.json, 'invalid_argument', 2); return; }
  let value: T;
  try { value = read(process.env, sessionId); }
  catch (error) {
    refuse(options.json, error instanceof DocSessionReadError ? error.code : 'unavailable', error instanceof DocSessionReadError ? 2 : 1);
    return;
  }
  if (options.json) console.log(JSON.stringify(value));
  else print(value);
}

function printDiff(diff: OperatorDocSessionDiffV1): void {
  for (const file of diff.files) console.log([file.status, file.tracked ? 'tracked' : 'untracked', file.binary ? 'binary' : 'text', file.path].join('\t'));
  console.log(`turn ${diff.turn}\tbase ${diff.base_commit}\thead ${diff.head_commit}\tdiff_sha256 ${diff.diff_sha256}`);
  if (diff.patch) process.stdout.write(diff.patch.endsWith('\n') ? diff.patch : `${diff.patch}\n`);
}

function printLoss(loss: OperatorDocSessionLossV1): void {
  for (const file of loss.files) console.log([file.status, file.tracked ? 'tracked' : 'untracked', file.path].join('\t'));
  for (const path of loss.ignored) console.log(['ignored', '-', path].join('\t'));
  for (const commit of loss.commits) console.log(['commit', '-', commit].join('\t'));
  console.log(`turn ${loss.turn}\thead ${loss.head_commit}\tpushed ${loss.pushed}\tloss_sha256 ${loss.loss_sha256}`);
}

export function buildDocSessionsCommand(): Command {
  const sessions = new Command('doc-sessions').description('Read doc sessions of the operator console');
  sessions.command('list').description('List doc sessions; unread compares with the supplied browser cursors')
    .option('--seen <json>', 'JSON object of session ids to last-read epoch.seq cursors')
    .option('--json', 'Output the HTTP body as JSON')
    .action((options: ViewOptions) => {
      let seen: unknown;
      try { seen = JSON.parse(options.seen ?? '{}'); } catch { refuse(options.json, 'invalid_argument', 2); return; }
      const request = { seen };
      if (!isDocSessionListRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
      runView(options, () => readDocSessionList(process.env, request));
    });
  sessions.command('show').description('Read session status, branch, worktree directory name and HEAD')
    .argument('<session-id>', 'Doc session id (32 hex)').option('--seen <cursor>', 'Last-read epoch.seq cursor')
    .option('--json', 'Output the HTTP body as JSON')
    .action((sessionId: string, options: ViewOptions) => {
      const request = { session_id: sessionId, seen: options.seen ?? null };
      if (!isDocSessionDetailRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
      runView(options, () => readDocSessionDetail(process.env, request));
    });
  sessions.command('events').description('Read one page of redacted session events')
    .argument('<session-id>', 'Doc session id (32 hex)').option('--after <cursor>', 'Read after this epoch.seq cursor')
    .option('--json', 'Output the HTTP body as JSON')
    .action((sessionId: string, options: ViewOptions) => {
      const request = { session_id: sessionId, after: options.after ?? null };
      if (!isDocSessionEventsRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
      runView(options, () => readDocSessionEvents(process.env, sessionId, request.after));
    });
  sessions
    .command('diff')
    .description('Print the session worktree against its base, with the diff_sha256 that a commit checks')
    .argument('<session-id>', 'Doc session id (32 hex)')
    .option('--json', 'Output the HTTP body as JSON')
    .action((sessionId: string, options: ReadOptions) => runRead(sessionId, options, readDocSessionDiff, printDiff));
  sessions
    .command('loss')
    .description('Print what a discard deletes, with the loss_sha256 that a discard checks')
    .argument('<session-id>', 'Doc session id (32 hex)')
    .option('--json', 'Output the HTTP body as JSON')
    .action((sessionId: string, options: ReadOptions) => runRead(sessionId, options, readDocSessionLoss, printLoss));
  return sessions;
}

import type { OperatorDocSessionDiffV1, OperatorDocSessionLossV1 } from '../../core/operator/doc-session-changes';
import { DocSessionReadError, readDocSessionDiff, readDocSessionLoss } from '../../effects/operator/doc-session-changes';
import { isDocSessionListRequest, isDocSessionDetailRequest, isDocSessionEventsRequest } from '../../core/operator/doc-session-views';
import { readDocSessionList, readDocSessionDetail } from '../../effects/operator/doc-session-views';
import { DocSessionEventsError, readDocSessionEvents } from '../../effects/operator/doc-session-events';
import { OperatorTaskReadError, readBoundedDocSessionFinalization } from '../../effects/operator/server';

/**
 * `repo-harness operator doc-sessions`: the doc session reads of the operator
 * console (I7). Each subcommand runs the effect that the HTTP route runs, and
 * `--json` prints the route's body.
 */

const SESSION_ID = /^[0-9a-f]{32}$/u;

export interface ReadOptions { readonly json?: boolean }
export interface ViewOptions extends ReadOptions { readonly seen?: string; readonly after?: string }

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

export async function finalization(sessionId: string, options: ReadOptions): Promise<void> {
  if (!SESSION_ID.test(sessionId)) { refuse(options.json, 'invalid_argument', 2); return; }
  try { console.log(JSON.stringify(await readBoundedDocSessionFinalization(process.env, sessionId))); }
  catch (error) { refuse(options.json, error instanceof OperatorTaskReadError ? error.code : 'unavailable', error instanceof OperatorTaskReadError ? 2 : 1); }
}

export function list(options: ViewOptions): void {
  let seen: unknown;
  try { seen = JSON.parse(options.seen ?? '{}'); } catch { refuse(options.json, 'invalid_argument', 2); return; }
  const request = { seen };
  if (!isDocSessionListRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
  runView(options, () => readDocSessionList(process.env, request));
}

export function show(sessionId: string, options: ViewOptions): void {
  const request = { session_id: sessionId, seen: options.seen ?? null };
  if (!isDocSessionDetailRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
  runView(options, () => readDocSessionDetail(process.env, request));
}

export function events(sessionId: string, options: ViewOptions): void {
  const request = { session_id: sessionId, after: options.after ?? null };
  if (!isDocSessionEventsRequest(request)) { refuse(options.json, 'invalid_argument', 2); return; }
  runView(options, () => readDocSessionEvents(process.env, sessionId, request.after));
}

export function diff(sessionId: string, options: ReadOptions): void {
  runRead(sessionId, options, readDocSessionDiff, printDiff);
}

export function loss(sessionId: string, options: ReadOptions): void {
  runRead(sessionId, options, readDocSessionLoss, printLoss);
}

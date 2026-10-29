import { decodeCleanupSessionCreate } from '../../core/operator/worktree-cleanup-session';
import { prepareCleanupSession } from './worktree-cleanup-session';
import { OperatorWriteRefusal } from './write-run';
async function main(): Promise<void> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 64 * 1024) throw new Error('request size'); chunks.push(bytes); }
  const request = decodeCleanupSessionCreate(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  let result;
  try { result = { session_id: prepareCleanupSession(request, process.env) }; }
  catch (error) { if (!(error instanceof OperatorWriteRefusal)) throw error; result = { code: error.code, status: error.status }; }
  process.stdout.write(JSON.stringify(result) + '\n');
}
void main().catch(() => { process.exitCode = 1; });

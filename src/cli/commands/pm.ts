import { Command } from 'commander';
import { PM_MAX_INPUT_BYTES, PmError, publicPmError, type PmResponse } from '../../core/pm/protocol';
import { executePmRequest, type PmExecutionGuard } from '../../effects/pm/operations';

export async function runPmJson(input: string, env: NodeJS.ProcessEnv = process.env, guard?: PmExecutionGuard): Promise<PmResponse> {
  let operation: string | null = null;
  try {
    if (Buffer.byteLength(input) > PM_MAX_INPUT_BYTES) throw new PmError('pm_request_too_large');
    const value: unknown = JSON.parse(input);
    if (value && typeof value === 'object' && typeof (value as { operation?: unknown }).operation === 'string') operation = (value as { operation: string }).operation;
    return { protocol: 1, kind: 'repo-harness-pm-response', operation, ok: true, data: await executePmRequest(value, env, guard) };
  } catch (error) {
    return { protocol: 1, kind: 'repo-harness-pm-response', operation, ok: false,
      error: publicPmError(error) };
  }
}

export function buildPmCommand(): Command {
  const command = new Command('pm').description('Closed PM operations over canonical task authorities');
  command.command('request').description('Read one protocol-1 JSON request from stdin').action(async () => {
    const chunks: Buffer[] = []; let size = 0;
    for await (const raw of process.stdin) {
      const chunk = Buffer.from(raw); size += chunk.length;
      if (size > PM_MAX_INPUT_BYTES) {
        process.stdout.write(JSON.stringify(await runPmJson(' '.repeat(PM_MAX_INPUT_BYTES + 1))) + '\n');
        process.exitCode = 1; return;
      }
      chunks.push(chunk);
    }
    const result = await runPmJson(Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  });
  return command;
}

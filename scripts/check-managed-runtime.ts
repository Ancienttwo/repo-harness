#!/usr/bin/env bun
import { verifyInstalledManagedRuntime } from '../src/cli/commands/global-runtime';

const result = verifyInstalledManagedRuntime();
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status === 'failed') {
  if (result.detail) process.stderr.write(`${result.detail}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = 1;
}

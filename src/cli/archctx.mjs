#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const child = spawnSync(process.execPath, [require.resolve('archctx/bin/archctx.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (child.signal) process.kill(process.pid, child.signal);
process.exit(child.status ?? 1);

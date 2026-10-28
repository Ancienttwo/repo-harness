import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { probePiCapability } from '../../pi/compat';

// Load the PATH installation's public SDK. Its metadata honors PI_PACKAGE_DIR.
const { VERSION, getPackageDir } = await import(pathToFileURL(join(process.argv[2]!, 'dist/index.js')).href);
const capability = await probePiCapability(VERSION, getPackageDir());
process.stdout.write(`${JSON.stringify({ version: VERSION, state: capability.state,
  ...(capability.state === 'unavailable' ? { code: capability.code } : {}) })}\n`);

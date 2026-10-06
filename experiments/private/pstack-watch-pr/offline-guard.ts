import { mock } from 'bun:test';

// This guard loads before any candidate module. No transport is granted.
export const deniedCalls: string[] = [];
function deny(name: string): never {
  deniedCalls.push(name);
  throw new Error(`Offline experiment forbids ${name}`);
}
export const processApi = Object.fromEntries(
  ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']
    .map(name => [name, () => deny(`child_process.${name}`)]),
);
mock.module('node:child_process', () => processApi);
mock.module('child_process', () => processApi);
for (const specifier of ['node:http', 'http', 'node:https', 'https']) {
  mock.module(specifier, () => ({
    request: () => deny(`${specifier}.request`),
    get: () => deny(`${specifier}.get`),
    createServer: () => deny(`${specifier}.createServer`),
  }));
}
for (const specifier of ['node:net', 'net', 'node:tls', 'tls']) {
  mock.module(specifier, () => ({
    connect: () => deny(`${specifier}.connect`),
    createConnection: () => deny(`${specifier}.createConnection`),
    createServer: () => deny(`${specifier}.createServer`),
  }));
}
globalThis.fetch = (() => deny('fetch')) as unknown as typeof fetch;
Bun.spawn = (() => deny('Bun.spawn')) as typeof Bun.spawn;
Bun.spawnSync = (() => deny('Bun.spawnSync')) as typeof Bun.spawnSync;
Bun.connect = (() => deny('Bun.connect')) as typeof Bun.connect;
Bun.listen = (() => deny('Bun.listen')) as typeof Bun.listen;
Bun.serve = (() => deny('Bun.serve')) as typeof Bun.serve;
globalThis.WebSocket = class { constructor() { deny('WebSocket'); } } as unknown as typeof WebSocket;

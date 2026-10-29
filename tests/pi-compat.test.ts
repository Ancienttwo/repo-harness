import { describe, expect, test } from 'bun:test';
import { getPackageDir, VERSION } from '@earendil-works/pi-coding-agent';
import { MIN_PI_VERSION, piVersionSupported, probePiCapability } from '../src/pi/compat';

describe('Pi host capability', () => {
  test.each([
    ['1.3.9', false], ['1.4.0', true], ['1.4.0-rc.1', false], ['2.0.0', true], ['garbage', false],
  ] as const)('version %s follows the minimum policy', (version, supported) => {
    expect(piVersionSupported(version)).toBe(supported);
  });

  test('the SDK provides its own path resolver', async () => {
    expect(MIN_PI_VERSION).toBe('1.4.0');
    const capability = await probePiCapability(VERSION, getPackageDir());
    expect(capability.state).toBe('ready');
    if (capability.state !== 'ready') throw new Error(capability.code);
    expect(capability.resolveToCwd('@file.txt', '/tmp')).toBe('/tmp/file.txt');
  });

  test('an old SDK fails before loading a private module', async () => {
    let loads = 0;
    expect(await probePiCapability('1.3.9', '/unused', async () => { loads++; return {}; }))
      .toEqual({ state: 'unavailable', code: 'PI_HOST_UNSUPPORTED_VERSION' });
    expect(loads).toBe(0);
  });

  test('a missing, malformed or unloadable resolver has one fixed error', async () => {
    for (const load of [async () => ({}), async () => ({ resolveToCwd: 'invalid' }), async () => { throw new Error('missing'); }]) {
      expect(await probePiCapability('2.0.0', '/unused', load))
        .toEqual({ state: 'unavailable', code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' });
    }
  });
});

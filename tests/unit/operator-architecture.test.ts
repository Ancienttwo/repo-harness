import { describe, expect, test } from 'bun:test';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';

const reader = new ArchitectureModelReader(import.meta.dir + '/../..');
const id = reader.list().modules[0].id;
const fixtures = [
  [decodeArchitectureModuleIndex, reader.list()],
  [decodeArchitectureModuleDetail, reader.detail(id)],
  [decodeArchitectureReviewPrompt, reader.reviewPrompt(id)],
] as const;

describe('operator architecture decoders', () => {
  for (const [decode, fixture] of fixtures) {
    test(`${fixture.schema_version} accepts Phase A output and rejects every missing or extra field`, () => {
      expect(decode(fixture)).toEqual(fixture);
      const visit = (value: unknown, replace: (value: unknown) => unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach((item, i) => visit(item, changed => replace(value.map((v, j) => i === j ? changed : v)))); return; }
        const record = value as Record<string, unknown>;
        expect(() => decode(replace({ ...record, private_field: '/private/root' }))).toThrow();
        for (const key of Object.keys(record)) {
          const missing = { ...record }; delete missing[key];
          expect(() => decode(replace(missing))).toThrow();
          visit(record[key], changed => replace({ ...record, [key]: changed }));
        }
      };
      visit(fixture, value => value);
      for (const value of [null, [], {}, { ...fixture, commit: '--output=/tmp/out' }]) expect(() => decode(value)).toThrow();
    });
  }
  test('rejects bad prompt identity and shard range', () => {
    const packet = reader.reviewPrompt(id);
    expect(() => decodeArchitectureReviewPrompt({ ...packet, mode: 'diff' })).toThrow();
    expect(() => decodeArchitectureReviewPrompt({ ...packet, shard: { ...packet.shard, index: packet.shard.count + 1 } })).toThrow();
  });
});

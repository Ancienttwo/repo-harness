#!/usr/bin/env bun
import { createEffectiveStateFixture, resolveFixtureState } from './effective-state-fixture';

const BASELINE = '82550779cdccf0575d674ae53bbc95ba63e44743';
const ITERATIONS = 100;
const WARMUPS = 5;

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

const fixture = createEffectiveStateFixture();
try {
  for (let index = 0; index < WARMUPS; index += 1) resolveFixtureState(fixture.cwd);
  const durations: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    resolveFixtureState(fixture.cwd);
    durations.push(performance.now() - started);
  }
  const sorted = [...durations].sort((left, right) => left - right);
  const result = {
    protocol: 1,
    kind: 'repo-harness-effective-state-benchmark',
    baseline: BASELINE,
    iterations: ITERATIONS,
    warmups: WARMUPS,
    median_ms: Number(percentile(sorted, 0.5).toFixed(3)),
    p95_ms: Number(percentile(sorted, 0.95).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted.at(-1)!.toFixed(3)),
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  fixture.cleanup();
}

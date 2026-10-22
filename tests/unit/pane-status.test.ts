import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { OPTIONS, POLICY, POLICY_VERSION, paneStatusRequest, decodeClefAnswer, decisionBand } from '../../src/core/decision/pane-status.mjs';

const state = { agent: 'codex', herdr_status: 'done', pane_title: 'fix tests', tail_lines: 1, tail_truncated: false, tail: 'Result: finished.' } as const;
export function clefResult(model = 'clef-flash', choice = 'quota', confidence = 0.9) {
  return { model, answers: {
    'pane.outcome': { type: 'choice', choice, confidence, probabilities: Object.fromEntries(OPTIONS.map(option => [option, option === choice ? 0.9 : 0.025])) },
    'pane.result_present': { type: 'noul', noul: 0.1 },
    'pane.provider_message': { type: 'noul', noul: 0.9 },
  }, usage: { input_tokens: 3500, output_tokens: 0 } };
}

describe('pane decision contract', () => {
  test('fixed request has one stable schema and does not leak caller metadata', () => {
    const request = paneStatusRequest({ ...state, workspace: '/private/work', token: 'private-token' } as typeof state);
    expect(request.state).toEqual(state);
    expect(createHash('sha256').update(JSON.stringify(request)).digest('hex')).toBe('9a89f33560809ec34e4c36f8020bf67c5846fa4e151183f8007f875746b87ab6');
    request.questions['pane.outcome'] = 'mutated';
    expect(paneStatusRequest(state).questions['pane.outcome']).toBeObject();
    expect(paneStatusRequest(state, 'clef').model).toBe('clef');
    expect(() => paneStatusRequest({ ...state, tail: 'é'.repeat(9000) })).toThrow();
    expect(() => paneStatusRequest({ ...state, tail_lines: 121 })).toThrow();
  });
  test('decoder projects only the three typed answers and usage', () => {
    expect(decodeClefAnswer({ ...clefResult(), private: 'must not be copied' })).toEqual({
      status: 'ok', choice: 'quota', confidence: 0.9,
      probabilities: { done: 0.025, stuck: 0.025, model_error: 0.025, quota: 0.9, unclear: 0.025 },
      input_tokens: 3500, evidence: { 'pane.result_present': 0.1, 'pane.provider_message': 0.9 },
    });
    expect(decodeClefAnswer(clefResult('clef'), 'clef').status).toBe('ok');
  });
  test('malformed answers fail closed', () => {
    const malformed: unknown[] = [null, [], {}, { ...clefResult(), model: 'other' }];
    for (const [path, value] of [
      ['answers', null], ['answers', []], ['answers.pane.outcome', null],
      ['outcome.choice', 'other'], ['outcome.type', 'score'], ['outcome.confidence', -0.1],
      ['outcome.confidence', 1.1], ['outcome.confidence', '0.9'], ['outcome.confidence', NaN],
      ['outcome.probabilities', {}], ['outcome.probabilities', []],
      ['outcome.probabilities', { done: 1, stuck: 0, model_error: 0, quota: 0, unclear: 0 }],
      ['outcome.probabilities', { done: 0, stuck: 0, model_error: 0, quota: 0.8, unclear: 0 }],
      ['outcome.probabilities', { done: -0.1, stuck: 0, model_error: 0, quota: 1, unclear: 0.1 }],
      ['outcome.probabilities', { done: 0, stuck: 0, model_error: 0, quota: 1, unclear: 0, extra: 0 }],
      ['usage', { input_tokens: 1 }], ['usage', { input_tokens: 1, output_tokens: -1 }], ['usage', null], ['usage', { input_tokens: -1 }], ['usage', { input_tokens: 1.5 }],
      ['evidence', null], ['evidence', { type: 'noul', noul: 1.1 }], ['evidence', { type: 'noul', noul: '1' }],
    ] as const) {
      const item = structuredClone(clefResult()) as any;
      if (path === 'answers.pane.outcome') item.answers['pane.outcome'] = value;
      else if (path.startsWith('outcome.')) item.answers['pane.outcome'][path.slice(8)] = value;
      else if (path === 'evidence') item.answers['pane.provider_message'] = value;
      else item[path] = value;
      malformed.push(item);
    }
    for (const item of malformed) expect(decodeClefAnswer(item)).toEqual({ status: 'invalid' });
  });
  test('sum tolerance and band edges are inclusive; promotion stays disabled', () => {
    for (const [confidence, band] of [[0.599999, 'abstain'], [0.60, 'review'], [0.849999, 'review'], [0.85, 'act'], [1, 'act']] as const) {
      const answer = decodeClefAnswer(clefResult('clef-flash', 'quota', confidence));
      expect(decisionBand(answer)).toBe(band);
      expect(decisionBand(answer, 'suggest')).toBe(confidence < 0.60 ? 'abstain' : 'review');
      expect(decisionBand(answer, 'apply')).toBe(confidence < 0.60 ? 'abstain' : 'review');
    }
    for (const sum of [0.99, 1.01]) {
      const result = clefResult();
      result.answers['pane.outcome'].probabilities = { done: 0, stuck: 0, model_error: 0, quota: 0.9, unclear: sum - 0.9 };
      expect(decodeClefAnswer(result).status).toBe('ok');
    }
    expect(decisionBand(decodeClefAnswer(clefResult('clef-flash', 'unclear', 1)))).toBe('abstain');
    expect(decisionBand({ status: 'invalid' })).toBe('abstain');
    expect(POLICY.labels.quota).toEqual({ suggest: null, apply: null });
    expect(POLICY_VERSION).toBe('pane-status-shadow-v1');
  });
});

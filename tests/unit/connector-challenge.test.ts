import { describe, expect, test } from 'bun:test';
import { renderConnectorChallenge, verifyConnectorChallenge } from '../../src/core/automation/connector-challenge';
import { makeAdoptionInput } from '../helpers/issue-batch-adoption-fixture';
describe('BRC6 exact-SHA readback', () => {
  test('hides expected answers from prompt and binds receipt to exact challenge', () => {
    const f = makeAdoptionInput(); const prompt = renderConnectorChallenge(f.challenge, f.intent.provider_repository);
    expect(prompt).not.toContain('export {};'); expect(prompt).not.toContain('b'.repeat(64));
    const receipt = verifyConnectorChallenge({ challenge: f.challenge, response: f.challenge_response, response_session_ref: 'reply', model_verified: true });
    expect(receipt.connector_evidence).toBe('challenge_verified'); expect(receipt.challenge_sha256).toBe(f.challenge.challenge_sha256);
  });
  test.each(['wrong-sha', 'missing-answer', 'changed-character', 'extra-field', 'fenced-json', 'model-self-report'])('rejects %s', kind => {
    const f = makeAdoptionInput(); const raw = JSON.parse(f.challenge_response);
    if (kind === 'wrong-sha') raw.base_main_sha = '0'.repeat(40);
    if (kind === 'missing-answer') raw.answers.pop();
    if (kind === 'changed-character') raw.answers[1] += ' ';
    if (kind === 'extra-field') raw.connector_calls = [];
    let response = JSON.stringify(raw);
    if (kind === 'fenced-json') response = `\`\`\`json\n${response}\n\`\`\``;
    expect(() => verifyConnectorChallenge({ challenge: f.challenge, response, response_session_ref: 'reply', model_verified: kind !== 'model-self-report' })).toThrow();
  });
});

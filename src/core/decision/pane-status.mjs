// Pure pane decision contract. The plugin projection must match these bytes.
export const POLICY_VERSION = 'pane-status-shadow-v1';
export const OPTIONS = Object.freeze(['done', 'stuck', 'model_error', 'quota', 'unclear']);
const thresholds = Object.freeze({ suggest: null, apply: null });
export const POLICY = Object.freeze({
  review: 0.60, shadow: 0.85,
  labels: Object.freeze({ stuck: thresholds, model_error: thresholds, quota: thresholds }),
  escalate: Object.freeze(['stuck']),
});
const QUESTIONS = {
  "pane.outcome": {
    "type": "choice",
    "instructions": "A terminal coding agent stopped and now waits at its input prompt. Read the end of its terminal output. Decide why it stopped.",
    "criteria": {
      "done": "The agent finished the work it was given. Its last message reports a result: a summary, a RESULT block, a PR or commit link, or a test outcome (pass or fail). It waits for a new task.",
      "stuck": "The agent stopped before the work was finished, for a reason inside the task. It asks the operator a question, waits for a choice or confirmation, repeats the same failed step, or says it cannot continue without help.",
      "model_error": "The model provider or the agent CLI reported an error that ended the turn. Examples of situations: an API or server error, the model is overloaded or unavailable, the request or context is too large, the connection failed, the CLI crashed.",
      "quota": "The provider refused more work because of a usage limit: a rate limit, a usage or plan cap, a credit or billing limit, or a message that the limit resets at a later time.",
      "unclear": "The output does not show enough to decide, or the screen shows something other than an agent session (a shell prompt, an editor, empty output)."
    }
  },
  "pane.result_present": {
    "type": "noul",
    "instructions": "Does the last agent message state a final result of the assigned work?"
  },
  "pane.provider_message": {
    "type": "noul",
    "instructions": "Does the output end with a message from the model provider or the CLI, not from the agent's own reasoning?"
  }
};

export function paneStatusRequest(state, model = 'clef-flash') {
  if (!['clef-flash', 'clef'].includes(model) || !['claude', 'codex', 'pi'].includes(state.agent)
    || state.herdr_status !== 'done' || typeof state.pane_title !== 'string'
    || !Number.isInteger(state.tail_lines) || state.tail_lines < 0 || state.tail_lines > 120
    || typeof state.tail_truncated !== 'boolean' || typeof state.tail !== 'string'
    || new TextEncoder().encode(state.tail).length > 16 * 1024) throw new Error('Invalid pane state.');
  return { model, state: {
    agent: state.agent, herdr_status: state.herdr_status, pane_title: state.pane_title,
    tail_lines: state.tail_lines, tail_truncated: state.tail_truncated, tail: state.tail,
  }, questions: structuredClone(QUESTIONS) };
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export function decodeClefAnswer(value, model = 'clef-flash') {
  const invalid = { status: 'invalid' };
  if (!object(value) || value.model !== model || !object(value.answers) || !object(value.usage)
    || !Number.isSafeInteger(value.usage.input_tokens) || value.usage.input_tokens < 0
    || !Number.isSafeInteger(value.usage.output_tokens) || value.usage.output_tokens < 0) return invalid;
  const answer = value.answers['pane.outcome'];
  if (!object(answer) || answer.type !== 'choice' || !OPTIONS.includes(answer.choice)
    || !probability(answer.confidence) || !object(answer.probabilities)
    || Object.keys(answer.probabilities).length !== OPTIONS.length
    || OPTIONS.some(option => !probability(answer.probabilities[option]))) return invalid;
  const probabilities = Object.fromEntries(OPTIONS.map(option => [option, answer.probabilities[option]]));
  if (Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) > 0.010000000001
    || Object.values(probabilities).some(p => p > probabilities[answer.choice])) return invalid;
  const evidence = {};
  for (const id of ['pane.result_present', 'pane.provider_message']) {
    const item = value.answers[id];
    if (!object(item) || item.type !== 'noul' || !probability(item.noul)) return invalid;
    evidence[id] = item.noul;
  }
  return { status: 'ok', choice: answer.choice, probabilities, confidence: answer.confidence,
    input_tokens: value.usage.input_tokens, evidence };
}

// Promoted thresholds stay null. Shadow bands use the provisional threshold.
export function decisionBand(answer, mode = 'shadow') {
  if (answer.status !== 'ok' || answer.choice === 'unclear' || answer.confidence < POLICY.review) return 'abstain';
  const threshold = mode === 'shadow' ? POLICY.shadow : POLICY.labels[answer.choice]?.[mode];
  return threshold !== null && threshold !== undefined && answer.confidence >= threshold ? 'act' : 'review';
}

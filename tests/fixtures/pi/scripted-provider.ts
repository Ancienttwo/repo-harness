import { appendFileSync } from 'node:fs';
import type { JsonObject } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Fixture provider, not a real model. Each prompt runs the next tool calls named in
// PI_FIXTURE_CALLS (a JSON array of runs; a run is an array of [tool, input]), one
// assistant turn per call, then answers "Done.". When PI_FIXTURE_LOG is set, each
// provider request appends the transcript it received, so a test can see what reached the model.
export default function scriptedProvider(pi: ExtensionAPI): void {
  const runs = JSON.parse(process.env.PI_FIXTURE_CALLS ?? '[]') as Array<Array<[string, JsonObject]>>;
  const faux = fauxProvider({ provider: 'fixture', models: [{ id: 'scripted' }] });
  const log = process.env.PI_FIXTURE_LOG;
  const step = (message: ReturnType<typeof fauxAssistantMessage>) => (context: unknown) => {
    if (log) appendFileSync(log, `${JSON.stringify(context)}\n`);
    return message;
  };
  faux.setResponses(runs.flatMap((calls, run) => [
    ...calls.map(([tool, input], index) => step(fauxAssistantMessage(fauxToolCall(tool, input, { id: `fixture-${run}-${index}` }), { stopReason: 'toolUse' }))),
    step(fauxAssistantMessage('Done.')),
  ]));
  pi.registerProvider(faux.provider);
}

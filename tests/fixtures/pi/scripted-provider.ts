import type { JsonObject } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Fixture provider, not a real model: each prompt runs the tool calls named in
// PI_FIXTURE_CALLS (a JSON array of [tool, input]) in one assistant turn each,
// then answers "Done.".
export default function scriptedProvider(pi: ExtensionAPI): void {
  const calls = JSON.parse(process.env.PI_FIXTURE_CALLS ?? '[]') as Array<[string, JsonObject]>;
  const faux = fauxProvider({ provider: 'fixture', models: [{ id: 'scripted' }] });
  faux.setResponses([
    ...calls.map(([tool, input], index) => fauxAssistantMessage(fauxToolCall(tool, input, { id: `fixture-${index}` }), { stopReason: 'toolUse' })),
    fauxAssistantMessage('Done.'),
  ]);
  pi.registerProvider(faux.provider);
}

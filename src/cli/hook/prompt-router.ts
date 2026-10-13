export type ExplicitWorkflowAction = 'setup' | 'plan' | 'execute' | 'verify' | 'handoff';

export type PromptRoute =
  | { readonly kind: 'explicit'; readonly action: ExplicitWorkflowAction; readonly command: string }
  | { readonly kind: 'bypass' };

const EXPLICIT_COMMANDS: Readonly<Record<string, ExplicitWorkflowAction>> = Object.freeze({
  '/setup': 'setup',
  '/init': 'setup',
  '/plan': 'plan',
  '/execute': 'execute',
  '/run': 'execute',
  '/check': 'verify',
  '/verify': 'verify',
  '/handoff': 'handoff',
});

/** Route only explicit workflow commands at the start of the prompt. All other text bypasses. */
export function routePromptExplicitFirst(prompt: string): PromptRoute {
  const commandMatch = /^\/(setup|init|plan|execute|run|check|verify|handoff)(?=\s|$)/u.exec(prompt.trimStart());
  if (!commandMatch) return { kind: 'bypass' };
  const command = `/${commandMatch[1]}`;
  return { kind: 'explicit', action: EXPLICIT_COMMANDS[command], command };
}

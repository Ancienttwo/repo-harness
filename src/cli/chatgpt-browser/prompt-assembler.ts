import { readBrowserInputFile } from './file-policy';
import type { BrowserConsultInput, PromptBundle } from './types';

export const DEFAULT_MAX_INLINE_CHARS = 120_000;

function renderFile(file: { path: string; content: string }): string {
  return [`## File: ${file.path}`, '', '```text', file.content.trimEnd(), '```'].join('\n');
}

export function assemblePromptBundle(input: BrowserConsultInput): PromptBundle {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('prompt is required');
  const maxInlineChars = input.maxInlineChars ?? DEFAULT_MAX_INLINE_CHARS;
  const files = (input.files ?? []).map((file) => readBrowserInputFile(input.repoRoot, file.path, maxInlineChars));
  const followups = (input.followups ?? []).map((entry) => entry.trim()).filter(Boolean);
  const sections = ['# Task', '', prompt];
  if (files.length > 0) {
    sections.push('', '# Context files', '', ...files.flatMap((file) => [renderFile(file), '']));
  }
  sections.push('', '# Instructions', '', 'Return a direct, reviewable answer. Preserve Markdown where useful.');
  const rendered = sections.join('\n').trimEnd() + '\n';
  return {
    prompt,
    rendered,
    files,
    followups,
    totalChars: rendered.length + followups.reduce((sum, entry) => sum + entry.length, 0),
  };
}

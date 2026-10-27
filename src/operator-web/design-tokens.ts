// Build-time projection of the design system's tokens.json (PRD G13). The
// Vite config serves the result as one virtual stylesheet, so tokens.json is
// the only place a Paper or Ink value is written.

import tokens from '../../docs/design/operator-console/design-system/tokens.json';

export const DESIGN_TOKENS_MODULE = 'virtual:operator-design-tokens.css';

type Mode = 'light' | 'dark';

const REFERENCE = /^\{([a-z0-9-]+)\}$/u;

/** A plain value is a palette step. It only feeds the themed tokens and is not emitted. */
const palette = new Map(tokens.color.tokens.flatMap(token => typeof token.value === 'string' ? [[token.name, token.value] as const] : []));

function resolve(value: string): string {
  const reference = REFERENCE.exec(value);
  if (reference === null) return value;
  const target = palette.get(reference[1]!);
  if (target === undefined) throw new Error(`design token reference ${value} names no palette step`);
  return target;
}

/**
 * Themed tokens keep Kumo's variable names, so they replace Kumo's values. The
 * rules stay unlayered because Kumo sets its own values inside `@layer base`.
 */
function colorRules(mode: Mode): string {
  return tokens.color.tokens
    .flatMap(token => typeof token.value === 'string' ? [] : [`  --${token.name}: ${resolve(token.value[mode])};`])
    .join('\n');
}

const fontRules = Object.entries(tokens.type.families).map(([family, stack]) => `  --font-${family}: ${stack};`).join('\n');

/** One class per text style, inside the components layer so a utility on the same element still wins. */
const typeRules = tokens.type.groups.flatMap(group => group.styles.map(style => [
  `  .type-${style.name} {`,
  `    font-family: var(--font-${group.family});`,
  `    font-size: ${style.fontSize};`,
  `    line-height: ${style.lineHeight};`,
  `    font-weight: ${style.fontWeight};`,
  ...('letterSpacing' in style ? [`    letter-spacing: ${style.letterSpacing};`] : []),
  '  }',
].join('\n'))).join('\n');

/**
 * Radius, shadow and spacing tokens are not emitted: the design's 8 and 12 px
 * radii and its 4 px spacing are Tailwind's own steps, and redefining
 * `--radius-*` would move every Kumo component one step.
 */
export function designTokenStylesheet(): string {
  return [
    `:root {\n${fontRules}\n${colorRules('light')}\n}`,
    `:root[data-mode="dark"] {\n${colorRules('dark')}\n}`,
    `@layer components {\n${typeRules}\n}`,
  ].join('\n\n') + '\n';
}

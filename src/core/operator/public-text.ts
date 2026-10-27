// A `/` starts an absolute path unless it follows a Unicode letter, number, mark or emoji,
// `_`, `.`, `-` or another `/`. That keeps `feat/x`, `1/2` and `./rel` while catching paths
// after any punctuation, such as `[/home/a]`, `,/tmp` or `~/repo`. A drive
// letter starts a Windows path unless a word character precedes it.
const PRIVATE_PATH_SPAN = '[^\\s"\'`)\\]>}]';
const PRIVATE_PATH = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}\\p{Extended_Pictographic}_./-])\\/${PRIVATE_PATH_SPAN}+|(?<![\\p{L}\\p{N}\\p{M}_])[A-Za-z]:[\\\\/]${PRIVATE_PATH_SPAN}*`, 'gu');

/** Mask absolute-path-looking spans in free text. Paths never leave the host. */
export function publicDevActivityText(value: string): string {
  return value.replace(PRIVATE_PATH, '[private path]');
}

/** True when the value would pass the snapshot decoder's private-path guard. */
export function isPublicDevActivityText(value: string): boolean {
  PRIVATE_PATH.lastIndex = 0;
  return !PRIVATE_PATH.test(value);
}

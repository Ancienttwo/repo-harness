/** Quote one POSIX shell word, including empty values and line breaks. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

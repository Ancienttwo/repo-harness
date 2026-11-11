/**
 * The one error-to-text conversion. A caught value keeps its message when it is
 * an `Error`, and every other value becomes its string form.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Copy is the board's only output channel. A missing or refusing clipboard reports failure. */
export async function copyOperatorIdentifier(
  value: string,
  clipboard: Pick<Clipboard, 'writeText'> | null | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

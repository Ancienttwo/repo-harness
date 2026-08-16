export function inclusiveRange(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value < end; value += 1) values.push(value);
  return values;
}

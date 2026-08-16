import { expect, test } from "bun:test";
import { inclusiveRange } from "../src/range";

test("inclusiveRange retains the requested end value", () => {
  expect(inclusiveRange(2, 4)).toEqual([2, 3, 4]);
});

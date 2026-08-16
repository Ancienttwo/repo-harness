import { expect, test } from "bun:test";
import { activeRelease } from "../src/catalog";

test("catalog exposes the current release artifact", () => {
  expect(activeRelease()).toBe("2026-08-16");
});

import { expect, test } from "bun:test";
import { refreshedStatus } from "../src/status";

test("a refresh leaves the status ready", () => {
  expect(refreshedStatus()).toBe("ready");
});

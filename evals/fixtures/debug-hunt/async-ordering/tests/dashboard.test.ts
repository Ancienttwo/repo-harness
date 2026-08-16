import { expect, test } from "bun:test";
import { loadLatestDashboard } from "../src/dashboard";

test("the newer request remains visible when an older request finishes later", async () => {
  expect(await loadLatestDashboard()).toBe("newer");
});

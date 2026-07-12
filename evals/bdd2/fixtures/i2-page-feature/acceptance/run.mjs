import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
if (!workspace) throw new Error("usage: node run.mjs <candidate-workspace>");

const root = path.resolve(workspace);
const entries = (await readdir(root)).sort();
assert.deepEqual(entries, ["app.js", "index.html", "styles.css"], "candidate added an unauthorized top-level file");

const moduleUrl = `${pathToFileURL(path.join(root, "app.js")).href}?acceptance=${Date.now()}`;
const { createExportController } = await import(moduleUrl);
assert.equal(typeof createExportController, "function");

const failed = createExportController({id: "export-a", filename: "people.csv", status: "failed"});
assert.deepEqual(failed.availableActions(), ["retry"], "failed export must expose exactly Retry");
assert.match(failed.render(), /data-action=["']retry["']/i, "failed row must render the Retry action");
assert.match(failed.render(), />\s*Retry\s*</i, "Retry must have a visible text label");

const retryResult = failed.retry();
assert.equal(retryResult.ok, true, "Retry must start from failed state");
assert.equal(failed.getState().status, "running");
assert.equal(failed.getState().filename, "people.csv", "Retry must preserve export identity");
assert.deepEqual(failed.availableActions(), [], "running export cannot be retried");
assert.doesNotMatch(failed.render(), /data-action=["']retry["']/i);
assert.match(failed.render(), /Export running/i);

assert.equal(failed.complete("succeeded").ok, true);
assert.equal(failed.getState().status, "succeeded");
assert.deepEqual(failed.availableActions(), []);
assert.match(failed.render(), /Export ready/i);

const failedAgain = createExportController({id: "export-b", filename: "orders.csv", status: "failed"});
assert.equal(failedAgain.retry().ok, true);
assert.equal(failedAgain.complete("failed").ok, true);
assert.deepEqual(failedAgain.availableActions(), ["retry"], "a later failed completion must be recoverable again");

const completed = createExportController({id: "export-c", filename: "done.csv", status: "succeeded"});
assert.deepEqual(completed.availableActions(), []);
assert.equal(completed.retry().ok, false, "completed export cannot be retried");

const combined = await Promise.all(entries.map((entry) => readFile(path.join(root, entry), "utf8"))).then((parts) => parts.join("\n").toLowerCase());
const page = await readFile(path.join(root, "index.html"), "utf8");
const clickHandler = extractArrowBlock(page, /row\.addEventListener\(["']click["']/);
assert.match(clickHandler, /if\s*\(\s*action\s*===\s*["']retry["']\s*\)\s*(?:\{\s*)?controller\.retry\(\)\s*;?/, "live click handler must invoke retry for the Retry action");
assert.match(extractArrowBlock(`row.addEventListener("click", (event) => { if (action === "retry") { controller.retry(); } });`, /row\.addEventListener\(["']click["']/), /controller\.retry/, "balanced parser accepts a braced retry branch");
assert.match(extractArrowBlock(`row.addEventListener("click", (event) => { setTimeout(() => { paint(); }); if (action === "retry") controller.retry(); });`, /row\.addEventListener\(["']click["']/), /controller\.retry/, "balanced parser ignores nested callback closers");
for (const forbidden of ["queue priority", "worker pool", "provider selector", "retry settings", "job dashboard"]) {
  assert.equal(combined.includes(forbidden), false, `forbidden backstage surface: ${forbidden}`);
}

console.log("I2 acceptance passed");

function extractArrowBlock(source, marker) {
  const match = marker.exec(source);
  if (!match) return "";
  const arrow = source.indexOf("=>", match.index + match[0].length);
  const start = arrow < 0 ? -1 : source.indexOf("{", arrow + 2);
  if (start < 0) return "";
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? "";
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start + 1, index);
  }
  return "";
}

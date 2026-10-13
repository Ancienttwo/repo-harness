import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  HookPayloadError,
  normalizeRepoRelativePath,
  parseHookPayload,
  payloadIdentityField,
  payloadString,
  payloadValue,
} from "../src/cli/hook/hook-input";

describe("hook payload", () => {
  test("parses one JSON object and reads dotted paths", () => {
    const payload = parseHookPayload(JSON.stringify({ run_id: "xyz", tool_input: { command: "ls" } }));
    expect(payloadString(payload, "run_id")).toBe("xyz");
    expect(payloadString(payload, "tool_input.command")).toBe("ls");
    expect(payloadValue(payload, "tool_input")).toEqual({ command: "ls" });
  });

  test("an absent or non-string field reads as an empty string", () => {
    const payload = parseHookPayload(JSON.stringify({ session_id: "abc", count: 3 }));
    expect(payloadString(payload, "run_id")).toBe("");
    expect(payloadString(payload, "count")).toBe("");
    expect(payloadValue(payload, "session_id.deeper")).toBeUndefined();
  });

  test("empty input is an empty payload", () => {
    expect(parseHookPayload(undefined)).toEqual({});
    expect(parseHookPayload("")).toEqual({});
    expect(parseHookPayload(Buffer.from("  \n"))).toEqual({});
  });

  test("malformed JSON and non-object JSON fail instead of degrading to defaults", () => {
    expect(() => parseHookPayload("not valid json{")).toThrow(HookPayloadError);
    expect(() => parseHookPayload("[1, 2]")).toThrow(HookPayloadError);
    expect(() => parseHookPayload("\"text\"")).toThrow(HookPayloadError);
    expect(() => parseHookPayload("null")).toThrow(HookPayloadError);
  });

  test("identity fields are trimmed non-empty strings or null", () => {
    const payload = parseHookPayload(JSON.stringify({ session_id: "  s-1  ", run_id: "   ", turn_id: 7 }));
    expect(payloadIdentityField(payload, "session_id")).toBe("s-1");
    expect(payloadIdentityField(payload, "run_id")).toBeNull();
    expect(payloadIdentityField(payload, "turn_id")).toBeNull();
    expect(payloadIdentityField(payload, "missing")).toBeNull();
  });
});

describe("repository-relative paths", () => {
  test("keeps relative paths, strips the repo root and keeps outside paths absolute", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "hook-input-paths-")));
    try {
      expect(normalizeRepoRelativePath(root, "src/a.ts")).toBe("src/a.ts");
      expect(normalizeRepoRelativePath(root, `${root}/src/a.ts`)).toBe("src/a.ts");
      expect(normalizeRepoRelativePath(root, "/var/tmp/outside.txt")).toBe("/var/tmp/outside.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

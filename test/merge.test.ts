import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type HookEntry = { command: string; timeout: number };
type Ok = { ok: true; merged: string; changed: boolean };
type MergeResult = Ok | { ok: false; reason: string };
type MergeModule = {
  HOOK_EVENTS: string[];
  HOOK_MARKER: string;
  mergeHookEntry: (text: string | null, entry: HookEntry) => MergeResult;
};

const { HOOK_EVENTS, HOOK_MARKER, mergeHookEntry } = createRequire(__filename)(
  "../cli/merge.js",
) as MergeModule;

const entry = { command: 'node "/Users/me/.focus-bell/hook.js"', timeout: 5 };

function ok(result: MergeResult): Ok {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("mergeHookEntry", () => {
  it("exports the six hook events and the marker", () => {
    expect(HOOK_EVENTS).toEqual([
      "beforeSubmitPrompt",
      "beforeShellExecution",
      "afterShellExecution",
      "afterAgentResponse",
      "postToolUseFailure",
      "stop",
    ]);
    expect(HOOK_MARKER).toBe(".focus-bell/hook.js");
  });

  it("creates a full hooks file when none exists", () => {
    const result = ok(mergeHookEntry(null, entry));
    const hooks = Object.fromEntries(HOOK_EVENTS.map((e) => [e, [entry]]));
    expect(JSON.parse(result.merged)).toEqual({ version: 1, hooks });
    expect(result.changed).toBe(true);
    expect(result.merged.endsWith("\n")).toBe(true);
  });

  it("preserves foreign entries, unrelated keys, and key order", () => {
    const input = JSON.stringify(
      {
        custom: true,
        hooks: { beforeShellExecution: [{ command: "echo hi" }] },
      },
      null,
      2,
    );
    const result = ok(mergeHookEntry(input, entry));
    const parsed = JSON.parse(result.merged);
    expect(parsed.custom).toBe(true);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.beforeShellExecution).toEqual([{ command: "echo hi" }, entry]);
    for (const event of HOOK_EVENTS.filter((e) => e !== "beforeShellExecution")) {
      expect(parsed.hooks[event]).toEqual([entry]);
    }
    expect(result.changed).toBe(true);
    expect(result.merged.indexOf('"custom"')).toBeLessThan(result.merged.indexOf('"hooks"'));
  });

  it("is idempotent on its own output", () => {
    const first = ok(mergeHookEntry(null, entry));
    const second = ok(mergeHookEntry(first.merged, entry));
    expect(second.changed).toBe(false);
    expect(second.merged).toBe(first.merged);
  });

  it.each([null, "x"])("replaces a non-object hooks value %j", (hooks) => {
    const result = ok(mergeHookEntry(JSON.stringify({ version: 1, hooks }), entry));
    const expected = Object.fromEntries(HOOK_EVENTS.map((e) => [e, [entry]]));
    expect(JSON.parse(result.merged).hooks).toEqual(expected);
    expect(result.changed).toBe(true);
  });

  it("keeps an existing entry without a command and appends ours", () => {
    const foreign = { type: "prompt", prompt: "x" };
    const input = JSON.stringify({ version: 1, hooks: { beforeShellExecution: [foreign] } });
    const result = ok(mergeHookEntry(input, entry));
    expect(JSON.parse(result.merged).hooks.beforeShellExecution).toEqual([foreign, entry]);
    expect(result.changed).toBe(true);
  });

  it.each(["{bad", "[]", "null", '{"hooks":[]}', '{"hooks":{"stop":{}}}'])(
    "reports invalid json for %s",
    (text) => {
      expect(mergeHookEntry(text, entry)).toEqual({ ok: false, reason: "invalid_json" });
    },
  );

  it("treats any command containing the marker as present", () => {
    const existing = { command: 'node "/Users/x/.focus-bell/hook.js"', timeout: 99 };
    const hooks = Object.fromEntries(HOOK_EVENTS.map((e) => [e, [existing]]));
    const input = JSON.stringify({ version: 1, hooks });
    const result = ok(mergeHookEntry(input, entry));
    expect(result.changed).toBe(false);
    expect(JSON.parse(result.merged)).toEqual({ version: 1, hooks });
  });
});

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hook = join(__dirname, "..", "hook", "hook.js");
const fixtureDir = join(__dirname, "fixtures", "hook");
const allow = '{"permission":"allow"}\n';

const baseKeys = [
  "ts",
  "conversation_id",
  "generation_id",
  "event",
  "state",
  "workspace_roots",
  "transcript_path",
  "model",
  "cursor_version",
];

const table: Array<[string, string, string]> = [
  ["beforeSubmitPrompt", "thinking", ""],
  ["beforeShellExecution", "needs_approval", allow],
  ["afterShellExecution", "thinking", ""],
  ["afterAgentResponse", "responded", ""],
  ["postToolUseFailure", "error", ""],
  ["postToolUseFailure-interrupt", "error", ""],
  ["stop-completed", "done", ""],
  ["stop-aborted", "error", ""],
  ["unknownEvent", "unknown", ""],
];

function freshHome() {
  return mkdtempSync(join(tmpdir(), "focus-bell-"));
}

function run(home: string, input: string) {
  return spawnSync("node", [hook], {
    input,
    encoding: "utf8",
    env: { ...process.env, FOCUS_BELL_HOME: home },
  });
}

function fixture(name: string) {
  return readFileSync(join(fixtureDir, `${name}.json`), "utf8");
}

function lines(home: string) {
  return readFileSync(join(home, "events.jsonl"), "utf8").split("\n").filter(Boolean);
}

describe("hook/hook.js", () => {
  for (const [name, state, stdout] of table) {
    it(`normalizes ${name}`, () => {
      const home = freshHome();
      const result = run(home, fixture(name));
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(stdout);
      const written = lines(home);
      expect(written).toHaveLength(1);
      const line = JSON.parse(written[0]!);
      const expectedKeys = name.endsWith("-interrupt")
        ? [...baseKeys.slice(0, 5), "is_interrupt", ...baseKeys.slice(5)]
        : baseKeys;
      expect(Object.keys(line)).toEqual(expectedKeys);
      expect(line.state).toBe(state);
      expect(line.event).toBe(JSON.parse(fixture(name)).hook_event_name);
      expect(line.conversation_id).toBe("conv-1");
      expect(line.generation_id).toBe("gen-1");
      expect(line.workspace_roots).toEqual(["/Users/zac/code/rmx"]);
      expect(line.transcript_path).toBe("/Users/zac/.cursor/t/transcript.md");
      expect(line.model).toBe("claude");
      expect(line.cursor_version).toBe("3.19.13");
      expect(Number.isNaN(Date.parse(line.ts))).toBe(false);
      if (name.endsWith("-interrupt")) expect(line.is_interrupt).toBe(true);
    });
  }

  it("appends across invocations", () => {
    const home = freshHome();
    run(home, fixture("beforeSubmitPrompt"));
    run(home, fixture("stop-completed"));
    const written = lines(home).map((l) => JSON.parse(l).state);
    expect(written).toEqual(["thinking", "done"]);
  });

  it("defaults home to ~/.focus-bell when FOCUS_BELL_HOME is unset", () => {
    const home = freshHome();
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.FOCUS_BELL_HOME;
    const result = spawnSync("node", [hook], { input: fixture("beforeSubmitPrompt"), encoding: "utf8", env });
    expect(result.status).toBe(0);
    const eventsPath = join(home, ".focus-bell", "events.jsonl");
    expect(existsSync(eventsPath)).toBe(true);
    expect(readFileSync(eventsPath, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("ignores malformed stdin", () => {
    const home = freshHome();
    const result = run(home, "{nope");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(home, "events.jsonl"))).toBe(false);
  });
});

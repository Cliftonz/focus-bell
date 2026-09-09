import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hook = join(__dirname, "..", "hook", "hook.js");
const fixtureDir = join(__dirname, "fixtures", "hook");

function freshHome() {
  return mkdtempSync(join(tmpdir(), "focus-bell-debug-"));
}

function enableDebug(home: string) {
  writeFileSync(join(home, "debug"), "");
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

function events(home: string) {
  return readFileSync(join(home, "events.jsonl"), "utf8").split("\n").filter(Boolean);
}

describe("hook/hook.js debug raw payload log", () => {
  it("appends the raw stdin payload to hook.log when the debug flag file exists", () => {
    const home = freshHome();
    enableDebug(home);
    const raw = fixture("stop-completed");
    const result = run(home, raw);
    expect(result.status).toBe(0);
    expect(readFileSync(join(home, "hook.log"), "utf8")).toBe(raw + "\n");
    expect(events(home)).toHaveLength(1);
  });

  it("does not create hook.log without the debug flag file", () => {
    const home = freshHome();
    const result = run(home, fixture("stop-completed"));
    expect(result.status).toBe(0);
    expect(existsSync(join(home, "hook.log"))).toBe(false);
    expect(events(home)).toHaveLength(1);
  });

  it("appends raw payloads in order across invocations", () => {
    const home = freshHome();
    enableDebug(home);
    const first = fixture("beforeSubmitPrompt");
    const second = fixture("stop-completed");
    run(home, first);
    run(home, second);
    expect(readFileSync(join(home, "hook.log"), "utf8")).toBe(first + "\n" + second + "\n");
  });

  it("writes nothing on malformed stdin even with the debug flag file", () => {
    const home = freshHome();
    enableDebug(home);
    const result = run(home, "{nope");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(home, "hook.log"))).toBe(false);
    expect(existsSync(join(home, "events.jsonl"))).toBe(false);
  });
});

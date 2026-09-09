import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cli = join(__dirname, "..", "cli", "install.js");
const sourceHook = join(__dirname, "..", "hook", "hook.js");

function freshHome() {
  return mkdtempSync(join(tmpdir(), "focus-bell-cli-"));
}

function run(home: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, FOCUS_BELL_TEST_HOME: home },
    encoding: "utf8",
  });
}

function hooksPath(home: string) {
  return join(home, ".cursor", "hooks.json");
}

function backups(home: string) {
  return readdirSync(join(home, ".cursor")).filter((f) => f.startsWith("hooks.json.bak."));
}

describe("focus-bell install", () => {
  it("installs into an empty home", () => {
    const home = freshHome();
    const result = run(home, "install");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("installed focus-bell hook into");
    const hooks = JSON.parse(readFileSync(hooksPath(home), "utf8")).hooks;
    expect(Object.keys(hooks)).toHaveLength(6);
    for (const entries of Object.values(hooks) as Array<Array<{ command: string }>>) {
      expect(entries[0].command).toContain(".focus-bell/hook.js");
      expect(entries[0].command).not.toContain("\\");
    }
    expect(readFileSync(join(home, ".focus-bell", "hook.js"))).toEqual(readFileSync(sourceHook));
  });

  it("is a no-op on rerun", () => {
    const home = freshHome();
    run(home);
    const result = run(home);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("already installed");
    expect(backups(home)).toEqual([]);
  });

  it("backs up an existing hooks.json and keeps foreign entries", () => {
    const home = freshHome();
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const original = JSON.stringify({ hooks: { stop: [{ command: "echo hi" }] } });
    writeFileSync(hooksPath(home), original);
    const result = run(home);
    expect(result.status).toBe(0);
    const [backup] = backups(home);
    expect(backup).toBeDefined();
    expect(readFileSync(join(home, ".cursor", backup), "utf8")).toBe(original);
    const merged = JSON.parse(readFileSync(hooksPath(home), "utf8"));
    expect(merged.hooks.stop[0]).toEqual({ command: "echo hi" });
  });

  it("refuses to touch invalid json", () => {
    const home = freshHome();
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(hooksPath(home), "{bad");
    const result = run(home);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("not valid JSON");
    expect(result.stdout).toContain('"beforeShellExecution"');
    expect(readFileSync(hooksPath(home), "utf8")).toBe("{bad");
  });

  it("prints usage for an unknown subcommand", () => {
    const result = run(freshHome(), "frobnicate");
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("usage");
  });
});

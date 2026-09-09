import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeHookEntry } from "../cli/merge";
import {
  CURSOR_HOOKS_RELATIVE,
  ENTERPRISE_HOOKS_PATH,
  applyInstall,
  cursorHooksPath,
  hookEntry,
  installedHookPath,
  planInstall,
  projectHooksExist,
} from "../src/hooks/install";

const EVENTS = [
  "beforeSubmitPrompt",
  "beforeShellExecution",
  "afterShellExecution",
  "afterAgentResponse",
  "postToolUseFailure",
  "stop",
];

const NOW = "2026-09-09T10:20:30.000Z";

function setup(hookContent = "console.log('hook v1')") {
  const root = mkdtempSync(join(tmpdir(), "focus-bell-install-"));
  const homeDir = join(root, "home");
  const workspace = join(root, "workspace");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const bundledHookPath = join(root, "bundled-hook.js");
  writeFileSync(bundledHookPath, hookContent);
  const input = {
    homeDir,
    bundledHookPath,
    platform: "linux" as NodeJS.Platform,
    workspaceFolders: [workspace],
    now: NOW,
  };
  const hooksPath = join(homeDir, ...CURSOR_HOOKS_RELATIVE);
  return { root, homeDir, workspace, bundledHookPath, input, hooksPath };
}

function apply(plan: ReturnType<typeof planInstall>) {
  if (plan.kind !== "apply") throw new Error("expected apply, got " + plan.kind);
  return plan;
}

describe("constants", () => {
  it("names the cursor hooks path and enterprise paths", () => {
    expect(CURSOR_HOOKS_RELATIVE).toEqual([".cursor", "hooks.json"]);
    expect(ENTERPRISE_HOOKS_PATH.darwin).toBe("/Library/Application Support/Cursor/hooks.json");
    expect(ENTERPRISE_HOOKS_PATH.linux).toBe("/etc/cursor/hooks.json");
    expect(ENTERPRISE_HOOKS_PATH.win32).toBe("C:\\ProgramData\\Cursor\\hooks.json");
  });

  it("hookEntry points node at the installed hook with forward slashes", () => {
    expect(hookEntry("/Users/me")).toEqual({
      command: 'node "/Users/me/.focus-bell/hook.js"',
      timeout: 5,
    });
    expect(hookEntry("C:\\Users\\me").command).not.toContain("\\");
  });

  it("cursorHooksPath and installedHookPath resolve under homeDir", () => {
    expect(cursorHooksPath("/Users/me")).toBe(join("/Users/me", ".cursor", "hooks.json"));
    expect(installedHookPath("/Users/me")).toBe(join("/Users/me", ".focus-bell", "hook.js"));
  });

  it("projectHooksExist reports whether any workspace folder has .cursor/hooks.json", () => {
    const { workspace } = setup();
    expect(projectHooksExist([workspace])).toBe(false);
    mkdirSync(join(workspace, ".cursor"), { recursive: true });
    writeFileSync(join(workspace, ".cursor", "hooks.json"), "{}");
    expect(projectHooksExist([workspace])).toBe(true);
  });
});

describe("planInstall", () => {
  it("plans a fresh install when no hooks.json exists, then noops after apply", () => {
    const { homeDir, bundledHookPath, input, hooksPath } = setup();
    const plan = apply(planInstall(input));

    expect(plan.hooksPath).toBe(hooksPath);
    expect(plan.before).toBeNull();
    expect(plan.backupPath).toBeNull();
    expect(plan.enterpriseExists).toBe(false);
    expect(plan.projectHooksExists).toBe(false);

    const after = JSON.parse(plan.after);
    const installedHook = join(homeDir, ".focus-bell", "hook.js");
    for (const event of EVENTS) {
      expect(after.hooks[event]).toHaveLength(1);
      expect(after.hooks[event][0].command).toContain(installedHook.replace(/\\/g, "/"));
    }
    expect(readFileSync(installedHook, "utf8")).toBe(readFileSync(bundledHookPath, "utf8"));

    applyInstall(plan);
    expect(readFileSync(hooksPath, "utf8")).toBe(plan.after);
    expect(planInstall(input).kind).toBe("noop");
  });

  it("backs up an existing hooks.json with a foreign entry", () => {
    const { input, hooksPath } = setup();
    mkdirSync(join(input.homeDir, ".cursor"), { recursive: true });
    const before = JSON.stringify(
      { version: 1, hooks: { stop: [{ command: "other-tool", timeout: 1 }] } },
      null,
      2,
    );
    writeFileSync(hooksPath, before);

    const plan = apply(planInstall(input));
    expect(plan.before).toBe(before);
    expect(plan.backupPath).toBe(hooksPath + ".bak.2026-09-09T10-20-30.000Z");

    applyInstall(plan);
    expect(readFileSync(plan.backupPath as string, "utf8")).toBe(before);
    expect(readFileSync(hooksPath, "utf8")).toBe(plan.after);
    const merged = JSON.parse(plan.after);
    expect(merged.hooks.stop[0].command).toBe("other-tool");
    expect(merged.hooks.stop).toHaveLength(2);
  });

  it("reports invalid json with a suggested entry and leaves the file untouched", () => {
    const { input, hooksPath } = setup();
    mkdirSync(join(input.homeDir, ".cursor"), { recursive: true });
    writeFileSync(hooksPath, "{bad");

    const plan = planInstall(input);
    if (plan.kind !== "invalid") throw new Error("expected invalid, got " + plan.kind);
    const suggested = JSON.parse(plan.suggestedEntry);
    expect(suggested.version).toBe(1);
    expect(Object.keys(suggested.hooks).sort()).toEqual([...EVENTS].sort());
    expect(plan.suggestedEntry).toBe(mergeHookEntry(null, hookEntry(input.homeDir)).merged);
    expect(readFileSync(hooksPath, "utf8")).toBe("{bad");
  });

  it("detects a project-level hooks.json in a workspace folder", () => {
    const { input, workspace } = setup();
    mkdirSync(join(workspace, ".cursor"), { recursive: true });
    writeFileSync(join(workspace, ".cursor", "hooks.json"), "{}");

    expect(planInstall(input).projectHooksExists).toBe(true);
  });

  it("overwrites the installed hook when the bundled content changes", () => {
    const { homeDir, bundledHookPath, input } = setup("v1");
    planInstall(input);
    const installedHook = join(homeDir, ".focus-bell", "hook.js");
    expect(existsSync(installedHook)).toBe(true);

    writeFileSync(bundledHookPath, "v2");
    planInstall(input);
    expect(readFileSync(installedHook, "utf8")).toBe("v2");
  });
});

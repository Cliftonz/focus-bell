import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { mergeHookEntry } from "../../cli/merge";

export const CURSOR_HOOKS_RELATIVE = [".cursor", "hooks.json"];

export const ENTERPRISE_HOOKS_PATH: Record<string, string> = {
  darwin: "/Library/Application Support/Cursor/hooks.json",
  linux: "/etc/cursor/hooks.json",
  win32: "C:\\ProgramData\\Cursor\\hooks.json",
};

export function cursorHooksPath(homeDir: string): string {
  return path.join(homeDir, ...CURSOR_HOOKS_RELATIVE);
}

export function installedHookPath(homeDir: string): string {
  return path.join(homeDir, ".focus-bell", "hook.js");
}

export function projectHooksExist(workspaceFolders: string[]): boolean {
  return workspaceFolders.some((folder) => existsSync(cursorHooksPath(folder)));
}

export function hookEntry(homeDir: string): { command: string; timeout: number } {
  return { command: 'node "' + installedHookPath(homeDir).replace(/\\/g, "/") + '"', timeout: 5 };
}

export type InstallPlan = (
  | { kind: "noop" }
  | { kind: "apply"; before: string | null; after: string; backupPath: string | null }
  | { kind: "invalid"; suggestedEntry: string }
) & { hooksPath: string; enterpriseExists: boolean; projectHooksExists: boolean };

export function planInstall(input: {
  homeDir: string;
  bundledHookPath: string;
  platform: NodeJS.Platform;
  workspaceFolders: string[];
  now: string;
}): InstallPlan {
  const installedHook = installedHookPath(input.homeDir);
  mkdirSync(path.dirname(installedHook), { recursive: true });
  copyFileSync(input.bundledHookPath, installedHook);

  const hooksPath = cursorHooksPath(input.homeDir);
  const before = existsSync(hooksPath) ? readFileSync(hooksPath, "utf8") : null;
  const entry = hookEntry(input.homeDir);
  const context = {
    hooksPath,
    enterpriseExists: existsSync(ENTERPRISE_HOOKS_PATH[input.platform]),
    projectHooksExists: projectHooksExist(input.workspaceFolders),
  };

  const result = mergeHookEntry(before, entry);
  if (!result.ok) {
    return { kind: "invalid", suggestedEntry: mergeHookEntry(null, entry).merged, ...context };
  }
  if (!result.changed) return { kind: "noop", ...context };
  return {
    kind: "apply",
    before,
    after: result.merged,
    backupPath: before === null ? null : hooksPath + ".bak." + input.now.replace(/:/g, "-"),
    ...context,
  };
}

export function applyInstall(plan: Extract<InstallPlan, { kind: "apply" }>): void {
  mkdirSync(path.dirname(plan.hooksPath), { recursive: true });
  if (plan.backupPath !== null) copyFileSync(plan.hooksPath, plan.backupPath);
  writeFileSync(plan.hooksPath, plan.after);
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ThemeFiles = { prompt?: string; notification: string; done: string; response?: string };

export type ResolvedTheme = { name: string; volume: number; files: ThemeFiles; missing: string[] };

export const REQUIRED = ["notification.wav", "done.wav", "theme.json"];

const OPTIONAL = ["prompt", "response"] as const;

function loadTheme(folder: string): { volume: number; files: ThemeFiles } {
  const { volume } = JSON.parse(readFileSync(join(folder, "theme.json"), "utf8")) as { volume: number };
  const files: ThemeFiles = {
    notification: join(folder, "notification.wav"),
    done: join(folder, "done.wav"),
  };
  for (const key of OPTIONAL) {
    const path = join(folder, `${key}.wav`);
    if (existsSync(path)) files[key] = path;
  }
  return { volume, files };
}

export function resolveTheme(name: string, bundledDir: string, userDir: string): ResolvedTheme {
  const userFolder = join(userDir, name);
  const candidate = existsSync(userFolder) ? userFolder : join(bundledDir, name);
  const missing = REQUIRED.filter((f) => !existsSync(join(candidate, f)));
  const source = missing.length === 0 ? candidate : join(bundledDir, "plain");
  return { name, missing, ...loadTheme(source) };
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REQUIRED, resolveTheme } from "../src/sound/themes";

let root: string;
let bundledDir: string;
let userDir: string;

function writeTheme(dir: string, name: string, volume: number, files: string[]) {
  const folder = join(dir, name);
  mkdirSync(folder, { recursive: true });
  for (const f of files) writeFileSync(join(folder, f), "x");
  writeFileSync(join(folder, "theme.json"), JSON.stringify({ name, volume }));
  return folder;
}

const ALL = ["prompt.wav", "notification.wav", "done.wav", "response.wav"];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "focusbell-themes-"));
  bundledDir = join(root, "bundled");
  userDir = join(root, "user");
  writeTheme(bundledDir, "plain", 0.5, ALL);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("resolveTheme", () => {
  it("resolves a full bundled theme", () => {
    const loud = writeTheme(bundledDir, "loud", 1, ALL);
    const theme = resolveTheme("loud", bundledDir, userDir);
    expect(theme).toEqual({
      name: "loud",
      volume: 1,
      missing: [],
      files: {
        prompt: join(loud, "prompt.wav"),
        notification: join(loud, "notification.wav"),
        done: join(loud, "done.wav"),
        response: join(loud, "response.wav"),
      },
    });
  });

  it("prefers a user theme that shadows a bundled one", () => {
    writeTheme(bundledDir, "loud", 1, ALL);
    const mine = writeTheme(userDir, "loud", 0.8, ALL);
    const theme = resolveTheme("loud", bundledDir, userDir);
    expect(theme.volume).toBe(0.8);
    expect(theme.files).toEqual({
      prompt: join(mine, "prompt.wav"),
      notification: join(mine, "notification.wav"),
      done: join(mine, "done.wav"),
      response: join(mine, "response.wav"),
    });
  });

  it("falls back to bundled plain when a user theme lacks a required file", () => {
    writeTheme(userDir, "mine", 0.3, ["prompt.wav", "notification.wav", "response.wav"]);
    const plain = join(bundledDir, "plain");
    const theme = resolveTheme("mine", bundledDir, userDir);
    expect(theme).toEqual({
      name: "mine",
      volume: 0.5,
      missing: ["done.wav"],
      files: {
        prompt: join(plain, "prompt.wav"),
        notification: join(plain, "notification.wav"),
        done: join(plain, "done.wav"),
        response: join(plain, "response.wav"),
      },
    });
  });

  it("omits optional files that are absent", () => {
    const quiet = writeTheme(bundledDir, "quiet", 0.2, ["notification.wav", "done.wav"]);
    const theme = resolveTheme("quiet", bundledDir, userDir);
    expect(theme.missing).toEqual([]);
    expect(theme.files.prompt).toBeUndefined();
    expect(theme.files.response).toBeUndefined();
    expect(theme.files).toEqual({
      notification: join(quiet, "notification.wav"),
      done: join(quiet, "done.wav"),
    });
  });

  it("reports every required file missing for an unknown theme", () => {
    const plain = join(bundledDir, "plain");
    const theme = resolveTheme("nope", bundledDir, userDir);
    expect(theme.name).toBe("nope");
    expect(theme.missing).toEqual(REQUIRED);
    expect(theme.volume).toBe(0.5);
    expect(theme.files.notification).toBe(join(plain, "notification.wav"));
    expect(theme.files.done).toBe(join(plain, "done.wav"));
  });
});

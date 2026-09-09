import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KILL_AFTER_MS, buildPlayCommand, play } from "../src/sound/player";

describe("buildPlayCommand", () => {
  it("darwin uses afplay with volume", () => {
    expect(buildPlayCommand("darwin", "/s/ding.wav", 0.5, [])).toEqual({
      cmd: "afplay",
      args: ["-v", "0.5", "/s/ding.wav"],
    });
  });

  it("win32 uses powershell SoundPlayer with the file path", () => {
    const command = buildPlayCommand("win32", "C:\\s\\ding.wav", 0.5, []);
    expect(command?.cmd).toBe("powershell");
    expect(command?.args.slice(0, 2)).toEqual(["-NoProfile", "-c"]);
    expect(command?.args[2]).toBe("(New-Object Media.SoundPlayer 'C:\\s\\ding.wav').PlaySync()");
  });

  it("win32 doubles single quotes in the file path", () => {
    const command = buildPlayCommand("win32", "C:\\Users\\O'Brien\\d.wav", 1, []);
    expect(command?.args[2]).toContain("'C:\\Users\\O''Brien\\d.wav'");
  });

  it("linux picks the first available player in preference order", () => {
    expect(buildPlayCommand("linux", "/s/ding.wav", 0.5, ["aplay", "play"])).toEqual({
      cmd: "aplay",
      args: ["/s/ding.wav"],
    });
  });

  it("linux returns undefined when no player is available", () => {
    expect(buildPlayCommand("linux", "/s/ding.wav", 0.5, [])).toBeUndefined();
  });
});

describe("play", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns detached and hidden, unrefs, and kills after KILL_AFTER_MS", () => {
    const child = { unref: vi.fn(), kill: vi.fn(), on: vi.fn() };
    const spawn = vi.fn(() => child);

    play({ cmd: "afplay", args: ["/s/ding.wav"] }, spawn, () => {});

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("afplay", ["/s/ding.wav"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(KILL_AFTER_MS - 1);
    expect(child.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("routes the child's error event to onError", () => {
    let listener: ((err: Error) => void) | undefined;
    const child = {
      unref: vi.fn(),
      kill: vi.fn(),
      on: vi.fn((_event: "error", fn: (err: Error) => void) => {
        listener = fn;
      }),
    };
    const onError = vi.fn();

    play({ cmd: "missing", args: [] }, () => child, onError);

    expect(child.on).toHaveBeenCalledWith("error", expect.any(Function));
    const err = new Error("ENOENT");
    expect(() => listener!(err)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

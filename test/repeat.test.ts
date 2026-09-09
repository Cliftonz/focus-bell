import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepeater } from "../src/sound/repeat";

function setup() {
  const played: string[] = [];
  const repeater = createRepeater({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    play: (id) => played.push(id),
  });
  return { played, repeater };
}

describe("createRepeater", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires at 15s, 30s, 60s, then every 60s through 600s", () => {
    const { played, repeater } = setup();
    repeater.start("c1");
    vi.advanceTimersByTime(14999);
    expect(played.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(played.length).toBe(1);
    vi.advanceTimersByTime(15000);
    expect(played.length).toBe(2);
    vi.advanceTimersByTime(30000);
    expect(played.length).toBe(3);
    vi.advanceTimersByTime(60000);
    expect(played.length).toBe(4);
    vi.advanceTimersByTime(480000);
    expect(played.length).toBe(12);
    vi.advanceTimersByTime(60000);
    expect(played.length).toBe(12);
  });

  it("stop halts further firings", () => {
    const { played, repeater } = setup();
    repeater.start("c1");
    vi.advanceTimersByTime(20000);
    repeater.stop("c1");
    vi.advanceTimersByTime(60000);
    expect(played.length).toBe(1);
  });

  it("stop on an id that was never started is a no-op", () => {
    const clearTimer = vi.fn();
    const repeater = createRepeater({
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer,
      play: () => {},
    });
    expect(() => repeater.stop("never")).not.toThrow();
    expect(clearTimer).not.toHaveBeenCalled();
  });

  it("tracks conversations independently", () => {
    const { played, repeater } = setup();
    repeater.start("c1");
    repeater.start("c2");
    vi.advanceTimersByTime(15000);
    expect(played).toEqual(["c1", "c2"]);
  });

  it("restarting the same id reschedules from now", () => {
    const { played, repeater } = setup();
    repeater.start("c1");
    vi.advanceTimersByTime(5000);
    repeater.start("c1");
    vi.advanceTimersByTime(14999);
    expect(played.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(played.length).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovalGate, type GateEvent } from "../src/state/approval.js";

const needsApproval = (generation_id: string): GateEvent => ({
  event: "Notification",
  state: "needs_approval",
  generation_id,
  conversation_id: "c1",
});

const shellDone = (generation_id: string): GateEvent => ({
  event: "afterShellExecution",
  state: "running",
  generation_id,
  conversation_id: "c1",
});

let emit: ReturnType<typeof vi.fn<(e: GateEvent) => void>>;
let gate: ReturnType<typeof createApprovalGate>;

beforeEach(() => {
  vi.useFakeTimers();
  emit = vi.fn<(e: GateEvent) => void>();
  gate = createApprovalGate({
    delayMs: 1500,
    setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimer: (handle) => globalThis.clearTimeout(handle as NodeJS.Timeout),
    emit,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("approval gate", () => {
  it("suppresses needs_approval when the shell finishes within the delay", () => {
    gate.onEvent(needsApproval("gen-1"));
    vi.advanceTimersByTime(500);
    gate.onEvent(shellDone("gen-1"));
    vi.advanceTimersByTime(1500);
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits needs_approval once after the delay elapses", () => {
    const e = needsApproval("gen-1");
    gate.onEvent(e);
    vi.advanceTimersByTime(1499);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(e);
  });

  it("keys timers by generation so one shell finishing leaves the other armed", () => {
    const gen2 = needsApproval("gen-2");
    gate.onEvent(needsApproval("gen-1"));
    gate.onEvent(gen2);
    gate.onEvent(shellDone("gen-1"));
    vi.advanceTimersByTime(1500);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(gen2);
  });

  it("re-arms the timer when needs_approval repeats for the same generation", () => {
    gate.onEvent(needsApproval("gen-1"));
    vi.advanceTimersByTime(1000);
    gate.onEvent(needsApproval("gen-1"));
    vi.advanceTimersByTime(1499);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("ignores afterShellExecution for a generation that was never armed", () => {
    expect(() => gate.onEvent(shellDone("gen-9"))).not.toThrow();
    vi.advanceTimersByTime(2000);
    expect(emit).not.toHaveBeenCalled();
  });

  it("ignores events that are neither needs_approval nor afterShellExecution", () => {
    gate.onEvent({
      event: "stop",
      state: "done",
      generation_id: "gen-1",
      conversation_id: "c1",
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(emit).not.toHaveBeenCalled();
  });
});

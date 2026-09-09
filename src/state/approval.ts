export type GateEvent = {
  event: string;
  state: string;
  generation_id: string;
  conversation_id: string;
};

export function createApprovalGate(deps: {
  delayMs: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  emit: (e: GateEvent) => void;
}): { onEvent(e: GateEvent): void } {
  const armed = new Map<string, unknown>();

  const disarm = (generation_id: string) => {
    if (!armed.has(generation_id)) return;
    deps.clearTimer(armed.get(generation_id));
    armed.delete(generation_id);
  };

  return {
    onEvent(e) {
      if (e.state === "needs_approval") {
        disarm(e.generation_id);
        armed.set(
          e.generation_id,
          deps.setTimer(() => {
            armed.delete(e.generation_id);
            deps.emit(e);
          }, deps.delayMs),
        );
      } else if (e.event === "afterShellExecution") {
        disarm(e.generation_id);
      }
    },
  };
}

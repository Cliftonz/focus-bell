export const REPEAT_OFFSETS_MS = [15000, 30000, 60000];

const REPEAT_INTERVAL_MS = 60000;
const REPEAT_LIMIT_MS = 600000;

type RepeaterDeps = {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  play: (conversationId: string) => void;
};

function nextOffset(elapsed: number): number | undefined {
  const upcoming = REPEAT_OFFSETS_MS.find((offset) => offset > elapsed);
  if (upcoming !== undefined) return upcoming;
  const next = elapsed + REPEAT_INTERVAL_MS;
  return next <= REPEAT_LIMIT_MS ? next : undefined;
}

export function createRepeater(deps: RepeaterDeps) {
  const pending = new Map<string, unknown>();

  function schedule(conversationId: string, elapsed: number): void {
    const offset = nextOffset(elapsed);
    if (offset === undefined) {
      pending.delete(conversationId);
      return;
    }
    const handle = deps.setTimer(() => {
      deps.play(conversationId);
      schedule(conversationId, offset);
    }, offset - elapsed);
    pending.set(conversationId, handle);
  }

  function stop(conversationId: string): void {
    if (!pending.has(conversationId)) return;
    deps.clearTimer(pending.get(conversationId));
    pending.delete(conversationId);
  }

  return {
    start(conversationId: string): void {
      stop(conversationId);
      schedule(conversationId, 0);
    },
    stop,
  };
}

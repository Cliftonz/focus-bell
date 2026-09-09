export type RouterEvent = {
  event: string;
  state: string;
  conversation_id: string;
  is_interrupt?: boolean;
};

export type RouterTierConfig = { repeat: boolean; respectFocusMute: boolean };

export type RouterTheme = {
  files: { prompt?: string; notification: string; done: string; response?: string };
};

export const SLOT_BY_STATE: Record<string, keyof RouterTheme["files"]> = {
  needs_approval: "notification",
  error: "notification",
  done: "done",
  responded: "response",
  thinking: "prompt",
};

export function routeAlert(input: {
  event: RouterEvent;
  tierConfig: RouterTierConfig;
  theme: RouterTheme | null;
  windowFocused: boolean;
  activeConversationId: string | undefined;
}): { file: string; repeat: boolean } | null {
  const { event, tierConfig, theme, windowFocused, activeConversationId } = input;
  if (theme === null) return null;
  if (event.is_interrupt === true) return null;
  if (tierConfig.respectFocusMute && windowFocused && event.conversation_id === activeConversationId) return null;
  const slot = SLOT_BY_STATE[event.state];
  if (slot === undefined) return null;
  if (slot === "prompt" && event.event !== "beforeSubmitPrompt") return null;
  const file = theme.files[slot];
  if (file === undefined) return null;
  return { file, repeat: tierConfig.repeat && event.state === "needs_approval" };
}

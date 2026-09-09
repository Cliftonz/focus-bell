import { describe, expect, it } from "vitest";
import { routeAlert, RouterTheme, RouterTierConfig } from "../src/sound/router";

const theme: RouterTheme = {
  files: {
    prompt: "/t/prompt.wav",
    notification: "/t/notification.wav",
    done: "/t/done.wav",
    response: "/t/response.wav",
  },
};

const primary: RouterTierConfig = { repeat: true, respectFocusMute: false };
const secondary: RouterTierConfig = { repeat: false, respectFocusMute: true };

function route(
  state: string,
  overrides: Partial<{
    tierConfig: RouterTierConfig;
    theme: RouterTheme | null;
    windowFocused: boolean;
    activeConversationId: string | undefined;
    is_interrupt: boolean;
    event: string;
  }> = {},
) {
  return routeAlert({
    event: {
      event: overrides.event ?? "afterAgentResponse",
      state,
      conversation_id: "c1",
      is_interrupt: overrides.is_interrupt,
    },
    tierConfig: overrides.tierConfig ?? primary,
    theme: "theme" in overrides ? (overrides.theme as RouterTheme | null) : theme,
    windowFocused: overrides.windowFocused ?? false,
    activeConversationId: overrides.activeConversationId,
  });
}

describe("routeAlert", () => {
  it("primary plays needs_approval with repeat even when focused and active", () => {
    expect(route("needs_approval", { windowFocused: true, activeConversationId: "c1" })).toEqual({
      file: "/t/notification.wav",
      repeat: true,
    });
  });

  it("primary plays done without repeat", () => {
    expect(route("done")).toEqual({ file: "/t/done.wav", repeat: false });
  });

  it("secondary mutes when focused on the active conversation", () => {
    expect(
      route("needs_approval", { tierConfig: secondary, windowFocused: true, activeConversationId: "c1" }),
    ).toBeNull();
  });

  it("secondary plays when focused on a different conversation", () => {
    expect(
      route("needs_approval", { tierConfig: secondary, windowFocused: true, activeConversationId: "c2" }),
    ).toEqual({ file: "/t/notification.wav", repeat: false });
  });

  it("secondary plays when unfocused on the active conversation", () => {
    expect(
      route("needs_approval", { tierConfig: secondary, windowFocused: false, activeConversationId: "c1" }),
    ).toEqual({ file: "/t/notification.wav", repeat: false });
  });

  it("returns null when the theme is null", () => {
    expect(route("needs_approval", { theme: null })).toBeNull();
  });

  it("returns null for responded when the theme lacks a response file", () => {
    const noResponse: RouterTheme = {
      files: { notification: "/t/notification.wav", done: "/t/done.wav" },
    };
    expect(route("responded", { theme: noResponse })).toBeNull();
  });

  it("plays response for responded when the theme has one", () => {
    expect(route("responded")).toEqual({ file: "/t/response.wav", repeat: false });
  });

  it("plays prompt for thinking on beforeSubmitPrompt", () => {
    expect(route("thinking", { event: "beforeSubmitPrompt" })).toEqual({
      file: "/t/prompt.wav",
      repeat: false,
    });
  });

  it("returns null for thinking on afterShellExecution even with a prompt file", () => {
    expect(route("thinking", { event: "afterShellExecution" })).toBeNull();
  });

  it("returns null for thinking on beforeSubmitPrompt when the theme lacks a prompt file", () => {
    const noPrompt: RouterTheme = {
      files: { notification: "/t/notification.wav", done: "/t/done.wav" },
    };
    expect(route("thinking", { event: "beforeSubmitPrompt", theme: noPrompt })).toBeNull();
  });

  it("returns null for an interrupt error", () => {
    expect(route("error", { is_interrupt: true })).toBeNull();
  });

  it("plays notification for a non-interrupt error", () => {
    expect(route("error", { is_interrupt: false })).toEqual({ file: "/t/notification.wav", repeat: false });
  });

  it("returns null for an unknown state", () => {
    expect(route("aborted")).toBeNull();
  });
});

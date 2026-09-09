import { describe, expect, it } from "vitest";
import {
  PICK_TIER_COMMAND,
  StatusItem,
  createStatusBar,
  statusText,
  statusTooltip,
} from "../src/ui/statusBar";

describe("statusText", () => {
  it("renders the untagged placeholder", () => {
    expect(statusText(undefined)).toBe("$(bell) –");
  });

  it("renders primary", () => {
    expect(statusText("primary")).toBe("$(bell) primary");
  });

  it("renders secondary", () => {
    expect(statusText("secondary")).toBe("$(bell) secondary");
  });

  it("renders tertiary with the slashed bell", () => {
    expect(statusText("tertiary")).toBe("$(bell-slash) tertiary");
  });
});

describe("statusTooltip", () => {
  it("defaults to untagged and idle", () => {
    expect(statusTooltip(undefined, undefined)).toBe("Focus Bell: untagged, idle");
  });

  it("includes tier and state", () => {
    expect(statusTooltip("primary", "needs_approval")).toBe(
      "Focus Bell: primary, needs_approval",
    );
  });
});

describe("createStatusBar", () => {
  it("wires the command, shows the item, and updates text and tooltip", () => {
    let shows = 0;
    const item: StatusItem = {
      text: "",
      tooltip: "",
      command: "",
      show() {
        shows += 1;
      },
    };

    const bar = createStatusBar(item);

    expect(item.command).toBe(PICK_TIER_COMMAND);
    expect(shows).toBe(1);

    bar.update("secondary", "done");

    expect(item.text).toBe("$(bell) secondary");
    expect(item.tooltip).toBe("Focus Bell: secondary, done");
  });
});

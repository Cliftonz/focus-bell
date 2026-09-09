import { describe, expect, it } from "vitest";
import { DEFAULT_TIERS, readSettings } from "../src/config";

const none = () => undefined;

function withValues(values: Record<string, unknown>) {
  return (key: string) => values[key];
}

describe("readSettings", () => {
  it("yields defaults when every key is undefined", () => {
    expect(readSettings(none)).toEqual({
      tiers: DEFAULT_TIERS,
      defaultTier: "secondary",
      idleMinutes: 10,
      debug: false,
    });
  });

  it("merges a partial primary tier over the default", () => {
    const settings = readSettings(withValues({ tiers: { primary: { repeat: false } } }));
    expect(settings.tiers.primary).toEqual({ theme: "loud", repeat: false, respectFocusMute: false });
    expect(settings.tiers.secondary).toEqual(DEFAULT_TIERS.secondary);
    expect(settings.tiers.tertiary).toEqual(DEFAULT_TIERS.tertiary);
  });

  it("overrides the tertiary theme", () => {
    const settings = readSettings(withValues({ tiers: { tertiary: { theme: "plain" } } }));
    expect(settings.tiers.tertiary.theme).toBe("plain");
  });

  it("passes scalar settings through", () => {
    const settings = readSettings(withValues({ defaultTier: "primary", idleMinutes: 3, debug: true }));
    expect(settings.defaultTier).toBe("primary");
    expect(settings.idleMinutes).toBe(3);
    expect(settings.debug).toBe(true);
  });
});

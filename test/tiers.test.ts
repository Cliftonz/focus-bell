import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clearTier, readTiers, setTier } from "../src/state/tiers";

describe("tiers store", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-tiers-"));
    file = path.join(dir, "nested", "tiers.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns {} when the file does not exist", () => {
    expect(readTiers(file)).toEqual({});
  });

  it("setTier then readTiers returns the record", () => {
    setTier(file, "conv-1", "primary", "/ws/a", "2026-09-09T10:00:00.000Z");
    expect(readTiers(file)).toEqual({
      "conv-1": { tier: "primary", set_at: "2026-09-09T10:00:00.000Z", workspace: "/ws/a" },
    });
  });

  it("setTier twice for the same key overwrites tier and leaves other keys untouched", () => {
    setTier(file, "conv-1", "primary", "/ws/a", "t1");
    setTier(file, "conv-2", "secondary", "/ws/b", "t2");
    setTier(file, "conv-1", "tertiary", "/ws/a", "t3");
    expect(readTiers(file)).toEqual({
      "conv-1": { tier: "tertiary", set_at: "t3", workspace: "/ws/a" },
      "conv-2": { tier: "secondary", set_at: "t2", workspace: "/ws/b" },
    });
  });

  it("clearTier removes the key and tolerates an absent key", () => {
    setTier(file, "conv-1", "primary", "/ws/a", "t1");
    setTier(file, "conv-2", "secondary", "/ws/b", "t2");
    clearTier(file, "conv-1");
    expect(readTiers(file)).toEqual({
      "conv-2": { tier: "secondary", set_at: "t2", workspace: "/ws/b" },
    });
    clearTier(file, "missing");
    expect(readTiers(file)).toEqual({
      "conv-2": { tier: "secondary", set_at: "t2", workspace: "/ws/b" },
    });
  });

  it("throws when the file is not valid JSON", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{bad");
    expect(() => readTiers(file)).toThrow();
  });
});

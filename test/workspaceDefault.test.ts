import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { WORKSPACE_KEY_PREFIX } from "../src/commands";
import { normalizeFolder } from "../src/state/active";
import { readTiers, setTier } from "../src/state/tiers";
import { createTimeStore, readOpen } from "../src/state/time";
import { applyWorkspaceDefault } from "../src/state/workspaceDefault";

const NOW = "2026-09-09T10:00:00.000Z";

describe("applyWorkspaceDefault", () => {
  let dir: string;
  let tiersPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-wsdefault-"));
    tiersPath = path.join(dir, "tiers.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing without a workspace default", () => {
    const store = createTimeStore(dir);
    applyWorkspaceDefault(tiersPath, store, { conversation_id: "c1", workspace_roots: ["/w"] }, NOW);
    expect(readTiers(tiersPath)).toEqual({});
    expect(readOpen(store).entries).toEqual({});
  });

  it("tags the conversation and opens an entry when a root matches a default", () => {
    const store = createTimeStore(dir);
    setTier(tiersPath, WORKSPACE_KEY_PREFIX + normalizeFolder("/w"), "primary", "/w", "t0");
    applyWorkspaceDefault(tiersPath, store, { conversation_id: "c1", workspace_roots: ["/w/"] }, NOW);
    expect(readTiers(tiersPath)["c1"]).toEqual({ tier: "primary", set_at: NOW, workspace: "/w/" });
    expect(readOpen(store).entries["c1"]).toEqual({
      tier: "primary",
      mode: "local",
      workspace: "/w/",
      start: NOW,
      idle_seconds: 0,
    });
  });

  it("leaves an already tagged conversation untouched", () => {
    const store = createTimeStore(dir);
    setTier(tiersPath, WORKSPACE_KEY_PREFIX + normalizeFolder("/w"), "primary", "/w", "t0");
    setTier(tiersPath, "c1", "tertiary", "/w", "t1");
    applyWorkspaceDefault(tiersPath, store, { conversation_id: "c1", workspace_roots: ["/w"] }, NOW);
    expect(readTiers(tiersPath)["c1"]).toEqual({ tier: "tertiary", set_at: "t1", workspace: "/w" });
    expect(readOpen(store).entries).toEqual({});
  });
});

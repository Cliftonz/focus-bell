import { describe, expect, it } from "vitest";
import { createActiveTracker, normalizeFolder } from "../src/state/active";

const submit = (id: string, roots: string[]) => ({
  event: "beforeSubmitPrompt",
  conversation_id: id,
  workspace_roots: roots,
});

describe("createActiveTracker", () => {
  it("starts with no active conversation", () => {
    expect(createActiveTracker(["/w"]).current()).toBeUndefined();
  });

  it("tracks a beforeSubmitPrompt whose root is a workspace folder", () => {
    const tracker = createActiveTracker(["/w"]);
    tracker.onEvent(submit("c1", ["/w"]));
    expect(tracker.current()).toBe("c1");
  });

  it("ignores a beforeSubmitPrompt from another workspace", () => {
    const tracker = createActiveTracker(["/w"]);
    tracker.onEvent(submit("c1", ["/w"]));
    tracker.onEvent(submit("c2", ["/other"]));
    expect(tracker.current()).toBe("c1");
  });

  it("ignores events other than beforeSubmitPrompt", () => {
    const tracker = createActiveTracker(["/w"]);
    tracker.onEvent(submit("c1", ["/w"]));
    tracker.onEvent({ event: "stop", conversation_id: "c3", workspace_roots: ["/w"] });
    expect(tracker.current()).toBe("c1");
  });

  it("matches any folder in a multi-root workspace", () => {
    const tracker = createActiveTracker(["/a", "/w"]);
    tracker.onEvent(submit("c1", ["/w"]));
    expect(tracker.current()).toBe("c1");
  });

  it("matches roots on win32 regardless of case, separators, or trailing slash", () => {
    const tracker = createActiveTracker(["C:\\Work"], "win32");
    tracker.onEvent(submit("c1", ["c:/work/"]));
    expect(tracker.current()).toBe("c1");
  });
});

describe("normalizeFolder", () => {
  it("unifies case, separators, and trailing separator on win32", () => {
    expect(normalizeFolder("C:\\Work\\", "win32")).toBe(normalizeFolder("c:/work", "win32"));
  });

  it("strips a trailing separator on darwin", () => {
    expect(normalizeFolder("/w/", "darwin")).toBe("/w");
  });

  it("keeps case on linux", () => {
    expect(normalizeFolder("/W", "linux")).not.toBe("/w");
  });

  it("folds case on darwin", () => {
    expect(normalizeFolder("/Users/Zac/p", "darwin")).toBe(normalizeFolder("/users/zac/p", "darwin"));
  });

  it("keeps case on platforms outside the allowlist", () => {
    expect(normalizeFolder("/Users/Zac", "freebsd")).toBe("/Users/Zac");
  });

  it("keeps a bare posix root", () => {
    expect(normalizeFolder("/", "linux")).toBe("/");
  });

  it("keeps a bare win32 drive root", () => {
    expect(normalizeFolder("C:\\", "win32")).toBe("c:\\");
  });
});

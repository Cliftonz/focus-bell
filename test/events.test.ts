import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseEvent, readEvents } from "../src/hooks/events";

const valid = {
  ts: "2026-09-09T10:00:00.000Z",
  conversation_id: "c1",
  generation_id: "g1",
  event: "stop",
  state: "done",
  workspace_roots: ["/w"],
  transcript_path: "/t",
  model: "m",
  cursor_version: "1",
};

describe("events", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-events-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("parses a valid line", () => {
    expect(parseEvent(JSON.stringify(valid))).toEqual(valid);
  });

  it("returns undefined for a partial line", () => {
    expect(parseEvent("{partial")).toBeUndefined();
  });

  it("returns undefined for a non-object line", () => {
    expect(parseEvent("42")).toBeUndefined();
  });

  it("readEvents skips bad and blank lines", () => {
    const file = path.join(dir, "events.jsonl");
    fs.writeFileSync(file, JSON.stringify(valid) + "\n{partial\n\n");
    expect(readEvents(file)).toEqual([valid]);
  });
});

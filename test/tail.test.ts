import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CATCH_UP_MS, createTail } from "../src/hooks/tail";

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

describe("createTail", () => {
  let dir: string;
  let file: string;
  let lines: string[];
  let tail: { close(): void } | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tail-"));
    file = path.join(dir, "events.jsonl");
    fs.writeFileSync(file, '{"existing":1}\n');
    lines = [];
  });

  afterEach(() => {
    tail?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("emits appended lines and never existing content", async () => {
    tail = createTail(file, (line) => lines.push(line));
    fs.appendFileSync(file, '{"a":1}\n{"b":2}\n');
    await waitFor(() => lines.length === 2);
    await settle();
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("skips empty lines", async () => {
    tail = createTail(file, (line) => lines.push(line));
    fs.appendFileSync(file, "a\n\nb\n");
    await waitFor(() => lines.length === 2);
    await settle();
    expect(lines).toEqual(["a", "b"]);
  });

  it("holds a partial line until its newline arrives", async () => {
    tail = createTail(file, (line) => lines.push(line));
    fs.appendFileSync(file, "partial");
    await settle();
    expect(lines).toEqual([]);
    fs.appendFileSync(file, "\n");
    await waitFor(() => lines.length === 1);
    expect(lines).toEqual(["partial"]);
  });

  it("resets the offset when the file is truncated", async () => {
    tail = createTail(file, (line) => lines.push(line));
    fs.truncateSync(file, 0);
    await settle();
    fs.appendFileSync(file, "fresh\n");
    await waitFor(() => lines.length === 1);
    expect(lines).toEqual(["fresh"]);
  });

  it("cancels the catch-up read on close", async () => {
    tail = createTail(file, (line) => lines.push(line));
    tail.close();
    fs.appendFileSync(file, "late\n");
    await new Promise((resolve) => setTimeout(resolve, CATCH_UP_MS + 200));
    expect(lines).toEqual([]);
  });

  it("emits nothing after close", async () => {
    tail = createTail(file, (line) => lines.push(line));
    tail.close();
    fs.appendFileSync(file, "late\n");
    await settle();
    expect(lines).toEqual([]);
  });
});

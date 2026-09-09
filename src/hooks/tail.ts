import * as fs from "fs";

export const CATCH_UP_MS = 500;

export function createTail(filePath: string, onLine: (line: string) => void): { close(): void } {
  let offset = fs.statSync(filePath).size;
  let pending = "";

  const readNew = () => {
    const size = fs.statSync(filePath).size;
    if (size < offset) offset = 0;
    if (size === offset) return;
    const fd = fs.openSync(filePath, "r");
    const chunk = Buffer.alloc(size - offset);
    fs.readSync(fd, chunk, 0, chunk.length, offset);
    fs.closeSync(fd);
    offset = size;
    pending += chunk.toString("utf8");
    const parts = pending.split("\n");
    pending = parts.pop() as string;
    for (const line of parts) {
      if (line !== "") onLine(line);
    }
  };

  const watcher = fs.watch(filePath, readNew);
  const catchUp = setTimeout(readNew, CATCH_UP_MS);

  return {
    close: () => {
      clearTimeout(catchUp);
      watcher.close();
    },
  };
}

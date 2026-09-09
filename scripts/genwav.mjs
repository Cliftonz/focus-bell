import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toneWav } from "./wav.mjs";

const themes = {
  plain: {
    shape: "sine",
    volume: 0.6,
    sounds: {
      prompt: { gain: 0.25, notes: [{ freq: 660, seconds: 0.08 }] },
      notification: { gain: 0.3, notes: [{ freq: 880, seconds: 0.15 }] },
      done: {
        gain: 0.3,
        notes: [
          { freq: 880, seconds: 0.12 },
          { freq: 660, seconds: 0.12 },
        ],
      },
      response: { gain: 0.2, notes: [{ freq: 990, seconds: 0.06 }] },
    },
  },
  loud: {
    shape: "triangle",
    volume: 1,
    sounds: {
      prompt: { gain: 0.8, notes: [{ freq: 660, seconds: 0.15 }] },
      notification: {
        gain: 0.8,
        notes: [
          { freq: 990, seconds: 0.2 },
          { freq: 1320, seconds: 0.2 },
          { freq: 990, seconds: 0.2 },
        ],
      },
      done: {
        gain: 0.8,
        notes: [
          { freq: 1320, seconds: 0.2 },
          { freq: 990, seconds: 0.2 },
          { freq: 660, seconds: 0.2 },
        ],
      },
      response: { gain: 0.6, notes: [{ freq: 1100, seconds: 0.1 }] },
    },
  },
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(repoRoot, "themes"));

for (const [name, { shape, volume, sounds }] of Object.entries(themes)) {
  const dir = join(outDir, name);
  mkdirSync(dir, { recursive: true });
  for (const [sound, { gain, notes }] of Object.entries(sounds)) {
    writeFileSync(join(dir, `${sound}.wav`), toneWav({ notes, gain, shape }));
  }
  writeFileSync(join(dir, "theme.json"), JSON.stringify({ name, volume }, null, 2) + "\n");
}

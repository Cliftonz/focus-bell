import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toneWav } from "../scripts/wav.mjs";

describe("toneWav", () => {
  it("writes a RIFF/WAVE header sized for one note", () => {
    const wav = toneWav({ notes: [{ freq: 440, seconds: 0.1 }], sampleRate: 8000, gain: 0.5, shape: "sine" });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(40)).toBe(800 * 2);
    expect(wav.length).toBe(44 + 1600);
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
  });

  it("concatenates notes in sequence", () => {
    const wav = toneWav({
      notes: [
        { freq: 440, seconds: 0.1 },
        { freq: 660, seconds: 0.2 },
      ],
      sampleRate: 8000,
      gain: 0.5,
      shape: "triangle",
    });
    expect(wav.readUInt32LE(40)).toBe(2400 * 2);
  });

  it("defaults to a 44100 Hz sample rate", () => {
    const wav = toneWav({ notes: [{ freq: 440, seconds: 0.01 }], gain: 0.5, shape: "sine" });
    expect(wav.readUInt32LE(24)).toBe(44100);
    expect(wav.readUInt32LE(40)).toBe(441 * 2);
  });

  it("fades each note in and out", () => {
    const wav = toneWav({ notes: [{ freq: 440, seconds: 0.1 }], sampleRate: 8000, gain: 0.5, shape: "sine" });
    expect(wav.readInt16LE(44)).toBe(0);
    expect(wav.readInt16LE(wav.length - 2)).toBe(0);
    expect(wav.readInt16LE(44 + 401 * 2)).not.toBe(0);
  });
});

describe("genwav", () => {
  it("writes both themes into the given directory", () => {
    const outDir = mkdtempSync(join(tmpdir(), "focusbell-themes-"));
    const result = spawnSync("node", [join(__dirname, "..", "scripts", "genwav.mjs"), outDir]);
    expect(result.status).toBe(0);
    for (const theme of ["plain", "loud"]) {
      expect(existsSync(join(outDir, theme, "theme.json"))).toBe(true);
      for (const name of ["prompt", "notification", "done", "response"]) {
        const file = join(outDir, theme, `${name}.wav`);
        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file).toString("ascii", 0, 4)).toBe("RIFF");
      }
    }
  });
});

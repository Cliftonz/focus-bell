export function toneWav(input: {
  notes: { freq: number; seconds: number }[];
  sampleRate?: number;
  gain: number;
  shape: "sine" | "triangle";
}): Buffer;

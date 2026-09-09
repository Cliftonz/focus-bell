const FADE_SECONDS = 0.005;

const shapes = {
  sine: (phase) => Math.sin(2 * Math.PI * phase),
  triangle: (phase) => 4 * Math.abs(phase - Math.floor(phase + 0.5)) - 1,
};

function noteSamples({ freq, seconds }, sampleRate, gain, wave) {
  const count = Math.round(seconds * sampleRate);
  const fade = Math.round(FADE_SECONDS * sampleRate);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const envelope = Math.min(1, i / fade, (count - 1 - i) / fade);
    samples[i] = Math.round(wave((i * freq) / sampleRate) * gain * envelope * 32767);
  }
  return samples;
}

export function toneWav({ notes, sampleRate = 44100, gain, shape }) {
  const wave = shapes[shape];
  const pcm = notes.map((note) => noteSamples(note, sampleRate, gain, wave));
  const dataSize = pcm.reduce((sum, samples) => sum + samples.length * 2, 0);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (const samples of pcm) {
    for (const sample of samples) {
      buffer.writeInt16LE(sample, offset);
      offset += 2;
    }
  }
  return buffer;
}

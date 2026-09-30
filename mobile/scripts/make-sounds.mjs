// Renders the web game's Web Audio beeps (resources/js/snake/sound.js) into WAV files for the app.
// Run with: node scripts/make-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 22050;

const waves = {
    square: (phase) => (phase % 1 < 0.5 ? 1 : -1),
    triangle: (phase) => 1 - 4 * Math.abs((phase % 1) - 0.5),
    sawtooth: (phase) => 2 * (phase % 1) - 1,
};

/** Same shape as sound.js: frequency and volume both ramp exponentially over the tone. */
function tone(samples, { frequency, delay = 0, duration, type = 'square', volume = 0.05, endFrequency = frequency }) {
    const start = Math.round(delay * RATE);
    const length = Math.round(duration * RATE);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        const t = i / length;
        const freq = frequency * (endFrequency / frequency) ** t;
        const gain = volume * (0.0001 / volume) ** t;
        phase += freq / RATE;
        samples[start + i] += waves[type](phase) * gain * 6;
    }
}

function render(tones) {
    const end = Math.max(...tones.map((t) => (t.delay ?? 0) + t.duration));
    const samples = new Float32Array(Math.ceil(end * RATE) + 1);
    tones.forEach((t) => tone(samples, t));
    return samples;
}

function wav(samples) {
    const buffer = Buffer.alloc(44 + samples.length * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples.length * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(RATE, 24);
    buffer.writeUInt32LE(RATE * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((s, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
    return buffer;
}

const sounds = {
    eat: [{ frequency: 660, duration: 0.07 }],
    fruit: [660, 880, 1175].map((frequency, i) => ({ frequency, delay: i * 0.07, duration: 0.09 })),
    'bot-died': [{ frequency: 220, duration: 0.15, type: 'triangle', volume: 0.08, endFrequency: 110 }],
    'player-died': [{ frequency: 330, duration: 0.6, type: 'sawtooth', volume: 0.06, endFrequency: 55 }],
};

const dir = new URL('../assets/sounds/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, tones] of Object.entries(sounds)) {
    writeFileSync(new URL(`${name}.wav`, dir), wav(render(tones)));
    console.log(`wrote assets/sounds/${name}.wav`);
}

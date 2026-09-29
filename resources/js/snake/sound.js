/**
 * Tiny sound effects made with the Web Audio API, so no audio files are needed.
 */
export function createSound(isMuted) {
    let audio = null;
    let muted = isMuted;

    function tone(frequency, startDelay, duration, type = 'square', volume = 0.05, endFrequency = frequency) {
        if (muted) {
            return;
        }
        audio ??= new AudioContext();
        const start = audio.currentTime + startDelay;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
    }

    return {
        eat: () => tone(660, 0, 0.07),
        fruit: () => [660, 880, 1175].forEach((frequency, i) => tone(frequency, i * 0.07, 0.09)),
        botDied: () => tone(220, 0, 0.15, 'triangle', 0.08, 110),
        playerDied: () => tone(330, 0, 0.6, 'sawtooth', 0.06, 55),
        get muted() {
            return muted;
        },
        toggle() {
            muted = !muted;
            return muted;
        },
    };
}

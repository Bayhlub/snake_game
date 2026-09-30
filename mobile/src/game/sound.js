import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// The same beeps as the web game, pre-rendered to WAV by scripts/make-sounds.mjs.
const SOURCES = {
    eat: require('../../assets/sounds/eat.wav'),
    fruit: require('../../assets/sounds/fruit.wav'),
    botDied: require('../../assets/sounds/bot-died.wav'),
    playerDied: require('../../assets/sounds/player-died.wav'),
    powerUp: require('../../assets/sounds/power-up.wav'),
    shieldBroke: require('../../assets/sounds/shield-broke.wav'),
    powerUpEnded: require('../../assets/sounds/power-up-ended.wav'),
};

/**
 * Sound effects plus a little vibration for fruit and crashes. Muting turns off both.
 */
export function createSound(isMuted) {
    let muted = isMuted;
    const players = {};

    // Respect the phone's silent switch and let the player's own music keep playing.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

    function play(name) {
        if (muted) {
            return;
        }
        players[name] ??= createAudioPlayer(SOURCES[name]);
        players[name].seekTo(0);
        players[name].play();
    }

    function buzz(vibrate) {
        if (!muted) {
            vibrate().catch(() => {});
        }
    }

    return {
        eat: () => play('eat'),
        fruit: () => {
            play('fruit');
            buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        },
        botDied: () => {
            play('botDied');
            buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
        },
        playerDied: () => {
            play('playerDied');
            buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        },
        powerUp: () => {
            play('powerUp');
            buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        },
        shieldBroke: () => {
            play('shieldBroke');
            buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
        },
        powerUpEnded: () => play('powerUpEnded'),
        get muted() {
            return muted;
        },
        toggle() {
            muted = !muted;
            return muted;
        },
        release() {
            Object.values(players).forEach((player) => player.remove());
        },
    };
}

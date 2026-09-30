export const COLS = 40;
export const ROWS = 28;
export const CELL = 20;

export const START_LENGTH = 4;
export const FOOD_COUNT = 6;
export const FOOD = { points: 1, grow: 1 };

export const FRUITS = [
    { emoji: '🍒', points: 3, grow: 2, weight: 4 },
    { emoji: '🍎', points: 5, grow: 3, weight: 3 },
    { emoji: '🍇', points: 5, grow: 3, weight: 3 },
    { emoji: '🍉', points: 10, grow: 4, weight: 1 },
];
export const MAX_FRUITS = 5;
export const FRUIT_LIFETIME_MS = 12000;
export const FRUIT_SPAWN_MIN_MS = 1500;
export const FRUIT_SPAWN_MAX_MS = 3500;
export const DROP_LIFETIME_MS = 15000;

/**
 * Rare pickups only the player can collect. Each lasts `durationMs` once picked up.
 * Shield: survive one crash. Magnet: nearby food drifts toward you.
 * Slow-mo: the whole game slows down. Ghost: pass through other snakes.
 */
export const POWER_UPS = [
    { type: 'shield', emoji: '🛡️', label: 'Shield', color: '#38bdf8', durationMs: 12000, weight: 3 },
    { type: 'magnet', emoji: '🧲', label: 'Magnet', color: '#f472b6', durationMs: 9000, weight: 3 },
    { type: 'slow', emoji: '⏳', label: 'Slow-mo', color: '#c4b5fd', durationMs: 7000, weight: 2 },
    { type: 'ghost', emoji: '👻', label: 'Ghost', color: '#e2e8f0', durationMs: 7000, weight: 2 },
];
export const POWER_UP_SPAWN_MIN_MS = 9000;
export const POWER_UP_SPAWN_MAX_MS = 16000;
export const POWER_UP_LIFETIME_MS = 10000;
export const MAGNET_RADIUS = 6;
export const SLOW_MO_FACTOR = 1.6;
/** After a shield breaks, the player can't crash into snakes for a moment so it can get clear. */
export const SHIELD_GRACE_MS = 1500;

export const START_TICK_MS = 260;
export const MIN_TICK_MS = 160;
export const TICK_MS_PER_SEGMENT = 0.7;

export const PLAYER = { name: 'You', color: '#4ade80' };
export const BOTS = [
    { name: 'Mango', color: '#fb923c' },
    { name: 'Grape', color: '#a78bfa' },
    { name: 'Sky', color: '#38bdf8' },
    { name: 'Rose', color: '#f472b6' },
];
export const BOT_RESPAWN_MS = 3000;
export const BOT_MAX_LENGTH = 30;
export const BOT_SAFE_DISTANCE = 10;
/** Chance per move that a bot ignores other snakes, so bots sometimes make mistakes. */
export const BOT_CARELESSNESS = 0.015;

export const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

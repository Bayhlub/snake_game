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

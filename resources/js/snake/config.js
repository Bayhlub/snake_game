/** The default (landscape) field. The phone app turns it upright (ROWS × COLS) when held in portrait. */
export const COLS = 56;
export const ROWS = 40;
export const CELL = 20;

export const START_LENGTH = 6;
/** One piece of food on the board for every this many cells, so bigger fields get more food. */
export const CELLS_PER_FOOD = 220;
export const FOOD = { points: 1, grow: 1 };

/**
 * Treats scattered around the arena, like Worms Zone: sweets, fruit and fast food. Small ones are
 * common and worth a little; big ones are rare, drawn bigger, and worth a lot.
 */
export const FRUITS = [
    { emoji: '🍬', points: 3, grow: 2, weight: 4 },
    { emoji: '🍭', points: 3, grow: 2, weight: 4 },
    { emoji: '🍪', points: 3, grow: 2, weight: 3 },
    { emoji: '🍓', points: 3, grow: 2, weight: 3 },
    { emoji: '🍩', points: 5, grow: 3, weight: 3 },
    { emoji: '🧁', points: 5, grow: 3, weight: 3 },
    { emoji: '🍫', points: 5, grow: 3, weight: 2 },
    { emoji: '🍦', points: 5, grow: 3, weight: 2 },
    { emoji: '🍎', points: 5, grow: 3, weight: 2 },
    { emoji: '🍕', points: 7, grow: 3, weight: 2 },
    { emoji: '🍔', points: 7, grow: 3, weight: 2 },
    { emoji: '🍟', points: 7, grow: 3, weight: 1 },
    { emoji: '🍣', points: 7, grow: 3, weight: 1 },
    { emoji: '🍰', points: 10, grow: 4, weight: 1 },
    { emoji: '🍉', points: 10, grow: 4, weight: 1 },
];
export const MAX_FRUITS = 14;
export const FRUIT_LIFETIME_MS = 15000;
export const FRUIT_SPAWN_MIN_MS = 250;
export const FRUIT_SPAWN_MAX_MS = 700;
/** A crashed worm turns into a trail of these treats, in its own color, worth DROP points each. */
export const DROP_TREATS = ['🍬', '🍭', '🍩', '🧁', '🍪', '🍫'];
export const DROP = { points: 2, grow: 1 };
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
/** Magnet: food this close (in cells) drifts toward you at this speed (cells per second). */
export const MAGNET_RADIUS = 6;
export const MAGNET_SPEED = 9;
/** Slow-mo divides everyone's speed by this much. */
export const SLOW_MO_FACTOR = 1.6;
/** After a shield breaks, the player can't crash into snakes for a moment so it can get clear. */
export const SHIELD_GRACE_MS = 1500;
/** Online, a player who joins or comes back can't crash into snakes for this long. */
export const SPAWN_GRACE_MS = 2500;

/**
 * Worms glide at any angle, like Worms Zone. Positions are in cells (floats). The game moves in small
 * steps of TICK_MS (online, MULTIPLAYER_TICK_MS, as often as the server sends the board) and draws
 * smoothly in between.
 */
export const TICK_MS = 50;
export const MULTIPLAYER_TICK_MS = 50;
/** How fast worms move, in cells per second. Like Worms Zone, it stays the same however long a worm grows. */
export const SPEED = 4.6;
/**
 * The tightest circle a worm can turn in, in cells, like Worms Zone: wide enough that a U-turn makes
 * a round loop instead of folding the body over itself. Faster worms turn quicker to keep it the same.
 */
export const TURN_RADIUS = 1.3;
/** The body is a chain of points this far apart along the worm's trail, one per segment. */
export const SEGMENT_SPACING = 1;
/** A head this close to another worm's body (in cells) runs into it; this close to food, eats it. */
export const HIT_DISTANCE = 0.8;
export const EAT_DISTANCE = 1;
/** Treats are drawn big, so a head reaches them from a little further away. */
export const TREAT_REACH = 1.5;

/** Online play: the game server's port and how many can join. Each player wears the skin they picked. */
export const MULTIPLAYER_PORT = 8787;
export const MAX_PLAYERS = 8;

/** `skin` is one of the ids in skins.js; `color` is that skin's main color. */
export const PLAYER = { name: 'You', color: '#4ade80', skin: 'mint' };
export const BOTS = [
    { name: 'Mango', color: '#f59e0b', skin: 'gears' },
    { name: 'Grape', color: '#7c3aed', skin: 'galaxy' },
    { name: 'Sky', color: '#22d3ee', skin: 'ocean' },
    { name: 'Rose', color: '#f472b6', skin: 'bubblegum' },
    { name: 'Berry', color: '#ef4444', skin: 'candy' },
    { name: 'Coco', color: '#facc15', skin: 'bee' },
];
export const BOT_RESPAWN_MS = 3000;
export const BOT_MAX_LENGTH = 30;
export const BOT_SAFE_DISTANCE = 10;
/** Chance per move that a bot ignores other snakes, so bots sometimes make mistakes. */
export const BOT_CARELESSNESS = 0.015;

/** The arrow keys and buttons steer straight up, down, left or right. */
export const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};
export const DIRECTION_ANGLES = Object.fromEntries(Object.entries(DIRECTIONS).map(([name, dir]) => [name, Math.atan2(dir.y, dir.x)]));

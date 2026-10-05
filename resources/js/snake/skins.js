/**
 * Worm skins. Each one is a list of stripe colors repeated along the body (`band` segments per
 * stripe), and optionally a small decoration drawn on every other segment. `color` is the skin's
 * main color, used for name tags, the player list and the food a crashed snake leaves behind.
 */
export const SKINS = [
    { id: 'mint', color: '#4ade80', stripes: ['#4ade80', '#34d399'], band: 2, decoration: 'dot', accent: '#14532d' },
    { id: 'gears', color: '#f59e0b', stripes: ['#f59e0b'], band: 1, decoration: 'gear', accent: '#2563eb' },
    { id: 'candy', color: '#ef4444', stripes: ['#ef4444', '#fff7ed'], band: 2, decoration: null },
    { id: 'bee', color: '#facc15', stripes: ['#facc15', '#27272a'], band: 2, decoration: null },
    { id: 'galaxy', color: '#7c3aed', stripes: ['#5b21b6', '#4c1d95'], band: 3, decoration: 'star', accent: '#fde68a' },
    { id: 'ocean', color: '#22d3ee', stripes: ['#22d3ee', '#38bdf8', '#3b82f6'], band: 2, decoration: null },
    { id: 'bubblegum', color: '#f472b6', stripes: ['#f9a8d4'], band: 1, decoration: 'heart', accent: '#db2777' },
    { id: 'rainbow', color: '#f97316', stripes: ['#ef4444', '#f97316', '#facc15', '#4ade80', '#3b82f6', '#a855f7'], band: 1, decoration: null },
    { id: 'lava', color: '#dc2626', stripes: ['#991b1b', '#dc2626'], band: 3, decoration: 'dot', accent: '#fbbf24' },
    { id: 'zebra', color: '#e5e7eb', stripes: ['#f8fafc', '#18181b'], band: 1, decoration: null },
];

export const DEFAULT_SKIN = 'mint';

const SKINS_BY_ID = Object.fromEntries(SKINS.map((skin) => [skin.id, skin]));

export function isSkin(id) {
    return Object.hasOwn(SKINS_BY_ID, id);
}

/**
 * A snake's skin. Snakes without one (an older game server) get a plain skin in their own color.
 */
export function skinOf(snake) {
    return SKINS_BY_ID[snake.skin] ?? { id: 'plain', color: snake.color, stripes: [snake.color], band: 1, decoration: null };
}

export function skinById(id) {
    return SKINS_BY_ID[id] ?? SKINS_BY_ID[DEFAULT_SKIN];
}

/** The stripe color of body segment `i` (0 is the head). */
export function stripeColor(skin, i) {
    return skin.stripes[Math.floor(i / skin.band) % skin.stripes.length];
}

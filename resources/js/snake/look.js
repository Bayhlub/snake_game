import { CELL } from './config.js';
import { wrapAngle } from './space.js';
import { STICK_SIZE } from './steering.js';

/**
 * The shapes and colors of the Worms Zone look, shared by the web renderer (canvas) and the
 * phone app's renderer (Skia), so both draw the same worms, food and floor.
 */
export const VOID_COLOR = '#07070b';
export const FLOOR_COLOR = '#1c1c26';
/** The speckled floor repeats every this many board pixels. */
export const FLOOR_TILE = 320;
/** Glowing food comes in all these colors, like the sweets scattered around a Worms Zone arena. */
export const FOOD_COLORS = ['#f87171', '#fb923c', '#facc15', '#a3e635', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'];
/** How a crashed player's worm looks while the game-over screen is up. */
export const DEAD_SKIN = { id: 'dead', color: '#6b7280', stripes: ['#6b7280', '#4b5563'], band: 2, decoration: null };

/** Plain food takes a color from its spot on the board; a crashed snake's leftovers keep its color. */
export function foodColor(food) {
    if (food.kind === 'drop') {
        return food.color;
    }
    return FOOD_COLORS[hashCell(food.x, food.y) % FOOD_COLORS.length];
}

/**
 * How big a treat is drawn: big, and bigger the more it's worth; a crashed worm's leftovers a
 * little smaller. Near the end of its life it fades away (`opacity`) instead of blinking.
 */
export function treatLook(food, time) {
    const left = food.expiresAt ? food.expiresAt - time : Infinity;
    return {
        scale: food.kind === 'drop' ? 1.15 : 1.4 + food.points * 0.06,
        opacity: Math.max(0, Math.min(1, left / 2000)),
    };
}

/** Food dots come in a few sizes; leftovers from a crash are the biggest. */
export function foodRadius(food) {
    return (food.kind === 'drop' ? 0.42 : 0.3 + (hashCell(food.x, food.y) % 5) * 0.035) * CELL;
}

function hashCell(x, y) {
    return Math.abs((x * 73856093) ^ (y * 19349663)) >>> 0;
}

/** Worms are chubby, and get chubbier as they grow. */
export function bodyRadius(length) {
    return CELL * Math.min(0.56, 0.47 + length * 0.002);
}

/** The head is a little bigger than the body. */
export function headRadius(length) {
    return bodyRadius(length) * 1.18;
}

/** The last few segments narrow to a rounded tail. */
function taper(segment, length) {
    const fromTail = length - 1 - segment;
    return fromTail >= 3 ? 1 : 0.62 + (0.38 * fromTail) / 3;
}

/**
 * The body as overlapping round beads, two per segment, from the tail up to the head.
 * The beads between the body's points follow a smooth curve through them, so a worm turning in a
 * circle looks round rather than like a polygon. Each bead knows which segment it belongs to (for
 * the stripes) and its size.
 */
export function bodyBeads(points) {
    const length = points.length;
    const radius = bodyRadius(length);
    const beads = [];
    for (let i = length - 1; i >= 1; i--) {
        for (const t of [0, 0.5]) {
            const segment = i - t;
            const { x, y } = t === 0 ? points[i] : curveBetween(points[i + 1] ?? points[i], points[i], points[i - 1], points[i - 2] ?? points[i - 1], t);
            beads.push({ x, y, segment: Math.round(segment), r: radius * taper(segment, length) });
        }
    }
    return beads;
}

/** A point `t` of the way from b to c on a smooth (Catmull-Rom) curve through a, b, c and d. */
function curveBetween(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const along = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
    return { x: along(a.x, b.x, c.x, d.x), y: along(a.y, b.y, c.y, d.y) };
}

/**
 * Where the skin's decorations go: every other segment, skipping the head and the thin tail.
 * Each has a position, the direction the body runs there, and its segment number.
 */
export function decorationSpots(points) {
    const spots = [];
    for (let i = 2; i < points.length - 2; i += 2) {
        spots.push({ x: points[i].x, y: points[i].y, segment: i, angle: Math.atan2(points[i - 1].y - points[i].y, points[i - 1].x - points[i].x) });
    }
    return spots;
}

/** The joystick ring and the arrow in front of your worm, in Worms Zone orange. */
export const STEER_COLOR = '#f59e0b';
export const STEER_OUTLINE = '#7c2d12';

/**
 * The touch joystick on screen, in board units of a `width` × `height` view: the ring around where
 * the finger went down, and the knob, which follows the finger but stays inside the ring.
 */
export function stickShape(stick, width, height) {
    const radius = Math.min(width, height) * STICK_SIZE;
    const x = stick.base.fx * width;
    const y = stick.base.fy * height;
    let dx = (stick.knob.fx - stick.base.fx) * width;
    let dy = (stick.knob.fy - stick.base.fy) * height;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
        dx *= radius / distance;
        dy *= radius / distance;
    }
    return { x, y, radius, knobX: x + dx, knobY: y + dy, knobRadius: radius * 0.22 };
}

/**
 * The arrow just in front of your worm's head, pointing the way you're steering (`aim`, any length).
 * Its corners are around 0, 0 pointing right; draw it at x, y turned by `angle`.
 */
export function aimArrow(head, aim, length) {
    const angle = Math.atan2(aim.y, aim.x);
    const distance = headRadius(length) + CELL * 1.3;
    const size = CELL * 0.75;
    return {
        x: head.x + Math.cos(angle) * distance,
        y: head.y + Math.sin(angle) * distance,
        angle,
        corners: [
            [size, 0],
            [-size * 0.6, -size * 0.8],
            [-size * 0.6, size * 0.8],
        ],
    };
}

/**
 * The way a worm's head faces, turning smoothly from where it faced at the last step to where it
 * faces now as `progress` goes from 0 to 1.
 */
export function headAngle(snake, progress) {
    const to = Math.atan2(snake.dir.y, snake.dir.x);
    if (snake.previousAngle == null) {
        return to;
    }
    return snake.previousAngle + wrapAngle(to - snake.previousAngle) * progress;
}

/** The outline of a gear (16 corners per tooth pair), centered on 0, 0. */
export function gearCorners(size) {
    const corners = [];
    for (let i = 0; i < 16; i++) {
        const r = i % 2 ? size * 0.72 : size;
        const a = (i / 16) * Math.PI * 2;
        corners.push([Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r], [Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r]);
    }
    return corners;
}

/** A five-pointed star, centered on 0, 0 and pointing up. */
export function starCorners(size) {
    const corners = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? size * 0.42 : size;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        corners.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return corners;
}

/**
 * The chips scattered over one floor tile: mostly grey stones, a few muted colored ones and tiny
 * specks. Each is a small polygon; renderers draw them again across the tile's edges so it repeats
 * without seams.
 */
export function floorChips() {
    const random = seededRandom(11);
    const greys = ['#2a2a36', '#323240', '#3c3c4a', '#474756', '#24242e', '#55556a'];
    const colors = ['#3d3354', '#30435a', '#4f3d33', '#2f4f45', '#553046'];
    const chips = [];
    for (let i = 0; i < 240; i++) {
        const speck = i % 3 === 0;
        const size = speck ? 0.8 + random() * 1.2 : 2.4 + random() * 5.2;
        const x = random() * FLOOR_TILE;
        const y = random() * FLOOR_TILE;
        const sides = speck ? 4 : 5 + Math.floor(random() * 3);
        const turn = random() * Math.PI * 2;
        const corners = [];
        for (let s = 0; s < sides; s++) {
            const a = turn + (s / sides) * Math.PI * 2;
            const r = size * (0.65 + random() * 0.45);
            corners.push([x + Math.cos(a) * r, y + Math.sin(a) * r * (0.7 + random() * 0.4)]);
        }
        const isColored = !speck && random() < 0.16;
        chips.push({
            corners,
            color: speck ? '#6b6b80' : isColored ? colors[i % colors.length] : greys[i % greys.length],
            alpha: speck ? 0.55 : 0.75 + random() * 0.25,
        });
    }
    return chips;
}

/** A darker shade of a #rrggbb color, for rims and outlines. */
export function shade(color, amount) {
    return mix(color, '#000000', amount);
}

/**
 * Blend two #rrggbb colors; amount 0 gives the first, 1 the second.
 */
export function mix(from, to, amount) {
    const a = parseInt(from.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const channel = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * amount);
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

export function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

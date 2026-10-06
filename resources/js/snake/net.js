import { POWER_UPS } from './config.js';
import { wrapAngle } from './space.js';

/**
 * The messages between the multiplayer server and the game on each device.
 *
 * Device → server: { type: 'join', name, skin }, { type: 'steer', angle } (radians), { type: 'respawn' }
 * Server → device: { type: 'welcome', id }, { type: 'full' },
 *                  { type: 'state', state, events } after every move (see packWorld / packEvent).
 *
 * Snakes and foods are packed small (bodies as flat [x, y, x, y, …] lists, to two decimals)
 * because the whole board goes to every player several times a second.
 */
/** How far past the latest update (in update intervals) worms keep gliding while the next one is late. */
const MAX_AHEAD = 1.6;
const POWER_UPS_BY_TYPE = Object.fromEntries(POWER_UPS.map((powerUp) => [powerUp.type, powerUp]));
const round = (value) => Math.round(value * 100) / 100;
const roundPoint = (point) => ({ x: round(point.x), y: round(point.y) });

export function packWorld(world, tickMs) {
    return {
        time: world.time,
        tickMs,
        cols: world.cols,
        rows: world.rows,
        snakes: world.snakes.map((snake) => ({
            id: snake.id,
            name: snake.name,
            color: snake.color,
            ...(snake.skin ? { skin: snake.skin } : {}),
            isPlayer: snake.isPlayer,
            alive: snake.alive,
            angle: Math.round(snake.angle * 1000) / 1000,
            body: snake.body.flatMap((point) => [round(point.x), round(point.y)]),
            ...(snake.isPlayer ? { points: snake.points, effects: snake.effects, spawnedAt: snake.spawnedAt } : {}),
        })),
        foods: world.foods.map((food) => ({
            kind: food.kind,
            x: round(food.x),
            y: round(food.y),
            ...(food.from ? { from: roundPoint(food.from) } : {}),
            ...(food.emoji ? { emoji: food.emoji } : {}),
            ...(food.color ? { color: food.color } : {}),
            ...(food.powerUp ? { powerUp: food.powerUp.type } : {}),
            points: food.points,
            ...(food.expiresAt ? { expiresAt: food.expiresAt } : {}),
        })),
    };
}

export function packEvent(event) {
    return {
        type: event.type,
        snakeId: event.snake?.id,
        ...(event.at ? { at: roundPoint(event.at) } : {}),
        ...(event.food ? { food: { kind: event.food.kind, ...roundPoint(event.food), points: event.food.points, color: event.food.color } } : {}),
        ...(event.powerUp ? { powerUp: event.powerUp.type } : {}),
        ...(event.cause ? { cause: { type: event.cause.type, otherId: event.cause.other?.id } } : {}),
    };
}

/**
 * A world on this device that mirrors the server. `update` takes each new state, and the worms
 * glide from where they were on screen to where the server says they are now, as smoothly as solo.
 *
 * Updates don't arrive evenly over the internet: some come late, some bunch up. So each glide takes
 * about as long as updates have recently been apart (`progress(now)` says how far along it is); when
 * the next one is late, worms keep going the way they were (progress past 1, up to MAX_AHEAD) rather
 * than stopping; and a new update starts from wherever the worms are drawn at that moment.
 */
export function createRemoteWorld() {
    const world = { multiplayer: true, cols: 0, rows: 0, time: 0, snakes: [], foods: [], meId: null, tickMs: 50 };
    const byId = new Map();
    let receivedAt = null;
    let interval = null;
    let foodsBySpot = new Map();
    const spotOf = (food) => `${food.kind}|${food.x}|${food.y}`;

    /** How far (0–1) the glide toward the latest update has got by `now`. */
    world.progress = (now) => (receivedAt === null ? 1 : Math.min(MAX_AHEAD, (now - receivedAt) / interval));

    world.update = (state, now = performance.now()) => {
        const shown = world.progress(now);
        if (receivedAt !== null) {
            interval += (Math.min(now - receivedAt, 250) - interval) * 0.15;
        }
        interval ??= state.tickMs;
        receivedAt = now;
        world.time = state.time;
        world.tickMs = state.tickMs;
        world.cols = state.cols;
        world.rows = state.rows;

        const seen = new Set();
        world.snakes = state.snakes.map((packed) => {
            seen.add(packed.id);
            const snake = byId.get(packed.id) ?? { id: packed.id, body: [] };
            const body = [];
            for (let i = 0; i < packed.body.length; i += 2) {
                body.push({ x: packed.body[i], y: packed.body[i + 1] });
            }
            const wasMoving = snake.alive && packed.alive && snake.body.length > 0;
            const angle = packed.angle ?? 0;
            // Where the worm is drawn right now, partway through its last glide.
            const onScreen = wasMoving
                ? snake.body.map((point, i) => {
                      const from = snake.previousBody?.[i] ?? point;
                      return { x: from.x + (point.x - from.x) * shown, y: from.y + (point.y - from.y) * shown };
                  })
                : null;
            const previousAngle = wasMoving ? snake.previousAngle + wrapAngle(snake.angle - snake.previousAngle) * shown : angle;
            Object.assign(snake, {
                name: packed.name,
                color: packed.color,
                skin: packed.skin ?? null,
                isPlayer: packed.isPlayer,
                alive: packed.alive,
                angle,
                previousAngle,
                dir: { x: Math.cos(angle), y: Math.sin(angle) },
                previousBody: onScreen,
                body,
                points: packed.points ?? 0,
                effects: packed.effects ?? {},
                spawnedAt: packed.spawnedAt ?? 0,
            });
            byId.set(packed.id, snake);
            return snake;
        });
        for (const id of [...byId.keys()]) {
            if (!seen.has(id)) {
                byId.delete(id);
            }
        }

        // Keep each piece of food the same object from one update to the next (found by where it is,
        // or where a magnet pulled it from), so it isn't drawn popping in again on every update.
        world.foods = state.foods.map((packed) => {
            const food = foodsBySpot.get(spotOf(packed)) ?? (packed.from ? foodsBySpot.get(spotOf({ kind: packed.kind, ...packed.from })) : null) ?? {};
            for (const key of Object.keys(food)) {
                delete food[key];
            }
            return Object.assign(food, packed, packed.powerUp ? { powerUp: POWER_UPS_BY_TYPE[packed.powerUp] } : {});
        });
        foodsBySpot = new Map(world.foods.map((food) => [spotOf(food), food]));
    };

    /** Turn a packed event back into one that points at this world's snakes. */
    world.unpackEvent = (event) => ({
        ...event,
        snake: byId.get(event.snakeId) ?? null,
        ...(event.powerUp ? { powerUp: POWER_UPS_BY_TYPE[event.powerUp] } : {}),
        // A picked-up power-up is drawn once more as it's eaten, so it needs its look back too.
        ...(event.food && event.powerUp ? { food: { ...event.food, powerUp: POWER_UPS_BY_TYPE[event.powerUp] } } : {}),
        ...(event.cause ? { cause: { type: event.cause.type, other: byId.get(event.cause.otherId) ?? null } } : {}),
    });

    world.me = () => byId.get(world.meId) ?? null;

    return world;
}

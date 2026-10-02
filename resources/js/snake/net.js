import { DIRECTIONS, POWER_UPS } from './config.js';

/**
 * The messages between the multiplayer server and the game on each device.
 *
 * Device → server: { type: 'join', name }, { type: 'turn', dir: 'up' }, { type: 'respawn' }
 * Server → device: { type: 'welcome', id }, { type: 'full' },
 *                  { type: 'state', state, events } after every move (see packWorld / packEvent).
 *
 * Snakes and foods are packed small (bodies as flat [x, y, x, y, …] lists) because the whole
 * board goes to every player several times a second.
 */
const DIRECTION_NAMES = Object.fromEntries(Object.entries(DIRECTIONS).map(([name, dir]) => [`${dir.x},${dir.y}`, name]));
const POWER_UPS_BY_TYPE = Object.fromEntries(POWER_UPS.map((powerUp) => [powerUp.type, powerUp]));

export function directionName(dir) {
    return DIRECTION_NAMES[`${dir.x},${dir.y}`];
}

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
            isPlayer: snake.isPlayer,
            alive: snake.alive,
            dir: directionName(snake.dir),
            body: snake.body.flatMap((cell) => [cell.x, cell.y]),
            ...(snake.isPlayer ? { points: snake.points, effects: snake.effects, spawnedAt: snake.spawnedAt } : {}),
        })),
        foods: world.foods.map((food) => ({
            kind: food.kind,
            x: food.x,
            y: food.y,
            ...(food.from ? { from: food.from } : {}),
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
        ...(event.at ? { at: event.at } : {}),
        ...(event.food ? { food: { kind: event.food.kind, x: event.food.x, y: event.food.y, points: event.food.points, color: event.food.color } } : {}),
        ...(event.powerUp ? { powerUp: event.powerUp.type } : {}),
        ...(event.cause ? { cause: { type: event.cause.type, otherId: event.cause.other?.id } } : {}),
    };
}

/**
 * A world on this device that mirrors the server. `update` takes each new state and keeps the
 * last one as `previousBody`, so the renderers can glide snakes between moves as in solo play.
 */
export function createRemoteWorld() {
    const world = { multiplayer: true, cols: 0, rows: 0, time: 0, snakes: [], foods: [], meId: null, tickMs: 220 };
    const byId = new Map();

    world.update = (state) => {
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
            Object.assign(snake, {
                name: packed.name,
                color: packed.color,
                isPlayer: packed.isPlayer,
                alive: packed.alive,
                dir: DIRECTIONS[packed.dir],
                previousBody: wasMoving ? snake.body : null,
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

        world.foods = state.foods.map((food) => ({ ...food, ...(food.powerUp ? { powerUp: POWER_UPS_BY_TYPE[food.powerUp] } : {}) }));
    };

    /** Turn a packed event back into one that points at this world's snakes. */
    world.unpackEvent = (event) => ({
        ...event,
        snake: byId.get(event.snakeId) ?? null,
        ...(event.powerUp ? { powerUp: POWER_UPS_BY_TYPE[event.powerUp] } : {}),
        ...(event.cause ? { cause: { type: event.cause.type, other: byId.get(event.cause.otherId) ?? null } } : {}),
    });

    world.me = () => byId.get(world.meId) ?? null;

    return world;
}
